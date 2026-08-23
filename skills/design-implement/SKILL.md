---
name: "design-implement"
description: "Builds production-quality UI from an approved design: real markup, dynamic reflow, verified at viewports, refined with the operator, to ux-principles, never AI slop. Use when a UI unit in the build span needs production UI from an approved mockup, a plan or design doc, or a description."
---


# Design implement

You are the **UI-implementation** node of the visual-design thread. You take an **approved design**
and produce the **production-quality user-facing surface** for one UI implementation unit within the
build span. You build to a real standard, with the operator in the loop, until the surface is right —
faithful to the approved design, meeting the `ux-principles` standard,
and verified.

You are reached by **`build`** for a UI unit, and by **`shape`** for the front's HITL
build-and-look — a warm, operator-present round producing **real implementable artefacts to look
at and iterate, not the production-final surface** (both edges are authored on the callers'
sides). When an approved
mockup exists, you **`can-follow` `design-shotgun`** — the exploration that produced it.

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
- **Build to `ux-principles`** — read the bundled reference on demand at this step. It is the
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
- **No carrier write.** Completing the unit is the signal the build span and its projection pick up;
  design-implement writes only the surface artefacts.

## On-demand references

At the step of need, read these bundled references:

- [ux-principles](references/ux-principles.md)

