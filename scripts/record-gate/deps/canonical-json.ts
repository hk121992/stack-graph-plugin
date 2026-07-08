// canonical-json.ts — the ONE canonical-JSON key-ordering primitive for the renderer.
//
// `canonicalize` recursively sorts object keys so a value's serialisation is determined by its
// VALUES, not by the order a producer happened to insert keys. Arrays preserve their order (order
// is content — a row's `gates: string[]`, an entry's `evidence_refs[]` — not a set). It is the
// shared root of two byte-stable serialisations that were previously byte-identical copies:
//
//   • analyzer/merge.ts `rowKey()` — the merge dedup identity `JSON.stringify(canonicalize(row))`,
//     so two rows that differ only in key insertion order collapse to one (no phantom no-loss win).
//   • fixtures/gate-chain/canonical.ts `canonical()` — the `gate_decisions[]` hash-chain content
//     serialisation `JSON.stringify(canonicalize(content))` (after stripping the chain-meta keys).
//
// BYTE-IDENTITY IS LOAD-BEARING. canonical.ts is the PINNED gate-chain definition: its output is
// hashed into the append-only chain, the IU-B0 fixtures are generated from it, and the
// `vendor:check` IU-B-guard imports it — so this helper's output MUST be byte-for-byte what the two
// private copies produced. It is therefore a single, pinned, test-covered primitive (one definition
// the guard and the fixtures share), NOT a fork of the chain rules — canonical.ts still owns
// `H` / `JOIN` / `GENESIS_PREV` / `canonical()` / `verifyChain`; only the generic key-sort lives here.
//
// PORTABILITY: `JSON` only — no `node:*`, no Bun globals, no deps (matches lib/transcript-usage.ts /
// lib/pricing.ts), so both the analyzer and the build-time guard can import it freely.

/**
 * Recursively sort object keys so the serialisation is value-determined, not insertion-order-
 * determined. Arrays keep their order (ordered data, not a set); primitives pass through unchanged.
 * Callers serialise the result with `JSON.stringify` to get the byte-stable string.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
