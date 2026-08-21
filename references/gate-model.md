---
subject: gate-model
title: Gate model — the gated runtime state
provenance: vendored
level: L2
cadence: on-demand
read-when: "A carrier's gated runtime state (lifecycle + gates)."
derive-from: [graph-spec, work-item-schema, record-gate]
reviews-on: gate-model-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [IU-schema, work-item-schema, decisions-schema, routing-principles, operator-interview]
---

# Gate model — the gated runtime state

The contract for a carrier's **gated runtime state**: the `lifecycle_state` it travels and the hash-chained
`gate_decisions[]` ledger that records each transition. The two are **one band, node-written by the single
gate-writer on operator attestation** — the source of truth for *where the work is and whether it may
advance*. This reference fixes that band's shape, the rigour dial, and the forgery-resistance; both carriers
([IU-schema](IU-schema.md), [work-item-schema](work-item-schema.md)) carry these fields and cite this contract.
Where a gate sits in the loop, the five-gate identity, and the dial's *levels* are the **graph model**'s (local, per-consumer);
this fixes the **values and rules**, never an instance (a real carrier's chain is runtime, in the workspace).

## `lifecycle_state` {#lifecycle-state}

A **single ordered set**, one for every carrier — there is no second lifecycle for a lighter unit:

```
idea → discovery → defined → committed → in-delivery → shipped → live → closed
                                                                  ( | parked | killed )
```

- It runs from inception through a delivered/live span to a **terminal `closed`** — a **disposition** (*stop
  monitoring*, not *achieved*) that **cascades** on a grouping carrier to the group and all child units. `parked`
  and `killed` are the off-ramp terminals (kept as the durable record, never deleted).
- **A standalone unit enters at `proposed`** — the genesis value `raise` scaffolds, before the set above engages;
  its intent-to-build entry records at `proposed` with **no advance** (the no-advance genesis), and it joins the
  ordered set at `in-delivery` when its build event fires. A grouping carrier enters at `idea`.
- **`in-delivery` is the one non-gated transition** — the **build event** sets it (the dispatched build span
  starting against the carrier); every **gated** transition is the gate-writer's alone. No gate targets
  `in-delivery`.
- **`live` is prod-facing-only.** A **single-main** carrier (no prod deploy target) terminates at
  **`shipped`** — `live-confirmed` skips, and `closeout` advances **`shipped → closed`** directly; a
  **prod-facing** carrier runs `shipped → live` (live-confirmed ratifies prod), then `live → closed`.
- **Closeout is role-grained.** A **deliverable** (a standalone unit, or a child unit of a group) closes from its
  terminal landing (`shipped|live → closed`). The **grouping carrier itself** closes from its own chain's last
  recorded state (post-`committed` — its build-readiness terminus): its closeout entry records the disposition
  (`closed | promoted`) while its children each carry the terminal-landing close on their own chains.
- It is **node-written** by the gate-writer and answers *may the work advance?* — distinct from the projected
  `current_stage` (*where it was last seen*); the two may legitimately **disagree**, and neither is the
  other's projection.
- The **five gates** advance it (intent-to-build · commit-to-build · commit-to-land · live-confirmed · closeout);
  their identity is graph-model's and each gate node owns its exact transition (incl. the two-faced
  intent-to-build: a grouping carrier advances `idea → discovery`; a standalone unit records a no-advance genesis
  entry at the front).

## `gate_decisions[]` — append-only, hash-chained {#gate-decisions}

The ledger of every lifecycle transition. **Entry shape:**

```
{ seq, hash, gate, decision, decision_provenance, owner, timestamp, evidence_refs, confidence, conditions?, override? }
```

- **`seq`** — a monotonic integer from 0.
- **`hash`** — a **chain** link, `hash_n = H(canonical(content_n) ‖ seq_n ‖ hash_{n-1})` (the genesis entry
  chains over a fixed empty predecessor). Folding `seq` and the prior hash into each link closes edit, reorder,
  truncation, and replay.
- **Append-only** is the conjunction of three properties on that chain: a **valid head** (the last entry's `hash`
  recomputes from the entry below it), **contiguous `seq` from 0** (no gaps, no repeats), and **growth-only** (the
  new log extends the old as a prefix; length only increases). Verified against the merge-base on a protected
  branch by the **single-writer guard** (`generate:check`).

Because the ledger is append-only, a carrier is also a **durable record** of how the work moved and why each call
was made — retained after the work is delivered or abandoned.

## `decision_provenance` {#decision-provenance}

How an entry was decided — a closed value-space, **shape-gated negatively**:

- **`operator-attested`** — an operator go/no-go. The authority for every **product / HITL gate**.
- **`agent-auto`** — an agent-automatic decision. **Structurally prohibited on a product-gate id** — and every
  gate id is a product gate, so an unattended (dispatcher-run) context's only legal gate writes are the two named
  below (the provisional hold and the reconcile record). The value is reserved, not currently earnable.
- **`agent-provisional`** — a provisional `commit-to-build` **hold** an in-scope, outcome-necessary,
  decision-completable gap earns; **inert until ratified**, with the operator attestation **relocated to
  `commit-to-land`** (retro-ratification). Not an approval — a narrow carve-out, never final.

The **ancestry-reconcile record** (`decision: reconciled` — the after-the-fact record of an out-of-band merge
discovered on the landed line) is **exempt from the attestation matrix**: it asserts no approval, only reconciles
the ledger with git reality. It and the `agent-provisional` hold are the only two unattended-legal writes on a
product-gate id.

A carrier whose chain fails verification, or whose provenance violates these rules, is **rejected at the writer**,
never silently trusted.

## Sign-off surface {#sign-off-surface}

The gate **experience** — the sign-off presentation, the review conversation, the attestation collection — runs
in the **firing node's session**, never the writer's. Content is the firing node's (each body lists its gate's
pass-when fields); this section fixes **how** every product gate is put to the operator:

- **Rendered from the carrier, single-source.** The surface is generated at fire time from the carrier /
  evidence it presents — never a separately-authored copy (a carrier edit re-renders it), **never free
  prose**: a text recap alone does not put a product gate.
- **Widget-first, native-elicitation fallback.** With a widget surface available in the session, render an
  interactive widget from the harness's **per-gate template** — the templates sit at the conventional
  `gate-sign-off/` home under the harness's work-ledger surface (resolved through its binding, never a
  hardcoded path; the home's index maps each product gate to its template). A complete harness authors one
  template per product gate; a gate still lacking one degrades to rendering its pass-when fields. With no
  widget surface at all, fall back to the host's native operator-confirmation control. The ladder ends
  there — plain chat text is not a sign-off surface.
- **The real click is the attestation.** The operator's real click/selection on the rendered surface is the
  `operator-attested` precondition the writer keys on — the same trust at every product gate; never
  fabricated, never inferred from silence, never auto-fired.
- **Sanitised.** The carrier block is untrusted data: strip active markup on render; controls never auto-fire
  the confirmation.

## Entry scope by carrier role {#role-scope}

The **entry set is scoped by the carrier's role** (the carriers apply this rule):

- A **grouping carrier** records the front and build-readiness entries and the **closeout cascade** entry — but
  **not** the per-unit landing entries (those sit on each child unit's own chain).
- A **standalone unit** records its own front, build-readiness, landing pair, and closeout.

## Rigour — the maturity × tier dial {#rigour}

A gate's bar is set by a process-default **maturity** level a per-item **tier** can override up or down — a
**two-axis dial, not a fixed bar**. The dial's levels and how a tier moves them are graph-model's framing; the
contract obligation is that a gate's rigour is **declared by this dial**, not improvised per call.

## The single writer {#single-writer}

`lifecycle_state` and `gate_decisions[]` are written by **one mechanical gate-writer only** — `record-gate` — on
the operator-attestation precondition for product gates. No stage holds a write-edge to these fields; conflating
this writer with the position projection or the content curator is the structural risk the contract guards
against. (The writer node is the runtime graph's; this reference fixes what it may write.)

## Cite out {#cite-out}

- Where a gate **sits in the loop**, the **five-gate identity**, and the dial's **levels** → graph-model.
- The **carrier fields** that carry this band, and each carrier's exact gate-entry set → [IU-schema](IU-schema.md) · [work-item-schema](work-item-schema.md).
- The **writer** (the single mechanical gate-writer + its attestation precondition) → record-gate.
- The per-gate sign-off **content** (the pass-when fields a surface renders) → each firing node's body.
- The projected **`current_stage`** (position, read-only, may disagree with `lifecycle_state`) → the context engine / generation model.
- **Term** senses (gate · carrier · provenance · disposition) → glossary.
