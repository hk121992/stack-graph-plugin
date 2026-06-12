---
# identity — native .claude (the builder emits the primitive from these)
id: triage
primitive: skill
title: Triage
description: Capture and decide when the operator says "raise an IU" — route the improvement (technical/bug-shaped, specification derivable from carrier + codebase ⇒ incremental; needs a product/design decision ⇒ wholesale), then on the incremental branch harvest the live conversation into the carrier's definition body (Context + Decisions) and ask only the genuine remaining decisions, so the carrier is decision-complete from raise time. Use when an improvement comes up mid-session and must be captured and routed before work starts. The entry of the incremental-improvement arc.
when-to-use: The operator says "raise an IU" — an improvement has come up (an operator note mid-session, a handbook-curator drift finding, or a learn/recall hit) and must be captured and routed before any work starts, either built directly as a single standalone slice (and defined here, on the spot) or escalated to the dev-sprint as a tracked work-item.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
# triage is the ENTRY of the `incremental` arc and the raise-time CAPTURE-AND-DECIDE node (D67 /
# loop-runner-design §10): ALL operator questions happen here, on the spot, in the session that holds
# the context. On the incremental branch it scaffolds the identity stub AND writes the definition body
# (Context + Decisions) on the carrier, gated by the cold-handoff test — so the carrier is
# decision-complete from raise time and `specify-slice` can run UNATTENDED in a loop-runner-dispatched
# session. Edges are UNCHANGED by the reshape. The incremental branch `precedes specify-slice` (the
# next stage; now formalise-and-enforce, not collaborative define). The wholesale branch `escalates
# align-context` — a one-way CROSS-ARC handoff to the dev-sprint front entry, NOT `precedes` (design
# §9 R3): excluded from arc traversal + stage projection so an escalation never reads as ordinary
# next-stage flow. It references IU-schema (import — it writes the standalone stub + the definition
# body, gated by the cold-handoff loop-eligibility invariant homed there), bindings-contract (on-demand
# — resolves improvements-root / -manifest / triage-source at scaffold/seed), and
# instrumentation-preamble (import); work-item-schema (on-demand — the wholesale escalation target's
# carrier shape). The `triage-source` seed is a BINDING read (a convention read on demand), not a
# `references`/`invokes` edge — described in prose. triage runs no agent (no `invokes`) and is the
# entry (no `can-follow`).
edges:
  composes-into:
    - { id: incremental, stage: triage }
  references:
    - { id: IU-schema,                 load: import }
    - { id: bindings-contract,         load: on-demand }
    - { id: work-item-schema,          load: on-demand }
  precedes:
    - { id: specify-slice }
  escalates:
    - { id: align-context }
# analytics — the loop
goals:
  - outcome: Every improvement is routed to the right loop — a single understood slice goes incremental, a design/decomposition/tracked-work change goes wholesale.
    metric: share of triaged items that reach their terminal state in the loop triage chose without a later re-route (an incremental item that should have been a work-item, or a promote after build).
    earns-keep: mis-routes (later re-routes / promotes-after-build) trend toward zero over N items; if triage's route is routinely overturned downstream, the route rule or the node is not earning its place.
  - outcome: A standalone IU is never created for work that should be a work-item — the light loop never silently grows into a sprint.
    metric: count of standalone IUs that later grow a design fork or a second slice and must be promoted post-scaffold.
    earns-keep: post-scaffold promotions stay rare; a rising rate means triage is admitting wholesale work as incremental and the tie-breakers need tightening.
  - outcome: Wholesale changes are escalated cleanly with provenance — the dev-sprint front receives them with a recorded source link, never built as a degenerate slice.
    metric: share of escalations that carry a two-way provenance link (work-item ↔ source) vs escalations recorded as prose only.
    earns-keep: every escalation carries the provenance bridge; an escalation that loses the link is a defect.
  - outcome: Every incremental carrier is decision-complete at raise time — a fresh agent could implement and prove the slice from the carrier file and repo alone, with no operator question left for the loop.
    metric: share of dispatched standalone IUs that route out blocked (insufficiently-defined) or generate a mid-loop operator question — the carriers triage handed off that failed the cold-handoff test downstream.
    earns-keep: insufficiently-defined route-outs and mid-loop questions trend to zero; a rising rate means triage's raise-time capture is failing its invariant and the captured context or decisions are incomplete.
status: v0.2.0 — 2026-06-10
---

# Triage

You are the **entry** of the incremental-improvement arc (`incremental`) — the lighter loop beside
the dev-sprint — and the **raise-time capture-and-decide** node. The operator says **"raise an IU"**
when something comes up mid-session; you **decide which loop it belongs in** and, on the incremental
branch, **capture the full definition on the spot** so the carrier is decision-complete from raise
time. **All operator questions happen here.** You own the route decision, the instance scaffold, and
the carrier's **definition body** — you do **not** write the IU's content fields (`goal`, `files`,
`acceptance`, `acceptance_check`, `size`, `slice_type`, `verification` — those are `specify-slice`'s,
which you precede), and you do **not** run the dev-sprint front yourself (you escalate to it).

Two outcomes, and only two:

- **Incremental** — one understood vertical slice, technical/bug-shaped, with no product or design
  decision left open. Scaffold a standalone-IU carrier-lite at `improvements-root`, **write its
  definition body** (Context + Decisions), add it to the manifest, and hand it to `specify-slice`.
- **Wholesale** — the change needs a design decision, decomposes into more than one slice, or belongs
  on the strategic surface. **Escalate** to the dev-sprint front (`align-context`). Create **no**
  standalone IU.

**Why the capture matters.** An incremental IU runs in the loop **only when every relevant decision
is already made.** `specify-slice` now runs as a mechanical formalise-and-enforce pass — typically
**unattended**, inside a session `loop-runner` dispatched (`specify-slice → build → review` against
the carrier file alone). It asks the operator nothing. So the carrier you hand off must already hold
everything a fresh agent needs: that is what makes it **loop-eligible** (the cold-handoff test
below). Capture is your job; formalisation is `specify-slice`'s.

**Propose, don't interrogate.** The raising session already holds the context — definition is a
*capture*, not an interview. Harvest first, derive what the repo can answer, and ask the operator
**only the genuine remaining decisions** (typically 0–2). Light by design: the discipline is that the
route is *decided* and the definition is *complete*, not that the conversation is laborious.

Emit the instrumentation enter/exit events (the imported preamble); these are emitted, not a carrier
write.

## When to invoke

Invoke when the operator says **"raise an IU"** — an improvement has come up (an operator note
mid-session, a handbook-curator drift finding, or a `learn`/recall hit) and must be captured and
routed before any work starts. The trigger is usually mid-session, in the conversation that already
holds the context — which is exactly why capture (not an interview) is the discipline. The operator
may pass the improvement statement and, optionally, the `triage-source` it was raised from. If the
candidate came from a `triage-source` queue, **confirm it with the operator first** — a seeded
candidate is a suggestion, not an instruction to create work (the auto-feed is input-gated; you read
the binding, you do not auto-spawn).

## The route rule

Apply this rule (design doc §1). **Wholesale** if **any** holds; otherwise **incremental**:

1. **Does it need `design`?** An unresolved architectural fork ⇒ wholesale — the fork is exactly what
   the sprint's `design` stage exists to settle. An obvious approach ⇒ incremental.
2. **Does it decompose?** More than one buildable slice that must be sequenced and planned together ⇒
   wholesale. Exactly one slice ⇒ incremental.
3. **Would a stakeholder track it?** Progress that belongs on the product-dashboard strategic surface
   (it advances an objective, it is operator-visible product work) ⇒ wholesale. Internal
   craft/maintenance ⇒ incremental.

**The decisive tie-breaker — technical/bug-shaped (design §10).** Incremental is **work whose
specification is derivable from the carrier + codebase with no product or design judgment** — a bug
with a known repro, a tightening with an obvious shape, a mechanical change the code itself answers.
**Anything that needs a product decision ⇒ wholesale.** If settling the slice would require a call
only the operator/product can make (what the behaviour *should* be, not how to build the agreed
behaviour), it is not loop work — escalate it. This is the loop-scope discriminator; when the three
tie-breakers above disagree, it settles the route.

If the answer is still genuinely unclear, that *is* a remaining decision — ask the operator one
specific question now (you are with them at raise) and let them settle it; do not guess a route that
costs a later promote. Take a position; state which tie-breaker is decisive and why.

## Incremental branch — scaffold, capture, hand off

1. **Name the `improves` target.** A typed pointer to the existing thing the slice touches:
   `{ kind: node | reference | handbook-reference | behaviour, id: <slug-or-path> }`. Because the
   factory improves itself, this is most often a graph node or a `_refs/` reference. A standalone IU
   serves an existing thing, not an OKR — there is no `outcome_link`.
2. **Scaffold the instance file** at `improvements-root/<id>.md` (resolve `improvements-root` via the
   bindings). Write the **frontmatter stub** per the IU-schema **standalone shape** — identity only,
   no content fields yet (those are `specify-slice`'s):
   - `id` + `title` — the slice's identity: a stable slug (the manifest key) and a short human
     label. The schema requires these even on a `proposed` stub.
   - `channel: incremental` (no `parent` — this is the standalone discriminator)
   - `improves:` the target from step 1
   - `lifecycle_state: proposed` (you author this state; it is workflow state, not gated)
   - `status: planned` (build-tracking, a different axis from `lifecycle_state`)
   - `gate_decisions: []` (empty until the single `commit-to-land` gate fires at `land`)
3. **Write the definition body** on the carrier — two body sections (NOT schema fields; the content
   *fields* stay `specify-slice`'s). This is the raise-time capture:
   - **`## Context`** — harvested from the live conversation: the **observed vs expected** behaviour,
     the **repro**, the **error output**, and **file/scope pointers** for where the change lands.
     Capture the evidence **VERBATIM** — paste the actual error text, the actual repro steps, the
     real paths. **Never write "see this conversation"**: the agent that picks this carrier up is a
     fresh session with no access to it. Frame the intent as an **outcome** (what is true after the
     slice), not a task.
   - **`## Decisions`** — every call settled in the raise conversation, **including the AFK/HITL
     call** (whether the loop can build → review → land it unattended, or it carries a human
     decision/review point and where) and **any dependency on another open standalone IU** ("depends
     on `<id>`", or none) — the loop schedules on this record before the field is formalised. You
     record the *decision*; `specify-slice` formalises it into `slice_type` (and `hitl_point` when
     HITL) and `dependencies`. Any fork that came up and was resolved is recorded here as a settled
     decision — not left open in prose.
4. **Capture discipline — propose, don't interrogate.** Harvest the conversation first. Derive what
   the **repo** can answer (you may note `explore` for mechanical detail that `specify-slice` will
   resolve in-session). Then ask the operator **only the genuine remaining decisions** — typically
   **0–2 questions**, because the raising session already holds the context. Do not interview the
   operator for what is already on screen or answerable from the code.
5. **Gate the handoff on the cold-handoff test** (below). A carrier that fails it does not hand off —
   settle the gap now, escalate, or do not raise the IU.
6. **Add the manifest entry** to `improvements-manifest`:
   `{id, file, improves, slice_type, lifecycle_state}` (`slice_type` is null until `specify-slice`
   tags it from your recorded decision).
7. **Hand to `specify-slice`.** A **decision-complete carrier is loop-eligible** — that is what lets
   `specify-slice` run **unattended** in a `loop-runner`-dispatched session. It **formalises** your
   captured definition into the content fields (`goal`, `files`, `acceptance`, `acceptance_check`,
   `size`, `verification`), formalises `slice_type` (`AFK`/`HITL`) from your recorded decision, and
   **enforces** the vertical-slice + testing invariants — asking nothing, routing out on a gap. You
   do **not** write those content fields and you do **not** enforce those invariants — that is its
   job. Your capture is what makes its unattended pass possible.

You write the stub frontmatter, the **definition body** (Context + Decisions), and the manifest row.
You do not advance `lifecycle_state` past `proposed`, you do not write any content field, and you do
not record a gate decision — the build-enter event sets `in-delivery` and the single `land` gate
writes the terminal state.

## The cold-handoff test (the completeness invariant)

You may **not** hand off a carrier that fails this test:

> **A fresh agent, with only this carrier file and repo access, could implement and prove the slice.**

It is field-proven (a chip-spawned cold session built a slice off the carrier alone) and homed in
`IU-schema` as the **loop-eligibility invariant**: a `proposed` stub without a passing definition
body is a valid intra-conversation state but is **never loop-eligible**. Checklist before handoff:

- **Outcome-framed intent in `## Context`** — what is true after the slice, not "fix the thing".
- **Evidence verbatim** — the real error/repro/pointers are in the file, not "see this conversation".
- **Scope pointers real** — the files/paths named exist and are where the change lands.
- **Dependencies named or none** — any dependency on another open standalone IU is recorded in
  `## Decisions` (the loop's scheduler reads it at intake, before `dependencies` is formalised).
- **No unresolved decision left in prose** — every fork is either settled now (recorded in
  `## Decisions`), escalated (the route is wholesale), or the IU is not raised. An open question in
  the body is a failed handoff: the loop would surface it as a mid-loop operator question or route
  the carrier out `blocked: insufficiently-defined`.

If the test fails, you are not done: settle the gap with the operator (you are with them), escalate
if it turns out to need a product/design decision, or do not raise the IU.

## Wholesale branch — escalate, do not build

When the route is wholesale, hand off to the dev-sprint front via the `escalates align-context` edge.
This is a one-way cross-arc handoff, **not** ordinary next-stage flow:

1. **Create or reuse a work-item carrier** at the dev-sprint front — via
   **`product-dashboard-curator` (its `add-item` mode)**, per `work-item-schema`. If a matching
   work-item already exists, reuse it rather than duplicating.
2. **Record the two-way provenance** — the new work-item cites the source improvement
   (`promoted_from`), and the source (the drift finding / note / the standalone IUs that motivated
   it) is linked from the work-item. When a *standalone IU* was promoted, close it `dropped`
   (reason: promoted) with a pointer to the work-item. A promoted work-item without its source link
   is a defect (design doc §9 R5).
3. **Create no standalone IU.** Escalation means the change goes through the full front
   (`align-context → design → specify → plan`); a standalone carrier-lite is wrong for it. (When a
   *standalone IU already exists* and is being promoted mid-loop, that is the promote path: the
   existing IU is closed `dropped`, reason promoted, and cited by the new work-item — design doc Fork
   E. At triage there is usually no IU yet, so you simply do not create one.)

## Output

- **Incremental** — a scaffolded standalone-IU instance file at `improvements-root/<id>.md` (stub
  frontmatter **plus the definition body** — `## Context` + `## Decisions`), decision-complete and
  passing the cold-handoff test, a manifest entry, handed to `specify-slice`. Node-exit outcome:
  `routed-incremental`.
- **Wholesale** — a created-or-reused work-item carrier at the dev-sprint front with a two-way
  provenance link, **no** standalone IU. Node-exit outcome: `escalated-wholesale`.
- **All routes** — the enter/exit instrumentation events. You write the definition body but **no IU
  content field** (those are `specify-slice`'s) and record no gate decision.
