---
kind: reference
id: okr-schema
title: OKR / outcome-layer schema
description: The outcome layer the product-dashboard is organised around — vision → objectives (OKRs) → north-star → KPIs. The targets a work item's outcome_link points at, and the yardstick the Progress panel measures against.
status: v0.2.0 — 2026-06-05
changelog:
  - v0.2.0 (2026-06-05): add explicit `vision` field/holder — the apex the objectives ladder to; feeds the dashboard vision panel; input-gated on operator stating a vision, not on user data
---

# Outcome-layer schema (OKRs)

The product-dashboard is organised around **outcomes, not output**. This is the structure the
**vision & strategy** panel anchors and the **progress** panel measures; a work item exists to move an
objective (its `outcome_link` points here).

## The layers

| layer | what | cadence |
|---|---|---|
| **Vision** | the long-term concept of what we're building toward — the apex all objectives ladder to | durable (years) |
| **Objectives (OKRs)** | the customer / business problems to solve *now* to move toward the vision — each an *outcome*, never a feature | per cycle, rolling |
| **North-star** | the single metric that best proxies delivered value | durable |
| **KPIs / input metrics** | the measurable signals that show an objective moving | continuous |

## Vision holder

The **vision** is an explicit top-level field in the outcome layer — not implied by the objectives.

| field | meaning |
|---|---|
| `statement` | a short (1–3 sentence) product vision — the long-term outcome we are building toward, written as a user/market outcome, not a feature list |
| `horizon` | optional — the time frame the vision targets (e.g. "3–5 years"); omit if the operator has not specified one |

**Consumer:** the product-dashboard's **vision & strategy** panel reads `statement` (and optionally `horizon`) directly — a content read, not a projected state. No signal or user data is required; the input gate is solely the **operator stating a vision**.

**Ladder terminus:** every `outcome_link` chain — work item → objective → vision — terminates here. The dashboard's contribution view rolls up to this apex. An objective with no `vision_link` note is incomplete (the link is implicit via the layer structure; a curator note makes it explicit when the objective's relationship to the vision is non-obvious).

## An objective

| field | meaning |
|---|---|
| `id`, `statement` | the outcome to achieve (e.g. "reduce activation drop-off below 15%") — a problem/outcome, never a solution |
| `key_results[]` | the metrics that confirm the objective is met — `{metric, target, current}` |
| `north_star_link` | how this objective relates to the north-star metric |
| `maturity_note` | what evidence is available at the product's maturity (pre-launch: intent / proxy; first-users: real signal; scale: measured) |

## Invariants

- **Outcomes, not output.** Objectives are problems to solve / outcomes to move — never feature lists
  (SVPG). If an item can only be stated as a feature, it is not an objective.
- **Vision is the apex, not implied.** The `vision` holder is a first-class field, not a label on the
  layer diagram. The outcome ladder — work item → objective → vision — only terminates meaningfully
  when a vision `statement` is present. Input gate: the operator states a vision; no user data required.
- **Work items ladder up.** Every work item's `outcome_link` points to an objective; the
  product-dashboard's *contribution* view rolls work items up to objectives → the vision apex. The link
  is **authored** (D38/D39), not inferred.
- **Measured when there is signal.** North-star / KPI movement is shown when real data exists; pre-launch
  the layer holds the **targets + our own read** of them — the strategic-analytics layer is
  **input-gated** on real user signal (D49), not deferred.
