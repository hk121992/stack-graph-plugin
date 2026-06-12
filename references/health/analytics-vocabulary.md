---
kind: reference
id: analytics-vocabulary
title: Analytics vocabulary — the model-authored verdict tokens the analyzer reads
description: >-
  The small surviving vocabulary a verdict-bearing node states in its own output so the transcript
  analyzer can read it — the `<sg-signal>` result-block format, the experience-contract gate token
  (`experience-contract:<pass|fail>`), the closed trend-series names (`benchmark.perf`,
  `health.quality`), and the outcome-label rule. Use when a node must emit a pass/fail verdict or a
  trend number the analyzer cannot derive from the transcript bytes.
status: v0.1.0 — 2026-06-12
---

# Analytics vocabulary

Almost the entire analytics substrate is **derived from the transcript** by the batch analyzer — a
pure function of the bytes Claude Code already writes (tokens, friction, stalls, node activity,
attribution). A node body emits **nothing** for those; the analyzer reads them off the record.

Two signals are the exception. A **pass/fail verdict** and a **measured number** are irreducibly
**model judgments** — the analyzer cannot derive a verdict or a measurement from transcript bytes.
These are the *only* things a node still authors for analytics, and they ride a single, bounded
channel: a fenced `<sg-signal>` block the node writes **in its own final result message**. The
analyzer reads that block, gates it by **shape** against the closed allowlists below, and **honestly
under-captures** — an absent or malformed signal is simply **not recorded**, never invented.

This reference carries the canonical strings a verdict-bearing node must emit so the analyzer reads
them. It is **not** an event-emit contract — nothing here appends to any event log.

## The `<sg-signal>` result block

State the verdict/number as exactly one fenced block in your **final** output/result message:

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
