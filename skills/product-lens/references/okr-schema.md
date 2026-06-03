---
kind: reference
id: okr-schema
title: OKR / outcome-layer schema
description: The outcome layer the product-dashboard is organised around — vision → objectives (OKRs) → north-star → KPIs. The targets a work item's outcome_link points at, and the yardstick the Progress panel measures against.
status: v0.1.0 — 2026-06-01
---

# Outcome-layer schema (OKRs)

The product-dashboard is organised around **outcomes, not output**. This is the structure the
**vision & strategy** panel anchors and the **progress** panel measures; a work item exists to move an
objective (its `outcome_link` points here).

## The layers

| layer | what | cadence |
|---|---|---|
| **Vision** | the long-term concept of what we're building toward | durable (years) |
| **Objectives (OKRs)** | the customer / business problems to solve *now* to move toward the vision — each an *outcome*, never a feature | per cycle, rolling |
| **North-star** | the single metric that best proxies delivered value | durable |
| **KPIs / input metrics** | the measurable signals that show an objective moving | continuous |

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
- **Work items ladder up.** Every work item's `outcome_link` points to an objective; the
  product-dashboard's *contribution* view rolls work items up to objectives → the vision. The link is
  **authored** (D38/D39), not inferred.
- **Measured when there is signal.** North-star / KPI movement is shown when real data exists; pre-launch
  the layer holds the **targets + our own read** of them — the strategic-analytics layer is
  **input-gated** on real user signal (D49), not deferred.
