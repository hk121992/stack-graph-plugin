---
kind: reference
id: analytics-vocabulary
title: Analytics vocabulary — the closed `<sg-*>` tag family the analyzer reads
description: >-
  The closed, additive `<sg-*>` tag family a node may state in its own output for the transcript
  analyzer to read — the `<sg-signal>` verdict/number result-block (with the experience-contract gate
  token and the closed trend-series names `benchmark.perf` / `health.quality`), the
  `<sg-operator-action>` open/close lifecycle member, the outcome-label rule, and the proposal-gated
  discipline (each tag a proposal to an attended gate, never a direct durable write). Use when a node
  must emit a verdict, a trend number, or an operator-action obligation the analyzer cannot derive from
  the transcript bytes.
status: v0.2.0 — 2026-06-18
changelog:
  - v0.2.0 (2026-06-18): generalise from the single `<sg-signal>` token to the **closed additive `<sg-*>` family** (distinct member names; separate global scan; proposal-gated — each tag a proposal to an attended invoke-gate, never a direct durable write; unattended/dispatched contexts proposal-only; verdict path byte-for-byte unchanged + a golden regression gate); add the lifecycle/paired member **`<sg-operator-action>`** (open/close, `id`-correlated, central-merge GROUP-BY-`id` derivation; fail-safe authority; store (a)). (wi-analytics-lifecycle-review, A4 + A6)
---

# Analytics vocabulary

Almost the entire analytics substrate is **derived from the transcript** by the batch analyzer — a
pure function of the bytes Claude Code already writes (tokens, friction, stalls, node activity,
attribution). A node body emits **nothing** for those; the analyzer reads them off the record.

The exceptions ride a **closed, additive `<sg-*>` tag family** — the few things irreducibly **model
judgments** that the analyzer cannot derive from transcript bytes (a verdict, a measured number, an
operator-action obligation). The family is **closed** (only the members documented here exist),
**additive** (a new member is a new distinct tag name + its own scan branch — never an overload of an
existing member), and read by a **separate global scan** that gates each tag by **shape** against the
closed allowlists below and **honestly under-captures** — an absent or malformed tag is simply **not
recorded**, never invented.

**Proposal-gated, never a direct durable write.** Each `<sg-*>` tag is a **proposal** surfaced to an
**attended invoke-gate** (e.g. an `<sg-decision>`-style tag → its skill's caller; a convention →
the capture gate), not a write the scan enacts. A tag from an **unattended / dispatched** context is
**proposal-only**. The cross-instance scan reads tags **for metrics only — never to enact a store
write**. This keeps the channel un-poisonable: a forged or stray tag can at most propose, never durably
mutate state.

**Verdict path unchanged + a golden regression gate.** Adding members to the family leaves the
`<sg-signal>` verdict/number path **byte-for-byte unchanged**; a **golden regression gate** (a fixed
input transcript → a fixed expected verdict extraction) proves the verdict path did not drift when the
family grew.

This reference carries the canonical strings an emitting node states so the analyzer reads them. It is
**not** an event-emit contract — nothing here appends to any event log.

## The `<sg-*>` family — members

| Member | What it carries | Channel / where stated |
|---|---|---|
| `<sg-signal>` | a **verdict** (`gates`) and/or a **measured number** (`metrics`) — irreducible model judgments | one fenced block in the node's **final** result message (below) |
| `<sg-operator-action>` | an **operator-action obligation** as a correlated **open/close** pair — surfaces outstanding-work + operator-latency friction | a tag stated when the obligation opens and again when it closes (below) |

New members are added **only** here, each with a distinct name and its own scan branch. The sections
below give each member's exact shape.

## `<sg-signal>` — the verdict member (result block)

`<sg-signal>` is the **verdict/number member** of the family. State it as exactly one fenced block in
your **final** output/result message:

```
<sg-signal>{"gates":["experience-contract:pass"],"metrics":{"benchmark.perf":2100}}</sg-signal>
```

- Exactly **one** `<sg-signal>…</sg-signal>` fence wrapping a single JSON object.
- `gates` — optional `string[]` of `<gate>:<pass|fail>` tokens (see the gate vocabulary).
- `metrics` — optional object of `{ <series>: <finite number> }` (see the trend-series vocabulary).
- Emit only the field(s) your node owns; omit the other. A node with no verdict to state emits no
  block (the analyzer records nothing — honest under-capture).
- The analyzer regex-extracts the fence, `JSON.parse`s the body, and **discards** a malformed or
  multiply-fenced block. For a **dispatched** node (run inside a subagent session), the block is read
  from the subagent transcript's final message, so emit it there.

## The gate token

The single conformance gate the analytics layer inspects:

```
experience-contract:<pass|fail>
```

`pass` only when every graded invariant holds and no failure mode fired; `fail` otherwise. The
analyzer counts only this token — any other (free-text) gate name is ignored (it may carry a private
decision name), so a node's own non-conformance gates are recorded in its result for the operator but
never tallied by the analytics layer.

## The trend-series names (closed allowlist)

A measured number rides `metrics` under one of these canonical series names; any other key is dropped:

- `benchmark.perf` — emitted by `benchmark` (the per-run performance measurement).
- `health.quality` — emitted by `health` (the weighted composite 0-10).

Values must be **finite numbers**. A non-numeric or out-of-allowlist value drops that point.

## `<sg-operator-action>` — the lifecycle/paired member

`<sg-operator-action>` is the family's **lifecycle member**: it records an **operator-action obligation**
as a **correlated open/close pair**, so the analyzer can surface what the operator still owes and how long
it took. State it twice — once when the obligation opens, once when it closes:

```
<sg-operator-action>{"id":"<harness_id>:<session>:<counter>","status":"open"}</sg-operator-action>
...
<sg-operator-action>{"id":"<harness_id>:<session>:<counter>","status":"closed"}</sg-operator-action>
```

- **`id`** — **globally-unique-per-instance** (`harness_id` + session + a monotonic counter). The close
  references **the open's exact `id`**; a close pairs with an open **only** when both `id`s are equal.
- **`status`** — `open | closed`. Nothing else.
- A formal gate emits **both** channels: `<sg-operator-action>` (the friction/lifecycle signal) **and**
  `record-gate` (the durable decision, `work-item-schema`). They are separate — this tag never writes the
  carrier.

**Correlation is a central-merge-tier `GROUP BY id` derivation — NOT a delta over the within-transcript
path.** Pairing groups events **by `id`** across the **merged, sanitised** event set and reduces each
group's state (order-independent). This is **not** the within-transcript skill-adjacency derivation (which
has no correlation id) and **not** the analyzer's wall-clock stall primitive — only the per-`id` span
**output shape** is shared. Local per-harness derivation pairs within one harness; the **central merge owns
the cross-harness join** (an open in harness A and a close in harness E pair only once both logs merge).

**Fail-safe authority (a forged close can only add a marker, never subtract a real obligation).**

- A needs-you obligation is **hidden only by an attended/operator-attested close** (or a
  `record-gate`-attested gate close).
- An **unattended, non-authoritative, or cross-`harness_id`** close derives the item to **`close-proposed`
  (still visible, marked "someone proposed closing this")** — never to closed-and-hidden.
- Symmetrically, **only attended/attested opens** populate the operator-facing needs-you list; unattended
  opens count toward **friction metrics only** (an aggregate, not an item surface) — flood-safe. (The
  surface itself is `product-dashboard-conventions`' "needs-you" convention.)

**Honest under capture.** Under partial merge an unmatched open may be legitimately outstanding **or**
closed in a not-yet-merged log; gate the confident outstanding on a **merge-completeness signal** (all
expected producers reported). An unmatched open under incomplete capture is **`possibly-outstanding
(capture incomplete)`**, flipping to closed (no phantom nag) when the missing log arrives.

**Store + integrity.** Lives on the **rewrite-each-run derived event log (store a)**, **not** the carrier
— so it carries **no hash chain** (a chain on regenerated derived data is meaningless and would break the
two-stores invariant; integrity lives at the **source** — the close's authority — not at-rest). A
*dropped* close is honest-under-capture; a *forged* close is handled by the authority rule above.

> **`harness_id` dependency (sequencing).** `id` uniqueness/scope and the cross-harness join depend on
> `harness_id` being in the attribution key (`bindings-contract` §6) — which **lands later, with the
> analyzer-home build IU**. Until then, `<sg-operator-action>` correlation **restricts to a single
> transcript/session** (no cross-actor close). A stable obligation slug, if ever wanted, must additionally
> carry an instance discriminator so a later open cannot pair with an earlier close.

## Outcome labels

An `outcome` is a short label naming a node's result. Use one of the **canonical labels the node's own
`goals` name** (e.g. `intent-settled`, `design-doc-produced`, `plan-approved`, `change-landed`), or
`aborted` if the run did not complete. **Do not invent labels** beyond what the node's goals define.
The analyzer derives node activity (enter/exit/duration) from the transcript mechanically; the outcome
label is the one structural string the node states for that activity where it matters.

## Never author token numbers

Token cost is **transcript-derived** by the analyzer (`message.usage` sums) — never model-authored. A
body **cannot** see its own cache reads, which dominate spend, so any `tokens_per_iu` /
`tokens_per_session` / `token_usage` figure on a `metrics` object is fabrication and is **rejected** by
the publisher. Structural verdicts/measurements stay model-authored; cost stays analyzer-derived.
