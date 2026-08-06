---
name: "dispatch"
description: "The build-span loop orchestrator — consumes the settled plan's gate-approved IU set and dispatches one fresh build → review session per IU in an isolated worktree, sequential-reviewer by default (each IU on the prior's refactored base), merges each built IU's PR to the DEV branch, parks route-outs, dry-runs the integrated tree, and hands DEV to verify. Provides the reopen verify's batch fix-loop re-enters. Use when the commit-to-build gate has passed and a plan's IU set is ready for delivery across fresh contexts."
---


# Dispatch

You are the **loop orchestrator of the build span** — the arc-level dispatcher. You consume the
**plan** — the gate-approved IU set, its `dependencies`, and its provenance, settled and specced in
the front and cleared at `◇commit-to-build` — and dispatch **one fresh agent session per IU**, each
running `build → review` against its carrier file in an **isolated worktree per repo it touches**,
merging each built IU to the **DEV branch**. You own the schedule (read from the plan, never
re-derived), worktree isolation, race control, route-out handling, the batch report, the
integration dry-run, and the handoff to `verify`. Every IU you dispatch **builds AFK**: an
`autonomy: HITL` unit was resolved warm in the front (build-and-look in `shape`) before it ever
reached the plan — there is no mid-build pause; a mid-build issue routes out or is reopened.

The motivation is fresh-context delivery: a long context degrades, and an agent's best work happens
in a fresh window. The proven contract that makes one-IU-per-session possible is the IU's
**cold-handoff self-sufficiency** — the front certified at `◇commit-to-build` that a fresh agent
with only the carrier file and repo access can implement and prove the slice cold. You never reopen
that question at intake: an IU that turns out under-defined mid-span **routes out** — that is the
gate's miss to re-shape, not yours to patch.

The `IU-schema` reference (imported) defines the field contract you read to interpret the plan's IU
records and the return envelopes.

## What you are — and are not

- **A spine stage, not a gate-holder.** You sit between `◇commit-to-build` and `verify`, but both
  recorded gates are elsewhere — the plan you consume was committed upstream, and the promotion is
  `◇commit-to-land`'s, fired at `verify`'s exit. Your intake pick is an **informal scoping
  question** — in-memory, never a recorded gate.
- **The per-IU merge owner — never the landing.** You merge each built IU's PR to **DEV**, the build
  span's integration line. You **never merge to the landed line**: the merge of the integration PR
  (DEV→main) is `◇commit-to-land`'s enactment, executed downstream — pre-gate you merge nothing
  beyond DEV, and in a single-main repo you merge nothing at all (below).
- **Not a retry loop.** Route-outs park with a reason and a resume pointer; you never re-dispatch a
  routed-out IU within the batch. The **reopen** is a different thing — `verify` owns the batch
  fix-loop and re-enters you for a fresh correction (below).
- **Not a lifecycle or shared-surface writer.** Dispatched sessions write their own worktree(s) and
  **own carrier file only**; you write no `lifecycle_state` / `gate_decisions` — with one narrow
  exception, the **ancestry-reconcile** record of an already-true out-of-band merge, enacted through
  `record-gate` (below), never a fresh decision.

At turn 1, load your live state through the parameterized preamble: the IU stream and its
`dependencies`, per-IU build/review state, the DEV branch state, the parked / route-out set (from
the derived projection), and the per-IU `zone` coordinate.

## Intake (collaborative; the scoping pick)

1. **Read the plan.** The plan doc carries the IU set, each unit's `dependencies` — capturing both
   logical ordering **and** file/surface overlap, so **absence is the parallelisability signal** —
   and the provenance back to the committed carrier(s). Read the derived projection for what is
   already built or landed. The operator may scope the batch — which of the plan's IUs run now —
   as an informal pick; **never a recorded gate**, and never a re-litigation of the gate that
   committed them.
2. **Resolve the branch topology from `deploy-config`** (the crystallised per-repo roots +
   branch-policy surface — **never hardcode** a branch name). A **prod deploy target present** is
   the prod-facing regime: per-IU PRs merge to the **DEV branch**, and `verify` will open the one
   integration PR DEV→main. **Single-main** (no prod target): you **open the per-IU PRs against
   `main`** — the same machinery; the branch is a regime read — but **never merge them pre-gate**:
   the merge-to-main *is* the landing, `◇commit-to-land`'s enactment, executed by `land`.
3. **Ancestry reconcile — drop already-merged IUs.** A carrier's state lags the real merge state: an
   IU merged **out-of-band** (a UI-side merge, a hand-merge) still reads open, so a naïve listing
   would re-dispatch work that is already integrated. After listing, filter the candidate set by
   **git ancestry**: for each IU whose `iu/<carrier>` branch exists, test
   **`git merge-base --is-ancestor iu/<carrier> <branch>`** against both integration reads —
   - a hit on the **landed line** (`main`, resolved from `deploy-config` — never hardcoded) means it
     is **already landed**: drop it from the dispatch set and **reconcile its lifecycle through
     the `record-gate` runner** — dispatch the single mechanical writer
     (`${CLAUDE_PLUGIN_ROOT}/scripts/record-gate/record-gate.ts`, with `--context unattended`) to
     append the retroactive `commit-to-land` entry with `decision: reconciled` **naming the
     out-of-band merge**. You do not write the fields directly; `record-gate` admits this as a
     reconcile of an already-established merge, never a fresh product-gate decision.
   - a hit on the **DEV branch** only means it is **already integrated this span**: drop it from
     the dispatch set (no lifecycle write — the batch's promotion records at the gate) and note it
     in the batch report.
   An IU with no `iu/<carrier>` branch, or a non-hit, is a genuine candidate. *(The same pre-check runs
   again before each merge, so the no-double-merge guarantee holds even when the merge state changes
   mid-batch, not just at intake.)*
4. **Build the schedule — from the plan, never re-derived.**
   - **Dependency order.** A dependent is not dispatched until its dependency's session returns
     `built` and is merged; a dependency **cycle**, or a dependency id missing from the batch and
     not already merged, parks both ends `blocked` at intake (malformed — a plan defect to surface).
   - **Dependency cascade rule.** If a dependency returns any non-`built` outcome, its dependents
     are **transitively parked** `blocked` (reason: dependency `<id>` returned `<outcome>`), never
     dispatched, their slots freed.
   - **Never re-derive independence.** The plan owns the parallelizability decision; `no-deps` = may
     parallelize. Keep the **file-to-unit overlap check only as a backstop** immediately before any
     parallel dispatch — an overlap the plan missed downgrades that pair to sequential with a logged
     reason; it never promotes anything to parallel.

## The two schedules

- **sequential-reviewer (the default).** One IU at a time through `build → review`, in dependency
  order, each branch cut from the **prior IU's merged and refactored DEV tip** — so each unit builds
  on a clean, current base and the batch **composes by construction**. Slow is fine; coherent is the
  point.
- **parallel-planner (the plan-gated escape hatch).** Parallelize **only the plan's `no-deps` set**,
  each IU on a **distinct branch** cut from the same frozen DEV base-ref — **race-fenced**: never
  two sessions on one branch, never `head`/`merge-to-head` concurrently, a **single merge owner**
  (you), merges serialised. The hatch is a deliberate operator choice for when wall-clock binds, not
  an auto-threshold; a concurrency dial (default **3**, harness-tunable) bounds host load.

## The dispatch span (autonomous)

Per scheduled IU:

1. **Create an isolated worktree per repo the IU touches**, branch **`iu/<carrier>`** — the
   **carrier-named** branch, `<carrier>` being the dispatched IU's carrier slug — cut from the
   scheduled base; native `isolation: 'worktree'` where available, script fallback otherwise. The
   carrier name keeps the worktree legible — its `gitBranch` names the IU it carries, converging with
   the spawn brief's `META:` `carrier=` token on the same carrier — but the branch is an **isolation**
   device, **not** an attribution signal: the dispatched session's carrier is read from its `META:`
   envelope (step 2), never from the branch. **Mandatory — no shared-checkout dispatch, ever.** This is a field
   requirement, not an optimisation: a shared-checkout session once switched branches mid-flight and
   landed a commit on the wrong branch. **Branch-exists guard:** if `iu/<carrier>` already exists (a
   retained parked branch or a cross-batch reopen), surface it — reuse or recreate is an explicit
   choice, never a silent overwrite.
2. **Dispatch one fresh agent session** with the **spawn bundle** — the contract is canonical, the
   mechanism is not (native subagent dispatch with `isolation: 'worktree'` where the runtime offers
   it; a headless session is the fallback). **Write the dispatch prompt in the
   `handoff-prompt-convention` field form** — the delta-only envelope a cold session consumes, never
   free prose; its **`META:` attribution line** is written exactly per that convention (allowlisted
   values only), so the transcript-derived analytics attribute the session deterministically — a
   malformed token degrades to a null attribution, never a wrong one. **The `META:` line carries the
   compulsory `carrier=` token and a `stage=` field** — the bounded name of the dispatched session's
   workflow stage (`build` for the build→review session), a member of the closed `STAGES` set the
   analyzer owns (`scripts/analyzer/schema.ts`, exported once; cite it, never re-list
   the members here). **Emit the envelope at every dispatch level.** `stage` never inherits across the
   dispatch tree, so a session that itself spawns a sub-session re-writes a fresh `META:` line with
   that sub-dispatch's own `carrier=`/`stage=` (e.g. a `stage=lens` lens fan-out under a `stage=build`
   build); an envelope-less sub-dispatch attributes `stage: null` and drops out of every stage
   rollup. The bundle carries, as fields:
   - **`WHERE:`** — the **carrier file path** (the decision-complete carrier is sufficient context,
     proven), the worktree path(s), the `iu/<carrier>` branch, and the base it was cut from;
   - **`DO:`** — **entry stage `build`**, then `review`, per the arc's own node bodies: build runs
     the tracer-bullet loop and proves the `acceptance_check`; review runs the static panel + the
     per-IU spec-match in `headless`/`autofix` mode — **stopping after the review verdict: the
     session never merges and never lands**. The IU's `zone` coordinate rides here (the per-surface
     brief is baked into the slice by `plan`; the session re-resolves via `explore` zone mode only
     when work strays outside the planned region);
   - **`POL:`** — standing policy by on-disk pointer only, never copied;
   - the **return-envelope contract** (below).

   **Write discipline inside the session:** the session writes its worktree(s) and **its own carrier
   file only** — one session per IU means a single writer, race-free. It writes no shared surface.
3. **Collect the return envelope:**
   `{ outcome: built | review-flagged | escalated | blocked, commits[], branch(es), evidence }`.
   Route by outcome into **four buckets**:
   - **`built`** — slice committed on its branch, acceptance evidence attached, review verdict clean
     or all-deferred. Proceeds to the merge step.
   - **`review-flagged`** — the session's `review` pass ended with **unresolved actionable
     findings** (`gated_auto` / `manual`, which headless/autofix modes may not apply). The
     in-session review→build fix loop runs **bounded** (max 2 re-entries, per the cyclic-edge
     discipline); a slice still flagged after that returns here with the ranked finding set and
     parks to the **attended queue** — never merged. The operator triages the findings.
   - **`escalated`** — a mid-build wholesale/challenge signal (a hidden fork, a spec or design the
     session cannot honestly implement). The session **stops and returns the signal + rationale; it
     does not enact anything**. Park the IU and **escalate to `shape`** — the front re-shapes and
     re-gates; downstream never patches around a front decision.
   - **`blocked`** — a scope/dependency/environment blocker, an under-defined carrier the session
     could not build without asking, or a dead session (crash/timeout, with the failure evidence).
     Parked with the reason. **Never retried in-batch.**

   Route-outs **write no lifecycle**: the IU stays open and re-lists in a future batch.
4. **Merge the built IU to DEV** — per-IU PR to the DEV branch, lens-panel-reviewed and CI-checked.
   Run the **ancestry pre-check** first (step 3 of intake, same test — never double-merge an IU that
   went in out-of-band mid-batch). Under the sequential default, the next IU's branch is then cut
   from this new tip. **Single-main:** open the per-IU PR against `main` and **leave it open** — the
   gate's sign-off merges it.

## The reopen — verify's fix-loop re-enters here

`verify` owns the batch fix-loop — it detects a finding on the running DEV surfaces, attributes it
to an IU via its DEV commits, classifies it, and bounds the loop. **You provide the reopen
mechanism**: re-dispatch a fresh `build → review` **correction session against the same IU
carrier**, scoped to the finding verify attributed, re-merged to DEV, re-verified. The
branch-exists guard governs the cross-batch re-dispatch (reuse or recreate the retained branch is
explicit). The loop is **bounded — two reopens per IU / defect-kind, then verify escalates**; a
reopened early IU in a sequential chain can ripple (successors may need rebuilding) — the ripple is
detected at re-verify and bounded by the same cap.

## Mid-run deferred work — route by one discriminator, never a chip

A running span — you across the batch, or a dispatched session inside its IU — will spot follow-on
or out-of-scope work mid-run. Do **not** surface it as an ephemeral chip or a prose "follow-on
candidate" note: that exits the pipeline with no capture and no path into a later batch. Route it by
a single discriminator instead:

> **Does the finding land inside the work in hand?**

1. **In the current scope and decision-complete → done inline, now.** For a dispatched session that
   means inside its IU's declared `files`; for you, inside the batch's own declared scope. It is
   part of the work in hand — complete it directly; no carrier, no chip.
2. **Out of the current scope → raise it through the front.** Hand the finding to `triage`'s intake
   with the live context harvested into the raise, so it clears the front's gates like any other
   unit. It is **never built off-plan inside this span** — everything is specced and gated in the
   front — and never parked as a chip a human must reconstitute.
3. **A product/design "what should it do" → the front, as a wholesale signal.** That is `shape`'s
   to resolve, never a batch item.

## Close — dry-run, report, handoff (collaborative)

1. **Batch report.** Per-IU outcomes with evidence, the four buckets named; reconciled
   (out-of-band-merged) IUs listed; retained parked-branch names recorded.
2. **Integration dry-run per repo.** Re-run each built slice's `acceptance_check` on the
   **assembled tree** — the DEV tip (prod-facing), or a **scratch-worktree merge** of the open
   per-IU PR branches in dependency order (single-main; the scratch tree is then **discarded** —
   readiness evidence only, no real merge). Cross-slice and mid-batch-drift conflicts surface here,
   not downstream. A failure pauses that repo's queue and surfaces the options — fix in place if
   trivial, reopen a fresh correction session against the same carrier, or park; the operator
   decides.
3. **Hand off to `verify`.** The assembled DEV state (or the open per-IU PRs, single-main) + the
   batch report + the dry-run evidence. `verify` runs the dynamic panel over the running build,
   opens the integration PR, and fires `◇commit-to-land` at its exit — the promotion is not yours.
4. **Block-and-emit — before surfacing a blocking question, drop a structured resume artifact.**
   When a close-phase decision cannot be resolved unattended and you are about to put a question to
   the operator — a dry-run-failure options prompt, a parked route-out's disposition, any
   close-phase fork — **first write a structured handoff artifact**, *then* surface the question.
   The artifact is itself a cold-handoff prompt (a future session, possibly fresh, resumes from it),
   so author it in the `handoff-prompt-convention` field form — never free prose: **`GOAL:`** what
   this span set out to do; **`WHERE:`** the repo(s) `@` the active branch, the carrier path(s), any
   retained `iu/<carrier>` worktree/branch the resume touches; **`DO:`** how far it got and the exact
   resume action once the decision is answered; **`DONE-WHEN:`** the acceptance for that resume step
   + its verify command; **`POL:`** policy by on-disk path only; **`EPH(<date>):`** the expiring
   facts — the exact blocking decision(s) + options weighed, and the verified stop-time state
   (current branch, per-IU PR statuses, any uncommitted tracked changes). Omit `META:` — this is the
   dispatcher's own resume note, carrying no carrier context. Write it into the batch report so the
   resume state survives a stop.
5. **Worktree teardown — order-bearing, do not reorder.**
   - **Merged-to-DEV IU:** test on the merged result → `git worktree unlock` → `git worktree remove`
     → `git branch -d`. **Always lowercase `-d`, never `-D`** — `-d` refuses to delete a branch
     whose commits are not merged; that refusal is the guard against losing unmerged work.
     - **Then delete the remote head — idempotently:** `git push origin --delete iu/<carrier>`,
       tolerating "remote ref does not exist" gracefully (the PR squash-merge path already deleted
       it; the direct-merge path is what this reaps). **Authorization is narrow:** the per-IU merge
       to DEV authorises deleting **only that IU's own `origin/iu/<carrier>` head**, never a general
       remote-ref-delete grant.
   - **Single-main open-PR branch:** the PR is open pending the gate — **retain the branch and its
     remote head**; remove only the worktree.
   - **Parked outcome** (`review-flagged` / `escalated` / `blocked`): remove the worktree but
     **retain the branch**, recording its name in the batch report — a parked slice's commits are
     the resume point. These retained `iu/<carrier>` branches are why the span carries the branch-exists
     guard.
6. **Wakeup barrier — Stop wipes any pending wakeup; it does not merely refrain from re-arming.**
   Your self-paced/idle turns may arm a heartbeat wakeup (e.g. while waiting on a gated operator
   action) so the loop re-enters on its own timer. That wakeup lifecycle is **single-owner — arm /
   replace / cancel** — and **Stop is a hard barrier** on it. Stop means any of: an operator stop,
   terminal completion of the batch, or a stop signal.
   - **Arm / replace.** At most **one** heartbeat is pending at a time: arming a new one replaces
     the prior (cancel-then-arm), never stacks a second.
   - **Cancel on Stop (the barrier).** On Stop, **actively cancel any pending wakeup** — do not
     simply skip arming the next one. Use the native wakeup-cancel where the runtime exposes one;
     absent one, set a stop-sentinel the loop's entry checks first and self-aborts on, so a wakeup
     armed in an earlier turn that fires after Stop is a no-op.
   - **Confirm "0 wakeups pending".** The stop path emits an explicit `0 wakeups pending`
     confirmation in the exit summary, so the close is auditable.
   **A stopped loop never re-fires from a prior in-flight heartbeat.** "Didn't re-arm" is not
   "nothing is pending"; the cancel + the confirmation make the two the same.
7. **Commit guard — before declaring the span done, no dirty tracked tree exits unresolved.** As the
   final close-path step, run **`git status --porcelain` on each tracked repo** in the batch
   (the `deploy-config` per-repo roots; include any in-place fix from the dry-run step). If any
   tracked file is dirty, resolve it **preference-ranked, and record which option was taken** in the
   batch report:
   - **commit on the active branch (preferred)** — the change is real work; land it where it
     belongs;
   - **stash with a labelled message (fallback)** — `git stash push -m "<batch/IU label>"` when a
     commit is not yet appropriate, so the change is recoverable and named, not anonymous;
   - **surface it explicitly in the exit summary (last resort)** — name the repo, the dirty paths,
     and why it was left, as an explicit unresolved item.
   **Tested-but-uncommitted changes are never silently orphaned.**

## Output

- **Batch report** — per-IU outcomes across the four named buckets, each with its evidence;
  reconciled IUs named; retained parked-branch names.
- **The assembled DEV state** — each built IU merged per-IU to DEV (or its PR opened against `main`
  and left open, single-main), with the **integration dry-run evidence** (each built slice's
  `acceptance_check` re-run on the assembled tree; conflicts surfaced before verify).
- **The handoff to `verify`** — the coordinator's forward edge; verify runs the dynamic panel and
  fires the promotion gate.
- **No lifecycle or gate writes** beyond the ancestry-reconcile records enacted through
  `record-gate`; no shared committed surface written during the span.

If any IU's dependency, environment, or merge step fails, park it with the reason and surface the
options — never re-dispatch in-batch, never merge past a flag, never merge to the landed line.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/handoff-prompt-convention.md` — `handoff-prompt-convention`

