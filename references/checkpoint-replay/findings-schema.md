---
kind: reference
id: findings-schema
title: Finding contract — schema
description: The per-finding field contract every review lens emits, plus the merge-tier vs detail-tier return split.
status: v0.1.0 — 2026-05-30
---

Return your findings as JSON conforming to this contract. Use exactly the field names and
enum values below — downstream merge, triage, and routing validate against them and reject
anything else.

**Top level:**

- `reviewer` (string) — your lens name (e.g. `"correctness"`, `"security"`).
- `findings` (array) — one object per finding; an empty array if you found nothing.
- `residual_risks` (array of strings) — risks you noticed but could not confirm as findings.
- `testing_gaps` (array of strings) — missing coverage you identified.

**Each finding:**

| field | type | meaning |
|---|---|---|
| `title` | string, ≤10 words | short, specific issue title |
| `severity` | `P0`\|`P1`\|`P2`\|`P3` | see the `severity-scale` reference |
| `file` | string | path from repo root (for a `doc` target, the doc location/section) |
| `line` | integer ≥1 | primary line (for a `doc` target, the section anchor) |
| `why_it_matters` | string | the impact and failure mode — *what breaks*, not *what is wrong*; lead with observable behaviour (what a user/caller/operator experiences), keep to ~2–4 sentences, ground it in the cited code |
| `autofix_class` | `safe_auto`\|`gated_auto`\|`manual`\|`advisory` | routing class for the downstream fixer (see below) |
| `owner` | `fixer`\|`follow-up`\|`human`\|`release` | the default next actor |
| `requires_verification` | boolean | does any fix need targeted tests or a re-review pass before it is trusted |
| `confidence` | `0`\|`25`\|`50`\|`75`\|`100` | anchored — see the `confidence-anchors` reference |
| `evidence` | array of strings, ≥1 | code-grounded snippets / line references / pattern descriptions |
| `pre_existing` | boolean | true only for unchanged code unrelated to this change |
| `suggested_fix` | string \| null | a concrete, defensible minimal fix when one is reachable (see below) |

**`autofix_class` — route honestly; the wrong-side cost is symmetric.** Bias toward
`safe_auto` when the rubric permits, since misclassifying a mechanical fix as `gated_auto`
forces a human to triage work the fixer could have applied.

- `safe_auto` — local and deterministic; you can state the fix in one sentence with no
  "depends on" clause, AND it changes none of {function signature, public-API/error
  contract, security posture, permission model}. (Nil-guard in an internal function,
  off-by-one with a parallel pattern in scope, missing test for an existing method, dead-code
  removal with deadness signalled in scope, identical-duplication helper extraction whose
  name follows mechanically.)
- `gated_auto` — a concrete fix exists but it changes a contract, permission, or module
  boundary that deserves explicit approval before it lands.
- `manual` — actionable work needing a design decision or cross-cutting change; pair it with
  a `suggested_fix` whenever you can defend one.
- `advisory` — report-only. If the honest answer to "what breaks if we don't fix this?" is
  "nothing, but…", set `advisory` and `confidence: 50` so triage routes it to a soft bucket.

**`suggested_fix` — propose whenever a defensible code change is reachable** from the diff,
cited code, a parallel pattern, or framework convention. Imperfect information is not grounds
for omission: propose the most defensible default and name the assumption; let the operator
override. "I need `<input>` before I can commit" is a soft punt — instead answer "what change
would I propose if I had to choose now?" Omit only when there is genuinely no code-level
change to propose (the finding is a question, or the resolution is purely organisational).

**Return tiers.** Two valid uses of this schema:

- **Compact return** (always, to the orchestrator): per finding emit `title`, `severity`,
  `file`, `line`, `confidence`, `autofix_class`, `owner`, `requires_verification`,
  `pre_existing`, and `suggested_fix` (if any) — **omit** `why_it_matters` and `evidence` to
  keep the orchestrator's context lean. Plus the top-level `reviewer`, `residual_risks`,
  `testing_gaps`.
- **Full artefact** (when the orchestrator gives you a write path): the complete schema, all
  required fields including `why_it_matters` and `evidence`. This is the **one** write you are
  permitted; if it fails, continue — the compact return carries what the merge needs.
