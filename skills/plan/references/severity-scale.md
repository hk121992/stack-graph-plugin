---
kind: reference
id: severity-scale
title: Finding contract — severity scale
description: The P0–P3 severity definitions shared by every review lens.
status: v0.1.0 — 2026-05-30
---

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

If your lens describes priority qualitatively, translate at emit time: critical/must-fix → P0,
important/should-fix → P1, worth-noting/could-fix → P2, low-signal → P3. Never emit `high`,
`medium`, `low`, `critical`, or any other vocabulary.
