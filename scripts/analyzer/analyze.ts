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
 * ENV (§analytics-env, a DIRECTORY and a FILE, never mis-joined):
 *   SG_TRANSCRIPT_ROOT       transcript root (default ~/.claude/projects)
 *   SG_EVENT_LOG             the derived event-log FILE (== --out); wins over the dir default and is used
 *                            verbatim — the `derived/…` tail is NOT appended
 *   STACK_GRAPH_EVENTS_DIR   the .stack-graph/ DIR (default <repo-root>/.stack-graph); the log is joined
 *                            under it at <dir>/derived/analyzer-events.jsonl
 *   SG_STALL_THRESHOLD_MIN   stall gap threshold in minutes (default 30)
 *   Precedence for the event-log path: --out (CLI) ▸ SG_EVENT_LOG (env) ▸ STACK_GRAPH_EVENTS_DIR (dir).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";

import {
  serializeAllRows,
  normalizeTs,
  ANALYZER_EVENT_V,
  ANOMALY_CLASSES,
  NULL_ATTRIBUTION,
} from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, DerivedRow, ActivityRow, OperatorActionEventRow, SgProposalRow, AttributionTriple, AnomalyClass, AnomalyCountRow, GateEnactmentRow } from "./schema.ts";
import { eventFromProposal } from "./derive-operator-actions.ts";
import { loadCursor, saveCursor, fileSignature, isUnchanged } from "./cursor.ts";
import type { CursorFile } from "./cursor.ts";
import { deriveTokenRows, dispatchPromptKey, collectDispatchNodeTypes } from "./derive-tokens.ts";
import { deriveFrictionRow, deriveGateWaitRows } from "./derive-friction.ts";
import { deriveActivityRows, deriveNodeActivityRows, deriveGateEnactmentRows } from "./derive-activity.ts";
import { deriveStallRows, instantsFromActivity } from "./derive-stalls.ts";
import { attributeTranscript, propagateFromRoot } from "./attribute.ts";
import type { SessionNode, TranscriptAttribution } from "./attribute.ts";
import { signalFromTranscript, applyVerdictToRows, finalAssistantTs } from "./parse-signal.ts";
import { scanSgTagsResult, rowFromProposal } from "./scan-sg-tags.ts";
import type { SgProposal } from "./scan-sg-tags.ts";
import { scanGateTagsResult } from "./scan-gate-tags.ts";

// ── CLI / config ──────────────────────────────────────────────────────────────────────────────

interface Options {
  noCursor: boolean;
  root: string;
  outPath: string;
  cursorPath: string;
  stallThresholdMs: number;
  /** IU-1 — the optional carriers ledger manifest (`--carriers <path>`). null = existence
   *  validation off (ID_RE shape validation always applies). */
  carriersPath: string | null;
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

export function parseOptions(argv: string[]): Options {
  let noCursor = false;
  let root: string | null = null;
  let outPath: string | null = null;
  let carriersPath: string | null = null;
  let thresholdMin = Number(process.env.SG_STALL_THRESHOLD_MIN) || DEFAULT_STALL_THRESHOLD_MIN;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-cursor") noCursor = true;
    else if (a === "--root") root = argv[++i] ?? null;
    else if (a === "--out") outPath = argv[++i] ?? null;
    else if (a === "--carriers") {
      // IU-1 — the flag is an EXPLICIT request for existence validation: a missing/empty value must
      // fail loud, never fold to "validation off while the operator believes it is on".
      const v = argv[++i];
      if (v === undefined || v.trim() === "") {
        throw new Error("--carriers requires a manifest path (refusing to silently disable existence validation)");
      }
      carriersPath = v;
    }
    else if (a === "--threshold-min") thresholdMin = Number(argv[++i]) || thresholdMin;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: analyze.ts [--no-cursor] [--root <dir>] [--out <events.jsonl>] [--carriers <manifest.json>] [--threshold-min <n>]\n",
      );
      process.exit(0);
    }
  }

  const resolvedRoot = expandHome(
    root ?? process.env.SG_TRANSCRIPT_ROOT ?? path.join(os.homedir(), ".claude", "projects"),
  );
  // The event-log path — a FILE, resolved by the §analytics-env precedence (bindings-contract):
  //   `--out` (CLI) ▸ `SG_EVENT_LOG` (env) ▸ the `STACK_GRAPH_EVENTS_DIR` DIRECTORY default.
  // The two file sources name `analyzer-events.jsonl` DIRECTLY and win outright — the `derived/…` tail
  // is NEVER appended to them (appending it onto a file is the dir/file mis-join the contract forbids).
  // Only the directory default joins `derived/analyzer-events.jsonl`, because `STACK_GRAPH_EVENTS_DIR`
  // is the `.stack-graph/` dir, never the file. A file override short-circuits the dir resolution
  // entirely, so a spurious `git` probe never runs under a file-bound (e.g. cron) invocation.
  const envFile = process.env.SG_EVENT_LOG;
  const fileOverride = outPath ?? (envFile && envFile.trim() !== "" ? envFile.trim() : null);
  const resolvedOut = fileOverride
    ? expandHome(fileOverride)
    : path.join(resolveStackGraphDir(), "derived", "analyzer-events.jsonl");
  // The cursor lives ALONGSIDE the events file (analyzer-cursor.json in the same dir), so a file
  // override (a test tmpdir, or the bound SG_EVENT_LOG) keeps the cache local to that output rather
  // than the repo's .stack-graph/. With the dir default this resolves to derived/analyzer-cursor.json.
  return {
    noCursor,
    root: resolvedRoot,
    outPath: resolvedOut,
    cursorPath: path.join(path.dirname(resolvedOut), "analyzer-cursor.json"),
    stallThresholdMs: Math.max(0, thresholdMin) * 60_000,
    carriersPath: carriersPath !== null ? expandHome(carriersPath.trim()) : null,
  };
}

// ── IU-1 — the carriers ledger manifest (`--carriers`) ────────────────────────────────────────────

/** Load the known carrier-id set from a ledger manifest (the work-ledger `manifest.json` shape: a
 *  JSON array whose entries carry an `id` — plain-string entries are accepted defensively; a
 *  non-string id is skipped, never coerced). THROWS on an unreadable or malformed file: `--carriers`
 *  is an EXPLICIT operator input — silently ignoring it would turn validation off while the operator
 *  believes it is on (the unsafe direction), and silently treating it as empty would mass-reject
 *  every operand. Loud is the only honest failure. */
export function loadCarriersManifest(manifestPath: string): Set<string> {
  const raw = fs.readFileSync(manifestPath, "utf8"); // throws loud on unreadable — deliberate
  const parsed = JSON.parse(raw) as unknown; // throws loud on malformed — deliberate
  if (!Array.isArray(parsed)) throw new Error(`--carriers manifest is not a JSON array: ${manifestPath}`);
  const ids = new Set<string>();
  for (const entry of parsed) {
    if (typeof entry === "string") ids.add(entry);
    else if (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string") {
      ids.add((entry as { id: string }).id);
    }
  }
  return ids;
}

// ── Graph node-id set ───────────────────────────────────────────────────────────────────────────

/** Load the known graph-node id set from graph-record.json. Tries the factory layout
 *  (<repo>/graph-vUnified/graph-record.json) and the vendored-plugin layout (alongside the renderer), then
 *  degrades to an EMPTY set — with no record, no skill maps to a node, so activity rows are simply not
 *  emitted (honest under-capture; the publisher would drop unknown ids anyway). Never throws. */
export function loadNodeIds(explicitPath?: string): Set<string> {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const candidates = [
    explicitPath,
    process.env.SG_GRAPH_RECORD,
    path.resolve(here, "..", "..", "..", "graph-vUnified", "graph-record.json"), // factory checkout: three levels up from the analyzer dir → repo/graph-vUnified
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
  /** Optional METRICS-ONLY side-channel for the additive `<sg-*>` family scan (IU-A4). When provided,
   *  the scan's captured PROPOSALS are pushed here — DELIBERATELY kept OUT of the returned DerivedRow[]
   *  durable stream so the analyzer's at-rest write (analyzer-events.jsonl) is byte-for-byte unchanged
   *  by the scan addition. The scan never enacts a durable write; this collector is read-only metrics. */
  sgProposals?: SgProposal[];
  /** Optional collector for the per-event operator-action ROWS (IU oa-analyze-bridge). When provided,
   *  each `<sg-operator-action>` proposal in a transcript is bridged via `eventFromProposal` — binding
   *  `attended` from the scan disposition and `harness_id` from THIS transcript's META attribution
   *  (NEVER the attacker-controllable tag body, the P0) — into a per-event row pushed here. Kept OUT of
   *  the returned `DerivedRow[]` (operator-action is its own serialised block), so a caller that omits
   *  this collector still gets the byte-identical DerivedRow stream it always did. */
  operatorActionRows?: OperatorActionEventRow[];
  /** Optional collector for the DURABLE `<sg-*>` family PROPOSAL rows (IU-9). When provided, each
   *  captured family proposal — EXCEPT sg-operator-action, which rides `operatorActionRows` — is bridged
   *  via `rowFromProposal` into a BOUNDED, allowlist-clean `SgProposalRow` pushed here. The raw
   *  `SgProposal.body` is NEVER carried (built value-by-value from the schema allowlist), so no
   *  free-text/secret reaches the at-rest log. Kept OUT of the returned `DerivedRow[]` (its own
   *  serialised block, like operator-action), so a caller that omits this collector still gets the
   *  byte-identical DerivedRow stream it always did. */
  sgProposalRows?: SgProposalRow[];
  /** IU-1 — the known carrier-id set (the `--carriers` ledger manifest). When supplied, an
   *  ID_RE-clean operand id absent from it is REJECTED (correct-or-null) and counted
   *  `carrier-unresolvable`. null/undefined ⇒ existence validation off. */
  carriers?: ReadonlySet<string> | null;
  /** IU-1 — optional collector for the AGGREGATE attribution-anomaly rows (one per (session, class)
   *  with count > 0; publisher-readable — the trust strip reads them). Kept OUT of the returned
   *  `DerivedRow[]` (its own serialised block, like operator-action / sg-proposal), so a caller that
   *  omits this collector still gets the byte-identical DerivedRow stream it always did. The
   *  `provenance-refused` class (IU-6 gate channel) rides this collector too. */
  anomalyRows?: AnomalyCountRow[];
  /** IU-6 (gate-channel-e2e) — optional collector for the PROVENANCE-BOUND gate-enactment rows. When
   *  provided, each `<sg-gate>` tag captured with executed-runner provenance is derived into a
   *  `record-gate`-tagged `GateEnactmentRow` pushed here; a shape-conforming tag WITHOUT provenance
   *  derives NOTHING and increments the `provenance-refused` anomaly count (via `anomalyRows`). Kept OUT
   *  of the returned `DerivedRow[]` (its own serialised block), so a caller that omits it still gets the
   *  byte-identical DerivedRow stream it always did. */
  gateEnactmentRows?: GateEnactmentRow[];
}

/**
 * IU-A4 — the PARENT SESSION of a transcript: the session that owns the first CROSS-session `parentUuid`
 * in its entries (the entry the PARENT wrote that spawned this sub-agent). Only a SUBAGENT (`isSidechain`)
 * transcript inherits a parent — a top-level session is always its own root, never a child. Returns null
 * when no cross-session link resolves — a rootless / unlinked child, or a link into an uncaptured parent
 * (the missing-parent case `propagateFromRoot`'s walk guards). Intra-session `parentUuid` chains resolve
 * to THIS session and are skipped; only a link OUT of this session names a parent.
 */
function parentSessionOf(p: ParsedTranscript, uuidToSession: Map<string, string>): string | null {
  if (!p.meta.isSubagent) return null; // top-level → its own root (never a child)
  for (const e of p.entries) {
    const pu = e.parentUuid;
    if (typeof pu === "string" && pu !== "") {
      const owner = uuidToSession.get(pu);
      if (owner && owner !== p.meta.sessionId) return owner; // first cross-session link = the parent
    }
  }
  return null;
}

/**
 * IU-A4 — resolve the FINAL attribution for every session, keyed by session, with nearest-carrier-
 * ancestor inheritance across the dispatch tree. A pre-pass over the whole corpus (propagation reasons
 * over the tree, not one transcript in isolation):
 *   1. Resolve each transcript's OWN attribution in isolation (attributeTranscript — the dispatch META
 *      envelope, else the SIGNAL-DERIVED carrier-operand path; IU-1's correct-or-null discipline —
 *      keeping its AMBIGUITY marker so a contradictory-signal null is never back-filled in step 3).
 *   2. Build the session tree — every entry's `uuid` → its owning session (a `parentUuid` may point into
 *      ANOTHER transcript), and each subagent's parent = the owner of its first cross-session `parentUuid`.
 *      `parentUuid` / `isSidechain` are Claude-Code-recorded — host-recorded exactly like the tool
 *      events the signal scan reads, so a sub-agent cannot forge a link to a richer ancestor.
 *   3. `propagateFromRoot` inherits the NEAREST carrier-bearing ancestor's carrier IDENTITY into any
 *      descendant whose own carrier is null — skipping any null-carrier ancestor in between
 *      (fill-null-only; stage never inherits; trust inherited, never manufactured).
 * A session spanning >1 transcript (a resume) merges to its first NON-null own attribution and first
 * resolved parent link — UNLESS two slices carry DISTINCT non-null own carriers, which is the same
 * ambiguity the IU-1 single-distinct-span rule nulls at session grain: the merged own degrades to
 * honest-null (a wrong-half attribution is worse than none; IU-3's per-span rows recover the detail).
 * Returns a session → AttributionTriple map the per-transcript loop reads.
 */
export function resolveTreeAttribution(
  parsed: ParsedTranscript[],
  carriers: ReadonlySet<string> | null = null,
): Map<string, AttributionTriple> {
  // The public entry: resolve each transcript's own attribution, then fold the tree. `deriveAll` folds
  // off its OWN single shared scan (IU-3 — one attribution pass feeds tree, spans and anomalies alike).
  return buildTreeAttribution(parsed.map((p) => ({ p, ta: attributeTranscript(p.entries, p.meta, { carriers }) })));
}

/** One transcript paired with its resolved (in-isolation) `TranscriptAttribution` — the unit the ONE
 *  per-transcript attribution scan produces (IU-3 fold). `buildTreeAttribution` folds the tree off
 *  `ta.own`/`ta.ambiguous`; `deriveAll` additionally reads `ta.spans` (per-carrier usage) and
 *  `ta.anomalies` (trust-strip counts) from the SAME `ta`, so no deriver re-scans a transcript. */
export interface AttributedTranscript {
  p: ParsedTranscript;
  ta: TranscriptAttribution;
}

/**
 * Fold the per-transcript own-attributions into the final session→attribution map (IU-A4 nearest-
 * carrier-ancestor inheritance) off ALREADY-RESOLVED `ta`s — it never calls `attributeTranscript`
 * itself. `resolveTreeAttribution` (the public entry) scans then delegates here; `deriveAll` folds off
 * its own single shared scan, so the tree, the per-span usage, and the anomaly counts all ride ONE
 * attribution pass per transcript (IU-3 — the fold of the old deliberate second scan).
 */
export function buildTreeAttribution(attributed: AttributedTranscript[]): Map<string, AttributionTriple> {
  // uuid → owning session, over the WHOLE corpus (a parentUuid may point into another transcript).
  const uuidToSession = new Map<string, string>();
  for (const { p } of attributed) {
    for (const e of p.entries) {
      if (typeof e.uuid === "string" && e.uuid !== "") uuidToSession.set(e.uuid, p.meta.sessionId);
    }
  }

  // Per session: its own (in-isolation) attribution, its parent session id, and its AMBIGUITY.
  const ownBySession = new Map<string, AttributionTriple>();
  const parentBySession = new Map<string, string | null>();
  // Sessions whose null is CONTRADICTION, not absence: any slice's own resolution was ambiguous
  // (rejected-boundary re-target / distinct span carriers), or two slices carry DISTINCT non-null
  // own carriers (the conflicted resume). Ambiguity is sticky — once ambiguous, always ambiguous.
  const ambiguousSessions = new Set<string>();
  for (const { p, ta } of attributed) {
    const sid = p.meta.sessionId;
    const own = ta.own;
    if (ta.ambiguous) ambiguousSessions.add(sid);
    const prevOwn = ownBySession.get(sid);
    // First non-null own wins (a resumed session's carrier-bearing slice settles it) — but two
    // slices with DIFFERENT non-null carriers are the session-grain ambiguity IU-1 nulls.
    if (!prevOwn || (prevOwn.carrier === null && own.carrier !== null)) ownBySession.set(sid, own);
    else if (prevOwn.carrier !== null && own.carrier !== null && own.carrier !== prevOwn.carrier) ambiguousSessions.add(sid);
    // First resolved parent link wins; never overwrite a real parent with a later null.
    const prevParent = parentBySession.get(sid);
    if (prevParent === undefined || prevParent === null) parentBySession.set(sid, parentSessionOf(p, uuidToSession));
  }
  // An ambiguous session merges to honest-null so propagateFromRoot refuses to back-fill it from an
  // ancestor (ambiguity is not absence).
  for (const sid of ambiguousSessions) ownBySession.set(sid, { ...NULL_ATTRIBUTION });

  const nodes: SessionNode[] = [];
  for (const [sessionId, own] of ownBySession) {
    nodes.push({ sessionId, own, parent: parentBySession.get(sessionId) ?? null, ambiguous: ambiguousSessions.has(sessionId) });
  }
  return propagateFromRoot(nodes);
}

export function deriveAll(parsed: ParsedTranscript[], opts: DeriveOptions): DerivedRow[] {
  const rows: DerivedRow[] = [];
  const activityRows: ActivityRow[] = [];
  const carriers = opts.carriers ?? null;

  // IU-A4 — resolve attribution for the WHOLE corpus first, with nearest-carrier-ancestor inheritance
  // across the dispatch tree: a dispatched sub-agent with no own signal inherits the carrier IDENTITY
  // of its NEAREST work-item-bearing ancestor, walking up and skipping any null-carrier ancestor
  // (fill-null-only; a rootless / all-null-ancestor child stays null; stage never inherits). Keyed by
  // session.
  // IU-3 fold — ONE attribution pass per transcript feeds the tree, the per-span usage, AND the
  // anomaly counts. `attributeTranscript` runs exactly once here (the old deliberate second scan is
  // gone); both the tree fold and the per-transcript loop below read the resulting `ta`.
  const perTranscript: AttributedTranscript[] = parsed.map((p) => ({ p, ta: attributeTranscript(p.entries, p.meta, { carriers }) }));
  const treeAttribution = buildTreeAttribution(perTranscript);

  // IU-2 (DR7) rule (a): the corpus prompt-key → dispatched subagent_type map. A dispatched subagent
  // whose first user message joins a parent Task/Agent dispatch of a graph-node subagent_type is
  // whole-file in-node (even when its own messages carry no node signal). Built once over the corpus;
  // the per-transcript membership test is `opts.nodeIds.has(<stripped subagent_type>)`.
  const dispatchTypeByPromptKey = new Map<string, string>();
  for (const p of parsed) {
    for (const d of collectDispatchNodeTypes(p.entries)) dispatchTypeByPromptKey.set(d.promptKey, d.subagentType);
  }

  // IU-1 — the aggregate attribution-anomaly tally, per (session, class). Collected only when the
  // caller passes the collector (the side-channel pattern), keyed deterministically: the class counts
  // sum across a session's transcripts (a resumed session aggregates), and the row ts is the session's
  // FIRST observed instant in walk order — so a re-run is byte-identical (§9).
  const anomalyBySession = opts.anomalyRows
    ? new Map<string, { ts: string | null; counts: Map<AnomalyClass, number> }>()
    : null;
  /** Get-or-create a session's anomaly aggregate, anchoring its row `ts` at the FIRST `firstTs` it is
   *  called with (the session's first transcript in walk order). Called UNCONDITIONALLY once per
   *  transcript (below) so the anchor is the session's first instant even when that first slice carries
   *  zero anomalies — the emission loop still drops a zero-count aggregate, so no spurious row results,
   *  but a resumed session whose leading slice is anomaly-free keeps the correct ts (§9 byte-identical). */
  const ensureAgg = (session: string, firstTs: string | null): { ts: string | null; counts: Map<AnomalyClass, number> } | null => {
    if (!anomalyBySession) return null;
    let agg = anomalyBySession.get(session);
    if (!agg) { agg = { ts: firstTs, counts: new Map() }; anomalyBySession.set(session, agg); }
    return agg;
  };
  /** Fold `n` occurrences of an anomaly `cls` into a session's aggregate. One helper, three producers —
   *  attribution (IU-1), token-dedup (IU-2), and the gate channel's provenance-refused (IU-6). No-op when
   *  the collector is absent or the count is zero (absence of anomalies is absence of rows). The `ts`
   *  anchor is owned by `ensureAgg` (first-transcript-wins), never re-set here. */
  const bumpAnomaly = (session: string, firstTs: string | null, cls: AnomalyClass, n: number): void => {
    if (!anomalyBySession || n <= 0) return;
    const agg = ensureAgg(session, firstTs)!;
    agg.counts.set(cls, (agg.counts.get(cls) ?? 0) + n);
  };

  for (const { p, ta } of perTranscript) {
    // The final attribution for this transcript's session: its OWN signal (IU-1 — the dispatch `META:`
    // envelope for dispatched sessions, then the signal-derived carrier-operand path; never a wrong
    // carrier, never from an agent-echoed `PREAMBLE: jit` block or a text echo, §3.5), or — when its
    // own is null — the NEAREST carrier-bearing ancestor's identity walked up the parentUuid tree
    // (IU-A4). Falls back to this transcript's own resolution defensively. Token + activity rows carry it.
    const attribution = treeAttribution.get(p.meta.sessionId) ?? ta.own;

    // IU-1 — tally this transcript's attribution anomalies (aggregate counts, never per-event spam;
    // per-field honest-null stays on the attribution itself — the counts make the degradation VISIBLE).
    // IU-3 fold: these read the LOOP's `ta` — the one shared per-transcript scan above — so the tree
    // fold, the per-span usage below, and this anomaly tally all ride ONE `attributeTranscript` pass
    // (the old deliberate second scan is gone).
    if (anomalyBySession) {
      // Anchor this session's aggregate at its FIRST transcript's instant (walk order), created here
      // UNCONDITIONALLY so a resumed session whose leading slice is anomaly-free still anchors correctly
      // (the emission loop drops a zero-count aggregate, so this mints no spurious row). Then tally: the
      // attribution counts live on `ta.anomalies` (the attribution classes only); the token-dedup and
      // gate-channel classes are folded by their own producers below. Iterating the full class set here
      // reads 0 for those, so nothing double-counts.
      ensureAgg(p.meta.sessionId, p.meta.firstTs);
      for (const cls of ANOMALY_CLASSES) bumpAnomaly(p.meta.sessionId, p.meta.firstTs, cls, ta.anomalies[cls] ?? 0);
    }

    // IU-6 (gate-channel-e2e) — the PROVENANCE-BOUND gate channel, PARALLEL to the model-tag scan. The
    // gate scanner captures each `<sg-gate>` tag that rides an EXECUTED-runner tool_result as a proposal
    // (derived into a `record-gate`-tagged gate-enactment row), and counts a shape-conforming tag WITHOUT
    // executed-runner provenance (prose, a non-runner replay, a mention-only command, a registry/runner
    // read echo) as `provenance-refused` — forgery is VISIBLE (counted), never a minted row. Opt-in
    // collectors like the other side channels: absent them this is a no-op and the DerivedRow stream is
    // byte-identical. The refused count folds into the SAME per-(session, class) anomaly aggregate.
    if (opts.gateEnactmentRows || anomalyBySession) {
      const { proposals, provenanceRefused } = scanGateTagsResult(p.entries, p.meta);
      if (opts.gateEnactmentRows) opts.gateEnactmentRows.push(...deriveGateEnactmentRows(proposals));
      bumpAnomaly(p.meta.sessionId, p.meta.firstTs, "provenance-refused", provenanceRefused);
    }

    // Layer-2 additive (IU-A4): the CLOSED `<sg-*>` family scan, METRICS-ONLY and PARALLEL to the
    // verdict path. It captures every registered family tag as a PROPOSAL (attended → surfaced;
    // dispatched → proposal-only) and NEVER enacts a durable write — so its output is collected into
    // the opt-in side-channel below, never into `rows`. Absent the collector this is a no-op; the
    // verdict path (parse-signal.ts, attached below) is left byte-for-byte unchanged either way.
    if (opts.sgProposals || opts.operatorActionRows || opts.sgProposalRows || anomalyBySession) {
      const { proposals, parseDrops, scanCapHits } = scanSgTagsResult(p.entries, p.meta);
      // IU-8 — fold the scan's parse-drop + scan-cap counts into this session's anomaly aggregate (the
      // trust strip's tag-capture-drop + ReDoS-bound counters). Same per-(session, class) mechanism as the
      // attribution / token-dedup / provenance-refused folds; no-op when anomalies are not collected.
      bumpAnomaly(p.meta.sessionId, p.meta.firstTs, "parse-drop", parseDrops);
      bumpAnomaly(p.meta.sessionId, p.meta.firstTs, "scan-cap", scanCapHits);
      if (opts.sgProposals) opts.sgProposals.push(...proposals);
      // IU oa-analyze-bridge (IU-7/DR11): bridge each `<sg-operator-action>` proposal into a per-event
      // row. `attended` is bound from TRUSTWORTHY context — the proposal disposition (top-level vs
      // subagent) — NEVER from the attacker-controllable tag body (the load-bearing P0: a forged body
      // cannot forge close authority). The emitted id is CANONICALISED to `<session-prefix>:<slug>` via
      // this transcript's session; close-authority's collection half is COLLECTION-tier (not plumbed
      // per-event — the retired `harness_id` is gone). `eventFromProposal` returns null for a
      // non-`sg-operator-action` proposal OR an un-canonicalisable id. The event ts is the tag-bearing
      // assistant TURN's OWN instant (`proposal.ts` — the scan reads ALL turns, DR3/F2), falling back to
      // the final-assistant instant (`finalAssistantTs`) then `meta.lastTs`.
      const tagTs = finalAssistantTs(p.entries) ?? p.meta.lastTs;
      if (opts.operatorActionRows && tagTs) {
        // De-dup a tag repeated VERBATIM in one final message (a model copy-paste is one logical event,
        // not a genuine dup-open/dup-close): collapse by (id, open|close) within this one transcript.
        const seen = new Set<string>();
        for (const proposal of proposals) {
          // DR11: canonicalise the emitted id via THIS transcript's session (collection is COLLECTION-tier,
          // not plumbed per-event). Returns null for a non-member OR an un-canonicalisable id.
          const ev = eventFromProposal(proposal, p.meta.sessionId, proposal.ts ?? tagTs);
          if (!ev) continue;
          const dedupKey = `${ev.id} ${ev.kind}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          opts.operatorActionRows.push({
            ts: ev.ts,
            kind: "operator-action",
            id: ev.id,
            status: ev.kind === "open" ? "open" : "closed",
            attended: ev.attended,
            session: p.meta.sessionId,
            v: ANALYZER_EVENT_V,
          });
        }
      }

      // IU-9: DURABLE `<sg-*>` family capture — bridge each proposal into a BOUNDED sg-proposal row
      // (rowFromProposal builds it value-by-value from the schema allowlist; the raw body is NEVER
      // carried — no free-text/secret at rest). sg-operator-action projects to null (it rode its own
      // row above), so it is never double-represented here. The row ts is the tag-bearing TURN's own
      // instant (`proposal.ts` — the all-turns scan stamps a non-final tag at its own turn, not
      // session-end), falling back to `tagTs`. A tag repeated VERBATIM collapses to one logical proposal
      // (dedup by projected fields), matching the operator-action bridge's copy-paste discipline.
      if (opts.sgProposalRows && tagTs) {
        const seenProposal = new Set<string>();
        for (const proposal of proposals) {
          const row = rowFromProposal(proposal, proposal.ts ?? tagTs);
          if (!row) continue;
          const dedupKey = JSON.stringify(row.fields);
          if (seenProposal.has(dedupKey)) continue;
          seenProposal.add(dedupKey);
          opts.sgProposalRows.push(row);
        }
      }
    }

    // IU-2 (DR7) rule (a): resolve whether THIS subagent was dispatched with a graph-node subagent_type
    // (prompt-key join over the corpus map). Top-level transcripts are never dispatched-as-node.
    let dispatchedAsNode = false;
    if (p.meta.isSubagent) {
      const key = dispatchPromptKey(p.entries);
      const st = key !== null ? dispatchTypeByPromptKey.get(key) : undefined;
      dispatchedAsNode = st !== undefined && opts.nodeIds.has(st);
    }
    // IU-3 (DR7): pass this transcript's carrier spans (from the shared scan) so a multi-carrier
    // top-level session splits its session-usage per span (subagents ignore spans — whole-file).
    const { rows: tokenRows, lastNeMaxDivergences } = deriveTokenRows(p.entries, p.meta, attribution, { nodeIds: opts.nodeIds, dispatchedAsNode, spans: ta.spans });
    rows.push(...tokenRows);

    // IU-2 (DR7): fold this transcript's last≠max dedup divergences into the session's aggregate — the
    // `token-dedup-divergence` trust-strip counter (IU-8). Same per-(session, class) count mechanism as
    // the attribution anomalies above; absence of divergence is absence of a row.
    bumpAnomaly(p.meta.sessionId, p.meta.firstTs, "token-dedup-divergence", lastNeMaxDivergences);

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

    // IU-A3 — the per-transcript, per-node ACTIVITY TOTAL: sum a node's active_ms over ALL N of its
    // non-contiguous spans WITHIN THIS ONE TRANSCRIPT (windowed in the transcript's monotonic entry
    // order, never a wall-clock window across transcripts). A re-entered node is one settled total,
    // not N partial rows; two concurrently-dispatched transcripts each sum independently, so a
    // concurrent dispatch is never double-counted. Emitted for EVERY transcript (a subagent IS a node).
    rows.push(...deriveNodeActivityRows(p.entries, p.meta, attribution, opts.nodeIds));

    // IU-A3 — the FIRST-CLASS gate-wait event: a `[gate-wait:<gate>]` marker found in THIS transcript's
    // monotonic entry order becomes its own `gate-wait` row, tagged with the active graph node. It is
    // DISTINCT from the cross-transcript wall-clock `stall-record` below — never folded into it.
    rows.push(...deriveGateWaitRows(p.entries, p.meta, attribution, opts.nodeIds));

    // Friction is per top-level session. Subagent transcripts are folded into their parent session's
    // friction view by the publisher; the analyzer emits friction only for top-level transcripts to
    // keep one settled friction-record per session (§3.2 "one per session").
    if (!p.meta.isSubagent) {
      const friction = deriveFrictionRow(p.entries, p.meta, attribution);
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

  // IU-1 — emit the aggregate anomaly-count rows: one per (session, class) with count > 0 (absence
  // of anomalies is absence of rows — the IU-11 fixture baseline distinguishes a dead counter from
  // perfection). A session with no timestamp is skip-emitted (honest under-capture; never an empty
  // ts the publisher would drop). ANOMALY_CLASSES order keeps emission deterministic; the canonical
  // serialisation sort settles the at-rest order regardless.
  if (opts.anomalyRows && anomalyBySession) {
    for (const [session, agg] of anomalyBySession) {
      if (!agg.ts) continue;
      for (const cls of ANOMALY_CLASSES) {
        const count = agg.counts.get(cls) ?? 0;
        if (count === 0) continue;
        opts.anomalyRows.push({ ts: agg.ts, kind: "anomaly-count", class: cls, count, session, v: ANALYZER_EVENT_V });
      }
    }
  }

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
  // IU-1 — the optional carriers ledger manifest: an EXPLICITLY supplied but unreadable/malformed
  // manifest fails LOUD (never silently off, never silently empty — both would lie about validation).
  let carriers: ReadonlySet<string> | null = null;
  if (opts.carriersPath) {
    try {
      carriers = loadCarriersManifest(opts.carriersPath);
    } catch (err) {
      process.stderr.write(`analyzer: cannot load --carriers manifest ${opts.carriersPath}: ${String(err)}\n`);
      process.exit(1);
    }
  }
  const operatorActionRows: OperatorActionEventRow[] = [];
  const sgProposalRows: SgProposalRow[] = [];
  const anomalyRows: AnomalyCountRow[] = [];
  const gateEnactmentRows: GateEnactmentRow[] = [];
  const rows = deriveAll(parsed, { stallThresholdMs: opts.stallThresholdMs, nodeIds, operatorActionRows, sgProposalRows, carriers, anomalyRows, gateEnactmentRows });
  // The DerivedRow stream + the per-event operator-action rows + the durable sg-proposal rows (IU-9)
  // + the aggregate anomaly-count rows (IU-1) + the gate-enactment rows (IU-6) are serialised into ONE
  // canonically (ts, session, kind)-sorted file (none of the side-channel kinds is a DerivedRow, but all
  // ride the same canonical order); a re-run with no new activity is byte-identical.
  const body = serializeAllRows(rows, operatorActionRows, sgProposalRows, anomalyRows, gateEnactmentRows);
  fs.writeFileSync(opts.outPath, body, "utf8");

  if (!opts.noCursor) saveCursor(opts.cursorPath, nextCursor);

  process.stdout.write(
    `analyzer: ${files.length} transcripts → ${rows.length} rows + ${operatorActionRows.length} operator-action + ${sgProposalRows.length} sg-proposal + ${anomalyRows.length} anomaly-count + ${gateEnactmentRows.length} gate-enactment → ${opts.outPath}\n`,
  );
}

// Only run as a script, not when imported by the test harness.
if (import.meta.main) {
  main();
}
