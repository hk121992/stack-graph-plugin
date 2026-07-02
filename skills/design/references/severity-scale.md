---
subject: severity-scale
title: Severity scale — the findings-severity contract
provenance: vendored
level: L2
cadence: on-demand
read-when: "Setting a finding's `severity`."
derive-from: [severity-scale, findings-schema]
reviews-on: severity-scale-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [findings-schema, confidence-anchors, lens-dispatch]
---

# Severity scale — the findings-severity contract

The single **P0–P3** vocabulary every review lens **and** every non-lens findings emitter (`review`'s
per-IU spec-match · `drift-detector`) sets `severity` to. Severity **orders** a finding within the actionable
surface; it is **independent** of `confidence` (which gates *whether* it surfaces — see
[confidence-anchors](confidence-anchors.md)). A `P2` can be `confidence: 100`; a `P0` can be `confidence: 50`.

Set `severity` to exactly one of:

- **`P0`** — critical breakage, exploitable vulnerability, or data loss/corruption. **Must fix before the change lands.**
- **`P1`** — high-impact defect likely hit in normal usage, or a broken contract. **Should fix.**
- **`P2`** — moderate issue with a meaningful downside (a real edge case, a perf regression, a maintainability trap). **Fix if straightforward.**
- **`P3`** — low-impact, narrow scope, minor improvement. **Operator's discretion.**

**Non-lens emitters** map divergence / drift magnitude onto this same axis: `P0` = a delivery-path touchpoint
entirely unmet or contradicted, or drift that breaks the loop; down to `P3` = cosmetic / nit.

If a lens describes priority qualitatively, translate at emit time: critical/must-fix → `P0`,
important/should-fix → `P1`, worth-noting → `P2`, low-signal → `P3`. **Never emit `high` / `medium` / `low` /
`critical`** or any other vocabulary.

**Out of scope — a different axis, kept apart.** Metric-vs-baseline verdicts (`measure-outcomes`'
`ok | warn | breach | n/a`) and `trend_direction` (`improving | stable | degrading | first_point`) are **not**
findings-severity and keep their own vocabularies.

## Cite out

- **The finding record** this is a field of → [findings-schema](findings-schema.md).
- **The orthogonal `confidence` axis** + suppression thresholds → [confidence-anchors](confidence-anchors.md).
- **Term** senses → glossary.
