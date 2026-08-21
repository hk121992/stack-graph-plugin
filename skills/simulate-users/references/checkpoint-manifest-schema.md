---
subject: checkpoint-manifest-schema
title: Checkpoint-manifest schema
provenance: vendored
level: L2
cadence: on-demand
read-when: "Authoring or filling a checkpoint-manifest for the simulate-users regression mode."
derive-from: [checkpoint-manifest-schema]
reviews-on: checkpoint-manifest-schema-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [experience-contract-schema, findings-schema]
---

# Checkpoint-manifest schema

The **shape** the harness-supplied `checkpoint-manifest` conforms to — the config that drives
`simulate-users`' deterministic-regression mode. The mode replays a frozen scenario corpus through an isolated
Workflow, asserts each turn against a closed vocabulary plus one example-anchored judge, and returns
PASS/FAIL/XFAIL/XPASS with a `pass_rate`. This reference fixes the **shape**; the harness fills the **content**
— its own scenarios, state-builder binding, launch surface, domain operators, and version pins — on its local
`checkpoint-manifest` instance (external, pointer-only, like [experience-contract-schema](../../../references/experience-contract-schema.md)).

The manifest is **committed config** and must never carry a secret value — every credential and live-dependency
field is a **broker / secret-reference handle only** ([§secrets](#secrets)). A manifest is filled once (the
mode's first, generative run crystallises it) and replayed deterministically thereafter; re-fill only on a
deliberate version bump.

## Scenarios {#scenarios}

`scenarios[]` — the frozen-checkpoint corpus; each entry is one checkpoint the mode materialises and runs:

| field | value-space | meaning |
|---|---|---|
| `arc_beat` | string | which beat of the experience arc this checkpoint freezes (the point in the journey the turn is pinned at) |
| `fixture_kind` | `state` · `conversation` | how the checkpoint is materialised — an on-disk state fixture, or a record-then-fork committed session whose frozen history drives the turn |
| `state` | object | the state to materialise on top of the built base — small, schema-validated deltas only (the base is built faithfully, [§state-builder](#state-builder)) |
| `input` | string | the **verbatim** user input for the one turn under test — the exact text replayed, never paraphrased |
| `assertions[]` | list of assertion strings | the closed-vocabulary checks the turn is graded against (core operators + manifest-registered domain operators, [§operators](#operators)) |
| `burn_in` | integer ≥1 | independent runs a gating scenario takes; it passes only if **every** run is green ([§burn-in](#burn-in)) |
| `assumed_leak_rate` | number `0…1` | the intermittent-leak rate `burn_in` is sized against — written on the scenario so a gate operator sizes N to it and never trusts a bare green ([§burn-in](#burn-in)) |

## State-builder binding {#state-builder}

`state_builder` — **which real product setup path is driven** to materialise a checkpoint's state. Faithful-state
is a hard rule: drive the product's own setup path, then apply only small schema-validated deltas — **never
hand-author a state file** (a hand-authored fixture tests a fiction). For a `conversation` fixture, the binding
is the record-then-fork base — a version-pinned committed session, re-recorded on a deliberate agent bump.

## Launch surface & clean room {#launch-surface}

- `launch_surface` — where the Workflow launches. A Workflow's isolated child contexts escape the metered pool **only when
  launched from an interactive/cloud surface**; a credentialed CI runner is itself a launch surface. This single
  field decides the billing outcome.
- `clean_room` — the hermetic container pin: the agent-CLI version + OS deps the turns run under, and the
  bind-mount/strip set (test code, shared libs, the pinned product dev tree, mounted read-only). See
  [§inv-clean-room](../../../references/checkpoint-driver.md#inv-clean-room) for the why — a bare-host run is forbidden and a
  precondition miss on the clean room is `BLOCKED`, never a fallback to the host.

## Domain-operator registration {#operators}

`domain_operators[]` — the product-specific members of the closed assertion vocabulary, **registered here** on
top of the vendored general core (`skill_invoked`, `state_file_written`, `reply_excludes_secret`, `judge`, `not`).
Each entry names the operator, its argument shape, and the transport/state/secret specific it checks (a
write-transport op, a payload-scrub op, a fetch-path op). Keep the core product-agnostic; push every
transport/state/secret specific into a registered operator. A product whose state is purely local registers none
and runs on the core alone.

## Judge anchors {#judge-anchors}

`judge_anchors` — per scenario, the committed few-shot corpus the one batched `judge` call grades against. Each
anchor is a labelled `pass`/`fail` trace-and-reply excerpt with its deciding criterion tag; a
deterministic-decisive anchor also carries the assertion that decides it. The test turn runs **CLEAN** — anchors
are injected only *after* the turn under test has run, never into it.

Anchors are **committed**; the scrub-before-anchor obligation applies — see
[§inv-scrub](../../../references/checkpoint-driver.md#inv-scrub).

## Version & SHA pins {#pins}

`version_pins` — the snapshot every verdict carries, so a future red is triageable as **drift vs regression**:
the agent-CLI version, the pinned product SHA, the clean-room image pin, and any upstream-data SHA. A run whose
live pins do not match is `BLOCKED` at the preconditions gate, not run against a mismatched base.

## Live-dependency wiring {#live-deps}

`live_deps[]` — any live dependency a turn legitimately touches (a dev API/backend; none for a purely-local
product). Each is a **broker / secret-reference handle** ([§secrets](#secrets)) plus its freshness source — the
"data behind main" check. A precondition on a live dep is INPUT-GATED: it must be **reachable AND authenticate
AND be not-stale**; a miss is `BLOCKED` (a distinct exit), never a silent skip and never an assertion FAIL.

## Secret handling {#secrets}

**No secret literals in the manifest — ever.** Every credential and live-dependency field is a **broker or
secret-reference handle only** (a broker key / secret-store reference the runner resolves at run time). The
manifest is committed config; a resolved secret value never lands in it, in a scenario, in a domain operator, or
in a judge anchor — the values live only at run time. The `reply_excludes_secret` core operator enforces this at
the reply boundary — see [§secret-guard](../../../references/checkpoint-driver.md#secret-guard).

## Pass-rate target {#pass-rate}

`pass_rate_target` — the gate threshold the mode's node-exit `simulate-users.pass_rate` measurement is scored
against. A run at or above target passes; below reopens "raise to target". A `BLOCKED` or absent `pass_rate` does
**not** satisfy the target — the gate is inconclusive, never a silent pass.

## Burn-in {#burn-in}

Burn-in is the gate's statistical power, made **visible** on each scenario. `burn_in` (N) and
`assumed_leak_rate` (r) are written per-scenario ([§scenarios](#scenarios)) so the operator sizes N to the
observed leak rate and a gate operator sees the weakness rather than trusting a green; see
[§inv-burn-in](../../../references/checkpoint-driver.md#inv-burn-in) for the miss-probability math.

## Cite out {#cite-out}

- **The instance** — the harness's filled `checkpoint-manifest` (external, pointer-only) and the regression mode
  that consumes it → the `simulate-users` node.
- **The verdict records** the mode emits for a FAIL → [findings-schema](../../../references/findings-schema.md).
- **The sibling experience contract** authored at design and graded at verify → [experience-contract-schema](../../../references/experience-contract-schema.md).
