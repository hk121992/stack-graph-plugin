---
kind: reference
id: deploy-config
title: Deploy-config — the field set deploy validates in preflight, supplied by the harness
description: The deploy target contract the deploy node validates before any irreversible action. The factory names the required field set (deploy platform, prod URL, health endpoint, deploy command, branch-protection flag, and the rest); the harness supplies the values via the deploy-config binding. A missing required field is a STOP. No product data; values are never baked into the factory.
status: v0.1.0 — 2026-06-04
---

# Deploy-config

The `deploy` node is **general and harness-agnostic**: it merges a PR, triggers a
deployment pipeline, and waits for it to settle without knowing the product's platform,
URLs, or tooling. It reads all of that through the **deploy-config** overlay — the
field set named here, filled by the harness. The **factory names the fields**; the
**harness supplies the values** (via the `deploy-config` binding key in
`bindings-contract`, which points at the file or block holding these values, e.g. the
portal's `wrangler.jsonc` plus a small deploy block). This reference carries **no
product data** — only the key set and what each key means.

This is the validation contract `deploy`'s preflight runs. `deploy` resolves the
`deploy-config` binding, reads the values, and checks every **required** field is
present and resolvable. A **missing required field is a STOP**: `deploy` describes the
field the harness must supply and halts — it never proceeds on an assumed default for a
pipeline trigger.

## The field set

Required unless marked optional. The harness supplies the value; the factory never
hardcodes one.

| field | what it names | notes |
|---|---|---|
| `deploy_platform` | the deploy target platform | e.g. Cloudflare / Fly / Vercel / Netlify / GitHub-Actions / custom-hook — selects the trigger + poll strategy the harness wires |
| `merge_tooling` | the PR-merge command | e.g. `gh pr merge`; carries the default merge method (squash unless overridden) |
| `merge_method` | squash \| merge \| rebase | optional — defaults to **squash** (keeps `main` clean after WIP checkpoint commits); harness overrides |
| `deploy_command` | the pipeline-trigger command | the command (or platform hook) that starts the deploy; the factory body calls it, the harness defines it |
| `pipeline_poll` | poll interval + completion check | optional — how to read pipeline status; defaults to a 30s interval; harness calibrates per platform |
| `deploy_timeout` | the settle timeout | optional — pipeline-settle deadline; harness-calibrated per platform (real platforms vary widely; a too-short default produces false failures) |
| `prod_url` | the production environment URL | the URL the inline smoke check hits in `prod-direct` / the prod leg of `staging-first` |
| `staging_url` | the staging / preview environment URL | optional — required for `staging-first` and `staging-only`; absent ⇒ the harness has no staging environment |
| `health_endpoint` | the path the smoke check probes | optional — defaults to `/`; a dedicated health route (e.g. `/healthz`) if the harness exposes one |
| `branch_protection` | is the deploy branch protected? | boolean — gates the revert path: protected ⇒ a revert is a **revert-PR**, not a direct `git revert` + push |
| `merge_queue` | does the platform use a merge queue? | optional boolean/auto — when true (or `gh pr merge --auto` is used), the merge is **queued**, not immediate; deploy polls the queue separately (see deploy's merge phase) |
| `credentials` | where the deploy CLI / merge tooling auth lives | optional — a path or binding, never an inline secret; deploy confirms auth in preflight, it does not read the secret value |

## How deploy uses it

- **Preflight validation.** `deploy` reads the binding and checks every required field
  resolves. A missing required field, or a `staging_url` absent in a staging-requiring
  mode, is a **STOP** with a description of what the harness must supply — not an
  assumed default.
- **Mode gating.** `staging_url` presence/absence is what makes `staging-first` and
  `staging-only` possible; its absence forces `prod-direct` or a stop.
- **Revert gating.** `branch_protection` decides whether deploy's offered revert is a
  direct `git revert` + push or a revert-PR (see deploy's revert step).
- **No mutation of the factory.** The deploy-config is an **additive harness overlay**
  (the harness's own bound values); the vendored `deploy` node and this contract are
  never edited to point at a product.

This is the deploy-side companion to `bindings-contract` (which lists `deploy-config`
as one binding key among many): the bindings contract says *where* the deploy-config
lives; this reference says *what fields it must contain* and *what deploy does with a
missing one*.
