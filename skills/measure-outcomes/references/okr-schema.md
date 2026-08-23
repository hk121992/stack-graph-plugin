---
subject: okr-schema
title: OKR / outcome-layer schema
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring or validating the OKR layer."
derive-from: [okr-schema]
reviews-on: okr-schema-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [work-item-schema, experience-contract-schema, product-definition-guidance, bindings-contract, four-risks, product-dashboard-conventions]
---

# OKR / outcome-layer schema

The **outcome layer** a product is organised around — **outcomes, not output**. It fixes the ladder a
work-item's outcome anchor points at and the yardstick the loop measures against; an objective is an **outcome,
never a feature**. This reference fixes the *shape*; the harness fills its own objectives on its local objectives
surface (the **instance**), and `strategy-curator` authors that surface to this schema. The outcome layer is
**mandatory for every harness** — the strategic spine the workflow ladders to (the strategy canvas that may sit
behind it is harness-optional).

## The layers {#layers}

| layer | what | cadence |
|---|---|---|
| **Vision** | the long-term outcome being built toward — the apex all objectives ladder to | durable |
| **Objectives (OKRs)** | the customer/business problems to solve *now* to move toward the vision — each an outcome | rolling |
| **North-star** | the single metric that best proxies delivered value | durable |
| **KPIs / input metrics** | the measurable signals that show an objective moving | continuous |

## The vision holder {#vision}

The vision is an **explicit top-level field**, not implied by the objectives: a short `statement` (the long-term
user/market outcome, not a feature list) plus an optional `horizon`. It lives **here, once** — the apex of the
outcome layer; the strategy thesis carries the rest of its kernel and **must not restate** the vision. Every
outcome-anchor chain (work-item → objective → vision) terminates here. An objective with **no link to the
vision is incomplete** — the link is implicit via the layer structure, but a `vision_link` note makes it
explicit when an objective's relationship to the vision is non-obvious.

## An objective {#objective}

| field | holds |
|---|---|
| `id` · `statement` | the outcome to achieve — a problem/outcome, never a solution |
| `key_results[]` | the metrics that confirm it — `{ metric, target, current }` |
| `north_star_link` | how it relates to the north-star metric |
| `maturity_note` | the evidence available at the product's maturity (intent/proxy → real signal → measured) |
| `strategy_link` | optional — the canvas-entry id of the bet this objective advances or tests; resolvable, symmetric with a work-item's value-prop link |

## Invariants {#invariants}

- **Outcomes, not output.** An objective is a problem to solve / an outcome to move, never a feature list; if it
  can only be stated as a feature, it is not an objective.
- **Vision is the apex, and lives once.** The vision holder is first-class, not a label; the ladder terminates
  meaningfully only when a `statement` is present; the strategy thesis carries the kernel, never a second copy of
  the vision.
- **`strategy_link` closes the objective→bet seam.** When present, it resolves the objective to the bet and
  surfaces the bet's evidence posture; a killed bet surfacing here is the **pivot signal**.
- **Work-items ladder up.** Every work-item's outcome anchor points to an objective; the contribution view rolls
  up to the vision apex. The link is **authored**, never inferred.
- **Measured when there is signal.** North-star / KPI movement shows when real data exists; pre-launch the layer
  holds the targets + the product's own read of them — the layer is **input-gated on real signal**, not deferred.

## Cite out {#cite-out}

- **The instance** — the harness's filled objectives surface, runtime → the harness surface / bindings-contract.
- **The authoring owner** — the node that authors the objectives surface to this schema → strategy-curator.
- **The work-item anchor** that points here — the outcome-link **xor** improves → [work-item-schema](../../../references/work-item-schema.md) · [IU-schema](../../../references/IU-schema.md).
- **The optional bet/canvas layer** `strategy_link` resolves into → the strategy canvas (VPC/BMC), harness-optional.
