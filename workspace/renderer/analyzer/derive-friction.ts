// derive-friction.ts — per-session friction rows (Cluster A §3.2; replaces #28's friction hook).
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

import { ANALYZER_EVENT_V } from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, FrictionRow } from "./schema.ts";

// The two hard categorisation strings (substring match — robust to the variable command/reason text
// that precedes/follows). We match ONLY to categorise; the matched text is NEVER emitted.
const DENIAL_MARKER = "has been denied.";
const REJECTION_MARKER = "doesn't want to proceed";

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
 */
export function deriveFrictionRow(entries: TranscriptEntry[], meta: TranscriptMeta): FrictionRow | null {
  let permission_denials = 0;
  let rejected_calls = 0;
  let tool_errors = 0;
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

    // Friction from tool_result blocks.
    for (const tr of toolResults(entry)) {
      if (!tr.isError) continue;
      if (tr.text.includes(DENIAL_MARKER)) permission_denials += 1;
      else if (tr.text.includes(REJECTION_MARKER)) rejected_calls += 1;
      else tool_errors += 1;
    }
  }

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
    permission_denials,
    rejected_calls,
    tool_errors,
    permission_decisions: decisions,
    permission_mode,
    v: ANALYZER_EVENT_V,
  };
}
