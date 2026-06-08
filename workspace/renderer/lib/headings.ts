// Handbook heading model — the shared contract for numbering, anchors, and
// cross-reference integrity.
//
// One source-of-truth parser used by three consumers:
//   - build.ts          (override heading ids from authored {#tag}; inject
//                         computed §N display numbers; emit the manifest)
//   - lint-fragments.ts (resolve every #fragment against real heading ids)
//   - migrate-refs.ts   (map old §N → heading identity during the migration)
//
// Design note (why we override ids post-render instead of trusting the
// slugger): marked-gfm-heading-id@4.x slugs the FULL heading text and does
// NOT honour `{#custom-id}`. Rather than reimplement github-slugger's
// stateful dedupe in the lint (a false-positive generator), the build assigns
// ids itself from authored `{#tag}` anchors and reads them back out of the
// rendered HTML to emit the manifest. The manifest — not a re-slug — is the
// single source of truth.

/** A heading parsed from markdown source, before rendering. */
export interface ParsedHeading {
  /** Heading level: 1–6 (markdown `#` count). */
  level: number;
  /** 1-based line number in the source body (post-frontmatter). */
  line: number;
  /** Visible concept text: leading `§N` and trailing `{#id .class}` removed. */
  text: string;
  /** Authored anchor id from a trailing `{#tag}`, if present. */
  tag?: string;
  /** Classes from a trailing `{.foo .bar}` (e.g. `unnumbered`). */
  classes: string[];
  /** The literal section number the heading currently carries, e.g. "7" or
   *  "7.1". Present only during the transition, before §N is stripped. */
  oldSecNum?: string;
}

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
// Leading section marker: "§7 " or "§7.1 " (one or more dotted integers).
const SECNUM_RE = /^§(\d+(?:\.\d+)*)\s+/;
// Trailing attribute block: {#id}, {.class}, {#id .class}, etc. Must be the
// last non-space content on the line.
const ATTR_BLOCK_RE = /\s*\{([^}]*)\}$/;

/** Parse a single heading's visible text into {text, tag, classes, oldSecNum}. */
export function parseHeadingText(raw: string): Omit<ParsedHeading, "level" | "line"> {
  let text = raw.trim();
  let tag: string | undefined;
  const classes: string[] = [];

  // Trailing attribute block first (it sits at the end, after the text).
  const attrMatch = ATTR_BLOCK_RE.exec(text);
  if (attrMatch) {
    const tokens = attrMatch[1].trim().split(/\s+/);
    for (const tok of tokens) {
      if (tok.startsWith("#")) tag = tok.slice(1);
      else if (tok.startsWith(".")) classes.push(tok.slice(1));
    }
    text = text.slice(0, attrMatch.index).trim();
  }

  // Leading section number.
  let oldSecNum: string | undefined;
  const numMatch = SECNUM_RE.exec(text);
  if (numMatch) {
    oldSecNum = numMatch[1];
    text = text.slice(numMatch[0].length).trim();
  }

  return { text, tag, classes, oldSecNum };
}

/** Parse all ATX headings from a markdown body, skipping fenced code blocks. */
export function parseHeadings(body: string): ParsedHeading[] {
  const out: ParsedHeading[] = [];
  const lines = body.split("\n");
  let inFence = false;
  let fenceMarker = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (line.trimStart().startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;
    const h = HEADING_RE.exec(line);
    if (!h) continue;
    const parsed = parseHeadingText(h[2]);
    out.push({ level: h[1].length, line: i + 1, ...parsed });
  }
  return out;
}

/** A heading with its computed display number resolved. */
export interface NumberedHeading extends ParsedHeading {
  /** Computed display number, e.g. "1", "1.2", "1.2.3". Undefined when the
   *  heading is opted out of numbering. */
  secNum?: string;
  /** Whether this heading participates in numbering. */
  numbered: boolean;
}

export interface NumberingOptions {
  /** Whole-file switch: frontmatter `numbering: false` disables numbering for
   *  every heading on the page. */
  fileNumbering?: boolean;
  /** Heading levels eligible for numbering. Default [2, 3, 4]. */
  levels?: number[];
  /** Predicate: returns true when a heading should be SKIPPED (opted out)
   *  despite being an eligible level. Used for the per-corpus stoplist that
   *  preserves today's unnumbered headings (Acronyms, Cross-references, …). */
  isOptedOut?: (h: ParsedHeading) => boolean;
}

/**
 * Assign hierarchical display numbers to headings. h2 increments the major
 * counter; h3 the minor under the current h2; etc. Opted-out headings
 * (class `unnumbered`, the stoplist predicate, or whole-file `numbering:false`)
 * are skipped WITHOUT consuming a counter slot, so `## Acronyms` between §6 and
 * §7 does not bump the count.
 */
export function computeNumbering(
  headings: ParsedHeading[],
  opts: NumberingOptions = {},
): NumberedHeading[] {
  const levels = new Set(opts.levels ?? [2, 3, 4]);
  const fileNumbering = opts.fileNumbering !== false;
  const counters: number[] = []; // index 0 = level 2, index 1 = level 3, …
  const minLevel = Math.min(...(opts.levels ?? [2, 3, 4]));

  return headings.map((h) => {
    const optedOut =
      !fileNumbering ||
      !levels.has(h.level) ||
      h.classes.includes("unnumbered") ||
      (opts.isOptedOut?.(h) ?? false);

    if (optedOut) {
      return { ...h, numbered: false };
    }

    const depth = h.level - minLevel; // 0 for the top numbered level
    counters.length = depth + 1;
    for (let d = 0; d <= depth; d++) {
      if (counters[d] === undefined) counters[d] = 0;
    }
    counters[depth] = (counters[depth] ?? 0) + 1;
    const secNum = counters.slice(0, depth + 1).join(".");
    return { ...h, numbered: true, secNum };
  });
}
