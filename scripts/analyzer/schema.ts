// schema.ts — shared types, parsed-transcript shape, and the canonical row-ordering /
// serialisation the analyzer derivations all produce against (Cluster A §3, §9).
//
// Kept as a thin types+constants module so the derive-* modules and analyze.ts share one definition
// without a circular import (analyze.ts imports the derivers; the derivers import only this).
//
// PORTABILITY: pure types + small pure functions, no fs/Bun globals.

/** The analyzer's event-schema version. The publisher version-gates on the major-0 band; the spec
 *  (§3 schemas) pins this. Bumped to 0.6.0 by IU-A2a (wi-analytics-lifecycle-review): `harness_id`
 *  added to the attribution key + every derived row shape. Bumped to 0.7.0 by IU-A3: two NEW row kinds
 *  (`node-activity`, `gate-wait`).
 *
 *  Bumped to 0.8.0 by IU-7 (DR12) — THE ONE STAMP for wi-analyzer-refinement's whole row-shape change
 *  set (stamped LAST, after every row-shape change in the chain IU-1..IU-7):
 *    • IU-2/IU-3 — `in_node` (span-true node tokens) + per-span `session-usage` rows on `UsageRow`;
 *    • IU-3 — `stage` on unit/dispatch `UsageRow`; friction ORIGIN fields
 *      (`tool_errors_upstream`/`tool_errors_local`) on `FrictionRow`;
 *    • IU-6 — the `gate-enactment` row kind (a provenance-bound side-channel row, NOT a `DerivedRow`);
 *    • IU-7 — `exit.outcome` DROPPED from `ActivityRow`; the operator-action id grammar re-cut to the
 *      2-segment canonical `<session-prefix>:<slug>` + the retired per-event `harness_id` removed from
 *      `OperatorActionEventRow` / `owning_harness_id` from `OperatorActionRow`.
 *
 *  COMPAT (DR12): old events remain readable — the log is append-only and the publisher's version gate
 *  admits the whole major-0 band, so a 0.7.0 row still publishes; legacy operator-action ids are mapped
 *  per DR11 (3-segment → 2-segment). IU-8 adds DERIVED OUTPUTS only (kpis / trust_strip), no row-shape
 *  change after this stamp, so 0.8.0 is the COMPLETE row-shape coverage for the WI. */
export const ANALYZER_EVENT_V = "0.8.0";

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

// ── Invocation-signal grammar (shared by BOTH node-signal parsers) ────────────────────────────────
//    Single-sourced here alongside ID_RE so derive-activity's `entrySkill` (node-activity) and
//    derive-friction's `primarySkillOf` (gate-wait / friction node tagging) consume ONE grammar and can
//    never drift: a `stack-graph:<id>` invocation resolves the same bare node id on both paths.

/** The plugin namespace an invocation carries: a `stack-graph:<id>` invocation (Skill / slash / Task /
 *  attributionSkill) names the SAME node as the bare `graph-record` id `<id>`. Stripping the prefix at
 *  the signal source is the keystone — it makes a prefixed invocation match the bare node id in
 *  `nodeIds`, AND makes the emitted `node` value survive the publisher's ID_RE (a colon fails ID_RE, so
 *  an unstripped `stack-graph:<id>` would be dropped at publish even if it matched). Only THIS plugin's
 *  own prefix is normalised; a foreign `<other>:<id>` is left intact (it is genuinely not our node). */
export const SG_NS_PREFIX = "stack-graph:";
export function stripSgNamespace(skill: string): string {
  return skill.startsWith(SG_NS_PREFIX) ? skill.slice(SG_NS_PREFIX.length) : skill;
}

/** A slash `<command-name>/<skill></command-name>` invocation. The captured skill admits an optional
 *  `stack-graph:` plugin prefix (a `:` is outside the bare id class) so the prefixed slash form matches;
 *  `stripSgNamespace` then normalises the capture to the bare node id. One source for both the
 *  array-content and bare-string content paths in BOTH parsers, so the two can never drift. Non-global,
 *  so a shared `.match()` across parsers carries no lastIndex state. */
export const SLASH_CMD_RE = /<command-name>\/?((?:stack-graph:)?[A-Za-z0-9][A-Za-z0-9._-]{0,63})<\/command-name>/;

// ── IU-1 (wi-analyzer-refinement) — carrier-arg grammar + the closed STAGES set ──────────────────
//    Attended-session attribution is SIGNAL-DERIVED (DR1): carrier-operand tool events in two
//    classes — span-opening stage-skill args and point script operands. This is the ONE exported
//    extraction grammar those analytics signals ride. Operational carrier entry is enforced by the
//    graph-derived preamble contract; no host hook or second node inventory shares this concern.

/** The carrier-arg extraction grammar — every convention spelling in ONE constant:
 *    • the Skill/Agent args token         `carrier=<id>`            (the META-grammar token)
 *    • the preamble id operand            `--carrier-id <id>`       (also `=`-joined)
 *    • the record-gate/preamble path flag `--carrier <path>`        (also `=`-joined, quoted)
 *  The bare token form anchors on start-of-text / whitespace / quote / `(` — a hyphen, dot, or
 *  slash-joined pseudo-token (`multi-carrier=…`, `x.carrier=…`, `docs/per-carrier=…`) is NOT the
 *  convention token and never captures (`\b` alone would treat those joiners as boundaries).
 *  The single capture group is the RAW operand (id or path, quote-stripped by the leading `["']?`);
 *  every capture MUST then ride through `normalizeCarrierOperand` — the grammar never yields a
 *  usable id by itself (`extractCarrierArg` is the canonical composition; consume it, never inline
 *  the two steps). Non-global (no shared lastIndex state); scanners that need every match re-wrap
 *  the source with the `g` flag locally. Bounded: the operand token is length-capped and
 *  metachar-free (no spaces/quotes), so free-text can never be captured. */
export const CARRIER_ARG_RE = /(?:--carrier(?:-id)?[=\s]+|(?:^|[\s"'(])carrier=)["']?([A-Za-z0-9/~][A-Za-z0-9._/~-]{0,255})/;

/** Normalise a CARRIER_ARG_RE capture to a clean carrier id, or null when it cannot be one.
 *  record-gate's `--carrier` operand is a FILE PATH — normalisation is basename-minus-`.md`,
 *  ID_RE-validated (a bare id is its own basename, so ids pass through unchanged). Null — never a
 *  guessed or truncated id — for anything that does not normalise to an ID_RE-clean token. */
export function normalizeCarrierOperand(raw: string): string | null {
  const base = raw.replace(/\/+$/, "").split("/").pop() ?? "";
  const id = base.endsWith(".md") ? base.slice(0, -".md".length) : base;
  return ID_RE.test(id) ? id : null;
}

/** Extract THE carrier id from one operand-bearing text surface (a Skill/Agent args string or a
 *  Bash command): first CARRIER_ARG_RE match, normalised. Null when no clean id is extractable. */
export function extractCarrierArg(text: string): string | null {
  const m = text.match(CARRIER_ARG_RE);
  return m ? normalizeCarrierOperand(m[1]) : null;
}

/** The closed `stage=` vocabulary of the META dispatch envelope (DR10) — owned HERE, exported once;
 *  the publisher twin mirrors it under the conformance-equality suite (IU-5), and the registry
 *  reference's machine block carries it. An envelope `stage=` value outside this set degrades to
 *  null and increments the `stage-unknown` anomaly count — never echoed onto a row.
 *
 *  SECOND ROLE (attribute.ts `isStageSkillId`): this set also gates the `carrier-arg-missing`
 *  conformance count — a Skill/Agent invocation whose (prefix-stripped) skill / subagent_type
 *  names a member is carrier-consuming by convention (IU-9). The two roles share membership
 *  deliberately (one closed set, no hand-listed twin); note `lens`/`other` are envelope-only
 *  values that never match a real skill id. Extending this set widens BOTH roles — check both
 *  consumers before adding a member. */
export const STAGES = new Set([
  "build", "review", "lens", "verify", "shape", "triage", "land", "debrief", "other",
]);

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

/** The resolved attribution key: the (carrier, carrier_kind, arc) triple, the IU id, AND the
 *  `harness_id` the dispatch ran under (IU-A2a). Every field is null when it cannot be resolved —
 *  never guessed (§3.5).
 *
 *  `harness_id` is part of the attribution KEY: two same-named carriers under DIFFERENT harnesses are
 *  distinct identities across the fleet (the same-name-collision guard). Absent capture degrades to
 *  `null` — a clearly-LOCAL/unknown sentinel that can never equal another harness's real id, so an
 *  uncaptured transcript is never silently mis-attributed to some other harness (the load-bearing
 *  cross-fleet security property). It is NEVER defaulted to another harness's id nor fabricated. */
export interface AttributionTriple {
  carrier: string | null;
  carrier_kind: string | null;
  arc: string | null;
  iu: string | null;
  /** The harness the dispatch ran under, parsed from the META envelope (`harness=<id>`). `null` when
   *  uncaptured: the honest local/unknown sentinel — never another harness's id, never fabricated. */
  harness_id: string | null;
  /** IU-1 (DR10) — the dispatch stage parsed from the META envelope (`stage=` ∈ STAGES). `null` when
   *  the envelope is absent, the field is absent, or the value is outside the closed set (counted as
   *  an anomaly, never echoed). NEVER inherited across the dispatch tree — `propagateFromRoot` fills
   *  carrier IDENTITY only, so an envelope-less sub-dispatch keeps `stage: null` even when it
   *  inherits its ancestor's carrier (lens/review tokens can never contaminate a build rollup). */
  stage: string | null;
}

export const NULL_ATTRIBUTION: AttributionTriple = { carrier: null, carrier_kind: null, arc: null, iu: null, harness_id: null, stage: null };

// ── Derived row shapes (Cluster A §3) ───────────────────────────────────────────────────────────

export interface UsageRow {
  ts: string;
  kind: "unit-usage" | "session-usage" | "dispatch-usage";
  scope_id: string;
  session: string;
  carrier: string | null;
  carrier_kind: string | null;
  arc: string | null;
  /** The harness this usage was attributed under (IU-A2a). `null` when uncaptured — never another
   *  harness's id. Part of the fleet-wide attribution key. */
  harness_id: string | null;
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
  /** IU-2 (DR7) — the span-true in-node token total: the portion of `token_usage.total` attributable
   *  to a graph node. Message-grain for a top-level `session-usage` (Σ over messages whose
   *  prefix-stripped attributionSkill ∈ the node set); whole-file for a dispatched `unit`/`dispatch`
   *  usage (all-or-nothing via the three DR7 dispatch rules). Always `0 ≤ in_node ≤ token_usage.total`.
   *  KPI-1 process_coverage (IU-8) is Σ in_node ÷ Σ token_usage.total — both on the one dedup rule. */
  in_node: number;
  /** IU-3 (DR10) — the dispatch STAGE this usage was booked under (`attribution.stage` ∈ STAGES, or
   *  null). A dispatched `unit`/`dispatch-usage` carries the envelope's `stage=`; a top-level
   *  `session-usage` carries null (an attended session has no envelope). KPI-5's build rollup (IU-8)
   *  sums only `stage: "build"` rows — a null-stage envelope-less dispatch and a `stage: "lens"`
   *  sub-dispatch are EXCLUDED, so lens/review tokens can never contaminate the build-cost reading. */
  stage: string | null;
  v: string;
}

export interface FrictionRow {
  ts: string;
  kind: "friction-record";
  session: string;
  /** IU-3 (DR7) — the carrier this session's friction is attributed to: the single carrier span's id
   *  when the session touched exactly one, else honest-null (a multi-carrier or signal-less session).
   *  KPI-3 normalises per-session and needs no carrier; the field keeps the friction record honest
   *  rather than mislabelling a span-ambiguous session's friction onto one carrier. */
  carrier: string | null;
  /** The harness this session's friction was attributed under (IU-A2a). `null` when uncaptured —
   *  never another harness's id. Part of the fleet-wide attribution key. */
  harness_id: string | null;
  permission_denials: number;
  rejected_calls: number;
  tool_errors: number;
  /** IU-3 (DR8) — the ORIGIN split of `tool_errors` (permission denials / rejections are local by
   *  construction and counted above). `tool_errors_upstream` = errors whose text matched an
   *  `UPSTREAM_MARKERS` entry (derive-friction.ts); `tool_errors_local` = the remainder, which DEFAULT
   *  to local. `tool_errors_local` doubles as the UNMATCHED/unclassified counter (DR8): a marker-less
   *  error is booked local, but the count keeps allowlist drift visible — a spike means real error
   *  strings outran the upstream allowlist, never a silent "local". Always
   *  `tool_errors_upstream + tool_errors_local === tool_errors`. KPI-3 (IU-8) reads the split for its
   *  upstream|local friction series, and the trust strip sums `tool_errors_local` as the
   *  unclassified-error count. */
  tool_errors_upstream: number;
  tool_errors_local: number;
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
  // NOTE (IU-A2a): a stall is NOT carrier-attributed — it carries no (carrier, carrier_kind, arc)
  // triple, only a cross-session wall-clock gap keyed on session_before/session_after. So it is
  // outside the attribution key `harness_id` extends, and `derive-stalls.ts` (A3's territory) is not
  // re-keyed here. The attribution key is whole across the three attribution-bearing rows
  // (usage / activity / friction).
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
  /** The harness this node-activity was attributed under (IU-A2a). `null` when uncaptured — never
   *  another harness's id. Part of the fleet-wide attribution key. */
  harness_id: string | null;
  // IU-7 (DR12): `outcome` DROPPED — it was hard-null on 491/491 rows ever emitted (no analyzer source
  // populates it; gate outcomes live on the gate-enactment row, IU-6). The publisher never read it.
  gates: string[];
  /** Layer-2 model-authored trend measurements (§7), read off the node's `<sg-signal>` block and
   *  validated against TREND_SERIES. Omitted when the node emitted no valid metric (the publisher's
   *  exit-event `metrics` path is allowlist-gated regardless). */
  metrics?: Record<string, number>;
  v: string;
}

/**
 * IU-A3 — the per-transcript, per-node ACTIVITY TOTAL. Where `ActivityRow` (enter/exit) records each
 * individual span boundary, `NodeActivityRow` sums a node's `active_ms` over ALL N of its
 * non-contiguous spans WITHIN ONE TRANSCRIPT — a node entered N times is one settled total, not N
 * partial rows. The windowing is the transcript's own MONOTONIC ENTRY ORDER (the order spans close in
 * `deriveActivitySpans`), NEVER a wall-clock window across transcripts — so two concurrently-dispatched
 * transcripts, even with overlapping wall-clock spans, each sum independently and can never bleed into
 * each other (the load-bearing concurrent-dispatch no-double-count property). One settled row per
 * (session, node).
 */
export interface NodeActivityRow {
  ts: string;
  kind: "node-activity";
  node: string;
  session: string;
  carrier: string | null;
  carrier_kind: string | null;
  arc: string | null;
  /** The harness this node-activity total was attributed under (IU-A2a). `null` when uncaptured —
   *  never another harness's id. Part of the fleet-wide attribution key. */
  harness_id: string | null;
  /** Total active milliseconds summed over ALL N of this node's non-contiguous spans in the one
   *  transcript (Σ over the N windows). Per-transcript monotonic — never a cross-transcript window. */
  active_ms: number;
  /** N — the number of non-contiguous spans of this node coalesced in the one transcript. A
   *  re-entered node has N > 1; the row is the SUM over all N, not N separate rows. */
  span_count: number;
  /** True when at least one of the N spans opened on a primary (Skill/slash/Task) signal. */
  primary: boolean;
  v: string;
}

/**
 * IU-A3 — a FIRST-CLASS gate-wait event. A gate-wait is the within-transcript "waiting on a gate"
 * signal a gate-bearing node emits when it surfaces a gate decision and pauses for the operator —
 * detected in the one transcript's MONOTONIC ENTRY ORDER. It is DELIBERATELY DISTINCT from a
 * `stall-record` (derive-stalls.ts): a stall is a CROSS-transcript WALL-CLOCK gap between two
 * sessions' activity instants; a gate-wait is a SINGLE-transcript first-class event with a named gate.
 * The design's explicit contrast — gate-wait = a first-class waiting-on-a-gate event; stall = a
 * wall-clock gap. A gate-wait is therefore NEVER folded into the wall-clock stall primitive.
 *
 * LOCALITY (§9 S1): `gate` is an ID_RE-clean gate id (the bounded marker token); the node it waited
 * under is an ID_RE-clean node id or null. No free-text crosses into the row.
 */
export interface GateWaitRow {
  ts: string;
  kind: "gate-wait";
  /** The gate id awaited (ID_RE-clean — the bounded marker token). */
  gate: string;
  /** The gate-bearing node the wait occurred under (the active span at the wait point), or null when
   *  the wait was not inside a recognised graph-node span. */
  node: string | null;
  session: string;
  carrier: string | null;
  carrier_kind: string | null;
  arc: string | null;
  /** The harness this gate-wait was attributed under (IU-A2a). `null` when uncaptured — never another
   *  harness's id. Part of the fleet-wide attribution key. */
  harness_id: string | null;
  v: string;
}

/** The union of every derived row kind. */
export type DerivedRow = UsageRow | FrictionRow | StallRow | ActivityRow | NodeActivityRow | GateWaitRow;

// ── IU-A6 — the `<sg-operator-action>` lifecycle row + its states ─────────────────────────────────
//
// DELIBERATELY NOT a member of `DerivedRow`. The operator-action correlation is a CENTRAL-MERGE-TIER
// derivation (GROUP BY `id` over the merged operator-action events; derive-operator-actions.ts), NOT a
// per-transcript derived row in the canonical analyzer-events.jsonl stream (store (a), §2 "two stores").
// So adding it here does NOT touch the `DerivedRow` union, compareRows, or the dedup identity — and
// therefore does NOT bump ANALYZER_EVENT_V (no existing shape changed; the major-0 band the publisher
// gates on is preserved). schema.ts is the shared HOME for these shapes (its stated role), referenced
// by the deriver and the publisher; the reducer LOGIC lives in derive-operator-actions.ts.

/** The lifecycle state of one operator-action obligation (one `id`-group), reduced by the GROUP-BY-`id`
 *  derivation. The fail-safe-authority states are the load-bearing ones:
 *    • `closed`               — authoritatively closed (attended/attested + same-COLLECTION, IU-7/DR11);
 *                               HIDDEN.
 *    • `close-proposed`       — a non-authoritative (unattended/cross-collection) close was seen; STILL
 *                               VISIBLE ("someone proposed closing this") — a forged close can only ADD
 *                               this marker, never hide a real needs-you (security P0).
 *    • `outstanding`          — an attended open, no authoritative close, COMPLETE capture.
 *    • `possibly-outstanding` — an attended open, no close, INCOMPLETE capture — not a confident nag
 *                               (honest-under-capture); flips to `closed` when the missing log merges.
 *    • `dropped`              — a close with no anchoring open (orphan); never a needs-you. */
export type OperatorActionState =
  | "closed"
  | "close-proposed"
  | "outstanding"
  | "possibly-outstanding"
  | "dropped";

/** The reduced view of ONE operator-action obligation — the publishable operator-action row (the
 *  needs-you/latency surface reads these). `latency_ms` is present ONLY for a clean 1:1 pair (every
 *  degenerate group is excluded from the latency aggregate). `outstanding` is the item-by-item
 *  needs-you flag (an attended open with no authoritative close); `close_proposed` is the additive
 *  forged-close marker (never a hide). */
export interface OperatorActionRow {
  kind: "operator-action";
  /** The 2-segment CANONICAL obligation id `<session-prefix>:<slug>` (IU-7/DR11) — derive-stamped from
   *  the opener's slug + the transcript session (or mapped from a legacy 3-segment June id). */
  id: string;
  state: OperatorActionState;
  outstanding: boolean;
  close_proposed: boolean;
  latency_ms?: number;
  health: "ok" | "orphan-close" | "dup-open" | "dup-close";
  v: string;
}

/** ONE per-event `<sg-operator-action>` member event row — the SHAPE the bridge (analyze.ts) WRITES to
 *  analyzer-events.jsonl, and the publisher (publish-projection.ts) READS and GROUP-BY-`id` reduces into
 *  the `OperatorActionRow` surface above at publish tier. This is the PER-EVENT row (one open or one
 *  close), DISTINCT from the reduced `OperatorActionRow`. It is DELIBERATELY NOT a `DerivedRow` member
 *  (kept out of the union / `compareRows` / dedup identity, so `ANALYZER_EVENT_V` is NOT bumped): the
 *  bridge collects these in a side channel — `deriveAll`'s `DerivedRow[]` return is therefore unchanged
 *  — and `serializeAllRows` interleaves them into the SAME canonical (ts, session, kind) file order as
 *  the `DerivedRow` stream, so the at-rest file stays globally sorted and a re-run is byte-identical.
 *
 *  SECURITY (P0 — the load-bearing property): `attended` is bound by the bridge from TRUSTWORTHY context
 *  — the scan disposition (top-level vs subagent) — NEVER from the attacker-controllable tag body, so a
 *  forged body cannot forge close-authority. Close-authority's OTHER half — same-COLLECTION (IU-7/DR11)
 *  — is COLLECTION-level, applied at the deriver, NOT plumbed per-event on this row: the retired
 *  per-event `harness_id` is GONE. `session` stamps the id's prefix AND orders the serialisation. */
export interface OperatorActionEventRow {
  ts: string;
  kind: "operator-action";
  /** The EMITTED obligation id — the opener's bare slug, the 2-segment canonical (a closer's copy), or
   *  a legacy 3-segment June id (registry shape-validated upstream). The publisher canonicalises it to
   *  `<session-prefix>:<slug>` on read (via `session`), so a legacy id resolves without a per-event WARN. */
  id: string;
  /** `open | closed` — the publisher reads exactly these. */
  status: "open" | "closed";
  /** True iff emitted from an ATTENDED (top-level) transcript — bound from the scan disposition, never
   *  the tag body. */
  attended: boolean;
  /** The capturing session (the transcript session) — stamps the canonical id's `<session-prefix>` on
   *  read AND orders the serialisation. */
  session: string;
  v: string;
}

// ── IU-9 — the durable `<sg-*>` family PROPOSAL row + its per-member field-and-value allowlist ─────
//
// The `<sg-*>` family scan (scan-sg-tags.ts) captures each registered tag as an in-memory `SgProposal`
// carrying the raw parsed `body` (`unknown`) — for an attended gate to inspect. IU-9 makes those
// proposals PERSIST as durable rows. THE LOAD-BEARING SECURITY PROPERTY (SG-6 v2, security-load-bearing):
// the persisted row carries ONLY a per-member enum/token field ALLOWLIST — the raw `body` is NEVER
// serialised. A row is built FIELD-BY-FIELD, VALUE-BY-VALUE from `projectSgProposalFields` below; a
// free-text `description`/`paths` value is DR4-SANITISED in place, and an out-of-bounds routing value
// (`kind`/`subject`/`status`/`target`) DROPS the whole row, so no free-text/secret is ever written at rest. The
// publisher (publish-projection.ts) RE-ENFORCES the same value allowlist as an INDEPENDENT second line
// of defence before anything leaves the machine.
//
// sg-operator-action is DELIBERATELY EXCLUDED (projects to `null`): it rides its own first-class
// `operator-action` row + GROUP-BY-id lifecycle (derive-operator-actions.ts). Re-capturing it here would
// double-represent one obligation. Adding a NEW family member = adding a `SgProposalFields` variant + a
// case in `projectSgProposalFields` (never overloading an existing one).
//
// Like `OperatorActionEventRow`, this row is NOT a `DerivedRow` member (kept out of the union /
// `compareRows` / dedup identity) — the bridge collects it in a side channel and `serializeAllRows`
// interleaves it into the SAME canonical (ts, session, kind) file order, so `ANALYZER_EVENT_V` is NOT
// bumped (no existing shape changed; the major-0 band the publisher gates on is preserved).

/** The DR4 capture-boundary contract for the model `<sg-*>` members: the closed routing enums, the
 *  restricted token grammar, and the free-text sanitiser. The `sg-registry` shape gate reuses the
 *  enum/token sets to DROP an out-of-bounds routing value; `projectSgProposalFields` re-asserts them
 *  and runs the sanitiser value-by-value so a shape-valid-but-hostile `description`/`paths` is scrubbed
 *  before it can reach the derived log. `publish-projection.ts` keeps an INDEPENDENT copy of the same
 *  contract (the no-import defence) and re-enforces it as a second line. */

// Closed routing enums — a value outside the set drops the whole tag at the shape gate (DR4). The exact
// vocabularies are the code-twin contract (grounded in the floor prose + severity-scale); pin-able if
// doctrine later enumerates them. `kind` is per-member (a decision's kind is not a friction's kind).
export const SG_DECISION_KINDS: ReadonlySet<string> = new Set(["design", "scope", "process", "tooling", "product"]);
export const SG_OPEN_ITEM_KINDS: ReadonlySet<string> = new Set(["deferral", "dependency", "question", "risk"]);
export const SG_FRICTION_KINDS: ReadonlySet<string> = new Set(["missing-tool", "failed-tool", "denial", "operator-correction"]);
export const SG_CONFLICT_KINDS: ReadonlySet<string> = new Set(["contradiction", "confusion"]);
export const SG_SEVERITIES: ReadonlySet<string> = new Set(["P0", "P1", "P2", "P3"]); // per severity-scale
export const SG_FRICTION_TARGETS: ReadonlySet<string> = new Set(["upstream", "local"]); // DR3 origin (tag-side twin)
export const SG_STATUSES: ReadonlySet<string> = new Set(["open", "closed"]);

/** Restricted correlation/subject token: bounded, no whitespace / markup / control characters, so a
 *  `subject` or `id` can never smuggle free-text. Mirrors ID_RE but admits colon-segmented ids. */
export const SG_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

// DR4 free-text caps.
export const SG_DESC_MAX_WORDS = 20;
export const SG_DESC_MAX_CHARS = 160;
export const SG_PATHS_MAX_ENTRIES = 8;
export const SG_PATH_MAX_CHARS = 120;

/** A strict relative-path token: rejects a parent-escape (`..`), an absolute path (leading `/`), and any
 *  scheme (`:` is outside the charset, so `https://`, `file:`, `C:` all fail). Length <=120. */
export const SG_PATH_RE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._-][A-Za-z0-9._/-]{0,119}$/;

/** DR4 — sanitise a bounded free-text `description`: strip control characters, neutralise markup
 *  metacharacters (`<`, `>`, `` ` ``) by REMOVAL (rendered inert — the dashboard prints the value as a
 *  text node, and no HTML tag can form without its brackets), collapse whitespace, and cap to <=20 words
 *  and <=160 chars. IDEMPOTENT: re-running is a no-op, so the capture-boundary projection and the
 *  publisher's independent re-enforcement never double-transform. A non-string yields "". */
export function sanitizeDescription(v: unknown): string {
  if (typeof v !== "string") return "";
  // Control characters (code point < 0x20, or DEL 0x7f) -> space, written as numeric comparisons so no
  // control-char literal appears in source.
  let s = "";
  for (const ch of v) {
    const c = ch.codePointAt(0) ?? 0;
    s += c < 0x20 || c === 0x7f ? " " : ch;
  }
  s = s.replace(/[<>`]/g, "");        // strip markup metacharacters (idempotent)
  s = s.replace(/\s+/g, " ").trim();  // collapse whitespace
  const words = s.split(" ").filter(Boolean);
  if (words.length > SG_DESC_MAX_WORDS) s = words.slice(0, SG_DESC_MAX_WORDS).join(" ");
  if (s.length > SG_DESC_MAX_CHARS) s = s.slice(0, SG_DESC_MAX_CHARS);
  return s;
}

/** DR4 — sanitise a `paths` list: keep ONLY strict relative-path tokens (SG_PATH_RE rejects `..`,
 *  absolute, and scheme-prefixed), each <=120 chars, capping the list to <=8 entries. A hostile entry is
 *  filtered out value-by-value; the raw array is never carried. IDEMPOTENT. */
export function sanitizePaths(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const p of v) {
    if (typeof p !== "string" || p.length > SG_PATH_MAX_CHARS || !SG_PATH_RE.test(p)) continue;
    out.push(p);
    if (out.length >= SG_PATHS_MAX_ENTRIES) break;
  }
  return out;
}

/** The bounded, allowlist-clean per-member fields of an sg-proposal — a discriminated union keyed by
 *  `member` (the tag). Every value is a closed enum, a restricted token, or a DR4-sanitised free-text
 *  projection; NEVER a raw free-text channel. `sg-operator-action` is a model member (registered +
 *  scanned) but projects to its OWN `operator-action` row, so it is deliberately NOT a variant here. */
export type SgProposalFields =
  | { member: "sg-decision"; kind: string; subject: string }
  | { member: "sg-open-item"; id: string; status: string; kind: string }
  | { member: "sg-friction"; kind: string; severity: string; description: string; target: string }
  | { member: "sg-conflict"; kind: string; description: string; paths: string[] };

/** The closed set of MODEL-emitted `<sg-*>` members and their body field set — the schema layer's twin
 *  of the registry reference's `emitter-class:model` block. The conformance suite set-compares these
 *  member names + field sets against the registry ref, `sg-registry.ts`, and the publisher's independent
 *  twin (bidirectional equality, exact count = 5). `sg-operator-action` is listed (it IS a model member)
 *  though it routes to the operator-action row rather than an sg-proposal row. */
export const SG_MODEL_MEMBERS: Readonly<Record<string, readonly string[]>> = {
  "sg-decision": ["kind", "subject"],
  "sg-open-item": ["id", "status", "kind"],
  "sg-friction": ["kind", "severity", "description", "target"],
  "sg-conflict": ["kind", "description", "paths"],
  "sg-operator-action": ["id", "status"],
};

/** Project a registry-shape-gated proposal body into its BOUNDED, allowlist-clean fields — or `null`
 *  when the member does not persist as an sg-proposal row (`sg-operator-action` rides its own row; an
 *  unknown member has no projection). Built value-by-value; the raw body is never carried, each routing
 *  field is RE-ASSERTED against its closed enum/token (defence in depth — a value that bypassed the
 *  shape gate drops the whole row here), and each free-text field is DR4-sanitised. */
export function projectSgProposalFields(tag: string, body: unknown): SgProposalFields | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  switch (tag) {
    case "sg-decision": {
      const { kind, subject } = b;
      if (typeof kind !== "string" || !SG_DECISION_KINDS.has(kind)) return null;
      if (typeof subject !== "string" || !SG_TOKEN_RE.test(subject)) return null;
      return { member: "sg-decision", kind, subject };
    }
    case "sg-open-item": {
      const { id, status, kind } = b;
      if (typeof id !== "string" || !SG_TOKEN_RE.test(id)) return null;
      if (typeof status !== "string" || !SG_STATUSES.has(status)) return null;
      if (typeof kind !== "string" || !SG_OPEN_ITEM_KINDS.has(kind)) return null;
      return { member: "sg-open-item", id, status, kind };
    }
    case "sg-friction": {
      const { kind, severity, target } = b;
      if (typeof kind !== "string" || !SG_FRICTION_KINDS.has(kind)) return null;
      if (typeof severity !== "string" || !SG_SEVERITIES.has(severity)) return null;
      if (typeof target !== "string" || !SG_FRICTION_TARGETS.has(target)) return null;
      return { member: "sg-friction", kind, severity, description: sanitizeDescription(b.description), target };
    }
    case "sg-conflict": {
      const { kind } = b;
      if (typeof kind !== "string" || !SG_CONFLICT_KINDS.has(kind)) return null;
      return { member: "sg-conflict", kind, description: sanitizeDescription(b.description), paths: sanitizePaths(b.paths) };
    }
    default:
      // sg-operator-action (own lifecycle row) + any not-yet-projected / unknown member -> no sg-proposal row.
      return null;
  }
}

/** ONE durable `<sg-*>` family proposal row — the SHAPE the bridge (scan-sg-tags.ts `rowFromProposal`)
 *  WRITES to analyzer-events.jsonl and the publisher READS + re-sanitises. NOT a `DerivedRow`. `fields`
 *  is the bounded per-member projection (never the raw body); `disposition` is bound from the scan's
 *  attended/dispatched context, never the tag body. `session` rides for a deterministic serialisation
 *  order only. */
export interface SgProposalRow {
  ts: string;
  kind: "sg-proposal";
  /** `surfaced` for an attended (top-level) transcript; `proposal-only` for a dispatched (subagent) one
   *  — bound from the scan disposition (meta.isSubagent), NEVER the tag body. */
  disposition: "surfaced" | "proposal-only";
  /** The bounded, allowlist-clean per-member fields — the ONLY body-derived data. Never the raw body. */
  fields: SgProposalFields;
  /** The capturing (transcript) session — carried only for a deterministic serialisation order. */
  session: string;
  v: string;
}

// ── IU-1/IU-2 — the aggregate trust-strip counts (publisher-readable; the trust strip reads them) ─
//   Attribution-anomaly counts (IU-1) plus token-dedup health (IU-2's `token-dedup-divergence`).
//
// The recut attribution model surfaces its own capture health as AGGREGATE COUNTS, never per-event
// WARN spam and never a guessed value on a row: per-field honest-null is preserved on the attribution
// itself, and the FACT that a field could not be resolved lands here, per (session, class). Like
// `OperatorActionEventRow` / `SgProposalRow`, this row is DELIBERATELY NOT a `DerivedRow` member (kept
// out of the union / `compareRows` / the dedup identity, so `ANALYZER_EVENT_V` is NOT bumped here —
// IU-7 stamps 0.8.0 once, after every row-shape change in the chain). The bridge collects these in a
// side channel and `serializeAllRows` interleaves them into the same canonical (ts, session, kind)
// order, so the at-rest file stays globally sorted and byte-identical across re-runs.

/** The closed aggregate-counter vocabulary (each is one trust-strip counter, IU-8) — attribution
 *  anomalies (IU-1) plus token-dedup health (IU-2). Every member is a per-(session, class) count the
 *  publisher/trust-strip reads; a member is bumped by whichever deriver observes it (attribution
 *  classes by `attributeTranscript`; `token-dedup-divergence` by the token summer, aggregated in
 *  `deriveAll`). `AnomalyCounts` is sparse, so a class no producer bumps is simply absent.
 *    • `carrier-arg-missing`      — a stage-skill invocation (Skill/Agent tool_use naming a STAGES
 *                                   member) whose args carry NO extractable, ID_RE-clean carrier token
 *                                   (an invalid token counts here too — nonconforming either way).
 *    • `carrier-unresolvable`     — a well-formed (ID_RE-clean) operand id absent from the supplied
 *                                   `--carriers` ledger manifest; the signal is REJECTED (correct-or-null).
 *    • `envelope-missing`         — a DISPATCHED transcript whose first user message carries no usable
 *                                   META envelope (the DR10 envelope-conformance counter's raw class).
 *    • `stage-missing`            — a usable envelope with NO `stage=` field.
 *    • `stage-unknown`            — a `stage=` token present but outside the closed STAGES set.
 *    • `token-dedup-divergence`   — (IU-2 / DR7) a message.id whose LAST-wins pick differs from the
 *                                   retired max-total-wins tie-break; the count keeps the old guard
 *                                   visible (nonzero ⇒ streamed/retry dups were not monotonic).
 *    • `provenance-refused`       — (IU-6 / gate channel) a SHAPE-CONFORMING `<sg-gate>` tag captured
 *                                   WITHOUT executed-runner provenance — a prose echo, a mention-only
 *                                   command, a registry/runner read echo, or a replay through a
 *                                   non-runner tool_result. The forgery attempt derives ZERO rows but is
 *                                   COUNTED here, so it is visible (never silent). Fed separately from the
 *                                   gate scan (like `token-dedup-divergence` from the token summer), not
 *                                   from `attributeTranscript`. IU-8 reads it into the trust strip.
 *    • `parse-drop`               — (IU-5 / IU-8) a REGISTERED `<sg-*>` member whose body failed the strict
 *                                   single-line JSON gate (a YAML-ish / non-JSON emitter). Computed by the
 *                                   sg scan (SgScanResult.parseDrops), folded here per session; IU-8's
 *                                   trust strip reads it as the tag-capture drop counter (a drifting
 *                                   emitter is visible, never silent). Adds a NEW class VALUE only — the
 *                                   {ts,kind,class,count,session,v} row shape is unchanged (no version bump).
 *    • `scan-cap`                 — (IU-8, IU-5's deferred ReDoS bound) a `<sg-*>` scan that hit a per-entry
 *                                   input/match cap (SG_SCAN_MAX_*). The bounded scan is COUNTED so it is
 *                                   visible, never a silent truncation. New class VALUE only (shape unchanged). */
export const ANOMALY_CLASSES = [
  "carrier-arg-missing",
  "carrier-unresolvable",
  "envelope-missing",
  "stage-missing",
  "stage-unknown",
  "token-dedup-divergence",
  "provenance-refused",
  "parse-drop",
  "scan-cap",
] as const;
export type AnomalyClass = (typeof ANOMALY_CLASSES)[number];

/** ONE aggregate trust-strip count — per (session, class) over ANOMALY_CLASSES (attribution anomalies
 *  plus token-dedup health), emitted only when count > 0
 *  (honest: absence of anomalies is absence of rows; the IU-11 fixture baseline distinguishes a
 *  never-incrementing counter from perfection). `ts` is the session's first observed instant, so a
 *  re-run is byte-identical (§9 idempotency). */
export interface AnomalyCountRow {
  ts: string;
  kind: "anomaly-count";
  class: AnomalyClass;
  count: number;
  session: string;
  v: string;
}

// ── IU-6 (gate-channel-e2e) — the gate-enactment row + its closed enums ───────────────────────────
//
// THE ONE-CHANNEL gate signal: the record-gate runner appends a bounded `<sg-gate>` tag to stdout on a
// SUCCESSFUL enactment (never a rejection). The analyzer's gate scanner (scan-gate-tags.ts) captures it
// ONLY with executed-runner provenance — the tag must ride the tool_result of a Bash tool_use whose
// command EXECUTED the runner (executed-argv-anchored, not a substring). A prose echo, a mention-only
// command, a file-read of the registry/runner, or a replay through a non-runner tool_result is REFUSED
// (counted `provenance-refused`, never derived) — forgery is visible, not silent. derive-activity.ts
// shapes the captured proposal into the row below, node-tagged `record-gate` (the enactment is that
// node's activity). Like the other side-channel rows it is DELIBERATELY NOT a `DerivedRow` member (kept
// out of the union / `compareRows` / dedup identity), so `ANALYZER_EVENT_V` is NOT bumped here — IU-7
// stamps 0.8.0 once, after every row-shape change in the chain, and this shape is in its coverage.

/** The five product-gate ids the `<sg-gate>` tag admits (mirrors record-gate's PRODUCT_GATES). A gate
 *  outside the set fails the scanner's shape gate — the tag captures nothing (never a wrong gate). */
export const GATE_ENACTMENT_GATES: ReadonlySet<string> = new Set([
  "intent-to-build", "commit-to-build", "commit-to-land", "live-confirmed", "closeout",
]);

/** The closed decision vocabulary the `<sg-gate>` tag admits (record-gate.md § Inputs:
 *  `cleared | declined | reconciled | promote | confirmed | closed | promoted`). A decision outside the
 *  set fails the scanner's shape gate — a bounded enum, never a free-text channel. */
export const GATE_ENACTMENT_DECISIONS: ReadonlySet<string> = new Set([
  "cleared", "declined", "reconciled", "promote", "confirmed", "closed", "promoted",
]);

/** The `<sg-gate>` SCRIPT member's closed BODY field set (the tag's four fields) — the conformance twin
 *  of the registry reference's `sg-gate` `fields` array. The scanner's shape gate (scan-gate-tags.ts)
 *  enforces EXACTLY this set on a captured tag, and the conformance suite (sg-conformance.test.ts)
 *  set-compares it against the registry block. Adding/removing a field here without the registry edit
 *  (or vice-versa) fails the suite. */
export const SG_GATE_FIELDS = ["gate", "decision", "carrier", "seq"] as const;

/** The record-gate node id every gate-enactment row is tagged with (the enactment is record-gate's
 *  activity). A single literal, so the writer's tag and the reader's row can never drift on the tag. */
export const RECORD_GATE_NODE = "record-gate";

/** ONE gate-enactment row — the durable, provenance-bound derivation of a `<sg-gate>` tag. Node-tagged
 *  `record-gate`. All four body-derived fields are bounded (closed enums / ID_RE id / integer), so no
 *  free-text crosses into the row. NOT a `DerivedRow` member (its own serialised block, like
 *  operator-action / sg-proposal / anomaly-count), so a caller that omits the collector still gets the
 *  byte-identical DerivedRow stream it always did. `session` rides for a deterministic serialisation
 *  order only. */
export interface GateEnactmentRow {
  ts: string;
  kind: "gate-enactment";
  /** node-tag — always `record-gate` (RECORD_GATE_NODE). */
  node: string;
  /** The product gate enacted (∈ GATE_ENACTMENT_GATES). */
  gate: string;
  /** The decision recorded (∈ GATE_ENACTMENT_DECISIONS). */
  decision: string;
  /** The carrier id the runner normalised from its `--carrier` PATH operand (ID_RE-clean). */
  carrier: string;
  /** The chain seq of the appended gate_decisions[] entry (integer ≥ 0). */
  seq: number;
  /** The capturing (transcript) session — carried only for a deterministic serialisation order. */
  session: string;
  v: string;
}

// ── Canonical ordering + serialisation (§9 idempotency) ─────────────────────────────────────────

/** Stable sort key for a row: (ts, session, kind). The analyzer FULL-REWRITES the output file in
 *  this order every run, so a re-run with no new activity yields a byte-identical file. Rows without
 *  a session field (stalls) use session_before as the session component. */
function rowSession(row: DerivedRow): string {
  if (row.kind === "stall-record") return row.session_before;
  return row.session;
}

/** The canonical sort key for one output line: (ts, session, kind, full-JSON). The full-JSON tiebreak
 *  makes the order TOTAL — no two DISTINCT rows ever compare equal — so serialisation is deterministic
 *  regardless of input order. */
interface RowSortKey {
  ts: string;
  session: string;
  kind: string;
  json: string;
}

/** Compare two canonical sort keys — the SINGLE source of the analyzer's row order, shared by
 *  `compareRows` (the `DerivedRow` stream + the cross-harness merge path) and `serializeAllRows` (the
 *  combined at-rest file). Keeping one comparator means the at-rest file and the merge path can never
 *  drift out of agreement on the canonical order (the §9 idempotency invariant). */
function compareSortKeys(a: RowSortKey, b: RowSortKey): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  if (a.session !== b.session) return a.session < b.session ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return a.json < b.json ? -1 : a.json > b.json ? 1 : 0;
}

/** Compare two rows for the canonical (ts, session, kind, full-JSON) order — a TOTAL order, so the sort
 *  is deterministic regardless of input order. */
export function compareRows(a: DerivedRow, b: DerivedRow): number {
  return compareSortKeys(
    { ts: a.ts, session: rowSession(a), kind: a.kind, json: JSON.stringify(a) },
    { ts: b.ts, session: rowSession(b), kind: b.kind, json: JSON.stringify(b) },
  );
}

/** Serialise rows into the canonical JSONL body (sorted, one row per line, trailing newline). Pure:
 *  same rows in ⇒ byte-identical string out. */
export function serializeRows(rows: DerivedRow[]): string {
  const sorted = [...rows].sort(compareRows);
  return sorted.map((r) => JSON.stringify(r)).join("\n") + (sorted.length > 0 ? "\n" : "");
}

/** Serialise the FULL analyzer output — the `DerivedRow` stream PLUS the per-event operator-action rows
 *  PLUS the durable sg-proposal rows (IU-9) PLUS the aggregate anomaly-count rows (IU-1) — into ONE
 *  canonically-sorted JSONL body (sorted by (ts, session, kind), with a full-JSON tiebreak for a TOTAL
 *  order so a re-run is byte-identical). The operator-action / sg-proposal / anomaly-count rows are NOT
 *  `DerivedRow` members (kept out of the union / `compareRows`), but they ARE part of the at-rest
 *  analyzer-events.jsonl stream the publisher reads, so they participate in the SAME canonical order as
 *  every other row — the whole file stays globally sorted. The trailing collections default to `[]`, so
 *  an existing caller is unaffected. Pure: same rows in ⇒ byte-identical out. */
export function serializeAllRows(
  rows: DerivedRow[],
  operatorActionRows: OperatorActionEventRow[],
  sgProposalRows: SgProposalRow[] = [],
  anomalyCountRows: AnomalyCountRow[] = [],
  gateEnactmentRows: GateEnactmentRow[] = [],
): string {
  // Every side-channel row kind shares one (ts, session, kind) projection — one map, not one
  // drift-prone line per kind (the next side-channel kind joins the union, not a fifth map).
  const sideRows: Array<OperatorActionEventRow | SgProposalRow | AnomalyCountRow | GateEnactmentRow> = [
    ...operatorActionRows,
    ...sgProposalRows,
    ...anomalyCountRows,
    ...gateEnactmentRows,
  ];
  const keyed: RowSortKey[] = [
    ...rows.map((r) => ({ ts: r.ts, session: rowSession(r), kind: r.kind, json: JSON.stringify(r) })),
    ...sideRows.map((r) => ({ ts: r.ts, session: r.session, kind: r.kind, json: JSON.stringify(r) })),
  ];
  keyed.sort(compareSortKeys);
  return keyed.map((k) => k.json).join("\n") + (keyed.length > 0 ? "\n" : "");
}

/** Normalise an arbitrary timestamp to a strict-UTC ISO instant, or null if it is not a valid date.
 *  Everything emitted by the analyzer passes through here so emitted ts always satisfies ISO_UTC_RE. */
export function normalizeTs(ts: unknown): string | null {
  if (typeof ts !== "string" || ts === "") return null;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}
