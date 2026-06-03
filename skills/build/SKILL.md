---
name: "build"
description: "Execute the planned implementation units to spec across a long autonomous span — kick off collaboratively, then run autonomously through build, checkpointing each unit on acceptance and surfacing blockers rather than improvising past them. Use when: A plan is settled and its implementation units are ready to execute — the commit-to-build gate has passed and the work is moving from defined to in-delivery. Use inline for a single small unit, serial for a sequenced set, parallel for independent units that can run concurrently in isolated worktrees."
---


# Build

You are the execution stage of the dev-sprint. You take a **settled plan** — its carrier and the
**implementation units** it decomposed the work into — and deliver the planned change to spec
across a **long autonomous span**. You kick off **collaboratively** (read the work, confirm scope
and mode), then hand off to that autonomous span. You surface blockers and scope expansions to the
operator; you do not improvise past them.

The `IU-schema` reference (imported) defines the field contract every implementation unit (IU)
carries from `plan` into `build`: `id`, `goal`, `files`, `dependencies`, `acceptance`, `size`.
These are your spec. You are held to the `goal` and the `acceptance` criteria of each unit — not
to effort.

## What you read, and what you must not write

**Read for context; build against acceptance.**

- **The carrier** — read it for `lifecycle_state`, prior `transition_history`, and the objective
  the work serves. Entering `build` is the projected `committed → in-delivery` transition:
  it is *traversal-derived* from your node-enter event, not a gate you hold. You emit that event;
  the projection picks it up. You do not write the carrier.
- **The IU children** — read all of the carrier's `children[]` records (the plan's impl-unit
  breakdown) before starting. The IU schema governs each: `goal`, `files`, `dependencies`,
  `acceptance`, `size`. These are the spec you build against.
- **Scope contract** — the IU's `files` field is the scope boundary. If work outside those files
  is needed, surface it to the operator before expanding. Never expand silently.

You **do not write the carrier.** You write only to the artefacts named in the IU scope — the
source files, tests, and any docs the IU owns. Completing this stage is the signal the projection
picks up to advance the carrier's `current_stage`; you write no carrier field.

## Kick-off (collaborative phase)

Before the autonomous span begins, run the kick-off collaboratively with the operator:

1. **Read the carrier and all IU children.** Surface the unit count, the dependency order, and
   any IUs whose `acceptance` criteria are thin or whose `files` scope looks broader than `size`
   suggests — flag these now, not mid-span.
2. **Fill context gaps.** Invoke **`explore`** scoped to the IU's target area (`repo` / `learnings`
   / `framework-docs` / `best-practices`) if the codebase context is needed to build confidently.
   Pass a tight scope: the IU's `files` set and the question the IU's `goal` raises. Consume the
   digest; do not explore ground already covered by the plan.
3. **Confirm mode** — `inline` / `serial` / `parallel` — based on IU count, inter-IU dependencies,
   and the operator's signal. Default: `inline` for a single XS/S unit; `serial` for a sequenced
   set; `parallel` for independent units of M+ size.
4. **State the build plan** — for `serial` / `parallel`: the sequencing, the worktree layout (if
   parallel), and the acceptance-check cadence. Surface open questions. Receive the operator's
   go-ahead.

The collaborative phase ends when the operator confirms and the autonomous span begins.

## Autonomous span

From kick-off to review handoff, you run the span unattended. The span discipline:

- **One IU at a time** (inline/serial) or one IU per worker agent (parallel). Do not start the next
  IU until the current one passes its acceptance check or the blocker is surfaced.
- **Acceptance-driven done signal.** An IU is complete when every acceptance criterion in its
  `acceptance` field is satisfied — observable, checked, not assumed. Weak criteria are a plan
  gap; flag them, but do not mark the unit done on effort.
- **Checkpoint on unit completion.** After each IU passes acceptance, emit a **unit-complete
  event** (carrying the IU `id` and the evidence that acceptance was met). This is the projection's
  signal; it is not a write to the carrier.
- **Catch and repair in-span.** When a unit fails its acceptance check, diagnose the gap and fix it
  within the span before emitting the complete event. The goal is to surface a passing unit to
  review, not a unit that "mostly works." Rework caught in-span is cheaper than a review→build
  re-entry.
- **Surface blockers; do not improvise past them.** If a dependency IU is incomplete or broken, if
  the `files` scope turns out to be wrong, or if the acceptance criteria are genuinely ambiguous,
  pause the span and surface the blocker to the operator. State the blocker, the affected IU, and
  the choices. Wait for a decision before continuing.

### Worktree isolation (parallel mode)

In `parallel` mode, each IU runs in an **isolated worktree** — a native `isolation:'worktree'`
checkout scoped to the IU's `files` set, with a script fallback where the native mechanism is
unavailable. Isolation prevents in-flight IUs from interfering with each other's scope. Each
worker agent receives its IU's full context bundle (carrier context, the IU record, the
`IU-schema`, and any explore digest produced at kick-off for its scope) and returns a
unit-complete summary with the acceptance evidence. The orchestrating span merges completed units
in dependency order before review handoff.

## Scope expansions and spec deviations

Two situations require operator contact mid-span:

1. **Scope expansion** — work outside the IU's `files` field turns out to be necessary. State
   the affected file(s), why they are needed, and the options (expand scope, split into a new IU,
   proceed without). Do not expand silently.
2. **Spec deviation** — the IU's `goal` or `acceptance` criteria cannot be met as written (a
   dependency is broken, the acceptance criterion describes behaviour that conflicts with the
   codebase state). State the conflict, the evidence, and the options. Do not resolve the conflict
   by a unilateral reinterpretation of the spec.

In both cases, pause the span at the affected IU, surface the issue, receive a decision, and
resume. All other IUs continue if they have no dependency on the affected one.

## Modes

Render as branches of this one skill. The mode is set at kick-off and governs the span.

### inline

One IU, running in the main thread. No worktree isolation, no worker agents. The autonomous span
is the direct execution of the IU against its acceptance criteria. Use for XS/S units with narrow
`files` scope and no inter-IU dependencies.

### serial

Multiple IUs, running in the main thread one after another, in dependency order. Each unit passes
its acceptance check before the next begins. Use when IUs have dependencies on each other's output
or when context must carry forward between units (e.g. a schema migration followed by the code that
uses it).

### parallel

Multiple independent IUs, each running as a **worker agent in an isolated worktree** scoped to its
`files` set. The orchestrating span dispatches all units whose dependencies are met, collects their
unit-complete summaries, and merges the results in dependency order. Use when IUs are genuinely
independent (no shared `files`, no dependency edges between them) and the parallel speedup is worth
the merge step. M+ size IUs benefit most; XS units are usually cheaper serial.

## Process seams (deferred edges)

- **← `plan`** (`can-follow`, wiring pass): build follows a settled plan; the `can-follow plan`
  process edge is deferred until `plan` exists and the wiring pass runs.
- **→ `review`** (`precedes`, wiring pass): build hands off to review; the `precedes review` edge
  is deferred to the wiring pass.
- **← `review`** (fix loop, `can-follow`, wiring pass): a review finding triggers a `review → build`
  re-entry; the `can-follow` edge is deferred to the wiring pass.
- **← `reconcile`** (rework loop, `can-follow`, wiring pass): a reconcile rework decision triggers a
  `reconcile → build` re-entry; the `can-follow` edge is deferred to the wiring pass.
- **← `plan`** (re-plan loop, `can-follow`, wiring pass): a re-plan at `plan` triggers re-entry into
  `build`; the `can-follow` edge is deferred to the wiring pass.
- **→ `debug`** (Iron-Law fix path, wave 2): when a failing test or runtime error cannot be
  diagnosed quickly, `build` invokes `debug` (root-cause-first fix discipline). `debug` is a wave-2
  sub-arc — not yet authored. Named here in prose; the `invokes debug` edge is deferred until the
  node exists.
- **`.worktreeinclude` reference** (wiring pass): the `.worktreeinclude` ref (`graph/_refs/
  .worktreeinclude`) is listed in the graph-map as the committed file-copy list for worktree
  isolation. The ref file is not yet on disk; the `references` edge is deferred until it is
  authored.

## Output

- **All modes:** the **IU set delivered** — each unit passing its stated acceptance criteria,
  evidenced. A **unit-complete event** per IU (the projection's signal). A **stage-complete
  event** when all units are done (the projection advances `current_stage`). No carrier write.
- **Parallel mode:** a **merged result** assembled from the per-worktree worker outputs, in
  dependency order, before review handoff.
- **Blocker report** (if triggered): the affected IU, the blocker, the options — surfaced to the
  operator mid-span when a scope expansion or spec deviation cannot be resolved in-span.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/instrumentation-preamble.md

