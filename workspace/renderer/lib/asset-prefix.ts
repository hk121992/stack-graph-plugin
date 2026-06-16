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

/**
 * Deploy-root prefix for the handful of references that MUST be root-absolute
 * (they point at assets that live only at the deploy root: /fonts/, /workspace.css,
 * favicons, /site.webmanifest, /pagefind/). Empty by default — single-tenant
 * deploys are unchanged. Under the shared path-routed workspace the driver sets
 * ASSET_PREFIX="/<project>" so these resolve under the project's mount.
 *
 * Normalised to: "" or "/seg" (leading slash, no trailing slash).
 */
export function rootPrefix(): string {
  const raw = (process.env["ASSET_PREFIX"] ?? "").trim();
  if (!raw || raw === "/") return "";
  const noTrail = raw.replace(/\/+$/, "");
  return noTrail.startsWith("/") ? noTrail : `/${noTrail}`;
}

/** Prefix a single root-absolute path (e.g. "/fonts/x.woff2") with rootPrefix(). */
export function rootAbs(p: string): string {
  return rootPrefix() + (p.startsWith("/") ? p : `/${p}`);
}

/**
 * Rewrite the root-absolute references inside an already-copied static asset
 * (style.css @font-face, site.webmanifest icons, search.js pagefind import) in
 * place. No-op when ASSET_PREFIX is empty. Idempotent: only rewrites the known
 * literal tokens, and only when the prefix is not already present.
 */
export function rewriteStaticAssetPrefix(filePath: string): void {
  const pfx = rootPrefix();
  if (!pfx) return;
  const fs = require("node:fs") as typeof import("node:fs");
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, "utf8");
  const tokens = ["/fonts/", "/icon-", "/pagefind/", "/favicon", "/apple-touch-icon", "/site.webmanifest"];
  for (const tok of tokens) {
    // Strip any already-present prefix first (idempotent), then re-apply once.
    s = s.split(`${pfx}${tok}`).join(tok).split(tok).join(`${pfx}${tok}`);
  }
  fs.writeFileSync(filePath, s, "utf8");
}
