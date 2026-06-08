# Vendored renderer dependencies

The workspace portal renderer is **install-free**: every runtime dependency is
vendored here from a local trusted source, so the build runs under Bun with no
`node_modules` and no network install — matching the repo's dependency-free
tooling philosophy (`build/vendor.ts`, the curator scripts) and its
post-Shai-Hulud supply-chain posture (one inspectable, pinned file each, no
transitive dep tree, no postinstall scripts).

| Vendored | Version | License | Source | Notes |
|---|---|---|---|---|
| `bc-renderer-core/` (`src/` + `assets/`) | 0.1.0 | (be-civic, hk121992) | `be-civic/bc-renderer-core` | The markdown pipeline + page shell + sidebar + CSS/JS assets. Verbatim **except** the import rewrites below. |
| `marked/marked.esm.js` | 18.0.0 | MIT | `gbrain/node_modules/marked/lib/` | Prebuilt ESM bundle. |
| `marked-gfm-heading-id/index.js` | 4.1.4 | MIT | Bun install cache | Heading-id plugin. Import rewritten (below). |
| `github-slugger/` | 2.0.0 | ISC | `be-civic` handbook renderer `node_modules` | Dependency of marked-gfm-heading-id. |
| `js-yaml/js-yaml.mjs` | 4.1.1 | MIT | `be-civic` handbook renderer `node_modules` | Frontmatter YAML. |

## Import rewrites (the only edits to vendored source)

Bare specifiers were rewritten to explicit relative paths so the vendored tree
resolves with no `node_modules` / no path-mapping:

- `bc-renderer-core/src/markdown.ts`: `"marked"` → `../../marked/marked.esm.js`; `"marked-gfm-heading-id"` → `../../marked-gfm-heading-id/index.js`
- `bc-renderer-core/src/frontmatter.ts`: `"js-yaml"` → `../../js-yaml/js-yaml.mjs`
- `marked-gfm-heading-id/index.js`: `"github-slugger"` → `../github-slugger/index.js`

## Updating

Re-copy from the source, then re-apply the four import rewrites above and run
`bun run workspace/renderer/smoke.ts` (must print `SMOKE OK`). `lib/` (adapted
from the be-civic handbook renderer: `content.ts`, `asset-prefix.ts`,
`heading-render.ts`, `headings.ts`) is **not** under `vendor/` — it is adapted,
not verbatim.
