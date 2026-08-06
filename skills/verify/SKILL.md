---
name: "verify"
description: "The batch verification stage over the assembled DEV surfaces — after dispatch drains the IU stream, before the promotion gate. Runs the crystallised verify-procedure over the running DEV build, depth-adjusted by judgment: dispatches qa (behaviour), design-review (visual), and simulate-users (experience) — plus benchmark for a perf-relevant change — runs the batch integration-coherence pass, consolidates one ranked verdict, owns the batch fix-loop (reopen via dispatch), opens the integration PR, and fires commit-to-land at its exit. Use when dispatch has handed over the assembled batch and the running build must be proven before promotion."
---


# Verify

Orchestrate the dynamic verification panel over the **running DEV build of the assembled batch** —
after `dispatch` has drained the IU stream onto DEV, before `◇commit-to-land`. You own
**orchestration, judgment, and routing** — you do **not** perform any verification work yourself.
The modality nodes you dispatch (`qa` for behaviour, `design-review` for visual, `simulate-users`
for experience — plus `benchmark` for a perf-relevant change) own that. Your job is to scope the
batch, run the panel at the right depth, run the batch integration-coherence pass, consolidate what
comes back into one ranked verdict, drive the batch fix-loop to a resolved state, open the
integration PR, and **fire `◇commit-to-land` at your exit**.

You are a **distinct stage** from `review`, not a mode of it. `review` vets the **diff** — static,
per-IU, before its merge. You vet the **running build of the assembled batch** — dynamic behaviour,
visuals, experience, and cross-IU coherence. Different finding source, different modality family,
different measured outcome. You add the running-behaviour dimension on top of the upstream review
verdicts; you never re-litigate a static finding already routed at review.

## When to run

Run once `dispatch` has handed over the assembled batch — the DEV state (prod-facing) or the open
per-IU PRs against `main` (single-main) — with the batch report and the integration dry-run
evidence. **Verify is always-on**: every batch runs at least the **mandatory integration-testing
floor** — the assembled-tree acceptance / integration-coherence pass that answers *does the assembled
WI work as a whole?* — before `◇commit-to-land`, even a single-IU batch. So verify always reaches its
exit and **always fires the gate**; there is no verify-off path and the terminal landing gate can
never be orphaned. The crystallised **verify-procedure** is **enrichment, not the on/off switch**: it
carries the product's dev surfaces, QA flows, suites, personas, and the surface→modality map, and its
**presence declares which dynamic modalities to add ABOVE the floor** (absence = floor-only, never a
skip). Verify proceeds in both regimes, over the dev env (prod-facing) or preview/local (single-main).

At turn 1, load your live state through the parameterized preamble: the **batch change-set** (the
IUs on DEV), the **touched DEV surfaces**, and dev-env health — strictly runtime-state. The
applicable modalities are **not** injected: read them on-demand against the verify-procedure's
surface→modality map.

## Phase 1 — Scope the batch

Build the **scope bundle** before running the panel:

1. Resolve the target — the running DEV build of the assembled batch (a deployed dev env, a local
   dev server, or a preview build). If nothing runnable is reachable, surface that to the operator
   before dispatching; a verification pass with no running target produces nothing.
2. Capture the **intent / requirements summary** — what the batch is meant to do — from the
   promoted IUs' carriers (goal, acceptance, verification) and the batch report.
3. Carry forward the **review verdicts and triaged findings** so you do not re-litigate a static
   finding already routed at review.
4. Mark what is in / out of scope for this pass, and read the **declared verification expectation** —
   each promoted IU's `verification` field (`end_to_end` + `tests[]`, judged at `◇commit-to-build`) —
   the intent you execute against; a deviation is noted in the coverage note, never silent.

## Phase 2 — Judge the depth, then run the panel

*Which modalities run, and at what depth,* is **your judgment**, not a trigger-table: a cheap
always-run read of the batch change-set, then run only the relevant modalities, gated on
surface-presence — the same gradient `shape` runs (`routing-principles` §2), one layer out. The
guidance, not a script:

- a UI tweak → `design-review` only; a new flow → `qa` + `simulate-users`; a perf-relevant change
  (load path, bundle, query shape) → add `benchmark`; a no-surface batch (pure refactor, docs,
  config) → skip the dynamic panel — review's tests cover it; the integration-testing floor still runs.
- when in doubt on a borderline surface, run the modality and say so in the coverage note; the
  judgment sharpens over time via the trace.

Fan out the selected modalities, each in its own isolated context, in parallel. Hand each the same
scope bundle plus the **finding contract** (the imported `findings-schema` with `severity-scale`
and `confidence-anchors`), so every modality emits to one contract and the returns consolidate
mechanically. Collect each modality's **compact** finding return — not its full report.

- **`qa`** — behaviour: exercises the resolved QA flows (from the verify-procedure) end to end,
  then the systematic per-page checklist, fixing what it can in-pass. Hand it the resolved flows
  and the tier your depth call set.
- **`design-review`** — visual: hierarchy, spacing, type, contrast, interaction latency, on the
  user-facing surfaces the batch touched.
- **`simulate-users`** — experience or regression: for an **experience** run (`tier-1` / `tier-2`)
  a persona through the running product against the experience-contract, returning a UX verdict + AX
  profile — pass its spawn bundle (target, mode, persona, scenario, contract), select personas and
  spread runs across the `personas` coverage matrix, and for its `tier-2` multi-role protocol you own
  the role spawns (it cannot self-spawn). For a **regression** run against a recorded corpus, pass its
  spawn bundle (**target · mode · manifest** — the harness-supplied `checkpoint-manifest`); the caller
  owns the Workflow, so you launch it from an interactive/cloud surface (it cannot self-spawn), and it
  returns a PASS/FAIL/XFAIL/XPASS conformance verdict with the node-exit `simulate-users.pass_rate`.
- **`benchmark`** — perf, **on-demand**: invoke only for a perf-relevant change; it compares the
  page against its stored baseline and returns a regression verdict that folds into the same
  finding set.

Skipping a modality whose trigger is not met is the default, not a finding — record it in the
coverage note with the unmet trigger. A modality that errors or times out is a **coverage
failure**, recorded as such, never a silent drop.

## Phase 3 — The integration-coherence pass

A **batch-scoped** maintainability/architecture read over the assembled tree — the
anti-Frankenstein net for defects no per-IU review could see: cross-IU duplication, inconsistent
patterns for one problem, dead glue and orphaned hooks, the assembled whole drifting from an
architecture each IU passed locally, whole-batch spec coherence.

Dispatch `lens-maintainability` **one altitude up** — its target the integration diff / assembled
tree, not one IU's diff — grounded in the `architecture-doctrine` reference (depth, seams, the
deletion test). Findings emit to the same contract and carry the **integration** class.

The **cross-IU** pass is **conditional**: a single-IU promotion skips it, and under `dispatch`'s
sequential default the batch composes largely by construction, so it runs as a final net —
depth-adjust it like any modality. The always-on integration-testing floor still runs even then:
what a single-IU promotion skips is the cross-IU coherence read *above* the floor, never verify
itself.

## Phase 4 — Consolidate and present

Reduce the modality returns to one finding set, deterministically:

- **Deduplicate** across modalities — the same defect surfaced by qa and design-review (e.g. a
  control that is both broken and visually mislabelled) is one finding; union the evidence.
- **Corroborate** — when two modalities independently flag the same region, raise the merged
  finding's confidence; cross-modality agreement is strong signal.
- **Rank** by severity (`severity-scale`, P0→P3), corroborated findings first within a severity.

Then present in the operator's session:

- The **ranked actionable findings**, each carrying its attribution, class, and severity.
- The **soft buckets** — advisory findings, residual risks, and (from `simulate-users`) the AX
  profile and any experience/harness gaps routed as proposals.
- A **coverage note** — which modalities ran, were skipped (with the unmet trigger), or failed,
  against the declared verification expectation.
- The **consolidated verdict** — per-modality plus the integration-coherence result.

## Phase 5 — The batch fix-loop

You **own** the loop; `dispatch` provides the reopen. Every actionable finding carries a **severity** (the
contract's); you derive its **attribution** (which IU, via its DEV commits) and its **class** from
its content — the fields below are your routing judgment, not schema fields — and the class
routes it:

- **defect** → **reopen** the IU: re-dispatch a fresh `build → review` correction via `dispatch`,
  scoped to the finding, re-merged to DEV, re-verified.
- **below-bar** — a *scored* modality under its declared target — → reopen "raise to target";
  the resolution test is score ≥ target. The `regression` mode's `simulate-users.pass_rate` scores
  here against the manifest's `pass_rate_target`: a real rate below target reopens "raise to target"
  (no new class). **Fail-safe: an absent or `BLOCKED`-origin `pass_rate` does not resolve score ≥
  target** — it is inconclusive, routes to a blocked/coverage-failure outcome (the gate is *not*
  satisfied), never a silent pass across the dispatch boundary.
- **integration** → a **corrective slice** over the seam the coherence pass found.
- **spec/design-wrong** (or bound-exceeded) → **escalate to `shape`** — the built change surfaced
  a wrong spec or design; the fix is a front decision, never a build patch.
- **gap** → the gap path (Phase 6).

**Bound: 2 reopens per IU / defect-kind — then escalate.** A defect that survives two corrections
is a signal the fix is in the wrong place or the spec is wrong — a front question, not another
build pass. After each reopen lands, re-run the affected modalities over the corrected batch.

The whole loop lives in the **DEV zone, before the gate** — `◇commit-to-land` sees only the
resolved state (clean or all-deferred); every escalation is a backward transition *before* the
gate, so first-pass yield stays measurable.

## Phase 6 — The gap path: a qualifying gap auto-approves

A **gap** — work the batch needs that no promoted IU covers — is a new IU, and it runs the full
`build → review → verify` path before promotion. Whether it needs the front is the **3-part
test**: dispatch **`auto-shaper` (cold)** to formalise the gap and test it — **in-scope** (within
the parent's signed intent block) **∧ outcome-necessary** (serves a committed outcome of the
parent's success definition) **∧ decision-completable** (no new design decision).

- **Qualifies (all three)** — dispatch the **`record-gate` runner**
  (`${CLAUDE_PLUGIN_ROOT}/scripts/record-gate/record-gate.ts`) to write the **`agent-provisional`**
  `commit-to-build` hold (it sets `pending_retro_ratification`). **You are the asserter when you
  dispatched the shaper** — `auto-shaper` returns its qualify result to you and writes nothing;
  its own cold-mode write is the same carve-out, exercised only on a direct cold dispatch with no
  wrapping orchestrator. One path, one writer. The hold is inert until ratified: the gap builds AFK (a fresh dispatch) and is
  **retro-ratified at `◇commit-to-land`** — the operator ratifies or drops it there; auto-approval
  is never final.
- **Fails in-scope or outcome-necessary** — a genuinely **new WI** for the front.
- **Fails decision-completable** (a design fork) — **escalate to `shape`**.

**Convergence guard:** promote only when the last pass is clean with **no outstanding IU**. If
fresh gaps keep surfacing across passes, the work is under-shaped — escalate to `shape`, never
auto-loop.

## Phase 7 — Open the promotion and fire the gate

When the batch is resolved (verify clean, or every residual finding a logged deliberate deferral):

1. **Open the promotion object.** Prod-facing: open the **one integration PR (DEV→main)** over the
   assembled batch, CI-green. Single-main: there is no integration PR — surface the **open per-IU
   PRs against `main`** (`dispatch` opened them and left them open).
2. **Fire `◇commit-to-land` in the operator's session.** The gate experience is yours: present the
   sign-off surface — the integration PR (number, diff stat, CI checks) or the per-IU PRs, the
   consolidated verdict with the **integration-coherence result leading** (the operator attests
   coherence, not code), the coverage note against the declared expectation, and **every pending
   retro-ratification listed for ratify-or-drop**. The operator's real click is the attestation.
   Render per `gate-model` §Sign-off surface — widget-first from the harness's gate template,
   `AskUserQuestion` fallback, never free prose.
3. **On the go, dispatch the `record-gate` runner
   (`${CLAUDE_PLUGIN_ROOT}/scripts/record-gate/record-gate.ts`) per promoted IU** —
   `commit-to-land`, `decision: promote`, advancing `in-delivery → shipped`, `evidence_refs` → the
   PR number(s) (the merge SHA lands with `land`'s enactment evidence — a follow-up append once the
   merge is real). The
   retro-ratification entries (operator-attested, clearing each flag) land here too; `record-gate`'s
   guard rejects the promotion while any is unresolved.
4. **Firing is not merging.** The merge to the landed line is the **gate's enactment**, executed
   downstream — by `deploy` (prod-facing) or by `land` (single-main). Request-changes → back into
   the fix-loop; the promotion object stays open; nothing promoted.

You write no carrier field and no gate record yourself — `record-gate` is the single writer; you
hold the gate experience.

## Output

- The **consolidated, ranked verdict** over the DEV surfaces — per-modality plus the
  integration-coherence result — with the soft buckets and the coverage note.
- The **batch fix-loop outcome** — reopens dispatched and re-verified, gaps formalised or routed,
  escalations handed to `shape`, the resolved state the gate sees.
- The **integration PR (DEV→main)** opened CI-green — or the per-IU PRs surfaced (single-main).
- **`◇commit-to-land` fired** in the operator's session, with the per-IU records enacted through
  `record-gate` on the operator's go. No carrier field written by you; no merge performed by you —
  the merge is the gate's enactment, executed downstream.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/confidence-anchors.md
@references/findings-schema.md
@references/severity-scale.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/architecture-doctrine.md` — `architecture-doctrine`
- `references/gate-model.md` — `gate-model`

