---
# identity — native .claude (the builder emits the primitive from these)
id: build
primitive: skill
title: Build
description: >-
  Execute a settled plan's implementation units to spec across an autonomous span — one IU per fresh
  agent context, each proven by running its acceptance_check and showing the raw evidence. Use when
  the commit-to-build gate has passed and work moves from defined to in-delivery.
when-to-use: A plan is settled and its implementation units are ready to execute — the commit-to-build gate has passed and the work is moving from defined to in-delivery.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
# CARRIER: build reads the work-item + its IU children for context; entering build is the
# projected committed→in-delivery transition (traversal-derived, not gated — D44). No write-edge.
# WORKTREE-ISOLATION: inline execution surface, not a node/edge — native isolation:'worktree'
# + script fallback. Referenced inline in body prose only (Non-nodes, graph-map).
# IN-SPAN REVIEWER (CF-2): a recommended fresh-context reviewer subagent, dispatched in prose —
# NOT a graph node or edge; it does not replace the downstream `review` stage.
# PER-IU COST (D69 amends D57): the body emits the STRUCTURAL unit-complete (IU id + acceptance
# evidence) only — NO token numbers. Cost is HOOK-captured (PostToolUse native usage → unit-usage),
# joined by scope id. A body cannot see cache reads, so a body-emitted token figure is fabrication
# (the ~25x error); the preamble's do-NOT-emit list bars tokens_per_iu and the publisher rejects it.
# INVOKED SUB-PATHS (wired, caller-side convention): build invokes debug (Iron-Law fix path for a
# failing unit), design-implement (a UI unit), optimise (a perf-critical unit) — the inbound invoke
# is authored here, on build's side; the target nodes declare no inbound edge.
# WIRED (wiring pass run): precedes review; the review→build and reconcile→build correction loops
# (can-follow review, can-follow reconcile [arc=dev-sprint]). STILL DEFERRED (F7): the plan→build
# loop is carried on plan's side (can-follow plan) and the `.worktreeinclude` reference — wired once
# those land.
edges:
  invokes:
    - { id: explore }
    - { id: debug }
    - { id: design-implement }
    - { id: optimise }
  composes-into:
    - { id: dev-sprint,  stage: build }
    - { id: incremental, stage: build }
  references:
    - { id: IU-schema,                load: import }
    - { id: carrier-interface,        load: on-demand }
    - { id: test-discipline,          load: on-demand }
  can-follow:
    - { id: review }
    - { id: reconcile, arc: dev-sprint }
  precedes:
    - { id: review }
# analytics — the loop
goals:
  - outcome: Each implementation unit is delivered to its stated acceptance criteria, spec-faithfully, without operator hand-holding through the autonomous span.
    metric: IU acceptance-criteria pass-rate at handoff to review; review findings per IU traced to a spec deviation present in the implementation (not a spec gap).
    earns-keep: spec-deviation findings at review trend below the pre-build baseline over N sprints; a build span that routinely fails acceptance criteria it could have verified itself is a process gap, not a capability gap.
  - outcome: Rework is caught and fixed within the build span, not deferred to review.
    metric: fraction of IUs requiring a review→build re-entry vs units where build caught and resolved the issue in-span; average re-entry count per IU.
    earns-keep: re-entry rate trends down as the span matures; a span that never self-corrects despite clear acceptance criteria is a calibration signal for the autonomous depth setting.
  - outcome: The per-IU build cost is measured (hook-captured, not body-emitted), so the single-agent context budget is an empirical dial and decomposition quality is observable.
    metric: per-IU cost captured by the plugin hook (unit-usage, a 6-component token_usage joined to the unit-complete by scope id); measure-outcomes derives the distribution and the context-pressure over-budget share (with a coverage denominator) against the harness budget.
    earns-keep: over-budget share trends toward zero as decomposition matures; a persistently high share is a plan decomposition-quality signal (IUs drawn too coarse), not a build capability gap.
status: v0.5.0 — 2026-06-10
---

# Build

You are the execution stage of the dev-sprint. You take a **settled plan** — its carrier and the
**implementation units** it decomposed the work into — and deliver the planned change to spec across
a **long autonomous span**. You kick off **collaboratively** (read the work, confirm scope and mode),
then hand off to that autonomous span. You surface blockers and scope expansions to the operator;
you do not improvise past them.

The `IU-schema` reference (imported) defines the field contract every implementation unit (IU)
carries from `plan` into `build`: `id`, `goal`, `files`, `dependencies`, `acceptance`,
`acceptance_check`, `size`. These are your spec. You are held to the `goal` and the `acceptance`
criteria of each unit — not to effort.

## What you read, and what you must not write

**Read for context; build against acceptance.**

- **The carrier** — read it for `lifecycle_state`, prior `transition_history`, and the objective the
  work serves. Entering `build` is the projected `committed → in-delivery` transition: *traversal-derived*
  from your node-enter event, not a gate you hold. You emit the event; the projection picks it up.
- **The IU children** — read all of the carrier's `children[]` records before starting. The IU schema
  governs each: `goal`, `files`, `dependencies`, `acceptance`, `acceptance_check`, `size`.
- **Scope contract** — the IU's `files` field is the scope boundary. If work outside those files is
  needed, surface it to the operator before expanding. Never expand silently.

**You do not write the carrier.** You write only to the artefacts named in the IU scope — the source
files, tests, and any docs the IU owns. Completing this stage is the signal the projection picks up to
advance `current_stage`; you write no carrier field.

## Kick-off (collaborative phase)

Before the autonomous span begins, run the kick-off collaboratively with the operator:

1. **Read the carrier and all IU children.** **If `arc: incremental` / `carrier_kind:
   standalone-iu`:** skip the children / unit-count read — the single slice *is* the unit; go
   straight to the **Incremental arc — build mode** section below. Otherwise (dev-sprint): surface
   the unit count and dependency order. Flag now (not mid-span) any IU whose `acceptance` is thin,
   whose `acceptance_check` is missing, or whose `files` scope looks broader than `size` suggests.
2. **Flag horizontal IUs.** When an IU's `files` span a single layer (only model, only view) and its
   `acceptance` carries no integration check, suggest expanding it to a thin end-to-end slice — one
   interface path through the affected layers — before the span begins. A horizontal layer that defers
   integration to a later IU is the "outrunning your headlights" failure mode. **Under the zone matrix
   this is the column discipline made explicit:** the unit is a **vertical slice** (`zone: {vertical}`)
   — one experience across the layers it touches, graded by the vertical's experience test — and a
   bare-cell IU (`zone: {vertical, horizontal}`) is the single-layer exception, not the norm.
3. **Fill context gaps.** Invoke **`explore`** scoped to the IU's target area (`repo` / `learnings` /
   `framework-docs` / `best-practices`) if codebase context is needed. Pass a tight scope: the IU's
   `files` set and the question its `goal` raises. Consume the digest; do not re-explore ground the plan
   already covered.
4. **Confirm the execution model** (see below). The **default is one IU = one fresh agent context**;
   confirm it, or the operator's deliberate exception.
5. **State the build plan** — for serial/parallel: the sequencing, the worktree layout (parallel), and
   the acceptance-check cadence. Surface open questions. Receive the operator's go-ahead.

The collaborative phase ends when the operator confirms and the autonomous span begins.

## Execution model — one IU, one fresh context (default)

A long context degrades: an agent's best work happens in a fresh window. So the default is **one IU =
one fresh agent context**, not main-thread serial. Pick the dispatch at kick-off:

- **serial-subagent** — **3+ dependent IUs.** Dispatch each IU to its own fresh-context subagent in
  dependency order; each receives the IU's full context bundle (carrier context, the IU record, the
  imported `IU-schema`, and any explore digest for its scope — including, when the IU carries a `zone`
  coordinate, the **column zone digest** from `explore`'s `zone` mode: the experience contract + the
  column's ranked rules + the cross-layer path, so the agent holds the whole column and reasons over
  its cells with the UX as the end goal) and returns a unit-complete summary.
- **parallel-subagent** — **independent IUs** (no shared `files`, no dependency edges). The
  worktree-isolated path below. Run a Parallel Safety Check first.
- **inline (main thread)** — the **exception**, not the rule. Reserve for a single tiny (XS/S) unit, or
  when the operator deliberately wants context carry-forward between two tightly-coupled units (e.g. a
  schema migration immediately followed by the code that uses it, where the first step's context
  genuinely informs the second).

## Autonomous span

From kick-off to review handoff, you run the span unattended. The discipline:

- **One IU at a time** (its own fresh context per the model above). Do not start the next IU until the
  current one passes its acceptance check or its blocker is surfaced.
- **Run the acceptance_check; show the evidence.** An IU is done when it passes its `acceptance`
  criteria, proven by running its `acceptance_check`. The unit-complete event carries the **raw output**
  of that check — test stdout / exit code — **shown, not asserted**. Never substitute a prose summary
  ("tests pass") for the actual output. Where no runnable command exists, show the explicit manual
  verification you performed. Weak criteria are a *plan* gap; flag them, but never mark a unit done on
  effort.
- **In-span review (recommended for M+ IUs).** After an IU passes its acceptance check and **before**
  emitting unit-complete, dispatch a lightweight **fresh-context reviewer subagent** against the IU's
  diff + acceptance criteria. A fresh context sees only the diff and the criteria, not the reasoning that
  produced the change, so it judges the result on its own terms — the longer the span runs unattended,
  the more that independent check matters. This is an in-span pre-check; it **does not replace** the
  downstream `review` stage. Cost-gated: recommended for M+ IUs, skip for trivial ones.
- **Incremental commit per IU.** On acceptance + tests-pass, commit the unit with a conventional message
  derived from the IU `goal`. Commit only passing state — if you cannot write a meaningful commit
  message, the unit is not done. No `WIP:` messages. In worktree-isolated parallel mode each subagent
  commits within its own branch; in a shared-directory fallback only the orchestrator commits.
- **Emit unit-complete.** After the commit, emit the **structural unit-complete event** carrying the
  IU `id` and the raw `acceptance_check` output — the **acceptance evidence only the body knows** — per
  the imported `instrumentation-preamble`. **Emit NO token numbers**: the per-IU cost is captured by the
  plugin hook (a `unit-usage` event joined to this one by scope id), because a body cannot see cache
  reads and a body-emitted figure is fabrication (the preamble's do-NOT-emit list; the publisher
  rejects `tokens_per_iu`). This event is the projection's structural signal; it is not a write to the carrier.
- **Catch and repair in-span.** When a unit fails its acceptance check, diagnose and fix it within the
  span before emitting the complete event. Surface a passing unit to review, not one that "mostly works."
  In-span rework is cheaper than a review→build re-entry.
- **Surface blockers; do not improvise past them.** See below.

When all units are done, emit the **stage-complete event** (the projection advances `current_stage`)
and hand off to review.

### Parallel mode — Safety Check and worktree lifecycle

Each IU runs as a worker agent in an **isolated worktree** — a native `isolation:'worktree'` checkout
scoped to its `files` set, with a script fallback where the native mechanism is unavailable. Isolation
also eliminates **git-index contention and test interference**, which make shared-directory concurrency
unsafe even when files do not overlap.

**Parallel Safety Check (before dispatch):**

1. Build a **file-to-unit map** from each candidate IU's `files`.
2. Check for **intersection** across units.
3. Apply the **overlap decision tree:**
   - **no overlap** → safe; dispatch in parallel.
   - **overlap + worktree isolation available** → proceed, but **log the predicted conflict** so the
     merge step knows which branches to expect conflicts on.
   - **overlap + isolation unavailable** → **downgrade that pair to serial** with a logged reason.

**Worktree teardown (after merging each branch, order-bearing — do not reorder):**

1. Run the test suite on the merged result.
2. Unlock the worktree: `git worktree unlock <path>`.
3. Remove the worktree: `git worktree remove <path>`.
4. Delete the branch: `git branch -d <branch>`.

**SAFETY — always lowercase `-d`, never `-D`.** `git branch -d` refuses to delete a branch whose commits
are not merged; that refusal is the guard that prevents losing unmerged work. `-D` force-deletes and
destroys it. Omitting the teardown leaves orphan branches and locked worktrees accumulating silently.

The orchestrating span merges completed units in dependency order before review handoff.

## Incremental arc — build mode

The above is the dev-sprint behaviour (a work-item's IU children, multi-IU spans). When build is
reached on the **`incremental` arc** carrying a **standalone IU** (`carrier_kind: standalone-iu`),
the single slice *is* the work, and the discipline is the **tracer-bullet inner loop** — vertical,
one test at a time, not all-tests-then-all-code:

```
For the standalone slice:
  TRACER BULLET:  write ONE test for the first behaviour → RED (fails)
                  → minimal code to pass → GREEN  (the path is proven end-to-end)
  INCREMENTAL:    for each remaining behaviour in `acceptance`:
                    RED:   write the next test → fails
                    GREEN: minimal code → passes
                  (one test at a time; only enough code to pass; no speculative features)
  REFACTOR:       once all acceptance tests are GREEN, refactor under green
  DONE:           every `acceptance` condition is an observable passing test
                  AND `verification.end_to_end` is demonstrable → emit unit-complete
```

- **Ordering rule — vertical, not horizontal.** Never write all the tests then all the code. Prove
  one behaviour end-to-end, then add the next. The first test is the tracer bullet: it lights up the
  whole path before any behaviour is filled in.
- **Minimal-code rule.** Write only enough code to turn the current RED test GREEN. No speculative
  features, no layers the acceptance set does not demand. Speculation is what `refactor`-under-green
  consolidates, not what build front-loads.
- **Non-code slice.** For a slice that edits a reference or doc (no runnable test), the analogue is
  **one verifiable claim → one edit → confirm**, with the slice's `verification` fixture playing the
  test's role — same vertical discipline, claim by claim.
- **Test shape — `test-discipline`.** Each test the loop writes follows `test-discipline`: it verifies
  behaviour through the public interface (not implementation) and mocks only at system boundaries. The
  loop owns the *order* tests are written; the reference owns their *quality*.

This is the build-mode for `arc: incremental` / `carrier_kind: standalone-iu` only; the dev-sprint
multi-IU behaviour above is unchanged. It maps onto build's existing acceptance-driven done signal —
the addition is the *ordering* and *minimal-code* rules, not a new schema field or new nodes.

### HITL pause

A standalone IU carries `slice_type: AFK | HITL`. When `slice_type == HITL` **and
`hitl_point.stage == build`**, build pauses at the decision point — surfacing `hitl_point.decision`;
it does not run past it unattended. If `hitl_point.stage` is a **downstream** stage (e.g. `review`),
build does **not** pause — it hands off, and the owning stage honours the pause. An **AFK** slice
runs the loop above unattended end-to-end. (A HITL point that turns out to be a genuine design fork
is a *promote* signal, not a build decision.)

### Carrier consumption (the carrier interface)

Build consumes its carrier through the **carrier-interface** (`references`, on-demand): it reads
`carrier_kind` and `arc` to know which arc it is on, and on the incremental arc reads the standalone
fields (`improves`, `slice_type`, `verification`) **only behind the `carrier_kind == standalone-iu`
check** — it never assumes work-item fields. The **unit-complete and stage events are carrier-keyed**
(carrier id + `carrier_kind` + `arc`), so the projection keeps the two arcs' `current_stage` separate.

## Scope expansions and spec deviations

Two situations require operator contact mid-span. In both: pause the span at the affected IU, surface the
issue, receive a decision, resume. All other IUs continue if they have no dependency on the affected one.

1. **Scope expansion — STOP.** Work outside the IU's `files` field turns out to be necessary. State the
   affected file(s), why they are needed, and the options (expand scope, split into a new IU, proceed
   without). **Never expand scope silently** — silent expansion defeats the plan's decomposition and the
   carrier's scope record.
2. **Spec deviation — STOP.** The IU's `goal` or `acceptance` cannot be met as written (a dependency is
   broken; an acceptance criterion conflicts with the codebase state). State the conflict, the evidence,
   and the options. **Never resolve a spec conflict by unilaterally reinterpreting the spec** — the spec
   is the plan's settled decision, not yours to rewrite mid-span.

## Invoked sub-paths (within the span)

Build reaches into three sub-path nodes from inside the autonomous span. Each is an `invokes` edge
(authored on build's side); control returns to the build span, which then emits the unit's
acceptance evidence as usual. Reach for one only when the unit warrants it:

- **→ `debug`** (Iron-Law fix path): when a unit fails its `acceptance_check` (a failing test,
  runtime error, or regression) **and the cause is not diagnosable quickly in-span**, invoke `debug`
  rather than guess-patching. `debug` runs the root-cause-first loop (reproduce → confirm one cause →
  fix) and hands the fixed, re-verified unit back to the span. A quick, obvious fix stays inline;
  escalate into `debug` when the failure resists a fast diagnosis.
- **→ `design-implement`** (UI implementation unit): when the IU builds **user-facing UI from an
  approved design** (an approved mockup, a design doc, or a from-scratch UI description in the IU's
  `goal`), invoke `design-implement` to produce the production-quality surface. It returns the built,
  viewport-verified UI to the span, which proves the unit against its `acceptance_check` as normal.
- **→ `optimise`** (perf-critical unit): when a built unit has a **measurable objective worth
  improving** (runtime perf, or agent-traversal cost) and its baseline is already correct, invoke
  `optimise` — generate-measure-select across N variants, keeping the variant that beats the baseline
  while still passing the unit's gate. Reach for it only where the objective justifies the
  variant-generation cost; most units never need it.

## Process seams

Wired now (in the frontmatter):

- **→ `review`** (`precedes`, wired): build hands off to review after stage-complete.
- **← `review`** (fix loop, `can-follow`, wired): a review finding re-enters build at a specific IU.
- **← `reconcile`** (rework loop, `can-follow` [arc=dev-sprint], wired): a reconcile rework decision re-enters build.

Still deferred (F7 — wired once the endpoint/ref lands):

- **← `plan`** (`can-follow` + re-plan loop): build follows a settled plan and a re-plan re-enters build;
  the forward edge is carried on `plan`'s side (`plan precedes build`), so build declares no `plan` edge.
- **`.worktreeinclude` reference**: the committed file-copy list for worktree isolation
  (`graph/_refs/.worktreeinclude`); the `references` edge is deferred until the ref is on disk.

## Output

- **All modes:** the **IU set delivered** — each unit passing its acceptance criteria, evidenced by the
  raw `acceptance_check` output. A **structural unit-complete event** per IU (carrying the IU `id` and the
  raw evidence — **no token numbers**; the hook captures cost as a joined `unit-usage`) and an **incremental
  commit** per IU. A **stage-complete event** when all units are done. No carrier write.
- **Parallel mode:** a **merged result** assembled from per-worktree worker outputs in dependency order,
  after the worktree-teardown sequence, before review handoff.
- **Blocker report** (if triggered): the affected IU, the blocker, the options — surfaced to the operator
  mid-span when a scope expansion or spec deviation cannot be resolved in-span.
