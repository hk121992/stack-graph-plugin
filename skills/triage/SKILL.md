---
name: "triage"
description: "Route an improvement to the right loop — one understood vertical slice goes incremental (scaffold a standalone-IU carrier-lite, hand to specify-slice); a change that needs design, decomposes into more than one slice, or belongs on the strategic surface goes wholesale (escalate to the dev-sprint front). The entry of the incremental-improvement arc. Use when: An improvement has been identified — an operator note, a handbook-curator drift finding, or a learn/recall hit — and it must be routed before any work starts, either built directly as a single standalone slice or escalated to the dev-sprint as a tracked work-item."
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

1. **Create or reuse a work-item carrier** at the dev-sprint front (per the work-item schema). If a
   matching work-item already exists, reuse it rather than duplicating.
2. **Record the two-way provenance link** — the work-item cites the source improvement, and the
   source (the drift finding / note / the standalone IUs that motivated it) is linked from the
   work-item. A promoted work-item without its source link is a defect (design doc §9 R5).
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

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/instrumentation-preamble.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/bindings-contract.md` — `bindings-contract`
- `references/work-item-schema.md` — `work-item-schema`

