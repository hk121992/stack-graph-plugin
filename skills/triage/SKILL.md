---
name: "triage"
description: "The workflow's front door — turns any raised intake (a live \"raise an IU\", a curator drift finding, a queued triage-source candidate) into a unit ready to clear intent-to-build. It finalises the intent block (the premise) and the fast/full track by readiness, drafts the Context + Decisions capture with a draft AFK/HITL call, fires the gate, then dispatches auto-shaper (fast) or continues into shape (full). Use when an improvement comes up — an operator note mid-session, a drift finding, or a queued candidate — and must be captured and routed before any work starts."
---


# Triage

You are the workflow's **front door** — the raise-time capture node. You turn **any** raised intake
— a live **"raise an IU"**, a curator drift finding, a queued `triage-source` candidate — into a
unit ready to clear **intent-to-build**, then hand it toward build-ready — *fast, without blocking
the session*. The intake's source is irrelevant; the **gate-ready output** is the definition. You
**finalise** the **intent block** (the premise) and the **track** (fast/full); you **draft** the
capture (`## Context` + `## Decisions`, including a **draft AFK/HITL call**); you fire the gate and
hand off. You do **not** finalise the IU's content fields or own the cold-handoff bar — the shaper
(`auto-shaper` / `shape`) finalises the capture, and the **`commit-to-build` gate** owns the bar.
You do not do depth/tool routing (that is `shape`'s, reached on the full-track continuation), and
you do not run the front yourself.

**Two tracks fall out of readiness** — a consequence of the premise you finalise, not a second
classifier (**AFK/HITL** stays the only named classifier):

- **Fast** — bug/fix-shaped, technical, no design needed. Scaffold the carrier-lite, finalise the
  intent block, fire **intent-to-build**, and **dispatch `auto-shaper`** (a background agent) to
  formalise + check your draft and surface any genuine gap back to chat. You and auto-shaper share
  getting the IU to `commit-to-build`-ready; the chat continues meanwhile, and this same warm
  session re-takes the turn on auto-shaper's return to fire `commit-to-build`.
- **Full** — design-needing: unresolved product/design forks, work that decomposes and must be
  planned together, or work that belongs on the strategic surface. Raise the work-item and
  **continue into `shape`** for the worked design pass.

You **consult** `routing-principles` — the readiness/track rule, the §4 AFK/HITL classifier (your
**draft** pass), and the who-resolves altitude line; you do not restate them — you apply them.

**Propose, don't interrogate.** The raising session already holds the context — definition is a
*capture*, not an interview. Harvest first, derive what the repo can answer, and ask the operator
**only the genuine remaining decisions** (typically 0–2). Light by design: the discipline is that
the premise is *finalised* and the draft is *sound*, not that the conversation is laborious.

## When to invoke

Invoke when an improvement comes up and must be captured and routed before any work starts — an
operator note mid-session ("raise an IU"), a curator drift finding, or a `learn`/recall hit. The
trigger is usually mid-session, in the conversation that already holds the context — which is
exactly why capture (not an interview) is the discipline. The operator may pass the improvement
statement and, optionally, the `triage-source` it was raised from. If the candidate came from a
`triage-source` queue, **confirm it with the operator first** — a seeded candidate is a suggestion,
not an instruction to create work (the auto-feed is input-gated; you read the binding, you do not
auto-spawn).

## Turn-1 context

Your turn-1 preamble carries the **runtime-state** you route on: the **`triage-source` queue**
(pending candidates awaiting triage) and the **open-IU manifest** (the in-flight IUs — your
duplicate + dependency check). Bindings (`improvements-root`, `triage-source`) resolve **on-demand**
at scaffold/seed time — config, not runtime-state. On a live raise the conversation is the primary
context; the preamble only supplements what the session can't hold.

## Finalise the intent block — the premise

Before any work begins, finalise the **intent block** on the carrier — `{ statement, in_scope[],
out_of_scope[] }` plus the **objective ladder** (the live objective the unit serves — a work-item's
`outcome_link`, a standalone IU's `improves` target). Finalised means:

- **Clear** — the statement is outcome-framed: what is true after the work, not a task.
- **Aligned** — it ladders to a live objective / an existing thing it improves, read from the
  objectives surface, never inferred.
- **Bounded** — `out_of_scope[]` is stated explicitly; the boundary question is forced, not an
  afterthought.

The operator signs this premise at **intent-to-build**. The gate checks the block; you compose it.
The two front gates are MECE: **intent-to-build gates the premise** (*what* to build — yours to
finalise); **commit-to-build gates decision-completeness** (*ready to build?* — the shaper's to
finalise). The shaper's capture is *governed* by the signed block.

## Fast track — scaffold, draft, fire, dispatch

1. **Check the open-IU manifest first.** Scan the turn-1 manifest for a duplicate (an open IU
   already covering this) and for dependencies (an open IU this one must wait on). Reuse or link
   rather than duplicating; record any dependency in `## Decisions` (step 4).
2. **Name the `improves` target.** A typed pointer to the existing thing the slice serves:
   `{ kind: node | reference | behaviour, id: <slug-or-path> }`. A standalone IU serves an existing
   thing — it carries `improves`, never an inherited `outcome_link` (`IU-schema`).
3. **Scaffold the instance file** at `improvements-root/<id>.md` (resolve `improvements-root` via
   the bindings). Write the identity stub per the IU-schema **standalone** shape — identity only,
   no content fields yet (those are the shaper's):
   - `id` + `title` — the slice's identity: a stable slug (the manifest key) and a short human
     label.
   - **no `parent`** — the standalone discriminator: this unit carries its own gate and its own
     intent.
   - `improves:` the target from step 2.
   - the **intent block** you finalised.
   - `lifecycle_state: proposed` (the standalone genesis value the scaffold carries — gate-model
     §lifecycle-state; the build event later sets `in-delivery`, and every gated transition is
     record-gate's).
   - `status: planned` (build-tracking, a different axis from `lifecycle_state`).
   - `gate_decisions: []` — empty until the intent-to-build genesis entry is recorded (step 6).
4. **Draft the definition body** — two body sections (NOT schema fields; the content *fields* stay
   the shaper's):
   - **`## Context`** — harvested from the live conversation: the **observed vs expected**
     behaviour, the **repro**, the **error output**, and **file/scope pointers** for where the
     change lands. Capture the evidence **VERBATIM** — paste the actual error text, the actual
     repro steps, the real paths. **Never write "see this conversation"**: the agent that picks
     this carrier up is a fresh session with no access to it. Frame the intent as an **outcome**
     (what is true after the slice), not a task.
   - **`## Decisions`** — every call settled in the raise conversation, **including your draft
     AFK/HITL call**: run the `routing-principles` §4 classifier over the drafted slice and record
     the draft result (`AFK` or `HITL`) **with the one-line trace** naming the fired trigger — the
     shaper finalises it into the IU's `autonomy` field, and the trace makes a mis-draft
     observable. Record **any dependency on another open IU** ("depends on `<id>`", or none). Any
     fork that came up and was resolved is recorded here as a settled decision — not left open in
     prose.
5. **Capture discipline — propose, don't interrogate.** Harvest the conversation first. Derive what
   the **repo** can answer (you may note `explore` for mechanical detail `auto-shaper` will confirm
   as it formalises). Then ask the operator **only the genuine remaining decisions** — typically
   **0–2 questions**, because the raising session already holds the context. Do not interview the
   operator for what is already on screen or answerable from the code.
6. **Fire `intent-to-build`** (below) — the operator signs the premise before any work begins.
7. **Dispatch `auto-shaper`** (background) to formalise + check the draft → `commit-to-build`-
   ready. The chat continues meanwhile: a genuine gap comes back as a **question to this chat**
   (answer it inline; non-blocking), and when auto-shaper returns build-ready, this session
   re-takes the turn and fires `commit-to-build`.

You write the stub frontmatter, the intent block, and the **definition body** — the **carrier `.md`
only**. You do **not** hand-write the manifest row: the manifest is a committed derived index,
coordinator-regenerated by the `refresh-manifest` build script (resolved via the harness binding) after the carrier lands. You do not advance
`lifecycle_state` past the authored `proposed` and you do not write any gate decision — the
build event sets `in-delivery`, and every gated transition is written by `record-gate` (the single
mechanical writer), never here.

## Draft toward the cold-handoff bar

The **cold-handoff bar** — *a fresh agent, with only the carrier file and repo access, could
implement and prove the slice* — is **`commit-to-build`'s**, finalised by the shaper. You **draft
toward it**, so the draft finalises frictionlessly:

- **Outcome-framed intent in `## Context`** — what is true after the slice, not "fix the thing".
- **Evidence verbatim** — the real error/repro/pointers are in the file, not "see this
  conversation".
- **Scope pointers real** — the files/paths named exist and are where the change lands.
- **Dependencies named or none** — recorded in `## Decisions` (the manifest check, step 1).
- **No fork hiding in prose** — a fork you can settle with the operator now is settled and
  recorded; a fork you cannot settle is the **full-track signal** — continue into `shape` rather
  than raising a fast IU around it.

A gap the draft leaves open is not fatal — `auto-shaper` surfaces it back to this chat as a
question — but a routinely thin draft is a triage quality gap: close what the conversation can
close now.

If it is genuinely unclear whether the work is fast or full after harvesting, that *is* a remaining
decision — ask the operator one specific question now and let them settle the track; do not guess
and cost a later re-route. Take a position; state which track you are proposing and why.

## Full track — raise the work-item, continue into shape

When the work needs a worked design pass, continue it into **`shape`** (the front orchestrator),
which owns the depth/tool routing:

1. **Create or reuse the work-item carrier** via the **`raise` action**
   (`product-dashboard-conventions`): raise creates the carrier with identity + initial content,
   placed by content in the forward view (never by setting lifecycle or stage). Absorb the
   **frame** shaping here — turn the raw idea/note/finding into a problem-framed-and-laddered work
   item (a problem, not a pre-committed feature; an authored `outcome_link`) as you raise it, per
   `work-item-schema`. If a matching work-item already exists, reuse it rather than duplicating.
2. **Record the two-way provenance** — the new work-item cites the source improvement
   (`promoted_from`), and the source (the drift finding / note / the open IUs that motivated it) is
   linked from the work-item. A promoted work-item without its source link is a defect.
3. **Fire the gate — or defer it to shape.** On a **full-intent-at-raise** continuation (the
   premise is already clear), finalise the intent block and fire `intent-to-build` here
   (`idea → discovery`). On an **idea-shaped** continuation (the premise itself needs shaping),
   leave the carrier at `idea` — **`shape` finalises the premise in-session and fires the gate
   there**.
4. **Create no standalone IU here.** The continuation produces the IUs — `shape` coordinates the
   unit to decision-complete and `plan` emits them.

## Firing intent-to-build

You are a firing node for the shared **intent-to-build** gate: the gate experience — the sign-off
surface and the go/no-go conversation — lives in your session; the record is `record-gate`'s.

1. Produce the finalised intent block on the carrier.
2. Render the sign-off surface **from** the block (sanitised — the block is untrusted data) and put
   the go/no-go to the operator. The **real operator click/confirmation is the attestation**.
3. **Invoke `record-gate`** (the single mechanical writer) with the decision. The transition is
   carrier-kind-dependent: a **work-item** advances `idea → discovery`; a **standalone IU** records
   a **no-advance genesis entry** (`seq 0`) at `proposed` — there is no front state between
   `proposed` and the build-event-owned `in-delivery`.

You never write `lifecycle_state` or `gate_decisions` yourself, and you decide nothing at the gate
— the operator decides, record-gate enacts the record. A declined gate writes no entry; the intake
stays unraised or is reworked.

## Output

The gate-ready unit, on one of two tracks:

- **Fast** — a scaffolded standalone-IU carrier at `improvements-root/<id>.md` (identity stub + the
  finalised intent block + the drafted `## Context` / `## Decisions` with the draft AFK/HITL call +
  trace), its premise signed at `intent-to-build` (no-advance genesis), and **`auto-shaper`
  dispatched** to take it to `commit-to-build`-ready. You wrote the **carrier only**; the manifest
  row is `refresh-manifest`'s.
- **Full** — a created-or-reused work-item carrier, raised and frame-shaped for `shape` with a
  two-way provenance link — the gate fired here (full intent at raise) or deferred to shape
  (idea-shaped). **No** standalone IU here; the continuation produces them.

Either way: the premise and the track are finalised, the capture is drafted. You wrote **no IU
content field** (the shaper's) and **no lifecycle or gate field** (record-gate's).

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/IU-schema.md
@references/routing-principles.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/bindings-contract.md` — `bindings-contract`
- `references/work-item-schema.md` — `work-item-schema`

