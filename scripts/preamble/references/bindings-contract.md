---
subject: bindings-contract
title: Bindings contract — the harness instantiation seam
provenance: vendored
level: L2
cadence: on-demand
read-when: "Standing up or validating a harness's bindings."
derive-from: [bindings-contract]
reviews-on: bindings-contract-source
last-reviewed: 2026-07-01
entropy: unmeasured
status: drafted
related: [okr-schema, work-item-schema, local-node-schema, git-policy-schema, sg-root-instructions, axis-entry-schema, decisions-schema]
---

# Bindings contract — the harness instantiation seam

**Contract version: v0.13.0** (adds the decisions-index-path key). The version the harness records in its
`bindings.yaml` header and `harness-update`'s drift check compares — bump it on any key-set or
file-format change. (Distinct from this file's `status:`, a lifecycle word.)

The factory contract a plugin ships so a consuming workspace can instantiate a **harness**: the binding keys the
vendored graph may resolve, the bindings-file shape, and the ambient + surface scaffolds `harness-init` creates.
It is the **vendored seam** between the general graph and a local harness — the factory ships the *pointer* (the
key a node declares), the harness supplies the *target* (the value) — so the contract must be **shared by every
consumer**, which is why it is vendored, not local. It carries **no product data** — only the key shape, the file
format, and the scaffold structure; the harness's filled `bindings.yaml` is the **crystallised** instance of this
contract (its actual values, runtime). What a harness *is* and how resolution bridges the two provenances is
the **harness-topology** spec's (local, per-consumer); this fixes the contract that resolution resolves against.

## The bindings mechanism {#mechanism}

- A single **flat-key file** at the fixed overlay location (`.claude/bindings.yaml`): top-level keys → workspace
  paths, or small scalars for the dial keys.
- A node **resolves the key it needs, then reads the value** — it never hardcodes a path or restates the key
  list.
- The file is an **additive local overlay** (harness-local, never vendored); only this *contract* is vendored.
- **`harness-init` is the executable instantiation** — it writes `bindings.yaml` against the workspace,
  scaffolds the surfaces (below), and **validates** that every required key resolves; a missing or unresolved
  required key fails fast.

## The key categories {#keys}

Keys are **required unless optional**, and the vendored key set is a **closed base** — a node resolves only a
**declared** key — that a harness **extends** with its own local keys for local nodes (resolution unions
base + local, an undeclared surface failing closed). The durable contract is the **categories and the closed-base
property**, not a per-key path (the path is the harness's instance value):

| category | keys (by role) |
|---|---|
| **Work-ledger surfaces** | the dashboard surface root · the work-items dir + its manifest · the sprint-records dir · the working-sessions dir · the decisions store (the D-numbered conclusion layer `log-decision` writes; per [decisions-schema](decisions-schema.md)) · the decisions-index projection path (the on-demand nav lookup both `harness-init` generates and `log-decision` re-derives — one key, two writers; distinct from the store) |
| **Improvements surface** | the standalone-IU surface (a **sibling** of the work-ledger, off it) + its manifest |
| **Outcome / strategy** | the objectives surface (per [okr-schema](okr-schema.md)) · the strategy thesis · the outcome-anchor resolution rule |
| **Runtime** | the analyzer's derived event-log path (under the gitignored runtime-state root) |
| **Dial scalars** | the maturity dial · the plan-in-body-vs-linked threshold · the degraded-projection policy · the terminal recorder |
| **Optional capability keys** | bound **only when the harness runs that capability** — e.g. personas + the experience-contract (the experience thread) · the deploy / verify / canary surfaces · the zone-matrix axis root + code-map + zone-test root · the architecture-reviews root · the learnings-archive · the pricing table · the triage source |

**The optional-capability-key pattern** is the load-bearing rule: a capability surface is bound **only when
present**, and the workflow **degrades gracefully** without it (a node gates on the key's presence). Doctrine
is never a bound key — references are reached by node edges + the at-hand index, not a bound reference path.

## The scaffolds {#scaffolds}

`harness-init scaffold` creates these as **empty skeletons** — content is authored later via the front's `raise`,
never scaffolded:

- **The dashboard surface** — the strategy thesis, the objectives surface, the work-items dir + manifest, the
  sprint-records and learnings homes. Derived/runtime state lives under the gitignored runtime-state root, **not**
  the surface.
- **The improvements surface** — the standalone-IU home (a sibling of the work-ledger), rendered as a distinct
  improvements lane, never mixed into the work-ledger.
- **The org-root ambient surface** — the one file auto-loaded every session (the operator launches at the org
  root); it carries **pointers, not content** — the bindings pointer + the navigation rule (read the graph at
  task start). Structure only.

## The dial scalars {#dials}

A dial key is a **small scalar the resolution layer reads, not a path** — harness-local, added per-harness with
no plugin change. Each **tunes how a node behaves**, not where a surface lives: a single value or a one-line rule.

```
maturity: first-users                            # the evidence-strength bar four-risks must clear
plan-policy: in-body until > 1 IU, then link     # where a plan lives — inline vs a linked file
stale-projection-policy: degrade                 # projection behaviour when it cannot compute fresh
terminal-recorder: <mechanism>                   # what freezes the final metrics at a terminal state
```

A node resolves the key and acts on the value; the durable contract is the **key set and each key's role**, never
the harness's chosen value.

**The git-policy policy is not a dial** — it is a crystallised surface, `@git-policy` (shape:
[git-policy-schema](git-policy-schema.md)): a per-repo/path map with labels that a git-writing agent reads off the
floor. `harness-init` materializes it into `.claude/`, `@`-ref'd by `sg-root-instructions`; it is not a
`bindings.yaml` scalar. This contract fixes only the binding seam that resolves the harness's other surfaces and
dials.

## The analytics env {#analytics-env}

Analytics are **transcript-derived out-of-band** (a scheduled analyzer), so the analyzer's config is **exported
as environment, not binding keys** — the **earns-a-binding test**: a key earns a binding only when a *graph node*
must resolve it, and no node resolves the analyzer's config (it runs out-of-band). A harness exports the
analyzer's **input** (the transcript root), **output** (the derived event-log, absolutised), and optional
**pricing** env, and registers the analyzer as a **scheduled task** (`harness-init` emits the install runbook;
`validate` confirms registration + runs a dry-run probe). The **derivation model itself** — the two substrates,
locality, the per-harness-local-derive + central fleet-merge keyed on the harness attribution id — is the
**analytics-recall** internals' (local, per-consumer), cited not restated.

**Analyzer-home = the plugin.** The analyzer runs **from the installed plugin** — the vendored tree at
`<plugin>/scripts/analyzer/` (an install-free asset shipped by `generate`), never from a workspace checkout and
never from a harness-local copy. The harness never copies or re-hosts the analyzer source;
`harness-init` materializes only the **wrapper** (resolving that plugin path), and a plugin bump refreshes it via
`harness-update`. A harness resolves its analyzer by construction from the plugin it installed, so it can never
drift from the fleet's version.

**The env vars — a directory and a file, never mis-joined.** Three exports name the runtime paths, and their
**dir-vs-file shape is load-bearing** (join the wrong shape and the analyzer writes to a nonsensical nested path):

- **`STACK_GRAPH_EVENTS_DIR` — a *directory*.** The `.stack-graph/` root (default `<org-root>/.stack-graph`). The
  derived event-log is *under* it, at `<dir>/derived/analyzer-events.jsonl`; the analyzer joins the `derived/…`
  tail itself. Set this to the **directory**, never to the log file.
- **`SG_EVENT_LOG` / `--out` — a *file*.** The absolutised derived event-log **path** — the `event-log` binding's
  value (passed through as the analyzer's `--out`). It names the `analyzer-events.jsonl` **file directly** and
  **overrides** the dir-derived default; the analyzer does **not** append `derived/…` to it.

So the two are **distinct and non-interchangeable**: `STACK_GRAPH_EVENTS_DIR` points at the containing directory,
`SG_EVENT_LOG`/`--out` at the file itself. A harness binds the **file** (`event-log`) and lets the directory
default, or exports the **directory** — never conflates the two into one joined path.

## Cite out {#cite-out}

- **What a work-item / objective / experience-contract *is*** (the *what* to this *where*) → [work-item-schema](work-item-schema.md) · [okr-schema](okr-schema.md) · [experience-contract-schema](experience-contract-schema.md).
- **The git-policy resolution rule + the policy shape** (per-repo/path) → [git-policy-schema](git-policy-schema.md) (full doctrine: the local `devops-loops` reference).
- **The analytics derivation + fleet model** the env seam feeds → the **analytics-recall** internals (local, per-consumer).
- **How a harness extends the graph** (overlay · binding · local nodes) → the **harness-topology** spec (local, per-consumer) · [local-node-schema](local-node-schema.md).
- **Term** senses (harness · binding · overlay · crystallised) → glossary.
