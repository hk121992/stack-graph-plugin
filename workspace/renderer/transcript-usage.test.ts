// Unit test for the deterministic transcript-usage summer (lib/transcript-usage.ts), D69 / #21.
// Mirrors publish-projection.test.ts: a `checks: Array<[label, boolean]>` list, prints ✓/✗ per
// check, exits 1 on any failure. Expected numbers are built from the REAL committed fixture at
// fixtures/transcript-usage/sample-transcript.jsonl (see that dir's README for provenance).
//
// Run: bun run workspace/renderer/transcript-usage.test.ts   (exit 0 = OK)

import path from "node:path";
import { fileURLToPath } from "node:url";
import { sumUsage, usageFromObject } from "./lib/transcript-usage.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "transcript-usage", "sample-transcript.jsonl");

// ── Expected numbers, derived by hand from the fixture (see fixtures README) ──
// Dedup keeps the MAX-total occurrence of msg_01Ebfg… (output 600, total 46224), drops the 546 one.
// Counted messages: A(opus-4-6), B(opus-4-6), C(opus-4-8), D(fable-5), E(opus-4-6 flat-fallback) = 5.
// Skipped lines: the no-usage assistant + the truncated final line = 2.
const EXPECT = {
  input: 28591,
  output: 1845,
  cache_creation_5m: 2688,
  cache_creation_1h: 113889,
  cache_read: 94362,
  total: 241375,
  counted_messages: 5,
  skipped_lines: 2,
};
const EXPECT_OPUS46 = { input: 5, output: 1545, cache_creation_5m: 2688, cache_creation_1h: 47563, cache_read: 94362, total: 146163 };
const EXPECT_OPUS48 = { input: 14293, output: 153, cache_creation_5m: 0, cache_creation_1h: 32677, cache_read: 0, total: 47123 };
const EXPECT_FABLE  = { input: 14293, output: 147, cache_creation_5m: 0, cache_creation_1h: 33649, cache_read: 0, total: 48089 };

// The summer must not throw on the truncated final line — capture any throw as a failed check.
let threw = false;
let r: ReturnType<typeof sumUsage> | null = null;
try {
  r = sumUsage(fixture);
} catch {
  threw = true;
}

const checks: Array<[string, boolean]> = [];
checks.push(["truncated final line does not throw (skip-not-throw)", !threw && r !== null]);

if (r) {
  // Disjoint sum = total, both per-message-summed-overall and the explicit identity.
  const sumOfParts = r.input + r.output + r.cache_creation_5m + r.cache_creation_1h + r.cache_read;
  checks.push(
    ["overall input", r.input === EXPECT.input],
    ["overall output", r.output === EXPECT.output],
    ["overall cache_creation_5m", r.cache_creation_5m === EXPECT.cache_creation_5m],
    ["overall cache_creation_1h (TTL split read correctly)", r.cache_creation_1h === EXPECT.cache_creation_1h],
    ["overall cache_read", r.cache_read === EXPECT.cache_read],
    ["overall total", r.total === EXPECT.total],
    ["disjoint sum of 5 components === total", sumOfParts === r.total && r.total === EXPECT.total],

    // Dedup keeps the MAX-total occurrence (output 600, not 546) → counted_messages is 5, not 6,
    // and the kept total reflects 600. If the lower dup had been kept, overall.output would be 1791.
    ["dedup keeps MAX-total occurrence (counted_messages = 5)", r.counted_messages === EXPECT.counted_messages],
    ["dedup tie-break used the 600-output occurrence (output reflects max, not 546)", r.output === EXPECT.output],

    // skipped_lines counts the no-usage assistant + the truncated final line (= 2).
    ["skipped_lines counts no-usage + truncated (= 2)", r.skipped_lines === EXPECT.skipped_lines],

    // deduped_message_ids counts the one id (msg_01Ebfg…) that had a duplicate collapsed.
    ["deduped_message_ids = 1 (msg_01Ebfg… collapsed)", r.deduped_message_ids === 1],

    // Flat-fallback emits a warning (msg E had its cache_creation split removed).
    ["flat-fallback emits exactly 1 warning", r.warnings.length === 1],
    ["flat-fallback warning names the 5m attribution", r.warnings.some((w) => w.includes("5m bucket"))],

    // by_model subtotals correct for all three real models.
    ["by_model has exactly the 3 models", Object.keys(r.by_model).sort().join(",") === "claude-fable-5,claude-opus-4-6,claude-opus-4-8"],
  );

  const m46 = r.by_model["claude-opus-4-6"];
  const m48 = r.by_model["claude-opus-4-8"];
  const mfb = r.by_model["claude-fable-5"];
  const eq = (a: typeof EXPECT_OPUS46 | undefined, b: typeof EXPECT_OPUS46) =>
    !!a && a.input === b.input && a.output === b.output && a.cache_creation_5m === b.cache_creation_5m &&
    a.cache_creation_1h === b.cache_creation_1h && a.cache_read === b.cache_read && a.total === b.total;
  checks.push(
    ["by_model claude-opus-4-6 subtotal (incl deduped + flat-fallback)", eq(m46, EXPECT_OPUS46)],
    ["by_model claude-opus-4-8 subtotal", eq(m48, EXPECT_OPUS48)],
    ["by_model claude-fable-5 subtotal", eq(mfb, EXPECT_FABLE)],
    // Per-model totals must reconcile to the overall total.
    ["sum of by_model totals === overall total", (m46?.total ?? 0) + (m48?.total ?? 0) + (mfb?.total ?? 0) === r.total],
  );
}

// ── usageFromObject helper (PostToolUse reuse path) ──
const ttl = usageFromObject({
  input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5,
  cache_creation: { ephemeral_5m_input_tokens: 3, ephemeral_1h_input_tokens: 7 },
});
checks.push(
  ["usageFromObject reads TTL split + disjoint total", ttl.cache_creation_5m === 3 && ttl.cache_creation_1h === 7 && ttl.cache_read === 5 && ttl.total === 10 + 20 + 3 + 7 + 5],
);
const flat = usageFromObject({ input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 100 });
checks.push(
  ["usageFromObject flat-fallback attributes to 5m bucket", flat.cache_creation_5m === 100 && flat.cache_creation_1h === 0 && flat.total === 1 + 2 + 100],
);
checks.push(
  ["usageFromObject on garbage returns zeros (no throw)", usageFromObject(null).total === 0 && usageFromObject("x").total === 0],
);

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  if (!pass) ok = false;
}

if (r) {
  console.log(`\nfixture totals — input=${r.input} output=${r.output} 5m=${r.cache_creation_5m} 1h=${r.cache_creation_1h} read=${r.cache_read} total=${r.total} counted=${r.counted_messages} skipped=${r.skipped_lines}`);
}
console.log(ok ? "\nTRANSCRIPT-USAGE TEST OK" : "\nTRANSCRIPT-USAGE TEST FAILED");
process.exit(ok ? 0 : 1);
