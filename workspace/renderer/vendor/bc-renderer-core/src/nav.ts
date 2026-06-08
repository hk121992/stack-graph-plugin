
import type { NavGroup } from "./types.js";
import { escapeHtml } from "./attrs.js";

export interface RenderSidebarOptions {
  /** Builds the href emitted for each page-id. The host owns
   *  relative-vs-absolute path strategy. */
  hrefBuilder: (pageId: string) => string;
  /** Optional human label override per page-id. Defaults to prettified slug. */
  labelBuilder?: (pageId: string) => string;
  /** Current page path (used for aria-current). Match is normalised: leading
   *  slashes are stripped on both sides before comparison. */
  currentPath: string;
}

export function renderSidebar(nav: NavGroup[], opts: RenderSidebarOptions): string {
  return nav.map((g) => renderGroup(g, opts)).join("\n");
}

function renderGroup(g: NavGroup, opts: RenderSidebarOptions): string {
  const items = g.pages.map((p) => {
    if (typeof p === "string") return renderItem(p, opts);
    const subItems = p.pages
      .map((sp) => (typeof sp === "string" ? renderItem(sp, opts) : ""))
      .join("");
    return `<li class="nav-subgroup"><span class="nav-sub-label">${escapeHtml(p.group)}</span><ul>${subItems}</ul></li>`;
  }).join("");
  return `<div class="nav-group"><h3 class="nav-group-label">${escapeHtml(g.group)}</h3><ul>${items}</ul></div>`;
}

function renderItem(pageId: string, opts: RenderSidebarOptions): string {
  const normP = pageId.replace(/^\//, "");
  const normCur = opts.currentPath.replace(/^\//, "");
  const active = normCur === normP ? ' aria-current="page"' : "";
  const href = opts.hrefBuilder(pageId);
  const label = opts.labelBuilder ? opts.labelBuilder(pageId) : prettify(normP);
  return `<li><a href="${escapeHtml(href)}"${active}>${escapeHtml(label)}</a></li>`;
}

export function prettify(s: string): string {
  const slug = s.split("/").pop() ?? s;
  if (slug === "README") return "Overview";
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
