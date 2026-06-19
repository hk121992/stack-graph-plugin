---
kind: reference
id: local-node-schema
title: Local node authoring contract
description: The shape a consumer harness authors a local node in — native-projected form plus the inert graph lens, overlay edges, extend-only, bindings-over-hardcoding, and crystallisation wiring. Read on demand by local-graph-maintainer.
status: v0.1.0 — 2026-06-14
---

# Local node authoring contract

This is the contract `local-graph-maintainer` authors against when a **consumer harness** adds
its own local nodes to its org-root `.claude/` overlay. It is the consumer-facing counterpart to
the factory's `02-graph-spec` node schema. The factory authors `graph/<id>/<id>.md` and a build
projects it to a clean native primitive; **a harness has no build**, so a local node is authored
in its final runtime form directly.

## 1. Native-projected form — author the runtime file, not a pre-build superset

A local node file IS the runtime primitive. It carries the **native fields, present and correct**,
**plus** the graph lens as additional keys the runtime ignores:

```yaml
---
# native — REQUIRED and correct (no build will fix these up)
name: <id>                       # the runtime name IS the id (not `id:`/`title:`)
description: <what it does. Use when …>   # trigger guidance folded in already
# optional native passthrough
model: <model>
allowed-tools: [Read, Edit, …]
argument-hint: <…>
# graph lens — extra keys, inert at runtime, read by validate/index
mode: collaborative | autonomous       # MUST agree: collaborative↔skill, autonomous↔agent
determinism: deterministic | generative
edges:
  references: [{ id: <local-ref>, load: import | on-demand }]
  overlay:    [{ target: stack-graph:<vendored-id>, via: <edge-type> }]
  invokes:    [{ id: <script-or-agent> }]
goals:
  - outcome: <what the node achieves>
    metric: <how you'd measure it>
    earns-keep: <when it stops earning its place>
status: vX.Y.Z — YYYY-MM-DD
---

# Imperative body — the skill/agent instructions
```

- A **skill** → `<org-root>/.claude/skills/<id>/SKILL.md`. An **agent** → `<org-root>/.claude/agents/<id>.md`.
- `name:` (not `id:`/`title:`) is the load-bearing native key. Authoring `id:`+`title:` without
  `name:` produces an **unloadable** primitive — there is no build to derive `name` from `id`.
- The graph keys (`mode`/`determinism`/`edges`/`goals`/`status`) are **extra metadata**. They are
  inert at runtime and read only by `validate`/`index`. *(This tolerance is verified by the
  pre-ship probe; until then the maintainer warns the form is unverified on the running Claude
  Code version.)*

## 2. Namespacing — collision-impossible by construction

- A local id **MUST NOT** be `stack-graph:*` and **MUST NOT** collide with any id in the vendored
  graph record. Default to a **non-empty harness prefix** (e.g. `bc-…`, `<harness>:…`); unprefixed-
  local is allowed only when the hard collision check passes.
- The vendored record is read **read-only and read-authentic from the user-scope plugin install**
  (`~/.claude/plugins/stack-graph/workspace/graph/graph-record.json`) — never a harness-supplied
  path. If it cannot be read, the maintainer **hard-refuses to author an overlay edge** rather
  than skip the check.

## 3. Overlay edges & extend-only

- Attach a local node to a vendored node with an `overlay` edge
  `{ target: stack-graph:<id>, via: <edge-type> }`. An **entry node** the operator invokes simply
  carries `overlay`/process edges into `stack-graph:*` targets.
- **Extend-only.** An overlay may only **add** — never shadow, replace, or re-route a vendored
  node. Author-time hard checks: id/namespace non-collision; `overlay`/`extends` targets exist in
  the vendored record. A local handbook-reference touching a vendored topic MUST declare
  `extends: stack-graph:<id>`.
- **Anchor-adds-only is the integrate backstop, not an author-time check** — the vendored anchor
  manifest is a render-time output not shipped to consumers, so the author-time gate verifies the
  `extends` slug exists; the anchor-level no-redefine check runs at integrate.
- **Honest scope:** Claude routes skills by `description`, ignoring the graph keys, so author-time
  + namespacing is hygiene + collision-impossibility, **not** a runtime guarantee against a
  hand-edited node. The `explore`/`zone` read-time checks are the backstop.

## 4. Bindings over hardcoding

- A local node that needs a **workspace path** reads its **binding** at the step of need (a plain
  on-demand file read of `bindings.yaml`, navigated from the value — a convention read, **not** a
  `references` edge). A hardcoded workspace path in a node body is a **validate warning**.
- **References vs bindings:** *shared content* (schema, rubric) → a `references` edge to a local
  `.claude/references/<id>.md`; a *workspace path/identity* → a binding read.

## 5. Crystallisation wiring (author-time only)

A node that accumulates harness-local outputs over time gets its **wiring** authored now; it grows
the assets itself at runtime, reconcile-gated:

- an `external: true` `references` edge to the **crystallisation manifest** (path resolved via a
  binding/overlay read, never hardcoded),
- `invokes` edges to any **scripts** it runs,
- an **empty manifest stub** written into the overlay.

Invariants: the manifest is **inert data the node reads, never a source/exec target**; the
maintainer authors the `invokes` *edge* and at most an **operator-reviewed, never auto-executed**
script scaffold; it never populates or grows the manifest (the running node does, at `reconcile`).

## 6. Write boundary

Every write — node file, `.bak`, sidecar, manifest stub, local record, handbook-reference —
canonicalises its absolute target and is **refused unless within `<org-root>/.claude/` or
`<org-root>/.stack-graph/`** (or a bound local-handbook root). Any path under `~/.claude/plugins/`
(the read-only vendored install) is refused. Authoring sidecars (`source-material/`, the local
graph record) are gitignored `.stack-graph/` machine/working state; the durable `research-report.md`
is the committed curation record.
