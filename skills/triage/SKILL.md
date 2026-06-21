---
name: "triage"
description: "Capture and decide when the operator says \"raise an IU\" — route the improvement (technical/bug-shaped, specification derivable from carrier + codebase ⇒ incremental; needs a product/design decision ⇒ wholesale), then on the incremental branch harvest the live conversation into the carrier's definition body (Context + Decisions) and ask only the genuine remaining decisions, so the carrier is decision-complete from raise time. Use when an improvement comes up mid-session and must be captured and routed before work starts. The entry of the incremental-improvement arc. Use when: The operator says \"raise an IU\" — an improvement has come up (an operator note mid-session, a handbook-curator drift finding, or a learn/recall hit) and must be captured and routed before any work starts, either built directly as a single standalone slice (and defined here, on the spot) or escalated to the dev-sprint as a tracked work-item."
---


# Triage

You are the **entry** of the incremental-improvement arc (`incremental`) — the lighter loop beside
the dev-sprint — and the **raise-time capture-and-decide** node. The operator says **"raise an IU"**
when something comes up mid-session; you run **ONE path**: **capture → drive to decision-complete →
classify**. You **capture the full definition on the spot** so the carrier is decision-complete from
raise time. **All operator questions happen here.** You own the instance scaffold, the carrier's
**definition body**, and the **AFK/HITL classification** — you do **not** write the IU's content
fields (`goal`, `files`, `acceptance`, `acceptance_check`, `size`, `slice_type`, `verification` —
those are `specify-slice`'s, which you precede), you do **not** do depth/tool routing (that is
`working-session`'s, reached when the work needs depth), and you do **not** run the front yourself
(you continue into it).

**The single path — capture → dec-complete → classify.** You do **not** take a route decision at
raise. You capture, then drive the work to decision-complete: a small one you **finish in place** (ask
the genuine remaining decisions and settle them with the operator, who is with you); a deeper one you
**continue into `working-session`** (the one router for depth/tool) to get there. Either way the path
terminates in the same first-class output: a **decision-complete IU classified AFK/HITL**. Run the
classifier (`routing-principles` §4) and **emit its one-line trace** — so a mis-classification is
observable and the rule sharpens.

- **Finish small ones in place → the loop.** When the work is decision-complete (or one or two
  closeable questions short, settled on the spot), scaffold a standalone-IU carrier-lite at
  `improvements-root`, **write its definition body** (Context + Decisions), **classify** it (AFK/HITL
  + trace), and hand it to `specify-slice`. You write the **carrier only** — the manifest is a
  coordinator-regenerated derived index (`refresh-manifest`), not yours to hand-write. Do not continue
  to the front for a gap you can close.
- **Continue deeper ones into the front.** When the work carries unresolved product/design forks,
  decomposes into work that must be planned together, or belongs on the strategic surface — it needs a
  worked design pass to reach dec-complete. **Continue** into the unified-front orchestrator
  (`working-session`), which owns the depth/tool routing and applies the same classifier at its raise
  terminus. Create **no** standalone IU here — the continuation produces it.

You **consult** the classifier (`routing-principles` §4, AFK/HITL slice classifier) and the
who-resolves altitude line; you do **not** restate either rule here — you apply them.

**Why the capture matters.** An incremental IU runs in the loop **only when every relevant decision
is already made.** `specify-slice` now runs as a mechanical formalise-and-enforce pass — typically
**unattended**, inside a session `loop-runner` dispatched (`specify-slice → build → review` against
the carrier file alone). It asks the operator nothing. So the carrier you hand off must already hold
everything a fresh agent needs: that is what makes it **loop-eligible** (the cold-handoff test
below). Capture is your job; formalisation is `specify-slice`'s.

**Propose, don't interrogate.** The raising session already holds the context — definition is a
*capture*, not an interview. Harvest first, derive what the repo can answer, and ask the operator
**only the genuine remaining decisions** (typically 0–2). Light by design: the discipline is that the
definition is *complete* and the slice is *classified*, not that the conversation is laborious.

Emit the instrumentation enter/exit events (the imported preamble); these are emitted, not a carrier
write.

## When to invoke

Invoke when the operator says **"raise an IU"** — an improvement has come up (an operator note
mid-session, a handbook-curator drift finding, or a `learn`/recall hit) and must be captured and
driven to dec-complete before any work starts. The trigger is usually mid-session, in the conversation
that already holds the context — which is exactly why capture (not an interview) is the discipline. The operator
may pass the improvement statement and, optionally, the `triage-source` it was raised from. If the
candidate came from a `triage-source` queue, **confirm it with the operator first** — a seeded
candidate is a suggestion, not an instruction to create work (the auto-feed is input-gated; you read
the binding, you do not auto-spawn).

## The single path — capture, drive to dec-complete, classify

You run **one path**, not a route decision. You capture the work, then **drive it to
decision-complete** — and **classify** the result AFK/HITL. The only branch is *where* dec-complete is
reached: **in place** (you finish a small one yourself) or **in the front** (you continue a deeper one
into `working-session`). You do **not** assess depth-and-tool here — that is the front's, reached only
when the work deepens. Two dispositions of the drive-to-dec-complete:

- **Finish small ones in place → the loop.** No unresolved or auto-resolved load-bearing decision
  stands open, or only one or two closeable questions do — settle them with the operator on the spot
  (you are with them), capture, and a fresh agent could then build and prove the slice (the
  cold-handoff bar). Scaffold the carrier, capture its definition, **classify it**, and hand to
  `specify-slice`. Closing a closeable gap is your job; **do not continue to the front for a gap you
  can close here.**
- **Continue deeper ones into the front.** Unresolved product/design forks, work that decomposes and
  must be planned together, or progress that belongs on the strategic surface — it needs a worked
  design pass to reach dec-complete. **Continue** into `working-session` (below) — the one router for
  depth/tool, which applies the same classifier at its raise terminus. Create no standalone IU here.

If it is genuinely unclear whether the gap is closeable in place after harvesting, that *is* a
remaining decision — ask the operator one specific question now and let them settle whether you finish
it here or continue into the front; do not guess and cost a later re-route. Take a position; state
where you are driving the work and why.

**Classify on the in-place disposition.** Before handing a carrier to `specify-slice`, run the
classifier (`routing-principles` §4, AFK/HITL slice classifier) over the settled slice and **emit its
one-line trace** naming the fired trigger — `AFK` when the loop can build → review → land it
unattended, `HITL` (+ `hitl_point`) when a human decision/review point stands. You **consult** the
rule; you do not restate it. The continuation disposition carries classification with it: the front
applies the same classifier at its raise terminus.

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
     classification** (run the `routing-principles` §4 classifier over the settled slice and record its
     result — `AFK`, or `HITL` + where the human point falls — **with the one-line trace** naming the
     fired trigger, so a mis-classification is observable) and **any dependency on another open
     standalone IU** ("depends on `<id>`", or none) — the loop schedules on this record before the
     field is formalised. You record the *decision + trace*; `specify-slice` formalises it into
     `slice_type` (and `hitl_point` when HITL) and `dependencies`. Any fork that came up and was
     resolved is recorded here as a settled decision — not left open in prose.
4. **Capture discipline — propose, don't interrogate.** Harvest the conversation first. Derive what
   the **repo** can answer (you may note `explore` for mechanical detail that `specify-slice` will
   resolve in-session). Then ask the operator **only the genuine remaining decisions** — typically
   **0–2 questions**, because the raising session already holds the context. Do not interview the
   operator for what is already on screen or answerable from the code.
5. **Gate the handoff on the cold-handoff test** (below). A carrier that fails it does not hand off —
   settle the gap now, continue into the front, or do not raise the IU.
6. **Hand to `specify-slice`.** A **decision-complete carrier is loop-eligible** — that is what lets
   `specify-slice` run **unattended** in a `loop-runner`-dispatched session. It **formalises** your
   captured definition into the content fields (`goal`, `files`, `acceptance`, `acceptance_check`,
   `size`, `verification`), formalises `slice_type` (`AFK`/`HITL`) from your recorded decision, and
   **enforces** the vertical-slice + testing invariants — asking nothing, routing out on a gap. You
   do **not** write those content fields and you do **not** enforce those invariants — that is its
   job. Your capture is what makes its unattended pass possible.

You write the stub frontmatter and the **definition body** (Context + Decisions) — the **carrier
`.md` only**. You do **not** hand-write the manifest row: the manifest is a committed derived index,
**coordinator-regenerated by `refresh-manifest`** after the carrier lands (the loop-runner-side
regeneration `loop-runner` already presumes — see its derived-index contract; do not restate it here).
You do not advance `lifecycle_state` past `proposed`, you do not write any content field, and you do
not record a gate decision — the build-enter event sets `in-delivery`, and the single `land` gate's
terminal state is written by `record-gate` (the single mechanical writer), never here.

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
  `## Decisions`), continued into the front (the work needs a worked design pass), or the IU is not
  raised. An open question in the body is a failed handoff: the loop would surface it as a mid-loop
  operator question or route the carrier out `blocked: insufficiently-defined`.

If the test fails, you are not done: settle the gap with the operator (you are with them), continue
into `working-session` if it turns out to need a worked design pass, or do not raise the IU.

## Continuation branch — the work needs depth, continue into the front

When driving to dec-complete needs a worked design pass, the single path **continues** into the
unified front via the `escalates working-session` edge — this is the *deeper* disposition of the one
path, not a separate up-front route. It is a one-way cross-arc handoff, **not** ordinary next-stage
flow (graph-record + stage-projection semantics unchanged — the edge is excluded from arc traversal):

1. **Create or reuse the work-item carrier** via the **`raise` action** — the front's create action
   (`product-dashboard-conventions`): raise creates the carrier with identity + initial content, placed
   by content in the forward view (never by setting lifecycle or stage). Absorb the **frame** shaping
   here — turn the raw idea/note/finding into a problem-framed-and-laddered work item (a problem, not a
   pre-committed feature; an authored `outcome_link`) as you raise it, per `work-item-schema`. If a
   matching work-item already exists, reuse it rather than duplicating.
2. **Record the two-way provenance** — the new work-item cites the source improvement
   (`promoted_from`), and the source (the drift finding / note / the standalone IUs that motivated
   it) is linked from the work-item. When a *standalone IU* was promoted, close it `dropped`
   (reason: promoted) with a pointer to the work-item. A promoted work-item without its source link
   is a defect (design doc §9 R5).
3. **Create no standalone IU.** Continuation means the change goes through the front
   (`design → specify → plan`, with `working-session` orchestrating); a standalone carrier-lite is
   wrong for it. (When a *standalone IU already exists* and is being promoted mid-loop, that is the
   promote path: the existing IU is closed `dropped`, reason promoted, and cited by the new work-item —
   design doc Fork E. At triage there is usually no IU yet, so you simply do not create one.)

## Output

The single path's first-class output is a **decision-complete IU classified AFK/HITL** (+ the one-line
classifier trace). Two dispositions of *where* dec-complete is reached:

- **Finished in place** — a scaffolded standalone-IU instance file at `improvements-root/<id>.md` (stub
  frontmatter **plus the definition body** — `## Context` + `## Decisions`, the recorded AFK/HITL
  classification + trace among the Decisions), decision-complete and passing the cold-handoff test,
  handed to `specify-slice`. You write the **carrier only**; the manifest row is regenerated by
  `refresh-manifest`, not written here. Node-exit outcome: `finished-in-place`.
- **Continued to the front (needs a worked design pass)** — a created-or-reused work-item carrier,
  raised (and frame-shaped) for the unified front (`working-session`) with a two-way provenance link,
  **no** standalone IU here (the continuation produces it, classified at the front's raise terminus).
  Node-exit outcome: `continued-to-front`.
- **Both dispositions** — the enter/exit instrumentation events. You write the definition body but **no
  IU content field** (those are `specify-slice`'s) and record no gate decision.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/routing-principles.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/bindings-contract.md` — `bindings-contract`
- `references/work-item-schema.md` — `work-item-schema`

