---
name: "debug"
description: "The Iron-Law root-cause fix path — investigate, analyse, hypothesise, fix, with no fix applied until one root cause is reproduced and confirmed. Carries the Iron Law inline, fans out parallel read-only probes to test candidate causes, and escalates instead of guess-patching. Use when a build (or review) hits a failing check, runtime error, or regression that cannot be diagnosed and fixed quickly in-span, and the cause is not yet known."
---


# Debug

You are the root-cause fix path. A stage — `build` (or `review`) — invokes you when a unit
fails and the cause is not quickly diagnosable: a failing acceptance check, a runtime error, a
regression that the host could not fix inline. You run **investigate → analyse → hypothesise →
fix** under the **Iron Law** (below): no fix is applied until one root cause is reproduced
and confirmed. You return a confirmed fix and a regression test to the host stage, or you
escalate — never a guess-patch.

The Iron Law section carries the constraint and the discipline; the phases run it and own the
runtime mechanics the constraint leaves out: the parallel probe fan-out, scope-lock, the
3-strike escalation, the blast-radius gate, and the report.

You run **inside the host's span**, not as a stage — no preamble and no carrier read of your
own: your turn-1 context is the host session's (the dispatched build session's bundle when
`build` hosts), and the failure context arrives from the host, which holds the IU. A
verify-discovered defect that re-runs `build` as a fresh correction session may reach you
there — you still return your report to *that* host session; the bounded reopen is
`verify`/`dispatch`'s, not yours.

## The Iron Law

**No fix is applied without a confirmed, reproduced root cause.** A symptom-fix is
whack-a-mole — fix the reason, never suppress the signal. The discipline, in order — do not
skip ahead to a fix:

1. **Investigate** — collect the symptom (error text, stack, repro steps); trace the code path
   back toward candidate causes; check recent changes (a regression means the cause is in the
   diff).
2. **Reproduce first** — trigger it deterministically *before* forming any hypothesis. Can't
   reproduce ⇒ gather more evidence, don't proceed on a guess.
3. **Hypothesise** — one specific, testable claim. **One hypothesis at a time** — never fan out
   fixes for several candidate causes at once.
4. **Confirm** — prove the hypothesis at the suspected cause (a temporary log / assertion /
   probe) against the reproduction; the evidence must match before any fix is written.
5. **Fix the cause** — the smallest change that eliminates the confirmed cause; minimal diff;
   resist refactoring adjacent code; **add a regression test that fails without the fix and
   passes with it.**

**When the cause won't confirm:** a wrong hypothesis ⇒ back to investigate. Repeated failures ⇒
**stop and escalate** — never guess-patch (the strike count is the 3-strike gate below). A fix
you cannot reproduce and verify is not shipped.

**Red flags — slow down:** "quick fix for now" (there is no for-now) · proposing a fix before
tracing the data flow (you are guessing) · each fix revealing a new problem (wrong layer, not
wrong code).

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
(one message, multiple isolated child contexts). Each probe gets one hypothesis, the symptom, the affected
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

### The 3-strike rule (escalation gate — do not skip)

If **3 hypotheses fail to confirm**, STOP. This is likely architectural, not a simple bug.
Surface the escalation honestly:

- **Attended session** — the operator chooses: **continue** (you have a genuinely new
  hypothesis; state it) / **escalate** (hand to a human who knows the system) / **instrument
  and wait** (add logging and catch it on the next occurrence).
- **The dispatched AFK build span** — there is no operator to pause for: return **BLOCKED** to
  the host with the strike evidence, and the host's return envelope routes the escalation out
  (`dispatch` parks it for the operator's decision). Never wait mid-span.

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

## Output

- A **confirmed fix** + a **regression test** + the **DEBUG REPORT**, handed back to the host
  stage; or
- an **escalation** at the 3-strike gate (the operator's decision, in-session or via the host's
  return envelope) — never a guess-patch shipped as a fix.
- Control returns to the **host stage** either way — never to a next backbone stage. You write
  no carrier field and touch no gate; the host owns the unit, and any lifecycle write is
  `record-gate`'s.
