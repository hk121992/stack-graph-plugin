// derive-friction.ts — per-TRANSCRIPT friction rows + the first-class gate-wait event (Cluster A §3.2;
// replaces #28's friction hook; extended by IU-A3).
//
// PER-TRANSCRIPT ATTRIBUTION, WINDOWED IN MONOTONIC ENTRY ORDER (IU-A3). Friction is derived from ONE
// transcript's entries, walked in that transcript's own monotonic ENTRY ORDER — never by a wall-clock
// window joined across transcripts. This is the load-bearing concurrent-dispatch property: two
// subagent transcripts whose wall-clock spans OVERLAP each tally over their OWN entries, so one
// dispatch's friction can never be counted into the other's. `derive-stalls.ts` is the ONLY
// cross-transcript primitive and it is wall-clock — friction deliberately does NOT reuse it.
//
// CATEGORISED COUNTS / ENUMS ONLY (locality, §9 S1). The analyzer NEVER carries the denial command,
// the rejection reason, or any raw permission text — only the per-session tallies and the
// permission-mode enum cross into the derived log. The publisher's no-free-text rule is mirrored
// here at the source.
//
// Sources (verified transcript facts, §3):
//  - hard denial   — a tool_result with is_error:true whose content matches "… has been denied."
//  - user rejection — a tool_result with is_error:true matching "The user doesn't want to proceed…"
//  - tool error    — any OTHER is_error:true tool_result.
//  - permission structure — permissionDecision / permissionDecisionReason / permissionMode where the
//    classifier/hook left them; degrade to 0 / "" where absent (never model-filled).
//  - gate-wait (IU-A3) — a FIRST-CLASS within-transcript "waiting on a gate" event: a gate-bearing
//    node emits a bounded `[gate-wait:<gate-id>]` marker (ID_RE-clean gate id) when it surfaces a gate
//    and pauses for the operator. Detected in the one transcript's MONOTONIC ENTRY ORDER and emitted
//    as its own `gate-wait` row — DISTINCT from a `derive-stalls` wall-clock `stall-record` (the
//    design's explicit contrast; a gate-wait is NEVER folded into the wall-clock stall primitive).

import { ANALYZER_EVENT_V } from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, FrictionRow, GateWaitRow, AttributionTriple } from "./schema.ts";
// The `stack-graph:` namespace-strip + slash grammar is single-sourced in schema.ts (alongside ID_RE),
// shared with derive-activity's `entrySkill` — so `primarySkillOf` tags a prefixed invocation with the
// same bare node id the node-activity path resolves (the gate-wait tag is no longer dark for a prefix).
import { ID_RE, normalizeTs, stripSgNamespace, SLASH_CMD_RE } from "./schema.ts";

// The two hard categorisation strings (substring match — robust to the variable command/reason text
// that precedes/follows). We match ONLY to categorise; the matched text is NEVER emitted.
const DENIAL_MARKER = "has been denied.";
const REJECTION_MARKER = "doesn't want to proceed";

// IU-3 (DR8) — the UPSTREAM-marker allowlist: substrings that mark a generic tool error as
// originating UPSTREAM (a dependency / external service), not in this harness's own code. A
// non-denial/rejection is_error result is booked `tool_errors_upstream` when its text contains one of
// these, else DEFAULTS to `tool_errors_local` (counted there — an unmatched error is booked local but
// visibly, so allowlist drift shows, never a silent "local"). Matched ONLY to categorise; the text is
// NEVER emitted (locality §9 S1). Conservative by design — over-claiming upstream would understate
// local friction, so a borderline string stays local. v1 is this exported factory constant.
export const UPSTREAM_MARKERS: readonly string[] = [
  "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", // network errno — a failed connection out
  "502 Bad Gateway", "503 Service Unavailable", "504 Gateway Timeout", // upstream gateway statuses
];

// The permission-mode enum allowlist — a non-conforming mode degrades to "" (never echoed free-form,
// so a hostile free-text permissionMode cannot ride into the log).
const PERMISSION_MODES = new Set(["auto", "default", "plan", "acceptEdits", "bypassPermissions"]);

// permissionDecision is bucketed into the closed {allow, deny, ask} tally. Anything else is ignored.
type DecisionBucket = "allow" | "deny" | "ask";
function bucketDecision(d: unknown): DecisionBucket | null {
  if (d === "allow") return "allow";
  if (d === "deny") return "deny";
  if (d === "ask") return "ask";
  return null;
}

/** Pull the text of a tool_result block's content, which may be a string or an array of text parts.
 *  Used ONLY for categorisation — the returned text is never emitted. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
      .join(" ");
  }
  return "";
}

/** Iterate the tool_result blocks of an entry's message content (tool results ride on user entries). */
function* toolResults(entry: TranscriptEntry): Generator<{ isError: boolean; text: string }> {
  const msg = entry.message;
  if (!msg || typeof msg !== "object") return;
  const content = (msg as { content?: unknown }).content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "tool_result") {
      const b = block as { is_error?: unknown; content?: unknown };
      yield { isError: b.is_error === true, text: resultText(b.content) };
    }
  }
}

/**
 * Derive the single friction-record row for one session transcript. Returns null when the transcript
 * carries no friction signal at all AND no permission-mode context (nothing to record — honest
 * under-capture). Categorised counts only; no free-text.
 *
 * `attribution` carries the resolved `harness_id` (IU-A2a) onto the row — null when uncaptured, so a
 * same-named carrier's friction never collides with another harness's across the fleet.
 */
export function deriveFrictionRow(
  entries: TranscriptEntry[],
  meta: TranscriptMeta,
  attribution: AttributionTriple,
): FrictionRow | null {
  let permission_denials = 0;
  let rejected_calls = 0;
  let tool_errors_upstream = 0;
  let tool_errors_local = 0;
  const decisions = { allow: 0, deny: 0, ask: 0 };
  let permission_mode = "";

  for (const entry of entries) {
    // Permission-mode context — first conforming mode seen is the session's recorded mode.
    if (permission_mode === "" && typeof entry.permissionMode === "string" && PERMISSION_MODES.has(entry.permissionMode)) {
      permission_mode = entry.permissionMode;
    }
    // Structured permission decision where present.
    const b = bucketDecision(entry.permissionDecision);
    if (b) decisions[b] += 1;

    // Friction from tool_result blocks. Denial / rejection classify as today; a REMAINING generic error
    // splits by origin (DR8) — an upstream-marker match → upstream, else DEFAULT local (counted there).
    for (const tr of toolResults(entry)) {
      if (!tr.isError) continue;
      if (tr.text.includes(DENIAL_MARKER)) permission_denials += 1;
      else if (tr.text.includes(REJECTION_MARKER)) rejected_calls += 1;
      else if (UPSTREAM_MARKERS.some((mk) => tr.text.includes(mk))) tool_errors_upstream += 1;
      else tool_errors_local += 1;
    }
  }

  // The origin split partitions the generic tool errors; `tool_errors` stays the total (upstream + local).
  const tool_errors = tool_errors_upstream + tool_errors_local;
  const hasSignal =
    permission_denials > 0 ||
    rejected_calls > 0 ||
    tool_errors > 0 ||
    decisions.allow > 0 ||
    decisions.deny > 0 ||
    decisions.ask > 0 ||
    permission_mode !== "";
  if (!hasSignal) return null;

  return {
    ts: meta.firstTs ?? meta.lastTs ?? "",
    kind: "friction-record",
    session: meta.sessionId,
    carrier: attribution.carrier, // IU-3 (DR7) — single-span-or-null carrier (never mislabelled)
    harness_id: attribution.harness_id, // IU-A2a — the fleet-wide key; null when uncaptured (honest)
    permission_denials,
    rejected_calls,
    tool_errors,
    tool_errors_upstream, // IU-3 (DR8) — origin split; upstream + local === tool_errors
    tool_errors_local, // …the unmatched/default-local count (the unclassified-error counter)
    permission_decisions: decisions,
    permission_mode,
    v: ANALYZER_EVENT_V,
  };
}

// ── IU-A3 — the first-class gate-wait event ──────────────────────────────────────────────────────

// A gate-bearing node emits a bounded `[gate-wait:<gate-id>]` marker into the transcript when it
// surfaces a gate and pauses for the operator. The gate id is ID_RE-clean (the bounded marker token),
// so a hostile free-text gate name cannot ride in (locality §9 S1). `g` flag — a transcript may carry
// several gate-waits across its monotonic entry order.
const GATE_WAIT_RE = /\[gate-wait:([A-Za-z0-9][A-Za-z0-9._-]{0,63})\]/g;

/** The active node-signalling skill of an entry, if it primarily opens one (Skill / Task/Agent /
 *  slash). Mirrors derive-activity's `entrySkill` primary signals — used to TAG a gate-wait with the
 *  node the wait occurred under, by tracking the last primary skill seen in the transcript's MONOTONIC
 *  entry order. The `stack-graph:` plugin prefix is stripped at EVERY source via the shared
 *  `stripSgNamespace` + `SLASH_CMD_RE` grammar (schema.ts, one source with `entrySkill`), so a
 *  `stack-graph:<id>` invocation resolves to the bare node id and matches `nodeIds` — the gate-wait tag
 *  is no longer dark for a prefixed invocation. The attributionSkill fallback is intentionally NOT used
 *  here (it toggles per-message and would mis-tag); an untagged gate-wait carries node:null (honest
 *  under-capture, never a wrong node). */
function primarySkillOf(entry: TranscriptEntry): string | null {
  const msg = entry.message;
  const content = msg && typeof msg === "object" ? (msg as { content?: unknown }).content : undefined;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: unknown; name?: unknown; input?: unknown; text?: unknown };
      if (b.type === "tool_use" && b.name === "Skill" && b.input && typeof b.input === "object") {
        const s = (b.input as { skill?: unknown }).skill;
        if (typeof s === "string" && s !== "") return stripSgNamespace(s);
      }
      if (b.type === "tool_use" && (b.name === "Task" || b.name === "Agent") && b.input && typeof b.input === "object") {
        const st = (b.input as { subagent_type?: unknown }).subagent_type;
        if (typeof st === "string" && st !== "") return stripSgNamespace(st);
      }
      if (b.type === "text" && typeof b.text === "string") {
        const m = b.text.match(SLASH_CMD_RE);
        if (m) return stripSgNamespace(m[1]);
      }
    }
  }
  if (typeof content === "string") {
    const m = content.match(SLASH_CMD_RE);
    if (m) return stripSgNamespace(m[1]);
  }
  return null;
}

/** Pull every text fragment of an entry's message content (string or text blocks), joined — scanned
 *  ONLY for the bounded gate-wait marker; no free-text is ever emitted (the matched gate id is
 *  ID_RE-validated before it crosses into a row). */
function entryText(entry: TranscriptEntry): string {
  const msg = entry.message;
  const content = msg && typeof msg === "object" ? (msg as { content?: unknown }).content : undefined;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
      .join("\n");
  }
  return "";
}

/**
 * IU-A3 — derive the FIRST-CLASS gate-wait rows for ONE transcript. Walks the transcript's entries in
 * MONOTONIC ENTRY ORDER (never a wall-clock window across transcripts), tracking the last primary
 * node-skill seen so each gate-wait is tagged with the node it occurred under (or null). For every
 * `[gate-wait:<gate-id>]` marker found, emits one `gate-wait` row keyed on the attribution triple
 * (carries `harness_id`, IU-A2a).
 *
 * This is DELIBERATELY DISTINCT from `deriveStallRows`: a stall is a CROSS-transcript WALL-CLOCK gap
 * between two sessions; a gate-wait is a SINGLE-transcript first-class named-gate event. A gate-wait
 * is therefore NEVER reclassified as — nor folded into — a wall-clock stall (the design's explicit
 * contrast). Returns [] when the transcript carries no gate-wait marker (honest under-capture).
 *
 * `nodeIds` (optional) restricts the node TAG to graph nodes — a wait under a non-graph skill is
 * tagged node:null (never a wrong/invented node). When omitted, the last primary skill is used as-is.
 */
export function deriveGateWaitRows(
  entries: TranscriptEntry[],
  meta: TranscriptMeta,
  attribution: AttributionTriple,
  nodeIds?: ReadonlySet<string>,
): GateWaitRow[] {
  const rows: GateWaitRow[] = [];
  let activeNode: string | null = null;

  for (const entry of entries) {
    // Track the active node in monotonic order BEFORE scanning this entry for a marker (the marker
    // rides the gate-bearing node's own turn, so the node opened on/at this entry is the right tag).
    const sk = primarySkillOf(entry);
    if (sk) activeNode = nodeIds ? (nodeIds.has(sk) ? sk : activeNode) : sk;

    const text = entryText(entry);
    if (text === "") continue;
    GATE_WAIT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = GATE_WAIT_RE.exec(text)) !== null) {
      const gate = m[1];
      if (!ID_RE.test(gate)) continue; // bounded id only — a non-conforming gate name never crosses in
      const node = activeNode && nodeIds && !nodeIds.has(activeNode) ? null : activeNode;
      rows.push({
        ts: normalizeTs(entry.timestamp) ?? meta.firstTs ?? meta.lastTs ?? "",
        kind: "gate-wait",
        gate,
        node,
        session: meta.sessionId,
        carrier: attribution.carrier,
        carrier_kind: attribution.carrier_kind,
        arc: attribution.arc,
        harness_id: attribution.harness_id, // IU-A2a — the fleet-wide key; null when uncaptured (honest)
        v: ANALYZER_EVENT_V,
      });
    }
  }
  return rows;
}
