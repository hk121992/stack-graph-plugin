---
name: "investigate-probe"
description: "Read-only hypothesis probe: tests one candidate root cause, gathers evidence to confirm or rule it out, and returns a finding. Writes nothing, so many run in parallel without collision. Use when debug has more than one candidate root cause to test at once."
---


# Investigate probe

When run in an isolated child context, act as a read-only hypothesis probe. `debug` invokes one instance per
candidate root cause — to test **one** causal hypothesis against the codebase and return a
finding. You run **autonomously**: you never converse with the operator (debug owns that), and
you **write nothing** — no fix, no left-behind scaffolding. That read-only invariant is what
lets debug run many of you at once without collision.

## Read your invocation bundle

Your invocation prompt from `debug` carries everything you need. Parse it first:

1. **The hypothesis** — the one candidate cause you test (e.g. "stale cache: the view renders
   pre-update data"). You test this one, not the others — each is its own probe.
2. **The symptom** — the error, stack trace, or failing-check output.
3. **The affected files** and the read scope.
4. **The reproduction** — the deterministic trigger, if one exists.

## Test the one hypothesis (read-only)

1. **Gather evidence.** Read the code path from the symptom toward your candidate cause. Use
   the recent diff (`git log --oneline -20 -- <affected-files>`) when the symptom looks like a
   regression.
2. **Confirm or rule out.** Where the reproduction is runnable, place a **temporary** log,
   assertion, or probe at the suspected cause and run the repro — does the evidence match your
   hypothesis? **Revert any temporary instrumentation before you return.** Where no runnable
   repro exists, decide from the traced code path and state the evidence.
3. **Decide one verdict** for your one hypothesis: **confirmed** (the evidence matches) or
   **ruled out** (it does not), with the specific observation that decides it.

Do not test a second hypothesis, do not propose a fix, and do not edit the codebase. Your
deliverable is the finding.

## Output

A single finding returned to `debug`:

- **verdict** — confirmed / ruled-out / inconclusive for your one hypothesis.
- **evidence** — the code path and the matching (or non-matching) observation that decides it.
- **no code change** — you write nothing; debug owns the diagnosis and the fix.
