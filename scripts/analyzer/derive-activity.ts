// derive-activity.ts — node-activity spans → enter/exit rows (Cluster A §3.4).
//
// A stack-graph node IS a skill, so a node enter is one of:
//   - a `Skill` tool_use (input {skill, args})  — the cleanest signal (verified real shape);
//   - a `<command-name>/<skill></command-name>` user entry (slash invocation);
//   - a `Task`/`Agent` tool_use (a subagent dispatch).
// The `attributionSkill` field is the FALLBACK signal: it toggles per-message (browse→null→browse),
// so it must be COALESCED into contiguous spans tolerating null gaps — a naive pair would over-count
// enters (the §9 "32 toggles → one span" hazard). The primary signal is Skill/slash; attributionSkill
// fills gaps.
//
// A skill that matches a known graph node id emits enter/exit rows against that node. A non-graph
// skill (browse, etc.) is recorded as a span but NOT projected against a node (the publisher's ID_RE
// + node lookup drop unknown ids; we simply don't emit a node row for it).

import { ANALYZER_EVENT_V, RECORD_GATE_NODE } from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, ActivityRow, NodeActivityRow, AttributionTriple, GateEnactmentRow } from "./schema.ts";
// The `stack-graph:` namespace-strip + slash grammar is single-sourced in schema.ts (alongside ID_RE),
// so this parser and derive-friction's `primarySkillOf` resolve a prefixed invocation identically.
import { normalizeTs, stripSgNamespace, SLASH_CMD_RE } from "./schema.ts";
import type { GateProposal } from "./scan-gate-tags.ts";

/** A coalesced run of activity attributed to a single skill. */
export interface ActivitySpan {
  skill: string;
  enterTs: string;
  exitTs: string;
  /** True when a primary (Skill/slash/Task) signal opened this span; false when only
   *  attributionSkill carried it. Primary spans are the trustworthy ones. */
  primary: boolean;
}

/** Pull the active-skill signal for one entry, in priority order:
 *   1. a Skill tool_use (input.skill), 2. a slash <command-name>, 3. a Task/Agent tool_use
 *   (input.subagent_type), 4. the attributionSkill field. The `stack-graph:` plugin prefix is stripped
 *   at EVERY source (the keystone), so a `stack-graph:<id>` invocation resolves to the bare node id.
 *   Returns {skill, primary} or null. */
function entrySkill(entry: TranscriptEntry): { skill: string; primary: boolean } | null {
  const msg = entry.message;
  const content = msg && typeof msg === "object" ? (msg as { content?: unknown }).content : undefined;

  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: unknown; name?: unknown; input?: unknown; text?: unknown };
      // Skill tool_use → input.skill (verified real shape is {skill, args}).
      if (b.type === "tool_use" && b.name === "Skill" && b.input && typeof b.input === "object") {
        const s = (b.input as { skill?: unknown }).skill;
        if (typeof s === "string" && s !== "") return { skill: stripSgNamespace(s), primary: true };
      }
      // Task / Agent dispatch → input.subagent_type (a dispatch is its own kind of node-activity).
      if (b.type === "tool_use" && (b.name === "Task" || b.name === "Agent") && b.input && typeof b.input === "object") {
        const st = (b.input as { subagent_type?: unknown }).subagent_type;
        if (typeof st === "string" && st !== "") return { skill: stripSgNamespace(st), primary: true };
      }
      // Slash invocation → <command-name>/<skill></command-name> in a user text block (SLASH_CMD_RE
      // admits the optional stack-graph: prefix; stripSgNamespace normalises it to the bare node id).
      if (b.type === "text" && typeof b.text === "string") {
        const m = b.text.match(SLASH_CMD_RE);
        if (m) return { skill: stripSgNamespace(m[1]), primary: true };
      }
    }
  }
  // A bare string content can also carry a slash command.
  if (typeof content === "string") {
    const m = content.match(SLASH_CMD_RE);
    if (m) return { skill: stripSgNamespace(m[1]), primary: true };
  }

  // Fallback: attributionSkill (per-message, toggling — coalesced by the caller).
  if (typeof entry.attributionSkill === "string" && entry.attributionSkill !== "") {
    return { skill: stripSgNamespace(entry.attributionSkill), primary: false };
  }
  return null;
}

/**
 * Build coalesced activity spans for one transcript. Consecutive entries attributed to the SAME skill
 * (allowing intervening null/None entries within the run) collapse into one span: enter = first ts,
 * exit = last ts of the run. A run ends when a DIFFERENT skill is seen. A span is `primary` if any
 * entry in the run carried a primary (Skill/slash/Task) signal.
 *
 * This is the §9 coalescing guarantee: a browse run with N attributionSkill toggles yields ONE span.
 */
export function deriveActivitySpans(entries: TranscriptEntry[]): ActivitySpan[] {
  const spans: ActivitySpan[] = [];
  let cur: { skill: string; enterTs: string; exitTs: string; primary: boolean } | null = null;

  for (const entry of entries) {
    const ts = normalizeTs(entry.timestamp);
    const sig = entrySkill(entry);

    if (!sig) {
      // A null/None entry does not break the current span (tolerate gaps) but can extend its exit
      // only if it falls within the run — we conservatively do NOT advance exit on a null entry, so
      // the span ends at the last ATTRIBUTED activity (deterministic, browse-toggle-safe).
      continue;
    }

    if (cur && cur.skill === sig.skill) {
      // Same skill — extend the run.
      if (ts) cur.exitTs = ts;
      cur.primary = cur.primary || sig.primary;
      continue;
    }

    // A different skill — close the current span and open a new one.
    if (cur) spans.push({ skill: cur.skill, enterTs: cur.enterTs, exitTs: cur.exitTs, primary: cur.primary });
    cur = { skill: sig.skill, enterTs: ts ?? "", exitTs: ts ?? "", primary: sig.primary };
  }
  if (cur) spans.push({ skill: cur.skill, enterTs: cur.enterTs, exitTs: cur.exitTs, primary: cur.primary });
  return spans;
}

/**
 * Emit enter/exit rows for spans whose skill matches a known graph node id. A non-graph skill is
 * recorded (as a span) but not projected against a node. `gates` is honestly UNDER-CAPTURED here
 * (layer 2, §7) — the analyzer does not invent it, so it is []. (`outcome` was dropped in IU-7/DR12 —
 * it was hard-null on every row ever; gate outcomes ride the gate-enactment row.)
 */
export function deriveActivityRows(
  entries: TranscriptEntry[],
  meta: TranscriptMeta,
  attribution: AttributionTriple,
  nodeIds: ReadonlySet<string>,
): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const span of deriveActivitySpans(entries)) {
    if (!nodeIds.has(span.skill)) continue; // activity-but-not-node (browse, qa-only, …)
    if (span.enterTs === "") continue; // no usable timestamp → cannot place the span
    const base = {
      node: span.skill,
      session: meta.sessionId,
      carrier: attribution.carrier,
      carrier_kind: attribution.carrier_kind,
      arc: attribution.arc,
      harness_id: attribution.harness_id, // IU-A2a — the fleet-wide key; null when uncaptured (honest)
      gates: [] as string[], // IU-7 (DR12): `outcome` dropped (hard-null on every row ever; gate outcomes ride the gate-enactment row)
      v: ANALYZER_EVENT_V,
    };
    rows.push({ ts: span.enterTs, kind: "enter", ...base });
    rows.push({ ts: span.exitTs, kind: "exit", ...base });
  }
  return rows;
}

/**
 * IU-A3 — sum a node's activity over ALL N of its non-contiguous spans WITHIN ONE TRANSCRIPT into one
 * settled `node-activity` total. `deriveActivitySpans` already coalesces the transcript into spans in
 * the transcript's MONOTONIC ENTRY ORDER (a run ends when a different skill is seen, so a node entered,
 * left, and RE-ENTERED yields two distinct spans). This reducer groups those spans by node and emits
 * ONE row per node carrying `active_ms` = Σ(exit−enter) over the node's N spans and `span_count` = N.
 *
 * The windowing is the transcript's own entry order — `deriveActivitySpans(entries)` walks THIS
 * transcript's entries only and never consults another transcript's clock. So two concurrently
 * dispatched transcripts, even with wall-clock-overlapping spans, each produce their own independent
 * node-activity totals: one transcript's active_ms can NEVER be summed into the other's (the
 * load-bearing concurrent-dispatch no-double-count property — contrast `derive-stalls.ts`, which IS
 * cross-transcript and wall-clock, and is therefore the wrong tool for friction attribution).
 *
 * Only graph-node skills (in `nodeIds`) are projected; a non-graph skill (browse, …) is summed as a
 * span but not emitted as a node row, exactly as `deriveActivityRows`. A span with no usable enter
 * timestamp contributes 0 ms (it still counts toward span_count — the re-entry happened).
 */
export function deriveNodeActivityRows(
  entries: TranscriptEntry[],
  meta: TranscriptMeta,
  attribution: AttributionTriple,
  nodeIds: ReadonlySet<string>,
): NodeActivityRow[] {
  // Accumulate per node, in first-seen order, over the per-transcript monotonic spans.
  const acc = new Map<string, { firstTs: string; active_ms: number; span_count: number; primary: boolean }>();

  for (const span of deriveActivitySpans(entries)) {
    if (!nodeIds.has(span.skill)) continue; // activity-but-not-node — summed as a span, not a node row
    const enterMs = span.enterTs ? Date.parse(span.enterTs) : NaN;
    const exitMs = span.exitTs ? Date.parse(span.exitTs) : NaN;
    // A span's duration: exit−enter when both parse and exit ≥ enter, else 0 (a single-instant or
    // timestamp-less span still happened — it counts toward span_count, contributes 0 ms).
    const dur = Number.isFinite(enterMs) && Number.isFinite(exitMs) && exitMs >= enterMs ? exitMs - enterMs : 0;

    const prev = acc.get(span.skill);
    if (prev) {
      prev.active_ms += dur; // Σ over the node's N non-contiguous spans (the N-span sum)
      prev.span_count += 1; // N grows on each re-entry
      prev.primary = prev.primary || span.primary;
    } else {
      acc.set(span.skill, {
        firstTs: span.enterTs || meta.firstTs || "",
        active_ms: dur,
        span_count: 1,
        primary: span.primary,
      });
    }
  }

  const rows: NodeActivityRow[] = [];
  for (const [node, a] of acc) {
    if (a.firstTs === "") continue; // no usable timestamp anywhere → cannot place the row
    rows.push({
      ts: a.firstTs, // the FIRST span's enter — the settled total is anchored at first entry
      kind: "node-activity",
      node,
      session: meta.sessionId,
      carrier: attribution.carrier,
      carrier_kind: attribution.carrier_kind,
      arc: attribution.arc,
      harness_id: attribution.harness_id, // IU-A2a — the fleet-wide key; null when uncaptured (honest)
      active_ms: a.active_ms,
      span_count: a.span_count,
      primary: a.primary,
      v: ANALYZER_EVENT_V,
    });
  }
  return rows;
}

// ── IU-6 (gate-channel-e2e) — the gate-enactment row (node-tagged record-gate) ────────────────────────

/**
 * Shape the PROVENANCE-BOUND `<sg-gate>` proposals (scan-gate-tags.ts) into gate-enactment rows, each
 * NODE-TAGGED `record-gate` (the enactment is that node's activity). The proposals already carry the
 * bounded, shape-gated fields (gate/decision/carrier/seq) and the executed-runner provenance — this
 * reducer only stamps the row shape (kind + node + v). A proposal with no usable ts is skip-emitted
 * (honest under-capture; never an empty ts the publisher would drop). Pure: same proposals in ⇒ the same
 * rows out.
 */
export function deriveGateEnactmentRows(proposals: readonly GateProposal[]): GateEnactmentRow[] {
  const rows: GateEnactmentRow[] = [];
  for (const p of proposals) {
    if (!p.ts) continue; // no placeable instant → skip (honest under-capture)
    rows.push({
      ts: p.ts,
      kind: "gate-enactment",
      node: RECORD_GATE_NODE, // the single literal — writer tag and reader row cannot drift on the node
      gate: p.gate,
      decision: p.decision,
      carrier: p.carrier,
      seq: p.seq,
      session: p.session,
      v: ANALYZER_EVENT_V,
    });
  }
  return rows;
}
