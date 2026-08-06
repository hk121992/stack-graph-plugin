---
subject: product-definition-guidance
title: Product-definition — authoring guidance (the identity floor)
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring a harness's product-definition."
derive-from: [product-definition]
reviews-on: product-definition-guidance-source
last-reviewed: 2026-06-30
entropy: unmeasured
status: drafted
related: [product-principles-guidance, okr-schema]
---

# Product-definition — authoring guidance

`product-definition` is a harness's always-on **identity** surface — **what the product IS** — carried by every
stage from turn 1 so nothing drifts off-product. It is **authored per harness** (`harness-init` seeds it, the
operator fills and maintains it). This reference is **guidance on what it should contain**, not a fill-in
template — the identity is prose, not a form.

**Contains** — the standing identity, in one short paragraph: **what** the product is (in a sentence) · **who**
it serves · the **value** it delivers to them.

**Does not contain** — the quality bar (→ `product-principles`), operating rules (→ `sg-root-instructions` /
`git-policy`), or goals / KRs / roadmap (→ the objectives / strategy layer, read on-demand). One paragraph; if
it grows standards or measurement it is mis-homed (the context-curator relocates it).

The test: an agent checks an item against this at the intent-to-build alignment floor — *"does this serve what
we are?"*
