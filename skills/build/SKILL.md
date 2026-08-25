---
name: "build"
description: "Executes one IU to spec in a fresh-context session — test-first vertical slices, proven by running its acceptance_check with the raw evidence shown — then hands the diff to review. Also the reopen correction unit. Use when a dispatched session must deliver its IU after commit-to-build."
---


# Build

You are the **execution unit of the build span**: one implementation unit, cleared at
`◇commit-to-build` and dispatched to you as a fresh-context session, delivered to spec and handed
to `review`. The IU record is your whole brief — the front certified it cold-handoff sufficient,
so a definition gap **routes out** (below), never re-opens the front's decisions in-session. The
reopen re-runs you the same way: a fresh **single-shot correction session** scoped to the finding
`verify` attributed.

## Entry contract

- **The one IU record** — read it whole before writing code, including the spec/design artefacts
  it cites. Fields per `IU-schema`; you are held to `goal` and `acceptance`, not to effort.
- **The base** — dispatch's isolated worktree on the `iu/<carrier>` branch. Under the sequential
  default it is the prior IU's merged, refactored tip: treat it as current, not legacy.
- A correction session's turn-1 state additionally carries the `finding` and the prior `dev_tip`.

## Exit contract

The unit is done when **every `acceptance` condition holds, proven by running `acceptance_check`
with the raw output shown** — stdout / exit code, never a prose claim; where no runnable command
exists, show the explicit manual verification — and `verification.end_to_end` is demonstrable.
Weak criteria are a plan gap: flag them, never mark done on effort. Commit the slice on
`iu/<carrier>` — passing state only, a conventional message derived from the `goal`, no WIP —
then hand the diff to `review` in-session before `dispatch` merges.

## Write boundary

The worktree and the IU's `files` only. Never the carrier, never `lifecycle_state` /
`gate_decisions`, never a merge (`dispatch`'s), never a shared surface. Work outside `files` that
turns out necessary is a route-out, never a silent expansion. Push, PR, and per-repo mechanics
follow the target repo's git policy (the harness's crystallised git-policy surface) and the
dispatch envelope — restated nowhere in this body.

## Discipline

Test-first, **one acceptance behaviour at a time**, refactor under green. Two local rules ride on
that default:

1. **REFACTOR's scope is the surrounding code the slice grew**, not just the new lines — the
   sequential schedule depends on the next IU inheriting your refactored base. Standard:
   `architecture-doctrine`; test shape: `test-discipline`.
2. **A non-code slice runs the same loop** as one verifiable claim → one edit → confirm, its
   `verification` fixture playing the test's role.

## Zone

The per-surface brief arrives **baked into the slice by `plan`**; work within the planned region
re-resolves nothing. A REFACTOR or fix that strays outside it re-resolves that surface's brief
via `explore` **zone mode** — the same contract `review`'s maintainability lens grades the diff
against.

## Route-outs — the return envelope

Outcomes come from the closed four-bucket vocabulary of `handoff-prompt-convention` §outcomes —
`built | review-flagged | escalated | blocked`, verbatim — `dispatch` routes on them. State the
issue and the options; never improvise past.

- **Scope expansion** → `blocked`: the affected files, why, the options (expand / split / proceed
  without).
- **Spec deviation** — `goal` or `acceptance` unmeetable as written → `blocked` with the conflict
  and evidence; a hidden design fork or a wrong spec → `escalated` for the front to re-shape.
  Never resolve a spec conflict by reinterpreting the spec mid-slice.
- **Review's bounded fix loop** — rework a confirmed finding in-session; after 2 re-entries an
  unresolved set routes out `review-flagged` with the ranked findings.

## Helpers — invoke on signal

Pass the compulsory `carrier=` on every invocation, and `stage=` on an isolated child's `META:`
envelope (form: `handoff-prompt-convention`). `stage` names a member of the closed `STAGES` set
the analyzer owns (`scripts/analyzer/schema.ts`; cite it, never re-list the members; `other` for
a non-stage helper) — and never inherits.

- Failing `acceptance_check`, cause not quickly diagnosable → `debug` (a quick, obvious fix stays
  inline).
- User-facing UI from an approved design → `design-implement`.
- A measurable perf objective on an already-correct baseline → `optimise`.
- A context gap the IU and its cited artefacts don't cover, or the zone re-resolve → `explore`,
  tightly scoped; never re-explore ground the plan covered.

## Carrier entry preflight

Before taking any workflow action, invoke `preamble` with `--node build --carrier <active-carrier-file> --carrier-id <active-carrier-id>`. Missing or invalid carrier input blocks the invocation. Preamble resolves the exact required state from its bundled graph-derived contract; continue only when the bundled runner exits zero. Never substitute a host hook or a hand-written state list.


## Required references

Before taking any action, read these bundled references:

- [IU-schema](references/IU-schema.md)
- [architecture-doctrine](references/architecture-doctrine.md)
- [test-discipline](references/test-discipline.md)

## On-demand references

At the step of need, read these bundled references:

- [git-ownership](references/git-ownership.md)
- [handoff-prompt-convention](references/handoff-prompt-convention.md)

