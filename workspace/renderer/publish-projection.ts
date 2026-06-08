#!/usr/bin/env bun
/**
 * publish-projection.ts
 * ---------------------
 * Projection snapshot publisher (A3b-5).
 *
 * Reads the local .stack-graph/events.jsonl event log and emits a SANITIZED
 * portal-projection.json keyed by the current git commit SHA.
 *
 * ASSUMED EVENT SCHEMA (documented here because the docs pin the fields but
 * leave a few optional ones implicit):
 *
 *   Every event is a JSON object on a single line (JSONL). Mandatory fields:
 *     ts       — ISO-8601 UTC timestamp  (e.g. "2026-06-02T10:00:00Z")
 *     session  — session identifier string
 *     kind     — "enter" | "exit" | "gate" | "traverse"
 *     node     — node id string  (present on enter/exit/gate; omit on traverse)
 *     carrier  — carrier id string, or null if no carrier is active
 *
 *   Additional fields on "exit" events (from instrumentation-preamble.md):
 *     outcome  — short outcome label string (e.g. "intent-settled")
 *     gates    — array of gate strings (e.g. ["commit-to-build:pass"])
 *     metrics  — optional object of named trend measurements (e.g. {"benchmark.perf": 1234});
 *                only present on measurement-bearing exit events
 *
 *   Additional fields on "traverse" events (from 06-analytics README):
 *     from, to — node ids (the edge traversed)
 *     arc      — arc id string, optional
 *
 *   Additional field used for AX data:
 *     ax       — optional object with aggregate metrics; only present on ax-bearing events
 *
 *   NOTE: the docs are silent on a dedicated "stage" field — a carrier's current_stage
 *   is derived as the node id of the latest "enter" event for that carrier. This is
 *   consistent with artefacts-design.md §5 ("current_stage = the latest stage event for
 *   that carrier") and instrumentation-preamble.md ("carrier tagging" section).
 *
 *   SANITIZATION CONTRACT: this script reads from each event only ts, kind, node, carrier,
 *   the ax aggregate object, the metrics measurement object, and — for conformance only — a
 *   COUNT of the closed-allowlist experience-contract gate token (never the gate string
 *   itself). It never reads, copies, or echoes:
 *     - outcome strings (may reflect private content)
 *     - free-text gate names (only the closed `experience-contract:<pass|fail>` token is
 *       inspected, and only its pass/fail tally is surfaced — never the gate string verbatim)
 *     - session ids (private workspace identifiers)
 *     - from/to/arc on traverse events (structural only, not surfaced in the snapshot)
 *     - any free-text fields (e.g. a hypothetical "body", "text", "prompt" field)
 *   Both `ax` and `metrics` are read by closed numeric allowlist (AX_NUMERIC_KEYS /
 *   TREND_SERIES) with a finite-number guard — never spread verbatim.
 *
 * USAGE:
 *   bun run workspace/renderer/publish-projection.ts [options]
 *
 * OPTIONS:
 *   --events <path>   Path to the events.jsonl file (default: <repo>/.stack-graph/events.jsonl)
 *   --out <path>      Output path (default: workspace/dist/portal-projection.json)
 *   --help            Show this message
 *
 * ENV OVERRIDES:
 *   STACK_GRAPH_EVENTS_DIR   Override the .stack-graph/ directory path
 *   STACK_GRAPH_OUT          Override the output path
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const GENERATOR_VERSION = "0.1.0";

// Sanitization — the locality boundary. Ids are emitted as JSON keys AND values, so they
// must be bounded, metachar-free tokens, never a free-text/secret channel. Non-matching
// ids are dropped with a warning.
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// Event timestamps are carried into the output (transition_summary[].at, trends[].at), so they
// are a locality boundary too. `new Date(ts)` accepts non-ISO free text (e.g. JS legacy date
// formats, and ISO-like strings with a trailing " (comment)" still parse), letting attacker
// free-text ride into the snapshot. Require a STRICT UTC ISO-8601 instant — anything else is
// dropped. This sits IN FRONT of the parseable/future checks. After validation we store ONLY
// the normalized `new Date(tsMs).toISOString()`, never the raw `ts`.
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

// AX is published. Only these numeric, finite metrics pass through; the rest of any `ax`
// object is dropped (never spread verbatim) so secrets/free-text cannot ride along.
// Keep in lockstep with build-analytics.ts and docs/workspace-portal-design.md §6 — a key
// absent from any of the three is silently dropped on one surface.
const AX_NUMERIC_KEYS = [
  "tokens_total", "tokens_to_outcome", "duration_ms", "latency_ms",
  "steps", "steps_to_outcome", "tool_calls", "backtracks",
  "tool_path_breadth",
] as const;

// Trend measurements are published as time series. Exit events may carry a `metrics` object
// of named measurements; only these closed series names pass through, value-by-value, with a
// finite-number guard — the `metrics` object is NEVER spread verbatim (same discipline as ax).
// Keep in lockstep with docs/workspace-portal-design.md §6 and the nodes that emit them
// (benchmark → benchmark.perf, health → health.quality).
const TREND_SERIES = [
  "benchmark.perf", "health.quality",
] as const;

// UX-conformance: the ONLY gate token the publisher inspects. It is a closed-allowlist token,
// matched exactly; the publisher surfaces only the pass/fail TALLY, never the gate string. All
// other (free-text) gate names are ignored — they may carry private decision names.
const EXPERIENCE_CONTRACT_GATE = "experience-contract";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function repoRoot(): string {
  // Walk up from __dirname until we find a .git directory.
  let dir = path.dirname(new URL(import.meta.url).pathname);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate repo root (no .git found above " + path.dirname(new URL(import.meta.url).pathname) + ")");
}

function gitHead(root: string): string {
  try {
    const sha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
    if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error("Unexpected sha format: " + sha);
    // A dirty tree must NOT claim a clean commit: downstream freshness is `commit === HEAD`,
    // so a dirty publish would render uncommitted projection data as authoritative. Suffix
    // "-dirty" so the equality check fails and the portal degrades loudly.
    const dirty = execSync("git status --porcelain", { cwd: root, encoding: "utf8" }).trim() !== "";
    return dirty ? `${sha}-dirty` : sha;
  } catch (e) {
    throw new Error("Failed to get git HEAD: " + String(e));
  }
}

function parseArgs(): { eventsPath: string | null; outPath: string | null } {
  const args = process.argv.slice(2);
  let eventsPath: string | null = null;
  let outPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--events" && args[i + 1]) { eventsPath = args[++i]; }
    else if (args[i] === "--out" && args[i + 1]) { outPath = args[++i]; }
    else if (args[i] === "--help") {
      console.log("Usage: bun run publish-projection.ts [--events <path>] [--out <path>]");
      process.exit(0);
    }
  }
  return { eventsPath, outPath };
}

// ---------------------------------------------------------------------------
// Event types (internal only — never leak into the output)
// ---------------------------------------------------------------------------

interface RawEvent {
  ts: string;
  session?: string;
  kind: string;
  node?: string;
  carrier?: string | null;
  // exit-specific
  outcome?: string;
  gates?: string[];
  // trend measurements (optional) — sanitised to the TREND_SERIES allowlist on read, never copied verbatim
  metrics?: Record<string, unknown>;
  // traverse-specific
  from?: string;
  to?: string;
  arc?: string;
  // ax aggregate object (optional) — sanitised to a numeric allowlist on read, never copied verbatim
  ax?: Record<string, unknown>;
}
// NOTE: deliberately NO index signature. A future `{...ev}` then becomes a type error
// rather than a silent leak — the output is constructed field-by-field from an allowlist.

// ---------------------------------------------------------------------------
// Projection types (these are the sanitized output types)
// ---------------------------------------------------------------------------

interface TransitionEntry {
  stage: string;
  at: string;
}

interface CarrierProjection {
  current_stage: string | null;
  transition_summary: TransitionEntry[];
}

interface NodeProjection {
  last_used: string | null;
  traversals_30d: number;
}

interface TrendPoint {
  at: string;
  value: number;
}

interface ConformanceProjection {
  // experience-contract gate tally — counts only, no gate strings echoed.
  experience_contract: { pass: number; fail: number };
}

interface PortalProjection {
  provenance: {
    commit: string;
    generated_at: string;
    generator_version: string;
  };
  carriers: Record<string, CarrierProjection>;
  nodes: Record<string, NodeProjection>;
  ax: Record<string, Record<string, unknown>>;
  // measurement trend series, keyed by closed series name (TREND_SERIES); each an
  // ordered list of {at, value} points. Empty object when no measurement events exist.
  trends: Record<string, TrendPoint[]>;
  // UX-conformance tallies derived from the closed-allowlist gate tokens.
  conformance: ConformanceProjection;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

function buildEmptySnapshot(commit: string, generatedAt: string): PortalProjection {
  return {
    provenance: { commit, generated_at: generatedAt, generator_version: GENERATOR_VERSION },
    carriers: {},
    nodes: {},
    ax: {},
    trends: {},
    conformance: { experience_contract: { pass: 0, fail: 0 } },
  };
}

/**
 * Parse the JSONL event log. Returns an array of raw events; skips malformed
 * lines with a warning.
 */
function parseEventLog(eventsFile: string): RawEvent[] {
  const text = fs.readFileSync(eventsFile, "utf8");
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const events: RawEvent[] = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      const ev = JSON.parse(lines[i]) as RawEvent;
      events.push(ev);
    } catch {
      console.warn(`  [WARN] Skipped malformed event on line ${i + 1}: ${lines[i].slice(0, 80)}`);
    }
  }
  return events;
}

/**
 * Derive the sanitized projection from raw events.
 *
 * SANITIZATION: we only extract:
 *   - ts (timestamp)
 *   - kind (to filter enter/exit)
 *   - node id
 *   - carrier id
 *   - ax aggregate object (if present — already aggregated, no raw body)
 *   - metrics object (if present — read by TREND_SERIES allowlist, finite-guarded)
 *   - the experience-contract gate token (counted only — pass/fail tally, no string echoed)
 * Nothing else is read from the event objects.
 */
function deriveProjection(
  events: RawEvent[],
  generatedAt: string,
  commit: string,
  stageOverrides: Record<string, string> = {}
): PortalProjection {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const now = new Date(generatedAt).getTime();

  // Per-carrier: ordered stage transitions (from enter events only).
  // NOTE (incremental loop, input-gated): when a node is shared across arcs, current_stage must
  // key by the (carrier id, carrier_kind, arc) triple — events now carry carrier_kind + arc — so a
  // carrier with events on two arcs cannot bleed. Implementing the triple key here and threading it
  // through the snapshot output + dashboard consumer is pending the first incremental-arc carrier
  // events (none exist yet); see carrier-interface.md + 06-analytics. Keyed by carrier id for now.
  const carrierTransitions = new Map<string, TransitionEntry[]>();

  // Per-node: last_used ts (as ms for comparison) and traversal timestamps within 30d
  const nodeLastUsedMs = new Map<string, number>();
  const nodeTraversals30d = new Map<string, number>();

  // Per-node: ax aggregates (from exit events if ax field present)
  const axAggregates = new Map<string, Record<string, unknown>>();

  // Per-series: ordered trend points (from exit events if a metrics measurement is present).
  // Keyed by closed series name (TREND_SERIES); values are finite-number-guarded.
  const trendPoints = new Map<string, TrendPoint[]>();

  // UX-conformance: pass/fail tally of the closed experience-contract gate token (counts only).
  const conformanceTally = { pass: 0, fail: 0 };

  for (const ev of events) {
    // Only process enter and exit events (gate/traverse are not used for projection)
    if (ev.kind !== "enter" && ev.kind !== "exit") continue;

    const nodeId = ev.node;
    const ts = ev.ts;

    if (!nodeId || !ts) {
      console.warn("  [WARN] Event missing node or ts — skipped.");
      continue;
    }
    // Sanitize ids — reject anything that isn't a bounded, metachar-free token (the ids are
    // emitted as JSON keys+values, so a free-text/secret/`</script>` id must never pass).
    // `ID_RE.test(x)` would coerce a non-string `x` via toString, so a node like ["secret"]
    // or carrier like 123 could pass and leak as a non-string key/value — require a string FIRST.
    if (typeof nodeId !== "string" || !ID_RE.test(nodeId)) {
      console.warn(`  [WARN] Non-conforming node id rejected (skipped).`);
      continue;
    }
    let carrierId: string | null = ev.carrier && ev.carrier !== "null" ? ev.carrier : null;
    if (carrierId !== null && (typeof carrierId !== "string" || !ID_RE.test(carrierId))) {
      console.warn(`  [WARN] Non-conforming carrier id rejected (carrier dropped on this event).`);
      carrierId = null;
    }

    // Validate timestamp — STRICT UTC ISO-8601 first (a non-string or free-text/comment-bearing
    // ts must never reach the output via transition_summary[].at / trends[].at).
    if (typeof ts !== "string" || !ISO_UTC_RE.test(ts)) {
      console.warn(`  [WARN] Non-ISO-8601 timestamp rejected — skipped.`);
      continue;
    }
    const tsMs = new Date(ts).getTime();
    if (isNaN(tsMs)) {
      console.warn(`  [WARN] Unparseable timestamp rejected — skipped.`);
      continue;
    }
    // From here on use ONLY the normalized timestamp — never the raw `ts` — when carrying a
    // timestamp into the projection output.
    const tsIso = new Date(tsMs).toISOString();
    // Reject future timestamps — they would spoof last_used and inflate traversals_30d.
    if (tsMs > now) {
      console.warn(`  [WARN] Future timestamp rejected — skipped.`);
      continue;
    }

    if (ev.kind === "enter") {
      // Node tracking
      const prev = nodeLastUsedMs.get(nodeId) ?? -Infinity;
      if (tsMs > prev) nodeLastUsedMs.set(nodeId, tsMs);

      const within30d = now - tsMs <= thirtyDaysMs;
      if (within30d) {
        nodeTraversals30d.set(nodeId, (nodeTraversals30d.get(nodeId) ?? 0) + 1);
      }

      // Carrier stage transition — a carrier's "stage" is the node it entered
      if (carrierId) {
        const list = carrierTransitions.get(carrierId) ?? [];
        list.push({ stage: nodeId, at: tsIso });
        carrierTransitions.set(carrierId, list);
      }
    }

    if (ev.kind === "exit") {
      // AX aggregates — extract ONLY the numeric allowlist; NEVER spread the ax object
      // (it could carry secrets/free-text). Anything non-numeric or not allowlisted is dropped.
      if (ev.ax && typeof ev.ax === "object" && !Array.isArray(ev.ax)) {
        const src = ev.ax as Record<string, unknown>;
        const existing = (axAggregates.get(nodeId) ?? {}) as Record<string, number>;
        for (const k of AX_NUMERIC_KEYS) {
          const v = src[k];
          if (typeof v === "number" && Number.isFinite(v)) existing[k] = v;
        }
        if (Object.keys(existing).length > 0) axAggregates.set(nodeId, existing);
      }

      // Trend measurements — read ONLY the closed series allowlist from `metrics`; NEVER spread
      // the object. Each accepted value is a finite number appended as a {at, value} point. A
      // non-numeric or unknown-series measurement is dropped (same discipline as ax).
      if (ev.metrics && typeof ev.metrics === "object" && !Array.isArray(ev.metrics)) {
        const src = ev.metrics as Record<string, unknown>;
        for (const series of TREND_SERIES) {
          const v = src[series];
          if (typeof v === "number" && Number.isFinite(v)) {
            const list = trendPoints.get(series) ?? [];
            list.push({ at: tsIso, value: v });
            trendPoints.set(series, list);
          }
        }
      }

      // UX-conformance — tally ONLY the closed experience-contract gate token. We match the
      // token shape exactly (`experience-contract:pass` / `:fail`) and increment a counter; the
      // gate string itself is never read into the output. All other gate names are ignored
      // (they may carry private decision names — the sanitization contract).
      if (Array.isArray(ev.gates)) {
        for (const g of ev.gates) {
          if (g === `${EXPERIENCE_CONTRACT_GATE}:pass`) conformanceTally.pass++;
          else if (g === `${EXPERIENCE_CONTRACT_GATE}:fail`) conformanceTally.fail++;
        }
      }
    }
  }

  // Build carriers output
  const carriers: Record<string, CarrierProjection> = {};
  for (const [carrierId, transitions] of carrierTransitions) {
    // current_stage: honor stage_override if present; otherwise latest enter
    let current_stage: string | null = transitions.length > 0
      ? transitions[transitions.length - 1].stage
      : null;
    if (stageOverrides[carrierId]) {
      current_stage = stageOverrides[carrierId];
    }
    carriers[carrierId] = {
      current_stage,
      transition_summary: transitions,
    };
  }

  // Build nodes output
  const nodes: Record<string, NodeProjection> = {};
  const allNodes = new Set([...nodeLastUsedMs.keys(), ...nodeTraversals30d.keys()]);
  for (const nodeId of allNodes) {
    const lastUsedMs = nodeLastUsedMs.get(nodeId);
    const last_used = lastUsedMs !== undefined
      ? new Date(lastUsedMs).toISOString()
      : null;
    nodes[nodeId] = {
      last_used,
      traversals_30d: nodeTraversals30d.get(nodeId) ?? 0,
    };
  }

  // Build ax output
  const ax: Record<string, Record<string, unknown>> = {};
  for (const [nodeId, agg] of axAggregates) {
    ax[nodeId] = agg;
  }

  // Build trends output — ordered by time per series so the renderer reads a clean slope.
  const trends: Record<string, TrendPoint[]> = {};
  for (const [series, points] of trendPoints) {
    trends[series] = points.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }

  return {
    provenance: {
      commit,
      generated_at: generatedAt,
      generator_version: GENERATOR_VERSION,
    },
    carriers,
    nodes,
    ax,
    trends,
    conformance: { experience_contract: { pass: conformanceTally.pass, fail: conformanceTally.fail } },
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const { eventsPath: argEvents, outPath: argOut } = parseArgs();

  const root = repoRoot();
  const commit = gitHead(root);
  const generatedAt = new Date().toISOString();

  // Resolve events path
  const eventsDir = process.env["STACK_GRAPH_EVENTS_DIR"] ?? path.join(root, ".stack-graph");
  const eventsFile = argEvents ?? path.join(eventsDir, "events.jsonl");

  // Resolve output path
  const defaultOut = path.join(root, "workspace", "dist", "portal-projection.json");
  const outFile = argOut ?? process.env["STACK_GRAPH_OUT"] ?? defaultOut;

  console.log("publish-projection  v" + GENERATOR_VERSION);
  console.log("  commit     :", commit);
  console.log("  generated  :", generatedAt);
  console.log("  events     :", eventsFile);
  console.log("  output     :", outFile);
  console.log("");

  let snapshot: PortalProjection;

  if (!fs.existsSync(eventsFile)) {
    console.log("  [INFO] Event log not found — emitting empty snapshot.");
    console.log("         Path checked:", eventsFile);
    snapshot = buildEmptySnapshot(commit, generatedAt);
  } else {
    const events = parseEventLog(eventsFile);
    if (events.length === 0) {
      console.log("  [INFO] Event log exists but contains no valid events — emitting empty snapshot.");
      snapshot = buildEmptySnapshot(commit, generatedAt);
    } else {
      console.log("  [INFO] Processing", events.length, "events...");
      snapshot = deriveProjection(events, generatedAt, commit);
      console.log("  [INFO] Carriers found   :", Object.keys(snapshot.carriers).length);
      console.log("  [INFO] Nodes found      :", Object.keys(snapshot.nodes).length);
      console.log("  [INFO] AX nodes found   :", Object.keys(snapshot.ax).length);
      console.log("  [INFO] Trend series     :", Object.keys(snapshot.trends).length);
      console.log("  [INFO] Conformance      :", `${snapshot.conformance.experience_contract.pass} pass / ${snapshot.conformance.experience_contract.fail} fail`);
    }
  }

  // Ensure output directory exists
  const outDir = path.dirname(outFile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log("\n  [OK] Written:", outFile);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
