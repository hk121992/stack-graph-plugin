// Asset + page href strategy for the BC Handbook.
//
// The handbook is served at both <handbook>.pages.dev/* (root) and
// workspace.becivic.be/handbook/* (proxied). Relative hrefs make both
// origins work without rewriting at the proxy layer.
//
// Each page emits to `dist/<slug>/index.html`. The site root (empty
// slug) emits to `dist/index.html`. Assets live at `dist/<basename>`.
// So from `dist/v1-specs/architecture/index.html`, the asset prefix is
// `../../`. From `dist/index.html` it's `./`.

/**
 * Compute relative asset path prefix for a given URL slug.
 *
 * For a page at dist/<slug>/index.html, this returns the relative
 * traversal back to dist/. Empty slug = site root = "./".
 */
export function assetPrefix(slug: string): string {
  if (!slug) return "./";
  const depth = slug.split("/").length;
  return "../".repeat(depth);
}

/**
 * Build the `assetUrl(basename)` function the shared shell uses,
 * closed over a specific page slug.
 */
export function makeAssetUrl(slug: string): (basename: string) => string {
  const pfx = assetPrefix(slug);
  return (basename: string) => `${pfx}${basename.replace(/^\//, "")}`;
}

/**
 * Build the `pageHref(targetSlug)` function the shared sidebar uses,
 * closed over the current page slug. Returns relative hrefs so the
 * same built site works at any mount path.
 *
 * Empty target slug = site root. Other slugs get a trailing slash so
 * they resolve to `<slug>/index.html`.
 */
export function makePageHref(slug: string): (targetSlug: string) => string {
  const pfx = assetPrefix(slug);
  return (targetSlug: string) => {
    const normT = targetSlug.replace(/^\//, "");
    return normT === "" ? pfx : `${pfx}${normT}/`;
  };
}
