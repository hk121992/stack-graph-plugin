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
import {
  loadPricing, priceUsage, cacheEfficiency, type Pricing, type UsageComponents,
} from "./lib/pricing.ts";

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
interface SessionCostPoint {
  at?: string;
  kind?: "unit-usage" | "session-usage" | "dispatch-usage";
  scope_id?: string;
  carrier_id?: string | null;
  arc?: string | null;
  model?: string;
  cumulative?: boolean;
  usage?: Partial<UsageComponents>;
}
interface Reconciliation {
  unit_usage?: number; session_usage?: number; dispatch_usage?: number;
  measured_iu_total?: number; session_total?: number;
  inequality_ok?: boolean | null; instrumentation_errors?: number;
  rejected_model_token_keys?: number; version_incompatible_events?: number; notes?: string[];
}
// Analyzer-derived process cost (Cluster A §3.2/§3.3). The publisher emits friction[] + stalls[];
// this surface renders them as a Process-cost block. Counts are numbers, mode is a closed enum, node
// tags are bounded ids — all already sanitised by the publisher (the second line of defence).
interface ProcessCostPoint {
  at?: string; session_label?: string;
  permission_denials?: number; rejected_calls?: number; tool_errors?: number;
  permission_decisions?: { allow?: number; deny?: number; ask?: number };
  permission_mode?: string;
}
interface StallPoint {
  at?: string; gap_ms?: number;
  before_node?: string | null; after_node?: string | null;
  session_before?: string; session_after?: string;
}
interface ProcessCosts { friction?: ProcessCostPoint[]; stalls?: StallPoint[] }
// The closed friction numeric keys — kept in LOCKSTEP with publish-projection.ts FRICTION_KEYS and
// docs/workspace-portal-design.md. A key absent from any of the three is silently dropped on a surface.
const FRICTION_KEYS = ["permission_denials", "rejected_calls", "tool_errors"] as const;
interface Projection {
  provenance?: {
    commit?: string; generated_at?: string; generator_version?: string;
    event_schema_version?: string; compatible_event_range?: string; observed_event_versions?: string[];
  };
  nodes?: Record<string, { last_used?: string | null; traversals_30d?: number }>;
  ax?: Record<string, Record<string, unknown>>;
  trends?: Record<string, TrendPoint[]>;
  conformance?: { experience_contract?: { pass?: number; fail?: number } };
  session_costs?: SessionCostPoint[];
  process_costs?: ProcessCosts;
  reconciliation?: Reconciliation;
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
// realHasData must include COST fields (design §6) so a cost-only projection (hooks fired, no node
// activity yet) is NOT discarded for the sample view. It must ALSO include PROCESS-cost fields (§4.2 S7)
// so a friction-only projection (friction/stalls present, no token rows) renders the real degraded
// surface, NOT the sample.
const realHasData = !!(
  (proj?.nodes && Object.keys(proj.nodes).length > 0) ||
  (proj?.session_costs && proj.session_costs.length > 0) ||
  (proj?.process_costs && ((proj.process_costs.friction?.length ?? 0) > 0 || (proj.process_costs.stalls?.length ?? 0) > 0)) ||
  (proj?.reconciliation && ((proj.reconciliation.instrumentation_errors ?? 0) > 0 || (proj.reconciliation.version_incompatible_events ?? 0) > 0))
);
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

// ── Cost block (design §5/§6/§8) ──────────────────────────────────────────────
// A harness binds host `pricing` (SG_PRICING / PRICING env); else the co-located pricing.json.
function resolvePricingPath(): string {
  if (process.env["SG_PRICING"]) return path.resolve(process.env["SG_PRICING"]);
  if (process.env["PRICING"]) return path.resolve(process.env["PRICING"]);
  return path.join(rendererDir, "pricing.json");
}
const pricingPath = resolvePricingPath();
const { pricing, error: pricingError } = existsSync(pricingPath)
  ? loadPricing(pricingPath)
  : { pricing: null as Pricing | null, error: `pricing.json not found at ${pricingPath}` };

function usageOf(p: SessionCostPoint): UsageComponents {
  const u = p.usage ?? {};
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
  return {
    input: n(u.input), output: n(u.output),
    cache_creation_5m: n(u.cache_creation_5m), cache_creation_1h: n(u.cache_creation_1h),
    cache_read: n(u.cache_read), total: n(u.total),
  };
}
function fmtPct(r: number | null): string { return r === null ? "—" : `${Math.round(r * 100)}%`; }
function fmtUsd(d: number | null): string {
  if (d === null) return `<span class="cost-unknown" title="model not in pricing.json">unknown</span>`;
  if (d === 0) return "$0.00";
  return d < 0.01 ? `$${d.toFixed(4)}` : `$${d.toFixed(2)}`;
}
const KIND_LABEL: Record<string, string> = { "unit-usage": "IU", "session-usage": "session", "dispatch-usage": "dispatch" };

// The prescriptive version banner (design §8/§9): names plugin/event/publisher versions + the fix.
function versionBanner(v: View): string {
  const r = v.reconciliation;
  const prov = v.provenance;
  const incompatible = (r?.version_incompatible_events ?? 0) > 0;
  if (!incompatible) return "";
  const observed = (prov?.observed_event_versions ?? []).join(", ") || "—";
  return `<div class="callout callout-warning"><p><strong>⚠ Instrumentation version mismatch.</strong>
${esc(r?.version_incompatible_events ?? 0)} usage event(s) were dropped — their schema version is outside this publisher's compatible band.
Publisher <code>${esc(prov?.generator_version ?? "—")}</code> · event schema <code>${esc(prov?.event_schema_version ?? "—")}</code>
(compatible <code>${esc(prov?.compatible_event_range ?? "—")}</code>) · observed event versions <code>${esc(observed)}</code>.
<strong>Fix:</strong> re-vendor the plugin → rerun <code>harness-init validate</code> → relaunch the session → rebuild the portal.</p></div>`;
}

// The Cost block + instrumentation-health, with prescriptive degraded states.
function costSection(v: View | null): string {
  const costs = v?.session_costs ?? [];
  const rec = v?.reconciliation;
  const errs = rec?.instrumentation_errors ?? 0;
  const versionBad = (rec?.version_incompatible_events ?? 0) > 0;

  // Degraded states (design §8) — each names its one-step remedy.
  if (costs.length === 0) {
    let remedy: string;
    if (errs > 0) {
      remedy = `The analyzer <strong>failed loud</strong> — ${esc(errs)} <code>instrumentation-error</code> event(s) are in the log. Check that the transcripts under <code>SG_TRANSCRIPT_ROOT</code> are readable, then rerun the analyzer.`;
    } else if (versionBad) {
      remedy = `Usage events were dropped for version incompatibility. Re-vendor the plugin and rerun the analyzer (<code>harness-init validate</code> confirms it).`;
    } else if (hasData) {
      // node activity exists but no usage events → the analyzer hasn't processed these sessions yet.
      remedy = `Node activity is present but <strong>no token-usage events</strong> were derived — the transcript analyzer has not run over these sessions yet. Confirm the scheduled analyzer task is registered and run it (<code>harness-init validate</code> runs the analyzer dry-run probe).`;
    } else {
      remedy = `No loop run has been analyzed yet. Cost appears once the dev-sprint / incremental loop runs and the scheduled analyzer processes its transcripts.`;
    }
    return `<h2>Cost</h2>\n<div class="callout callout-info"><p><strong>No cost data.</strong> ${remedy}</p></div>${versionBanner(v as View)}`;
  }

  const priceNote = pricingError
    ? `<div class="callout callout-warning"><p><strong>Pricing unavailable.</strong> ${esc(pricingError)} Token components below are exact; the <em>estimated $</em> column is suppressed until <code>pricing.json</code> is bound.</p></div>`
    : `<p class="ax-note">Estimated cost at current API rates (prices as of <strong>${esc(pricing?.verified_on ?? "—")}</strong>). On a subscription the real bill is usage-limit-based — the token components are primary; $ is the derived secondary. The cache split is priced at its real multipliers (read 0.1×, 5m-write 1.25×, 1h-write 2×).</p>`;

  const rows = costs.map((p) => {
    const u = usageOf(p);
    const ce = cacheEfficiency(u);
    const usd = pricingError ? null : priceUsage(u, p.model ?? "unknown", pricing);
    const cc = u.cache_creation_5m + u.cache_creation_1h;
    return `<tr>
<td>${esc(KIND_LABEL[p.kind ?? ""] ?? p.kind ?? "—")}</td>
<td><code>${esc(p.scope_id ?? "—")}</code></td>
<td><code>${esc(p.model ?? "unknown")}</code></td>
<td class="ax-num">${fmtK(u.input)}</td>
<td class="ax-num">${fmtK(u.output)}</td>
<td class="ax-num">${fmtK(cc)}</td>
<td class="ax-num">${fmtK(u.cache_read)}</td>
<td class="ax-num">${fmtK(u.total)}</td>
<td class="ax-num">${fmtPct(ce)}</td>
<td class="ax-num">${pricingError ? "—" : fmtUsd(usd)}</td>
</tr>`;
  }).join("\n");

  // Reconciliation (instrumentation health) summary.
  const ineq = rec?.inequality_ok;
  const ineqLabel = ineq === true ? "✓ Σ child ≤ session" : ineq === false ? "⚠ Σ child &gt; session (breach)" : "— not checkable";
  const healthRows: string[] = [];
  if (rec) {
    healthRows.push(`<div class="ax-stat"><div class="ax-stat-n">${esc(rec.unit_usage ?? 0)}</div><div class="ax-stat-l">IU measures</div></div>`);
    healthRows.push(`<div class="ax-stat"><div class="ax-stat-n">${esc(rec.session_usage ?? 0)}</div><div class="ax-stat-l">session measures</div></div>`);
    healthRows.push(`<div class="ax-stat"><div class="ax-stat-n">${esc(rec.dispatch_usage ?? 0)}</div><div class="ax-stat-l">dispatch measures</div></div>`);
    healthRows.push(`<div class="ax-stat"><div class="ax-stat-n">${esc(errs)}</div><div class="ax-stat-l">instrumentation errors</div></div>`);
  }
  const noteList = (rec?.notes ?? []).length
    ? `<ul class="cost-notes">${(rec!.notes!).map((nt) => `<li>${esc(nt)}</li>`).join("")}</ul>`
    : "";
  const healthHtml = rec
    ? `<h3>Instrumentation health</h3>
<p class="ax-note">Reconciliation: <strong>${ineqLabel}</strong>. ${rec.rejected_model_token_keys ? `${esc(rec.rejected_model_token_keys)} model-authored token key(s) rejected (fabrication guard). ` : ""}This is the tripwire that catches a cache-blind cost (the historic ~25× gap).</p>
<div class="ax-stats">${healthRows.join("")}</div>
${noteList}`
    : "";

  return `<h2>Cost</h2>
${priceNote}
<table class="analytics-table"><thead><tr><th>scope</th><th>id</th><th>model</th><th class="ax-num">input</th><th class="ax-num">output</th><th class="ax-num">cache-write</th><th class="ax-num">cache-read</th><th class="ax-num">total</th><th class="ax-num">cache-eff</th><th class="ax-num">est&nbsp;$</th></tr></thead>
<tbody>${rows}</tbody></table>
${healthHtml}
${versionBanner(v as View)}`;
}

const FRICTION_LABEL: Record<string, string> = {
  permission_denials: "denials", rejected_calls: "rejections", tool_errors: "tool errors",
};
function fmtGap(ms?: number): string {
  if (typeof ms !== "number" || !isFinite(ms) || ms < 0) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// The Process-cost block (Cluster A §4.3): analyzer-derived friction (denials/rejections/errors +
// permission-decision breakdown) and cross-session stalls (total + longest, gate-tagged). All values
// are publisher-sanitised (counts numeric, mode a closed enum, node tags ID_RE); this surface only
// renders. Degraded state when no process data exists yet (analyzer not yet run).
function processCostSection(v: View | null): string {
  const pc = v?.process_costs ?? {};
  const friction = pc.friction ?? [];
  const stalls = pc.stalls ?? [];

  if (friction.length === 0 && stalls.length === 0) {
    return `<h2>Process cost</h2>
<div class="callout callout-info"><p><strong>No process data.</strong> Friction (permission denials, rejected calls, tool errors) and stalls are derived by the transcript analyzer. They appear once the analyzer has run over this workspace's session transcripts (scheduled batch, ~1–2×/day).</p></div>`;
  }

  // Friction totals across sessions + the permission-decision breakdown.
  const totals: Record<string, number> = { permission_denials: 0, rejected_calls: 0, tool_errors: 0 };
  const decisions = { allow: 0, deny: 0, ask: 0 };
  for (const f of friction) {
    for (const k of FRICTION_KEYS) {
      const val = (f as Record<string, unknown>)[k];
      if (typeof val === "number" && isFinite(val) && val >= 0) totals[k] += val;
    }
    const d = f.permission_decisions ?? {};
    decisions.allow += typeof d.allow === "number" && d.allow >= 0 ? d.allow : 0;
    decisions.deny += typeof d.deny === "number" && d.deny >= 0 ? d.deny : 0;
    decisions.ask += typeof d.ask === "number" && d.ask >= 0 ? d.ask : 0;
  }

  const frictionStats = FRICTION_KEYS
    .map((k) => `<div class="ax-stat"><div class="ax-stat-n">${esc(totals[k])}</div><div class="ax-stat-l">${esc(FRICTION_LABEL[k])}</div></div>`)
    .join("");
  const decisionStats = `<div class="ax-stat"><div class="ax-stat-n">${esc(decisions.allow)}</div><div class="ax-stat-l">decisions: allow</div></div>
<div class="ax-stat"><div class="ax-stat-n">${esc(decisions.deny)}</div><div class="ax-stat-l">deny</div></div>
<div class="ax-stat"><div class="ax-stat-n">${esc(decisions.ask)}</div><div class="ax-stat-l">ask</div></div>`;

  const frictionHtml = friction.length
    ? `<h3>Friction</h3>
<p class="ax-note">Categorised counts across ${esc(friction.length)} session(s) — denial commands and rejection reasons are deliberately not carried (locality).</p>
<div class="ax-stats">${frictionStats}${decisionStats}</div>`
    : "";

  // Stalls — total, longest, and the gate-tagged ones.
  let stallHtml = "";
  if (stalls.length) {
    const longest = stalls.reduce((mx, s) => Math.max(mx, typeof s.gap_ms === "number" ? s.gap_ms : 0), 0);
    const tagged = stalls.filter((s) => s.before_node);
    const stallRows = stalls
      .slice()
      .sort((a, b) => (b.gap_ms ?? 0) - (a.gap_ms ?? 0))
      .slice(0, 10)
      .map((s) => `<tr><td class="ax-num">${esc(fmtGap(s.gap_ms))}</td><td><code>${esc(s.before_node ?? "—")}</code></td><td><code>${esc(s.after_node ?? "—")}</code></td><td>${esc(s.at ? String(s.at).slice(0, 16).replace("T", " ") : "—")}</td></tr>`)
      .join("\n");
    stallHtml = `<h3>Stalls</h3>
<p class="ax-note">Cross-session activity gaps over the threshold. ${esc(stalls.length)} stall(s); longest <strong>${esc(fmtGap(longest))}</strong>; ${esc(tagged.length)} tagged to a gate-holding node (a gap straddling a pause point).</p>
<table class="analytics-table"><thead><tr><th class="ax-num">gap</th><th>before</th><th>after</th><th>started</th></tr></thead>
<tbody>${stallRows}</tbody></table>`;
  }

  return `<h2>Process cost</h2>
${frictionHtml}
${stallHtml}`;
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
  bodyHtml: banner + introHtml + dataHtml + costSection(view) + processCostSection(view),
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
.cost-unknown { color: #d9a514; font-style: italic; }
.cost-notes { font-size:.8rem; color: var(--mute); margin:.4em 0 1em 1.1em; }
.cost-notes li { margin:.15em 0; }
</style>`,
});

mkdirSync(surfaceDir, { recursive: true });
writeFileSync(path.join(surfaceDir, "index.html"), out, "utf-8");
process.stdout.write(`analytics surface → workspace/dist/analytics/index.html (${sampleMode ? "SAMPLE data" : hasData ? `${nodeEntries.length} nodes` : "input-gated, no data yet"})\n`);
