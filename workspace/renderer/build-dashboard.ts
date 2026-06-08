// Dashboard surface build (A3b-4).
//
// Renders the product-dashboard (work-ledger-first) into the deployable
// surface at workspace/dist/dashboard/. Reads from a configurable
// work-ledger root (default: workspace/renderer/fixtures/dashboard/;
// override with --root <path> or env DASHBOARD_ROOT).
//
// Page layout:
//   dashboard/             — work ledger index (now/next/later columns + record)
//   dashboard/item/<id>/   — per-item detail
//   dashboard/progress/    — objectives / OKRs / north-star
//   dashboard/strategy/    — vision & strategy
//
// The join: portal-projection.json supplies current_stage for in-delivery
// items. The degraded-mode contract: if the snapshot is absent OR its commit
// differs from the current git HEAD, all snapshot-sourced fields render as
// "unknown" and a visible provenance banner appears. The authored layer always
// renders in full — no panel blanks on a missing snapshot.
//
// Run:
//   bun run workspace/renderer/build-dashboard.ts
//   bun run workspace/renderer/build-dashboard.ts --root /path/to/surface

import {
  readFileSync, writeFileSync, mkdirSync, copyFileSync,
  existsSync, rmSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import {
  parseFrontmatter, renderMarkdown, assetBasenames,
  type CorePage,
} from "./vendor/bc-renderer-core/src/index.js";
import type { NavGroup } from "./vendor/bc-renderer-core/src/index.js";
import { renderSurfacePage } from "./shell-host.js";
import { assetPrefix, makePageHref } from "./lib/asset-prefix.js";

// ── Path setup ───────────────────────────────────────────────────────────────

const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rendererDir, "..", "..");
const distRoot = path.join(rendererDir, "..", "dist");
const surfaceDir = path.join(distRoot, "dashboard");
const vendorAssetsDir = path.join(rendererDir, "vendor", "bc-renderer-core", "assets");
const brandDir = path.join(rendererDir, "brand");

// ── CLI / env root override ──────────────────────────────────────────────────

function resolveRoot(): string {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  if (rootIdx !== -1 && args[rootIdx + 1]) {
    return path.resolve(args[rootIdx + 1]);
  }
  if (process.env["DASHBOARD_ROOT"]) {
    return path.resolve(process.env["DASHBOARD_ROOT"]);
  }
  return path.join(rendererDir, "fixtures", "dashboard");
}

const dashRoot = resolveRoot();

// Projection snapshot path. Assembly points this at the *published* snapshot
// (workspace/dist/portal-projection.json) via --projection, decoupled from the
// ledger root so publishing never pollutes the source ledger/fixture.
function resolveProjectionPath(): string {
  const args = process.argv.slice(2);
  const i = args.indexOf("--projection");
  if (i !== -1 && args[i + 1]) return path.resolve(args[i + 1]);
  if (process.env["PORTAL_PROJECTION"]) return path.resolve(process.env["PORTAL_PROJECTION"]);
  return path.join(dashRoot, "portal-projection.json");
}
const projectionPath = resolveProjectionPath();

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir: string) { mkdirSync(dir, { recursive: true }); }
function writeHtml(filePath: string, html: string) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, html, "utf-8");
}
const log = (m: string) => process.stdout.write(m + "\n");
const warn = (m: string) => process.stderr.write("[warn] " + m + "\n");

function esc(s: unknown): string {
  // Total + context-safe: coerce (YAML may yield numbers/booleans), escape for HTML text
  // AND single/double-quoted attribute contexts.
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Slug a value destined for a CSS class TOKEN. esc() blocks attribute breakout but NOT
// spaces, so an untrusted free-text value (a canvas importance_rank, a work-item
// lifecycle_state) interpolated into `class="… X"` could inject extra class tokens.
// Collapse to a single [a-z0-9-] token. Output is class-safe by construction.
function clsToken(v: unknown): string {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "none";
}

// ── Types ────────────────────────────────────────────────────────────────────

interface GateDecision {
  gate: string;
  decision: string;
  owner: string;
  timestamp: string;
  evidence_refs?: string[];
  confidence?: string;
  conditions?: string | null;
  override?: string;
}

interface FrozenTimeline {
  final_stage: string;
  captured_at: string;
  transitions: Array<{ stage: string; at: string }>;
}

interface RiskState {
  value?: string;
  feasibility?: string;
  usability?: string;
  viability?: string;
  evidence_note?: string;
}

interface WorkItemFm {
  id: string;
  title: string;
  lifecycle_state: string;
  tier?: string;
  outcome_link?: string;
  value_prop_link?: string;
  risk_state?: RiskState;
  gate_decisions?: GateDecision[];
  stage_override?: string;
  children?: string[];
  frozen_timeline?: FrozenTimeline;
  links?: {
    spec_pr?: string | null;
    build_prs?: string[];
    debrief?: string | null;
  };
  disposition?: string;
  [k: string]: unknown;
}

interface ManifestItem {
  id: string;
  file: string;
  title: string;
  lifecycle_state: string;
  tier?: string;
  outcome_link?: string;
}

interface PortalProjection {
  provenance: {
    commit: string;
    generated_at: string;
    generator_version: string;
  };
  carriers: Record<string, {
    current_stage: string | null;
    transition_summary: Array<{ stage: string; at: string }>;
  }>;
  nodes: Record<string, { last_used: string | null; traversals_30d: number }>;
  ax: Record<string, unknown>;
}

interface WorkItem {
  id: string;
  fm: WorkItemFm;
  body: string;
  sourcePath: string;
}

// ── Lifecycle mapping ────────────────────────────────────────────────────────
// Design: later = idea/discovery; next = defined; now = committed;
//         building = in-delivery; record = shipped/live/parked/killed

type LedgerColumn = "now" | "next" | "later" | "building" | "record";

function lifecycleToColumn(state: string): LedgerColumn {
  switch (state) {
    case "idea":
    case "discovery": return "later";
    case "defined":   return "next";
    case "committed": return "now";
    case "in-delivery": return "building";
    case "shipped":
    case "live":
    case "parked":
    case "killed":    return "record";
    default:          return "later";
  }
}

// Column display labels
const COLUMN_LABELS: Record<LedgerColumn, string> = {
  now:      "Now — committed",
  next:     "Next — defined",
  later:    "Later — explore",
  building: "Building — in delivery",
  record:   "Record — shipped / live / parked / killed",
};

// ── Git HEAD resolution ──────────────────────────────────────────────────────

function getGitHead(): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

// ── Projection loading ───────────────────────────────────────────────────────

interface ProjectionResult {
  projection: PortalProjection | null;
  /** true = snapshot present AND commit matches current HEAD */
  fresh: boolean;
  /** human-readable staleness reason, or null when fresh */
  staleReason: string | null;
  gitHead: string | null;
  /** true = SHA matches but the snapshot is EMPTY (no events yet) — input-gated, not stale */
  inputGated?: boolean;
}

function loadProjection(): ProjectionResult {
  const snapshotPath = projectionPath;
  const gitHead = getGitHead();

  if (!existsSync(snapshotPath)) {
    return {
      projection: null,
      fresh: false,
      staleReason: "No portal-projection.json found — snapshot absent.",
      gitHead,
    };
  }

  let projection: PortalProjection;
  try {
    projection = JSON.parse(readFileSync(snapshotPath, "utf-8")) as PortalProjection;
  } catch (e) {
    return {
      projection: null,
      fresh: false,
      staleReason: `portal-projection.json is malformed: ${e}`,
      gitHead,
    };
  }

  // Valid JSON that is not an object (literal null / array) ⇒ degrade like a stale snapshot.
  if (!projection || typeof projection !== "object") {
    return { projection: null, fresh: false, staleReason: "portal-projection.json is not an object (degraded).", gitHead };
  }

  const snapshotCommit = projection.provenance?.commit ?? null;
  if (!gitHead || !snapshotCommit || snapshotCommit !== gitHead) {
    const reason = !gitHead
      ? "Could not determine git HEAD (not in a git repo?)."
      : !snapshotCommit
      ? "Snapshot has no commit recorded."
      : snapshotCommit.endsWith("-dirty")
      ? "Snapshot was published from a dirty working tree (uncommitted changes) — it degrades until you commit and rebuild."
      : `Snapshot commit ${snapshotCommit.slice(0, 8)} ≠ HEAD ${gitHead.slice(0, 8)}.`;
    return { projection, fresh: false, staleReason: reason, gitHead };
  }

  // Fresh = SHA matches. But a SHA-matching yet EMPTY snapshot is input-gated, not "live":
  // no dev-sprint events exist yet (the expected pre-exercise / factory / CI state).
  const empty =
    Object.keys(projection.carriers ?? {}).length === 0 &&
    Object.keys(projection.nodes ?? {}).length === 0;
  return { projection, fresh: true, staleReason: null, gitHead, inputGated: empty };
}

// ── Provenance banner ────────────────────────────────────────────────────────

function provenanceBanner(result: ProjectionResult): string {
  if (result.inputGated) {
    return `<div class="provenance-banner provenance-inputgated">
  <span class="provenance-icon">○</span>
  <div class="provenance-body">
    <strong>Projection input-gated</strong> — no dev-sprint events recorded yet; in-flight stages show as <em>pending</em>. Expected before the loop is exercised.
  </div>
</div>`;
  }
  if (result.fresh) return "";
  const { projection, staleReason, gitHead } = result;
  const generatedAt = projection?.provenance?.generated_at ?? "unknown";
  const snapshotCommit = projection?.provenance?.commit
    ? projection.provenance.commit.slice(0, 8)
    : "—";
  const headShort = gitHead ? gitHead.slice(0, 8) : "unknown";

  return `<div class="provenance-banner">
  <span class="provenance-icon">⚠</span>
  <div class="provenance-body">
    <strong>Snapshot stale or absent</strong> — projected fields (current_stage) shown as <em>unknown</em>.
    <span class="provenance-detail">${esc(staleReason ?? "")} Snapshot: ${esc(generatedAt)} @ <code>${esc(snapshotCommit)}</code> · HEAD: <code>${esc(headShort)}</code></span>
  </div>
</div>`;
}

// ── Item loading ─────────────────────────────────────────────────────────────

function loadItems(): WorkItem[] {
  const itemsDir = path.join(dashRoot, "items");
  if (!existsSync(itemsDir)) throw new Error(`items/ not found at ${itemsDir}`);

  const files = readdirSync(itemsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  return files.map((f) => {
    const sourcePath = path.join(itemsDir, f);
    const raw = readFileSync(sourcePath, "utf-8");
    const { fm, body } = parseFrontmatter(raw);
    // The id becomes a filesystem path segment (item/<id>/index.html) and a URL slug.
    // Constrain it so a hostile/typo'd frontmatter id can't traverse out of the surface
    // dir at build time or break out of an href — fall back to the (on-disk) filename.
    const rawId = String((fm as WorkItemFm).id ?? f.replace(/\.md$/, ""));
    const id = /^[A-Za-z0-9._-]+$/.test(rawId) ? rawId : f.replace(/\.md$/, "").replace(/[^A-Za-z0-9._-]/g, "-");
    if (id !== rawId) warn(`work-item id "${rawId}" is not path-safe — using "${id}"`);
    return { id, fm: fm as WorkItemFm, body, sourcePath };
  });
}

function loadMarkdownDoc(filePath: string): { fm: Record<string, unknown>; body: string } | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf-8");
  const { fm, body } = parseFrontmatter(raw);
  return { fm, body };
}

// ── Implementation units (IUs) — first-class, carved out of work items ─────────

interface IUFm {
  id: string;
  title?: string;
  parent?: string;            // omitted ⇒ standalone (incremental channel)
  channel?: string;           // sprint | incremental
  status?: string;            // planned | building | done | blocked
  size?: string;
  goal?: string;
  files?: string[];
  dependencies?: string[];
  acceptance?: string[];
  improves?: string;
  [k: string]: unknown;
}
interface IU { id: string; fm: IUFm; body: string; }

function loadIUs(): IU[] {
  const iusDir = path.join(dashRoot, "ius");
  if (!existsSync(iusDir)) return [];
  return readdirSync(iusDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const raw = readFileSync(path.join(iusDir, f), "utf-8");
      const { fm, body } = parseFrontmatter(raw);
      return { id: (fm as IUFm).id ?? f.replace(/\.md$/, ""), fm: fm as IUFm, body };
    });
}

function iuStatusPill(s?: string): string {
  const st = (s || "planned").toLowerCase();
  const cls = st === "done" ? "iu-st-done"
    : st === "building" ? "iu-st-building"
    : st === "blocked" ? "iu-st-blocked"
    : "iu-st-planned";
  return `<span class="iu-status ${cls}">${esc(st)}</span>`;
}

// One IU component, two variants. `compact` = the clickable card (a data-popout drawer
// trigger). `full` = the drawer body; a child IU's drawer carries a "← back to parent"
// link (the nest), a standalone IU shows what it improves.
function iu(u: IU, variant: "compact" | "full", opts?: { parentId?: string; parentTitle?: string }): string {
  if (variant === "compact") {
    return `<div class="iu-card" data-popout="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(u.fm.title || u.id)} — open detail">
  <div class="iu-head">
    <span class="iu-id">${esc(u.id)}</span>
    ${iuStatusPill(u.fm.status)}
    ${u.fm.size ? `<span class="iu-size">${esc(u.fm.size)}</span>` : ""}
  </div>
  <div class="iu-title">${esc(u.fm.title || u.id)}</div>
  ${u.fm.goal ? `<div class="iu-goal">${esc(u.fm.goal)}</div>` : ""}
</div>`;
  }
  // full — the drawer body
  const f = u.fm;
  const files = (f.files || []).map((x) => `<code>${esc(x)}</code>`).join(" ");
  const deps = (f.dependencies || []).map((x) => `<code>${esc(x)}</code>`).join(" ");
  const acc = f.acceptance || [];
  const bodyHtml = u.body.trim()
    ? renderMarkdown(u.body, { page: { path: u.id, fm: {} as Record<string, unknown>, raw: u.body } }).html
    : "";
  const back = opts?.parentId
    ? `<a class="po-back" data-popout="${esc(opts.parentId)}">← back to ${esc(opts.parentTitle || opts.parentId)}</a>`
    : "";
  const group = [f.channel, f.parent ? `parent ${f.parent}` : "", f.improves ? `improves ${f.improves}` : ""]
    .filter(Boolean).map((s) => esc(s)).join(" · ");
  return [
    back,
    group ? `<div class="po-group">${group}</div>` : "",
    `<h2 class="po-title">${esc(f.title || u.id)}</h2>`,
    `<div class="po-badges">${iuStatusPill(f.status)}${f.size ? `<span class="iu-size">${esc(f.size)}</span>` : ""}</div>`,
    f.goal ? `<div class="po-section"><div class="po-label">Goal</div><p>${esc(f.goal)}</p></div>` : "",
    files ? `<div class="po-section"><div class="po-label">Files</div><p>${files}</p></div>` : "",
    deps ? `<div class="po-section"><div class="po-label">Depends on</div><p>${deps}</p></div>` : "",
    acc.length ? `<div class="po-section"><div class="po-label">Acceptance</div><ul>${acc.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : "",
    bodyHtml ? `<div class="po-section"><div class="po-label">Notes</div>${bodyHtml}</div>` : "",
  ].filter(Boolean).join("\n");
}

// ── Ctx — the once-computed aggregates threaded to every component ──────────────
// Computed once in the main build and passed through so the ledger and Strategy
// consume identical data. `L` is PER PAGE (depth-aware links), so a drawer rendered
// for the ledger and for Strategy differs correctly in its internal hrefs.
interface Ctx {
  proj: ProjectionResult;
  L: Links;
  model: OutcomeModel;
  rev: ReverseIndex;
  canvas: CanvasModel | null;
  canvasIds: Set<string> | null;
  items: WorkItem[];               // all work items (for the complete sidecar)
  standaloneIUs: IU[];             // incremental-channel IUs
  iusByParent: Map<string, IU[]>;
  ledgerSlug: string;
}

// The trailing free-text after a leading code id ("B-01 — why" → "why"). Shared by the
// objective→bet and work-item→bet link rows.
function linkNote(full: string | undefined, id: string | null): string {
  if (!full || !id) return "";
  return full.slice(full.indexOf(id) + id.length).replace(/^[\s—–:(-]+/, "").replace(/\)\s*$/, "").trim();
}

// ── The unified link affordance (.alink) ───────────────────────────────────────
// One "this connects to X" row for EVERY artefact link. The kind reads from a leading
// glyph + label, never a different visual language. A drawer target uses `popout`; a
// cross-surface/page target uses `href` (already esc()'d by makeLinks). `unresolved`
// renders a visible dangling affordance (never a broken <a>); `plain` is a note only.
function alink(
  label: string,
  target: { href?: string; popout?: string } | null,
  text: string,
  opts?: { glyph?: string; code?: boolean; note?: string; unresolved?: string; plain?: boolean },
): string {
  const glyph = esc(opts?.glyph ?? "→");
  // Unresolved is a visible dangling affordance (no link target) — check it BEFORE the
  // plain/!target guard, else a null-target unresolved would degrade to a bare note.
  if (opts?.unresolved) {
    return `<div class="alink-row"><span class="alink-label">${esc(label)}</span><span class="alink alink-unresolved"><span class="alink-glyph">${glyph}</span><code>${esc(text)}</code></span> <span class="unresolved-tag">${esc(opts.unresolved)}</span></div>`;
  }
  if (opts?.plain || !target) {
    return `<div class="alink-row"><span class="alink-label">${esc(label)}</span><span class="alink-note">${esc(text)}</span></div>`;
  }
  const inner = opts?.code ? `<code>${esc(text)}</code>` : esc(text);
  const note = opts?.note ? ` <span class="alink-note">${esc(opts.note)}</span>` : "";
  const attr = target.popout ? ` data-popout="${esc(target.popout)}" role="button" tabindex="0"` : ` href="${target.href}"`;
  return `<div class="alink-row"><span class="alink-label">${esc(label)}</span><a class="alink"${attr}><span class="alink-glyph">${glyph}</span>${inner}</a>${note}</div>`;
}

// ── The shared drawer + per-page sidecar (read by popout.js) ────────────────────
// Builds the COMPLETE drawer set from the Ctx: every work item (full), every child IU
// (nested, with a back-to-parent link), every standalone IU, and every addressable bet.
// A complete sidecar means any data-popout on any surface resolves (a bet drawer's
// work-list chip, a nested child IU, …) with no per-page scoping to get wrong. Rendered
// with the PAGE's L (drawer-internal links are depth-aware), so the same drawer differs
// correctly per surface. Collisions warn + keep-first — ids are namespaced in practice
// (wi-/iu-/bet codes), so a collision is a real authoring bug, not silently lost.
// (Scale note: item/<id> permalink pages each inline this full set; fine at harness
// scale — tens of items — revisit with a shared fetch if a harness reaches hundreds.)
function buildSidecar(ctx: Ctx): string {
  const items: Record<string, { code: string; html: string; kind: string }> = {};
  const add = (id: string | undefined, item: { code: string; html: string; kind: string }) => {
    if (!id) return;
    if (items[id]) { warn(`sidecar id collision "${id}" — keeping first, ignoring the duplicate`); return; }
    items[id] = item;
  };
  for (const it of ctx.items) {
    add(it.id, { code: it.id, html: workItem(it, "full", ctx), kind: "work-item" });
    for (const u of ctx.iusByParent.get(it.id) ?? [])
      add(u.id, { code: u.id, html: iu(u, "full", { parentId: it.id, parentTitle: it.fm.title }), kind: "iu" });
  }
  for (const u of ctx.standaloneIUs) add(u.id, { code: u.id, html: iu(u, "full"), kind: "iu" });
  for (const e of ctx.canvas?.entries ?? []) if (e.id) add(e.id, { code: e.id, html: bet(e, ctx), kind: "bet" });
  const sidecar = JSON.stringify({ items }).replace(/<\//g, "<\\/");
  return `<aside class="popout" data-open="false" aria-hidden="true">
  <div class="popout-backdrop" data-close></div>
  <div class="popout-panel" role="dialog" aria-modal="true" aria-label="Detail">
    <div class="popout-head"><span class="popout-code">—</span><button class="popout-close" type="button" data-close aria-label="Close detail">×</button></div>
    <div class="popout-body"></div>
  </div>
</aside>
<script type="application/json" id="popout-data">${sidecar}</script>`;
}

// ── Stage display ────────────────────────────────────────────────────────────

function stageDisplay(
  item: WorkItem,
  proj: ProjectionResult,
): { label: string; stale: boolean } {
  if (item.fm.lifecycle_state !== "in-delivery") {
    return { label: "—", stale: false };
  }
  if (item.fm.stage_override) {
    return { label: item.fm.stage_override + " (override)", stale: false };
  }
  if (proj.fresh && proj.projection) {
    const carrier = proj.projection.carriers[item.id];
    if (carrier?.current_stage) {
      return { label: carrier.current_stage, stale: false };
    }
  }
  return { label: "unknown", stale: true };
}

// ── Tier badge ───────────────────────────────────────────────────────────────

function tierBadge(tier?: string): string {
  if (!tier) return "";
  const cls = tier === "T1" ? "tier-t1" : tier === "T2" ? "tier-t2" : "tier-t3";
  return `<span class="tier-badge ${cls}">${esc(tier)}</span>`;
}

// ── Risk vocabulary — ONE evidence-rung treatment, two variants (pill | grid) ──
// A risk_state dimension is EVIDENCE STRENGTH: strong evidence = low risk (green),
// weak = high risk (red). Authored either as a bare enum ("moderate") or as free-text
// whose LEADING token is the rung ("strong — a real dogfood…"). riskRung() maps both.
// The pill (worst rung across the four dims) and the grid (per-dim cells) derive from
// the SAME riskRung() — D65 fixes the prior divergence where the pill matched the raw
// enum (`includes("low")`) while the grid used riskRung(), so the two could disagree on
// the same item, and the .risk-low/-moderate/-strong classes were named inverted.
export type Rung = "strong" | "moderate" | "weak" | "unknown";
export function riskRung(v?: string): Rung {
  if (!v) return "unknown";
  const first = String(v).trim().toLowerCase().split(/[\s—–:,;-]+/)[0] || "";
  if (/^(strong|did|observed|high|confirmed)$/.test(first)) return "strong";
  if (/^(moderate|said|stated|medium|tested)$/.test(first)) return "moderate";
  if (/^(weak|low|synthetic|assumed|hypothetical|hypothesis|disconfirming|disconfirmed|invalidated|stop)$/.test(first)) return "weak";
  return "unknown";
}
// Class names carry the RUNG meaning (D65 rename): strong evidence = green/safe.
const RUNG_CLASS: Record<Rung, string> = {
  strong: "risk-strong", moderate: "risk-moderate", weak: "risk-weak", unknown: "risk-unknown",
};
const RUNG_ORD: Record<Rung, number> = { strong: 3, moderate: 2, weak: 1, unknown: 0 };

// One risk cell — a labelled LED on its evidence rung. Shared by the four-risks grid
// and the bets four-risks strip (dedup). Caller supplies the title (per-dim detail).
function riskCell(label: string, rung: Rung, title: string): string {
  return `<div class="risk-cell ${RUNG_CLASS[rung]}" title="${esc(title)}">
  <span class="risk-cell-dot"></span>
  <span class="risk-cell-label">${esc(label)}</span>
  <span class="risk-cell-rung">${esc(rung === "unknown" ? "—" : rung)}</span>
</div>`;
}

// The unified risk component. `pill` = the most-exposed rung across the four dims (a
// risk is only as cleared as its weakest dimension — honesty ≥ green); `grid` = the
// four-risks coverage, one cell per dimension. Order: value · usability · feasibility ·
// viability (matches the canvas value/viability split + the mockup drawer).
export function risk(rs: RiskState | undefined, variant: "pill" | "grid"): string {
  const dims: [string, string | undefined][] = [
    ["value", rs?.value], ["usability", rs?.usability],
    ["feasibility", rs?.feasibility], ["viability", rs?.viability],
  ];
  if (variant === "grid") {
    const cells = dims.map(([label, v]) => riskCell(label, riskRung(v), v ? String(v) : "not recorded")).join("");
    return `<div class="risk-grid" role="group" aria-label="Four-risks coverage">${cells}</div>`;
  }
  if (!rs) return "";
  let worst: Rung | null = null;
  for (const [, v] of dims) {
    const r = riskRung(v);
    if (r === "unknown") continue;
    if (worst === null || RUNG_ORD[r] < RUNG_ORD[worst]) worst = r;
  }
  const w = worst ?? "unknown";
  return `<span class="risk-pill ${RUNG_CLASS[w]}">risk: ${esc(w)}</span>`;
}

// ── The work-item component — one renderer, three variants ──────────────────────
//   compact = the ledger / record card (the WHOLE card is a data-popout drawer trigger)
//   chip    = a contribution chip (objective contrib list / a bet's work-list) — data-popout
//   full    = the drawer body (shared item sections + po chrome + an item/<id> permalink)
// All variants render on BOTH surfaces (ledger + Strategy) at different depths, so links
// resolve via the page's depth-aware ctx.L, never hard-coded paths.
function workItem(item: WorkItem, variant: "compact" | "chip" | "full", ctx: Ctx): string {
  const { proj, L, model } = ctx;
  const stage = stageDisplay(item, proj);

  if (variant === "chip") {
    const stageTag = (item.fm.lifecycle_state === "in-delivery" && !stage.stale)
      ? `<span class="contrib-stage">${esc(stage.label)}</span>` : "";
    return `<a class="contrib lifecycle-${clsToken(item.fm.lifecycle_state)}" data-popout="${esc(item.id)}" role="button" tabindex="0">
  <span class="contrib-state">${esc(item.fm.lifecycle_state)}</span>
  <span class="contrib-title">${esc(item.fm.title)}</span>${stageTag}
</a>`;
  }

  if (variant === "compact") {
    const staleClass = stage.stale ? " stage-stale" : "";
    const stageHtml = item.fm.lifecycle_state === "in-delivery"
      ? `<div class="card-stage${staleClass}">stage: <strong>${esc(stage.label)}</strong>${stage.stale ? ' <span class="stale-tag">stale</span>' : ""}</div>`
      : "";
    // The card is the trigger (role=button), so the outcome is plain text (no nested <a>):
    // the objective statement when it resolves, else the raw link, else an "unlinked" note.
    const obj = item.fm.outcome_link ? model.objectives.find((o) => o.id === item.fm.outcome_link) : undefined;
    const outcomeHtml = item.fm.outcome_link
      ? `<div class="card-meta">→ <span>${esc(obj?.statement || item.fm.outcome_link)}</span></div>`
      : (!item.fm.disposition ? `<div class="card-meta">unlinked — ladders to nothing yet</div>` : "");
    return `<div class="item-card lifecycle-${clsToken(item.fm.lifecycle_state)}" data-popout="${esc(item.id)}" role="button" tabindex="0" aria-label="${esc(item.fm.title)} — open detail">
  <div class="card-header">
    <span class="card-title">${esc(item.fm.title)}</span>
    ${tierBadge(item.fm.tier)}
    ${risk(item.fm.risk_state, "pill")}
  </div>
  <div class="card-tags">
    <span class="lifecycle-tag">${esc(item.fm.lifecycle_state)}</span>
  </div>
  ${stageHtml}
  ${item.fm.children?.length ? `<div class="card-iucount">${item.fm.children.length} implementation unit${item.fm.children.length === 1 ? "" : "s"} →</div>` : ""}
  ${outcomeHtml}
  ${item.fm.disposition ? `<div class="card-disposition">${esc(item.fm.disposition)}</div>` : ""}
</div>`;
  }

  // full — the drawer body
  const childIUs = ctx.iusByParent.get(item.id) ?? [];
  const stageBadge = item.fm.lifecycle_state === "in-delivery"
    ? `<span class="card-stage${stage.stale ? " stage-stale" : ""}">stage: <strong>${esc(stage.label)}</strong>${stage.stale ? ' <span class="stale-tag">stale</span>' : ""}</span>` : "";
  return [
    `<div class="po-group">${esc(item.fm.lifecycle_state)}${item.fm.tier ? " · " + esc(item.fm.tier) : ""}</div>`,
    `<h2 class="po-title">${esc(item.fm.title)}</h2>`,
    `<div class="po-badges"><span class="lifecycle-tag">${esc(item.fm.lifecycle_state)}</span>${tierBadge(item.fm.tier)}${risk(item.fm.risk_state, "pill")}${stageBadge}</div>`,
    itemThroughline(item, ctx),
    ...itemDetailSections(item, ctx, childIUs),
    `<p class="po-permalink">Permalink: <a href="${L.page("item/" + item.id)}">item/${esc(item.id)}</a> · shareable / no-JS fallback</p>`,
  ].filter(Boolean).join("\n");
}

// ── The item throughline — the authored cross-links, as .alink rows ─────────────
// → its objective (outcome_link, ladders to vision) → the bet it tests (value_prop_link
// → an in-place bet drawer) → the four-risks grid. Unresolved links get a visible
// affordance, never a broken <a>. Shared by the work-item drawer + the permalink page.
function itemThroughline(item: WorkItem, ctx: Ctx): string {
  const { L, model, canvasIds } = ctx;
  const objective = item.fm.outcome_link ? model.objectives.find((o) => o.id === item.fm.outcome_link) : undefined;
  const objRow = item.fm.outcome_link
    ? (objective
        ? alink("Objective", { href: L.page("strategy", objective.id) }, objective.statement || objective.id, model.vision.statement ? { note: "→ vision" } : undefined)
        : alink("Objective", null, item.fm.outcome_link, { unresolved: "no such objective" }))
    : alink("Objective", null, "— no outcome_link; ladders to nothing yet", { plain: true });

  // value_prop_link MAY resolve to a canvas entry id. The bet opens IN PLACE (drawer)
  // only when the canvas is bound AND the id is on it; bound-but-absent → unresolved;
  // prose, or canvas unbound (no drawer, no canvas surface) → a plain value-prop note.
  const vpId = canvasEntryId(item.fm.value_prop_link);
  const vpNote = linkNote(item.fm.value_prop_link, vpId);
  let betRow = "";
  if (item.fm.value_prop_link) {
    if (vpId && canvasIds !== null && canvasIds.has(vpId)) betRow = alink("Bet tested", { popout: vpId }, vpId, { code: true, note: vpNote || undefined });
    else if (vpId && canvasIds !== null) betRow = alink("Bet tested", null, vpId, { unresolved: "no such bet on the canvas" });
    else betRow = alink("Value prop", null, item.fm.value_prop_link, { plain: true });
  }

  const riskRow = item.fm.risk_state
    ? `<div class="alink-row tl-risk"><span class="alink-label">Four-risks</span>${risk(item.fm.risk_state, "grid")}</div>`
    : "";
  const evNote = item.fm.risk_state?.evidence_note
    ? `<div class="alink-row"><span class="alink-label"></span><span class="alink-note">${esc(item.fm.risk_state.evidence_note)}</span></div>`
    : "";

  return (objRow || betRow || riskRow)
    ? `<div class="item-throughline">${objRow}${betRow}${riskRow}${evNote}</div>`
    : "";
}

// ── The shared item detail sections (drawer full + permalink page) ───────────────
// Trusted authored canon (items/*.md) — renderMarkdown is fine here; only CANVAS
// free-text is esc()-only (M6). Returns po-section blocks both callers wrap.
function itemDetailSections(item: WorkItem, ctx: Ctx, childIUs: IU[]): string[] {
  const sections: string[] = [];
  const bodyHtml = item.body.trim()
    ? renderMarkdown(item.body, { page: { path: "item/" + item.id, fm: item.fm as Record<string, unknown>, raw: item.body } }).html
    : "";
  if (bodyHtml) sections.push(`<div class="po-section"><div class="po-label">Detail</div>${bodyHtml}</div>`);
  sections.push(`<div class="po-section"><div class="po-label">Implementation units</div>${
    childIUs.length ? `<div class="iu-grid">${childIUs.map((u) => iu(u, "compact")).join("\n")}</div>` : `<p class="iu-empty">No implementation units carved out yet.</p>`
  }</div>`);
  if (item.fm.gate_decisions?.length)
    sections.push(`<div class="po-section"><div class="po-label">Gate decisions</div>${renderGateDecisions(item.fm.gate_decisions)}</div>`);
  // Dev-stage traversal — projected-only (joined at render; never written).
  if (item.fm.lifecycle_state === "in-delivery" && ctx.proj.fresh && ctx.proj.projection) {
    const carrier = ctx.proj.projection.carriers[item.id];
    if (carrier?.transition_summary?.length) {
      const entries = carrier.transition_summary.map((t) => `<li class="timeline-entry"><span class="timeline-stage">${esc(t.stage)}</span><span class="timeline-at">${esc(t.at)}</span></li>`).join("\n");
      sections.push(`<div class="po-section"><div class="po-label">Dev-stage traversal (from snapshot)</div><ul class="timeline-list">${entries}</ul></div>`);
    }
  }
  if (item.fm.frozen_timeline) sections.push(renderFrozenTimeline(item.fm.frozen_timeline));
  const links = item.fm.links;
  const linkBits = links ? [
    links.spec_pr ? `Spec PR: <code>${esc(links.spec_pr)}</code>` : "",
    links.build_prs?.length ? `Build PRs: ${links.build_prs.map((p) => `<code>${esc(p)}</code>`).join(", ")}` : "",
    links.debrief ? `Debrief: <code>${esc(links.debrief)}</code>` : "",
  ].filter(Boolean) : [];
  if (linkBits.length) sections.push(`<div class="po-section"><div class="po-label">Links</div><p>${linkBits.join(" · ")}</p></div>`);
  return sections;
}

// ── The bet drawer — an in-place peek of canvas-owned data (esc()-only, M6) ──────
// Surfaces the byValueProp reverse index (the work testing this bet — newly surfaced)
// plus one "open in canvas →" jump. The canvas owns the grid + full detail; this never
// recreates it. The bet's `detail` free-text is esc()'d, never renderMarkdown'd.
function bet(e: CanvasEntry, ctx: Ctx): string {
  const { rev, L } = ctx;
  const strengthLabel = e.strength === "unknown" ? "weak" : e.strength;
  const impPill = e.importance_rank ? `<span class="riskiest-imp imp-${clsToken(e.importance_rank)}">${esc(e.importance_rank)}</span>` : "";
  const work = e.id ? (rev.byValueProp.get(e.id) ?? []) : [];
  const workHtml = work.length
    ? `<div class="contrib-list">${work.map((w) => workItem(w, "chip", ctx)).join("")}</div>`
    : `<p class="contrib-empty">No work testing this bet yet.</p>`;
  return [
    `<div class="po-group">${esc(e.region)} · ${esc(e.slot)}</div>`,
    `<h2 class="po-title">${esc(e.text)}</h2>`,
    `<div class="bet-meta"><span class="ev-chip ev-${esc(e.evidence)}">${esc(e.evidence)}</span><span class="str str-${esc(strengthLabel)}">${esc(e.strength === "unknown" ? "unrated" : e.strength)} evidence</span>${impPill}</div>`,
    e.detail ? `<div class="po-section"><div class="po-label">Evidence</div><p>${esc(e.detail)}</p></div>` : "",
    `<div class="po-section"><div class="po-label">Work testing this bet</div>${workHtml}</div>`,
    e.id ? `<a class="open-in-canvas" href="${L.canvas(e.id)}">Open in canvas →</a>` : "",
  ].filter(Boolean).join("\n");
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function buildNav(_items: WorkItem[]): NavGroup[] {
  // D65: two surfaces. Work items / IUs / bets / objectives are NOT in the sidebar —
  // they open in place (drawers, accordions). The ledger is the index (slug "").
  return [
    {
      group: "Product dashboard",
      pages: ["", "strategy"],
    },
  ];
}

function pageLabel(items: WorkItem[]): (slug: string) => string {
  const map = new Map<string, string>([
    ["",          "Work ledger"],
    ["strategy",  "Strategy"],
    ...items.map((it): [string, string] => [`item/${it.id}`, it.fm.title]),
  ]);
  return (slug: string) => map.get(slug) ?? slug.split("/").pop() ?? slug;
}

// ── Inline styles for the dashboard layout ────────────────────────────────────

const DASHBOARD_STYLES = `
<style>
:root { --st-done: #2e9e6b; --st-building: #d9a514; --st-blocked: #d84a3f; --st-planned: #9aa0a6; }
.dashboard-lede { color: var(--mute); margin: 0 0 1.25em; }

/* ── Channel tabs (CSS-only, CSP-safe) ── */
.channels { position: relative; }
.ch-radio { position: absolute; opacity: 0; pointer-events: none; }
.ch-tabs { display: flex; gap: .25em; border-bottom: 1px solid var(--hair); margin-bottom: 1.5em; }
.ch-tab { font-family: var(--display); font-size: .9rem; font-weight: 600; cursor: pointer;
  padding: .5em .9em; color: var(--mute); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.ch-tab:hover { color: var(--fg); }
#ch-sprint:checked ~ .ch-tabs label[for="ch-sprint"],
#ch-incr:checked ~ .ch-tabs label[for="ch-incr"] { color: var(--fg); border-bottom-color: var(--accent); }
.ch-panel { display: none; }
#ch-sprint:checked ~ .ch-panel-sprint { display: block; }
#ch-incr:checked ~ .ch-panel-incr { display: block; }

/* ── Provenance banner ── */
.provenance-banner { display: flex; align-items: flex-start; gap: .6em;
  background: color-mix(in srgb, var(--st-building) 9%, transparent);
  border: 1px solid color-mix(in srgb, var(--st-building) 40%, var(--hair));
  border-radius: 6px; padding: .7em 1em; margin-bottom: 1.5em; font-size: .85rem; color: var(--fg-soft); }
.provenance-inputgated { background: color-mix(in srgb, var(--st-planned) 10%, transparent);
  border-color: color-mix(in srgb, var(--st-planned) 35%, var(--hair)); }
.provenance-icon { flex-shrink: 0; }
.provenance-body { display: flex; flex-direction: column; gap: .2em; }
.provenance-detail { color: var(--mute); font-size: .92em; }

/* ── Kanban board ── */
.ledger-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1em; margin-bottom: 1.5em; align-items: start; }
.ledger-column { background: var(--code-bg); border: 1px solid var(--hair); border-radius: 8px;
  padding: .85em; display: flex; flex-direction: column; gap: .6em; }
.ledger-column-header { font-family: var(--mono); font-size: .68rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: .08em; color: var(--mute); }
.ledger-column-count { color: var(--mute); }
.ledger-column-empty { font-size: .82rem; color: var(--mute); font-style: italic; }
.ledger-record { margin-top: 1.5em; }
.ledger-record-header { font-family: var(--mono); font-size: .68rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: .08em; color: var(--mute); margin-bottom: .6em; }
.ledger-record-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: .8em; }

/* ── Item cards (the whole card is a drawer trigger — data-popout) ── */
.item-card { background: var(--bg); border: 1px solid var(--hair); border-radius: var(--r-md, 6px);
  padding: .75em .85em; display: flex; flex-direction: column; gap: .4em; cursor: pointer; }
.item-card:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--hair)); }
.card-header { display: flex; align-items: flex-start; gap: .4em; flex-wrap: wrap; }
.card-title { font-weight: 600; font-size: .92rem; color: var(--fg); text-decoration: none; flex: 1 1 auto; }
.card-title:hover { color: var(--accent); }
.card-tags { display: flex; gap: .3em; flex-wrap: wrap; }
.card-meta { font-size: .76rem; color: var(--mute); }
.card-meta a { color: var(--accent); text-decoration: none; }
.card-stage { font-size: .78rem; color: var(--fg-soft); }
.card-iucount { font-size: .72rem; color: var(--mute); }
.card-disposition { font-size: .76rem; color: var(--mute); font-style: italic; }
.stage-stale { color: var(--st-building); }

/* ── Pills ── */
.lifecycle-tag, .tier-badge, .iu-size {
  font-family: var(--mono); font-size: .68rem; border-radius: 999px; padding: .1em .55em; font-weight: 500; white-space: nowrap; }
.lifecycle-tag { background: var(--code-bg); border: 1px solid var(--hair); color: var(--fg-soft); }
.tier-badge { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }

/* Status-light chips (iu status + risk): a glowing LED dot + a label on a faint
   tinted chip. The dot is the status "light"; --lt carries the colour per state. */
.risk-pill, .iu-status { --lt: var(--st-planned);
  display: inline-flex; align-items: center; gap: .42em;
  font-family: var(--mono); font-size: .68rem; font-weight: 500; white-space: nowrap;
  border-radius: 999px; padding: .12em .6em .12em .5em;
  background: color-mix(in srgb, var(--lt) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--lt) 34%, var(--hair)); color: var(--fg); }
.risk-pill::before, .iu-status::before { content: ""; flex: none; width: .5em; height: .5em; border-radius: 999px;
  background: var(--lt);
  box-shadow: 0 0 0 .13em color-mix(in srgb, var(--lt) 26%, transparent), 0 0 5px color-mix(in srgb, var(--lt) 55%, transparent); }
/* risk_state values are EVIDENCE STRENGTH: weak evidence = high risk (red); strong evidence = safe (green).
   Class names carry the RUNG meaning (D65 rename to weak/moderate/strong/unknown). */
.risk-weak { --lt: var(--st-blocked); }
.risk-moderate { --lt: var(--st-building); }
.risk-strong { --lt: var(--st-done); }
.risk-unknown { --lt: var(--st-planned); }
.stale-tag { font-family: var(--mono); font-size: .66rem; background: color-mix(in srgb, var(--st-building) 18%, transparent);
  color: #9a7400; border-radius: 3px; padding: 0 4px; margin-left: .3em; }

/* ── IU cards + drill-down ── */
.iu-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: .8em; margin: .5em 0 1em; }
.iu-card { border: 1px solid var(--hair); border-left: 3px solid var(--accent);
  border-radius: 0 var(--r-md, 6px) var(--r-md, 6px) 0; background: var(--code-bg); padding: .7em .8em; cursor: pointer; }
.iu-card:hover { border-left-color: var(--accent-hover, var(--accent)); }
.iu-head { display: flex; align-items: center; gap: .4em; margin-bottom: .3em; }
.iu-id { font-family: var(--mono); font-size: .72rem; color: var(--accent); }
.iu-size { background: var(--bg); border: 1px solid var(--hair); color: var(--mute); }
.iu-st-done { --lt: var(--st-done); }
.iu-st-building { --lt: var(--st-building); }
.iu-st-blocked { --lt: var(--st-blocked); }
.iu-st-planned { --lt: var(--st-planned); }
.iu-title { font-weight: 600; font-size: .9rem; color: var(--fg); margin-bottom: .25em; }
.iu-goal { font-size: .82rem; color: var(--fg-soft); margin-bottom: .35em; }
.iu-files code, .iu-improves code { font-family: var(--mono); font-size: .72rem; background: var(--bg);
  border: 1px solid var(--hair); border-radius: 3px; padding: 0 .3em; }
.iu-acc { margin: .35em 0 0; padding-left: 1.1em; font-size: .8rem; color: var(--fg-soft); }
.iu-acc li { margin: .15em 0; }
.iu-improves { font-size: .76rem; color: var(--mute); margin-top: .35em; }
.iu-empty { color: var(--mute); font-style: italic; }

/* ── Detail page ── */
.item-detail-meta { display: flex; flex-wrap: wrap; gap: .5em; margin-bottom: 1.5em; align-items: center; }
.meta-row { font-size: .82rem; display: flex; gap: .4em; align-items: center; color: var(--fg-soft); }
.meta-label { color: var(--mute); font-weight: 600; font-size: .92em; }
.meta-row a { color: var(--accent); text-decoration: none; }
.gate-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .6em; }
.gate-entry { border-left: 3px solid var(--hair); padding-left: .75em; font-size: .9rem; }
.gate-header { font-weight: 600; display: flex; gap: .5em; align-items: center; }
.gate-go { color: var(--st-done); }
.gate-nogo { color: var(--st-blocked); }
.gate-meta, .gate-evidence { font-size: .8rem; color: var(--mute); margin-top: .15em; }
.gate-conditions { font-size: .8rem; font-style: italic; color: #9a7400; margin-top: .15em; }
.frozen-timeline, .progress-gated { background: var(--code-bg); border: 1px solid var(--hair);
  border-radius: 6px; padding: .8em 1em; margin-top: 1em; }
.frozen-title { font-family: var(--mono); font-size: .68rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: .06em; color: var(--mute); margin-bottom: .5em; }
.timeline-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .3em; }
.timeline-entry { font-size: .84rem; display: flex; gap: .75em; }
.timeline-stage { font-weight: 600; min-width: 90px; font-family: var(--mono); font-size: .8rem; }
.timeline-at { color: var(--mute); }
.progress-gated { background: var(--code-bg); border: 1px solid var(--hair); border-radius: 6px; padding: .8em 1em; color: var(--fg-soft); font-size: .88rem; margin-top: 1em; }
.northstar-gated { margin-top: 1.5em; }
.okr-kr-table { width: 100%; border-collapse: collapse; margin-top: .5em; font-size: .84rem; }
.okr-kr-table th { text-align: left; color: var(--mute); font-size: .8rem; padding: .3em .5em; border-bottom: 1px solid var(--hair); }
.okr-kr-table td { padding: .35em .5em; border-bottom: 1px solid var(--hair); }

/* ══ Throughline — spine, vision apex, OKR cascade, cross-links ══════════════ */

/* Spine breadcrumb: a persistent thin stepper, current step highlighted. */
.spine { display: flex; flex-wrap: wrap; align-items: center; gap: .5em; margin: 0 0 1.25em;
  font-family: var(--mono); font-size: .7rem; text-transform: uppercase; letter-spacing: .07em; }
.spine-step { color: var(--mute); text-decoration: none; padding: .15em .1em; border-bottom: 2px solid transparent; }
a.spine-step:hover { color: var(--fg); }
.spine-step.is-current { color: var(--fg); border-bottom-color: var(--accent); font-weight: 600; }
.spine-sep { color: var(--hair); }

/* Vision apex — composed once, from objectives.md. Durable, quiet, top-of-page. */
.vision-apex { border-left: 3px solid var(--accent); padding: .1em 0 .1em 1em; margin: 0 0 1.5em; }
.vision-label { font-family: var(--mono); font-size: .66rem; text-transform: uppercase; letter-spacing: .08em; color: var(--mute); margin-bottom: .25em; }
.vision-horizon { text-transform: none; letter-spacing: 0; }
.vision-statement { margin: 0; font-family: var(--display); font-size: 1.05rem; line-height: 1.45; color: var(--fg); }

/* Objective accordion — expand-in-place (the dissolved Progress page). The <details>
   id is the authored objective id, so deep-links + reverse-index links resolve. */
.obj-acc { border: 1px solid var(--hair); border-radius: 8px; margin: 0 0 .7em; background: var(--bg); overflow: hidden; scroll-margin-top: 1em; }
.obj-acc[open] { border-color: color-mix(in srgb, var(--accent) 35%, var(--hair)); }
.obj-sum { list-style: none; cursor: pointer; display: flex; flex-wrap: wrap; align-items: center; gap: .5em 1em; padding: .8em 1em; }
.obj-sum::-webkit-details-marker { display: none; }
.obj-sum::before { content: "▸"; color: var(--mute); font-size: .8em; transition: transform .15s ease; }
.obj-acc[open] .obj-sum::before { transform: rotate(90deg); }
.obj-statement { font-weight: 600; font-size: .98rem; color: var(--fg); flex: 1 1 auto; min-width: 12em; }
.obj-krsummary { font-family: var(--mono); font-size: .7rem; color: var(--mute); }
.obj-contribcount { font-size: .76rem; color: var(--fg-soft); }
.obj-body { padding: 0 1em 1em; border-top: 1px solid var(--hair); }
.obj-intro { color: var(--fg-soft); font-size: .92rem; margin: .8em 0 .4em; }
.obj-ns { font-size: .8rem; color: var(--mute); margin: .4em 0; }
.obj-maturity { font-size: .82rem; color: var(--mute); font-style: italic; margin: .6em 0 0; }

/* Key-result rows — honest status LED + (only when numeric) a desaturated fill. */
.kr-list { display: flex; flex-direction: column; gap: .5em; margin: .8em 0; }
.kr-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .3em 1em;
  padding: .5em .7em; background: var(--code-bg); border: 1px solid var(--hair); border-radius: 6px; }
.kr-main { flex: 1 1 60%; min-width: 0; }
.kr-metric { display: flex; align-items: baseline; gap: .5em; font-size: .88rem; color: var(--fg); line-height: 1.35; }
.kr-led { flex: none; width: .5em; height: .5em; border-radius: 999px; background: var(--st-planned); transform: translateY(-1px); }
.kr-done .kr-led, .kr-led.kr-done { background: var(--st-done); }
.kr-progress .kr-led, .kr-led.kr-progress { background: var(--st-building); }
.kr-todo .kr-led, .kr-led.kr-todo { background: var(--st-planned); }
.kr-unknown .kr-led, .kr-led.kr-unknown { background: var(--st-planned); }
/* Desaturated relative to the bets posture — order ≠ weight (honesty ≥ green). */
.kr-bar { height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--hair) 70%, transparent); margin: .4em 0 0; overflow: hidden; }
.kr-bar-fill { display: block; height: 100%; background: color-mix(in srgb, var(--st-done) 55%, var(--mute)); }
.kr-rt { display: flex; flex-direction: column; align-items: flex-end; gap: .15em; text-align: right; font-size: .76rem; }
.kr-target { color: var(--mute); }
.kr-current { color: var(--fg-soft); }
.kr-current.kr-done { color: var(--st-done); }

/* Contribution view — the reverse index of outcome_link, per objective. */
.contrib-block { margin-top: .8em; }
.contrib-label { font-family: var(--mono); font-size: .66rem; text-transform: uppercase; letter-spacing: .06em; color: var(--mute); margin-bottom: .45em; }
.contrib-count { background: var(--code-bg); border: 1px solid var(--hair); border-radius: 999px; padding: 0 .45em; color: var(--fg-soft); }
.contrib-list { display: flex; flex-wrap: wrap; gap: .45em; }
.contrib { display: inline-flex; align-items: center; gap: .45em; text-decoration: none; cursor: pointer;
  border: 1px solid var(--hair); border-left: 3px solid var(--mute); border-radius: 0 5px 5px 0;
  background: var(--bg); padding: .25em .55em; font-size: .82rem; color: var(--fg); }
.contrib:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--hair)); border-left-color: var(--accent); }
.contrib-state { font-family: var(--mono); font-size: .64rem; text-transform: uppercase; letter-spacing: .04em; color: var(--mute); }
.contrib-title { color: var(--fg); }
.contrib-stage { font-family: var(--mono); font-size: .66rem; color: var(--accent); }
.contrib-empty { color: var(--mute); font-style: italic; font-size: .85rem; margin: .3em 0 0; }
.lifecycle-shipped.contrib, .lifecycle-live.contrib { border-left-color: var(--st-done); }
.lifecycle-in-delivery.contrib { border-left-color: var(--st-building); }
.lifecycle-killed.contrib, .lifecycle-parked.contrib { border-left-color: var(--st-blocked); }

/* Unresolved-link affordance — visible, never a broken anchor or a fabricated target. */
.progress-issues { margin-top: 1.5em; }
.progress-issue { font-size: .85rem; color: var(--fg-soft); margin: .4em 0; }
.northstar p { color: var(--fg-soft); }

/* ── The unified .alink affordance (one "this connects to X" row for every link) ── */
.alink-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5em; font-size: .88rem; margin: 0 0 .15em; }
.alink-label { font-family: var(--mono); font-size: .62rem; text-transform: uppercase; letter-spacing: .06em;
  color: var(--mute); min-width: 6.5em; flex: none; }
.alink { display: inline-flex; align-items: baseline; gap: .35em; color: var(--accent); text-decoration: none; cursor: pointer; }
.alink:hover { text-decoration: underline; text-underline-offset: 2px; }
.alink-glyph { font-family: var(--mono); color: var(--mute); }
.alink-note { color: var(--mute); font-size: .85em; }
.alink-vision { color: var(--mute); font-size: .82em; }
.alink code { font-family: var(--mono); font-size: .82em; background: var(--code-bg); border: 1px solid var(--hair); border-radius: 3px; padding: 0 .3em; }
.alink-unresolved { color: var(--mute); }
.alink-unresolved code { border-style: dashed; }
.unresolved-tag { font-family: var(--mono); font-size: .62rem; color: #9a7400;
  background: color-mix(in srgb, var(--st-building) 16%, transparent); border-radius: 3px; padding: 0 .4em; }

/* Item throughline (the authored cross-links + the four-risks coverage grid). */
.item-throughline { display: flex; flex-direction: column; gap: .45em; margin: 0 0 1.2em;
  padding: .8em 1em; background: var(--code-bg); border: 1px solid var(--hair); border-radius: 8px; }
.tl-risk { align-items: flex-start; }
.risk-grid { display: flex; flex-wrap: wrap; gap: .4em; }
.risk-cell { display: inline-flex; align-items: center; gap: .4em; --lt: var(--st-planned);
  border: 1px solid color-mix(in srgb, var(--lt) 34%, var(--hair)); background: color-mix(in srgb, var(--lt) 10%, transparent);
  border-radius: 999px; padding: .12em .6em; font-size: .72rem; }
.risk-cell-dot { width: .5em; height: .5em; border-radius: 999px; background: var(--lt);
  box-shadow: 0 0 0 .12em color-mix(in srgb, var(--lt) 24%, transparent); }
.risk-cell-label { color: var(--fg); font-family: var(--mono); font-size: .68rem; }
.risk-cell-rung { color: var(--mute); }

/* ══ Bets rollup — the two-axis evidence posture (honesty ≥ green: weightier
      than the progress bars; order ≠ weight) ══════════════════════════════════ */
.bets-rollup { --ev-confirmed: #2e9e6b; --ev-tested: #d9a514; --ev-assumed: #9aa0a6;
  --ev-killed: #cf3b3b; --ev-superseded: #b9bdc2;
  border: 1px solid var(--hair); border-radius: 8px; padding: 1em 1.1em; margin: .5em 0 1.5em;
  background: color-mix(in srgb, var(--accent) 3%, var(--bg)); }
.bets-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5em; margin-bottom: .7em; }
.bets-counts { font-size: .88rem; color: var(--fg-soft); }
.bets-counts strong { color: var(--fg); }
.bp-demand { font-family: var(--mono); font-size: .66rem; border-radius: 999px; padding: .15em .6em; white-space: nowrap; border: 1px solid var(--hair); }
.bp-demand-did { background: color-mix(in srgb, var(--st-done) 18%, transparent); color: var(--st-done); border-color: color-mix(in srgb, var(--st-done) 40%, transparent); }
.bp-demand-said { background: color-mix(in srgb, var(--st-building) 16%, transparent); color: #9a7400; border-color: color-mix(in srgb, var(--st-building) 40%, transparent); }
/* Demand-never-tested = amber actionable warning (NOT the grey input-gated register). */
.bp-demand-untested { background: color-mix(in srgb, var(--st-building) 20%, transparent); color: #9a7400; border-color: color-mix(in srgb, var(--st-building) 55%, transparent); font-weight: 600; }
/* The single bets-posture primitive — taller + solid; the weightiest thing on the page. */
.bets-bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; margin: 0 0 .4em;
  background: color-mix(in srgb, var(--hair) 50%, transparent); box-shadow: inset 0 0 0 1px var(--hair); }
.bp-seg { display: block; min-width: 0; }
.bp-confirmed { background: var(--ev-confirmed); }
.bp-tested { background: var(--ev-tested); }
.bp-assumed { background: var(--ev-assumed); }
.bp-killed { background: var(--ev-killed); }
.bp-superseded { background: var(--ev-superseded); }
.bets-axes { margin-bottom: .9em; }
.bets-axis-note { font-size: .72rem; color: var(--mute); }
.four-risks-wrap { margin: .6em 0; }
.four-risks-strip { margin-top: .35em; }
.bets-note { font-size: .82rem; color: var(--fg-soft); margin: .6em 0 .4em; }
.riskiest-list { margin-top: .4em; }
.riskiest-row { display: flex; align-items: center; gap: .55em; text-decoration: none; cursor: pointer;
  padding: .35em .2em; border-bottom: 1px solid var(--hair); color: var(--fg); }
.riskiest-row:last-child { border-bottom: none; }
.riskiest-row:hover .riskiest-text { color: var(--accent); }
.riskiest-imp { font-family: var(--mono); font-size: .6rem; text-transform: uppercase; letter-spacing: .04em;
  border-radius: 3px; padding: .05em .4em; white-space: nowrap; }
.imp-critical { background: color-mix(in srgb, var(--st-blocked) 18%, transparent); color: var(--st-blocked); }
.imp-high { background: color-mix(in srgb, var(--st-building) 18%, transparent); color: #9a7400; }
.imp-medium, .imp-low { background: var(--code-bg); color: var(--mute); border: 1px solid var(--hair); }
.riskiest-text { flex: 1 1 auto; font-size: .85rem; min-width: 0; }
.riskiest-id { font-family: var(--mono); font-size: .68rem; color: var(--mute); }
.bets-explore { font-size: .82rem; margin: .7em 0 0; }
.bets-explore a { color: var(--accent); text-decoration: none; }
/* Strength pill — values kept IDENTICAL to build-canvas.ts's .str-* (both render in the
   same browser session; divergence would read as a bug). Keep the two in sync. */
.str { font-family: var(--mono); font-size: .6rem; border-radius: 999px; padding: .05em .45em; white-space: nowrap; border: 1px solid var(--hair); }
.str-strong { background: color-mix(in srgb, var(--fg) 60%, transparent); color: var(--bg); border-color: transparent; }
.str-moderate { background: color-mix(in srgb, var(--fg) 24%, transparent); color: var(--fg); }
.str-weak { background: transparent; color: var(--mute); border-style: dashed; }

/* ── Strategy thesis kernel (rendered from strategy.md) ── */
.kernel h3 { color: var(--fg); }
.kernel p { color: var(--fg-soft); }
.kernel-block { margin: 0 0 1em; }

/* ── Bet drawer body (in-place peek of canvas-owned data + open-in-canvas) ── */
.bet-meta { display: flex; flex-wrap: wrap; gap: .4em; align-items: center; margin-bottom: 1em; }
.ev-chip { font-family: var(--mono); font-size: .66rem; border-radius: 999px; padding: .12em .6em; border: 1px solid var(--hair); }
.ev-confirmed { background: color-mix(in srgb, var(--st-done) 16%, transparent); color: var(--st-done); border-color: color-mix(in srgb, var(--st-done) 40%, transparent); }
.ev-tested { background: color-mix(in srgb, var(--st-building) 16%, transparent); color: #9a7400; border-color: color-mix(in srgb, var(--st-building) 40%, transparent); }
.ev-assumed { background: color-mix(in srgb, var(--st-planned) 16%, transparent); color: var(--fg-soft); }
.ev-killed, .ev-superseded { background: color-mix(in srgb, var(--st-blocked) 16%, transparent); color: var(--st-blocked); border-color: color-mix(in srgb, var(--st-blocked) 40%, transparent); }
.open-in-canvas { display: inline-flex; align-items: center; gap: .4em; margin-top: .4em;
  font-size: .85rem; color: var(--accent); text-decoration: none; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--hair));
  border-radius: var(--r-md, 6px); padding: .35em .7em; }
.open-in-canvas:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }

/* ── Drawer extras: nest back-link + permalink line ── */
.po-back { display: inline-flex; align-items: center; gap: .3em; font-size: .8rem; color: var(--accent);
  text-decoration: none; cursor: pointer; margin-bottom: .8em; }
.po-back:hover { text-decoration: underline; }
.po-permalink { font-size: .74rem; color: var(--mute); }
.po-permalink a { color: var(--mute); }

/* The condensed direction strip atop the ledger. */
.direction-strip { display: flex; align-items: center; gap: .7em; text-decoration: none;
  padding: .55em .8em; margin-bottom: 1.25em; border: 1px solid var(--hair); border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 4%, var(--bg)); }
.direction-strip:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--hair)); }
.ds-label { font-family: var(--mono); font-size: .64rem; text-transform: uppercase; letter-spacing: .07em;
  color: var(--accent); flex: none; }
.ds-vision { flex: 1 1 auto; min-width: 0; font-size: .82rem; color: var(--fg-soft);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ds-bar { flex: none; width: 110px; }
.ds-bar .bets-bar { margin: 0; height: 8px; }
.ds-go { font-family: var(--mono); font-size: .68rem; color: var(--accent); flex: none; }
</style>
`;

// ── Work-ledger index page ────────────────────────────────────────────────────

// ── Work ledger (slug "", the home) — kanban + record + incremental channel ──────
// The home surface. A direction strip links UP to Strategy; the kanban + record + the
// incremental channel sit below. Every card is a drawer trigger (the complete sidecar
// carries them). No spine — the ledger is the entry point, not a mid-throughline step.
function renderLedgerPage(ctx: Ctx, nav: NavGroup[], labelFn: (s: string) => string): string {
  const { items, model, canvas, L, standaloneIUs } = ctx;
  const slug = ctx.ledgerSlug;
  const columns: LedgerColumn[] = ["now", "building", "next", "later"];
  const grouped: Record<LedgerColumn, WorkItem[]> = { now: [], next: [], later: [], building: [], record: [] };
  for (const item of items) grouped[lifecycleToColumn(item.fm.lifecycle_state)].push(item);

  const columnsHtml = columns.map((col) => {
    const colItems = grouped[col];
    const cardsHtml = colItems.length
      ? colItems.map((it) => workItem(it, "compact", ctx)).join("\n")
      : `<div class="ledger-column-empty">—</div>`;
    return `<div class="ledger-column">
  <div class="ledger-column-header">${esc(COLUMN_LABELS[col])} <span class="ledger-column-count">${colItems.length}</span></div>
  ${cardsHtml}
</div>`;
  }).join("\n");

  const recordItems = grouped.record;
  const recordCardsHtml = recordItems.length
    ? `<div class="ledger-record-grid">${recordItems.map((it) => workItem(it, "compact", ctx)).join("\n")}</div>`
    : `<p class="ledger-column-empty">No closed items yet.</p>`;

  // Incremental channel — standalone IUs grouped by build status.
  const incrCols: Array<[string, string]> = [
    ["building", "Building"], ["planned", "Planned"], ["blocked", "Blocked"], ["done", "Done"],
  ];
  const incrGrouped: Record<string, IU[]> = { building: [], planned: [], blocked: [], done: [] };
  for (const u of standaloneIUs) {
    const s = (u.fm.status || "planned").toLowerCase();
    (incrGrouped[s] ?? incrGrouped["planned"]).push(u);
  }
  const incrHtml = standaloneIUs.length
    ? `<div class="ledger-columns">${incrCols
        .filter(([k]) => incrGrouped[k].length)
        .map(([k, label]) => `<div class="ledger-column">
  <div class="ledger-column-header">${esc(label)} <span class="ledger-column-count">${incrGrouped[k].length}</span></div>
  ${incrGrouped[k].map((u) => iu(u, "compact")).join("\n")}
</div>`).join("\n")}</div>`
    : `<p class="ledger-column-empty">No standalone improvements yet. The incremental-improvement workflow files them here.</p>`;

  const bodyHtml = `${directionStrip(model, canvas, L)}
${provenanceBanner(ctx.proj)}
<p class="dashboard-lede">One ledger across the lifecycle, in two channels: sprint work items (each decomposing into implementation units) and standalone incremental improvements.</p>
<div class="channels">
  <input type="radio" name="ch" id="ch-sprint" class="ch-radio" checked>
  <input type="radio" name="ch" id="ch-incr" class="ch-radio">
  <div class="ch-tabs">
    <label class="ch-tab" for="ch-sprint">Sprint · ${items.length}</label>
    <label class="ch-tab" for="ch-incr">Incremental improvement · ${standaloneIUs.length}</label>
  </div>
  <section class="ch-panel ch-panel-sprint">
    <div class="ledger-columns">
${columnsHtml}
    </div>
    <div class="ledger-record" id="record">
      <div class="ledger-record-header">${esc(COLUMN_LABELS.record)}</div>
      ${recordCardsHtml}
    </div>
  </section>
  <section class="ch-panel ch-panel-incr">
    ${incrHtml}
  </section>
</div>
${buildSidecar(ctx)}`;

  const page: CorePage = {
    path: slug,
    fm: { title: "Work ledger", description: "Forward view + durable record of every work item." },
    raw: "",
    kind: "dashboard",
  };

  return renderSurfacePage({
    slug,
    page,
    nav,
    bodyHtml,
    pageLabel: labelFn,
    layoutVariant: "app",
    suppressHeader: false,
    bodyScripts: () => `<script src="/popout.js" defer></script>`,
    extraHead: () => DASHBOARD_STYLES,
  });
}

// ── Per-item detail page ──────────────────────────────────────────────────────

function renderGateDecisions(gates?: GateDecision[]): string {
  if (!gates || gates.length === 0) return "<p>No gate decisions recorded.</p>";
  const items = gates.map((g) => {
    const cls = g.decision === "go" ? "gate-go" : "gate-nogo";
    const evidenceHtml = g.evidence_refs?.length
      ? `<div class="gate-evidence">Evidence: ${g.evidence_refs.map((e) => esc(e)).join(", ")}</div>`
      : "";
    const conditionsHtml = g.conditions
      ? `<div class="gate-conditions">Conditions: ${esc(g.conditions)}</div>`
      : "";
    return `<li class="gate-entry">
  <div class="gate-header">
    <span>${esc(g.gate)}</span>
    <span class="${cls}">${esc((g.decision ?? "?").toUpperCase())}</span>
    <span class="tier-badge">${esc(g.confidence ?? "")}</span>
  </div>
  <div class="gate-meta">${esc(g.owner)} · ${esc(g.timestamp)}</div>
  ${evidenceHtml}
  ${conditionsHtml}
</li>`;
  }).join("\n");
  return `<ul class="gate-list">${items}</ul>`;
}

function renderFrozenTimeline(ft?: FrozenTimeline): string {
  if (!ft) return "";
  const entries = (ft.transitions ?? []).map((t) =>
    `<li class="timeline-entry"><span class="timeline-stage">${esc(t.stage)}</span><span class="timeline-at">${esc(t.at)}</span></li>`
  ).join("\n");
  return `<div class="frozen-timeline">
  <div class="frozen-title">Frozen timeline (committed at close)</div>
  <ul class="timeline-list">
    ${entries}
    <li class="timeline-entry"><span class="timeline-stage">${esc(ft.final_stage)} (final)</span><span class="timeline-at">${esc(ft.captured_at)}</span></li>
  </ul>
</div>`;
}

// (renderRiskDetail removed — D65: the four-risks grid, risk(rs,"grid"), supersedes the
//  table; it renders in the item throughline, drawer + permalink page alike.)

// ══ The throughline — vision → bets → objectives → work → record ═══════════════
// Shared, brand-neutral machinery that renders the authored cross-links + reverse
// indexes the schemas carry (D38: authored-not-inferred). No product term enters
// here — every value is read from bound surfaces (objectives.md, work items, the
// optional canvas.json). The renderer composes the links; it never invents a store.

// ── Depth-aware link helpers ───────────────────────────────────────────────────
// A dashboard page at `slug` links to (a) other dashboard pages — relative, depth-
// aware via makePageHref; (b) the deploy root — for cross-surface links; (c) the
// sibling /canvas/ surface — root-relative + the entry anchor. mountDepth = how many
// levels the dashboard surface root sits below the deploy root (always 1 here).
interface Links {
  /** href to another dashboard page (optionally with a #anchor); same-page → bare #anchor. */
  page: (targetSlug: string, anchor?: string) => string;
  /** href to a canvas entry anchor on the sibling /canvas/ surface (no entry → the canvas root). */
  canvas: (entry?: string) => string;
}
function makeLinks(slug: string, mountDepth = 1): Links {
  const within = makePageHref(slug);
  const toRoot = assetPrefix(slug) + "../".repeat(mountDepth);
  return {
    // esc() the target slug + anchor: both can carry untrusted free-text that lands in an
    // href attribute — a work-item id, an outcome_link, a canvas entry id read raw from
    // canvas.json (the untrusted product tier). toRoot/within(t) are "../" + path
    // separators that esc() leaves intact, so escaping the whole href is safe + total.
    page: (target, anchor) => {
      const t = target.replace(/^\//, "");
      if (anchor && t === slug) return `#${esc(anchor)}`;   // same page → bare fragment
      const base = esc(within(t));
      return anchor ? `${base}#${esc(anchor)}` : base;
    },
    canvas: (entry) => `${toRoot}canvas/${entry ? `#${esc(entry)}` : ""}`,
  };
}

// ── Outcome model: parse objectives.md structurally (eng H2 prerequisite) ───────
// objectives.md is authored markdown but carries STRUCTURE the renderer must read
// directly — never via renderMarkdown, whose heading ids are slugged from heading
// TEXT (so #<objective-id> dangles). We parse the id + statement + key_results and
// emit headings keyed on the authored id, so every reverse-index/contribution link
// resolves. Tolerant: a malformed/foreign-format doc degrades to an empty model.
interface KeyResult { metric: string; target: string; current: string; }
interface Objective {
  id: string;
  statement: string;
  intro: string;
  key_results: KeyResult[];
  north_star_link?: string;
  maturity_note?: string;
  strategy_link?: string;   // canvas entry id (T3) — the bet this objective tests
  vision_link?: string;
}
export interface OutcomeModel {
  vision: { statement?: string; horizon?: string };
  objectives: Objective[];
  northStar?: string;
  ok: boolean;              // false ⇒ no parseable structure (renderer falls back to markdown)
  rawBody?: string;         // the authored objectives.md body — fallback render when unparsed
}
const EMPTY_MODEL: OutcomeModel = { vision: {}, objectives: [], ok: false };

// Pull the inline `- **key:** value` / `- *key:* value` bullet (value may continue
// on indented non-bullet lines). Tolerant of bold/italic markers and an inside-or-
// outside colon.
function bulletField(lines: string[], key: string): string | undefined {
  const re = new RegExp(`^\\s*[-*]\\s+[*_]{1,2}\\s*${key}\\s*:?\\s*[*_]{0,2}\\s*(.*)$`, "i");
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    let v = (m[1] || "").replace(/^[*_]{1,2}/, "").trim();
    for (let j = i + 1; j < lines.length && !/^\s*[-*]\s/.test(lines[j]) && !/^#/.test(lines[j]); j++) {
      if (lines[j].trim()) v += " " + lines[j].trim();
    }
    return v.trim() || undefined;
  }
  return undefined;
}

// Key-result lines are the only ones carrying `metric:`+`target:` — scan the whole
// objective block (no sub-bullet boundary fiddliness). Values are quoted.
function parseKeyResults(lines: string[]): KeyResult[] {
  const krs: KeyResult[] = [];
  for (const ln of lines) {
    if (!/metric\s*:/.test(ln) || !/target\s*:/.test(ln)) continue;
    const grab = (k: string) => new RegExp(`${k}\\s*:\\s*"([^"]*)"`).exec(ln)?.[1]
      ?? new RegExp(`${k}\\s*:\\s*'([^']*)'`).exec(ln)?.[1] ?? "";
    const metric = grab("metric");
    if (metric) krs.push({ metric, target: grab("target"), current: grab("current") });
  }
  return krs;
}

export function parseObjectives(body: string): OutcomeModel {
  const lines = body.split(/\r?\n/);
  // Split into `## ` sections (lines before the first ## are ignored).
  const sections: { title: string; body: string[] }[] = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const ln of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(ln);
    if (m) { cur = { title: m[1].trim(), body: [] }; sections.push(cur); }
    else if (cur) cur.body.push(ln);
  }
  const sec = (re: RegExp) => sections.find((s) => re.test(s.title));

  const visionLines = sec(/^vision\b/i)?.body ?? [];
  const vision = {
    statement: bulletField(visionLines, "statement"),
    horizon: bulletField(visionLines, "horizon"),
  };

  // Objectives section → split by `### ` headings.
  const objLines = sec(/^objectives\b/i)?.body ?? [];
  const objBlocks: { head: string; body: string[] }[] = [];
  let ob: { head: string; body: string[] } | null = null;
  for (const ln of objLines) {
    const m = /^###\s+(.+?)\s*$/.exec(ln);
    if (m) { ob = { head: m[1].trim(), body: [] }; objBlocks.push(ob); }
    else if (ob) ob.body.push(ln);
  }
  const objectives: Objective[] = objBlocks.map((b) => {
    // head = "<id> — <statement>"  (spaced em/en/hyphen dash).
    const hm = /^(.+?)\s+[—–-]\s+(.+)$/.exec(b.head);
    const id = (hm ? hm[1] : b.head).trim();
    const statement = (hm ? hm[2] : "").trim();
    const introLines: string[] = [];
    for (const ln of b.body) { if (/^\s*[-*]\s/.test(ln)) break; introLines.push(ln); }
    return {
      id,
      statement,
      intro: introLines.join("\n").trim(),
      key_results: parseKeyResults(b.body),
      north_star_link: bulletField(b.body, "north_star_link"),
      maturity_note: bulletField(b.body, "maturity_note"),
      strategy_link: bulletField(b.body, "strategy_link"),
      vision_link: bulletField(b.body, "vision_link"),
    };
  }).filter((o) => o.id);

  const northStar = (sec(/^north[- ]?star\b/i)?.body ?? []).join("\n").trim() || undefined;
  const ok = !!(vision.statement || objectives.length);
  return { vision, objectives, northStar, ok, rawBody: body };
}

// ── Single-pass reverse index (eng M4) ──────────────────────────────────────────
// Bucket work items by outcome_link AND value_prop_link in ONE O(N) pass. These are
// the derived "objective → work" and "bet → work" indexes the schemas don't store
// but can compute deterministically from authored forward links.
export interface ReverseIndex {
  byOutcome: Map<string, WorkItem[]>;
  byValueProp: Map<string, WorkItem[]>;   // keyed on the canvas entry id (leading token)
}
export function buildReverseIndex(items: WorkItem[]): ReverseIndex {
  const byOutcome = new Map<string, WorkItem[]>();
  const byValueProp = new Map<string, WorkItem[]>();
  const push = (m: Map<string, WorkItem[]>, k: string, it: WorkItem) => {
    const a = m.get(k); if (a) a.push(it); else m.set(k, [it]);
  };
  for (const it of items) {
    if (it.fm.outcome_link) push(byOutcome, it.fm.outcome_link, it);
    const vp = canvasEntryId(it.fm.value_prop_link);
    if (vp) push(byValueProp, vp, it);
  }
  return { byOutcome, byValueProp };
}

// value_prop_link MAY resolve to a canvas entry id (work-item-schema v0.3.1). It is
// authored free-text whose LEADING token is the entry id (e.g. "H-CP-03 (cp_pains…)").
// An id is a code-like token (carries a digit or a hyphen) — a plain word ("vpc…") is
// returned too (the canvas may carry it); a prose sentence yields null.
export function canvasEntryId(vpl?: string): string | null {
  if (!vpl) return null;
  const tok = /^\s*([A-Za-z][\w.-]*)/.exec(vpl)?.[1];
  if (tok && (/\d/.test(tok) || tok.includes("-"))) return tok;
  return null;
}

// ── Key-result rendering: honest status + (only when numeric) a proportional fill ──
function krState(current: string): { cls: string; label: string } {
  const c = (current || "").toLowerCase();
  if (/\b(done|complete|completed|shipped|live|achieved|met)\b/.test(c)) return { cls: "kr-done", label: "done" };
  if (/\b(not started|not yet started|none yet|unbuilt|nothing yet)\b/.test(c) || /^0\b/.test(c.trim()))
    return { cls: "kr-todo", label: "not started" };
  if (!c.trim()) return { cls: "kr-unknown", label: "—" };
  return { cls: "kr-progress", label: "in progress" };
}
// A proportional fill ONLY when both target + current carry a comparable number
// (same %-or-bare unit). Qualitative currents get no bar — a fill would imply a
// measured fraction we don't have (honesty ≥ green).
function krFill(target: string, current: string): number | null {
  const num = (s: string) => { const m = /(-?\d+(?:\.\d+)?)\s*(%?)/.exec(s || ""); return m ? { n: parseFloat(m[1]), pct: m[2] === "%" } : null; };
  const t = num(target), c = num(current);
  // Only a fill when both are non-negative, same-unit, positive-target — never invent a
  // 100%-full bar for a wrong-direction (negative) or mismatched-unit metric.
  if (!t || !c || t.pct !== c.pct || t.n <= 0 || c.n < 0) return null;
  return Math.max(0, Math.min(1, c.n / t.n));
}
function krRows(krs: KeyResult[]): string {
  if (!krs.length) return "";
  const rows = krs.map((kr) => {
    const st = krState(kr.current);
    const fill = krFill(kr.target, kr.current);
    const bar = fill === null ? "" :
      `<div class="kr-bar"><span class="kr-bar-fill" style="width:${Math.round(fill * 100)}%"></span></div>`;
    return `<div class="kr-row">
  <div class="kr-main">
    <div class="kr-metric"><span class="kr-led ${st.cls}"></span>${esc(kr.metric)}</div>
    ${bar}
  </div>
  <div class="kr-rt">
    <span class="kr-target">target: ${esc(kr.target || "—")}</span>
    <span class="kr-current ${st.cls}">${esc(kr.current || "—")}</span>
  </div>
</div>`;
  }).join("\n");
  return `<div class="kr-list">${rows}</div>`;
}

// ── The Strategy section rail (D65) ─────────────────────────────────────────────
// The 5-step cross-page spine breadcrumb is superseded; on Strategy it degenerates to a
// within-surface section rail (the three #anchors that live on this page), with work +
// record linking out to the ledger. Brand-neutral.
function strategyRail(L: Links, ledgerSlug: string): string {
  const steps = [
    `<a class="spine-step" href="#vision">vision</a>`,
    `<a class="spine-step" href="#bets">bets</a>`,
    `<a class="spine-step" href="#objectives">objectives</a>`,
    `<a class="spine-step" href="${L.page(ledgerSlug)}">work</a>`,
    `<a class="spine-step" href="${L.page(ledgerSlug, "record")}">record</a>`,
  ];
  return `<nav class="spine" aria-label="Strategy sections">${steps.join('<span class="spine-sep" aria-hidden="true">▸</span>')}</nav>`;
}

// ── Vision apex (composed once, from objectives.md — the single source) ──────────
function visionApex(vision: OutcomeModel["vision"]): string {
  if (!vision.statement) return "";
  const horizon = vision.horizon ? `<span class="vision-horizon">horizon: ${esc(vision.horizon)}</span>` : "";
  return `<div class="vision-apex" id="vision">
  <div class="vision-label">Vision${horizon ? " · " : ""}${horizon}</div>
  <p class="vision-statement">${esc(vision.statement)}</p>
</div>`;
}

// ── Objective accordion (expand-in-place — the dissolved Progress page) ──────────
// Each objective is a <details id=obj.id> (id-keyed so deep-links + reverse-index links
// resolve). Co-locates the objective with its upward link (the bet it tests, in place
// via the bet drawer) and its downward link (the work advancing it, byOutcome chips).
function objectiveAccordion(obj: Objective, ctx: Ctx): string {
  const { rev, canvasIds } = ctx;
  const contributors = rev.byOutcome.get(obj.id) ?? [];
  const krs = obj.key_results;
  const done = krs.filter((k) => krState(k.current).label === "done").length;
  const krSummary = krs.length ? `${done}/${krs.length} key results met` : "no key results";

  // strategy_link → the bet this objective tests, opened IN PLACE (drawer) when the
  // canvas is bound + the id resolves; bound-but-absent → unresolved; canvas unbound →
  // a plain note (no drawer, no canvas surface); prose → unresolved.
  const betId = canvasEntryId(obj.strategy_link);
  const betNote = linkNote(obj.strategy_link, betId);
  let betRow = "";
  if (obj.strategy_link) {
    if (betId && canvasIds !== null && canvasIds.has(betId)) betRow = alink("Tests the bet", { popout: betId }, betId, { code: true, note: betNote || undefined });
    else if (betId && canvasIds !== null) betRow = alink("Tests the bet", null, betId, { unresolved: "no such bet" });
    else if (betId) betRow = alink("Tests the bet", null, betNote ? `${betId} — ${betNote}` : betId, { plain: true });
    else betRow = alink("Tests the bet", null, obj.strategy_link, { unresolved: "unresolved" });
  }

  const contribHtml = contributors.length
    ? `<div class="contrib-list">${contributors.map((it) => workItem(it, "chip", ctx)).join("\n")}</div>`
    : `<p class="contrib-empty">No work items advancing this objective yet.</p>`;

  return `<details class="obj-acc" id="${esc(obj.id)}">
  <summary class="obj-sum">
    <span class="obj-statement">${esc(obj.statement || obj.id)}</span>
    <span class="obj-krsummary">${esc(krSummary)}</span>
    <span class="obj-contribcount">${contributors.length} advancing</span>
  </summary>
  <div class="obj-body">
    ${betRow}
    ${obj.intro ? `<p class="obj-intro">${esc(obj.intro)}</p>` : ""}
    ${krRows(obj.key_results)}
    ${obj.north_star_link ? `<div class="obj-ns">North-star: ${esc(obj.north_star_link)}</div>` : ""}
    <div class="contrib-block">
      <div class="contrib-label">Work advancing this objective <span class="contrib-count">${contributors.length}</span></div>
      ${contribHtml}
    </div>
    ${obj.maturity_note ? `<p class="obj-maturity">${esc(obj.maturity_note)}</p>` : ""}
  </div>
</details>`;
}

// ── Per-item permalink page (the shareable / no-JS fallback) ────────────────────
// D65 demotes the item PAGE from the primary path (drawers are primary). It renders the
// SAME shared sections as the drawer (itemThroughline + itemDetailSections) so the two
// never drift, plus the complete sidecar so its child-IU cards + bet link open drawers
// when JS is on. A "← Work ledger" link replaces the spine.
function renderItemDetailPage(item: WorkItem, ctx: Ctx, nav: NavGroup[], labelFn: (s: string) => string): string {
  const slug = `item/${item.id}`;
  const { L } = ctx;
  const childIUs = ctx.iusByParent.get(item.id) ?? [];

  const bodyHtml = `<p class="dashboard-lede"><a class="alink" href="${L.page(ctx.ledgerSlug)}"><span class="alink-glyph">←</span> Work ledger</a></p>
${provenanceBanner(ctx.proj)}
<div class="po-group">${esc(item.fm.lifecycle_state)}${item.fm.tier ? " · " + esc(item.fm.tier) : ""}</div>
<h1 class="po-title">${esc(item.fm.title)}</h1>
<div class="po-badges"><span class="lifecycle-tag">${esc(item.fm.lifecycle_state)}</span>${tierBadge(item.fm.tier)}${risk(item.fm.risk_state, "pill")}${item.fm.disposition ? `<span class="card-disposition">${esc(item.fm.disposition)}</span>` : ""}</div>
${itemThroughline(item, ctx)}
${itemDetailSections(item, ctx, childIUs).join("\n")}
${buildSidecar(ctx)}`;

  const page: CorePage = {
    path: slug,
    fm: { title: item.fm.title, description: item.fm.lifecycle_state + " · " + (item.fm.tier ?? "") },
    raw: "",
    kind: "work-item",
    toc: [],
  };

  return renderSurfacePage({
    slug,
    page,
    nav,
    bodyHtml,
    pageLabel: labelFn,
    showToc: false,
    layoutVariant: "app",
    bodyScripts: () => `<script src="/popout.js" defer></script>`,
    extraHead: () => DASHBOARD_STYLES,
  });
}

// ── Progress page ─────────────────────────────────────────────────────────────

// ── The objectives cascade (folded into Strategy — was the Progress page) ────────
// Expand-in-place accordions + the okr-schema fallback + the unresolved-links honesty
// section + the north-star + the input-gated analytics note. Reads ctx (depth-aware L,
// model, rev, items). The TREND layer stays input-gated, namespaced from carrier
// projection + factory conformance (the three-analytics-namespace rule, D49 / 06-analytics).
function objectivesCascade(ctx: Ctx): string {
  const { model, items, rev } = ctx;
  const objIds = new Set(model.objectives.map((o) => o.id));
  const hasObjectives = model.objectives.length > 0;

  const accordions = model.objectives.map((obj) => objectiveAccordion(obj, ctx)).join("\n");

  // Fallback: an objectives.md NOT in the structured okr-schema format still renders its
  // authored markdown — never a blank page (the structural cascade just does not light up).
  const fallbackHtml = (!hasObjectives && model.rawBody && model.rawBody.trim())
    ? `<div class="progress-fallback"><p class="progress-gated">Objectives are not in the structured <code>okr-schema</code> format — showing the authored document. Author per <code>okr-schema</code> to light up the live OKR cascade + contribution view.</p>${renderMarkdown(model.rawBody, { page: { path: "strategy", fm: {} as Record<string, unknown>, raw: model.rawBody } }).html}</div>`
    : "";

  // Dangling / unlinked work — only meaningful when objectives parsed. Never a broken
  // anchor; a visible "unresolved" affordance whose chip opens the work-item drawer.
  const dangling = hasObjectives ? items.filter((it) => it.fm.outcome_link && !objIds.has(it.fm.outcome_link)) : [];
  const unlinked = hasObjectives ? items.filter((it) => !it.fm.outcome_link) : [];
  const issuesHtml = (dangling.length || unlinked.length)
    ? `<section class="progress-issues">
  <h2 id="unresolved">Unresolved links</h2>
  ${dangling.length ? `<p class="dashboard-lede" style="margin:.4em 0">${dangling.length} work item${dangling.length === 1 ? "" : "s"} point at an objective id not in objectives.md (shown, but it does not resolve):</p>
  <div class="contrib-list">${dangling.map((it) => `<a class="contrib lifecycle-${clsToken(it.fm.lifecycle_state)}" data-popout="${esc(it.id)}" role="button" tabindex="0"><span class="contrib-state">unresolved</span><span class="contrib-title">${esc(it.fm.title)} → ${esc(it.fm.outcome_link!)}</span></a>`).join("\n")}</div>` : ""}
  ${unlinked.length ? `<p class="dashboard-lede" style="margin:.6em 0 .4em">${unlinked.length} work item${unlinked.length === 1 ? "" : "s"} carr${unlinked.length === 1 ? "ies" : "y"} no <code>outcome_link</code> — ${unlinked.length === 1 ? "it ladders" : "they ladder"} to nothing yet:</p>
  <div class="contrib-list">${unlinked.map((it) => workItem(it, "chip", ctx)).join("\n")}</div>` : ""}
</section>`
    : "";

  const northStarHtml = model.northStar
    ? `<section class="northstar"><h3 id="north-star">North-star</h3><p>${esc(model.northStar)}</p></section>`
    : "";

  // North-star/KPI TREND layer is input-gated (distinct from "demand never tested").
  const analyticsHtml = `<div class="progress-gated northstar-gated">
  <strong>Input-gated</strong> — the strategic product-analytics layer (north-star trend charts, KPI
  dashboards from real usage) lights up when real user signal exists. The targets and our read of them
  above are the honest pre-signal measure. (Distinct from a demand-never-tested gap, which would show as
  an amber warning, not this grey "waiting".)
</div>`;

  const notice = (hasObjectives || fallbackHtml) ? "" : `<p class="progress-gated">No <code>objectives.md</code> bound — author it per <code>okr-schema</code> to light up the cascade.</p>`;

  return `<h2 id="objectives">Objectives — the outcome cascade</h2>
<p class="dashboard-lede">Every objective with its key-results and the work advancing it. Expand one to see the cascade; each ladders to the vision and tests a bet.</p>
${notice}
${accordions}
${fallbackHtml}
${issuesHtml}
${northStarHtml}
${analyticsHtml}`;
}

// ══ The bets rollup — read the optional canvas, aggregate the two axes ═════════
// The dashboard reads the canvas via the OPTIONAL renderer.canvas-root binding for
// a bets-posture rollup; it NEVER re-renders the grid (the canvas owns that) and it
// degrades gracefully (narrative + objectives only) when the canvas is unbound. The
// rollup is computed from generic evidence-state/strength enums — no product scheme.

function resolveCanvasRoot(): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf("--canvas-root");
  if (i !== -1 && args[i + 1]) return path.resolve(args[i + 1]);
  if (process.env["CANVAS_ROOT"]) return path.resolve(process.env["CANVAS_ROOT"]);
  return null;   // OPTIONAL binding — absent ⇒ the rollup degrades, never crashes
}

const EV_STATES = ["confirmed", "tested", "assumed", "killed", "superseded"] as const;
type EvState = (typeof EV_STATES)[number];
const EV_RETIRED = new Set<EvState>(["killed", "superseded"]);
function evStateOf(s?: string): EvState {
  const e = (s || "assumed").toLowerCase();
  return (EV_STATES as readonly string[]).includes(e) ? (e as EvState) : "assumed";
}
function strengthOf(s?: string): Rung {
  const r = (s || "").toLowerCase();
  return (r === "weak" || r === "moderate" || r === "strong") ? r : "unknown";
}

export interface CanvasEntry {
  id?: string; text: string; evidence: EvState; strength: Rung; importance_rank?: string;
  detail?: string;   // canvas free-text — shown in the bet drawer, esc()-only (M6)
  region: "bmc" | "vpc" | "supporting"; slot: string;
}
export interface CanvasModel { entries: CanvasEntry[]; ids: Set<string>; title?: string; }

// Read canvas.json (tolerant of the canvas-chip's {thesis,entries} shape AND legacy
// Entry[]). Returns null on absent/malformed — the caller degrades. NEVER throws.
function loadCanvas(root: string | null): CanvasModel | null {
  if (!root) return null;
  const p = path.join(root, "canvas.json");
  if (!existsSync(p)) return null;
  let data: Record<string, unknown>;
  try { data = JSON.parse(readFileSync(p, "utf-8")); } catch (e) { warn(`canvas.json malformed at ${p}: ${e}`); return null; }
  // Valid JSON that is not an object (literal null / array / number) ⇒ degrade, never throw.
  if (!data || typeof data !== "object" || Array.isArray(data)) { warn(`canvas.json is not an object at ${p}`); return null; }
  const entries: CanvasEntry[] = [];
  const ids = new Set<string>();
  const slotEntries = (v: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
    if (v && typeof v === "object" && Array.isArray((v as { entries?: unknown }).entries)) return (v as { entries: Array<Record<string, unknown>> }).entries;
    return [];
  };
  const take = (region: CanvasEntry["region"], slot: string, raw: Record<string, unknown>) => {
    if (!raw || typeof raw !== "object" || typeof raw.text !== "string") return;
    const id = typeof raw.id === "string" ? raw.id : undefined;
    if (id) ids.add(id);
    entries.push({
      id, text: raw.text, evidence: evStateOf(raw.evidence as string), strength: strengthOf(raw.strength as string),
      importance_rank: typeof raw.importance_rank === "string" ? raw.importance_rank : undefined,
      detail: typeof raw.detail === "string" ? raw.detail : undefined, region, slot,
    });
  };
  const bmc = (data.bmc ?? {}) as Record<string, unknown>;
  for (const slot of Object.keys(bmc)) for (const e of slotEntries(bmc[slot])) take("bmc", slot, e);
  const vpc = (data.vpc ?? {}) as Record<string, unknown>;
  for (const slot of Object.keys(vpc)) { if (slot === "segment") continue; for (const e of slotEntries(vpc[slot])) take("vpc", slot, e); }
  const supporting = Array.isArray(data.supporting) ? data.supporting as Array<Record<string, unknown>> : [];
  for (const g of supporting) for (const e of slotEntries(g)) take("supporting", typeof g.label === "string" ? g.label : "supporting", e);
  return { entries, ids, title: typeof data.title === "string" ? data.title : undefined };
}

// Which risk a bet informs (generic BMC/VPC taxonomy, NOT a product scheme): the VPC
// + the value_propositions cell are the desirability/VALUE bets; the rest of the BMC
// (+ the supporting landscape) are the business-model/VIABILITY bets. usability +
// feasibility are NOT on the canvas — they come from work-item risk_state (council #2).
const isValueBet = (e: CanvasEntry) => e.region === "vpc" || (e.region === "bmc" && e.slot === "value_propositions");

const RANK_ORD: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
// RUNG_ORD + RUNG_CLASS + riskRung are defined once with the risk vocabulary (top of file).

interface BetsRollup {
  total: number; live: number;
  state: Record<EvState, number>;
  strength: { strong: number; moderate: number; weak: number };  // non-retired only
  value: Rung; viability: Rung;
  demand: "did" | "said" | "untested";
  riskiest: CanvasEntry[] | null;   // null ⇒ no importance_rank ⇒ "open by state", no ranking
}
// Coverage rung for a set — HONEST, not cherry-picked-best (honesty ≥ green). A risk
// is "strong" only when discovery is essentially complete: a strong-confirmed bet AND
// no bet still left an assumption (one confirmed infra bet must NOT green-up a risk
// whose crux bet is still assumed). "moderate" = some real evidence but gaps remain;
// "weak" = only assumptions/weak; empty ⇒ unknown.
export function coverageRung(set: CanvasEntry[]): Rung {
  const live = set.filter((e) => !EV_RETIRED.has(e.evidence));
  if (!live.length) return "unknown";
  const hasAssumed = live.some((e) => e.evidence === "assumed");
  const strongConfirmed = live.some((e) => e.evidence === "confirmed" && e.strength === "strong");
  const someEvidence = live.some((e) => (e.evidence === "confirmed" || e.evidence === "tested") && e.strength !== "weak");
  if (strongConfirmed && !hasAssumed) return "strong";
  if (strongConfirmed || someEvidence) return "moderate";
  return "weak";
}
function rollupBets(canvas: CanvasModel): BetsRollup {
  const state: Record<EvState, number> = { confirmed: 0, tested: 0, assumed: 0, killed: 0, superseded: 0 };
  const strength = { strong: 0, moderate: 0, weak: 0 };
  for (const e of canvas.entries) {
    state[e.evidence]++;
    if (!EV_RETIRED.has(e.evidence) && e.strength !== "unknown") strength[e.strength]++;
  }
  const valueSet = canvas.entries.filter(isValueBet);
  const demand: BetsRollup["demand"] = valueSet.some((e) => !EV_RETIRED.has(e.evidence) && e.strength === "strong")
    ? "did" : valueSet.some((e) => !EV_RETIRED.has(e.evidence) && e.strength === "moderate") ? "said" : "untested";
  const hasRank = canvas.entries.some((e) => e.importance_rank);
  const riskiest = hasRank
    ? canvas.entries
        .filter((e) => e.evidence === "assumed" || e.evidence === "tested")
        .sort((a, b) =>
          (RANK_ORD[a.importance_rank ?? "medium"] - RANK_ORD[b.importance_rank ?? "medium"]) ||
          (RUNG_ORD[a.strength] - RUNG_ORD[b.strength]) ||
          (a.id ?? a.text).localeCompare(b.id ?? b.text, "en", { numeric: true }))
        .slice(0, 6)
    : null;
  const total = canvas.entries.length;
  const live = total - state.killed - state.superseded;
  return {
    total, live, state, strength,
    value: coverageRung(valueSet),
    viability: coverageRung(canvas.entries.filter((e) => !isValueBet(e))),
    demand, riskiest,
  };
}

// The work items' risk_state aggregate for a dimension (usability / feasibility): the
// MOST-EXPOSED evaluated item sets the risk (a risk is only as cleared as its weakest
// item — honesty ≥ green). "unknown"/not-evaluated items are skipped (no evidence yet
// ≠ weak evidence); if none is evaluated the dimension reads unknown.
function itemsRiskRung(items: WorkItem[], dim: keyof RiskState): Rung {
  let worst: Rung | null = null;
  for (const it of items) {
    const r = riskRung(it.fm.risk_state?.[dim] as string | undefined);
    if (r === "unknown") continue;
    if (worst === null || RUNG_ORD[r] < RUNG_ORD[worst]) worst = r;
  }
  return worst ?? "unknown";
}

// ── Rollup components ───────────────────────────────────────────────────────────
// The single bets-posture primitive (design-review #1): ONE horizontal stacked bar —
// segment COLOUR = lifecycle state, segment OPACITY = strength rung. A confirmed bet
// on weak evidence renders PALE; on strong, SOLID — so a silent upgrade is visually
// impossible (council #1 met structurally, not in a footnote).
const RUNG_OPACITY: Record<Rung, number> = { strong: 1, moderate: 0.58, weak: 0.3, unknown: 0.3 };
function betsPostureBar(canvas: CanvasModel): string {
  const segs: string[] = [];
  const labelParts: string[] = [];
  for (const st of EV_STATES) {
    const inState = canvas.entries.filter((e) => e.evidence === st);
    if (!inState.length) continue;
    if (EV_RETIRED.has(st)) {
      segs.push(`<span class="bp-seg bp-${st}" style="flex:${inState.length};opacity:.5" title="${esc(`${inState.length} ${st}`)}"></span>`);
      labelParts.push(`${inState.length} ${st}`);
      continue;
    }
    for (const rung of ["strong", "moderate", "weak", "unknown"] as Rung[]) {
      const n = inState.filter((e) => e.strength === rung).length;
      if (!n) continue;
      segs.push(`<span class="bp-seg bp-${st}" style="flex:${n};opacity:${RUNG_OPACITY[rung]}" title="${esc(`${n} ${st}, ${rung === "unknown" ? "unrated" : rung} evidence`)}"></span>`);
      labelParts.push(`${n} ${st}/${rung === "unknown" ? "unrated" : rung}`);
    }
  }
  if (!segs.length) return "";
  return `<div class="bets-bar" role="img" aria-label="${esc(`Bets posture: ${labelParts.join(", ")}`)}">${segs.join("")}</div>`;
}
function demandBadge(demand: BetsRollup["demand"]): string {
  const map = {
    did: ["bp-demand-did", "demand tested — observed (did-yes)"],
    said: ["bp-demand-said", "demand stated only (said-yes)"],
    untested: ["bp-demand-untested", "demand never tested"],
  } as const;
  const [cls, label] = map[demand];
  return `<span class="bp-demand ${cls}">${esc(label)}</span>`;
}
function fourRisksStrip(canvas: CanvasModel, items: WorkItem[]): string {
  const r = rollupBets(canvas);
  const cells: [string, Rung, string][] = [
    ["value", r.value, "canvas"],
    ["usability", itemsRiskRung(items, "usability"), "work items"],
    ["feasibility", itemsRiskRung(items, "feasibility"), "work items"],
    ["viability", r.viability, "canvas"],
  ];
  const html = cells.map(([label, rung, src]) =>
    `<div class="risk-cell ${RUNG_CLASS[rung]}" title="${esc(`${label} — ${rung === "unknown" ? "no evidence yet" : rung + " evidence"} (from ${src})`)}">
  <span class="risk-cell-dot"></span><span class="risk-cell-label">${esc(label)}</span><span class="risk-cell-rung">${esc(rung === "unknown" ? "—" : rung)}</span>
</div>`).join("");
  return `<div class="risk-grid four-risks-strip" role="group" aria-label="Four-risks coverage">${html}</div>`;
}
// Riskiest open bets. A bet with an id opens its drawer IN PLACE (data-popout); an
// id-less bet has no drawer target, so it is a plain row.
function riskiestList(riskiest: CanvasEntry[] | null, rollup: BetsRollup): string {
  if (riskiest === null) {
    // No importance signal in the canvas ⇒ DON'T assert a riskiness order we can't compute.
    return `<p class="bets-note">Open bets by state: <strong>${rollup.state.assumed}</strong> assumed, <strong>${rollup.state.tested}</strong> tested. (Riskiest-first ranking lights up when the canvas carries an importance signal.)</p>`;
  }
  if (!riskiest.length) return `<p class="bets-note">No open bets — every bet is confirmed or retired.</p>`;
  const rows = riskiest.map((e) => {
    const inner = `<span class="riskiest-imp imp-${clsToken(e.importance_rank ?? "medium")}">${esc(e.importance_rank ?? "—")}</span>
  <span class="str str-${e.strength === "unknown" ? "weak" : e.strength}">${esc(e.strength === "unknown" ? "unrated" : e.strength)}</span>
  <span class="riskiest-text">${esc(e.text)}</span>
  ${e.id ? `<code class="riskiest-id">${esc(e.id)}</code>` : ""}`;
    return e.id
      ? `<a class="riskiest-row" data-popout="${esc(e.id)}" role="button" tabindex="0">${inner}</a>`
      : `<div class="riskiest-row">${inner}</div>`;
  }).join("\n");
  return `<div class="riskiest-list"><div class="bets-note">Riskiest open bets — important and least-evidenced first (Strategyzer):</div>${rows}</div>`;
}

// The bets-rollup section (the Strategy #bets surface). Degrades to a one-line "canvas
// not bound" placeholder when the canvas is unbound — never silently vanishes (which
// would falsely read as "no bets"). The heading always renders so the section rail's
// #bets anchor resolves even when degraded.
function betsRollupSection(canvas: CanvasModel | null, items: WorkItem[], L: Links): string {
  const head = `<h2 id="bets">Bets — evidence posture</h2>`;
  if (!canvas) {
    return `${head}
<div class="progress-gated">Bets posture: <strong>canvas not bound</strong> — bind <code>renderer.canvas-root</code> to a <code>canvas.json</code> to light up the evidence rollup. Explore bets directly on the canvas surface.</div>`;
  }
  const r = rollupBets(canvas);
  if (!r.total) {
    return `${head}<p class="bets-note">The canvas is bound but carries no bets yet.</p>`;
  }
  return `${head}
<div class="bets-rollup">
  <div class="bets-head">
    <div class="bets-counts"><strong>${r.total}</strong> bets · <strong>${r.state.confirmed}</strong> confirmed · <strong>${r.state.tested}</strong> tested · <strong>${r.state.assumed}</strong> assumed${r.state.killed + r.state.superseded ? ` · ${r.state.killed + r.state.superseded} retired` : ""}</div>
    ${demandBadge(r.demand)}
  </div>
  ${betsPostureBar(canvas)}
  <div class="bets-axes"><span class="bets-axis-note">colour = state · fill = evidence strength (pale = weak, solid = observed)</span></div>
  <div class="four-risks-wrap"><div class="contrib-label">Four-risks coverage</div>${fourRisksStrip(canvas, items)}</div>
  ${riskiestList(r.riskiest, r)}
  <p class="bets-explore">Explore every bet on the <a href="${L.canvas()}">business-model canvas →</a></p>
</div>`;
}

// Condensed direction strip atop the ledger — the throughline at a glance, linking UP
// to Strategy (the coherence surface). Vision one-liner + the bets-posture bar.
function directionStrip(model: OutcomeModel, canvas: CanvasModel | null, L: Links): string {
  const v = model.vision.statement ? `<span class="ds-vision">${esc(model.vision.statement)}</span>` : "";
  const bar = canvas ? `<span class="ds-bar">${betsPostureBar(canvas)}</span>` : "";
  return `<a class="direction-strip" href="${L.page("strategy")}">
  <span class="ds-label">Direction</span>${v}${bar}<span class="ds-go">strategy →</span>
</a>`;
}

// ── Strategy page (slug "strategy") — thesis + bets posture + objectives cascade ─
// The coherence surface: vision apex → the thesis kernel (strategy.md) → the two-axis
// bets posture → the objectives cascade (expand-in-place accordions, the dissolved
// Progress page) → unresolved-links honesty + the input-gated trend note. Bet + work
// detail open IN PLACE via the drawers in the complete sidecar.
function renderStrategyPage(ctx: Ctx, stratDoc: { fm: Record<string, unknown>; body: string } | null, nav: NavGroup[], labelFn: (s: string) => string): string {
  const { L, model, items, canvas } = ctx;
  const kernelHtml = stratDoc
    // Strip a leading vision restatement (the apex below owns the vision; never duplicate it).
    ? `<div class="kernel">${renderMarkdown(stratDoc.body.replace(/^>\s*\*\*Vision:\*\*[^\n]*(\n>[^\n]*)*\n?/im, ""), { page: { path: "strategy", fm: stratDoc.fm as Record<string, unknown>, raw: stratDoc.body } }).html}</div>`
    : `<p class="progress-gated">No <code>strategy.md</code> bound — author the Product Strategy thesis (per <code>okr-schema</code> / the bindings contract).</p>`;

  const bodyHtml = `${strategyRail(L, ctx.ledgerSlug)}
${visionApex(model.vision)}
<p class="dashboard-lede">The Product Strategy thesis — the guiding argument every objective, bet, and work item is held against. The vision is the apex above; this is the argument for how we get there.</p>
${kernelHtml}
${betsRollupSection(canvas, items, L)}
${objectivesCascade(ctx)}
${buildSidecar(ctx)}`;

  const page: CorePage = {
    path: "strategy",
    fm: { title: "Strategy", description: "The Product Strategy thesis, the bets posture, and the objectives cascade." },
    raw: "",
    kind: "strategy",
  };

  return renderSurfacePage({
    slug: "strategy",
    page,
    nav,
    bodyHtml,
    pageLabel: labelFn,
    layoutVariant: "app",
    showToc: false,
    bodyScripts: () => `<script src="/popout.js" defer></script>`,
    extraHead: () => DASHBOARD_STYLES,
  });
}

// ── Main build ────────────────────────────────────────────────────────────────
// Guarded so the module can be imported by build-dashboard.test.ts (which unit-tests
// the pure helpers) without running the side-effecting build. `import.meta.main` is
// true only when this file is the entry point (`bun run build-dashboard.ts …`).
if (import.meta.main) {

if (!existsSync(dashRoot)) throw new Error(`Dashboard root not found: ${dashRoot}`);

log(`dashboard surface — root: ${dashRoot}`);

// Clean + recreate the surface dir (never remove whole dist/)
if (existsSync(surfaceDir)) rmSync(surfaceDir, { recursive: true, force: true });
ensureDir(surfaceDir);

// Copy assets (same pattern as build-handbook.ts)
for (const basename of assetBasenames) {
  const src = path.join(vendorAssetsDir, basename);
  if (existsSync(src)) copyFileSync(src, path.join(surfaceDir, basename));
  else warn(`asset missing: ${src}`);
}
for (const brandAsset of ["brand-overrides.css", "favicon.svg"]) {
  const src = path.join(brandDir, brandAsset);
  if (existsSync(src)) copyFileSync(src, path.join(surfaceDir, brandAsset));
}

// Load data
const items = loadItems();
log(`  loaded ${items.length} work items`);

// IUs — first-class units. Group sprint IUs under their parent; collect standalone (incremental).
const ius = loadIUs();
const iusByParent = new Map<string, IU[]>();
const standaloneIUs: IU[] = [];
for (const iu of ius) {
  if (iu.fm.parent) {
    if (!iusByParent.has(iu.fm.parent)) iusByParent.set(iu.fm.parent, []);
    iusByParent.get(iu.fm.parent)!.push(iu);
  } else {
    standaloneIUs.push(iu);
  }
}
log(`  loaded ${ius.length} implementation units (${standaloneIUs.length} standalone)`);

const projResult = loadProjection();
if (projResult.fresh) {
  log(`  snapshot: fresh (commit matches HEAD ${projResult.gitHead?.slice(0, 8)})`);
} else {
  log(`  snapshot: stale/absent — ${projResult.staleReason}`);
}

const objDoc = loadMarkdownDoc(path.join(dashRoot, "objectives.md"));
const stratDoc = loadMarkdownDoc(path.join(dashRoot, "strategy.md"));

// Parse the outcome layer ONCE (structurally — H2) and build the reverse index (single
// O(N) pass — M4). Shared by the ledger, Strategy, and the item permalink pages via Ctx.
const outcomeModel = objDoc ? parseObjectives(objDoc.body) : EMPTY_MODEL;
const reverseIndex = buildReverseIndex(items);
log(`  parsed ${outcomeModel.objectives.length} objectives (vision ${outcomeModel.vision.statement ? "set" : "absent"})`);

// D65: two surfaces — Work ledger is the home (slug ""); Strategy is "strategy".
const ledgerSlug = "";
// Read the OPTIONAL canvas (renderer.canvas-root). null ⇒ unbound ⇒ the bets rollup
// degrades to "canvas not bound" + bet drawers/links degrade (the /canvas/ surface is
// skipped from the build by build.sh when unbound).
const canvas = loadCanvas(resolveCanvasRoot());
const canvasIds: Set<string> | null = canvas ? canvas.ids : null;
log(canvas ? `  canvas: ${canvas.entries.length} bets bound (${canvas.ids.size} addressable ids)` : "  canvas: not bound — bets rollup degrades");

const nav = buildNav(items);
const labelFn = pageLabel(items);

// Objective ids and drawer (sidecar) ids share the URL-hash namespace: an objective
// accordion is <details id=obj.id>, a drawer opens on its sidecar id. popout.js resolves
// a sidecar id before a <details>, so an objective id that collides with a work-item / IU /
// bet id would open the drawer instead of expanding the accordion. Warn at build (the ids
// are namespaced by convention — wi-/iu-/bet codes vs objective ids — so a collision is an
// authoring bug, not silently wrong).
{
  const drawerIds = new Set<string>([
    ...items.map((it) => it.id),
    ...ius.map((u) => u.id),
    ...(canvas?.entries ?? []).map((e) => e.id).filter(Boolean) as string[],
  ]);
  for (const o of outcomeModel.objectives) {
    if (drawerIds.has(o.id)) warn(`objective id "${o.id}" collides with a drawer id — its deep-link will open the drawer, not the accordion. Rename one.`);
  }
}

// The Ctx factory — the once-computed aggregates + a PER-PAGE depth-aware L. A drawer
// rendered for the ledger and for Strategy differs correctly in its internal hrefs.
const ctxFor = (slug: string): Ctx => ({
  proj: projResult, L: makeLinks(slug), model: outcomeModel, rev: reverseIndex,
  canvas, canvasIds, items, standaloneIUs, iusByParent, ledgerSlug,
});

// ── Render: Work ledger (the home, slug "") ───────────────────────────────────
writeHtml(path.join(surfaceDir, "index.html"), renderLedgerPage(ctxFor(ledgerSlug), nav, labelFn));
log("  [page] (home) work ledger");

// ── Render: Strategy (slug "strategy") ────────────────────────────────────────
writeHtml(path.join(surfaceDir, "strategy", "index.html"), renderStrategyPage(ctxFor("strategy"), stratDoc, nav, labelFn));
log("  [page] strategy");

// ── Render: per-item permalink pages (the shareable / no-JS fallback) ──────────
for (const item of items) {
  const html = renderItemDetailPage(item, ctxFor(`item/${item.id}`), nav, labelFn);
  writeHtml(path.join(surfaceDir, "item", item.id, "index.html"), html);
  log(`  [page] item/${item.id} — ${item.fm.title}`);
}

log(`\ndashboard: built ${2 + items.length} pages (2 surfaces + ${items.length} item permalinks) → ${surfaceDir}`);
if (!projResult.fresh) {
  log(`WARNING: snapshot stale — ${projResult.staleReason}`);
}

} // end if (import.meta.main)
