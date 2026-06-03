---
name: "plan"
description: "Produce a staged, dependency-annotated plan for a settled work-item — one implementation unit per buildable workstream, lens-vetted, with planning principles taught. The plan artifact is what the commit-to-build gate decides against. Use when: A design is settled and its spec amendment is through — decompose the work into implementation units, sequence them, dispatch the lens family over the plan doc, and surface it for the operator's commit-to-build decision."
---


# Plan

Produce a **staged, dependency-annotated plan** for a settled work-item. You own
**decomposition, sequencing, operator interaction, and the lens dispatch over the plan
doc** — you do not perform any lens dimension yourself (the lens agents own that) and you
do not decide product strategy yourself (the product-lens, if present, owns that). Your
deliverable is a **plan doc**: an ordered set of implementation units conforming to the
IU-schema, with explicit dependency annotations and sequencing rationale, lens-vetted and
ready for the operator's **commit-to-build gate**.

You hold the operator in the loop throughout — plan is collaborative by nature, and on a
novel or contested decomposition it may take rounds. Teach the sequencing rationale as you
go: the operator should leave understanding why the plan is ordered as it is.

## What you read, and what you must not write

Read for context; write only to harness surfaces.

- **The carrier** — read it via bindings for its `lifecycle_state`, prior
  `transition_history`, the objective it serves, and any parent/child decomposition already
  recorded. It is a harness surface, not a node, and you hold no edge to it.
- **The design doc + spec amendment** — the settled artefacts handed forward by `specify`
  (or the operator's invocation, in `re-plan` mode). Read them for the scope, the resolved
  design decisions, and the spec touchpoints.
- **The IU-schema** — you hold it via a `references` edge (`load: import`). Read it at the
  start of every session; it is always present. It defines the six fields every
  implementation unit must carry: `id`, `goal`, `files`, `dependencies`, `acceptance`, `size`.

You **do not write the carrier**. You write the plan doc to a harness surface. Completing
this stage is the signal the projection/curator picks up to advance the carrier's
`current_stage`; the projection is derived from the observed traversal, not written by you.
The `children[]` field of the carrier is populated by the curator (from the plan) and/or
projected when `build` spawns child work-units as their own traversals — you populate the
plan doc, not the carrier.

## Phase 1 — Frame the decomposition

1. Read the carrier, the design doc, and the spec amendment. Identify the
   **implementation scope** — what the work-item changes, creates, or removes — and the
   boundaries (files, modules, API surfaces) it touches.
2. Fill any context gaps by **invoking `explore`** (scoped, read-only): pass it a
   scope/mode selector (`repo` / `learnings` / `framework-docs` / `web` / `best-practices`),
   the target question, and a scope summary. Consume its distilled digest; do not
   re-explore ground `design` or `specify` already covered.
3. Draft the **implementation unit list** — a first-pass decomposition into buildable child
   workstreams. Apply the decomposition criteria:
   - **One unit, one goal**: each unit has a single stated outcome in outcome-framed language.
   - **Files is the scope contract**: name the files and directories explicitly. No unit
     owns an unbounded scope.
   - **One human-in-loop turn or one autonomous span**: a unit that would require multiple
     operator turns to build is too large; split it.
   - **Teach as you go**: state the sequencing rationale for each dependency relationship as
     you add it, not after the fact.

## Phase 2 — Sequence and annotate

For each unit, fill the IU-schema fields completely:

- **`id`**: a stable slug unique within this plan. Keep it stable across re-plans — dependency
  references and the curator use it.
- **`goal`**: one sentence, outcome-framed ("so that X is true after build"). This is what
  build is held to. Not a task description; not a solution description.
- **`files`**: the explicit scope boundary — the files and directories this unit owns. Build
  does not touch files outside this set without flagging scope expansion.
- **`dependencies`**: the other IU `id`s this unit depends on — units whose output this unit
  consumes or assumes. Build uses this list to sequence work and detect when a dependency
  is unfinished or broken.
- **`acceptance`**: observable conditions (tests pass, behaviour X holds, endpoint returns Y).
  Not effort ("implement Z"). Build evaluates these before emitting a unit-complete event.
- **`size`**: `XS | S | M | L | XL` — a rough effort signal. State the rationale for any
  `L` or `XL` unit and consider splitting it.

Surface the draft units to the operator before advancing to the lens phase. Invite them to
challenge the decomposition — a unit the operator doubts will produce a re-ask at build.

## Phase 3 — Dispatch the lens panel over the plan doc

Once the draft plan is stable enough to examine, **follow the `lens-dispatch` reference**
with `target: plan`. The reference gives you lens selection, the fan-out, and the
deterministic merge / dedup / corroborate / confidence-gate / severity-route reduction.

- Run the lenses **sequential, plan-review order**: dispatch lenses that check plan-level
  coherence (sequencing, scope, dependency completeness) before fanning out the remainder
  in parallel. Lead with the always-on lenses in plan-review activation order.
- As you fan out, pass each lens its own spawn prompt carrying the **target** (`plan`) and
  the plan doc's contents, the **scope-rules** and intent summary, and the **finding
  contract** — the finding schema, severity scale, and confidence anchors, which you hold
  from your imported references — so every lens emits to the same contract.
- **You do not direct-invoke the lenses.** They declare `composes-into @plan` from their
  own side; you reach them only through the dispatch reference. Each lens returns the
  compact finding tier; the dispatch reduces those returns to one ranked, routed finding set.

Surface the ranked findings and the soft buckets to the operator, and **action them
in-session** — fold the actioned findings back into the plan doc before it advances.
A finding that names a plan-altitude risk (a missing dependency, an under-specified
acceptance criterion, a scope boundary that will cause build to stall) is the point of this
phase: surface it here, not at build.

## Phase 4 — Finalise the plan doc

Produce the **plan doc** to a harness surface:

- The ordered **implementation units**, each with all six IU-schema fields populated.
- Explicit **sequencing rationale** — the dependency graph and the stated reason for each
  ordering decision.
- A **scope summary**: what the plan covers, what it explicitly defers, and any items the
  lens panel flagged as out-of-scope drift.
- The actioned lens findings folded in — the plan doc reflects the vetted plan, not the
  first draft.

## Modes

Render as branches of this one skill. Every mode reads the carrier, resolves the
decomposition, dispatches the lens panel, and writes only to harness surfaces; the
differences are in depth, operator rounds, and the handling of prior plan state.

### compose (default)

The standard planning pass. Invoke `explore` for context gaps; draft the IU breakdown;
dispatch the lens panel; finalise the plan doc. The default path for a settled design with
clear scope.

### deepen

A hard or novel decomposition. Multiple operator rounds — surface and test the decomposition
assumptions before finalising units; run the dispatch with the adversarial lens active (and
any other conditional lenses the complexity triggers). Use when the design carries real
architectural uncertainty, the scope boundary is contested, or the dependency graph is novel.

### re-plan

Re-entry from the build stage. The prior plan doc and the build-stage signal that triggered
re-entry (a stalled unit, a discovered scope gap, a failed acceptance criterion) are passed
as context. Read the prior plan; reason from what changed; produce a revised plan doc with
the affected units updated and the sequencing rationale re-stated. Do not discard the stable
units — preserve their `id` values so references and curator content survive the revision.
Re-state the full plan (not a diff) so build starts clean.

## Process seams (deferred edges — F7)

- **← `specify`** (`can-follow`, authored): plan follows a settled spec amendment. The
  `can-follow specify` edge is declared. The reverse — `specify precedes plan` — is on
  `specify`'s side and deferred to the backbone wiring wave.
- **→ `build`** (`precedes`, deferred): plan precedes build. The edge is authored once
  `build` exists. Until then the flow holds in prose: a finalised plan doc with all IUs
  populated feeds the commit-to-build gate; on approval, build is invoked.
- **plan ← `build`** (re-plan loop, `can-follow`, deferred): when build discovers a scope
  gap or a failed dependency that planning did not anticipate, it signals re-entry to plan.
  The `plan can-follow build` edge is deferred until `build` exists. The re-plan mode
  handles this re-entry behaviourally — described above.
- **← `design`** (through `specify`): design does not directly precede plan; the seam runs
  through `specify`. The `design precedes specify precedes plan` chain holds in the design
  node's prose seams and in `specify`'s `can-follow design` edge.

## Output

- A **plan doc** on a harness surface: an ordered set of implementation units, each
  conforming to the IU-schema (id, goal, files, dependencies, acceptance, size), with
  sequencing rationale and a scope summary.
- The **ranked, routed lens findings** over the plan doc (from the dispatch), surfaced and
  actioned in-session, folded back into the plan.
- **No carrier write.** Completing plan is the signal the projection/curator picks up to
  advance `current_stage`; the lifecycle and commit-to-build gate decisions remain
  PM/operator calls.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/confidence-anchors.md
@references/findings-schema.md
@references/instrumentation-preamble.md
@references/severity-scale.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/lens-dispatch.md` — `lens-dispatch`

