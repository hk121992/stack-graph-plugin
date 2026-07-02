---
subject: constitution-guidance
title: Constitution — authoring guidance (the operating bounds)
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring a harness's constitution surface."
derive-from: [constitution]
reviews-on: constitution-guidance-source
last-reviewed: 2026-06-30
entropy: unmeasured
status: drafted
related: [product-definition-guidance, product-principles-guidance, sg-root-instructions]
---

# Constitution — authoring guidance

`constitution` is a harness's always-on **operating bounds** — the ground rules that bound **every** stage and
gate. It is **authored per harness** (`harness-init` seeds it, the operator fills and maintains it). This
reference is **guidance on what it should contain**, not a fill-in template.

**Contains** — only this harness's own operating bounds:
- **Autonomy** — what runs AFK vs needs the operator; where the HITL points sit.
- **Non-skippable** — the gates that must fire; the fail-closed-on-broken-state posture; what may never be skipped.
- **Operating constraints** — standing constraints on how stages run here.

**Does not contain** — identity (→ `product-definition`), the quality bar (→ `product-principles`), stage logic
(lives on the stage node), or the **general vendored root set**: navigation · substrate-consult-first · safety
already live in `sg-root-instructions`, git-write in its §Git-write. The constitution adds **only**
harness-specific bounds; if it restates the root set it is mis-homed (trimmed back into `sg-root-instructions`).

Each is a **bound an agent stops at**, not a procedure.
