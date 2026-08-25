---
name: "verify"
description: "Batch-verifies the running DEV build after dispatch drains the IU stream. Always-on: the integration-testing floor runs on every batch; verify-procedure only enriches the dynamic panel (qa, design-review, simulate-users, benchmark). Consolidates one ranked verdict, owns the fix-loop, fires commit-to-land. Use when the batch must be proven before promotion."
---


# Verify

Orchestrate the dynamic verification panel over the **running DEV build of the assembled batch** —
after `dispatch` has drained the IU stream onto DEV, before `◇commit-to-land`. You own
**orchestration, judgment, and routing** — the modality nodes you dispatch own the verification
work — and you **fire `◇commit-to-land` at your exit**. `review` vets the static per-IU diff;
you vet the assembled batch running — and never re-litigate a static finding already routed
there.

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

Load the **batch change-set** (the IUs on DEV), the **touched DEV surfaces**, and dev-env health —
strictly runtime-state. The applicable modalities are **not** injected: read them on-demand against
the verify-procedure's surface→modality map.

## Phase 1 — Scope the batch

Build the **scope bundle** before running the panel:

- the resolved **target** — the running DEV build (a deployed dev env, a local server, or a
  preview build); nothing runnable → surface that to the operator before dispatching;
- the **intent / requirements summary** — from the promoted IUs' carriers (goal, acceptance,
  verification) and the batch report;
- the upstream **review verdicts and triaged findings**, carried so no static finding is
  re-litigated;
- the in / out scope marks and the **declared verification expectation** — each promoted IU's
  `verification` field (`end_to_end` + `tests[]`) — the intent you execute against; a deviation
  is noted in the coverage note, never silent.

## Phase 2 — Judge the depth, then run the panel

*Which modalities run, and at what depth,* is **your judgment**, not a trigger-table: a cheap
always-run read of the batch change-set, then only the relevant modalities, gated on
surface-presence. A UI tweak → `design-review` only; a new flow → `qa` + `simulate-users`; a
perf-relevant change → add `benchmark`; a no-surface batch (pure refactor, docs, config) → skip
the dynamic panel — the integration-testing floor still runs.

Fan out the selected modalities in parallel, isolated contexts. Hand each the same scope bundle
plus the **finding contract** (`findings-schema` · `severity-scale` · `confidence-anchors`, held
from the required references), so every modality emits to one contract and the returns
consolidate mechanically; collect the **compact** finding return, not the full report.

- **`qa`** — behaviour: hand it the resolved QA flows and the tier your depth call set.
- **`design-review`** — visual: the user-facing surfaces the batch touched.
- **`simulate-users`** — experience or regression. An **experience** run (`tier-1` / `tier-2`):
  pass its invocation bundle (target, mode, persona, scenario, contract), spread runs across the
  `personas` coverage matrix, and run its `tier-2` multi-role protocol with each role in an
  isolated child context. A **regression** run against a recorded corpus: pass its invocation
  bundle (**target · mode · manifest** — the harness-supplied `checkpoint-manifest`), launched
  from a surface that supports isolated child contexts (the caller owns the workflow); it returns
  a PASS/FAIL/XFAIL/XPASS conformance verdict with the node-exit `simulate-users.pass_rate`.
- **`benchmark`** — perf, **on-demand** for a perf-relevant change only; its baseline-comparison
  regression verdict folds into the same finding set.

Skipping a modality whose trigger is not met is the default, not a finding — record it in the
coverage note with the unmet trigger. A modality that errors or times out is a **coverage
failure**, recorded as such, never a silent drop.

## Phase 3 — The integration-coherence pass

A **batch-scoped** maintainability/architecture read over the assembled tree — the
anti-Frankenstein net for defects no per-IU review could see: cross-IU duplication, inconsistent
patterns for one problem, dead glue, drift from an architecture each IU passed locally,
whole-batch spec coherence. Dispatch `lens-maintainability`
**one altitude up** — its target the integration diff / assembled tree, not one IU's diff —
grounded in the `architecture-doctrine` reference. Findings emit to the same contract and carry
the **integration** class.

The **cross-IU** pass is **conditional**: a single-IU promotion skips it, and under `dispatch`'s
sequential default the batch composes largely by construction, so it runs as a final net —
depth-adjust it like any modality. The always-on floor still runs even then: what is skipped is
the cross-IU coherence read *above* the floor, never verify itself.

## Phase 4 — Consolidate and present

Reduce the modality returns to one finding set — **deduplicate** (one finding per defect across
modalities, evidence unioned), **corroborate** (cross-modality agreement raises the merged
confidence), **rank** (`severity-scale`, P0→P3, corroborated first within a
severity). Then present in the operator's session:

- the **ranked actionable findings**, each carrying its attribution, class, and severity;
- the **soft buckets** — advisory findings, residual risks, and (from `simulate-users`) the AX
  profile and any experience/harness gaps routed as proposals;
- a **coverage note** — modalities run / skipped (with the unmet trigger) / failed, against the
  declared verification expectation;
- the **consolidated verdict** — per-modality plus the integration-coherence result.

## Phase 5 — The batch fix-loop

You **own** the loop; `dispatch` provides the reopen. Every actionable finding carries a
**severity** (the contract's); you derive its **attribution** (which IU, via its DEV commits) and
its **class** from its content — routing judgment, not schema fields; the class routes it:

- **defect** → **reopen** the IU: a fresh `build → review` correction via `dispatch`, scoped to
  the finding, re-merged to DEV, re-verified.
- **below-bar** — a *scored* modality under its declared target — → reopen "raise to target";
  the resolution test is score ≥ target. The `regression` mode's `simulate-users.pass_rate` scores
  here against the manifest's `pass_rate_target`. **Fail-safe: an absent or `BLOCKED`-origin
  `pass_rate` does not resolve score ≥ target** — it is inconclusive, routes to a
  blocked/coverage-failure outcome (the gate is *not* satisfied), never a silent pass across the
  dispatch boundary.
- **integration** → a **corrective slice** over the seam the coherence pass found.
- **spec/design-wrong** (or bound-exceeded) → **escalate to `shape`** — the fix is a front
  decision, never a build patch.
- **gap** → the gap path (Phase 6).

**Bound — two reopens per IU / defect-kind, then verify escalates**: a defect surviving two
corrections signals the fix is in the wrong place or the spec is wrong — a front question, not
another build pass. After each reopen lands, re-run the affected modalities over the corrected
batch. The whole loop lives in the **DEV zone, before the gate** — `◇commit-to-land` sees only the
resolved state (clean or all-deferred), so first-pass yield stays measurable.

## Phase 6 — The gap path: a qualifying gap auto-approves

A **gap** — work the batch needs that no promoted IU covers — is a new IU and runs the full
`build → review → verify` path before promotion. Whether it needs the front is the **3-part
test**: dispatch **`auto-shaper` (cold)** to formalise the gap and test it — **in-scope** (within
the parent's signed intent block) **∧ outcome-necessary** (serves a committed outcome of the
parent's success definition) **∧ decision-completable** (no new design decision).

- **Qualifies (all three)** — invoke **`record-gate`** to write the **`agent-provisional`**
  `commit-to-build` hold (it sets `pending_retro_ratification`). **You are the asserter when you
  dispatched the shaper** — `auto-shaper` returns its qualify result to you and writes nothing;
  its own cold-mode write is the same carve-out, exercised only on a direct cold dispatch with no
  wrapping orchestrator. One path, one writer. The hold is inert until ratified: the gap builds
  AFK (a fresh dispatch) and is **retro-ratified at `◇commit-to-land`** — ratify-or-drop is the
  operator's; auto-approval is never final.
- **Fails in-scope or outcome-necessary** — a genuinely **new WI** for the front.
- **Fails decision-completable** (a design fork) — **escalate to `shape`**.

**Convergence guard:** promote only when the last pass is clean with **no outstanding IU**. If
fresh gaps keep surfacing across passes, the work is under-shaped — escalate to `shape`, never
auto-loop.

## Phase 7 — Open the promotion and fire the gate

When the batch is resolved (verify clean, or every residual finding a logged deliberate deferral):

1. **Open the promotion object.** Prod-facing: open the **one integration PR (DEV→main)** over the
   assembled batch, CI-green — your row in `git-ownership` §roles.
   Single-main: there is no integration PR — surface the **open per-IU PRs against `main`**: per
   `git-ownership` §roles the dispatched session opened each and left it open; the merge waits
   for the gate's enactment (step 4).
2. **Fire `◇commit-to-land` in the operator's session.** The gate experience is yours: present the
   sign-off surface — the integration PR (number, diff stat, CI checks) or the per-IU PRs, the
   consolidated verdict with the **integration-coherence result leading** (the operator attests
   coherence, not code), the coverage note against the declared expectation, and **every pending
   retro-ratification listed for ratify-or-drop**. The operator's real click is the attestation.
   Render per `gate-model` §Sign-off surface — widget-first from the harness's gate template,
   native operator-confirmation fallback, never free prose.
3. **On the go, invoke `record-gate` per promoted IU** —
   `commit-to-land`, `decision: promote`, advancing `in-delivery → shipped`, `evidence_refs` → the
   PR number(s). The gate entry records the **decision** and its join key; the **enactment** — the
   merge SHA — is not recorded here and is never appended later: `record-gate` is growth-only, and
   the SHA is derivable from the PR number. It lands in the batch report (and in git, and on the
   PR). The
   retro-ratification entries (operator-attested, clearing each flag) land here too; `record-gate`'s
   guard rejects the promotion while any is unresolved.
4. **Firing is not merging.** The merge to the landed line is the **gate's enactment**, executed
   downstream — by `deploy` (prod-facing) or by `land` (single-main). Request-changes → back into
   the fix-loop; the promotion object stays open; nothing promoted.

You write no carrier field and no gate record yourself — `record-gate` is the single writer; you
hold the gate experience.

**Firing `record-gate` safely.** Its free-text operands (`--conditions`, `--evidence`) are recorded
verbatim, so a shell metacharacter in the invoking command corrupts the entry **before** the runner
sees the text — and the chain is append-only, so the damage cannot be amended. Pass them from a
quoted heredoc or in single quotes; never leave a backtick or `$` unescaped inside a double-quoted
argument.

## Carrier entry preflight

Before taking any workflow action, invoke `preamble` with `--node verify --carrier <active-carrier-file> --carrier-id <active-carrier-id>`. Missing or invalid carrier input blocks the invocation. Preamble resolves the exact required state from its bundled graph-derived contract; continue only when the bundled runner exits zero. Never substitute a host hook or a hand-written state list.


## Required references

Before taking any action, read these bundled references:

- [confidence-anchors](references/confidence-anchors.md)
- [findings-schema](references/findings-schema.md)
- [severity-scale](references/severity-scale.md)

## On-demand references

At the step of need, read these bundled references:

- [architecture-doctrine](references/architecture-doctrine.md)
- [gate-model](references/gate-model.md)
- [git-ownership](references/git-ownership.md)

