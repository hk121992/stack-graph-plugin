// Analytics surface (A3b-6) — thin + input-gated. Conformance / agent-experience
// (AX) / metric-trends-vs-earns-keep all derive from the carrier-tagged event log,
// which doesn't exist until the loop is exercised. So this surface renders the
// honest input-gated state now, and surfaces whatever the published projection
// snapshot carries (per-node last_used / traversals / AX) once it exists.
// Run: bun run workspace/renderer/build-analytics.ts [--projection <path>]

import {
  writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync, rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  renderMarkdown, assetBasenames, type CorePage,
} from "./vendor/bc-renderer-core/src/index.js";
import { renderSurfacePage } from "./shell-host.js";

const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(rendererDir, "..", "dist");
const surfaceDir = path.join(distRoot, "analytics");
const vendorAssetsDir = path.join(rendererDir, "vendor", "bc-renderer-core", "assets");
const brandDir = path.join(rendererDir, "brand");

function resolveProjectionPath(): string {
  const args = process.argv.slice(2);
  const i = args.indexOf("--projection");
  if (i !== -1 && args[i + 1]) return path.resolve(args[i + 1]);
  if (process.env["PORTAL_PROJECTION"]) return path.resolve(process.env["PORTAL_PROJECTION"]);
  return path.join(distRoot, "portal-projection.json");
}

function gitHead(): string | null {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return null; }
}
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface TrendPoint { at?: string; value?: number }
interface Projection {
  provenance?: { commit?: string; generated_at?: string; generator_version?: string };
  nodes?: Record<string, { last_used?: string | null; traversals_30d?: number }>;
  ax?: Record<string, Record<string, unknown>>;
  trends?: Record<string, TrendPoint[]>;
  conformance?: { experience_contract?: { pass?: number; fail?: number } };
}

if (existsSync(surfaceDir)) rmSync(surfaceDir, { recursive: true, force: true });
mkdirSync(surfaceDir, { recursive: true });
for (const a of assetBasenames) {
  const src = path.join(vendorAssetsDir, a);
  if (existsSync(src)) copyFileSync(src, path.join(surfaceDir, a));
}
for (const a of ["brand-overrides.css", "favicon.svg"]) {
  const src = path.join(brandDir, a);
  if (existsSync(src)) copyFileSync(src, path.join(surfaceDir, a));
}

const projPath = resolveProjectionPath();
let proj: Projection | null = null;
let staleReason: string | null = null;
const head = gitHead();
if (!existsSync(projPath)) {
  staleReason = "No projection snapshot published — analytics are input-gated until the loop is exercised.";
} else {
  try {
    proj = JSON.parse(readFileSync(projPath, "utf8")) as Projection;
    const c = proj.provenance?.commit ?? null;
    if (!head || !c || c !== head) {
      staleReason = `Projection snapshot is stale (snapshot ${c?.slice(0, 7) ?? "—"} vs HEAD ${head?.slice(0, 7) ?? "—"}).`;
    }
  } catch (e) {
    staleReason = `Projection snapshot malformed: ${e}`;
  }
}

// Real projection has data? Otherwise fall back to a clearly-labelled SAMPLE
// fixture so the analytics views are visible before the loop is ever exercised.
interface Carrier { current_stage: string | null; transition_summary: Array<{ stage: string; at: string }> }
// `path_conformance` is the graph-path conformance block (on/off the authored precedes path);
// it is illustrative SAMPLE-only data. `conformance.experience_contract` (inherited from
// Projection) is the real, publisher-derived UX-conformance tally — a distinct axis.
interface View extends Projection {
  carriers?: Record<string, Carrier>;
  path_conformance?: { traced_carriers?: number; on_path?: number; diverged?: number; note?: string };
}
let view: View | null = proj as View | null;
let sampleMode = false;
const realHasData = !!(proj?.nodes && Object.keys(proj.nodes).length > 0);
if (!realHasData) {
  const samplePath = path.join(rendererDir, "fixtures", "analytics", "sample-projection.json");
  if (existsSync(samplePath)) {
    try { view = JSON.parse(readFileSync(samplePath, "utf8")) as View; sampleMode = true; }
    catch { /* leave view as the real (empty) projection */ }
  }
}

const nodeEntries = view?.nodes ? Object.entries(view.nodes) : [];
const hasData = nodeEntries.length > 0;

const intro = `## Analytics

The analytics surface reads the **carrier-tagged event log** the dev-sprint loop emits
(via the instrumentation preamble) and projects three views:

- **Conformance** — did traversals follow the authored graph (precedes/can-follow), and where did they diverge?
- **Agent experience (AX)** — per-node signals on how well each primitive served the agent.
- **Metric-trends vs earns-keep** — does each node still earn its place?

These are **input-gated**: they activate once the loop runs and events accumulate in
\`.stack-graph/\`. A sanitized projection snapshot is published on rebuild; this page joins it.`;

const { html: introHtml } = renderMarkdown(intro, {
  page: { path: "", fm: { title: "Analytics" }, raw: intro } as CorePage,
});

function fmtK(n?: number): string {
  return typeof n === "number" ? (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)) : "—";
}
function fmtMs(n?: number): string {
  if (typeof n !== "number") return "—";
  const s = Math.round(n / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
function bar(n: number, max: number): string {
  const pct = max > 0 ? Math.max(3, Math.round((n / max) * 100)) : 0;
  return `<span class="ax-bar"><span class="ax-bar-fill" style="width:${pct}%"></span></span>`;
}

let dataHtml: string;
if (hasData) {
  const maxTrav = Math.max(...nodeEntries.map(([, n]) => n.traversals_30d ?? 0), 1);
  const rows = nodeEntries
    .sort((a, b) => (b[1].traversals_30d ?? 0) - (a[1].traversals_30d ?? 0))
    .map(([id, n]) =>
      `<tr><td><code>${esc(id)}</code></td><td>${esc(n.last_used ? String(n.last_used).slice(0, 10) : "—")}</td><td class="ax-num">${n.traversals_30d ?? 0}</td><td>${bar(n.traversals_30d ?? 0, maxTrav)}</td></tr>`)
    .join("\n");

  const axEntries = view?.ax ? Object.entries(view.ax) : [];
  const axHtml = axEntries.length
    ? `<h2>Agent experience (per node)</h2>
<table class="analytics-table"><thead><tr><th>node</th><th class="ax-num">tokens&rarr;outcome</th><th class="ax-num">duration</th><th class="ax-num">steps</th><th class="ax-num">tool calls</th><th class="ax-num">backtracks</th><th class="ax-num">tool-path breadth</th></tr></thead>
<tbody>${axEntries.map(([id, a]) => { const x = a as Record<string, number>; return `<tr><td><code>${esc(id)}</code></td><td class="ax-num">${fmtK(x.tokens_to_outcome)}</td><td class="ax-num">${fmtMs(x.duration_ms)}</td><td class="ax-num">${esc(x.steps_to_outcome ?? "—")}</td><td class="ax-num">${esc(x.tool_calls ?? "—")}</td><td class="ax-num">${esc(x.backtracks ?? "—")}</td><td class="ax-num">${esc(x.tool_path_breadth ?? "—")}</td></tr>`; }).join("\n")}</tbody></table>`
    : "";

  // Graph-path conformance (on/off the authored precedes path) — SAMPLE-only illustrative block.
  const cf = view?.path_conformance;
  const firstCarrier = view?.carriers ? Object.values(view.carriers)[0] : undefined;
  const traceHtml = firstCarrier?.transition_summary?.length
    ? `<div class="ax-trace">${firstCarrier.transition_summary.map((t) => `<span class="ax-stage">${esc(t.stage)}</span>`).join('<span class="ax-arrow">&rarr;</span>')}</div>`
    : "";
  const pathConformanceHtml = cf
    ? `<h3>Graph-path conformance</h3>
<div class="ax-stats">
  <div class="ax-stat"><div class="ax-stat-n">${esc(cf.on_path ?? "—")}</div><div class="ax-stat-l">on-path transitions</div></div>
  <div class="ax-stat"><div class="ax-stat-n">${esc(cf.diverged ?? "—")}</div><div class="ax-stat-l">diverged</div></div>
  <div class="ax-stat"><div class="ax-stat-n">${esc(cf.traced_carriers ?? "—")}</div><div class="ax-stat-l">carriers traced</div></div>
</div>
${traceHtml}
${cf.note ? `<p class="ax-note">${esc(cf.note)}</p>` : ""}`
    : "";

  // UX-conformance — experience-contract pass-rate (publisher-derived tally). Render only when
  // any experience-contract gate has fired; values are numeric counts, never gate strings.
  const ec = view?.conformance?.experience_contract;
  const ecTotal = (typeof ec?.pass === "number" ? ec.pass : 0) + (typeof ec?.fail === "number" ? ec.fail : 0);
  const ecRate = ecTotal > 0 ? Math.round(((ec?.pass ?? 0) / ecTotal) * 100) : null;
  const experienceConformanceHtml = ec && ecTotal > 0
    ? `<h3>Experience-contract conformance</h3>
<div class="ax-stats">
  <div class="ax-stat"><div class="ax-stat-n">${ecRate !== null ? `${ecRate}%` : "—"}</div><div class="ax-stat-l">pass rate</div></div>
  <div class="ax-stat"><div class="ax-stat-n">${esc(ec.pass ?? 0)}</div><div class="ax-stat-l">pass</div></div>
  <div class="ax-stat"><div class="ax-stat-n">${esc(ec.fail ?? 0)}</div><div class="ax-stat-l">fail</div></div>
</div>`
    : "";

  const conformanceHtml = (pathConformanceHtml || experienceConformanceHtml)
    ? `<h2>Conformance</h2>\n${pathConformanceHtml}\n${experienceConformanceHtml}`
    : "";

  // Metric trends vs earns-keep — measurement series (benchmark.perf, health.quality, …).
  const trendEntries = view?.trends ? Object.entries(view.trends).filter(([, pts]) => Array.isArray(pts) && pts.length > 0) : [];
  const trendsHtml = trendEntries.length
    ? `<h2>Metric trends</h2>
<p class="ax-note">Each series is the ordered measurement points emitted on node exit; the slope is the earns-keep read.</p>
${trendEntries.map(([series, pts]) => {
        const points = (pts as TrendPoint[]).filter((p) => typeof p.value === "number" && isFinite(p.value as number));
        const vals = points.map((p) => p.value as number);
        const min = Math.min(...vals), max = Math.max(...vals);
        const first = vals[0], last = vals[vals.length - 1];
        const delta = last - first;
        const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
        const cells = points.map((p) =>
          `<td class="ax-num" title="${esc(p.at ? String(p.at).slice(0, 10) : "")}">${esc(p.value)}</td>`).join("");
        return `<h3><code>${esc(series)}</code></h3>
<table class="analytics-table"><thead><tr><th class="ax-num">points</th><th class="ax-num">min</th><th class="ax-num">max</th><th class="ax-num">latest</th><th class="ax-num">Δ</th></tr></thead>
<tbody><tr><td class="ax-num">${points.length}</td><td class="ax-num">${esc(min)}</td><td class="ax-num">${esc(max)}</td><td class="ax-num">${esc(last)}</td><td class="ax-num">${arrow} ${esc(Math.abs(delta))}</td></tr></tbody></table>
<table class="analytics-table"><thead><tr><th>series</th>${points.map((_, i) => `<th class="ax-num">${i + 1}</th>`).join("")}</tr></thead><tbody><tr><td><code>${esc(series)}</code></td>${cells}</tr></tbody></table>`;
      }).join("\n")}`
    : "";

  dataHtml = `<h2>Node activity</h2>
<table class="analytics-table"><thead><tr><th>node</th><th>last used</th><th class="ax-num">30d</th><th>activity</th></tr></thead><tbody>${rows}</tbody></table>
${axHtml}
${conformanceHtml}
${trendsHtml}`;
} else {
  dataHtml = `<div class="callout callout-info"><p><strong>Input-gated.</strong> ${esc(staleReason ?? "No event data yet.")}
Once the dev-sprint loop runs against this workspace and the projection snapshot is published,
node activity, conformance, and AX trends appear here.</p></div>`;
}

const banner = sampleMode
  ? `<div class="callout callout-sample"><p><strong>Sample data.</strong> Illustrative figures so the analytics views are visible before the loop runs. Real analytics replace these once the dev-sprint loop emits events and a projection snapshot is published.</p></div>`
  : (staleReason && hasData
    ? `<div class="callout callout-warning"><p>⚠ ${esc(staleReason)} The figures below may not reflect the current commit.</p></div>`
    : "");

const page: CorePage = { path: "", fm: { title: "Analytics", noindex: true }, raw: "", kind: "docs" };
const out = renderSurfacePage({
  slug: "",
  page,
  nav: [{ group: "Workspace", pages: [""] }],
  bodyHtml: banner + introHtml + dataHtml,
  pageLabel: () => "Analytics",
  showToc: false,
  layoutVariant: "app",
  extraHead: () => `<style>
.callout { border:1px solid var(--hair); border-radius:6px; padding:.7em 1em; margin:1em 0; font-size:.88rem; color: var(--fg-soft); }
.callout-info { background: color-mix(in srgb, #9aa0a6 9%, transparent); }
.callout-sample { background: color-mix(in srgb, var(--accent) 9%, transparent); border-color: color-mix(in srgb, var(--accent) 35%, var(--hair)); }
.callout-warning { background: color-mix(in srgb, #d9a514 10%, transparent); border-color: color-mix(in srgb, #d9a514 40%, var(--hair)); }
.analytics-table { width:100%; border-collapse: collapse; margin: .5rem 0 1.5rem; }
.analytics-table th, .analytics-table td { text-align:left; padding:.4rem .6rem; border-bottom:1px solid var(--hair); font-size:.86rem; }
.analytics-table th { font-family: var(--mono); font-size:.66rem; text-transform:uppercase; letter-spacing:.06em; color: var(--mute); font-weight:600; }
.analytics-table code { font-family: var(--mono); }
.ax-num { text-align:right; font-variant-numeric: tabular-nums; font-family: var(--mono); }
.ax-bar { display:inline-block; width:120px; height:8px; background: var(--code-bg); border-radius:999px; overflow:hidden; vertical-align:middle; }
.ax-bar-fill { display:block; height:100%; background: var(--accent); }
.ax-stats { display:flex; gap:1.5em; margin:.5em 0 1em; }
.ax-stat-n { font-family: var(--display); font-size:1.6rem; font-weight:700; color: var(--fg); }
.ax-stat-l { font-size:.74rem; color: var(--mute); }
.ax-trace { display:flex; flex-wrap:wrap; align-items:center; gap:.4em; margin:.3em 0 .6em; }
.ax-stage { font-family: var(--mono); font-size:.74rem; background: var(--code-bg); border:1px solid var(--hair); border-radius:999px; padding:.1em .6em; color: var(--fg-soft); }
.ax-arrow { color: var(--mute); }
.ax-note { font-size:.82rem; color: var(--mute); }
</style>`,
});

mkdirSync(surfaceDir, { recursive: true });
writeFileSync(path.join(surfaceDir, "index.html"), out, "utf-8");
process.stdout.write(`analytics surface → workspace/dist/analytics/index.html (${sampleMode ? "SAMPLE data" : hasData ? `${nodeEntries.length} nodes` : "input-gated, no data yet"})\n`);
