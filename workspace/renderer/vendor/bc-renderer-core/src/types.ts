
export interface CoreFrontmatter {
  title?: string;
  description?: string;
  status?: string;
  noindex?: boolean;
  [k: string]: unknown;
}

export interface TocEntry {
  level: number;
  id: string;
  text: string;
}

export interface CorePage {
  /** URL slug + lookup key. No extension, no leading slash. */
  path: string;
  fm: CoreFrontmatter;
  /** Markdown body with frontmatter already stripped. */
  raw: string;
  /** Filled in by renderMarkdown. */
  toc?: TocEntry[];
  /** Free-form. Hosts read it inside their slot functions; core never inspects it. */
  kind?: string;
}

/** Sidebar tree. Hosts precompute and pass in. */
export interface NavGroup {
  group: string;
  pages: Array<string | NavGroup>;
}

/** Carrier passed to every TokenResolver. */
export interface HostContext {
  page: CorePage;
  /** Host-provided arbitrary data. Cast inside the resolver. */
  data: unknown;
  /** Append a warning line; surfaced at build time. */
  warn: (msg: string) => void;
}

/**
 * A resolver handles one DSL tag. The match shape is what the core's
 * preprocess regex passes in:
 *   match[0] — the full source text of the tag
 *   match[1] — the attribute string (everything between the tag name
 *              and the closing `/>` or `>`), with leading/trailing
 *              whitespace preserved
 *   match[2] — for children-form tags, the inner content (undefined
 *              for self-closing tags)
 *
 * The resolver returns replacement markdown/HTML.
 */
export type TokenResolver = (match: TokenMatch, ctx: HostContext) => string;

export interface TokenMatch {
  source: string;
  attrs: string;
  children: string | undefined;
}
