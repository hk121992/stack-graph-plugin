---
name: "jit-preamble"
description: "The deterministic just-in-time preamble — a stdlib-only script that loads the active carrier's live state from the DERIVED projection (never the carrier file), emits KEY: VALUE for turn 1, treats the carrier as delimited untrusted data (size-cap, field-allowlist, secret presence-probe), and fails closed. It is the per-turn live-state load; the standing root instructions are the separate @-ref'd sg-root-instructions. Use when the harness needs fresh, safe, cheap per-turn context instead of a fat always-on reference. Use when: A session needs its turn-1 carrier state loaded just-in-time — fresh from the derived projection, the carrier treated as untrusted, failing closed — rather than carried in a fat always-on operating-instructions reference."
model: opus
---


# JIT preamble — the deterministic per-turn state loader

You own the harness's **just-in-time preamble**: a deterministic, stdlib-only script
(`jit-preamble.py`, vended with the plugin) that loads the active carrier's live state and emits one
stream of `KEY: VALUE` lines for the agent's **turn-1** session state. It exists so per-turn context is
**fresh, safe, and cheap** — the fat always-on operating-instructions reference was **rejected** for
cost (handbook M-1 doctrine). You are the **per-turn live load**; the standing root instructions are a
separate surface (`sg-root-instructions`, `@`-ref'd into the harness's `CLAUDE.md` by `harness-init`).

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
```

It emits `KEY: VALUE` lines (`CARRIER_STATE_SOURCE: derived-projection`, `CARRIER_STAGE: …`,
`CARRIER_LIFECYCLE_STATE: …`, `CARRIER_SECRET_PRESENT: …` when a secret-shaped field exists), or the
`JIT_FALLBACK` block on any failure. The emit is **deterministic** (a
pure function of the inputs — no clock, no randomness), so it is golden-testable and idempotent across
repeated turns.

## The vend seam

The script is vended into the plugin through the **generic non-text-primitive vend extension point** in
`build/vendor.ts` (a declarative `{ src, rel, tree }` registry, self-cleaning, with its own `--check`
drift list). The seam is generic by design — a future hook/script primitive (WB-4) registers in the
same list and inherits the copy + idempotency + drift-check; the preamble is not special-cased. The
`vendor:check` freshness gate proves the seam round-trips byte-identically.

## Doctrine reconciliation

The harness-init always-on doctrine is reconciled to this split: the standing always-on cost is the
closed **`sg-root-instructions`** surface (navigation + substrate-consult-first + safety + the one-line
`<sg-*>` pointer), `@`-ref'd into the scaffolded `CLAUDE.md` by `harness-init`; and the per-session
runtime state load **is** this JIT preamble — loaded just-in-time, not embedded as a session-start
procedure in `CLAUDE.md`. The fat always-on operating-instructions ref stays retired.

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/bindings-contract.md` — `bindings-contract`
- `references/carrier-interface.md` — `carrier-interface`

