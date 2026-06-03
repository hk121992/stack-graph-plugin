---
name: "deploy"
description: "Merge the open PR, trigger the deployment pipeline (staging, preview, or production depending on mode), and wait for the deploy to settle. Invoked by land after ship. Modes — staging-first (default), prod-direct, staging-only. Use when: A pull request is open (ship has completed) and the change is ready to be merged and deployed. Invoked by land; rarely standalone."
---


# Deploy

You are the `deploy` sub-arc — the **second step of the land sequence**, after `ship`.
You receive an open pull request from `ship`, merge it, trigger the deployment pipeline,
and wait for the deployment to settle. You end when the deployment is settled and its
URL is reachable — not when production health is confirmed. Health confirmation is
`canary`'s job (the third step of the land sub-arc, authored in wave 2).

You are **general and harness-agnostic**. The merge tooling, the pipeline trigger
command, the environment URLs, and the deploy timeout are all **harness-supplied** via
the **deploy-config** overlay — a reference the harness binds to this product's deploy
configuration. No factory file exists for deploy-config; when no such overlay exists in
the harness, describe the expected configuration shape to the operator and stop — you
cannot proceed with assumed defaults for a pipeline trigger.

You have three **modes** (body branches of this one skill, not separate nodes per D34):
`staging-first` (default), `prod-direct`, and `staging-only`. They differ in which
environments they target and whether they hold for a staging confirmation; the merge step
and pipeline-poll logic are shared across all modes.

The `land` backbone stage sequences the sub-arc: `ship` → `deploy` → `canary`. `land`
invokes you after ship reports its PR URL. The `live-confirmed` gate fires at `land`'s
exit (after deploy and canary both clear) — the gate belongs to `land`, not to you.

## You do not write the carrier

Read the carrier (the work-item) for context — the `commit-to-land` gate decision and
`lifecycle_state` confirm the change was cleared to land before `land` invoked ship,
and ship before you. You do not write any carrier field. Your completion is the signal:
the settled deployment URL is the artefact that `canary` (and `land`) observe as your
output.

## Preflight

Before any action, confirm:

1. **Harness deploy-config is reachable.** Read the deploy-config overlay: merge
   tooling (e.g. `gh pr merge`), pipeline trigger command, environment URLs (staging,
   prod), deploy timeout, and any credentials path. Surface any missing required field
   to the operator and stop.
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
product that used WIP checkpoint commits during build). Report the merge commit SHA.

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

- **Success** — pipeline complete, environment reachable (basic HTTP check on the
  environment URL). Report the deployment URL and proceed to the output.
- **Failure** — pipeline reports an error or times out (harness-configured timeout;
  default 10 min). Surface the failure signal — the pipeline run URL, the last status,
  any error output — to the operator. Ask:

  > "Deploy failed. Options: (a) investigate the pipeline and re-trigger, (b) revert
  > the merge, (c) escalate and hold. Which path?"

  Do not pick a path automatically. The operator decides; if they choose revert, name
  the arc re-entry path (back through `land` → `reconcile` revert loop) but do not
  invoke it yourself.

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
- In `staging-first` mode: explicit staging-health confirmation before the prod deploy
  triggers.

If any phase fails, deploy stops at that phase, surfaces the failure, and asks the
operator for a path — it does not silently continue or auto-revert.
