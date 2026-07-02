---
subject: IU-schema
title: Implementation-unit schema — the build carrier
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring or validating an implementation unit."
derive-from: [graph-spec, IU-schema, carrier]
reviews-on: IU-schema-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [work-item-schema, gate-model, axis-entry-schema, routing-principles]
---

# Implementation-unit schema — the build carrier

The field contract for an **implementation unit (IU)** — the unit of build work and **the build carrier**: the
one shape `build` reads to operate autonomously against a well-specified unit. It carries the **content fields**
(the build-tracking body) and an **authored + gated band**; that band's `lifecycle_state` + `gate_decisions[]`
are [the gate model](gate-model.md)'s — carried here and cited, **never restated**. What an IU *is* relationally —
an instance flowing an arc, not a node — and where it sits in the two-track loop are the **graph model**'s (local,
per-consumer); this fixes the **field shapes and value-spaces**, never an instance (a real IU's ids, files, and chain are runtime,
in the workspace).

## One shape, discriminated by provenance {#one-shape}

There is **one IU shape**, not a `oneOf` over a "child" kind and a "standalone" kind. The single discriminator is
**`{ parent?, authorizing-gate-ref }`**:

- **has a `parent`** — a unit of a grouping [work-item](work-item-schema.md); it **inherits the grouping's
  authorising gate by reference** (and the grouping's signed intent), rather than carrying its own.
- **no `parent`** — a **standalone** unit; it **carries its own gate** and its own intent.

The IU **is** the build carrier either way; **provenance — not a separate shape — decides whether the gate and
intent are owned or inherited**. One shape means both formalising paths render the same fields, the
build-readiness gate validates one shape, and `build` consumes one carrier.

## Content fields {#content}

The build-tracking body — identity plus what `build` is held to:

| field | value-space | note |
|---|---|---|
| `id` · `title` | identity | `id` stable across re-plans, so dependency edges survive revision |
| `goal` | string | the **intended outcome**, outcome-framed — what is true after build, not the steps |
| `files` | array | the **scope boundary**; build flags any work outside it, never expands silently |
| `dependencies` | array of unit ids | captures **both logical ordering AND file/surface overlap**, so **absence is the parallelisability signal** — there is no separate `independent` field |
| `acceptance` | array | observable done-criteria (a condition that holds), never effort |
| `acceptance_check` | command(s) | the runnable proof of `acceptance`; build attaches its **raw output** as evidence — shown, never asserted. A pure-doc change names the explicit manual check instead |
| `size` | `XS · S · M · L · XL` | single-agent fit estimate, not a commitment |
| `status` | `planned · building · done · blocked` | build progress — a **different axis** that coexists with `lifecycle_state` |
| `zone` | `{ vertical, horizontal? }` | optional zone-matrix coordinate, capability-gated; `horizontal` **absent ⇒ the whole column** (the default vertical slice), **present ⇒ a single cell** |

## The authored + gated band {#gated-band}

Beyond the build body, the IU carries the authored + gated fields — most defined elsewhere and cited:

- **`lifecycle_state` + `gate_decisions[]`** — carried, **not redefined**: the band, its hash-chain, its
  provenance rules, and the single writer are [the gate model](gate-model.md)'s. The IU applies gate-model's **role
  scope**: a **standalone** unit records its **own full set** (front · build-readiness · landing · closeout); a
  unit **with a `parent`** inherits the grouping's authorising gate by reference and records only its own per-unit
  landing entries.
- **`autonomy`** — `AFK | HITL`. **AFK** = cold-spec-able; **HITL** = reaching AFK-implementable needs a
  human-in-the-loop build-and-look in `shape`. **Every production build is AFK**; HITL is resolved warm in the
  front, never a cold-build pause. Front-consumed (shape decides build-and-look); the
  build-verify lane dispatches AFK only, and per gate-model an unattended context may record only AFK-classed gates.
- **`verification`** — the **vertical-slice proof**: `{ end_to_end: <the complete observable behaviour the slice
  delivers>, tests: [<the tests that prove that path>] }`. Names the tracer-bullet tests and the end-to-end behaviour
  they exercise — the structured home for *demoable/verifiable on its own* (the **Vertical slice** invariant below).
- **the outcome anchor** — **`improves` xor an inherited `outcome_link`**, mutually exclusive and keyed off
  provenance: a **standalone** unit carries **`improves`** (a typed pointer to the existing thing it serves — a
  node, a reference, or a behaviour); a unit **with a `parent`** inherits the grouping's **`outcome_link`** (the
  OKR ladder). Never both.
- **the intent block** `{ statement, in_scope[], out_of_scope[] }` and the **success definition** (measurable,
  MECE outcomes laddered to the outcome anchor) — a **standalone** unit carries its own (a light success
  definition); a unit **with a `parent`** inherits the grouping's signed premise and success definition.
- **`spec-status`** `specified | unspecified` — whether the unit's content is specced. On the unified front
  everything is specced and approved **before** the build-readiness gate, so a built IU reads `specified`; the
  flag is **verifiable, not a trust-token** — a unit that fails the check is routed out, so it cannot silently lie.

## Invariants {#invariants}

- **Vertical slice.** `goal` + `acceptance` must describe a **complete path, demoable or verifiable on its own**.
  Acceptance that only asserts one layer's shape (a schema exists, a signature is present) with no end-to-end
  behaviour is a **horizontal slice**, rejected at validate.
- **Testing.** `acceptance` carries at least one observable test condition, proven by `acceptance_check`;
  **effort is never the done signal**.
- **Single slice.** A unit has no children and may depend only on other standalone units; work that decomposes
  into sequenced slices is a **grouping work-item, not a unit** — promote it.
- **Single-agent-implementable.** `goal` + `files` + `acceptance` must be buildable by one fresh agent within its
  best-work context budget — a **harness-tunable dial**, not a schema constant; a unit that would overflow it is
  too coarse — split it.
- **Cold-handoff.** A fresh agent with only this carrier file and repo access could implement and prove the unit —
  the universal front-exit bar, certified at every depth.

## Cite out {#cite-out}

- **`lifecycle_state` · `gate_decisions[]` · decision provenance · the rigour dial · the single writer** → [gate-model](gate-model.md).
- **The grouping** a unit's `parent` points at — the work-item that holds the inherited gate, intent, and `outcome_link` → [work-item-schema](work-item-schema.md).
- **What an IU IS relationally**, the two tracks, where the gates sit → the **graph-model** internals (local, per-consumer — not shipped or linked here).
- **The relational carrier summary** — one-shape-not-two-kinds, the two substrates, position-is-projected → the **graph-spec** (local, per-consumer).
- **`current_stage`** — projected, read-only, never carrier-written → the context engine / generation model.
- **Term** senses (carrier · IU · arc · gate · autonomy) → glossary.
