---
name: "review"
description: "Static vet of one IU's diff before merge to DEV — two axes in one pass: the lens panel (correctness, security, tests, maintainability, plus conditional health) and the per-IU spec-match — reduced to one ranked finding set, a bounded fix-loop back to build, and a two-axis verdict. Never runs the app. Use when a built IU's diff, PR, or branch needs vetting."
---


# Review

You are the **static vet of one IU's diff** before `dispatch` merges it to DEV — two parallel
axes, one pass: **Standards** — the lens panel (correctness · security · tests · maintainability,
plus conditional `health`) — and **Spec** — the **per-IU spec-match**: the diff is faithful to
its IU's spec. You own **orchestration, operator interaction, and routing**; the lenses own the
dimension analysis. You never run the app — dynamic, batch-scoped proof is `verify`'s, reached
through `dispatch` once the batch is drained — you end at your verdict.

Default seat: inside the dispatched session, after `build`, unattended (`headless` / `autofix`)
over the diff on the IU's `iu/<carrier>` branch. Hand-run, you vet any change — a diff against a
base-ref, a PR, a branch, the working tree — defaulting to `interactive` with no mode given.

## The scope bundle

Both axes read one bundle, built before the panel runs:

- the resolved **target** and **base-ref**, and the captured diff;
- the **changed-file list**, marked in vs out of scope, with untracked or out-of-scope changes
  noted for the consumer;
- the **intent summary** — what the change is meant to do — from the IU record (`goal`,
  `acceptance`, the spec touchpoints it cites); hand-run, from the PR body, commit log, or plan
  doc. Ambiguous intent earns one disambiguating question where the mode allows an operator
  turn; otherwise record the ambiguity in the coverage note and proceed.

## Standards — the lens panel

Run the panel per `lens-dispatch` — it owns lens selection, the parallel fan-out, and the
merge / dedup / corroborate / confidence-gate / severity-route reduction. Hand each invocation
the target (`diff`) and its contents, the scope-rules and intent summary, and the finding
contract — `findings-schema` · `severity-scale` · `confidence-anchors`, held from the required
references — so every emitter returns the compact tier to one contract, reduced to one ranked,
routed finding set.

The four always-on lenses run every time. `health` — the whole-tree static re-score (lint,
types, tests) against its stored baseline — is conditional: a broad refactor, a dependency
change, or an operator ask. Skipping on an unmet trigger is the default, noted in the coverage
note; runtime measurement is `verify`'s, not the panel's.

## Spec — the per-IU spec-match

Alongside the panel, check the diff against its IU record — every `acceptance` condition
observably holds in the delivered code, `verification.end_to_end` is demonstrable, the slice is
a complete vertical path rather than a horizontal fragment, the work stayed inside `files` —
and against the spec touchpoints the front settled for the unit. Sort into **agreements**
(confirmed — no action), **divergences** (the diff does something the spec does not say, or
contradicts it), and **unaddressed touchpoints** (specced, not built). Emit divergences and
unaddressed touchpoints to the same finding contract, `severity` per `severity-scale`'s
non-lens-emitter mapping — a delivery-path touchpoint entirely unmet or contradicted is `P0` —
so they rank, route, and fix-loop exactly like panel findings.

## Verdict and fix-loop

Present what the pass produced, per the mode's interaction column: the **ranked actionable
findings** — both axes in one list, each carrying its severity, `autofix_class`, and owner —
the **soft buckets** (advisory findings, residual risks, testing gaps), a **coverage note**
(lenses run / skipped / failed; whether the spec-match saw the full touchpoint set), and the
two-axis **verdict**: standards-clean · spec-faithful.

Route each actionable finding by its `autofix_class` (rubric: `findings-schema` §autofix-class):
`safe_auto` applies; `gated_auto` waits for operator confirmation or the mode's mutation policy;
`manual` routes to its owner, never auto-applied; `advisory` surfaces only. On a confirmed
defect, loop to `build` — the corrective `can-follow` declared on build's side — and re-run the
pass over the corrected diff; after 2 re-entries an unresolved set routes out `review-flagged`.
A finding that indicts the spec or design itself is never resolved here — never reinterpret the
spec at review grain; route out `escalated` so the front re-shapes and re-gates.

A clean verdict hands the IU back ready for `dispatch` to merge to DEV. Session outcomes come
from the closed four-bucket vocabulary of `handoff-prompt-convention` §outcomes —
`built | review-flagged | escalated | blocked` — your verdict feeds the envelope the session
emits. You write no carrier and fire no gate.

## Modes

Four branches of one skill — same scope bundle, same `lens-dispatch` procedure, same
spec-match; the differences are operator-interaction × mutation policy only.

| mode | operator interaction | mutation policy |
|---|---|---|
| `interactive` (hand-run default) | walks the fix-loop one finding at a time — apply / defer / skip / acknowledge | applies `safe_auto`; confirms `gated_auto`; routes `manual` to its owner |
| `autofix` | none while applying; stops for the operator's decision on everything gated | applies `safe_auto` only |
| `report-only` | presents the finding set and stops | none — read-only, no fix-loop |
| `headless` | none — returns the structured set (findings, soft buckets, coverage note, verdict) | applies `safe_auto` in a single pass |

## Required references

Before taking any action, read these bundled references:

- [confidence-anchors](references/confidence-anchors.md)
- [findings-schema](references/findings-schema.md)
- [severity-scale](references/severity-scale.md)

## On-demand references

At the step of need, read these bundled references:

- [handoff-prompt-convention](references/handoff-prompt-convention.md)
- [lens-dispatch](references/lens-dispatch.md)

