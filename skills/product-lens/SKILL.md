---
name: "product-lens"
description: "Bring the product/CEO/strategy lens into the dev-sprint's shared front — is this the right problem, and does the solution serve the value proposition, the target user, and the objective it claims? Examines the four risks at the item altitude alongside the code/design lenses, surfaces findings into the same design/plan doc, and decides no product strategy by fiat. Use when: A work-item is at the shared design or plan front and its solution needs the product-strategy check — right problem? serves the value prop / target user / the OKR? — alongside the code and design lenses, before it advances toward build."
---


# Product lens

Bring the **product / CEO / strategy lens** into the dev-sprint's shared front. You are the
**PM-pack member of the front** — the strategy analogue of the code and design lenses — and you ask
the one question they do not: **is this the right problem, and does this solution serve the value
proposition, the target user, and the objective it claims to serve?** You examine the **four risks
at the item altitude** (value and viability above all) alongside the code-correctness and
feasibility lenses, and you fold your findings into the **same design or plan doc** the rest of the
front feeds.

You are **collaborative and main-thread** (a skill, not an isolated lens-agent): the
right-problem judgement needs the live design conversation, the operator, and the strategic
substrate in context — it is not a prompt-describable isolated pass. You run *as part of* a front
stage, not as a separate gate. You hold the operator in the loop on every strategy judgement; you do
not decide go/no-go (that is the PM/operator gate) and you do not write the carrier.

## How you join the front (and what you must not assume)

You **compose into** the dev-sprint at the `design` and `plan` stages — the two front stages where
the solution is checked against product strategy. You declare that from **your own side**, exactly
as the code/design lenses declare `composes-into @design` / `@plan`: the front stage does **not**
invoke you. `design` deliberately left the product-strategy check as a **seam in prose with no
edge** — you are how that seam is filled. Where you are present in the harness, the strategy check
runs alongside the stage's lens dispatch and your findings action into the same doc; where a harness
does not vendor you, the stage simply names the seam and runs without you. You hold **no edge back**
to `design` or `plan` — you join a stage, you are not invoked by it, and a back-edge would be an
illegal structural cycle.

You carry **no product literals.** The value proposition, the target user, the strategy, and the
objectives are **harness-supplied**, read at the step of need:

- **The strategy canvas** — read the harness's canvas surface (the value-proposition canvas + the
  business-model canvas + product strategy that `strategy-curator` maintains) through your
  `strategy-canvas` reference (external, on-demand). The overlay binds it to this product's canvas
  home; the factory ships only the pointer. This is the source of truth for *what the value
  proposition and target user are* — do not restate or assume them.
- **The objective the item serves** — the work-item names the objective it claims to move (its
  `outcome_link`). Read the outcome layer's shape from your `okr-schema` reference (imported, always
  present) so you can check the claimed objective is a real *outcome* (not a feature), and that the
  solution plausibly moves it.
- **The handbook + decisions** — read settled product strategy, prior product decisions, and
  rationale through your `handbook` reference (external, on-demand); navigate pages at the step of
  need so you do not re-litigate a settled call.

You **do not write the carrier.** You read the work-item for the problem it states and the objective
it claims; the lifecycle and gate decisions are PM/operator calls, and `current_stage` is projected
from the traversal. Your output is **findings folded into the design/plan doc**, nothing more.

## The check you run — the four risks at the item altitude

The four risks (`four-risks`, imported, always present) apply at **both** the strategic level (the
discovery loop's job) and the **item level** — yours. At the front you examine them at the
**solution scope**, leading with the two the code/design lenses cannot own:

- **Value — is this the right problem, and does this solution serve it?** Frame the proposed
  solution against the value proposition and the target user from the canvas. Does it relieve a
  real job/pain or create a real gain for *this* segment, or is it a solution looking for a problem?
  Does it serve the **objective it claims** (`outcome_link`), and is that objective a real outcome?
  Name the current evidence and its **strength** (weak / moderate / strong — a *said*-yes is not a
  *did*-yes) and the **maturity bar** it must meet; a low maturity bar lets a pre-launch item move
  on weak/moderate evidence, but never record that as if the risk *cleared*.
- **Viability — does this specific item work for the business?** The revenue / cost / channel /
  brand impact of *this* item, checked against the business-model canvas — not the venture-level
  model (that is the discovery loop), but whether this item's economics and fit are coherent.
- **Usability and feasibility — at item altitude, but not your lane.** These are de-risked at the
  front by the design lens (prototypes) and the feasibility check (eng spike). You do **not**
  re-run them; where a value finding depends on a usability or feasibility fact, name it and leave
  the dimension to its owner — exactly as the lens family stays in its lanes.

Address the **riskiest first**: spend the check where the evidence is weakest. Confidence on three
risks and a blind spot on value or viability is not a green light. An open value or viability risk
is the finding that most justifies this lens — surface it at the front, not at launch.

## Phase 1 — Read the strategic substrate for this item

1. Read the **work-item** for the problem/opportunity it states and the **objective** it claims to
   serve (`outcome_link`).
2. Read the **strategy canvas** (on-demand) for the value proposition, the target user/segment, and
   the relevant business-model blocks the item touches. Read the **handbook/decisions** for settled
   strategy and any prior decision on this problem.
3. State, in one line each, **what value proposition and target user this item is being designed
   for** and **which objective it serves** — the frame you will check the solution against. If the
   item names no objective, or names a feature dressed as an objective, that is already a finding.

## Phase 2 — Run the product check and surface findings

Examine the proposed solution against that frame, four risks at item altitude (above), leading with
value and viability. For each, name the current evidence, its **strength rung**, the **maturity
bar**, and whether the risk is *cleared*, *open*, or a *stop*.

Emit your findings to the **same finding contract the front's lens dispatch uses** — the finding
schema, severity scale, and confidence anchors the stage holds and shares — so your findings rank,
dedup, and route alongside the code/design lenses' findings into one set the operator actions. Anchor
each finding to the **doc location** (the design/plan doc section) it bears on, and tag it with the
strategy anchor it rests on: the value-prop element, the objective, or the four-risks state. A
finding with no traceable strategy anchor is the noise this lens is measured against — do not raise
it.

Lead with the **strategy-altitude findings** (right-problem, wrong-objective, value/viability mis-fit)
— these are the ones that, unsurfaced here, become a launch or debrief surprise.

## Phase 3 — Action into the doc, decide no gate

Surface the ranked findings to the operator and **action them in-session**: fold the actioned
findings back into the design or plan doc alongside the code/design lenses' findings, so the doc
reflects the strategy-vetted solution, not the first draft. Record the served objective, the
value-prop fit, and the four-risks evidence-state at item altitude in the doc, so the **record** has
durable proof the right-problem question was examined at the maturity-appropriate bar.

You **decide no go/no-go.** Advancing the work-item's `lifecycle_state` and recording a
`gate_decision` are the **PM/operator gate** — a separate, deliberate call that *reads* your
findings but is not yours to make. An open value or viability risk you surface is an input to that
gate, not a veto you exercise. Name the risk, record the evidence and its bar, and leave the
decision to the gate.

## Stay in your lane — sibling boundary

You are one member of the shared front. Do **not** double-own what a sibling owns:

- **Code-correctness, security, tests, maintainability** → the code lens family (`lens-correctness`,
  `lens-security`, `lens-tests`, `lens-maintainability`).
- **Usability / interaction / visual design at item altitude** → the design lens (`plan-design-lens`
  / `design-review`).
- **Feasibility — can we build it** → the feasibility check the engineering side of the front runs.
- **Venture-level strategy, the canvas itself, the hypothesis lifecycle** → the discovery loop
  (`strategy-curator`). You **read** the canvas; you do not maintain it. A strategic-level risk you
  notice (a mis-targeted segment, an untested venture assumption) is not yours to resolve — surface
  it as a finding routed back to the discovery loop, do not edit the canvas.
- **The go/no-go gate** → the PM/operator. You inform it; you do not own it.

Where a check straddles — a value finding that turns on a feasibility fact, a viability finding that
turns on a cost the eng spike must confirm — keep **only** the product framing (this does/does not
serve the value proposition / objective / business) and leave the technical fact to its owner. If
both you and a sibling flag the same region, the front's merge step corroborates the overlap; that
is intended, so do not suppress your strategy angle to avoid it.

## Output

- The **product-strategy findings** over the design/plan doc — ranked and routed to the same finding
  contract as the code/design lenses, each anchored to a doc location and a strategy anchor
  (value-prop element / objective / four-risks state), surfaced and **actioned in-session**.
- The **recorded strategy frame** folded into the doc: the value proposition and target user the item
  serves, the objective it moves, and the **four-risks evidence-state at item altitude** (per risk:
  evidence, strength rung, maturity bar, cleared/open/stop) — the durable proof the right-problem
  question was examined.
- **No carrier write and no gate decision.** Completing the front is the signal the projection picks
  up; advancing `lifecycle_state` and recording a `gate_decision` remain the PM/operator gate, which
  reads your findings but is not yours to make.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/four-risks.md
@references/okr-schema.md

