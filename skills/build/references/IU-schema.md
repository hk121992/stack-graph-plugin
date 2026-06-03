---
kind: reference
id: IU-schema
title: Implementation-Unit schema — the plan↔build field contract
description: The field contract for an implementation unit (IU) — the child work item a plan produces and build consumes. Defines the fields a plan's impl-unit carries into build so that build can operate autonomously against a well-specified unit without re-asking what plan already settled.
status: v0.1.0 — 2026-06-01
---

# Implementation-Unit schema

An **implementation unit (IU)** is the unit of build work — the child work item a `plan` session
decomposes a parent carrier into, and that `build` consumes as its scope. It is **not a scalar
task list entry**: it is a structured record that carries the intent, boundary, dependencies, and
verification criteria from planning through to delivery, so that build can operate autonomously
against a well-specified unit.

## Fields

| field | required | meaning |
|---|---|---|
| `id` | yes | Stable slug, unique within the parent plan. Stable across re-plans so references and dependency edges survive revision. |
| `goal` | yes | **The intended outcome of this unit** — one sentence, outcome-framed ("so that X is true after build"), not a task description. This is what build is held to. |
| `files` | yes | **Scope boundary** — the files and directories this unit owns. Build does not touch files outside this set without flagging scope expansion to the operator. A narrow, explicit list beats a broad one. |
| `dependencies` | yes (empty if none) | **Other IU `id`s this unit depends on** — the units whose output this unit consumes or assumes. Build uses this list to sequence work and detect when a dependency is unfinished or broken. |
| `acceptance` | yes | **Verification criteria** — what must be true for build to call this unit done. Stated as observable conditions (tests pass, behaviour X holds, endpoint returns Y), not effort ("implement Z"). |
| `size` | yes | **Rough effort signal** — `XS \| S \| M \| L \| XL`. Used by build to calibrate depth of autonomous span and by plan's review lens to flag under- or over-scoped units. Not a commitment; updated at build if the estimate was wrong. |

## Invariants

- **`goal` is outcome-framed, not solution-framed.** "The login endpoint validates JWT and
  returns 401 on expiry" is an acceptance criterion, not a goal. The goal is "authentication
  errors are surfaced to the client in a form the UI can handle." Keep them distinct.
- **`files` is the scope contract.** Build honours it; if it discovers work outside the listed
  files is required, it flags this to the operator before expanding scope — never silently.
- **`dependencies` is the sequencing signal.** Build respects it. If a dependency's unit fails
  or is incomplete, build does not proceed as if it were done — it surfaces the blocker.
- **`acceptance` drives the done signal.** Build does not mark a unit complete on effort; it
  evaluates each acceptance criterion before emitting the unit-complete event. Weak or absent
  criteria are a plan quality gap, flagged at review.
- **The IU is not the carrier.** It is a child record of the parent work item — a decomposition
  artefact the plan produces. The parent carrier's `children[]` field tracks the IUs; the IUs
  themselves are not independent lifecycle entities. They do not hold `lifecycle_state` or
  `gate_decisions`.

## Example

```yaml
id: auth-jwt-validation
goal: Authentication errors are surfaced to the API client in a form the UI can act on — expired, invalid, and missing tokens each return a distinct, documented response.
files:
  - src/middleware/auth.ts
  - src/middleware/auth.test.ts
  - docs/api/auth-errors.md
dependencies: []
acceptance:
  - All three token-failure cases (expired, invalid, missing) return distinct HTTP status codes and structured error bodies per docs/api/auth-errors.md.
  - Unit tests cover all three cases and the happy path; test suite passes.
  - API error doc is updated to match the implementation.
size: S
```
