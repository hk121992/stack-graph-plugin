---
subject: context-principles
title: Context principles — the placement oracle
provenance: vendored
level: L2
cadence: on-demand
read-when: "Placing authored content (home / altitude / surface)."
derive-from: [context-layer]
reviews-on: context-principles-source
last-reviewed: 2026-07-01
entropy: unmeasured
status: drafted
related: [glossary, pr-description-shape]
---

# Context principles — the placement oracle

Where a piece of authored content belongs. Run this when classifying any content — a reference, a node
body, a floor core, a learning. The recurring bug it exists against is **conflating three independent axes**;
keep them separate.

## The three axes — independent, applied to references AND nodes alike

| axis | question | values |
|---|---|---|
| **entropy** | how *durable*? | L1 · L2 · L3 |
| **cadence** | *when* does it reach the agent? | always-on · on-demand · process-reference |
| **provenance** | *who* authors it? | vendored · local |

Conflating any two is the defect. **Altitude is *kind*,
not depth:** the glossary is L1 whether 3 terms or 300; a model is L2 because it is a *model*, not because it
is deep. **Not all L1 is floor** — a deep L1 reference (the full glossary) is L1 but lives on-demand.

## The entropy test

> **Will this still be true after the next refactor?** **yes** → a reference or a node body (L1/L2);
> **no** → code / runtime (L3).

- **L1 — *why*:** identity, goals, principles, constraints, vocabulary. Survives every refactor.
- **L2 — *how*:** workflows, procedures, contracts, schemas, the domain model. Survives an implementation
  refactor; changes when the approach does.
- **L3 — *what*:** file paths, names, node-body detail, instance values. Constant churn — never durable;
  lives in code/runtime, never in an authored doc.

**The contaminant rule:** a doc is durable only if **all** of it is — any L3 contaminant demotes the whole
piece (**mixed → L3**). (So a node body, carrying L3, *falls to L3 and homes in the body itself*.)
**Definition vs instance:** a schema/definition is **L2** (a
reference); its instances/values are **L3** runtime (`okr-schema` → a reference; the objective values →
runtime).

## The placement procedure — ordered

1. **Durable?** survives the next refactor? **no** → code / runtime / decisions / recall / memory. **yes** ↓
2. **Altitude?** L1 (identity/why) or L2 (how/spec).
3. **Cadence?** every-turn-from-first-message → an **always-on floor core** · an injected runtime fact → the
   **preamble** · globally reachable at need → an **on-demand reference** · used only inside one node → a
   **node-carried `process-reference`**.
4. **Whose?** **vendored** (→ the plugin) or **local** (→ `.claude/`).

→ exactly **one home** = a (provenance × cadence) reference home. **Single home per instruction — no
duplication across surfaces; duplication is *the* drift vector.** (How that pair derives to a path is the
**generation model**'s — local, per-consumer.)

## Routing to a surface — the cadence call

Three delivery surfaces, ordered by cost. The routing question: **"what is the agent already touching at the
moment it needs this? Put it there."**

- **`always-on` floor** — `@`-inlined into `CLAUDE.md`; every agent, every session, from message one. The
  most expensive surface.
- **`on-demand` reference** — named in a node's body (a `references` edge); pulled when the work calls;
  globally reachable via the at-hand-references-index.
- **`process-reference` (node-carried)** — in the node's own `references/`; used **only inside that node**;
  the narrowest cadence.

**Floor cores are authored, not extracted** — a terse always-on core and its full on-demand reference are
**separate docs that cross-cite**, never an inlined slice of one page.

## The last-resort floor rule

**Always-on is the home of last resort.** Default to **on-demand**; put content on the floor **only if every
agent needs it every turn** (the routing answer is "every session, before any other surface has loaded").
Instructions accrete on the floor by path-of-least-resistance and bury the load-bearing ones — route each to
the surface the agent already has open. *(Safety carve-out: a trust/privacy invariant keeps its **trigger**
on the floor, its **mechanism** on-demand.)*

## The gates a placement clears

1. **Necessary** — include only what is missing or genuinely ambiguous; never what the agent can **infer**.
2. **Load-bearing** — *"would removing this cause an agent to make a mistake?"* If no, cut it (token cost on
   every read).
3. **Canonical + resolved in bodies** — a body holds settled truth; unresolved tension → the PR description;
   the decision trail → the decisions store, never the body.
4. **Symmetric scope** — fix the discoverability metadata (the index, the cross-refs) in the **same** change.

## Cite out

- The **staleness engine** that keeps a placement fresh — the drift/consumption scorer, the subject/registry
  map, the `level`/`reviews-on`/`last-reviewed`/`entropy` frontmatter — is the platform's **context-engine
  internals** (local, per-consumer; not restated or linked here). How to *read and act on* its verdict, and
  the curator that runs it, are the **context-curator** node's modes + the local `context-layer` doctrine.
- How a (provenance × cadence) pair **derives to a path** → the **generation model** (local, per-consumer).
- **Term definitions** (entropy, cadence, provenance, floor, the surfaces) → the [glossary](glossary.md).
