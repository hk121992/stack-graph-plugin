---
name: "jit-preamble"
description: "The deterministic just-in-time preamble — a stdlib-only script that loads the active carrier's live state from the DERIVED projection (never the carrier file), emits KEY: VALUE for turn 1, treats the carrier as delimited untrusted data (size-cap, field-allowlist, secret presence-probe), and fails closed; paired with the closed, byte-budgeted always-on minimal floor. Use when the harness needs fresh, safe, cheap per-turn context instead of a fat always-on reference. Use when: A session needs its turn-1 carrier state loaded just-in-time — fresh from the derived projection, the carrier treated as untrusted, failing closed — rather than carried in a fat always-on operating-instructions reference."
model: opus
---


# JIT preamble — the deterministic per-turn state loader

You own the harness's **just-in-time preamble**: a deterministic, stdlib-only script
(`jit-preamble.py`, vended with the plugin) that loads the active carrier's live state and emits one
stream of `KEY: VALUE` lines for the agent's **turn-1** session state. It exists so per-turn context is
**fresh, safe, and cheap** — the fat always-on operating-instructions reference was **rejected** for
cost (handbook M-1 doctrine). You are paired with the closed, byte-budgeted **always-on minimal floor**
(`always-on-floor`): the floor is the small standing surface; you are the per-turn live load.

The script is the deliverable; this node is its contract. Run it at session start, parse its emit, and
keep its four disciplines intact. Do not re-implement its logic in prose — invoke the script.

## The four disciplines (load-bearing — do not relax)

1. **Derived projection, never the carrier file.** The live lifecycle/stage is read from the **derived
   projection** (the `portal-projection.json` snapshot the publisher writes — see `bindings-contract`
   §6 for where the event-log/projection surfaces bind; `carrier-interface` for the projection key and
   `current_stage` definition). The carrier *file*'s `lifecycle_state` is a hand-written field that
   goes **stale** the moment work advances without a gate write — a carrier can sit at `idea` while
   delivery is underway. Emit the projection's **derived** stage as the live state, and an explicit
   **staleness/absence marker** when the projection is missing or unconfirmed — **never** a stale
   carrier-file value surfaced as the truth.
2. **The carrier file is delimited untrusted data.** When the script reads the carrier file (only to
   surface a small allowlisted set of routing scalars), it treats it as untrusted: a hard **size cap**,
   a closed **field allowlist** (only named scalars are surfaced as values), and a **secret
   presence-probe** that reports only whether a secret-shaped field is present — it **never** binds,
   slices, prints, or echoes the value. A file-declared `lifecycle_state` surfaced here is explicitly
   marked DECLARED, distinct from the derived live state.
3. **Fail closed.** Any error — a broken/absent projection, an unreadable carrier, an internal crash —
   degrades to the safe **`JIT_FALLBACK`** floor (a stable emit telling the agent to discover state
   just-in-time), never a stack trace and never a wrong state.
4. **General emitter.** WHICH state keys the script emits is whatever the **entered node declared** via
   the node-dependent required-state mechanism (C2), passed as `--required-state`. There is **no
   carrier-finder special-case** in the script: point it at any declaring node's required-state and it
   emits exactly that set; a non-declaring node resolves to the coarse default. Adding a declaration to
   another node later is **pure content** — no re-plumb.

## How the general emitter consumes the C2 mechanism

The required-state list is resolved by the **general** path the C2 mechanism landed:
`resolveNodeRequiredState(nodeId)` in `build/vendor.ts` reads the entered node's declared
`required-state` (via `resolveRequiredState` — a declared list, else the coarse one-size default) and
that resolved list is what is passed to the script as `--required-state`. Confirm the generality by
pointing it at the `working-session` carrier-finder's declaration (`required-state: [lifecycle_state,
stage]`): resolved through the general path, the script emits exactly that pair — proving it reads any
declaring node's state, not a hardcoded gather.

## Invocation

```
jit-preamble.py \
  --projection <portal-projection.json>      # the DERIVED projection (the live-state source)
  --carrier <carrier-file>                   # opened ONLY as delimited untrusted data
  --carrier-id <id>                          # the projection key to read
  --required-state lifecycle_state,stage     # the C2-resolved list the entered node declared
  --floor <always-on-floor surface>          # pointer-emitted (the floor is bundled)
```

It emits `KEY: VALUE` lines (`CARRIER_STATE_SOURCE: derived-projection`, `CARRIER_STAGE: …`,
`CARRIER_LIFECYCLE_STATE: …`, `CARRIER_SECRET_PRESENT: …` when a secret-shaped field exists,
`ALWAYS_ON_FLOOR: …`), or the `JIT_FALLBACK` block on any failure. The emit is **deterministic** (a
pure function of the inputs — no clock, no randomness), so it is golden-testable and idempotent across
repeated turns.

## The vend seam

The script is vended into the plugin through the **generic non-text-primitive vend extension point** in
`build/vendor.ts` (a declarative `{ src, rel, tree }` registry, self-cleaning, with its own `--check`
drift list). The seam is generic by design — a future hook/script primitive (WB-4) registers in the
same list and inherits the copy + idempotency + drift-check; the preamble is not special-cased. The
`vendor:check` freshness gate proves the seam round-trips byte-identically.

## Doctrine reconciliation

The harness-init single-line floor doctrine (`harness-init.md:111,114`) is reconciled to this split:
the always-on cost is the closed **always-on minimal floor** surface (navigation +
substrate-consult-first + safety + the one-line `<sg-*>` pointer), and the per-session runtime
self-check **is** this JIT preamble — loaded just-in-time, not embedded as a session-start procedure in
the scaffolded `CLAUDE.md`. The fat always-on ref stays retired.

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/always-on-floor.md` — `always-on-floor`
- `references/bindings-contract.md` — `bindings-contract`
- `references/carrier-interface.md` — `carrier-interface`

