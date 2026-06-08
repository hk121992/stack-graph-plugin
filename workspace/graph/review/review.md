---
# identity — native .claude (the builder emits the primitive from these)
id: review
primitive: skill
title: Review
description: Orchestrate the review lens-panel over a change before it lands — scope the target, run the panel, present the ranked findings, and own the fix-loop.
when-to-use: A change is ready to land and you want the lens panel to vet it (correctness, security, tests, maintainability) before it merges or advances.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
edges:
  invokes:
    - { id: lens-correctness }
    - { id: lens-security }
    - { id: lens-tests }
    - { id: lens-maintainability }
    # conditional measurement lenses — dispatched via lens-dispatch only when their trigger is met
    - { id: benchmark }
    - { id: health }
  composes-into:
    - { id: dev-sprint, stage: review }
    - { id: incremental, stage: review }
  references:
    - { id: lens-dispatch,      load: on-demand }
    - { id: findings-schema,    load: import }
    - { id: severity-scale,     load: import }
    - { id: confidence-anchors,       load: import }
    - { id: instrumentation-preamble, load: import }
    - { id: carrier-interface,        load: on-demand }
  precedes:
    - { id: verify, arc: dev-sprint }
    - { id: land, arc: incremental }
# analytics — the loop
goals:
  - outcome: Defects are caught and fixed before the change lands, rather than escaping to production or a later stage.
    metric: Escaped-defect rate (defects traced to a reviewed change that the panel did not surface or the fix-loop did not resolve) vs the pre-review transcript baseline.
    earns-keep: Escaped-defect rate measurably below baseline over N sprints; if review never lowers it, the stage is cut or restructured.
  - outcome: The review is cheap enough — in wall-clock and operator attention — to run on every change rather than be skipped.
    metric: Review cycle-time and operator-effort per review (operator decisions/questions fired per review; time from invoke to verdict).
    earns-keep: Cycle-time and operator-effort stay low enough that review is not routinely skipped; trends down or holds as the lens family grows.
  - outcome: The panel surfaces actionable signal, not noise the operator must wade through.
    metric: Signal-to-noise — actionable findings actioned (fixed or deliberately deferred) vs findings suppressed or dismissed at the gate, per review.
    earns-keep: The actioned-finding fraction stays high; a rising dismissal rate is the cut/tune signal.
status: v0.2.0 — 2026-06-04
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

The four always-on lenses run every time. The **conditional measurement lenses — `benchmark`
(perf) and `health` (code-quality)** — run only when their trigger is met: dispatch `benchmark`
when the change could move page-load / Core-Web-Vitals / bundle size, and `health` when a
whole-tree quality re-score is warranted (broad refactor, dependency change, or an operator
ask). Each is an autonomous measurement agent that compares against a stored baseline and
returns a regression / quality verdict; their returns fold into the same ranked finding set.
Skipping either when its trigger is unmet is the default, not a finding — note it in the
coverage note. Most reviews run neither.

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
panel over the corrected diff. (The review → build fix loop is a `can-follow` declared on
**build's** side; review re-runs over the corrected diff. On the dev-sprint happy path review
`precedes verify` — the running build is proven next — and on the incremental arc review
`precedes land` directly.) Continue until the actionable set is resolved (fixed or
deliberately deferred) and you can issue a verdict.

## Incremental arc

The same lens panel vets a **standalone IU** (the incremental loop's carrier-lite) before it
lands — same `lens-dispatch`, same finding contract, same fix-loop, then straight to `land`
(no `reconcile`). Here the **`lens-tests` panel is load-bearing**: it checks the
vertical-slice + testing invariants **held in the delivered code** — every acceptance
condition is an observable passing test, `verification.end_to_end` is demonstrable, and the
slice is a complete path, not a horizontal layer fragment. Confirmed defects loop back to
`build` (the one corrective `can-follow`, reused unchanged). For a small **AFK** slice the
operator may run review in a cheaper mode (`autofix` / `headless`). If the carrier is a standalone
IU with `slice_type: HITL` and `hitl_point.stage == review`, run **interactive** (honour the pause)
and surface `hitl_point.decision` — do not run a cheaper unattended mode.

Read the carrier through the **`carrier-interface`** (`load: on-demand`): branch on
`carrier_kind`, and read no work-item-only field (`outcome_link`, `children[]`, `risk_state`)
when `carrier_kind` is `standalone-iu`. Events stay carrier-keyed — `(carrier_id, carrier_kind,
arc)` — so the dev-sprint and incremental arcs do not bleed through this shared node.

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
