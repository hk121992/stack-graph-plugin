---
kind: reference
id: work-item-schema
title: Work-item schema — the carrier on the product-dashboard
description: The structured state of a work item (a carrier, D44) on the product-dashboard's work ledger. Keeps three kinds of state strictly separate — authored facts (committed), projected facts (derived), and the terminal snapshot (frozen at close).
status: v0.2.0 — 2026-06-01
---

# Work-item schema

A **work item** is the unit of product work — the **carrier** (D44) that travels the dev-sprint and is
rendered on the product-dashboard. It is **not a scalar stage** and **not a graph node**; it is a
runtime instance. Its state is kept in **three strictly separate kinds** (conflating them is the core
modelling risk):

## 1. Authored facts — committed, in the work-item file

| field | value | written by |
|---|---|---|
| `id`, `title` | identity | author, at creation |
| `lifecycle_state` | `idea → discovery → defined → committed → in-delivery → shipped → live → (parked \| killed)` | **gates** (operator go/no-go) |
| `gate_decisions[]` | append-only `{seq, hash, gate, decision, owner, timestamp, evidence_refs, confidence, conditions?, override?}` — **the committed record of every lifecycle transition** (the *when* + *why* of each gate); `seq` is a monotonic integer (0-based position in the log), `hash` is a content hash of the entry (excluding `seq`/`hash` themselves) | **gates** (operator) |
| `stage_override` | optional — an explicit operator override of the projected stage, when the projection is wrong | **operator** (authored) |
| `children[]` | planned child work-item ids (decomposition); each materialises as its own work item at `build`; the parent aggregates | **curator** (from the plan) |

Plus the **curator-maintained content** (PR-gated): the problem/opportunity (the *why*), `outcome_link`
(the OKR it serves → vision; an **authored** link, D38), `value_prop_link` (VPC job/pain/gain), `risk_state`
(the four-risks evidence state, strength × maturity bar), `tier` (T1/T2/T3, D45), the solution (once
`committed`), `links` (spec PR / build PRs / experience-contract / debrief / `promoted_from` — the
source standalone-IU id(s) a promoted work-item cites, R5 provenance), `disposition` (for
parked/killed: the reason — kept, the anti-portfolio).

## 2. Projected facts — derived from the event log, NOT committed

| field | value | derived from |
|---|---|---|
| `current_stage` | the dev-sprint stage the carrier is at (when `in-delivery`) | the **latest stage event** for this carrier in the `.stack-graph/` event log — **unless** a `stage_override` is set, which wins |
| `dev_transition_history` | the dev-stage traversal sequence | the **sequence of stage events** in the log |

**No stage or curator writes these** (D44). The dashboard *joins* them onto the authored file at render.
On a context without the event log (a fresh clone), they are simply **unknown/stale** — see the
artefacts spec's degraded mode.

## 3. The terminal snapshot — frozen into the record at close

| field | value | written by |
|---|---|---|
| `frozen_timeline` | a one-time snapshot of `dev_transition_history` (+ final `current_stage`) | a **recorder**, at any **terminal** `lifecycle_state` (`shipped`/`live` via `debrief`; `parked`/`killed` via the kill/park recorder) |

**`frozen_timeline` shape** (the sub-shape the dashboard renders):
```
{ "final_stage": stage,
  "captured_at": iso8601,
  "transitions": [ { "stage": stage, "at": iso8601 } ] }
```
This envelope is deliberately distinct from the projection snapshot's `transition_summary` (which is a
derived, live view keyed to a snapshot SHA). `frozen_timeline` is a **committed terminal snapshot** —
written once at close, never derived again.

This is the **only** point a derived value enters the committed file — a recorder action **keyed off the
terminal transition** and **decoupled from lifecycle advancement** (the gate advances the state; the
recorder freezes the timeline). It guarantees no terminal item loses its history when the (gitignored)
event log is gone.

## Invariants

- **Three writers, three kinds, never crossed.** Gates write `lifecycle_state` + `gate_decisions`; the
  curator writes content + `children`; the projection *derives* `current_stage`/`dev_transition_history`
  (writes nothing in the file); a recorder freezes `frozen_timeline` once, at close.
- **One identity, many projections** — forward workspace, delivery traversal, durable record are facets of
  one carrier; never forked.
- **Problem-framed until `committed`** — the solution crystallises only at `committed` (Torres).
- **The durable record** = `gate_decisions[]` + `risk_state` + `frozen_timeline` — proof we made the call
  deliberately on the best evidence available, and when.
- **`gate_decisions[]` append-only — stable-identity definition.** For all prior indices i, entry at
  position i is unchanged (verified by `seq` equality + `hash` equality); the log length only grows. The
  CI append-only invariant is enforceable only against this stable-id'd log — a diff without `seq`+`hash`
  cannot reliably detect edits to existing entries vs. reorderings.
- **Recorder-freeze invariant.** A terminal `lifecycle_state` (`shipped`/`live`/`parked`/`killed`)
  **implies** `frozen_timeline` present. CI should treat a terminal item lacking `frozen_timeline` as a
  **data-integrity warning** — the portal flags it visibly rather than silently omitting the timeline
  (the freeze may have been missed; the event log may already be gone).
