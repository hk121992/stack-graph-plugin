// Foundation smoke test — proves the vendored renderer-core (with rewritten
// install-free imports: marked, marked-gfm-heading-id, js-yaml, github-slugger)
// loads under Bun and renders markdown → HTML → branded shell. This is the gate
// before building the handbook/graph/dashboard surfaces on top of it.
//
// Run: bun run workspace/renderer/smoke.ts   (exit 0 = OK)

import {
  parseFrontmatter,
  renderMarkdown,
} from "./vendor/bc-renderer-core/src/index.js";
import type { CorePage } from "./vendor/bc-renderer-core/src/index.js";
import { renderSurfacePage } from "./shell-host.js";

const SAMPLE = `---
title: Smoke Test
description: Proves the vendored renderer resolves and renders.
---

## Hello world

A paragraph with **bold** text and a [link](https://example.com).

### A subsection

- one
- two

\`\`\`ts
const x = 1;
\`\`\`
`;

const { fm, body } = parseFrontmatter(SAMPLE);
const page: CorePage = { path: "smoke", fm, raw: body };
const { html, toc, warnings } = renderMarkdown(body, { page });
page.toc = toc;

const out = renderSurfacePage({
  slug: "smoke",
  page,
  nav: [{ group: "Test", pages: ["smoke"] }],
  bodyHtml: html,
});

const checks: Array<[string, boolean]> = [
  ["frontmatter title parsed", fm.title === "Smoke Test"],
  ["markdown → h2", /<h2[^>]*>/.test(html)],
  ["heading id assigned", /<h2[^>]*id="[^"]+"/.test(html)],
  ["bold rendered", html.includes("<strong>bold</strong>")],
  ["list rendered", html.includes("<li>one</li>")],
  ["code block rendered", html.includes("<pre>")],
  ["toc extracted (>=1 h2)", toc.length >= 1],
  ["shell doctype", out.startsWith("<!doctype html>")],
  ["wordmark present", out.includes("stack-graph")],
  ["site title in <title>", out.includes("stack-graph workspace")],
  ["style.css linked", out.includes("style.css")],
  ["brand-overrides linked", out.includes("brand-overrides.css")],
  ["theme.js linked", out.includes("theme.js")],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  if (!pass) ok = false;
}
if (warnings.length) console.log("warnings:", warnings);
console.log(ok ? "\nSMOKE OK" : "\nSMOKE FAILED");
process.exit(ok ? 0 : 1);
