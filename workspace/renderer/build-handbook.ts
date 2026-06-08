// Handbook surface build (A3b-2).
//
// Renders stack-graph's handbook/content/ tree into the deployable surface at
// workspace/dist/handbook/. Adapts the be-civic handbook renderer:
//   - filesystem discovery (content.ts) — NN-section/README.md + NN-page.md
//   - {#id}-aware heading rendering (heading-render.ts), §N numbering OFF by
//     default (opt-in via frontmatter `numbering: true`)
//   - intra-handbook .md link rewriting (content.ts rewriteMdLinks)
//   - the branded shell (shell-host.ts renderSurfacePage)
//
// The surface is self-contained: assets ship at the surface root
// (dist/handbook/style.css …) and pages at dist/handbook/<slug>/index.html, so
// the relative asset-prefix works within the surface and the portal hub links
// across surfaces. Run: bun run workspace/renderer/build-handbook.ts

import {
  readFileSync, writeFileSync, mkdirSync, copyFileSync,
  existsSync, rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseFrontmatter, renderMarkdown, extractToc, assetBasenames,
  type CorePage,
} from "./vendor/bc-renderer-core/src/index.js";
import { discover, rewriteMdLinks } from "./lib/content.js";
import { prepareHeadings, applyHeadingIdsAndNumbers } from "./lib/heading-render.js";
import { renderSurfacePage } from "./shell-host.js";
import { brandRoot } from "./brand/brand.js";

const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rendererDir, "..", "..");

// Handbook content root. Default = the factory's own handbook/content (so the
// factory build is unchanged). A harness overrides it to render ITS handbook
// through the same renderer: `--handbook-root <dir>` or env HANDBOOK_ROOT, where
// <dir> is the `content/` directory (the dir holding NN-section/README.md). This
// is the surgical parameterization that lets one vendored renderer serve any
// harness's canon (mirrors DASHBOARD_ROOT/CANVAS_ROOT).
function resolveContentRoot(): string {
  const args = process.argv.slice(2);
  const i = args.indexOf("--handbook-root");
  if (i !== -1 && args[i + 1]) return path.resolve(args[i + 1]);
  if (process.env["HANDBOOK_ROOT"]) return path.resolve(process.env["HANDBOOK_ROOT"]);
  return path.join(repoRoot, "handbook", "content");
}
const contentRoot = resolveContentRoot();
const distRoot = path.join(rendererDir, "..", "dist");        // workspace/dist
const surfaceDir = path.join(distRoot, "handbook");           // workspace/dist/handbook
const vendorAssetsDir = path.join(rendererDir, "vendor", "bc-renderer-core", "assets");
const brandDir = brandRoot;   // BRAND_ROOT overlay, else the vendored brand/

function ensureDir(dir: string) { mkdirSync(dir, { recursive: true }); }
function writeHtml(filePath: string, html: string) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, html, "utf-8");
}
const log = (m: string) => process.stdout.write(m + "\n");
const warn = (m: string) => process.stderr.write("[warn] " + m + "\n");

if (!existsSync(contentRoot)) throw new Error(`handbook content not found at ${contentRoot}`);

const { nav, pages, slugForSourcePath, titleFor } = discover(contentRoot);
if (pages.length === 0) throw new Error(`no handbook pages discovered under ${contentRoot}`);

log(`handbook surface — ${pages.length} pages (${nav.length} sections) → ${surfaceDir}`);

// Clean + recreate the surface dir (stale pages from renamed sections must not linger).
if (existsSync(surfaceDir)) rmSync(surfaceDir, { recursive: true, force: true });
ensureDir(surfaceDir);

// Assets (surface-local copy): vendored renderer-core assets + brand overrides + favicon.
for (const basename of assetBasenames) {
  const src = path.join(vendorAssetsDir, basename);
  if (existsSync(src)) copyFileSync(src, path.join(surfaceDir, basename));
  else warn(`asset missing: ${src}`);
}
for (const brandAsset of ["brand-overrides.css", "favicon.svg"]) {
  const src = path.join(brandDir, brandAsset);
  if (existsSync(src)) copyFileSync(src, path.join(surfaceDir, brandAsset));
}
// Handbook search client (queries the Pagefind index at /pagefind/). The index
// itself is built by the harness build wiring; search.js degrades gracefully if
// absent. Copied to the surface root so the surface-relative assetUrl resolves.
{
  const src = path.join(rendererDir, "assets", "search.js");
  if (existsSync(src)) copyFileSync(src, path.join(surfaceDir, "search.js"));
}

const allWarnings: string[] = [];

function loadPage(slug: string, sourcePath: string): CorePage {
  const raw = readFileSync(sourcePath, "utf-8");
  const { fm, body } = parseFrontmatter(raw);
  if (!fm.title) {
    const h1 = /^#\s+(.+)$/m.exec(body);
    fm.title = h1 ? h1[1].trim()
      : ((slug.split("/").pop() || slug) || "Handbook")
          .replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // The shell renders the frontmatter title as the page <h1>; strip a leading
  // markdown H1 from the body so the title doesn't render twice (the Be Civic bug).
  const bodyNoH1 = body.replace(/^﻿?\s*#\s+.+(?:\r?\n|$)/, "");
  const rewritten = rewriteMdLinks(bodyNoH1, sourcePath, slug, slugForSourcePath,
    (msg) => allWarnings.push(`[${slug || "(root)"}] ${msg}`));
  return { path: slug, fm, raw: rewritten, kind: "docs" };
}

function renderOne(page: CorePage): string {
  // §N numbering is opt-in (stack-graph handbook does not use it); {#id}
  // overrides are always honoured via the heading-render layer.
  const { cleanBody, numbered } = prepareHeadings(page.raw, {
    fileNumbering: page.fm.numbering === true,
  });
  const result = renderMarkdown(cleanBody, { page });
  const applied = applyHeadingIdsAndNumbers(result.html, numbered);
  page.toc = extractToc(applied.html);
  for (const w of [...result.warnings, ...applied.warnings]) {
    warn(`[${page.path || "(root)"}] ${w}`);
    allWarnings.push(`[${page.path || "(root)"}] ${w}`);
  }
  return renderSurfacePage({
    slug: page.path,
    page,
    nav,
    bodyHtml: applied.html,
    pageLabel: (s) => titleFor.get(s) ?? s,
    searchSlot: true,
  });
}

let built = 0;
for (const { slug, sourcePath } of pages) {
  const page = loadPage(slug, sourcePath);
  const html = renderOne(page);
  const outPath = slug === ""
    ? path.join(surfaceDir, "index.html")
    : path.join(surfaceDir, slug, "index.html");
  writeHtml(outPath, html);
  log(`  [page] ${slug || "(root)"}`);
  built++;
}

// 404
const notFound: CorePage = {
  path: "404", fm: { title: "Page not found", noindex: true }, raw: "", toc: [], kind: "docs",
};
writeHtml(path.join(surfaceDir, "404.html"), renderSurfacePage({
  slug: "404", page: notFound, nav,
  bodyHtml: `<p>That page does not exist. <a href="./">Return to the handbook index.</a></p>`,
  pageLabel: (s) => titleFor.get(s) ?? s,
  searchSlot: true,
}));

log(`\nhandbook: built ${built} pages${allWarnings.length ? `, ${allWarnings.length} warning(s)` : ""}.`);
for (const w of allWarnings) warn(w);
