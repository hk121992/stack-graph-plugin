---
kind: reference
id: handoff-prompt-convention
title: Handoff-prompt convention — the delta-only field form for cold agent→agent handoffs
description: >-
  The field form an agent→agent handoff prompt is written in — a spawn_task chip, a loop-runner
  dispatch prompt, or any message a cold session consumes. Delta only, ≤150 words, paths over prose,
  policy by pointer never by copy. Use when authoring a chip or any prompt that will execute in a
  session that does not share this one's context.
status: v0.2.0 — 2026-06-12
---

# Handoff-prompt convention

A handoff prompt is consumed by a **cold session** — a `spawn_task` chip, a loop-runner dispatch
prompt, or any message handed to an agent that does not share this conversation's context. Written as
human prose with standing policy inlined, such a prompt **bloats** (the same repo coordinates and
push/branch rules re-stated per handoff) and **goes stale** (inlined policy is frozen at authoring
time; it can already be wrong by execution time). The fix is structural, not discipline: write the
**delta** in a fixed field form, and point at policy rather than copy it.

## The field form

```
GOAL: <imperative, one line>
WHERE: <repo>@<branch> — paths, file:line
DO: <steps / constraints, bullets>
DONE-WHEN: <acceptance + verify command>
POL: <on-disk policy refs by path only>
EPH(<date>): <expiring facts: PR#s, untracked files, concurrent-session state>
META: carrier=<id> kind=<work-item|standalone-iu> arc=<dev-sprint|incremental> iu=<id>
```

`META:` is the **machine-readable attribution line** — present on a **loop-runner dispatch prompt**
(omit it on a human chip that carries no carrier context). It is a single line of
`key=value` tokens in a fixed, stable grammar so the transcript analyzer can attribute a dispatched
session's derived analytics to the right `(carrier, kind, arc, iu)` deterministically (see
[the unified analytics design](../../docs/issue-sweep-designs/cluster-A-unified-analytics.md) §3.5).
Values are drawn from the closed vocabularies the projection already enforces (`carrier_kind`, `arc`
allowlists), so a malformed token degrades to a null attribution at the publisher, never a wrong one.

## Rules

- **Delta only, ≤150 words.** Carry what *this* task changes — not the standing context the cold
  session already has. Padding is the failure mode.
- **Paths over prose.** A `file:line` or a repo-relative path beats a paragraph describing where
  something lives.
- **Policy by pointer, never by copy.** Copied policy goes stale between spawn and execution; the
  hooks enforce it anyway at the moment of violation; and the cold session auto-loads the repo
  `CLAUDE.md`. So name the policy by its on-disk home — never paste it in.
- **`POL:` refs must resolve cold — on-disk only, never project memory.** A chip-spawned worktree
  session may not key the same memory directory, so a `POL:` pointer into project memory may resolve
  to nothing. If a fact's only home is memory, that is a **routing gap to fix first** (give the fact
  an on-disk home), not a reason to inline it.
- **`EPH(<date>)` for expiring facts.** PR numbers, untracked files, concurrent-session state — date
  them so a reader at execution time can see at a glance whether they are still current.
- **`META:` is machine-readable, not prose.** On a loop-runner dispatch prompt, carry one `META:`
  line of fixed `key=value` attribution tokens so the transcript analyzer can attribute the dispatched
  session deterministically. Keep the grammar stable (the analyzer parses it with a bounded regex);
  use only the allowlisted `kind`/`arc` values. Omit the line on a human chip with no carrier.

## Worked example

A real chip ran **~417 words**. Compressed to the field form it is **~60 words** — the dropped ~350
were push-policy prose. That policy did not need carrying: the **pre-push hook teaches it at the
moment of violation**, and a copy in the chip would only have gone stale. What survived was the
task delta — the goal, the paths, the acceptance check, and a dated `EPH` line for the in-flight
PR numbers.

## One home for cold-handoff doctrine

The same convention covers **loop-runner dispatch prompts** and **return envelopes** (both already
field-shaped): a dispatch prompt is a handoff into a sub-agent, an envelope is a handoff back. This
reference is the **single home** for cold-handoff message doctrine — author all three against this
field form. The dispatch prompt's `META:` line doubles as the **attribution source** the
transcript-derived analytics reads (the A↔C convergence): formalising the envelope here makes a
dispatched session's carrier/arc/IU machine-readable by construction, instead of regex-fragile prose.
