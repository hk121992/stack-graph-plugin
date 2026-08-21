---
subject: lens-dispatch
title: Lens dispatch — fan-out, merge, triage, route
provenance: vendored
level: L2
cadence: on-demand
read-when: "Fanning out the lens panel."
derive-from: [lens-dispatch]
reviews-on: lens-dispatch-source
last-reviewed: 2026-07-01
entropy: unmeasured
status: drafted
related: [findings-schema, severity-scale, confidence-anchors]
---

# Lens dispatch

This is the shared lens-panel procedure. The consuming stage (review over a diff; design or
plan over a doc) follows it to fan out to the active lenses and reduce their returns to one
ranked, routed finding set. Each lens is an isolated role that owns one dimension;
this procedure owns only the orchestration — selection, fan-out, and the deterministic
merge/triage/route. Keep the orchestrator's context lean: collect compact returns, not full
analyses.

## 1. Select the active lenses

Resolve the panel from the invoking skill's declared lens edges plus harness-supplied overlays.
Run every unconditional lens. Add a conditional lens only when its declared trigger is met.
A measurement role may join when a whole-tree re-score is warranted and return a baseline-relative
verdict into the same finding set. Dynamic verification modalities remain outside this panel.
Skipping a conditional lens whose trigger is unmet is the default, not a finding.

## 2. Fan out

Run each active lens in an isolated child context, in parallel. Hand each the same bundle:
the `target` (`diff` or `doc`) and its contents, the scope-rules (what is in/out of the
change; base-ref markers; untracked-scope notes), an optional intent/requirements summary,
and the finding contract (the finding schema, severity scale, and confidence anchors) in the
invocation prompt. Each lens returns the **compact** tier (no
`why_it_matters`/`evidence`). A lens that errors or times out is recorded as a gap, not a
silent drop — note which lens did not return.

## 3. Merge — deduplicate and corroborate

Collect every returned finding. Then, deterministically:

- **Deduplicate.** Two findings are the same when they name the same `file` and an
  overlapping `line`/region with the same root issue. Keep one; union their `evidence`.
- **Corroborate.** When two *different* lenses independently flag the same region, raise the
  merged finding's confidence and mark it corroborated — cross-lens agreement is strong
  signal. Corroboration across the correctness/security boundary (e.g. both flag a SQL
  interpolation) is expected, not noise.

## 4. Triage — apply the confidence gate

Apply the `confidence-anchors` thresholds (do not re-derive them):

- Drop everything below anchor **75** — *except* a `P0` at **50**+, which always survives
  (critical-but-uncertain issues are never silently dropped).
- Route surviving anchor-**50** items and any `advisory` finding to the soft buckets
  (`residual_risks`, `testing_gaps`) rather than the primary actionable list.
- Anchors **75**/**100** enter the actionable tier.

## 5. Route — order and assign

Order the actionable tier by the `severity-scale` reference (P0 → P3); within a severity, corroborated
findings first. Carry each finding's `autofix_class` and `owner` through unchanged — they are
the routing signal the downstream fixer/operator acts on. Emit:

- the ordered actionable findings (with `why_it_matters` + `evidence` pulled from the full
  artefacts when present),
- the soft buckets (advisory, residual risks, testing gaps),
- a one-line coverage note: which lenses ran, which were skipped (with the unmet trigger),
  and which failed to return.

The procedure is deterministic from the lens returns inward: no new judgment is introduced at
merge/triage/route — the judgment lives in the lenses, the reduction is mechanical.
