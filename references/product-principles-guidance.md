---
subject: product-principles-guidance
title: Product-principles — authoring guidance (the quality bar)
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring a harness's product-principles."
derive-from: [product-principles]
reviews-on: product-principles-guidance-source
last-reviewed: 2026-06-30
entropy: unmeasured
status: drafted
related: [product-definition-guidance]
---

# Product-principles — authoring guidance

`product-principles` is a harness's always-on **quality bar** — the standing **non-negotiables** every stage
holds the work to (the how-good-is-good-enough floor). It is **authored per harness** (`harness-init` seeds it,
the operator fills and maintains it). This reference is **guidance on what it should contain**, not a fill-in
template.

**Contains** — a closed, terse set of standing quality standards, each a bar a design is vetted against and a bar
verify / review won't let through (a durable "we always X / never Y" the product commits to).

**Does not contain** — identity (→ `product-definition`), operating rules (→ `sg-root-instructions` /
`git-policy`), stage-specific quality logic (lives on the stage node), or vendored cross-product standards
(`ux-principles` · `test-discipline` · `architecture-doctrine` stay vendored, read at the stage that needs
them). A growing standards dump is mis-homed.

Each item is a **standing bar, not a to-do** — an on-spec item that violates one is caught here, not waved
through at land.
