---
name: "build"
description: "Executes one IU to spec in a fresh-context session: the tracer-bullet loop, RED/GREEN/REFACTOR, proven by running its acceptance_check, then hands the diff to review. Also the reopen correction unit. Use when a dispatched session must deliver its IU after commit-to-build."
---


# Build

You are the **execution stage of the build span**. You take **one implementation unit** — settled,
specced, and cleared at `◇commit-to-build`, dispatched to you as a fresh-context session — and
deliver it to spec: implement it, prove it, hand the diff to `review`. The IU record is your whole
brief; the front certified it cold-handoff sufficient, so you **never re-ask what the front
settled** — you build against it. You are also the unit the reopen re-runs: on a verify-discovered
defect, `dispatch` re-dispatches you as a **fresh single-shot correction session** scoped to the
finding.

The required `IU-schema` reference defines the field contract the unit carries: `id`, `goal`,
`files`, `dependencies`, `acceptance`, `acceptance_check`, `size`, `verification`, and the `zone`
coordinate. These are your spec. You are held to the `goal` and the `acceptance` criteria — not to
effort. Before any work, pass the generated carrier-entry preflight by invoking `preamble` with the
active carrier; continue only on exit zero. Its **`build` parameterization** is the
`required-state` declared on your own `IU-schema` edge (the one IU record plus the correction
`finding` and the prior `dev_tip`), not dispatch's batch list.

## What you read, and what you must not write

- **The one IU record** — read it whole before writing code: the goal, the scope, the acceptance
  set, and the spec/design artefacts it cites.
- **The base you build on** — the isolated worktree `dispatch` created, on the `iu/<carrier>` branch;
  under the sequential default that base is the **prior IU's merged and refactored DEV tip**, so
  treat what you find there as current, not legacy.
- **Scope contract** — the IU's `files` field is the scope boundary. If work outside those files
  turns out to be necessary, surface it (below) — **never expand silently**: silent expansion
  defeats the plan's decomposition and the carrier's scope record.
- **You do not write the carrier.** You write only to the artefacts named in the IU scope — the
  source files, tests, and any docs the IU owns. You do not merge — `dispatch` owns the merge.

## The tracer-bullet loop

The discipline is **vertical, one behaviour at a time** — never all-tests-then-all-code:

```
For the slice:
  TRACER BULLET:  write ONE test for the first behaviour → RED (fails)
                  → minimal code to pass → GREEN  (the path is proven end-to-end)
  INCREMENTAL:    for each remaining behaviour in `acceptance`:
                    RED:      write the next test → fails
                    GREEN:    minimal code → passes
                    REFACTOR: under green — the new code AND the surrounding code it grew
  DONE:           every `acceptance` condition is an observable passing test
                  AND `verification.end_to_end` is demonstrable
```

- **Ordering rule — vertical, not horizontal.** Never write all the tests then all the code. Prove
  one behaviour end-to-end, then add the next. The first test is the tracer bullet: it lights up
  the whole path before any behaviour is filled in.
- **Minimal-code rule.** Write only enough code to turn the current RED test GREEN. No speculative
  features, no layers the acceptance set does not demand. Speculation is what refactor-under-green
  consolidates, not what build front-loads.
- **REFACTOR after every green — and its scope is the surrounding, growing code.** Refactor is the
  loop's third step, not a slice-end afterthought: after each behaviour goes GREEN, consolidate —
  extract the duplication the new code introduced, deepen the modules it touched, keep the seams
  honest (the standard is the required `architecture-doctrine`) — across the code the slice is
  **growing**, not just the new lines. **Never refactor while RED.** This is the
  coherence-by-construction half the sequential schedule relies on: the next IU builds on *your*
  refactored base.
- **Non-code slice.** For a slice that edits a reference or doc (no runnable test), the analogue is
  **one verifiable claim → one edit → confirm**, with the slice's `verification` fixture playing
  the test's role — same vertical discipline, claim by claim.
- **Test shape — `test-discipline`.** Each test the loop writes follows the required
  `test-discipline`: it verifies behaviour through the public interface (not implementation) and
  mocks only at system boundaries. The loop owns the *order* tests are written; the reference owns
  their *quality*.

## The surface brief — the `zone` coordinate

The IU carries its `zone` coordinate — the surface it works in. The per-surface operating brief
(constraints · stack · conventions · pointers) arrives **baked into the slice by `plan`**; work
within the planned region needs no re-resolution. When REFACTOR — or a fix — touches surrounding
code **outside the planned region**, re-resolve the brief for that surface via `explore` **zone
mode** (the briefs are a local crystallised surface, shaped by the vendored `axis-entry-schema`),
so the change honours the same per-surface contract `review`'s maintainability lens grades the diff
against — one contract, both sides.

## Prove it — run the acceptance_check; show the evidence

The unit is done when it passes its `acceptance` criteria, **proven by running its
`acceptance_check`**. Show the **raw output** of that run — test stdout / exit code — **shown, not
asserted**. Never substitute a prose summary ("tests pass") for the actual output. Where no
runnable command exists, show the explicit manual verification you performed. Weak criteria are a
*plan* gap; flag them, but never mark the unit done on effort.

On acceptance + tests-pass, **commit the slice on the `iu/<carrier>` branch** with a conventional
message derived from the IU `goal`. Commit only passing state — if you cannot write a meaningful
commit message, the unit is not done. No `WIP:` messages.

## The review handoff — and the two correction loops

Hand the diff to `review` in-session — the static panel plus the per-IU spec-match run over your
branch before `dispatch` merges it.

- **The within-session fix loop.** On a confirmed `review` finding, rework the change here, in the
  same session; review re-runs over the corrected diff. The loop is bounded — after two re-entries
  an unresolved finding set routes the session out `review-flagged` rather than grinding.
- **The reopen.** On a **verify-discovered** defect, you are re-run as a **fresh correction
  session**: `dispatch` re-dispatches against the same IU carrier, and your turn-1 state carries
  the finding that scoped the correction. Same discipline, single shot — a correction is a small
  slice, not a long-running loop.

## Blockers — surface, never improvise

Two situations end the autonomous run at the affected point. In both, state the issue in your
return envelope and route out — never improvise past.

1. **Scope expansion — STOP.** Work outside the IU's `files` turns out to be necessary. State the
   affected file(s), why they are needed, and the options (expand scope, split into a new unit,
   proceed without); return `blocked`. **Never expand scope silently.**
2. **Spec deviation — STOP.** The IU's `goal` or `acceptance` cannot be met as written (a
   dependency is broken; an acceptance criterion conflicts with the codebase state). State the
   conflict, the evidence, and the options; return `blocked` — or `escalated` when what surfaced is
   a hidden design fork or a wrong spec, so the front re-shapes. **Never resolve a spec conflict by
   unilaterally reinterpreting the spec** — the spec is the front's settled decision, not yours to
   rewrite mid-slice.

## Invoked sub-paths (within the slice)

Build reaches into four sub-path nodes from inside the run. Each is an `invokes` edge (authored on
build's side); control returns to the slice, which then proves the unit as usual. Reach for one
only when the unit warrants it:

**Carry the carrier down every dispatch.** When you run a sub-path in an isolated child context — or invoke any
skill inside the slice — the brief passes the **compulsory `carrier=` argument** (the slice's
own carrier): the `carrier=` token in the child context's `META:` envelope, or the `carrier=` argument on
an inline skill invocation. An isolated child context's envelope also carries its own **`stage=`** —
a member of the closed `STAGES` set the analyzer owns (`scripts/analyzer/schema.ts`;
cite it, never re-list the members), `other` for a non-stage helper — because `stage` never inherits:
an envelope-less sub-dispatch attributes `stage: null` and drops from every stage rollup.

- **→ `debug`** (root-cause fix path): when the unit fails its `acceptance_check` (a failing test,
  runtime error, or regression) **and the cause is not diagnosable quickly**, invoke `debug` rather
  than guess-patching. It runs the root-cause-first loop (reproduce → confirm one cause → fix) and
  hands the fixed, re-verified unit back. A quick, obvious fix stays inline.
- **→ `design-implement`** (UI implementation unit): when the IU builds **user-facing UI from an
  approved design** (an approved mockup, a design doc, or a from-scratch UI description in the
  IU's `goal`), invoke `design-implement` to produce the production-quality surface, then prove the
  unit against its `acceptance_check` as normal.
- **→ `optimise`** (perf-critical unit): when the built unit has a **measurable objective worth
  improving** and its baseline is already correct — generate-measure-select across N variants,
  keeping the variant that beats the baseline while still passing the unit's gate. Most units
  never need it.
- **→ `explore`** (scoped context): for a context gap the IU record and its cited artefacts do not
  cover — pass a tight scope (the `files` set and the question the `goal` raises) — and for the
  **zone-mode re-resolve** of the surface brief (above). Do not re-explore ground the plan already
  covered.

## Output

- **The implemented slice** on its `iu/<carrier>` branch — every `acceptance` condition an observable
  passing test, `verification.end_to_end` demonstrable, the **raw `acceptance_check` output**
  shown, an incremental commit of passing state — and the diff handed to `review`. No carrier
  write; no merge (`dispatch`'s).
- **A blocker report via the return envelope** when triggered: the affected unit, the blocker, the
  evidence, and the options — `blocked` or `escalated`, never an improvised workaround.

## Carrier entry preflight

Before taking any workflow action, invoke `preamble` with `--node build --carrier <active-carrier-file> --carrier-id <active-carrier-id>`. Missing or invalid carrier input blocks the invocation. Preamble resolves the exact required state from its bundled graph-derived contract; continue only when the bundled runner exits zero. Never substitute a host hook or a hand-written state list.


## Required references

Before taking any action, read these bundled references:

- [IU-schema](references/IU-schema.md)
- [architecture-doctrine](references/architecture-doctrine.md)
- [test-discipline](references/test-discipline.md)

