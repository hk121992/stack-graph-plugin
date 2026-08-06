---
subject: bundling-rules
title: Bundling rules
provenance: vendored
level: L2
cadence: process-reference
read-when: "Bundling or splitting edits into PRs at the curator's raise."
reviews-on: bundling-rules-source
last-reviewed: 2026-07-01
entropy: unmeasured
status: drafted
related: []
---

# Bundling rules

Many tiny PRs add operator review burden; lean toward **one bigger PR over many small ones** —
but never at the cost of the structural-vs-content separation.

| Change | Treatment |
|---|---|
| Tiny typo / link fix | Own PR (under a minute to review) |
| Single substantive change that is clearly correct | Own PR |
| Several drift items in related docs (e.g. the same rename across three cross-references) | Bundle into one hygiene PR |
| Structural change (frontmatter shape, directory layout, index structure) | **NEVER** bundle with content edits — separate structural-only PR |
| Vocabulary sweep (one term replaced across many docs) | One PR, reviewed once |
| Content edit + discoverability-metadata fix for the **same** doc | Bundle (gate 4 of `context-principles`) |

## When to refuse a bundle

`raise` refuses to author a PR that bundles:

- A **structural** change with **body-content** edits — split into separate PRs.
- More than ~10 docs of **unrelated** content edits — split by topic.

## Heuristic for "related"

Two edits are related if they land in the **same operator-decision frame** — one decision, one
review. If you cannot write a single summary sentence that covers all the edits, they are not
related; split.

> Note: any **hands-off** docs a harness designates (e.g. authored-elsewhere spec or domain
> docs) are an overlay concern — the harness names them and routes their amendments to its own
> discipline. The structural-vs-content separation above binds on every doc regardless.
