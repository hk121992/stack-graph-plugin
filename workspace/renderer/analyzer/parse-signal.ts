// parse-signal.ts — the layer-2 `<sg-signal>` verdict parser (Cluster A §7).
//
// Two signals are irreducibly MODEL JUDGMENTS the analyzer cannot derive from transcript bytes: the
// experience-contract pass/fail verdict and the trend numbers (benchmark.perf, health.quality). The
// verdict-bearing node states them as a fenced
//     <sg-signal>{"gates":[...],"metrics":{...}}</sg-signal>
// block IN ITS OWN FINAL OUTPUT/RESULT MESSAGE — not appended to any event log. The analyzer READS
// that block, gates it by SHAPE against the publisher's allowlists (TREND_SERIES /
// experience-contract), drops anything malformed, and HONESTLY UNDER-CAPTURES: absent ⇒ not recorded,
// NEVER invented.
//
// WHICH MESSAGE (§7.1). The block is read from the FINAL output/result message of the verdict node's
// OWN transcript. For a DISPATCHED node (run inside a subagent session — e.g. simulate-users under
// verify), that is the SUBAGENT transcript's final assistant message, NOT the parent's. The caller
// passes the entries of the transcript the node ran in; this module reads the last assistant message.

import { TREND_SERIES, EXPERIENCE_CONTRACT_GATE_RE } from "./schema.ts";
import type { TranscriptEntry } from "./schema.ts";

/** The validated, allowlist-gated verdict extracted from a `<sg-signal>` block. Either field may be
 *  empty/absent — only the shape-valid entries survive. */
export interface SignalVerdict {
  gates: string[];
  metrics: Record<string, number>;
}

// Exactly ONE fence wrapping a single JSON object. We match NON-greedily and then REJECT the block if
// a second fence exists (multiply-fenced ⇒ discard, §7.1). The regex is bounded to the fence tags; the
// body is JSON.parsed, never eval'd.
const SG_SIGNAL_RE = /<sg-signal>([\s\S]*?)<\/sg-signal>/;
const SG_SIGNAL_GLOBAL_RE = /<sg-signal>[\s\S]*?<\/sg-signal>/g;

/** Concatenate the text of one assistant message's content into a single string (string content or an
 *  array of {type:"text", text} blocks — the real assistant-message shape). */
function assistantText(entry: TranscriptEntry): string | null {
  const msg = entry.message;
  if (!msg || typeof msg !== "object") return null;
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
      .join("\n");
    return text;
  }
  return null;
}

/** Return the text of the FINAL assistant message in a transcript (the node's result message), or null
 *  if there is no assistant message. The §7.1 "final output/result message". */
export function finalAssistantText(entries: TranscriptEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type !== "assistant") continue;
    const t = assistantText(e);
    if (t !== null) return t;
  }
  return null;
}

/**
 * Extract + validate the `<sg-signal>` verdict from a node's final result text. Returns null when:
 *   - there is no fence, OR
 *   - more than one fence is present (multiply-fenced ⇒ discard), OR
 *   - the body is not parseable JSON / not a JSON object.
 * Otherwise returns the SHAPE-VALID subset: gates matching `experience-contract:<pass|fail>` and
 * metrics whose key is in TREND_SERIES and whose value is a finite number. Every other entry is
 * silently dropped (honest under-capture — the gate is on shape, never on the truth of the value).
 */
export function parseSignal(text: string | null): SignalVerdict | null {
  if (!text) return null;
  const all = text.match(SG_SIGNAL_GLOBAL_RE);
  if (!all || all.length !== 1) return null; // absent or multiply-fenced ⇒ discard
  const m = text.match(SG_SIGNAL_RE);
  if (!m) return null;

  let body: unknown;
  try {
    body = JSON.parse(m[1].trim());
  } catch {
    return null; // malformed JSON ⇒ discard
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const obj = body as { gates?: unknown; metrics?: unknown };

  const gates: string[] = [];
  if (Array.isArray(obj.gates)) {
    for (const g of obj.gates) {
      // Only the experience-contract gate token is read (the publisher tallies only it); a finite,
      // bounded set, so a hostile free-text gate cannot ride through. De-dup to keep the row stable.
      if (typeof g === "string" && EXPERIENCE_CONTRACT_GATE_RE.test(g) && !gates.includes(g)) {
        gates.push(g);
      }
    }
  }

  const metrics: Record<string, number> = {};
  if (obj.metrics && typeof obj.metrics === "object" && !Array.isArray(obj.metrics)) {
    for (const [k, v] of Object.entries(obj.metrics as Record<string, unknown>)) {
      // Key must be an allowlisted series; value must be a FINITE number. Anything else dropped.
      if (TREND_SERIES.has(k) && typeof v === "number" && Number.isFinite(v)) {
        metrics[k] = v;
      }
    }
  }

  // A block that parsed but carried nothing shape-valid still counts as "present but empty" — the
  // caller may treat an all-empty verdict as nothing-to-record. We return the (possibly empty) verdict
  // so the caller can distinguish "no block" (null) from "block with no valid signal" (empty).
  return { gates, metrics };
}

/**
 * Read the verdict from a transcript's final assistant message (the §7.1 entry point). Convenience
 * wrapper: finalAssistantText → parseSignal. Returns null when no block is present (or it is
 * malformed / multiply-fenced); an absent verdict is NOT recorded (honest under-capture).
 */
export function signalFromTranscript(entries: TranscriptEntry[]): SignalVerdict | null {
  return parseSignal(finalAssistantText(entries));
}

/**
 * Apply a parsed verdict to a node's enter/exit rows: populate `gates` (and `metrics` when non-empty)
 * on BOTH the enter and exit rows for that node-span — mirroring how the publisher reads the exit
 * event's gates/metrics. Mutates the rows in place and returns them. A null/empty verdict leaves the
 * rows as honestly under-captured (gates: [], no metrics).
 */
export function applyVerdictToRows<T extends { gates: string[]; metrics?: Record<string, number> }>(
  rows: T[],
  verdict: SignalVerdict | null,
): T[] {
  if (!verdict) return rows;
  for (const row of rows) {
    if (verdict.gates.length > 0) row.gates = [...verdict.gates];
    if (Object.keys(verdict.metrics).length > 0) row.metrics = { ...verdict.metrics };
  }
  return rows;
}
