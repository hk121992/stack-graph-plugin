---
subject: decisions-schema
title: Decisions-store schema — the durable decision contract
provenance: vendored
level: L2
cadence: on-demand
read-when: "Recording or reading a settled decision."
derive-from: [decisions-store]
reviews-on: decisions-schema-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [bindings-contract, gate-model]
---

# Decisions-store schema — the durable decision contract

The contract for a harness's **durable decision store**: **where** a settled decision is recorded, **in what
shape**, and **who may write it**. This reference is the *contract*, **never the content** — the store's live
entries are the harness's own (a crystallised instance, its path resolved through the
[bindings](bindings-contract.md)). It carries no decision content of its own; it fixes the shape every consumer
conforms to, so the store's form is **one definition, not N drifting copies**.

This is **not** the carrier's `gate_decisions[]` — that is the hash-chained gate ledger on a single carrier
([gate-model](gate-model.md)). This is the cross-cutting store of **settled design decisions**, durable and
id-numbered. Do not conflate the two.

## Two layers {#two-layers}

A decision is recorded in **two layers**, split by who can read what:

- **Conclusion** — the durable, **self-contained** record (a single store file, the harness's
  `decisions_store_path`): *what was decided, why, what was rejected, the status*. It **stands alone** — a reader
  with no recall access can act on it; never "see the recall layer for context".
- **Recall** — the surrounding reasoning (the transcript moment, the options weighed, the evidence, parked
  questions) in a **capability-gated recall store**. When that capability is absent it **degrades to an inline
  fallback block** on the conclusion, never a dangling pointer.

The conclusion layer is the source of record; the recall layer is enrichment that may be absent.

## Entry shape {#entry-shape}

Each conclusion entry is **id-numbered, terse, and self-contained**:

```
<id> — <decision>. Why: <rationale>. Rejected: <alternatives>. Consequences: <downstream commitments>. Status: <accepted | provisional | supersedes:<id>>.
```

- **`id`** — a monotonic decision id, **unique within the store**.
- **`Rejected`** is omitted when there were no alternatives; **`Consequences`** is optional (omit when none).
- **Terse** — the entry is the conclusion, not the narrative; the deeper reasoning lives in the **recall layer**,
  not the conclusion.
- A reader with no recall access **must** be able to act on the entry alone.

## Supersede in place {#supersede}

Decisions are **never reordered or deleted**. To supersede or widen a prior decision, **append a targeted
in-place note** to the prior entry (`Superseded by: <id>` / `Widens: <id>`) and add the new entry **at the end**.
The prior position is kept; the log only grows — so the store is a durable record of how thinking moved, not just
its latest state.

## The single writer + the traceability guarantee {#single-writer}

- **One writer.** A single mechanical node (`log-decision`) is the **sole writer**; no node appends to the store
  directly. The single-writer rule is what makes the guarantee enforceable.
- **The guarantee.** **Every settled decision is traceable in the store** — including an accept-path
  adjudication, where drift is *accepted* rather than reworked (an accepted drift is a **logged decision**, not a
  transient session fact). A settled decision **absent** from the store is an **escape — a failure, not an
  acceptable degraded state** (fail closed; the safe default is recording it, never silently dropping it).
- **Readers** consult the store for prior context — a prior verdict, a decision a finding may invalidate or
  duplicate; they **never write**.

## Co-tenant home {#co-tenant}

The store's committed home is a **shared authored home**: the **learnings-archive** co-tenants it, and the
learn-loop closes through these shared authored surfaces — a producing node *records to* the home and the owning
curator *sweeps* it — **not** through an authority-crossing graph edge. This contract owns only the decision
layers; the learnings-archive's own shape is its owner's.

## Cite out {#cite-out}

- **The single writer** — the mechanical two-layer write and its receipt → log-decision.
- **The carrier's gate ledger** `gate_decisions[]` — the hash-chained per-carrier gate log, a different thing → [gate-model](gate-model.md).
- **The store path** (`decisions_store_path`) the harness binds → [bindings-contract](bindings-contract.md).
- **The cheap dedup lookup** over the store instance → decisions-index (a crystallised local surface in the consuming harness's `.claude/` — generated at harness-init, re-derived by log-decision on every store write; discovered via the at-hand index).
- **The crystallised instance** — the live id-numbered corpus, runtime, in the workspace → the decision-store surface / graph-record.
- **Term** senses (decision · provenance · crystallised) → glossary.
