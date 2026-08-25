---
name: "dispatch"
description: "Build-span loop orchestrator: dispatches one fresh build-review session per IU of a gate-approved plan in an isolated worktree, merges each built IU to DEV (single-main: the session's PR waits for the gate), parks route-outs, hands DEV to verify, and provides its reopen. Use when a plan's IU set is ready for delivery after commit-to-build."
---


# Dispatch

You are the **loop orchestrator of the build span**: you consume the plan — the gate-approved IU
set cleared at `◇commit-to-build` — and dispatch **one fresh isolated child context per IU**,
each running `build → review` in an isolated worktree, merging each built IU to the **DEV
branch**. You own the schedule, isolation, race control, route-outs, the batch report,
the integration dry-run, and the handoff to `verify`. Every IU builds **AFK** — HITL was
resolved warm in the front; a mid-build issue routes out or is reopened, never paused on. Fields
per the required `IU-schema` reference.

**No gate** — the intake pick is an informal scoping question, in-memory; the promotion is
`◇commit-to-land`'s, fired at `verify`'s exit. **Per-IU merge owner, never the
landing** — one owner per git act: `git-ownership` §roles. **Not a retry loop, no lifecycle
writes** — route-outs park; the one narrow write is the ancestry reconcile below, enacted through
`record-gate`.

## Intake — the scoping pick (collaborative)

1. **Read the plan.** The `dependencies` capture logical order **and** file/surface overlap —
   **absence is the parallelisability signal**. The derived projection shows what is already
   built or landed. The operator may scope which IUs run now — an informal pick, never a
   re-litigation of the gate.
2. **Resolve the branch topology from `deploy-config`** (the crystallised branch-topology
   surface — never hardcode a branch name): a prod deploy target present is the **prod-facing**
   regime; none is **single-main**. PR ownership per `git-ownership` §roles —
   **the dispatched session opens the per-IU PR (single-main: against `main`, left open);
   dispatch merges to DEV (prod-facing) and never merges pre-gate (single-main)** — the
   merge-to-main row is the gate's enactment, same table.
3. **Ancestry reconcile — drop already-merged IUs.** Carrier state lags an out-of-band merge;
   filter by git ancestry: where `iu/<carrier>` exists, test
   **`git merge-base --is-ancestor iu/<carrier> <branch>`** against **both** integration reads.
   **Landed-line** hit (`main`, from `deploy-config`): drop, and reconcile through `record-gate`
   `context=unattended` — the retroactive `commit-to-land` entry, `decision: reconciled`,
   **naming the out-of-band merge** — a record of an already-true merge, never a fresh gate
   decision; you write no field directly. **DEV-only** hit: drop — already integrated this span;
   no lifecycle write, note in the batch report. No branch or no hit: a genuine candidate. The
   same pre-check re-runs before every merge — no-double-merge holds mid-batch.
4. **Build the schedule — from the plan, never re-derived.** A dependent waits until its dependency
   is `built` and merged. A **cycle**, or an id missing and not already merged, parks both
   ends `blocked` at intake — a plan defect to surface. A non-`built`
   dependency **transitively parks** its dependents `blocked` (reason: dependency `<id>` returned
   `<outcome>`), slots freed. **Never re-derive independence**: the plan owns parallelisability
   (`no-deps` = may parallelize); the file-overlap check is a **backstop only** before any
   parallel dispatch — an overlap downgrades the pair to sequential, logged, never promotes.

## The two schedules

- **sequential-reviewer (the default).** One IU at a time through `build → review`, in dependency
  order, each branch cut from the **prior IU's merged and refactored DEV tip** — the batch
  **composes by construction**.
- **parallel-planner (the plan-gated escape hatch).** Parallelize **only the plan's `no-deps`
  set**, each on a distinct branch from one frozen DEV base-ref — **race-fenced**: never two
  sessions on one branch, never `head`/`merge-to-head` concurrently, a **single merge owner**
  (you), merges serialised. A deliberate operator choice, never an auto-threshold; a concurrency
  dial (default **3**, harness-tunable) bounds host load.

## The dispatch span (autonomous)

Per scheduled IU:

1. **Worktree + branch.** An isolated worktree per repo the IU touches, branch **`iu/<carrier>`**
   cut from the scheduled base. **Mandatory — no shared-checkout dispatch, ever** (a shared
   checkout once landed a commit on the wrong branch mid-flight). The branch is an **isolation
   device, not an attribution signal** — the carrier reads from the `META:` envelope, never
   the branch.
   **Branch-exists guard:** an existing `iu/<carrier>` is surfaced — reuse or recreate is
   explicit, never a silent overwrite.
2. **Dispatch** one fresh isolated child context — the contract is canonical, the mechanism is not
   (native worktree isolation where offered, else headless). The prompt is the
   `handoff-prompt-convention` field form, its `META:` attribution line exactly per that
   convention. Pass the compulsory `carrier=`, and `stage=` (`build` here) — a member of the
   closed `STAGES` set the analyzer owns (`scripts/analyzer/schema.ts`; cite it,
   never re-list the members). **Emit the envelope at every dispatch level** — `stage` never
   inherits: a sub-dispatch writes its own `META:` line; an envelope-less one attributes
   `stage: null` and drops from every rollup. Fields: **`WHERE:`** the carrier file
   path (the decision-complete carrier suffices cold), worktree path(s), branch, base;
   **`DO:`** entry stage `build`, then `review` in headless/autofix mode — **stopping after the
   review verdict: the session never merges and never lands** — plus the IU's `zone` coordinate
   (brief baked by `plan`; `explore` zone mode only outside the planned region); **`POL:`**
   pointers only; and the **return-envelope contract** below. **Session write
   discipline:** its worktree(s) and its **own carrier file only** — a single writer,
   race-free; no shared surface.
3. **Collect the return envelope:**
   `{ outcome: built | review-flagged | escalated | blocked, commits[], branch(es), evidence }` —
   the closed four-bucket vocabulary of `handoff-prompt-convention` §outcomes; route on it:
   - **`built`** → the merge step.
   - **`review-flagged`** → park to the **attended queue**, ranked findings attached, never
     merged; the operator triages.
   - **`escalated`** → park and **escalate to `shape`**; the front re-shapes and re-gates —
     downstream never patches around a front decision.
   - **`blocked`** → park with the reason (an under-defined carrier is the gate's miss to
     re-shape, not yours to patch). **Never retried in-batch.**

   Route-outs **write no lifecycle**: the IU stays open and re-lists in a future batch.
4. **Merge the built IU to DEV** (prod-facing) — the session's per-IU PR, lens-panel-reviewed and
   CI-checked; the **ancestry pre-check** runs first (intake 3, same test). Sequential default:
   the next branch is cut from this new tip. **Single-main:** no pre-gate merge — the session's
   PR stays open; the gate's sign-off merges it.

## The reopen

`verify` owns the batch fix-loop, attributing a finding to an IU via its DEV commits. **You
provide the mechanism**: re-dispatch a fresh `build → review` **correction session against the
same IU carrier**, scoped to the attributed finding, re-merged to DEV, re-verified; the
branch-exists guard governs the retained branch. **Bound — two reopens per IU /
defect-kind, then verify escalates**; a reopened early IU can ripple into successors — detected
at re-verify, same cap.

## Mid-run deferred work

One discriminator — **does the finding land inside the work in hand?** In scope and
decision-complete → inline, now. Out of scope → raise through `triage` with the live context
harvested — never built off-plan, never a chip. A product/design "what should it do" →
`shape`, a wholesale signal.

## Close (collaborative)

1. **Batch report.** Per-IU outcomes across the four buckets, with evidence; reconciled
   (out-of-band-merged) IUs; retained parked-branch names.
2. **Integration dry-run per repo.** Re-run each built slice's `acceptance_check` on the
   **assembled tree** — the DEV tip (prod-facing), or a **scratch-worktree merge** of the open
   per-IU PR branches in dependency order (single-main; the scratch tree is discarded — readiness
   evidence, no real merge). A failure pauses that repo's queue and surfaces the options — fix in
   place if trivial, reopen a correction session, or park; the operator decides.
3. **Hand off to `verify`:** the assembled DEV state (or the open per-IU PRs, single-main) + the
   batch report + the dry-run evidence; verify runs the dynamic panel, opens the integration PR,
   and fires `◇commit-to-land` — the promotion is not yours.
4. **Block-and-emit.** A blocking close-phase question is surfaced only after **writing a
   structured resume artifact** in the `handoff-prompt-convention` field form — the exact resume
   action in `DO:`, the blocking decision(s) + options weighed and the verified stop-time state
   in `EPH(<date>):`; omit `META:` (a dispatcher resume note carries no carrier context). Write
   it into the batch report, *then* ask — the resume survives a stop.
5. **Worktree teardown — order-bearing, do not reorder.**
   - **Merged-to-DEV IU:** test on the merged result → `git worktree unlock` → `git worktree
     remove` → `git branch -d` — **always lowercase `-d`, never `-D`**: the refusal on unmerged
     commits is the guard against losing work. **Submodule-aware fallback:** `git worktree
     remove` refuses a worktree containing a nested clone or initialized submodule; after the
     branch-safety steps — never instead of them — delete the worktree directory and `git
     worktree prune`. Then delete the remote head idempotently (`git push origin --delete
     iu/<carrier>`, tolerating an already-absent ref) — authorization per the **narrow per-IU
     remote-head row**, `git-ownership` §roles.
   - **Single-main open-PR branch:** the PR waits for the gate — **retain the branch and its
     remote head**; remove only the worktree.
   - **Parked outcome** (`review-flagged` / `escalated` / `blocked`): remove the worktree,
     **retain the branch**, record its name in the batch report — the commits are the resume
     point (hence the branch-exists guard).
6. **Wakeup barrier — Stop wipes any pending wakeup; it does not merely refrain from re-arming.**
   A heartbeat wakeup an idle turn armed is **single-owner — arm / replace / cancel** — and
   Stop (an operator stop, terminal completion, a stop signal) is a **hard barrier**. At most
   **one** is pending — arming replaces (cancel-then-arm), never stacks. On Stop, **actively
   cancel** any pending wakeup — native cancel, else a stop-sentinel
   the loop's entry checks and self-aborts on — and emit **`0 wakeups pending`** in the exit
   summary. "Didn't re-arm" is not "nothing is pending"; a stopped loop never re-fires from a
   prior in-flight heartbeat.
7. **Commit guard — no dirty tracked tree exits unresolved.** Final step: run
   **`git status --porcelain` on each tracked repo** (the `deploy-config` per-repo roots, incl.
   any in-place dry-run fix). Resolve **preference-ranked, recording the option taken** in the
   batch report: **commit on the active branch** (preferred); **stash with a labelled
   message** (`git stash push -m "<batch/IU label>"`); **surface it explicitly in the
   exit summary** (last resort — the repo, the paths, why). **Tested-but-uncommitted changes are
   never silently orphaned.**

If an IU's dependency, environment, or merge step fails: park it with the reason and surface the
options — never re-dispatch in-batch, never merge past a flag, never merge to the landed line.

## Carrier entry preflight

Before taking any workflow action, invoke `preamble` with `--node dispatch --carrier <active-carrier-file> --carrier-id <active-carrier-id>`. Missing or invalid carrier input blocks the invocation. Preamble resolves the exact required state from its bundled graph-derived contract; continue only when the bundled runner exits zero. Never substitute a host hook or a hand-written state list.


## Required references

Before taking any action, read these bundled references:

- [IU-schema](references/IU-schema.md)
- [git-ownership](references/git-ownership.md)

## On-demand references

At the step of need, read these bundled references:

- [handoff-prompt-convention](references/handoff-prompt-convention.md)

