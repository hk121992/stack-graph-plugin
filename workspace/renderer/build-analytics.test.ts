// Test for the analytics Cost block (D69 / #21, design §5/§6/§8). Two layers:
//  (A) unit tests on the pure pricing lib (lib/pricing.ts) — NaN guard, missing-model=unknown,
//      malformed-pricing degrade, components-sum=total.
//  (B) end-to-end render of build-analytics.ts over crafted projections — the Cost block, the
//      prescriptive degraded states, the version banner, and sanitisation parity (no raw hostile
//      string in the rendered HTML, no "NaN").
//
// Run: bun run workspace/renderer/build-analytics.test.ts   (exit 0 = OK)

import { writeFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadPricing, priceUsage, cacheEfficiency, componentsSumToTotal, type UsageComponents } from "./lib/pricing.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const builder = path.join(here, "build-analytics.ts");
const realPricing = path.join(here, "pricing.json");
const dir = mkdtempSync(path.join(tmpdir(), "sg-analytics-test-"));
const checks: Array<[string, boolean]> = [];

// ── (A) pricing lib unit tests ──
const { pricing } = loadPricing(realPricing);
const u = (o: Partial<UsageComponents>): UsageComponents => ({
  input: 0, output: 0, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, total: 0, ...o,
});
checks.push(
  ["pricing.json loads", !!pricing && pricing.models["claude-opus-4-8"].input_per_mtok === 5.0],
  ["priceUsage input+output at base/output rate (1M each → $30)", priceUsage(u({ input: 1_000_000, output: 1_000_000 }), "claude-opus-4-8", pricing) === 30],
  ["priceUsage cache_read at 0.1× (1M → $0.50)", priceUsage(u({ cache_read: 1_000_000 }), "claude-opus-4-8", pricing) === 0.5],
  ["priceUsage cache_creation_1h at 2× (1M → $10)", priceUsage(u({ cache_creation_1h: 1_000_000 }), "claude-opus-4-8", pricing) === 10],
  ["priceUsage cache_creation_5m at 1.25× (1M → $6.25)", priceUsage(u({ cache_creation_5m: 1_000_000 }), "claude-opus-4-8", pricing) === 6.25],
  ["priceUsage UNKNOWN model → null (never $0)", priceUsage(u({ input: 1_000_000 }), "no-such-model", pricing) === null],
  ["priceUsage with null pricing → null", priceUsage(u({ input: 1 }), "claude-opus-4-8", null) === null],
  ["cacheEfficiency total=0 → null (NaN guard)", cacheEfficiency(u({})) === null],
  ["cacheEfficiency ratio = cache_read/total", cacheEfficiency(u({ cache_read: 900, total: 1000 })) === 0.9],
  ["componentsSumToTotal true when parts sum to total", componentsSumToTotal(u({ input: 1, output: 2, cache_creation_5m: 3, cache_creation_1h: 4, cache_read: 5, total: 15 }))],
  ["componentsSumToTotal false when total mismatches", !componentsSumToTotal(u({ input: 1, output: 2, cache_creation_5m: 3, cache_creation_1h: 4, cache_read: 5, total: 16 }))],
);

// malformed pricing.json → degrade (error), not throw.
const badPricing = path.join(dir, "bad-pricing.json");
writeFileSync(badPricing, "{ not valid json", "utf8");
const bad = loadPricing(badPricing);
checks.push(
  ["loadPricing malformed → {pricing:null, error}", bad.pricing === null && typeof bad.error === "string"],
  ["loadPricing missing models → error", (() => { const f = path.join(dir, "nomodels.json"); writeFileSync(f, JSON.stringify({ verified_on: "x" }), "utf8"); const r = loadPricing(f); return r.pricing === null && !!r.error; })()],
);

// ── (B) end-to-end render ──
function render(projection: object, env: Record<string, string> = {}): string {
  const projPath = path.join(dir, `proj-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(projPath, JSON.stringify(projection), "utf8");
  execFileSync("bun", ["run", builder, "--projection", projPath], {
    encoding: "utf8",
    env: { ...process.env as Record<string, string>, SG_PRICING: realPricing, ...env },
  });
  return readFileSync(path.join(here, "..", "dist", "analytics", "index.html"), "utf8");
}

// A cost-bearing projection with a known-model row, an unknown-model row, a zero-total row, and a
// hostile model string (must be escaped, never echoed raw).
const costProj = {
  provenance: { commit: "testcommit", generator_version: "0.3.0", event_schema_version: "0.4.0", compatible_event_range: "0.x", observed_event_versions: ["0.4.0"] },
  nodes: {},
  session_costs: [
    { at: "2026-06-01T10:00:00Z", kind: "unit-usage", scope_id: "iu-A", carrier_id: "wi-1", arc: "dev-sprint", model: "claude-opus-4-8", cumulative: false, usage: { input: 1000, output: 500, cache_creation_5m: 2000, cache_creation_1h: 0, cache_read: 90000, total: 93500 } },
    { at: "2026-06-01T10:05:00Z", kind: "unit-usage", scope_id: "iu-B", carrier_id: "wi-1", arc: "dev-sprint", model: "mystery-model-x", cumulative: false, usage: { input: 10, output: 10, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, total: 20 } },
    { at: "2026-06-01T10:06:00Z", kind: "unit-usage", scope_id: "iu-zero", carrier_id: null, arc: null, model: "DROPMODEL<script>alert(1)</script>", cumulative: false, usage: { input: 0, output: 0, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, total: 0 } },
  ],
  reconciliation: { unit_usage: 3, session_usage: 0, dispatch_usage: 0, measured_iu_total: 93520, session_total: 0, inequality_ok: null, instrumentation_errors: 0, rejected_model_token_keys: 0, version_incompatible_events: 0, notes: [] },
};
{
  const html = render(costProj);
  checks.push(
    ["render: Cost block present", html.includes("<h2>Cost</h2>")],
    ["render: known-model row priced (no 'unknown' for iu-A's model)", html.includes("iu-A")],
    ["render: UNKNOWN model shows 'unknown' not '$0'", html.includes(">unknown<")],
    ["render: zero-total row cache-eff is '—' (NaN guard)", !html.includes("NaN")],
    ["render: hostile model string escaped (no raw <script>)", !html.includes("<script>alert(1)")],
    ["render: hostile model string IS present escaped", html.includes("&lt;script&gt;")],
    ["render: verified_on date shown", html.includes("2026-06-10")],
    ["render: estimated-cost label present", html.includes("Estimated cost at current API rates")],
  );
}

// Malformed pricing → degrade (Pricing unavailable), $ suppressed, no crash.
{
  const html = render(costProj, { SG_PRICING: badPricing });
  checks.push(
    ["render: malformed pricing degrades (Pricing unavailable)", html.includes("Pricing unavailable")],
    ["render: malformed pricing did not crash (Cost table still rendered)", html.includes("<h2>Cost</h2>") && html.includes("iu-A")],
  );
}

// Degraded: node activity but NO usage events → hooks-not-installed remedy.
{
  const html = render({ provenance: { commit: "x", generator_version: "0.3.0" }, nodes: { plan: { last_used: "2026-06-01T10:00:00Z", traversals_30d: 3 } }, session_costs: [], reconciliation: { unit_usage: 0, session_usage: 0, dispatch_usage: 0, measured_iu_total: 0, session_total: 0, inequality_ok: null, instrumentation_errors: 0, rejected_model_token_keys: 0, version_incompatible_events: 0, notes: [] } });
  checks.push(["render: node activity + no usage → 'analyzer has not run' remedy", html.includes("No cost data") && html.includes("analyzer has not run over these sessions")]);
}

// Degraded: instrumentation errors present → loud-failure remedy.
{
  const html = render({ provenance: { commit: "x", generator_version: "0.3.0" }, nodes: {}, session_costs: [], reconciliation: { unit_usage: 0, session_usage: 0, dispatch_usage: 0, measured_iu_total: 0, session_total: 0, inequality_ok: null, instrumentation_errors: 3, rejected_model_token_keys: 0, version_incompatible_events: 0, notes: [] } });
  checks.push(["render: instrumentation_errors → 'failed loud' remedy names instrumentation-error", html.includes("instrumentation-error") && html.includes("failed loud")]);
}

// Version banner: incompatible events → prescriptive re-vendor banner.
{
  const html = render({ provenance: { commit: "x", generator_version: "0.3.0", event_schema_version: "0.4.0", compatible_event_range: "0.x", observed_event_versions: ["0.4.0", "1.0.0"] }, nodes: {}, session_costs: [{ at: "2026-06-01T10:00:00Z", kind: "unit-usage", scope_id: "iu-A", model: "claude-opus-4-8", cumulative: false, usage: { input: 1, output: 1, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, total: 2 } }], reconciliation: { unit_usage: 1, session_usage: 0, dispatch_usage: 0, measured_iu_total: 2, session_total: 0, inequality_ok: null, instrumentation_errors: 0, rejected_model_token_keys: 0, version_incompatible_events: 2, notes: [] } });
  checks.push(
    ["render: version mismatch → banner present", html.includes("Instrumentation version mismatch")],
    ["render: version banner prescribes re-vendor", html.includes("re-vendor the plugin") && html.includes("harness-init validate")],
  );
}

// ── Process-cost block (Cluster A §4.3, #28) ──
// A cost-bearing AND process-cost-bearing projection → BOTH the Cost block and the Process-cost block
// render, with the friction counts + a gate-tagged stall.
{
  const both = {
    ...costProj,
    process_costs: {
      friction: [
        { at: "2026-06-02T09:00:00Z", session_label: "sess-1", permission_denials: 2, rejected_calls: 1, tool_errors: 3, permission_decisions: { allow: 5, deny: 2, ask: 1 }, permission_mode: "auto" },
      ],
      stalls: [
        { at: "2026-06-02T18:00:00Z", gap_ms: 50400000, before_node: "review", after_node: "land", session_before: "sess-2", session_after: "sess-3" },
      ],
    },
  };
  const html = render(both);
  checks.push(
    ["render: BOTH Cost + Process-cost blocks present", html.includes("<h2>Cost</h2>") && html.includes("<h2>Process cost</h2>")],
    ["render: friction counts surfaced (denials/rejections/errors)", html.includes("denials") && html.includes("rejections") && html.includes("tool errors")],
    ["render: stalls block with gate-tagged node", html.includes("<h3>Stalls</h3>") && html.includes("review")],
    ["render: not the sample view (real data drives the surface)", !html.includes("Sample data")],
  );
}

// A FRICTION-ONLY projection — no nodes, no session_costs, ONLY process_costs — must render the REAL
// (degraded) surface, NOT the SAMPLE view (realHasData must include process_costs, §4.2 S7). The Cost
// block degrades ("No cost data") while the Process-cost block shows the friction data.
{
  const frictionOnly = {
    provenance: { commit: "fc", generator_version: "0.3.0", event_schema_version: "0.4.0", compatible_event_range: "0.x", observed_event_versions: ["0.5.0"] },
    nodes: {},
    session_costs: [],
    process_costs: {
      friction: [
        { at: "2026-06-02T09:00:00Z", session_label: "sess-1", permission_denials: 4, rejected_calls: 0, tool_errors: 1, permission_decisions: { allow: 0, deny: 4, ask: 0 }, permission_mode: "default" },
      ],
      stalls: [],
    },
    reconciliation: { unit_usage: 0, session_usage: 0, dispatch_usage: 0, measured_iu_total: 0, session_total: 0, inequality_ok: null, instrumentation_errors: 0, rejected_model_token_keys: 0, version_incompatible_events: 0, notes: [] },
  };
  const html = render(frictionOnly);
  checks.push(
    ["render: friction-only is NOT the sample view", !html.includes("Sample data")],
    ["render: friction-only shows the Process-cost block with data", html.includes("<h2>Process cost</h2>") && html.includes("denials")],
    ["render: friction-only Cost block degrades ('No cost data')", html.includes("No cost data")],
  );
}

// No process data at all → the Process-cost block degrades with the 'analyzer not yet run' remedy.
{
  const html = render({ ...costProj, process_costs: { friction: [], stalls: [] } });
  checks.push(["render: no process data → degraded 'No process data' state", html.includes("<h2>Process cost</h2>") && html.includes("No process data")]);
}

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  if (!pass) ok = false;
}

rmSync(dir, { recursive: true, force: true });
console.log(ok ? "\nBUILD-ANALYTICS TEST OK" : "\nBUILD-ANALYTICS TEST FAILED");
process.exit(ok ? 0 : 1);
