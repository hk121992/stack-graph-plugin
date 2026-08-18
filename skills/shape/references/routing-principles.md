---
subject: routing-principles
title: Routing principles — decision / depth / tool routing
provenance: vendored
level: L2
cadence: on-demand
read-when: "Routing work — decisions, depth, tools."
derive-from: [routing-principles]
reviews-on: routing-principles-source
last-reviewed: 2026-07-01
entropy: unmeasured
status: drafted
related: [IU-schema, gate-model, handoff-prompt-convention, operator-interview]
---

# Routing principles

`shape` (the front coordinator) and `triage` make three routing calls per piece of work —
**decisions** (who resolves), **depth** (how much shaping), **tools** (which capability nodes).
These principles govern all three. The appliers import this reference; consumers of the result read
the carrier field (`IU-schema`'s `autonomy`), never re-judge it. Routing is a **defined, improvable
node**, not per-session free judgment.

## Meta — deterministic where possible, inference where necessary; improvable over time

- Prefer a signal or rule over a judgment; use inference only where a rule cannot capture it.
- **Every routing call emits a trace** (the decision + the signals it used) so a mis-route is
  observable and routing sharpens over time: examples → guidance → better-defined rules.
- Routing is itself on-graph — a defined node the loop measures and improves, never free-clauding or
  CLAUDE.md.

## 1 · Decision routing — WHO resolves each decision (the altitude line)

- **Product / human-judgment** (intent, value, the right problem, product & design forks, outcome
  trade-offs) → **the operator (HITL)**, never auto-decided. The early, plain-English, outcome-first
  leg.
- **Engineering / not-product-judgment** (technical decomposition, approach, the plan, the IUs) →
  **automated + operator sign-off** (front-shaping-leg taste: elicited upfront, below).
  Sub-classify each:
  - **Mechanical** (one right engineering answer) → auto-decide, traced, not surfaced.
  - **Taste** (engineers could reasonably differ) → auto-analyse; **in the front's shaping leg** (a
    shape-coordinated session — design fork resolution, premise finalisation) put the residual
    decision to the operator with the recommendation attached and await it
    (elicit-with-recommendation; the interview mechanic is `operator-interview`); **at the raise
    capture and in the AFK leg**, auto-decide with a recommendation, surfaced at the gate. The
    recommendation is the same would-have-been auto-decision in every leg.
  - **Challenge** (the model thinks the operator's direction should change) → **never auto-decided**;
    surfaced with rich context (what you said / the recommendation / why / what we might miss / the
    cost if wrong); **the operator's direction is the default** — the model makes the case. Add urgent
    framing for a safety / feasibility blocker.
- **Ambiguous product-vs-engineering → default to product (the operator).** Wrongly auto-deciding a
  product call costs more than asking.
- **No challenge-class decision originates in the AFK leg** — challenges surface in the front, where
  the operator is present.

## 2 · Depth routing — HOW MUCH shaping (the gradient), gated on fork-presence

- A gradient: **thinnest** (already decision-complete → `auto-shaper`'s check → the loop) …
  **deepest** (unresolved forks → a full worked session: intent → design → specify → decompose).
- **Infer depth** from signals — already decision-complete? unresolved forks? blast-radius / novelty
  / size / does-it-decompose? — inference, improvable via the trace.
- **The sign-off gate keys on fork-presence, not the inferred depth.** It is skippable only when no
  unresolved or auto-resolved load-bearing (product / taste) decision exists — whatever the tier.
  Depth sets *ceremony*; fork-presence sets *whether the gate fires*.
- **Fork-detection is conservative — the gate is only as good as detection.** "No fork present" and
  "fork not yet detected" are not the same: **assume a fork is present until the classifier
  affirmatively shows fork-absence**, so a detection miss fails toward *gate fires / route through
  `design`*, never toward *skip*. No tier is auto-exempt — only affirmative fork-absence exempts.
- **Opt-out is explicit and logged**; it dials ceremony, never the exit bar. Every unit reaching the
  loop is decision-complete at every depth (the cold-handoff bar, `IU-schema`).

## 3 · Tool routing — WHICH capability nodes to draw on (scope-detection, conservative)

- Select from signals (classify before committing): visual → the design trio (`design-shotgun` /
  `design-implement` / `design-review`); cross-cutting / large blast-radius → the lens panel;
  product / strategy uncertainty → `shape-product`; experience-bearing → `simulate-users`;
  factory-node work → the factory's graph-maintainer tooling (factory-side; not shipped to
  consumers); context gaps → `explore`.
- **Conservative:** under-selection (silently skipping a needed specialist) is the costly failure, so
  on a *borderline* signal **lean toward running the specialist**, and **surface which specialists
  were skipped, and why, at the gate**.

## 4 · AFK/HITL classifier

The one named classifier sets an IU's **`autonomy`** — it classifies **how the IU reaches
AFK-implementable**, not how it builds. **Production build is always AFK** (cold, via `dispatch`):

- **AFK** — doc-spec-able directly: a cold spec is enough to build → review → land.
- **HITL** — reaching that spec needs **build-and-look in `shape`**: the operator iterating on a real
  (non-production) artefact to settle it. An **extension of `shape`'s role** (get work to
  AFK-buildable), not an attended build.

A taste, copy, visual, or experience concern does **not** by itself make an IU HITL — it is settled by
build-and-look in `shape`, or caught at `review` / `verify`. **`autonomy` is drafted by `triage` and
finalised by the shaper** (fast/full falls out of readiness, not a second classifier).
**Dependencies sequence HITL design-resolution before the dependent AFK work.** A HITL IU is
resolved whole, warm, in `shape`.

## Engineering auto-decide principles

Scoped to the engineering side only (mechanical / taste; never the product side): **completeness ·
stay-in-blast-radius** (bounded by low-maintenance — no new infra, minimal surface) **·
reuse-over-rebuild** (DRY) **· explicit-over-clever · bias-to-action** (flag, don't block).

**The discipline — auto-decide replaces judgment, not analysis — where taste is not
shaping-leg-elicited (the raise capture and the AFK leg, §1).** The full analysis still runs at
depth; only *who answers* a residual mechanical/taste decision changes. Premises — what problem to
solve — are never auto-decided.
