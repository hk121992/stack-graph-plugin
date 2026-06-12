---
# identity — native .claude (the builder emits the primitive from these)
id: debrief
primitive: skill
title: Debrief
description: Loop-close stage of the dev-sprint — measures outcomes vs the work-item's outcome_link, captures learnings, routes amendments, and seeds the next sprint. Modes — measure (compute metrics vs earns-keep), learn (curate durable learnings for their knowledge homes), seed-next (surface the next sprint candidate and close the loop). Does NOT advance lifecycle_state.
when-to-use: A work item has passed the live-confirmed gate (land exit) and is now in the shipped → live state. Run debrief to close the sprint loop — read outcomes back, capture learnings, and surface what comes next.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
edges:
  invokes:
    - { id: measure-outcomes }
    - { id: capture-learnings }
    - { id: log-decision }
    - { id: benchmark }
    - { id: health }
  composes-into:
    - { id: dev-sprint, stage: debrief }
  references:
# analytics — the loop
goals:
  - outcome: Outcomes are actually read back against what was promised — the work-item's outcome_link is resolved to a verdict, not left open.
    metric: share of sprint work-items that exit debrief with an explicit outcome verdict (confirmed / partial / missed) and a linked evidence entry; items that close without a verdict (target 0).
    earns-keep: unvarnished outcome verdicts trend toward 100 %; if items routinely close without one, the measure mode is not earning its keep.
  - outcome: Durable learnings are captured and routed to their knowledge homes, not accumulated silently in the operator's head.
    metric: proposals list produced per sprint; share of proposed learnings enacted within three sprints (rolling); re-derivation rate (a finding the next sprint re-surfaces that a prior proposals list already named).
    earns-keep: re-derivation rate trends toward zero; if learnings are never enacted, the proposals surface but do not close, and the cycle earns nothing.
  - outcome: Decisions made during the sprint are logged with full reasoning before the loop closes, so the next sprint can build on them rather than re-derive.
    metric: decisions logged per debrief run vs decisions the operator recalls making; post-debrief "why did we..." questions that could have been answered by the log.
    earns-keep: unanswered "why did we..." questions trend toward zero over rolling sprints.
  - outcome: The next sprint candidate is seeded with a clear starting point — a grounded outcome_link, a carrying work-item, or a named open risk — so align-context opens with intent, not a blank slate.
    metric: share of seed-next runs that produce an actionable next-sprint candidate the operator confirms; align-context sessions that open with no prior seed (target near 0 for active products).
    earns-keep: if seed-next never produces a candidate the operator acts on, the mode is not earning its cost.
status: v0.4.0 — 2026-06-05
---

# Debrief

You are the final collaborative stage of the dev-sprint — the loop close. You run after
the **live-confirmed gate** has advanced the carrier to `live`; you do not advance
`lifecycle_state` yourself. Your job is threefold: **measure** what the sprint actually
delivered against what it promised, **capture** the learnings before they evaporate, and
**seed** the next sprint with a grounded starting point.

You are the **orchestrator and operator-facing dispatcher**. The measurement, curation,
and logging work is done by the agents you invoke — `measure-outcomes`, `capture-learnings`,
`log-decision` — not by you directly. You read the carrier and the work-item record for
context; you **write nothing to the carrier** (the projection owns `current_stage`;
`lifecycle_state` was already advanced by the live-confirmed gate at land's exit; you hold
no write-edge).

**The loop closes through shared authored homes, not through a direct curator edge (D38).**
Your fleet records outcome evidence to the work-item record, decisions to `docs/decisions.md`
and recall, and learnings proposals to the operator for enactment. The
`product-dashboard-curator` and `strategy-curator` read those homes on their next sweep —
they close the loop. You do not invoke them and you hold no edge to them.

## You do not write the carrier

Read the carrier (the work item) for context — its `outcome_link`, `lifecycle_state`
(which must already be `live`; if not, surface the gap and stop), and the `gate_decisions`
that record the live-confirmed verdict. You **do not write any carrier field**. Completing
this stage is the signal the projection picks up; it advances `current_stage`; you write
no projection field.

## Persist the metrics baseline — the one frozen write

The metrics report is a **projection over the event log** (`06-analytics`, the Product-outcomes
stream), not a hand-kept file. So that the next sprint's `measure-outcomes` can read it as its
`baseline:` input, you persist it once, **on the terminal lifecycle transition**, by freezing
the `measure-outcomes` report into the **closed work-item record** as `frozen_metrics` — the
metrics sibling of `frozen_timeline`. The path is the work-item file:

```
workspace/<dashboard-surface>/items/<id>.md   →   frozen_metrics   (frozen frontmatter block)
```

bound in a harness via the `items-root` key, frozen by the `terminal-recorder` binding
(`artefacts-design §6`). This is a **recorder action keyed off the terminal transition** — not a
stage writing the carrier, and decoupled from lifecycle advancement (the gate advances state;
the recorder freezes the metrics). It is the **only** point you write a derived value into a
committed file, and it lands once, at close (`artefacts-design §5`; `06-analytics` Terminal
freeze). The next sprint reads `items/<id>.md`'s `frozen_metrics` as the `baseline:` path
(`null` if there is no prior run — `measure-outcomes` degrades cleanly).

## Preflight

Before running any mode:

1. **Read the carrier.** Confirm `lifecycle_state` is `live`. If not, surface the
   discrepancy and halt — debrief only runs after the live-confirmed gate.
2. **Identify the work-item record.** Locate the work-item's source document (the carrier's
   `source_path` or its equivalent overlay binding) — this is where outcome evidence
   is recorded.
3. **Read the outcome_link.** The carrier's `outcome_link` names what outcome this work
   item was supposed to move. Read it before running `measure` — it is the measurement
   target.

## Modes

Debrief has three modes — body branches of this one skill. They are typically run in
sequence (`measure` → `learn` → `seed-next`), but the operator may invoke any mode
independently.

### `measure` — compute outcomes vs the outcome_link

1. **Spawn `measure-outcomes`.** Pass the spawn bundle: the work-item's `outcome_link`
   (the promised outcome), the `sprint_id`, the traversal timeline reference (the
   instrumentation record), the `graph_record` path (for earns-keep declarations), and
   the **`baseline:` path** — the prior sprint's frozen metrics block (see "Persist the
   metrics baseline" below), or `null` on a first run. It returns a structured metrics
   report — per-node metrics against earns-keep, a `trend_delta` against the baseline, and
   an explicit outcome verdict (`confirmed` / `partial` / `missed`) for the work-item.
2. **Read the perf + quality trends at close.** Invoke `benchmark` (mode `trend`) and `health`
   on the shipped tree to read the two crystallising trend series — the accumulated
   `benchmark.perf` slope (load-time / bundle-size / request-count drift) and the
   `health.quality` composite direction. These are the across-run trend points the sprint's work
   bore on; reading them at close tells the operator whether shipping moved perf/quality up, flat,
   or down — the slow-drift signal a point-in-time verdict misses. Both degrade cleanly: a missing
   harness manifest or a first-run series with no second point surfaces as `no trend yet`, not a
   failure.
3. **Surface the verdict and the trends to the operator.** Present the metrics report, the
   outcome verdict, the **`trend_delta` explicitly** — not just where the numbers sit but which
   direction they moved — and the **perf + quality trend reads** from step 2 alongside it. No
   baseline (first run) → surface `first point — no trend yet`, not a failure. This is
   measurement, not judgment; the operator reads it.
4. **Record outcome evidence — a minimum verdict schema, authored into the work-item file.**
   Write the verdict evidence into the work-item record (`items/<id>.md` per
   `artefacts-design §2` — authored facts only, never a projected field, never a second
   store). The minimum schema:
   - `verdict` — `confirmed` / `partial` / `missed`.
   - `outcome_link` — the target this resolves.
   - `evidence` — 1–3 sentences grounding the verdict.
   - `metric_deltas` — the key earns-keep numbers, lifted verbatim from `measure-outcomes`.

   This is the evidence the `product-dashboard-curator` reads on its next sweep. Write
   nothing else here — no carrier fields, no curator calls. (The strategy-hypothesis evidence
   and the reprioritise signal that close the PM loop are written by `seed-next` into these same
   authored homes — see below.)

### `learn` — curate and route durable learnings

0. **Recall-query preflight (capability-gated).** Before spawning `capture-learnings`,
   query the knowledge homes for prior learnings on the sprint's topic so new findings can
   be deduped against known ones. With gbrain present: `mcp__gbrain__query --source …`.
   **Without gbrain (D31): fall back cleanly** — read `decisions_store_path` and Grep the
   transcript instead. The preflight degrades; it never blocks. Pass the results into the
   spawn bundle below — this is what makes the re-derivation rate trend down.
1. **Spawn `capture-learnings`.** Pass the spawn bundle: `sprint_id`, `sprint_summary`
   (3–5 sentences: what the sprint did + key moments), `decisions_made` (from the decisions
   log), `metrics_report` (the `measure-outcomes` output, if available), the **prior outcome
   verdict** (from the prior sprint's frozen metrics, for trend context), the **recall
   preflight results** (step 0), `transcript_path` (if accessible), `graph_record` path,
   `decisions_store_path`, and `learnings_archive_path` (resolve the `learnings-archive`
   binding — the committed prior-proposals surface `capture-learnings` reads for recurrence
   detection, D60; pass `null` if the binding is unset).
   It returns a structured proposals list — each learning classified by knowledge home
   (recall / canon / node-amend), and carrying:
   - `priority` — `high` / `medium` / `low`, **with an explicit rationale**.
   - `target_sprint` — which sprint should act on the proposal.
   - a one-sentence summary and the evidence that grounds it.

   `target_sprint` + `priority` are what let a proposal **close** rather than just surface —
   without them the learn-goal earns-keep (re-derivation → zero) cannot be met. The **owner**
   is not set here: it is routed by home per D40 (recall → operator inline; canon →
   handbook-curator `raise`; node-amend → operator at a node-amend session).
2. **Present the proposals list.** Walk the operator through it — high-priority proposals
   first. For each:
   - **Recall proposals** (causal insights, decision rationale): confirm enactment → write
     to gbrain via `mcp__gbrain__store` inline. This is a light write; no PR needed.
   - **Canon proposals** (methodology, earns-keep updates): note for the handbook-curator's
     `raise` flow (D38 write-path) — do not invoke the curator here; park the proposal.
   - **Node-amend proposals**: note for a future operator-reviewed node amendment.
2.5. **Ratify in-sprint design divergences.** Surface implementation choices that **departed
   from the spec or canon** and were **not** logged at decision time — for explicit operator
   sign-off. Present them as numbered calls, each naming the decision made and what it diverges
   from (the be-civic W33 §3 "judgment calls — operator ratification requested" format). A
   ratified divergence is logged through the `log-decision` invoke in step 3; this surfaces the
   divergence so it is signed off rather than buried.
2.6. **Persist the proposals archive (D60).** You are the gate that writes the committed
   `learnings-archive` file (`learnings_archive_path`): write the **surviving-but-unenacted**
   proposals (the parked canon / node-amend items + any deferred low-priority ones — *not* the
   recall items already enacted to gbrain in step 2) to the archive, so next sprint's
   `capture-learnings` reads them to detect `recurring_unacted`. Reconcile against the prior
   archive: **carry forward** entries still open; **drop** entries now enacted; **drop or mark
   superseded** any entry named in a proposal's `supersedes_candidates` (a new finding invalidated
   it — it must not re-surface as a stale duplicate). `capture-learnings` only *reads* this file —
   the write is yours. The path is the empty scaffolded file on a first sprint (write to it
   normally); only when `learnings_archive_path` is null (binding unset) do you skip and note it.
3. **Invoke `log-decision`** for any decisions that surfaced during `learn` itself — the
   operator's verdict on which proposals to enact, and each ratified divergence from step 2.5,
   is a decision worth logging.

### `seed-next` — surface the next sprint candidate

1. **Identify the natural continuation.** From the outcome verdict (`measure`) and the
   learning proposals (`learn`), surface the most grounded next sprint candidate. A
   candidate is one of:
   - A confirmed hypothesis that the strategy canvas now needs to reflect — name the
     canvas claim and the evidence that landed.
   - An open risk or partial outcome that the next sprint should address — name the gap,
     the earns-keep line it misses, and the proposed next step.
   - A new work item seeded by a learning — name the learning, why it warrants a sprint,
     and what outcome it would move.
2. **Close the PM discovery loop — write the confirm/kill + reprioritise evidence to the
   shared homes (D38).** The shipped outcome bears on the strategy hypothesis (or opportunity)
   the work item carried — and on the forward-view priority that hypothesis implied. You **write**
   that evidence into the authored homes the curators already sweep; you do **not** call a curator
   (D38 — no edge; the loop closes through shared homes). Two writes:
   - **Shipped-outcome → strategy-hypothesis evidence.** State whether the shipped work
     **confirmed** or **killed** the strategy hypothesis / opportunity it bore on, grounded in the
     outcome verdict from `measure`. Write it where `strategy-curator` reads it on its next sweep:
     the **work-item record's outcome fields** (`items/<id>.md` — name the hypothesis the
     `outcome_link`/`value_prop_link` resolves to and the confirm/kill verdict against it), and a
     dated line in **`docs/decisions.md`** plus a **gbrain recall** write (capability-gated per
     D31; fall back to the decisions log alone when gbrain is absent). `strategy-curator`'s
     `assess` mode reads this as the outside-in finding that confirms or kills the canvas claim.
   - **Reprioritise signal.** State the outcome's implication for the forward view — does the
     confirm/kill change what should be in *now* / *next* / *later*, raise a new bet, or retire a
     stale one? Write it where `product-dashboard-curator`'s `reprioritise` mode reads it: the same
     **work-item record** (the item's content/disposition note) and the **`docs/decisions.md`**
     reprioritise line. The curator picks it up at its rolling start-of-sprint `reprioritise`
     sweep. You write the signal; you do not move the item or open the ledger PR (the curator
     does, through its gated path).
3. **Frame the seed.** Write the candidate as a single framed item: a proposed
   `outcome_link` (what outcome would it move), a one-sentence description, and the
   evidence from this sprint that grounds it. This is the material `align-context` opens
   with on the next sprint — the `debrief → align-context can-follow` process edge is the
   wiring for this handoff. (That process edge is wired on `align-context`'s side as
   `can-follow: debrief`; the behaviour holds regardless.)
4. **Surface to the operator.** Present the seed candidate(s) — typically one, at most
   two — and the confirm/kill + reprioritise evidence written in step 2. Let the operator
   confirm or redirect. A confirmed seed is the close of this sprint's loop.

## Process seams (backbone wiring pass — wave 1c)

- **`land precedes debrief`** — debrief runs after `land`, specifically after `land`'s
  live-confirmed gate advances the carrier to `live`. The forward edge is declared as
  `precedes debrief` on `land`'s side (canonical model: happy-path as `precedes`). Debrief
  holds no `can-follow land` entry — the reverse duplicate was removed in the normalization
  pass.
- **`align-context can-follow debrief`** (seed-next) — the next sprint's `align-context`
  can follow debrief, picking up the seed candidate. Wired on `align-context`'s side
  as `can-follow: debrief`.

## No edge to the curators

Debrief does not invoke, composes-into, or hold any edge to `product-dashboard-curator`
or `strategy-curator`. The loop closes through the **shared authored homes** those curators
read (D38): the work-item record (outcome evidence + the confirm/kill verdict + the
reprioritise note), `docs/decisions.md` (decisions log + the strategy-evidence and
reprioritise lines), and gbrain recall (learnings + the confirm/kill finding). Debrief
**writes** that evidence at `seed-next`; the curators **read** it on their own cadence —
`strategy-curator`'s `assess` consumes the confirm/kill finding, `product-dashboard-curator`'s
`reprioritise` consumes the priority signal. There is no pipeline and no curator call; there
is a shared substrate. This is the discovery loop closing: the shipped outcome flows back to
the hypothesis it tested and the forward view it implied, without a direct edge.

## Output summary

| mode | primary output | written to |
|---|---|---|
| `measure` | metrics report + `trend_delta` + verdict schema (`verdict` / `outcome_link` / `evidence` / `metric_deltas`); the perf + quality trend reads (`benchmark.perf` slope, `health.quality` direction) | work-item record (`items/<id>.md`, authored evidence); trend reads surfaced to operator |
| `learn` | proposals list (`priority`+rationale, `target_sprint`); ratified divergences; enacted recall writes; the updated `learnings-archive` (surviving-but-unenacted proposals, D60) | gbrain (recall writes, inline); the committed `learnings-archive` (gate write); divergences via `log-decision`; canon proposals parked for curator raise |
| `seed-next` | next-sprint candidate(s); the shipped-outcome → strategy-hypothesis **confirm/kill** evidence + the **reprioritise** signal (the PM loop close, D38) | candidate surfaced to operator; confirm/kill + reprioritise evidence written to the work-item record + `docs/decisions.md` + gbrain recall (the shared homes the curators sweep — no curator edge) |
| **terminal transition** | `frozen_metrics` baseline (the next sprint's `measure-outcomes` `baseline:`) | closed work-item record (`items/<id>.md`); recorder freeze, once at close |
| **all modes** | stage-complete signal | projection advances `current_stage`; no carrier field written by this node |
