// derive-tokens.ts — token / cache / cost rows (Cluster A §3.1; replaces #21's hooks).
//
// Reuses lib/transcript-usage.ts as the one dedup core — this module adds NO token parsing of its own,
// and (IU-3) reads that core off the ALREADY-PARSED `entries` (`summarizeUsageByMessageEntries`), so the
// message-grain in-node scan and the whole-file rule-c scan share ONE parse — no second file read.
// IU-2 (DR7) makes node-token attribution SPAN-TRUE via `in_node`: a top-level session is scored at
// MESSAGE grain (a message is in-node iff its prefix-stripped `attributionSkill` ∈ the node set), a
// dispatched subagent WHOLE-FILE via three dispatch rules. Every sum rides the one pinned last-wins
// dedup, so KPI-1's numerator (Σ in_node) and denominator (Σ total) agree with kpi-manual.py.
//
// IU-3 (DR7/DR10) adds two splits over IU-2's summer, additively:
//   • PER CARRIER SPAN — a top-level session that touched carriers A then B emits ONE `session-usage`
//     row per carrier span (plus a null-carrier row for the unattributed head/gap), so a multi-carrier
//     session mislabels neither half and Σ token_usage.total over the rows === the transcript total.
//   • STAGE — every usage row carries `attribution.stage` (the dispatch envelope's `stage=`, or null),
//     so KPI-5's build rollup (IU-8) can sum `stage:"build"` rows alone: a `stage:"lens"` sub-dispatch
//     and a null-stage envelope-less dispatch stay OUT of the build-cost reading.

import { summarizeUsageByMessageEntries } from "../lib/transcript-usage.ts";
import type { UsageComponents, MessageSumResult } from "../lib/transcript-usage.ts";
import { ANALYZER_EVENT_V, NULL_ATTRIBUTION, stripSgNamespace } from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta, UsageRow, AttributionTriple } from "./schema.ts";
import type { CarrierSpan } from "./attribute.ts";

/** The dominant model of a by_model breakdown = the model with the greatest total. Deterministic
 *  tie-break: lexicographically-smallest model id wins, so the row is byte-stable across runs. */
export function dominantModel(byModel: Record<string, UsageComponents>): string {
  let best: string | null = null;
  let bestTotal = -1;
  for (const model of Object.keys(byModel).sort()) {
    const t = byModel[model].total;
    if (t > bestTotal) {
      bestTotal = t;
      best = model;
    }
  }
  return best ?? "unknown";
}

/** Shape a usage total + scope + in-node share into the publisher's usage-row contract (§3.1).
 *  cumulative is ALWAYS false (the batch sees the settled transcript). The raw session id is carried
 *  (local-only, gitignored log); the publisher anonymises at projection. */
function usageRow(
  kind: UsageRow["kind"],
  scopeId: string,
  meta: TranscriptMeta,
  attribution: AttributionTriple,
  usage: UsageComponents,
  model: string,
  inNode: number,
): UsageRow {
  return {
    ts: meta.firstTs ?? meta.lastTs ?? "",
    kind,
    scope_id: scopeId,
    session: meta.sessionId,
    carrier: attribution.carrier,
    carrier_kind: attribution.carrier_kind,
    arc: attribution.arc,
    harness_id: attribution.harness_id, // IU-A2a — the fleet-wide key; null when uncaptured (honest)
    model,
    cumulative: false,
    token_usage: {
      input: usage.input,
      output: usage.output,
      cache_creation_5m: usage.cache_creation_5m,
      cache_creation_1h: usage.cache_creation_1h,
      cache_read: usage.cache_read,
      total: usage.total,
    },
    in_node: inNode, // IU-2 (DR7) — span-true node-token share; ≤ token_usage.total
    stage: attribution.stage, // IU-3 (DR10) — the dispatch stage (envelope), or null for a session row
    v: ANALYZER_EVENT_V,
  };
}

/** IU-2 (DR7) — options for token derivation. */
export interface DeriveTokenOptions {
  /** The known graph-node id set — the in-node membership test. */
  nodeIds: ReadonlySet<string>;
  /** Rule (a): true iff a dispatched subagent's PARENT dispatched it with a `subagent_type` ∈ the node
   *  set. Resolved by the caller via the corpus prompt-key join (cross-transcript); false for a
   *  top-level transcript. */
  dispatchedAsNode: boolean;
  /** IU-3 (DR7) — the transcript's carrier spans (from `attributeTranscript(...).spans`), used to split
   *  a TOP-LEVEL session's usage per carrier span. Ignored for a subagent (dispatched usage is
   *  whole-file). Defaults to none — a session with no spans emits its single null-carrier row. */
  spans?: readonly CarrierSpan[];
}

/** IU-2 (DR7) — the token derivation for one transcript: its usage rows plus the transcript's
 *  last≠max dedup divergence count (the caller aggregates it per session into the
 *  `token-dedup-divergence` trust-strip counter). */
export interface TokenDerivation {
  rows: UsageRow[];
  lastNeMaxDivergences: number;
}

/**
 * Derive the token rows for one transcript, with span-true in-node attribution (IU-2 / DR7).
 *  - A TOP-LEVEL session transcript → one `session-usage` row. in_node is scored at MESSAGE grain:
 *    Σ over the deduped messages whose prefix-stripped `attributionSkill` ∈ the node set.
 *  - A SUBAGENT (dispatched) transcript → a `dispatch-usage` row AND, when the dispatch resolves an
 *    IU id, a `unit-usage` row. in_node is WHOLE-FILE (all-or-nothing): total when the subagent
 *    resolves to a node via rules (a) parent subagent_type ∈ node set, (b) the subagent invokes a
 *    node via Skill, or (c) any message carries a node attributionSkill; else 0.
 *
 * One settled row per scope, so the full-rewrite in analyze.ts never duplicates a (session, scope)
 * pair (§9 idempotency).
 */
export function deriveTokenRows(
  entries: TranscriptEntry[],
  meta: TranscriptMeta,
  attribution: AttributionTriple,
  opts: DeriveTokenOptions,
): TokenDerivation {
  // The ONE parse (IU-3): score message grain off the already-parsed `entries` — no second file read.
  const summary = summarizeUsageByMessageEntries(entries);
  // No assistant usage in this transcript → no token rows (honest under-capture).
  if (summary.counted_messages === 0) {
    return { rows: [], lastNeMaxDivergences: summary.last_ne_max_divergences };
  }

  const model = dominantModel(summary.by_model);
  const usage = summary.total;

  const rows: UsageRow[] = [];

  if (meta.isSubagent) {
    // Whole-file (all-or-nothing): the subagent is in-node iff it resolves to a graph node via
    // rule (a) — its parent dispatched it with a node subagent_type (caller-resolved prompt-key join) —
    // or rules (b)/(c) it invokes a node via Skill / carries a node attributionSkill.
    const resolved = opts.dispatchedAsNode || subagentInvokesNode(entries, opts.nodeIds);
    const inNode = resolved ? usage.total : 0;
    const dispatchScope = attribution.carrier ?? meta.sessionId;
    rows.push(usageRow("dispatch-usage", dispatchScope, meta, attribution, usage, model, inNode));
    if (attribution.iu) {
      rows.push(usageRow("unit-usage", attribution.iu, meta, attribution, usage, model, inNode));
    }
  } else {
    // Top-level: split usage per carrier span (IU-3 / DR7) — one session-usage row per carrier plus a
    // null-carrier remainder, so Σ token_usage.total reconciles to the transcript total and a session
    // touching A then B mislabels neither half. With no spans this is one null-carrier row (the prior
    // whole-session behaviour). `attribution` is ignored here — the per-span carrier comes from `spans`.
    rows.push(...sessionSpanRows(summary, meta, opts.spans ?? [], opts.nodeIds, model));
  }

  return { rows, lastNeMaxDivergences: summary.last_ne_max_divergences };
}

// ── IU-3 (DR7) — per-carrier-span session usage ───────────────────────────────────────────────────

/** The carrier of the span containing entry `index`, or null (the honest-null head, or a gap after a
 *  manifest-rejected re-target boundary). Spans are non-overlapping and monotonic in entry order, so
 *  the first containing span is THE span. */
function carrierSpanAt(spans: readonly CarrierSpan[], index: number): string | null {
  for (const s of spans) {
    if (index >= s.fromIndex && (s.toIndex === null || index < s.toIndex)) return s.carrier;
  }
  return null;
}

/** Split a top-level transcript's deduped messages into per-carrier-span `session-usage` rows: each
 *  message books to the span its (last-wins) ENTRY INDEX falls in, else the null-carrier remainder.
 *  One row per DISTINCT carrier (non-contiguous same-carrier spans coalesce) plus the remainder, so
 *  Σ token_usage.total over the rows === the transcript total (reconciliation); `in_node` stays
 *  message-grain within the bucket. A carrier row scopes to `<session>#<carrier>` (the remainder keeps
 *  the bare session id) so two spans of one session — and one carrier across two sessions — stay
 *  DISTINCT (session, scope) pairs; the publisher keys usage by (kind, scope_id), so a shared scope
 *  would collapse them. Attended sessions carry no envelope, so every row's stage is null. */
function sessionSpanRows(
  summary: MessageSumResult,
  meta: TranscriptMeta,
  spans: readonly CarrierSpan[],
  nodeIds: ReadonlySet<string>,
  model: string,
): UsageRow[] {
  interface Bucket { carrier: string | null; usage: UsageComponents; inNode: number; }
  const NULL_KEY = " "; // a bucket key no ID_RE-clean carrier id can collide with
  const buckets = new Map<string, Bucket>();
  for (const m of summary.messages) {
    const carrier = carrierSpanAt(spans, m.index);
    let bk = buckets.get(carrier ?? NULL_KEY);
    if (!bk) {
      bk = { carrier, usage: zeroComponents(), inNode: 0 };
      buckets.set(carrier ?? NULL_KEY, bk);
    }
    addComponents(bk.usage, m.usage);
    if (m.label && nodeIds.has(stripSgNamespace(m.label))) bk.inNode += m.usage.total;
  }
  const rows: UsageRow[] = [];
  for (const bk of buckets.values()) {
    const attribution: AttributionTriple = { ...NULL_ATTRIBUTION, carrier: bk.carrier };
    const scopeId = bk.carrier === null ? meta.sessionId : `${meta.sessionId}#${bk.carrier}`;
    rows.push(usageRow("session-usage", scopeId, meta, attribution, bk.usage, model, bk.inNode));
  }
  return rows;
}

/** A fresh zero component set + a disjoint in-place add — the per-span bucket accumulator, kept local
 *  (a few lines of pure arithmetic) so this analyzer module never reaches into the portable summer's
 *  internals; `summary.total` still proves the whole-file sum these buckets reconcile to. */
function zeroComponents(): UsageComponents {
  return { input: 0, output: 0, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, total: 0 };
}
function addComponents(target: UsageComponents, src: UsageComponents): void {
  target.input += src.input;
  target.output += src.output;
  target.cache_creation_5m += src.cache_creation_5m;
  target.cache_creation_1h += src.cache_creation_1h;
  target.cache_read += src.cache_read;
  target.total += src.total;
}

// ── IU-2 (DR7) whole-file dispatch-rule helpers ─────────────────────────────────────────────────

/** Concatenate an entry's text — array `content` text blocks, or a bare string `content`. */
function entryText(entry: TranscriptEntry): string {
  const msg = entry.message;
  const content = msg && typeof msg === "object" ? (msg as { content?: unknown }).content : undefined;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    let out = "";
    for (const block of content) {
      if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
        const t = (block as { text?: unknown }).text;
        if (typeof t === "string") out += t;
      }
    }
    return out;
  }
  return "";
}

/** Rule-(a) join key — a dispatched subagent's first user-message text, trimmed. The parent's Task/Agent
 *  `input.prompt` that spawned it carries the SAME text, so the two join on this key ACROSS transcripts
 *  (a host-recorded link that does not depend on uuid threading). Null when there is no user message. */
export function dispatchPromptKey(entries: TranscriptEntry[]): string | null {
  for (const e of entries) {
    if (e.type === "user") {
      const t = entryText(e).trim();
      return t === "" ? null : t;
    }
  }
  return null;
}

/** Rule-(a) source — the graph-node dispatches a transcript issued: each `Task`/`Agent` tool_use, keyed
 *  by the prompt it passed (the child's join key) and its prefix-stripped `subagent_type`. The caller
 *  builds a corpus-wide promptKey→subagent_type map from these and tests node-set membership. */
export function collectDispatchNodeTypes(entries: TranscriptEntry[]): Array<{ promptKey: string; subagentType: string }> {
  const out: Array<{ promptKey: string; subagentType: string }> = [];
  for (const e of entries) {
    const msg = e.message;
    const content = msg && typeof msg === "object" ? (msg as { content?: unknown }).content : undefined;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: unknown; name?: unknown; input?: unknown };
      if (b.type === "tool_use" && (b.name === "Task" || b.name === "Agent") && b.input && typeof b.input === "object") {
        const inp = b.input as { subagent_type?: unknown; prompt?: unknown };
        if (typeof inp.subagent_type === "string" && inp.subagent_type !== "" && typeof inp.prompt === "string") {
          const promptKey = inp.prompt.trim();
          if (promptKey !== "") out.push({ promptKey, subagentType: stripSgNamespace(inp.subagent_type) });
        }
      }
    }
  }
  return out;
}

/** Rules (b)+(c) — does a subagent transcript itself resolve to a graph node? (b) it invokes a node via a
 *  `Skill` tool_use; (c) any entry carries a node `attributionSkill`. Either ⇒ the whole file is in-node. */
export function subagentInvokesNode(entries: TranscriptEntry[], nodeIds: ReadonlySet<string>): boolean {
  for (const e of entries) {
    // rule (c): a node attributionSkill on any entry.
    if (typeof e.attributionSkill === "string" && e.attributionSkill !== "" && nodeIds.has(stripSgNamespace(e.attributionSkill))) {
      return true;
    }
    // rule (b): a Skill tool_use naming a node.
    const msg = e.message;
    const content = msg && typeof msg === "object" ? (msg as { content?: unknown }).content : undefined;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: unknown; name?: unknown; input?: unknown };
      if (b.type === "tool_use" && b.name === "Skill" && b.input && typeof b.input === "object") {
        const s = (b.input as { skill?: unknown }).skill;
        if (typeof s === "string" && s !== "" && nodeIds.has(stripSgNamespace(s))) return true;
      }
    }
  }
  return false;
}
