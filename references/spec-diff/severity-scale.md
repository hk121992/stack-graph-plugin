---
kind: reference
id: severity-scale
title: Finding contract — severity scale
description: The factory's findings-severity contract — the P0–P3 scale used by every review lens and by the non-lens findings emitters (spec-diff, reconcile, drift-detector).
status: v0.2.0 — 2026-06-04
---

This is the factory's **findings-severity contract**: the single P0–P3 vocabulary used by every
review lens **and** by the non-lens findings emitters — `spec-diff`, `reconcile`, and
`drift-detector` (which formerly used their own `low/med/high`).

Set `severity` to one of these exact values. Severity orders a finding within the actionable
surface; it is **independent** of `confidence` (which gates whether the finding surfaces at
all — see the `confidence-anchors` reference). A P2 can be `confidence: 100`; a P0 can be
`confidence: 50`.

- **`P0`** — critical breakage, exploitable vulnerability, or data loss/corruption. Must fix
  before the change lands.
- **`P1`** — high-impact defect likely hit in normal usage, or a broken contract. Should fix.
- **`P2`** — moderate issue with a meaningful downside (a real edge case, a perf regression, a
  maintainability trap). Fix if straightforward.
- **`P3`** — low-impact, narrow scope, minor improvement. Operator's discretion.

**Non-lens emitters** map divergence / drift magnitude onto this same P0–P3 priority axis: P0 = a
delivery-path touchpoint entirely unmet or contradicted, or drift that breaks the loop; … down to
P3 = cosmetic / nit.

**Out of scope.** Metric-vs-baseline verdicts (`measure-outcomes`' `ok | warn | breach | n/a`) and
`trend_direction` (`improving | stable | degrading | first_point`) are a different axis — they are
**not** findings-severity and keep their own vocabularies.

If your lens describes priority qualitatively, translate at emit time: critical/must-fix → P0,
important/should-fix → P1, worth-noting/could-fix → P2, low-signal → P3. Never emit `high`,
`medium`, `low`, `critical`, or any other vocabulary.
