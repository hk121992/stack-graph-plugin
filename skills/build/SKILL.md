---
name: "build"
description: ">- Use when: A plan is settled and its implementation units are ready to execute — the commit-to-build gate has passed and the work is moving from defined to in-delivery."
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

1. **Read the carrier and all IU children.** Surface the unit count and dependency order. Flag now
   (not mid-span) any IU whose `acceptance` is thin, whose `acceptance_check` is missing, or whose
   `files` scope looks broader than `size` suggests.
2. **Flag horizontal IUs.** When an IU's `files` span a single layer (only model, only view) and its
   `acceptance` carries no integration check, suggest expanding it to a thin end-to-end slice — one
   interface path through the affected layers — before the span begins. A horizontal layer that defers
   integration to a later IU is the "outrunning your headlights" failure mode.
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
  imported `IU-schema`, and any explore digest for its scope) and returns a unit-complete summary.
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
- **Emit unit-complete.** After the commit, emit the **unit-complete event** carrying the IU `id`, the
  raw `acceptance_check` output, and **`tokens_per_iu`** — the per-IU build token cost — into the
  analytics product-outcomes event log (per the imported `instrumentation-preamble`). This is the
  projection's signal; it is not a write to the carrier.
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

## Process seams (deferred edges)

- **← `plan`** (`can-follow`, wiring pass): build follows a settled plan; deferred until `plan` exists.
- **→ `review`** (`precedes`, wiring pass): build hands off to review after stage-complete.
- **← `review`** (fix loop, `can-follow`, wiring pass): a review finding re-enters build at a specific IU.
- **← `reconcile`** (rework loop, `can-follow`, wiring pass): a reconcile rework decision re-enters build.
- **← `plan`** (re-plan loop, `can-follow`, wiring pass): a re-plan re-enters build.
- **→ `debug`** (Iron-Law fix path, wave 2): when a failing check or runtime error cannot be diagnosed
  quickly, build invokes `debug` (root-cause-first). `debug` is not yet authored; the `invokes debug`
  edge is deferred until it exists.
- **`.worktreeinclude` reference** (wiring pass): the committed file-copy list for worktree isolation
  (`graph/_refs/.worktreeinclude`); the `references` edge is deferred until the ref is on disk.

## Output

- **All modes:** the **IU set delivered** — each unit passing its acceptance criteria, evidenced by the
  raw `acceptance_check` output. A **unit-complete event** per IU (carrying the IU `id`, the raw evidence,
  and `tokens_per_iu`) and an **incremental commit** per IU. A **stage-complete event** when all units are
  done. No carrier write.
- **Parallel mode:** a **merged result** assembled from per-worktree worker outputs in dependency order,
  after the worktree-teardown sequence, before review handoff.
- **Blocker report** (if triggered): the affected IU, the blocker, the options — surfaced to the operator
  mid-span when a scope expansion or spec deviation cannot be resolved in-span.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/instrumentation-preamble.md

