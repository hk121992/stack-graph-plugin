---
kind: reference
id: IU-schema
title: Implementation-Unit schema — the plan↔build field contract
description: The field contract for an implementation unit (IU) — the child work item a plan produces and build consumes. Defines the fields a plan's impl-unit carries into build so build can operate autonomously against a well-specified, single-agent-sized unit without re-asking what plan already settled.
status: v0.4.0 — 2026-06-04
---

# Implementation-Unit schema

An **implementation unit (IU)** is the unit of build work — the child work item a `plan` session
decomposes a parent carrier into, and that `build` consumes as its scope. It is **not a scalar
task list entry**: it is a structured record that carries the intent, boundary, dependencies, and
verification criteria from planning through to delivery, so that build can operate autonomously
against a well-specified unit.

An IU is sized to be a **single-agent-implementable unit** — buildable by one fresh agent within
its best-work context budget (see Invariants). That is the decomposition target `plan` aims for
and `build` calibrates against the measured `tokens_per_iu`.

## Fields

| field | required | meaning |
|---|---|---|
| `id` | yes | Stable slug, unique within the parent plan. Stable across re-plans so references and dependency edges survive revision. |
| `goal` | yes | **The intended outcome of this unit** — one sentence, outcome-framed ("so that X is true after build"), not a task description. This is what build is held to. |
| `files` | yes | **Scope boundary** — the files and directories this unit owns. Build does not touch files outside this set without flagging scope expansion to the operator. A narrow, explicit list beats a broad one. |
| `dependencies` | yes (empty if none) | **Other IU `id`s this unit depends on** — the units whose output this unit consumes or assumes. Build uses this list to sequence work and detect when a dependency is unfinished or broken. |
| `acceptance` | yes | **Verification criteria** — what must be true for build to call this unit done. Stated as observable conditions (tests pass, behaviour X holds, endpoint returns Y), not effort ("implement Z"). |
| `acceptance_check` | yes | **The runnable command(s) that prove `acceptance`** — the test/build/diff command `build` executes and whose **raw output** it attaches as the done-evidence (e.g. `npm test src/middleware/auth.test.ts`). `acceptance` is the criteria; `acceptance_check` is what proves them. When no runnable command exists (e.g. a pure-doc change), name the explicit manual verification instead — build still **shows** what it did, never asserts a bare pass. |
| `size` | yes | **Single-agent fit signal** — `XS \| S \| M \| L \| XL`. Estimates whether one fresh agent can build the unit within its best-work context budget (see Invariants). `L`/`XL` read as "probably too big — consider splitting." Calibrated against the measured `tokens_per_iu`. Not a commitment; updated at build if the estimate was wrong. |
| `title` | yes | Short human label for the unit (shown on the dashboard IU card). |
| `parent` | no | Parent work-item id. **Omitted ⇒ standalone** — an IU with no parent carrier (the incremental-improvement workflow). |
| `channel` | yes | `sprint` (decomposed from a work item) \| `incremental` (standalone improvement). Drives which dashboard channel renders the unit. |
| `status` | yes | Build-tracking state — `planned \| building \| done \| blocked`. **Lightweight tracking, not carrier lifecycle** (no gates). |
| `improves` | no | For incremental IUs: the node / surface id this improvement targets. |

## Invariants

- **Single-agent-implementable.** An IU's `goal` + `files` + `acceptance` must be buildable by
  **one fresh agent within its best-work context budget** — the durable rule is "one agent,
  bounded fresh context, split diligently." The budget is a **harness-tunable dial** (~100k
  tokens documented default), **not** a schema constant: the best-work window is
  model/version-dependent and is verified, not assumed. A unit whose context (files to read +
  tests + impl) would overflow the budget is too coarse — split it. (In the incremental loop, a
  vertical slice that will not fit one agent is a `promote` signal — it is a work-item, not a
  standalone IU.)
- **`goal` is outcome-framed, not solution-framed.** "The login endpoint validates JWT and
  returns 401 on expiry" is an acceptance criterion, not a goal. The goal is "authentication
  errors are surfaced to the client in a form the UI can handle." Keep them distinct.
- **`files` is the scope contract.** Build honours it; if it discovers work outside the listed
  files is required, it flags this to the operator before expanding scope — never silently.
- **`dependencies` is the sequencing signal.** Build respects it. If a dependency's unit fails
  or is incomplete, build does not proceed as if it were done — it surfaces the blocker.
- **`acceptance` drives the done signal; `acceptance_check` is the evidence.** Build does not
  mark a unit complete on effort, and does not mark it complete on a prose assertion. It runs
  `acceptance_check` and attaches the **raw output** (stdout, exit code) as the unit-complete
  evidence — shown, not asserted. Weak or absent criteria are a plan quality gap, flagged at
  review.
- **IUs are first-class, self-documented, and trackable — but not carriers.** Each IU has its own
  file (`ius/<id>.md`) with its own documentation and a lightweight `status` (planned / building /
  done / blocked). This applies to **all** work, not just incremental: a work item's `children[]`
  lists its **sprint** IUs (the dashboard renders them as a drill-down under the carrier), while a
  **standalone** IU (no `parent`, `channel: incremental`) has no carrier at all and renders in the
  incremental channel. IUs do **not** hold carrier `lifecycle_state` or `gate_decisions` — those stay
  the carrier's; the IU `status` is build-tracking only.
- **Shared schema — coordinate with the incremental-improvement workflow.** The standalone-IU half of
  this schema is co-designed with the incremental session (`docs/incremental-improvement-design.md`);
  this file is the single source of truth, and both halves must agree before either ships.

## Measured calibration — `tokens_per_iu`

The single-agent budget is an **empirical dial**, not folklore. `build` emits **`tokens_per_iu`**
on each unit-complete event (the same event that carries the acceptance evidence), into the
analytics product-outcomes stream. `measure-outcomes` derives the per-sprint distribution and the
**over-budget share** against the harness budget. This does two jobs: it calibrates the budget per
model, and it signals decomposition quality back to `plan` — a persistently high over-budget share
means IUs are being drawn too coarse (the same shape as "weak acceptance is a *plan* gap, not a
*build* gap"). `tokens_per_iu` is a **measured metric**, not a schema field on the IU.

## Example

```yaml
id: auth-jwt-validation
title: JWT validation + structured error surfacing
parent: wi-auth-hardening      # omit for a standalone (incremental) IU
channel: sprint
status: planned
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
acceptance_check:
  - npm test src/middleware/auth.test.ts        # raw output (e.g. "4 passing", exit 0) is the evidence
size: S
```
