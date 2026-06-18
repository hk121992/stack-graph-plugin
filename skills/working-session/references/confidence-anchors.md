---
kind: reference
id: confidence-anchors
title: Finding contract — confidence anchors
description: The discrete 0/25/50/75/100 confidence rubric and the suppression thresholds every lens self-applies.
status: v0.1.0 — 2026-05-30
---

Set `confidence` to exactly one of `0`, `25`, `50`, `75`, `100` — a discrete anchor, never a
value in between and never a float. Each anchor is tied to a behaviour you must honestly
self-apply; if you cannot truthfully attach the behavioural claim to the finding, step down to
the next anchor. (Discrete anchors prevent false-precision gaming — the model cannot calibrate
meaningfully at finer granularity.)

- **`0` — not confident.** A false positive that does not survive light scrutiny, or a
  pre-existing issue this change did not introduce. **Suppress silently.** The anchor exists
  only so triage can track the drop; lenses never emit it.
- **`25` — somewhat confident.** Might be real, might be a false positive; you could not verify
  from the change and surrounding code alone. **Suppress silently.** Either gather more
  evidence (read call sites, related files, history) until you can honestly reach `50`+, or
  drop it.
- **`50` — moderately confident.** You verified it is real, but it is a nitpick, narrow edge
  case, or has minimal practical impact. Style preferences and subjective improvements land
  here. Surfaces **only** when it is `P0`, or when triage routes it to a soft bucket
  (`residual_risks`, `testing_gaps`, advisory).
- **`75` — highly confident.** You double-checked the change and surrounding code and confirmed
  the issue affects users, callers, or runtime behaviour in normal usage. **Requires naming a
  concrete observable consequence** — a wrong result, an unhandled error path, a contract
  mismatch, a security exposure, a coverage gap a real scenario would hit. "This could be
  cleaner" is not a consequence; that is advisory and lands at `50`. When torn between `50` and
  `75`, ask: "will a user, caller, or operator concretely encounter this?" — yes is `75`, my
  opinion about quality is `50`.
- **`100` — certain.** Verifiable from the code alone: compile error, type mismatch, definitive
  logic bug (off-by-one in a tested path, wrong return type, swapped arguments), or an explicit
  standards violation with a quotable rule. No interpretation required.

**Thresholds.** The actionable floor is `75`: emit only `75` and `100` as primary findings.
**Exception:** a `P0` at `50`+ must still be emitted — critical-but-uncertain issues are never
silently dropped. Anchors `0`/`25` are always suppressed; `50` surfaces only via the P0
exception or soft-bucket routing. Confidence gates *where* a finding surfaces; severity orders
it once it does.
