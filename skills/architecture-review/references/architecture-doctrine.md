---
kind: reference
id: architecture-doctrine
title: Architecture doctrine — deep modules, seams, dependency categories
description: >-
  The deep-module vocabulary and seam discipline: module / interface / implementation, depth
  (deep/shallow), seam, adapter, leverage, locality; the deletion test; the four dependency
  categories and replace-don't-layer testing. Use when judging structural depth, deepening a
  module, or designing across a seam. The test-quality slice lives in test-discipline.
status: v0.1.0 — 2026-06-10
---

# Architecture doctrine

`architecture-review` reasons with this doctrine; `lens-maintainability` grounds its structural
hunt-list in it; `test-discipline` defers its deep-module pointer here. It is the **one named
vocabulary** for structural judgment, so depth and seams are a single contract rather than each
node's private paraphrase.

## Vocabulary — use these terms exactly

Consistent language is the point. Do not substitute.

- **Module** — anything with an interface and an implementation. Scale-agnostic: a function, a
  class, a package, a tier-spanning slice. *Avoid:* unit, component, service.
- **Interface** — everything a caller must know to use the module correctly: the type signature
  **plus** invariants, ordering constraints, error modes, required configuration, performance
  characteristics. *Avoid:* API, signature (those name only the type-level surface).
- **Implementation** — the code inside a module. Distinct from adapter: a thing can be a small
  adapter with a large implementation (a Postgres repo) or a large adapter with a small
  implementation (an in-memory fake). Say "adapter" when the seam is the topic; "implementation"
  otherwise.
- **Depth** — leverage at the interface: how much behaviour a caller (or test) can exercise per
  unit of interface they must learn. **Deep** = a lot of behaviour behind a small interface.
  **Shallow** = interface nearly as complex as the implementation.
- **Seam** *(Feathers)* — a place where behaviour can be altered without editing in that place;
  the *location* at which a module's interface lives. Choosing where the seam sits is its own
  design decision, distinct from what goes behind it. *Avoid:* boundary (overloaded with DDD's
  bounded context).
- **Adapter** — a concrete thing satisfying an interface at a seam. Names the *role* (what slot
  it fills), not the substance.
- **Leverage** — what callers get from depth: more capability per unit of interface learned; one
  implementation pays back across N call sites and M tests.
- **Locality** — what maintainers get from depth: change, bugs, knowledge, and verification
  concentrate in one place. Fix once, fixed everywhere.

### Rejected framings

- **Depth as implementation-lines ÷ interface-lines** (Ousterhout's ratio): rewards padding the
  implementation. Use depth-as-leverage instead.
- **"Interface" as the language keyword or a class's public methods**: too narrow — interface
  here is every fact a caller must know.
- **"Boundary"**: overloaded. Say **seam** or **interface**.

## Principles

- **Depth is a property of the interface, not the implementation.** A deep module can be
  internally composed of small, swappable parts — they just aren't part of the interface. A
  module may have **internal seams** (private, used by its own tests) as well as the external
  seam at its interface.
- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a
  pass-through hiding nothing. If complexity reappears across N callers, it was earning its
  keep. Apply this to anything suspected shallow: "yes, deleting it would scatter complexity" is
  the signal of a real module.
- **The interface is the test surface.** Callers and tests cross the same seam. Wanting to test
  *past* the interface means the module is probably the wrong shape.
- **One adapter means a hypothetical seam. Two adapters means a real one.** Don't introduce a
  seam (or a port) unless something actually varies across it — typically production + test. A
  single-adapter seam is just indirection.

## Dependency categories — how a deepened module is tested across its seam

When assessing a module (or a cluster of shallow modules) for deepening, classify its
dependencies. The category determines the test strategy.

1. **In-process** — pure computation, in-memory state, no I/O. Always deepenable: merge the
   modules and test through the new interface directly. No adapter needed.
2. **Local-substitutable** — dependencies with local test stand-ins (PGLite for Postgres, an
   in-memory filesystem). Deepenable if the stand-in exists; tests run against the stand-in. The
   seam is internal — no port at the module's external interface.
3. **Remote but owned (ports & adapters)** — your own services across a network. Define a
   **port** (interface) at the seam; the deep module owns the logic, the transport is injected
   as an adapter. Tests use an in-memory adapter; production uses an HTTP/gRPC/queue adapter.
   Recommendation shape: *"define a port at the seam, an HTTP adapter for production and an
   in-memory adapter for testing, so the logic sits in one deep module even though it deploys
   across a network."*
4. **True external (mock)** — third-party services you don't control (Stripe, Twilio). The
   deepened module takes the external dependency as an injected port; tests provide a mock
   adapter.

## Replace, don't layer

When a deepening lands, old unit tests on the absorbed shallow modules become waste — **delete
them**, don't keep them alongside.

- Write new tests at the deepened module's interface — the interface is the test surface.
- Tests assert observable outcomes through the interface, never internal state.
- Tests must survive internal refactors: they describe behaviour, not implementation. A test
  that changes when the implementation changes was testing past the interface.

What makes an individual test good or bad — behaviour-through-public-interface, mocking only at
system boundaries, one logical assertion — is `test-discipline`'s contract; this reference owns
the structural question (what shape the module and its seam should take), not the test-quality
rubric.

---

**Source.** Synthesised from Matt Pocock's `engineering/improve-codebase-architecture` skill —
github.com/mattpocock/skills, `skills/engineering/improve-codebase-architecture/` at commit
`aaf2453f`, MIT © 2026 Matt Pocock (LANGUAGE.md + DEEPENING.md; the review *process* lives in
the `architecture-review` node, the report template in that node's body). A **rubric** adopting
ideas/patterns, not substantial verbatim text; verbatim copies of LANGUAGE.md and HTML-REPORT.md
are separately vendored at `tooling/sg-language-reviewer/source-material/pocock-ica-*.md` for
the language standard. Import rationale: `docs/architecture-review-import.md`.
