---
kind: reference
id: IU-schema
title: Implementation-Unit schema — the plan↔build field contract (two shapes)
description: The field contract for an implementation unit (IU) — a strict oneOf of two shapes. A CHILD IU (channel sprint, has parent) is the work item a plan decomposes a carrier into and build consumes; it is not a carrier. A STANDALONE IU (channel incremental, no parent) is a carrier-lite — it carries its own minimal lifecycle, a single recorded gate, an improves target, and the vertical-slice/testing contract.
status: v0.5.0 — 2026-06-04
---

# Implementation-Unit schema

An **implementation unit (IU)** is the unit of build work — a structured record that carries
intent, boundary, dependencies, and verification criteria from planning through to delivery, so
that `build` can operate autonomously against a well-specified unit. It is **not a scalar task
list entry**.

An IU comes in **two mutually-exclusive shapes — a strict `oneOf`** — sharing a common field set
and discriminated by `parent`/`channel`:

- **Child IU** (`channel: sprint`, **has** `parent`) — the child work item a `plan` session
  decomposes a parent carrier into, and that `build` consumes as its scope. It is **not a
  carrier**: it holds no lifecycle and no gates; those stay the parent work-item carrier's.
- **Standalone IU** (`channel: incremental`, **no** `parent`) — a **carrier-lite** for the
  incremental-improvement workflow (`docs/incremental-improvement-design.md`). It *is* the carrier
  for its own change: it carries a minimal `lifecycle_state`, a single recorded gate, an `improves`
  target, and the vertical-slice/testing contract as invariants.

The two shapes share common fields but each shape **requires** and **forbids** distinct fields (see
Hard exclusions). Validation treats them as separate shapes, not "child fields plus a flag" — there
is **no `standalone:` flag**; `parent`-absent + `channel: incremental` is the discriminator.

An IU is sized to be a **single-agent-implementable unit** — buildable by one fresh agent within
its best-work context budget (see Invariants). That is the decomposition target `plan` aims for and
`build` calibrates against the measured `tokens_per_iu`.

## Common fields (both shapes)

| field | required | meaning |
|---|---|---|
| `id` | yes | Stable slug, unique within its plan (child) or the improvements surface (standalone). Stable across re-plans so references and dependency edges survive revision. |
| `title` | yes | Short human label for the unit (shown on the dashboard / improvements-log card). |
| `goal` | yes | **The intended outcome of this unit** — one sentence, outcome-framed ("so that X is true after build"), not a task description. This is what build is held to. |
| `files` | yes | **Scope boundary** — the files and directories this unit owns. Build does not touch files outside this set without flagging scope expansion to the operator. A narrow, explicit list beats a broad one. |
| `dependencies` | yes (empty if none) | **Other IU `id`s this unit depends on** — the units whose output this unit consumes or assumes. Build uses this list to sequence work and detect when a dependency is unfinished or broken. (Per-shape: child IUs may depend on sibling child IUs; standalone IUs may depend **only** on other standalone IUs.) |
| `acceptance` | yes | **Verification criteria** — what must be true for build to call this unit done. Stated as observable conditions (tests pass, behaviour X holds, endpoint returns Y), not effort ("implement Z"). |
| `acceptance_check` | yes | **The runnable command(s) that prove `acceptance`** — the test/build/diff command `build` executes and whose **raw output** it attaches as the done-evidence (e.g. `npm test src/middleware/auth.test.ts`). `acceptance` is the criteria; `acceptance_check` is what proves them. When no runnable command exists (e.g. a pure-doc change), name the explicit manual verification instead — build still **shows** what it did, never asserts a bare pass. |
| `size` | yes | **Single-agent fit signal** — `XS \| S \| M \| L \| XL`. Estimates whether one fresh agent can build the unit within its best-work context budget (see Invariants). `L`/`XL` read as "probably too big — consider splitting." Calibrated against the measured `tokens_per_iu`. Not a commitment; updated at build if the estimate was wrong. |
| `channel` | yes | `sprint` (child) \| `incremental` (standalone). The discriminator together with `parent`. Drives which dashboard channel renders the unit. |
| `status` | yes | Build-tracking state — `planned \| building \| done \| blocked`. **Lightweight build progress, not carrier lifecycle** (no gates). On a standalone IU this **coexists** with `lifecycle_state` on a different axis (see the standalone fields). |

## Child IU — additional contract (`channel: sprint`, has `parent`)

| field | required | meaning |
|---|---|---|
| `parent` | yes | Parent work-item id. Its presence (with `channel: sprint`) marks the **child** shape. The child lives in the parent carrier's `children[]`; the dashboard renders it as a drill-down under the carrier. |

A child IU **forbids** the carrier-lite fields (`improves`, `lifecycle_state`, `gate_decisions`,
`slice_type`, `verification`). It is **not a carrier** — it holds no lifecycle and no gates; those
stay the parent work-item carrier's. `status` is its only state, and it is build-tracking only.

## Standalone IU — additional contract (`channel: incremental`, no `parent`)

A standalone IU is a **carrier-lite**. It **forbids** `parent`, `children[]`, and any child-IU id
in `dependencies` (its `dependencies` may reference only other standalone IUs). It **requires** the
fields below over the common set:

| field | required | meaning |
|---|---|---|
| `improves` | yes | **The target this slice improves** — a typed pointer to the existing thing the change touches: `{ kind: node \| reference \| handbook-reference \| behaviour, id: <slug-or-path> }`. Because the factory improves *itself*, this is most often a graph node or a `_refs/` reference. Replaces the work-item's `outcome_link` (a standalone IU serves an existing thing, not an OKR). |
| `lifecycle_state` | yes | **Minimal carrier lifecycle** — `proposed → in-delivery → landed → (parked \| dropped)`. Far shorter than the work-item's seven-state lifecycle: no `discovery`/`defined`/`committed` (no front to clear) and no `shipped`/`live` split (a `landed` item that deploys folds `live` into the same land gate). See the writer split in Invariants. |
| `slice_type` | yes | **`AFK \| HITL`** (Pocock). `AFK` = the loop can build → review → land it unattended; `HITL` = it carries a human decision/review point the agent must stop at. The loop **prefers AFK**; a HITL slice names *what* + *where* in `hitl_point`. |
| `hitl_point` | when `slice_type: HITL` | **Where build must stop** — `{ stage, decision }`: the stage the human decision/review falls at and what is decided. **Required when `slice_type: HITL`**, omitted for `AFK`. Without it a HITL slice cannot tell `build` where to pause. |
| `gate_decisions[]` | yes (empty until landed) | The append-only gate log — **same entry shape as the work-item's**: `{seq, hash, gate, decision, owner, timestamp, evidence_refs, confidence}` (`seq` a monotonic 0-based integer; `hash` a content hash of the entry excluding `seq`/`hash`). The loop fires a **single** `commit-to-land` gate; no commit-to-build (there is no plan to commit to). Empty until the slice lands. |
| `verification` | yes | **The vertical-slice proof** — `{ end_to_end: <the complete observable behaviour the slice delivers>, tests: [<the tests that prove that path>] }`. Names the tracer bullets and the end-to-end behaviour they exercise. The structured home for "demoable/verifiable on its own." |

## Invariants

- **Strict `oneOf` — the two shapes are mutually exclusive (R1).** Validation treats child and
  standalone as separate shapes sharing the common fields, not "child fields plus more." Hard
  exclusions, enforced at validate:
  - **Child** (`channel: sprint`, `parent` present) → **forbids** `improves`, `lifecycle_state`,
    `gate_decisions`, `slice_type`, `verification`.
  - **Standalone** (`channel: incremental`, `parent` absent) → **requires** `improves`,
    `lifecycle_state`, `gate_decisions`, `slice_type`, `verification`; **forbids** `parent`,
    `children[]`, and any child-IU id in `dependencies`.
  - `channel: sprint` with no `parent`, or `channel: incremental` with a `parent`, is illegal.
  - **HITL contract.** When `slice_type: HITL`, `hitl_point` (`{stage, decision}`) is **required** —
    the stage + decision `build` pauses on; an `AFK` slice omits it. A HITL slice without
    `hitl_point` fails validate (build would not know where to stop). `hitl_point` is part of the
    carrier interface reused nodes read (see `carrier-interface`).
  - **Staged completeness — the `proposed` stub is valid (R-build).** A standalone IU is scaffolded
    by `triage` at `lifecycle_state: proposed` carrying only **identity** (`id`, `title`), `channel:
    incremental`, `improves`, `lifecycle_state: proposed`, `status: planned`, and an empty
    `gate_decisions[]`. Its **content fields** — `goal`, `files`, `acceptance`, `acceptance_check`,
    `slice_type`, `verification` (+ `hitl_point` when HITL) — are authored by `specify-slice` and are
    **required from `in-delivery` onward**. Validate enforces the full standalone shape once
    `lifecycle_state` is past `proposed`; a `proposed` stub validates against this reduced scaffold.
    (The `improvements-manifest` `slice_type` is therefore null until `specify-slice` tags it.)
- **Child IUs are not carriers (scoped — R1).** A **child** IU does **not** hold carrier
  `lifecycle_state` or `gate_decisions` — those stay the parent carrier's; its `status` is
  build-tracking only. *(This invariant is scoped to the child shape. The standalone shape **is** a
  carrier-lite and deliberately holds both — so the older blanket "the IU is not the carrier" line
  is now false for standalone and has been retired.)*
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

### Standalone-only invariants (the carrier-lite contract)

- **Vertical-slice.** A standalone IU's `goal` + `acceptance` must describe a **complete path**
  that is *demoable or verifiable on its own*. A slice whose acceptance only asserts the shape of
  one layer (a schema exists, a signature is present) with no end-to-end observable behaviour is a
  **horizontal slice** and is **rejected** at `specify-slice` / validate. (Pocock: "a completed
  slice is demoable or verifiable on its own.")
- **Testing.** `acceptance` must include **at least one observable test condition**, and
  `verification` must name the tests that prove the path end-to-end. "Done" = those tests pass
  **and** the slice is independently verifiable. **Effort is never the done signal.** *(How the
  tests are written — one test → one impl → repeat — is `build`'s tracer-bullet inner-loop
  discipline, not a schema field; the schema requires only **that** tests exist and prove the path.)*
- **Single-slice.** A standalone IU has **no `children[]`** and `dependencies` may reference
  **only other standalone IUs** (a small chain), never child-IU ids. If the work decomposes into
  multiple slices that must be sequenced and planned together, it is a **work-item, not a
  standalone IU** — promote it (the light loop never silently grows into a sprint).
- **Three-writers, reduced (R2/R6).** Reuses `work-item-schema`'s discipline at reduced scope:
  - **Lifecycle writers, per state (split explicitly):**
    - `proposed` — **authored** by `triage` at scaffold (workflow state, not gated).
    - `in-delivery` — set by the **build-enter event** (event-driven workflow state, not gated).
    - `landed` / `parked` / `dropped` — **gate-written**: only the terminal transition is written
      by the single `commit-to-land` gate.
  - **`status` is a different axis that coexists** with `lifecycle_state`: `status`
    (`planned/building/done/blocked`) tracks **build progress within the `in-delivery` lifecycle
    state** — `lifecycle_state` is the carrier's coarse position, `status` is the fine-grained
    build tracker inside it.
  - **Author** writes content (`goal`, `files`, `acceptance`, `acceptance_check`, `improves`,
    `slice_type`, `verification`) via `specify-slice`.
  - **`current_stage` is projected** from the event log, **never written** to the file (carrier
    interface; `carrier-interface.md`).
  - **Gate** writes terminal `lifecycle_state` + the `gate_decisions` entry.
  - **No curator** (no dashboard content to maintain) and the **terminal snapshot is OPTIONAL** —
    a standalone IU's history is short and its event log usually still present at close; the harness
    may opt into freezing for parity.

## Measured calibration — `tokens_per_iu`

The single-agent budget is an **empirical dial**, not folklore. `build` emits **`tokens_per_iu`**
on each unit-complete event (the same event that carries the acceptance evidence), into the
analytics product-outcomes stream. `measure-outcomes` derives the per-sprint distribution and the
**over-budget share** against the harness budget. This does two jobs: it calibrates the budget per
model, and it signals decomposition quality back to `plan` — a persistently high over-budget share
means IUs are being drawn too coarse (the same shape as "weak acceptance is a *plan* gap, not a
*build* gap"). `tokens_per_iu` is a **measured metric**, not a schema field on the IU.

## Examples

### Child IU (`channel: sprint`)

```yaml
id: auth-jwt-validation
title: JWT validation + structured error surfacing
parent: wi-auth-hardening      # present ⇒ child shape
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

### Standalone IU (`channel: incremental`, carrier-lite)

A real factory-self-improvement: tighten a lens's confidence anchors and add the missing test.

```yaml
id: lens-correctness-confidence-anchors
title: Calibrate lens-correctness confidence anchors
channel: incremental           # no parent ⇒ standalone shape
status: planned
improves:
  kind: node
  id: lens-correctness
goal: lens-correctness emits calibrated confidence values — a "high" finding means the same evidence bar every run, so review's confidence-gate stops dropping real defects.
files:
  - graph/lens-correctness/lens-correctness.md
  - graph/_refs/confidence-anchors.md
dependencies: []
slice_type: AFK
size: S
acceptance:
  - The confidence-anchors reference defines an evidence bar for each of {high, medium, low} with a concrete example finding at each level.
  - lens-correctness's body cites the anchor reference at the point it assigns confidence (no free-hand confidence).
  - A fixture finding-set run through the dispatch confidence-gate keeps the two seeded real defects and drops the seeded noise — the regression that motivated this slice.
acceptance_check:
  - node graph/_refs/__fixtures__/run-confidence-gate.mjs    # raw output: "2 kept, 3 dropped" — the seeded reduction
verification:
  end_to_end: A seeded finding-set with two true defects + three noise items is reduced by the confidence-gate; the two defects survive, the noise is dropped — proving the anchor change flows through dispatch, not just the doc.
  tests:
    - graph/_refs/__fixtures__/confidence-gate.fixture.md     # the seeded finding-set + expected reduction
lifecycle_state: proposed
gate_decisions: []
```

This is one complete path (reference → node citation → dispatch behaviour → a test that proves the
behaviour), demoable on its own, AFK, no design fork, no decomposition — a textbook standalone IU.

## Related

- `work-item-schema` — the full work-item carrier the child IU is a child of, and whose
  three-kinds-of-state / `gate_decisions` entry shape the standalone shape mirrors at reduced scope.
- `carrier-interface` — the explicit field-set a reused node (`build`/`review`/`land`) may assume
  about "its carrier", abstracting over the two carrier kinds (work-item vs standalone-IU).
