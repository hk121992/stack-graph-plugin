---
# identity — native .claude (the builder emits the primitive from these)
id: specify-slice
primitive: skill
title: Specify slice
description: Formalise a decision-complete standalone IU into a build-ready vertical slice — render the carrier's captured definition into the content fields and enforce the vertical-slice + testing + single-slice invariants before build. The collapsed front of the incremental loop; replaces align-context/design/specify/plan for one slice. Runs collaborative when hand-run, unattended inside a loop-runner-dispatched session. Use when a triaged single improvement needs formalising before build.
when-to-use: A standalone IU has been triaged decision-complete (Context + Decisions captured at raise) and must be formalised before build — render goal/files/acceptance/verification, formalise slice_type from the recorded AFK/HITL decision, and reject a horizontal slice (or escalate a hidden fork) here rather than downstream. Reached as a dispatched session's entry (unattended) or hand-run (collaborative).
# classification — graph lens
mode: collaborative          # hand-run character; the body also renders an `unattended` mode
determinism: generative      # (a body branch, like review's headless) for dispatched-session use
# edges — the graph (scanned from here into the record)
edges:
  invokes:
    - { id: explore }
  composes-into:
    - { id: incremental, stage: specify-slice }
  references:
    - { id: IU-schema,                 load: import }
    - { id: carrier-interface,         load: on-demand }
    - { id: instrumentation-preamble,  load: import }
    - { id: lens-dispatch,             load: on-demand }
    - { id: work-item-schema,          load: on-demand }
  can-follow:
    - { id: triage }
  precedes:
    - { id: build }
  escalates:
    - { id: align-context }
# analytics — the loop
goals:
  - outcome: A standalone IU enters build as a well-specified vertical slice — all content fields populated — so build never invents the slice boundary or the test contract.
    metric: Share of slices entering build with goal/files/acceptance/acceptance_check/verification populated; build-stage "what is this slice / where are the tests?" re-asks per loop.
    earns-keep: Build-stage re-asks trend toward zero; a routine re-ask is a specify-slice quality gap, cut or restructure the stage if it persists.
  - outcome: The content fields are faithfully derived from the carrier's captured definition — formalisation loses no information, and in a dispatched session mid-loop operator questions are zero by construction.
    metric: Mid-loop operator questions per unattended run (target zero); route-outs attributable to a mis-rendered but complete carrier (formalisation error) vs a genuinely under-defined one (an upstream triage gap).
    earns-keep: Unattended mid-loop questions stay at zero; route-outs attribute to upstream incompleteness, not to this node losing information in translation — a rising formalisation-error rate is the tune signal.
  - outcome: Horizontal slices are rejected here, not downstream — a slice that only asserts one layer's shape never reaches build.
    metric: Slices reshaped/rejected at specify-slice for failing the vertical-slice test; horizontal slices caught later at review/validate that should have been caught here.
    earns-keep: Horizontal-slice escapes to review trend toward zero over N loops; if specify-slice never catches one, the gate is not earning its cost.
  - outcome: A slice that needs a design fork or decomposes is escalated to the dev-sprint front, never quietly built as a standalone IU.
    metric: Escalations traced to a fork/decomposition surfaced here; standalone IUs later found to have smuggled a multi-slice change through.
    earns-keep: Mis-routed fork/multi-slice work is caught at specify-slice, not mid-build; the light loop never silently grows into a sprint.
status: v0.2.0 — 2026-06-10
---

# Specify slice

You are the **single collapsed front stage** of the incremental-improvement loop. You take a
**decision-complete standalone IU** — the carrier `triage` captured, carrying a `## Context` and
`## Decisions` body — and turn it into a **build-ready vertical slice**: you **render** its captured
definition into the content fields and **enforce** the vertical-slice, testing, and single-slice
invariants **before** build runs. For one understood slice you do the job the dev-sprint spreads
across `align-context → design → specify → plan` — at a fraction of the weight, because the slice
has no design fork to resolve and no decomposition to plan.

Your job is **translation + enforcement, not specification.** `triage` ran the operator Q&A at
raise time and recorded every call (including the AFK/HITL call) in the carrier's Decisions; you
have **nothing to ask in the normal case.** You **derive** the formal content fields from the
carrier's Context + Decisions, **confirming** against the codebase via `explore`; you **formalise**
`slice_type` from the recorded decision; you **enforce** the invariants. You do **not** run the full
lens panel (the rigor moves to `review`), you do **not** resolve a design fork or decompose (that is
the escalate signal), and you do **not** write the carrier's lifecycle or any gate decision (those
have other writers — see below).

## Two modes

The body renders **two modes** — branches of this one skill, the way `review` renders
`headless`/`interactive`. The frontmatter classification stays `collaborative`; `unattended` is a
body branch, not a per-invocation classification.

- **`collaborative`** — the **hand-run default**: the operator is present, so a residual gap or a
  late-surfacing fork can be discussed and resolved (or escalated) in-session.
- **`unattended`** — the default **when reached inside a loop-runner-dispatched session**. **You
  ask nothing.** A gap you cannot formalise without a question is a **route-out**, not a question
  (see *Route out, do not ask*). A fork that surfaces here is the **escalate signal**, which in a
  dispatched session you **signal but do not enact** (see *Escalate*). The carrier was certified
  decision-complete upstream; the cost of any gap is paid at raise time, never mid-loop.

## What you read, and what you must not write

Read for context; write the standalone IU's **content** fields only.

- **The decision-complete standalone IU** — read the instance file `triage` captured: its identity
  frontmatter (`improves` target, `channel: incremental`, `lifecycle_state: proposed`) **and its
  definition body** — `## Context` (verbatim evidence: observed vs expected, repro, error output,
  pointers) and `## Decisions` (every call settled, including the AFK/HITL call). This is the source
  you render from. You author its content fields; you do not touch its lifecycle.
- **The IU-schema** — held by `references` (`load: import`); read it every run. It defines the
  **standalone shape** and the invariants you enforce: vertical-slice, testing, single-slice, and
  the three-writers split.
- **The carrier interface** — held on-demand. It is the field-set the shared downstream nodes
  (`build`/`review`/`land`) may assume, and the **projection key** (carrier id + kind + arc). Read
  it at the build seam; you write no `current_stage`.

You **do not write** `lifecycle_state` or `gate_decisions`. Per the IU-schema three-writers split:
`triage` authored `proposed`; the **build-enter event** sets `in-delivery`; the terminal
`landed`/`parked`/`dropped` transition is the **single `commit-to-land` gate's** at `land`. You
write only the slice's content. Completing this stage is the signal the projection picks up to
advance `current_stage`; it is projected from the observed traversal, not written by you.

## Phase 1 — Confirm mechanical detail (optional)

The Context section names the scope; you need only the **mechanical detail** to render it — exact
paths, the right test command. If you do not hold it, **invoke `explore`** (scoped, read-only):
pass it a scope/mode selector (`repo` / `learnings` / `framework-docs`), the target question, and a
scope summary. Consume its digest. Keep this thin — a decision-complete standalone IU is small by
definition; a slice that needs a wide context sweep is a signal it may be wholesale (see
*Escalate*).

## Phase 2 — Render the slice's content fields

**Derive** the standalone IU's content fields from the carrier's Context + Decisions, against the
IU-schema standalone shape — confirming mechanical detail from Phase 1, not re-deciding anything
already settled in Decisions:

- **`goal`** — one sentence, outcome-framed ("so that X is true after build"). What build is held
  to. Not a task or solution description.
- **`files`** — the explicit scope boundary: the files and directories this slice owns. Narrow
  beats broad. Build does not touch files outside this set without flagging scope expansion.
- **`acceptance`** — observable conditions (tests pass, behaviour X holds), not effort. **At least
  one must be an observable test condition** (the testing invariant).
- **`acceptance_check`** — the runnable command(s) that prove `acceptance`; build runs it and
  attaches the raw output as done-evidence. For a pure-doc slice, name the explicit manual
  verification instead.
- **`dependencies`** — other standalone IU ids this slice depends on (empty if none); **never** a
  child-IU id (the single-slice invariant).
- **`size`** — the single-agent fit signal (`XS…XL`). If the slice will not fit one fresh agent's
  context budget, that is a **promote** signal, not an `XL`.
- **`slice_type`** — `AFK` or `HITL`, **formalised from the recorded AFK/HITL decision** in the
  carrier's Decisions (Phase 4); you do not re-decide it.
- **`verification`** — `{ end_to_end: <the complete observable behaviour the slice delivers>,
  tests: [<the tests that prove that path>] }`. This is the vertical-slice proof — the structured
  home for "demoable/verifiable on its own."

You author **content only**: `improves` is already set (triage); `lifecycle_state` and
`gate_decisions` are not yours.

## Phase 3 — Enforce the invariants (the gate of this stage)

Before the slice may advance to build, enforce the IU-schema standalone invariants — **unchanged**
from the hand-run discipline. A slice that fails is reshaped (collaborative) or routed out
(unattended; see *Route out, do not ask*) — it does **not** reach build malformed.

- **Vertical-slice.** `goal` + `acceptance` must describe a **complete path** that is *demoable or
  verifiable on its own*. **Reject a horizontal slice** — one whose acceptance only asserts the
  shape of a single layer (a schema exists, a signature is present) with no end-to-end observable
  behaviour. Reshape it into a thin complete path (a tracer bullet) or escalate. This is the
  rejection that does not happen downstream because there is no plan/review between here and build.
- **Testing.** `acceptance` carries **≥1 observable test condition**, and `verification` **names
  the tests** that prove the path end-to-end. "Done" means those tests pass **and** the slice is
  independently verifiable. Effort is never the done signal. (How the tests get written — one test
  → one impl → repeat — is `build`'s tracer-bullet inner loop, not your job; you require only
  *that* the tests exist and prove the path.)
- **Single-slice.** No `children[]`; `dependencies` may reference **only other standalone IUs**. If
  the work decomposes into multiple slices that must be sequenced and planned together, it is a
  work-item — **escalate** (the light loop never grows children in place).

## Phase 4 — Formalise AFK or HITL from the recorded decision

The AFK/HITL **call was already made at raise time** and lives in the carrier's Decisions. You
**formalise** it into `slice_type`; you do not re-decide it:

- **`AFK`** — the loop can build → review → land it unattended.
- **`HITL`** — the slice carries a named human decision or review point the agent must stop at.
  **Write the structured `hitl_point: { stage, decision }`** — the stage build pauses at and what
  the human decides (e.g. `{ stage: review, decision: visual review of the rendered output }`) —
  drawn from the recorded decision. `build` reads `hitl_point.stage`; the IU-schema **requires**
  `hitl_point` for a HITL slice, so a prose-only note is not enough. Downstream honours the pause.

If formalising surfaces that the recorded "HITL point" is in fact a genuine **design fork**, that
is the **escalate** signal, not a HITL tag — see below.

## Phase 5 — Optional single coherence lens (off by default)

The full lens panel is **not** run here — the rigor lives at `review`. For an **L-ish or
contested** slice only, you may run a **single coherence lens** over the IU spec: **follow the
`lens-dispatch` reference** with the IU spec as the `target` (reuse the `doc` target semantics over
the spec), running one always-on coherence lens, not the panel. This is a tuning dial, **off by
default for `AFK`/`S` slices** to keep the loop cheap. If a slice routinely needs the full panel at
specify time, that is itself an escalate signal — it is wholesale.

## Route out, do not ask (unattended mode)

In **`unattended`** mode you never put a question to an operator who is not there. A definition gap
is a **route-out**:

- **`blocked: insufficiently-defined`** — you reached a content field you cannot formalise without
  asking (the carrier's Context/Decisions do not settle it). Record the reason and return the
  route-out; the IU goes **back to raise-capture** at `triage` (the carrier was not actually
  decision-complete — the fix is upstream, not a mid-loop question). Never guess the missing call.
- **escalate signal** — a design fork or a decomposition surfaces at formalisation (see *Escalate*).
  In a dispatched session you **return the escalate signal + rationale to the coordinator; you do
  not enact it** (enacting mutates shared surfaces, which the dispatched-session write discipline
  forbids — you write your worktree and your own carrier only).

In **`collaborative`** mode the operator is present, so the same two situations are resolved
in-session as before: a gap is filled, a fork is escalated and **enacted** here.

## Escalate — when a slice outgrows the loop

A standalone IU that turns out to need a **design decision** or to **decompose into more than one
slice** is not a standalone IU. The escalate signal is the same in both modes; **who enacts it
differs**:

- **`collaborative` (and any hand-run)** — **enact** the escalate. Follow the `escalates` edge to
  the dev-sprint front entry (`align-context`). This is a one-way cross-arc handoff — it creates the
  work-item via **`product-dashboard-curator` (its `add-item` mode)**, per `work-item-schema` (or
  reuses a matching one), closes this standalone IU as `dropped` (reason: promoted) with a pointer
  to the work-item, and records the two-way provenance: the new work-item cites this slice
  (`promoted_from`); the slice cites the work-item.
- **`unattended` (dispatched session)** — **signal, do not enact.** Return the escalate signal +
  rationale to the coordinator and stop; the coordinator enacts the same handoff **attended** at the
  close phase. You make none of the work-item / `dropped` / provenance writes yourself — they mutate
  shared surfaces, off-limits to a dispatched session.

Escalation is a first-class outcome either way, not a failure — the light loop never silently grows
into a sprint. The escalate edge is excluded from arc traversal and stage projection, so a promote
never reads as ordinary next-stage flow.

## Phase 6 — Hand forward

Emit the **stage-complete signal** (the imported instrumentation carries the stage-exit event). The
stage-exit event **carries the formalised `files`** — in a dispatched run this is the coordinator's
**late-binding scheduling signal**: loop-runner serialised at intake on provisional scope, then
re-checks the formalised `files` off this event for no-shared-scope overlap before each subsequent
dispatch. Then one of:

- **Build-ready:** the slice's content fields are authored and all invariants hold — hand forward
  to **`build`** (`precedes`), which runs it in `inline` mode against `acceptance` /
  `acceptance_check` / `verification`, honouring `slice_type`.
- **Escalated:** a fork/decomposition surfaced — enacted here (collaborative) or signalled to the
  coordinator (unattended); the dev-sprint front takes over and this standalone IU is closed
  `dropped` (reason promoted).
- **Routed out (unattended only):** `blocked: insufficiently-defined` — the carrier could not be
  formalised without asking; returned with the reason for raise-capture, never retried in-loop.

You write **no carrier lifecycle field** and **no gate decision**. The projection advances
`current_stage` from the observed traversal.

## Output

- A **standalone IU with its content fields authored** (`goal`, `files`, `dependencies`,
  `acceptance`, `acceptance_check`, `size`, `slice_type`, `verification`) and the vertical-slice / testing / single-slice
  invariants enforced — build-ready, handed to `build`. The **stage-complete signal carries the
  formalised `files`** (loop-runner's late-binding scheduling input).
- **Or** an **escalation** to the dev-sprint front (`align-context`): enacted here (collaborative —
  a work-item created/reused, this standalone IU closed `dropped` reason promoted, provenance linked
  both ways) or **signalled to the coordinator** (unattended — the coordinator enacts it attended).
- **Or** (unattended only) a **route-out** — `blocked: insufficiently-defined`, reason recorded,
  returned for raise-capture.
- A **stage-complete signal** — the projection advances `current_stage`. No carrier-lifecycle
  write, no gate decision.
