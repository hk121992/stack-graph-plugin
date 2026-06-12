#!/usr/bin/env bun
/**
 * analyze.ts — the transcript-analytics analyzer entry point (Cluster A §1, §9).
 *
 * Reads the raw Claude Code session transcripts under SG_TRANSCRIPT_ROOT (default ~/.claude/projects),
 * derives the analytics substrate deterministically, and FULL-REWRITES a single derived event log:
 *
 *     <org-root>/.stack-graph/derived/analyzer-events.jsonl   (the derived stream the publisher reads)
 *     <org-root>/.stack-graph/derived/analyzer-cursor.json    (the per-transcript skip-cache)
 *
 * IDEMPOTENCY (§9, S2). The output is fully rewritten each run in canonical sorted order
 * ((ts, session, kind)), ONE settled row per (session, scope). A re-run with no new activity yields a
 * BYTE-IDENTICAL file. The cursor is a PERFORMANCE skip-cache only — correctness never depends on it;
 * `--no-cursor` forces a full re-read and produces the identical file.
 *
 * LOCALITY (§1, §9, S1). The analyzer emits ONLY allowlist-shaped values (ids ID_RE-clean, ts
 * strict-UTC ISO, models MODEL_RE-clean) and NEVER free-text (no denial command, rejection reason, or
 * raw permission text — only categorised counts / enums). The derived log is local-only and gitignored;
 * only portal-projection.json (the publisher's sanitised output) ever leaves the machine.
 *
 * PORTABILITY: node `fs`/`os`/`path` + JSON only (no Bun.* globals), so it runs under bun or node.
 *
 * USAGE:
 *   bun run analyze.ts [--no-cursor] [--root <dir>] [--out <events.jsonl>] [--threshold-min <n>]
 *
 * ENV:
 *   SG_TRANSCRIPT_ROOT   transcript root (default ~/.claude/projects)
 *   STACK_GRAPH_EVENTS_DIR   the .stack-graph/ dir (default <repo-root>/.stack-graph)
 *   SG_STALL_THRESHOLD_MIN   stall gap threshold in minutes (default 30)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";

import {
  serializeRows,
  normalizeTs,
} from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, DerivedRow, ActivityRow } from "./schema.ts";
import { loadCursor, saveCursor, fileSignature, isUnchanged } from "./cursor.ts";
import type { CursorFile } from "./cursor.ts";
import { deriveTokenRows } from "./derive-tokens.ts";
import { deriveFrictionRow } from "./derive-friction.ts";
import { deriveActivityRows } from "./derive-activity.ts";
import { deriveStallRows, instantsFromActivity } from "./derive-stalls.ts";
import { resolveAttribution } from "./attribute.ts";
import { signalFromTranscript, applyVerdictToRows } from "./parse-signal.ts";

// ── CLI / config ──────────────────────────────────────────────────────────────────────────────

interface Options {
  noCursor: boolean;
  root: string;
  outPath: string;
  cursorPath: string;
  stallThresholdMs: number;
}

const DEFAULT_STALL_THRESHOLD_MIN = 30;

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Resolve the org-root (where .stack-graph/ lives). The bound STACK_GRAPH_EVENTS_DIR wins; otherwise
 *  the git-common-dir parent (worktree-correct, mirrors publish-projection.ts), else cwd. */
function resolveStackGraphDir(): string {
  const env = process.env.STACK_GRAPH_EVENTS_DIR;
  if (env && env.trim() !== "") return expandHome(env.trim());
  const start = path.dirname(new URL(import.meta.url).pathname);
  try {
    const commonDir = execSync("git rev-parse --git-common-dir", { cwd: start, encoding: "utf8" }).trim();
    if (commonDir) {
      const abs = path.isAbsolute(commonDir) ? commonDir : path.resolve(start, commonDir);
      return path.join(path.dirname(abs), ".stack-graph");
    }
  } catch {
    /* git unavailable — fall through */
  }
  return path.join(process.cwd(), ".stack-graph");
}

function parseOptions(argv: string[]): Options {
  let noCursor = false;
  let root: string | null = null;
  let outPath: string | null = null;
  let thresholdMin = Number(process.env.SG_STALL_THRESHOLD_MIN) || DEFAULT_STALL_THRESHOLD_MIN;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-cursor") noCursor = true;
    else if (a === "--root") root = argv[++i] ?? null;
    else if (a === "--out") outPath = argv[++i] ?? null;
    else if (a === "--threshold-min") thresholdMin = Number(argv[++i]) || thresholdMin;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: analyze.ts [--no-cursor] [--root <dir>] [--out <events.jsonl>] [--threshold-min <n>]\n",
      );
      process.exit(0);
    }
  }

  const resolvedRoot = expandHome(
    root ?? process.env.SG_TRANSCRIPT_ROOT ?? path.join(os.homedir(), ".claude", "projects"),
  );
  const sgDir = resolveStackGraphDir();
  const derivedDir = path.join(sgDir, "derived");
  const resolvedOut = outPath ?? path.join(derivedDir, "analyzer-events.jsonl");
  // The cursor lives ALONGSIDE the events file (analyzer-cursor.json in the same dir), so an
  // explicit --out (e.g. a test tmpdir) keeps the cache local to that output rather than the repo's
  // .stack-graph/. With the default --out, this resolves to derived/analyzer-cursor.json as designed.
  return {
    noCursor,
    root: resolvedRoot,
    outPath: resolvedOut,
    cursorPath: path.join(path.dirname(resolvedOut), "analyzer-cursor.json"),
    stallThresholdMs: Math.max(0, thresholdMin) * 60_000,
  };
}

// ── Graph node-id set ───────────────────────────────────────────────────────────────────────────

/** Load the known graph-node id set from graph-record.json. Tries the factory layout
 *  (<repo>/graph/graph-record.json) and the vendored-plugin layout (alongside the renderer), then
 *  degrades to an EMPTY set — with no record, no skill maps to a node, so activity rows are simply not
 *  emitted (honest under-capture; the publisher would drop unknown ids anyway). Never throws. */
export function loadNodeIds(explicitPath?: string): Set<string> {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const candidates = [
    explicitPath,
    process.env.SG_GRAPH_RECORD,
    path.resolve(here, "..", "..", "..", "graph", "graph-record.json"), // factory: workspace/renderer/analyzer → repo/graph
    path.resolve(here, "..", "graph-record.json"),
    path.resolve(here, "graph-record.json"),
  ].filter((p): p is string => typeof p === "string" && p !== "");
  for (const cand of candidates) {
    try {
      const obj = JSON.parse(fs.readFileSync(cand, "utf8")) as { nodes?: Record<string, unknown> };
      if (obj && obj.nodes && typeof obj.nodes === "object") {
        return new Set(Object.keys(obj.nodes));
      }
    } catch {
      /* try next candidate */
    }
  }
  return new Set();
}

// ── Transcript discovery + parsing ──────────────────────────────────────────────────────────────

/** Recursively collect every `*.jsonl` under root (including `<session>/subagents/agent-*.jsonl`).
 *  Returned sorted for deterministic walk order. Symlinks are not followed (avoid cycles). */
export function walkTranscripts(root: string): string[] {
  const out: string[] = [];
  function recurse(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) recurse(full);
      else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(full);
    }
  }
  recurse(root);
  out.sort();
  return out;
}

/** Parse one transcript into (entries, meta). Never throws — a malformed line is skipped (the final
 *  line of a live transcript is commonly truncated). `isSubagent` is true for a path under a
 *  `subagents/` directory. */
export function parseTranscript(filePath: string): { entries: TranscriptEntry[]; meta: TranscriptMeta } {
  const isSubagent = filePath.split(path.sep).includes("subagents");
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    /* unreadable — empty */
  }

  const entries: TranscriptEntry[] = [];
  let sessionId: string | null = null;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let gitBranch: string | null = null;
  let cwd: string | null = null;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let obj: TranscriptEntry;
    try {
      obj = JSON.parse(trimmed) as TranscriptEntry;
    } catch {
      continue; // truncated/malformed line — skip, never throw
    }
    entries.push(obj);
    if (sessionId === null && typeof obj.sessionId === "string" && obj.sessionId !== "") sessionId = obj.sessionId;
    const ts = normalizeTs(obj.timestamp);
    if (ts) {
      if (firstTs === null) firstTs = ts;
      lastTs = ts;
    }
    if (gitBranch === null && typeof obj.gitBranch === "string" && obj.gitBranch !== "") gitBranch = obj.gitBranch;
    if (cwd === null && typeof obj.cwd === "string" && obj.cwd !== "") cwd = obj.cwd;
  }

  // Fall back to the filename stem for the session id (real transcripts are named <sessionId>.jsonl;
  // subagents are agent-<hash>.jsonl, so we keep the parent session dir name where available).
  if (sessionId === null) {
    if (isSubagent) {
      // <session>/subagents/agent-*.jsonl → the session dir is two levels up.
      const parts = filePath.split(path.sep);
      const subIdx = parts.lastIndexOf("subagents");
      sessionId = subIdx > 0 ? parts[subIdx - 1] : path.basename(filePath, ".jsonl");
    } else {
      sessionId = path.basename(filePath, ".jsonl");
    }
  }

  const meta: TranscriptMeta = {
    path: filePath,
    sessionId,
    isSubagent,
    firstTs,
    lastTs,
    gitBranch,
    cwd,
  };
  return { entries, meta };
}

// ── The run ─────────────────────────────────────────────────────────────────────────────────────

/** Per-transcript parsed product the derivations consume. */
export interface ParsedTranscript {
  entries: TranscriptEntry[];
  meta: TranscriptMeta;
}

/**
 * Derive ALL rows for a workspace from its parsed transcripts. Pure: same parsed transcripts in ⇒
 * the same rows out (order-independent — the caller sorts canonically). Split out from runtime I/O so
 * the test harness can drive it directly.
 *
 * A1 wires token derivation; A2 adds per-session friction; A3 adds activity spans + attribution;
 * A4 adds stalls.
 */
/** The verdict-bearing nodes (§7) — the only nodes that author a layer-2 `<sg-signal>` block in their
 *  final result. The analyzer reads the block from a transcript and attaches its (allowlist-gated)
 *  gates/metrics to that node's enter/exit rows; every other node carries the honestly-under-captured
 *  empty gates. Mirrors the four nodes that import analytics-vocabulary. */
export const VERDICT_NODES: ReadonlySet<string> = new Set(["simulate-users", "benchmark", "health", "review"]);

export interface DeriveOptions {
  stallThresholdMs: number;
  /** The known graph-node id set — an activity span maps to a node only when its skill is in here. */
  nodeIds: ReadonlySet<string>;
  /** Nodes whose pre-gap presence tags a stall (§3.3). Defaults to the full node-id set — every
   *  backbone node can be the loop-pause point a stall straddles; a stall whose pre-gap activity is
   *  NOT a graph node carries a null before_node. Narrow this set to restrict the tag further. */
  gateHoldingNodes?: ReadonlySet<string>;
}

export function deriveAll(parsed: ParsedTranscript[], opts: DeriveOptions): DerivedRow[] {
  const rows: DerivedRow[] = [];
  const activityRows: ActivityRow[] = [];
  for (const p of parsed) {
    // Resolve attribution once per transcript (META line for dispatched sessions, gitBranch fallback,
    // then null — never a wrong carrier, §3.5). Token + activity rows carry the resolved triple.
    const attribution = resolveAttribution(p.entries, p.meta);

    rows.push(...deriveTokenRows(p.meta, attribution));

    // Activity spans → enter/exit rows for skills that match a graph node id. Kept aside too so the
    // cross-session stall derivation can order activity across ALL sessions.
    const acts = deriveActivityRows(p.entries, p.meta, attribution, opts.nodeIds);

    // Layer-2 (§7): a verdict-bearing node states its experience-contract verdict / trend number as a
    // fenced <sg-signal> block in this transcript's FINAL result message (the subagent transcript's
    // final message when the node ran dispatched — which is exactly THIS transcript). Read it once,
    // gate it by shape, and attach the surviving gates/metrics to that node's enter/exit rows. Absent
    // or malformed ⇒ nothing recorded (honest under-capture). Other nodes keep their empty gates.
    const verdictActs = acts.filter((r) => VERDICT_NODES.has(r.node));
    if (verdictActs.length > 0) {
      applyVerdictToRows(verdictActs, signalFromTranscript(p.entries));
    }

    rows.push(...acts);
    activityRows.push(...acts);

    // Friction is per top-level session. Subagent transcripts are folded into their parent session's
    // friction view by the publisher; the analyzer emits friction only for top-level transcripts to
    // keep one settled friction-record per session (§3.2 "one per session").
    if (!p.meta.isSubagent) {
      const friction = deriveFrictionRow(p.entries, p.meta);
      if (friction) rows.push(friction);
    }
  }

  // Stalls are CROSS-SESSION: order all activity instants and find gaps over the threshold. The
  // pre-gap node tag is restricted to gate-holding nodes (§3.3); a non-gate pre-gap node carries a
  // null before_node, the gap is still recorded.
  const stalls = deriveStallRows(
    instantsFromActivity(activityRows),
    opts.stallThresholdMs,
    opts.gateHoldingNodes ?? opts.nodeIds,
  );
  rows.push(...stalls);

  return rows;
}

function main(): void {
  const opts = parseOptions(process.argv.slice(2));

  // Ensure the derived/ dir exists (the analyzer's only writes are inside .stack-graph/).
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });

  const files = walkTranscripts(opts.root);
  const cursor: CursorFile = opts.noCursor ? { v: "1", entries: {} } : loadCursor(opts.cursorPath);
  const nextCursor: CursorFile = { v: "1", entries: {} };

  // Parse every transcript. The cursor lets us SKIP re-reading unchanged transcripts for the
  // per-transcript derivations, BUT the output is fully rewritten regardless — so we still need every
  // transcript's rows. To keep correctness independent of the cursor while still optimising, we cache
  // nothing across runs here at the row level (a future optimisation); the cursor today records
  // signatures so a `--no-cursor` run and a cursor run produce the identical file (verified in tests).
  const parsed: ParsedTranscript[] = [];
  for (const file of files) {
    let sig;
    try {
      sig = fileSignature(file);
    } catch {
      continue; // vanished between walk and stat — skip
    }
    const prev = cursor.entries[file];
    const unchanged = !opts.noCursor && isUnchanged(prev, sig);

    const p = parseTranscript(file);
    parsed.push(p);

    nextCursor.entries[file] = {
      path: file,
      size: sig.size,
      mtime: sig.mtime,
      sha256_head: sig.sha256_head,
      last_offset: unchanged && prev ? prev.last_offset : sig.size,
    };
  }

  const nodeIds = loadNodeIds();
  const rows = deriveAll(parsed, { stallThresholdMs: opts.stallThresholdMs, nodeIds });
  const body = serializeRows(rows);
  fs.writeFileSync(opts.outPath, body, "utf8");

  if (!opts.noCursor) saveCursor(opts.cursorPath, nextCursor);

  process.stdout.write(
    `analyzer: ${files.length} transcripts → ${rows.length} rows → ${opts.outPath}\n`,
  );
}

// Only run as a script, not when imported by the test harness.
if (import.meta.main) {
  main();
}
