---
kind: reference
id: work-item-schema
title: Work-item schema — the carrier on the product-dashboard
description: The structured state of a work item (a carrier, D44) on the product-dashboard's work ledger. Keeps three kinds of state strictly separate — authored facts (committed), projected facts (derived), and the terminal snapshot (frozen at close).
status: v0.5.0 — 2026-06-18
changelog:
  - v0.5.0 (2026-06-18): single mechanical writer — name `record-gate` as the sole writer of `lifecycle_state`/`gate_decisions` (decision-authority = operator ≠ recording-mechanism); add `decision_provenance` (`agent-auto` structurally prohibited on product gate ids); replace the per-entry hash with a hash **chain** (closes reorder/truncation/replay). (wi-analytics-lifecycle-review, Track B)
  - v0.4.0 (2026-06-16): unified front — the WI is the catch-all raise (`raise` is its create action); content authored per `product-dashboard-conventions` (a role, not a named curator); add the no-IU terminal disposition (park/kill/defer) as the front's non-IU exit
  - v0.3.1 (2026-06-06): clarify that `value_prop_link` may resolve to a canvas entry id (the work-item→bet expression; no new field)
---

# Work-item schema

A **work item** is the unit of product work — the **carrier** (D44) that travels the dev-sprint and is
rendered on the product-dashboard. It is **not a scalar stage** and **not a graph node**; it is a
runtime instance. Its state is kept in **three strictly separate kinds** (conflating them is the core
modelling risk):

The work item is the front's **catch-all raise** — the universal first-capture inbox: a thought, a
fragment, an issue-pulled context, or a framed problem. "Raise a work item for that" is always valid
and needs no shape judgment. A WI is **created by `raise`** (the front's create action for a carrier);
how much shaping it then needs is resolved downstream by the working session, not decided at raise.

## 1. Authored facts — committed, in the work-item file

| field | value | written by |
|---|---|---|
| `id`, `title` | identity | the `raise` action (at creation) |
| `lifecycle_state` | `idea → discovery → defined → committed → in-delivery → shipped → live → (parked \| killed)` | **`record-gate`** — the single mechanical writer (decision-authority = the operator's go/no-go; recording-mechanism = `record-gate`) |
| `gate_decisions[]` | append-only `{seq, hash, gate, decision, decision_provenance, owner, timestamp, evidence_refs, confidence, conditions?, override?}` — **the committed record of every lifecycle transition** (the *when* + *why* of each gate); `seq` is a monotonic integer (0-based position in the log); `hash` is a **chain** link, `hash_n = H(canonical(content_n) ‖ seq_n ‖ hash_{n-1})`, binding each entry to its position and to the prior entry (not a standalone per-entry hash); `decision_provenance` is `operator-attested \| agent-auto` — `agent-auto` is **structurally prohibited on a product gate id**, and an unattended (loop-runner-dispatched) context may record **only AFK-classed gates** | **`record-gate`** (single writer; operator-attested on product gates) |
| `stage_override` | optional — an explicit operator override of the projected stage, when the projection is wrong | **operator** (authored) |
| `children[]` | planned child work-item ids (decomposition); each materialises as its own work item at `build`; the parent aggregates | the content author, from the plan (per `product-dashboard-conventions`) |

Plus the **authored content** (PR-gated, governed by `product-dashboard-conventions`): the problem/opportunity (the *why*), `outcome_link`
(the OKR it serves → vision; an **authored** link, D38), `value_prop_link` (VPC job/pain/gain — **may
resolve to a canvas entry id**, e.g. a BMC/VPC hypothesis block; this is how "work-item → bet" is
expressed without a new field; the dashboard renders a navigable link to the canvas entry when the id
resolves), `vertical_link`
(**optional, forward-referenced** — the zone-matrix **vertical** this work serves; the column-level join key the
future coverage view reads, authored only when the harness uses the zone matrix, else omitted), `risk_state`
(the four-risks evidence state, strength × maturity bar), `tier` (T1/T2/T3, D45), the solution (once
`committed`), `links` (spec PR / build PRs / experience-contract / debrief / `promoted_from` — the
source standalone-IU id(s) a promoted work-item cites, R5 provenance), `disposition` (for
parked/killed: the reason — kept, the anti-portfolio).

## 2. Projected facts — derived from the event log, NOT committed

| field | value | derived from |
|---|---|---|
| `current_stage` | the dev-sprint stage the carrier is at (when `in-delivery`) | the **latest stage event** for this carrier in the `.stack-graph/` event log — **unless** a `stage_override` is set, which wins |
| `dev_transition_history` | the dev-stage traversal sequence | the **sequence of stage events** in the log |

**No stage or content author writes these** (D44). The dashboard *joins* them onto the authored file at render.
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

- **Three writers, three kinds, never crossed.** **`record-gate`** — the single mechanical writer —
  writes `lifecycle_state` + `gate_decisions` (the operator decides go/no-go; `record-gate` enacts the
  record, with the operator-attestation precondition on product gates);
  **content + `children`** are authored per `product-dashboard-conventions` (by the front node owning
  the action — `raise` at create, the working session as it shapes); the projection *derives*
  `current_stage`/`dev_transition_history` (writes nothing in the file); a recorder freezes
  `frozen_timeline` once, at close.
- **One identity, many projections** — forward workspace, delivery traversal, durable record are facets of
  one carrier; never forked.
- **Problem-framed until `committed`** — the solution crystallises only at `committed` (Torres).
- **The durable record** = `gate_decisions[]` + `risk_state` + `frozen_timeline` — proof we made the call
  deliberately on the best evidence available, and when.
- **`gate_decisions[]` append-only — hash-chain definition.** The log is a hash **chain**:
  `hash_n = H(canonical(content_n) ‖ seq_n ‖ hash_{n-1})` (the genesis entry chains over a fixed empty
  predecessor). The append-only invariant is the conjunction of three properties on that chain — a
  **valid head** (the last entry's `hash` recomputes from the entry below it), **contiguous `seq` from 0**
  (no gaps, no repeats), and **growth-only** (the new log's chain extends the old as a prefix; the length
  only increases). Together these close all four tampers, not just one: a **closing edit** to any past
  entry breaks every downstream `hash`; a **reorder** breaks the chain at the swap (each link binds `seq`
  + the prior hash); a **truncation** loses the head the prior chain committed to; a **replay** of an old
  log fails the prefix-extension check. A diff without the chain (a bare `seq`+per-entry-`hash`) cannot
  reliably detect reorder/truncation/replay — only an edit — which is why the per-entry hash is replaced
  by the chain.
- **Recorder-freeze invariant.** A terminal `lifecycle_state` (`shipped`/`live`/`parked`/`killed`)
  **implies** `frozen_timeline` present. CI should treat a terminal item lacking `frozen_timeline` as a
  **data-integrity warning** — the portal flags it visibly rather than silently omitting the timeline
  (the freeze may have been missed; the event log may already be gone).
- **The no-IU terminal disposition (the front's other exit).** Not every raised WI yields an IU. A WI
  the working session resolves as **not worth an IU** reaches a terminal `lifecycle_state` — `parked`
  or `killed` (a *deferred* item is `parked` with intent to revisit) — carrying its `disposition`,
  written via a dashboard `edit`. This is the front's no-IU exit, complementing the cold-handoff IU
  exit (`IU-schema`); the item is **kept**, never deleted (the durable-record invariant).
