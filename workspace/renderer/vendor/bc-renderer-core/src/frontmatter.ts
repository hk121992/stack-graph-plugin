
import yaml from "../../js-yaml/js-yaml.mjs";
import type { CoreFrontmatter } from "./types.js";

const FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(source: string): { fm: CoreFrontmatter; body: string } {
  const match = source.match(FENCE_RE);
  if (!match) return { fm: { title: "" }, body: source };
  let parsed: Record<string, unknown>;
  try { parsed = (yaml.load(match[1]) ?? {}) as Record<string, unknown>; }
  catch (err) { throw new Error(`Frontmatter parse error: ${err instanceof Error ? err.message : err}`); }
  return {
    fm: { title: (parsed.title as string) ?? "", ...parsed } as CoreFrontmatter,
    body: source.slice(match[0].length),
  };
}
