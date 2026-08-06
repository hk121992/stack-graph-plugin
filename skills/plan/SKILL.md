---
name: "plan"
description: "Produce a staged, dependency-annotated, lens-vetted plan for a settled, specced work-item — decompose it into implementation units (the build carriers), sequence them with complete dependencies and per-IU autonomy, and hand the plan doc back to shape as the commit-to-build gate's decision artifact and dispatch's input. Use when a design is settled and its spec amendment is through, and the work decomposes into IUs for the operator's commit-to-build decision."
---


# Plan

Produce a **staged, dependency-annotated plan** for a settled, specced work-item. You own
**decomposition, sequencing, operator interaction, and the lens dispatch over the plan doc** — you
do not perform any lens dimension yourself (the lens agents own that), and product strategy is
settled upstream (`shape-product`'s discovery; `design`'s outcome-driven resolution). Your
deliverable is a **plan doc**: an ordered set of **implementation units that are the build
carriers**, each conforming to the IU-schema, with explicit dependency annotations and sequencing
rationale, lens-vetted. That doc is the artifact the **`commit-to-build` gate decides against**
and then the **input `dispatch` consumes** — you hand it back to `shape`, whose session fires the
gate.

You hold the operator in the loop throughout — plan is collaborative by nature, and on a novel or
contested decomposition it may take rounds. Teach the sequencing rationale as you go: the operator
signs the commitment against this plan and should leave understanding why it is ordered as it is.

## What you read, and what you must not write

Read for context; write only to harness surfaces.

- **The carrier** — read it via bindings for its `lifecycle_state`, prior
  `transition_history`, the objective it serves, and any decomposition already recorded. It is a
  harness surface, not a node, and you hold no edge to it.
- **The design doc + spec amendment** — the settled artefacts handed forward by `specify` (or by
  `shape` on a re-plan). Read them for the scope, the resolved design decisions, the spec
  touchpoints, and — for a HITL unit — the artefacts the front's build-and-look resolved.
- **The IU-schema** — you hold it via a `references` edge (`load: import`). Read it at the
  start of every session; it is always present. It defines the **one IU shape** every unit
  carries: the content fields (`id`, `goal`, `files`, `dependencies`, `acceptance`,
  `acceptance_check`, `size`) plus the authored band you populate at plan time — **`autonomy`**,
  **`verification`**, and **provenance**. When the harness uses the zone matrix, an IU also
  carries the optional **`zone: {vertical, horizontal?}`** dispatch coordinate (see the
  decomposition criteria).

You **do not write the carrier**. You write the plan doc to a harness surface. Completing this
stage is the signal the projection picks up to advance the carrier's `current_stage`; the
projection is derived from the observed traversal, not written by you. The WI's `children[]` is
populated downstream from the plan doc — you populate the plan doc, not the carrier. The units
you emit **inherit the WI's single `commit-to-build` by reference**: the gate fires once, on the
WI grouping, at `shape`'s exit after you return.

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
3. Draft the **implementation unit list** — a first-pass decomposition into buildable units.
   Apply the decomposition criteria:
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
  references and downstream consumers use it.
- **`goal`**: one sentence, outcome-framed ("so that X is true after build"). This is what
  build is held to. Not a task description; not a solution description.
- **`files`**: the explicit scope boundary — the files and directories this unit owns. Build
  does not touch files outside this set without flagging scope expansion.
- **`dependencies`**: the other IU `id`s this unit depends on — capturing **both logical
  ordering and file/surface overlap**, so that **no-deps = parallelizable** holds by
  construction. Two *unordered* units that touch the same files still collide when run in
  parallel — record the overlap as a dependency. This is the parallelisability signal `dispatch`
  consumes (sequential by default; the parallel escape hatch parallelizes only no-deps units);
  dispatch never re-derives independence, so a dependency you omit is a collision you shipped.
- **`acceptance`**: observable conditions (tests pass, behaviour X holds, endpoint returns Y).
  Not effort ("implement Z"). Build evaluates these and records the result before the unit
  counts as complete.
- **`acceptance_check`**: the runnable command that proves the unit's `acceptance` — build
  runs it and shows the raw output as the done-evidence. A unit with `acceptance` but no
  `acceptance_check` is an incomplete IU; flag it at lens review.
- **`size`**: `XS | S | M | L | XL` — the single-agent-fit signal (Phase 1), not a raw effort
  estimate. `L`/`XL` read as "probably split". State the rationale for any `L`/`XL` unit and
  split a unit whose context overflows the single-agent budget.
- **`autonomy`**: `AFK | HITL` — **record** the front's call; the classification is upstream's
  (`shape` finalises it), and you formalise the field from the recorded call, never re-judging
  it. HITL means reaching an AFK-implementable spec needed the front's **build-and-look** (real
  artefacts, resolved warm in the shaping session, before the gate); AFK means doc-spec-able.
  The flag is **front-consumed** — every dispatched build runs AFK to production — and it
  sequences: a HITL unit's design-resolution comes before the AFK work that depends on it.
- **`verification`**: the verification expectation judged at `commit-to-build` —
  `{ end_to_end: <the complete observable behaviour the unit delivers>, tests: [<the tests that
  prove that path>] }`, the vertical-slice proof.
- **provenance**: the parent WI + the authorizing gate each unit inherits — the IU is the build
  carrier, carrying its lineage by reference rather than its own front gate entries. Each unit
  also inherits **`spec-status: specified`** from the settled amendment.

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

## Phase 4 — Finalise the plan doc and return to shape

Produce the **plan doc** to a harness surface:

- The ordered **implementation units**, each with all IU-schema fields populated — the content
  fields (including `acceptance_check`), `dependencies` (ordering **and** overlap), `autonomy`,
  `verification`, and provenance.
- Explicit **sequencing rationale** — the dependency graph and the stated reason for each
  ordering decision, including any HITL-before-dependent-AFK coupling.
- A **scope summary**: what the plan covers, what it explicitly defers, and any items the
  lens panel flagged as out-of-scope drift.
- The actioned lens findings folded in — the plan doc reflects the vetted plan, not the
  first draft.

Then **return to `shape`**. The plan doc is the **decision artifact `commit-to-build` decides
against** — shape's session holds the operator turn and fires the gate, once, on the WI grouping;
the N units inherit the commitment by reference. Downstream of the gate, the plan doc is
**`dispatch`'s input contract**: the IU set + `dependencies` + `autonomy`, read as-is. You fire
no gate and record no gate decision.

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
their own `lens-dispatch` triggers as the plan's content meets them (e.g. a harness-bound performance lens
when the work touches DB/loops/IO/async). Selection stays owned by `lens-dispatch`; this mode
only fixes that the plan is in the adversarial-active class — so the lens neither fires every
time (waste) nor sits dormant when the decomposition is genuinely hard.

### re-plan

Re-entry from the build span, through the front: a dispatched unit that blocks on a definition
gap routes out to `shape`, which re-dispatches you with the prior plan doc and the signal that
triggered re-entry (a stalled unit, a discovered scope gap, a failed acceptance criterion).
Read the prior plan; reason from what changed; produce a revised plan doc with the affected
units updated and the sequencing rationale re-stated. Do not discard the stable units —
preserve their `id` values so dependency references and downstream consumers survive the
revision. Re-state the full plan (not a diff) so the build span starts clean.

## Process seams

- **← `specify`** (`can-follow`, authored): plan follows the settled spec amendment — you
  decompose against settled spec, never a moving target.
- **exit → `shape` → `commit-to-build`**: your exit returns to `shape`; the coordinator owns the
  forward gate edge at every phase, and your doc is what the gate decides against. You hold no
  gate edge.
- **→ `dispatch`** (prose seam — the input contract): after the gate, `dispatch` consumes the
  plan doc as-is — the IU set, `dependencies` (no-deps = parallelizable), `autonomy` — and
  schedules sequential-by-default with the parallel escape hatch. It never re-derives
  independence.
- **The re-plan loop** runs through the front: a mid-build definition gap routes
  `dispatch → shape → plan` (re-plan mode) — the front re-shapes; build does not patch around a
  front decision.

## Output

- A **plan doc** on a harness surface: an ordered set of implementation units — the build
  carriers — each conforming to the IU-schema (content fields incl. `acceptance_check`, complete
  `dependencies` capturing ordering and overlap, `autonomy`, `verification`, provenance), with
  sequencing rationale and a scope summary. `acceptance_check` is the runnable command that
  proves each unit's `acceptance` — build runs it and shows the raw output.
- The **ranked, routed lens findings** over the plan doc (from the dispatch), surfaced and
  actioned in-session, folded back into the plan.
- **No carrier write and no gate record.** The plan doc returns to `shape`, which fires
  `commit-to-build` — the operator's decision, recorded once on the WI grouping; the units
  inherit it by reference.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/confidence-anchors.md
@references/findings-schema.md
@references/severity-scale.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/lens-dispatch.md` — `lens-dispatch`

