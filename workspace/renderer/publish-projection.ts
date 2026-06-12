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
 *     ts            — ISO-8601 UTC timestamp  (e.g. "2026-06-02T10:00:00Z")
 *     session       — session identifier string
 *     kind          — "enter" | "exit" | "gate" | "traverse" | "dispatch-complete"
 *     node          — node id string  (present on enter/exit/gate; omit on traverse)
 *     carrier       — carrier id string, or null if no carrier is active
 *     carrier_kind  — "work-item" | "standalone-iu" | null  (instrumentation-preamble v0.2.0+)
 *     arc           — arc id string (e.g. "dev-sprint" | "incremental") | null  (preamble v0.2.0+)
 *
 *   THE PROJECTION TRIPLE-KEY: a carrier's current_stage keys by the FULL triple
 *     (carrier_id, carrier_kind, arc) — NOT carrier id alone. build/review/land are shared
 *     across the dev-sprint and incremental arcs, so keying by carrier id alone would let one
 *     arc's stage bleed into another's at a shared node (carrier-interface.md "The projection
 *     key"; 06-analytics). Legacy enter events missing carrier_kind or arc are EXCLUDED from
 *     the stage projection (degrade, never guess — matching the publisher's strictness posture).
 *
 *   Additional fields on "exit" events (from instrumentation-preamble.md):
 *     outcome  — short outcome label string (e.g. "intent-settled")
 *     gates    — array of gate strings (e.g. ["commit-to-build:pass"])
 *     metrics  — optional object of named trend measurements (e.g. {"benchmark.perf": 1234});
 *                only present on measurement-bearing exit events
 *
 *   "dispatch-complete" events (06-analytics; loop-runner): a STRUCTURAL subagent-completion
 *     event (carrier + outcome). After D69 the body emits NO token numbers on it — cost rides the
 *     hook usage events below — so the publisher only enforces the fabrication guard on its metrics.
 *
 *   HOOK usage events "unit-usage" / "session-usage" / "dispatch-usage" (D69 / #21):
 *     The ONLY source of token cost. Each carries a 6-component `token_usage` block (input, output,
 *     cache_creation_5m, cache_creation_1h, cache_read, total — the cache split preserved), a
 *     dominant `model`, a per-event `v` (version-gated), `cumulative`, and a `scope_id`
 *     (iu id / anonymised session / carrier id). Read by the closed USAGE_COMPONENT_KEYS allowlist;
 *     latest-per (kind, scope) for cumulative kinds. NEVER advances current_stage.
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
 *   carrier_kind, arc (the last two validated against closed value allowlists), the ax aggregate
 *   object, the metrics measurement object (TREND_SERIES allowlist), the hook usage block
 *   (USAGE_COMPONENT_KEYS allowlist + a grammar-validated model + a version-gated `v`), and —
 *   for conformance only — a COUNT of the closed-allowlist experience-contract gate token (never
 *   the gate string itself). A raw session id is NEVER echoed (session-usage scope is anonymised to
 *   `sess-<n>`). It never reads, copies, or echoes:
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

// 0.3.0 (D69 / #21) — cost comes from HOOK-captured usage events (unit-usage / session-usage /
// dispatch-usage), each carrying a 6-component token_usage block (cache split preserved). The old
// model-authored tokens_per_session on dispatch-complete is REJECTED (fabrication guard, design §4).
// Adds a per-event version gate, latest-per-scope cumulative handling, and an instrumentation-health
// reconciliation block. 0.2.0 — carrier projection keyed by the (carrier_id, carrier_kind, arc) triple.
const GENERATOR_VERSION = "0.3.0";

// The event-schema version this publisher is built for, kept SEPARATE from the generator version
// (design §9). Usage events carry a per-event `v`; an event whose major band differs is dropped and
// flagged so the renderer's version banner can prescribe the re-vendor fix. The compatible band is
// "0.x" (major 0) — every D-series event so far. Legacy v-less enter/exit are accepted (degraded).
const EVENT_SCHEMA_VERSION = "0.4.0";
const COMPATIBLE_EVENT_RANGE = "0.x";

/** A usage event's `v` is compatible iff it is a semver-shaped string in the major-0 band. */
function eventVersionCompatible(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return !!m && m[1] === "0";
}

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

// HOOK-captured token usage (D69 / #21, design §2/§4). The three usage event kinds the plugin
// hooks append; each carries a 6-component `token_usage` block. These are the ONLY source of cost —
// the model never authors token numbers (the rejection below closes that channel).
const USAGE_KINDS = new Set(["unit-usage", "session-usage", "dispatch-usage"]);

// The closed 6-component token_usage allowlist (matches lib/transcript-usage.ts UsageComponents).
// Read value-by-value with a finite + non-negative guard; any bad/missing component drops the whole
// point (a cost figure must be trustworthy or absent). The block is NEVER spread verbatim.
const USAGE_COMPONENT_KEYS = [
  "input", "output", "cache_creation_5m", "cache_creation_1h", "cache_read", "total",
] as const;

// ANALYZER-derived process-cost events (Cluster A §3.2/§3.3, #28). The analyzer emits per-session
// friction-record + cross-session stall-record rows; the publisher reads them on an ADDITIVE path
// (parallel to USAGE_KINDS) and surfaces a Process-cost block. These carry ONLY categorised
// counts/enums + bounded ids/ts — never the raw denial command / rejection reason (those stay in the
// analyzer's local log; §3.2 no-free-text rule).
const FRICTION_KINDS = new Set(["friction-record", "stall-record"]);

// The closed numeric allowlist for a friction-record (parallel to USAGE_COMPONENT_KEYS). Each is read
// value-by-value with a finite + non-negative integer guard; a bad value drops THAT field (degrade to
// 0), never the whole row — a friction count is independently meaningful. The permission_decisions
// sub-object + permission_mode enum are read separately below. NEVER spread the row verbatim.
// Keep in lockstep with build-analytics.ts FRICTION_KEYS and docs/workspace-portal-design.md.
const FRICTION_KEYS = [
  "permission_denials", "rejected_calls", "tool_errors",
] as const;

// The closed permission-mode enum — a friction-record's permission_mode is echoed into the snapshot
// (it is a render value), so it is a locality boundary: only these known modes pass, anything else
// (incl. a smuggled free-text mode) renders as "" (dropped, never echoed).
const PERMISSION_MODES = new Set(["auto", "default", "plan", "acceptEdits", "bypassPermissions"]);

// FABRICATION GUARD (design §4): the model body emits only STRUCTURAL events (unit-complete /
// dispatch-complete / exit) — never token numbers. A `tokens_per_*` / `token_usage` key arriving in a
// model-authored `metrics` object is REJECTED (dropped + counted) so the 25× cache-blind fabrication
// cannot re-enter through a stale node body. Cost rides ONLY the hook usage events above.
const BANNED_METRIC_TOKEN_KEYS = [
  "tokens_per_iu", "tokens_per_session", "token_usage", "tokens_total",
] as const;

// Model ids are emitted as values in session_costs, so they are a locality boundary — validate
// against a bounded token grammar (same shape as ID_RE); a non-conforming model renders "unknown".
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// UX-conformance: the ONLY gate token the publisher inspects. It is a closed-allowlist token,
// matched exactly; the publisher surfaces only the pass/fail TALLY, never the gate string. All
// other (free-text) gate names are ignored — they may carry private decision names.
const EXPERIENCE_CONTRACT_GATE = "experience-contract";

// Closed value allowlists for the carrier-triple discriminators. Both are emitted into the
// snapshot (as CarrierProjection / SessionCostPoint values), so they are a locality boundary —
// validated against a closed set, never echoed free-form. carrier_kind / arc per the
// instrumentation-preamble (v0.2.0) + carrier-interface.md "The projection key".
const CARRIER_KINDS = new Set(["work-item", "standalone-iu"]);
const ARCS = new Set(["dev-sprint", "incremental"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an event's full carrier triple (carrier_id, carrier_kind, arc) for the projection
 * key. Returns null when any element is missing or non-conforming — a LEGACY event (preamble
 * < v0.2.0, no carrier_kind / arc) or a hostile event is EXCLUDED from the stage projection
 * (degrade, never guess), matching the publisher's strictness posture (id-grammar, closed
 * value allowlists). carrier_id must match ID_RE; carrier_kind / arc must be in their closed
 * allowlists (also defends against non-string coercion and free-text leak via the value channel).
 */
function resolveTriple(ev: RawEvent): { carrier_id: string; carrier_kind: string; arc: string } | null {
  const cid = ev.carrier;
  const kind = ev.carrier_kind;
  const arc = ev.arc;
  if (typeof cid !== "string" || cid === "null" || !ID_RE.test(cid)) return null;
  if (typeof kind !== "string" || !CARRIER_KINDS.has(kind)) return null;
  if (typeof arc !== "string" || !ARCS.has(arc)) return null;
  return { carrier_id: cid, carrier_kind: kind, arc };
}

function repoRoot(): string {
  const start = path.dirname(new URL(import.meta.url).pathname);
  // Worktree-correct resolution (design §11). In a linked git worktree, `.git` is a FILE pointing
  // at <main>/.git/worktrees/<name>, and the per-worktree checkout is NOT where the shared
  // `.stack-graph/` org-root event log lives. `git rev-parse --git-common-dir` resolves to the MAIN
  // `.git` from anywhere (a worktree or a normal checkout); its parent is the org root. The bound
  // SG_EVENT_LOG / STACK_GRAPH_EVENTS_DIR (set by harness-init) always wins over this default; this
  // only fixes the fallback path so a worktree run does not silently read a worktree-local log.
  try {
    const commonDir = execSync("git rev-parse --git-common-dir", { cwd: start, encoding: "utf8" }).trim();
    if (commonDir) {
      const abs = path.isAbsolute(commonDir) ? commonDir : path.resolve(start, commonDir);
      return path.dirname(abs);
    }
  } catch {
    // git unavailable — fall through to the directory walk.
  }
  // Fallback: walk up until a `.git` entry (file OR dir) is found.
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate repo root (no .git found above " + start + ")");
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
  // carrier-shape discriminator + traversal arc (instrumentation-preamble v0.2.0+).
  // Part of the projection triple-key (carrier, carrier_kind, arc). Legacy events omit them —
  // the stage projection EXCLUDES such events (degrade, never guess).
  carrier_kind?: string | null;
  // exit-specific
  outcome?: string;
  gates?: string[];
  // trend measurements (optional) — sanitised to the TREND_SERIES allowlist on read, never copied
  // verbatim; a banned token key here (model-authored fabrication) is rejected + counted.
  metrics?: Record<string, unknown>;
  // traverse-specific
  from?: string;
  to?: string;
  arc?: string;
  // ax aggregate object (optional) — sanitised to a numeric allowlist on read, never copied verbatim
  ax?: Record<string, unknown>;
  // hook-captured usage events (D69 / #21) — unit-usage / session-usage / dispatch-usage. token_usage
  // is read by the closed 6-component allowlist; the rest are sanitised on read (model→grammar,
  // scope→ID_RE or session-anonymised, v→version gate). NEVER spread verbatim.
  token_usage?: Record<string, unknown>;
  scope_id?: string;
  model?: string;
  cumulative?: boolean;
  agent_id?: string;
  iu?: string;
  v?: string;
  // analyzer-derived process-cost fields (friction-record / stall-record, §3.2/§3.3). Read by the
  // FRICTION_KEYS numeric allowlist + the permission-decision sub-object + the permission-mode enum;
  // stall fields are bounded ids + a numeric gap. NEVER spread verbatim.
  permission_denials?: unknown;
  rejected_calls?: unknown;
  tool_errors?: unknown;
  permission_decisions?: unknown;
  permission_mode?: unknown;
  gap_ms?: unknown;
  before_node?: unknown;
  after_node?: unknown;
  session_before?: unknown;
  session_after?: unknown;
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
  // The triple-key components (carrier-interface.md "The projection key"). current_stage and
  // transition_summary are computed from ONLY the events matching this full triple, so a carrier
  // traversing a shared node (build/review/land) on one arc never bleeds stage into another arc.
  carrier_id: string;
  carrier_kind: string;
  arc: string;
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

/** The 6 disjoint token categories + their sum (mirrors lib/transcript-usage.ts UsageComponents).
 *  The cache split is preserved so the renderer prices cache writes/reads at their real multipliers
 *  (the 25×-error fix); by_model is deliberately NOT carried (kept off the event line, design §2). */
interface UsagePoint {
  input: number;
  output: number;
  cache_creation_5m: number;
  cache_creation_1h: number;
  cache_read: number;
  total: number;
}

interface SessionCostPoint {
  at: string;
  // which hook captured it: unit-usage (per-IU) / session-usage (per-session) / dispatch-usage (per
  // arc-dispatch). Drives how the renderer groups and how reconciliation pairs children to parents.
  kind: "unit-usage" | "session-usage" | "dispatch-usage";
  // the scope this cost belongs to — an IU id (unit-usage), an ANONYMISED session label
  // (session-usage; the raw session id is private and never echoed), or a carrier id (dispatch-usage).
  scope_id: string;
  // the carrier triple when present (null on a non-carrier session-usage). Sanitised allowlists.
  carrier_id: string | null;
  carrier_kind: string | null;
  arc: string | null;
  // dominant model of the scope, for rate selection at render (grammar-validated; "unknown" otherwise).
  model: string;
  // session-usage / dispatch-usage are cumulative (Stop fires per-turn) → the publisher keeps the
  // LATEST per (kind, scope) so a growing per-turn total is never double-counted.
  cumulative: boolean;
  usage: UsagePoint;
}

/** Analyzer-derived process cost (Cluster A §3.2/§3.3): a per-session friction summary and the
 *  cross-session stalls. Categorised counts + bounded enums/ids only — never the raw denial command or
 *  rejection reason (those stay in the analyzer's local, gitignored log). The session id is ANONYMISED
 *  exactly as session-usage (the raw id is private and never echoed). */
interface ProcessCostPoint {
  at: string;
  session_label: string; // anonymised label (sess-<n>), never the raw session id
  permission_denials: number;
  rejected_calls: number;
  tool_errors: number;
  permission_decisions: { allow: number; deny: number; ask: number };
  permission_mode: string; // closed enum or "" (a non-allowlisted/free-text mode is dropped)
}

interface StallPoint {
  at: string;
  gap_ms: number;
  before_node: string | null; // ID_RE-clean graph node id or null
  after_node: string | null;
  session_before: string; // anonymised
  session_after: string; // anonymised
}

/** The Process-cost projection: per-session friction + the cross-session stalls. Empty arrays when no
 *  friction/stall events exist (the renderer shows a degraded "analyzer not yet run" state). */
interface ProcessCosts {
  friction: ProcessCostPoint[];
  stalls: StallPoint[];
}

/** Instrumentation-health reconciliation (design §7) — coverage + inequality, the tripwire that would
 *  have caught the 25× gap. Σ(child unit usage per carrier) ≤ that carrier's dispatch/session usage;
 *  missing-child / missing-parent / version / fabrication-rejection states are surfaced as notes. */
interface Reconciliation {
  unit_usage: number;
  session_usage: number;
  dispatch_usage: number;
  measured_iu_total: number;
  session_total: number;
  // Σchild ≤ parent + tolerance across carriers where both sides exist; null when not checkable.
  inequality_ok: boolean | null;
  instrumentation_errors: number;
  rejected_model_token_keys: number;
  version_incompatible_events: number;
  notes: string[];
}

interface PortalProjection {
  provenance: {
    commit: string;
    generated_at: string;
    generator_version: string;
    // event-schema version + compatible band (design §9), kept separate from generator_version so the
    // renderer banner can name BOTH and prescribe the re-vendor fix on a mismatch.
    event_schema_version: string;
    compatible_event_range: string;
    // the distinct per-event `v` values actually observed in this log (sorted); empty when none.
    observed_event_versions: string[];
  };
  carriers: Record<string, CarrierProjection>;
  nodes: Record<string, NodeProjection>;
  ax: Record<string, Record<string, unknown>>;
  // measurement trend series, keyed by closed series name (TREND_SERIES); each an
  // ordered list of {at, value} points. Empty object when no measurement events exist.
  trends: Record<string, TrendPoint[]>;
  // UX-conformance tallies derived from the closed-allowlist gate tokens.
  conformance: ConformanceProjection;
  // Per-scope token cost from the HOOK usage events (06-analytics "Per-session cost"; D69). One point
  // per (kind, scope), latest-per-scope for cumulative kinds. NEVER advances current_stage. Empty
  // when no usage events exist.
  session_costs: SessionCostPoint[];
  // Analyzer-derived process cost (Cluster A §3.2/§3.3): per-session friction + cross-session stalls.
  // Empty arrays when no friction/stall events exist. Parallel to session_costs.
  process_costs: ProcessCosts;
  // Instrumentation-health reconciliation (coverage + inequality + health states).
  reconciliation: Reconciliation;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

function emptyProvenance(commit: string, generatedAt: string, observed: string[] = []) {
  return {
    commit,
    generated_at: generatedAt,
    generator_version: GENERATOR_VERSION,
    event_schema_version: EVENT_SCHEMA_VERSION,
    compatible_event_range: COMPATIBLE_EVENT_RANGE,
    observed_event_versions: observed,
  };
}

function emptyReconciliation(): Reconciliation {
  return {
    unit_usage: 0, session_usage: 0, dispatch_usage: 0,
    measured_iu_total: 0, session_total: 0,
    inequality_ok: null, instrumentation_errors: 0,
    rejected_model_token_keys: 0, version_incompatible_events: 0, notes: [],
  };
}

function buildEmptySnapshot(commit: string, generatedAt: string): PortalProjection {
  return {
    provenance: emptyProvenance(commit, generatedAt),
    carriers: {},
    nodes: {},
    ax: {},
    trends: {},
    conformance: { experience_contract: { pass: 0, fail: 0 } },
    session_costs: [],
    process_costs: { friction: [], stalls: [] },
    reconciliation: emptyReconciliation(),
  };
}

/** Count model-authored token keys present in a `metrics` object (the fabrication guard). */
function countBannedTokenKeys(metrics: unknown): number {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return 0;
  const src = metrics as Record<string, unknown>;
  let n = 0;
  for (const k of BANNED_METRIC_TOKEN_KEYS) if (k in src) n++;
  return n;
}

/** Read the 6-component token_usage block by the closed allowlist. Any missing/non-finite/negative
 *  component drops the whole point (a cost figure is trustworthy or absent). Never spreads verbatim. */
function readUsageBlock(tu: unknown): UsagePoint | null {
  if (!tu || typeof tu !== "object" || Array.isArray(tu)) return null;
  const src = tu as Record<string, unknown>;
  const out = {} as Record<string, number>;
  for (const k of USAGE_COMPONENT_KEYS) {
    const v = src[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    out[k] = v;
  }
  return out as unknown as UsagePoint;
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

  // Per-carrier-TRIPLE: ordered stage transitions (from enter events only).
  // current_stage keys by the FULL (carrier_id, carrier_kind, arc) triple, not carrier id alone:
  // build/review/land are shared across the dev-sprint and incremental arcs, so carrier-id-only
  // keying would let one arc's stage bleed into another's at a shared node (carrier-interface.md
  // "The projection key"; 06-analytics). The map key is the composite triple; each value retains
  // its triple components so the output entry carries them. A legacy enter event missing
  // carrier_kind or arc is EXCLUDED from the stage projection (degrade, never guess — same
  // strictness posture as the id-grammar / ISO-ts / future-ts rejections).
  interface TripleTransitions { carrier_id: string; carrier_kind: string; arc: string; entries: TransitionEntry[]; }
  const carrierTransitions = new Map<string, TripleTransitions>();

  // HOOK-captured usage events (D69). Latest-per (kind, scope) so a cumulative per-turn total
  // (session-usage / dispatch-usage from a per-turn Stop) is never double-counted; unit-usage scopes
  // are distinct per IU so all are kept. Plus the instrumentation-health counters + the session-id
  // anonymiser (a raw session id is private and never echoed — session-usage scope is anonymised).
  const usageLatest = new Map<string, SessionCostPoint>();
  const sessionAnon = new Map<string, string>();
  // Analyzer-derived process cost (§3.2/§3.3). friction is per-session (latest-per anonymised session);
  // stalls accumulate (one per cross-session gap). Sanitised exactly as the usage path (ts/ID_RE/anon).
  const frictionLatest = new Map<string, ProcessCostPoint>();
  const stallPoints: StallPoint[] = [];
  let instrumentationErrors = 0;
  let rejectedModelTokenKeys = 0;
  let versionIncompatible = 0;
  const observedVersions = new Set<string>();
  const anonSession = (id: string): string => {
    let a = sessionAnon.get(id);
    if (!a) { a = `sess-${sessionAnon.size + 1}`; sessionAnon.set(id, a); }
    return a;
  };

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
    // ── instrumentation-error (loud-fail signal from a hook) — count for the degraded-state banner.
    if (ev.kind === "instrumentation-error") {
      instrumentationErrors++;
      if (typeof ev.v === "string") observedVersions.add(ev.v);
      continue;
    }

    // ── HOOK usage events (D69) — the ONLY source of token cost. Version-gated, ts-validated,
    //    token_usage read by the closed 6-component allowlist, model + scope sanitised. Latest-per
    //    (kind, scope) for cumulative kinds. NEVER advances current_stage.
    if (typeof ev.kind === "string" && USAGE_KINDS.has(ev.kind)) {
      if (typeof ev.v === "string") observedVersions.add(ev.v);
      if (!eventVersionCompatible(ev.v)) {
        versionIncompatible++;
        console.warn(`  [WARN] ${ev.kind} with incompatible/absent version \`${String(ev.v)}\` dropped (expected ${COMPATIBLE_EVENT_RANGE}).`);
        continue;
      }
      const uts = ev.ts;
      if (typeof uts !== "string" || !ISO_UTC_RE.test(uts)) { console.warn(`  [WARN] ${ev.kind} non-ISO-8601 ts — dropped.`); continue; }
      const uMs = new Date(uts).getTime();
      if (isNaN(uMs) || uMs > now) { console.warn(`  [WARN] ${ev.kind} unparseable/future ts — dropped.`); continue; }
      const uIso = new Date(uMs).toISOString();

      const usage = readUsageBlock(ev.token_usage);
      if (!usage) { console.warn(`  [WARN] ${ev.kind} with missing/invalid token_usage — dropped.`); continue; }

      const model = (typeof ev.model === "string" && MODEL_RE.test(ev.model)) ? ev.model : "unknown";
      const triple = resolveTriple(ev); // null when no/invalid carrier triple (session-usage may omit)

      // scope_id: session-usage is anonymised (raw session id is private); unit/dispatch-usage carry
      // an iu/carrier id that must pass ID_RE (else the point can't be safely attributed → dropped).
      let scope_id: string;
      if (ev.kind === "session-usage") {
        const sid = typeof ev.scope_id === "string" ? ev.scope_id : (typeof ev.session === "string" ? ev.session : "");
        scope_id = anonSession(sid || `anon-${usageLatest.size}`);
      } else {
        const raw = typeof ev.scope_id === "string" ? ev.scope_id : "";
        if (!ID_RE.test(raw)) { console.warn(`  [WARN] ${ev.kind} with non-conforming scope_id — dropped.`); continue; }
        scope_id = raw;
      }

      const point: SessionCostPoint = {
        at: uIso,
        kind: ev.kind as SessionCostPoint["kind"],
        scope_id,
        carrier_id: triple ? triple.carrier_id : null,
        carrier_kind: triple ? triple.carrier_kind : null,
        arc: triple ? triple.arc : null,
        model,
        cumulative: ev.cumulative === true,
        usage,
      };
      const key = `${point.kind}::${scope_id}`;
      const prior = usageLatest.get(key);
      if (!prior || new Date(point.at).getTime() >= new Date(prior.at).getTime()) usageLatest.set(key, point);
      continue;
    }

    // ── ANALYZER process-cost events (Cluster A §3.2/§3.3) — friction-record / stall-record. Additive
    //    read path, sanitised EXACTLY as the usage path: version-gated, ts-validated (strict UTC ISO,
    //    no future), counts read by a finite-non-negative-INTEGER guard (a bad value → 0, never echoed),
    //    permission_mode against a closed enum, node tags against ID_RE, session ANONYMISED. NEVER spread
    //    a row verbatim — a smuggled free-text command / non-ID node / free-text mode cannot ride through.
    if (typeof ev.kind === "string" && FRICTION_KINDS.has(ev.kind)) {
      if (typeof ev.v === "string") observedVersions.add(ev.v);
      if (!eventVersionCompatible(ev.v)) {
        versionIncompatible++;
        console.warn(`  [WARN] ${ev.kind} with incompatible/absent version \`${String(ev.v)}\` dropped (expected ${COMPATIBLE_EVENT_RANGE}).`);
        continue;
      }
      const fts = ev.ts;
      if (typeof fts !== "string" || !ISO_UTC_RE.test(fts)) { console.warn(`  [WARN] ${ev.kind} non-ISO-8601 ts — dropped.`); continue; }
      const fMs = new Date(fts).getTime();
      if (isNaN(fMs) || fMs > now) { console.warn(`  [WARN] ${ev.kind} unparseable/future ts — dropped.`); continue; }
      const fIso = new Date(fMs).toISOString();

      // A non-negative finite integer, else 0 — a count is independently meaningful, so a bad field
      // degrades that field rather than dropping the row. Never echoes a non-number.
      const readCount = (v: unknown): number =>
        typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
      // A bounded ID_RE-clean node tag, else null (a non-string or free-text tag is never echoed).
      const readNodeTag = (v: unknown): string | null =>
        typeof v === "string" && ID_RE.test(v) ? v : null;

      if (ev.kind === "friction-record") {
        // permission_decisions sub-object: read ONLY the three known keys, each count-guarded.
        const pd = ev.permission_decisions;
        const pdSrc = pd && typeof pd === "object" && !Array.isArray(pd) ? (pd as Record<string, unknown>) : {};
        // permission_mode: closed enum or "" (a smuggled free-text mode is dropped, never echoed).
        const mode = typeof ev.permission_mode === "string" && PERMISSION_MODES.has(ev.permission_mode)
          ? ev.permission_mode : "";
        const rawSess = typeof ev.session === "string" ? ev.session : (typeof ev.scope_id === "string" ? ev.scope_id : "");
        const fp: ProcessCostPoint = {
          at: fIso,
          session_label: anonSession(rawSess || `anon-${frictionLatest.size}`),
          permission_denials: readCount(ev.permission_denials),
          rejected_calls: readCount(ev.rejected_calls),
          tool_errors: readCount(ev.tool_errors),
          permission_decisions: {
            allow: readCount(pdSrc["allow"]),
            deny: readCount(pdSrc["deny"]),
            ask: readCount(pdSrc["ask"]),
          },
          permission_mode: mode,
        };
        // Latest-per anonymised session (the analyzer emits one settled friction-record per session,
        // but a re-publish over a re-run log is idempotent — keep the latest by ts).
        const prior = frictionLatest.get(fp.session_label);
        if (!prior || new Date(fp.at).getTime() >= new Date(prior.at).getTime()) frictionLatest.set(fp.session_label, fp);
        continue;
      }

      // stall-record — one per cross-session gap. gap_ms numeric-guarded; node tags ID_RE; sessions anon.
      const gap = ev.gap_ms;
      if (typeof gap !== "number" || !Number.isFinite(gap) || gap < 0) { console.warn(`  [WARN] stall-record with invalid gap_ms — dropped.`); continue; }
      const sb = typeof ev.session_before === "string" ? ev.session_before : "";
      const sa = typeof ev.session_after === "string" ? ev.session_after : "";
      stallPoints.push({
        at: fIso,
        gap_ms: Math.floor(gap),
        before_node: readNodeTag(ev.before_node),
        after_node: readNodeTag(ev.after_node),
        session_before: anonSession(sb || `anon-${frictionLatest.size}`),
        session_after: anonSession(sa || `anon-${frictionLatest.size}`),
      });
      continue;
    }

    // Process enter/exit (stage + measure projection) and dispatch-complete (structural-only now).
    // gate/traverse are not used for projection.
    if (ev.kind !== "enter" && ev.kind !== "exit" && ev.kind !== "dispatch-complete") continue;

    const ts = ev.ts;

    // dispatch-complete is now a STRUCTURAL-ONLY event (carrier + outcome) — the model body no
    // longer authors token numbers on it (design §4/§12). Cost rides the hook `dispatch-usage`
    // event handled above. Here we only enforce the FABRICATION GUARD: any model-authored
    // `tokens_per_*` / `token_usage` key still riding its `metrics` is rejected + counted (a stale
    // node body cannot re-introduce the 25× cache-blind figure). dispatch-complete never advances
    // current_stage, so once the guard runs there is nothing more to read.
    if (ev.kind === "dispatch-complete") {
      rejectedModelTokenKeys += countBannedTokenKeys(ev.metrics);
      continue;
    }

    const nodeId = ev.node;

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

      // Carrier stage transition — a carrier's "stage" is the node it entered. Keyed by the
      // FULL (carrier_id, carrier_kind, arc) triple so a shared node (build/review/land) on one
      // arc never bleeds stage into another arc. A legacy enter event that has a (conforming)
      // carrier id but is missing/non-conforming carrier_kind or arc resolves to null here and is
      // EXCLUDED from the stage projection (degrade, never guess) — it still counted toward node
      // usage above. (carrierId is validated separately above for the warn; resolveTriple re-checks.)
      if (carrierId) {
        const triple = resolveTriple(ev);
        if (triple) {
          const key = `${triple.carrier_id} ${triple.carrier_kind} ${triple.arc}`;
          const tt = carrierTransitions.get(key) ?? {
            carrier_id: triple.carrier_id, carrier_kind: triple.carrier_kind, arc: triple.arc, entries: [],
          };
          tt.entries.push({ stage: nodeId, at: tsIso });
          carrierTransitions.set(key, tt);
        } else {
          console.warn(`  [WARN] enter event with carrier but missing/non-conforming carrier_kind/arc — excluded from stage projection.`);
        }
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

      // FABRICATION GUARD — a model-authored exit must NOT carry token numbers; reject + count any
      // tokens_per_* / token_usage key on its metrics (design §4). Cost rides the hook usage events.
      rejectedModelTokenKeys += countBannedTokenKeys(ev.metrics);

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

  // Build carriers output. The output map is keyed by carrier_id for the dashboard consumer
  // (build-dashboard.ts looks up carriers[item.id]); current_stage / transition_summary are
  // computed per the FULL triple so no cross-arc bleed. The common case — a carrier id with a
  // single (kind, arc) — keys cleanly by carrier_id. If the SAME carrier id legitimately appears
  // under more than one triple (a carrier traversing two arcs), the first stays under the bare
  // carrier_id and the rest are suffixed `<id>::<arc>` so neither is silently dropped or collapsed.
  const carriers: Record<string, CarrierProjection> = {};
  for (const [, tt] of carrierTransitions) {
    // current_stage: honor stage_override (keyed by carrier_id) if present; otherwise latest enter
    let current_stage: string | null = tt.entries.length > 0
      ? tt.entries[tt.entries.length - 1].stage
      : null;
    if (stageOverrides[tt.carrier_id]) {
      current_stage = stageOverrides[tt.carrier_id];
    }
    const entry: CarrierProjection = {
      carrier_id: tt.carrier_id,
      carrier_kind: tt.carrier_kind,
      arc: tt.arc,
      current_stage,
      transition_summary: tt.entries,
    };
    const outKey = carriers[tt.carrier_id] === undefined ? tt.carrier_id : `${tt.carrier_id}::${tt.arc}`;
    carriers[outKey] = entry;
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

  // Session costs — latest-per-scope points, ordered by time so the cost read is a clean slope.
  const session_costs = [...usageLatest.values()].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Process costs (§3.2/§3.3) — per-session friction (latest-per anonymised session) + cross-session
  // stalls, each ordered by time for a clean render.
  const process_costs: ProcessCosts = {
    friction: [...frictionLatest.values()].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    stalls: stallPoints.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
  };

  // ── Reconciliation (instrumentation health, design §7): coverage + the Σchild ≤ parent inequality.
  const unitPoints = session_costs.filter((p) => p.kind === "unit-usage");
  const sessionPoints = session_costs.filter((p) => p.kind === "session-usage");
  const dispatchPoints = session_costs.filter((p) => p.kind === "dispatch-usage");
  const measured_iu_total = unitPoints.reduce((s, p) => s + p.usage.total, 0);
  const session_total = sessionPoints.reduce((s, p) => s + p.usage.total, 0);

  const notes: string[] = [];
  // Σ(unit children) per carrier vs that carrier's dispatch-usage parent.
  const unitByCarrier = new Map<string, number>();
  for (const u of unitPoints) if (u.carrier_id) unitByCarrier.set(u.carrier_id, (unitByCarrier.get(u.carrier_id) ?? 0) + u.usage.total);
  const dispatchByCarrier = new Map<string, number>();
  for (const d of dispatchPoints) if (d.carrier_id) dispatchByCarrier.set(d.carrier_id, d.usage.total);

  let inequality_ok: boolean | null = null;
  for (const [cid, childSum] of unitByCarrier) {
    const parent = dispatchByCarrier.get(cid);
    if (parent === undefined) {
      notes.push(`carrier ${cid}: ${childSum} tok of unit usage measured but no dispatch-usage parent (coverage gap)`);
      continue;
    }
    if (inequality_ok === null) inequality_ok = true;
    if (childSum > parent) {
      inequality_ok = false;
      notes.push(`carrier ${cid}: Σ child unit usage ${childSum} exceeds dispatch usage ${parent} (inequality breach)`);
    }
  }
  for (const d of dispatchPoints) {
    if (d.carrier_id && !unitByCarrier.has(d.carrier_id)) {
      notes.push(`carrier ${d.carrier_id}: dispatch-usage present but no unit-usage children measured`);
    }
  }
  if (instrumentationErrors > 0) notes.push(`${instrumentationErrors} instrumentation-error event(s) — a hook fired but failed (loud, never silent)`);
  if (versionIncompatible > 0) notes.push(`${versionIncompatible} usage event(s) dropped for version incompatibility — re-vendor the plugin`);
  if (rejectedModelTokenKeys > 0) notes.push(`${rejectedModelTokenKeys} model-authored token key(s) rejected (fabrication guard)`);

  const reconciliation: Reconciliation = {
    unit_usage: unitPoints.length,
    session_usage: sessionPoints.length,
    dispatch_usage: dispatchPoints.length,
    measured_iu_total,
    session_total,
    inequality_ok,
    instrumentation_errors: instrumentationErrors,
    rejected_model_token_keys: rejectedModelTokenKeys,
    version_incompatible_events: versionIncompatible,
    notes,
  };

  return {
    provenance: emptyProvenance(commit, generatedAt, [...observedVersions].sort()),
    carriers,
    nodes,
    ax,
    trends,
    conformance: { experience_contract: { pass: conformanceTally.pass, fail: conformanceTally.fail } },
    session_costs,
    process_costs,
    reconciliation,
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

  // Resolve events path. The default is the analyzer's derived output —
  // `.stack-graph/derived/analyzer-events.jsonl` (the A6c event-log migration, #28): the analyzer
  // writes that file, the publisher reads it. All three resolution paths converge on it — the
  // `STACK_GRAPH_EVENTS_DIR` default below, the `--events` flag (`argEvents`), and the bound
  // `SG_EVENT_LOG` the harness passes as `--events`.
  const eventsDir = process.env["STACK_GRAPH_EVENTS_DIR"] ?? path.join(root, ".stack-graph");
  const eventsFile = argEvents ?? path.join(eventsDir, "derived", "analyzer-events.jsonl");

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
      console.log("  [INFO] Cost points      :", snapshot.session_costs.length,
        `(${snapshot.reconciliation.unit_usage} unit / ${snapshot.reconciliation.session_usage} session / ${snapshot.reconciliation.dispatch_usage} dispatch)`);
      if (snapshot.reconciliation.instrumentation_errors > 0)
        console.log("  [WARN] Instrumentation errors:", snapshot.reconciliation.instrumentation_errors, "(hook fired but failed)");
      if (snapshot.reconciliation.rejected_model_token_keys > 0)
        console.log("  [WARN] Rejected model token keys:", snapshot.reconciliation.rejected_model_token_keys, "(fabrication guard)");
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
