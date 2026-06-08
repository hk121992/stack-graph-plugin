---
# identity — native .claude (the builder emits the primitive from these)
id: triage
primitive: skill
title: Triage
description: Route an improvement to the right loop — one understood vertical slice goes incremental (scaffold a standalone-IU carrier-lite, hand to specify-slice); a change that needs design, decomposes into more than one slice, or belongs on the strategic surface goes wholesale (escalate to the dev-sprint front). The entry of the incremental-improvement arc.
when-to-use: An improvement has been identified — an operator note, a handbook-curator drift finding, or a learn/recall hit — and it must be routed before any work starts, either built directly as a single standalone slice or escalated to the dev-sprint as a tracked work-item.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
# triage is the ENTRY of the `incremental` arc. The incremental branch `precedes specify-slice`
# (the next stage, authored in the same batch — the edge is part of the self-contained arc edge-set,
# design §8 step 8). The wholesale branch `escalates align-context` — a one-way CROSS-ARC handoff to
# the dev-sprint front entry, NOT `precedes` (design §9 R3): excluded from arc traversal + stage
# projection so an escalation never reads as ordinary next-stage flow. It references IU-schema
# (import — it writes the standalone stub), bindings-contract (on-demand — resolves improvements-root /
# -manifest / triage-source at scaffold/seed), and instrumentation-preamble (import). The
# `triage-source` seed is a BINDING read (a convention read on demand), not a `references`/`invokes`
# edge — described in prose. triage runs no agent (no `invokes`) and is the entry (no `can-follow`).
edges:
  composes-into:
    - { id: incremental, stage: triage }
  references:
    - { id: IU-schema,                 load: import }
    - { id: bindings-contract,         load: on-demand }
    - { id: instrumentation-preamble,  load: import }
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
status: v0.1.0 — 2026-06-04
---

# Triage

You are the **entry** of the incremental-improvement arc (`incremental`) — the lighter loop beside
the dev-sprint. An improvement has been identified; you decide **which loop it belongs in** and set
it on its way. You own **the route decision and the instance scaffold only**: you do **not** write
the IU's content fields (that is `specify-slice`, which you precede) and you do **not** run the
dev-sprint front yourself (you escalate to it).

Two outcomes, and only two:

- **Incremental** — one understood vertical slice. Scaffold a standalone-IU carrier-lite at
  `improvements-root`, add it to the manifest, and hand it to `specify-slice`.
- **Wholesale** — the change needs a design decision, decomposes into more than one slice, or belongs
  on the strategic surface. **Escalate** to the dev-sprint front (`align-context`). Create **no**
  standalone IU.

Light by design. An obvious, low-risk AFK slice may pass straight through with a thin check — the
point is that the route is *decided*, not that it is laborious.

Emit the instrumentation enter/exit events (the imported preamble); these are emitted, not a carrier
write.

## When to invoke

Invoke when an improvement is identified — an operator note, a handbook-curator drift finding, or a
`learn`/recall hit — and it must be routed before any work starts. The operator may pass the
improvement statement and, optionally, the `triage-source` it was raised from. If the candidate came
from a `triage-source` queue, **confirm it with the operator first** — a seeded candidate is a
suggestion, not an instruction to create work (the auto-feed is input-gated; you read the binding, you
do not auto-spawn).

## The route rule

Apply this rule (design doc §1). **Wholesale** if **any** holds; otherwise **incremental**:

1. **Does it need `design`?** An unresolved architectural fork ⇒ wholesale — the fork is exactly what
   the sprint's `design` stage exists to settle. An obvious approach ⇒ incremental.
2. **Does it decompose?** More than one buildable slice that must be sequenced and planned together ⇒
   wholesale. Exactly one slice ⇒ incremental.
3. **Would a stakeholder track it?** Progress that belongs on the product-dashboard strategic surface
   (it advances an objective, it is operator-visible product work) ⇒ wholesale. Internal
   craft/maintenance ⇒ incremental.

When the tie-breakers disagree or the answer is genuinely unclear, ask the operator one specific
question and let them settle it — do not guess a route that costs a later promote. Take a position;
state which tie-breaker is decisive and why.

## Incremental branch — scaffold and hand off

1. **Name the `improves` target.** A typed pointer to the existing thing the slice touches:
   `{ kind: node | reference | handbook-reference | behaviour, id: <slug-or-path> }`. Because the
   factory improves itself, this is most often a graph node or a `_refs/` reference. A standalone IU
   serves an existing thing, not an OKR — there is no `outcome_link`.
2. **Scaffold the instance file** at `improvements-root/<id>.md` (resolve `improvements-root` via the
   bindings). Write the **frontmatter stub** per the IU-schema **standalone shape** — no content
   fields yet (those are `specify-slice`'s):
   - `id` + `title` — the slice's identity: a stable slug (the manifest key) and a short human
     label. The schema requires these even on a `proposed` stub.
   - `channel: incremental` (no `parent` — this is the standalone discriminator)
   - `improves:` the target from step 1
   - `lifecycle_state: proposed` (you author this state; it is workflow state, not gated)
   - `status: planned` (build-tracking, a different axis from `lifecycle_state`)
   - `gate_decisions: []` (empty until the single `commit-to-land` gate fires at `land`)
3. **Add the manifest entry** to `improvements-manifest`:
   `{id, file, improves, slice_type, lifecycle_state}` (`slice_type` is filled at `specify-slice`).
4. **Hand to `specify-slice`.** It fills the content fields (`goal`, `files`, `acceptance`,
   `acceptance_check`, `verification`), sets `slice_type` (`AFK`/`HITL`), and enforces the
   vertical-slice + testing invariants. You do **not** write those fields and you do **not** enforce
   those invariants — that is its job.

You write **only** the stub frontmatter and the manifest row. You do not advance `lifecycle_state`
past `proposed`, and you do not record a gate decision — the build-enter event sets `in-delivery` and
the single `land` gate writes the terminal state.

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
  frontmatter only), a manifest entry, handed to `specify-slice`. Node-exit outcome:
  `routed-incremental`.
- **Wholesale** — a created-or-reused work-item carrier at the dev-sprint front with a two-way
  provenance link, **no** standalone IU. Node-exit outcome: `escalated-wholesale`.
- **All routes** — the enter/exit instrumentation events. You write no IU content field and record no
  gate decision.
