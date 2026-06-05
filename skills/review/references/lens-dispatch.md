---
kind: reference
id: lens-dispatch
title: Lens dispatch — fan-out, merge, triage, route
description: The shared procedure a stage runs to fan out to the review lens family and turn their returns into a ranked, routed finding set.
status: v0.1.0 — 2026-05-30
---

This is the shared lens-panel procedure. The consuming stage (review over a diff; design or
plan over a doc) follows it to fan out to the active lenses and reduce their returns to one
ranked, routed finding set. The lenses are autonomous agents that own their own dimension;
this procedure owns only the orchestration — selection, fan-out, and the deterministic
merge/triage/route. Keep the orchestrator's context lean: collect compact returns, not full
analyses.

## 1. Select the active lenses

Always run the always-on lenses: `lens-correctness`, `lens-security` (lower reporting gate),
`lens-tests`, `lens-maintainability`. Add a conditional lens only when its trigger is met —
`lens-performance` (DB/loops/IO/async touched), `lens-design` (UI surface), `lens-dx`
(public API/CLI/docs changed), `lens-runtime` (error handling/retries/migrations),
`lens-adversarial` (high risk or large blast radius), `lens-external` (cross-model second
opinion requested). Two of these conditional lenses are **autonomous measurement agents**, not
diff-judgment lenses: `benchmark` (perf — dispatch when the change could move page-load /
Core-Web-Vitals / bundle size) and `health` (code-quality — dispatch when a whole-tree quality
re-score is warranted). They compare against a stored baseline and return a regression /
quality verdict that folds into the same finding set. Skipping a conditional lens is the
default, not a finding.

## 2. Fan out

Spawn each active lens in its own isolated context, in parallel. Hand each the same bundle:
the `target` (`diff` or `doc`) and its contents, the scope-rules (what is in/out of the
change; base-ref markers; untracked-scope notes), an optional intent/requirements summary,
and the finding contract (the finding schema, severity scale, and confidence anchors) in the
spawn prompt. Each lens returns the **compact** tier (no
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
