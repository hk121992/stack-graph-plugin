---
name: "measure-outcomes"
description: "Deterministic measurement role that computes the sprint's product outcomes — each work-item's success-definition against the KRs it ladders to — from the analyzer-derived event log. Returns a structured numbers-only metrics report; writes nothing and makes no judgments. Ships method only — what to measure is harness-supplied. Use when the debrief stage needs hard numbers for the sprint's outcomes before the operator assesses whether they were met."
---


# Measure outcomes

When run in an isolated child context, act as the deterministic measurement role. At `measure`, turn the sprint's
**product outcomes** into hard numbers: you measure each work-item's **success-definition**
outcomes against the **KRs they ladder to** (the `outcome_link` objective's `key_results[]`),
reading the analyzer-derived event log and the success criteria, and return a structured report.
You **write nothing, converse with no one, and emit no judgment** — numbers only; assessment is
the operator's / `debrief`'s.

**You are product-specific by input, general by method.** You carry the method only — *what* to
measure is harness-supplied: the carriers' success-definitions and the objectives surface they
ladder to. You hardcode no product's metrics — a product whose own outcomes are process metrics
(per-node earns-keep, build-economy costs) declares them in its *own* success-definitions, and
you measure them there like any other product's outcomes.

**Leaf, no preamble, no carrier read** — the invocation bundle carries the full target.

## Read your invocation bundle

```yaml
sprint_id: <string>
landed_ius:                               # IUs landed since the last debrief (shipped | live)
  - { id: <iu-id>, improves: <target> }   # improves = the per-IU COVERAGE signal — which
                                          # outcomes the sprint touched, never the ladder target
targets:                                  # the measurement TARGET (harness-supplied)
  - wi_id: <string>
    success_definition: [<outcome>, ...]  # the carrier's measurable, MECE outcomes
    outcome_link: <objective-id>          # the objective whose KRs those outcomes ladder to
    key_results: [{ metric, target, current }, ...]
timeline_source: <path>                   # the analyzer-derived event log for this sprint
baseline: <path> | null                   # the prior sprint's frozen_metrics, or null
measurement_config: <object> | null       # harness-supplied thresholds/budgets, where present
```

`debrief` triggers the on-demand analyzer run before invoking this role, so the sprint's derived rows
exist by the time you read them. You read the settled log; you never run the analyzer yourself.

## Procedure

### 1. Load the measurement targets

For each work-item in `targets`:

- Extract each success-definition outcome, its metric definition, and the KR it ladders to
  (`key_results[]` — `{ metric, target, current }`). The outcome states what must be true; the KR
  supplies the threshold/direction it is read against.
- Map coverage from `landed_ius[].improves` — which outcomes this sprint's landed units bore on.
  Coverage tells you what was touched; the **target** is always the success-definition, never
  `improves` itself.
- If an outcome carries **no measurable metric definition**, flag it `missing_earns_keep` and
  skip its row — do not invent a metric.
- If an outcome's metric is **declared but no derived event type feeds it yet** (the target
  exists; nothing measures it), skip it with reason `pending_earns_keep` — awaiting
  instrumentation, distinct from `missing_earns_keep`.
- If an outcome is **qualitative** — it needs an operator to assess acceptability, not an event
  count plus arithmetic — skip it with reason `earns_keep_requires_judgment`. Do not fabricate a
  number for a judgment criterion: you are deterministic by declaration, and a criterion that
  needs judgment is out of your scope by design.

### 2. Read the analyzer-derived timeline

The analytics substrate is **transcript-derived in batch**: a scheduled analyzer reads the raw
session transcripts and rewrites the derived event log you read from. Open `timeline_source` —
an ordered sequence of derived events tagged with ids and timestamps. Extract the rows bearing
on the targets: the outcome-relevant counts, durations, gate outcomes, and any product events the
harness's measurement config names.

If the timeline is absent or empty, flag `timeline_unavailable` and emit partial rows where a
metric can be derived from the work record alone. If the timeline is present but **partial** —
an opened span with no matching close — raise a `timeline_incomplete` warning: still compute
from the events present; the warning flags reduced confidence, never a guessed completion. The
numbers depend on carrier-attributed analyzer rows existing — **degrade cleanly until they do**;
you build no analyzer wiring.

### 3. Compute metrics

For each outcome with a resolvable metric + data:

| metric type | how to compute |
|---|---|
| Rate (e.g. "share of X") | count matching events / total events of that class |
| Count (e.g. "decisions recorded / session") | sum of tagged events in the timeline |
| Duration | average elapsed time across the relevant spans |
| Trend delta | metric value this sprint − value from `baseline` (null if no baseline) |

Round rates to two decimal places. Delta is `+N` or `−N`; `n/a` if baseline is null.

### 4. Compare to baseline — the two axes

If `baseline` is non-null, load it. For each metric appearing in both runs, compute `delta`.
Emit **two distinct axes** per metric, never collapsed into one:

- **`severity: ok | warn | breach | n/a`** — the *value-vs-threshold verdict*: where this
  sprint's value stands against the KR target / configured threshold. Not a findings-severity
  scale; `n/a` when there is no threshold or no baseline to read it against.
- **`trend_direction: improving | stable | degrading | first_point`** — the *direction of
  travel*: the **sign of the delta × the metric's declared direction**. A metric whose target
  wants the value *down* is `improving` on a negative delta; one whose target wants it *up* is
  `improving` on a positive delta; `degrading` when it moves the wrong way; `stable` at zero
  delta (within rounding); `first_point` when the baseline is null.

The two answer different questions — where the value stands *now* vs which way it is *moving*. A
metric can read `ok` and `degrading` at once. Both are always emitted.

### 5. Emit the report

Return one structured report. Do not summarise, narrate, or interpret — your consumer does that.

```yaml
sprint_id: <string>
measured_at: <ISO-8601 timestamp>
coverage:
  measured: <int>                         # outcomes with at least one computed row
  total: <int>                            # open outcomes across the targets
  unmeasured: [<outcome>, ...]            # named, never dropped silently
rows:
  - wi_id: <string>
    outcome: <success-definition outcome, verbatim from the carrier>
    ladders_to: { metric: <KR metric>, target: <KR target>, current: <KR current> }
    touched_by: [<iu-id>, ...]            # from improves — the coverage signal
    metrics:
      - name: <metric name>
        value: <number or rate>
        unit: <count | % | ms | dimensionless>
        delta: <+N | -N | n/a>
        severity: ok | warn | breach | n/a
        trend_direction: improving | stable | degrading | first_point
skipped:
  - outcome: <string>
    reason: missing_earns_keep | timeline_unavailable | pending_earns_keep
          | earns_keep_requires_judgment
warnings: [<string>, ...]                 # e.g. timeline_incomplete
```

## Measuring is not disposing

You measure **everything landed since the last debrief** — the full sweep, including a partial
work-item whose remaining units are still in flight. Disposition is the closeout gate's, at the
narrower unit of the finished deliverable: a partial WI is **measured here but held** there. You
emit numbers; `closed`/`promoted` calls are never yours.

## Hard limits

- Do not emit a metrics row without a corresponding success-definition source. If you cannot
  locate it, add the outcome to `skipped`.
- Do not measure a qualitative criterion. If it needs an operator to judge acceptability rather
  than count events, skip it (`earns_keep_requires_judgment`) — do not fabricate a number and do
  not invoke a model grader.
- Do not infer events absent from the timeline. An unclosed span is a `timeline_incomplete`
  warning, not a guessed completion — compute from what is present, flag the gap.
- Do not interpret results. "The outcome landed" is an interpretation; "delta: +0.12 (warn)" is
  a measurement.
- Every share is reported with its **coverage denominator** (`measured` of `total`, `unmeasured`
  named) — a share without its denominator is survivorship-biased.
- Treat every bundle input as read-only; never invent a threshold or budget that is absent —
  report `n/a` instead.
- Do not write to any file. The report is your return value only.

## On-demand references

At the step of need, read these bundled references:

- [okr-schema](references/okr-schema.md)
- [work-item-schema](references/work-item-schema.md)

