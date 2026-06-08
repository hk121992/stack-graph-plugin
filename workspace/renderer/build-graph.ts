// Graph browser surface build (A3b-3).
//
// Renders the WHOLE stack-graph node/edge graph into the deployable surface at
// workspace/dist/graph/. Net-new (be-civic has no whole-graph browser); modelled
// on build-handbook.ts for paths, asset copying, the shell call, and output
// layout.
//
// Pipeline (design §1 graph browser + §5 build-data contract):
//   graph/graph-record.json (committed structure — the source of truth)
//     → emit DOT for all nodes + typed edges
//     → shell out to Graphviz (dot -Tsvg)
//     → post-process the SVG: tag node groups (data-node-id), strip <a> wrappers
//       (clicks open the sidebar, never navigate), tag edge groups
//       (data-from/data-to), inject two health "traffic-light" badges per node
//       (last-updated from git; last-used GREY/unknown — projection snapshot does
//        not exist yet, so this badge renders DEGRADED per the design contract)
//     → embed a per-node JSON sidecar + a hidden detail sidebar
//     → render through the branded shell (renderSurfacePage)
//
// The surface is self-contained: assets ship at the surface root
// (dist/graph/style.css …) and the page at dist/graph/index.html, mirroring the
// handbook surface so the relative asset-prefix works and the portal hub links
// across surfaces. Run: bun run workspace/renderer/build-graph.ts

import {
  readFileSync, writeFileSync, mkdirSync, copyFileSync,
  existsSync, rmSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { assetBasenames, renderMarkdown, type CorePage, type NavGroup } from "./vendor/bc-renderer-core/src/index.js";
import { renderSurfacePage } from "./shell-host.js";
import { brandRoot } from "./brand/brand.js";

const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rendererDir, "..", "..");

// Graph root — the directory holding graph-record.json + the per-node
// <id>/<id>.md source files. Default = the factory's own graph/ (factory build
// unchanged). A harness renders ITS dev-loop graph (the vendored plugin's graph)
// by pointing here: `--graph-root <dir>` or env GRAPH_ROOT. git last-updated runs
// with cwd=graphRoot, so a non-git or copied tree simply degrades the badge to
// "unknown" (the documented degraded-mode contract) rather than failing.
function resolveGraphRoot(): string {
  const args = process.argv.slice(2);
  const i = args.indexOf("--graph-root");
  if (i !== -1 && args[i + 1]) return path.resolve(args[i + 1]);
  if (process.env["GRAPH_ROOT"]) return path.resolve(process.env["GRAPH_ROOT"]);
  return path.join(repoRoot, "graph");
}
const graphRoot = resolveGraphRoot();
const recordPath = path.join(graphRoot, "graph-record.json");

// Local graph overlay — the harness's OWN graph elements (entry nodes + connecting
// edges), composed on top of the vendored (sg) graph so the surface shows the WHOLE
// graph, not just the vendored part. Optional + input-gated: a harness with no local
// nodes yet simply renders the vendored graph. The overlay is a self-describing
// manifest `{ nodes: { <id>: { primitive, title, description } }, edges: [ {from,to,type} ] }`
// — its nodes carry their metadata inline (no .md file needed), and its edges may point
// at vendored node ids to connect the overlay. Everything in it is tagged owner="local".
// Bind via `--graph-local <manifest.json>` or env GRAPH_LOCAL.
function resolveLocalGraph(): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf("--graph-local");
  if (i !== -1 && args[i + 1]) return path.resolve(args[i + 1]);
  if (process.env["GRAPH_LOCAL"]) return path.resolve(process.env["GRAPH_LOCAL"]);
  return null;
}

/** Compose the vendored (sg) record with the optional local overlay, owner-tagging
 *  both. Mutates+returns rec. The graph surface then renders the composed union. */
function composeOwners(rec: GraphRecord, localPath: string | null): { sg: number; local: number } {
  for (const id of Object.keys(rec.nodes)) rec.nodes[id].owner = "sg";
  for (const e of rec.edges) e.owner = "sg";
  let local = 0;
  if (localPath && existsSync(localPath)) {
    const overlay = JSON.parse(readFileSync(localPath, "utf8")) as Partial<GraphRecord>;
    for (const [id, n] of Object.entries(overlay.nodes ?? {})) {
      rec.nodes[id] = { ...(n as RecordNode), owner: "local" };
      local++;
    }
    for (const e of overlay.edges ?? []) rec.edges.push({ ...e, owner: "local" });
  }
  return { sg: Object.keys(rec.nodes).length - local, local };
}

const distRoot = path.join(rendererDir, "..", "dist");          // workspace/dist
// Mount subpath for the graph surface (default "graph"). A harness whose /graph/*
// is already taken (e.g. a Knowledge-Graph worker) mounts it deeper — GRAPH_MOUNT
// or --mount "graph/stack-graph" — and the surface builds directly there with the
// right link depth (mountDepth), instead of being moved post-build (which breaks
// the to-hub links).
function resolveGraphMount(): string {
  const args = process.argv.slice(2);
  const i = args.indexOf("--mount");
  const raw = (i !== -1 && args[i + 1]) ? args[i + 1] : (process.env["GRAPH_MOUNT"] || "graph");
  return raw.replace(/^\/+|\/+$/g, "");           // trim slashes
}
const graphMount = resolveGraphMount();
const graphMountDepth = graphMount.split("/").length;
const surfaceDir = path.join(distRoot, ...graphMount.split("/"));  // workspace/dist/<mount>
const vendorAssetsDir = path.join(rendererDir, "vendor", "bc-renderer-core", "assets");
const localAssetsDir = path.join(rendererDir, "assets");        // forked graph-browser.js lives here
const brandDir = brandRoot;   // BRAND_ROOT overlay, else the vendored brand/

function ensureDir(dir: string) { mkdirSync(dir, { recursive: true }); }
function writeHtml(filePath: string, html: string) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, html, "utf-8");
}
const log = (m: string) => process.stdout.write(m + "\n");
const warn = (m: string) => process.stderr.write("[warn] " + m + "\n");

// ─── Record types (subset of graph-record.json we consume) ──────────────────

interface RecordEdge {
  from: string;
  to: string;
  type: string;
  stage?: string;
  load?: string;
  external?: boolean;
  owner?: string;             // "sg" (vendored) | "local" (harness overlay) — set at compose
}
interface RecordNode {
  primitive: string;          // skill | agent | command | script
  mode?: string;
  title?: string;
  status?: string;
  edges?: Record<string, unknown>;
  owner?: string;             // "sg" (vendored) | "local" (harness overlay) — set at compose
  description?: string;       // local-overlay nodes carry their metadata inline (no .md file)
}
interface GraphRecord {
  node_count: number;
  edge_count: number;
  nodes: Record<string, RecordNode>;
  references?: Record<string, unknown>;
  edges: RecordEdge[];
}

// ─── Health (the two traffic-lights) ─────────────────────────────────────────

type Health = "green" | "amber" | "red" | "unknown";

/** Map a commit ISO timestamp → recency traffic-light. */
function recencyLight(iso: string | null): Health {
  if (!iso) return "unknown";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const days = (Date.now() - then) / 86_400_000;
  if (days <= 30) return "green";
  if (days <= 90) return "amber";
  return "red";
}

/** Resolve a node's authored file path: graph/<id>/<id>.md (convention). */
// Path of a node's source file, relative to graphRoot (`<id>/<id>.md`). null when
// the file is absent (e.g. a record entry with no on-disk node). Resolved against
// graphRoot so the same code serves the factory graph and a harness's bound graph.
function nodeFileRel(id: string): string | null {
  const rel = path.join(id, `${id}.md`);
  return existsSync(path.join(graphRoot, rel)) ? rel : null;
}

/**
 * last-updated, from git: the most recent commit touching the node's file.
 * Returns null when the file is untracked or git/history is unavailable
 * (e.g. a shallow checkout) — the badge then renders "unknown".
 */
function lastUpdatedISO(relFile: string | null): string | null {
  if (!relFile) return null;
  try {
    const out = execFileSync(
      "git", ["log", "-1", "--format=%cI", "--", relFile],
      { cwd: graphRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

// ─── DOT emission ────────────────────────────────────────────────────────────

// Node styling by primitive (kind). Fills reuse the vendored --node-*-fill
// tokens so the graph reads in theme; Graphviz needs concrete fallbacks inline.
// Concrete hex — Graphviz cannot resolve CSS custom properties (var()); it
// silently falls back to black, which is the black-on-black bug. Light chips +
// dark label read on both light and dark canvases. Legend swatches mirror these.
// Outline-only nodes: type is encoded by STROKE colour, not fill, so the canvas
// stays dark, the health status-lights read clearly, and the edge traces are the
// visual focus. Mid-tone hues chosen to be legible on BOTH the light and the dark
// canvas (Graphviz bakes concrete hex — it cannot read CSS vars).
const KIND_STYLE: Record<string, { stroke: string; shape: string }> = {
  skill:    { stroke: "#7c8893", shape: "box" },   // slate — the workhorse primitive
  agent:    { stroke: "#1f97a8", shape: "box" },   // teal  — actors (accent family)
  script:   { stroke: "#c2912f", shape: "box" },   // amber — automation
  _default: { stroke: "#7c8893", shape: "box" },
};

// Edge styling/colour by type. The structural edges share an ink tone; the two
// process edges (precedes / can-follow) are visually distinct (they are the only
// cyclic edges — 02-graph-spec) and composes-into is dashed (node→arc).
const EDGE_STYLE: Record<string, { color: string; style?: string; label: string }> = {
  "invokes":       { color: "#3b6fb0", label: "invokes" },
  "references":    { color: "#7a7872", style: "dashed", label: "references" },
  "composes-into": { color: "#9b8b1f", style: "dotted", label: "composes-into" },
  "precedes":      { color: "#2e9e5b", label: "precedes" },
  "can-follow":    { color: "#d9a514", style: "dashed", label: "can-follow (loop)" },
  "maintains":     { color: "#b06a3b", label: "maintains" },
  "overlay":       { color: "#8a5bd6", style: "dashed", label: "overlay" },
  "loads":         { color: "#3b6fb0", label: "loads" },
  "triggers":      { color: "#d64545", label: "triggers" },
  "seed-next":     { color: "#d9a514", style: "dashed", label: "seed-next" },
};
function edgeStyle(type: string) {
  return EDGE_STYLE[type] ?? { color: "var(--edge-stroke, #8a8884)", label: type };
}

function dotEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Build the DOT source for the whole graph. We only draw edges whose BOTH
 * endpoints are nodes in the record (references/external targets like
 * `handbook`, and arc targets like `dev-sprint`, are not nodes — they would be
 * floating endpoints, so we skip them here; the sidecar still lists every edge
 * including those, for the sidebar).
 */
function buildDot(rec: GraphRecord): { dot: string; drawnEdgeKeys: Set<string> } {
  const nodeIds = new Set(Object.keys(rec.nodes));
  const lines: string[] = [];
  lines.push("digraph stackgraph {");
  lines.push("  rankdir=LR;");
  lines.push("  bgcolor=\"transparent\";");
  lines.push("  pad=0.3;");
  lines.push("  nodesep=0.35;");
  lines.push("  ranksep=0.85;");
  lines.push('  node [fontname="Helvetica", fontsize=11, penwidth=1.5, margin="0.16,0.10", style="rounded", fontcolor="#1b1d1f"];');
  lines.push('  edge [fontname="Helvetica", fontsize=8, penwidth=1.1, arrowsize=0.7];');

  // Nodes
  for (const id of Object.keys(rec.nodes).sort()) {
    const n = rec.nodes[id];
    const kind = n.primitive || "_default";
    const st = KIND_STYLE[kind] ?? KIND_STYLE._default;
    // Escape id + kind individually and keep the `\n` as a RAW DOT newline. Running
    // dotEscape over the whole label double-escaped the backslash, so Graphviz drew a
    // literal "\n" instead of a line break (QA finding).
    // Owner: vendored (sg) nodes are solid; harness-local overlay nodes render
    // dashed + double-bordered so the composed graph reads ownership at a glance
    // (the graph counterpart to the handbook's sg/local badges).
    const isLocal = n.owner === "local";
    const ownerLabel = isLocal ? `${dotEscape(kind)}, local` : dotEscape(kind);
    const labelText = `${dotEscape(id)}\\n(${ownerLabel})`;
    const ownerAttr = isLocal ? `, style="rounded,dashed", peripheries=2` : "";
    lines.push(
      `  "${dotEscape(id)}" [label="${labelText}", shape=${st.shape}, color="${st.stroke}"${ownerAttr}];`,
    );
  }

  // Edges (only node→node; sorted for stable output). De-dupe identical
  // from/to/type triples (composes-into may repeat per stage).
  const drawnEdgeKeys = new Set<string>();
  const seen = new Set<string>();
  const sorted = [...rec.edges].sort((a, b) =>
    (a.from + a.to + a.type).localeCompare(b.from + b.to + b.type),
  );
  for (const e of sorted) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue; // skip non-node endpoints
    const key = `${e.from}|${e.to}|${e.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drawnEdgeKeys.add(`${e.from}|${e.to}`);
    const st = edgeStyle(e.type);
    const styleAttr = st.style ? `, style=${st.style}` : "";
    // Cyclic process edges (can-follow / seed-next) must NOT drive rank order —
    // otherwise Graphviz lays them co-directionally on top of the precedes arrow
    // and the loop is invisible. constraint=false routes them as visible back-arcs.
    const constraintAttr =
      (e.type === "can-follow" || e.type === "seed-next") ? ", constraint=false" : "";
    // No `tooltip` — Graphviz wraps any edge carrying one in an <a> element;
    // we surface the edge type via the SVG <title> and the sidecar instead, so
    // the edge group stays a clean <g class="edge"> with no anchor.
    lines.push(
      `  "${dotEscape(e.from)}" -> "${dotEscape(e.to)}" ` +
      `[color="${st.color}"${styleAttr}${constraintAttr}];`,
    );
  }

  lines.push("}");
  return { dot: lines.join("\n"), drawnEdgeKeys };
}

// ─── Graphviz ────────────────────────────────────────────────────────────────

function runGraphviz(dot: string): string | null {
  const res = spawnSync("dot", ["-Tsvg"], { input: dot, encoding: "utf8" });
  // Graceful degrade: a consuming workspace may not have Graphviz installed.
  // Skip the graph SVG (render a notice) rather than failing the whole build.
  if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
    warn("Graphviz ('dot') not found on PATH — graph SVG skipped; the surface renders a notice. Install graphviz to enable the whole-graph view.");
    return null;
  }
  if (res.error || res.status !== 0) {
    const detail = res.error ? String(res.error.message) : (res.stderr || `exit ${res.status}`);
    throw new Error(
      `Graphviz failed. The 'dot' binary must be installed and on PATH ` +
      `(expected at /usr/bin/dot). Detail: ${detail}`,
    );
  }
  if (!res.stdout || !res.stdout.includes("<svg")) {
    throw new Error("Graphviz produced no <svg> output.");
  }
  return res.stdout;
}

// ─── SVG post-processing (string/token manipulation) ─────────────────────────

interface NodeBadges { lastUpdated: Health; lastUsed: Health; }

/**
 * Post-process the Graphviz SVG:
 *   - strip the XML/DOCTYPE preamble so the SVG inlines cleanly;
 *   - per node <g class="node">: add data-node-id; remove the <a xlink:href>
 *     wrapper (clicks open the sidebar, not navigation); inject two badge
 *     circles (last-updated + last-used);
 *   - per edge <g class="edge">: add data-from / data-to (parsed from the
 *     Graphviz <title>from&#45;&gt;to</title>).
 */
function postProcessSvg(
  svg: string,
  badges: Map<string, NodeBadges>,
): { svg: string; nodeIdCount: number } {
  // Drop everything before the opening <svg ...> (XML decl, DOCTYPE, comments).
  const svgOpen = svg.indexOf("<svg");
  let body = svgOpen >= 0 ? svg.slice(svgOpen) : svg;

  let nodeIdCount = 0;

  // Process each <g ...class="node"...> ... </g> block. Graphviz emits the
  // node id inside <title>…</title>. We match the whole group lazily.
  body = body.replace(
    /<g\b([^>]*\bclass="node"[^>]*)>([\s\S]*?)<\/g>/g,
    (_full, attrs: string, inner: string) => {
      const titleMatch = inner.match(/<title>([\s\S]*?)<\/title>/);
      const rawId = titleMatch ? decodeEntities(titleMatch[1].trim()) : "";
      const id = rawId;

      // Strip any <a ...xlink:href...> wrapper so clicks don't navigate; keep
      // its children (the shape + text). Graphviz only emits <a> when a URL is
      // set, but we defend regardless.
      let innerClean = inner
        .replace(/<a\b[^>]*>/g, "")
        .replace(/<\/a>/g, "");

      // Inject the two health badges near the node's text anchor. We compute a
      // placement from the node's <ellipse>/<polygon>/<path> if present; else
      // fall back to the <text> coordinates.
      const badgeSvg = id ? renderBadges(id, innerClean, badges.get(id)) : "";

      const safeId = id ? ` data-node-id="${escAttr(id)}"` : "";
      if (id) nodeIdCount++;
      return `<g${attrs}${safeId}>${innerClean}${badgeSvg}</g>`;
    },
  );

  // Process each edge group: add data-from / data-to from its <title>.
  body = body.replace(
    /<g\b([^>]*\bclass="edge"[^>]*)>([\s\S]*?)<\/g>/g,
    (_full, attrs: string, inner: string) => {
      const titleMatch = inner.match(/<title>([\s\S]*?)<\/title>/);
      let from = "", to = "";
      if (titleMatch) {
        const t = decodeEntities(titleMatch[1].trim());
        // Graphviz directed-edge title form: "from->to"
        const arrow = t.split("->");
        if (arrow.length === 2) { from = arrow[0].trim(); to = arrow[1].trim(); }
      }
      const dataAttrs = (from && to)
        ? ` data-from="${escAttr(from)}" data-to="${escAttr(to)}"`
        : "";
      return `<g${attrs}${dataAttrs}>${inner}</g>`;
    },
  );

  return { svg: body, nodeIdCount };
}

/** Decode the handful of XML entities Graphviz uses in <title>. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#45;/g, "-")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function escAttr(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/'/g, "&#39;");
}

/**
 * Render the two badge circles for a node. We anchor them at the top-left of
 * the node's bounding shape, derived from the first <polygon>/<ellipse>/<path>
 * points in the node group. The fills use CSS custom properties (with concrete
 * fallbacks) so themes can re-tint. last-used is GREY/unknown (degraded).
 */
function renderBadges(id: string, innerClean: string, b: NodeBadges | undefined): string {
  const box = nodeBox(innerClean);
  if (!box) return "";
  const updated = b?.lastUpdated ?? "unknown";
  const used = b?.lastUsed ?? "unknown";
  // A small status "chip" floated just above the node's top-right shoulder —
  // OUTSIDE the box, so it never overlaps the centred label (Graphviz sizes boxes
  // tight to the label, so no in-box corner is clear). Holds two well-separated LED
  // dots (last-updated · last-used) on an opaque backing so they read on the
  // outline-only node; CSS colours the dots per data-state (theme-aware).
  const r = 2.8;
  const dotGap = 8.4;                       // centre-to-centre — leaves a clear gap
  const padX = 4.5, padY = 4;
  const chipW = dotGap + r * 2 + padX * 2;
  const chipH = r * 2 + padY * 2;
  const chipX = box.x1 - chipW;             // right-aligned to the box's right edge
  const chipY = box.y0 - chipH - 2;         // floated just above the top edge
  const cy = chipY + chipH / 2;
  const cx1 = chipX + padX + r;
  const cx2 = cx1 + dotGap;
  const dot = (cx: number, state: Health, cls: string, title: string) =>
    `<circle class="health-dot ${cls}" data-state="${state}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}">` +
      `<title>${title}</title></circle>`;
  return (
    `<g class="node-health" aria-hidden="true">` +
    `<rect class="health-chip" x="${chipX.toFixed(1)}" y="${chipY.toFixed(1)}" ` +
      `width="${chipW.toFixed(1)}" height="${chipH.toFixed(1)}" rx="${(chipH / 2).toFixed(1)}"></rect>` +
    dot(cx1, updated, "health-updated", `last-updated: ${updated}`) +
    dot(cx2, used, "health-used", `last-used: ${used} (no projection snapshot)`) +
    `</g>`
  );
}

/**
 * Bounding box of a node's shape, in the node group's local coordinate space.
 * Handles Graphviz boxes (<polygon>), rounded boxes (<path d=…>, the style we
 * emit), and ellipses; falls back to an approximate box around the <text> anchor.
 * Coordinates are comma-paired (`x,y`) in every Graphviz shape, so we collect all
 * pairs and take min/max — control points of a rounded rect sit on the rect, so
 * the bbox is the rectangle.
 */
function nodeBox(inner: string): { x0: number; y0: number; x1: number; y1: number } | null {
  const fromPairs = (s: string) => {
    const xs: number[] = [], ys: number[] = [];
    for (const m of s.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
      const x = Number(m[1]), y = Number(m[2]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) { xs.push(x); ys.push(y); }
    }
    return xs.length ? { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } : null;
  };
  const poly = inner.match(/<polygon[^>]*\bpoints="([^"]+)"/);
  if (poly) { const box = fromPairs(poly[1]); if (box) return box; }
  const pathEl = inner.match(/<path[^>]*\bd="([^"]+)"/);
  if (pathEl) { const box = fromPairs(pathEl[1]); if (box) return box; }
  const ell = inner.match(/<ellipse[^>]*\bcx="([-\d.]+)"[^>]*\bcy="([-\d.]+)"[^>]*\brx="([-\d.]+)"[^>]*\bry="([-\d.]+)"/);
  if (ell) {
    const cx = Number(ell[1]), cy = Number(ell[2]), rx = Number(ell[3]), ry = Number(ell[4]);
    if (![cx, cy, rx, ry].some(Number.isNaN)) return { x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry };
  }
  const text = inner.match(/<text[^>]*\bx="([-\d.]+)"[^>]*\by="([-\d.]+)"/);
  if (text) {
    const x = Number(text[1]), y = Number(text[2]);
    if (![x, y].some(Number.isNaN)) return { x0: x - 28, y0: y - 16, x1: x + 28, y1: y + 6 };
  }
  return null;
}

// ─── Sidecar (per-node detail JSON) ──────────────────────────────────────────

/** Pull goals[] (outcome/metric) + description from a node file's frontmatter. */
function readNodeMeta(id: string): { description?: string; goals: { outcome?: string; metric?: string }[] } {
  const rel = nodeFileRel(id);
  if (!rel) return { goals: [] };
  let raw: string;
  try { raw = readFileSync(path.join(graphRoot, rel), "utf8"); }
  catch { return { goals: [] }; }
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { goals: [] };
  const fm = fmMatch[1];

  // description: single-line scalar.
  let description: string | undefined;
  const descLine = fm.match(/^description:\s*(.+)$/m);
  if (descLine) description = descLine[1].trim().replace(/^["']|["']$/g, "");

  // goals: a YAML list of { outcome, metric, ... }. Light parse — collect
  // `- outcome:` / `metric:` pairs under the `goals:` key.
  const goals: { outcome?: string; metric?: string }[] = [];
  const goalsIdx = fm.search(/^goals:\s*$/m);
  if (goalsIdx >= 0) {
    const after = fm.slice(goalsIdx);
    const block = after.split(/\n(?=\S)/)[0]; // up to the next top-level key
    let cur: { outcome?: string; metric?: string } | null = null;
    for (const line of block.split("\n")) {
      const o = line.match(/^\s*-\s*outcome:\s*(.+)$/);
      const m = line.match(/^\s*metric:\s*(.+)$/);
      if (o) { cur = { outcome: o[1].trim() }; goals.push(cur); }
      else if (m && cur) { cur.metric = m[1].trim(); }
    }
  }
  return { description, goals };
}

interface SidecarEdge { id: string; type: string; stage?: string; load?: string; external?: boolean; }
interface SidecarNode {
  id: string;
  kind: string;
  owner: string;              // "sg" (vendored) | "local" (harness overlay)
  title: string;
  description?: string;
  goals: { outcome?: string; metric?: string }[];
  edges_out: SidecarEdge[];
  edges_in: SidecarEdge[];
  file: string | null;
  document_html: string;
  directory: { name: string; role: string }[];
  health: { last_updated: { state: Health; iso: string | null }; last_used: { state: Health; note: string } };
}

/** Read the node's directory listing (with roles) + render its canonical document body —
 *  the artefact shown in the graph pop-out (directory summary + the skill/agent doc). */
function readNodeDocument(id: string): { html: string; directory: { name: string; role: string }[] } {
  const dir = path.join(graphRoot, id);
  const out = { html: "", directory: [] as { name: string; role: string }[] };
  if (!existsSync(dir)) return out;
  const roleFor = (name: string): string => {
    if (name === `${id}.md`) return "canonical node — the skill / agent";
    if (name === "research-report.md") return "source synthesis";
    if (name === "source-material") return "raw source material (local)";
    return "";
  };
  for (const name of readdirSync(dir).sort()) out.directory.push({ name, role: roleFor(name) });
  const nodePath = path.join(dir, `${id}.md`);
  if (existsSync(nodePath)) {
    const raw = readFileSync(nodePath, "utf8");
    const m = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    const body = m ? m[1] : raw;
    try { out.html = renderMarkdown(body, { page: { path: id, fm: {} as Record<string, unknown>, raw: body } }).html; }
    catch { out.html = ""; }
  }
  return out;
}

function buildSidecar(rec: GraphRecord, lastUpdated: Map<string, string | null>): {
  data: Record<string, SidecarNode>;
  badges: Map<string, NodeBadges>;
} {
  const data: Record<string, SidecarNode> = {};
  const badges = new Map<string, NodeBadges>();

  // Pre-bucket edges by endpoint.
  const out = new Map<string, SidecarEdge[]>();
  const inn = new Map<string, SidecarEdge[]>();
  for (const e of rec.edges) {
    const entryOut: SidecarEdge = { id: e.to, type: e.type, stage: e.stage, load: e.load, external: e.external };
    const entryIn: SidecarEdge = { id: e.from, type: e.type, stage: e.stage, load: e.load, external: e.external };
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(entryOut);
    if (!inn.has(e.to)) inn.set(e.to, []);
    inn.get(e.to)!.push(entryIn);
  }

  for (const id of Object.keys(rec.nodes)) {
    const n = rec.nodes[id];
    const kind = n.primitive || "node";
    const owner = n.owner === "local" ? "local" : "sg";
    // sg (vendored) nodes read their on-disk .md for rich detail; local-overlay
    // nodes carry their metadata inline in the manifest (no .md file), so they use
    // it directly and degrade the git/doc fields (input-gated until authored on disk).
    const isLocal = owner === "local";
    const meta = isLocal ? { description: n.description, goals: [] } : readNodeMeta(id);
    const doc = isLocal ? { html: "", directory: [] } : readNodeDocument(id);
    const iso = isLocal ? null : (lastUpdated.get(id) ?? null);
    const updatedState = recencyLight(iso);
    const usedState: Health = "unknown"; // degraded — no projection snapshot exists yet
    badges.set(id, { lastUpdated: updatedState, lastUsed: usedState });
    data[id] = {
      id,
      kind,
      owner,
      title: n.title || id,
      description: meta.description,
      goals: meta.goals,
      edges_out: (out.get(id) || []),
      edges_in: (inn.get(id) || []),
      file: isLocal ? null : nodeFileRel(id),
      document_html: doc.html,
      directory: doc.directory,
      health: {
        last_updated: { state: updatedState, iso },
        last_used: { state: usedState, note: "no projection snapshot yet — degraded" },
      },
    };
  }
  return { data, badges };
}

// ─── Page assembly ───────────────────────────────────────────────────────────

/** The legend + the snapshot-degraded banner + the figure + sidebar + sidecar. */
function buildBodyHtml(svg: string, sidecar: Record<string, SidecarNode>): string {
  const legendKinds = (["skill", "agent", "script"] as const)
    .map((k) => `<span class="lg-item"><span class="lg-swatch lg-${k}" style="border-color:${KIND_STYLE[k].stroke}"></span>${k}</span>`)
    .join("");
  // Only the edge types actually drawn between nodes.
  const drawnTypes = new Set<string>();
  for (const n of Object.values(sidecar)) {
    for (const e of n.edges_out) if (sidecar[e.id]) drawnTypes.add(e.type);
  }
  const legendEdges = [...drawnTypes].sort().map((t) => {
    const st = edgeStyle(t);
    return `<span class="lg-item"><span class="lg-line" style="--lg-line-color:${st.color}"></span>${escAttr(st.label)}</span>`;
  }).join("");

  const banner =
    `<div class="snapshot-banner" role="note">` +
    `<strong>Projection snapshot unavailable.</strong> ` +
    `Structure and <em>last-updated</em> (git) render in full; ` +
    `<em>last-used</em> shows as <span class="health-key health-unknown"></span>unknown until a ` +
    `<code>portal-projection.json</code> snapshot is published.` +
    `</div>`;

  // Owner row — shown only when the composed graph carries a harness-local overlay,
  // so a vendored-only graph stays uncluttered. Solid = vendored (sg); dashed = local.
  const hasLocal = Object.values(sidecar).some((n) => n.owner === "local");
  const ownerRow = hasLocal
    ? `<div class="lg-row"><span class="lg-title">Owner</span>` +
        `<span class="lg-item"><span class="lg-swatch" style="border-color:#7c8893"></span>vendored (stack-graph)</span>` +
        `<span class="lg-item"><span class="lg-swatch" style="border-color:#7c8893;border-style:dashed"></span>harness-local</span>` +
      `</div>`
    : "";

  const legend =
    `<div class="graph-legend" aria-label="Graph legend">` +
      `<div class="lg-row"><span class="lg-title">Nodes</span>${legendKinds}</div>` +
      ownerRow +
      `<div class="lg-row"><span class="lg-title">Edges</span>${legendEdges}</div>` +
      `<div class="lg-row"><span class="lg-title">Health</span>` +
        `<span class="lg-item"><span class="health-key health-green"></span>fresh</span>` +
        `<span class="lg-item"><span class="health-key health-amber"></span>aging</span>` +
        `<span class="lg-item"><span class="health-key health-red"></span>stale</span>` +
        `<span class="lg-item"><span class="health-key health-unknown"></span>unknown</span>` +
      `</div>` +
    `</div>`;

  const figure =
    `<figure class="requires-graph" data-density-tier="dense">` +
      `<figcaption class="requires-graph-header">` +
        `<span class="requires-graph-eyebrow">Whole graph</span>` +
        `<span class="requires-graph-tier-chip" data-tier="dense">${Object.keys(sidecar).length} nodes</span>` +
      `</figcaption>` +
      `<div class="requires-graph-stage">${svg}</div>` +
    `</figure>`;

  const sidebar =
    `<aside id="graph-sidebar" hidden aria-label="Node detail">` +
      `<button type="button" id="graph-sidebar-close" class="gs-close" aria-label="Close detail">×</button>` +
      `<div id="graph-sidebar-body"></div>` +
    `</aside>`;

  const sidecarScript =
    `<script type="application/json" id="graph-data">` +
    // Escape </script> defensively.
    JSON.stringify(sidecar).replace(/<\//g, "<\\/") +
    `</script>`;

  return [
    `<p class="lede graph-intro">The whole graph — every node (skill / agent / script) and the typed edges between them, ` +
      `the vendored stack-graph graph composed with this harness's local overlay (solid = vendored, dashed = harness-local). ` +
      `Hover a node to highlight its lineage; click a node to open its detail.</p>`,
    banner,
    legend,
    figure,
    sidebar,
    sidecarScript,
  ].join("\n");
}

// ─── extraHead: surface-local CSS (sidebar + badges + legend) ────────────────

function extraHeadCss(): string {
  return `<style>
/* Graph-browser surface styles (A3b-3). Surface-local — never edits vendored style.css. */
:root {
  --health-green: #2e9e5b; --health-amber: #d9a514; --health-red: #d64545; --health-unknown: #9b9b96;
  --trace: #167d90;   /* lit-trace accent (teal) — replaces the alarm-red highlight */
}
html.dark { --health-green: #46c279; --health-amber: #e7bb45; --health-red: #e76d6d; --health-unknown: #8b8b86;
  --trace: #5ec8db; }

.graph-intro { margin-bottom: 0.8em; }

.snapshot-banner {
  border: 1px solid color-mix(in srgb, var(--health-amber) 45%, var(--hair));
  background: color-mix(in srgb, var(--health-amber) 9%, transparent);
  border-radius: 3px; padding: 0.55em 0.8em; margin: 0 0 1em;
  font-size: 0.82rem; color: var(--fg-soft);
}
.snapshot-banner code { font-size: 0.92em; }

.graph-legend {
  display: flex; flex-direction: column; gap: 0.35em;
  border: 1px solid var(--hair); border-radius: 3px;
  padding: 0.55em 0.8em; margin: 0 0 1em; font-size: 0.8rem;
}
.graph-legend .lg-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5em 1.1em; }
.graph-legend .lg-title {
  font-family: var(--display); font-size: 0.62rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.12em; color: var(--mute);
  min-width: 3.6em;
}
.graph-legend .lg-item { display: inline-flex; align-items: center; gap: 0.4em; color: var(--fg-soft); }
/* nodes are outline-only now — the legend chip is a transparent box ringed in the
   type's stroke colour (border-color set inline from KIND_STYLE so they always match). */
.lg-swatch { width: 16px; height: 11px; border-radius: 3px; background: transparent; border: 1.5px solid var(--mute); display: inline-block; }
.lg-line { width: 20px; height: 0; border-top: 2px solid var(--lg-line-color, var(--edge-stroke)); display: inline-block; }
/* legend status-lights mirror the in-graph LEDs: a bright dot inside a soft glow ring */
.health-key { width: 9px; height: 9px; border-radius: 999px; display: inline-block; position: relative; }
.health-key::after { content: ""; position: absolute; inset: -3px; border-radius: 999px; background: currentColor; opacity: 0.22; }
.health-green { background: var(--health-green); color: var(--health-green); }
.health-amber { background: var(--health-amber); color: var(--health-amber); }
.health-red { background: var(--health-red); color: var(--health-red); }
.health-unknown { background: var(--health-unknown); color: var(--health-unknown); }

/* Per-node status chip (top-right): an opaque pill holding two LED dots
   (last-updated · last-used), coloured per data-state in CSS (theme-aware). */
.requires-graph svg .node-health { pointer-events: none; }
.requires-graph svg .health-chip { fill: var(--bg); stroke: var(--hair); stroke-width: 0.5; }
.requires-graph svg .health-dot { stroke: color-mix(in srgb, var(--bg) 60%, transparent); stroke-width: 0.5; }
.requires-graph svg .health-dot[data-state="green"]   { fill: var(--health-green); }
.requires-graph svg .health-dot[data-state="amber"]   { fill: var(--health-amber); }
.requires-graph svg .health-dot[data-state="red"]     { fill: var(--health-red); }
.requires-graph svg .health-dot[data-state="unknown"] { fill: var(--health-unknown); }

/* outline-only nodes: text adapts to the theme; the whole box stays clickable despite no fill */
.requires-graph svg .node text { fill: var(--fg); }
.requires-graph svg .node path, .requires-graph svg .node polygon { pointer-events: all; }
.requires-graph svg .node[data-node-id] { cursor: pointer; }

/* ── Lineage highlight (overrides the vendored brand-red rules) ──
   Light up the LINE traces in the accent — never fill the area under an edge
   curve — and dim everything else. Pins to the selected node (see graph-browser.js). */
.requires-graph.is-highlighting svg .node:not(.path-active) path,
.requires-graph.is-highlighting svg .node:not(.path-active) text,
.requires-graph.is-highlighting svg .node:not(.path-active) .node-health { opacity: 0.15; }
.requires-graph.is-highlighting svg .edge:not(.path-active) path,
.requires-graph.is-highlighting svg .edge:not(.path-active) polygon { opacity: 0.1; }
.requires-graph.is-highlighting svg .node.path-active path {
  stroke: var(--trace); stroke-width: 2;
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--trace) 55%, transparent));
}
.requires-graph.is-highlighting svg .edge.path-active path {
  stroke: var(--trace); fill: none; stroke-width: 1.8;
  filter: drop-shadow(0 0 2px color-mix(in srgb, var(--trace) 45%, transparent));
}
.requires-graph.is-highlighting svg .edge.path-active polygon { fill: var(--trace); stroke: var(--trace); }

/* Selected node: a strong, persistent outline (the trace stays pinned to it). */
.requires-graph svg .node.is-selected path {
  stroke: var(--trace); stroke-width: 2.6;
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--trace) 60%, transparent));
}

/* full-bleed graph: breathing room + a canvas that uses the viewport */
.layout-full-bleed .content { padding: 1.1rem 1.4rem 1.6rem; }
.requires-graph { margin: 0; }
.requires-graph-stage { height: calc(100vh - 240px); min-height: 460px; }
.graph-unavailable { padding: 1.5em; border: 1px dashed var(--hair); border-radius: 6px; color: var(--fg-soft); background: var(--code-bg); font-size: .9rem; }
.requires-graph svg .node[data-node-id]:hover path,
.requires-graph svg .node[data-node-id]:hover polygon { stroke-width: 2.2; }

/* detail sidebar */
#graph-sidebar {
  position: fixed; top: 0; right: 0; height: 100vh; width: min(680px, 52vw);
  background: var(--bg); border-left: 1px solid var(--hair);
  box-shadow: -8px 0 28px rgba(0,0,0,0.16);
  z-index: 50; overflow-y: auto; padding: 1.4em 1.3em 2em;
  font-size: 0.9rem;
}
#graph-sidebar[hidden] { display: none; }
.gs-close {
  position: absolute; top: 0.7em; right: 0.8em;
  background: none; border: 1px solid var(--hair); border-radius: 4px;
  width: 30px; height: 30px; font-size: 1.2rem; line-height: 1; cursor: pointer;
  color: var(--fg);
}
.gs-close:hover { border-color: var(--brand-gold); }
#graph-sidebar .gs-id { font-family: var(--display); font-size: 1.15rem; font-weight: 700; margin: 0 2em 0.15em 0; color: var(--fg); }
#graph-sidebar .gs-kind {
  display: inline-block; font-size: 0.66rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; padding: 0.12em 0.5em; border-radius: 999px;
  border: 1px solid var(--hair); color: var(--mute); margin-bottom: 0.7em;
}
#graph-sidebar .gs-section-title {
  font-family: var(--display); font-size: 0.64rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.12em; color: var(--mute);
  margin: 1.1em 0 0.4em;
}
#graph-sidebar p { margin: 0.3em 0; color: var(--fg-soft); }
#graph-sidebar .gs-goal { margin: 0.35em 0; padding-left: 0.7em; border-left: 2px solid var(--brand-gold); }
#graph-sidebar .gs-goal .gs-metric { color: var(--mute); font-size: 0.84em; }
#graph-sidebar .gs-edges { list-style: none; margin: 0.2em 0; padding: 0; }
#graph-sidebar .gs-edges li { margin: 0.2em 0; display: flex; gap: 0.5em; align-items: baseline; }
#graph-sidebar .gs-edge-type {
  font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  padding: 0.08em 0.42em; border-radius: 3px; white-space: nowrap;
  background: color-mix(in srgb, var(--edge-c, #8a8884) 16%, transparent);
  color: color-mix(in srgb, var(--edge-c, #8a8884) 72%, var(--fg));
  border: 1px solid color-mix(in srgb, var(--edge-c, #8a8884) 40%, transparent);
}
#graph-sidebar .gs-edge-target { color: var(--fg); }
#graph-sidebar .gs-edge-target.is-external { color: var(--mute); font-style: italic; }
#graph-sidebar .gs-edge-meta { color: var(--mute); font-size: 0.78em; }
#graph-sidebar .gs-health { display: flex; gap: 1.2em; margin: 0.4em 0; }
#graph-sidebar .gs-health .gs-h { display: flex; align-items: center; gap: 0.4em; font-size: 0.84rem; color: var(--fg-soft); }
#graph-sidebar .gs-file { font-size: 0.84rem; }
#graph-sidebar .gs-file code { word-break: break-all; }
#graph-sidebar .gs-empty { color: var(--mute); font-style: italic; }
#graph-sidebar .gs-dir { list-style: none; margin: .2em 0 0; padding: 0; }
#graph-sidebar .gs-dir li { font-size: .82rem; margin: .25em 0; }
#graph-sidebar .gs-dir code { font-family: var(--mono); font-size: .78rem; color: var(--fg); }
#graph-sidebar .gs-dir .gs-role { color: var(--mute); }
#graph-sidebar .gs-doc { margin-top: .5em; border-top: 1px solid var(--hair); padding-top: 1em; font-size: .88rem; line-height: 1.55; }
#graph-sidebar .gs-doc h1, #graph-sidebar .gs-doc h2, #graph-sidebar .gs-doc h3 { font-family: var(--display); line-height: 1.25; margin: 1em 0 .4em; color: var(--fg); }
#graph-sidebar .gs-doc h1 { font-size: 1.15rem; } #graph-sidebar .gs-doc h2 { font-size: 1rem; } #graph-sidebar .gs-doc h3 { font-size: .9rem; }
#graph-sidebar .gs-doc p, #graph-sidebar .gs-doc li { color: var(--fg-soft); }
#graph-sidebar .gs-doc pre { background: var(--code-bg); border: 1px solid var(--hair); border-radius: 4px; padding: .6em .7em; overflow-x: auto; font-size: .8rem; }
#graph-sidebar .gs-doc code { font-family: var(--mono); }
#graph-sidebar .gs-doc table { width: 100%; border-collapse: collapse; font-size: .82rem; }
#graph-sidebar .gs-doc th, #graph-sidebar .gs-doc td { border: 1px solid var(--hair); padding: .3em .5em; text-align: left; }
</style>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (!existsSync(recordPath)) throw new Error(`graph record not found at ${recordPath}`);
const rec = JSON.parse(readFileSync(recordPath, "utf8")) as GraphRecord;

// Compose the vendored (sg) record with the optional harness-local overlay so the
// surface renders the WHOLE graph, owner-tagged. local=0 when no overlay is bound.
const ownerCounts = composeOwners(rec, resolveLocalGraph());
const nodeIds = Object.keys(rec.nodes);
if (nodeIds.length === 0) throw new Error(`no nodes in ${recordPath}`);

log(`graph browser — ${nodeIds.length} nodes (${ownerCounts.sg} sg + ${ownerCounts.local} local) / ${rec.edges.length} edges → ${surfaceDir}`);

// Health: last-updated from git (per node file). last-used is degraded (no snapshot).
const lastUpdated = new Map<string, string | null>();
let gitOk = 0;
for (const id of nodeIds) {
  const iso = lastUpdatedISO(nodeFileRel(id));
  if (iso) gitOk++;
  lastUpdated.set(id, iso);
}
log(`  last-updated: ${gitOk}/${nodeIds.length} resolved from git; last-used: degraded (no projection snapshot)`);

// Build sidecar (also yields per-node badge states).
const { data: sidecar, badges } = buildSidecar(rec, lastUpdated);

// DOT → SVG → post-process. Degrades to a notice when Graphviz is absent.
const { dot } = buildDot(rec);
const rawSvg = runGraphviz(dot);
let svg: string;
let nodeIdCount = 0;
if (rawSvg === null) {
  svg = `<div class="graph-unavailable">The whole-graph view requires <strong>Graphviz</strong> (the <code>dot</code> binary) at build time. Install graphviz and rebuild to render the graph; the legend and per-node detail below still describe the model.</div>`;
} else {
  ({ svg, nodeIdCount } = postProcessSvg(rawSvg, badges));
  if (nodeIdCount !== nodeIds.length) {
    warn(`data-node-id count (${nodeIdCount}) != node count (${nodeIds.length}) — investigate.`);
  }
}

// Clean ONLY the graph surface dir (never the whole dist/).
if (existsSync(surfaceDir)) rmSync(surfaceDir, { recursive: true, force: true });
ensureDir(surfaceDir);

// Assets (surface-local copy): vendored renderer-core assets + brand + favicon.
for (const basename of assetBasenames) {
  const src = path.join(vendorAssetsDir, basename);
  if (existsSync(src)) copyFileSync(src, path.join(surfaceDir, basename));
  else warn(`asset missing: ${src}`);
}
for (const brandAsset of ["brand-overrides.css", "favicon.svg"]) {
  const src = path.join(brandDir, brandAsset);
  if (existsSync(src)) copyFileSync(src, path.join(surfaceDir, brandAsset));
}
// The forked graph viewer (this surface's interactivity).
const browserSrc = path.join(localAssetsDir, "graph-browser.js");
if (!existsSync(browserSrc)) {
  throw new Error(`graph-browser.js not found at ${browserSrc} — fork it from vendor/.../graph-viewer.js`);
}
copyFileSync(browserSrc, path.join(surfaceDir, "graph-browser.js"));
// Content-hash cache-bust so a normal refresh always serves the current script
// (the browser was caching a stale graph-browser.js across rebuilds).
const browserHash = createHash("sha1").update(readFileSync(browserSrc, "utf8")).digest("hex").slice(0, 8);

// Single-page nav.
const nav: NavGroup[] = [{ group: "Workspace", pages: [""] }];

const page: CorePage = {
  path: "",
  fm: { title: "Graph browser", description: "The whole graph — vendored + harness-local nodes, typed edges, and per-node health." },
  raw: "",
  kind: "docs",
};

const bodyHtml = buildBodyHtml(svg, sidecar);

const html = renderSurfacePage({
  slug: "",
  page,
  nav,
  bodyHtml,
  showToc: false,
  layoutVariant: "full-bleed",
  mountDepth: graphMountDepth,   // 1 for /graph/, 2 for /graph/stack-graph/
  pageLabel: () => "Graph browser",
  extraHead: () => extraHeadCss(),
  bodyScripts: () => `<script src="graph-browser.js?v=${browserHash}" defer></script>`,
});

writeHtml(path.join(surfaceDir, "index.html"), html);

log(`\ngraph browser: built index.html (${nodeIdCount} node groups tagged, ${Object.keys(sidecar).length} sidecar entries).`);
