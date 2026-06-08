// Canvas renderer test — drives build-canvas.ts over controlled canvas.json
// fixtures and asserts the rendered dist/canvas/index.html. Mirrors
// publish-projection.test.ts: a standalone script that asserts and exits 0 (OK)
// / 1 (FAILED). Six cases (eng-review test plan): legacy back-compat, new
// {thesis,entries} shape, empty value_propositions, hostile thesis (XSS),
// killed/superseded only-when-present, and block sidecar id + <details> bets.
//
// NB on assertions: rendered class attributes are SPACE-separated
// (`class="cv-count is-killed"`) while the static CSS uses DOT form
// (`.cv-count.is-killed`). So the space-form substring matches the DATA only,
// never the always-present stylesheet — that's how "absent when no such bets"
// is checked without false matches against the CSS.
//
// Run: bun run workspace/renderer/build-canvas.test.ts   (exit 0 = OK)

import { writeFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const builder = path.join(here, "build-canvas.ts");
const distIndex = path.join(here, "..", "dist", "canvas", "index.html");

// Render a fixture: write canvas.json into a temp --root, run the builder, read
// the produced index.html (output path is fixed at dist/canvas/index.html).
function render(canvas: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "sg-canvas-test-"));
  writeFileSync(path.join(dir, "canvas.json"), JSON.stringify(canvas), "utf8");
  try {
    execFileSync("bun", ["run", builder, "--root", dir], { encoding: "utf8" });
    return readFileSync(distIndex, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const checks: Array<[string, boolean]> = [];
const ok = (name: string, pass: boolean) => checks.push([name, pass]);

// ── Case 1 — legacy bare Entry[] back-compat ─────────────────────────────────
// No thesis → fallback top-bets headline; renders; the bare array still works.
{
  const html = render({
    bmc: { key_activities: [
      { text: "Legacy Alpha", evidence: "assumed" },
      { text: "Legacy Beta", evidence: "tested" },
    ] },
    vpc: {},
  });
  ok("[1] legacy renders the canvas", html.includes("Business Model Canvas"));
  ok("[1] legacy uses the auto top-bets fallback headline", html.includes("cv-thesis is-fallback"));
  ok("[1] fallback headline is the top live bet (Legacy Alpha)", html.includes("Legacy Alpha"));
  ok("[1] no authored (non-fallback) thesis line", !html.includes('"cv-thesis">'));
  ok("[1] block is a drill target (See all 2)", html.includes("See all 2 →"));
}

// ── Case 2 — new {thesis,entries} shape ──────────────────────────────────────
{
  const html = render({
    bmc: { key_activities: {
      thesis: "Build the platform first.",
      entries: [
        { id: "X-1", text: "Alpha bet", evidence: "assumed" },
        { id: "X-2", text: "Beta bet", evidence: "confirmed" },
      ],
    } },
    vpc: {},
  });
  ok("[2] authored thesis line rendered", html.includes('<p class="cv-thesis">Build the platform first.</p>'));
  ok("[2] proportional bar has an assumed segment", html.includes("cvbar-seg is-assumed"));
  ok("[2] proportional bar has a confirmed segment", html.includes("cvbar-seg is-confirmed"));
  ok("[2] bar segments are flex-proportional (flex:1)", html.includes('style="flex:1"'));
  ok("[2] counts line shows the total", html.includes('<span class="cv-count-total">2 bets</span>'));
  ok("[2] preview bets shown", html.includes('class="cv-preview"') && html.includes("Alpha bet"));
  ok("[2] whole cell is a button", html.includes('role="button"'));
}

// ── Case 3 — empty value_propositions {thesis, entries:[]} ───────────────────
// Thesis shown; NO bar, NO drill, "no bets" note; no block sidecar created.
{
  const html = render({
    bmc: { value_propositions: { thesis: "Decomposes into the VPC.", entries: [] } },
    vpc: {},
  });
  ok("[3] empty block still shows its thesis", html.includes("Decomposes into the VPC."));
  ok("[3] empty block shows the muted no-bets note", html.includes("no bets in this block"));
  ok("[3] empty block renders NO rollup bar", !html.includes('class="cvbar"'));
  ok("[3] empty block has NO drill affordance", !html.includes("See all"));
  ok("[3] empty block creates NO drawer sidecar", !html.includes("block::bmc::value_propositions"));
}

// ── Case 4 — hostile thesis (XSS / injection) ────────────────────────────────
{
  const html = render({
    bmc: { key_activities: {
      thesis: "<script>alert('xss')</script>",
      entries: [{ text: "A bet", evidence: "assumed" }],
    } },
    vpc: {},
  });
  ok("[4] raw <script> payload is NOT in the output", !html.includes("<script>alert('xss')</script>"));
  ok("[4] thesis is esc'd (&lt;script&gt;)", html.includes("&lt;script&gt;alert"));
}

// ── Case 5 — killed/superseded appear only when present ───────────────────────
{
  const withRetired = render({
    bmc: { key_activities: { entries: [
      { text: "Live", evidence: "assumed" },
      { text: "Dead", evidence: "killed" },
      { text: "Replaced", evidence: "superseded" },
    ] } },
    vpc: {},
  });
  ok("[5a] killed count present when a killed bet exists", withRetired.includes("cv-count is-killed"));
  ok("[5a] superseded count present when a superseded bet exists", withRetired.includes("cv-count is-superseded"));
  ok("[5a] killed segment present in the bar", withRetired.includes("cvbar-seg is-killed"));
  ok("[5a] legend advertises killed when present", withRetired.includes("ev ev-killed"));

  const noRetired = render({
    bmc: { key_activities: { entries: [
      { text: "Live A", evidence: "assumed" },
      { text: "Live B", evidence: "tested" },
    ] } },
    vpc: {},
  });
  ok("[5b] killed count absent when no killed bets", !noRetired.includes("cv-count is-killed"));
  ok("[5b] superseded count absent when none", !noRetired.includes("cv-count is-superseded"));
  ok("[5b] killed segment absent from the bar", !noRetired.includes("cvbar-seg is-killed"));
  ok("[5b] legend does NOT advertise killed when absent", !noRetired.includes("ev ev-killed"));
}

// ── Case 6 — block sidecar id + <details> bets present ────────────────────────
{
  const html = render({
    bmc: { key_activities: {
      thesis: "T",
      entries: [{ id: "K-1", text: "A detailed bet", evidence: "assumed", detail: "why this bet" }],
    } },
    vpc: {},
  });
  ok("[6] block-detail sidecar id present in #popout-data", html.includes("block::bmc::key_activities"));
  ok("[6] sidecar bets render as native <details>", html.includes("<details") && html.includes("po-bet"));
  ok("[6] the bet's detail body is carried into the drawer", html.includes("why this bet"));
}

// ── Report ───────────────────────────────────────────────────────────────────
let allOk = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  if (!pass) allOk = false;
}

// Restore dist/canvas to the default fixture build (leave a clean artifact).
try { execFileSync("bun", ["run", builder], { encoding: "utf8" }); } catch { /* non-fatal */ }

console.log(allOk ? "\nCANVAS RENDERER TEST OK" : "\nCANVAS RENDERER TEST FAILED");
process.exit(allOk ? 0 : 1);
