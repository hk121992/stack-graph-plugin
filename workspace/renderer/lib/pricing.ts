// pricing.ts — deterministic token→$ pricing for the analytics Cost block (D69 / #21, design §5).
// Pure: reads pricing.json (operator-maintained), prices a 6-component usage block per model. The
// cache TTL split is load-bearing — a 1h cache write costs 2x the base rate, a 5m write 1.25x, a
// read 0.1x — so ignoring cache (the original ~25x error) is impossible here: every component is
// priced. A model absent from the table prices as `null` (rendered "unknown"), NEVER silently $0.
//
// Portable: node fs + JSON only (same contract as lib/transcript-usage.ts), so the renderer (bun)
// and any node caller share one implementation.

import { readFileSync } from "node:fs";

export interface ModelRate {
  input_per_mtok: number;
  output_per_mtok: number;
}

export interface Pricing {
  verified_on: string;
  source?: string;
  cache_multipliers: { write_5m: number; write_1h: number; read: number };
  models: Record<string, ModelRate>;
}

/** The 6 disjoint token components (mirrors lib/transcript-usage.ts UsageComponents). */
export interface UsageComponents {
  input: number;
  output: number;
  cache_creation_5m: number;
  cache_creation_1h: number;
  cache_read: number;
  total: number;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Load + validate pricing.json. Returns `{ pricing }` on success or `{ error }` on any problem —
 *  the caller degrades (shows components without $) rather than crashing (design §6/§8). */
export function loadPricing(path: string): { pricing: Pricing | null; error: string | null } {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    return { pricing: null, error: `pricing file unreadable at ${path}: ${(e as Error).message}` };
  }
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return { pricing: null, error: `pricing.json is malformed JSON: ${(e as Error).message}` };
  }
  if (!obj || typeof obj !== "object") return { pricing: null, error: "pricing.json is not an object" };
  const p = obj as Record<string, unknown>;
  if (typeof p["verified_on"] !== "string") return { pricing: null, error: "pricing.json missing `verified_on`" };
  if (!p["models"] || typeof p["models"] !== "object") return { pricing: null, error: "pricing.json missing `models`" };
  const cm = (p["cache_multipliers"] ?? {}) as Record<string, unknown>;
  const pricing: Pricing = {
    verified_on: p["verified_on"] as string,
    source: typeof p["source"] === "string" ? (p["source"] as string) : undefined,
    cache_multipliers: {
      write_5m: typeof cm["write_5m"] === "number" ? (cm["write_5m"] as number) : 1.25,
      write_1h: typeof cm["write_1h"] === "number" ? (cm["write_1h"] as number) : 2.0,
      read: typeof cm["read"] === "number" ? (cm["read"] as number) : 0.1,
    },
    models: p["models"] as Record<string, ModelRate>,
  };
  return { pricing, error: null };
}

/**
 * Price a usage block at a model's rate. Returns the dollar cost, or `null` when the model is
 * unknown / pricing is absent (render that as "unknown", never $0). The cache multipliers are
 * applied to the model's input rate (model-independent ratios, model-dependent base).
 */
export function priceUsage(usage: UsageComponents, model: string, pricing: Pricing | null): number | null {
  if (!pricing || !pricing.models) return null;
  const rate = pricing.models[model];
  if (!rate || typeof rate.input_per_mtok !== "number" || typeof rate.output_per_mtok !== "number") return null;
  const inR = rate.input_per_mtok / 1e6;
  const outR = rate.output_per_mtok / 1e6;
  const { write_5m, write_1h, read } = pricing.cache_multipliers;
  const dollars =
    num(usage.input) * inR +
    num(usage.output) * outR +
    num(usage.cache_creation_5m) * inR * write_5m +
    num(usage.cache_creation_1h) * inR * write_1h +
    num(usage.cache_read) * inR * read;
  return Number.isFinite(dollars) ? dollars : null;
}

/** cache_read / total — the cache-efficiency ratio. `null` when total is 0 (NaN guard, design §6). */
export function cacheEfficiency(usage: UsageComponents): number | null {
  const total = num(usage.total);
  if (total <= 0) return null;
  return num(usage.cache_read) / total;
}

/** True when the 6 disjoint components sum to `total` within tolerance (a trust check, design §6). */
export function componentsSumToTotal(usage: UsageComponents, tolerance = 0): boolean {
  const sum = num(usage.input) + num(usage.output) + num(usage.cache_creation_5m) + num(usage.cache_creation_1h) + num(usage.cache_read);
  return Math.abs(sum - num(usage.total)) <= tolerance;
}
