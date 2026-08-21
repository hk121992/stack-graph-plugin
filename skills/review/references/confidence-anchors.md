---
subject: confidence-anchors
title: Confidence anchors — the findings-confidence contract
provenance: vendored
level: L2
cadence: on-demand
read-when: "Setting a finding's `confidence`."
derive-from: [confidence-anchors, findings-schema]
reviews-on: confidence-anchors-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [findings-schema, severity-scale, lens-dispatch]
---

# Confidence anchors — the findings-confidence contract

Set `confidence` to exactly one of `0` · `25` · `50` · `75` · `100` — a **discrete anchor**, never a value
between and never a float. Each anchor is tied to a behaviour you must honestly self-apply; if you cannot
truthfully attach the behavioural claim, **step down** to the next anchor. (Discrete anchors prevent
false-precision gaming — the model cannot calibrate meaningfully at finer granularity.) Confidence gates
*where* a finding surfaces; [severity-scale](../../../references/severity-scale.md) orders it once it does.

- **`0` — not confident.** A false positive that does not survive light scrutiny, or a pre-existing issue this
  change did not introduce. **Suppress silently** (the anchor exists only so triage tracks the drop; lenses
  never emit it).
- **`25` — somewhat confident.** Might be real, might be a false positive; unverifiable from the change +
  surrounding code alone. **Suppress silently** — gather more evidence to reach `50`+, or drop it.
- **`50` — moderately confident.** Verified real, but a nitpick, narrow edge case, or minimal practical impact
  (style preferences land here). Surfaces **only** when `P0`, or when triage routes it to a soft bucket
  (`residual_risks` · `testing_gaps` · advisory).
- **`75` — highly confident.** Confirmed against the change + surrounding code to affect users, callers, or
  runtime in normal usage. **Requires naming a concrete observable consequence** — a wrong result, an unhandled
  error path, a contract mismatch, a security exposure, a coverage gap a real scenario hits. "This could be
  cleaner" is not a consequence (that is advisory at `50`).
- **`100` — certain.** Verifiable from the code alone: compile error, type mismatch, definitive logic bug
  (off-by-one in a tested path, wrong return type, swapped arguments), or an explicit standards violation with a
  quotable rule. No interpretation required.

**Thresholds.** The actionable floor is **`75`** — emit only `75` and `100` as primary findings. **Exception:**
a **`P0` at `50`+ must still be emitted** — critical-but-uncertain issues are never silently dropped. Anchors
`0`/`25` are always suppressed; `50` surfaces only via the P0 exception or soft-bucket routing.

## Cite out

- **The finding record** this is a field of → [findings-schema](../../../references/findings-schema.md).
- **The orthogonal `severity` axis** → [severity-scale](../../../references/severity-scale.md).
- **Term** senses → glossary.
