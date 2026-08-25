---
subject: test-discipline
title: Test discipline — the test-quality standard
provenance: vendored
level: L2
cadence: on-demand
read-when: "Writing or grading a slice's tests."
derive-from: [test-discipline]
reviews-on: test-discipline-source
last-reviewed: 2026-08-25
entropy: unmeasured
status: drafted
related: [architecture-doctrine, ux-principles]
---

# Test discipline

The one named test-quality rubric: `build` writes a slice's tests to it, `lens-tests` grades against it — a single contract, not each node's private paraphrase. Quality only: the RED→GREEN→REFACTOR loop's *order* lives in `build`, not here.

## The core principle {#core}

A test verifies **behaviour through a public interface**, not implementation. If a behaviour-preserving refactor breaks a test, that test was testing implementation — a liability, not coverage.

## Good / bad {#good-bad}

**Good:** exercises a real path through the public API; reads as a specification — names *what* capability exists, not *how*; survives a behaviour-preserving refactor; makes one logical assertion.

**Red flags:** mocks an internal collaborator or tests a private method; asserts on call counts or call order; verifies through a back-channel (querying the DB directly) instead of the interface; breaks on a refactor that changed no behaviour.

## Mocking — boundaries only {#mocking}

Mock **only at system boundaries**: external APIs, the database (prefer a real test DB), time, randomness, the filesystem. Never mock your own classes or internal collaborators. An over-mocked test that mocks the thing under test passes whether or not the real behaviour is correct — worse than no test.

## Design for testability {#testability}

- **Inject dependencies** — pass the external client in; don't construct it inside the unit.
- **Return results, don't mutate** shared state.
- **Small surface area** — the deep module: a small interface over substantial implementation. What shape a module and its seam should take is [architecture-doctrine](architecture-doctrine.md)'s question; this card owns test quality.

## Dependency categories — the test strategy across a seam {#dependency-categories}

Classify a module's dependencies; the category determines the test strategy:

1. **In-process** — pure computation, in-memory state: merge and test through the new interface directly.
2. **Local-substitutable** — a local stand-in exists (an embedded DB, an in-memory filesystem): test against the stand-in; the seam stays internal.
3. **Remote but owned** — your own services across a network: define a **port** at the seam; an in-memory adapter for tests, the transport adapter for production.
4. **True external** — third-party services you don't control: inject as a port; tests provide a mock adapter.

## The gates {#gates}

One logical assertion per test. Test behaviour, not shape — never bulk-write tests ahead of the behaviour they prove. Never refactor while RED (`build` owns the loop timing; the quality gate stands here).
