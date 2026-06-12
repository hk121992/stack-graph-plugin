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
   *  max-total tie-break fired ≥1 time). Surfaced by the `sg-token-usage` CLI (design §10) so a
   *  caller can see how much streamed/partial/retry de-duplication happened. */
  deduped_message_ids: number;
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

/**
 * Sum token usage from a Claude Code transcript JSONL file. Pure: reads the file, never throws on
 * malformed input, returns a fully-populated result.
 *
 * Rules (design §1, pinned):
 *  - Count `type:"assistant"` entries ONLY.
 *  - Dedup by `message.id`; tie-break = keep the MAX-total occurrence per id (streamed/partial/
 *    retry duplicates).
 *  - Token fields at `message.usage.{input_tokens, output_tokens, cache_read_input_tokens}`; cache
 *    creation prefers the TTL split `message.usage.cache_creation.{ephemeral_5m,ephemeral_1h}`,
 *    else falls back to the flat field at the 5m bucket + a warning.
 *  - Entries with no `message.usage` → skip + increment skipped_lines.
 *  - A malformed/truncated JSON line (common as the final line of a live transcript) → skip +
 *    increment skipped_lines, NEVER throw.
 */
export function sumUsage(transcriptPath: string, _opts?: SumUsageOptions): SumUsageResult {
  const warnings: string[] = [];
  let skipped_lines = 0;

  let text: string;
  try {
    text = readFileSync(transcriptPath, "utf8");
  } catch (e) {
    warnings.push(`unreadable transcript at ${transcriptPath}: ${(e as Error).message}`);
    return { ...zero(), by_model: {}, counted_messages: 0, skipped_lines: 0, warnings };
  }

  // Keep the MAX-total occurrence per message.id (the dedup tie-break).
  const best = new Map<string, { model: string; comp: UsageComponents }>();
  // Distinct ids that saw ≥1 duplicate occurrence collapsed (for deduped_message_ids).
  const dedupedIds = new Set<string>();

  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue; // blank lines are not "skipped" content

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Malformed / truncated line (e.g. the final line of a live transcript) — skip, never throw.
      skipped_lines += 1;
      continue;
    }

    if (obj["type"] !== "assistant") continue; // only assistant entries carry billable usage

    const message = obj["message"];
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

    if (id === null) {
      // No id to dedup on — count it under a unique synthetic key so it is never collapsed away.
      best.set(`__noid__:${best.size}`, { model, comp });
      continue;
    }

    const prior = best.get(id);
    if (prior) dedupedIds.add(id); // a second+ occurrence of this id — a dedup collapse
    if (!prior || comp.total > prior.comp.total) {
      best.set(id, { model, comp });
    }
  }

  const overall = zero();
  const by_model: Record<string, UsageComponents> = {};
  let counted_messages = 0;

  for (const { model, comp } of best.values()) {
    counted_messages += 1;
    addInto(overall, comp);
    if (!by_model[model]) by_model[model] = zero();
    addInto(by_model[model], comp);
  }

  return {
    ...overall,
    by_model,
    counted_messages,
    deduped_message_ids: dedupedIds.size,
    skipped_lines,
    warnings,
  };
}
