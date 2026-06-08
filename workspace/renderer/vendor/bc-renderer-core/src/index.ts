
// ── Types ────────────────────────────────────────────────────────────────────

export type {
  CoreFrontmatter,
  CorePage,
  TocEntry,
  NavGroup,
  HostContext,
  TokenMatch,
  TokenResolver,
} from "./types.js";

// ── Frontmatter ──────────────────────────────────────────────────────────────

export { parseFrontmatter } from "./frontmatter.js";

// ── Markdown pipeline ────────────────────────────────────────────────────────

export {
  renderMarkdown,
  preprocess,
  extractToc,
} from "./markdown.js";

export type {
  RenderMarkdownOptions,
  RenderMarkdownResult,
} from "./markdown.js";

// ── Attribute / escape helpers ───────────────────────────────────────────────

export { parseAttrs, escapeHtml, escapeAttr } from "./attrs.js";

// ── Nav ──────────────────────────────────────────────────────────────────────

export { renderSidebar, prettify } from "./nav.js";
export type { RenderSidebarOptions } from "./nav.js";

// ── Shell ────────────────────────────────────────────────────────────────────

export { renderShell } from "./shell.js";
export type { ShellArgs } from "./shell.js";

// ── Built-in callouts ────────────────────────────────────────────────────────

export { applyBuiltinCallouts } from "./builtins.js";

// ── Asset list ───────────────────────────────────────────────────────────────

/**
 * Asset basenames the package ships. Consumers iterate and copy these
 * from node_modules/@be-civic/bc-renderer-core/assets/ (or the vendored
 * tree) into their dist/.
 */
export const assetBasenames: readonly string[] = [
  "style.css",
  "tags.css",
  "tags.js",
  "theme.js",
  "graph-viewer.js",
  "figure-classes.js",
];

/**
 * Figure classes that graph-viewer.js attaches to. The script iterates
 * this list at startup; adding a new figure class is a one-line PR
 * here. Both consumers' figures must carry the data-density-tier +
 * data-edges attribute contract — see graph-viewer.js for the full
 * markup spec.
 *
 * Mirrored in assets/figure-classes.js so the browser script can
 * import it at runtime; both copies must stay in sync. The bc-renderer-core
 * unit tests assert parity.
 */
export const FIGURE_CLASSES: readonly string[] = [
  "requires-graph",
  "domain-diagram",
];
