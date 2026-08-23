---
subject: node-edge-schema
title: Node & edge schema
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring or validating a node file or edge."
derive-from: [graph-spec, node-schema]
reviews-on: node-edge-schema-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [local-node-schema, glossary]
---

# Node & edge schema

The concrete **field shapes and value-spaces** a node, an edge, and a reference's frontmatter must satisfy —
the contract the **graph spec** (local, per-consumer) fixes the *shape* of and defers the *values* to. What a node or edge
**is** relationally (the taxonomy, the 1:1 law, the DAG-skeleton-with-process-loops) is the graph model; how
`generate` **projects** a node file into a clean primitive is the generation model; **term** senses are the
glossary. This reference fixes the value-spaces, never an instance of them — a real node id, a real edge target
are runtime, recorded in the graph-record.

## The node file {#node-file}

A node is **one canonical markdown file** — graph frontmatter over an imperative body — projected into one
common Agent Skill. The graph keys are authoring metadata stripped by `generate`; runtime frontmatter is exactly
`name` and `description`.

**Required core** — validate rejects a node missing any:

| field | value-space | note |
|---|---|---|
| `id` | kebab-case; matches the node's directory | |
| `primitive` | `skill` | the one runtime primitive |
| `execution` | `inline` · `isolated` | context policy; defaults to `inline` |
| `title` | string | |
| `description` | string — *what it does* + *Use when …* | the routing signal; "when-to-use" is folded in, not a separate field |
| `mode` | `collaborative` · `autonomous` | hand-run posture; independent of context isolation |
| `determinism` | `deterministic` · `generative` | algorithmic → deterministic; judgment → generative |
| `edges` | object of typed arrays | the edge vocabulary (below) |
| `goals` | array of `{ outcome, metric, earns-keep }`, ≥ 1 | outcomes, not activities (below) |
| `status` | `vX.Y.Z — YYYY-MM-DD` | terse |

**Execution policy.** `inline` runs in the invoking context; `isolated` runs in a fresh child context and returns
a summary. Isolation changes context only — never node identity, content, permissions, or gate authority.
`mode` separately classifies the node's **default hand-run posture**: a node may carry an unattended branch
provided that branch routes out rather than proceeds on any decision it would otherwise put to the operator.

**Classification axes + staleness (required on every node).** A node carries the same three axes a reference
does (glossary §axes) plus the staleness-engine fields — validate rejects a node missing any:

| field | value-space | note |
|---|---|---|
| `provenance` | `vendored` · `local` | picks the placement home |
| `cadence` | `always-on` · `on-demand` · `process-reference` | when it reaches the agent; a node is reached at need → **`on-demand`** by default |
| `level` | `L1` · `L2` · `L3` | entropy altitude; a node body carries execution detail → **`L3`** (the contaminant rule: mixed → L3) |
| `reviews-on` · `last-reviewed` · `entropy` | staleness-engine fields | drift-clock subject · git-SHA pin · observed churn |

**Runtime projection.** Every emitted `SKILL.md` contains exactly the common `name` and `description`
frontmatter fields. Host-only fields are not emitted from the shared graph. Scripts and references are relative
resources owned by the skill directory.

**Carrier entry metadata (optional).** A node whose `references` edges declare exactly one
`required-state` participates in the generated carrier-entry contract. Absence of extra metadata means
the skill requires an existing carrier and must pass the bundled preamble before work. The one creator
exception declares `carrier-entry: creates`; it may enter without a carrier because it creates one.
`carrier-entry` without a `required-state` declaration, any value other than `creates`, or more than one
declaring edge is invalid. The field is graph-only and never survives into runtime skill frontmatter.

## The edge vocabulary {#edges}

Every edge is **directed** (`from → to`) and **typed**, and the type fixes its class and whether it may cycle.
The **structural skeleton is acyclic; only process edges cycle** — that is how an arc loops.

| type | from → to | class | cycles? |
|---|---|---|---|
| `invokes` | node → node | structural | no |
| `loads` | node → node / reference | structural | no |
| `composes-into` | node → arc (or parent node) | structural | no |
| `references` | node → reference (or node); carries `load: required \| on-demand` | structural | no |
| `maintains` | node → viewer-rendered reference | structural | no |
| `precedes` | node → node or product gate | process | **yes** |
| `can-follow` | node → node or product gate | process | **yes** |
| `escalates` | node → entry node of another arc, or a mid-arc re-entry of the same arc (the front) | process (handoff) | no |
| `overlay` | local node → vendored node | composition | no |
| `trigger` | event → node | binding | no |

## Schema obligations {#obligations}

The class alone is not enough; six obligations make the edges safe as a graph:

- **A corrective (cyclic) process edge is invalid without three fields** — an **exit criterion**, a
  **max-attempt / escalation policy**, and a **labelled re-entry**. Absent any one, it is an open cycle the record
  cannot tell from a stuck loop. Forward flow is declared on the source node; a re-entry is the cyclic edge.
- **A process edge shared across arcs carries an `arc` qualifier** — `{ id, arc }` — when it belongs to only one
  of them, so a shared node's arc-specific edge cannot shortcut another arc. Unqualified ⇒ it applies in every arc
  the source participates in.
- **A process edge may target a product gate or a harness phase** — the spine node owns its forward gate edge
  (`shape precedes commit-to-build`, `verify precedes commit-to-land`), and gates are carrier-enforced moments,
  not node files; the harness-lifecycle phases (`initiate`, `maintain`) are the same class. Resolution treats the
  five gate ids + the two phase ids as legal non-file targets; every other process-edge target must resolve to a
  node file.
- **A cross-arc handoff (`escalates`) names only its target** — `{ id }`. Its runtime behaviour (create-or-reuse
  the target carrier, close the source standalone carrier as `dropped`, record the two-way provenance link) is
  fixed by spec, not edge metadata; it is **excluded from arc traversal and stage projection** — an exit, not a
  next stage. One-way, never a loop.
- **An overlay edge is `{ target, via }`, additive only** — it declares which vendored node it attaches to and the
  edge type it adds; it never rewrites the target.
- **A trigger binding is not authored in a node's `edges`** — a hook declares its event→node binding in its own
  config; the record derives trigger edges from hook configs, never from node frontmatter.
- **`maintains` derives the maintainer — there is no stored maintainer field.** The node(s) holding a
  `maintains` edge into a viewer-rendered reference keep it current, and the record projects the reverse. A
  **local** reference with **no** `maintains` edge is an **orphan** the validator flags; a **vendored** reference
  is maintained by the factory. "Who maintains a reference" is uniformly graph-derived, never a special case.

## The goals block {#goals}

Each `goals[]` entry is `{ outcome, metric, earns-keep }` and must read as an **outcome** — what the node
*achieves* and how you would know it earned its place — never an **activity** (the steps it runs). A goal that
states an activity, or omits any of the three keys, is a hard validation failure. Goals drive the improvement
loop: a node whose metric never moves is visible and can be cut.

## A reference's frontmatter {#reference-frontmatter}

A **reference is not a node** — it owns no control flow and declares **no `primitive` / `execution` / `mode` / `goals` / process
edges**. Its frontmatter is a smaller, different shape, classified by the **three axes** with **no `kind` split**
(a reference is a reference; cadence — not a stored kind — governs whether the viewer renders it):

| field | value-space | note |
|---|---|---|
| `subject` | kebab-case | identity + the `reviews-on` registry key |
| `title` | string | |
| `provenance` | `vendored` · `local` | picks the placement home |
| `level` | `L1` · `L2` · `L3` | entropy altitude; a doc is durable only if **all** of it is (mixed → L3) |
| `cadence` | `always-on` · `on-demand` · `process-reference` | governs viewer-visibility + placement |
| `read-when` | string | agent-discovery trigger |
| `reviews-on` · `last-reviewed` · `entropy` | staleness-engine fields | drift-clock subject · git-SHA pin · observed churn |
| `status` | `drafted` · … | |
| `related[]` | the page-graph (bidirectional) | |

Plus **optional authoring metadata** carried verbatim, not read by the machinery: `derive-from` (the
authoring-source trail) and `pairs-with` (a coupled vendored/local reference link).

A **viewer-rendered `local`** reference that touches a vendored topic adds **`owner: local`** +
**`extends: <vendored-id>`** — adds-only: it may add anchors or sections, never redefine a vendored anchor or
contradict a vendored normative claim. The **load dial / ownership / `extends` / render-computed numbering**
*doctrine* is the graph spec's; the **staleness semantics** of these fields are the context engine's; the
**cadence × provenance → placement** derivation is the generation model's. This contract fixes only the field
shapes.

## Cite out {#cite-out}

- What a node / edge / reference **is** relationally (taxonomy · the 1:1 law · the DAG-skeleton-with-process-loops
  invariant) → graph-model.
- How `generate` **projects** a node file into a clean native primitive (strips the graph keys, single-sources
  references) and emits its record rows → generation-model.
- The **reference-layer doctrine** (the load dial · ownership / `extends` · render-computed numbering · the
  zone-matrix axis-entry) → graph-spec.
- **Term** senses (node · edge · reference · primitive · arc · carrier) → glossary.
- The **carrier** — not a node, a runtime state model → [IU-schema](IU-schema.md) · [work-item-schema](work-item-schema.md).
