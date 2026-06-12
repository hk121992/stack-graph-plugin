// schema.ts — shared types, parsed-transcript shape, and the canonical row-ordering /
// serialisation the analyzer derivations all produce against (Cluster A §3, §9).
//
// Kept as a thin types+constants module so the derive-* modules and analyze.ts share one definition
// without a circular import (analyze.ts imports the derivers; the derivers import only this).
//
// PORTABILITY: pure types + small pure functions, no fs/Bun globals.

/** The analyzer's event-schema version. The publisher version-gates on the major-0 band; the spec
 *  (§3 schemas) pins this to 0.5.0. */
export const ANALYZER_EVENT_V = "0.5.0";

// ── Locality allowlists (mirror publish-projection.ts; the analyzer produces TO them, the publisher
//    enforces them as the second line of defence, §9). ──────────────────────────────────────────

/** Ids are emitted as JSON keys and values → bounded, metachar-free tokens only. Matches the
 *  publisher's ID_RE exactly. */
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Model ids — same bounded grammar as ID_RE (publisher MODEL_RE). */
export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Strict UTC ISO-8601 instant (publisher ISO_UTC_RE). The analyzer normalises every emitted ts to
 *  `new Date(ms).toISOString()`, which is always strict-UTC, so emitted rows pass by construction. */
export const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Closed carrier-kind / arc value allowlists (publisher CARRIER_KINDS / ARCS). Attribution that
 *  does not resolve to one of these degrades to null — never a wrong attribution (§3.5). */
export const CARRIER_KINDS = new Set(["work-item", "standalone-iu"]);
export const ARCS = new Set(["dev-sprint", "incremental"]);

/** Layer-2 model-authored verdict allowlists (§7) — mirror the publisher's TREND_SERIES /
 *  EXPERIENCE_CONTRACT_GATE. These gate the SHAPE of a `<sg-signal>` block, never the truth of the
 *  value: a model-authored number/verdict is exactly as trustworthy as the model that wrote it. Keep
 *  in lockstep with publish-projection.ts (TREND_SERIES, EXPERIENCE_CONTRACT_GATE). */
export const TREND_SERIES = new Set(["benchmark.perf", "health.quality"]);
export const EXPERIENCE_CONTRACT_GATE = "experience-contract";
/** A well-formed experience-contract gate token: `experience-contract:<pass|fail>`. */
export const EXPERIENCE_CONTRACT_GATE_RE = /^experience-contract:(pass|fail)$/;

// ── Parsed transcript ───────────────────────────────────────────────────────────────────────────

/** One parsed JSONL entry (only the fields the analyzer reads; the rest are ignored). */
export interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string | null;
  gitBranch?: string | null;
  slug?: string | null;
  uuid?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  attributionSkill?: string | null;
  permissionMode?: string | null;
  permissionDecision?: string | null;
  permissionDecisionReason?: string | null;
  message?: Record<string, unknown>;
}

/** Per-transcript metadata derived once during the walk and shared with every deriver. */
export interface TranscriptMeta {
  /** Absolute path to the transcript file. */
  path: string;
  /** The session id (from entries, falling back to the filename stem). */
  sessionId: string;
  /** True when this is a `<session>/subagents/agent-*.jsonl` dispatched-session transcript. */
  isSubagent: boolean;
  /** The first / last timestamps seen (strict-UTC normalised), or null if none. */
  firstTs: string | null;
  lastTs: string | null;
  /** Session-level fallback-attribution signals (first non-null seen). */
  gitBranch: string | null;
  cwd: string | null;
}

// ── Attribution ───────────────────────────────────────────────────────────────────────────────

/** The resolved (carrier, carrier_kind, arc) triple plus the IU id. Every field is null when it
 *  cannot be resolved — never guessed (§3.5). */
export interface AttributionTriple {
  carrier: string | null;
  carrier_kind: string | null;
  arc: string | null;
  iu: string | null;
}

export const NULL_ATTRIBUTION: AttributionTriple = { carrier: null, carrier_kind: null, arc: null, iu: null };

// ── Derived row shapes (Cluster A §3) ───────────────────────────────────────────────────────────

export interface UsageRow {
  ts: string;
  kind: "unit-usage" | "session-usage" | "dispatch-usage";
  scope_id: string;
  session: string;
  carrier: string | null;
  carrier_kind: string | null;
  arc: string | null;
  model: string;
  cumulative: false;
  token_usage: {
    input: number;
    output: number;
    cache_creation_5m: number;
    cache_creation_1h: number;
    cache_read: number;
    total: number;
  };
  v: string;
}

export interface FrictionRow {
  ts: string;
  kind: "friction-record";
  session: string;
  permission_denials: number;
  rejected_calls: number;
  tool_errors: number;
  permission_decisions: { allow: number; deny: number; ask: number };
  permission_mode: string;
  v: string;
}

export interface StallRow {
  ts: string;
  kind: "stall-record";
  gap_ms: number;
  before_node: string | null;
  after_node: string | null;
  session_before: string;
  session_after: string;
  v: string;
}

export interface ActivityRow {
  ts: string;
  kind: "enter" | "exit";
  node: string;
  session: string;
  carrier: string | null;
  carrier_kind: string | null;
  arc: string | null;
  outcome: string | null;
  gates: string[];
  /** Layer-2 model-authored trend measurements (§7), read off the node's `<sg-signal>` block and
   *  validated against TREND_SERIES. Omitted when the node emitted no valid metric (the publisher's
   *  exit-event `metrics` path is allowlist-gated regardless). */
  metrics?: Record<string, number>;
  v: string;
}

/** The union of every derived row kind. */
export type DerivedRow = UsageRow | FrictionRow | StallRow | ActivityRow;

// ── Canonical ordering + serialisation (§9 idempotency) ─────────────────────────────────────────

/** Stable sort key for a row: (ts, session, kind). The analyzer FULL-REWRITES the output file in
 *  this order every run, so a re-run with no new activity yields a byte-identical file. Rows without
 *  a session field (stalls) use session_before as the session component. */
function rowSession(row: DerivedRow): string {
  if (row.kind === "stall-record") return row.session_before;
  return row.session;
}

/** Compare two rows for the canonical (ts, session, kind) order; a final tiebreak on the full
 *  JSON serialisation guarantees a TOTAL order (no two distinct rows ever compare equal), so the
 *  sort is deterministic regardless of input order. */
export function compareRows(a: DerivedRow, b: DerivedRow): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  const sa = rowSession(a);
  const sb = rowSession(b);
  if (sa !== sb) return sa < sb ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  return ja < jb ? -1 : ja > jb ? 1 : 0;
}

/** Serialise rows into the canonical JSONL body (sorted, one row per line, trailing newline). Pure:
 *  same rows in ⇒ byte-identical string out. */
export function serializeRows(rows: DerivedRow[]): string {
  const sorted = [...rows].sort(compareRows);
  return sorted.map((r) => JSON.stringify(r)).join("\n") + (sorted.length > 0 ? "\n" : "");
}

/** Normalise an arbitrary timestamp to a strict-UTC ISO instant, or null if it is not a valid date.
 *  Everything emitted by the analyzer passes through here so emitted ts always satisfies ISO_UTC_RE. */
export function normalizeTs(ts: unknown): string | null {
  if (typeof ts !== "string" || ts === "") return null;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}
