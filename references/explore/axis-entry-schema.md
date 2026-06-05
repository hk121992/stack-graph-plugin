---
kind: reference
id: axis-entry-schema
title: Axis entry — schema (the zone-matrix lens)
description: The shape of a single axis entry in the zone matrix — a vertical (a product-owned customer experience) or a horizontal (an eng-owned architecture layer) — plus how a zone rule attaches to the matrix and how a coordinate resolves. The harness authors concrete entries; this schema fixes the shape. A zone is the derived intersection of one vertical and one horizontal over the code-map; it is never authored.
status: v0.1.0 — 2026-06-05
---

# Axis entry — schema

The **zone matrix** is a **lens** over a product (it examines; it does not traverse — it is not an
arc): **verticals** (product-owned customer experiences) × **horizontals** (eng-owned architecture
layers); a **zone** (cell) is one experience as it lands in one layer. This schema fixes the **shape**
of one **axis entry** and the rules by which a coordinate resolves; the **harness fills the content**
(its own verticals and horizontals). The factory ships this shape and carries **no axis values** — a
concrete experience or layer is product-specific and lives only in the harness, under the `axis-root`
binding.

An axis entry is a **`kind: reference`** — it owns no control flow, declares no goals and no process
edges. It is **not a node**. This keeps the matrix inside *one node ⟷ one primitive*: the lens is
built from references and edges, not a new node kind.

## The axis-entry shape

| field | required | meaning |
|---|---|---|
| `kind` | yes | `reference` — an axis entry is a reference, not a node. |
| `id` | yes | Stable slug, unique in the harness `axis-root`. Zone rules and coordinates name it. |
| `axis` | yes | **`vertical` \| `horizontal`** — the discriminator. The resolver bins entries by this and reads it to classify a zone rule (below). |
| `title` | yes | Short human label (the experience or the layer). |
| `summary` | yes | One line — for a vertical, what the user is trying to accomplish end-to-end; for a horizontal, what the layer is responsible for. The routing signal. |
| `scope` | no | **Maps this axis value onto code-map regions** (semantics below). Optional — an entry with no scope still resolves for rule-collection; it only loses code-region narrowing. |
| (edges) `references` | no | `references` edges to this axis entry's **own governing contract/spec** — a vertical → its experience contract (`experience-contract-schema`); a horizontal → its architecture-layer spec. These are ordinary content references; they do **not** make this entry a zone rule. Harness-supplied targets carry `external: true`. |
| `status` | yes | Version line (`vX.Y.Z — date`). |

A vertical (`axis: vertical`):

```yaml
kind: reference
id: <vertical-id>                 # a customer experience
axis: vertical
title: <experience name>
summary: <what the user accomplishes, end to end>
scope:                            # optional — a vertical cuts ACROSS layers
  entry_points: [<path>, ...]     # where the experience begins in the code
  modules: [<path-or-glob>, ...]  # the modules it traverses
references:
  - { id: <experience-contract-id>, external: true, load: on-demand }   # the governing UX contract
status: v0.1.0 — <date>
```

A horizontal (`axis: horizontal`):

```yaml
kind: reference
id: <horizontal-id>               # an architecture layer
axis: horizontal
title: <layer name>
summary: <what this layer is responsible for>
scope:                            # optional — a layer is a region of the tree
  globs: [<path-glob>, ...]       # the layer's footprint
references:
  - { id: <layer-spec-id>, external: true, load: on-demand }            # the layer's spec
status: v0.1.0 — <date>
```

## The `scope` field — vertical vs horizontal

`scope` is how an axis value maps onto the **code-map** (the deterministically-extracted code
structure; see `06-analytics` and `docs/knowledge-substrate.md`). The two axes scope differently
because a layer is structural and an experience is behavioural:

- **Horizontal scope ≈ structural** — a set of **path globs** (`globs: [...]`) naming the layer's
  footprint. A layer is usually a region of the tree, so globs express it directly.
- **Vertical scope ≈ behavioural** — a customer experience cuts *across* layers, so it is expressed
  as **`entry_points`** (where the experience begins) plus **`modules`** (the set it traverses). The
  scope is the union of what the experience touches, not a single directory.

**Both are optional, and degrade gracefully:**

- A **scopeless vertical** narrows a zone to the horizontal's region alone (flagged "vertical scope
  unspecified"). Rule-collection is unaffected — rules reference the vertical *by id* regardless.
- A **scopeless horizontal** narrows to the vertical's region alone.
- **Both scopeless** → the zone has **no code region**; rules still apply by authored scope.
- The **code-map absent** (a fresh clone, tooling missing) → the resolver degrades to running the
  scope globs directly with Glob/Grep (the same degradation `explore`'s `repo` mode uses). The
  **rule half of resolution has no code-map dependency at all** — it is pure frontmatter — so the
  most valuable output never degrades; only the code-region narrowing does.

## Zone rules reference axis entries

A reference/spec node becomes a **zone rule** by carrying `references` edges to axis entries — there
is **no `applies-to` block and no new edge type**. The resolver **classifies a rule by resolving each
`references` target and reading its `axis` field** (a target with no `axis` field is ordinary content,
not an axis constraint):

| references to axis entries | classification |
|---|---|
| ≥1 vertical **and** ≥1 horizontal | **cell** rule |
| ≥1 vertical, 0 horizontal | **column** rule (all horizontals of those verticals) |
| 0 vertical, ≥1 horizontal | **row** rule (all verticals of those horizontals) |
| 0 of either | **global** rule |

**Empty axis = all values of that axis** — the absence of a constraint is the full set. Multiple
references on one axis are a union (a multi-column / multi-row rule), still less specific than a single
cell. Specificity ranks **cell > column > row > global**, with the declared tiebreak **column > row**
(the lens surfaces the customer experience first; the layer is substrate).

A zone rule (a cell rule referencing one vertical + one horizontal):

```yaml
kind: reference
id: <rule-id>
title: <rule name>
references:
  - { id: <vertical-id> }      # constrains the vertical axis
  - { id: <horizontal-id> }    # constrains the horizontal axis  ⇒ a CELL rule
# body: the rule guidance the agent loads in that zone
```

## Resolving a coordinate — cell and column queries

A zone is **derived, never authored**: it is the intersection of a vertical's scope and a horizontal's
scope over the code-map, resolved **at read time** by `explore`'s `zone` mode (no `zone-map` file, no
build step, no new tooling). The mode answers two query shapes:

- **Cell query `(V, H)`** — the finest narrowing: the code region `V.scope ∩ H.scope`, plus the
  applicable rules ranked cell > column > row > global. Use it for a genuinely single-layer change and
  for per-cell rule resolution within a column.
- **Column query `(V, *)`** — the default for sprint work: the vertical's **experience contract** (the
  UX end goal), the **union of ranked rules across the vertical's horizontals**, each touched cell's
  code region, and the **code-map-traced path + cross-layer dependencies** so the agent can reason
  about reaching the experience end-to-end. A column query is just per-cell resolution unioned over the
  vertical's horizontals — no separate algorithm.

The mechanical core (bin by `axis` → classify rules → intersect scopes → rank) is deterministic and
introduces **no judgment**; the synthesis (the budget-bounded digest, conflict-flagging, degradation
notes) is the agent's. A genuine contradiction between two equal-specificity rules with no
higher-specificity rule to resolve it is **surfaced, never silently merged**.

## Invariants

- **A zone is derived, never authored.** No zone-map file exists; the intersection is computed on read
  from the two axes' scopes over the code-map. (A hand-maintained zone grid would drift the moment
  either scope or the code changed — the authored-traceability discipline, D38/D39: structure is
  extracted, the V/H *labels* are authored, the intersection is derived.)
- **Axis membership is read from the target's `axis` field**, not declared on the edge. A `references`
  target carrying an `axis` field is an axis constraint; one without is ordinary content.
- **Empty axis = all** — an unconstrained axis is the full set of that axis's values.
- **Specificity is a declared total order:** cell > column > row > global, with **column > row** on the
  one-axis tie. The resolver never silently merges contradictory guidance of equal specificity — it
  surfaces the contradiction for the consuming stage / operator to resolve (the `lens-dispatch`
  discipline: the reduction is mechanical; judgment interprets, never produces).
- **The vertical is the unit of work, ship, and test; the cell is the unit of rule-resolution.** An
  agent holds the whole column (the experience as the end goal) and reasons over its cells; a too-large
  column splits into **thinner verticals, never horizontal layers** (splitting horizontally loses the
  end-to-end property). The governing test is the per-vertical UX test (the experience contract).
- **The matrix is a lens, not an arc.** An axis entry declares no `goals` and no process edges; the
  matrix moves no carrier and owns no gate.
- **No product literals in the factory.** Concrete axis entries are harness content under `axis-root`;
  this schema ships only the shape.
- **Read-time enforcement (the harness has no maintainer).** Because the maintainer is not vendored to
  the harness, the `zone` mode enforces harness content **at read time** — a **dangling reference** (an
  axis id that resolves to no file) and an **unresolved equal-specificity contradiction** are **flagged
  in the digest, fail-loud and visible, never silently absorbed**. A resolved target with **no `axis`
  field is ordinary content — ignored during classification, never flagged** (else every non-axis
  content reference a zone rule also carries would false-positive).
- **Testing-layer seam (forward-declared, not specified here).** Per-cell test status, turn-level
  tests, and experience-contract fixtures attach to a zone *later* and project from the event log keyed
  by the `(V,H)` coordinate; this schema reserves the seam and specifies none of it. The testing layer
  is input-gated and realised in a harness, not the factory.

## Related

- `experience-contract-schema` — the shape of the UX contract a **vertical** references and is graded
  against (the per-vertical governing test).
- `IU-schema` — the implementation unit carries the optional `zone: {vertical, horizontal?}` dispatch
  coordinate (`horizontal` absent ⇒ the whole column).
- `bindings-contract` — the `axis-root` (where the harness's axis entries live) and `code-map` bindings.
