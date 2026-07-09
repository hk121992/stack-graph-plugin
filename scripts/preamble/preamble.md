---
name: "preamble"
description: "The workflow's single parameterized turn-1 state loader — a deterministic, stdlib-only script that loads the active carrier's live state from the DERIVED projection (never the carrier file), emits KEY: VALUE for turn 1, treats the carrier as delimited untrusted data (size-cap, field-allowlist, secret presence-probe), and fails closed. One loader serves every stage — triage, shape, dispatch, build, verify, land, debrief — each stage's inject-list a required-state declaration, its parameter; gates get no preamble. Use when a stage body fires its turn-1 state load at session start — fresh from the derived projection rather than a fat always-on reference or a stale carrier file."
---

<!-- runs turn-1 every session -->

# Preamble — the deterministic turn-1 state loader

You own the workflow's **preamble**: a deterministic, stdlib-only script (`preamble.py`, shipped with
the plugin) that loads the active carrier's live state and emits one stream of `KEY: VALUE` lines for
the agent's **turn-1** session state. There is **one** preamble, parameterized per stage: WHICH state
keys it emits is whatever the **entered stage declared** via `--required-state`, so the same script
serves `triage`, `shape`, `dispatch`, `build`, `verify`, `land`, and `debrief`, each loading only the
runtime-state it declared. Gates carry **no** preamble. It exists so per-turn context is
**fresh, safe, and cheap** — the fat always-on operating-instructions reference stays retired — and
so a stage **resumes from the live projection** rather than re-reading a carrier file that may have
gone stale. You are the **turn-1 live load**; the standing root instructions are a separate surface
(`sg-root-instructions`, `@`-ref'd into the harness's `CLAUDE.md` by `harness-init`).

The script is the deliverable; this node is its contract. The **entered stage's body fires you at
turn 1** — a skill-invocation invoke on each skill/phase invocation, **not** a `SessionStart` hook —
so turn-1 state is loaded in practice, not merely specified. Parse the emit and keep the four
disciplines intact. Do not re-implement the script's logic in prose — invoke the script.

## The four disciplines (load-bearing — do not relax)

1. **Derived projection, never the carrier file.** The live lifecycle/stage is read from the **derived
   projection** (the `portal-projection.json` snapshot the publisher writes — see `bindings-contract`
   §6 for where the event-log/projection surfaces bind; `IU-schema` / `work-item-schema` for the
   projected-`current_stage` rule and the carrier fields). The carrier *file*'s `lifecycle_state` is a
   hand-written field that goes **stale** the moment work advances without a gate write — a carrier
   can sit at `idea` while delivery is underway. Emit the projection's **derived** stage as the live
   state, and an explicit **staleness/absence marker** when the projection is missing or unconfirmed —
   **never** a stale carrier-file value surfaced as the truth.
2. **The carrier file is delimited untrusted data.** When the script reads the carrier file (only to
   surface a small allowlisted set of routing scalars), it treats it as untrusted: a hard **size cap**,
   a closed **field allowlist** (only named scalars are surfaced as values), and a **secret
   presence-probe** that reports only whether a secret-shaped field is present — it **never** binds,
   slices, prints, or echoes the value. A file-declared `lifecycle_state` surfaced here is explicitly
   marked DECLARED, distinct from the derived live state.
3. **Fail closed.** Any error — a broken/absent projection, an unreadable carrier, an internal crash —
   degrades to the safe **`JIT_FALLBACK`** floor (a stable emit telling the agent to discover state
   just-in-time), never a stack trace and never a wrong state.
4. **General emitter.** WHICH state keys the script emits is whatever the **entered stage declared**
   via its `required-state` declaration, passed as `--required-state`. There is **no stage
   special-case** in the script: point it at any declaring stage's required-state and it emits exactly
   that set; a non-declaring node resolves to the coarse default. Adding a declaration to another
   stage later is **pure content** — no re-plumb.

## How the emitter resolves `--required-state`

The required-state list is resolved by the **general** build-time path:
`resolveNodeRequiredState(nodeId)` reads the entered stage's declared `required-state` (via
`resolveRequiredState` — a declared list, else the coarse one-size default), and that resolved list is
what is passed to the script as `--required-state`. The declaration lives on the stage node; the
script receives a parameter, never a hardcoded gather.

## The seven parameterizations

The stage-tailored runtime-state each stage declares (each a `required-state` list, pure content):

- **triage** → the triage-source queue · the open-IU manifest (duplicate + dependency detection).
- **shape** → the carrier's settled decisions · the signed intent block (the premise the alignment
  floor checks) · open IUs + spec-status.
- **dispatch** → the decision-complete IU queue · per-IU build/review state · batch|drain mode ·
  parked route-outs · the per-IU zone coordinate.
- **build** (the dispatched IU session) → the one IU record — `goal` · `files` · `acceptance` ·
  `verification` — plus the correction `finding` (a verify-discovered reopen) and the prior
  `dev_tip`. Declared on `build`'s own edge — the seventh parameterization, not a hand-down of
  dispatch's list.
- **verify** → the batch change-set (the IUs on dev) · touched surfaces · dev-env health (the
  depth-adjustment turn-1 state). The applicable verify modalities are **not** a turn-1 inject —
  verify reads them on-demand against the verify-procedure surface map.
- **land** → the promotion-set carriers (`shipped`, gate-cleared at verify's exit) · deploy/health/canary status · live-confirmed
  gate state.
- **debrief** → the sprint goals/improves · measured rows per node · learnings awaiting curation.

You inject **live runtime-state only** — never navigation and never doctrine. The
`at-hand-references-index` is always-on on the floor (`sg-root-instructions` §Reference index), not a
preamble inject; the strategy page and the decisions store are on-demand reads at the step of need.

## Invocation

```
preamble.py \
  --projection <portal-projection.json>      # the DERIVED projection (the live-state source)
  --carrier <carrier-file>                   # opened ONLY as delimited untrusted data
  --carrier-id <id>                          # the projection key to read
  --required-state <the entered stage's resolved list>
```

It emits `KEY: VALUE` lines (`CARRIER_STATE_SOURCE: derived-projection`, `CARRIER_STAGE: …`,
`CARRIER_LIFECYCLE_STATE: …`, `CARRIER_SECRET_PRESENT: …` when a secret-shaped field exists) plus the
stage-tailored keys its `--required-state` named, or the `JIT_FALLBACK` block on any failure. The
emit is **deterministic** (a pure function of the inputs — no clock, no randomness), so it is
golden-testable and idempotent across repeated turns.

You write **no carrier field** — `record-gate` writes `lifecycle_state` + `gate_decisions[]`; stages
write content; the projection is derived. You are read-and-emit only.

## The generate seam

The script is placed into the plugin through the **generic non-text-primitive extension point** in
`build/generate.ts` (a declarative `{ src, rel, tree }` registry, self-cleaning, with its own
`--check` drift list). The seam is generic by design — a future hook/script primitive registers in
the same list and inherits the copy + idempotency + drift-check; the preamble is not special-cased.
The `generate:check` freshness gate proves the seam round-trips byte-identically.

## The floor beneath you

You operate **beneath** the always-on band the calling agent already carries: the consolidated floor
`sg-root-instructions` (the root set, the `<sg-*>` process family inline, §Reference index →
`@at-hand-references-index`, §Git-write → `@git-policy`) plus the crystallised identity surfaces
(`@product-definition` · `@product-principles`), `@`-ref'd into the scaffolded
`CLAUDE.md` by `harness-init`. You supplement that floor with **live work-state**; you do not
re-inline doctrine, and per-session runtime state is loaded just-in-time by you — never embedded as a
session-start procedure in `CLAUDE.md`.

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/IU-schema.md` — `IU-schema`
- `references/bindings-contract.md` — `bindings-contract`
- `references/work-item-schema.md` — `work-item-schema`

