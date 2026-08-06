---
subject: git-policy-schema
title: Git-policy schema — the crystallised per-repo/path write policy
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring a harness's git policy."
derive-from: [git-policy, bindings-contract]
reviews-on: git-policy-schema-source
last-reviewed: 2026-06-30
entropy: unmeasured
status: drafted
related: [bindings-contract, sg-root-instructions, product-dashboard-conventions]
---

# Git-policy schema — the crystallised per-repo/path write policy

The shape of a harness's **crystallised git policy**: the per-write-target graduation map every git-writing
node reads off the floor (`@git-policy`, carried by `sg-root-instructions`) before any git write. The factory
ships this **schema** (general, no values); each harness **crystallises its instance** — the actual repos,
paths, and modes — via `harness-init`. Definition (vendored → here) vs instance (crystallised → the local
`git-policy` surface).

## The shape

An ordered list of **entries**, each mapping a **write target** to a **graduation mode**:

| field | meaning |
|---|---|
| `target` | a **repo** (the unit a push lands in), optionally narrowed by a **path predicate** (a glob within that repo) |
| `mode` | `direct` (push directly) or `pr-gated` (graduate via a labelled PR) |
| `label` | *(pr-gated only)* the PR label that marks the write |

**Most-specific wins** — a path-narrowed entry overrides its repo's default, the repo default overrides the
global default. **Fail closed:** a target matching **no** entry ⇒ `pr-gated` (a labelled PR), so an unknown
write can never silently skip review (the default the floor trigger states).

## How it is consulted

A git-writing node names the **repo + path** it is about to write, matches the **most-specific** entry, and
graduates accordingly — `direct` ⇒ push; `pr-gated` ⇒ open a labelled PR with the entry's `label`. No node
re-encodes the decision; the crystallised map is the single source.

## Crystallisation

`harness-init` authors the instance from the harness's git topology and materializes it to the local
`git-policy` surface, `@`-ref'd as `@git-policy` from `sg-root-instructions` (so the resolved policy reaches
the floor, read directly). The instance carries the harness's real repos/paths; this schema carries only the
shape. Illustrative instance (not normative):

```
- <repo-a>/                 : direct
- <repo-b>/.claude/**       ⇒ pr-gated (label `<policy-label>`)
- <repo-c>/                 : pr-gated (label `<factory-label>`)
```

## Cite out

- **The floor trigger** an agent reads first → `sg-root-instructions` §Git-operations (carries `@git-policy`).
- **The bindings seam** (where a harness declares its instance / inputs) → `bindings-contract`.
- **Why the dial exists, the taxonomy, the mechanism** → the local `devops-loops` reference.
