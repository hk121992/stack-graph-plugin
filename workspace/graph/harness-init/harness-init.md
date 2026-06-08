---
# identity — native .claude
id: harness-init
primitive: skill
title: Harness init
description: Stands up a harness in a consuming workspace — writes bindings.yaml, scaffolds the dashboard surface skeleton, and validates every required binding resolves. Modes — scaffold (greenfield bootstrap), bind (re-author bindings only), validate (the harness gate before the loop runs). Structure only — work-item content is added separately via product-dashboard-curator.
when-to-use: A consuming workspace needs to stand up its harness for the first time (greenfield), re-point its bindings after a path change, or verify the harness is complete before running the dev-sprint loop. NOT for authoring work-item content (product-dashboard-curator), the strategy canvas (strategy-curator), or canon (handbook-curator) — harness-init creates the empty, bound structure those then fill.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph
edges:
  references:
    - { id: bindings-contract, load: import }
    - { id: okr-schema, load: on-demand }
    - { id: work-item-schema, load: on-demand }
# analytics — the loop
goals:
  - outcome: A consuming workspace can stand up a working harness from the vendored plugin alone — bindings written and the dashboard surface scaffolded — with no hand-assembly and no copying another workspace's files.
    metric: share of harnesses stood up via harness-init vs hand-built; share of scaffold runs that produce a bindings.yaml whose required keys all resolve + a surface skeleton that exists.
    earns-keep: new harnesses bootstrap from the plugin (the contract + template ship; the workspace instantiates) — not by cloning a sibling workspace's files.
  - outcome: The loop never runs against a half-bound harness — every binding the vendored graph requires resolves, and the surface exists, before the first traversal. validate is the gate.
    metric: harness-init validate pass before the first loop run; count of loop runs against a missing/unbound surface (target 0); count of required keys unresolved at first run (target 0).
    earns-keep: validate catches missing/dangling bindings up front; a workspace that fails validate does not exercise the loop until fixed.
  - outcome: Instantiation is an additive local overlay — harness-init writes only harness-local files and never mutates the vendored graph, and never invents product content.
    metric: count of harness-init writes outside the harness-local tree (bindings.yaml + the org-root CLAUDE.md + the surface under surface-root) — target 0; count of work-items harness-init authored (target 0 — content is the curator's).
    earns-keep: the vendored plugin is never touched by instantiation; harness-init scaffolds empty structure, the curator family fills content.
status: v0.3.0 — 2026-06-04
---

# Harness init

You stand up, re-point, or verify a **harness** — a consuming workspace's specialising layer over
the vendored, general graph — in the **current workspace**. The vendored loop reads a workspace's
surfaces (the work ledger, strategy + objectives, the handbook, the event log, the renderer)
**through bindings**, never hardcoded paths; you are the executable instantiation of that contract.
The operator invokes you with a mode; you run that mode's branch, pausing at every judgment point
(which directory is the org root, where the dashboard surface should live, which existing docs the
handbook/personas keys point at).

You are **vendored and general** — you carry **no product paths, ids, or toolchain**. The key set,
the `bindings.yaml` format, and the surface-structure template all live in the **`bindings-contract`**
reference (imported, not restated here); the objective template shape is in `okr-schema`. You infer
values from the workspace and **confirm with the operator** — you never assume a product's layout.

## The structure/content contract — read this before any mode

You create the **bound, empty structure**; the curator family fills the **content**:

- **You write** `<org-root>/.claude/bindings.yaml` (the binding values), the org-root **`CLAUDE.md`**
  (the harness's **ambient surface** — the handbook-index pointer + the bindings-reference pointer +
  the how-to-use-the-graph navigation), and the **surface skeleton** under `surface-root` (the
  `strategy.md` / `objectives.md` templates, `items/` + an empty `manifest.json`, `sprints/`), **plus
  the improvements surface** under `improvements-root` (a sibling of `surface-root`: an empty `manifest.json`).
- **You do NOT author work items.** Work-item content is **`product-dashboard-curator`**'s
  (`add-item`/`triage`). You scaffold an empty `items/` + manifest; the first work item is added
  through the curator, under its PR gating.
- **You do NOT author strategy or objectives content** beyond the empty template — `strategy-curator`
  maintains the canvas; the operator fills the OKRs. You leave a valid, empty shell.
- **You never mutate the vendored graph.** Everything you write is **harness-local** (the overlay).

## Preflight (before any mode)

Load `bindings-contract` for the key set + the surface template. Identify the **org root** — the
directory Claude launches from, the one carrying `.claude/` (per the harness directory topology;
bindings live at `<org-root>/.claude/bindings.yaml`). If you cannot locate it unambiguously, ask.

## Modes

### `scaffold` — greenfield bootstrap

0. **Detect partial state (crash-window recovery).** Before bootstrapping, check what already
   exists: the org-root `bindings.yaml`, the org-root `CLAUDE.md`, and the surface skeleton. A prior
   run interrupted *between* these writes leaves a **half-written** harness — the crash windows:
   bindings written but the surface not yet scaffolded; the surface present but bindings absent; the
   `CLAUDE.md` written but bindings not. On a partial state, **do not error and do not overwrite** —
   switch to **targeted repair**: keep what exists (confirm it with the operator), create only the
   missing artefacts via the steps below (idempotently), then `validate`. A fully-absent harness is a
   clean greenfield run; a fully-present, consistent one routes to `bind` / `validate`.
1. **Locate the org root** and confirm it with the operator (this anchors every relative binding).
2. **Resolve each binding key** from `bindings-contract`. Infer where you can and **propose the
   value** for the operator to confirm or correct: the `surface-root` (where the work ledger should
   live), `handbook-index` (an existing handbook `index.json`), `personas` (an existing profiles
   doc, optional pre-launch), `event-log` (the `.stack-graph/` stream — generated/local),
   `learnings-archive` (the committed prior-proposals surface, D60), `renderer` + `deploy-config`
   (the vendored workspace render overlaid onto the bound surface roots — `handbook-root` /
   `dashboard-root` / `canvas-root` / `brand-root` / `graph-root` + output + deploy target; optional),
   and the scalar dials (`maturity`, `plan-policy`, `okr-binding`,
   `stale-projection-policy`, `terminal-recorder`). Mark optional keys that don't apply yet rather
   than inventing targets.
3. **Write `bindings.yaml`** — flat keys per the contract, values relative to the org root. Do not
   overwrite an existing `bindings.yaml`: if one exists and the rest of the harness is complete, this
   is a re-point — switch to `bind`; if the harness is partial (step 0), keep the existing bindings
   and continue with the missing artefacts. In **either** case, if the existing `bindings.yaml` is
   **missing keys now required** by `bindings-contract` (e.g. a vendored-plugin update added a key
   such as `learnings-archive`), **add the missing required keys** — infer + confirm each — before
   `validate`; never leave a stale key set that `validate` will then reject. This is how an existing
   harness adopts a plugin that introduced a new required binding (the plugin-update migration path).
4. **Write the org-root `CLAUDE.md`** from the `bindings-contract` template — the harness's
   **ambient surface**: the `handbook-index` pointer (made ambient so it cascades to every child),
   the pointer to the bindings reference, and the how-to-use-the-graph navigation. Structure only;
   **idempotent** — never clobber an existing authored `CLAUDE.md`; if one exists, confirm it carries
   the ambient pointers and warn on anything missing rather than overwriting. (The per-session
   runtime self-check is a harness hook / ambient rule, **not** your job — you scaffold the file; you
   do not embed a session-start procedure.)
5. **Scaffold the surface skeleton** under `surface-root` per the template: `strategy.md` (vision ·
   guiding policy · JTBD · open questions — empty headings), `objectives.md` (per `okr-schema` —
   empty objective/north-star headings), `items/` with an **empty** `manifest.json` (`[]`),
   `sprints/`, and `learnings/` with an **empty** `archive.md` (the committed `learnings-archive`,
   D60 — the gate populates it; you create the empty home). Then, under `improvements-root` (a
   **sibling** of `surface-root`), scaffold an **empty** `manifest.json` (`[]`) — the incremental
   loop's surface; `triage` adds standalone-IU slices here. **Idempotent:** never clobber existing
   content — create only what's missing and warn on what's already there.
6. **Run `validate`** (below) and report, then hand off with the **load canary**: tell the operator
   what a correctly-loaded harness looks like next session — launch at the org root, and the first
   message should show the harness was picked up (the handbook index is reachable by name and a
   `bindings.yaml`-bound node resolves its surface). Then the next steps: **work items are added via
   `product-dashboard-curator`**; the OKRs are filled in `objectives.md`; the loop runs once validate
   passes.

### `bind` — (re)author the bindings only

1. Read the existing `bindings.yaml` (if any) and the `bindings-contract` key set.
2. Map or adjust keys → targets against the **current** workspace layout (e.g. after a path change
   or a new surface). Propose each change; confirm with the operator. Do not touch the surface
   files.
3. Run `validate` and report.

### `validate` — the harness gate (run before the loop)

1. **bindings.yaml present** at `<org-root>/.claude/bindings.yaml` and parseable as flat YAML.
2. **Every required key resolves** (per `bindings-contract`) to a real path/target; optional keys
   either resolve or are explicitly marked not-yet. Report each missing/dangling key by name.
3. **The org-root `CLAUDE.md` is present and wired** — it exists at the org root, reaches the
   bindings reference, and carries the `handbook-index` ambient pointer. This is the runtime
   pre-flight: a harness whose ambient surface does not load the bindings + handbook index will not
   orient on the next session.
4. **The surface exists**: `surface-root`, `items-root` + a parseable `manifest.json`,
   `objectives-doc`, `strategy-doc`, `sprints-root`, `improvements-root` + a parseable
   `improvements-manifest`, `learnings-archive` (the committed archive
   file). The `event-log` location is reachable (the `.stack-graph/` parent exists or can be
   created).
5. **Report pass/fail with the specific gaps.** A fail means the loop must not run yet — surface
   exactly what to fix (a missing binding, a dangling path, an absent surface dir, an unwired
   `CLAUDE.md`). This is the gate the first traversal depends on.

## Hard constraints

- **Structure only — never content.** You scaffold the bound, empty surface; you never author work
  items (`product-dashboard-curator`), the strategy canvas (`strategy-curator`), or OKR values. You
  leave valid empty templates.
- **Harness-local writes only.** You write `bindings.yaml`, the org-root `CLAUDE.md`, and the
  surface skeleton under `surface-root` — nothing else, and **never** the vendored graph.
  Instantiation is an additive overlay.
- **Idempotent.** Re-running `scaffold` fills only what is missing and warns on what exists; it
  never clobbers authored content, an existing `bindings.yaml`, or an existing `CLAUDE.md` (re-pointing
  bindings is `bind`'s job, with confirmation). A partial harness is *repaired*, never overwritten.
- **Carry no product literals.** Paths, ids, tiers, stage names, and toolchain are inferred from
  the workspace and confirmed by the operator — never hardcoded. The key set + format live in
  `bindings-contract`, the objective shape in `okr-schema`, the work-item shape in `work-item-schema`.
- **validate is a real gate.** Do not report a harness ready while a required binding is unresolved
  or a surface dir is absent; the loop depends on this being honest.
