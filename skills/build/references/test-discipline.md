---
kind: reference
id: test-discipline
title: Test discipline — the test-quality standard
description: >-
  The test-quality standard build writes to and lens-tests grades against: behaviour through public
  interfaces not implementation, integration over unit, mock only at system boundaries never internal
  collaborators, interfaces shaped for testability. Use when writing or reviewing tests. The
  RED→GREEN→REFACTOR loop lives in build, not here.
status: v0.1.0 — 2026-06-05
---

# Test discipline

`build` writes a slice's tests to this standard; `lens-tests` grades a diff's or a design's tests
against it. It is the **one named rubric** both draw on, so test quality is a single contract rather
than each node's private paraphrase.

This reference is the **quality of a test**, not the *order* you write tests in. The
RED→GREEN→REFACTOR tracer-bullet loop — vertical-not-horizontal, minimal-code, refactor-under-green —
lives in `build` ("Incremental arc — build mode"). Do not restate it here.

## The core principle

A test verifies **behaviour through a public interface**, not implementation. The code underneath can
change entirely; the test should not. If renaming an internal function or restructuring internals
breaks a test whose behaviour is unchanged, that test was testing implementation — it is a liability,
not coverage.

## Good test / bad test

A **good** test:

- exercises a real code path through the **public API** (integration-style, not a mock of internal parts);
- reads like a specification — its name says **what** capability exists ("user can checkout with a valid cart"), not **how**;
- survives a behaviour-preserving refactor;
- makes **one logical assertion**.

A **bad** test (red flags):

- mocks an internal collaborator, or tests a private method;
- asserts on call counts or call order;
- verifies through an external back-channel (querying the DB directly) instead of the interface;
- names *how* it works rather than *what* it does;
- breaks on a refactor that did not change behaviour.

Verify through the interface, not behind it:

```
// BAD — bypasses the interface to a back-channel
createUser({ name: "Alice" });
row = db.query("SELECT * FROM users WHERE name = 'Alice'");   // asserts on storage internals

// GOOD — verifies the observable contract
user = createUser({ name: "Alice" });
assert getUser(user.id).name == "Alice";                      // asserts through the public API
```

## Mocking — boundaries only

Mock **only at system boundaries**: external APIs (payment, email), the database (prefer a real test
DB where you can), time and randomness, the filesystem. **Never** mock your own classes, internal
collaborators, or anything you control — mocking what you own couples the test to structure and hides
the real behaviour.

Design the boundary so it is easy to mock honestly:

- **Inject dependencies** — pass the external client in; do not construct it inside the unit.
- **Prefer specific, SDK-style interfaces** over one generic fetcher — each operation is its own
  function, so each mock returns one shape with no conditional logic in test setup, and a test visibly
  exercises named endpoints.

An over-mocked test that mocks the thing under test passes whether or not the real behaviour is correct;
it is worse than no test because it signals coverage it does not provide.

## Design for testability

Behaviour is testable through a public interface only if the interface is shaped for it:

- **Accept dependencies, don't create them** — inject, so a test can substitute at the boundary.
- **Return results, don't mutate** — a function that returns a value is testable by its output; one
  that mutates shared state is not.
- **Small surface area** — fewer methods and fewer parameters mean fewer tests and simpler setup. The
  underlying principle is the *deep module* (small interface over substantial implementation).

> The fuller deep-modules / interface-design / refactoring doctrine belongs to the planned
> `improve-codebase-architecture` import. This reference takes only the **testability slice**; when
> that reference exists, `test-discipline` should `reference` it rather than carry architecture content.

## The gates

- **One logical assertion per test.**
- **Test behaviour, not shape** — never bulk-write tests of data structures or signatures ahead of the
  code; a test written before its behaviour exists tests imagined behaviour.
- **Never refactor while RED** — get to GREEN first. (The loop in `build` owns this timing; it is
  restated here only as a quality gate, not as loop mechanics.)

---

**Source.** Synthesised from Matt Pocock's `engineering/tdd` skill — github.com/mattpocock/skills,
`skills/engineering/tdd/` at commit `aaf2453f`, MIT © 2026 Matt Pocock. A **rubric** adopting the
ideas/patterns, not substantial verbatim text. The RED→GREEN→REFACTOR loop (owned by `build`) and the
fuller deep-modules/interface architecture doctrine are excluded by design. Import rationale:
`docs/test-discipline-import.md`.
