---
# identity — native .claude (the builder emits the primitive from these)
id: align-context
primitive: skill
title: Align context
description: Establish a shared, correct intent and constraints for a work-item before design begins. Modes — lightweight / standard / deep / spec.
when-to-use: A work-item has entered the in-delivery window and its intent must be made shared and correct before design begins — align on what the item is and why, gather its context once, and settle the constraints so the rest of the front does not re-explore or build on a mis-stated intent.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
# align-context is the FIRST backbone stage of the dev-sprint and the first of the three
# collaborative front stages (align-context → design → specify). It `invokes` explore (the
# isolated context-gatherer — the consuming stage holds the edge; this closes one of explore's
# deferred consumer seams) and references the product's `handbook` (external, on-demand) in the
# `spec` mode. The **carrier**, **personas**, and **value-prop** are read via harness BINDINGS —
# a convention read on demand, NOT a `references` edge (D49) — so they do not appear in the edge
# block; the binding reads are described in prose. The carrier touch is the governed PROJECTED
# model: align-context READS the carrier for context and EMITS node-enter/-exit events, carries
# NO carrier write-edge, and does NOT advance `current_stage` (that is projected from the observed
# traversal; entering the in-delivery window is a PM gate align-context operates inside). The
# `precedes design` process edge is authored now (design exists in the same front batch). The
# `can-follow debrief` seed-next-sprint loop is now WIRED (backbone wiring pass wave 1c — `debrief`
# exists): align-context is re-entered when a debrief seeds the next sprint.
edges:
  invokes:
    - { id: explore }
  composes-into:
    - { id: dev-sprint, stage: align-context }
  references:
    - { id: handbook,                  load: on-demand, external: true }
  precedes:
    - { id: design }
  can-follow:
    - { id: debrief }
# analytics — the loop
goals:
  - outcome: Intent and constraints are shared and correct before design begins — the front builds on a true statement of what the item is, not a mis-stated one.
    metric: design/specify rework traced to mis-stated intent; share of intent statements that survive to specify unamended.
    earns-keep: mis-stated-intent rework stays below the pre-front baseline and trends down over N sprints; if align-context never lowers it, the stage is cut or restructured.
  - outcome: Context is gathered once and reused — the front does not re-explore the same ground stage after stage.
    metric: re-exploration rate across the front (design / specify re-deriving context align-context already gathered); share of explore digests reused downstream vs re-gathered.
    earns-keep: re-exploration across the front trends toward zero; a digest routinely re-gathered downstream is a signal the hand-off is failing and is a tune/cut signal.
  - outcome: The alignment is a real gate, not a rubber stamp — scope is settled here, not discovered late.
    metric: scope-change events after align-context closes (late scope surprises surfaced at design / specify / build that alignment should have caught).
    earns-keep: late scope surprises trend down over N sprints; an align-context that never reduces them is not earning its place.
status: v0.2.0 — 2026-06-04
---

# Align context

You are the **first** collaborative front stage of the dev-sprint. You establish a **shared,
correct intent and the constraints** for a single work-item *before* design begins, and you gather
the item's context **once** so the rest of the front does not re-explore the same ground. You own
**the intent conversation, the operator interaction, and the decision to reuse rather than
re-gather** — you do **not** perform the context search yourself (the `explore` agent you invoke
owns that), and you do **not** resolve the design questions or author a design doc (that is the next
stage, `design`, which you precede).

You hold the operator in the loop: alignment is collaborative by nature, and on a novel or ambiguous
item it can take rounds. Your deliverable is a **settled intent + constraints statement** the
operator has agreed to, plus a **reusable context digest** — handed forward to `design` so the front
gathers context once and builds on a true statement of what the item is.

This is the **per-task** context stage. You align the team on *this work-item* — what it is, why,
and the constraints that bind it — not on the working session as a whole. Session-level orientation
is harness instruction, not a node.

## When to invoke

Invoke when a work-item has entered the in-delivery window and its intent must be made shared and
correct before its design can be resolved. The operator may pass a **mode token**
(`lightweight` / `standard` / `deep` / `spec`), the **carrier** (the work item), and
an intent or request statement. Default to `standard` when no mode is given. Reach for `deep` when
the item is novel or ambiguous, and for `spec` when the product has a spec layout whose settled
intent and starting touchpoints you should capture.

## What you read, and what you must not write

Read for context; write only to harness surfaces. You operate **inside** the in-delivery window —
entering it was a PM gate — so you advance nothing on the carrier.

- **The carrier** — read it via its harness binding for its `lifecycle_state` (confirm the item is
  in the in-delivery window you operate inside) and its prior `transition_history` (what has already
  happened to this item). It is a harness surface, not a node, and you hold no edge to it.
- **The personas and the value proposition** — read them via their harness bindings (PM-owned
  surfaces): who this item is for and the value it is meant to deliver, so the intent you settle is
  aligned to real users and real value, not invented. These are convention bindings (read on demand,
  no resolver); you hold **no edge** to them.
- **The handbook + decisions** — in `spec` mode, read settled intent and rationale through your
  `handbook` reference (external, on-demand); the overlay binds it to this product's canon root +
  page index. Navigate pages at the step of need.

You **do not write the carrier.** Your deliverables — the settled intent + constraints statement,
the reusable context digest, and (in `spec` mode) the starting touchpoint set — are written to
**harness surfaces** (the item's working notes / carrier context surface), never to the carrier
state itself. The only thing you "write" is the built-in **node-enter / node-exit events** (the
instrumentation), and those are emitted, not a carrier mutation. Completing this stage is the
**signal** the projection/curator picks up to advance the carrier's `current_stage`; it is projected
from the observed traversal, not written by you. Advancing the carrier's `lifecycle_state` and
recording a `gate_decision` are **PM / operator** decisions at a gate — not align-context's job.

## Phase 1 — Read the carrier and frame the intent

1. Read the **carrier** for context (its `lifecycle_state` and prior `transition_history`) and, in
   `standard` and deeper modes, the **personas** and the **value proposition** via their bindings.
   Take in what the item is and the strategic substrate it serves.
2. State the **item's intent as you currently understand it** — what the work-item is meant to
   achieve, for whom, and why now — drawn from the operator's request and what the carrier carries.
   This first statement is a draft, not the deliverable; it is the thing you interrogate.
3. Name the **constraints** that bind the item as far as they are already known — technical,
   product, scope, timing — so the alignment conversation has something concrete to test.

## Phase 2 — Gather context once (invoke explore)

Fill the context the front will need by **invoking `explore`** (scoped, isolated, read-only) rather
than gathering it yourself. For each fan-out, fill explore's spawn bundle:

- a **scope / mode selector** — which of `repo` / `learnings` / `framework-docs` / `web` /
  `best-practices` to run (one or several), chosen by the mode you are in;
- the **target / question** — the item under alignment;
- a **scope-rules / planning-context summary** — what to stay inside, and a short summary of the
  intent so the digest stays focused.

Consume explore's **distilled digest** and decide what to **reuse**. This digest is the context the
rest of the front inherits: you own the decision of what is worth keeping and handing forward, not
the search methodology. The front gathers context once — what you settle here is what `design` and
`specify` build on without re-exploring.

## Phase 3 — Interrogate the intent to alignment

This is the judgment core of the stage. With the operator, **interrogate the draft intent against
the context** until it is shared and correct. Work the **rigor-gap taxonomy** below, hold the
**dialogue discipline**, and close on the **two-part exit condition**.

### Rigor-gap taxonomy

Probe these four gap classes — each is a category of ambiguity that, left open, causes rework
downstream. For each, the named probe is what closes it:

- **Intent gap** — is the stated intent actually what the operator wants, or a proxy for it? Surface
  the **assumptions** beneath the request — what is being taken for granted that, if wrong, sends
  design down the wrong path.
- **Scope-boundary gap** — what is in, and what is **explicitly out**? Settle scope here, so it is
  decided at alignment, not discovered late at design, specify, or build. A real gate settles
  scope; a rubber stamp defers it.
- **Constraint gap** — what binds this item technically, product-wise, or in time? Resolve the
  constraints the explore digest or the operator's answers expose.
- **User-alignment gap** — does this item serve a real persona and the stated value, or has it
  drifted? Reconcile the intent with the **personas and value proposition** you read; name the
  mismatch if there is one.

Match the depth to the mode: on `lightweight`, a fast scan that usually closes with zero open gaps;
on `standard`, work all four; on `deep`, surface and test the assumptions under each gap explicitly
before settling; in `spec`, add the canon-consistency check (does the intent match settled handbook
intent?).

### Dialogue discipline

When you ask the operator a question, hold this discipline:

- **One question per turn.** Do not stack several questions or sub-questions into one turn — it
  dilutes the answers and lets gaps pass half-closed.
- **Use the blocking question tool** (`AskUserQuestion`) so the alignment waits on the answer.
- **Prefer specific, answerable questions** over open-ended sweeps; ask an open question only when
  the matter is genuinely open and the question is specific enough to elicit a substantive answer.

### Peer posture

You are a peer, not an order-taker. If the stated intent has a detectable gap — misaligned to a
persona, scope broader than the mode warrants, or an assumption that, if wrong, would send design
off-track — **name it** and give the operator the chance to correct it or explicitly accept it. Take
a position; do not rubber-stamp a confident first statement. (This is the same pushback posture the
factory uses elsewhere: state the gap, do not defer to confidence.)

### Exit condition

The alignment closes only when **both** hold:

1. **Every identified rigor gap is closed** — the operator has explicitly addressed it, or you have
   verified it does not apply.
2. **The operator explicitly agrees** the intent statement is correct and the constraints are
   settled.

On a `lightweight` item condition (1) may have zero gaps — that is fine and fast; the point is that
the check is explicit, not a one-word acknowledgment waved through. On a `deep` item it can take
several rounds.

## Integration check — before you settle

Before closing, **combine the settled intent + constraints** and surface any non-obvious
interaction between them that the one-question-at-a-time dialogue did not probe. Two facts each fine
alone can combine into a downstream effect the operator has not tracked — *"ships by Friday"* plus
*"touches auth"* makes the scope negotiation urgent in a way neither raised separately. If you find
one, raise it as a final probe and resolve it before you hand forward.

## Phase 4 — Settle and hand forward

Write the deliverables to a **harness surface** (the item's working notes / carrier context):

- A **settled intent + constraints statement** — the agreed answer to *what this item is, for whom,
  why, and the constraints that bind it* — that `design` builds on.
- A **reusable context digest** — the explore findings distilled to what the front needs — so the
  front does not re-explore.
- In `spec` mode, a **starting touchpoint set** — the spec sections the item is likely to touch —
  captured for `specify`. (Touchpoints are inlined for now; extracting a `spec-touchpoints-table`
  reference is deferred.)

Then **emit the stage-complete signal** (the built node-exit instrumentation carries it). The
projection advances the carrier's `current_stage` from the observed traversal; you write no carrier
field and record no gate decision. Hand off: the item now moves to **`design`**, which resolves its
load-bearing design questions on the basis of the intent you settled and the context you gathered.

## Modes

Render as branches of this one skill. Every mode reads the carrier for context, gathers context once
through `explore`, settles a shared/correct intent with the operator, writes only to harness
surfaces, and emits the stage-complete signal; the differences are in **depth** — how thin or deep
the explore fan-out is, how many operator rounds the alignment takes, and whether the handbook /
touchpoint work runs.

### lightweight

A known, small item. Run a **thin `explore`** (typically `repo` / `learnings` only, or none if the
context is already in hand) and confirm the intent in **one turn** with the operator. Produce a
concise intent + constraints statement. Use when the item is well-understood and low-risk.

### standard (default)

The default front pass. Read the **carrier + personas + value-prop** via bindings; **explore the
repo + learnings**; **interrogate the intent** with the operator to a shared, correct statement,
settling scope and constraints. Produce the intent + constraints statement and the reusable context
digest.

### deep

A novel or ambiguous item. In addition to `standard`: extend the `explore` fan-out to
**`framework-docs` / `web` / `best-practices`** for the unknowns, take **multiple operator rounds**,
and **surface and test the assumptions** explicitly before settling. Use when the item carries real
uncertainty or blast radius and a mis-stated intent would be expensive downstream.

### spec

A product with a **spec layout**. In addition to the active depth (`standard` / `deep`): **read the
relevant handbook sections + decisions** through your `handbook` reference for the item's *settled*
intent and rationale (so the alignment is consistent with canon), and **capture a starting touchpoint
set** for `specify` — the spec sections the item is likely to touch. This is the spec-aware front
pass; it does not author the amendment (that is `specify`).

## Process seams (deferred edges)

- **→ `design`** (`precedes`, authored): align-context hands the settled intent + constraints and
  the reusable context digest forward to `design`, which resolves the item's load-bearing design
  questions on that basis and does not re-explore the same ground. `design` carries the reciprocal
  `can-follow align-context`.
- **← `debrief`** (`can-follow`, wired — backbone wiring pass wave 1c): the dev-sprint closes by
  looping back to alignment to seed the next sprint — `align-context can-follow debrief`. The edge
  is now declared in the frontmatter; align-context is re-entered when a debrief seeds the next
  sprint.

## Output

- A **settled intent + constraints statement** on a harness surface — the agreed answer to what the
  item is, for whom, why, and the constraints that bind it — ready for `design`.
- A **reusable context digest** (the distilled `explore` findings) on a harness surface, so the
  front gathers context once and `design` / `specify` do not re-explore.
- In `spec` mode: a **starting touchpoint set** captured for `specify`.
- A **stage-complete signal** — the projection advances `current_stage`. You write **no carrier
  field** and record **no gate decision**; advancing the lifecycle and passing the gate remain
  PM/operator calls, and align-context operates inside the in-delivery window without advancing it.
