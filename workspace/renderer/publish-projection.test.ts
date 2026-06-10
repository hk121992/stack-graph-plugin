// Publisher test — drives publish-projection.ts end-to-end over a controlled event log
// and asserts the SANITIZED projection shape. Mirrors smoke.ts: a standalone script that
// runs assertions and exits 0 (OK) / 1 (FAILED). Covers the three new arcs (measurement
// trends, the tool_path_breadth AX key, experience-contract conformance) PLUS a hostile case
// (non-numeric measurement, unknown series name, oversized id, leak field) confirming drops.
//
// Run: bun run workspace/renderer/publish-projection.test.ts   (exit 0 = OK)

import { writeFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publisher = path.join(here, "publish-projection.ts");

// A bounded-but-oversized id (>64 chars after the first) to confirm ID_RE rejects it.
const OVERSIZED_ID = "n".repeat(80);

// Hostile timestamps: `new Date()` PARSES both of these, so the pre-strict-regex publisher
// would have stored the raw string into transition_summary[].at / trends[].at and leaked the
// comment text. The strict UTC ISO-8601 validator must drop them (event/point dropped).
const TS_TRAILING_COMMENT = "Fri Jun 05 2026 00:00:00 GMT+0000 (TS_SECRET_LEAK)"; // parses; trailing free text
const TS_NON_ISO = "04 DecSecret 1995";                                           // legacy JS date format, parses

// The event stream under test: a benchmark.perf series, a health.quality series, a product-AX
// block carrying tool_path_breadth, experience-contract pass+fail gates — AND hostile inputs:
//   - an unknown metrics series ("secret.series") → dropped
//   - a non-numeric measurement (health.quality "8.x") → dropped
//   - a leak field inside ax ("leak_field") → dropped (not in AX_NUMERIC_KEYS)
//   - an oversized node id → whole event dropped (ID_RE)
//   - a free-text gate ("design-approved:pass") → ignored (only experience-contract counted)
const EVENTS = [
  // benchmark.perf trend, two points (out of order to test time-sort)
  { ts: "2026-01-04T09:00:00Z", session: "s1", kind: "enter", node: "benchmark", carrier: null },
  { ts: "2026-01-04T09:05:00Z", session: "s1", kind: "exit", node: "benchmark", carrier: null, outcome: "v", gates: [], metrics: { "benchmark.perf": 2300, "secret.series": 999 } },
  { ts: "2026-01-02T09:00:00Z", session: "s0", kind: "enter", node: "benchmark", carrier: null },
  { ts: "2026-01-02T09:05:00Z", session: "s0", kind: "exit", node: "benchmark", carrier: null, outcome: "v", gates: [], metrics: { "benchmark.perf": 2100 } },
  // health.quality trend — one good point, one non-numeric (dropped)
  { ts: "2026-01-03T10:00:00Z", session: "s2", kind: "enter", node: "health", carrier: null },
  { ts: "2026-01-03T10:08:00Z", session: "s2", kind: "exit", node: "health", carrier: null, outcome: "v", gates: [], metrics: { "health.quality": 8.4 } },
  { ts: "2026-01-04T10:00:00Z", session: "s3", kind: "enter", node: "health", carrier: null },
  { ts: "2026-01-04T10:08:00Z", session: "s3", kind: "exit", node: "health", carrier: null, outcome: "v", gates: [], metrics: { "health.quality": "8.x" } },
  // simulate-users AX with tool_path_breadth + leak field; experience-contract pass
  { ts: "2026-01-05T11:00:00Z", session: "s4", kind: "enter", node: "simulate-users", carrier: "wi-1" },
  { ts: "2026-01-05T11:20:00Z", session: "s4", kind: "exit", node: "simulate-users", carrier: "wi-1", outcome: "v", gates: ["experience-contract:pass"], ax: { tokens_to_outcome: 21000, tool_path_breadth: 6, leak_field: "DROP_ME" } },
  // experience-contract fail + a free-text gate that must NOT be counted/echoed
  { ts: "2026-01-06T11:00:00Z", session: "s5", kind: "enter", node: "simulate-users", carrier: "wi-2" },
  { ts: "2026-01-06T11:20:00Z", session: "s5", kind: "exit", node: "simulate-users", carrier: "wi-2", outcome: "v", gates: ["experience-contract:fail", "design-approved:pass"] },
  // hostile: oversized node id — the whole event is dropped
  { ts: "2026-01-06T12:00:00Z", session: "s6", kind: "enter", node: OVERSIZED_ID, carrier: null },
  // hostile: ts with trailing comment text — `new Date()` parses it, but the strict UTC ISO-8601
  // validator must drop the event so "TS_SECRET_LEAK" never reaches transition_summary[].at.
  { ts: TS_TRAILING_COMMENT, session: "s7", kind: "enter", node: "benchmark", carrier: "wi-3" },
  // hostile: non-ISO legacy ts on an exit with a trend measurement — must drop the point so the
  // raw "04 DecSecret 1995" never reaches trends[].at.
  { ts: TS_NON_ISO, session: "s7", kind: "exit", node: "benchmark", carrier: "wi-3", outcome: "v", gates: [], metrics: { "benchmark.perf": 4242 } },
  // hostile: non-string node (array) — ID_RE.test would coerce it via toString; typeof guard must
  // drop the whole event so the array element "privateToken" never becomes a key/value.
  { ts: "2026-01-07T08:00:00Z", session: "s8", kind: "enter", node: ["privateToken"] as unknown as string, carrier: null },
  // hostile: numeric carrier — ID_RE.test would coerce 90909 via toString; typeof guard must drop
  // the carrier so 90909 never becomes a carrier key.
  { ts: "2026-01-07T08:05:00Z", session: "s8", kind: "enter", node: "benchmark", carrier: 90909 as unknown as string },

  // ── Triple-key (loop-runner-design §7.3) — interleaved carriers/arcs project SEPARATE stage ──
  // Two carriers traversing the SHARED node `build` on TWO arcs, interleaved in time. Keying by
  // carrier id alone would let one bleed into the other's current_stage; the triple keeps them
  // separate. ci-wi (work-item on dev-sprint) ends at `review`; ci-iu (standalone-iu on
  // incremental) ends at `build`.
  { ts: "2026-02-01T09:00:00Z", session: "d1", kind: "enter", node: "build",  carrier: "ci-wi", carrier_kind: "work-item",    arc: "dev-sprint"  },
  { ts: "2026-02-01T09:01:00Z", session: "d2", kind: "enter", node: "build",  carrier: "ci-iu", carrier_kind: "standalone-iu", arc: "incremental" },
  { ts: "2026-02-01T09:05:00Z", session: "d1", kind: "enter", node: "review", carrier: "ci-wi", carrier_kind: "work-item",    arc: "dev-sprint"  },
  // ci-iu's last stage event stays `build` — must NOT pick up ci-wi's later `review`.

  // ── dispatch-complete NEVER advances current_stage (measure event) ──
  // ci-iu emits a dispatch-complete naming node `land` as a hostile attempt to advance its stage.
  // The projection must ignore it for current_stage (ci-iu stays at `build`) and admit only the
  // tokens_per_session measure.
  { ts: "2026-02-01T09:10:00Z", session: "d2", kind: "dispatch-complete", node: "land", carrier: "ci-iu", carrier_kind: "standalone-iu", arc: "incremental", outcome: "built", metrics: { "tokens_per_session": 52000 } },

  // ── tokens_per_session admitted; hostile values rejected ──
  // good (admitted), negative (rejected), NaN-string (rejected), absurd-magnitude overflow→Infinity
  // (rejected by the finite guard). Each rides a valid triple so only the VALUE discipline is under test.
  { ts: "2026-02-02T09:00:00Z", session: "d3", kind: "dispatch-complete", carrier: "ci-good", carrier_kind: "standalone-iu", arc: "incremental", outcome: "built",          metrics: { "tokens_per_session": 38000 } },
  { ts: "2026-02-02T09:01:00Z", session: "d4", kind: "dispatch-complete", carrier: "ci-neg",  carrier_kind: "standalone-iu", arc: "incremental", outcome: "built",          metrics: { "tokens_per_session": -5 } },
  { ts: "2026-02-02T09:02:00Z", session: "d5", kind: "dispatch-complete", carrier: "ci-nan",  carrier_kind: "standalone-iu", arc: "incremental", outcome: "built",          metrics: { "tokens_per_session": "9e9SECRET" as unknown as number } },
  { ts: "2026-02-02T09:03:00Z", session: "d6", kind: "dispatch-complete", carrier: "ci-huge", carrier_kind: "standalone-iu", arc: "incremental", outcome: "built",          metrics: { "tokens_per_session": 1e400 } }, // → Infinity, non-finite, dropped

  // ── legacy events (no carrier_kind / arc) excluded from stage projection ──
  // ci-legacy has a conforming carrier id but NO kind/arc (preamble < v0.2.0). Its enter events
  // must NOT produce a carrier entry (excluded — degrade, never guess). `legacynode` still counts
  // as a used node (node tracking is independent of the stage projection).
  { ts: "2026-02-03T09:00:00Z", session: "d7", kind: "enter", node: "legacynode", carrier: "ci-legacy" },
  { ts: "2026-02-03T09:05:00Z", session: "d7", kind: "enter", node: "build",      carrier: "ci-legacy" },
];

const dir = mkdtempSync(path.join(tmpdir(), "sg-pub-test-"));
const eventsFile = path.join(dir, "events.jsonl");
const outFile = path.join(dir, "out.json");
writeFileSync(eventsFile, EVENTS.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");

let raw = "";
try {
  execFileSync("bun", ["run", publisher, "--events", eventsFile, "--out", outFile], { encoding: "utf8" });
  raw = readFileSync(outFile, "utf8");
} catch (e) {
  console.error("publisher run failed:", e);
  process.exit(1);
}

const snap = JSON.parse(raw) as {
  carriers: Record<string, { carrier_id: string; carrier_kind: string; arc: string; current_stage: string | null; transition_summary: Array<{ stage: string; at: string }> }>;
  nodes: Record<string, unknown>;
  ax: Record<string, Record<string, unknown>>;
  trends: Record<string, Array<{ at: string; value: number }>>;
  conformance: { experience_contract: { pass: number; fail: number } };
  session_costs: Array<{ at: string; carrier_id: string; carrier_kind: string; arc: string; tokens_per_session: number }>;
};

// The whole serialized snapshot must not carry any private/free-text field that should have
// been dropped. This is the strongest sanitization assertion — a leak anywhere fails it.
// NB: tokens here must NOT be substrings of legitimate allowlisted keys (e.g. "outcome" is a
// substring of "tokens_to_outcome"); we use only genuinely-private values/keys.
const FORBIDDEN = ["secret.series", "leak_field", "DROP_ME", "design-approved", OVERSIZED_ID, "8.x", "\"session\"",
  // timestamp-leak vectors (Fix 1): neither the raw hostile ts nor its embedded comment may appear.
  "TS_SECRET_LEAK", TS_TRAILING_COMMENT, TS_NON_ISO, "DecSecret",
  // non-string id-coercion vectors (Fix 2): neither the array element nor the numeric carrier may appear.
  "privateToken", "90909",
  // tokens_per_session hostile-value vector: the NaN-string measure must be dropped, never echoed.
  "9e9SECRET"];

const bp = snap.trends["benchmark.perf"] ?? [];
const hq = snap.trends["health.quality"] ?? [];
const su = snap.ax["simulate-users"] ?? {};
const ec = snap.conformance?.experience_contract;

const checks: Array<[string, boolean]> = [
  // Trends — benchmark.perf has both points, time-sorted ascending
  ["benchmark.perf has 2 points", bp.length === 2],
  ["benchmark.perf time-sorted (2100 then 2300)", bp[0]?.value === 2100 && bp[1]?.value === 2300],
  ["benchmark.perf points carry {at,value}", typeof bp[0]?.at === "string" && typeof bp[0]?.value === "number"],
  // health.quality — only the numeric point survives; non-numeric dropped
  ["health.quality has only the 1 numeric point", hq.length === 1 && hq[0]?.value === 8.4],
  // Unknown series never appears as a trend key
  ["unknown series 'secret.series' dropped", !("secret.series" in snap.trends)],
  // AX — tool_path_breadth passes; leak field dropped
  ["AX tool_path_breadth = 6", su["tool_path_breadth"] === 6],
  ["AX tokens_to_outcome = 21000", su["tokens_to_outcome"] === 21000],
  ["AX leak_field dropped", !("leak_field" in su)],
  // Conformance — exactly 1 pass, 1 fail; free-text gate not counted
  ["conformance pass = 1", ec?.pass === 1],
  ["conformance fail = 1", ec?.fail === 1],
  // Oversized-id event dropped entirely (node never appears)
  ["oversized node id dropped", !(OVERSIZED_ID in snap.nodes)],
  // Fix 1 — hostile timestamps dropped (event/point dropped; raw ts never carried into output).
  // The trailing-comment ts rode an enter event with carrier "wi-3"; the non-ISO ts rode an exit
  // with a benchmark.perf measurement. Both events must be dropped: carrier wi-3 must not exist,
  // and benchmark.perf must still have exactly 2 points (the hostile 4242 point dropped).
  ["trailing-comment-ts event dropped (carrier wi-3 absent)", !("wi-3" in snap.carriers)],
  ["non-ISO-ts trend point dropped (benchmark.perf still 2 points, no 4242)", bp.length === 2 && !bp.some((p) => p.value === 4242)],
  // Fix 2 — non-string ids dropped (typeof guard in front of ID_RE; never echoed).
  // The array-node event is dropped entirely; the numeric carrier is dropped (carrier never a key).
  ["non-string node (array) event dropped — 'privateToken' never a node key", !("privateToken" in snap.nodes)],
  ["numeric carrier dropped (90909 never a carrier key)", !("90909" in snap.carriers)],
  // Whole-snapshot leak scan
  ["no forbidden token leaks into snapshot", !FORBIDDEN.some((t) => raw.includes(t))],
];

// ── Triple-key: interleaved carriers/arcs project SEPARATE current_stage per triple ──
const ciWi = snap.carriers["ci-wi"];
const ciIu = snap.carriers["ci-iu"];
checks.push(
  ["triple: ci-wi (work-item/dev-sprint) present", !!ciWi && ciWi.carrier_kind === "work-item" && ciWi.arc === "dev-sprint"],
  ["triple: ci-iu (standalone-iu/incremental) present", !!ciIu && ciIu.carrier_kind === "standalone-iu" && ciIu.arc === "incremental"],
  ["triple: ci-wi current_stage = review (its own arc)", ciWi?.current_stage === "review"],
  ["triple: ci-iu current_stage = build (NOT bled to review)", ciIu?.current_stage === "build"],
);

// ── dispatch-complete never advances current_stage (it named `land` but ci-iu stays at build) ──
checks.push(
  ["dispatch-complete did NOT advance ci-iu stage to land", ciIu?.current_stage === "build"],
  ["dispatch-complete did NOT add a `land` transition to ci-iu", !(ciIu?.transition_summary ?? []).some((t) => t.stage === "land")],
);

// ── tokens_per_session admitted; hostile values (negative, NaN-string, Infinity) rejected ──
const sc = snap.session_costs ?? [];
const scById = (id: string) => sc.filter((p) => p.carrier_id === id);
checks.push(
  ["tokens_per_session: ci-iu admitted (52000)", scById("ci-iu").length === 1 && scById("ci-iu")[0].tokens_per_session === 52000],
  ["tokens_per_session: ci-good admitted (38000)", scById("ci-good").length === 1 && scById("ci-good")[0].tokens_per_session === 38000],
  ["tokens_per_session: negative dropped (ci-neg absent)", scById("ci-neg").length === 0],
  ["tokens_per_session: NaN-string dropped (ci-nan absent)", scById("ci-nan").length === 0],
  ["tokens_per_session: Infinity/absurd-magnitude dropped (ci-huge absent)", scById("ci-huge").length === 0],
  ["session_costs carry the carrier triple", sc.every((p) => typeof p.carrier_id === "string" && typeof p.carrier_kind === "string" && typeof p.arc === "string")],
  ["session_costs time-sorted ascending", sc.every((p, i) => i === 0 || new Date(sc[i - 1].at).getTime() <= new Date(p.at).getTime())],
);

// ── legacy events (no carrier_kind/arc) excluded from stage projection ──
checks.push(
  ["legacy carrier (no kind/arc) excluded from stage projection", !("ci-legacy" in snap.carriers) && !Object.values(snap.carriers).some((c) => c.carrier_id === "ci-legacy")],
  ["legacy node still counted as a used node", "legacynode" in snap.nodes],
);

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  if (!pass) ok = false;
}

// Empty-snapshot shape: an events file with no valid events still emits trends:{} + zero tally.
const emptyEvents = path.join(dir, "empty.jsonl");
const emptyOut = path.join(dir, "empty-out.json");
writeFileSync(emptyEvents, "not json\n\n", "utf8");
try {
  execFileSync("bun", ["run", publisher, "--events", emptyEvents, "--out", emptyOut], { encoding: "utf8" });
  const empty = JSON.parse(readFileSync(emptyOut, "utf8")) as typeof snap;
  const emptyOk =
    JSON.stringify(empty.trends) === "{}" &&
    JSON.stringify(empty.session_costs) === "[]" &&
    empty.conformance.experience_contract.pass === 0 &&
    empty.conformance.experience_contract.fail === 0;
  console.log(`${emptyOk ? "✓" : "✗"} empty snapshot has trends:{} + session_costs:[] + zero conformance tally`);
  if (!emptyOk) ok = false;
} catch (e) {
  console.log("✗ empty-snapshot run failed:", e);
  ok = false;
}

rmSync(dir, { recursive: true, force: true });
console.log(ok ? "\nPUBLISHER TEST OK" : "\nPUBLISHER TEST FAILED");
process.exit(ok ? 0 : 1);
