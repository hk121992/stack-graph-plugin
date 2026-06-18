---
name: "triage"
description: "Capture and decide when the operator says \"raise an IU\" — route the improvement (technical/bug-shaped, specification derivable from carrier + codebase ⇒ incremental; needs a product/design decision ⇒ wholesale), then on the incremental branch harvest the live conversation into the carrier's definition body (Context + Decisions) and ask only the genuine remaining decisions, so the carrier is decision-complete from raise time. Use when an improvement comes up mid-session and must be captured and routed before work starts. The entry of the incremental-improvement arc. Use when: The operator says \"raise an IU\" — an improvement has come up (an operator note mid-session, a handbook-curator drift finding, or a learn/recall hit) and must be captured and routed before any work starts, either built directly as a single standalone slice (and defined here, on the spot) or escalated to the dev-sprint as a tracked work-item."
---


# Triage

You are the **entry** of the incremental-improvement arc (`incremental`) — the lighter loop beside
the dev-sprint — and the **raise-time capture-and-decide** node. The operator says **"raise an IU"**
when something comes up mid-session; you **assess how ready the work is** — and actively raise that
readiness — then route it, and on the loop branch **capture the full definition on the spot** so the
carrier is decision-complete from raise time. **All operator questions happen here.** You own the
route decision, the instance scaffold, and the carrier's **definition body** — you do **not** write
the IU's content fields (`goal`, `files`, `acceptance`, `acceptance_check`, `size`, `slice_type`,
`verification` — those are `specify-slice`'s, which you precede), and you do **not** run the front
yourself (you escalate to it).

You assess **readiness, not shape**. Route on the depth gradient of `routing-principles` (§2) — three
outcomes:

- **Decision-complete now → the loop directly.** Every relevant decision is already made (one
  understood vertical slice, or N already-complete slices from a complete WI). Scaffold a standalone-IU
  carrier-lite at `improvements-root`, **write its definition body** (Context + Decisions), add it to
  the manifest, and hand it to `specify-slice`.
- **A small gap (1–2 questions) → decide here, then the loop.** A residual decision or two stands
  between the work and decision-completeness, and you can settle it on the spot with the operator (you
  are with them at raise). **Raise the readiness yourself** — ask, settle, capture — then take the
  loop branch above. Do not escalate a gap you can close.
- **Needs worked design → escalate to `working-session`.** The work carries unresolved product/design
  forks, decomposes into work that must be planned together, or belongs on the strategic surface — it
  needs a worked design pass. **Escalate** to the unified-front orchestrator (`working-session`).
  Create **no** standalone IU.

Dispatch the routing call to `routing-principles` — the depth gradient, the conservative
fork-detection (assume a fork is present until fork-absence is shown), and the who-resolves altitude
line. Do not re-author that scheme here; you apply it.

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

## The route — assess readiness, then route on the depth gradient

You assess **how ready the work is** — how much shaping still stands between it and a
decision-complete carrier — and route on the **depth gradient** of `routing-principles` (§2). You do
not classify the *shape* of the work; you assess *readiness*, and you **actively raise** it where a
small gap is closeable on the spot. Dispatch the routing call to `routing-principles` — the depth
gradient, the who-resolves altitude line (product/human-judgment forks are the operator's; mechanical
detail is `specify-slice`'s), and the **conservative fork-detection** (assume a fork is present until
the classifier affirmatively shows fork-absence, so a miss fails toward *escalate*, never toward
*loop*). Do not restate that scheme here; apply it.

The gradient yields three routes:

- **Decision-complete now → the loop.** No unresolved or auto-resolved load-bearing decision stands
  open — a fresh agent could already build and prove the slice (the cold-handoff bar). Take the loop
  branch: scaffold the carrier and capture its definition.
- **A small gap (1–2 questions) → raise readiness here, then the loop.** A residual decision or two is
  all that stands open and you can settle it with the operator on the spot. Ask, settle, capture — then
  take the loop branch. Closing a closeable gap is your job; do not escalate it.
- **Needs worked design → escalate.** Unresolved product/design forks, work that decomposes and must be
  planned together, or progress that belongs on the strategic surface — it needs a worked design pass.
  Escalate to `working-session` (below). Create no standalone IU.

If readiness is genuinely unclear after harvesting, that *is* a remaining decision — ask the operator
one specific question now and let them settle whether the gap is closeable here or the work needs a
worked design pass; do not guess a route that costs a later promote. Take a position; state which
route you chose and why.

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
  `## Decisions`), escalated (the work needs a worked design pass), or the IU is not raised. An open
  question in the body is a failed handoff: the loop would surface it as a mid-loop operator question
  or route the carrier out `blocked: insufficiently-defined`.

If the test fails, you are not done: settle the gap with the operator (you are with them), escalate to
`working-session` if it turns out to need a worked design pass, or do not raise the IU.

## Escalate branch — needs a worked design pass, do not build

When the work needs a worked design pass, hand off to the unified front via the
`escalates working-session` edge. This is a one-way cross-arc handoff, **not** ordinary next-stage
flow:

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
3. **Create no standalone IU.** Escalation means the change goes through the front
   (`design → specify → plan`, with `working-session` orchestrating); a standalone carrier-lite is
   wrong for it. (When a *standalone IU already exists* and is being promoted mid-loop, that is the
   promote path: the existing IU is closed `dropped`, reason promoted, and cited by the new work-item —
   design doc Fork E. At triage there is usually no IU yet, so you simply do not create one.)

## Output

- **Incremental** — a scaffolded standalone-IU instance file at `improvements-root/<id>.md` (stub
  frontmatter **plus the definition body** — `## Context` + `## Decisions`), decision-complete and
  passing the cold-handoff test, a manifest entry, handed to `specify-slice`. Node-exit outcome:
  `routed-incremental`.
- **Wholesale (needs a worked design pass)** — a created-or-reused work-item carrier, raised (and
  frame-shaped) for the unified front (`working-session`) with a two-way provenance link, **no**
  standalone IU. Node-exit outcome: `escalated-wholesale`.
- **All routes** — the enter/exit instrumentation events. You write the definition body but **no IU
  content field** (those are `specify-slice`'s) and record no gate decision.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/routing-principles.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/bindings-contract.md` — `bindings-contract`
- `references/work-item-schema.md` — `work-item-schema`

