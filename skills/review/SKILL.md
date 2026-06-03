---
name: "review"
description: "Orchestrate the review lens-panel over a change before it lands — scope the target, run the panel, present the ranked findings, and own the fix-loop. Use when: A change is ready to land and you want the lens panel to vet it (correctness, security, tests, maintainability) before it merges or advances."
---


# Review

Orchestrate the review lens-panel over a change before it lands. You own
**orchestration, operator interaction, and routing** — you do **not** perform any
dimension analysis yourself. The lens agents you invoke (`lens-correctness`,
`lens-security`, `lens-tests`, `lens-maintainability`, plus conditional lenses as they are
authored) own that. Your job is to scope the change, run the panel, present what comes
back, and drive the fix-loop to a verdict.

## When to invoke

Invoke when a change is ready to be vetted before it lands — a diff against a base-ref, a
PR, a branch, or the working tree. The operator may pass a mode token
(`interactive` / `autofix` / `report-only` / `headless`), a target (base-ref, PR, or
branch), and an intent or plan pointer. Default to `interactive` when no mode is given.

## Phase 1 — Scope the target

Build the **scope bundle** before running the panel:

1. Resolve the target. From the operator's invocation, determine what is under review:
   a base-ref diff, a PR, a branch, or the standalone working tree.
2. Capture the diff and the resolved base-ref.
3. Compute the changed-file list and mark what is **in** vs **out** of scope; note any
   untracked or out-of-scope changes the operator should be aware of.
4. Capture an **intent / requirements summary** — what this change is meant to do — from
   the PR body, commit log, or plan file. When intent is ambiguous and the mode allows an
   operator turn, ask the operator a single disambiguating question; otherwise record the
   ambiguity in the coverage note and proceed.

The scope bundle (diff, base-ref, in/out-of-scope file list, untracked-scope notes, intent
summary) is your first deliverable into the panel.

## Phase 2 — Run the panel

With the scope bundle in hand, **follow the `lens-dispatch` reference** to run the panel: it
gives you the lens-selection, parallel fan-out, and merge / dedup / corroborate /
confidence-gate / severity-route reduction. As you fan out, pass each lens its own spawn
prompt carrying the **target** (`diff` or `doc`) and its contents, the **scope-rules** and
intent summary, and the **finding contract** — the finding schema, severity scale, and
confidence anchors, which you hold from your imported references — so every lens emits to the
same contract. Each lens returns the compact finding tier; `lens-dispatch` reduces those
returns to one ranked, routed finding set, which you consume in the phases below.

## Phase 3 — Present the findings

In modes that engage the operator (`interactive`, `report-only`), present what the panel
produced:

- The **ranked actionable findings**, ordered by severity, each carrying its severity,
  `autofix_class`, and `owner`.
- The **soft buckets**: advisory findings, `residual_risks`, and `testing_gaps`.
- A **coverage note**: which lenses ran, were skipped, or failed.
- A **verdict**.

## Phase 4 — Own the fix-loop

Route each actionable finding by its `autofix_class` and `owner`:

- `safe_auto` — apply the fix automatically.
- `gated_auto` — apply only after operator confirmation (or per the mode's mutation policy
  in non-interactive runs).
- `manual` — hand to the responsible owner; do not auto-apply.
- `advisory` — surface only; no fix.

On a **confirmed defect**, loop back to `build` so the change is reworked, then re-run the
panel over the corrected diff. (The process edges that express this loop — `precedes` /
`can-follow` to `build` and `reconcile` — are deferred until those nodes exist, but the
behaviour holds now: confirmed defects return to build, and review re-runs.) Continue until
the actionable set is resolved (fixed or deliberately deferred) and you can issue a verdict.

## Modes

Render as branches of this one skill. The differences are purely in operator-interaction
and mutation policy — every mode follows the same `lens-dispatch` reference and the same
scope bundle.

### interactive (default)

Pause for intent capture when ambiguous. Present findings and walk the fix-loop with the
operator one finding at a time, offering apply / defer / skip / acknowledge per finding.
Apply `safe_auto` fixes, confirm `gated_auto` fixes, and route `manual` findings to their
owner.

### autofix

Apply `safe_auto` fixes automatically with no operator questions. Gate everything else:
present `gated_auto` / `manual` / `advisory` findings without applying them, and stop for
the operator's decision on those.

### report-only

Read-only. Run the panel, present the ranked findings and soft buckets, and stop. Make no
mutations and run no fix-loop. This is the standalone / qa-only shape.

### headless

Machine-consumable. Apply `safe_auto` fixes in a single pass, then return the structured
finding set (ranked actionable findings + soft buckets + coverage note + verdict) with no
operator turn and no per-finding prompts.

## Output

- The presented review: the ranked, routed finding set plus the soft buckets, coverage
  note, and verdict.
- In mutating modes (`interactive`, `autofix`, `headless`): the applied `safe_auto` fixes
  and the fix-loop outcome — `gated_auto` / `manual` findings routed per operator or mode
  policy, with confirmed defects looped back to `build`.
- In `report-only` / `headless`: the finding set emitted for downstream consumption.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/confidence-anchors.md
@references/findings-schema.md
@references/instrumentation-preamble.md
@references/severity-scale.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/lens-dispatch.md` — `lens-dispatch`

