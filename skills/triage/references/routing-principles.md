---
kind: reference
id: routing-principles
title: Routing principles — the coordinator's decision / depth / tool routing
description: The routing logic the unified front's coordinator and `triage` import — three calls per piece of work — who resolves each decision (the operator/model altitude line; mechanical/taste/challenge), how much shaping (the depth gradient, gated on fork-presence), which capability nodes to draw on — plus the meta-discipline (prefer rules, infer where needed, trace and improve every call) and the engineering auto-decide principles.
status: v0.1.0 — 2026-06-16
---

# Routing principles

The unified front's coordinator (the working session) and `triage` make three routing calls per
piece of work — **decisions** (who resolves), **depth** (how much shaping), **tools** (which
capability nodes). These principles govern all three. Both nodes import this reference; routing is
a **defined, improvable node**, not per-session free judgment.

## Meta — deterministic where possible, inference where necessary; improvable over time

- Prefer a signal or rule over a judgment; use inference only where a rule cannot capture it.
- **Every routing call emits a trace** (the decision + the signals it used) so a mis-route is
  observable and routing sharpens over time: examples → guidance → better-defined rules. Start with
  examples + guidance, not full rules.
- Routing is itself on-graph — a defined node the loop measures and improves, never free-clauding or
  CLAUDE.md. The detailed rules are expected to evolve; this improvability is the settled design, not
  a gap.

## 1 · Decision routing — WHO resolves each decision (the altitude line)

- **Product / human-judgment** (intent, value, the right problem, product & design forks, outcome
  trade-offs) → **the operator (HITL)**, never auto-decided. The early, plain-English, outcome-first
  leg.
- **Engineering / not-product-judgment** (technical decomposition, approach, the plan, the IUs) →
  **automated + operator sign-off**. Sub-classify each:
  - **Mechanical** (one right engineering answer) → auto-decide, traced, not surfaced.
  - **Taste** (engineers could reasonably differ) → auto-decide **with a recommendation**, surfaced
    at the gate.
  - **Challenge** (the model thinks the operator's direction should change) → **never auto-decided**;
    surfaced with rich context (what you said / the recommendation / why / what we might miss / the
    cost if wrong); **the operator's direction is the default** — the model makes the case. Add urgent
    framing for a safety / feasibility blocker.
- **Ambiguous product-vs-engineering → default to product (the operator).** Wrongly auto-deciding a
  product call costs more than asking.
- **No challenge-class decision originates in the AFK leg** — challenges surface in the front, where
  the operator is present.

## 2 · Depth routing — HOW MUCH shaping (the gradient), gated on fork-presence

- A gradient: **thinnest** (already decision-complete → `specify-slice`'s check → the loop) …
  **deepest** (unresolved forks → a full worked session: intent → design → specify → decompose).
- **Infer depth** from signals — already decision-complete? unresolved forks? blast-radius / novelty
  / size / does-it-decompose? — inference, improvable via the trace.
- **The sign-off gate keys on fork-presence, not the inferred depth.** It is skippable only when no
  unresolved or auto-resolved load-bearing (product / taste) decision exists — whatever the tier.
  Depth sets *ceremony*; fork-presence sets *whether the gate fires*.
- **Fork-detection is conservative — the gate is only as good as detection.** "No fork present" and
  "fork not yet detected" are not the same: **assume a fork is present until the classifier
  affirmatively shows fork-absence**, so a detection miss fails toward *gate fires / route through
  `design`*, never toward *skip*. No tier is auto-exempt (this closes the `lightweight`-exempt-gate
  hole inherited from `design`'s mode-inference) — only affirmative fork-absence exempts.
- **Opt-out is explicit and logged**; it dials ceremony, never the exit bar. Every unit reaching the
  loop is decision-complete at every depth (the cold-handoff bar, `IU-schema`).

## 3 · Tool routing — WHICH capability nodes to draw on (scope-detection, conservative)

- Select from signals (classify before committing): visual → the design trio (`design-shotgun` /
  `design-implement` / `design-review`); cross-cutting / large blast-radius → the lens panel;
  product / strategy uncertainty → `product-lens`; experience-bearing → `simulate-users`;
  factory-node work → `sg-graph-maintainer`; context gaps → `explore`.
- **Conservative:** under-selection (silently skipping a needed specialist) is the costly failure, so
  on a *borderline* signal **lean toward running the specialist**, and **surface which specialists
  were skipped, and why, at the gate**.

## Engineering auto-decide principles

Scoped to the engineering side only (mechanical / taste; never the product side): **completeness ·
stay-in-blast-radius** (bounded by low-maintenance — no new infra, minimal surface) **·
reuse-over-rebuild** (DRY) **· explicit-over-clever · bias-to-action** (flag, don't block).

**The discipline — auto-decide replaces judgment, not analysis.** The full analysis still runs at
depth; only *who answers* a residual mechanical/taste decision changes. Premises — what problem to
solve — are never auto-decided.
