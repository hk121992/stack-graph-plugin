---
subject: local-node-schema
title: Local-node authoring contract
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring a local node or overlay."
derive-from: [local-node-schema]
reviews-on: local-node-schema-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [node-edge-schema, bindings-contract]
---

# Local-node authoring contract

The contract a **consuming harness** authors its own local nodes against — extending the read-only vendored
graph through its harness-owned local overlay **without forking it**. It is the consumer-facing counterpart to the
vendored [node & edge schema](node-edge-schema.md): the factory authors a node and `generate` projects it to a
clean primitive, but **a harness has no build** — so a local node is authored **in its final runtime form
directly**. This reference fixes that form and the overlay rules; the **shared node/edge shape** (the frontmatter
superset, the edge vocabulary, the goals block, a reference's frontmatter) is node-edge-schema's, cited not
restated.

## Native-projected form {#native-form}

The local node file **is** the runtime primitive — there is no build to fix it up:

- It carries the **native fields, present and correct** — `name` is the load-bearing key (**not** `id`/`title`;
  authoring `id`+`title` without `name` yields an **unloadable** primitive) — **plus** the graph-lens keys
  (`mode` · `determinism` · `edges` · `goals` · `status`) as additional metadata the runtime **ignores** and only
  `validate`/`index` read. *(This inert-keys tolerance is **unverified on the running host version**
  until the pre-ship probe confirms it — the maintainer warns accordingly.)*
- Every local node homes at the overlay's `skills/<id>/SKILL.md` and projects onto `skill`. This is a **harness
  policy, not a universal claim**: node-edge-schema's `execution: isolated → agent` projection is performed by
  `generate`, and a harness has no build — so a local node is authored in final runtime form and only the
  inline/skill projection is available to it. A harness needing an isolated role authors that host's native
  agent file directly, outside the local-node contract.
- `execution: inline`, `mode`, and the rest of the lens are exactly node-edge-schema's. A local node declaring
  `execution: isolated` is invalid — there is no projection step to honour it, and a declaration that reaches no
  runtime is the defect node-edge-schema §Runtime projection names.

## Namespacing — collision-impossible by construction {#namespacing}

A local id **must not** be in the vendored namespace and **must not** collide with any id in the vendored graph
record; default to a **non-empty harness prefix**. Resolve the installed plugin through the host's
plugin registry, then read the record **read-authentic from that plugin install root** — never through a
harness-supplied binding (a binding could be redirected to a writable copy); **unreadable ⇒ hard-refuse** the
overlay edge rather than skip the check.

## Overlay edges, extend-only {#overlay}

- A local node attaches to a vendored node with an **overlay edge** `{ target, via }` — **add-only**: an overlay
  may only **add**, never shadow, replace, or re-route a vendored node.
- Author-time hard checks: id/namespace non-collision; the overlay / `extends` target exists in the vendored
  record. A local **viewer-rendered reference** touching a vendored topic declares `extends`, adds-only (the
  anchor-level no-redefine check runs at integrate).
- **Honest scope:** the runtime routes by `description`, ignoring the graph keys, so author-time checks are
  collision-impossibility + hygiene, **not** a runtime guarantee against a hand-edited node — the `explore`
  `zone`-mode read-time checks are the backstop.

## Bindings over hardcoding {#bindings}

A local node needing a **workspace path** reads its **binding** at the step of need (a convention read of the
bindings file, navigated from the value — not a `references` edge); a hardcoded workspace path is a **validate
warning**. Shared *content* (a schema, a rubric) is a `references` edge to a local reference; a workspace
*path/identity* is a binding read.

## Crystallisation wiring {#crystallisation}

A node that accumulates harness-local outputs over time gets its **wiring authored up-front** and grows the
assets itself at runtime (gated at `review`'s spec-match): an `external: true` reference to its crystallisation
manifest (the path bound, never hardcoded), `invokes` edges to any scripts it runs, and an **empty manifest
stub**. Invariants: the manifest is **inert data the node reads**, never a source/exec target; the maintainer
authors the *edge* and at most an operator-reviewed, never auto-executed script scaffold — the **running node**
populates the manifest, gated before its change lands.

## Write boundary {#write-boundary}

Every write canonicalises its absolute target and is **refused unless within the bound harness-local root**
(including the local-references root) or `.stack-graph/`. Any path under the **read-only plugin install root** is
refused. Authoring sidecars and the local graph record are gitignored `.stack-graph/` working state; the durable
curation record is committed.

## Cite out {#cite-out}

- **The shared node/edge shape** — the frontmatter superset, the edge vocabulary + cyclic rules, the goals block, a reference's frontmatter → [node-edge-schema](node-edge-schema.md).
- **The path-resolution seam** the binding read resolves against → [bindings-contract](bindings-contract.md).
- **Harness · overlay · binding · crystallised — what they *are*** → the **harness-topology** spec (local, per-consumer) · glossary.
- **The sole consumer** — the maintainer that reads this before authoring a local node → local-graph-maintainer.
