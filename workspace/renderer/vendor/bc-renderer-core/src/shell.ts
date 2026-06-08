
import type { CorePage, NavGroup, TocEntry } from "./types.js";
import { renderSidebar } from "./nav.js";
import { escapeHtml } from "./attrs.js";

// FOUC guard — applied at <html> before any paint. Toggles light/dark
// classes based on localStorage + prefers-color-scheme.
const FOUC = `<script>(function(){try{var t=localStorage.getItem("becivic_theme");var d=t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.classList.toggle("light",!d);}catch(e){}})();</script>`;

export interface ShellArgs {
  page: CorePage;
  nav: NavGroup[];
  bodyHtml: string;

  /** Asset URL builder. Receives the asset basename (e.g. "style.css");
   *  returns the URL/path emitted in the HTML. */
  assetUrl: (basename: string) => string;
  /** Page-id href builder. Used by both the sidebar and the home link.
   *  Receives a page-id (without leading slash); returns the URL. */
  pageHref: (pageId: string) => string;
  /** Optional sidebar label override. */
  pageLabel?: (pageId: string) => string;

  /** Site identity. */
  siteTitle: string;          // <title> suffix, e.g. "Be Civic Specs"
  siteDescription?: string;   // fallback when fm.description is empty

  /** Show ToC right column? Hosts pass a boolean per page (e.g. based on
   *  page.kind or page.toc.length). Defaults to "show when toc is non-empty". */
  showToc?: boolean;

  /** Suppress the default `<h1 class="page-title">` block. Use when the host
   *  emits its own header via preBodySlot or owns the title inside bodyHtml. */
  suppressHeader?: boolean;

  /** Page layout shape. docs = 3-col (nav · prose · toc); app = nav · fluid
   *  content, no toc; full-bleed = edge-to-edge canvas, no nav/toc chrome.
   *  Defaults to "docs". */
  layoutVariant?: "docs" | "app" | "full-bleed";

  /** Slots — each returns a string (possibly empty). All optional. */
  wordmark?: () => string;            // top-left brand
  topbarRight?: () => string;         // search form, nav-cta, theme toggle, etc.
  breadcrumb?: (page: CorePage) => string;
  preBodySlot?: (page: CorePage) => string;   // status badge, requires-graph
  postBodySlot?: (page: CorePage) => string;  // agent marker, references
  headExtras?: () => string;          // OG tags, canonical, manifest, etc.
  footer?: () => string;
  bodyScripts?: () => string;         // additional <script> tags after defaults
}

export function renderShell(args: ShellArgs): string {
  const {
    page, nav, bodyHtml,
    assetUrl, pageHref, pageLabel,
    siteTitle, siteDescription,
    showToc, suppressHeader, layoutVariant,
    wordmark, topbarRight, breadcrumb, preBodySlot, postBodySlot,
    headExtras, footer, bodyScripts,
  } = args;

  const fm = page.fm;
  const title = fm.title || siteTitle;
  const desc = (fm.description as string | undefined) || siteDescription || "";
  const noindex = fm.noindex === true;
  const robots = noindex
    ? '<meta name="robots" content="noindex,nofollow">'
    : '<meta name="robots" content="index,follow">';

  const showTocResolved = showToc ?? !!(page.toc && page.toc.length);
  const tocHtml = showTocResolved && page.toc && page.toc.length ? renderToc(page.toc) : "";

  const wordmarkHtml = wordmark ? wordmark() : defaultWordmark(pageHref, siteTitle);
  const topbarRightHtml = topbarRight ? topbarRight() : "";
  const breadcrumbHtml = breadcrumb ? breadcrumb(page) : "";
  const preBodyHtml = preBodySlot ? preBodySlot(page) : "";
  const postBodyHtml = postBodySlot ? postBodySlot(page) : "";
  const headExtrasHtml = headExtras ? headExtras() : "";
  const footerHtml = footer ? footer() : "";
  const bodyScriptsHtml = bodyScripts ? bodyScripts() : "";

  // currentPath for sidebar active-link: normalised to the page's path
  // (consumers strip/add leading slashes inside their hrefBuilder).
  const currentPath = page.path;

  const sidebarHtml = renderSidebar(nav, {
    hrefBuilder: pageHref,
    labelBuilder: pageLabel,
    currentPath,
  });

  // App surfaces (dashboard/canvas/analytics) use a horizontal top nav instead of
  // the left sidebar — a dashboard-style interface, not a docs sidebar.
  const isApp = layoutVariant === "app";
  const topNavHtml = isApp
    ? `<nav class="surface-topnav" aria-label="Sections">${renderTopNav(nav, pageHref, pageLabel, currentPath)}</nav>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(siteTitle)}</title>
${desc ? `<meta name="description" content="${escapeHtml(desc)}">` : ""}
${robots}
<link rel="stylesheet" href="${escapeHtml(assetUrl("style.css"))}">
<link rel="stylesheet" href="${escapeHtml(assetUrl("tags.css"))}">
${headExtrasHtml}
${FOUC}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-nav">
  ${wordmarkHtml}
  ${topbarRightHtml}
  <button class="nav-hamburger" type="button" aria-label="Open navigation" aria-expanded="false">☰</button>
</header>
<div class="layout layout-${layoutVariant ?? "docs"}">
  ${isApp ? "" : `<aside class="sidebar" id="sidebar">${sidebarHtml}</aside>`}
  <main id="main" class="main">
    ${topNavHtml}
    ${breadcrumbHtml}
    ${preBodyHtml}
    <article class="content">
      ${!suppressHeader && page.kind !== "index" ? `<h1 class="page-title">${escapeHtml(title)}</h1>` : ""}
      ${!suppressHeader && desc && page.kind !== "index" ? `<p class="lede">${escapeHtml(desc)}</p>` : ""}
      ${bodyHtml}
      ${postBodyHtml}
    </article>
    ${footerHtml ? `<footer class="site-footer">${footerHtml}</footer>` : ""}
  </main>
  ${isApp ? "" : tocHtml}
</div>
<div class="drawer-backdrop" hidden></div>
<script src="${escapeHtml(assetUrl("theme.js"))}" defer></script>
<script src="${escapeHtml(assetUrl("tags.js"))}" defer></script>
${bodyScriptsHtml}
</body>
</html>`;
}

function defaultWordmark(pageHref: (pageId: string) => string, siteTitle: string): string {
  const home = pageHref("");
  return `<a class="wordmark" href="${escapeHtml(home)}" aria-label="${escapeHtml(siteTitle)} — home"><span class="wordmark-text">${escapeHtml(siteTitle)}</span></a>`;
}

function renderToc(items: TocEntry[]): string {
  const li = items
    .filter((t) => t.level === 2)
    .map((t) => `<li><a href="#${escapeHtml(t.id)}">${escapeHtml(t.text)}</a></li>`)
    .join("");
  return li ? `<aside class="toc"><h2 class="toc-label">On this page</h2><ol>${li}</ol></aside>` : "";
}

/** Flat horizontal nav for app-layout surfaces — the nav's leaf pages as top tabs. */
function renderTopNav(
  nav: NavGroup[],
  pageHref: (pageId: string) => string,
  pageLabel: ((pageId: string) => string) | undefined,
  currentPath: string,
): string {
  const links: string[] = [];
  const walk = (pages: NavGroup["pages"]) => {
    for (const p of pages) {
      if (typeof p === "string") {
        const href = pageHref(p);
        const label = pageLabel ? pageLabel(p) : p;
        const active = p === currentPath ? ' class="active" aria-current="page"' : "";
        links.push(`<a href="${escapeHtml(href)}"${active}>${escapeHtml(label)}</a>`);
      } else {
        walk(p.pages);
      }
    }
  };
  for (const g of nav) walk(g.pages);
  return links.join("");
}
