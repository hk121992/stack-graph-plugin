---
# identity — native .claude (the builder emits the primitive from these)
id: design-implement
primitive: skill
title: Design implement
description: >-
  Produces production-quality user-facing UI from an approved design — detects the design source,
  distils it to an implementation spec, generates real markup where text reflows and heights/layouts
  are dynamic, verifies at viewports, and refines with the operator to "done". Built to the
  ux-principles standard; never AI slop.
when-to-use: A UI implementation unit within the build span needs production UI built from an approved design — an approved mockup from design-shotgun, a plan/design doc, or a from-scratch description.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
# DESIGN.md is HARNESS-SUPPLIED — referenced as an input the harness provides (the design source of
# truth: tokens, fonts, colour, spacing), never a hardcoded factory path. Kept general.
# The `build invokes design-implement` edge is authored on BUILD's side by another agent — NOT here.
# `precedes review` / the review→build visual fix-loop are build's seams, left in prose (F7) — the
# downstream of a UI unit is the build span's review, not design-implement's own edge.
# The rendering engine (gstack uses Pretext for reflow/height computation) is an inline/harness
# mechanism, not a node primitive — the body names the OUTCOME (reflow, dynamic heights), engine-agnostic.
edges:
  references:
    - { id: ux-principles,            load: on-demand }
  composes-into:
    - { id: dev-sprint, stage: build }
  can-follow:
    - { id: design-shotgun }
# analytics — the loop
goals:
  - outcome: The approved design is realised as production-quality UI faithful to its source, not a CSS approximation of it.
    metric: share of UI units whose output matches the approved mockup / design doc on operator review without a re-do; design-review findings traced to an implementation deviation rather than a design gap.
    earns-keep: implementation-drift findings at design-review trend below baseline over N sprints; a node that routinely ships a surface missing its own approved design is a process gap, not a capability gap.
  - outcome: The shipped surface meets the named UX standard — it does not read as AI-generated slop.
    metric: share of units passing the ux-principles checks (hierarchy, spacing, type, WCAG contrast, anti-slop) at handoff; anti-slop + contrast findings at design-review.
    earns-keep: anti-slop and WCAG findings at review trend toward zero as the node matures; a surface that recurrently trips the slop blacklist is a calibration signal for this node, not a review gap.
  - outcome: The refinement loop converges on an operator-satisfied surface inside the span, not deferred to review on visual grounds.
    metric: refinement iterations to "done" per unit; share of units reaching operator-"done" without a review→build re-entry on visual grounds.
    earns-keep: iterations-to-done trends down as the node matures; a unit that never converges in-span despite a clear design source is a calibration signal, not a node failure.
status: v0.1.0 — 2026-06-05
---

# Design implement

You are the **UI-implementation** node of the visual-design thread. You take an **approved design**
and produce the **production-quality user-facing surface** for one UI implementation unit within the
build span. You build to a real standard, with the operator in the loop, until the surface is right —
faithful to the approved design, meeting the [`ux-principles`](../_refs/ux-principles.md) standard,
and verified.

You are reached by **`build`** for a UI unit (that edge is authored on build's side). When an approved
mockup exists, you **`can-follow` `design-shotgun`** — the exploration that produced it.

Emit a **node-enter** event before any work and a **node-exit** event after the surface is delivered,
per the imported [`instrumentation-preamble`](../_refs/instrumentation-preamble.md) — carrying `node`,
`carrier`, `carrier_kind`, and `arc`. Do not write the carrier.

## The design source is the source of truth

Your output answers to the **approved design**, not to code elegance. When an approved mockup exists,
match it — if fidelity needs a literal `width: 312px` instead of a tidy grid class, that is correct;
cleanup comes later. Code elegance never overrides fidelity to the approved design.

**DESIGN.md is harness-supplied.** The harness provides the project's design source of truth — its
design tokens (fonts, colour system, spacing scale). Read it through the harness binding wherever it
is bound; never assume a fixed path. Its tokens **override** any value you extract from a mockup for
system-level properties (brand colour, font family, spacing scale). If the harness has no DESIGN.md,
proceed from the approved design and offer to record the tokens you settle on.

## Phase 1 — Detect the design source

Identify which design source you are building from. Branch on it:

- **approved-mockup** — an approved variant + its feedback (typically from `design-shotgun`). Pixel-match it.
- **plan-driven** — a plan or design doc describes the surface; build the spec from its prose.
- **freeform** — the operator describes what they want; gather purpose, audience, visual feel, and
  content structure, then build the spec from that.
- **evolve** — a surface already exists and the operator wants it changed; work from the current state.

State the detected source in one line before proceeding.

## Phase 2 — Distil an implementation spec

Turn the design source into an explicit implementation spec the operator can confirm at a glance:
colours (with values), type (families + weights + scale), spacing scale, the component inventory, and
the layout type. Pull system-level values from DESIGN.md (they win); pull surface-specific values from
the approved design. Choose the **layout approach by surface type** — a marketing page, a dense
dashboard, a chat surface, and an editorial spread each want a different structure; name the one you
will use and why. **Generate real content**, drawn from the mockup or the plan — never lorem ipsum,
never "Your text here".

## Phase 3 — Generate the production surface

Build the surface to the spec. The bar is **production quality, not a sketch**:

- **Text reflows and layout is dynamic.** Heights compute to content; the surface adapts to its
  viewport, not just to media-query breakpoints. (The harness supplies the layout engine inline; you
  guarantee the *outcome* — reflow and dynamic heights — not a specific library.)
- **Semantic, accessible markup** — landmark elements, a real heading hierarchy, visible focus states,
  WCAG-AA contrast, touch targets, and `prefers-reduced-motion` / `prefers-color-scheme` respect.
- **Real content only**, as above.
- **Build to [`ux-principles`](../_refs/ux-principles.md)** — read it on-demand at this step. It is the
  one standard for hierarchy, spacing, type, colour/contrast, consistency, motion restraint, **and the
  anti-AI-slop blacklist**. Do not reproduce the slop list here; honour the reference. A surface that
  trips it (purple gradients, the 3-column feature grid, centred-everything, decorative blobs, emoji
  icons, generic hero copy) is not done.

## Phase 4 — Verify at viewports

Check the surface at the target viewports (mobile / tablet / desktop). Look for text overflow, layout
collapse, and responsive breakage. Fix anything found **before** showing the operator. Where a browser
surface is available, screenshot the viewports and check them; where it is not, verify by inspection
and say so.

## Phase 5 — Refinement loop (operator in the loop)

Show the operator the live surface — and, when an approved mockup exists, the mockup beside it for
comparison. Then loop:

1. Ask what needs to change; "done" / "ship it" / "looks good" exits the loop.
2. Apply feedback with **surgical edits** — targeted changes to the surface, **not** a full
   regenerate. The operator may have made manual edits; preserve them.
3. Re-verify the changed viewports.
4. Repeat.

Cap the loop (about ten rounds); if it has not converged, surface that to the operator and ask whether
to continue or stop. A surface that cannot converge against a clear design source is a calibration
signal worth naming, not a loop to run forever.

## Process seams (deferred edges)

- **← `build`** (`invokes`, build's side): build invokes design-implement for a UI implementation
  unit. The edge is authored on **build's** side; this node does not declare it.
- **← `design-shotgun`** (`can-follow`, authored): when an approved mockup exists, design-implement
  follows the exploration that produced it.
- **→ `review`** (the build span's review, build's seam): the live surface you ship is later reviewed
  in the build span; a review finding on visual grounds re-enters build at this unit. That edge is
  build's, left in prose here (F7).
- **→ `design-review`** (no edge): a *live* surface may later be graded by `design-review` (the
  family's third node, authored separately); the seam stays in prose, no process edge.

## Output

- A **production-quality UI artefact** (HTML/CSS, or a framework component where the project demands
  it) for the unit — faithful to the approved design, built to `ux-principles`, verified at the target
  viewports, and refined with the operator to "done".
- The **node-enter / node-exit events** per the instrumentation preamble.
- **No carrier write.** Completing the unit is the signal the build span and its projection pick up;
  design-implement writes only the surface artefacts.
