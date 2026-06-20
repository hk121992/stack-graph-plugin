---
kind: reference
id: git-policy
title: git-policy — the per-surface git-write policy dial (surface enum + resolution rule)
description: The single canonical spec for the per-surface git-write policy — the closed enum of logical write-surfaces, the canon subset, the resolution rule that maps a surface to pr-gated-vs-direct against the harness-local git-policy binding, and the canon-fail-closed-on-absence rule. The one source every git-writing node consults instead of restating the PR-vs-direct decision; the dial values live in bindings.yaml (the harness supplies them — see bindings-contract), this reference fixes the semantics. No product data.
status: v0.1.0 — 2026-06-20
changelog:
  - v0.1.0 (2026-06-20): initial — author the surface enum {work-ledger, decisions, handbook, strategy, objectives, spec}, the canon subset {handbook, strategy, objectives, spec}, the resolution rule `mode = (surface ∈ git-policy.pr-gated) ? "pr-gated" : git-policy.default`, and the canon-fail-closed-on-absence rule (present block authoritative; absent block ⇒ canon-surface→pr-gated, non-canon→direct). Notes record-gate's terminal carrier write rides the work-ledger surface. (wi-git-policy-binding IU-1, working-session SG-3 §D1/D5/D6.) Authored as the spec only — the executable resolver + its unit test land with the first mechanical consumer (harness-init validate, IU-6); in this slice no node yet consults this reference.
---

# git-policy

Whether a git-writing node **graduates a change via a labelled PR** or **pushes direct** is a
**per-surface dial the harness owns** — not a constant baked into each node body. This reference is
the **one canonical spec** of that dial: the closed set of write-surfaces, the rule that resolves a
surface to a write mode against the harness-local `git-policy` binding, and what happens when the
binding is absent. Every git-writing node **consults this reference** ("graduate per `git-policy`")
rather than re-encoding the PR-vs-direct decision, so a future change — a third mode, a moved
surface, the absent-default — is **one edit + a re-vendor**, not six drifting node-body copies (the
single-source pattern `product-dashboard-conventions` already proves for the work-ledger surface).

The dial **values** are harness-local and live in `bindings.yaml` (the `git-policy` block — see
`bindings-contract` §2); this reference fixes the **semantics** the values are read under. It carries
**no product data** — only the surface enum, the rule, and the absent-default.

## The closed surface enum

Every git-write a graph node performs is classified into exactly **one logical write-surface**. The
surface is **closed** (root-instruction #4 spirit — a closed vocabulary, not an open string):

| surface | the write | the node(s) that own it |
|---|---|---|
| `work-ledger` | a carrier `.md` (a WI or a standalone IU) + the thin sprint-record | `product-dashboard-conventions` (the front: `raise`/`edit`) + **`record-gate`** (the terminal `lifecycle_state`/`gate_decisions` carrier write) |
| `decisions` | an entry in the decisions store | `log-decision` |
| `handbook` | a handbook page (index + page edits) | `handbook-curator` |
| `strategy` | the Product Strategy thesis (`strategy.md`) | `strategy-curator` |
| `objectives` | the objectives / OKR doc (`objectives.md`) | direct OKR authoring (no curator owns the OKR layer) |
| `spec` | a spec amendment — **both** the `spec-layout` mode (a handbook page) **and** the `null` mode (the inline-spec write into the carrier) | `specify` / `reconcile` / `pr-author` |

These are **logical write-surfaces, not raw `bindings.yaml` binding keys.** This is load-bearing:
there is no `work-ledger` / `decisions` / inline-`spec` *binding key*, and `specify`'s `null` mode
writes the spec into the carrier (work-ledger), not a handbook page — so keying the dial on binding
keys is unbuildable. Keying on **logical surfaces** lets a multi-file surface (the work-ledger) and a
node-internal write (the `null`-mode inline spec) both be nameable.

### The canon subset

The **canon subset** of the enum is:

```
{ handbook, strategy, objectives, spec }
```

These are the surfaces that carry **durable, review-bearing** content — the handbook, the strategy
thesis, the objectives/OKR layer, and the spec. The remaining surfaces (`work-ledger`, `decisions`)
are **non-canon** runtime/working state. The canon subset is what the **absent-block fail-closed**
rule (below) protects: a missing binding can never silently strip review from a canon surface.

## The resolution rule

A node resolves the write mode for **its own surface** against the harness-local `git-policy` binding:

```
mode = (surface ∈ git-policy.pr-gated) ? "pr-gated" : git-policy.default
```

- `git-policy.pr-gated` is the operator's list of logical surfaces that graduate via a **labelled PR**.
- `git-policy.default` governs every surface **not** in `pr-gated`.
- A `"pr-gated"` mode ⇒ the node graduates the change via a labelled PR (never a direct push); a
  `"direct"` mode ⇒ the node pushes the change directly.

So with the canonical harness block —

```yaml
git-policy:
  default: direct
  pr-gated: [handbook, strategy, objectives, spec]
```

— the four canon surfaces resolve to `pr-gated` and `work-ledger` / `decisions` resolve to `direct`:
review is preserved where it earns its keep (canon) and the work-ledger pays no ceremony.

## Canon-fail-closed-on-absence

A **present** `git-policy` block is **authoritative** — the operator's `pr-gated` list is law, and an
**unlisted** canon surface honours `default` (the operator's explicit choice stands, even for canon).

When the `git-policy` block is **entirely absent** (a fresh clone, dropped or corrupted bindings, a
botched `harness-init`), the rule **fails closed for canon** (root-instruction #3 — fail closed; on a
broken or absent state, fall back to the safe default, never guess a confidently-wrong one):

- a **canon-surface** node (surface ∈ the canon subset) defaults to **`pr-gated`**;
- a **non-canon** node (`work-ledger`, `decisions`) defaults to **`direct`**.

So a missing block can **never silently strip canon review**, while the work-ledger keeps its
low-ceremony default. This is a **refinement**, not a reversal, of the absent-block semantics: a
*present* block stays authoritative (an unlisted canon surface honours `default`); only **total
absence** triggers the canon-safe default. (Operator-confirmed 2026-06-20, SG-3 §D1.)

## record-gate rides the work-ledger surface

`record-gate` is the single mechanical writer of a carrier's `lifecycle_state` / `gate_decisions`
(`carrier-interface`, `product-dashboard-conventions` SEC-1) — the carrier's most authority-bearing
write. Its **terminal carrier write rides the `work-ledger` surface**, so it follows the **same
policy as the carrier it records** (the work-ledger), never an unstated one. With the canonical block
that is `direct`; under a total-absence fall-back it is the non-canon default (`direct`). This closes
the gap where the 6+ git-writing primitives omitted `record-gate`'s carrier write from the policy
(SG-3 §D6).

## Authored-but-not-yet-consulted

This reference is **authored here as the spec only**; in this slice **no node yet imports it** — the
consult IUs wire it in later (`work-ledger-git-policy-consult` points
`product-dashboard-conventions` §"graduate" at it; `canon-git-policy-consult-migrate` points the
curators + spec surfaces; `harness-init-git-policy-validate` first *mechanically resolves* the
policy and is where the **executable resolver + its unit test** land). So the vendor pipeline may
not place this reference into any consumer bundle yet — that is expected (it is placed per-`references`
edge, and none exist until the consult IUs add them).

## Related

- `bindings-contract` — the contract for the harness-local `git-policy` block in `bindings.yaml`
  (the `{default, pr-gated}` shape + absent-default semantics); this reference fixes the rule the
  values are read under.
- `product-dashboard-conventions` — the work-ledger surface's content conventions; its §"graduate"
  is the first to consult this dial (`work-ledger-git-policy-consult`), single-sourcing the rule
  instead of restating "never a direct push".
- `carrier-interface` — the structural write-boundary; establishes `record-gate` as the single
  mechanical writer of the carrier write that rides the `work-ledger` surface above.
- `sg-root-instructions` — root-instruction #3 (fail closed) backs the canon-fail-closed default;
  root-instruction #4 (closed `<sg-*>` vocabulary) is the closed-enum spirit the surface enum follows.
