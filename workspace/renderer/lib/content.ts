// Handbook content discovery — filesystem-driven.
//
// The handbook nav is derived entirely from the layout of `content/`:
//
//   content/<NN>-<section-slug>/        — one numbered section per folder
//       README.md                       — the section's index page
//       <NN>-<page-slug>.md             — ordered pages within the section
//
// Rules the walker enforces:
//   - Only folders with a two-digit NN- prefix at the top of content/
//     are sections. Anything else at content/ root is ignored.
//   - Within a section, files matching <NN>-<slug>.md are nav pages,
//     ordered by NN. README.md is always the section index (rendered
//     at the clean section URL, sorted first regardless of prefix).
//   - The NN- prefix is the sort key only. It is stripped from URL
//     slugs and from cross-page link references.
//   - Subfolders within a section that do NOT carry a NN- prefix
//     (e.g. `09-archive/amendment-proposals/`) are preserved on disk
//     but skipped by the nav walker.
//   - Section group title comes from the section README's frontmatter
//     `title:`. If absent, the folder slug is prettified.
//
// Output: page identifiers throughout are URL SLUGS:
//   ""                       — site root (first section's README)
//   "<section>"              — section index (any other section's README)
//   "<section>/<page>"       — leaf page
//
// Using URL slugs as the canonical identifier means the vendored core
// (which treats page IDs as opaque strings) sees clean values that map
// directly to dist/<slug>/index.html, and the host's pageHref builder
// works without an intermediate translation step.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

import { parseFrontmatter } from "../vendor/bc-renderer-core/src/index.js";
import type { NavGroup } from "../vendor/bc-renderer-core/src/index.js";

/** Matches a NN- prefix on a directory or file basename. */
const PREFIX_RE = /^(\d{2})-(.+)$/;

/** Strips the NN- prefix; returns the basename unchanged if no prefix. */
export function stripPrefix(basename: string): string {
  const m = PREFIX_RE.exec(basename);
  return m ? m[2] : basename;
}

/** Prettify a slug for display: "v1-specs" → "V1 Specs". */
function prettifySlug(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Reads a section README's frontmatter title; falls back to prettified slug. */
function readSectionTitle(sectionDir: string, cleanSlug: string): string {
  const readmePath = path.join(sectionDir, "README.md");
  if (existsSync(readmePath)) {
    const { fm } = parseFrontmatter(readFileSync(readmePath, "utf-8"));
    if (typeof fm.title === "string" && fm.title.trim()) {
      return fm.title.trim();
    }
  }
  return prettifySlug(cleanSlug);
}

export interface DiscoveredPage {
  /** URL slug. "" for site root, "<section>" for section index,
   *  "<section>/<page>" for a leaf page. */
  slug: string;
  /** Absolute path to the source .md file on disk. */
  sourcePath: string;
  /** Title (from frontmatter, falling back to a prettified slug). */
  title: string;
}

export interface DiscoveryResult {
  /** Nav tree in bc-renderer-core's shape. Page entries are URL slugs. */
  nav: NavGroup[];
  /** Ordered list of every discovered page. */
  pages: DiscoveredPage[];
  /** URL slug → absolute source path. */
  sourcePathFor: Map<string, string>;
  /** Absolute source path → URL slug. Reverse of sourcePathFor. */
  slugForSourcePath: Map<string, string>;
  /** URL slug → page title, for sidebar labelling. */
  titleFor: Map<string, string>;
}

/**
 * Walk content/ and produce the discovery result.
 *
 * The first NN-prefixed section's README is the site root (slug "").
 * By convention this is content/00-overview/README.md.
 */
function readPageTitle(sourcePath: string, fallbackSlug: string): string {
  const { fm } = parseFrontmatter(readFileSync(sourcePath, "utf-8"));
  if (typeof fm.title === "string" && fm.title.trim()) {
    return fm.title.trim();
  }
  const tail = fallbackSlug.split("/").pop() ?? fallbackSlug;
  return tail ? prettifySlug(tail) : "Overview";
}

export function discover(contentRoot: string): DiscoveryResult {
  const nav: NavGroup[] = [];
  const pages: DiscoveredPage[] = [];
  const sourcePathFor = new Map<string, string>();
  const slugForSourcePath = new Map<string, string>();
  const titleFor = new Map<string, string>();

  const sectionDirs = readdirSync(contentRoot)
    .filter((name) => {
      const full = path.join(contentRoot, name);
      return statSync(full).isDirectory() && PREFIX_RE.test(name);
    })
    .sort();

  let isFirstSection = true;

  for (const sectionDirName of sectionDirs) {
    const sectionSlug = stripPrefix(sectionDirName);
    const sectionDir = path.join(contentRoot, sectionDirName);
    const sectionTitle = readSectionTitle(sectionDir, sectionSlug);

    const groupPages: string[] = [];

    const readmePath = path.join(sectionDir, "README.md");
    if (existsSync(readmePath)) {
      const slug = isFirstSection ? "" : sectionSlug;
      const title = readPageTitle(readmePath, sectionSlug);
      groupPages.push(slug);
      pages.push({ slug, sourcePath: readmePath, title });
      sourcePathFor.set(slug, readmePath);
      slugForSourcePath.set(readmePath, slug);
      titleFor.set(slug, title);
    }

    const childMds = readdirSync(sectionDir)
      .filter((name) => name.endsWith(".md") && name !== "README.md")
      .sort();

    for (const childName of childMds) {
      if (!PREFIX_RE.test(childName)) continue;
      const cleanFilename = stripPrefix(childName).replace(/\.md$/, "");
      const slug = `${sectionSlug}/${cleanFilename}`;
      const sourcePath = path.join(sectionDir, childName);
      const title = readPageTitle(sourcePath, slug);
      groupPages.push(slug);
      pages.push({ slug, sourcePath, title });
      sourcePathFor.set(slug, sourcePath);
      slugForSourcePath.set(sourcePath, slug);
      titleFor.set(slug, title);
    }

    if (groupPages.length === 0) continue;
    nav.push({ group: sectionTitle, pages: groupPages });
    isFirstSection = false;
  }

  return { nav, pages, sourcePathFor, slugForSourcePath, titleFor };
}

/**
 * Resolve a path written as a clean (prefix-less) link against the
 * actual on-disk layout (which carries NN- prefixes). Walks the link
 * component-by-component from `fromDir`, and at each step:
 *   1. Tries the literal name.
 *   2. If absent, scans the current parent for a sibling whose name
 *      matches after stripping a NN- prefix.
 *
 * Returns the resolved absolute path if every component matched,
 * else null.
 */
export function resolveCleanPath(fromDir: string, relPath: string): string | null {
  const parts = path.normalize(relPath).split(path.sep);
  let cur = fromDir;
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      cur = path.dirname(cur);
      continue;
    }
    const literal = path.join(cur, part);
    if (existsSync(literal)) {
      cur = literal;
      continue;
    }
    // Sibling lookup: find an entry in `cur` whose stripped name matches.
    let matched: string | null = null;
    try {
      for (const entry of readdirSync(cur)) {
        if (stripPrefix(entry) === part) {
          matched = entry;
          break;
        }
      }
    } catch {
      return null;
    }
    if (!matched) return null;
    cur = path.join(cur, matched);
  }
  return cur;
}

/**
 * Rewrite intra-handbook .md links in a markdown body to point at the
 * rendered URL instead of the source file. Authors write
 * `[X](sprint-cycle.md)` and `[X](../internal-tooling/build-tools.md)`;
 * the rendered output gets `[X](../sprint-cycle/)` and
 * `[X](../../internal-tooling/build-tools/)`.
 *
 * Resolution is prefix-aware: link targets are written in clean form
 * (no NN- prefix), but resolved against the prefixed on-disk layout
 * by stripping prefixes during directory walk.
 *
 * Image links (![..](..)) and external links (http://, mailto:, etc.)
 * are untouched. Anchors (#section) are preserved.
 */
export function rewriteMdLinks(
  body: string,
  currentSourcePath: string,
  currentSlug: string,
  slugForSourcePath: Map<string, string>,
  onWarn: (msg: string) => void,
): string {
  const currentDir = path.dirname(currentSourcePath);
  const re = /(^|[^!])\[([^\]]+)\]\(([^)\s]+\.md)(#[^)]*)?\)/g;
  return body.replace(re, (match, lead, label, mdPath, anchor) => {
    if (/^[a-z]+:\/\//i.test(mdPath) || mdPath.startsWith("mailto:")) {
      return match;
    }
    const absTarget = resolveCleanPath(currentDir, mdPath);
    if (!absTarget) {
      onWarn(`unresolved md link: ${mdPath} (from ${path.basename(currentSourcePath)})`);
      return match;
    }
    const targetSlug = slugForSourcePath.get(absTarget);
    if (targetSlug === undefined) {
      onWarn(`unresolved md link: ${mdPath} → ${path.relative(path.dirname(currentDir), absTarget)} (not a nav page; from ${path.basename(currentSourcePath)})`);
      return match;
    }
    const href = relativeUrl(currentSlug, targetSlug) + (anchor ?? "");
    return `${lead}[${label}](${href})`;
  });
}

/**
 * Relative URL from one URL slug to another, assuming both are emitted
 * as `<slug>/index.html` (and the empty-slug root as `index.html`).
 *
 * From "" → "domain"           = "domain/"
 * From "" → "domain/vocabulary" = "domain/vocabulary/"
 * From "domain" → ""           = "../"
 * From "domain" → "devops"     = "../devops/"
 * From "domain/vocabulary" → "domain/runtime" = "../runtime/"
 */
export function relativeUrl(fromSlug: string, toSlug: string): string {
  // Each page is emitted at dist/<slug>/index.html, so the page's "directory"
  // depth equals the number of slug segments.
  const fromDepth = fromSlug === "" ? 0 : fromSlug.split("/").length;
  const up = "../".repeat(fromDepth);
  const target = toSlug === "" ? "" : toSlug + "/";
  const href = up + target;
  return href === "" ? "./" : href;
}
