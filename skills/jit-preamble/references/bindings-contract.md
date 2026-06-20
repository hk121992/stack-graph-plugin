---
kind: reference
id: bindings-contract
title: Bindings contract — the keys a harness supplies, and the surface template
description: The factory contract the plugin ships so a consuming workspace can instantiate a harness — the complete set of binding keys the vendored graph may require, the bindings.yaml file format, the org-root CLAUDE.md ambient-surface template, and the dashboard + improvements surface-structure templates harness-init scaffolds. The plugin carries this contract; the harness supplies the values. No product data.
status: v0.11.0 — 2026-06-20
changelog:
  - v0.11.0 (2026-06-20): canon-surfaces-required (wi-git-policy-binding IU-3) — now that the canon-writing nodes consult `git-policy`, §7 makes listing the canon surfaces `{handbook, strategy, objectives, spec}` in `git-policy.pr-gated` a **hard requirement** for a canon-bearing harness. Enforced on the **per-harness update**, not at factory land: this contract-version bump drives `harness-update`'s re-bind; `harness-init validate` fails a canon-bearing harness omitting a canon surface; the absent-block canon-fail-closed default still protects review if a consumer skips the update. **No key or shape change from v0.10.0** — the `{default, pr-gated}` block is unchanged; this bump fixes only the requirement.
  - v0.10.0 (2026-06-20): git-policy binding (wi-git-policy-binding IU-1) — add the **optional** harness-local `git-policy` block to §2 (the `{default, pr-gated}` dial that maps a logical write-surface to pr-gated-vs-direct) + a new §7 documenting its shape and the canon-fail-closed-on-absence semantics (a **present** block is authoritative; an **absent** block ⇒ a canon-surface node defaults to `pr-gated`, a non-canon node to `direct`). The block is a small-scalar dial, harness-local, **never vendored** — adds per-harness with no plugin change. The resolution rule + surface enum live in the new `git-policy` reference (single source); this contract fixes only the block's shape. **Contract drift:** a canon-bearing harness must declare its canon surfaces in `pr-gated` — `harness-update`'s contract-drift re-bind emits the block (the absent-default already protects canon if skipped).
  - v0.9.0 (2026-06-19): analytics lifecycle review (wi-analytics-lifecycle-review IU-A2b) — §6 extended with the `harness_id` attribution-key field + the per-harness-local-derive / central-merge seam (the locality-honouring fleet model): each harness derives its own log LOCALLY; only the already-sanitised per-harness rows combine, in a central merge keyed on `harness_id` (no loss / no double-count). No new binding key — `harness_id` rides the META envelope the analyzer already parses (the earns-a-binding test: no node resolves it). The cron-path home named in §6 is the shared workspace's `workspace/renderer/analyzer/`, matching the harness-init runbook correction.
  - v0.8.0 (2026-06-18): renderer-vestige removal (RESTRUCTURE-PLAN D1) — local-portal rendering retired; the renderer moved out of the installed plugin to the shared mm-workspace. Removed the `renderer` key from §2 (the vendored workspace-render overlay no longer ships in the plugin); dropped "the renderer" from the §intro surfaces list; §6 `SG_PRICING` consumer retitled "renderer Cost block" → "analytics Cost block". **Key removed** — consumers drop `renderer` from `bindings.yaml` on the contract-drift re-bind (harness-update §Contract-drift). The analyzer/event-log substrate (`workspace/renderer/analyzer/…`, §6) is owned by `wi-analytics-lifecycle-review` and is untouched here.
  - v0.7.1 (2026-06-18): dead-reference scrub (curator removal, wi-unified-front-workflow IU-7) — §3 surface-structure template: the two "content is added later via [the removed curator]" / "added by [the removed curator], not scaffolded" notes now read "added later via the front's `raise`" / "added via the front's `raise`, not scaffolded". No key change; the surface shape is unchanged.
  - v0.7.0 (2026-06-12): A6c unified transcript-analytics (#28, supersedes #21) — §6 retooled to the transcript analyzer: add `SG_TRANSCRIPT_ROOT` (analyzer input env, not a binding key); remove the hook-activation env (`SG_TOKEN_EVENT_KIND`) and the per-scope dispatch env (`SG_IU_ID`/`SG_SCOPE_ID`/`SG_CARRIER_*`/`SG_ARC`); repurpose `event-log`/`SG_EVENT_LOG` to the analyzer's **output** and migrate its filename to `derived/analyzer-events.jsonl`; replace the live-hook probe with the analyzer dry-run probe + the scheduled-task install runbook
  - v0.6.0 (2026-06-10): D69 token instrumentation — add optional `pricing` key; note the absolute `SG_EVENT_LOG` consumer on `event-log`; add §6 (the token-instrumentation env the harness exports + the per-scope dispatcher env + the validate live-hook probe)
  - v0.5.0 (2026-06-10): add optional `architecture-reviews-root` — the committed home of architecture-review's report pair (the axis-root pattern: bound only when the harness runs the capability)
  - v0.4.1 (2026-06-06): clarify strategy-doc binds the authored vision narrative (not a canvas/bmd inventory); augment renderer.canvas-root notes with dashboard bets-rollup use and graceful-degradation contract
---

# Bindings contract

The vendored graph is **general**: its nodes read a workspace's surfaces (the work ledger, the
strategy + objectives docs, the handbook, the event log) **through bindings**, never
through hardcoded paths. This reference is the **factory contract** — the keys the graph may
require and the shape of what they point at. The **plugin ships this contract**; a **harness
supplies the values** (`harness-init` writes them, the loop nodes read them). It carries **no
product data** — only the key set, the file format, and the surface template.

This is the runtime companion to `work-item-schema` (the carrier's fields) and `okr-schema` (the
outcome layer): those fix *what a work item / objective is*; this fixes *where a harness keeps
them and how the graph finds them*.

## 1. The bindings file

A single **flat-key YAML** file at **`<org-root>/.claude/bindings.yaml`** (the org root is the
directory Claude launches from — see the harness directory topology). Flat top-level keys, values
are workspace-relative or absolute paths (or small scalars for the dial keys). A node never
hardcodes a path; it resolves the key here. The file is **harness-local** (never vendored); only
this *contract* is vendored.

## 2. The key set

Required unless marked optional. `harness-init validate` fails if a required key is missing or its
target does not resolve.

| key | points at | notes |
|---|---|---|
| `surface-root` | the product-dashboard surface dir | root of the work-ledger surface tree |
| `items-root` | the work-items dir | `items/` under the surface; holds `<id>.md` |
| `manifest-path` | the work-items manifest | committed derived index (`items/manifest.json`) |
| `sprint-records-root` | the sprint-records dir | `sprints/`; assembled views |
| `working-sessions-root` | the working-session records dir | `working-sessions/`; holds `<uid>.md`, one per session (`SG-NNNN`, directory-scan allocated — the dir **is** the registry, no ledger). Consumed by `working-session`'s emit step (the sole writer); committed (generative/non-replayable, the D60 test), **not** `.stack-graph/`. The per-session design-doc artefact + the WI ↔ session ↔ IU provenance bridge — see `working-session-record` |
| `learnings-archive` | the prior-proposals archive **file** (`learnings/archive.md`) | `capture-learnings`' surviving-but-unenacted proposals — the gate writes it, `capture-learnings` reads it next sprint (D60); committed (generative/non-replayable), **not** `.stack-graph/`; scaffold creates the file empty |
| `strategy-doc` | the **authored Product Strategy thesis** (vision narrative) | `strategy.md` — Rumelt kernel: diagnosis → guiding policy → coherent action; plus who & JTBD, open questions, decided/not-doing. This is the authored thesis, **not** a canvas/bmd inventory. A harness must not bind `strategy-doc` to a regenerated canvas or hypothesis corpus — that is redundant with the canvas surface. The vision statement itself lives in `objectives.md` (the `okr-schema` apex); `strategy.md` carries the kernel only and must not restate the vision. |
| `objectives-doc` | the objectives / OKR doc | `objectives.md` per `okr-schema` |
| `okr-binding` | how `outcome_link` resolves to an objective id | resolution rule, not a path |
| `handbook-index` | the product handbook index | the handbook `index.json` (the `handbook` external ref binds here) |
| `personas` | the product's user profiles | PM-owned surface; consumed by the experience thread (optional pre-launch) |
| `experience-contract` | the session-shape invariants doc | authored by `design`; per `experience-contract-schema` |
| `event-log` | the **analyzer's derived event stream** | path + shape under `.stack-graph/` (gitignored, local). Now the **deterministic transcript-derived log the scheduled analyzer writes and the publisher reads** — **one writer, full rewrite each run** (no append-only / atomic-append semantics). Its filename is **migrated to `.stack-graph/derived/analyzer-events.jsonl`** (the named A6c migration; the publisher's three resolution paths and the `SG_EVENT_LOG` scaffold value resolve the same file). The harness exports it as an **absolute** path `SG_EVENT_LOG` (the analyzer runs out-of-band, in arbitrary cwd) — see §6. |
| `pricing` | the host token-pricing table | **optional** — the operator-maintained `pricing.json` (rates + cache multipliers + `verified_on`) the analytics Cost block prices with (D69). Exported as `SG_PRICING`; absent → the Cost block renders components without `$` (degrades, never $0). The plugin ships a default `pricing.json`; a harness binds its own to override |
| `deploy-config` | the deploy target | e.g. the portal's `wrangler.jsonc` (optional) |
| `plan-policy` | in-body vs linked plan threshold + link shape | scalar policy (see `IU-schema`) |
| `terminal-recorder` | who freezes the timeline at a terminal state | the recorder binding (`work-item-schema` §frozen) |
| `maturity` | the maturity-dial setting | `pre-launch | first-users | scale` (D45) — default gate rigour |
| `stale-projection-policy` | degraded-mode policy | how surfaces render when the projection is absent/stale |
| `git-policy` | the per-surface git-write policy dial | **optional** — a small **block** (not a path): `{default, pr-gated}` mapping a logical write-surface to **pr-gated-vs-direct** (§7). The resolution rule + the closed surface enum live in the `git-policy` reference (the single source); this contract fixes only the block's shape. **Absent** ⇒ canon surfaces default `pr-gated`, non-canon `direct` (canon-fail-closed, §7) |
| `improvements-root` | the standalone-IU surface dir | **sibling of `surface-root`** (not under it); holds `<id>.md` + the manifest — the incremental loop's own surface, off the work-ledger (§3) |
| `improvements-manifest` | the standalone-IU manifest | committed derived index: `[{id, file, improves, slice_type, lifecycle_state}]` |
| `triage-source` | where improvements are raised from | **optional** — the handbook-curator drift queue / a `learn` store / an operator note. **Input-gated (Fork D):** bind it now; the auto-feed turns on only once those queues carry findings. `triage` still applies the route rule and the operator confirms before a standalone IU is created |
| `axis-root` | the zone-matrix axis-entry dir | **optional** — holds the product's verticals + horizontals (`kind: reference`, each tagged `axis:`, per `axis-entry-schema`); `explore`'s `zone` mode reads it via an `external: true` reference the overlay binds. Present only when the harness uses the zone matrix (D63) |
| `code-map` | the extracted code-map location under `.stack-graph/` | **optional**, **path-only**, degradable — the deterministic repo-map + ast-grep extraction `explore`'s `repo` and `zone` modes read **inline** (not a reference edge — D38). No committed schema, no labels; a fresh clone without it degrades to Glob/Grep |
| `zone-test-root` | the two-tier zone/experience test surface | **optional**, **forward-referenced** — the testing layer is **input-gated** and realised in a harness, not the factory (D63); bind it when that layer is built |
| `architecture-reviews-root` | the committed architecture-review reports dir | **optional** — bound only when the harness runs `architecture-review` (the `axis-root` pattern). Holds the per-run report pair `<yyyy-mm-dd>-<slug>.html` (immutable diagnosis) + `<yyyy-mm-dd>-<slug>.md` (living disposition record); **committed** (generative/non-replayable, the D60 test), never `.stack-graph/`. Sits under `surface-root` (e.g. `<surface-root>/architecture-reviews/`); `harness-init validate` resolves it when bound; the node creates the dir on first run if absent. No manifest at v0 |

## 3. The dashboard surface-structure template

The shape `harness-init scaffold` creates under `surface-root` (empty skeleton + templates;
content is added later via the front's `raise`). Matches `artefacts-design`:

```
<surface-root>/
  strategy.md            # Product Strategy thesis: guiding policy · JTBD · open questions · decided/not-doing (template; vision lives in objectives.md apex — not restated here)
  objectives.md          # objectives / OKRs / north-star                  (per okr-schema, template)
  items/
    manifest.json        # committed derived index: [{id,file,title,lifecycle_state,tier,outcome_link}]
    <id>.md              # one per work item (added via the front's raise, not scaffolded)
  sprints/
    <id>.md              # sprint-records (assembled views)
  learnings/
    archive.md           # capture-learnings' surviving proposals (committed; gate-written, D60)
```

Derived/runtime state (the event log, the projection) lives under `.stack-graph/` (gitignored) —
**not** in the surface — and is reached via `event-log`. The `learnings/` archive is **committed**
(a proposals list is generative/non-replayable, so it cannot live in `.stack-graph/`, D60).

### The improvements surface-structure (standalone IUs)

The incremental loop's unit — a **standalone IU** — is stored in its **own** surface at
`improvements-root` (a sibling of `surface-root`, **not** under it), so it stays off the
product-dashboard work-ledger (see `incremental-improvement-design` §6, Fork C). Same instance-file
+ manifest pattern as the work-items dir, a different surface:

```
<improvements-root>/
  manifest.json        # committed derived index: [{id,file,improves,slice_type,lifecycle_state}]
  <id>.md              # one standalone IU per file (frontmatter per IU-schema standalone shape; body = the slice narrative)
```

**Surfacing reconciliation.** Standalone IUs are **stored** here, separate from the work-ledger,
and **rendered** as a **distinct improvements-log lane in the portal, off the work-ledger** — the
IU's `channel: incremental` field drives that render, so they appear as a distinct improvements log,
**not** mixed into the work-ledger items. Derived/runtime state (the event log) stays under the existing `event-log` / `.stack-graph/`
(gitignored), unchanged — a standalone IU's `current_stage` projects from the same carrier-tagged
event stream as a work-item's (`06-analytics` conforms-to).

## 4. The org-root CLAUDE.md template

The harness's **ambient surface** — the one file that loads automatically at every session because
the operator always launches at the org root, and it cascades to every child (see the harness
directory topology). `harness-init scaffold` writes it from this template; it carries pointers, not
content:

```markdown
# <workspace> — harness root

Handbook (canonical reference): <handbook-index>      # the handbook-index binding; made ambient here
Bindings: ./.claude/bindings.yaml                     # how vendored nodes resolve this workspace's surfaces
How to use the graph: read the handbook index at task start, then the sections your task needs.
```

This is **structure only** — the `handbook-index` value comes from the binding; the rest is fixed
navigation. The **per-session runtime self-check** (a session-start precondition sequence) is a
harness **hook or ambient rule**, authored separately — **not** part of this template and **not** a
`harness-init` mode. `harness-init validate` checks this file exists, reaches the bindings reference,
and carries the `handbook-index` pointer.

## 5. How the graph consumes it

- A node that reads a surface resolves its key here, then reads `bindings.yaml` for the value —
  it **never** hardcodes a path or restates this list.
- The bindings are an **additive local overlay** (the harness's own `.claude/bindings.yaml`); the
  vendored graph is never mutated to point at a product.
- `harness-init` is the executable instantiation of this contract: it **writes** `bindings.yaml`
  (filling these keys against the workspace), **scaffolds** §3, and **validates** that every
  required key resolves.

## 6. Analytics env (the transcript analyzer)

Analytics are **transcript-derived in batch** — a scheduled analyzer
(`workspace/renderer/analyzer/`) reads the raw session transcripts ~1–2×/day on the harness
machine and **rewrites** the derived event log. There are **no hooks** and **no scope-gating env**:
the substrate is a pure read-derive over the transcripts, so nothing has to be activated per scope.
A harness exports the analyzer's env via the org-root `.claude/settings.json` `env` block (or the
launch profile where the harness uses one):

| env var | value | role |
|---|---|---|
| `SG_TRANSCRIPT_ROOT` | the raw-transcript root (default `~/.claude/projects`) | the analyzer's **input** — where the session transcripts live. **An env var, not a binding key:** no graph node resolves it (the earns-a-binding test — a key earns a binding only when a *node* must resolve it; the analyzer is out-of-band), so it stays env. Absent ⇒ the analyzer defaults to `~/.claude/projects` |
| `SG_EVENT_LOG` | **absolute** path to `<org-root>/.stack-graph/derived/analyzer-events.jsonl` (the `event-log` binding, absolutised) | the analyzer's **output** — where it writes the derived rows the publisher reads; absolute because the analyzer runs out-of-band in arbitrary cwd |
| `SG_PRICING` | absolute path to the `pricing` binding's `pricing.json` | the analytics Cost block prices with it (optional; absent ⇒ components-without-$) |

**Scheduled-task registration.** The analyze→publish job is installed as a **scheduled task** the
operator owns. `harness-init scaffold` **emits the exact command + a short install runbook** for the
operator (it does **not** write a crontab itself — harness-local-writes-only, B4), **or** registers
the job via the runtime's `mcp__scheduled-tasks__*` surface where the harness schedules that way (a
build-time choice). Default cadence: twice daily. `harness-init validate` **confirms (read-only)**
the task is registered and runs an **analyzer dry-run probe** (replacing the old live-hook probe):
analyze a tiny fixture transcript and assert a derived row lands in the event log (see that node).

### `harness_id` in the seam — the per-harness-local-derive / central-merge model

Analytics honour the **Locality invariant by construction at the fleet level too**: each harness
**derives its own event log locally** — the analyzer runs only where that harness's transcripts live,
and the raw transcripts + the derived `.stack-graph/derived/…` log **never leave that machine**. What
**can** combine across a fleet is the **already-derived, already-sanitised** per-harness rows, joined
by a **central merge** (`workspace/renderer/analyzer/merge.ts`) that combines them with **no loss and
no double-count**. There is no central re-derivation and no raw-transcript collection — the merge sees
only sanitised rows, never bytes.

The join key carries **`harness_id`** — the harness a dispatch ran under, parsed from the dispatch-
prompt **META envelope** (`META: … harness=<id>`) the analyzer already reads. It is part of the
**attribution key**, so two **same-named carriers under different harnesses are distinct identities
across the fleet** (the same-name-collision guard): the central merge keys on the row's full identity
*including* `harness_id`, so those two rows never collapse, while a row that appears identically in two
inputs collapses to one. An **absent** `harness=` field degrades to **`null`** — a clearly-local /
unknown sentinel that can never equal another harness's real id, so an uncaptured transcript is never
silently mis-attributed (the load-bearing cross-fleet honest-degradation property). `harness_id` is
**NOT a binding key** — no graph node resolves it (the earns-a-binding test); it rides the META
envelope the analyzer parses, the same way `carrier`/`kind`/`arc`/`iu` do. The merged output is
**order-independent and byte-stable** (the canonical analyzer ordering), so a fleet roll-up is the same
regardless of the order the per-harness logs are supplied.

## 7. The `git-policy` block (the per-surface git-write dial)

Whether a git-writing node **graduates a change via a labelled PR** or **pushes direct** is a
**per-surface dial the harness owns** — an **optional** harness-local block in `bindings.yaml`. Like
the other dial keys it is a **small scalar block, not a path**; it is **harness-local and never
vendored**, so it adds per-harness with no plugin change (the nodes that *consult* it are vendored).
This contract fixes only the block's **shape**; the **resolution rule** and the **closed surface
enum** live in the `git-policy` reference (the single source every git-writing node consults).

The block has exactly two keys:

```yaml
# bindings.yaml (harness-local, never vendored)
git-policy:
  default: direct                                  # governs surfaces not in pr-gated
  pr-gated: [handbook, strategy, objectives, spec] # logical write-surfaces graduating via a labelled PR
```

- **`default`** (`direct | pr-gated`) — the write mode for any logical surface **not** in `pr-gated`.
- **`pr-gated`** (a list of logical surfaces) — the surfaces that graduate via a **labelled PR**. The
  values are drawn from the **closed surface enum** (`work-ledger`, `decisions`, `handbook`,
  `strategy`, `objectives`, `spec`) the `git-policy` reference defines; `harness-init validate`
  checks each listed value resolves to that enum.

A node resolves the mode for its own surface as
`mode = (surface ∈ git-policy.pr-gated) ? "pr-gated" : git-policy.default` (the rule's full
semantics, incl. `record-gate` riding the `work-ledger` surface, are in the `git-policy` reference).

**Absent-block — present is authoritative; absence fails closed for canon.** When the block is
**present**, the operator's list is law (an unlisted **canon** surface — one of
`{handbook, strategy, objectives, spec}` — honours `default`). When the block is **entirely absent**
(a fresh clone, dropped/corrupted bindings, a botched `harness-init`), a **canon-surface** node
defaults to **`pr-gated`** (fail-closed, root-instruction #3) and a **non-canon** node defaults to
**`direct`** — so a missing block can never silently strip canon review, while the work-ledger keeps
its low-ceremony default.

**Canon-surfaces requirement (v0.11.0 — hard).** A **canon-bearing** harness — one whose vendored
canon-writing nodes (`handbook-curator`, `strategy-curator`, `specify`, `reconcile`, `pr-author`) now
consult this dial — **MUST** list its canon surfaces `{handbook, strategy, objectives, spec}` in
`git-policy.pr-gated`. This is the requirement the consult nodes enforce against: a canon-bearing
harness that omits a canon surface from `pr-gated` would silently graduate that surface per `default`
(typically `direct`), stripping its review.

**Contract drift — the migration is the update path, not a factory-land gate.** The canon-surfaces
requirement is enforced **when a consumer updates** to a plugin carrying the consult nodes — **not** at
factory land. On this **contract-version bump (v0.10.0 → v0.11.0)**, `harness-update`'s contract-drift
step **re-binds** (emits/completes the `git-policy` block so the canon surfaces are listed); the
absent-block canon-fail-closed default already protects canon review if a consumer skips the update.
`harness-init scaffold` emits the block per the maturity dial; `harness-init validate` checks the
listed surfaces resolve to the closed enum **and that a canon-bearing harness lists its canon
surfaces** (the maturity-dial assertion, not just referential integrity). Those are the consult /
scaffold / validate IUs — this contract documents only the requirement and the shape they enforce
against.
