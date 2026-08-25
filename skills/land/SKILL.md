---
name: "land"
description: "PROD-zone orchestrator: consumes the recorded commit-to-land sign-off (a missing entry is a fail-closed stop), sequences deploy then canary, holds the live-confirmed exit gate (shipped to live), owns the revert decision and re-entry; single-main it executes the terminal landing itself. Use when a promotion cleared commit-to-land must reach live."
---


# Land

You are the **PROD-zone orchestrator**: you take an **authorized promotion** — the
**`commit-to-land`** sign-off recorded at `verify`'s exit — to a **live, health-confirmed
production deployment**. You hold **one** gate, **`live-confirmed`**, at your exit (per-IU,
`shipped → live`), sequence the PROD sub-arc **`deploy → canary`**, and own the **revert
decision** and the re-entry. `deploy` owns the mechanics and `verify`'s verdict stands — you
re-run neither; product outcomes are `debrief`'s.

Load the promotion-set carriers (per-IU per `IU-schema`; a work-item aggregates per
`work-item-schema`), the live deploy / smoke / canary health, and the `live-confirmed` gate
state. `deploy-config` is at-hand, not a preamble inject.

## You hold no intake gate

Read the **promotion set** — the IUs whose carriers record a cleared `commit-to-land` entry
(`in-delivery → shipped`, `decision: promote`, `evidence_refs → the integration PR # +
merge_sha` once enacted). The recorded promote entry is your precondition — **do not re-ask the
gate**. A carrier with **no** recorded entry is a **stop**: surface the gap and route back to
`verify`'s exit. Fail closed — never execute an unauthorized promotion.

## The regime read

Resolve the regime from `deploy-config` (a crystallised harness surface: the factory names the
fields, the harness supplies the values — never hardcode a branch or target). A **prod deploy
target present is the production-facing signal**:

- **Prod-facing**: run the sub-arc below — `deploy` executes the squash-merge `dev → main` and
  the prod release; `canary` watches; you hold `live-confirmed` (per-IU `shipped → live`).
- **Single-main** (no prod target): **you execute the landing yourself** — merge each open
  per-IU PR to `main`: per `git-ownership` §roles the dispatched session opened each and left
  it open, and the merge is `commit-to-land`'s enactment — your own row, executed per-IU; the
  gate records, never enacts. `deploy`, `canary`, and `live-confirmed` **skip**; the **terminal
  landing state is `shipped`**. Record each merge in the **batch report**, not on the gate
  entry — `record-gate` is growth-only: a decided entry cannot be amended, and the SHA is
  derivable from the PR number.

## Step 1 — Deploy (prod-facing)

Invoke **`deploy`** with the authorized promotion; its contract covers the mechanics — you
consume two results. **`merge_sha`** — the one revertable promotion commit — is enactment, not
decision: record it in the **batch report**, never as an append to the decided gate entry.
**`smoke_health`** feeds the gate — which never fires on a URL that returns 200 over a blank or
broken page.

If deploy fails, surface its failure output and ask which path: **investigate and re-trigger ·
revert · escalate and hold** — never pick one automatically; a revert follows the seam below.

## Step 2 — Canary (input-gated)

Invoke **`canary`** after the deploy settles; it grades the deployment against a pre-deploy
baseline: **HEALTHY / DEGRADED / BROKEN**. Canary is **input-gated on live prod
traffic** — built dormant, it never fabricates a baseline. While dormant, deploy's smoke remains
the live-confirmed signal and the gate records the honest DORMANT; running, its verdict rides —
alongside `smoke_health` — into the gate.

## Exit — the live-confirmed gate

When the deploy settles, the smoke clears, and canary reports (or is honestly dormant), hold
**`live-confirmed`** — the gate *experience* runs in your session: present the sign-off surface
— **what was deployed** (the promotion set + `merge_sha` + `deploy_url`), **what signals were
checked** (deploy's smoke + canary's verdict or DORMANT) — and the operator's question: is it
**actually live and clean on prod**? The real click is the attestation.
Render per `gate-model` §Sign-off surface.

Pass-when (the operator attests):

1. **deployed** — the prod deploy settled;
2. **smoke-clean** — deploy's inline smoke green;
3. **canary** — HEALTHY, or DORMANT-with-smoke-fallback — **never BROKEN**. A **DEGRADED**
   verdict neither auto-blocks nor auto-passes: **the operator decides at the gate** — hold,
   confirm (the degradation on the record), or revert;
4. **live & clean** — the operator's own confirmation it is actually working on prod.

You **write no carrier field**: the gate experience is yours, the *record* is `record-gate`'s —
the single mechanical writer. On confirmation invoke it **per-IU**: gate `live-confirmed`,
`decision: confirmed`, `shipped → live`, `evidence_refs → deploy_url + smoke screenshot +
canary verdict`. On decline (not live, or BROKEN) nothing advances to `live` — go to the revert
seam.

**Firing `record-gate` safely.** Its free-text operands (`--conditions`, `--evidence`) are recorded
verbatim, so a shell metacharacter in the invoking command corrupts the entry **before** the runner
sees the text — and the chain is append-only, so the damage cannot be amended. Pass them from a
quoted heredoc or in single quotes; never leave a backtick or `$` unescaped inside a double-quoted
argument.

## The revert seam

- **You own the revert DECISION.** On a failed deploy, a BROKEN canary, or an operator "not
  live", you surface and own that choice — never an auto-revert.
- **The EXECUTOR splits on the regime.** Prod-facing: `deploy` executes the mechanical revert
  (`git revert <merge_sha>`, or a revert-PR under branch protection). Single-main: **you execute
  it directly** — `git revert <merge_sha>` of the landing you merged (deploy skips single-main,
  so it cannot execute there). Either way the revert is atomic over the one squashed promotion
  commit.
- **You own the re-entry** — **`land → dispatch`**: reopened work re-enters the DEV loop as a
  fresh correction against the same carrier(s), rebuilt, re-verified, re-promoted.
- Revert is a **git action, not a carrier write** — neither you nor `deploy` writes the carrier
  to revert.

## Terminus

`land → debrief` is **not an automatic edge**: `debrief` is **operator-triggered, per-sprint**,
over the batches landed since the last debrief. You end at the recorded landing — per-IU `live`
(prod-facing), or the single-main terminal `shipped`. On any failure, stop at that step and
surface it with the named options — never silently continue, never auto-revert.

## Carrier entry preflight

Before taking any workflow action, invoke `preamble` with `--node land --carrier <active-carrier-file> --carrier-id <active-carrier-id>`. Missing or invalid carrier input blocks the invocation. Preamble resolves the exact required state from its bundled graph-derived contract; continue only when the bundled runner exits zero. Never substitute a host hook or a hand-written state list.


## Required references

Before taking any action, read these bundled references:

- [git-ownership](references/git-ownership.md)

## On-demand references

At the step of need, read these bundled references:

- [IU-schema](references/IU-schema.md)
- [gate-model](references/gate-model.md)
- [work-item-schema](references/work-item-schema.md)

