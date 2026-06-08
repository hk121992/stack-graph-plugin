// Portal hub (A3b-6) — the landing that unifies the four surfaces into one
// navigable space. A self-contained static card-hub (be-civic's portal pattern),
// branded via the swappable brand layer + the vendored style.css tokens. Emits
// workspace/dist/index.html and copies the shared root assets (so the absolute
// /fonts/ + /style.css references resolve at the deploy root).
// Run: bun run workspace/renderer/build-portal.ts

import { writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wordmarkSlot, brand, faviconHead, brandRoot } from "./brand/brand.js";
import { assetBasenames } from "./vendor/bc-renderer-core/src/index.js";

const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(rendererDir, "..", "dist");
const vendorAssetsDir = path.join(rendererDir, "vendor", "bc-renderer-core", "assets");
const brandDir = brandRoot;   // BRAND_ROOT overlay, else the vendored brand/

mkdirSync(distRoot, { recursive: true });

// Root-level shared assets (the hub's own + the site-root /fonts/ the surfaces' CSS references).
for (const a of assetBasenames) {
  const src = path.join(vendorAssetsDir, a);
  if (existsSync(src)) copyFileSync(src, path.join(distRoot, a));
}
if (existsSync(path.join(brandDir, "brand-overrides.css")))
  copyFileSync(path.join(brandDir, "brand-overrides.css"), path.join(distRoot, "brand-overrides.css"));
// The full favicon set → deploy root (head links use absolute paths).
const faviconDir = path.join(brandDir, "favicons");
if (existsSync(faviconDir)) {
  for (const f of readdirSync(faviconDir)) {
    if (f === "head-snippet.html") continue;
    copyFileSync(path.join(faviconDir, f), path.join(distRoot, f));
  }
}
// Shared client script for the detail pop-out drawer (dashboard IUs + canvas entries).
const popoutSrc = path.join(rendererDir, "assets", "popout.js");
if (existsSync(popoutSrc)) copyFileSync(popoutSrc, path.join(distRoot, "popout.js"));
// Canvas evidence-state filter (root asset, loaded by the canvas surface).
const cvFilterSrc = path.join(rendererDir, "assets", "canvas-filter.js");
if (existsSync(cvFilterSrc)) copyFileSync(cvFilterSrc, path.join(distRoot, "canvas-filter.js"));
// Shared workspace structure + components — root asset linked by the hub and every
// surface (brand-neutral; the no-drift seam). See assets/workspace.css.
const wsCssSrc = path.join(rendererDir, "assets", "workspace.css");
if (existsSync(wsCssSrc)) copyFileSync(wsCssSrc, path.join(distRoot, "workspace.css"));
// Fonts served at the deploy root /fonts/ (style.css @font-face uses absolute paths).
mkdirSync(path.join(distRoot, "fonts"), { recursive: true });
for (const f of ["manrope-700.woff2", "manrope-800.woff2", "geist-sans.woff2", "geist-mono.woff2"]) {
  const src = path.join(brandDir, "fonts", f);
  if (existsSync(src)) copyFileSync(src, path.join(distRoot, "fonts", f));
}

interface Card { title: string; href: string; blurb: string; }
const DEFAULT_CARDS: Card[] = [
  { title: "Handbook", href: "handbook/", blurb: "The canon — what stack-graph is and how it's built." },
  { title: "Product-dashboard", href: "dashboard/", blurb: "The work-ledger: vision, progress, and the record of what we built and why." },
  { title: "Business model", href: "canvas/", blurb: "The Business Model + Value Proposition canvas — the bets, by evidence state." },
  { title: "Graph browser", href: "graph/", blurb: "The whole graph of .claude primitives — nodes, edges, health." },
  { title: "Analytics", href: "analytics/", blurb: "Conformance, agent-experience, and trends (activates once the loop runs)." },
];

// Hub copy is brandable: a harness sets brand.config.json `hub` to re-title the
// space, replace the lede/footer, and override individual card blurbs (keyed by
// href). Unset fields fall back to the neutral factory defaults above.
const hub = brand.hub ?? {};
const HUB_TITLE = hub.title ?? "stack-graph workspace";
const HUB_LEDE = hub.lede ?? "The factory's read-only comprehension surface — the canon, the work-ledger, and the graph.";
const HUB_FOOTER = hub.footer ?? "stack-graph — the factory · read-only · act in Claude, comprehend here.";
const CARDS: Card[] = DEFAULT_CARDS.map((c) => {
  const o = hub.cards?.[c.href];
  return o ? { href: o.href ?? c.href, title: o.title ?? c.title, blurb: o.blurb ?? c.blurb } : c;
});

const FOUC = `<script>(function(){try{var t=localStorage.getItem("${brand.theme_key}");var d=t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.classList.toggle("light",!d);}catch(e){}})();</script>`;

const HUB_CSS = `
.portal-hub .hub { max-width: 960px; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
.portal-hub .hub > h1 { font-family: var(--display); font-size: 2rem; margin: 0 0 .35rem; }
.portal-hub .hub > .lede { color: var(--fg-soft); margin: 0 0 2.25rem; font-size: 1.05rem; }
.portal-hub .hub-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
.portal-hub .hub-card { display: block; border: 1px solid var(--hair); border-radius: 12px; padding: 1.25rem 1.25rem 1.4rem; text-decoration: none; color: inherit; background: var(--code-bg, transparent); transition: border-color .15s, transform .15s; }
.portal-hub .hub-card:hover { border-color: var(--brand-gold, #fae042); transform: translateY(-2px); }
.portal-hub .hub-card h2 { font-family: var(--display); font-size: 1.15rem; margin: 0 0 .4rem; }
.portal-hub .hub-card p { margin: 0; color: var(--fg-soft); font-size: .92rem; line-height: 1.45; }
.portal-hub .site-footer { max-width: 960px; margin: 0 auto; padding: 1rem 1.25rem 2rem; color: var(--mute); font-size: .82rem; }
`;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const cardsHtml = CARDS.map((c) =>
  `<a class="hub-card" href="${esc(c.href)}"><h2>${esc(c.title)}</h2><p>${esc(c.blurb)}</p></a>`,
).join("\n      ");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(HUB_TITLE)}</title>
<meta name="robots" content="noindex,nofollow">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="workspace.css">
<link rel="stylesheet" href="brand-overrides.css">
${faviconHead()}
<style>${HUB_CSS}</style>
${FOUC}
</head>
<body class="portal-hub">
<header class="site-nav">
  ${wordmarkSlot("./")}
  <span class="nav-right"><button class="theme-toggle" type="button" aria-label="Toggle light/dark theme">◐</button></span>
</header>
<main class="hub">
  <h1>${esc(HUB_TITLE)}</h1>
  <p class="lede">${esc(HUB_LEDE)}</p>
  <div class="hub-grid">
      ${cardsHtml}
  </div>
</main>
<footer class="site-footer">${esc(HUB_FOOTER)}</footer>
<script src="theme.js" defer></script>
</body>
</html>`;

writeFileSync(path.join(distRoot, "index.html"), html, "utf-8");

// Site-root 404 (served by the CF Worker's not_found_handling: "404-page").
const notFound = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not found · ${esc(HUB_TITLE)}</title>
<meta name="robots" content="noindex,nofollow">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="workspace.css">
<link rel="stylesheet" href="brand-overrides.css">
${faviconHead()}
<style>${HUB_CSS}</style>
${FOUC}
</head>
<body class="portal-hub">
<header class="site-nav">${wordmarkSlot("./")}</header>
<main class="hub">
  <h1>Not found</h1>
  <p class="lede">That page does not exist. <a href="./">Return to the workspace hub.</a></p>
</main>
</body>
</html>`;
writeFileSync(path.join(distRoot, "404.html"), notFound, "utf-8");

process.stdout.write(`portal hub → workspace/dist/index.html + 404.html (${CARDS.length} surface cards)\n`);
