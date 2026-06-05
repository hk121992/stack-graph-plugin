---
kind: reference
id: iron-law
title: The Iron Law — no fix without a confirmed root cause
description: >-
  The debugging constraint debug is built on: never apply a fix until the root cause is reproduced
  and confirmed. Carries the investigate→analyse→hypothesise→fix discipline, symptom-vs-cause,
  reproduce-first, one hypothesis at a time, and the escalate-don't-guess exit. Use when fixing a bug
  or reviewing a fix for root-cause rigour.
status: v0.1.0 — 2026-06-05
---

# The Iron Law

**No fix is applied without a confirmed, reproduced root cause.** A fix that addresses a symptom
instead of its cause is whack-a-mole: it moves the bug, masks the next one, and makes the real
defect harder to find. Confirm the cause first, then fix it.

## The discipline — investigate → analyse → hypothesise → fix

Run these in order; do not skip ahead to a fix.

1. **Investigate.** Collect the symptom — error text, stack trace, repro steps. Trace the code path
   from the symptom back toward candidate causes. Check recent changes: a regression means the cause
   is in the diff.
2. **Reproduce first.** Trigger the bug deterministically before forming any hypothesis. If you
   cannot reproduce it, gather more evidence — do not proceed on a guess.
3. **Hypothesise.** State one specific, testable claim about what is wrong and why. **One hypothesis
   at a time** — never fan out fixes for several candidate causes at once.
4. **Confirm.** Prove the hypothesis at the suspected cause (a temporary log, assertion, or probe)
   against the reproduction. Evidence must match before you write any fix.
5. **Fix the cause.** Apply the smallest change that eliminates the confirmed cause. Minimal diff;
   resist refactoring adjacent code. Add a regression test that fails without the fix and passes with it.

## Symptom vs cause

The symptom is what was observed; the cause is what is actually wrong. "The build fails" is a
symptom — the cause is the specific reason it fails. Fix the reason, never suppress the signal.

## When the cause will not confirm

If the hypothesis is wrong, return to investigate and gather more evidence — do not patch on a hunch.
If repeated hypotheses fail, **stop and escalate** (surface to the operator, instrument and wait, or
question the architecture) rather than guess-patching. A fix you cannot reproduce and verify is not
shipped.

**Red flags — slow down.** "Quick fix for now" (there is no for-now); proposing a fix before tracing
the data flow (you are guessing); each fix revealing a new problem (wrong layer, not wrong code).

---

**Source.** The Iron Law and the four-phase discipline are lifted from gstack's `investigate` skill
(root-cause-first debugging). The runtime mechanics — the 3-strike escalation rubric, scope-lock — are
owned by `debug` and its companion refs, not restated here.
