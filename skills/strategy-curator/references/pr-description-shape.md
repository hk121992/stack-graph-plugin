---
subject: pr-description-shape
title: PR description shape
provenance: vendored
level: L2
cadence: on-demand
read-when: "Composing a PR description (raise / spec / reconcile)."
derive-from: [pr-description-shape]
reviews-on: pr-description-shape-source
last-reviewed: 2026-07-01
entropy: unmeasured
status: drafted
related: [context-principles, handoff-prompt-convention]
---

# PR description shape

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
  session. This bounds the edit's scope and lets the operator judge whether the change saw
  enough.

## Title convention

A conventional-commit title naming the edit class and the surface, e.g.
`docs(<section>): …` for content, `spec(<section>): …` for a spec amendment, or a
`chore(<surface>): …` for hygiene. The raising node composes the title; the body is this shape.

## Constraints

- No proposed/unresolved content in the *page bodies* the PR edits — that belongs here, in the
  description (gate 3 of `context-principles`).
- One operator-decision frame per PR — if the description needs more than one summary sentence
  to cover the edits, they are unrelated; split (see `context-curator`).
