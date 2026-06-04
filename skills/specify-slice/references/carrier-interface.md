---
kind: reference
id: carrier-interface
title: Carrier interface — the field-set a reused node may assume about its carrier
description: The explicit carrier interface a reused node (build, review, land) reads, abstracting over the two carrier kinds — work-item and standalone-IU. Declares the common fields present per kind, the fields a shared node must NOT assume, and the carrier-keyed projection key (carrier id + kind + arc id) that keeps current_stage from bleeding between arcs.
status: v0.1.0 — 2026-06-04
---

# Carrier interface

`build`, `review`, and `land` are **shared across two arcs** — the `dev-sprint` (carrying a
**work-item**) and the `incremental` loop (carrying a **standalone IU**, a carrier-lite). A reused
node must operate over **either** carrier kind without assuming the other's fields. This reference
is the **explicit field-set** those nodes read — a declared interface, so a reused node consumes a
contract, not a prose-asserted "arc-agnostic."

The two carrier kinds are defined elsewhere: the **work-item carrier** in `work-item-schema`, the
**standalone-IU carrier-lite** in `IU-schema` (the standalone shape). This file is the seam between
them.

## The common interface (read by every reused node)

A reused node may read **only** these fields. They are present for **both** kinds:

| field | kind | meaning |
|---|---|---|
| `carrier_id` | both | The carrier instance id — the projection key (with kind + arc). |
| `carrier_kind` | both | `work-item \| standalone-iu`. The shape discriminator. A reused node branches on this where the kinds differ; it never assumes one. |
| `arc` | both | `dev-sprint \| incremental`. The traversal this run belongs to — part of the projection key. |
| `current_stage` | both | **Projected**, never written by the node — the arc stage the carrier is at (`carrier-interface` projection key). Read-only to every node. |
| `lifecycle_state` | both | The carrier's life-phase. Value sets differ per kind (work-item: the seven-state `idea→…→live` + `parked\|killed`; standalone-IU: `proposed → in-delivery → landed → parked\|dropped`); a reused node reads it but writes only the terminal transition via its gate. |
| `gate_decisions[]` | both | Append-only gate log, **same entry shape** for both kinds: `{seq, hash, gate, decision, owner, timestamp, evidence_refs, confidence}`. A reused node appends one entry when it holds a gate. |

## Per-kind fields — present on only one kind

A reused node **must not assume** a field outside the common interface. These are the
kind-specific fields, named so the seam is explicit:

| field | present on | a reused node… |
|---|---|---|
| `children[]` | work-item only | **must not assume** — a standalone IU has none (single-slice). Read it only after checking `carrier_kind == work-item`. |
| `outcome_link` | work-item only | **must not assume** — the OKR a work-item serves. A standalone IU has no OKR (it has `improves`); a node reading `outcome_link` unconditionally breaks on the carrier-lite. |
| `risk_state`, `tier`, `frozen_timeline` | work-item only | **must not assume** — tracked-product-work machinery; absent on a carrier-lite. |
| `improves` | standalone-IU only | the typed pointer to the thing this slice changes (`{kind, id}`). Replaces `outcome_link` for the incremental arc. |
| `slice_type` | standalone-IU only | `AFK \| HITL` — governs the loop's autonomy. `build`/`review`/`land` read it to decide attended vs unattended modes and the HITL pause. |
| `hitl_point` | standalone-IU only | `{stage, decision}` — present when `slice_type: HITL`. Names **where** to pause and **what** the human decides. `build` reads `hitl_point.stage` to stop at the right stage; absent on AFK slices. |
| `verification` | standalone-IU only | `{end_to_end, tests}` — the vertical-slice proof `build` delivers against and `review`'s tests lens checks. |

**The rule:** a reused node reads the **common interface** freely; it reads a **per-kind field only
behind a `carrier_kind` check**. This is what lets one `build`/`review`/`land` serve both arcs
without smuggling work-item assumptions into the incremental loop.

## The projection key

`current_stage` is **projected** from the carrier-tagged event log, never written into the carrier
file. Because `build`/`review`/`land` are shared across arcs, the projection key is the **triple**:

```
(carrier_id, carrier_kind, arc)  →  current_stage = the latest stage event matching all three
```

Keying by `carrier_id` and latest stage **alone** would let one carrier's `current_stage` bleed
into another's at a shared node — the dev-sprint and incremental traversals pass through the same
`build`/`review`/`land`. The **arc** in the key keeps each arc's projection separate; the
**carrier_kind** keeps the two carrier shapes from colliding. This matches the carrier-instance
projection rule in `02-graph-spec` ("Carrier instances": projection keys by carrier id + carrier
kind + arc id) — this reference is its node-facing restatement.

Events carry the carrier id today (see `instrumentation-preamble`). For the triple to project
correctly across the shared nodes, an event must also be resolvable to its **carrier kind** and
**arc** — see the instrumentation note below.

> **Instrumentation seam (flag).** `instrumentation-preamble`'s event shape carries `carrier`
> (the id) but **not** `carrier_kind` or `arc`. With the incremental arc reusing `build`/`review`/
> `land`, the projector needs all three to key correctly. Either the event gains `carrier_kind` +
> `arc` fields, or they are resolved from the carrier file at projection time. This reference does
> not resolve that choice; it names the dependency.

## Related

- `IU-schema` — the **standalone-IU** carrier (the carrier-lite shape): `improves`, `slice_type`,
  `verification`, the minimal lifecycle, the single `commit-to-land` gate.
- `work-item-schema` — the **work-item** carrier (the full shape): `children`, `outcome_link`,
  `risk_state`, `tier`, `frozen_timeline`, the three-kinds-of-state discipline.
- `instrumentation-preamble` — the event emit contract the projection reads (see the seam above).
