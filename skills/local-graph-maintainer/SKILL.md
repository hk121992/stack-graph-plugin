---
name: "local-graph-maintainer"
description: "Authors and maintains a harness's own local skills and references in its local overlay, wired to the vendored graph by overlay edges. Modes: new, family, reference, amend, validate, index. Use when a harness adds or maintains local nodes in its org-root overlay; never the vendored graph."
---


# local-graph-maintainer

You are operating the `local-graph-maintainer` skill inside a **consuming harness** (a workspace
that installs the stack-graph plugin). The operator invoked the skill with `<mode> <args>`.
**You are the dispatcher** — mode
selection, preflight, phase gates, and narration are behaviours you execute by following this file.

You author and maintain the harness's **own local skills** in its single harness-owned local
overlay, wired into the read-only vendored stack-graph by overlay edges. You
are the consumer-facing counterpart to the factory's `sg-graph-maintainer`, and one of the three
**MAINTAIN-lane substrate-maintainers** — sibling-parallel to `strategy-curator` and
`context-curator`, no edge between the three. You own the **mechanical** half of harness-local
graph authoring — native-projected form, overlay/extend-only checks, schema `validate`, the local
`index`; the **language/placement doctrine** half is `context-curator`'s, which *flags* node-body
drift on local surfaces and *routes the enacting fix here*. **Read your authoring contract —
`local-node-schema` — before authoring anything**; it carries the exact frontmatter shape, the
overlay/extend-only rules, the bindings rule, and the crystallisation wiring.

## The one rule that differs from the factory: no harness-side build

The factory authors `graph/<id>/<id>.md` and a build projects it to a clean native primitive. **A
harness has no build.** So you author a local node **in its final runtime form directly** — the
native fields present and correct (`name:` IS the id; `description:` already carries the trigger
guidance), **with the graph lens as extra keys** (`mode`/`determinism`/`edges`/`goals`/`status`)
that the runtime ignores and your `validate`/`index` read. Authoring `id:`+`title:` without
`name:` produces an **unloadable** primitive — there is no build to fix it up. See `local-node-schema` §1.

**Inline-keys posture.** That the runtime tolerates the extra graph keys is verified by a pre-ship
probe. If you cannot confirm the probe passed on this host version, author the node anyway
(the native fields make it valid) but **tell the operator the inline-keys form is unverified here**,
and offer the thin-strip fallback (keep the graph lens in the committed `research-report.md`, strip
it from the runtime file) if they want certainty.

## What you read, and where you write

- **The vendored graph record — read-only, read-authentic.** Resolve the installed plugin through
  the host's plugin registry, then read the generated graph record from that immutable install.
  Derive the node and reference sets from the record; never hard-code an inventory or infer it from
  directory names. This is read-authentic and
  install-location-agnostic (user- or project-scope), and **not a harness binding** — a binding
  could be redirected to a consumer-writable copy. Use it to resolve overlay / `extends` targets
  and to check id non-collision. **If it is unreadable, hard-refuse to author an overlay edge** —
  do not silently skip the check.
- **The harness bindings** — `<bindings-surface>`, read on demand (a convention read,
  not a `references` edge). You navigate from a value when you need one (e.g. the local-references
  root, a crystallisation-manifest path).
- **Write boundary (enforce on every write).** Canonicalise the absolute target and **refuse the
  write unless it is within the bound `<harness-local-root>` or `<org-root>/.stack-graph/`**.
  **Refuse any path under the plugin install root**
  resolved above — that is the read-only vendored install. This guards node files, `.bak`, sidecars,
  manifest stubs, and the local record.
- **Where things land.** Node file → `<local-skills-root>/<id>/SKILL.md`.
  Durable `research-report.md` → committed beside the node (or under `.stack-graph/local-authoring/<id>/`
  if inert-sidecar load is unverified). `source-material/` and the local graph record →
  **gitignored** `<org-root>/.stack-graph/` (write a `.gitignore` entry for `source-material/`).

## How invoked

```
/local-graph-maintainer                         # bare; orient + ask which mode
/local-graph-maintainer new <id> [scope-hint]
/local-graph-maintainer family <id,id,…> --from <template-id>
/local-graph-maintainer reference <id>
/local-graph-maintainer amend <id>
/local-graph-maintainer validate [<id>|all]
/local-graph-maintainer index
```

`<id>` is kebab-case and **namespaced apart from the vendored graph** — default to a non-empty
harness prefix (read a `local-prefix` convention from the harness `root instruction projections`/`bindings.yaml` if
declared, else ask the operator; unprefixed-local is allowed only when the hard collision check
passes). On bare invocation, print a one-paragraph orientation and use the host's native
operator-confirmation control to ask which
mode to run.

## Preflight (every mode)

1. The bound `<harness-local-root>` exists. 2. `<id>` is kebab-case and not
`stack-graph:*`. 3. The id does not collide with any id in the vendored record (hard). 4. Every local
node is a `skill` with `execution: inline | isolated`. Abort with a clear
message on any failure.

## Modes

Read the relevant section and `local-node-schema` before acting.

### new — greenfield local node
1. Preflight. Surface effort and obtain operator confirmation through the host's native control.
2. **Research (optional, isolated — the firewall).** If a sourcing corpus is available (operator-
   supplied at invocation, or a declared `corpus-registry` convention), **run generic research
   guidance in an isolated child context** to gather source into `.stack-graph/local-authoring/<id>/source-material/`
   and return **only** a `research-report.md`. Source-material never enters your context — that is
   what keeps synthesis honest (you cannot shortcut "researcher→canonical"). **No corpus ⇒ record-only:**
   a domain node encoding the operator's own knowledge is legitimate; record that no external corpus
   was searched and proceed — never block.
3. **Synthesise** the node file from the research-report (never from source-material) into the
   overlay in native-projected form (`local-node-schema` §1). Author overlay edges (§extend-only
   below) and goals as outcomes.
4. Optional **crystallise** intent → wire the manifest stub + edges (see Crystallisation).
5. Run `validate <id>` inline. Report: node path, validate result, artefacts.

### family — N siblings from a template
Preflight each sibling id; confirm the local template node exists; confirm no sibling already
exists (else route to `amend`). Gather a per-sibling dimension hint. **Run one copy of the sibling
guidance per sibling in an isolated child context**, each deriving its sibling from the template (report →
node, mirroring the template's edges/goal shape, dimension-specialised). Batch-`validate`. Report.

### reference — local reference
Author a **local reference** at `<local-references-root>/<id>.md` (the local-references root) —
node-bound shared content, consumed via a `references` edge with `load: required|on-demand`, carrying
the reference frontmatter (`subject` / the three axes / `read-when` / staleness fields). An
on-demand local reference enters the harness's at-hand index through its `read-when` (the index is
regenerated, never hand-listed). A local reference **touching a vendored topic** declares
`extends: stack-graph:<id>` and **adds only** — slug-exists is hard-checked; anchor-adds-only is
deferred to the integrate backstop. Local doctrine is a **reference in the graph** — there is no
separate doctrine store; if a piece proves general, the home question is `context-principles`' and
the route is the raise-to-factory path, not a local fork.

### amend — edit a local node
Verify the node + research-report exist. Ask what is changing. **`.bak` first** (within the write
boundary). **Edit the node file directly**, then update the research-report to match — there is no
"re-render from report" (no build seam). Run `validate <id>`. Report; leave the `.bak`.

### validate — schema + overlay checks (no writes)
Per node: native fields present (`name`+`description`); `primitive: skill`; `execution` is
`inline` or `isolated`; `mode` and `determinism` valid; `edges` targets resolve (skip
`composes-into` and `external: true`); `references` targets resolve with valid `load`; `goals` each
carry `outcome`/`metric`/`earns-keep`; body non-empty; a judgment pass (does mode/primitive/goals
fit the declared execution policy). **Overlay checks:** id namespaced + non-colliding (hard); every `overlay`/`extends` target
resolves in the **vendored record** (hard; refuse the check loudly if the record is unreadable);
**no-hardcoded-path warning** (an absolute path or workspace-root-relative segment outside a fenced
example → warn, fix = a binding read); crystallisation-edge shape (`external: true` ref resolves to
the stub; `invokes` resolve). Surface results; remediation is a follow-up `amend`.

### index — regenerate the local record (admin/analytics only)
Scan the `edges:` frontmatter of every local node; write the gitignored local graph record to
`<org-root>/.stack-graph/graph-record.local.json` (nodes, references, edges; project `consumed_by`).
**Optionally** also emit the renderer's composed `{nodes,edges}` overlay manifest at
`renderer.graph-local` **when that key is bound** — owner-badged `sg`/`local`, read-only over the
vendored record, cross-boundary `overlay` edges tagged local-origin. This is never a runtime view.

## Extend-only (enforce at author time)

An overlay may only **add** — a new local node, or a new edge into a vendored node. It must never
shadow, replace, or re-route a vendored node. Hard author-time checks: id/namespace non-collision;
`overlay`/`extends` targets exist in the vendored record. Anchor-adds-only is the integrate
backstop, not yours. **Be honest about scope:** supported hosts route skills by `description`, ignoring the
graph keys, so your checks are hygiene + collision-impossibility, not a runtime guarantee against a
hand-edited node — the `explore`/`zone` read-time checks are the backstop. On any conflict, **the
factory wins**: point the operator to the **raise-to-factory** path; never edit a vendored entry.

## Crystallisation (wiring only)

When a node should accumulate harness-local outputs over time, author the **wiring** and stop:
an `external: true` `references` edge to the **crystallisation manifest** (path resolved via a
binding/overlay read, **never hardcoded**), `invokes` edges to any scripts, and an **empty manifest
stub** in the overlay. The manifest is **inert data the node reads, never a source/exec target**.
Author the `invokes` *edge* and at most an **operator-reviewed, never auto-executed** script
scaffold. **Do not populate or grow the manifest** — the running node does that, gated at the
`review` spec-match before its change lands.

## Hard constraints

- **Synthesise from the research-report, never from source-material directly** — the isolated
  research agent is the firewall; you never hold source-material in context during synthesis.
- **Never write a vendored file** — enforce the write boundary on every write; refuse the resolved plugin install root.
- **Never shadow a vendored node** — namespace apart; extend-only is hard at author time.
- **Bindings over hardcoding** — a local node reads workspace paths via its binding; flag hardcoded paths.
- **`.bak` before every overwrite**; leave it (operator cleans up).
- **Surface gate failures through the host's native operator-confirmation control** — never auto-decide.
- **`name:` is the runtime key** — author native-projected form; never ship `id:`+`title:` without `name:`.
- **You are the mechanical half, not the doctrine half.** Author tight (`description` ~200–350
  chars, what it does + Use when; body prose-economy; never compress safety/irreversible/ordered
  steps) — but ongoing node-body **language/placement currency is `context-curator`'s to flag and
  yours to enact** on local surfaces; do not run your own currency sweeps.
- **No zone-principle authoring.** The per-surface zone briefs under `axis-root` are not yours:
  `harness-init` seeds them; agents auto-raise candidates into `memory.md`; `context-curator`
  reviews them in.

## Reference

- `local-node-schema` (loaded on-demand) — the authoring contract: native-projected form, overlay
  edges, extend-only, bindings-over-hardcoding, crystallisation wiring, write boundary.

## On-demand references

At the step of need, read these bundled references:

- [local-node-schema](references/local-node-schema.md)

