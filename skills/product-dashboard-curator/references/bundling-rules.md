---
kind: reference
id: bundling-rules
title: Canon PR bundling rules
description: When the curator bundles several edits into one PR vs splits them, and the bundle-refusal cases. Lean toward one-bigger-PR, but never mix a structural change with content edits.
status: v0.1.0 — 2026-05-31
---

# Bundling rules

Many tiny PRs add operator review burden; lean toward **one bigger PR over many small ones** —
but never at the cost of the structural-vs-content separation.

| Change | Treatment |
|---|---|
| Tiny typo / link fix | Own PR (under a minute to review) |
| Single substantive change that is clearly correct | Own PR |
| Several drift items in related sections (e.g. the same rename across three cross-references) | Bundle into one hygiene PR |
| Structural change (frontmatter shape, directory layout, table-of-contents promotion) | **NEVER** bundle with content edits — separate structural-only PR |
| Vocabulary sweep (one term replaced across many pages) | One PR, reviewed once |
| Content edit + discoverability-metadata fix for the **same** page | Bundle (gate 4 of `what-belongs`) |

## When to refuse a bundle

`raise` refuses to author a PR that bundles:

- A **structural** change with **body-content** edits — split into separate PRs.
- More than ~10 pages of **unrelated** content edits — split by topic.

## Heuristic for "related"

Two edits are related if they land in the **same operator-decision frame** — one decision, one
review. If you cannot write a single summary sentence that covers all the edits, they are not
related; split.

> Note: any **hands-off** sections a harness designates (e.g. authored-elsewhere spec or domain
> pages) are an overlay concern — the harness names them and routes their amendments to its own
> discipline. The structural-vs-content separation above binds on every page regardless.
