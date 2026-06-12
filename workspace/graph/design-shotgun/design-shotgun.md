---
# identity — native .claude (the builder emits the primitive from these)
id: design-shotgun
primitive: skill
title: Design shotgun
description: >-
  Explores visual design directions for a surface — generates N deliberately distinct variants, opens
  a side-by-side comparison board, collects structured operator feedback, iterates, and records the
  approved direction with its rationale. Divergent visual brainstorming; the board is the chooser.
when-to-use: A user-facing surface needs a visual direction chosen before production UI is built, or the operator wants to explore options or fix a surface they dislike.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
# DESIGN.md is HARNESS-SUPPLIED — referenced as the default visual constraint the harness provides,
# never a hardcoded factory path. Kept general.
# The variant-rendering mechanism (gstack generates images via its own binary) is an inline/harness
# concern, NOT a node primitive — the body names the ARTEFACT (N comparable variants + a board), not
# a specific generator.
# `precedes design-implement` resolves because design-implement is authored in this same wave (not F7).
edges:
  references:
    - { id: ux-principles,            load: on-demand }
  composes-into:
    - { id: dev-sprint, stage: design }
  precedes:
    - { id: design-implement }
# analytics — the loop
goals:
  - outcome: A visual direction is chosen by the operator, with its rationale recorded, before any production UI is built for the surface.
    metric: share of surfaces entering design-implement with a recorded approved direction + feedback vs surfaces that started production with no explored direction; downstream visual rework traced to a direction never explored up front.
    earns-keep: surfaces that skip exploration and then churn at implement trend down over N sprints; a node whose chosen directions are routinely discarded at implement is mis-calibrated, not earning its keep.
  - outcome: The variants are genuinely distinct, so the comparison is a real choice rather than three shades of one idea.
    metric: share of variant sets passing the anti-convergence test (distinct font / palette / layout per variant; the headline-swap test); operator "these all look the same" rejections.
    earns-keep: convergence rejections trend toward zero as the node matures; a node that emits look-alike variants is failing its one job.
  - outcome: The feedback loop converges on an operator-approved direction rather than stalling.
    metric: rounds to approval per surface; share of sessions reaching a saved approved direction.
    earns-keep: rounds-to-approval stays bounded; a session that never converges despite genuinely distinct variants is a calibration signal, not a node failure.
status: v0.1.0 — 2026-06-05
---

# Design shotgun

You are the **exploration** node of the visual-design thread — the divergent front. You generate
several deliberately distinct visual directions for a surface, open them **side by side**, collect
structured operator feedback, and iterate until the operator approves a direction. This is visual
brainstorming, not a review: the **comparison board is the chooser**, and your job is to make the
choice real.

You compose into the **design stage** of the dev-sprint and you **`precede` `design-implement`** —
the approved direction you record is what design-implement builds into production UI.

Emit a **node-enter** event before any work and a **node-exit** event after the approved direction is
saved, per the imported [`instrumentation-preamble`](../_refs/instrumentation-preamble.md) — carrying
`node`, `carrier`, `carrier_kind`, and `arc`. Do not write the carrier.

## The default constraint is harness-supplied

The harness provides the project's design source of truth (its **DESIGN.md**: fonts, colour, spacing).
By default, explore **within** it — read it through the harness binding wherever it is bound; never
assume a fixed path. Diverge from it only when the operator explicitly says to go off the reservation.
Hold the [`ux-principles`](../_refs/ux-principles.md) standard throughout (read it on-demand): variants
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

- **composes-into `dev-sprint` @ `design`** (authored): exploration is a design-stage activity; it
  runs at the design stage alongside the `design` front.
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
- The **node-enter / node-exit events** per the instrumentation preamble.
- **No carrier write.**
