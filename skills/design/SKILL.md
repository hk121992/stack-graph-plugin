---
name: "design"
description: "Resolves a work-item's design forks by intended outcome and fit to the problem and objective, vets them with the lens panel, and produces a design doc with a Spec touchpoints table, plus an experience-contract for experience-bearing work. Use when forks must be settled before specify/plan/build."
---


# Design

Resolve the work-item's **solution**. You are **shape's fork-resolution action**: the item's
load-bearing design questions are resolved **by intended outcome** — before specify, plan, and
build — and the resolution is vetted with the **lens panel over the design doc**. Discovery (the
right *problem*) is settled upstream by `shape-product`; you own the solution — including the
**solution-fit check**: does this solution serve the confirmed problem, the value proposition and
target user, and the objective it claims? That check is yours, folded into the outcome-driven
resolution and read against the strategy frame `shape-product` recorded — not delivered by a
separate lens. You own **the design conversation, the lens dispatch over the design doc, operator
interaction, and the resolution to a design doc**; you do **not** perform any lens dimension
yourself (the lens agents own that).

You hold the operator in the loop: design is collaborative by nature, and on a novel problem it
can take rounds. Your deliverable is a **design doc with an explicit Spec touchpoints table**,
ready for `specify` — and, when the item bears an experience, an **authored or refined
experience-contract**.

## When to invoke

`shape` dispatches you when **forks exist** — a work-item's intent is aligned and its design must
be resolved before it can be specified, planned, and built. The dispatch may pass a **mode token**
(`lightweight` / `standard` / `deep` / `experience`), the **carrier** (the work item), and an
intent or design-question summary. The mode token is a **suggestion**, not the only signal —
Phase 1 infers the mode from the carrier and reconciles it with any supplied token (below). Reach
for `experience` (in addition to the others) whenever the item bears a user-facing experience
whose contract must be authored or refined here.

## What you read, and what you must not write

Read for context; write only to harness surfaces.

- **The carrier** — read it via bindings for its `lifecycle_state`, prior `transition_history`,
  the objective it serves, and any decomposition already recorded. It is a harness surface, not a
  node, and you hold no edge to it.
- **The strategy frame** — `shape-product`'s recorded frame (the value proposition + target user
  the item serves, the objective it moves, the four-risks evidence-state, the success definition):
  the yardstick your solution-fit resolution reads.
- **The experience-contract** — for an experience-bearing item, read the harness's current
  contract through your `experience-contract` reference (external, on-demand); the overlay binds
  it to this product's contract.
- **The durable doctrine + decisions** — read settled intent and rationale through your
  `references` edges and the inlined at-hand-references-index, at the step of need: the decisions
  store for prior decisions, the glossary for the term senses your resolutions rest on. Cite the
  doctrine; do not restate or own it.

You **do not write the carrier.** You write the design doc, the touchpoints, and the contract to
**harness surfaces** (via bindings) — never to the carrier itself. Completing this stage is the
signal the projection picks up to advance the carrier's `current_stage`; it is projected from the
observed traversal, not written by you. The **decision** to advance the carrier's
`lifecycle_state` and record a `gate_decision` is the operator's at a gate — not design's job;
`record-gate` (the single writer) enacts the write.

## Phase 1 — Frame the design question

**Mode-inference pre-flight.** Before framing, read the carrier and **infer the mode** from its
`lifecycle_state`, its complexity signals (decomposition depth, blast radius, novelty), and the
aligned-intent summary. Reconcile the inferred mode with any supplied token: where they agree,
proceed; where they diverge, **surface the inferred mode and the reason** and let the operator
confirm or override. The token is a suggestion, not the only signal — this keeps a trivial change
off the full lens dispatch and a genuinely novel item out of `lightweight`. Default to `standard`
when neither a token nor a clear carrier signal points elsewhere.

1. Read the carrier, the aligned intent, and the strategy frame. State the item's **load-bearing
   design questions** — the decisions that, left unresolved, would force rework at
   specify/plan/build.
2. Fill any context gaps by **invoking `explore`** (scoped, read-only): pass it a scope/mode
   selector (`repo` / `learnings` / `framework-docs` / `web` / `best-practices`), the target
   question, and a scope summary. Consume its distilled digest; do not re-explore ground
   the front already covered — context is gathered once.
3. Interview the load-bearing forks per `operator-interview`: put the frontier to the operator
   as numbered rounds before resolving anything; log each round under a `Round N` heading in the
   session record. The interview's mechanics are the reference's — cite, do not restate.
4. Resolve the **answered tree** by intended outcome — reason from what the item is meant to
   achieve to the design decision, not from implementation convenience. Fold the
   **solution-fit check** into every load-bearing resolution: does the emerging solution serve
   the confirmed problem, the value proposition and target user in the strategy frame, and the
   objective the item claims (`outcome_link`)? A solution that resolves cleanly but serves none
   of them is a strategy finding, not a design preference — surface it. An assumption or new
   branch that surfaces during resolution re-opens the interview for that branch
   (`operator-interview`) — put to the operator or explicitly deferred at the interview's ask
   scope, auto-resolved with a trace below it, never resolved silently.

**Exit discipline — resolve every branch of the decision tree.** Your exit bar: every load-bearing
question, and every branch a resolution opens, is either resolved by outcome or explicitly
deferred with its owner named — nothing left implicitly open. This is the same conservatism as
the front's fork-detection (assume a fork is present until affirmatively shown absent), and it is
what the cold-handoff bar downstream depends on: a fork design should have closed must never
reach build.

### Confirm-framing gate (hard) — the interview's end-confirmation

The gate is the interview's **end-confirmation**. It fires when the frontier is empty and
explorations have returned; the surface is the **resolved-tree summary** — the operator's answers,
the traced auto-resolutions, and any deferrals — plus the **framing/scope**. **Block on it** via
the platform's blocking-question tool: this is a hard gate, not an invitation, and the lens
fan-out does not run until the operator affirms. On redirect, re-frame and **re-interview the
affected branches**; only an affirm advances to Phase 2. `lightweight` is exempt (one-pass by
design). `plan` retains its pre-lens affirm-or-redirect form; design's gate is the interview's
end-confirmation.

## Phase 2 — Vet the design with the lens panel

Once the operator has **affirmed the framing at the Phase 1 gate** (`lightweight` excepted),
**dispatch the lens family over the design doc** by **following the `lens-dispatch` reference** with
`target: doc`. The reference gives you lens selection, the fan-out, and the deterministic merge /
dedup / corroborate / confidence-gate / severity-route reduction.

- Run the lenses **strategy-first, then parallel**: lead with the design-altitude lenses, then fan
  the remaining active lenses out in parallel.
- As you fan out, pass each lens its own invocation prompt carrying the **target** (`doc`) and the
  design doc's contents, the **scope-rules** and intent summary, and the **finding contract** — the
  finding schema, severity scale, and confidence anchors, which you hold from the required
  references — so every lens emits to the same contract.
- **You do not direct-invoke the lenses.** They declare `composes-into design` from their own
  side; you reach them only through the dispatch reference (exactly as `review` reaches them with
  `target: diff`). Each lens returns the compact finding tier; the dispatch reduces those returns
  to one ranked, routed finding set.

Surface the ranked findings and the soft buckets to the operator, and **action them in-session** —
fold the actioned findings back into the design before it advances. A finding that names an
item-altitude risk (the four risks at item scope) is the point of this phase: surface it here, not
at build.

## Phase 3 — Author the design doc + touchpoints

Produce the **design doc** to a harness surface:

- Record the **resolved design decisions** — each as a structured row: the **design question**, the
  **decision** that settles it (outcome-driven), its **confidence** (a `confidence-anchors` value —
  the same discrete rubric you hold from the required finding contract, applied to your own
  resolution), and the **primary alternative** considered. A low-confidence decision recorded as
  such travels with its uncertainty into specify/plan instead of reading as settled; the alternative
  is the record specify needs when a touchpoint supersedes a prior spec section. (This mirrors the
  experience-contract's own evidence discipline; it reuses the `confidence-anchors` reference design
  already declares required — no new reference.)
- Carry an explicit **Spec touchpoints** table — for each touched spec area, the *spec doc*, the
  *section*, and the *relationship* (amend / add / supersede / reference). This table is what
  `specify` turns into the canonical amendment; produce it here so `specify` does not reconstruct
  it. (Touchpoints are inlined in the doc for now.)
- **Zone footprint (when the harness uses the zone matrix).** Name the **vertical(s)** — the customer
  experiences the change touches — and, where it is genuinely single-layer, the specific **cell(s)**.
  This is the experience-axis sibling of the Spec touchpoints table: `plan` reads it to resolve each
  vertical's **column** via `explore`'s `zone` mode and decompose by vertical slice. **Capability-gated
  — omit entirely when no axes are bound.** (Shape and resolution rules: `axis-entry-schema`.)
- Fold in the actioned lens findings and the solution-fit findings so the doc reflects the vetted
  design, not the first draft.

## Phase 4 — Author or refine the experience-contract (experience-bearing items)

For an experience-bearing item, **author or refine the experience-contract** to the harness surface
(via bindings), conforming to the `experience-contract-schema` you hold (read it on-demand for the
shape). Read the harness's current contract through your `experience-contract` reference, then write
the four parts plus the evidence state:

- **Session-shape invariants (UX)** — the checkable properties every session must hold, ranked by
  importance.
- **Failure modes (UX)** — the named, labelled ways the experience is known to break, each
  recognisable with one-line evidence.
- **AX budgets** — the cost envelope to the outcome: tokens-to-outcome, latency / inference-steps,
  and acceptable tool-path breadth, set per-scenario where they differ.
- **Intended tool-path** — the path the product intends the agent to take through its surface
  (which tools/nodes, in what rough order), so observed divergence reads as friction.
- **Evidence state** — mark each invariant / failure-mode / budget `assumed` / `tested` /
  `confirmed`, so the contract matures with the product.

Hold the experience content to **`ux-principles`** — the design family's shared UX standard, which
you read before action: author invariants and failure modes that meet it (the verify span's UX grading
reads the same standard). This is the **design-time end of the experience thread**: the contract
you author here is the same artefact `simulate-users` grades against at verify. Authoring or
refining it now is what keeps `simulate-users` from running against a missing or stale contract.
You author the **shape and content discipline**; the harness fills its own invariants, failure
modes, budgets, and path.

## Modes

Render as branches of this one skill. Every mode reads the carrier, resolves the design by outcome,
and writes only to harness surfaces; the differences are in depth, operator rounds, and which work
runs.

### lightweight

A known, small item. Resolve the design questions **inline** (thin or no `explore`), produce a
**light design doc** with its touchpoints, and run **always-on doc lenses only** through the
dispatch (no conditional/adversarial lenses). One-pass operator interaction — **exempt from the
hard framing-confirm gate** (the inline pass is the confirmation).

### standard (default)

`explore` for context gaps; **interview the load-bearing forks** (`operator-interview` §Depth);
resolve the answered tree by outcome; **affirm at the hard gate — the interview's
end-confirmation**; **dispatch the lens family over the doc strategy-first then parallel**; author
the design doc + the Spec touchpoints table. The default front pass.

### deep

A novel or contested item. **Multiple operator rounds** — the full tree (`operator-interview`
§Depth) — surfacing and testing assumptions; run the dispatch with the harness's
**adversarial/conditional lenses on** where bound (per lens-dispatch's trigger table).
Use when the design carries real uncertainty or blast radius.

### experience

The thread-spanning branch. In addition to resolving the design, **author or refine the
experience-contract** for an experience-bearing item (Phase 4) — UX invariants + failure modes + AX
budgets + intended tool-path, to the harness surface, conforming to the schema. Combine with
`standard` / `deep` as the item's design complexity demands.

## Process seams

- **→ `specify`** (`precedes`, authored): design hands the design doc + touchpoints table to
  `specify`, which turns it into the canonical spec amendment; from there the chain runs
  `specify → plan`, and `commit-to-build` fires at `shape`'s exit after `plan` returns.
- **Family kin — the design helpers.** `design-shotgun` (parallel design-exploration on a visual /
  experience fork) and `design-implement` (the build-and-look: real implementable artefacts, not
  production) are **`shape`'s dispatches** — shape invokes them alongside you, and your resolution
  consumes the artefacts they produce (a fork the operator can look at is a fork you can resolve
  by outcome). `design-review` is a **verify-stage modality** — the UX-grading pass over a built
  experience (against `ux-principles`) — dispatched by `verify`, not from here.

## Output

- A **design doc** on a harness surface, recording the outcome-driven design decisions — each with
  its `confidence-anchors` confidence and primary alternative — and carrying an explicit **Spec
  touchpoints** table, ready for `specify`.
- The **ranked, routed lens findings** over that doc (from the dispatch) and the **solution-fit
  findings**, surfaced and actioned in-session, folded back into the doc.
- In `experience` mode: an **authored or refined experience-contract** on the harness surface,
  conforming to `experience-contract-schema` and held to `ux-principles`.
- **No carrier write.** Completing design is the signal the projection picks up to advance
  `current_stage`; the lifecycle and gate decisions remain the operator's.

## Required references

Before taking any action, read these bundled references:

- [confidence-anchors](references/confidence-anchors.md)
- [findings-schema](references/findings-schema.md)
- [operator-interview](references/operator-interview.md)
- [severity-scale](references/severity-scale.md)
- [ux-principles](references/ux-principles.md)

## On-demand references

At the step of need, read these bundled references:

- [experience-contract-schema](references/experience-contract-schema.md)
- [lens-dispatch](references/lens-dispatch.md)

