---
subject: architecture-doctrine
title: Architecture doctrine — deep modules, seams, structural judgment
provenance: vendored
level: L2
cadence: on-demand
read-when: "Judging structural depth, a seam, or a deepening."
derive-from: [architecture-doctrine]
reviews-on: architecture-doctrine-source
last-reviewed: 2026-08-25
entropy: unmeasured
status: drafted
related: [test-discipline, ux-principles, four-risks]
---

# Architecture doctrine

The one named vocabulary for structural judgment — `build`'s REFACTOR standard, `verify`'s coherence grounding, `lens-maintainability`'s hunt grounding, `architecture-review`'s substrate — a single contract, not each node's private paraphrase.

## Vocabulary — use these terms exactly {#vocabulary}

Consistent language is the point. Do not substitute.

- **Module** — anything with an interface and an implementation; scale-agnostic. *Avoid:* unit, component, service.
- **Interface** — everything a caller must know to use the module correctly: the signature **plus** invariants, ordering constraints, error modes, required configuration, performance characteristics. *Avoid:* API, signature.
- **Implementation** — the code inside a module; say "adapter" only when the seam is the topic.
- **Depth** — leverage at the interface: how much behaviour a caller (or test) exercises per unit of interface learned. **Deep** = much behaviour behind a small interface.
- **Seam** *(Feathers)* — where behaviour can be altered without editing in that place; where a module's interface lives. *Avoid:* boundary.
- **Adapter** — a concrete thing satisfying an interface at a seam; names the *role*, not the substance.
- **Leverage** — what callers get from depth. **Locality** — what maintainers get: change, bugs, knowledge, and verification concentrate in one place.

### Rejected framings {#rejected-framings}

- Depth as implementation-lines ÷ interface-lines — rewards padding; use depth-as-leverage.
- "Interface" as the language keyword or public methods — too narrow.
- "Boundary" — overloaded; say **seam** or **interface**.

## Principles {#principles}

- **Depth is a property of the interface, not the implementation** — a deep module may be internally composed of small, swappable parts; they just aren't part of the interface.
- **The deletion test.** Imagine deleting the module: complexity vanishes → it was a pass-through hiding nothing; complexity reappears across N callers → it was earning its keep.
- **The interface is the test surface.** Wanting to test *past* the interface means the module is probably the wrong shape.
- **One adapter means a hypothetical seam; two means a real one.** Don't introduce a port nothing actually varies across.

## Dependency direction {#dependency-direction}

Dependencies inject at seams: the deep module owns the logic; what varies (transport, vendor, store) arrives as an adapter — one port, N adapters. The per-category test strategy — the dependency-category table — lives in [test-discipline](test-discipline.md) §dependency-categories.

## Replace, don't layer {#replace-dont-layer}

When a deepening lands, **delete** the old unit tests on the absorbed shallow modules — never keep them alongside. New tests live at the deepened module's interface, assert observable outcomes, and survive internal refactors. What makes an individual test good is [test-discipline](test-discipline.md)'s contract; this card owns the structural question.
