
import { marked } from "../../marked/marked.esm.js";
import { gfmHeadingId } from "../../marked-gfm-heading-id/index.js";

import type { CorePage, HostContext, TocEntry, TokenMatch, TokenResolver } from "./types.js";
import { applyBuiltinCallouts } from "./builtins.js";

marked.use(gfmHeadingId(), { gfm: true, breaks: false });

export interface RenderMarkdownOptions {
  page: CorePage;
  resolvers?: Record<string, TokenResolver>;
  data?: unknown;
  /** Optional resolver name order. Same shape as preprocess(..., {order}). */
  resolverOrder?: string[];
}

export interface RenderMarkdownResult {
  html: string;
  toc: TocEntry[];
  warnings: string[];
}

export function renderMarkdown(body: string, opts: RenderMarkdownOptions): RenderMarkdownResult {
  const warnings: string[] = [];
  const ctx: HostContext = {
    page: opts.page,
    data: opts.data,
    warn: (msg: string) => warnings.push(msg),
  };
  const processed = preprocess(body, opts.resolvers ?? {}, ctx, { order: opts.resolverOrder });
  const html = marked.parse(processed, { async: false }) as string;
  return { html, toc: extractToc(html), warnings };
}

// ── Preprocess pass ──────────────────────────────────────────────────────────

export function preprocess(
  body: string,
  resolvers: Record<string, TokenResolver>,
  ctx: HostContext,
  options: { order?: string[] } = {},
): string {
  let out = applyBuiltinCallouts(body);

  // Iterate resolvers in `options.order` if provided, otherwise descending
  // name length (so <RefBlock> is matched before <Ref>). Within each
  // resolver: children-form FIRST, then self-close.
  //
  // The children-first ordering matters when a resolver's self-close output
  // is itself a children-form tag (e.g. <Ref name="X" /> → <Ref name="X">…</Ref>).
  // If self-close ran first, the children-form pass would re-match the
  // resolver's own output and double-process it. Running children-form
  // first guarantees: authored children-form sources are handled first;
  // then self-close gets converted to children-form (the terminal shape).
  //
  // The `order` argument lets hosts force a specific cross-resolver
  // sequence — useful when one resolver's children-form regex
  // accidentally matches another resolver's self-close output. Known case:
  // <Ref ...>(.*?)</Ref> matches a self-close <Ref ... /> + intervening
  // text + a later <Ref ...>...</Ref>, and the intervening text gets
  // escaped as the matched children. KG depends on its native ordering
  // (Obs → VV → Ref → Skill) to preserve a specific pre-existing
  // canonical-emit shape in this case.
  const ordered = options.order
    ? options.order.filter((n) => n in resolvers)
    : Object.keys(resolvers).sort((a, b) => b.length - a.length);
  const remaining = Object.keys(resolvers)
    .filter((n) => !ordered.includes(n))
    .sort((a, b) => b.length - a.length);
  for (const name of [...ordered, ...remaining]) {
    const resolver = resolvers[name];
    const children = new RegExp(`<${name}\\s*([^>]*?)>([\\s\\S]*?)<\\/${name}>`, "g");
    const selfClose = new RegExp(`<${name}\\s+([^/>]*?)\\/>`, "g");
    out = out.replace(children, (source: string, attrs: string, body: string) =>
      resolver({ source, attrs, children: body }, ctx));
    out = out.replace(selfClose, (source: string, attrs: string) =>
      resolver({ source, attrs, children: undefined }, ctx));
  }

  return out;
}

// ── ToC extractor ────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function extractToc(html: string): TocEntry[] {
  const out: TocEntry[] = [];
  const re = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, "")).trim();
    out.push({ level: parseInt(m[1], 10), id: m[2], text });
  }
  return out;
}
