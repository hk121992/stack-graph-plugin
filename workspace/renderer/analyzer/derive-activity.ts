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

import { ANALYZER_EVENT_V } from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, ActivityRow, AttributionTriple } from "./schema.ts";
import { normalizeTs } from "./schema.ts";

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
 *   (input.subagent_type), 4. the attributionSkill field. Returns {skill, primary} or null. */
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
        if (typeof s === "string" && s !== "") return { skill: s, primary: true };
      }
      // Task / Agent dispatch → input.subagent_type (a dispatch is its own kind of node-activity).
      if (b.type === "tool_use" && (b.name === "Task" || b.name === "Agent") && b.input && typeof b.input === "object") {
        const st = (b.input as { subagent_type?: unknown }).subagent_type;
        if (typeof st === "string" && st !== "") return { skill: st, primary: true };
      }
      // Slash invocation → <command-name>/<skill></command-name> in a user text block.
      if (b.type === "text" && typeof b.text === "string") {
        const m = b.text.match(/<command-name>\/?([A-Za-z0-9][A-Za-z0-9._-]{0,63})<\/command-name>/);
        if (m) return { skill: m[1], primary: true };
      }
    }
  }
  // A bare string content can also carry a slash command.
  if (typeof content === "string") {
    const m = content.match(/<command-name>\/?([A-Za-z0-9][A-Za-z0-9._-]{0,63})<\/command-name>/);
    if (m) return { skill: m[1], primary: true };
  }

  // Fallback: attributionSkill (per-message, toggling — coalesced by the caller).
  if (typeof entry.attributionSkill === "string" && entry.attributionSkill !== "") {
    return { skill: entry.attributionSkill, primary: false };
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
 * recorded (as a span) but not projected against a node. `outcome` / `gates` are honestly
 * UNDER-CAPTURED here (layer 2, §7) — the analyzer does not invent them, so they are null / [].
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
      outcome: null,
      gates: [] as string[],
      v: ANALYZER_EVENT_V,
    };
    rows.push({ ts: span.enterTs, kind: "enter", ...base });
    rows.push({ ts: span.exitTs, kind: "exit", ...base });
  }
  return rows;
}
