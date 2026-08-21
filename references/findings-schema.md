---
subject: findings-schema
title: Findings schema — the review-lens output contract
provenance: vendored
level: L2
cadence: on-demand
read-when: "Emitting or validating a review-lens finding."
derive-from: [findings-schema]
reviews-on: findings-schema-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [severity-scale, confidence-anchors, lens-dispatch]
---

# Findings schema — the review-lens output contract

The **per-finding record shape every review lens emits and every consumer validates against** — so the
dispatch's merge / dedup / corroboration / confidence-gate / severity-sort runs **mechanically**, with no
per-lens parsing. One contract for every lens is what holds the deterministic-from-the-returns-inward guarantee:
the reduction never has to introduce judgment to reconcile shapes. It composes with two sibling contracts —
[severity-scale](severity-scale.md) (the `severity` enum) and [confidence-anchors](confidence-anchors.md) (the
`confidence` enum + suppression) — handed to a lens together as the **finding contract**. This fixes the field
shapes and value-spaces, never an instance (a real finding's title, file, and line are runtime).

## Top level {#top-level}

A lens returns:

- **`reviewer`** — the lens name.
- **`findings[]`** — one object per finding (empty when none).
- **`residual_risks[]`** — risks noticed but not confirmed as findings.
- **`testing_gaps[]`** — missing coverage identified.

## Each finding {#finding}

| field | value-space | meaning |
|---|---|---|
| `title` | string, ≤10 words | short, specific issue title |
| `severity` | `P0 · P1 · P2 · P3` | per [severity-scale](severity-scale.md) |
| `file` | string | path from repo root (for a `doc` target, the doc location/section) |
| `line` | integer ≥1 | primary line (for a `doc` target, the section anchor) |
| `why_it_matters` | string | the impact + failure mode — *what breaks*, not *what is wrong*; lead with observable behaviour, ground it in the cited code |
| `autofix_class` | `safe_auto · gated_auto · manual · advisory` | the routing class for the downstream fixer (below) |
| `owner` | `fixer · follow-up · human · release` | the default next actor |
| `requires_verification` | boolean | does a fix need targeted tests / a re-review before it is trusted |
| `confidence` | `0 · 25 · 50 · 75 · 100` | anchored, per [confidence-anchors](confidence-anchors.md) |
| `evidence` | array of strings, ≥1 | code-grounded snippets / line references / pattern descriptions |
| `pre_existing` | boolean | true only for unchanged code unrelated to this change |
| `suggested_fix` | string \| null | a concrete minimal fix when one is reachable (below) |

## The `autofix_class` rubric {#autofix-class}

Route **honestly** — the wrong-side cost is symmetric — but **bias toward `safe_auto` when the rubric
permits**, since misclassifying a mechanical fix as `gated_auto` forces a human to triage work the fixer
could have applied (the `gated_auto` / `manual` classes already require approval before anything lands):

- **`safe_auto`** — local and deterministic, statable in one sentence with no "depends on", changing **none** of
  { signature, public-API / error contract, security posture, permission model }.
- **`gated_auto`** — a concrete fix that **does** change a contract, permission, or module boundary, so it
  deserves explicit approval before it lands.
- **`manual`** — actionable work needing a design decision or cross-cutting change; pair it with a
  `suggested_fix` where one is defensible.
- **`advisory`** — report-only ("nothing breaks, but…"); pair with `confidence: 50` so triage routes it to a
  soft bucket.

## `suggested_fix` discipline {#suggested-fix}

Propose a fix **whenever a defensible code change is reachable** — from the diff, cited code, a parallel pattern,
or framework convention. Imperfect information is not grounds for omission: propose the most defensible default
and name the assumption; let the operator override. **"I need `<input>` before I can commit" is a soft punt** —
instead answer *"what change would I propose if I had to choose now?"* Omit **only** when there is genuinely no
code-level change to propose (the finding is a question, or the resolution is purely organisational).

## Return tiers {#tiers}

Two valid uses of this schema:

- **Compact return** (always, to the orchestrator) — per finding: `title`, `severity`, `file`, `line`,
  `confidence`, `autofix_class`, `owner`, `requires_verification`, `pre_existing`, and `suggested_fix` if any;
  plus the top-level fields. **Omit** `why_it_matters` + `evidence` to keep the orchestrator lean.
- **Full artefact** (when the orchestrator hands a write path) — the complete schema, all fields. This is the
  **one** write a lens is permitted; if it fails, the compact return carries what the merge needs.

## Cite out {#cite-out}

- **The `severity` enum** → [severity-scale](severity-scale.md).
- **The `confidence` enum + suppression behaviour** → [confidence-anchors](confidence-anchors.md).
- **The producer + validator** — the lens family that emits this, and the dispatch that validates and merges it → the lens nodes · lens-dispatch.
- **The consumers** that declare it required and read it before running lens roles → review + verify + the front spine (design · plan · shape).
