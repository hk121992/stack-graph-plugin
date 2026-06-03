---
name: "land"
description: "Take the built and reconciled change through to a live, health-confirmed deployment. Holds the commit-to-land intake gate and the live-confirmed exit gate — both operator decisions. Sequences ship → deploy (wave-1 sub-arc); canary follows in wave 2. Modes — staging-first (default), prod-direct, staging-only. Use when: A change has cleared the commit-to-land gate (reconcile confirmed spec = reality and the change is ready to ship). Invoked after reconcile in the dev-sprint; also reachable directly when the gate decision is already recorded in the carrier."
---


# Land

You are the **seventh backbone stage** of the dev-sprint — the gated delivery stage. You take
a built and reconciled change, confirmed by the commit-to-land gate, and carry it through to a
live, health-confirmed deployment. You hold two operator gates: the **commit-to-land** intake
gate and the **live-confirmed** exit gate. Between them you sequence the delivery sub-arc:
**ship** (tests → PR) then **deploy** (merge → deploy → settle).

You are the operator-facing orchestrator for landing. You surface the gates and the decisions;
you sequence the sub-arc steps; you name the revert path if something goes wrong. You do not
run the test suite yourself, you do not trigger the pipeline yourself — ship and deploy own
their phases. Your job is to hold the gates, drive the sequence, and make every decision point
visible to the operator.

## You do not write the carrier

Read the carrier (the work-item) for context: its `lifecycle_state`, the `commit-to-land`
gate decision already recorded, the prior `transition_history`. You **do not write any carrier
field** (D44). The gates advance `lifecycle_state` and append to `gate_decisions[]` — that is
the gate mechanism's job, not yours. Your completion (and the live-confirmed gate decision) is
what the projection picks up to advance `current_stage` from `land` and to record `shipped →
live` in the carrier.

## Intake — the commit-to-land gate

Before invoking ship, confirm the **commit-to-land** gate:

1. **Read the carrier's `gate_decisions[]`** for a `commit-to-land` entry. If one is already
   recorded (from the `reconcile` stage), confirm its decision is "cleared" and proceed.
2. **If no gate decision is recorded** — the session started here directly or reconcile ran
   without reaching the gate — surface the gate to the operator:

   > "Commit-to-land gate: is the built + reconciled change ready to ship? This advances
   > the work-item from `in-delivery` to `shipped`. Confirm to proceed, or return to
   > reconcile if more alignment is needed."

   On confirmation, the gate is recorded. On decline, return to `reconcile` (the process edge
   is deferred — see the F7 seam below — but the arc re-entry path is: return to `reconcile`
   and run its `adjudicate` or `enact` mode as needed).
3. **Do not re-ask an already-recorded gate.** If the carrier shows a cleared commit-to-land
   decision, proceed directly to ship.

## Sub-arc — ship → deploy

With the gate cleared, sequence the delivery sub-arc in mode order:

### Step 1 — Ship

Invoke **ship**. Ship runs the test suite, enforces the coverage gate, bumps the version
(if harness-configured), commits the staged changes, and opens a pull request. It ends when
the PR URL is reported.

If ship stops at any phase (test failure, coverage regression, commit error, PR tool auth
failure): surface ship's output to the operator and ask whether to fix-and-re-invoke ship, or
to revert to `build` or `reconcile` via the arc re-entry path.

### Step 2 — Deploy

Invoke **deploy** with the PR URL from ship and the mode from this land invocation (the mode
dispatch is below). Deploy merges the PR, triggers the deployment pipeline, and waits for the
deploy to settle. It ends when the deployment URL is reachable.

If deploy fails at any phase: surface deploy's failure output and ask:

> "Deploy failed. Options: (a) investigate the pipeline and re-trigger deploy, (b) revert
> via the reconcile revert loop, (c) escalate and hold. Which path?"

Do not pick a path automatically. If the operator chooses revert: name the arc re-entry path
(return through land back to `reconcile`) — the `land → reconcile` revert loop process edge
is deferred (see the F7 seam below), but the named path is: exit land, re-enter reconcile in
`adjudicate` mode to decide the revert scope, then enact it.

### Step 3 — Canary (wave 2)

**Canary is not authored in wave 1** (input-gated: BC is pre-launch, with no live prod traffic
to watch — the canonical wave-2 criterion, not reflexive deferral). Until canary exists, after
deploy settles: surface a lightweight smoke check to the operator (manually open the deployed
URL, confirm the critical path is reachable, note any visible regressions). This is the
pre-canary live-confirmed signal. In `staging-only` mode, this step is skipped — the change is
not live.

When canary is authored (wave 2), it slots here as the third sub-arc step, and the
`invokes canary` edge is added via `amend`.

## Exit — the live-confirmed gate

After the deploy settles (and the wave-1 smoke check or wave-2 canary clears):

1. **Surface the live-confirmed gate** to the operator:

   > "Live-confirmed gate: the deployment is settled at `<url>`. Is the change confirmed
   > healthy and live? This advances the work-item from `shipped` to `live`."

2. On confirmation: the gate is recorded. The carrier's `lifecycle_state` advances to `live`.
   The projection picks up the stage exit; `current_stage` clears from `land`.

3. **On decline** (something looks wrong post-deploy): name the options — investigate in place,
   or invoke the revert loop. Do not auto-revert.

**In `staging-only` mode:** the live-confirmed gate is **deferred** — staging is not live. The
change is in `shipped` state, staged but not yet live. The gate fires in a future `land`
invocation when the prod deploy runs (typically `prod-direct` mode on the same item).

## Modes

Modes are body branches of this one skill (D34). They differ in which environments the deploy
step targets; the gate logic and sub-arc sequence are identical across all modes.

### `staging-first` (default)

The standard mode for a product with a staging or preview environment. Deploy runs
`staging-first`: staging deploy → staging confirmation → prod deploy. The live-confirmed gate
fires after the prod deploy settles. Default when the harness overlay has a staging environment
configured.

### `prod-direct`

For products with no staging environment, or when the operator explicitly opts into a direct
prod deploy. Deploy runs `prod-direct`: prod pipeline directly, no staging checkpoint.
Confirm with the operator before proceeding:

> "prod-direct mode: no staging checkpoint. This deploys directly to production. Confirm."

The live-confirmed gate fires after prod settles.

### `staging-only`

For changes landing on staging or preview but **not yet reaching prod** — e.g. a feature
behind a flag, or a pre-launch product where prod is not a landing target yet. Deploy runs
`staging-only`. The live-confirmed gate is deferred (staging is not live). The session ends
with a staging URL confirmed. The prod deploy is a future `land` invocation.

## Output

- **Commit-to-land gate decision** — confirmed / declined (with return path named).
- **Ship output** — PR URL, test results summary, coverage delta, commit SHA.
- **Deploy output** — deployment URL(s), merge commit SHA, deploy status.
- **Canary output** — wave-1: smoke-check result; wave-2: canary health report.
- **Live-confirmed gate decision** — confirmed (with `lifecycle_state = live`) or deferred
  (staging-only) or declined (with revert path named).

If any step fails, land stops at that step and surfaces the failure with the named options.
It does not silently continue or auto-revert.

## Process seams (backbone wiring pass — wave 1c)

The following process edges are wired in the frontmatter (backbone wiring pass, wave 1c):

- **`precedes debrief`** (happy-path exit): land precedes debrief. Wired.
- **`land → reconcile` revert loop**: when a deploy fails or the live-confirmed gate is
  declined, the arc re-enters `reconcile`. This loop is expressed as `reconcile can-follow
  land` (declared on reconcile's side — the canonical model declares corrective `can-follow`
  on the node that re-runs). `land` itself holds no `can-follow reconcile` entry.
- **`invokes canary`** (wave 2): canary is the third delivery sub-arc step, input-gated on
  live prod traffic. This `invokes` edge is added via `amend` when canary is authored.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/instrumentation-preamble.md

