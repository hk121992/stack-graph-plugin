---
subject: work-item-schema
title: Work-item schema — the grouping carrier
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring or validating a work-item."
derive-from: [graph-spec, work-item-schema, carrier]
reviews-on: work-item-schema-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [IU-schema, gate-model, okr-schema, bindings-contract, product-dashboard-conventions]
---

# Work-item schema — the grouping carrier

The structured state of a **work-item (WI)** — the **grouping carrier** at the front: the catch-all raise, the
signed intent and outcome link a group of units ladders to, and the durable record of how the work moved. A WI
**groups** its [implementation units](../../../references/IU-schema.md) and is the carrier the front gates fire on; it is **not a build
carrier** — `build` reads the unit, not the WI. Its `lifecycle_state` + `gate_decisions[]` are
[the gate model](../../../references/gate-model.md)'s, carried and cited. What a WI *is* relationally — a runtime instance, not a node —
is the **graph model**'s (local, per-consumer); this fixes the **field shapes**, never an instance.

## Three kinds of state, never crossed {#three-kinds}

Conflating the three is the core modelling risk; the contract keeps them strictly separate, each with its own writer:

- **Authored facts** (committed to the WI file) — identity (`id`, `title`); **`lifecycle_state` +
  `gate_decisions[]`** (gate-model's, written only by the single gate-writer); `children[]` (the decomposition);
  and the **authored content** maintained by the dashboard's content role — the problem/opportunity (the *why*),
  the **`outcome_link`** (the OKR it serves), `value_prop_link`, the **intent block**
  `{ statement, in_scope[], out_of_scope[] }`, the **success definition** (measurable, MECE outcomes laddered to
  `outcome_link`'s KRs), `risk_state`, `tier`, the solution (once committed), `links`, `disposition`, and the
  optional **`stage_override`** (an explicit operator override of the projected stage, authored when the
  projection is wrong).
- **Projected facts** (derived, never committed) — `current_stage` and the stage-traversal history, **joined at
  render** from the analytics substrate; no stage or content author writes them — **unless `stage_override` is
  set, which wins**. On a context without the event log they are simply unknown/stale.
- **The terminal snapshot** (frozen once, at close) — a one-time `frozen_timeline` snapshot of the traversal,
  written by a recorder keyed off the terminal transition. This is the **only** point a derived value enters the
  committed file — so no terminal item loses its history when the event log is gone.

## Gate-entry scope {#gate-scope}

The WI applies [gate-model](../../../references/gate-model.md)'s **role scope** as the **grouping carrier**: it records the **front** and
**build-readiness** entries and the **closeout cascade** entry — but **not** the per-unit landing entries, which
sit on each child unit's own chain. The build-readiness gate **fires once on the grouping**; the group's N units
**inherit it by reference** (their provenance points at this WI + this authorising gate). The closeout disposition
**cascades** from the WI to the group and all its child units (a standalone unit closes on its own).

## The children decomposition {#children}

`children[]` are the unit ids the WI groups — the build carriers `build` reads directly, **not** sub-carriers
holding their own lifecycle. Each child is an [IU](../../../references/IU-schema.md) whose provenance names this WI as `parent` and
inherits its authorising gate; the WI **aggregates** their state for the dashboard. A WI is finished only when
**every child unit has reached its delivered terminal** (`shipped`, or `live` when prod-facing — gate-model's
single-main rule).

## The no-IU terminal disposition {#no-iu}

Not every raised WI yields a unit. A WI the front resolves as **not worth a unit** reaches a terminal
`lifecycle_state` — **`parked`** or **`killed`** (a *deferred* item is `parked` with intent to revisit) —
carrying its `disposition`. This is the front's **non-unit exit**, complementing the cold-handoff unit exit
([IU-schema](../../../references/IU-schema.md)); the item is **kept as the durable record, never deleted**.

## Invariants {#invariants}

- **Three writers, three kinds, never crossed** — the gate-writer writes `lifecycle_state` + `gate_decisions[]`;
  the content role authors content + `children[]`; the projection derives position (writing nothing in the file);
  a recorder freezes `frozen_timeline` once, at close.
- **One identity, many projections** — forward workspace, delivery traversal, and durable record are facets of one
  carrier, never forked.
- **Problem-framed until committed** — the solution crystallises only at `committed`.
- **The durable record** = `gate_decisions[]` + `risk_state` + `frozen_timeline` — proof the call was made
  deliberately, on the best evidence available, and when.
- **Recorder-freeze** — a terminal `lifecycle_state` implies `frozen_timeline` present; a terminal item lacking it
  is a data-integrity warning the dashboard flags visibly, never a silent omission.

## Cite out {#cite-out}

- **`lifecycle_state` · `gate_decisions[]` · the hash-chain · decision provenance · the single writer** → [gate-model](../../../references/gate-model.md).
- **The build carrier** the WI groups — the unit shape, its content fields, the provenance discriminator → [IU-schema](../../../references/IU-schema.md).
- **What a WI IS relationally**, the front, where the gates sit → the **graph-model** internals (local, per-consumer — not shipped or linked here).
- **The relational carrier summary** — one-shape-not-two-kinds, the two substrates, position-is-projected → the **graph-spec** (local, per-consumer).
- **`current_stage`** — projected, read-only → the context engine / generation model.
- **The dashboard content-authoring boundary** over the authored content → product-dashboard-conventions.
- **Term** senses (carrier · work-item · disposition · gate) → glossary.
