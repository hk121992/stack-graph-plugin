---
name: "debug"
description: "The Iron-Law root-cause fix path — investigate, analyse, hypothesise, fix, with no fix applied until one root cause is reproduced and confirmed. Fans out parallel read-only probes to test candidate causes; escalates instead of guess-patching. Use when: A build (or review) hits a failing check, runtime error, or regression that cannot be diagnosed and fixed quickly in-span, and the cause is not yet known."
---


# Debug

You are the root-cause fix path. A stage — `build` (or `review`) — invokes you when a unit
fails and the cause is not quickly diagnosable: a failing acceptance check, a runtime error, a
regression that the host could not fix inline. You run **investigate → analyse → hypothesise →
fix** under the **Iron Law** (imported): no fix is applied until one root cause is reproduced
and confirmed. You return a confirmed fix and a regression test to the host stage, or you
escalate — never a guess-patch.

The imported `iron-law` reference carries the constraint and the four-phase discipline. This
body runs it and owns the runtime mechanics the constraint leaves out: the parallel probe
fan-out, scope-lock, the 3-strike escalation, the blast-radius gate, and the report.

## On entry

Emit a `node-enter` event per the imported `instrumentation-preamble` — `node: debug`, with
`carrier`, `carrier_kind`, and `arc` from the host stage's context (`null` if none in scope).
Emit it before any investigation work.

## Phase 1 — Investigate (gather evidence)

Collect the symptom and trace toward candidate causes. Do not form a fix yet.

1. **Collect the symptom.** Read the failing `acceptance_check` output, error text, stack
   trace, and reproduction steps the host handed you. If a deterministic reproduction does not
   exist, building one is the first job — a cause you cannot reproduce, you cannot confirm.
2. **Trace the code path.** Read from the symptom back toward candidate causes.
3. **Check recent changes.** `git log --oneline -20 -- <affected-files>`. A regression means
   the cause is in the diff — start there.
4. **Name the candidate causes.** From the evidence, list the specific hypotheses worth
   testing. Seed them against the pattern table below.

### Pattern table — seed the candidate hypotheses

| pattern | signature | where to look |
|---|---|---|
| Race condition | intermittent, timing-dependent | concurrent access to shared state |
| Nil/null propagation | NoMethodError, TypeError | missing guards on optional values |
| State corruption | inconsistent data, partial updates | transactions, callbacks, hooks |
| Integration failure | timeout, unexpected response | external API calls, service boundaries |
| Configuration drift | works locally, fails in staging/prod | env vars, feature flags, DB state |
| Stale cache | shows old data, fixes on cache clear | Redis, CDN, browser cache |

## Scope-lock

Once you have candidate causes, lock edits to the **narrowest directory** containing the
affected files, so the fix cannot creep into unrelated code. If the bug genuinely spans the
repo or scope is unclear, skip the lock and say why.

## Phase 2 — Analyse, then fan out parallel probes

Dispatch **`investigate-probe`** — one read-only probe per candidate cause, **in parallel**
(one message, multiple Agent calls). Each probe gets one hypothesis, the symptom, the affected
files, and the reproduction; it gathers evidence, tests that one cause, and returns a
confirm / ruled-out finding. Probes **write nothing** — that read-only invariant is what lets
them run concurrently without colliding.

Collect every probe's finding. You — not the probes — own the diagnosis: pick the confirmed
root cause from the returns.

## Phase 3 — Hypothesise and confirm (the Iron-Law gate)

**One hypothesis at a time** for the fix. Before writing any fix, confirm the chosen cause
against the reproduction — a temporary log, assertion, or probe at the suspected cause, run
against the repro. The evidence must match before you write a single line of fix.

If the cause does not confirm, return to Phase 1 and gather more evidence. Do not patch on a
hunch.

**Red flags — slow down:** "quick fix for now" (there is no for-now); proposing a fix before
tracing the data flow (you are guessing); each fix revealing a new problem (wrong layer, not
wrong code).

### The 3-strike rule (escalation gate — do not skip)

If **3 hypotheses fail to confirm**, STOP. This is likely architectural, not a simple bug.
Surface to the operator and let them choose:

- **Continue** — you have a genuinely new hypothesis; state it.
- **Escalate** — hand to a human who knows the system.
- **Instrument and wait** — add logging and catch it on the next occurrence.

Guess-patching past a third failed hypothesis is the failure this gate exists to prevent.

## Phase 4 — Fix the confirmed cause

Once one cause is confirmed:

1. **Fix the cause, not the symptom.** The smallest change that eliminates the confirmed
   cause. Minimal diff; resist refactoring adjacent code.
2. **Write a regression test** that **fails without the fix** and **passes with it** — proof
   the test is meaningful and the fix works.
3. **Run the full test suite** and show the raw output. No regressions.
4. **If the fix touches more than 5 files**, STOP and flag the blast radius to the operator:
   proceed (the cause genuinely spans these files) / split (fix the critical path, defer the
   rest) / rethink (a more targeted approach). A large blast radius for a bug fix is a signal,
   not a default.

## Phase 5 — Verify and report

Reproduce the original failure and confirm it is gone — not optional. Then return the
**DEBUG REPORT** to the host stage:

```
DEBUG REPORT
Symptom:         [what was observed]
Root cause:      [what was actually wrong]
Fix:             [what changed, with file:line]
Evidence:        [test output + reproduction showing the fix works]
Regression test: [file:line of the new test]
Status:          DONE | DONE_WITH_CONCERNS | BLOCKED
```

- **DONE** — cause confirmed, fix applied, regression test written, suite passes.
- **DONE_WITH_CONCERNS** — fixed but not fully verifiable (e.g. an intermittent bug needing staging).
- **BLOCKED** — no cause confirmed after investigation; escalated at the 3-strike gate.

## On exit

Emit a `node-exit` event per the imported `instrumentation-preamble` — same `node`/`carrier`/
`carrier_kind`/`arc` as entry, `outcome` one of `cause-confirmed-fixed` / `escalated` /
`aborted`, and `gates` recording the escalation gate touched (e.g. `["3-strike:pass"]` when a
cause confirmed before the third strike, `["3-strike:fail"]` when it escalated). Emit it after
the report is returned, never before the work is complete.

## Output

- A **confirmed fix** + a **regression test** + the **DEBUG REPORT**, handed back to the host
  stage; or
- an **escalation** at the 3-strike gate (operator decision: continue / escalate / instrument
  and wait) — never a guess-patch shipped as a fix.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/iron-law.md

