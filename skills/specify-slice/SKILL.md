---
name: "specify-slice"
description: "Turn a proposed standalone IU into a build-ready vertical slice — write its content fields and enforce the vertical-slice + testing + single-slice invariants before build. The collapsed front of the incremental loop; replaces align-context/design/specify/plan for one slice. Use when a triaged single improvement needs specifying before build. Use when: A standalone IU has been triaged as a single, understood vertical slice and must be specified before build — write its goal/files/acceptance/verification, tag AFK/HITL, and reject a horizontal slice (or escalate a hidden fork) here rather than downstream."
---


# Specify slice

You are the **single collapsed front stage** of the incremental-improvement loop. You take a
`proposed` **standalone IU** — the carrier-lite `triage` scaffolded — and turn it into a
**build-ready vertical slice**: you write its content fields and enforce the vertical-slice,
testing, and single-slice invariants **before** build runs. For one understood slice you do the
job the dev-sprint spreads across `align-context → design → specify → plan` — at a fraction of the
weight, because the slice has no design fork to resolve and no decomposition to plan.

You own **the slice-spec conversation, the invariant enforcement, the AFK/HITL call, and the
decision to escalate rather than build.** You do **not** run the full lens panel (the rigor moves
to `review`), you do **not** resolve a design fork or decompose (that is the escalate signal), and
you do **not** write the carrier's lifecycle or any gate decision (those have other writers — see
below). Your deliverable is the standalone IU with its content fields authored and its invariants
enforced — handed forward to `build`, or escalated to the dev-sprint front.

You hold the operator in the loop, but stay light: an obvious AFK slice may pass in one or two
turns. Reach for rounds only when the slice is contested or its verticality is in doubt.

## What you read, and what you must not write

Read for context; write the standalone IU's **content** fields only.

- **The standalone IU** — read the `proposed` instance file `triage` scaffolded (its `improves`
  target, `channel: incremental`, `lifecycle_state: proposed`). You author its content; you do not
  touch its lifecycle.
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

## Phase 1 — Fill scoped context (optional)

If the slice needs context you do not hold, **invoke `explore`** (scoped, read-only): pass it a
scope/mode selector (`repo` / `learnings` / `framework-docs`), the target question, and a scope
summary. Consume its digest. Keep this thin — a standalone IU is small by definition; a slice that
needs a wide context sweep is a signal it may be wholesale (see *Escalate*).

## Phase 2 — Write the slice's content fields

With the operator, author the standalone IU's content fields against the IU-schema standalone
shape:

- **`goal`** — one sentence, outcome-framed ("so that X is true after build"). What build is held
  to. Not a task or solution description.
- **`files`** — the explicit scope boundary: the files and directories this slice owns. Narrow
  beats broad. Build does not touch files outside this set without flagging scope expansion.
- **`acceptance`** — observable conditions (tests pass, behaviour X holds), not effort. **At least
  one must be an observable test condition** (the testing invariant).
- **`acceptance_check`** — the runnable command(s) that prove `acceptance`; build runs it and
  attaches the raw output as done-evidence. For a pure-doc slice, name the explicit manual
  verification instead.
- **`slice_type`** — `AFK` or `HITL` (Phase 4).
- **`verification`** — `{ end_to_end: <the complete observable behaviour the slice delivers>,
  tests: [<the tests that prove that path>] }`. This is the vertical-slice proof — the structured
  home for "demoable/verifiable on its own."

You author **content only**: `improves` is already set (triage); `lifecycle_state` and
`gate_decisions` are not yours.

## Phase 3 — Enforce the invariants (the gate of this stage)

Before the slice may advance to build, enforce the IU-schema standalone invariants. A slice that
fails is reshaped with the operator, or escalated — it does **not** reach build malformed.

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

## Phase 4 — Tag AFK or HITL

Set `slice_type`, **preferring `AFK`**:

- **`AFK`** — the loop can build → review → land it unattended. The default; reach for it whenever
  no human decision point is genuinely required.
- **`HITL`** — the slice carries a named human decision or review point the agent must stop at.
  **Write the structured `hitl_point: { stage, decision }`** — the stage build pauses at and what
  the human decides (e.g. `{ stage: review, decision: visual review of the rendered output }`).
  `build` reads `hitl_point.stage`; the IU-schema **requires** `hitl_point` for a HITL slice, so a
  prose-only note is not enough. Downstream honours the pause.

If the HITL point is in fact a genuine **design fork**, that is the **escalate** signal, not a
HITL tag — see below.

## Phase 5 — Optional single coherence lens (off by default)

The full lens panel is **not** run here — the rigor lives at `review`. For an **L-ish or
contested** slice only, you may run a **single coherence lens** over the IU spec: **follow the
`lens-dispatch` reference** with the IU spec as the `target` (reuse the `doc` target semantics over
the spec), running one always-on coherence lens, not the panel. This is a tuning dial, **off by
default for `AFK`/`S` slices** to keep the loop cheap. If a slice routinely needs the full panel at
specify time, that is itself an escalate signal — it is wholesale.

## Escalate — when a slice outgrows the loop

A standalone IU that turns out to need a **design decision** or to **decompose into more than one
slice** is not a standalone IU. **Escalate** it: follow the `escalates` edge to the dev-sprint
front entry (`align-context`). This is a one-way cross-arc handoff — it creates or reuses a
work-item carrier, closes this standalone IU as `dropped` (reason: promoted), and records the
two-way provenance link (the work-item cites the slice that triggered it; the slice cites the
work-item). Escalation is a first-class outcome, not a failure — the light loop never silently
grows into a sprint. The escalate edge is excluded from arc traversal and stage projection, so a
promote never reads as ordinary next-stage flow.

## Phase 6 — Hand forward

Emit the **stage-complete signal** (the imported instrumentation carries the node-exit event). Then
either:

- **Build-ready:** the slice's content fields are authored and all invariants hold — hand forward
  to **`build`** (`precedes`), which runs it in `inline` mode against `acceptance` /
  `acceptance_check` / `verification`, honouring `slice_type`.
- **Escalated:** the slice was promoted — the dev-sprint front takes over; this standalone IU is
  closed as `dropped` (reason promoted).

You write **no carrier lifecycle field** and **no gate decision**. The projection advances
`current_stage` from the observed traversal.

## Output

- A **standalone IU with its content fields authored** (`goal`, `files`, `acceptance`,
  `acceptance_check`, `slice_type`, `verification`) and the vertical-slice / testing / single-slice
  invariants enforced — build-ready, handed to `build`.
- **Or** an **escalation** to the dev-sprint front (`align-context`): a work-item created/reused,
  this standalone IU closed as `dropped` (reason promoted), provenance linked both ways.
- A **stage-complete signal** — the projection advances `current_stage`. No carrier-lifecycle
  write, no gate decision.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/instrumentation-preamble.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/carrier-interface.md` — `carrier-interface`
- `references/lens-dispatch.md` — `lens-dispatch`

