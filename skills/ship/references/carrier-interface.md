---
kind: reference
id: carrier-interface
title: Carrier interface — the field-set a reused node may assume about its carrier
description: The explicit carrier interface a reused node (build, review, land) reads, abstracting over the two carrier kinds — work-item and standalone-IU. Declares the common fields present per kind, the fields a shared node must NOT assume, and the carrier-keyed projection key (carrier id + kind + arc id) that keeps current_stage from bleeding between arcs.
status: v0.3.0 — 2026-06-18
changelog:
  - v0.3.0 (2026-06-18): write-boundary reframed onto the single mechanical writer — `lifecycle_state`/`gate_decisions` are written **only** by `record-gate` (operator-attestation precondition + a `vendor:check` single-writer guard); `current_stage` stays projection-owned; the `gate_decisions` entry shape gains `decision_provenance` + the hash-chain semantics (aligned with `work-item-schema`). (wi-analytics-lifecycle-review, Track B)
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

A reused node may read **only** these fields. They are present for **both** kinds. Three of them —
`carrier_kind`, `arc`, `current_stage` — are **derived, not stored frontmatter fields** (see
"Deriving carrier_kind and arc" + "The projection key"); the rest are **stored** (read from the
carrier file):

| field | kind | stored? | meaning |
|---|---|---|---|
| `carrier_id` | both | **stored** | The carrier instance id — the projection key (with kind + arc). |
| `carrier_kind` | both | **derived** | `work-item \| standalone-iu`. The shape discriminator — **not a stored field**; derived from the IU-schema discriminator (`channel: incremental` + no `parent` ⇒ `standalone-iu`; otherwise `work-item`). See "Deriving carrier_kind and arc". A reused node branches on it where the kinds differ; it never assumes one. |
| `arc` | both | **derived** | `dev-sprint \| incremental`. The traversal this run belongs to — **not a stored field**; a traversal property (which `composes-into` arc the current node belongs to for this run). Part of the projection key. See "Deriving carrier_kind and arc". |
| `current_stage` | both | **derived** | **Projected**, never written by the node — the arc stage the carrier is at (the projection key below). Read-only to every node. |
| `lifecycle_state` | both | **stored** | The carrier's life-phase. Value sets differ per kind (work-item: the seven-state `idea→…→live` + `parked\|killed`; standalone-IU: `proposed → in-delivery → landed → parked\|dropped`); a reused node **reads** it but never writes it — the terminal transition is recorded **only** by the single mechanical writer `record-gate` (see "The write-boundary"). |
| `gate_decisions[]` | both | **stored** | Append-only gate log, **same entry shape** for both kinds: `{seq, hash, gate, decision, decision_provenance, owner, timestamp, evidence_refs, confidence}` — `hash` is a **chain** link (`hash_n = H(canonical(content_n) ‖ seq_n ‖ hash_{n-1})`) and `decision_provenance` is `operator-attested \| agent-auto`, both per `work-item-schema`. A reused node **reads** the log; it never appends — `record-gate` is the only writer, and an entry is appended only after the gate's decision is settled (operator-attested on a product gate). |

### Deriving carrier_kind and arc

`carrier_kind` and `arc` are **not** carrier frontmatter fields — a node derives each:

- **`carrier_kind`** = `standalone-iu` **iff** the carrier file has `channel: incremental` and no
  `parent` (the IU-schema standalone discriminator); otherwise `work-item`. There is **no stored
  `carrier_kind` field** — a node derives it from the discriminator. So node-facing language like
  "branch on `carrier_kind`" means: **derive `carrier_kind` from the discriminator, then branch.**
- **`arc`** = the traversal the carrier entered on — i.e. which `composes-into` arc the current node
  belongs to for this run. It is a **traversal property**, not a stored carrier field.

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
| `hitl_point` | standalone-IU only | `{stage, decision}` — present when `slice_type: HITL`. Names **where** to pause and **what** the human decides. Read by the node that **owns `hitl_point.stage`** — `build` pauses if `stage == build`; `review` runs interactive if `stage == review` — **not** unconditionally `build`. Absent on AFK slices. |
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

> **Instrumentation seam (resolved).** The instrumentation preamble (v0.2.0) now carries
> `carrier_kind` + `arc` on the enter/exit events, so the projector can key by the
> (id, kind, arc) triple. (Implementing that key in `publish-projection.ts` is the input-gated
> follow-up — no incremental-arc carrier events exist yet.)

## The write-boundary

The split between **content** (authored), **`current_stage`** (projected), and **`lifecycle_state` +
`gate_decisions`** (gate-recorded) holds along two axes:

- **`current_stage` is PROJECTION-owned** — *projected* from the carrier-tagged event log, never written
  by any node (above). This half is enforced **structurally**: no node has a write path to it.
- **`lifecycle_state` + `gate_decisions` are written by ONE mechanical writer — `record-gate`.** A reused
  node never writes either; it reads them. `record-gate` is **THE single writer**, with an
  **operator-attestation precondition** on a product gate (the decision is the operator's; `record-gate`
  enacts the record) — it is not a free write at "any gate the node holds." A **`vendor:check`
  single-writer guard** asserts this: it rejects any non-`record-gate` edit of the two fields (see
  `product-dashboard-conventions` SEC-1).

A reused node therefore reads the projected stage and the `record-gate`-written lifecycle the same way
under **either** carrier kind and **regardless of which node authors content**. So distributing content
authoring across the front (per `product-dashboard-conventions`) leaves the boundary intact: the
two-carrier model (work-item + standalone-IU) and this separation both hold **independently of any
content-curator skill**.

## Related

- `IU-schema` — the **standalone-IU** carrier (the carrier-lite shape): `improves`, `slice_type`,
  `verification`, the minimal lifecycle, the single `commit-to-land` gate.
- `work-item-schema` — the **work-item** carrier (the full shape): `children`, `outcome_link`,
  `risk_state`, `tier`, `frozen_timeline`, the three-kinds-of-state discipline.
- `instrumentation-preamble` — the event emit contract the projection reads (see the seam above).
- `product-dashboard-conventions` — the content conventions the front follows when authoring dashboard
  content; the structural boundary above is what keeps that content-writer role curator-independent.
