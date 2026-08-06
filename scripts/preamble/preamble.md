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

- **triage** → the triage-source queue · the open-IU manifest (duplicate + dependency detection) —
  both **collection-level** keys, resolved via the harness bindings (`triage-source` ·
  `improvements-manifest`; §Invocation), not the carrier projection.
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
  --bindings <bindings.yaml>                 # the harness bindings surface — resolves the
                                             # collection-level (kebab-case) keys
  --required-state <the entered stage's resolved list>
```

It emits `KEY: VALUE` lines (`CARRIER_STATE_SOURCE: derived-projection`, `CARRIER_STAGE: …`,
`CARRIER_LIFECYCLE_STATE: …`, `CARRIER_SECRET_PRESENT: …` when a secret-shaped field exists) plus the
stage-tailored keys its `--required-state` named, or the `JIT_FALLBACK` block on any failure. The
emit is **deterministic** (a pure function of the inputs — no clock, no randomness), so it is
golden-testable and idempotent across repeated turns.

**Collection-level keys.** A **kebab-case** required-state key names a **collection-level** surface
(the inherited convention: kebab-case = collection, snake_case = carrier field) and resolves through
the **harness bindings** (`--bindings`, the flat `key: value` bindings surface), never the carrier
projection — a carrier-creating stage (triage's step 0) passes **no `--carrier-id`** and gets no
projection block. `open-iu-manifest` resolves via the `improvements-manifest` binding (the
manifest's **non-terminal** entries); `triage-source-queue` via the **optional** `triage-source`
binding. A relative binding target resolves from the invoking cwd (the harness root).

- **Value vocabulary:** `unbound` — the binding key is deliberately not present (a **valid quiet
  state**, exit 0) · `absent` — bound but unresolvable (a missing/unparseable/oversize target; the
  **harness-defect signal**) · `empty` — bound and resolvable, zero entries · else the entries.
  With **no `--bindings` input at all**, a collection key keeps the explicit fail-closed `absent`.
- **Triage-source descriptor list:** the `triage-source` value is a **whitespace-separated
  descriptor list** — a single descriptor renders exactly as it always has; several merge into the
  **one** queue emit in **binding order**, deduped by rendered id after disambiguation, under the
  global 50-entry cap with the of-N head computed over the merged total (a truncated `gh` listing
  in the merge keeps the total floor-honest: `50 of N+`). Each token must satisfy the
  per-descriptor grammar below.
- **Per-descriptor grammar:** a **filesystem path** — a JSON queue file (an array of
  `{id|number, title, state}` entries) or a directory whose files are the entries (id = filename
  stem, `state=queued`; bodies never read) — or **`gh:<owner>/<repo>[?label=<label>]`** — a
  **read-only** open-issue listing via the `gh` CLI (the script's only subprocess; the test suite
  stubs it, never live) — or **`ledger:<manifest-path>?states=<s1,s2>[&intent_signed=false]`** — a
  state-filtered view over a work-ledger manifest: `states=` matches each row's `lifecycle_state`;
  `intent_signed=false` additionally requires the **derived** `intent_signed` column (the
  improvements manifest gains it at refresh) to be **present and false** — a manifest **without**
  the column resolves that descriptor `absent` (loud, never a silent unfiltered flood), as does any
  malformed token (no `states=`, an unknown param, `intent_signed=true`).
- **Cross-source ids:** with **more than one `gh` source** in the list, a gh entry id renders
  **`<repo>#<n>`** (e.g. `acme-tools#73`); a single gh source keeps the bare `#<n>`.
  Path ids are file-stem-scoped and ledger ids (`wi-*`/IU slugs) render as-is — already unique.
- **Aggregate vocabulary over a list:** **any** broken source (a malformed token of any kind, an
  unresolvable target) makes the whole key `absent` — a healthy co-source never masks broken
  wiring; `empty` only when **every** source is bound, resolvable, and empty; `unbound` stays what
  it is — the `triage-source` binding key itself absent.
- **Identity fields only:** a collection entry surfaces `id · state · title` and nothing else
  (`CARRIER_OPEN-IU-MANIFEST: 2 entries: id=… state=…; …` — key spelling `CARRIER_` + the key
  uppercased, kebab-case preserved). A queue/issue **body is external intake** — interpreted at the
  triage boundary, never emitted into turn-1 context; every field of every source kind (ledger rows
  included) is length-capped, control-character-stripped, and structural-metacharacter-neutralised
  (`;`→`,`, `=`→`:`), so the `KEY: VALUE` line discipline holds and a hostile title can forge
  neither an entry nor a line. A gate-pending IU deliberately rides **both** emits — the queue (a
  candidate awaiting the front) and `open-iu-manifest` (the dup/dependency scan needs every open
  IU) — different roles, not duplication.

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
`@at-hand-references-index`, §Git-operations → `@git-policy`) plus the crystallised identity surfaces
(`@product-definition` · `@product-principles`), `@`-ref'd into the scaffolded
`CLAUDE.md` by `harness-init`. You supplement that floor with **live work-state**; you do not
re-inline doctrine, and per-session runtime state is loaded just-in-time by you — never embedded as a
session-start procedure in `CLAUDE.md`.

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/IU-schema.md` — `IU-schema`
- `references/bindings-contract.md` — `bindings-contract`
- `references/work-item-schema.md` — `work-item-schema`

