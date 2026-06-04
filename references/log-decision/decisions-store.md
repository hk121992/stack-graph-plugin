---
kind: reference
id: decisions-store
title: Decisions store — the durable conclusion-layer contract
description: "The contract for the factory's durable decision store. docs/decisions.md is the conclusion layer (settled D-numbered decisions, terse, self-contained); gbrain is the recall layer (reasoning, context). log-decision is the only writer — the two-layer write per D11. Entries supersede in place, never reorder. Every settled decision, including reconcile's accept-path adjudications, is traceable here. Read by measure-outcomes / capture-learnings for prior context; written only through log-decision."
status: v0.2.0 — 2026-06-04
---

# Decisions store

This is the contract for the factory's durable decision store. It governs where a settled
decision is recorded, in what shape, and who may write it. The store is the conclusion
layer; the guarantees below are what consumers rely on.

## Store identity — two layers

A decision is recorded in two layers (D11):

| layer | home | role |
|---|---|---|
| Conclusion | `docs/decisions.md` | The durable, self-contained record — what was decided, why, what was rejected, status. Stands alone with no recall access. |
| Recall | gbrain (`mcp__gbrain__put`) | The surrounding reasoning — transcript moment, options weighed, evidence, parked questions. Capability-gated; degrades to an inline fallback block when absent (D31). |

`log-decision` is the **only writer** to this store. No node appends to `docs/decisions.md`
directly — every write routes through `log-decision`, which performs the two-layer write and
returns a receipt. This single-writer rule is what makes the guarantee below enforceable.

## Entry shape

Each conclusion entry is **D-numbered**, terse, and self-contained:

```
**<id> — <first sentence as heading>** <remainder>. Why: <rationale>.
Rejected: <alternatives, or omitted if none>. Consequences: <what it commits us to downstream —
omitted entirely if none>. Status: <accepted | provisional | supersedes:<id>>.
```

- `Consequences` is **optional** (ADR's downstream-effects field — positive, negative, neutral);
  omit the clause when absent. It is carried in **both** layers — the conclusion entry and the
  gbrain recall record.
- Keep each entry terse — the **narrative lives in `design-history.md`**, not here.
- A reader with no recall access must be able to act on the conclusion alone. Never write
  "see gbrain for context".

## Supersede in place

Decisions are never reordered or deleted. To supersede or widen a prior decision, **append a
targeted note in place** to the prior entry — `Superseded by: <new-id>` or `Widens: <new-id>`
— and add the new entry at the end. The prior position is kept; only an in-place annotation is
added. This is the store's supersede-in-place convention (`docs/decisions.md` header).

## The guarantee consumers rely on

Every **settled** decision is traceable in `docs/decisions.md` — including reconcile's
**accept-path adjudications**, where drift is accepted rather than reworked. Reconcile's
goal #2 ("every resolution traceable in `decisions.md`") leans on this: an accepted drift is
not a transient session fact, it is a logged decision. If a settled decision is not here, that
is an escape, treated as a failure — not an acceptable degraded state.

## Read vs write

- **Write — through `log-decision` only.** `log-decision` is the sole writer.
- **Invoke `log-decision` — `reconcile`, `debrief`** (and `design`). Each spawns `log-decision`
  after a decision settles; reconcile's accept and adjudicate paths both route through it.
- **Read — `measure-outcomes`, `capture-learnings`.** They read the store for prior context
  (the prior verdict, prior decisions a finding may invalidate or duplicate). They never write.
