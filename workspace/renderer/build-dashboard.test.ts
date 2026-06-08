// Dashboard renderer test — unit-tests the pure helpers exported from
// build-dashboard.ts (the module guards its side-effecting build under
// `import.meta.main`, so importing it here runs nothing). Mirrors
// build-canvas.test.ts: a standalone script that asserts and exits 0 (OK) / 1.
//
// The headline case is the D65 REGRESSION: risk(pill) and risk(grid) now derive
// the SAME rung from the same risk_state (the prior riskPill matched the raw enum
// while riskGrid used riskRung(), so they could disagree on one item).
//
// Run: bun run workspace/renderer/build-dashboard.test.ts   (exit 0 = OK)

import {
  risk, riskRung, canvasEntryId, coverageRung, parseObjectives, buildReverseIndex,
  type CanvasEntry,
} from "./build-dashboard.ts";

const checks: Array<[string, boolean]> = [];
const ok = (name: string, pass: boolean) => checks.push([name, pass]);

// Pull the rung token out of a `risk-pill risk-<rung>` / `risk-cell risk-<rung>` class.
const pillRung = (html: string) => /risk-pill risk-(\w+)/.exec(html)?.[1] ?? "";
const gridRungs = (html: string) => [...html.matchAll(/risk-cell risk-(\w+)/g)].map((m) => m[1]);
const RUNG_ORD: Record<string, number> = { strong: 3, moderate: 2, weak: 1, unknown: 0 };
const worstOf = (rungs: string[]) => {
  const known = rungs.filter((r) => r !== "unknown");
  if (!known.length) return "unknown";
  return known.reduce((a, b) => (RUNG_ORD[b] < RUNG_ORD[a] ? b : a));
};

// ── Case 1 — the riskPill/riskGrid regression: pill rung == worst grid rung ──────
// Free-text dims are the exact shape the OLD pill misread (it did includes("low")
// on the raw string). A weak free-text dim beside a strong one MUST drag the pill
// to weak — and the grid must show that weak cell. Pill and grid agree by construction.
{
  const rs = {
    value: "strong — observed in 5 design-partner dogfoods",
    usability: "moderate — said-yes in interviews",
    feasibility: "strong — spike shipped",
    viability: "weak — pricing assumed, untested",
  };
  const pill = risk(rs, "pill");
  const grid = risk(rs, "grid");
  const pr = pillRung(pill);
  const gr = gridRungs(grid);
  ok("[1] pill reads the worst rung (weak), not the raw-enum default", pr === "weak");
  ok("[1] grid carries all four dims", gr.length === 4);
  ok("[1] grid rungs are correct per dim (strong/moderate/strong/weak)",
    gr.join(",") === "strong,moderate,strong,weak");
  ok("[1] REGRESSION: pill rung == worst grid rung (no divergence)", pr === worstOf(gr));
}

// Bare-enum risk_state agrees too. value:moderate feas:strong usab:moderate viab:low
// → rungs moderate/moderate/strong/weak → worst = weak.
{
  const rs = { value: "moderate", feasibility: "strong", usability: "moderate", viability: "low" };
  const pr = pillRung(risk(rs, "pill"));
  const gr = gridRungs(risk(rs, "grid"));
  ok("[1] bare-enum pill rung == worst grid rung", pr === worstOf(gr) && pr === "weak");
}

// Absent risk_state → no pill (never a false green). Empty object → unknown, not strong.
ok("[1] absent risk_state → empty pill", risk(undefined, "pill") === "");
ok("[1] empty risk_state → risk-unknown pill (not a false 'strong')",
  pillRung(risk({}, "pill")) === "unknown");

// ── Case 2 — riskRung: bare enum, free-text leading token, unknown ───────────────
ok("[2] riskRung bare strong", riskRung("strong") === "strong");
ok("[2] riskRung free-text leading token", riskRung("weak — only assumed") === "weak");
ok("[2] riskRung 'low' maps to weak (evidence strength)", riskRung("low") === "weak");
ok("[2] riskRung did/said map to strong/moderate", riskRung("did-yes") === "strong" && riskRung("said-yes") === "moderate");
ok("[2] riskRung empty → unknown", riskRung("") === "unknown" && riskRung(undefined) === "unknown");
ok("[2] riskRung garbage → unknown", riskRung("banana") === "unknown");

// ── Case 3 — canvasEntryId: code token vs prose vs empty ─────────────────────────
ok("[3] canvasEntryId code token (hyphen)", canvasEntryId("B-JOB-01 (teams want a win)") === "B-JOB-01");
ok("[3] canvasEntryId code token (digit)", canvasEntryId("vpc1 the thing") === "vpc1");
ok("[3] canvasEntryId plain word → null (no code signal)", canvasEntryId("desirability of the offer") === null);
ok("[3] canvasEntryId empty → null", canvasEntryId(undefined) === null && canvasEntryId("") === null);

// ── Case 4 — coverageRung: honest aggregation (honesty ≥ green) ───────────────────
const ce = (evidence: string, strength: string): CanvasEntry =>
  ({ text: "x", evidence: evidence as CanvasEntry["evidence"], strength: strength as CanvasEntry["strength"], region: "vpc", slot: "pains" });
ok("[4] strong-confirmed + no assumed → strong", coverageRung([ce("confirmed", "strong")]) === "strong");
ok("[4] strong-confirmed BUT an assumed remains → moderate (not green)",
  coverageRung([ce("confirmed", "strong"), ce("assumed", "weak")]) === "moderate");
ok("[4] only assumptions → weak", coverageRung([ce("assumed", "weak")]) === "weak");
ok("[4] empty set → unknown", coverageRung([]) === "unknown");
ok("[4] retired bets are not 'live' evidence", coverageRung([ce("killed", "strong")]) === "unknown");

// ── Case 5 — parseObjectives: structured okr-schema body → model; malformed → empty ─
{
  const body = [
    "## Vision",
    "- **statement:** Reach the first shared outcome fast.",
    "- **horizon:** 2 years",
    "## Objectives",
    "### obj-a — Lift activation",
    "Activation is the wedge.",
    "- **key_results:**",
    '  - `{ metric: "pct reaching outcome", target: "60%", current: "38%" }`',
    "- **strategy_link:** B-JOB-01 — tests the fast-win bet",
    "- **north_star_link:** weekly active teams",
  ].join("\n");
  const m = parseObjectives(body);
  ok("[5] parses vision statement", !!m.vision.statement && m.vision.statement.includes("first shared outcome"));
  ok("[5] parses one objective with id + statement", m.objectives.length === 1 && m.objectives[0].id === "obj-a" && m.objectives[0].statement === "Lift activation");
  ok("[5] parses the key result", m.objectives[0].key_results.length === 1 && m.objectives[0].key_results[0].target === "60%");
  ok("[5] parses strategy_link (objective → bet)", (m.objectives[0].strategy_link ?? "").includes("B-JOB-01"));
  ok("[5] model ok", m.ok === true);
}
{
  const m = parseObjectives("just some prose with no okr structure at all");
  ok("[5] malformed/foreign doc → empty model, ok=false", m.ok === false && m.objectives.length === 0);
}

// ── Case 6 — buildReverseIndex: byOutcome + byValueProp (the newly-surfaced index) ─
{
  const mk = (id: string, outcome?: string, vp?: string) =>
    ({ id, fm: { id, title: id, lifecycle_state: "defined", outcome_link: outcome, value_prop_link: vp }, body: "", sourcePath: "" }) as Parameters<typeof buildReverseIndex>[0][number];
  const items = [
    mk("wi-1", "obj-a", "B-JOB-01 (fast win)"),
    mk("wi-2", "obj-a", undefined),
    mk("wi-3", undefined, "B-JOB-01"),
    mk("wi-4", "obj-b", "desirability prose"),   // vp is prose → not a canvas id
  ];
  const rev = buildReverseIndex(items);
  ok("[6] byOutcome buckets two items under obj-a", (rev.byOutcome.get("obj-a") ?? []).length === 2);
  ok("[6] byOutcome buckets obj-b", (rev.byOutcome.get("obj-b") ?? []).length === 1);
  ok("[6] byValueProp buckets two items under B-JOB-01 (the newly-surfaced index)", (rev.byValueProp.get("B-JOB-01") ?? []).length === 2);
  ok("[6] prose value_prop_link is NOT indexed as a bet", rev.byValueProp.get("desirability prose") === undefined);
}

// ── Report ───────────────────────────────────────────────────────────────────
let failed = 0;
for (const [name, pass] of checks) {
  if (!pass) { failed++; process.stdout.write(`FAIL ${name}\n`); }
}
process.stdout.write(`\nbuild-dashboard.test: ${checks.length - failed}/${checks.length} passed\n`);
process.exit(failed ? 1 : 0);
