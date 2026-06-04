---
kind: reference
id: bindings-contract
title: Bindings contract — the keys a harness supplies, and the surface template
description: The factory contract the plugin ships so a consuming workspace can instantiate a harness — the complete set of binding keys the vendored graph may require, the bindings.yaml file format, the org-root CLAUDE.md ambient-surface template, and the dashboard surface-structure template harness-init scaffolds. The plugin carries this contract; the harness supplies the values. No product data.
status: v0.2.0 — 2026-06-04
---

# Bindings contract

The vendored graph is **general**: its nodes read a workspace's surfaces (the work ledger, the
strategy + objectives docs, the handbook, the event log, the renderer) **through bindings**, never
through hardcoded paths. This reference is the **factory contract** — the keys the graph may
require and the shape of what they point at. The **plugin ships this contract**; a **harness
supplies the values** (`harness-init` writes them, the loop nodes read them). It carries **no
product data** — only the key set, the file format, and the surface template.

This is the runtime companion to `work-item-schema` (the carrier's fields) and `okr-schema` (the
outcome layer): those fix *what a work item / objective is*; this fixes *where a harness keeps
them and how the graph finds them*.

## 1. The bindings file

A single **flat-key YAML** file at **`<org-root>/.claude/bindings.yaml`** (the org root is the
directory Claude launches from — see the harness directory topology). Flat top-level keys, values
are workspace-relative or absolute paths (or small scalars for the dial keys). A node never
hardcodes a path; it resolves the key here. The file is **harness-local** (never vendored); only
this *contract* is vendored.

## 2. The key set

Required unless marked optional. `harness-init validate` fails if a required key is missing or its
target does not resolve.

| key | points at | notes |
|---|---|---|
| `surface-root` | the product-dashboard surface dir | root of the work-ledger surface tree |
| `items-root` | the work-items dir | `items/` under the surface; holds `<id>.md` |
| `manifest-path` | the work-items manifest | committed derived index (`items/manifest.json`) |
| `sprint-records-root` | the sprint-records dir | `sprints/`; assembled views |
| `learnings-archive` | the prior-proposals archive **file** (`learnings/archive.md`) | `capture-learnings`' surviving-but-unenacted proposals — the gate writes it, `capture-learnings` reads it next sprint (D60); committed (generative/non-replayable), **not** `.stack-graph/`; scaffold creates the file empty |
| `strategy-doc` | the vision & strategy doc | `strategy.md` (vision · guiding policy · JTBD) |
| `objectives-doc` | the objectives / OKR doc | `objectives.md` per `okr-schema` |
| `okr-binding` | how `outcome_link` resolves to an objective id | resolution rule, not a path |
| `handbook-index` | the product canon index | the handbook `index.json` (the `handbook` external ref binds here) |
| `personas` | the product's user profiles | PM-owned surface; consumed by the experience thread (optional pre-launch) |
| `experience-contract` | the session-shape invariants doc | authored by `design`; per `experience-contract-schema` |
| `event-log` | the carrier-tagged event stream | path + shape under `.stack-graph/` (gitignored, local) |
| `renderer` | the workspace render | entrypoint + output/portal dir (the workspace portal) |
| `deploy-config` | the deploy target | e.g. the portal's `wrangler.jsonc` (optional) |
| `plan-policy` | in-body vs linked plan threshold + link shape | scalar policy (see `IU-schema`) |
| `terminal-recorder` | who freezes the timeline at a terminal state | the recorder binding (`work-item-schema` §frozen) |
| `maturity` | the maturity-dial setting | `pre-launch | first-users | scale` (D45) — default gate rigour |
| `stale-projection-policy` | degraded-mode policy | how surfaces render when the projection is absent/stale |

## 3. The dashboard surface-structure template

The shape `harness-init scaffold` creates under `surface-root` (empty skeleton + templates;
content is added later via `product-dashboard-curator`). Matches `artefacts-design`:

```
<surface-root>/
  strategy.md            # vision · guiding policy · JTBD · open questions  (template)
  objectives.md          # objectives / OKRs / north-star                  (per okr-schema, template)
  items/
    manifest.json        # committed derived index: [{id,file,title,lifecycle_state,tier,outcome_link}]
    <id>.md              # one per work item (added by product-dashboard-curator, not scaffolded)
  sprints/
    <id>.md              # sprint-records (assembled views)
  learnings/
    archive.md           # capture-learnings' surviving proposals (committed; gate-written, D60)
```

Derived/runtime state (the event log, the projection) lives under `.stack-graph/` (gitignored) —
**not** in the surface — and is reached via `event-log`. The `learnings/` archive is **committed**
(a proposals list is generative/non-replayable, so it cannot live in `.stack-graph/`, D60).

## 4. The org-root CLAUDE.md template

The harness's **ambient surface** — the one file that loads automatically at every session because
the operator always launches at the org root, and it cascades to every child (see the harness
directory topology). `harness-init scaffold` writes it from this template; it carries pointers, not
content:

```markdown
# <workspace> — harness root

Handbook (canonical reference): <handbook-index>      # the handbook-index binding; made ambient here
Bindings: ./.claude/bindings.yaml                     # how vendored nodes resolve this workspace's surfaces
How to use the graph: read the handbook index at task start, then the sections your task needs.
```

This is **structure only** — the `handbook-index` value comes from the binding; the rest is fixed
navigation. The **per-session runtime self-check** (a session-start precondition sequence) is a
harness **hook or ambient rule**, authored separately — **not** part of this template and **not** a
`harness-init` mode. `harness-init validate` checks this file exists, reaches the bindings reference,
and carries the `handbook-index` pointer.

## 5. How the graph consumes it

- A node that reads a surface resolves its key here, then reads `bindings.yaml` for the value —
  it **never** hardcodes a path or restates this list.
- The bindings are an **additive local overlay** (the harness's own `.claude/bindings.yaml`); the
  vendored graph is never mutated to point at a product.
- `harness-init` is the executable instantiation of this contract: it **writes** `bindings.yaml`
  (filling these keys against the workspace), **scaffolds** §3, and **validates** that every
  required key resolves.
