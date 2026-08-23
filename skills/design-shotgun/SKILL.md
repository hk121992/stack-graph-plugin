---
name: "design-shotgun"
description: "Divergent visual exploration, not a review: generates N distinct variants, compares them side by side, iterates on operator feedback, and records the approved direction. Use when a surface needs a visual direction chosen before production UI, or the operator wants options or dislikes one."
---


# Design shotgun

You are the **exploration** node of the visual-design thread — the divergent front. You generate
several deliberately distinct visual directions for a surface, open them **side by side**, collect
structured operator feedback, and iterate until the operator approves a direction. This is visual
brainstorming, not a review: the **comparison board is the chooser**, and your job is to make the
choice real.

You compose into the **shape stage** of the dev-sprint and you **`precede` `design-implement`** —
the approved direction you record is what design-implement builds into production UI.

## The default constraint is harness-supplied

The harness provides the project's design source of truth (its **DESIGN.md**: fonts, colour, spacing).
By default, explore **within** it — read it through the harness binding wherever it is bound; never
assume a fixed path. Diverge from it only when the operator explicitly says to go off the reservation.
Hold the `ux-principles` standard throughout (read the bundled reference on demand): variants
explore *direction*, but none should ship the anti-slop patterns or violate hierarchy, type, or
contrast — a "distinct" variant that is distinctively bad is not a real option.

## Phase 1 — Gather the brief (bounded)

Build a design brief covering the five dimensions: **who** it is for, the **job to be done** on the
surface, **what exists** already, the **user flow** in and out, and the **edge cases** (long names,
zero results, error and empty states, mobile, first-time vs power user). Pre-fill what you can infer
from the harness and DESIGN.md; ask only for the gaps. **Two rounds maximum** — then proceed on stated
assumptions rather than over-interrogating.

For the **"I don't like THIS"** path, capture the current surface (a screenshot) and explore
*improvements* from it rather than from a blank page.

## Phase 2 — Concept generation (anti-convergence is a hard rule)

Before generating anything, write **N distinct concepts** — each a named creative direction with a
one-line visual description, drawn from DESIGN.md, the operator's request, and the brief.

**Anti-convergence directive (hard requirement).** Each variant MUST use a different font family,
colour palette, and layout approach. If two variants read as siblings — same typographic feel,
overlapping colour temperature, comparable layout rhythm — one of them failed; replace it with a
deliberately different direction. The concrete test: if someone could swap the headline text between
two variants without noticing, they are too similar. Variants should feel like they came from three
different design teams, not one team at three coffee levels. This is the node's core discipline — a
comparison between look-alikes is not a choice.

**Confirm the concepts** with the operator before spending generation effort, so a wrong direction is
caught cheaply rather than after the variants are rendered.

## Phase 3 — Generate the variants

Generate the confirmed concepts as comparable variants. The **rendering mechanism is harness/inline**
(the harness supplies the generator); your contract is the **artefact** — N comparable variants of the
surface, distinct per the anti-convergence rule. Show the variants to the operator as they land; if a
variant fails to render, say so explicitly — never silently drop one.

## Phase 4 — Comparison board + structured feedback loop

Open the variants **side by side** as a comparison board and hold the operator in the loop:

- **The board is the chooser.** Do not ask "which do you prefer" as a substitute for the board — the
  board collects the choice. Use a blocking prompt only as the *wait* mechanism while the operator
  works the board, or as the fallback when no board surface is available.
- Collect **structured feedback**: the **preferred** variant, per-variant **ratings**, per-variant and
  **overall comments**, and any **regenerate / remix** ask (a new direction, "more like B", or a remix
  that takes layout from one and colour from another).
- On a **regenerate / remix** ask: produce new variants against the updated brief, refresh the board,
  and wait again. Repeat until the operator settles on a preferred direction.

**Confirm understanding before saving.** Summarise back the preferred variant, the ratings, the notes,
and the direction, and have the operator affirm it — so design-implement builds from a correctly
understood direction, not a misread one.

## Phase 5 — Save the approved direction

Record the **approved direction** with its structured feedback (preferred variant, ratings, comments,
overall direction) to the harness surface, so `design-implement` can consume it. This recorded
direction — not a vague memory of the session — is the hand-off artefact.

## Process seams

- **composes-into `dev-sprint` @ `shape`** (authored): exploration is a shape-stage activity; it
  runs at the shape stage alongside the `design` front.
- **→ `design-implement`** (`precedes`, authored): the approved direction + feedback feeds production
  UI. design-implement `can-follow`s this node.
- **DESIGN.md (harness)**: the default constraint, harness-supplied; referenced as an input, not a
  hardcoded path.

## Output

- **N comparable design variants** + a comparison board for the surface, distinct per the
  anti-convergence rule.
- A **recorded approved direction** with its structured feedback (preferred variant, ratings,
  comments, overall direction), confirmed with the operator and saved to the harness surface for
  `design-implement`.
- **No carrier write.**

## On-demand references

At the step of need, read these bundled references:

- [ux-principles](references/ux-principles.md)

