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

  // ── dispatch-complete NEVER advances current_stage AND its model-authored token key is REJECTED ──
  // ci-iu emits a dispatch-complete naming node `land` (hostile stage attempt) carrying a stale
  // metrics.tokens_per_session (fabrication). current_stage must stay `build`; the token key must be
  // rejected (counted, never echoed); cost comes only from the hook usage events below.
  { ts: "2026-02-01T09:10:00Z", session: "d2", kind: "dispatch-complete", node: "land", carrier: "ci-iu", carrier_kind: "standalone-iu", arc: "incremental", outcome: "built", metrics: { "tokens_per_session": 52000 } },

  // ── HOOK usage events (D69) — the ONLY cost source. 6-component token_usage; cache split preserved.
  // unit-usage child (iu-iu) + a dispatch-usage parent for carrier ci-iu → Σchild ≤ parent (inequality ok).
  { ts: "2026-02-01T09:11:00Z", session: "d2", kind: "unit-usage", scope_id: "iu-iu", iu: "iu-iu", carrier: "ci-iu", carrier_kind: "standalone-iu", arc: "incremental", cumulative: false, model: "claude-opus-4-8", token_usage: { input: 100, output: 50, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 9000, total: 9150 }, v: "0.4.0" },
  { ts: "2026-02-01T09:12:00Z", session: "d2", kind: "dispatch-usage", scope_id: "ci-iu", carrier: "ci-iu", carrier_kind: "standalone-iu", arc: "incremental", cumulative: true, model: "claude-opus-4-8", token_usage: { input: 200, output: 80, cache_creation_5m: 10, cache_creation_1h: 0, cache_read: 20000, total: 20290 }, v: "0.4.0" },
  // session-usage cumulative — two turns of the SAME session; latest (higher total) is kept, the
  // raw session id is anonymised. Tests Stop-is-per-turn latest-per-scope.
  { ts: "2026-02-02T08:00:00Z", session: "main-1", kind: "session-usage", scope_id: "main-1", carrier: null, cumulative: true, model: "claude-opus-4-8", token_usage: { input: 1000, output: 500, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 3500, total: 5000 }, v: "0.4.0" },
  { ts: "2026-02-02T08:05:00Z", session: "main-1", kind: "session-usage", scope_id: "main-1", carrier: null, cumulative: true, model: "claude-opus-4-8", token_usage: { input: 2000, output: 900, cache_creation_5m: 100, cache_creation_1h: 0, cache_read: 9000, total: 12000 }, v: "0.4.0" },
  // hostile usage — incompatible version → dropped + counted.
  { ts: "2026-02-02T08:06:00Z", kind: "unit-usage", scope_id: "iubadver", carrier: null, cumulative: false, model: "claude-opus-4-8", token_usage: { input: 1, output: 1, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, total: 2 }, v: "1.0.0" },
  // hostile usage — token_usage missing a component → whole point dropped.
  { ts: "2026-02-02T08:07:00Z", kind: "unit-usage", scope_id: "iubadusage", carrier: null, cumulative: false, model: "claude-opus-4-8", token_usage: { input: 1 } as unknown as Record<string, number>, v: "0.4.0" },
  // hostile usage — oversized scope_id → dropped (ID_RE).
  { ts: "2026-02-02T08:08:00Z", kind: "unit-usage", scope_id: OVERSIZED_ID, carrier: null, cumulative: false, model: "claude-opus-4-8", token_usage: { input: 1, output: 1, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, total: 2 }, v: "0.4.0" },
  // hostile usage — metachar model → sanitised to "unknown" (point KEPT, model never echoed raw).
  { ts: "2026-02-02T08:09:00Z", kind: "unit-usage", scope_id: "iubadmodel", carrier: null, cumulative: false, model: "<script>alert(1)</script>", token_usage: { input: 1, output: 2, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, total: 3 }, v: "0.4.0" },
  // fabrication on a model-authored exit — metrics.tokens_per_iu rejected (counted). No legit trend
  // key here, so it does not perturb the trend assertions above.
  { ts: "2026-02-02T08:10:00Z", session: "s9", kind: "enter", node: "optimise", carrier: null },
  { ts: "2026-02-02T08:11:00Z", session: "s9", kind: "exit", node: "optimise", carrier: null, outcome: "v", gates: [], metrics: { "tokens_per_iu": 7777 } },
  // instrumentation-error (a hook fired but failed loud) → counted in reconciliation.
  { ts: "2026-02-02T08:12:00Z", kind: "instrumentation-error", hook: "stop", error: "node runtime not resolvable", v: "0.4.0" },

  // ── legacy events (no carrier_kind / arc) excluded from stage projection ──
  // ci-legacy has a conforming carrier id but NO kind/arc (preamble < v0.2.0). Its enter events
  // must NOT produce a carrier entry (excluded — degrade, never guess). `legacynode` still counts
  // as a used node (node tracking is independent of the stage projection).
  { ts: "2026-02-03T09:00:00Z", session: "d7", kind: "enter", node: "legacynode", carrier: "ci-legacy" },
  { ts: "2026-02-03T09:05:00Z", session: "d7", kind: "enter", node: "build",      carrier: "ci-legacy" },

  // ── ANALYZER process-cost events (Cluster A §3.2/§3.3, #28) — friction-record + stall-record. ──
  // A clean friction-record: counts admitted, mode echoed (closed enum), session anonymised.
  { ts: "2026-03-01T09:00:00Z", session: "fric-1", kind: "friction-record", permission_denials: 2, rejected_calls: 1, tool_errors: 3, permission_decisions: { allow: 5, deny: 2, ask: 1 }, permission_mode: "auto", v: "0.5.0" },
  // HOSTILE friction-record — a free-text COMMAND smuggled into an unexpected field (`command`) must
  // be dropped (the publisher has no index signature + reads only the allowlist), and a free-text
  // permission_mode must be dropped to "" (not echoed). Counts still admitted.
  { ts: "2026-03-01T10:00:00Z", session: "fric-2", kind: "friction-record", permission_denials: 1, rejected_calls: 0, tool_errors: 0, permission_decisions: { allow: 0, deny: 1, ask: 0 }, permission_mode: "EVIL git push --force; rm -rf /", command: "rm -rf / SMUGGLED_COMMAND", v: "0.5.0" },
  // A clean stall-record: gate-tagged cross-session gap, sessions anonymised.
  { ts: "2026-03-02T18:00:00Z", session: "stall-s", kind: "stall-record", gap_ms: 50400000, before_node: "review", after_node: "land", session_before: "stall-a", session_after: "stall-b", v: "0.5.0" },
  // HOSTILE stall-record — a non-ID_RE before_node (free text with spaces/metachars) must be dropped
  // to null (never echoed), the gap still recorded.
  { ts: "2026-03-03T18:00:00Z", session: "stall-h", kind: "stall-record", gap_ms: 3600000, before_node: "EVIL <script> node with spaces", after_node: "land", session_before: "stall-c", session_after: "stall-d", v: "0.5.0" },
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
  session_costs: Array<{ at: string; kind: string; scope_id: string; carrier_id: string | null; carrier_kind: string | null; arc: string | null; model: string; cumulative: boolean; usage: { input: number; output: number; cache_creation_5m: number; cache_creation_1h: number; cache_read: number; total: number } }>;
  process_costs: {
    friction: Array<{ at: string; session_label: string; permission_denials: number; rejected_calls: number; tool_errors: number; permission_decisions: { allow: number; deny: number; ask: number }; permission_mode: string }>;
    stalls: Array<{ at: string; gap_ms: number; before_node: string | null; after_node: string | null; session_before: string; session_after: string }>;
  };
  reconciliation: { unit_usage: number; session_usage: number; dispatch_usage: number; measured_iu_total: number; session_total: number; inequality_ok: boolean | null; instrumentation_errors: number; rejected_model_token_keys: number; version_incompatible_events: number; notes: string[] };
  provenance: { commit: string; generator_version: string; event_schema_version: string; compatible_event_range: string; observed_event_versions: string[] };
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
  // D69 vectors: a metachar model must be sanitised to "unknown" (raw never echoed); the raw session
  // id "main-1" must be anonymised (the session-usage scope is sess-<n>, not the raw id).
  "<script>", "alert(1)", "\"main-1\"",
  // Cluster A friction/stall vectors: a smuggled free-text command, a free-text permission_mode, and a
  // non-ID before_node must NEVER reach the snapshot (no index sig + closed allowlists drop them).
  "SMUGGLED_COMMAND", "rm -rf", "EVIL", "node with spaces",
  // and the raw friction/stall session ids must be anonymised (sess-<n>), never echoed.
  "\"fric-1\"", "\"stall-a\""];

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

// ── HOOK usage events are the cost source; model token keys are rejected (D69) ──
const sc = snap.session_costs ?? [];
const scOf = (kind: string, scope: string) => sc.find((p) => p.kind === kind && p.scope_id === scope);
const sessionPts = sc.filter((p) => p.kind === "session-usage");
checks.push(
  ["unit-usage ci-iu/iu-iu admitted with 6-component usage", scOf("unit-usage", "iu-iu")?.usage.total === 9150 && scOf("unit-usage", "iu-iu")?.usage.cache_read === 9000],
  ["dispatch-usage ci-iu admitted (cache split preserved)", scOf("dispatch-usage", "ci-iu")?.usage.total === 20290 && scOf("dispatch-usage", "ci-iu")?.usage.cache_creation_5m === 10],
  ["session-usage latest-per-scope kept (12000, not the earlier 5000)", sessionPts.length === 1 && sessionPts[0].usage.total === 12000],
  ["session-usage scope anonymised to sess-<n> (raw session id not echoed)", sessionPts.length === 1 && /^sess-\d+$/.test(sessionPts[0].scope_id)],
  ["incompatible-version usage dropped (iubadver absent)", !scOf("unit-usage", "iubadver")],
  ["bad token_usage dropped (iubadusage absent)", !scOf("unit-usage", "iubadusage")],
  ["oversized scope_id usage dropped", !sc.some((p) => p.scope_id === OVERSIZED_ID)],
  ["metachar model sanitised to 'unknown' (point kept)", scOf("unit-usage", "iubadmodel")?.model === "unknown"],
  ["dispatch-complete tokens_per_session REJECTED (no 52000 in costs)", !sc.some((p) => p.usage && p.usage.total === 52000)],
  ["no legacy tokens_per_session field on any cost point", sc.every((p) => !("tokens_per_session" in (p as object)))],
  ["session_costs time-sorted ascending", sc.every((p, i) => i === 0 || new Date(sc[i - 1].at).getTime() <= new Date(p.at).getTime())],
);

// ── Reconciliation (instrumentation health) ──
const rec = snap.reconciliation;
checks.push(
  ["reconciliation block present", !!rec],
  ["reconciliation counts unit/session/dispatch (iu-iu + iubadmodel = 2 unit)", rec?.unit_usage === 2 && rec?.session_usage === 1 && rec?.dispatch_usage === 1],
  ["reconciliation inequality_ok = true (Σchild 9150 ≤ dispatch 20290)", rec?.inequality_ok === true],
  ["reconciliation rejected_model_token_keys ≥ 2 (dispatch-complete + exit fabrication)", rec?.rejected_model_token_keys >= 2],
  ["reconciliation instrumentation_errors = 1 (loud hook failure)", rec?.instrumentation_errors === 1],
  ["reconciliation version_incompatible_events = 1", rec?.version_incompatible_events === 1],
  ["reconciliation measured_iu_total = 9153 (iu-iu 9150 + iubadmodel 3)", rec?.measured_iu_total === 9153],
);

// ── Provenance version fields (the renderer banner reads these) ──
const prov = snap.provenance;
checks.push(
  ["provenance carries event_schema_version", prov?.event_schema_version === "0.4.0"],
  ["provenance carries compatible_event_range", prov?.compatible_event_range === "0.x"],
  ["observed_event_versions includes both 0.4.0 and the incompatible 1.0.0", prov?.observed_event_versions.includes("0.4.0") && prov?.observed_event_versions.includes("1.0.0")],
);

// ── legacy events (no carrier_kind/arc) excluded from stage projection ──
checks.push(
  ["legacy carrier (no kind/arc) excluded from stage projection", !("ci-legacy" in snap.carriers) && !Object.values(snap.carriers).some((c) => c.carrier_id === "ci-legacy")],
  ["legacy node still counted as a used node", "legacynode" in snap.nodes],
);

// ── ANALYZER process-cost (Cluster A §3.2/§3.3) — friction + stalls, with hostile drops ──
const pc = snap.process_costs;
const fr = pc?.friction ?? [];
const st = pc?.stalls ?? [];
const cleanFric = fr.find((f) => f.permission_denials === 2 && f.tool_errors === 3);
const hostileFric = fr.find((f) => f.permission_denials === 1 && f.tool_errors === 0);
const cleanStall = st.find((s) => s.gap_ms === 50400000);
const hostileStall = st.find((s) => s.gap_ms === 3600000);
checks.push(
  ["process_costs block present (friction + stalls arrays)", !!pc && Array.isArray(fr) && Array.isArray(st)],
  ["clean friction-record admitted with its counts", !!cleanFric && cleanFric.rejected_calls === 1],
  ["friction permission_decisions sub-object read by the 3 known keys", !!cleanFric && cleanFric.permission_decisions.allow === 5 && cleanFric.permission_decisions.deny === 2 && cleanFric.permission_decisions.ask === 1],
  ["friction permission_mode 'auto' (closed enum) echoed", cleanFric?.permission_mode === "auto"],
  ["friction session anonymised to sess-<n> (raw 'fric-1' not echoed)", !!cleanFric && /^sess-\d+$/.test(cleanFric.session_label)],
  // HOSTILE friction — smuggled command field dropped (no index sig), free-text mode → "", counts kept.
  ["HOSTILE friction: smuggled `command` field NOT echoed anywhere", !!hostileFric && !("command" in (hostileFric as object))],
  ["HOSTILE friction: free-text permission_mode dropped to ''", hostileFric?.permission_mode === ""],
  ["HOSTILE friction: counts still admitted (denials=1)", hostileFric?.permission_denials === 1],
  // Clean stall — gate-tagged, sessions anonymised.
  ["clean stall-record admitted (gap + ID_RE node tags)", !!cleanStall && cleanStall.before_node === "review" && cleanStall.after_node === "land"],
  ["stall sessions anonymised (raw 'stall-a' not echoed)", !!cleanStall && /^sess-\d+$/.test(cleanStall.session_before)],
  // HOSTILE stall — non-ID_RE before_node dropped to null, gap still recorded.
  ["HOSTILE stall: non-ID before_node dropped to null", hostileStall !== undefined && hostileStall.before_node === null],
  ["HOSTILE stall: gap still recorded (3600000)", hostileStall?.gap_ms === 3600000],
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
    JSON.stringify(empty.process_costs) === '{"friction":[],"stalls":[]}' &&
    empty.conformance.experience_contract.pass === 0 &&
    empty.conformance.experience_contract.fail === 0;
  console.log(`${emptyOk ? "✓" : "✗"} empty snapshot has trends:{} + session_costs:[] + process_costs empty + zero conformance tally`);
  if (!emptyOk) ok = false;
} catch (e) {
  console.log("✗ empty-snapshot run failed:", e);
  ok = false;
}

rmSync(dir, { recursive: true, force: true });
console.log(ok ? "\nPUBLISHER TEST OK" : "\nPUBLISHER TEST FAILED");
process.exit(ok ? 0 : 1);
