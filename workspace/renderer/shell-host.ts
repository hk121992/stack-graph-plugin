// Shell host — stack-graph's branding + slot wiring around the vendored
// renderShell. Every portal surface (handbook, dashboard, graph) renders its
// page chrome through renderSurfacePage so branding stays in one place.

import { renderShell } from "./vendor/bc-renderer-core/src/index.js";
import type { ShellArgs, CorePage, NavGroup } from "./vendor/bc-renderer-core/src/index.js";
import { makeAssetUrl, makePageHref, assetPrefix } from "./lib/asset-prefix.js";
import { wordmarkSlot, brandHead, brand } from "./brand/brand.js";

// Site title/description follow the brand's hub copy so a harness's surfaces carry
// its name too (not just the hub). Default to the factory's own.
export const SITE_TITLE = brand.hub?.title ?? "stack-graph workspace";
export const SITE_DESCRIPTION =
  brand.hub?.lede ?? "The factory portal — handbook, product-dashboard, and the graph browser.";

export interface SurfacePageOptions {
  /** URL slug (no leading slash); "" = surface root. Drives relative asset/href prefixes. */
  slug: string;
  page: CorePage;
  nav: NavGroup[];
  bodyHtml: string;
  showToc?: boolean;
  suppressHeader?: boolean;
  /** Page layout shape: docs (default) | app | full-bleed. */
  layoutVariant?: "docs" | "app" | "full-bleed";
  /** Sidebar label override (e.g. slug → frontmatter title). */
  pageLabel?: (slug: string) => string;
  breadcrumb?: ShellArgs["breadcrumb"];
  preBodySlot?: ShellArgs["preBodySlot"];
  postBodySlot?: ShellArgs["postBodySlot"];
  /** Extra <script> tags after the shell defaults (e.g. graph-browser.js). */
  bodyScripts?: () => string;
  /** Extra <head> content appended after the brand head. */
  extraHead?: () => string;
  /** Render the handbook search box (Pagefind) into the topbar + wire search.js.
   *  Set by the handbook surface only (it is the indexed surface). */
  searchSlot?: boolean;
  /** How many directory levels the surface ROOT sits below the deploy root.
   *  Default 1 (e.g. /handbook/, /graph/). A surface mounted deeper — e.g. the
   *  graph at /graph/stack-graph/ when /graph/* is taken — sets 2 so the "to hub"
   *  links resolve to the deploy root, not a mid-level dir. */
  mountDepth?: number;
}

// The Pagefind search box — reuses the vendored .search / .search-results CSS.
// The index lives at /pagefind/ (built over the handbook glob); search.js queries it.
const SEARCH_FORM =
  `<form class="search" role="search" onsubmit="return false;">` +
  `<input type="search" placeholder="Search the handbook…" aria-label="Search the handbook" autocomplete="off" spellcheck="false"></form>`;
const SEARCH_RESULTS = `<div class="search-results" hidden role="listbox" aria-label="Search results"></div>`;

/** Render a portal page through the vendored shell with stack-graph branding. */
export function renderSurfacePage(opts: SurfacePageOptions): string {
  const assetUrl = makeAssetUrl(opts.slug);
  const pageHref = makePageHref(opts.slug);
  // The workspace hub is the deploy root, `mountDepth` levels above the surface
  // root (default 1). assetPrefix(slug) climbs out of the page's within-surface
  // depth; the repeated "../" then climbs the surface root to the deploy root.
  const hubHref = assetPrefix(opts.slug) + "../".repeat(opts.mountDepth ?? 1);
  return renderShell({
    page: opts.page,
    nav: opts.nav,
    bodyHtml: opts.bodyHtml,
    assetUrl,
    pageHref,
    siteTitle: SITE_TITLE,
    siteDescription: SITE_DESCRIPTION,
    showToc: opts.showToc,
    suppressHeader: opts.suppressHeader,
    layoutVariant: opts.layoutVariant,
    pageLabel: opts.pageLabel,
    breadcrumb: opts.breadcrumb,
    preBodySlot: opts.preBodySlot,
    wordmark: () => wordmarkSlot(hubHref),
    topbarRight: () =>
      (opts.searchSlot ? SEARCH_FORM : "") +
      `<span class="nav-right"><a class="nav-cta" href="${hubHref}">← workspace</a>` +
      `<button class="theme-toggle" type="button" aria-label="Toggle light/dark theme">◐</button></span>`,
    // Load order: vendored style.css (renderShell) → shared workspace.css (structure
    // + components, brand-neutral, root-absolute) → brand-overrides.css (brand tokens,
    // win last). The shared sheet is identical for every brand, so headers + drawers
    // never drift.
    headExtras: () =>
      `<link rel="stylesheet" href="/workspace.css">\n` +
      brandHead(assetUrl) +
      (opts.extraHead ? "\n" + opts.extraHead() : ""),
    footer: () =>
      `<span class="footer-brand">${SITE_TITLE} · read-only comprehension surface</span>`,
    postBodySlot: () =>
      (opts.postBodySlot ? opts.postBodySlot() : "") + (opts.searchSlot ? SEARCH_RESULTS : ""),
    bodyScripts: () =>
      (opts.bodyScripts ? opts.bodyScripts() : "") +
      (opts.searchSlot ? `\n<script src="${assetUrl("search.js")}" defer></script>` : ""),
  });
}
