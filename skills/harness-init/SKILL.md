---
name: "harness-init"
description: "Stands up a harness in a consuming workspace from the vendored plugin — writes <org-root>/.claude/bindings.yaml from the bindings contract (inferring/confirming the workspace's paths), scaffolds the dashboard surface skeleton (strategy.md + objectives.md + items/ + manifest.json + sprints/) from the surface-structure template, and validates every required binding resolves. Modes — scaffold (greenfield bootstrap), bind (re-author bindings only), validate (the harness gate before the loop runs). The vendored, general instantiation of the bindings contract; it carries no product paths — it infers or asks. Structure only — work-item CONTENT is added separately via product-dashboard-curator. Use when: A consuming workspace needs to stand up its harness for the first time (greenfield), re-point its bindings after a path change, or verify the harness is complete before running the dev-sprint loop. NOT for authoring work-item content (product-dashboard-curator), the strategy canvas (strategy-curator), or canon (handbook-curator) — harness-init creates the empty, bound structure those then fill."
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

- **You write** `<org-root>/.claude/bindings.yaml` (the binding values) and the **surface
  skeleton** under `surface-root` (the `strategy.md` / `objectives.md` templates, `items/` +
  an empty `manifest.json`, `sprints/`).
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

1. **Locate the org root** and confirm it with the operator (this anchors every relative binding).
2. **Resolve each binding key** from `bindings-contract`. Infer where you can and **propose the
   value** for the operator to confirm or correct: the `surface-root` (where the work ledger should
   live), `handbook-index` (an existing handbook `index.json`), `personas` (an existing profiles
   doc, optional pre-launch), `event-log` (the `.stack-graph/` stream — generated/local), `renderer`
   + `deploy-config` (the workspace portal, optional), and the scalar dials (`maturity`,
   `plan-policy`, `okr-binding`, `stale-projection-policy`, `terminal-recorder`). Mark optional keys
   that don't apply yet rather than inventing targets.
3. **Write `bindings.yaml`** — flat keys per the contract, values relative to the org root. Do not
   overwrite an existing `bindings.yaml` silently; if one exists, switch to `bind` (merge + confirm).
4. **Scaffold the surface skeleton** under `surface-root` per the template: `strategy.md` (vision ·
   guiding policy · JTBD · open questions — empty headings), `objectives.md` (per `okr-schema` —
   empty objective/north-star headings), `items/` with an **empty** `manifest.json` (`[]`),
   `sprints/`. **Idempotent:** never clobber existing content — create only what's missing and warn
   on what's already there.
5. **Run `validate`** (below) and report. Then tell the operator the next steps: **work items are
   added via `product-dashboard-curator`**; the OKRs are filled in `objectives.md`; the loop runs
   once validate passes.

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
3. **The surface exists**: `surface-root`, `items-root` + a parseable `manifest.json`,
   `objectives-doc`, `strategy-doc`, `sprints-root`. The `event-log` location is reachable (the
   `.stack-graph/` parent exists or can be created).
4. **Report pass/fail with the specific gaps.** A fail means the loop must not run yet — surface
   exactly what to fix (a missing binding, a dangling path, an absent surface dir). This is the
   gate the first traversal depends on.

## Hard constraints

- **Structure only — never content.** You scaffold the bound, empty surface; you never author work
  items (`product-dashboard-curator`), the strategy canvas (`strategy-curator`), or OKR values. You
  leave valid empty templates.
- **Harness-local writes only.** You write `bindings.yaml` + the surface skeleton under
  `surface-root` — nothing else, and **never** the vendored graph. Instantiation is an additive
  overlay.
- **Idempotent.** Re-running `scaffold` fills only what is missing and warns on what exists; it
  never clobbers authored content or an existing `bindings.yaml` (that is `bind`'s job, with
  confirmation).
- **Carry no product literals.** Paths, ids, tiers, stage names, and toolchain are inferred from
  the workspace and confirmed by the operator — never hardcoded. The key set + format live in
  `bindings-contract`, the objective shape in `okr-schema`, the work-item shape in `work-item-schema`.
- **validate is a real gate.** Do not report a harness ready while a required binding is unresolved
  or a surface dir is absent; the loop depends on this being honest.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/bindings-contract.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/okr-schema.md` — `okr-schema`
- `references/work-item-schema.md` — `work-item-schema`

