---
# identity — native .claude (the builder emits the primitive from these)
id: design
primitive: skill
title: Design
description: Run the shared product + engineering/design front for a work-item — resolve design questions by intended outcome, produce a design doc with a Spec touchpoints table, and author/refine the experience-contract.
when-to-use: A work-item's intent is aligned and you need to resolve its design by outcome before specify/plan/build — frame the solution, vet it with the lens panel over the design doc, and (for an experience-bearing item) author or refine its experience-contract.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
# Design does NOT `invokes` the lens family: the lenses already declare `composes-into @design`
# from their own side, and design fans them out by *following the `lens-dispatch` reference* with
# `target: doc` — identical to how `review` consumes the same reference with `target: diff`. The
# finding contract (findings-schema / severity-scale / confidence-anchors) is imported and passed
# into each lens's spawn prompt (the lens-consumer invariant). `confidence-anchors` does double duty:
# the same imported rubric anchors the per-decision confidence in the Phase-3 design doc (CF-2) — no
# new edge. The **product-lens** composes into
# `@design` from the PM side and is built separately (PM pack) — its strategy-check seam is left in
# prose with NO edge (F7). The **carrier** is read via bindings and the **experience-contract** via
# its external reference; design writes the design doc / touchpoints / contract to harness surfaces
# and carries NO carrier write-edge (the projected state model — `current_stage` is projected from
# the observed traversal, not written here). `precedes plan` is deferred until `plan` exists (F7).
edges:
  invokes:
    - { id: explore }
  composes-into:
    - { id: dev-sprint, stage: design }
  references:
    - { id: lens-dispatch,              load: on-demand }
    - { id: findings-schema,            load: import }
    - { id: severity-scale,             load: import }
    - { id: confidence-anchors,         load: import }
    - { id: handbook,                   load: on-demand, external: true }
    - { id: experience-contract-schema, load: on-demand }
    - { id: experience-contract,        load: on-demand, external: true }
  precedes:
    - { id: specify }
# analytics — the loop
goals:
  - outcome: Load-bearing design questions are resolved by intended outcome before specify/plan/build, rather than surfacing as rework downstream.
    metric: design decisions recorded per session; design-rework after specify/plan traced to a question left unresolved at design.
    earns-keep: downstream design-rework stays below the pre-front baseline over N sprints; if design never lowers it, the stage is cut or restructured.
  - outcome: The solution is checked against value-prop / target-user AND code-correctness / feasibility at the item altitude (the four risks at item scope), so item-level risks surface at design, not at build.
    metric: share of design sessions where the lens family + the product-lens surfaced ≥1 actioned finding; risks left unexamined at design that bit at build.
    earns-keep: design-stage findings measurably displace later build/review findings; a design pass that routinely surfaces nothing real is a cut/tune signal.
  - outcome: A design doc carrying an explicit Spec touchpoints table is produced, ready for specify.
    metric: share of design sessions producing a touchpoints table; touchpoints specify later finds missing.
    earns-keep: specify rarely has to reconstruct touchpoints from scratch.
  - outcome: For an experience-bearing item, the experience-contract is authored or refined at design, not discovered missing or stale at verify.
    metric: share of experience-bearing items whose contract was authored/refined at design vs discovered missing/stale when simulate-users runs at verify.
    earns-keep: simulate-users rarely runs against a missing or stale contract.
status: v0.3.0 — 2026-06-05
---

# Design

Run the **shared product + engineering/design front** for a work-item. This is where the product
lens and the code/design lenses converge over the **same carrier and the same
experience-contract** to resolve the item's load-bearing design questions **by intended outcome** —
before specify, plan, and build. You own **the design conversation, the lens dispatch over the
design doc, operator interaction, and the resolution to a design doc**. You do **not** perform any
lens dimension yourself (the lens agents own that) and you do **not** decide product strategy
yourself (the product-lens owns that — see *The product-strategy seam*).

You hold the operator in the loop: design is collaborative by nature, and on a novel problem it can
take rounds. Your deliverable is a **design doc with an explicit Spec touchpoints table**, ready
for `specify` — and, when the item bears an experience, an **authored or refined
experience-contract**.

## When to invoke

Invoke when a work-item's intent is aligned (typically handed forward by `align-context`) and its
design must be resolved before it can be specified, planned, and built. The operator may pass a
**mode token** (`lightweight` / `standard` / `deep` / `experience`), the **carrier** (the work item), and an intent or design-question summary. The mode token is a **suggestion**, not the only
signal — Phase 1 infers the mode from the carrier and reconciles it with any operator token (below).
Reach for `experience` (in addition to the others) whenever the item bears a user-facing
experience whose contract must be authored or refined here.

## What you read, and what you must not write

Read for context; write only to harness surfaces.

- **The carrier** — read it via bindings for its `lifecycle_state`, prior `transition_history`, the
  objective it serves, and any parent/child decomposition. It is a harness surface, not a node, and
  you hold no edge to it.
- **The experience-contract** — for an experience-bearing item, read the harness's current contract
  through your `experience-contract` reference (external, on-demand); the overlay binds it to this
  product's contract.
- **The handbook + decisions** — read settled intent and rationale through your `handbook`
  reference (external, on-demand); navigate pages at the step of need.

You **do not write the carrier.** You write the design doc, the touchpoints, and the contract to
**harness surfaces** (via bindings) — never to the carrier itself. Completing this stage is the
signal the projection/curator picks up to advance the carrier's `current_stage`; it is projected
from the observed traversal, not written by you. Advancing the carrier's `lifecycle_state` and
recording a `gate_decision` are **PM / operator** decisions at a gate — not design's job.

## Phase 1 — Frame the design question

**Mode-inference pre-flight.** Before framing, read the carrier and **infer the mode** from its
`lifecycle_state`, its complexity signals (decomposition depth, blast radius, novelty), and the
aligned-intent summary. Reconcile the inferred mode with any operator-supplied token: where they
agree, proceed; where they diverge, **surface the inferred mode and the reason** and let the
operator confirm or override. The operator's token is a suggestion, not the only signal — this
keeps a trivial change off the full lens dispatch and a genuinely novel item out of `lightweight`.
Default to `standard` when neither a token nor a clear carrier signal points elsewhere.

1. Read the carrier and the aligned intent. State the item's **load-bearing design questions** —
   the decisions that, left unresolved, would force rework at specify/plan/build.
2. Fill any context gaps by **invoking `explore`** (scoped, read-only): pass it a scope/mode
   selector (`repo` / `learnings` / `framework-docs` / `web` / `best-practices`), the target
   question, and a scope summary. Consume its distilled digest; do not re-explore ground
   `align-context` already covered — the front gathers context once.
3. Resolve each design question **by intended outcome** — reason from what the item is meant to
   achieve to the design decision, not from implementation convenience. Surface assumptions and
   take them to the operator where the question is novel or contested.

### Confirm-framing gate (hard) — affirm or redirect before the lens dispatch

Surface the **load-bearing design questions and the framing/scope** to the operator as one
affirm-or-redirect summary, and **block on it** via the platform's blocking-question tool. The lens
fan-out does not run until the operator affirms or redirects. This is a hard gate, not an
invitation: the lens pass is the expensive step, so the operator confirms the frame *before* it
fires — a design question or a scope boundary the operator doubts is caught here, not after the
fan-out. On redirect, re-frame and re-surface; only an affirm advances to Phase 2. `lightweight` is
one-pass by design and is exempt — it resolves inline without the hard gate. (This mirrors `plan`'s
Confirm-framing gate so the two front nodes stay consistent.)

## Phase 2 — Vet the design with the lens panel

Once the operator has **affirmed the framing at the Phase 1 gate** (`lightweight` excepted),
**dispatch the lens family over the design doc** by **following the `lens-dispatch` reference** with
`target: doc`. The reference gives you lens selection, the fan-out, and the deterministic merge /
dedup / corroborate / confidence-gate / severity-route reduction.

- Run the lenses **strategy-first, then parallel**: lead with the design-altitude lenses, then fan
  the remaining active lenses out in parallel.
- As you fan out, pass each lens its own spawn prompt carrying the **target** (`doc`) and the
  design doc's contents, the **scope-rules** and intent summary, and the **finding contract** — the
  finding schema, severity scale, and confidence anchors, which you hold from your imported
  references — so every lens emits to the same contract.
- **You do not direct-invoke the lenses.** They declare `composes-into @design` from their own
  side; you reach them only through the dispatch reference (exactly as `review` reaches them with
  `target: diff`). Each lens returns the compact finding tier; the dispatch reduces those returns
  to one ranked, routed finding set.

Surface the ranked findings and the soft buckets to the operator, and **action them in-session** —
fold the actioned findings back into the design before it advances. A finding that names an
item-altitude risk (the four risks at item scope) is the point of this phase: surface it here, not
at build.

## The product-strategy seam

The design front also checks the solution against **product strategy** — *is this the right
problem? does it serve the value proposition and the target user? which objective does it serve?* —
but **you do not perform that check yourself.** It is delivered by the **product-lens**, a separate
skill (the PM pack) that **composes into the `@design` front from the product-management side**.
Treat it as a peer that joins this front: where it is present in the harness, the strategy check
runs alongside your lens dispatch and its findings action into the same design doc. This node holds
**no edge** to the product-lens — it is built separately and composes in from its own side; name
the seam, leave the strategy judgement to it.

## Phase 3 — Author the design doc + touchpoints

Produce the **design doc** to a harness surface:

- Record the **resolved design decisions** — each as a structured row: the **design question**, the
  **decision** that settles it (outcome-driven), its **confidence** (a `confidence-anchors` value —
  the same discrete rubric you hold from the imported finding contract, applied to your own
  resolution), and the **primary alternative** considered. A low-confidence decision recorded as
  such travels with its uncertainty into specify/plan instead of reading as settled; the alternative
  is the record specify needs when a touchpoint supersedes a prior spec section. (This mirrors the
  experience-contract's own evidence discipline; it reuses the `confidence-anchors` reference design
  already imports — no new reference.)
- Carry an explicit **Spec touchpoints** table — for each touched spec area, the *spec doc*, the
  *section*, and the *relationship* (amend / add / supersede / reference). This table is what
  `specify` turns into the canonical amendment; produce it here so `specify` does not reconstruct
  it. (Touchpoints are inlined in the doc for now.)
- **Zone footprint (when the harness uses the zone matrix).** Name the **vertical(s)** — the customer
  experiences the change touches — and, where it is genuinely single-layer, the specific **cell(s)**.
  This is the experience-axis sibling of the Spec touchpoints table: `plan` reads it to resolve each
  vertical's **column** via `explore`'s `zone` mode and decompose by vertical slice. **Capability-gated
  — omit entirely when no axes are bound.** (Shape and resolution rules: `axis-entry-schema`.)
- Fold in the actioned lens findings and any product-lens findings so the doc reflects the vetted
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

This is the **design-time end of the experience thread**: the contract you author here is the same
artefact `simulate-users` grades against at verify. Authoring or refining it now is what keeps
`simulate-users` from running against a missing or stale contract. You author the **shape and
content discipline**; the harness fills its own invariants, failure modes, budgets, and path.

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

`explore` for context gaps; resolve the design questions by outcome; **affirm the framing at the
hard gate**; **dispatch the lens family over the doc strategy-first then parallel**; author the
design doc + the Spec touchpoints table. The default front pass.

### deep

A novel or contested item. **Multiple operator rounds**, surfacing and testing assumptions; run the
dispatch with the **adversarial lens on** (and any other conditional lenses the change triggers).
Use when the design carries real uncertainty or blast radius.

### experience

The thread-spanning branch. In addition to resolving the design, **author or refine the
experience-contract** for an experience-bearing item (Phase 4) — UX invariants + failure modes + AX
budgets + intended tool-path, to the harness surface, conforming to the schema. Combine with
`standard` / `deep` as the item's design complexity demands.

## Process seams (deferred edges)

- **← `align-context`** (`can-follow`, authored): design follows alignment; it consumes the aligned
  intent and the starting touchpoint set, and does not re-explore the same ground.
- **→ `specify`** (`precedes`, authored): design hands the design doc + touchpoints table to
  `specify`, which turns it into the canonical spec amendment.
- **→ `plan`** (deferred — F7): design precedes planning; the edge is authored once `plan` exists.
  Until then the flow holds in prose — a resolved design doc with touchpoints feeds the plan.

## Output

- A **design doc** on a harness surface, recording the outcome-driven design decisions — each with
  its `confidence-anchors` confidence and primary alternative — and carrying an explicit **Spec
  touchpoints** table, ready for `specify`.
- The **ranked, routed lens findings** over that doc (from the dispatch), surfaced and actioned
  in-session, folded back into the doc.
- In `experience` mode: an **authored or refined experience-contract** on the harness surface,
  conforming to `experience-contract-schema`.
- **No carrier write.** Completing design is the signal the projection/curator picks up to advance
  `current_stage`; the lifecycle and gate decisions remain PM/operator calls.
