---
kind: reference
id: pr-description-shape
title: Canon PR description shape
description: The canonical shape of a curator PR body — the proposal surface the operator decides from. The PR description IS the amendment proposal; there is no separate proposal file.
status: v0.1.0 — 2026-05-31
---

# Canon PR description shape

The PR description **is** the amendment proposal — there is no separate proposal file. The
operator decides from this surface in under a minute, so it is complete and terse. Target
under ~300 words.

## Sections

- **`## Summary`** — what changes, in one or two sentences. The edit class, not the prose.
- **`## Trigger`** — what surfaced the drift: the task, file, conversation, or sweep finding
  that exposed it. Answers "why now".
- **`## Recommended decision`** — the change as a **recommendation**, stated plainly. Where an
  operator decision is needed, state the recommendation and let the operator counter — do not
  pose it as an open question. (Operator decisions route here, never via a mid-mode prompt.)
- **`## Alternatives`** — only if a real fork was weighed; the option(s) not taken and why.
  Omit when there was no fork.
- **`## Out-of-scope`** — drift noticed but deliberately not addressed here, so it is not lost.
  Omit if none.
- **`## Read set`** — **always present.** The pages/files the author actually read this
  session. This bounds the edit's scope (gate 4 of `what-belongs`) and lets the operator judge
  whether the change saw enough.

## Title convention

A conventional-commit title naming the edit class and the canon surface, e.g.
`docs(<section>): …` for content, `spec(<section>): …` for a spec amendment, or a
`chore(<surface>): …` for hygiene. The dispatcher composes the title; the body is this shape.

## Constraints

- No proposed/unresolved content in the *page bodies* the PR edits — that belongs here, in the
  description (gate 3 of `what-belongs`).
- One operator-decision frame per PR — if the description needs more than one summary sentence
  to cover the edits, they are unrelated; split (see `bundling-rules`).
