---
# identity — native .claude (the builder emits the primitive from these)
id: land
primitive: skill
title: Land
description: Take the built and reconciled change through to a live, health-confirmed deployment. Holds the commit-to-land intake gate (with a pre-merge readiness surface) and the live-confirmed exit gate (consuming deploy's smoke check) — both operator decisions. Owns the revert decision + land→reconcile re-entry; deploy executes the revert. Modes — staging-first (default), prod-direct, staging-only.
when-to-use: A change has cleared the commit-to-land gate (reconcile confirmed spec = reality and the change is ready to ship). Invoked after reconcile in the dev-sprint; also reachable directly when the gate decision is already recorded in the carrier.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
edges:
  invokes:
    - { id: ship }
    - { id: deploy }
    - { id: canary }
  composes-into:
    - { id: dev-sprint,  stage: land }
    - { id: incremental, stage: land }
  references:
    - { id: instrumentation-preamble, load: import }
    - { id: carrier-interface,        load: on-demand }
  precedes:
    - { id: debrief, arc: dev-sprint }
# analytics — the loop
goals:
  - outcome: Every cleared change reaches production (or a confirmed staging deploy) through a sequenced, gated path — not an ad-hoc push.
    metric: Share of changes landing via the ship → deploy sub-arc vs direct push; commit-to-land gate decisions recorded per item.
    earns-keep: Direct-to-main pushes trend to zero; gate decisions are durable in the carrier record for every landed item.
  - outcome: Deploy failures and regressions surface in-session at land, not post-hoc.
    metric: Failures surfaced in-session vs found post-hoc by the operator checking CI independently; MTTR on land-time failures.
    earns-keep: Post-hoc-discovered failures trend to zero over N sprints; revert paths are exercised quickly when triggered.
  - outcome: The live-confirmed exit is always an explicit operator decision, not an assumed automatic transition.
    metric: Share of land exits where the live-confirmed gate is explicitly recorded vs assumed; operator-reported post-land surprises.
    earns-keep: Live-confirmed gate is recorded for every land exit; operator "I didn't know it was live" events reach zero.
status: v0.3.0 — 2026-06-05
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

Read the carrier for context: its `lifecycle_state`, the `commit-to-land`
gate decision already recorded, the prior `transition_history`. You **do not write any carrier
field** (D44). The gates advance `lifecycle_state` and append to `gate_decisions[]` — that is
the gate mechanism's job, not yours. Your completion (and the live-confirmed gate decision) is
what the projection picks up to advance `current_stage` from `land` and to record `shipped →
live` in the carrier.

Consume the carrier through the **carrier-interface** (`graph/_refs/carrier-interface.md`).
You are shared across two arcs, so the carrier is **either** a work-item (`carrier_kind:
work-item`, `arc: dev-sprint`) **or** a standalone IU (`carrier_kind: standalone-iu`, `arc:
incremental`). Read only the common-interface fields freely; read a work-item-only field
(`outcome_link`, `children`, `risk_state`) **behind a `carrier_kind` check** — never assume
work-item fields when `carrier_kind` is `standalone-iu`.

## Incremental arc

When the carrier is a standalone IU (`carrier_kind: standalone-iu`, `arc: incremental`) there
is no upstream `reconcile`/`commit-to-land` from a sprint — the incremental loop has no
reconcile stage. So you **fire your own single `commit-to-land` gate directly**: the carrier
holds no recorded gate yet, so surface it (with the readiness surface above). This one gate
writes the terminal `lifecycle_state` (`landed | parked | dropped`) and appends the
`gate_decisions` entry on the standalone IU — the carrier-lite is its own carrier.

**The dial governs how the gate fires.** A standalone IU has no work-item `tier`, so `slice_type`
+ the harness maturity drive it: for an **AFK** slice in a mature harness, the maturity dial lets
the gate auto-record on green (cheap, still logged); a **HITL** slice raises a hard operator gate.
The gate is always in the model — the record always shows a deliberate land decision.

Then sequence the sub-arc as usual: invoke **ship** (tests → coverage → PR) then **deploy** per
your modes. On a **non-deploying harness**, run `staging-only` / PR-and-merge — the item reaches
`landed` without a prod deploy (the standalone lifecycle folds `live` into the same land gate;
there is no separate `shipped → live` split). Emit your carrier-keyed live-confirmed event
carrying the carrier id + `carrier_kind` + `arc`, so projection keeps the incremental traversal
separate from the sprint's (carrier-interface projection key).

**No debrief.** The incremental arc closes at `land`. A standalone IU has no `outcome_link` to
read back (it `improves` an existing node/reference, it serves no OKR), so there is nothing for
`debrief` to read. The `precedes debrief` edge is the dev-sprint exit only.

## Intake — the commit-to-land gate

Before invoking ship, confirm the **commit-to-land** gate. The gate is not confirmed on
unseen evidence — open it with the readiness surface.

### Pre-merge readiness surface

Surface the freshness of the change's last verification **before** the operator confirms the
gate, so the gate is not confirmed on stale evidence:

1. **Read the most-recent reconcile/review pass** from the carrier's `gate_decisions[]` and
   `transition_history` — which pass last certified the change, and when.
2. **Compute its commit distance from HEAD** — *if* that pass recorded the `head_sha` it
   certified, count commits landed since (`git rev-list --count <head_sha>..HEAD`). Zero
   distance means the certified state is HEAD; a growing distance means HEAD has moved past the
   last verification, and the gate would be confirming stale evidence.
   - **Degrade explicitly when the SHA is absent.** Today review/reconcile do not always record
     the certified `head_sha`, so the distance can be uncomputable. Do **not** fabricate one from
     a timestamp — surface the pass and its time and state "certified SHA not recorded — freshness
     by time only, commit distance unavailable." (The durable fix is review/reconcile emitting a
     verified `head_sha` in their gate record — a separate upstream amendment.)
3. **Surface what you have** to the operator at the gate: "Last reconcile/review pass: `<pass>`
   at `<time>`, `<n>` commits behind HEAD" (or "distance unavailable" per the degrade path).

You **read and surface** this evidence — you do not produce it. `reconcile` and `review` (the
upstream backbone stages, D50) own producing the verification; land surfaces its freshness at
the gate.

**How hard you read the surface is the D45 maturity × tier dial.** A high-tier item, or an
early-maturity process, demands a fresh pass (small or zero distance) before the gate clears;
a routine item in a mature process can clear with a larger distance. The dial sets the bar;
land surfaces the evidence the bar is read against.

### Confirming the gate

1. **Read the carrier's `gate_decisions[]`** for a `commit-to-land` entry. If one is already
   recorded (from the `reconcile` stage), confirm its decision is "cleared" — and still surface
   the readiness evidence above so a stale clearance is visible — then proceed.
2. **If no gate decision is recorded** — the session started here directly or reconcile ran
   without reaching the gate — surface the gate to the operator, with the readiness surface:

   > "Commit-to-land gate. Readiness: last reconcile/review pass `<pass>`, `<n>` commits
   > behind HEAD. Is the built + reconciled change ready to ship? This advances the work-item
   > from `in-delivery` to `shipped`. Confirm to proceed, or return to reconcile if more
   > alignment is needed."

   On confirmation, the gate is recorded. On decline, return to `reconcile` (the re-entry edge is
   wired as `reconcile can-follow land`, declared on reconcile's side — see the seam below — and the
   arc re-entry path is: return to `reconcile` and run its `adjudicate` or `enact` mode as needed).
3. **Do not re-ask an already-recorded gate** — but do still surface the readiness evidence.
   If the carrier shows a cleared commit-to-land decision and the readiness bar (per the dial)
   is met, proceed directly to ship.

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

> "Deploy failed. Options: (a) investigate the pipeline and re-trigger deploy, (b) revert,
> (c) escalate and hold. Which path?"

Do not pick a path automatically. If the operator chooses revert, follow the **revert seam**
below — you own the decision and the re-entry; deploy executes the mechanical revert.

### Step 3 — Consume deploy's smoke check (the live-confirmed signal)

The live-confirmed signal is **deploy's inline smoke check**, not a manual URL open. `deploy`
runs the smoke check in its settle phase (HTTP 200 + console-error scan + content-present +
screenshot) and reports `smoke_health` as part of its output. **You consume that result** —
read `smoke_health` from deploy's output (and the deploy-event, below) and carry it into the
live-confirmed gate. This means the gate cannot fire on a URL that returns 200 but renders a
blank page or throws console errors.

This is a **deploy smoke test, not canary** — single-pass, no baseline, no traffic comparison.
In `staging-only` mode the change is not live, so the live-confirmed gate is deferred (see
Exit); the smoke result still confirms the staging URL is healthy.

### Step 4 — Canary (post-deploy live health, input-gated)

**`canary`** is the third delivery sub-arc step: an autonomous agent that watches the just-shipped
deployment against a **pre-deploy baseline** across consecutive checks and returns a
**HEALTHY / DEGRADED / BROKEN verdict** that feeds the live-confirmed gate. It is the extended
monitoring loop the single-pass smoke check is not. The `invokes canary` edge is **wired**.

Canary is **input-gated on live prod traffic** — built dormant, it activates only when there is a
**real deployment with traffic** to watch (it never fabricates a baseline). So invoke it after a
**`prod-direct` or prod-`staging-first` deploy with live traffic**; for a `staging-only` deploy, or
a pre-launch product with no prod traffic yet, do **not** invoke it — **deploy's inline smoke check
remains the live-confirmed signal**. When canary runs, carry its verdict (alongside deploy's
`smoke_health`) into the live-confirmed gate; when it is dormant, the gate fires on `smoke_health`
alone.

## Exit — the live-confirmed gate

After the deploy settles and deploy's smoke check clears (plus canary's verdict, when live
prod traffic makes canary active — see Step 4):

1. **Surface the live-confirmed gate** to the operator, carrying deploy's `smoke_health` (and
   canary's verdict when it ran):

   > "Live-confirmed gate: the deployment is settled at `<url>`, smoke check `<smoke_health>`
   > (canary `<verdict>`, when active). Is the change confirmed healthy and live? This advances
   > the work-item from `shipped` to `live`."

2. On confirmation: the gate is recorded. The carrier's `lifecycle_state` advances to `live`.
   The projection picks up the stage exit; `current_stage` clears from `land`. The
   **live-confirmed gate outcome** is contributed to the carrier-keyed deploy-event (see The
   deploy-event below) — land does not write a second store.

3. **On decline** (the smoke check failed, or something looks wrong post-deploy): name the
   options — investigate in place, or revert via the revert seam below. Do not auto-revert.

**In `staging-only` mode:** the live-confirmed gate is **deferred** — staging is not live. The
change is in `shipped` state, staged but not yet live. The gate fires in a future `land`
invocation when the prod deploy runs (typically `prod-direct` mode on the same item).

## The deploy-event — you contribute, you do not store (D59)

The delivery signal (merge SHA, deploy URL, mode, status, timing, smoke health, live-confirmed)
is **one event, defined once** for both `deploy` and `land` — homed in the 06-analytics local
event log, **not** a bespoke deploy-report store. The mechanism (D59):

- **`deploy` emits** the deploy outcome — `merge_sha`, `deploy_url`, `mode`, `status`,
  `timing` (merge → live), `smoke_health`, `live_confirmed` — on the **existing carrier-keyed
  `node-exit` event** the instrumentation preamble already fires (exactly as `tokens_per_iu`
  rides the unit-complete event, D57). It lands in the **product-outcomes / deploy stream** of
  the event log.
- **You (land) emit your own carrier-keyed `live-confirmed` event** carrying `live_confirmed`,
  on your node-exit, referencing the deploy by `merge_sha`. The event log is **append-only**
  (per `instrumentation-preamble`) — you do **not** mutate deploy's already-appended row, and you
  do **not** create a second store. The **projection joins** your live-confirmed event with
  deploy's deploy-event by carrier id. The `references instrumentation-preamble` edge
  (`load: import`) single-sources the emit behaviour into you.
- **Current deploy-state is projected** derived-on-read into `.stack-graph/` — never
  hand-written.
- **The recorder freezes** the deploy outcome onto the carrier's closed record at the terminal
  transition (a `frozen_*` field beside `frozen_timeline` / `frozen_metrics`) — the one point a
  derived value enters a committed file.

DORA / MTTR is a derivation **across** carriers' deploy events (the measure-outcomes family),
never a stored aggregate. **D44 holds:** no stage writes the carrier — the preamble emits, the
recorder freezes.

## The revert seam — you decide, deploy executes

Revert is specified **once**, split across the seam with `deploy`:

- **You (land) own the revert DECISION.** When a deploy fails or the live-confirmed gate is
  declined and the operator chooses revert, you surface and own that choice — you do not
  auto-revert.
- **You own the `land → reconcile` re-entry criterion.** Decide whether to return to `reconcile`
  to re-scope the change (the corrective loop) or to act in place. Return to reconcile when the
  failure means the change itself needs rework — re-enter `reconcile` in `adjudicate` mode to
  decide the revert scope, then enact. Act in place when the deploy is broken but the change is
  sound (a pipeline retry, an infra fix). This corrective loop is declared on reconcile's side as
  `reconcile can-follow land` (the canonical model declares corrective `can-follow` on the node
  that re-runs); land holds no `can-follow reconcile` entry.
- **`deploy` owns the EXECUTION.** Once the operator chooses revert, `deploy` offers to perform
  the mechanical revert — `git revert <merge-sha>`, or a revert PR under branch protection
  (deploy C5). You do not run the git commands yourself; you name the decision and the re-entry,
  then the mechanical execution defers to deploy.

**D44 holds:** revert is a git action, not a carrier write — neither node writes the carrier to
revert.

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

- **Pre-merge readiness surface** — most-recent reconcile/review pass + its commit distance
  from HEAD, surfaced at the commit-to-land gate.
- **Commit-to-land gate decision** — confirmed / declined (with return path named).
- **Ship output** — PR URL, test results summary, coverage delta, commit SHA.
- **Deploy output** — deployment URL(s), merge commit SHA, deploy status, and `smoke_health`
  (deploy's inline smoke check, consumed by the live-confirmed gate).
- **Live-confirmed gate decision** — confirmed (with `lifecycle_state = live`) or deferred
  (staging-only) or declined (with the revert seam named).
- **Deploy-event contribution** — the `live_confirmed` gate outcome contributed to the
  carrier-keyed deploy-event (06-analytics product-outcomes/deploy stream); land stores nothing.

If any step fails, land stops at that step and surfaces the failure with the named options.
It does not silently continue or auto-revert.

## Process seams (backbone wiring pass — wave 1c)

The following process edges are wired in the frontmatter (backbone wiring pass, wave 1c):

- **`precedes debrief`** (happy-path exit): land precedes debrief. Wired.
- **`references instrumentation-preamble`** (`load: import`): single-sources the carrier-keyed
  emit. Load-bearing for the deploy-event (D59) — the deploy outcome rides the `node-exit` the
  preamble fires. Wired.
- **`land → reconcile` revert loop**: when a deploy fails or the live-confirmed gate is
  declined and the operator chooses revert, the arc re-enters `reconcile` (the revert *decision*
  + re-entry are land's; the mechanical *execution* defers to `deploy` — see The revert seam).
  This loop is expressed as `reconcile can-follow land` (declared on reconcile's side — the
  canonical model declares corrective `can-follow` on the node that re-runs). `land` itself holds
  no `can-follow reconcile` entry, and the seam is **not** a `references` edge.
- **`invokes canary`** (wired): canary is the third delivery sub-arc step (see Step 4) — the
  inbound invoke is authored here, on land's side; canary declares no inbound edge. It is
  **input-gated on live prod traffic**: built dormant, invoked only when a real deployment with
  traffic exists. Until prod traffic exists, deploy's inline smoke check is the live-confirmed
  signal (see Step 3).
- **`composes-into incremental @land`** (D56): land is shared with the `incremental` arc — it is
  the same primitive, reused, not duplicated. The forward edge `review → land` is declared on
  `review`'s side (review precedes land); land holds no inbound entry for it. See Incremental arc.
- **`references carrier-interface`** (`load: on-demand`): the explicit field-set land reads about
  its carrier, so it serves both the work-item (dev-sprint) and standalone-IU (incremental)
  kinds without assuming work-item-only fields. Wired.
