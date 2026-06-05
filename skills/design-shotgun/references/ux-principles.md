---
kind: reference
id: ux-principles
title: UX principles — the visual-and-interaction standard
description: >-
  The shared UX standard for visual hierarchy, spacing, type, colour/contrast (WCAG), consistency,
  motion restraint, and the anti-AI-slop patterns. Use when grading, designing, or building a
  user-facing surface (design, design-review, design-implement).
status: v0.1.0 — 2026-06-05
---

# UX principles

The **one named standard** for visual and interaction quality. `design` plans a surface to it,
`design-implement` builds production UI to it, and `design-review` grades a live surface against it —
so "does it look intentional" is a single contract, not each node's private taste. Grade against the
principles; trace every "this feels wrong" to the specific one it breaks (taste is debuggable).

This reference is the **quality of a surface**, not the *order* a node reviews in. The rating loop,
the per-screen passes, and mockup generation belong to the consuming node.

## Visual hierarchy and density

- **Every screen has a first, second, third.** What the user sees first must be the most important
  thing. If everything competes for attention, nothing wins.
- **Prominence equals importance** — size, weight, colour, and position rank elements. More important,
  more prominent.
- **Group related, contain nested.** Proximity and enclosure carry structure; related controls sit
  together, nested content sits inside its parent.
- **Treat every element as noise until it earns its place.** Cut shouting, disorganisation, and
  clutter by removal, not decoration. An empty-feeling section needs better content, not blobs.

## Spacing, rhythm, and alignment

- **Use one spacing scale** (e.g. 4/8px steps); never improvise gaps. Consistent rhythm reads as care.
- **Align to a grid.** Edges line up; ragged margins and one-off offsets read as careless.
- **Whitespace is structure, not waste** — it separates groups and sets density. Dense-but-readable
  beats both cramped and sparse.
- **A heading binds to the content below it** — closer to the section it introduces than to the one
  above. Never float a heading midway between two blocks.

## Typography and readability

- **Body text ≥ 16px.** Smaller fails readability on real screens.
- **Pick a real typeface.** No default stacks (Inter, Roboto, Arial) and never `system-ui` /
  `-apple-system` as the primary display or body font — that is the "gave up on typography" signal.
- **Two typefaces maximum**; a clear type scale (display → heading → body → caption) carries hierarchy.
- **Line length 45–75 characters**, line-height ~1.5 for body. Long unbroken measures kill scanning.

## Colour, contrast, and accessibility

- **Meet WCAG AA:** body-text contrast ≥ 4.5:1, large text and UI affordances ≥ 3:1. Never ship
  low-contrast type.
- **Define a colour system as variables** (tokens), with one default accent; do not scatter literal hex.
- **Never carry meaning by colour alone** — pair it with text, shape, or icon for colourblind users.
- **Keyboard, screen reader, and touch are requirements:** visible focus states, ARIA landmarks,
  preserved visited-link distinction, and touch targets ≥ 44px.

## Consistency and component reuse

- **Reuse before you invent.** A new component must justify its existence against the existing
  vocabulary; one control should look and behave the same everywhere.
- **Clarity beats consistency** when they conflict — if a small inconsistency makes something
  significantly clearer, take the clarity.
- **Use conventions** (logo top-left, nav top/left, magnifier = search). Innovate on navigation only
  when you *know* you have a better idea, never to be clever.

## Motion and interaction latency

- **Motion serves hierarchy or feedback, never decoration.** A few intentional, purposeful motions;
  no gratuitous animation.
- **Make clickable things obviously clickable** without hover — shape, colour, and affordance signal
  it, since touch has no hover state.
- **Keep interactions responsive.** Acknowledge an action immediately; show a real loading state, not
  a frozen surface. Empty, loading, error, and partial are designed states, not afterthoughts.

## Anti-AI-slop patterns (instant flags)

Generic patterns that scream "AI-generated" — flag and replace with specific, intentional design:

- **Purple/violet/indigo gradient backgrounds** or blue-to-purple schemes.
- **The 3-column feature grid** — icon-in-coloured-circle + bold title + two-line blurb, ×3. The most
  recognisable AI layout.
- **Icons in coloured circles** as section decoration (SaaS-starter look).
- **Centred everything** — `text-align: center` on all headings, copy, and cards.
- **One uniform bubbly border-radius** on every element.
- **Decorative blobs, floating circles, wavy SVG dividers.**
- **Emoji as icons or bullets** (rockets in headings).
- **Coloured left-border cards** (`border-left: 3px solid <accent>`).
- **Generic hero copy** ("Welcome to X", "Unlock the power of…", "Your all-in-one solution for…").
- **Cookie-cutter section rhythm** — hero → 3 features → testimonials → pricing → CTA, every section
  the same height.

Cards earn their existence: use a card only when the card *is* the interaction, never as a default
container or a decorative grid.

---

**Source.** Distilled from the gstack design methodology (`plan-design-review`, `design-review`,
`design-html` / `frontend-design`) and the OpenAI "Designing Delightful Frontends" hard rules,
themselves grounded in Krug (*Don't Make Me Think*), Rams, Norman, and Nielsen. A **rubric** adopting
the principles, not verbatim text. The rating method and review passes (owned by the consuming node)
are excluded by design.
