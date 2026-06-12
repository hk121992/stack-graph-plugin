#!/usr/bin/env -S bun run
/**
 * refresh-index.ts — regenerate handbook/content/index.json from a filesystem walk.
 *
 * Logic mirrors bc-handbook-curator's refresh-index.ts, with HANDBOOK_ROOT
 * resolution adapted for the stack-graph repo layout (no bc-workspace/ wrapper —
 * the handbook root IS the repo's own handbook/).
 *
 * This is a GENERAL generator: it is parameterized by the canon root, vendored into
 * the plugin (build/vendor.ts), and invoked the same way by any harness's curator
 * overlay. Default output is literal UTF-8 (the factory canon); `--ascii` reproduces
 * an ASCII-escaped canon (e.g. be-civic's `json.dumps(ensure_ascii=True)` shape).
 *
 * CONTRACT
 * --------
 * Canon root: the directory CONTAINING `content/`. Resolution order:
 *   1. `--root <path>` CLI arg (flag or first positional);
 *   2. `$HANDBOOK_ROOT` env var;
 *   3. walk up from this script's location looking for a `handbook/content/` directory.
 *   Abort with exit code 2 if none resolves.
 *
 * Walk:   `<root>/content/NN-<section>/` directories only.
 *         Included files: `README.md` (section index) and `NN-<page>.md` leaves.
 *         Excluded: files without `NN-` prefix (except README.md); any top-level
 *         section whose post-`NN-`-strip slug is `archive` (NN-agnostic) skipped wholesale.
 *
 * Slug rule:
 *   `content/NN-section/README.md`      → `section`
 *   `content/NN-section/NN-page.md`     → `section/page`
 *
 * Frontmatter: parse title, type, read-when, related (inline array form only).
 *   Pages with incomplete lean frontmatter (missing title, type, or read-when) are
 *   SKIPPED with a stderr warning — do not fail the run.
 *   Each `related[]` entry is NORMALIZED on write (the same canonicalization the
 *   link-validator applies before its checks): split on `/`, strip a leading `NN-`
 *   on the FINAL segment only, `X/README`→`X`, bare `README`→root (`""`), `.md` stripped.
 *
 * Output: `<root>/content/index.json` — JSON array sorted by slug, one entry per page:
 *   { slug, title, type, "read-when", related }
 *   Serialized as `JSON.stringify(entries, null, 2) + "\n"` (literal UTF-8). With
 *   `--ascii`, non-ASCII is escaped as lowercase `\uXXXX` (per UTF-16 code unit) to
 *   match a `json.dumps(ensure_ascii=True)` canon.
 *
 * Flags:
 *   --root <path>   canon root (dir containing content/); overrides $HANDBOOK_ROOT + walk-up.
 *   --ascii         ASCII-escape non-ASCII output (default off = literal UTF-8).
 *
 * Exit codes:
 *   0  success (idempotent — same output as last run if no changes)
 *   2  handbook root cannot be resolved
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface PageEntry {
  slug: string;
  title: string;
  type: string;
  "read-when": string;
  related: string[];
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

interface CliArgs {
  /** Canon root from `--root <path>` or the first bare positional, if any. */
  root?: string;
  /** ASCII-escape the output (default off = literal UTF-8). */
  ascii: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { ascii: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--ascii") {
      out.ascii = true;
    } else if (arg === "--root") {
      out.root = argv[++i];
    } else if (arg.startsWith("--root=")) {
      out.root = arg.slice("--root=".length);
    } else if (!arg.startsWith("-") && out.root === undefined) {
      // First bare positional is the canon root.
      out.root = arg;
    }
  }
  return out;
}

function resolveHandbookRoot(cliRoot?: string): string {
  // Resolution order: --root, then $HANDBOOK_ROOT, then walk-up discovery.
  if (cliRoot) {
    if (existsSync(join(cliRoot, "content"))) return cliRoot;
    console.error(
      `refresh-index: --root ${cliRoot} has no content/ subdirectory.`,
    );
    process.exit(2);
  }
  const envRoot = process.env.HANDBOOK_ROOT;
  if (envRoot && existsSync(join(envRoot, "content"))) {
    return envRoot;
  }
  // Walk up from script dir looking for a `handbook/content/` directory.
  let cur = SCRIPT_DIR;
  for (let i = 0; i < 12; i++) {
    const candidate = join(cur, "handbook");
    if (existsSync(join(candidate, "content"))) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  console.error(
    "refresh-index: cannot resolve handbook root. Set $HANDBOOK_ROOT to the handbook/ directory, or run from inside a stack-graph checkout.",
  );
  process.exit(2);
}

function parseFrontmatter(filePath: string): Record<string, unknown> | null {
  const raw = readFileSync(filePath, "utf-8");
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return null;
  const block = raw.slice(4, end).trim();

  // Minimal YAML parser sufficient for the lean handbook frontmatter:
  // single-line scalars (`key: value`) and inline arrays (`key: [a, b]`).
  // Multi-line / nested YAML is banned by the authoring rule.
  const out: Record<string, unknown> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value: unknown = m[2].trim();
    if (typeof value === "string") {
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Inline array
      if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
        const inner = value.slice(1, -1).trim();
        value = inner === ""
          ? []
          : inner.split(",").map((s) => {
              let v = s.trim();
              if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.slice(1, -1);
              }
              return v;
            });
      }
    }
    out[key] = value;
  }
  return out;
}

/**
 * Canonicalize a `related[]` entry to its slug form. This is the SAME rule the
 * link-validator applies before its membership + asymmetry checks (see
 * agents/link-validator.md). Steps:
 *   - strip a trailing `.md` suffix if present;
 *   - split on `/`; strip a leading `NN-` (`/^\d{2}-/`) on the FINAL segment only;
 *   - `X/README` → `X`; bare `README` → root (`""`).
 */
function normalizeRelated(entry: string): string {
  let v = entry.trim();
  if (v.endsWith(".md")) v = v.slice(0, -3);
  const parts = v.split("/");
  const last = parts.length - 1;
  parts[last] = parts[last].replace(/^\d{2}-/, "");
  if (parts[last] === "README") {
    // `X/README` → `X`; bare `README` → root (`""`).
    parts.pop();
  }
  return parts.join("/");
}

function computeSlug(relPath: string): string | null {
  // relPath: e.g. "08-devops/01-sprint-cycle.md", "08-devops/README.md"
  const parts = relPath.split("/");
  if (parts.length < 2) return null;
  const sectionPart = parts[0];
  const filePart = parts[1];

  const sectionMatch = sectionPart.match(/^\d{2}-(.+)$/);
  if (!sectionMatch) return null;
  const section = sectionMatch[1];

  if (filePart === "README.md") return section;

  const fileMatch = filePart.match(/^\d{2}-(.+)\.md$/);
  if (!fileMatch) return null;
  return `${section}/${fileMatch[1]}`;
}

function walk(contentRoot: string): PageEntry[] {
  const entries: PageEntry[] = [];
  const errors: string[] = [];

  const sections = readdirSync(contentRoot).filter((name) => {
    const full = join(contentRoot, name);
    if (!statSync(full).isDirectory()) return false;
    if (!/^\d{2}-/.test(name)) return false;
    // Archive section is historical record, not navigation target. Skip wholesale.
    // NN-agnostic: match any top-level section whose post-`NN-`-strip slug is `archive`
    // (11-archive, 12-archive, …).
    if (name.replace(/^\d{2}-/, "") === "archive") return false;
    return true;
  });

  for (const section of sections) {
    const sectionDir = join(contentRoot, section);
    const files = readdirSync(sectionDir).filter((name) => {
      if (name === "README.md") return true;
      return /^\d{2}-.+\.md$/.test(name);
    });

    for (const file of files) {
      const fullPath = join(sectionDir, file);
      const relPath = `${section}/${file}`;
      const slug = computeSlug(relPath);
      if (!slug) continue;

      const fm = parseFrontmatter(fullPath);
      if (!fm) {
        errors.push(`${relPath}: skipped (no frontmatter)`);
        continue;
      }

      const title = typeof fm.title === "string" ? fm.title : "";
      const type = typeof fm.type === "string" ? fm.type : "";
      const readWhen = typeof fm["read-when"] === "string" ? fm["read-when"] : "";
      const related = Array.isArray(fm.related)
        ? (fm.related as unknown[])
            .filter((x): x is string => typeof x === "string")
            .map(normalizeRelated)
        : [];

      if (!title || !type || !readWhen) {
        errors.push(`${relPath}: skipped (incomplete lean frontmatter — retrofit pending)`);
        continue;
      }

      entries.push({ slug, title, type, "read-when": readWhen, related });
    }
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(`refresh-index: ${e}`);
    console.error(`refresh-index: ${errors.length} page(s) skipped; ${entries.length} included`);
  }

  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  return entries;
}

// Canonical serialiser: standard pretty-print, matching the committed factory
// index byte-for-byte (`JSON.stringify(entries, null, 2) + "\n"`, literal UTF-8).
// JSON.stringify preserves key insertion order (slug, title, type, read-when,
// related) and emits each `related[]` element on its own line. The trailing
// newline is load-bearing.
function serialize(entries: PageEntry[]): string {
  return JSON.stringify(entries, null, 2) + "\n";
}

// Escape non-ASCII characters as lowercase \uXXXX so the emitted JSON matches a
// `json.dumps(ensure_ascii=True)` canon (e.g. be-civic). Enabled by `--ascii`;
// default off (literal UTF-8, the factory canon). Iterate per UTF-16 code unit
// via charCodeAt so surrogate pairs emit two `\uXXXX` escapes, matching Python's
// ensure_ascii. Without this on an ASCII canon, every run produces a cosmetic-only
// diff that the integrate walk can't land (handbook is PR-only, no direct push).
function asciiEncode(json: string): string {
  let out = "";
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    out += code > 0x7f ? "\\u" + code.toString(16).padStart(4, "0") : json[i];
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const handbookRoot = resolveHandbookRoot(args.root);
  const contentRoot = join(handbookRoot, "content");
  const outputPath = join(contentRoot, "index.json");

  const entries = walk(contentRoot);
  const body = serialize(entries);
  const json = args.ascii ? asciiEncode(body) : body;

  let prior = "";
  if (existsSync(outputPath)) prior = readFileSync(outputPath, "utf-8");

  if (prior === json) {
    console.log(`refresh-index: unchanged (${entries.length} pages)`);
    return;
  }

  // Announce the slugs of changed entries so `raise` mode can surface them.
  // Compare whole-entry JSON rather than the (now multi-line pretty-printed)
  // serialised text: parse the prior file, key by slug, and diff against the
  // new entries the same way.
  const priorBySlug = new Map<string, string>();
  if (prior) {
    try {
      const priorEntries = JSON.parse(prior) as PageEntry[];
      if (Array.isArray(priorEntries)) {
        for (const e of priorEntries) {
          if (e && typeof e.slug === "string") {
            priorBySlug.set(e.slug, JSON.stringify(e));
          }
        }
      }
    } catch {
      // Unparseable prior (hand-edit, partial write) — treat as all-new.
    }
  }
  const nextBySlug = new Map<string, string>();
  for (const e of entries) nextBySlug.set(e.slug, JSON.stringify(e));

  const changed: string[] = [];
  for (const e of entries) {
    const before = priorBySlug.get(e.slug);
    if (before === undefined) changed.push(`${e.slug} (added)`);
    else if (before !== nextBySlug.get(e.slug)) changed.push(`${e.slug} (modified)`);
  }
  for (const slug of priorBySlug.keys()) {
    if (!nextBySlug.has(slug)) changed.push(`${slug} (removed)`);
  }

  writeFileSync(outputPath, json, "utf-8");
  console.log(`refresh-index: wrote ${entries.length} pages to ${outputPath}`);
  if (changed.length > 0) {
    console.log(`refresh-index: changed entries: ${changed.join(", ")}`);
  }
}

main();
