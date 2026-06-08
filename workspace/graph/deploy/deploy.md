---
# identity — native .claude (the builder emits the primitive from these)
id: deploy
primitive: skill
title: Deploy
description: Merge the open PR, trigger the deployment pipeline (staging, preview, or production depending on mode), and wait for the deploy to settle. Invoked by land after ship. Modes — staging-first (default), prod-direct, staging-only.
when-to-use: A pull request is open (ship has completed) and the change is ready to be merged and deployed. Invoked by land; rarely standalone.
# classification — graph lens
mode: collaborative
determinism: generative
# DEPLOY-EVENT (D59): the deploy outcome rides the EXISTING carrier-keyed node-exit event the
# imported instrumentation-preamble fires — a body emit, NOT a new edge or a new store, exactly
# as tokens_per_iu rides unit-complete (D57). Payload + stream + freeze are in the body.
# WIRING-PASS edges (F7 prose): can-follow ship; can-follow land; precedes canary — the neighbour
# nodes do not exist on disk yet; described in body prose, wired in by amend once they exist.
# deploy's relationship to land/canary is precedes/can-follow + prose, NEVER a references edge.
# edges — the graph (scanned from here into the record)
edges:
  invokes:       []
  loads:         []
  references:
    - { id: deploy-config,            load: on-demand }
    - { id: instrumentation-preamble, load: import }
  composes-into: []
  can-follow:    []
  precedes:      []
# analytics — the loop
goals:
  - outcome: Merges and deployments complete without manual intervention in the common case, and failures surface with enough signal to act on.
    metric: Percentage of deploys that complete without operator unblocking (excluding legitimate human-gate holds); failed-deployment recovery time (DORA MTTR — time to restore service, not just re-deploy), derived across carriers' deploy events.
    earns-keep: Unblocked deploy rate above baseline; deploy failure recovery time below baseline over N sprints.
  - outcome: Staging/preview environments reflect the merged change before prod receives it in staging-first mode.
    metric: Staging deploy confirmed before prod pipeline triggers; staging-only deploys confirmed before the session closes.
    earns-keep: No prod deploy in staging-first mode without a prior staging confirmation.
  - outcome: Deploy errors surface to the operator in-session, not post-hoc via CI notifications.
    metric: Deploy failures surfaced in-session vs found post-hoc by the operator checking CI independently.
    earns-keep: Post-hoc-discovered deploy failures trend to zero over N sprints.
status: v0.2.0 — 2026-06-04
---

# Deploy

You are the `deploy` sub-arc — the **second step of the land sequence**, after `ship`.
You receive an open pull request from `ship`, merge it, trigger the deployment pipeline,
and wait for the deployment to settle. You end when the deployment is settled and its
URL is reachable — not when production health is confirmed. Health confirmation is
`canary`'s job (the third step of the land sub-arc, authored in wave 2).

You are **general and harness-agnostic**. The merge tooling, the pipeline trigger
command, the environment URLs, and the deploy timeout are all **harness-supplied** via
the **deploy-config** overlay. The factory names the required field set — read
`deploy-config` (the on-demand reference: `deploy_platform`, `merge_tooling`,
`deploy_command`, `prod_url`, `staging_url`, `health_endpoint`, `branch_protection`,
`merge_queue`, `deploy_timeout`, …); the harness supplies the values via the
`deploy-config` binding. When the overlay is absent or a **required** field is missing,
describe the field the harness must supply and stop — you cannot proceed with assumed
defaults for a pipeline trigger.

You have three **modes** (body branches of this one skill, not separate nodes per D34):
`staging-first` (default), `prod-direct`, and `staging-only`. They differ in which
environments they target and whether they hold for a staging confirmation; the merge step
and pipeline-poll logic are shared across all modes.

The `land` backbone stage sequences the sub-arc: `ship` → `deploy` → `canary`. `land`
invokes you after ship reports its PR URL. The `live-confirmed` gate fires at `land`'s
exit (after deploy and canary both clear) — the gate belongs to `land`, not to you.

## You do not write the carrier

Read the carrier for context — kind-agnostic, reading only the common `commit-to-land` gate decision and
`lifecycle_state` confirm the change was cleared to land before `land` invoked ship,
and ship before you. You do not write any carrier field. Your completion is the signal:
the settled deployment URL is the artefact that `canary` (and `land`) observe as your
output.

## The deploy event (D59)

The deploy outcome is **emitted on the existing carrier-keyed `node-exit` event** the
imported `instrumentation-preamble` already fires at your exit — **not** a new store and
**not** a carrier write. This is the same pattern as `tokens_per_iu` riding the
`unit-complete` event (D57): a body emit on an event that already exists.

When you exit, carry these fields on the node-exit event, into the **product-outcomes /
deploy** stream of the local event log:

- `merge_sha` — the merge commit SHA (Phase 1).
- `deploy_url` — the settled deployment URL.
- `mode` — `auto` | `immediate` | `queued` (the merge path taken in Phase 1).
- `status` — settled | failed | staging-only-complete.
- `timing` — the merge→live duration.
- `smoke_health` — the inline smoke-check result (Phase 3). `land`'s `live-confirmed`
  signal **consumes this** rather than re-opening the URL.

This event carries **deploy's** knowledge only. The **live-confirmed** outcome is **not** a
field you leave for `land` to fill: the event log is **append-only** (per
`instrumentation-preamble`), so no one mutates this row after you emit it. `land` emits its
**own** carrier-keyed live-confirmed event; the projection **joins** the two by carrier id
(`merge_sha`) into the full deploy outcome.

Do **not** write any of this to the carrier file. Current deploy-state is **projected on
read** from the event log into `.stack-graph/`; the **recorder** (debrief's, keyed off
the terminal transition) freezes the deploy outcome onto the carrier's closed record as a
`frozen_*` field, beside `frozen_timeline` / `frozen_metrics` — the one point a derived
value enters a committed file. **DORA/MTTR is a derivation across carriers' deploy
events** (the measure-outcomes family), never a stored aggregate. D44 holds: the preamble
emits, the recorder freezes; no stage writes the carrier.

## Preflight

Before any action, confirm:

1. **Deploy-config validates against the field set.** Resolve the `deploy-config`
   binding and read the values. Check **every required field** the `deploy-config`
   reference names is present and resolvable: `deploy_platform`, `merge_tooling`,
   `deploy_command`, `prod_url`, `branch_protection` (and `staging_url` whenever the
   mode targets staging). **A missing required field is a STOP** — name the field the
   harness must supply and halt; never assume a default for a pipeline trigger. Optional
   fields (`health_endpoint`, `deploy_timeout`, `merge_queue`, `credentials`) take their
   documented defaults when absent.
2. **PR is open and mergeable.** Confirm the PR (received from ship) is open, all
   required checks have passed, and there are no merge conflicts. If the PR is not
   mergeable, surface the blocker to the operator — do not force-merge.
3. **Tooling authenticated.** Confirm PR merge tooling and any deploy CLI are
   authenticated. Abort and surface the auth error if not.

## Phase 1 — Merge the PR

Merging is **irreversible** — confirm with the operator before proceeding:

> "About to merge PR `<url>` into `<target-branch>`. Confirm to proceed."

On confirmation, merge the PR using the harness-configured merge tooling. Use a
**squash-merge** unless the overlay specifies otherwise (squash keeps main clean for a
product that used WIP checkpoint commits during build).

**Immediate merge vs merge queue.** After issuing the merge, detect which path the
platform took:

- **Immediate** — the merge lands now; report the merge commit SHA and proceed.
- **Queued** — when `merge_queue` is set or the merge was issued with `--auto`, the PR
  enters a **merge queue** and lands later, after an additional CI run. Poll the
  **queue** on its own timeout (separate from the Phase-3 pipeline poll; queues routinely
  take several minutes). On queue completion, report the merge commit SHA and proceed.
  If the PR is **dropped from the queue** (a PR ahead introduced a conflict), surface
  this **as a queue-conflict failure, distinct from a CI or deploy failure** — the change
  was never merged; stop and let the operator decide whether to rebase and re-queue.

If the merge fails (e.g. a conflict appeared after preflight, or a required check
fails), surface the error and stop — do not retry automatically. The operator decides
whether to re-run after fixing the conflict or revert to `reconcile`.

## Phase 2 — Trigger the deployment pipeline

Trigger the deployment pipeline using the harness-configured command. Report:

- The pipeline ID or run URL (so the operator can track it independently).
- The target environment(s) this mode deploys to.

If the trigger command fails immediately (non-zero exit, tooling error), surface the
error and stop.

## Phase 3 — Wait for the deploy to settle

Poll the pipeline at a reasonable interval (harness-configured; default 30s) until:

- **Success** — pipeline complete, then run the **inline single-pass smoke check** on
  the environment URL (`health_endpoint` if set, else `/`) before reporting settled:
  **HTTP 200** + **console-error scan** (no critical errors) + **content present** (a
  real page, not a blank or error page) + a **screenshot** as evidence. A 200 on a blank
  error page is **not** a settled deploy. This single-pass check is **deploy's own output
  gate** — distinct from `canary`'s extended monitoring loop (`precedes canary` covers
  that 10-minute baseline watch, not this check). On pass, report the deployment URL and
  the smoke result and proceed to the output.
- **Failure** — pipeline reports an error, the smoke check fails, or the poll times out
  (harness-configured `deploy_timeout`; calibrate per platform — real pipelines vary
  widely, so an aggressive default produces false failures). Surface the failure signal —
  the pipeline run URL, the last status, any error output, the smoke result — to the
  operator. Ask:

  > "Deploy failed. Options: (a) investigate the pipeline and re-trigger, (b) revert
  > the merge, (c) escalate and hold. Which path?"

  Do not pick a path automatically. The **revert decision** is the operator's, and the
  **arc re-entry** (back through `land` → `reconcile`) is `land`'s to surface — you do not
  decide to revert and you write no carrier field (D44). But once the operator chooses
  revert, **offer to execute the mechanical git steps** so the rollback is frictionless:

  - **First get onto the deploy target.** After `gh pr merge`, `<merge-sha>` lives on the
    target branch, but the working tree is often still on the (now-merged) PR branch — a
    `git revert` here can fail or land the rollback on the wrong branch. Fetch and check out
    the target first: `git fetch origin <target>` + `git checkout <target>` + `git pull --ff-only`.
  - If `branch_protection` is **false**: `git revert <merge-sha> --no-edit` + push.
  - If `branch_protection` is **true** (direct push blocked): branch from the target
    (`git checkout -b revert-<short-sha> <target>`), `git revert <merge-sha> --no-edit`, and
    open a **revert-PR** instead of pushing to the target directly.

  Then wait for the revert to deploy before reporting, and report the revert commit (or
  revert-PR) so `land` can re-enter the loop. You execute the git action; `land` /
  `reconcile` own the decision and the re-entry.

## Modes

### `staging-first` (default)

The standard mode for a product with a staging or preview environment.

1. Merge the PR (Phase 1).
2. Trigger the pipeline to staging/preview (Phase 2–3). Wait for settle.
3. Confirm staging is healthy — basic URL reachability check + any harness-configured
   smoke tests on the staging URL. Surface the result.
4. **Hold for operator confirmation** before proceeding to prod:

   > "Staging deploy settled at `<staging-url>`. Confirm to trigger prod deploy."

5. On confirmation, trigger the prod pipeline (Phase 2–3 for prod). Wait for settle.
6. Report prod deployment URL.

If the harness overlay specifies no prod pipeline (staging-only product), behave as
`staging-only` after step 3.

### `prod-direct`

For products with no staging environment or when the operator explicitly opts into
direct prod deploy.

1. Merge the PR (Phase 1).
2. Trigger the prod pipeline directly (Phase 2–3). Wait for settle.
3. Report prod deployment URL.

No staging step. Confirm with the operator before Phase 1 that `prod-direct` is
intentional — this is an irreversible action with no staging checkpoint.

### `staging-only`

For changes that should land on staging/preview but not yet reach prod (e.g. a feature
behind a flag, or a pre-launch product).

1. Merge the PR (Phase 1).
2. Trigger the staging/preview pipeline (Phase 2–3). Wait for settle.
3. Report staging deployment URL.

No prod deploy. Session ends here. The prod deploy is a future `deploy` invocation
(or a `land` re-run with `prod-direct`).

## Output

- **Merge commit SHA**.
- **Pipeline run URL** (for operator tracking).
- **Deployment URL(s)** — staging and/or prod, depending on mode.
- **Deploy status** — settled / failed / staging-only-complete.
- **Inline smoke-check result** — the Phase-3 single-pass health verdict + screenshot.
- In `staging-first` mode: explicit staging-health confirmation before the prod deploy
  triggers.

The durable record of all of this is the **deploy event** (above) — emitted on your
node-exit event, projected on read, frozen at terminal — not a bespoke report file.

If any phase fails, deploy stops at that phase, surfaces the failure, and asks the
operator for a path — it does not silently continue or auto-revert.
