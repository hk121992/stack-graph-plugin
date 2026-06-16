// Handbook page-index generator.
//
// Regenerates a canon's `content/index.json` — the page graph that agents
// navigate the handbook through — deterministically from the page frontmatter
// on disk. This is the general, plugin-shipped generator that
// `handbook-curator`'s `refresh-index` mode invokes (parameterised by the canon
// root via overlay), so every harness gets a correct, byte-stable index without
// a per-harness reimplementation.
//
// Projection (a pure function of the content/ tree):
//   - One entry per `content/<NN>-<section>/README.md`  → slug `<section>`.
//   - One entry per `content/<NN>-<section>/<NN>-<page>.md` → slug
//     `<section>/<page>` (the NN- prefix is the on-disk sort key only; it is
//     stripped from both the folder and the file, and `.md` is stripped).
//   - Excludes the `archive` section (the `12-archive` page graveyard) and any
//     depth > 1 (a section's sub-directories are preserved on disk but never
//     indexed — only files DIRECTLY under a section dir are pages).
//   - Per entry, the keys `slug, title, type, read-when, related` are taken
//     from the page's frontmatter, emitted in that fixed order.
//   - Entries are sorted alphabetically by slug.
//
// Serialisation — load-bearing for byte-stability:
//   `JSON.stringify(entries, null, 2)` + a trailing newline. JS emits string
//   contents as literal UTF-8 (the equivalent of Python's
//   `json.dumps(..., ensure_ascii=False)`), which is byte-identical to the
//   committed factory index.json (em-dashes etc. are stored literally, not as
//   \uXXXX escapes). The byte-identity is proven by the slice's acceptance_check.
//
// This reuses the same content root resolution and the same vendored
// frontmatter parser as build-handbook.ts, so the index and the rendered
// surface are always derived from one source of truth.
//
// Run (write the index in place):   bun run workspace/renderer/build-handbook-index.ts
// Against another canon root:        bun run workspace/renderer/build-handbook-index.ts --handbook-root <dir>
// Verify only (no write; exit 1 on drift):  ... --check

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatter } from "./vendor/bc-renderer-core/src/index.js";

const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rendererDir, "..", "..");

/** Matches an NN- prefix on a directory or file basename. */
const PREFIX_RE = /^(\d{2})-(.+)$/;

/** Strips a leading NN- prefix; returns the basename unchanged if absent. */
function stripPrefix(basename: string): string {
  const m = PREFIX_RE.exec(basename);
  return m ? m[2] : basename;
}

/** Sections never indexed (preserved on disk, kept out of the page graph). */
const EXCLUDED_SECTIONS = new Set(["archive"]);

interface IndexEntry {
  slug: string;
  title: unknown;
  type: unknown;
  "read-when": unknown;
  related: unknown;
}

// Content root. Default = the factory's own handbook/content, so the factory
// build is unchanged. A harness points the generator at ITS canon (the dir that
// holds the NN-section/README.md folders, i.e. content/) via `--handbook-root
// <dir>` or env HANDBOOK_ROOT — the same surgical parameterisation as
// build-handbook.ts, so one vendored generator serves any harness.
function resolveContentRoot(args: string[]): string {
  const i = args.indexOf("--handbook-root");
  if (i !== -1 && args[i + 1]) return path.resolve(args[i + 1]);
  if (process.env["HANDBOOK_ROOT"]) return path.resolve(process.env["HANDBOOK_ROOT"]);
  return path.join(repoRoot, "handbook", "content");
}

/** Build one index entry from a page's source path, in fixed key order. */
function entryFor(slug: string, sourcePath: string): IndexEntry {
  const { fm } = parseFrontmatter(readFileSync(sourcePath, "utf-8"));
  const f = fm as Record<string, unknown>;
  return {
    slug,
    title: f["title"],
    type: f["type"],
    "read-when": f["read-when"],
    related: f["related"],
  };
}

/** Project a content/ tree into the sorted page-index entry list. */
export function buildIndex(contentRoot: string): IndexEntry[] {
  if (!existsSync(contentRoot)) {
    throw new Error(`handbook content not found at ${contentRoot}`);
  }

  const entries: IndexEntry[] = [];

  const sectionDirs = readdirSync(contentRoot)
    .filter((name) => {
      const full = path.join(contentRoot, name);
      return statSync(full).isDirectory() && PREFIX_RE.test(name);
    })
    .sort();

  for (const sectionDirName of sectionDirs) {
    const sectionSlug = stripPrefix(sectionDirName);
    if (EXCLUDED_SECTIONS.has(sectionSlug)) continue;

    const sectionDir = path.join(contentRoot, sectionDirName);

    // The section index page (clean section slug).
    const readmePath = path.join(sectionDir, "README.md");
    if (existsSync(readmePath)) {
      entries.push(entryFor(sectionSlug, readmePath));
    }

    // Leaf pages: NN-<page>.md DIRECTLY under the section dir (depth 1). Files
    // without an NN- prefix, README, non-.md files, and any sub-directory
    // (depth > 1) are skipped — only prefixed leaf pages are indexed.
    const childMds = readdirSync(sectionDir)
      .filter((name) => {
        if (!name.endsWith(".md") || name === "README.md") return false;
        if (!PREFIX_RE.test(name)) return false;
        return statSync(path.join(sectionDir, name)).isFile();
      })
      .sort();

    for (const childName of childMds) {
      const pageSlug = `${sectionSlug}/${stripPrefix(childName).replace(/\.md$/, "")}`;
      entries.push(entryFor(pageSlug, path.join(sectionDir, childName)));
    }
  }

  entries.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return entries;
}

/**
 * Serialise the entry list to the canonical index.json text.
 *
 * `JSON.stringify(_, null, 2)` + a trailing newline. String contents are
 * emitted as literal UTF-8 (equivalent to Python `ensure_ascii=False`), which
 * is byte-identical to the committed factory index.json.
 */
export function serialiseIndex(entries: IndexEntry[]): string {
  return JSON.stringify(entries, null, 2) + "\n";
}

// CLI: write `<contentRoot>/index.json` (the canon's index lives at the content
// root), or with --check verify the on-disk file already matches (no write).
function main(): void {
  const args = process.argv.slice(2);
  const contentRoot = resolveContentRoot(args);
  const check = args.includes("--check");

  const oi = args.indexOf("--out");
  const outPath = oi !== -1 && args[oi + 1]
    ? path.resolve(args[oi + 1])
    : path.join(contentRoot, "index.json");

  const text = serialiseIndex(buildIndex(contentRoot));

  if (check) {
    const current = existsSync(outPath) ? readFileSync(outPath, "utf-8") : "";
    if (current === text) {
      process.stdout.write(`handbook index up to date: ${outPath}\n`);
      return;
    }
    process.stderr.write(`handbook index STALE: ${outPath} (run without --check to regenerate)\n`);
    process.exit(1);
  }

  writeFileSync(outPath, text, "utf-8");
  const count = JSON.parse(text).length;
  process.stdout.write(`handbook index → ${outPath} (${count} entries)\n`);
}

// Run only when executed directly (importable for tests/acceptance).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
