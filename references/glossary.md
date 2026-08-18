---
subject: glossary
title: Glossary
provenance: vendored
level: L1
cadence: on-demand
read-when: "Looking up a coined term."
derive-from: [graph-model, graph-spec, generation-model, harness-topology]
reviews-on: glossary-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [node-edge-schema, context-principles]
---

# Glossary

The **coined vocabulary** of stack-graph: the terms that carry a load-bearing *stack-graph* sense, not a
standard one. Each is **one line — the sense + a `→ pointer`** to the page that elaborates it. This
reference is the dictionary, **not** the model (how the terms relate is the graph model) and **not** the
contract (the field shapes are the graph spec & schemas); each term has **one home** and is never restated.

Deliberately **absent**: terms a competent reader already understands (`loop`, `stage`, `coupling`,
`thread`, `tier`, …), the per-page mechanics each page defines where it uses them, and contract
value-spaces (lifecycle-state names, gate fields) — those live in the schema references.

## Primitives {#primitives}

- **node** — a primitive that **owns control flow** (it branches or sequences). Only control-flow-owning primitives are nodes. → graph-model
- **edge** — a typed, directed relationship between nodes; the type fixes whether it may cycle. → graph-model *(the type taxonomy is graph-spec's)*
- **inline** — content with no control flow of its own — a small reference, a tool call, an execution surface (a worktree, a headless browser); rides a native primitive, **neither node nor edge**. → graph-model
- **reference** — shared content as a **single-source native artefact** (not an injected block); owns no control flow, so it is **not a node**. → graph-spec
- **carrier** — the live work-state file for **one unit of work**. Two kinds share the runtime band: the **build carrier** (an IU) and the **grouping carrier** (a work-item). → IU-schema · work-item-schema
- **gate** — a recorded go/no-go transition on a carrier at a stage boundary — an **attested decision**, not a node or edge, gathering no context of its own. → graph-spec
- **sign-off surface** — the rendered, interactive presentation a firing node puts a gate to the operator with — generated from the carrier, widget-first; the operator's real click on it is the attestation. → gate-model
- **arc** — a named, possibly-cyclic **traversal** over nodes — the unit of work an operator invokes; derived from process edges (and **not** graph-theory's "arc" = a directed edge). → graph-model

## The carrier model {#carrier-model}

- **implementation unit (IU)** — the unit of build work and the **build carrier**: one shape discriminated by provenance (a child of a work-item, or standalone). `build` reads the IU. → IU-schema
- **work-item (WI)** — the **grouping carrier** at the front: groups its IUs and holds the signed intent, the outcome link, and the durable record. A carrier, but **not** a build carrier. → work-item-schema
- **AFK / HITL** — a build unit's **autonomy** classification: implementable unattended (**AFK**) vs needing a human-in-the-loop build-and-look in `shape` (**HITL**). Every production build is AFK. → IU-schema

## The classification axes {#axes}

The three orthogonal axes every node and reference carries — kept separate by design:

- **entropy (level)** — *how durable*: **L1** (vocabulary) · **L2** (durable doctrine) · **L3** (paths, values, instances). A doc is durable only if **all** of it is — any L3 contaminant demotes the whole (**mixed → L3**). → context-layer
- **cadence** — *when it reaches the agent* (closed enum): **always-on** (the floor, `@`-inlined) · **on-demand** (viewer-rendered, navigated at need) · **process-reference** (node-carried, read only inside its owning node). → generation-model
- **provenance** — *who authored it*: **vendored** (factory-authored, shipped **verbatim** to every consumer via the plugin) vs **local** (the harness's own, in its `.claude/`). Picks the placement home. → generation-model

## Composition & generation {#composition}

- **harness** — a consuming workspace's specialisation over the vendored graph; "harness-local" means specific to the *workspace*, not a single product. → harness-topology
- **overlay** — the **additive, extend-only** local layer (local nodes, entry nodes, composition edges) that adds to — never edits — the vendored graph. → harness-topology
- **binding** — the indirection by which a vendored node resolves the **logical keys it requires** (paths into its workspace) against the harness's bindings reference, on demand at the step of need. → harness-topology
- **crystallised** — local content **instantiated in the harness** from a (vendored) schema or template and filled with product values — e.g. `bindings.yaml` from `bindings-contract`, the dashboard from its conventions; the counterpart to **vendored** (shipped verbatim). → harness-topology
- **factory** — where the vendored graph is authored; `generate` projects it into the plugin. → generation-model
- **generate** — the deterministic function that **places** the authored graph into shipped artifacts (the vendored graph into the plugin, the floor cores into `.claude/`); it places, **never authors**. → generation-model

## The operator interview {#operator-interview}

- **design tree** — a subject modelled as decisions: every decision branches into the decisions that hang off it. → operator-interview
- **frontier** — every decision whose prerequisites are already settled — the only questions honestly askable now. → operator-interview
- **round** — one numbered question set putting the whole current frontier to the operator, answered by number. → operator-interview
