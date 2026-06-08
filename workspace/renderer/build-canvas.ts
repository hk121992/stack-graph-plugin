// Canvas surface (WS4) — the Business Model Canvas + Value Proposition Canvas.
//
// Renders the strategy canvas (Strategyzer: BMC nine blocks + VPC value-map /
// customer-profile + fit) into workspace/dist/canvas/. Reads a JSON seed
// (default: fixtures/canvas/canvas.json; override --root <dir> or CANVAS_ROOT).
// The strategy-curator skill is the eventual write path; this is the read surface.
//
// Each block renders as a SUMMARY CELL: an optional authored thesis (or an
// auto top-bets fallback) over a strictly-proportional, derived evidence-state
// rollup bar + an exact counts line + a 1–2 bet preview. The whole cell is one
// drill target (role=button) that opens the right-hand drawer (popout.js) with
// the block's thesis + bar + full bet list, each bet a native <details>.
//
// Each entry carries an evidence state (assumed | tested | confirmed | killed |
// superseded) — the model is a set of bets, not facts (bmc-schema / vpc-schema).
// The rollup is ALWAYS derived here from entries[].evidence; the thesis is the
// only authored text and is rendered as a claim (and esc()'d like all content).
// PRODUCT-AGNOSTIC: no consumer-specific block codes, paths, or terms.
// Run: bun run workspace/renderer/build-canvas.ts [--root <dir>]

import {
  writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync, rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assetBasenames, type CorePage } from "./vendor/bc-renderer-core/src/index.js";
import { renderSurfacePage } from "./shell-host.js";
import { brandRoot } from "./brand/brand.js";

const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(rendererDir, "..", "dist");
const surfaceDir = path.join(distRoot, "canvas");
const vendorAssetsDir = path.join(rendererDir, "vendor", "bc-renderer-core", "assets");
const brandDir = brandRoot;   // BRAND_ROOT overlay, else the vendored brand/

function resolveRoot(): string {
  const args = process.argv.slice(2);
  const i = args.indexOf("--root");
  if (i !== -1 && args[i + 1]) return path.resolve(args[i + 1]);
  if (process.env["CANVAS_ROOT"]) return path.resolve(process.env["CANVAS_ROOT"]);
  return path.join(rendererDir, "fixtures", "canvas");
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface Entry {
  id?: string; text: string; evidence?: string; detail?: string;
  importance?: string;      // VPC profile items (jobs/pains/gains) — vpc-schema
  importance_rank?: string; // generic ranked importance (critical|high|medium|low) — Phase 0.5
  strength?: string;        // evidence-strength rung (weak|moderate|strong) — four-risks / Phase 0.5
  addresses?: string[];     // value-map items → the profile items they address
  refs?: string[];          // links to supporting hypotheses / findings — bmc-schema
}
// Evidence-strength rung pill (four-risks): a SECOND axis beside the lifecycle state,
// so a "confirmed-on-weak" bet never reads the same as one confirmed on observed
// behaviour. Rendered only when the entry carries a strength.
function strengthPill(s?: string): string {
  const r = (s || "").toLowerCase();
  if (r !== "weak" && r !== "moderate" && r !== "strong") return "";
  return `<span class="str str-${r}" title="evidence strength: ${r}">${esc(r)}</span>`;
}
// A block is an optional authored thesis + its entries. `thesis` is optional so
// the schema is additive and migration-safe; a consumer may still hand us a bare
// Entry[] (legacy) — normaliseBlock() folds both into this shape.
interface BlockData { thesis?: string; entries: Entry[] }
interface FitClaim { claim: string; evidence?: string }
interface SupportingGroup { label: string; thesis?: string; entries: Entry[] }
interface CanvasData {
  title?: string; note?: string;
  // Each BMC/VPC slot is either a bare Entry[] (legacy) or a {thesis?,entries}
  // BlockData. vpc additionally carries a `segment` STRING (read separately —
  // never normalised as a block). normaliseBlock() handles the union at load.
  bmc: Record<string, Entry[] | BlockData>;
  vpc: Record<string, Entry[] | BlockData | string>;
  // Optional extra blocks that have no 9-block BMC / 6-block VPC home (e.g. a
  // four-risks landscape: competition, network effects, strategic framing). A
  // harness emits them here; they render in a labelled "Supporting blocks" region
  // below the canvas. General — any consumer can populate it (or omit it).
  supporting?: SupportingGroup[];
  fit?: { problem_solution?: FitClaim; product_market?: FitClaim };
}

// Normalise a block slot to {thesis?,entries}. Run at load BEFORE any block()
// call, on the BMC/VPC block slots only (never on the vpc `segment` string).
//  (a) bare Entry[]      → {entries}        (legacy fixture stays working)
//  (b) {thesis?,entries} → passthrough
//  (c) undefined/missing → {entries:[]}
//  (d) malformed object  → {entries:[]}     (no `entries` key → empty, no crash)
function normaliseBlock(v: Entry[] | BlockData | undefined): BlockData {
  if (Array.isArray(v)) return { entries: v };
  if (!v || typeof v !== "object") return { entries: [] };
  return { thesis: v.thesis, entries: Array.isArray(v.entries) ? v.entries : [] };
}

// Evidence ladder (bmc-schema / vpc-schema): the model is a set of bets recorded
// by how well-evidenced each is. assumed → tested → confirmed are the live rungs;
// killed (invalidated) and superseded (replaced) are preserved honestly rather
// than dropped, so the canvas never over-states certainty.
const LADDER = ["assumed", "tested", "confirmed", "killed", "superseded"] as const;
const LIVE_RUNGS = ["confirmed", "tested", "assumed"] as const;  // counts-line order
const RETIRED = new Set(["killed", "superseded"]);
type EvState = (typeof LADDER)[number];

function evState(ev?: string): EvState {
  const e = (ev || "assumed").toLowerCase();
  return (LADDER as readonly string[]).includes(e) ? (e as EvState) : "assumed";
}
function evPill(ev?: string): string {
  return `<span class="ev ev-${evState(ev)}">${esc(evState(ev))}</span>`;
}

// Derived rollup: count entries by evidence state. ALWAYS computed here — the
// thesis can claim, the rollup can't lie; it's the honesty anchor under it.
function rollup(entries: Entry[]): Record<EvState, number> {
  const c = { assumed: 0, tested: 0, confirmed: 0, killed: 0, superseded: 0 };
  for (const e of entries) c[evState(e.evidence)]++;
  return c;
}

// Strict-proportional stacked bar — one segment per non-zero state in ladder
// order, flex:<count> so widths are the true shape (NO min-width floor; a lone
// confirmed bet is an honest sliver, and the counts line below is its precise
// anchor). role=img with the exact breakdown as the accessible label.
function evBar(entries: Entry[]): string {
  const total = entries.length;
  if (!total) return "";
  const c = rollup(entries);
  const present = LADDER.filter((s) => c[s] > 0);
  const segs = present.map((s) => `<span class="cvbar-seg is-${s}" style="flex:${c[s]}"></span>`).join("");
  const label = present.map((s) => `${c[s]} ${s}`).join(", ");
  return `<div class="cvbar" role="img" aria-label="${esc(`${total} bets: ${label}`)}">${segs}</div>`;
}

// Exact counts line — the precise honesty anchor (carries numbers the bar may
// render too thin to see). Live rungs (confirmed/tested/assumed) always shown,
// even at 0; killed/superseded only when present (legend rule).
function countsLine(entries: Entry[]): string {
  const total = entries.length;
  if (!total) return "";
  const c = rollup(entries);
  const parts: string[] = [`<span class="cv-count-total">${total} bets</span>`];
  for (const s of LIVE_RUNGS) parts.push(`<span class="cv-count is-${s}">${c[s]} ${s}</span>`);
  for (const s of ["killed", "superseded"] as const) if (c[s] > 0) parts.push(`<span class="cv-count is-${s}">${c[s]} ${s}</span>`);
  return `<div class="cv-counts">${parts.join("")}</div>`;
}

// Preview bets: the 1–2 headline entries. Live bets first (a retired bet should
// never be the headline); entries arrive importance-ordered from the consumer.
function liveFirst(entries: Entry[]): Entry[] {
  const live = entries.filter((e) => !RETIRED.has(evState(e.evidence)));
  return live.length ? live : entries;
}

// ── Block-detail drawer sidecar (read by popout.js) ──────────────────────────
// One sidecar per block, id = `block::${region}::${slot}`. The `block::` prefix
// can never collide with an entry id: real entry ids carry no `::` separator.
const sidecar: Record<string, { code: string; html: string }> = {};

// One bet → a native <details> disclosure (keyboard + SR accessible, zero JS).
function betDetails(e: Entry): string {
  const code = e.id ? `<code class="po-bet-code">${esc(e.id)}</code> ` : "";
  const refs = (e.refs || []).map((r) => `<code>${esc(r)}</code>`).join(" ");
  const addresses = (e.addresses || []).map((a) => `<li>${esc(a)}</li>`).join("");
  const body = [
    e.importance ? `<div class="po-bet-meta">importance: ${esc(e.importance)}</div>` : "",
    e.detail
      ? `<p>${esc(e.detail)}</p>`
      : `<p class="po-muted">No further detail recorded yet — the strategy-curator fills this in.</p>`,
    addresses ? `<div class="po-sub"><div class="po-label">Addresses</div><ul>${addresses}</ul></div>` : "",
    refs ? `<div class="po-sub"><div class="po-label">Supporting evidence</div><p>${refs}</p></div>` : "",
  ].filter(Boolean).join("\n");
  return `<details class="po-bet" data-ev="${evState(e.evidence)}"${e.id ? ` data-bet="${esc(e.id)}"` : ""}>
  <summary>${code}<span class="po-bet-title">${esc(e.text)}</span> ${evPill(e.evidence)}${strengthPill(e.strength)}</summary>
  <div class="po-bet-body">${body}</div>
</details>`;
}

// The drawer body for a block: thesis (claim) + derived bar + counts + bet list.
function blockDetailHtml(label: string, bd: BlockData): string {
  const { thesis, entries } = bd;
  return [
    `<h2 class="po-block-title">${esc(label)}</h2>`,
    thesis ? `<p class="po-thesis">${esc(thesis)}</p>` : "",
    evBar(entries),
    countsLine(entries),
    `<div class="po-bets">${entries.map(betDetails).join("\n")}</div>`,
  ].filter(Boolean).join("\n");
}

// ── Summary cell (the grid block) ────────────────────────────────────────────
function block(cls: string, label: string, region: string, slot: string, bd: BlockData): string {
  const { thesis, entries } = bd;
  const total = entries.length;

  // Empty block: render the thesis (if any), omit the bar + drill, show a muted
  // "no bets" note. A thesis-less empty block falls back to just label + note.
  if (total === 0) {
    return `<div class="cv-cell ${cls} is-empty">
  <div class="cv-cell-label">${esc(label)}</div>
  ${thesis ? `<p class="cv-thesis">${esc(thesis)}</p>` : ""}
  <p class="cv-nobets">— no bets in this block</p>
</div>`;
  }

  const id = `block::${region}::${slot}`;   // see sidecar prefix note above
  sidecar[id] = { code: label, html: blockDetailHtml(label, bd) };

  const pool = liveFirst(entries);
  // Headline: the thesis (claim), else the top live bet as a lighter provisional
  // headline (clearly the auto-fallback). Preview shows the remaining top bets.
  const headline = thesis
    ? `<p class="cv-thesis">${esc(thesis)}</p>`
    : `<p class="cv-thesis is-fallback">${esc(pool[0].text)}</p>`;
  const preview = thesis ? pool.slice(0, 2) : pool.slice(1, 3);
  const previewHtml = preview.length
    ? `<ul class="cv-preview">${preview.map((e) => `<li>${esc(e.text)} ${evPill(e.evidence)}</li>`).join("")}</ul>`
    : "";

  // Per-entry landing anchors: a cross-surface deep-link (e.g. a work-item → bet
  // /canvas/#<bet-id>) lands on the block CELL that holds the bet (the bet list lives
  // in the drawer sidecar, not the static DOM). popout.js then opens this block's
  // drawer for the hash. Invisible, zero-height; one per entry that carries an id.
  const anchors = entries.filter((e) => e.id)
    .map((e) => `<span class="cv-anchor" id="${esc(e.id!)}"></span>`).join("");

  // The WHOLE cell is the single drill target (role=button); popout.js handles
  // click + Enter/Space via delegation on [data-popout]. Preview bets are plain
  // text, NOT separate click targets (no nested interactive elements).
  return `<div class="cv-cell ${cls}" data-popout="${esc(id)}" role="button" tabindex="0" aria-label="${esc(`${label} — ${total} bets, open detail`)}">
  ${anchors}
  <div class="cv-cell-label">${esc(label)}</div>
  ${headline}
  ${evBar(entries)}
  ${countsLine(entries)}
  ${previewHtml}
  <div class="cv-drill">See all ${total} →</div>
</div>`;
}

// ── Load ───────────────────────────────────────────────────────────────────
const root = resolveRoot();
const dataPath = path.join(root, "canvas.json");
if (!existsSync(dataPath)) throw new Error(`canvas seed not found at ${dataPath}`);
const data = JSON.parse(readFileSync(dataPath, "utf8")) as CanvasData;
const b = data.bmc ?? {};
const vRaw = (data.vpc ?? {}) as Record<string, Entry[] | BlockData | string>;
const segment = typeof vRaw["segment"] === "string" ? (vRaw["segment"] as string) : "";

// ── Assets ─────────────────────────────────────────────────────────────────
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

// ── BMC grid (Strategyzer layout) ────────────────────────────────────────────
// [cssClass, label, slotKey] in render order; normaliseBlock runs per slot.
const BMC_DEFS: [string, string, string][] = [
  ["bmc-kp", "Key partnerships", "key_partnerships"],
  ["bmc-ka", "Key activities", "key_activities"],
  ["bmc-kr", "Key resources", "key_resources"],
  ["bmc-vp", "Value propositions", "value_propositions"],
  ["bmc-cr", "Customer relationships", "customer_relationships"],
  ["bmc-ch", "Channels", "channels"],
  ["bmc-cs", "Customer segments", "customer_segments"],
  ["bmc-co", "Cost structure", "cost_structure"],
  ["bmc-re", "Revenue streams", "revenue_streams"],
];
const bmcBlocks = BMC_DEFS.map(([cls, label, slot]) => ({ cls, label, slot, bd: normaliseBlock(b[slot]) }));
const bmcHtml = `<div class="bmc">
  ${bmcBlocks.map((x) => block(x.cls, x.label, "bmc", x.slot, x.bd)).join("\n  ")}
</div>`;

// ── VPC (value map □ + customer profile ○) ───────────────────────────────────
const VM_DEFS: [string, string][] = [
  ["Products & services", "products_services"],
  ["Pain relievers", "pain_relievers"],
  ["Gain creators", "gain_creators"],
];
const CP_DEFS: [string, string][] = [
  ["Customer jobs", "customer_jobs"],
  ["Pains", "pains"],
  ["Gains", "gains"],
];
const vmBlocks = VM_DEFS.map(([label, slot]) => ({ label, slot, bd: normaliseBlock(vRaw[slot] as Entry[] | BlockData | undefined) }));
const cpBlocks = CP_DEFS.map(([label, slot]) => ({ label, slot, bd: normaliseBlock(vRaw[slot] as Entry[] | BlockData | undefined) }));
const vpcHtml = `<div class="vpc">
  <div class="vpc-side">
    <div class="vpc-side-title"><span class="vpc-glyph">▢</span> Value map</div>
    ${vmBlocks.map((x) => block("", x.label, "vpc", x.slot, x.bd)).join("\n    ")}
  </div>
  <div class="vpc-side">
    <div class="vpc-side-title"><span class="vpc-glyph">◯</span> Customer profile</div>
    ${cpBlocks.map((x) => block("", x.label, "vpc", x.slot, x.bd)).join("\n    ")}
  </div>
</div>`;

// ── Supporting blocks (entries with no 9-block-BMC / 6-block-VPC home) ────────
// Rendered only when the seed supplies them. Each group is a summary cell; its
// entries get the same rollup + drawer treatment as canvas blocks.
const supportingGroups: SupportingGroup[] = Array.isArray(data.supporting) ? data.supporting : [];
const supportingBlocks = supportingGroups.map((g) => ({ label: g.label, bd: normaliseBlock(g) }));
const supportingHtml = supportingBlocks.length
  ? `<h2>Supporting blocks</h2>
<p class="cv-sub">Bets that sit outside the nine-block canvas — the wider landscape the model depends on.</p>
<div class="cv-supporting">
  ${supportingBlocks.map((x) => block("cv-support", x.label, "supporting", x.label, x.bd)).join("\n  ")}
</div>`
  : "";

const popoutSidecar = JSON.stringify({ items: sidecar }).replace(/<\//g, "<\\/");
const popoutHtml = `<aside class="popout" data-open="false" aria-hidden="true">
  <div class="popout-backdrop" data-close></div>
  <div class="popout-panel" role="dialog" aria-modal="true" aria-label="Canvas block detail">
    <div class="popout-head"><span class="popout-code">—</span><button class="popout-close" type="button" data-close aria-label="Close detail">×</button></div>
    <div class="popout-body"></div>
  </div>
</aside>
<script type="application/json" id="popout-data">${popoutSidecar}</script>`;

const f = data.fit;
const fitHtml = f
  ? `<h2>Fit</h2>
<div class="cv-fit">
  ${f.problem_solution ? `<div class="cv-fit-row"><div class="cv-fit-label">Problem–solution ${evPill(f.problem_solution.evidence)}</div><p>${esc(f.problem_solution.claim)}</p></div>` : ""}
  ${f.product_market ? `<div class="cv-fit-row"><div class="cv-fit-label">Product–market ${evPill(f.product_market.evidence)}</div><p>${esc(f.product_market.claim)}</p></div>` : ""}
</div>`
  : "";

// Evidence key (color legend for the bar + counts). Live rungs always; killed/
// superseded only when present in the data (so a canvas with no retired bets
// doesn't advertise states it doesn't use).
const allEntries: Entry[] = [
  ...bmcBlocks.flatMap((x) => x.bd.entries),
  ...vmBlocks.flatMap((x) => x.bd.entries),
  ...cpBlocks.flatMap((x) => x.bd.entries),
  ...supportingBlocks.flatMap((x) => x.bd.entries),
];
const keyStates: string[] = ["assumed", "tested", "confirmed"];
if (allEntries.some((e) => evState(e.evidence) === "killed" || evState(e.evidence) === "superseded"))
  keyStates.push("killed", "superseded");

const bodyHtml = `<p class="cv-lede">${esc(data.note ?? "The strategy canvas — bets recorded by evidence state.")} <span class="cv-hint">Each block shows its thesis over a derived evidence rollup; click a block for its full bet list.</span></p>
<div class="cv-legend"><span class="cv-legend-title">Evidence</span> ${keyStates.map((s) => `<span class="ev ev-${s}">${s}</span>`).join(" ")}</div>

<div class="cv-root">
<h2>Business Model Canvas</h2>
${bmcHtml}

<h2>Value Proposition Canvas</h2>
${segment ? `<p class="cv-segment">Segment: <strong>${esc(segment)}</strong></p>` : ""}
${vpcHtml}

${supportingHtml}
${fitHtml}
</div>
${popoutHtml}`;

const CSS = `<style>
/* Evidence colours — single source of truth, shared by the rollup bar segments
   and the .ev-* pills. A brand override of any --ev-* flows to both. The -ink
   tones are the readable counts-line text colours (≥4.5:1 at small size). */
.cv-root, .popout {
  --ev-assumed: #9aa0a6; --ev-tested: #d9a514; --ev-confirmed: #2e9e6b;
  --ev-killed: #cf3b3b; --ev-superseded: #b9bdc2;
  --ev-assumed-ink: #5f6368; --ev-tested-ink: #7a5c00; --ev-confirmed-ink: #1d7a4f;
  --ev-killed-ink: #b3261e; --ev-superseded-ink: #5f6368;
}
.cv-lede { color: var(--mute); margin: 0 0 .8em; }
.cv-legend { display:flex; align-items:center; flex-wrap:wrap; gap:.5em; margin-bottom:1.5em; font-size:.8rem; }
.cv-legend-title { font-family: var(--mono); font-size:.66rem; text-transform:uppercase; letter-spacing:.08em; color: var(--mute); }
.cv-segment { color: var(--fg-soft); font-size:.9rem; }
.ev { font-family: var(--mono); font-size:.62rem; border-radius:999px; padding:.05em .5em; white-space:nowrap; }
.ev-assumed { background: color-mix(in srgb, var(--ev-assumed) 20%, transparent); color: var(--ev-assumed-ink); border:1px solid color-mix(in srgb, var(--ev-assumed) 45%, transparent); }
.ev-tested { background: color-mix(in srgb, var(--ev-tested) 18%, transparent); color: var(--ev-tested-ink); border:1px solid color-mix(in srgb, var(--ev-tested) 45%, transparent); }
.ev-confirmed { background: color-mix(in srgb, var(--ev-confirmed) 16%, transparent); color: var(--ev-confirmed-ink); border:1px solid color-mix(in srgb, var(--ev-confirmed) 45%, transparent); }
.ev-killed { background: color-mix(in srgb, var(--ev-killed) 16%, transparent); color: var(--ev-killed-ink); border:1px solid color-mix(in srgb, var(--ev-killed) 45%, transparent); text-decoration: line-through; }
.ev-superseded { background: color-mix(in srgb, var(--ev-superseded) 22%, transparent); color: var(--ev-superseded-ink); border:1px solid color-mix(in srgb, var(--ev-superseded) 50%, transparent); font-style: italic; }

.bmc { display:grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: minmax(120px, auto); gap:.55em; margin-bottom: 2em; }
.cv-cell { display:flex; flex-direction:column; border:1px solid var(--hair); border-radius:6px; padding:.6em .7em; background: var(--code-bg); min-width:0; }
.cv-cell-label { font-family: var(--mono); font-size:.64rem; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color: var(--mute); margin-bottom:.45em; }

/* Whole-cell drill target. One click target per cell; popout.js delegates click
   + Enter/Space on [data-popout]. */
.cv-cell[data-popout] { cursor:pointer; transition: border-color .12s, background .12s; }
.cv-cell[data-popout]:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--hair)); background: color-mix(in srgb, var(--accent) 5%, var(--code-bg)); }
.cv-cell[data-popout]:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }

/* Thesis = the only authored text, rendered as a claim. Subtle left-rule cue —
   deliberately NOT a heavy coloured-border card. */
.cv-thesis { font-size:.82rem; color: var(--fg); line-height:1.42; margin:0 0 .5em; padding-left:.6em; border-left:2px solid color-mix(in srgb, var(--accent) 40%, var(--hair)); display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden; }
.cv-thesis.is-fallback { color: var(--fg-soft); font-style:italic; border-left-color: var(--hair); }

/* Strict-proportional rollup bar — segments touch (no gap, no min-width). */
.cvbar { display:flex; height:7px; border-radius:999px; overflow:hidden; background: color-mix(in srgb, var(--hair) 60%, transparent); margin:0 0 .4em; }
.cvbar-seg { display:block; min-width:0; }
.cvbar-seg.is-assumed { background: var(--ev-assumed); }
.cvbar-seg.is-tested { background: var(--ev-tested); }
.cvbar-seg.is-confirmed { background: var(--ev-confirmed); }
.cvbar-seg.is-killed { background: var(--ev-killed); }
.cvbar-seg.is-superseded { background: var(--ev-superseded); }

/* Counts line — the precise honesty anchor; readable colours (≥4.5:1). */
.cv-counts { display:flex; flex-wrap:wrap; gap:.12em .55em; font-family: var(--mono); font-size:.6rem; margin-bottom:.5em; }
.cv-count-total { color: var(--fg); font-weight:700; }
.cv-count.is-confirmed { color: var(--ev-confirmed-ink); }
.cv-count.is-tested { color: var(--ev-tested-ink); }
.cv-count.is-assumed { color: var(--ev-assumed-ink); }
.cv-count.is-killed { color: var(--ev-killed-ink); text-decoration: line-through; }
.cv-count.is-superseded { color: var(--ev-superseded-ink); font-style: italic; }

.cv-preview { list-style:none; margin:0 0 .5em; padding:0; display:flex; flex-direction:column; gap:.28em; }
.cv-preview li { font-size:.78rem; color: var(--fg-soft); line-height:1.35; }
.cv-drill { font-family: var(--mono); font-size:.66rem; color: var(--accent); margin-top:auto; padding-top:.1em; }
.cv-nobets { color: var(--mute); font-style:italic; font-size:.78rem; margin:.1em 0 0; }
.cv-hint { color: var(--mute); font-size:.85em; }

.bmc-kp { grid-column:1; grid-row:1 / span 2; }
.bmc-ka { grid-column:2; grid-row:1; }
.bmc-kr { grid-column:2; grid-row:2; }
.bmc-vp { grid-column:3; grid-row:1 / span 2; border-color: color-mix(in srgb, var(--accent) 35%, var(--hair)); }
.bmc-cr { grid-column:4; grid-row:1; }
.bmc-ch { grid-column:4; grid-row:2; }
.bmc-cs { grid-column:5; grid-row:1 / span 2; }
.bmc-co { grid-column:1 / 4; }
.bmc-re { grid-column:4 / 6; }

.cv-sub { color: var(--mute); font-size:.85rem; margin:.2em 0 1em; }
.cv-supporting { display:grid; grid-template-columns: repeat(3, 1fr); gap:.55em; margin-bottom:2em; }
.cv-support { border-style:dashed; }

.vpc { display:grid; grid-template-columns: 1fr 1fr; gap:1em; margin-bottom:1.5em; }
.vpc-side { display:flex; flex-direction:column; gap:.55em; }
.vpc-side-title { font-family: var(--display); font-weight:600; font-size:.95rem; color: var(--fg); display:flex; align-items:center; gap:.4em; }
.vpc-glyph { color: var(--accent); }
.cv-fit { border:1px solid var(--hair); border-left:3px solid var(--accent); border-radius:0 6px 6px 0; background: var(--code-bg); padding:.8em 1em; font-size:.9rem; color: var(--fg-soft); }
.cv-fit-row { margin-bottom:.7em; } .cv-fit-row:last-child { margin-bottom:0; }
.cv-fit-label { font-weight:600; color: var(--fg); margin-bottom:.2em; display:flex; align-items:center; gap:.5em; }
.cv-fit-row p { margin:0; }

/* Drawer: block thesis + bar + counts + the full bet list as native <details>. */
.po-block-title { margin:0 0 .3em; }
.po-thesis { font-size:.92rem; color: var(--fg); line-height:1.45; margin:0 0 .7em; padding-left:.65em; border-left:2px solid color-mix(in srgb, var(--accent) 40%, var(--hair)); }
.po-bets { display:flex; flex-direction:column; gap:.35em; margin-top:.7em; }
.po-bet { border:1px solid var(--hair); border-radius:5px; background: var(--code-bg); }
.po-bet > summary { cursor:pointer; list-style:none; display:flex; flex-wrap:wrap; align-items:center; gap:.4em; padding:.4em .55em; font-size:.85rem; }
.po-bet > summary::-webkit-details-marker { display:none; }
.po-bet > summary::before { content:"▸"; color: var(--mute); font-size:.7em; }
.po-bet[open] > summary::before { content:"▾"; }
.po-bet > summary:focus-visible { outline:2px solid var(--accent); outline-offset:1px; border-radius:5px; }
.po-bet-code { font-family: var(--mono); font-size:.7rem; color: var(--mute); }
.po-bet-title { font-weight:500; color: var(--fg); }
.po-bet-body { font-size:.82rem; color: var(--fg-soft); padding:0 .6em .55em; }
.po-bet-meta { font-family: var(--mono); font-size:.66rem; color: var(--mute); margin:.2em 0 .3em; }

/* Per-entry landing anchor — invisible; offsets scroll so the block isn't flush to top. */
.cv-anchor { display:block; height:0; scroll-margin-top: 5em; }
/* Evidence-strength rung pill — a second axis beside the .ev state pill. The rung
   reads as fill: strong solid, moderate medium, weak faint (so confirmed-on-weak
   can never look as solid as confirmed-on-strong). */
.str { font-family: var(--mono); font-size:.6rem; border-radius:999px; padding:.05em .45em; white-space:nowrap; border:1px solid var(--hair); }
.str-strong { background: color-mix(in srgb, var(--fg) 60%, transparent); color: var(--bg); border-color: transparent; }
.str-moderate { background: color-mix(in srgb, var(--fg) 24%, transparent); color: var(--fg); }
.str-weak { background: transparent; color: var(--mute); border-style:dashed; }
.po-bet-body p { margin:.2em 0; }
.po-muted { color: var(--mute); font-style:italic; }
.po-sub { margin-top:.45em; }
.po-label { font-family: var(--mono); font-size:.62rem; text-transform:uppercase; letter-spacing:.06em; color: var(--mute); margin-bottom:.15em; }

@media (max-width: 900px) {
  .bmc { grid-template-columns: 1fr 1fr; }
  .bmc-kp,.bmc-ka,.bmc-kr,.bmc-vp,.bmc-cr,.bmc-ch,.bmc-cs,.bmc-co,.bmc-re { grid-column:auto; grid-row:auto; }
  .vpc { grid-template-columns: 1fr; }
  .cv-supporting { grid-template-columns: 1fr; }
}
</style>`;

const page: CorePage = {
  path: "",
  fm: { title: "Business model", description: "Business Model + Value Proposition canvas — bets by evidence state.", noindex: true },
  raw: "",
  kind: "docs",
};

const out = renderSurfacePage({
  slug: "",
  page,
  nav: [{ group: "Workspace", pages: [""] }],
  bodyHtml,
  pageLabel: () => "Business model",
  showToc: false,
  layoutVariant: "app",
  bodyScripts: () => `<script src="/popout.js" defer></script>`,
  extraHead: () => CSS,
});

writeFileSync(path.join(surfaceDir, "index.html"), out, "utf-8");
process.stdout.write(`canvas surface → workspace/dist/canvas/index.html (BMC 9 blocks + VPC + fit; summary cells + drill)\n`);
