// Render-time heading handling: strip authoring annotations from heading
// source, override anchor ids from authored {#tag}s, and inject computed
// §N display numbers into the rendered HTML.
//
// Why two passes instead of trusting marked-gfm-heading-id:
//   - The plugin slugs the FULL heading text and does NOT honour {#custom-id},
//     so `## X {#tag}` would render id `x-tag` with literal `{#tag}` visible.
//   - So we (1) strip `§N` and the trailing `{#id .class}` block from the
//     heading SOURCE before render (the plugin then slugs clean concept text),
//     and (2) post-process the HTML to set id = the authored tag (falling back
//     to the slugger id) and prepend the computed `§N` as a styled span.
//
// The manifest is read back from this post-processed result — the build emits
// the real ids, the lint consumes them. Nothing re-slugs.

import { parseHeadings, computeNumbering, type NumberedHeading } from "./headings.js";

const HEADING_LINE_RE = /^(#{1,6})\s+/;
const HTML_HEADING_RE = /<h([1-6])(\s+id="([^"]*)")?[^>]*>([\s\S]*?)<\/h\1>/g;

export interface PreparedHeadings {
  /** Body with `§N` and `{#id .class}` stripped from every heading line. */
  cleanBody: string;
  /** Numbered headings in document order (parallel to rendered headings). */
  numbered: NumberedHeading[];
}

/** A heading as it appears in the final rendered output. */
export interface ManifestHeading {
  id: string;
  level: number;
  /** Visible concept text (no number, no markdown). */
  text: string;
  /** Computed display number, e.g. "1.2"; absent when unnumbered. */
  secNum?: string;
}

/**
 * Rewrite heading source lines to clean concept text and compute their
 * display numbers. `fileNumbering: false` (from frontmatter) disables
 * numbering for the whole page.
 */
export function prepareHeadings(body: string, opts: { fileNumbering?: boolean } = {}): PreparedHeadings {
  const parsed = parseHeadings(body);
  const numbered = computeNumbering(parsed, { fileNumbering: opts.fileNumbering });

  const lines = body.split("\n");
  for (const h of parsed) {
    const orig = lines[h.line - 1];
    const m = HEADING_LINE_RE.exec(orig);
    if (!m) continue; // defensive; parseHeadings only returns heading lines
    lines[h.line - 1] = `${m[1]} ${h.text}`;
  }
  return { cleanBody: lines.join("\n"), numbered };
}

export interface AppliedHeadings {
  html: string;
  headings: ManifestHeading[];
  warnings: string[];
}

/**
 * Post-process rendered HTML: assign each heading its authored anchor id and
 * prepend the computed `§N`. Headings are matched to `numbered` by document
 * order (marked cannot reorder them). Returns the manifest headings for this
 * page.
 */
export function applyHeadingIdsAndNumbers(html: string, numbered: NumberedHeading[]): AppliedHeadings {
  const headings: ManifestHeading[] = [];
  const warnings: string[] = [];
  let idx = 0;

  const out = html.replace(HTML_HEADING_RE, (match, lvl, _idAttr, sluggerId, inner) => {
    const level = Number(lvl);
    const h = numbered[idx];
    if (!h || h.level !== level) {
      warnings.push(
        `heading alignment drift at rendered #${idx} (level ${level}); ` +
        `source expected ${h ? `level ${h.level} "${h.text}"` : "no more headings"}`,
      );
      return match; // leave untouched rather than mis-tag
    }
    idx++;
    const id = h.tag ?? sluggerId ?? "";
    const numPrefix = h.numbered && h.secNum ? `<span class="secnum">§${h.secNum}</span> ` : "";
    headings.push({ id, level, text: h.text, secNum: h.secNum });
    return `<h${lvl} id="${id}">${numPrefix}${inner}</h${lvl}>`;
  });

  if (idx !== numbered.length) {
    warnings.push(`heading count drift: ${idx} rendered vs ${numbered.length} parsed`);
  }
  return { html: out, headings, warnings };
}
