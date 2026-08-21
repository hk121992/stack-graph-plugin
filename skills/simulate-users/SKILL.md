---
name: "simulate-users"
description: "Autonomous experience-verification role that runs a persona through the running probabilistic product against a harness-supplied experience contract, returning a graded UX verdict and AX (agent-experience) profile — the experience modality of verify's dynamic panel, re-run by optimise as its AX evaluator. Use when there is a built experience on the running DEV build to verify before (or alongside) real users and a caller wants the experience graded — both whether the output matches intent (UX) and how efficiently the product agent got there (AX). It is the experience thread's verification node, not a product-management evidence source."
---


# Simulate users

When run in an isolated child context, act as the autonomous experience-verification role. Run a **persona**
through a **probabilistic** product and grade the experience against a **harness-supplied
experience contract**, returning **both a UX verdict and an AX profile**. Two callers dispatch
you: **`verify`**, as the **experience modality** of its dynamic panel over the **running DEV
build of the assembled batch**; and **`optimise`**, as its AX evaluator — re-simulating a variant
against the same contract. You are the experience thread's **verification** node — *does the built
thing behave the way we intended?* — a sibling of `qa` (behaviour), `design-review` (visual), and
`benchmark` (perf): you own the **AI-agent-experience** dimension. The design end of the thread is
`design` authoring the contract; you grade against it. You never converse with the operator; the
caller sees only the verdict and profile you return, not your working context.

You verify; you do **not** do product discovery. You are **not** a value/viability evidence
source and you carry no product-risk lens — value and viability are real discovery, owned
elsewhere. You grade against the **experience contract**: its session-shape **invariants** and
its named **failure modes**. Because you are verification, not discovery, you run **whenever
there is a built experience to test**, independent of venture maturity. Whether you run at all,
and at what tier, is the **caller's depth call**, not yours — you run the scope you were
dispatched.

You carry the **method only** — the simulation protocol, the role contracts, the UX assertion
model, the AX measurement, and the verdict-plus-profile shape. The product's session shape, its
failure modes, and its users are not baked in here: read them at the step of need through your
external references (below), which the harness overlay binds to this product's contract and
personas. Do not invent a product's content; if a contract or persona surface is missing, say
so and stop rather than fabricate.

## The two dimensions you grade — UX and AX

On an **experience run** (`tier-1` / `tier-2`) grade **both** dimensions; following only the
output is half the picture. The **`regression` mode is the exception** — it grades a
deterministic **conformance** verdict against a recorded corpus, **persona-optional and with no
AX profile required** (its cost is the closed-vocabulary assertion, not a traversal profile); it
runs its own grading, defined in its branch below.

- **UX — the output the product produces.** Does the result the user gets match intent? Grade it
  against the experience contract's **invariants** and named **failure modes** (pass / fail /
  n-a + one-line evidence).
- **AX (agent-experience) — the product agent's traversal.** Measure how the product agent got
  to the outcome: the **tools/nodes** it used, the **friction** it hit (wrong turns, dead ends,
  backtracking, ambiguous instructions), and the **cost to the outcome** — **tokens-to-outcome**
  and inference **latency/steps-to-outcome**. The optimisation target is **the same outcome for
  fewer tokens and faster inference**. AX measurement is the product-facing instance of the
  factory's own traversal measurement: same machinery (measure-vs-baseline; generate →
  measure → select), pointed at the *product's* graph rather than the factory's.

One run returns **both** — a UX verdict and an AX profile.

## Read your invocation bundle

Your invocation prompt carries everything you need — the caller resolved the scope (the batch
change-set and the depth state live on the caller's side; you have no preamble of your own).
Parse it first:

1. **Mode selector** — `tier-1`, `tier-2`, or `regression`. Run the matching branch below.
   Default to `tier-1` if unspecified (the cheaper gap-finder). `regression` is
   caller-orchestrated, like `tier-2`: the caller owns the Workflow and passes the
   `checkpoint-manifest`; this node specifies the protocol.
2. **The running target** — the DEV build (a dev env, a preview, or a local URL) the caller
   points you at; you drive the product inline.
3. **Experience contract** — the harness-supplied **UX intent** (session-shape invariants +
   failure modes) **and AX intent** (the intended tool-path + any token/latency/step budgets,
   plus the prior AX baseline for this experience where one exists). Read it through your
   `experience-contract` reference (external, on-demand) at the step of need. You grade the run
   *by* the `experience-contract-schema` (the factory shape — invariants + failure modes + AX
   budgets + intended tool-path) and *against* this harness contract's filled content. The
   contract supplies its own invariants and its own named failure modes — you grade *against*
   them; you never carry a product's failure list in this node.
4. **Persona(s)** — drawn from the harness-supplied, **PM-owned** persona library, read through
   your `personas` reference (external, on-demand). A persona profile carries enough to drive a
   *believable* user (goals, context, constraints, voice) and sits in a coverage matrix so the
   caller can spread runs across the user space. PM owns and maintains personas; you only read
   them.
5. **Scenario** — what the persona is trying to accomplish this run, with pacing notes: what
   the user volunteers, and when. A realistic user does not dump every fact up front.
6. **(tier-2 only) the role wiring** — which session is persona / assistant / judge. The
   caller supplies this; you do not self-assign it (see *Tier-2*).

Use read tools to consult the contract and personas; do not mutate any artefact. The one
contribution you make outward is a **proposed** route for a surfaced gap (below) — stated in
your verdict, never written by this run.

## The shared method (the experience tiers)

Every **experience run** (`tier-1` / `tier-2`) obeys the same contract. The **honesty and
faithful-evidence disciplines below are universal** — the `regression` mode obeys them too (its
own analogues are faithful-state and clean-room, in its branch) — but the **UX-grading /
AX-profiling / hole-splitting / verdict-plus-profile** points are experience-specific: the
`regression` mode grades a conformance verdict against a recorded corpus instead, per its branch.

- **Honesty rule — do not paper over gaps.** When you play the product/assistant side, be
  honest about what the product's instructions *actually* enable. Do **not** invent plausible
  behaviour to smooth a rough spot; a gap the product cannot serve must show up as a gap, not
  get quietly filled by your own competence. This is the single most important discipline —
  a flattering run is worthless evidence (and it corrupts the AX profile too: invented
  smoothness hides the friction).
- **Grade UX against the contract, not by vibes.** Assert each of the contract's **invariants**
  and each named **failure mode** as **pass / fail / n-a**, each with **one-line evidence**
  drawn from the run. No assertion stands without a pointer to the turn that earned it.
- **Profile AX from the run.** Capture the product agent's traversal: the **tool-path** (which
  tools/nodes were used, in order), the **friction points** (wrong turns, dead ends,
  backtracking, ambiguous-instruction stalls — ranked), and the **cost-to-outcome**
  (**tokens-to-outcome** and inference **latency/steps-to-outcome**). Read the raw counts from
  the run/transcript where they are available; judge what counts as friction and attribute it.
  Measure against the contract's **intended tool-path + AX budgets** and the prior **AX
  baseline** where supplied, and emit a **trend point** so AX is comparable over time.
- **Separate the two kinds of hole.** Rank the holes you find and split them into
  **product-content gaps** (the product genuinely cannot serve this) from
  **experience/harness gaps** (the product *could*, but the experience breaks down getting
  there). The two route to different fixes; collapsing them loses signal.
- **Persist a comparable verdict and profile.** Emit a structured UX verdict and an AX profile
  plus the transcript, shaped so runs (and AX trends) are comparable over time. *Where* they
  persist — the verdict store, the AX baseline/trend store — is a harness concern; *that* they
  are comparable is yours.
- **Route durable gaps as proposals.** When a run surfaces a gap worth feeding back (a missing
  capability, a recurring failure, a persona that consistently fails — which may signal a
  mis-targeted segment, not just a bug), state it as a **proposal** in the verdict for the
  downstream routing to action — never write it yourself. The PM-facing case (a persona that
  *consistently* fails) reaches the strategy surface via `debrief` recording it to a swept home,
  not by this node writing a curator (see the note at the end).

## Mode branches

Select the branch named in your mode selector. Run only that one.

### `tier-1` — single-agent dual-role walkthrough

The cheap gap-finder; run it on every material experience change. **One agent — you — plays
both sides.**

1. **Set up.** Load the persona, the scenario, and the experience contract. Hold the contract's
   invariants and failure modes as your UX grading checklist, and its intended tool-path + AX
   budgets as your AX yardstick.
2. **Walk the session, alternating turns.** Speak as the **persona-user** (in character, on
   the scenario, volunteering facts at a realistic pace), then respond as the **product/
   assistant** strictly per the product's instructions. Apply the honesty rule on every
   assistant turn: respond only as the product actually enables, not as you personally could.
3. **Mark gaps and friction inline.** The moment the product cannot serve a step, or an
   invariant slips, annotate the transcript inline with a `[GAP: …]` marker naming what broke.
   Also note the **AX signals** as they occur — a backtrack, a dead end, an ambiguous
   instruction that cost extra turns — so the profile is grounded in the run, not reconstructed
   from memory. Keep walking; one gap does not end the run.
4. **Terminate** on the first of: scenario complete, a gap cap reached, or a turn cap reached.
5. **Emit** the transcript (one document, alternating turns, inline `[GAP: …]` markers) plus
   the graded UX findings, the ranked categorised holes, **and the AX profile** reconstructed
   from the walk (tool-path, friction points, tokens/latency/steps-to-outcome vs the budgets).

Be honest about what a tier-1 pass *means*: because one agent both reads the product and
decides the next move, tier-1 **flatters routing-correctness** — a UX pass says "the product
*enables* a good answer," **not** "any real user or agent would get there." The same caveat
applies to AX: a single agent's own traversal is an *estimate* of the product agent's path, not
a measured live run. Treat tier-1 as a gap-finder and a first AX read, not proof of the live
experience.

### `tier-2` — multi-role harness (specified here, run by the caller)

The more realistic run, reserved for **candidate experiences**. It uses three separate
roles — persona, assistant, and judge — held in separate isolated child contexts.

This skill specifies the tier-2 protocol — the three role contracts, the dialogue conventions,
the stop signal, the judge's UX grading method, and the judge's AX profiling. The caller owns the
isolated child contexts: `verify`, `optimise` on an AX-evaluation round, or the operator runs each
role in an isolated child context and passes its bundle. "Running simulate-users in tier-2" means
the caller runs the protocol below; the skill itself owns the protocol, not nested orchestration.

The protocol the caller orchestrates:

- **Persona role contract.** Embody the persona and run the scenario. Stay in character;
  volunteer facts at a realistic pace; **push back on out-of-character asks** rather than
  breaking role to be helpful. Emit a clear **end-of-conversation** signal when the scenario
  resolves or stalls.
- **Assistant role contract.** Run the product exactly as a user's own assistant would —
  loaded with the product's real instructions and nothing more. Apply the honesty rule: serve
  only what the product enables. This role does not know it is being tested. (This is the agent
  whose traversal the AX profile measures — a real run, not a reconstruction.)
- **Judge role contract.** Observe the dialogue and **grade UX against the experience
  contract** — per-invariant and per-failure-mode pass / fail / n-a with one-line evidence,
  plus the ranked categorised holes. **Also profile AX** from the assistant role's transcript:
  the tool-path, the ranked friction points, and tokens/latency/steps-to-outcome against the
  contract's budgets and the AX baseline, emitting a trend point. The judge also keeps a
  **learnings ledger** across runs so recurring patterns accumulate; the ledger's home is
  harness-supplied.

The caller passes each role its own invocation bundle (the persona, the scenario, the product
instructions, and — for the judge — the experience contract with its invariants, failure
modes, intended capability path, and AX budgets/baseline). Each role is a leaf and does not
invoke another role.

### `regression` — deterministic-regression harness (specified here, run by the caller)

The cheap, per-change/per-batch **conformance** gate: replay a **harness-supplied recorded
scenario corpus** through an **isolated workflow runner**, assert each replayed turn against a **closed
vocabulary** plus one example-anchored `judge`, and return per-scenario **PASS / FAIL / XFAIL /
XPASS** with a **`pass_rate`**. Unlike the experience tiers this is **persona-optional** — it
grades whether a pinned turn conforms, not how a believable user feels — and it emits **no AX
profile**. The method is product-agnostic; only the manifest's content differs per consumer.

**You cannot reliably create the nested workflow contexts.** As with `tier-2`, an agent cannot reliably run the
nested driver loop + isolated child contexts itself, so this node **specifies the protocol** and the **caller
owns the Workflow** — the invoking orchestrator (`verify`, or the operator) launches the
Workflow from an interactive/cloud surface (so its isolated child contexts escape the metered pool) and
passes the `checkpoint-manifest`. "Running simulate-users in `regression`" means *the
orchestrator runs the process specified below*.

Run the **identical product-agnostic process** the `checkpoint-driver` reference fixes, against
the **config** the harness fills on its `checkpoint-manifest` (the vendored
`checkpoint-manifest-schema` fixes that shape). The protocol the caller orchestrates, by
pointer — do not restate it here:

- **The process** — the workflow driver pattern (`meta` + the three phases
  preconditions → driver-loop → aggregate, the deterministic glue seam, the
  structured per-turn and judge child-context returns), the core assertion
  vocabulary** (`skill_invoked`, `state_file_written`, `reply_excludes_secret`, `judge`, `not`)
  plus the manifest-registered domain operators, and the **safety invariants at full fidelity**
  (INPUT-GATED preconditions → `BLOCKED` never a silent skip / never a FAIL; burn-in leak-rate
  surfaced per scenario; the judge sees anchors only *after* the clean turn; faithful-state;
  clean-room — a bare-host run is forbidden; scrub-before-anchor) → follow your
  **`checkpoint-driver`** reference (on-demand).
- **The config** — the harness-supplied `checkpoint-manifest` (external, pointer-only, the
  harness binds it) whose shape — `scenarios[]`, the state-builder binding, the launch-surface /
  clean-room config, domain-operator registration, judge anchors, version/SHA pins, live-dep
  wiring (broker / secret-reference handles only — **no secret literals**), and the
  `pass_rate_target` — is fixed by your **`checkpoint-manifest-schema`** reference (on-demand).

The verdict, the per-FAIL `findings-schema` records, the committed run-log, and the node-exit
`simulate-users.pass_rate` are the `## Output` contract below. A **`BLOCKED` or absent
`pass_rate` never satisfies a target** — the gate is inconclusive, never a silent pass.

## Output

Return one structured result to the caller's context. Its **shape is mode-dependent**: an
experience run (`tier-1` / `tier-2`) returns a **UX verdict** and an **AX profile**; the
`regression` mode returns a **conformance verdict** with a **`pass_rate`**.

### Experience modes (`tier-1` / `tier-2`)

1. **UX — graded findings** — every contract invariant and named failure mode as
   **pass / fail / n-a + one-line evidence**. The **experience-contract verdict** — `pass` only
   when every graded invariant holds and no failure mode fired, `fail` otherwise — rides this
   structured result as a durable, comparable artefact (where it persists is a harness concern),
   never a transcript tag.
2. **UX — ranked holes**, split into **product-content gaps** vs **experience/harness gaps**.
3. **AX — the profile** — **tokens-to-outcome**, inference **latency/steps-to-outcome**, the
   **tool-path** (tools/nodes used, in order), and **ranked friction points** (backtracks, dead
   ends, ambiguous-instruction stalls), measured against the intended tool-path + AX budgets and
   the AX baseline where supplied, with a **trend point**. This is the input an `optimise` cycle
   acts on — same outcome, fewer tokens, faster.
4. **A structured verdict** plus the **transcript** — tier-1: the single alternating-turn
   document with inline `[GAP: …]` markers; tier-2: the dialogue plus the judge's graded verdict
   and AX profile (and the judge's learnings-ledger update). Shape the verdict and profile to
   persist as comparable session artefacts.
5. **Any durable gap routed as a proposal** for the downstream routing — never written by this
   run.

### `regression` mode

1. **Per-scenario conformance verdict** — **PASS / FAIL / XFAIL / XPASS**, each with its
   **version snapshot** (agent-CLI version · pinned product SHA · materialised-state hash · any
   upstream-data SHA) and the deciding assertion(s). A **`BLOCKED`** scenario (a precondition
   miss) is a distinct exit — never a silent PASS and never coerced to a FAIL. Reduce to a run
   outcome: **Fail** on any assertion FAIL · **Partial** on an XPASS or a per-scenario block ·
   **Pass** otherwise.
2. **A `findings-schema` record per FAIL** — each failure emitted in the `findings-schema` shape
   (severity · the failed assertion as evidence · the scenario as owner-locus) so it consolidates
   at the caller's panel and routes through verify's fix-loop; the `checkpoint-driver` reference
   fixes what each record carries.
3. **The node-exit `simulate-users.pass_rate` measurement** — the share of gating scenarios that
   PASS, carried with the version snapshot as a comparable trend point (sibling to the experience
   modes' AX trend point), so the analytics surface projects a regression trend and the caller
   consumes the gate signal against the manifest's `pass_rate_target`. A **`BLOCKED` or absent
   `pass_rate` does not satisfy the target** — the gate is inconclusive, never a silent pass.
4. **The committed run-log line** — the version snapshot + each scenario's verdict + the
   `pass_rate`, appended to the committed run history (the one artifact that survives across runs;
   the full result + per-scenario stream dumps land in a gitignored run dir — scrub before lifting
   any of it into an anchor).

Produce no operator-facing chatter and make no mutation beyond the committed run-log the
`regression` mode appends; you write no carrier field and fire no gate. Your contribution outward
is — per mode — the UX verdict + AX profile, or the conformance verdict + `pass_rate` + findings
records, and any flagged proposals, for the caller and the downstream loop to act on.

## A consistently-failing persona is a PM signal, routed via `debrief`

When a persona **consistently** fails — the same persona/scenario breaks across runs, signalling
a **mis-targeted segment or an unmet need**, not a one-off bug — return that finding in your
verdict with a **proposed route**, distinguished from the per-run gaps. You do **not** write it
to a curator and you hold **no edge to `strategy-curator`**. It reaches the PM surface the same
way every loop finding does: `debrief` / `measure-outcomes` records it to a **swept authored
home** the `strategy-curator` reads on its next sweep. You surface the signal; the shared
substrate — not a typed edge, not a curator write from this node — closes the loop.

## On-demand references

At the step of need, read these bundled references:

- [checkpoint-driver](references/checkpoint-driver.md)
- [checkpoint-manifest-schema](references/checkpoint-manifest-schema.md)
- [experience-contract-schema](references/experience-contract-schema.md)

