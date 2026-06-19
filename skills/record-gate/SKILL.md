---
name: "record-gate"
description: "The single mechanical writer of a carrier's lifecycle_state + append-only gate_decisions[] — checks the operator-attestation precondition, then appends a hash-chain-linked entry and advances the state. Use when a gate-holding node (land, loop-runner) must record a lifecycle transition rather than write the carrier fields directly. Use when: A gate-holding node has a settled go/no-go and must enact the lifecycle_state + gate_decisions record (including a reconciled out-of-band merge), not write the fields itself."
---


# Record gate

You are **the single mechanical writer** of a carrier's `lifecycle_state` and its append-only
`gate_decisions[]` log. A gate-holding node (`land` fires its own commit-to-land gate; `loop-runner`
routes its retroactive reconcile writes) invokes you at the point a lifecycle transition must be
recorded. **The caller decides; you enact the record.** Decision-authority — the operator's go/no-go —
is distinct from recording-mechanism. A gate-holding node never writes `lifecycle_state` or
`gate_decisions` directly; it invokes you, and you are the only writer of those two fields.

You write **no other carrier field**. `current_stage` and the transition history are projection-owned
(derived from the event log, never written by any node); content is the front's role. You own only the
gate-recorded half. The two field shapes — the `gate_decisions[]` entry, the `decision_provenance`
rule, and the full hash-chain definition — are specified in your imported `work-item-schema`; read
`carrier-interface` for the carrier fields you read across either carrier kind. Do not restate those
tables here — enact them.

## Inputs

The caller supplies: the carrier (`carrier_id` + kind + arc, read via `carrier-interface`), the **gate
id**, the **decision** (`cleared | declined | reconciled | …`), the **`decision_provenance`**
(`operator-attested | agent-auto`) and whether the invoking context is attended or unattended
(loop-runner-dispatched), plus `owner`, `evidence_refs`, `confidence`, and any `conditions` / `override`.
Read the current chain head (`seq`, `hash`) from the carrier file.

## Precondition — check before any write

Classify the gate and the context, then **reject** a non-compliant write (leave `lifecycle_state` and
the log unchanged, surface the reason to the caller) or proceed. These rules are safety-critical — do
not skip or compress them:

1. **A product gate can ONLY be recorded operator-attested.** `decision_provenance: agent-auto` is
   **structurally prohibited on a product gate id** — reject it. A product-gate decision the operator
   did not attest must never reach the log.
2. **An unattended context may record ONLY AFK-classed gates.** When invoked inside a
   loop-runner-dispatched (unattended) session, reject any write for a gate that is not AFK-classed —
   you do not put a decision to an absent operator; you record one whose authority was already
   established (an AFK slice's auto-record on green, or a `reconciled` write).
3. **Reject a malformed precondition** — a missing/invalid `decision`, `decision_provenance`, or chain
   head.

This is exactly why your default posture is collaborative: hand-run (e.g. `land` firing its own
commit-to-land gate), you engage the operator for the go/no-go whose record you then enact. The
unattended branch does not violate that — it *restricts* (records only AFK gates, refuses product-gate
`agent-auto`) rather than proceeding on a decision it would otherwise put to the operator.

## Enact the record

Once the precondition holds:

1. **Compute the chain link.** Append is a hash-**chain** link, not a standalone per-entry hash:
   `hash_n = H(canonical(content_n) ‖ seq_n ‖ hash_{n-1})`, with the next `seq` (contiguous from 0) and
   the prior entry's `hash`. Compute `canonical(...)` with the **same pinned serialization** the
   `vendor:check` single-writer guard imports — `workspace/renderer/fixtures/gate-chain/canonical.ts`.
   Writer and guard MUST use that one function so the stated chain and the checked chain cannot drift;
   never re-implement the serialization here.
2. **Append, growth-only.** Add the new entry; never edit or reorder a prior entry. Contiguous `seq`
   from 0, length only increases. This chain discipline is what makes the four tamper classes —
   closing edit, reorder, truncation, replay — all detectable (the full argument is in
   `work-item-schema`; do not restate it).
3. **Advance `lifecycle_state`** to the gate's target state.

## The reconciled path

When invoked to reconcile an **already-true** out-of-band merge (loop-runner's retroactive write),
append a `commit-to-land` entry with `decision: reconciled` **naming the out-of-band merge**. You are
still the **single** commit-to-land gate writing the terminal transition — you record an already-true
merge rather than enacting a fresh one. This is not a second writer.

## Output

Either:
- **A rejection** — the write is refused (product-gate `agent-auto`; an unattended non-AFK gate; a
  malformed precondition); `lifecycle_state` and the log are unchanged; the reason is surfaced to the
  caller.
- **An enacted record** — a new `gate_decisions[]` entry with the next `seq`, its computed chain
  `hash`, and its `decision_provenance`, with `lifecycle_state` advanced. Growth-only; no prior entry
  touched; no other carrier field written; no second store emitted.

You are the **mechanism**; the **`vendor:check` single-writer guard** is the **enforcement** — it
rejects any non-record-gate edit of the two fields and any product-gate `agent-auto` / unattended
entry (the conventions side is the SEC-1 guard in `product-dashboard-conventions`). Together the writer
and the guard make the write-boundary hold structurally, not by convention.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/work-item-schema.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/carrier-interface.md` — `carrier-interface`
- `references/product-dashboard-conventions.md` — `product-dashboard-conventions`

