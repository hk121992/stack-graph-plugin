---
# identity — native .claude (the builder emits the primitive from these)
id: verify
primitive: skill
title: Verify
description: >-
  Orchestrates the verification panel over the running built thing before it lands — dispatches qa
  (browser behaviour), design-review (visual), and simulate-users (AI-agent experience), consolidates
  their verdicts into one ranked finding set, surfaces a single verification gate, and owns the
  corrective loop back to review.
when-to-use: The review span is complete and the built change must be proven against its running behaviour, visuals, and experience before it advances to reconcile.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
# verify mirrors review's dispatch-and-gate shape: invokes its modality family, precedes the next
# stage, carries a corrective can-follow back to review. NOTE: the happy-path `review → verify`
# precedes edge is re-pointed on REVIEW's frontmatter by a separate agent — NOT declared here.
# No `composes-into incremental`: the verify stage is wired into the incremental arc by a later
# pass once it exists there (F7); only the dev-sprint composition is declared now.
edges:
  invokes:
    - { id: qa }
    - { id: design-review }
    - { id: simulate-users }
  composes-into:
    - { id: dev-sprint, stage: verify }
  references:
    - { id: instrumentation-preamble, load: import }
    - { id: findings-schema,          load: import }
  precedes:
    - { id: reconcile }
  can-follow:
    - { id: review }
# analytics — the loop
goals:
  - outcome: Behavioural, visual, and experiential defects are caught against the running build before it lands — not by real users or a later stage.
    metric: Escaped-defect rate for defects a verification modality could observe (broken flow, visual regression, experience gap) traced to a verified change, vs the pre-verify transcript baseline.
    earns-keep: Escaped-defect rate measurably below baseline over N sprints; if verify never lowers it, the stage is cut or restructured.
  - outcome: The verification pass is cheap enough — in wall-clock and operator attention — to run on every material change rather than be skipped.
    metric: verify cycle-time and operator-effort per pass (operator decisions/questions fired; time from invoke to verdict); modality-skip rate when the trigger was met.
    earns-keep: Cost stays low enough that verify is not routinely skipped; trends down or holds as modalities are added.
  - outcome: The consolidated verdict is one actionable signal, not three separate noisy reports the operator must reconcile by hand.
    metric: Signal-to-noise — consolidated findings actioned (fixed or deliberately deferred) vs suppressed at the gate; cross-modality duplicates collapsed per pass.
    earns-keep: The actioned-finding fraction stays high; a rising dismissal rate is the cut/tune signal.
status: v0.1.0 — 2026-06-05
---

# Verify

Orchestrate the verification panel over the **running built thing** before it lands. You own
**orchestration, operator interaction, and routing** — you do **not** perform any verification work
yourself. The modality skills you invoke (`qa` for browser behaviour, `design-review` for visual,
`simulate-users` for AI-agent experience) own that. Your job is to scope the target, run the panel,
consolidate what comes back into one ranked finding set, surface a single verification gate, and
drive the fix-loop to a verdict.

You are a **distinct stage** from `review`, not a mode of it. `review` vets the **diff** — static,
before the build output runs. You vet the **running build** — dynamic behaviour, visuals, and
experience. Different finding source, different modality family, different measured outcome.

## When to invoke

Invoke when the review span is complete and there is a runnable built change to prove before
reconcile — a deployed surface, a local dev server, or a built artefact a persona can be run
through. The operator may pass a mode token (`interactive` / `autofix` / `report-only` / `headless`),
a target (a URL or the running build), and an intent or plan pointer. Default to `interactive` when
no mode is given.

## Phase 1 — Scope the target

Build the **scope bundle** before running the panel:

1. Resolve the target — the running build under verification (a deploy URL, a local URL, or a
   built artefact). If nothing runnable is reachable, surface that to the operator before
   dispatching; a verification pass with no running target produces nothing.
2. Capture the **intent / requirements summary** — what the change is meant to do — from the plan,
   the upstream review verdict, the PR body, or the carrier.
3. Carry forward the **review verdict and triaged findings** so verify does not re-litigate a
   static finding already routed at review; verify adds the *running-behaviour* dimension on top.
4. Mark what is in / out of scope for this verification pass.

The scope bundle (target, intent summary, upstream review context, scope rules) is your first
deliverable into the panel.

## Phase 2 — Run the panel

Select and fan out the verification modalities, each in its own isolated context, in parallel.
Hand each the same scope bundle plus the **finding contract** (the `findings-schema` you import), so
every modality emits to the same contract and the returns consolidate cleanly. Collect each
modality's **compact** finding return — not its full report — to keep your context lean.

- **`qa`** — always run when there is interactive behaviour to exercise (flows, forms, buttons,
  state). Browser-behaviour verification: navigate, interact, verify state, surface broken flows.
- **`design-review`** — run when the change touches a user-facing visual surface. Visual
  verification: hierarchy, spacing, type, contrast, AI-slop, interaction latency.
- **`simulate-users`** — run when there is a built experience whose *intent-match* matters (an
  agentic or conversational product, a multi-step user journey). Runs a persona against the
  experience contract and returns a UX verdict plus an AX profile. It is an autonomous agent: pass
  it its spawn bundle; for its `tier-2` multi-role protocol, you own the role spawns (it cannot
  self-spawn nested agents).

Skipping a modality whose trigger is not met is the default, not a finding — record it in the
coverage note with the unmet trigger. A modality that errors or times out is a **gap**, recorded
as such, never a silent drop.

## Phase 3 — Consolidate and present

Reduce the modality returns to one finding set, deterministically:

- **Deduplicate** across modalities — the same defect surfaced by qa and design-review (e.g. a
  control that is both broken and visually mislabelled) is one finding; union the evidence.
- **Corroborate** — when two modalities independently flag the same region, raise the merged
  finding's confidence; cross-modality agreement is strong signal.
- **Rank** by severity (the factory-wide P0→P3 scale), corroborated findings first within a severity.

Then present (in modes that engage the operator):

- The **ranked actionable findings**, each carrying its severity, `autofix_class`, and `owner`.
- The **soft buckets** — advisory findings, residual risks, and (from `simulate-users`) the AX
  profile and any experience/harness gaps routed as proposals.
- A **coverage note** — which modalities ran, were skipped (with the unmet trigger), or failed.
- A **verification verdict**.

## Phase 4 — Own the fix-loop and the verification gate

Route each actionable finding by its `autofix_class` and `owner` (`safe_auto` apply; `gated_auto`
confirm; `manual` hand to the owner; `advisory` surface only) — the same routing `review` uses.

On a **confirmed defect**, re-enter the correction loop back to `review` / `build` (the
`can-follow review` edge below), then re-run the affected modalities over the corrected build.
Continue until the actionable set is resolved (fixed or deliberately deferred), then issue the
verification verdict and surface the **verification gate**: the running build behaves, looks, and is
experienced as intended, or every residual finding is a logged deliberate deferral. The carrier
write at the gate (advancing `lifecycle_state`, recording the `gate_decision`) is **PM / operator
work** reached *after* you — you surface the gate; you do not write the carrier. Your stage-complete
signal is what the projection reads to advance `current_stage`.

## The corrective loop — `can-follow review`

A confirmed defect at verify re-enters the review→build correction. This `can-follow` edge carries
the required three-part contract:

- **Exit criterion.** The loop terminates when a re-verification pass over the corrected build
  surfaces no new P0/P1 finding of the same kind — i.e. the defect that triggered the re-entry is
  resolved and the modality that caught it now passes. Forward progress to `reconcile` resumes.
- **Max-attempt / escalation policy.** Bound at **2** correction re-entries for the **same defect
  kind on the same surface**. Before a **third** re-entry on the same recurring defect, stop and
  escalate to the operator with a recurring-pattern brief (what was fixed across passes, which
  modality keeps re-failing, what that suggests) — do not silently loop. A defect that survives two
  corrections is a signal the fix is in the wrong place or the spec is wrong, a `reconcile`-level or
  re-plan question, not another build pass.
- **Labelled re-entry.** Tag the re-entry with the modality and defect that triggered it
  (`verify-defect:<modality>:<surface>`) so the traversal record distinguishes a deliberate
  correction from a stuck loop, and `reconcile` / `debrief` can see which modality drove the rework.

NOTE: the happy-path `review → verify` forward edge lives on **review's** frontmatter and is wired
by a separate pass — verify declares only its own corrective `can-follow review` and its forward
`precedes reconcile`.

## Carrier and instrumentation

Read the carrier for context only (the work-item or the standalone IU) — verify writes no carrier
field; entering and completing verify is the projection's signal to advance `current_stage`. Per
the imported `instrumentation-preamble`, emit a **node-enter** event before any scope work and a
**node-exit** event after the verdict, each carrying `node`, `carrier`, `carrier_kind`, and `arc`,
plus the gate touched on exit (`verification-gate:<pass|fail>`). Events are carrier-keyed so the
dev-sprint projection stays separate from any other arc.

## Modes

The differences are purely operator-interaction and mutation policy; every mode runs the same panel
and the same consolidation.

- **interactive (default)** — present findings and walk the fix-loop one finding at a time; apply
  `safe_auto`, confirm `gated_auto`, route `manual`. Honour any modality's HITL pause.
- **autofix** — apply `safe_auto` fixes with no questions; gate everything else for the operator.
- **report-only** — run the panel, present the consolidated verdict and soft buckets, stop; no
  mutations, no fix-loop.
- **headless** — apply `safe_auto` in one pass, return the structured consolidated finding set
  (ranked actionable + soft buckets + coverage note + verdict) with no operator turn.

## Output

- The presented verification: the ranked, routed consolidated finding set, the soft buckets (incl.
  the AX profile and experience proposals from `simulate-users`), the coverage note, and the verdict.
- In mutating modes: the applied `safe_auto` fixes and the fix-loop outcome — confirmed defects
  looped back to review→build with a labelled re-entry, re-verified over the corrected build.
- The **verification gate** surfaced to the operator on a clean or all-deferred verdict, and the
  stage-complete signal the projection reads to move the work to `reconcile`. No carrier write.
