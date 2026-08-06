// Deterministic transcript-usage summer — the foundation every other token-instrumentation
// component trusts (D69 / issue #21, design §1 + §5).
//
// PORTABILITY CONTRACT: this file uses ONLY node `fs` + `JSON` — NO Bun.* globals — because a
// plugin hook runs it via `node` while the renderer and tests run it via `bun`. Do not introduce
// Bun.file/Bun.* here. (Node 22 cannot execute .ts directly; the hook invokes the transpiled/JS
// form or a loader — the source stays Bun-global-free so either runtime works.)

import { readFileSync } from "node:fs";

/** The five DISJOINT token categories + their sum. `input` is the uncached remainder; the four
 *  categories never overlap, so `total = input + output + cache_creation_5m + cache_creation_1h
 *  + cache_read` (nothing is subtracted). */
export interface UsageComponents {
  input: number;
  output: number;
  cache_creation_5m: number;
  cache_creation_1h: number;
  cache_read: number;
  total: number;
}

export interface SumUsageResult extends UsageComponents {
  by_model: Record<string, UsageComponents>;
  counted_messages: number;
  /** Count of DISTINCT `message.id`s for which a duplicate occurrence was collapsed (the
   *  last-wins dedup fired ≥1 time). Surfaced by the `sg-token-usage` CLI (design §10) so a
   *  caller can see how much streamed/partial/retry de-duplication happened. */
  deduped_message_ids: number;
  /** IU-2 (DR7) — count of DISTINCT `message.id`s where the LAST-wins pick differs from what the
   *  old MAX-total-wins tie-break would have kept (the kept occurrence's total is below the id's
   *  max seen total). Keeps the retired guard visible: a nonzero value means streamed/retry
   *  duplicates were NOT monotonically growing, so the two rules disagree on that id. The trust
   *  strip (IU-8) surfaces the aggregate as the `token-dedup-divergence` counter. */
  last_ne_max_divergences: number;
  skipped_lines: number;
  warnings: string[];
}

export interface SumUsageOptions {
  /** Optional scope tag — reserved for callers that want to label the result; does not affect
   *  the math. Kept for forward-compat with the design's `sumUsage(path, {scope?})` shape. */
  scope?: string;
}

function zero(): UsageComponents {
  return { input: 0, output: 0, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, total: 0 };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Compute the disjoint component set from a raw `message.usage` (or a PostToolUse
 *  `tool_response.usage`) object. Prefers the TTL split; falls back to the flat field at the 5m
 *  bucket. `warnings` is appended to when the flat fallback is taken so the caller can surface it. */
function componentsFromUsage(
  usage: Record<string, unknown>,
  warnings: string[],
  warnTag: string,
): UsageComponents {
  const input = num(usage["input_tokens"]);
  const output = num(usage["output_tokens"]);
  const cache_read = num(usage["cache_read_input_tokens"]);

  let cache_creation_5m = 0;
  let cache_creation_1h = 0;
  const split = usage["cache_creation"];
  if (split && typeof split === "object") {
    const s = split as Record<string, unknown>;
    cache_creation_5m = num(s["ephemeral_5m_input_tokens"]);
    cache_creation_1h = num(s["ephemeral_1h_input_tokens"]);
  } else {
    // No TTL split — fall back to the flat field, attributed to the 5m bucket, and warn.
    const flat = num(usage["cache_creation_input_tokens"]);
    cache_creation_5m = flat;
    if (flat > 0) {
      warnings.push(
        `${warnTag}: cache_creation TTL split absent; attributed ${flat} flat cache_creation_input_tokens to the 5m bucket`,
      );
    }
  }

  const total = input + output + cache_creation_5m + cache_creation_1h + cache_read;
  return { input, output, cache_creation_5m, cache_creation_1h, cache_read, total };
}

/** Build a component set from a single PostToolUse `tool_response.usage` object (no dedup — the
 *  hook captures one native usage per completed sync subagent). The hook reuses this so the math
 *  lives in exactly one place. */
export function usageFromObject(usage: unknown): UsageComponents {
  if (!usage || typeof usage !== "object") return zero();
  // warnings are not surfaced here (single-object path); use a throwaway sink.
  return componentsFromUsage(usage as Record<string, unknown>, [], "usageFromObject");
}

function addInto(target: UsageComponents, src: UsageComponents): void {
  target.input += src.input;
  target.output += src.output;
  target.cache_creation_5m += src.cache_creation_5m;
  target.cache_creation_1h += src.cache_creation_1h;
  target.cache_read += src.cache_read;
  target.total += src.total;
}

// ── Per-message dedup core (IU-2 / DR7) ─────────────────────────────────────────────────────────
// The ONE place the `message.id` last-wins dedup lives. `sumUsage` (whole-file totals) and
// `summarizeUsageByMessage` (per-message grain) are both thin projections of it, so the two can
// never drift on the dedup rule — the property KPI-1 and `kpi-manual.py` depend on.

/** The minimal structural shape the dedup core reads off one entry — a raw JSONL object OR an
 *  already-parsed analyzer `TranscriptEntry` (which is structurally assignable). Declared HERE so the
 *  portable lib never imports the analyzer layer; `summarizeUsageByMessageEntries` takes an array of
 *  these so `derive-tokens` can score message-grain usage off the SAME parse the span scan reads
 *  (IU-3 — one parse per transcript, no file re-read). */
export interface RawUsageEntry {
  type?: string;
  timestamp?: string;
  attributionSkill?: string | null;
  message?: unknown;
}

/** One message after `message.id` last-wins dedup — the grain a caller scores in-node membership at.
 *  `label` is the transcript entry's `attributionSkill`, carried opaquely (this lib never interprets
 *  it; the analyzer strips the namespace and tests node-set membership). */
export interface MessageUsage {
  /** `message.id`, or null for an entry with no id (never collapsed — counted on its own). */
  id: string | null;
  model: string;
  /** The kept (last) occurrence's raw `timestamp` string, or null when the entry carried none. */
  ts: string | null;
  /** The kept occurrence's `attributionSkill` (opaque here). */
  label: string | null;
  /** IU-3 — the kept (last) occurrence's position in the SOURCE entry array (its `entries` index for the
   *  entries path; its parsed-line index for the file path). The coordinate a caller maps a message to a
   *  carrier SPAN with (`CarrierSpan` is `[fromIndex, toIndex)` over the same entry order). Last-wins, so
   *  a duplicated id carries its LAST occurrence's index — the span the kept usage actually landed in. */
  index: number;
  usage: UsageComponents;
}

/** The per-message view — the same dedup + counters as `sumUsage`, retaining the per-message records
 *  (first-seen order, so a re-run over the same file is byte-stable) so a caller can score
 *  message-grain in-node attribution (IU-2 / DR7). */
export interface MessageSumResult {
  messages: MessageUsage[];
  total: UsageComponents;
  by_model: Record<string, UsageComponents>;
  counted_messages: number;
  deduped_message_ids: number;
  last_ne_max_divergences: number;
  skipped_lines: number;
  warnings: string[];
}

/** Everything both public projections need — computed once by the core. */
interface DedupCore {
  messages: MessageUsage[];
  overall: UsageComponents;
  by_model: Record<string, UsageComponents>;
  counted_messages: number;
  deduped_message_ids: number;
  last_ne_max_divergences: number;
  skipped_lines: number;
  warnings: string[];
}

/**
 * Read a Claude Code transcript JSONL file and collect its assistant messages under the ONE dedup
 * rule. Pure: reads the file, never throws on malformed input.
 *
 * Rules (design §1, pinned; IU-2 / DR7 re-cut):
 *  - Count `type:"assistant"` entries ONLY.
 *  - Dedup by `message.id`; keep the LAST occurrence per id (streamed/partial/retry duplicates) — the
 *    one pinned rule every token sum rides, so unit/session/dispatch rows, the KPI numerator/
 *    denominator, and the manual `kpi-manual.py` all agree. `last_ne_max_divergences` counts the ids
 *    where this differs from the retired max-total-wins tie-break (the old guard, kept visible).
 *  - Token fields at `message.usage.{input_tokens, output_tokens, cache_read_input_tokens}`; cache
 *    creation prefers the TTL split `message.usage.cache_creation.{ephemeral_5m,ephemeral_1h}`, else
 *    falls back to the flat field at the 5m bucket + a warning.
 *  - Entries with no `message.usage` → skip + increment skipped_lines.
 *  - A malformed/truncated JSON line (common as the final line of a live transcript) → skip +
 *    increment skipped_lines, NEVER throw.
 */
function collectDedupedMessages(transcriptPath: string): DedupCore {
  let text: string;
  try {
    text = readFileSync(transcriptPath, "utf8");
  } catch (e) {
    return {
      messages: [], overall: zero(), by_model: {}, counted_messages: 0, deduped_message_ids: 0,
      last_ne_max_divergences: 0, skipped_lines: 0,
      warnings: [`unreadable transcript at ${transcriptPath}: ${(e as Error).message}`],
    };
  }
  // Parse every non-blank line into a raw entry; a malformed/truncated line (commonly the final line
  // of a live transcript) is a skip, NEVER a throw. The dedup + index live in the one entries core, so
  // the file path and the analyzer's already-parsed `entries` path share the identical rule (IU-3).
  const raw: RawUsageEntry[] = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue; // blank lines are not "skipped" content
    try {
      raw.push(JSON.parse(trimmed) as RawUsageEntry);
    } catch {
      malformed += 1;
    }
  }
  const core = collectDedupedMessagesFromEntries(raw);
  return { ...core, skipped_lines: core.skipped_lines + malformed };
}

/**
 * The ONE dedup core (IU-3) — collapses a raw entry array's assistant messages under the pinned
 * `message.id` last-wins rule and records each kept message's SOURCE INDEX. Pure and fs-free: the
 * file reader above parses lines into entries and delegates here; `derive-tokens` passes the
 * analyzer's ALREADY-PARSED `entries` (a `TranscriptEntry[]`, structurally a `RawUsageEntry[]`) so the
 * message-grain in-node scan and the span/rule-c scans share ONE parse — no second file read.
 */
function collectDedupedMessagesFromEntries(entries: readonly RawUsageEntry[]): DedupCore {
  const warnings: string[] = [];
  let skipped_lines = 0;

  // Keep the LAST record per message.id; Map preserves first-insertion order, so iterating `best`
  // later yields first-seen order even after a last-wins replace.
  const best = new Map<string, MessageUsage>();
  // Distinct ids that saw ≥1 duplicate occurrence collapsed (for deduped_message_ids).
  const dedupedIds = new Set<string>();
  // The MAX total ever seen per id — compared against the kept (last) total to count last≠max
  // divergences (the retired guard). Tracked only for real ids; __noid__ entries never dedup.
  const maxTotalById = new Map<string, number>();

  for (let i = 0; i < entries.length; i++) {
    const obj = entries[i];
    if (obj.type !== "assistant") continue; // only assistant entries carry billable usage

    const message = obj.message;
    if (!message || typeof message !== "object") {
      skipped_lines += 1;
      continue;
    }
    const msg = message as Record<string, unknown>;
    const usage = msg["usage"];
    if (!usage || typeof usage !== "object") {
      // error / interrupt / compaction-synthetic entry — no usage to count.
      skipped_lines += 1;
      continue;
    }

    const id = typeof msg["id"] === "string" ? (msg["id"] as string) : null;
    const model = typeof msg["model"] === "string" ? (msg["model"] as string) : "unknown";
    const comp = componentsFromUsage(usage as Record<string, unknown>, warnings, id ?? "(no id)");
    const ts = typeof obj.timestamp === "string" ? obj.timestamp : null;
    const label = typeof obj.attributionSkill === "string" ? obj.attributionSkill : null;
    const rec: MessageUsage = { id, model, ts, label, index: i, usage: comp };

    if (id === null) {
      // No id to dedup on — count it under a unique synthetic key so it is never collapsed away.
      best.set(`__noid__:${best.size}`, rec);
      continue;
    }
    if (best.has(id)) dedupedIds.add(id); // a second+ occurrence of this id — a dedup collapse
    best.set(id, rec); // LAST-wins: the latest occurrence always replaces the prior (and its index)
    const priorMax = maxTotalById.get(id) ?? -1;
    if (comp.total > priorMax) maxTotalById.set(id, comp.total);
  }

  const overall = zero();
  const by_model: Record<string, UsageComponents> = {};
  const messages: MessageUsage[] = [];
  let counted_messages = 0;
  let last_ne_max_divergences = 0;

  for (const [key, rec] of best) {
    messages.push(rec);
    counted_messages += 1;
    addInto(overall, rec.usage);
    if (!by_model[rec.model]) by_model[rec.model] = zero();
    addInto(by_model[rec.model], rec.usage);
    // The kept occurrence is the LAST; if a heavier occurrence of the same id was seen earlier, the
    // last-wins pick diverges from max-total-wins. (__noid__ keys never recorded a max → no divergence.)
    const maxTotal = maxTotalById.get(key) ?? rec.usage.total;
    if (rec.usage.total !== maxTotal) last_ne_max_divergences += 1;
  }

  return { messages, overall, by_model, counted_messages, deduped_message_ids: dedupedIds.size, last_ne_max_divergences, skipped_lines, warnings };
}

/**
 * Sum token usage from a Claude Code transcript JSONL file — a thin whole-file projection of
 * `collectDedupedMessages` (which owns the pinned dedup rules above). Pure: reads the file, never
 * throws, returns a fully-populated result.
 */
export function sumUsage(transcriptPath: string, _opts?: SumUsageOptions): SumUsageResult {
  const c = collectDedupedMessages(transcriptPath);
  return {
    ...c.overall,
    by_model: c.by_model,
    counted_messages: c.counted_messages,
    deduped_message_ids: c.deduped_message_ids,
    last_ne_max_divergences: c.last_ne_max_divergences,
    skipped_lines: c.skipped_lines,
    warnings: c.warnings,
  };
}

/**
 * Summarise a transcript's usage at MESSAGE grain (IU-2 / DR7) — the per-message deduped records plus
 * the same totals/counters `sumUsage` returns. The analyzer uses `messages[].label` (the entry's
 * attributionSkill) to score a top-level session's in-node token share message-by-message, riding the
 * identical last-wins dedup as every other token sum.
 */
export function summarizeUsageByMessage(transcriptPath: string): MessageSumResult {
  return projectMessageSum(collectDedupedMessages(transcriptPath));
}

/**
 * The entries path (IU-3) — the identical per-message summary computed off an ALREADY-PARSED entry
 * array instead of a file. `derive-tokens` calls this with the analyzer's `entries` (a
 * `TranscriptEntry[]`, structurally a `RawUsageEntry[]`), so the message-grain in-node scan rides the
 * SAME parse the carrier-span scan reads — no second `readFileSync`, no double JSON parse. Each
 * `messages[].index` is the entry's own position, the coordinate a caller buckets by carrier span.
 */
export function summarizeUsageByMessageEntries(entries: readonly RawUsageEntry[]): MessageSumResult {
  return projectMessageSum(collectDedupedMessagesFromEntries(entries));
}

/** Shape a `DedupCore` into the public per-message result (one projection, both entry points). */
function projectMessageSum(c: DedupCore): MessageSumResult {
  return {
    messages: c.messages,
    total: c.overall,
    by_model: c.by_model,
    counted_messages: c.counted_messages,
    deduped_message_ids: c.deduped_message_ids,
    last_ne_max_divergences: c.last_ne_max_divergences,
    skipped_lines: c.skipped_lines,
    warnings: c.warnings,
  };
}
