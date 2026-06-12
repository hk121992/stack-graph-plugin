---
# identity — native .claude (the builder emits the primitive from these)
id: plan
primitive: skill
title: Plan
description: Produce a staged, dependency-annotated, lens-vetted plan for a settled work-item. The plan artifact is what the commit-to-build gate decides against.
when-to-use: A design is settled and its spec amendment is through — decompose the work into implementation units, sequence them, dispatch the lens family over the plan doc, and surface it for the operator's commit-to-build decision.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
# Notes:
# - ALL inter-stage process edges are deferred (F7) per the backbone wiring wave:
#   `can-follow specify`, `precedes build`, and the re-plan `plan can-follow build`.
#   Described in prose under "Process seams" below; NO process edges are declared here.
# - The lens agents already declare `composes-into @plan` from their side — this node
#   existing resolves those pending `@plan` edges. Plan does not direct-invoke the lenses;
#   it reaches them through the `lens-dispatch` reference with `target: plan`.
# - Plan reads the carrier (via bindings) but holds NO carrier write-edge (D44).
#   `current_stage` and `transition_history` are projected from the traversal, not written here.
edges:
  invokes:
    - { id: explore }
  composes-into:
    - { id: dev-sprint, stage: plan }
  references:
    - { id: IU-schema,             load: import }
    - { id: lens-dispatch,         load: on-demand }
    - { id: findings-schema,       load: import }
    - { id: severity-scale,        load: import }
    - { id: confidence-anchors,       load: import }
  can-follow:
    - { id: build }
  precedes:
    - { id: build }
# analytics — the loop
goals:
  - outcome: Build-stage rework from unsequenced or under-specified work trends down — the plan identifies and resolves dependency ordering and scope boundaries before build begins.
    metric: Build-stage rework events traced to planning gaps (missing dependencies, wrong sequencing, thin acceptance criteria) per sprint; share of re-plan invocations triggered by a planning gap vs new information.
    earns-keep: Planning-gap rework stays below the pre-plan baseline over N sprints; if plan never lowers it, the stage is cut or restructured.
  - outcome: Each implementation unit carries a complete IU-schema record so build can operate autonomously against a well-specified unit without re-asking what plan already settled.
    metric: Share of IUs entering build with all required IU-schema fields populated, including `acceptance_check`; build-stage "what does this IU mean?" re-asks per sprint.
    earns-keep: Re-ask rate trends toward zero; a routine re-ask is a plan quality gap, flagged at lens review.
  - outcome: Planning principles are taught in-session — the operator leaves with an understanding of how the plan was sequenced and why, so downstream re-planning from misunderstood sequencing is rare.
    metric: Operator-acknowledged understanding of the sequencing rationale (session-level signal); downstream re-plans traced to a principle the operator didn't understand at plan time.
    earns-keep: Re-planning from misunderstood sequencing trends toward zero over N sprints.
  - outcome: Plan-level risks surface at the plan stage via the lens family, not at build — the plan doc is checked before the commit-to-build gate fires.
    metric: Share of plan sessions where the lens family surfaced ≥1 actioned finding; risks left unexamined at plan that bit at build.
    earns-keep: Plan-stage lens findings measurably displace later build/review findings; a lens pass that routinely surfaces nothing real is a tune/cut signal.
status: v0.2.0 — 2026-06-05
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
  start of every session; it is always present. It defines the seven fields every
  implementation unit must carry: `id`, `goal`, `files`, `dependencies`, `acceptance`,
  `acceptance_check`, `size`. When the harness uses the zone matrix, an IU also carries the
  optional **`zone: {vertical, horizontal?}`** dispatch coordinate (see the decomposition criteria).

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
   scope/mode selector (`repo` / `learnings` / `framework-docs` / `web` / `best-practices` / `zone`),
   the target question, and a scope summary. Consume its distilled digest; do not
   re-explore ground `design` or `specify` already covered. **When the design carries a zone
   footprint** (the harness uses the zone matrix), invoke `explore`'s **`zone` mode with a column
   query `(V, *)`** for each vertical in the footprint — it returns that vertical's experience
   contract (the UX end goal), its in-scope rules ranked by specificity, the touched code regions,
   and the code-map-traced cross-layer path. That digest is the material each vertical slice is
   decomposed and built against.
3. Draft the **implementation unit list** — a first-pass decomposition into buildable child
   workstreams. Apply the decomposition criteria:
   - **One unit, one goal**: each unit has a single stated outcome in outcome-framed language.
   - **Files is the scope contract**: name the files and directories explicitly. No unit
     owns an unbounded scope.
   - **Single-agent-implementable**: size each unit so one fresh agent can build it within
     its best-work context budget — one agent, bounded fresh context, split diligently. The
     budget is a harness-tunable dial (~100k tokens by default; the principle is durable, the
     number model-dependent — verify it, do not bake it in). A unit whose context (its files +
     tests + implementation) would overflow the budget is too coarse: split it. This anchors
     the `size` field — `size` is a single-agent-fit signal, so `L`/`XL` read as "probably
     split", not a raw effort estimate. Build emits `tokens_per_iu` per unit; a persistently
     high over-budget share is the signal that plan drew IUs too coarse.
   - **Decompose by vertical slice (under the zone matrix)**: with a zone footprint, the unit of
     work is a **vertical slice (a column)** — one experience across the horizontals it touches —
     not a single cell. Each IU carries `zone: {vertical}` (a bare `{vertical, horizontal}` only for
     a genuinely single-layer change); its `files` come from the column's resolved code region, and
     the column's ranked rules + experience contract are its build-time context. **Split a too-large
     column into thinner vertical slices, never into horizontal layers** — splitting horizontally
     loses the end-to-end property and forfeits the governing per-vertical experience test. (No
     footprint / no axes bound → ordinary decomposition; capability-gated.)
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
- **`acceptance_check`**: the runnable command that proves the unit's `acceptance` — build
  runs it and shows the raw output as the done-evidence. A unit with `acceptance` but no
  `acceptance_check` is an incomplete IU; flag it at lens review.
- **`size`**: `XS | S | M | L | XL` — the single-agent-fit signal (Phase 1), not a raw effort
  estimate. `L`/`XL` read as "probably split". State the rationale for any `L`/`XL` unit and
  split a unit whose context overflows the single-agent budget.

### Close Phase 2 with a scope-claim

Before any lens fan-out, write a **scope-claim** — a short, structured statement of what the
draft plan does and does not commit to. Three labelled parts:

- **Covers**: what these units change, create, or remove — the scope the plan commits to.
- **Defers**: what is explicitly out of this plan, and why — drift the operator should know
  was left out on purpose, not by omission.
- **Inferred**: decomposition or sequencing choices you made without an explicit operator
  instruction that could reasonably go another way — the forks where operator input changes
  the plan.

The scope-claim is cheap to produce and cheap to redirect against — it is the checkpoint
before the expensive lens pass. (It is the pre-dispatch sibling of the Phase 4 scope summary,
which records the *finalised* covers/defers after the lens findings are folded in.)

### Confirm-framing gate (hard) — affirm or redirect before the lens dispatch

Surface the draft units **and** the scope-claim to the operator as one affirm-or-redirect
summary, and **block on it** via the platform's blocking-question tool. The lens fan-out does
not run until the operator affirms or redirects. This is a hard gate, not an invitation: the
lens pass is the expensive step, so the operator confirms the decomposition and scope claim
*before* it fires — a unit or a boundary the operator doubts is caught here, not after the
fan-out. On redirect, revise the decomposition and re-surface the scope-claim; only an affirm
advances to Phase 3.

## Phase 3 — Dispatch the lens panel over the plan doc

Once the operator has **affirmed the scope-claim at the Phase 2 gate**, **follow the
`lens-dispatch` reference** with `target: plan`. The reference gives you lens selection, the
fan-out, and the deterministic merge / dedup / corroborate / confidence-gate / severity-route
reduction.

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

- The ordered **implementation units**, each with all seven IU-schema fields populated
  (including `acceptance_check`).
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
assumptions before finalising units. Use when the design carries real architectural
uncertainty, the scope boundary is contested, the dependency graph is novel, or the change is
cross-cutting (touches many surfaces / large blast radius).

In this mode you run the dispatch with **`lens-adversarial` active** — `deepen`'s entry
condition (any of: architectural uncertainty, a contested scope boundary, a novel dependency
graph, a cross-cutting change / large blast radius) *is* the adversarial lens's activation
trigger, so naming the mode names why the lens fires. The other conditional lenses fire on
their own `lens-dispatch` triggers as the plan's content meets them (e.g. `lens-performance`
when the work touches DB/loops/IO/async). Selection stays owned by `lens-dispatch`; this mode
only fixes that the plan is in the adversarial-active class — so the lens neither fires every
time (waste) nor sits dormant when the decomposition is genuinely hard.

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
  conforming to the IU-schema (id, goal, files, dependencies, acceptance, `acceptance_check`,
  size), with sequencing rationale and a scope summary. `acceptance_check` is the runnable
  command that proves each unit's `acceptance` — build runs it and shows the raw output.
- The **ranked, routed lens findings** over the plan doc (from the dispatch), surfaced and
  actioned in-session, folded back into the plan.
- **No carrier write.** Completing plan is the signal the projection/curator picks up to
  advance `current_stage`; the lifecycle and commit-to-build gate decisions remain
  PM/operator calls.
