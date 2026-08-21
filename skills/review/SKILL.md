---
name: "review"
description: "Orchestrate the static vet of one IU's diff before it merges to DEV — two parallel axes: the lens panel (correctness, security, tests, maintainability, plus conditional health) and the per-IU spec-match (the diff is faithful to its IU's spec). Scope the target, run the panel, present the ranked findings, and own the within-session fix-loop back to build. Use when a built IU's diff is ready to be vetted before merge — inside the dispatched session after build, or hand-run over any diff."
---


# Review

Orchestrate the **static vet of one IU's diff** before it merges to DEV — two parallel axes, one
pass: **Standards** — the lens panel (correctness · security · tests · maintainability, plus
conditional `health`) — and **Spec** — the **per-IU spec-match**: the diff is faithful to its IU's
spec. You own **orchestration, operator interaction, and routing** — you do **not** perform any
dimension analysis yourself. The lens agents you invoke own that; your job is to scope the change,
run the panel, check the diff against its spec, present what comes back, and drive the fix-loop to
a verdict. You do **not** run the app — that is `verify`'s job, dynamic and batch-scoped, reached
through `dispatch` once the whole batch is built and reviewed.

## When to invoke

Inside a **dispatched session, after `build`** — the default seat: the target is the IU's diff on
its `iu/<carrier>` branch, and the session runs you unattended (`headless` / `autofix`). Hand-run, you
vet any change — a diff against a base-ref, a PR, a branch, or the working tree. The operator may
pass a mode token (`interactive` / `autofix` / `report-only` / `headless`), a target, and an intent
or plan pointer. Default to `interactive` when hand-run with no mode given.

## Phase 1 — Scope the target

Build the **scope bundle** before running the panel:

1. Resolve the target. From the invocation, determine what is under review: the dispatched IU's
   branch diff, a base-ref diff, a PR, a branch, or the standalone working tree.
2. Capture the diff and the resolved base-ref.
3. Compute the changed-file list and mark what is **in** vs **out** of scope; note any untracked or
   out-of-scope changes the consumer should be aware of.
4. Capture an **intent / requirements summary** — what this change is meant to do — from the IU
   record (its `goal` and `acceptance`, plus the spec touchpoints it cites), the PR body, commit
   log, or plan doc. When intent is ambiguous and the mode allows an operator turn, ask a single
   disambiguating question; otherwise record the ambiguity in the coverage note and proceed.

The scope bundle (diff, base-ref, in/out-of-scope file list, untracked-scope notes, intent summary)
feeds both axes.

## Phase 2 — Run the panel (the Standards axis)

With the scope bundle in hand, **follow the `lens-dispatch` reference** to run the panel: it gives
you the lens-selection, parallel fan-out, and merge / dedup / corroborate / confidence-gate /
severity-route reduction. As you fan out, pass each lens its own invocation prompt carrying the
**target** (`diff` or `doc`) and its contents, the **scope-rules** and intent summary, and the
**finding contract** — the finding schema, severity scale, and confidence anchors, which you hold
from the required references — so every lens emits to the same contract. Each lens returns the
compact finding tier; `lens-dispatch` reduces those returns to one ranked, routed finding set.

The four always-on lenses run every time. **`health`** (code-quality — a whole-tree static
re-score: lint, types, tests) is **conditional**: dispatch it only when a re-score is warranted — a
broad refactor, a dependency change, or an operator ask. It compares against a stored baseline and
returns a quality verdict that folds into the same ranked set. Skipping it when its trigger is
unmet is the default, not a finding — note it in the coverage note. Runtime measurement (perf over
the running build) is `verify`'s, not the panel's.

## Phase 3 — The Spec axis: the per-IU spec-match

Alongside the panel, check the diff against **its IU's spec**:

- **the IU record** — every `acceptance` condition is an observable passing test in the delivered
  code; `verification.end_to_end` is demonstrable; the slice is a complete vertical path, not a
  horizontal layer fragment; the work stayed inside the `files` scope;
- **the spec touchpoints** the front settled for this unit — the diff does what the spec says,
  nothing the spec contradicts.

Sort what you find into **agreements** (confirmed — no action), **divergences** (the diff does
something the spec does not say, or contradicts it), and **unaddressed touchpoints** (specced, not
built). Emit divergences and unaddressed touchpoints to the **same finding contract** — `severity`
per the non-lens-emitter mapping in `severity-scale` (a delivery-path touchpoint entirely unmet or
contradicted is `P0`) — so they rank, route, and fix-loop exactly like panel findings.

An **implementation-side** divergence loops to `build` like any defect. A finding that indicts the
**spec or design itself** — the spec cannot, or should not, be met as written — is not yours to
resolve: **never reinterpret the spec at review grain**; route the session out (`escalated`) so the
front re-shapes and re-gates.

## Phase 4 — Present the findings

In modes that engage the operator (`interactive`, `report-only`), present what the pass produced:

- The **ranked actionable findings** — both axes in one list, ordered by severity, each carrying
  its severity, `autofix_class`, and `owner`.
- The **soft buckets**: advisory findings, `residual_risks`, and `testing_gaps`.
- A **coverage note**: which lenses ran, were skipped, or failed; whether the spec-match ran
  against a full touchpoint set.
- A **verdict** — covering both axes: standards-clean and spec-faithful.

## Phase 5 — Own the fix-loop

Route each actionable finding by its `autofix_class` and `owner`:

- `safe_auto` — apply the fix automatically.
- `gated_auto` — apply only after operator confirmation (or per the mode's mutation policy in
  non-interactive runs).
- `manual` — hand to the responsible owner; do not auto-apply.
- `advisory` — surface only; no fix.

On a **confirmed defect**, loop back to `build` so the change is reworked, then re-run the pass
over the corrected diff. (The review → build fix loop is a `can-follow` declared on **build's**
side; the loop is bounded — a set still actionable after two re-entries routes the session out
`review-flagged` for the operator's triage.) Continue until the actionable set is resolved (fixed
or deliberately deferred) and you can issue a verdict. **On a clean verdict the IU is ready for
`dispatch` to merge to DEV.** You write no carrier and fire no gate.

## Modes

Render as branches of this one skill. The differences are purely in operator-interaction and
mutation policy — every mode follows the same `lens-dispatch` procedure, the same spec-match, and
the same scope bundle. Inside a dispatched session, run `headless` or `autofix`; the interactive
modes are for hand-run reviews.

### interactive (hand-run default)

Pause for intent capture when ambiguous. Present findings and walk the fix-loop with the operator
one finding at a time, offering apply / defer / skip / acknowledge per finding. Apply `safe_auto`
fixes, confirm `gated_auto` fixes, and route `manual` findings to their owner.

### autofix

Apply `safe_auto` fixes automatically with no operator questions. Gate everything else: present
`gated_auto` / `manual` / `advisory` findings without applying them, and stop for the operator's
decision on those.

### report-only

Read-only. Run the pass, present the ranked findings and soft buckets, and stop. Make no mutations
and run no fix-loop.

### headless

Machine-consumable. Apply `safe_auto` fixes in a single pass, then return the structured finding
set (ranked actionable findings + soft buckets + coverage note + verdict) with no operator turn and
no per-finding prompts.

## Output

- The presented review: the ranked, routed finding set across both axes, plus the soft buckets,
  coverage note, and verdict (standards-clean · spec-faithful).
- In mutating modes (`interactive`, `autofix`, `headless`): the applied `safe_auto` fixes and the
  fix-loop outcome — `gated_auto` / `manual` findings routed per operator or mode policy, with
  confirmed defects looped back to `build`.
- In `report-only` / `headless`: the finding set emitted for downstream consumption — inside a
  dispatched session, the session's review verdict (clean ⇒ ready to merge; unresolved actionable
  findings ⇒ the session routes out `review-flagged`).
- No carrier write; no gate fired.

## Required references

Before taking any action, read these bundled references:

- [confidence-anchors](references/confidence-anchors.md)
- [findings-schema](references/findings-schema.md)
- [severity-scale](references/severity-scale.md)

## On-demand references

At the step of need, read these bundled references:

- [lens-dispatch](references/lens-dispatch.md)

