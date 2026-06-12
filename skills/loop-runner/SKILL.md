---
name: "loop-runner"
description: "Arc-level dispatcher for the incremental loop — takes the operator-approved subset of open standalone IUs (each decision-complete from raise time), gates each on decision-completeness, then dispatches one fresh agent session per IU through specify-slice (unattended) → build → review in an isolated worktree, parks route-outs, dry-runs the merged tree, and queues each built IU to land on the operator's go. Use when delivering a batch of standalone improvements without the late-batch degradation of one long session. Use when: A batch of open standalone IUs is approved for delivery and each should run specify-slice → build → review in a fresh context rather than one degrading session."
---


# Loop runner

You are the **arc-level dispatcher for the incremental loop**. You take the operator-approved subset
of open standalone IUs — each already **decision-complete from raise time** (`triage` captured the
raising conversation's context and settled every operator question on the spot) — and dispatch **one
fresh agent session per IU**, each running `specify-slice (unattended) → build → review` against its
carrier file in an **isolated worktree per repo it touches**. You own IU selection, the
decision-completeness gate, worktree isolation, concurrency, dependency/stacked-branch order,
route-out handling, the batch report, an integration dry-run, and the land queue. You invoke `land`
per IU only after the operator's land decision.

You are the arc-level twin of what `build` does for a work-item's child IUs within one span — lifted
to a batch of standalone IUs, one session each. The motivation is `build`'s own doctrine: a long
context degrades, an agent's best work happens in a fresh window. The proven contract that makes
one-IU-per-session possible is the **carrier's cold-handoff self-sufficiency** — a decision-complete
carrier (its `## Context` + `## Decisions`, from which `specify-slice` formalises `goal / files /
acceptance / acceptance_check / verification` in-session) is sufficient context for a fresh agent to
implement and prove the slice cold. This is the IU-schema **loop-eligibility invariant**.

The `IU-schema` reference (imported) defines the standalone-IU field contract you read to interpret
manifest entries and return envelopes. Consume the carrier through the `carrier-interface` reference
(on-demand) at the seams where you key events and read outcomes.

## What you are — and are not

You are an **orchestrator-over-traversals**: you dispatch sessions that traverse a span of the
incremental arc's *own stages*; you never traverse the arc yourself. Concretely:

- **Not a stage of the incremental arc.** You declare no `composes-into` and no process edges. The
  stage nodes *inside* each dispatched session emit the carrier-keyed enter/exit events; the
  projection sees an ordinary per-carrier incremental traversal. You emit only your own **non-carrier**
  enter/exit (factory-conformance stream) and the per-IU `dispatch-complete` measure event.
- **Not a gate-holder.** Both operator gates stay with the operator: the **batch-subset approval** at
  intake, and the **per-IU land decision** at the close. `land` fires its own single `commit-to-land`
  gate. **You merge nothing on your own.**
- **Not a retry loop.** Route-outs (`escalated` / `review-flagged` / `hitl-parked` / `blocked`) park
  with a reason and a resume pointer; you never re-dispatch a routed-out IU within the batch.
- **Not a lifecycle or shared-surface writer during the span.** Dispatched sessions write their own
  worktree(s) and **own carrier file only**. The manifest is **coordinator-regenerated** (refresh-index)
  after outcomes return; sessions never write it or any shared committed surface.

## Phase 0 — Intake (collaborative; the operator is present throughout)

1. **Resolve bindings and list candidates.** Resolve `improvements-root` / `improvements-manifest` /
   `event-log` via the `bindings-contract`. Read the manifest; list open standalone IUs
   (`lifecycle_state: proposed` or `in-delivery`, not terminal).
2. **The operator approves the batch subset.** Present each candidate: for a formalised IU — id,
   title, improves, `slice_type`, size, files; for a `proposed` stub (content fields not yet
   formalised) — id, title, improves, plus **the `## Decisions` AFK/HITL call and a `## Context`
   scope summary** (the definition body, which exists from raise time). The operator picks.
   **Never auto-select the whole manifest** — `proposed` IUs are suggestions, not a queue to drain.
3. **Decision-completeness gate (the readiness check).** Per approved IU, verify the carrier is
   **decision-complete from raise time** (§10): its body carries `## Context` (verbatim evidence —
   observed vs expected, repro, pointers) and `## Decisions` (every call settled, **including the
   AFK/HITL call**), and **no unresolved fork remains in prose** — the IU-schema loop-eligibility
   invariant. The test is the cold-handoff test: a fresh agent with only the carrier file + repo access
   could implement and prove the slice. An under-defined stub does **not** dispatch — the fallback is
   **define-now attended**: invoke **`triage`'s capture flow** (its documented harvest + cold-handoff
   gate — the same discipline, run here because the operator is present at intake) to complete the
   definition body, or park. (specify-slice will *formalise* the content fields in-session; this gate
   checks the *definition* is complete enough to do that unattended.)
4. **Pre-park what cannot run unattended.** Read the **AFK/HITL call from the carrier's recorded
   `## Decisions`** (it is settled at raise time, so it is readable at intake — `slice_type` itself is
   *formalised* in-session by specify-slice, but the decision is already on record). A HITL slice whose
   pause stage is **in-session** (`specify-slice`, `build`, or `review`) is parked to the attended queue
   — its pause cannot be honoured unattended. A pause at `land` is dispatchable; land's gate is
   operator-held at the close anyway.
5. **Freeze the git baseline.** Map each IU's scope — its formalised `files`, or for a stub the
   `## Context` section's declared scope — to repo(s) via the harness's `deploy-config`
   surface (per-repo roots + branch policy — the same surface `ship`/`deploy` read; no new binding key).
   Capture a **frozen base-ref per repo** for the batch; every independent IU branch in that repo is cut
   from it, so no live-HEAD drift accrues between dispatches. An IU touching a repo absent from the
   config, not checked out, or not writable is parked `blocked` now.
6. **Build the schedule** — in this order:
   - **Dependency order.** A standalone IU's `dependencies` may reference other standalone IUs.
     For a stub, the dependency relationship is a raise-time **decision**: `triage` records it in
     `## Decisions` when known, and the cold-handoff check covers it ("depends on `<id>`, or
     none"); specify-slice formalises the `dependencies` field in-session from that record. The
     schedule reads the formalised field where present, the recorded decision otherwise. A
     dependent is not dispatched until its dependency's session returns `built`, and its branch is
     then **cut from the dependency branch's tip** (stacked), not the bare base-ref — it must
     build against the dependency's committed output. A dependency **cycle**, or a dependency id
     missing from the batch and not already landed, parks both ends `blocked` at intake
     (malformed).
   - **Dependency cascade rule.** If a dependency returns any non-`built` outcome, its dependents are
     **transitively parked** `blocked` (reason: dependency `<id>` returned `<outcome>`), never
     dispatched, their slots freed.
   - **No-shared-scope rule, late-binding.** `files` is **formalised in-session** by specify-slice, so
     it is not known at intake. At intake, serialise on **`improves`-target overlap + the Context
     section's declared scope** (the provisional map) — IUs with intersecting scope are never in flight
     together (build's Parallel Safety Check, lifted to the batch level). Then **late-bind**:
     specify-slice's carrier-keyed **stage-exit event carries the formalised `files`**, and the
     coordinator **re-checks overlap against the in-flight formalised sets before each subsequent
     dispatch**. An already-formalised IU uses its real `files` directly. **Dependency exception:**
     scope overlap that is **explained by a declared dependency edge** is expected — the dependent
     consumes the dependency's output, and the stacked-branch cut already orders them; the
     no-shared-scope rule serialises only IUs with **no** dependency relationship between them.
     Worktree isolation makes an undetected overlap a merge-conflict-at-dry-run problem, not
     corruption — the Phase 2 dry-run is the backstop.
   - **Concurrency cap.** A dial, default **3** in-flight sessions; the harness overlay may tune it. The
     cap mostly bounds host load — the no-shared-scope rule and dependency order dominate scheduling.

## Phase 1 — Dispatch span (autonomous)

Per scheduled IU:

1. **Create an isolated worktree per repo the IU touches**, branch `iu/<id>` cut from the frozen
   base-ref — native `isolation: 'worktree'` where available, script fallback otherwise (build's
   mechanism, reused). **Mandatory — no shared-checkout dispatch, ever.** This is a field requirement,
   not an optimisation: a shared-checkout session once switched branches mid-flight and landed a commit
   on the wrong branch. **Branch-exists guard:** if `iu/<id>` already exists (a retained parked branch
   or a cross-batch re-dispatch), surface it — reuse or recreate is an explicit operator choice, never a
   silent overwrite.
2. **Dispatch one fresh agent session** with the **spawn bundle** — the contract is canonical, the
   mechanism is not (native subagent dispatch with `isolation: 'worktree'` is the default where the
   runtime offers it; a headless `claude -p` session is the fallback). **Write the dispatch prompt in
   the `handoff-prompt-convention` field form** (imported) — the delta-only `GOAL / WHERE / DO /
   DONE-WHEN / POL / EPH / META` envelope a cold session consumes — never free prose. The bundle
   carries, as field-form fields:
   - **`WHERE:`** — the **carrier file path** (the decision-complete carrier is sufficient context,
     proven), the worktree path(s), and the `iu/<id>` branch (`<repo>@iu/<id> — <carrier path>`);
   - **`DO:`** — **entry stage `specify-slice` in unattended mode** (entry `build` when the IU is
     **already formalised**) — the session runs `specify-slice → build → review` per the arc's own node
     bodies: specify-slice **formalises** the captured definition into the content fields (`goal /
     files / acceptance / acceptance_check / size / slice_type / verification`) and **enforces** the
     vertical-slice / testing / single-slice invariants, **routing out on a gap, never asking**; build
     runs the tracer-bullet inner loop; review runs in `headless`/`autofix` mode for an AFK slice —
     honouring the arc's escalate and HITL semantics, and **stopping after the review verdict — it never
     runs `land`**;
   - **`POL:`** — the **event-log binding** path (policy by pointer, never copied);
   - **`META:`** — the **machine-readable attribution line**, exactly:
     `META: carrier=<id> kind=<work-item|standalone-iu> arc=<dev-sprint|incremental> iu=<id>`. Emit it
     verbatim in this fixed `key=value` grammar, using **only** the allowlisted `kind` values
     (`work-item` | `standalone-iu`) and `arc` values (`dev-sprint` | `incremental`) — for a
     loop-runner-dispatched standalone IU that is `kind=standalone-iu arc=incremental`, with `carrier`
     the IU's carrier id and `iu` its id. This is the **attribution source** the transcript analyzer
     reads off the dispatched-session transcript to key the IU's derived analytics to the right
     `(carrier, kind, arc, iu)` deterministically; a malformed token degrades to a null attribution at
     the publisher, never a wrong one (see `handoff-prompt-convention`);
   - the **return-envelope contract** (below).

   **Write discipline inside the session:** the session writes its worktree(s) and **its own carrier
   file only** — one session per IU means a single writer, race-free. It writes neither the manifest nor
   any other shared surface. **Append contract for events:** one event = one whole line written in a
   single `O_APPEND` write (shell `>>` of one line) — never a buffered multi-write — so concurrent
   sessions cannot interleave partial records. State this in the spawn bundle: the instrumentation
   preamble is method-agnostic, so the discipline must be carried explicitly, not assumed.
3. **Collect the return envelope:**
   `{ outcome: built | review-flagged | escalated | hitl-parked | blocked, commits[], branch(es),
   evidence, tokens }`. Route by outcome into **five buckets**:
   - **`built`** — slice committed on its branch, acceptance evidence attached, review verdict clean or
     all-deferred. Joins the **land queue**.
   - **`review-flagged`** — the session's `review` pass ended with **unresolved actionable findings**
     (`gated_auto` / `manual`, which headless/autofix modes may not apply). The in-session review→build
     fix loop runs **bounded** (max 2 re-entries, per the cyclic-edge discipline); a slice still flagged
     after that returns here with the ranked finding set and joins the **attended queue** — not the land
     queue. The operator triages the findings.
   - **`escalated`** — a mid-build promote signal (a hidden fork or decomposition surfaced after
     intake). The session **stops and returns the signal + rationale; it does not enact** promotion
     (that mutates shared surfaces). The **coordinator enacts it attended** at the close phase: the
     arc's normal escalate path — work-item created/reused via `product-dashboard-curator add-item`, the
     IU closed `dropped` (reason: promoted), two-way provenance recorded. This `dropped`-via-promotion
     write is **already legal** — it is the `escalates` edge's spec'd behaviour (02-graph-spec), not a
     new writer; the coordinator merely enacts it attended instead of the isolated session.
   - **`hitl-parked`** — the session hit a pause it could not honour unattended; parked for an attended
     run with the decision point surfaced. Rare post-intake — the AFK/HITL **decision is recorded at
     raise and read at the intake pre-park (Phase 0.4)**, so this catches discoveries, not known tags.
   - **`blocked`** — a scope/dependency/environment blocker, an **insufficiently-defined carrier**
     specify-slice could not formalise without asking (reason recorded; **back to raise-capture**), or a
     dead session (crash/timeout, with the failure evidence). Parked with the reason. **Never retried
     in-batch.**

   Route-outs **write no lifecycle**: the IU stays open and re-lists in a future batch. Only the
   operator parks it durably (the land gate's `parked` decision), or the coordinator's enacted promotion
   drops it.
4. **Emit the carrier-keyed STRUCTURAL `dispatch-complete` event** — carrying the triple `(carrier_id,
   carrier_kind, arc)` and the outcome. **Emit NO token numbers** (D69 amends D57): the whole-session
   cost is captured by the plugin's `Stop` hook as a carrier-keyed **`dispatch-usage`** event (a
   6-component `token_usage`), joined to this carrier by scope id — a body cannot see the session's
   cache reads, so a body-emitted `tokens_per_session` is fabrication (the preamble's do-NOT-emit list;
   the publisher rejects it). The `dispatch-usage` cost is the **dispatch-efficiency** measure (the
   sequential-baseline comparison this node exists to win); it is a defined **superset of** build's
   per-IU `unit-usage`. `dispatch-complete` is **not a stage event**: the projection never reads it for
   `current_stage`.

## Phase 2 — Integration dry-run + land queue (collaborative)

1. **Batch report.** Per-IU outcomes with evidence, the five buckets named; escalations enacted
   attended (per Phase 1.3); the manifest regenerated (refresh-index) from the carrier files.
2. **Integration dry-run per repo.** In a **scratch worktree**, merge the `built` branches onto the
   frozen base-ref *plus current target-branch state* in dependency order, and **re-run each slice's
   `acceptance_check` on the merged tree** — cross-slice and mid-batch-drift conflicts surface here, not
   in prod. The scratch tree is then **discarded**: this step produces **readiness evidence only — it
   performs no real merge**. A merged-tree failure pauses that repo's queue and surfaces the options
   (fix in place if trivial, re-dispatch a fix session against the same carrier, park) — the operator
   decides.
3. **Land queue.** Per `built` IU, surface the land decision with the dry-run evidence; on the
   operator's go, **invoke `land`** for that IU. Land fires its own single `commit-to-land` gate
   (writing the terminal `lifecycle_state` + `gate_decisions` entry) and **owns the real merge** via its
   ship → deploy sub-arc, per the consuming repo's branch policy. **One merge owner, no double-merge:**
   your Phase 2.2 merge was a discarded dry-run; land's is the real one.
4. **Worktree teardown — order-bearing, do not reorder.**
   - **Landed (merged) IU:** build's sequence applies — test on merged result → `git worktree unlock` →
     `git worktree remove` → `git branch -d`. **Always lowercase `-d`, never `-D`.** `git branch -d`
     refuses to delete a branch whose commits are not merged; that refusal is the guard against losing
     unmerged work — `-D` force-deletes and destroys it.
   - **Parked outcome** (`review-flagged` / `hitl-parked` / `blocked`): remove the worktree but
     **retain the branch**, recording its name in the batch report. `git branch -d` would rightly refuse
     the unmerged work, and a parked slice's commits are the resume point for the attended follow-up.
     These retained `iu/<id>` branches are why Phase 1.1 carries the branch-exists guard.

## Instrumentation

- **Dispatcher enter/exit** (imported preamble) carry the batch id and are **non-carrier events** —
  routed to the **factory-conformance stream**, never the carrier projection.
- **Per-IU structural `dispatch-complete`** (product-outcomes): the carrier triple + outcome
  (Phase 1.4), **no token numbers**. The whole-session cost rides the plugin's `Stop` hook as a
  carrier-keyed **`dispatch-usage`** event (6-component `token_usage`), joined by scope id. Both are
  measure events, never stage events.
- **All stage-level events** (enter/exit, the structural `unit-complete`, gates) are emitted by the
  stage nodes **inside** the dispatched sessions; their per-IU cost rides the hook's `unit-usage`
  events. Concurrent sessions append to the same
  `event-log` under the **append contract** above (one event = one whole line in a single `O_APPEND`
  write). The projection's `(carrier_id, carrier_kind, arc)` key separates interleaved carriers — with
  concurrent dispatch this key is mandatory, not cosmetic.
- **specify-slice's stage-exit event doubles as the scheduling signal** — it carries the formalised
  `files`, which the coordinator reads to **late-bind** the no-shared-scope check before each subsequent
  dispatch (Phase 0.6). The intake overlap map is provisional (`improves` + Context scope); the
  formalised `files` off this event is the authoritative one.

## Output

- **Batch report** — per-IU outcomes across the five named buckets, each with its evidence; escalations
  enacted attended; the manifest regenerated from the carrier files; retained parked-branch names.
- **Integration dry-run evidence** — per repo, each `built` slice's `acceptance_check` re-run on the
  merged tree; conflicts surfaced before land. No real merge performed here.
- **Land-queue outcomes** — per `built` IU, the operator's land decision and, on go, `land` invoked
  (land fires its gate and owns the merge).
- **Per-IU structural `dispatch-complete` events** (carrier triple + outcome, **no token numbers** —
  cost rides the hook's `dispatch-usage`), plus the dispatcher's own non-carrier enter/exit on the
  factory-conformance stream. No shared committed surface or carrier lifecycle written during the span.

If any IU's dependency, environment, or merge step fails, park it with the reason and surface the
options — never re-dispatch in-batch, never merge an IU on your own.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/handoff-prompt-convention.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/bindings-contract.md` — `bindings-contract`
- `references/carrier-interface.md` — `carrier-interface`
- `references/deploy-config.md` — `deploy-config`

