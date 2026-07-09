---
subject: checkpoint-driver
title: Checkpoint driver — the deterministic-regression process
provenance: vendored
level: L2
cadence: on-demand
read-when: "Running (or authoring the caller for) the simulate-users deterministic-regression mode."
derive-from: [checkpoint-driver]
reviews-on: checkpoint-driver-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [checkpoint-manifest-schema, findings-schema]
---

# Checkpoint driver — the deterministic-regression process

The product-agnostic **process** the `simulate-users` deterministic-regression mode runs: replay a
harness-supplied scenario corpus through a Claude Workflow, assert each replayed turn against a **closed
vocabulary** plus one example-anchored `judge`, and return per-scenario PASS/FAIL/XFAIL/XPASS with a
`pass_rate`. Every consumer runs this **identical** process against a different app; only its
[checkpoint-manifest](checkpoint-manifest-schema.md) content differs. This reference fixes the do-this;
the caller owns the Workflow (as it does the tier-2 live run).

The loop is the product — each scenario is run, never abbreviated. Everything except `judge` is
deterministic (no model call); prefer a deterministic operator wherever the criterion is structural, and
send only the irreducibly-semantic criteria to `judge`.

## The closed assertion vocabulary {#vocabulary}

A **vendored general core** (every product) plus **manifest-registered domain operators** (the
product-specific members, registered on the manifest — [§operators](checkpoint-manifest-schema.md#operators),
never vendored). The seam between them is the generalisation boundary: keep the core product-agnostic; push
every transport / state / secret specific into a registered operator.

An assertion string is `[not] <op> [arg]`. It expresses an **invariant or forbidden action**, never a
brittle call sequence — a turn passes as long as it did the right things and avoided the wrong ones,
regardless of order. A malformed assertion (unknown operator, a missing required arg) is an authoring error →
`BLOCKED: malformed assertion`, a distinct exit, **not** a failing test.

### The 5 core operators {#core-operators}

| operator | asserts | kind |
|---|---|---|
| `skill_invoked <id>` | the agent routed into this skill / sub-agent this turn | deterministic |
| `state_file_written <name>` | a tracked state file changed this turn (filesystem diff, or an explicit write-tool path) | deterministic |
| `reply_excludes_secret [<name>]` | none of the live secret VALUES echoes in the agent's user-visible text ([§secret-guard](#secret-guard)) | deterministic |
| `judge <criterion>` | LLM-as-judge on a genuinely-semantic criterion — one batched call per scenario ([§judge](#judge)) | model |
| `not <assertion>` | negation of any of the above | — |

A product whose state is purely local registers no domain operators and runs on the core alone.

### `reply_excludes_secret` — the deterministic secret-echo guard {#secret-guard}

Stronger than a judge, and never a judge call. After the turn runs, **harvest the live secret VALUES from
the turn's post-state** (the freshly-minted credential, the verification id). Scan the **full transcript** —
every assistant text block, opening and intermediate, not only the final consolidated reply — for an
**exact-substring** echo of any harvested value. The optional `<name>` narrows to one named secret; absent,
it checks every harvested value. The operator passes iff no value appears. **Never** echo a secret value into
a log, a finding, or an anchor — report only which names were checked and which (if any) leaked. The values
live at run time only; committed config never carries them.

## The Workflow driver pattern {#driver}

The caller runs the loop as a **Claude Workflow script** — orchestration only, no direct filesystem/Node
API in the Workflow body. Its two LLM touchpoints (the per-turn run, the per-scenario judge) execute as
**schema-validated `agent()` subagents**; every deterministic step (the preconditions gate, state
materialisation, the closed-vocabulary evaluator, burn-in aggregation, the run-log append) is invoked as a
plain step, not run inline in the body.

**`meta` + 3 phases.** Declare `meta` (name · description · `phases`) and drive three phases in order:

1. **`preconditions`** — the deterministic step emits the version-pin gate result + a materialised
   per-scenario plan (cwd · verbatim input · load-flags · resume-base · judge criteria · the assembled judge
   prompt) **without running any LLM turn**. A gate miss returns `BLOCKED` and the Workflow stops
   ([§preconditions](#inv-preconditions)).
2. **`driver-loop`** — run every scenario through both stages with `pipeline()` ([§stages](#stages)).
3. **`aggregate`** — the deterministic step consumes the per-turn + judge handoffs, runs the assertion
   evaluator + burn-in aggregation, writes the per-scenario verdicts, **appends the committed run-log line**,
   and emits the outcome + `pass_rate`.

### `pipeline()` — the two stages {#stages}

`pipeline(scenarios, perTurn, judge)` runs each scenario through two independent stages:

- **Stage 1 — the per-turn subagent.** Dispatch an `agent()` that performs the turn's REAL actions in the
  materialised cwd and returns the turn's **`stream-json` transcript** verbatim — the same stream shape the
  deterministic trace/assertion layer consumes. Emitting that transcript is the whole contract; the
  deterministic step reconstructs the trace from it. If the subagent dies, record the scenario blocked
  downstream (never a silent pass).
- **Stage 2 — the judge subagent.** Only if stage 1 succeeded and the scenario has judge criteria. Dispatch
  the pre-assembled judge prompt as a **schema-validated** `agent(prompt, { schema })` ([§judge](#judge)).

### The `pyStep()` glue seam {#pystep}

The Workflow touches the filesystem and the deterministic engine through **one** seam: dispatch a low-effort
`agent()` that runs EXACTLY one shell command and returns its raw stdout verbatim — no preamble, no edits.
This keeps the Workflow body pure and the deterministic step the source of truth (the per-turn / judge
handoffs are written and read through this seam). A step that produces no output is `BLOCKED`, not skipped.

### The judge subagent's output schema {#judge-schema}

The judge subagent is dispatched with a **StructuredOutput schema** that forces one `{ passed, reason }`
object per criterion, in criterion order — a boolean verdict plus a short reason, and nothing else. The
schema replaces only the OUTPUT contract, not the prompt. Map the validated object back onto the verdict
list the evaluator's `judge` operator consumes; a missing / short / non-boolean verdict defaults to **fail**
(an unparseable judge reply never silently passes).

## Safety invariants {#invariants}

Each holds at full fidelity — none is optional.

### 1 — INPUT-GATED preconditions → BLOCKED {#inv-preconditions}

Before any turn runs, a preconditions gate must pass; a miss is **`BLOCKED`** (a distinct exit) — **never a
silent skip and never an assertion FAIL**. A "precondition" includes the pinned agent version, the built
clean-room container, the materialised checkpoint validating against the product's schemas, and **any live
dependency the turn legitimately touches: it must be reachable AND authenticate AND be not-stale** relative
to its source of truth (the "data behind main" check, so a red is triageable as drift vs regression). A
blocked run reports the one-line cause and stops; fix the named cause and re-run. If no checkpoint can be
materialised at all, say so plainly and emit nothing as if it were a verdict.

### 2 — Burn-in leak-rate math, surfaced per scenario {#inv-burn-in}

A gating scenario runs `burn_in` (N) independent times and passes only if **every** run is green. For an
intermittent leak occurring on a fraction `r` of runs, an N-run gate **misses** it with probability
`(1−r)^N` — a leak rate `r ≈ 1/3` at `N=3` misses ≈ 30% of the time; driving miss < 5% needs `N ≈ 8`. Both N
(`burn_in`) and the assumed `r` (`assumed_leak_rate`) are **written on the scenario**
([§scenarios](checkpoint-manifest-schema.md#scenarios)) so a gate operator sees the weakness rather than
trusting a bare green.

### 3 — The judge sees anchors only after the clean turn {#inv-clean-turn}

The turn under test runs **CLEAN**. Examples, grading instructions, and few-shot anchors are **NEVER**
injected into the turn under test — that would contaminate a faithful production turn. The judge sees the
scenario's committed anchors **only after** the turn has run, in the judge prompt.

### 4 — Faithful state {#inv-faithful-state}

Materialise a checkpoint by **driving the product's real setup path** (the manifest's state-builder binding),
then apply only small, schema-validated deltas on top. **Never hand-author a state file** — a hand-authored
fixture tests a fiction; a faithfully-built one tests what the product actually produces. For a
history-driven turn, materialise by **record-then-fork**: fork a version-pinned committed base session so the
frozen conversation drives the turn deterministically. Re-record the base only on a deliberate agent bump.

### 5 — Clean-room; a bare-host run is forbidden {#inv-clean-room}

Every turn runs inside the **pinned hermetic container** — a **bare-host run is FORBIDDEN**. A precondition
miss on the clean room is `BLOCKED`, **not** a fallback to the host. The host contaminates a child run with
the operator's global agent config, availability hooks, deny-lists, permission settings, and an empty API
key — a captured run showed a host fetch silently denied. The container strips all of that, pins the agent
CLI + OS deps, gives each turn its own in-container repo (so no nested VCS dir is committed), and bind-mounts
the test code / shared libs / pinned product tree read-only.

### 6 — Scrub before anchor {#inv-scrub}

Run dumps are **secret-bearing**; an anchor is **committed**. **Scrub every anchor of live secret values
before promoting any run excerpt into it** — the trace excerpt, the reply excerpt, and any fetched
grounding-corpus body. Anchors grow over time from real runs; each is scrubbed on the way in. **Judge
grounding-corpus redaction:** when a grounding judge grades a turn against the bodies it fetched, **redact
each fetched body before it reaches the judge prompt** — the figures under test (fees / thresholds / dates /
steps) are not secrets, so redaction cannot hurt grounding, but a fetched body may carry an identity
field or token that must not egress into the judge turn. (The grounding-judge engine itself is deferred; the
redaction obligation stands for when it lands.)

## The judge — one example-anchored call per scenario {#judge}

Send the genuinely-semantic criteria a structural operator cannot express (e.g. "the agent invented no fee
from memory") to `judge`, under two rules: the **turn runs clean** ([§3](#inv-clean-turn)), and **one batched
call per scenario** — all of a scenario's `judge` lines grade in a single call with the scenario's committed
few-shot anchors injected, so it grades against precedent. Anchors are labelled pass/fail trace-and-reply
excerpts grown from real runs (scrubbed on the way in, [§6](#inv-scrub)); a deterministic-decisive anchor
also carries the assertion that decides it. The judge prompt orders the framing + numbered criteria + anchors
first and the completed turn-under-test last, so the freshest thing in the judge's context is exactly what it
grades.

## Verdict, findings, exit measurement {#verdict}

Produce, per scenario, a **PASS / FAIL / XFAIL / XPASS** verdict with its version snapshot (agent CLI version
· pinned product SHA · materialised-state hash · any upstream-data SHA) and the deciding assertion(s). Reduce
to a run outcome: **Fail** on any assertion FAIL · **Partial** on an XPASS or a per-scenario block · **Pass**
otherwise.

- Emit a record per FAIL to [findings-schema](findings-schema.md) so it consolidates at the caller's panel
  (severity · the failed assertion as evidence · the scenario as owner-locus).
- Append the durable **run-log line** — the version snapshot + each scenario's verdict + the `pass_rate` — to
  the committed run history, and commit it; it is the only artifact that survives across runs (the
  per-scenario result is overwritten).
- The full result, rendered report, and per-scenario stream dumps land in a gitignored run dir — they carry
  secret-bearing stream output, so scrub before lifting any of it into an anchor ([§6](#inv-scrub)).

Carry the per-run `pass_rate` (with the version snapshot) as the node-exit measurement, so the analytics
surface projects a regression trend and the caller consumes the gate signal. A **`BLOCKED` or absent
`pass_rate` does not satisfy the target** — the gate is inconclusive, never a silent pass.

## Cite out {#cite-out}

- The config the process runs against — scenarios · state-builder binding · launch surface · domain-operator
  registration · judge anchors · version pins · live-dep wiring · the `pass_rate` target →
  [checkpoint-manifest-schema](checkpoint-manifest-schema.md).
- The verdict records emitted for a FAIL → [findings-schema](findings-schema.md).
