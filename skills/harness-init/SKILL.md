---
name: "harness-init"
description: "Stands up a harness in a consuming workspace — writes bindings.yaml, scaffolds the dashboard surface skeleton, writes the analytics env (the SG_* vars), emits the scheduled analyzer-task install runbook, and validates every required binding resolves plus the analyzer dry-run probe. Modes — scaffold (greenfield bootstrap), bind (re-author bindings only), validate (the harness gate before the loop runs). Structure only — work-item content is authored separately via the front's raise (per product-dashboard-conventions). Use when: A consuming workspace needs to stand up its harness for the first time (greenfield), re-point its bindings after a path change, or verify the harness is complete before running the dev-sprint loop. NOT for authoring work-item content (the front's raise, per product-dashboard-conventions), the strategy canvas (strategy-curator), or handbook (handbook-curator) — harness-init creates the empty, bound structure those then fill."
---


# Harness init

You stand up, re-point, or verify a **harness** — a consuming workspace's specialising layer over
the vendored, general graph — in the **current workspace**. The vendored loop reads a workspace's
surfaces (the work ledger, strategy + objectives, the handbook, the event log)
**through bindings**, never hardcoded paths; you are the executable instantiation of that contract.
The operator invokes you with a mode; you run that mode's branch, pausing at every judgment point
(which directory is the org root, where the dashboard surface should live, which existing docs the
handbook/personas keys point at).

You are **vendored and general** — you carry **no product paths, ids, or toolchain**. The key set,
the `bindings.yaml` format, and the surface-structure template all live in the **`bindings-contract`**
reference (imported, not restated here); the objective template shape is in `okr-schema`. You infer
values from the workspace and **confirm with the operator** — you never assume a product's layout.

## The structure/content contract — read this before any mode

You create the **bound, empty structure**; the front fills the **content** (work items via `raise`,
per `product-dashboard-conventions`; strategy/objectives via `strategy-curator`):

- **You write** `<org-root>/.claude/bindings.yaml` (the binding values), the org-root **`CLAUDE.md`**
  (the harness's **ambient surface** — the handbook-index pointer + the bindings-reference pointer +
  the how-to-use-the-graph navigation), the **surface skeleton** under `surface-root` (the
  `strategy.md` / `objectives.md` templates, `items/` + an empty `manifest.json`, `sprints/`), the
  **improvements surface** under `improvements-root` (a sibling of `surface-root`: an empty `manifest.json`),
  and the **analytics env** in `<org-root>/.claude/settings.json` (the transcript analyzer —
  `SG_TRANSCRIPT_ROOT` / `SG_EVENT_LOG` / `SG_PRICING`; `bindings-contract` §6). You **emit** (do not
  install) the scheduled analyzer-task runbook.
- **You do NOT author work items.** Work-item content is authored via the **front's `raise`** (per
  `product-dashboard-conventions`). You scaffold an empty `items/` + manifest; the first work item is
  added through `raise`, under its PR gating.
- **You do NOT author strategy or objectives content** beyond the empty template — `strategy-curator`
  maintains the canvas; the operator fills the OKRs. You leave a valid, empty shell.
- **You never mutate the vendored graph.** Everything you write is **harness-local** (the overlay).

## Preflight (before any mode)

Load `bindings-contract` for the key set + the surface template. Identify the **org root** — the
directory Claude launches from, the one carrying `.claude/` (per the harness directory topology;
bindings live at `<org-root>/.claude/bindings.yaml`). If you cannot locate it unambiguously, ask.

## Modes

### `scaffold` — greenfield bootstrap

0. **Detect partial state (crash-window recovery).** Before bootstrapping, check what already
   exists: the org-root `bindings.yaml`, the org-root `CLAUDE.md`, and the surface skeleton. A prior
   run interrupted *between* these writes leaves a **half-written** harness — the crash windows:
   bindings written but the surface not yet scaffolded; the surface present but bindings absent; the
   `CLAUDE.md` written but bindings not. **A `CLAUDE.md` present but missing its
   `@.claude/sg-root-instructions.md` `@`-ref — or that vended file absent — is the same class of
   partial state (an ambient-surface drift: a harness scaffolded before the `@`-ref existed, or a
   plugin update that added the root set), repairable in place by Step 4.** On a partial state, **do not error and do not overwrite** —
   switch to **targeted repair**: keep what exists (confirm it with the operator), create only the
   missing artefacts via the steps below (idempotently), then `validate`. A fully-absent harness is a
   clean greenfield run; a fully-present, consistent one — including the `@`-ref present and the vended
   file non-empty — routes to `bind` / `validate`.
1. **Locate the org root** and confirm it with the operator (this anchors every relative binding).
2. **Resolve each binding key** from `bindings-contract`. Infer where you can and **propose the
   value** for the operator to confirm or correct: the `surface-root` (where the work ledger should
   live), `handbook-index` (an existing handbook `index.json`), `personas` (an existing profiles
   doc, optional pre-launch), `event-log` (the `.stack-graph/` stream — generated/local),
   `learnings-archive` (the committed prior-proposals surface, D60), `deploy-config` (the deploy
   target, e.g. the portal's `wrangler.jsonc`; optional),
   and the scalar dials (`maturity`, `plan-policy`, `okr-binding`,
   `stale-projection-policy`, `terminal-recorder`). Mark optional keys that don't apply yet rather
   than inventing targets.
3. **Write `bindings.yaml`** — flat keys per the contract, values relative to the org root. Do not
   overwrite an existing `bindings.yaml`: if one exists and the rest of the harness is complete, this
   is a re-point — switch to `bind`; if the harness is partial (step 0), keep the existing bindings
   and continue with the missing artefacts. In **either** case, if the existing `bindings.yaml` is
   **missing keys now required** by `bindings-contract` (e.g. a vendored-plugin update added a key
   such as `learnings-archive`), **add the missing required keys** — infer + confirm each — before
   `validate`; never leave a stale key set that `validate` will then reject. This is how an existing
   harness adopts a plugin that introduced a new required binding (the plugin-update migration path).
4. **Write the org-root `CLAUDE.md`** from the `bindings-contract` template — the harness's
   **ambient surface**: the `handbook-index` pointer (made ambient so it cascades to every child),
   the pointer to the bindings reference, and the how-to-use-the-graph navigation. Also emit **one
   line** pointing at the handoff-prompt convention, so every agent that writes a chip or handoff
   prompt from this harness has the field form named ambiently — e.g. *"Writing a chip / handoff
   prompt: follow the handoff-prompt convention (the stack-graph plugin's `handoff-prompt-convention`
   reference, shipped with harness-init) — delta only, policy by pointer not by copy."* Name the
   convention and where it ships rather than a brittle filesystem path (the reference travels inside
   the vendored plugin, not at a bound surface). **Vend the root instructions by `@`-ref:** copy your
   bundled `sg-root-instructions` reference to the harness-local `<org-root>/.claude/sg-root-instructions.md`
   and have the `CLAUDE.md` template carry `@.claude/sg-root-instructions.md`, so the closed,
   byte-budgeted root set (navigation + substrate-consult-first + safety + the one-line `<sg-*>` vocab
   pointer) is reliably **inlined every session** — a static `@`-ref, not a pointer the agent must
   choose to follow, and not the dynamic plugin path a `CLAUDE.md` cannot resolve. Do **not** inline a
   *fat* operating-instructions block — that reference is retired (M-1); the tiny root set is cheap
   enough to `@`-ref, and the live per-turn state is loaded just-in-time by the `jit-preamble`.
   Structure only; **idempotent** — never clobber an existing authored `CLAUDE.md`; if one exists,
   confirm it carries the ambient pointers + the `@.claude/sg-root-instructions.md` `@`-ref and re-vend
   a stale **or absent** root-instructions copy. **If the `@`-ref line itself is missing, insert it** —
   a single `@.claude/sg-root-instructions.md` line appended to the ambient pointers, a surgical
   one-line patch that never rewrites or reorders the authored body; warn only on a missing *ambient
   pointer* (handbook-index / bindings) you cannot safely place. This repair is **non-interactive** —
   it re-vends the file and inserts the `@`-line without re-running the Step 2 binding confirmation. (The
   per-session runtime state load is the **`jit-preamble`** — the deterministic JIT preamble loads the
   live carrier state from the derived projection and emits it for turn 1; you scaffold the file,
   `@`-ref the root instructions, and name the preamble surface — you do not hand-author a session-start
   procedure into the body.)
5. **Scaffold the surface skeleton** under `surface-root` per the template: `strategy.md` (vision ·
   guiding policy · JTBD · open questions — empty headings), `objectives.md` (per `okr-schema` —
   empty objective/north-star headings), `items/` with an **empty** `manifest.json` (`[]`),
   `sprints/`, and `learnings/` with an **empty** `archive.md` (the committed `learnings-archive`,
   D60 — the gate populates it; you create the empty home). Then, under `improvements-root` (a
   **sibling** of `surface-root`), scaffold an **empty** `manifest.json` (`[]`) — the incremental
   loop's surface; `triage` adds standalone-IU slices here. **Idempotent:** never clobber existing
   content — create only what's missing and warn on what's already there.
5b. **Write the analytics env** (the transcript analyzer; `bindings-contract` §6). Analytics are
   **transcript-derived in batch** — there are **no hooks** and **no scope-gating flag**. Write the
   analyzer's env into `<org-root>/.claude/settings.json` (the `env` block — idempotent; never clobber
   existing keys):
   - `SG_TRANSCRIPT_ROOT` = the analyzer's **input** root (default `~/.claude/projects`) — where the
     raw session transcripts live. An env var, **not** a binding key (no graph node resolves it).
   - `SG_EVENT_LOG` = the **absolute** path to `<org-root>/.stack-graph/derived/analyzer-events.jsonl`
     (the `event-log` binding, absolutised — the analyzer's **output**; absolute because it runs
     out-of-band in arbitrary cwd).
   - `SG_PRICING` = the absolute path to the `pricing` binding's `pricing.json`, when bound (the Cost
     block prices with it; omit if `pricing` is unbound — the block degrades to components-without-$).
   Resolve the optional `pricing` binding in step 2 alongside the others (the plugin ships a default
   `pricing.json`; bind a host one to override). This is a harness-local write under `<org-root>/.claude/`.
5c. **Emit the scheduled analyzer-task install runbook** (`bindings-contract` §6). The analytics
   substrate is produced by a **scheduled `analyze → publish` job**, and `harness-init` **does NOT
   install it** — registering a system scheduler is a privileged write outside the harness root and
   violates harness-local-writes-only. Do **one** of:
   1. **(default) Emit the exact command + a short runbook** for the operator to install — the
      analyze→publish job run from the org root with `SG_TRANSCRIPT_ROOT` in scope, default cadence
      twice daily (e.g. `0 6,18 * * * cd <org-root> && bun run <analyzer-home>/analyze.ts && bun run <analyzer-home>/publish-projection.ts`).
      The analyzer is **NOT** in the installed plugin (it moved out post-D1, RESTRUCTURE-PLAN); its
      real home is the **shared workspace** the org root carries — `<analyzer-home>` resolves to
      `workspace/renderer/analyzer/` (analyze.ts) and `workspace/renderer/` (publish-projection.ts)
      under the org root, the same locality `bindings-contract` §6 names. Emit the path against that
      home, not `<plugin>/…`.
      Print it for the operator to run as the privileged step (the established provisioning-runbook
      pattern — `harness-init` scaffolds; the operator runs the cron step). **You write no crontab.**
   2. **OR**, where the runtime exposes a scheduling surface, register the job via
      `mcp__scheduled-tasks__*` (the harness's own scheduler) — pick this only if that is how the
      harness schedules. This is a **build-time choice** (runbook-emit vs MCP-register).
   The job is idempotent (the analyzer full-rewrites the derived log each run), so a missed or
   duplicated run is harmless.
6. **Run `validate`** (below) and report, then hand off with the **load canary**: tell the operator
   what a correctly-loaded harness looks like next session — launch at the org root, and the first
   message should show the harness was picked up (the handbook index is reachable by name and a
   `bindings.yaml`-bound node resolves its surface). Then the next steps: **work items are authored via
   the front's `raise`** (per `product-dashboard-conventions`); the OKRs are filled in `objectives.md`;
   the loop runs once validate passes.

### `bind` — (re)author the bindings only

1. Read the existing `bindings.yaml` (if any) and the `bindings-contract` key set.
2. Map or adjust keys → targets against the **current** workspace layout (e.g. after a path change
   or a new surface). Propose each change; confirm with the operator. Do not touch the surface
   files.
3. Run `validate` and report.

### `validate` — the harness gate (run before the loop)

1. **bindings.yaml present** at `<org-root>/.claude/bindings.yaml` and parseable as flat YAML.
2. **Every required key resolves** (per `bindings-contract`) to a real path/target; optional keys
   either resolve or are explicitly marked not-yet. Report each missing/dangling key by name.
3. **The org-root `CLAUDE.md` is present and wired** — it exists at the org root, reaches the
   bindings reference, carries the `handbook-index` ambient pointer, and `@`-refs the vended root
   instructions (`@.claude/sg-root-instructions.md`, with that file present + non-empty). This is the
   runtime pre-flight: a harness whose ambient surface does not load the bindings + handbook index +
   the root instructions will not orient on the next session.
4. **The surface exists**: `surface-root`, `items-root` + a parseable `manifest.json`,
   `objectives-doc`, `strategy-doc`, `sprints-root`, `improvements-root` + a parseable
   `improvements-manifest`, `learnings-archive` (the committed archive
   file). The `event-log` location is reachable (the `.stack-graph/derived/` parent exists or can be
   created).
5. **Analytics is wired (scheduled task registered + analyzer dry-run probe).** This is the
   capture gate the analytics evidentiary layer depends on; verify it end-to-end, not by assertion:
   - **Analytics env present.** `SG_TRANSCRIPT_ROOT` (the analyzer's input root) and `SG_EVENT_LOG`
     (absolute, resolving to the org-root `.stack-graph/derived/analyzer-events.jsonl`) are exported
     (scaffold step 5b); `SG_PRICING` resolves when `pricing` is bound.
   - **Scheduled task registered (read-only).** Confirm the `analyze → publish` job is registered —
     **read-only**: inspect the crontab / scheduler (or list `mcp__scheduled-tasks__*` where the
     harness schedules that way). You do **not** write the schedule; an unregistered task is a gap,
     not a pass — point the operator at the runbook scaffold step 5c emitted.
   - **Analyzer dry-run probe.** Confirm derivation actually works: run the analyzer **once over a
     tiny fixture transcript** and assert a **derived row lands** in the org-root `SG_EVENT_LOG`
     (e.g. a `session-usage` row). A log with **no** derived row is the failure (the analyzer never
     produced output — a bad `SG_TRANSCRIPT_ROOT`, an unreadable fixture, or a broken analyzer).
     Report which, with the remedy. Clean up the probe output after (or note it is a probe).
   The probe proves the whole path — transcript → analyzer → org-root derived log — before the loop
   ever relies on it.
6. **Report pass/fail with the specific gaps.** A fail means the loop must not run yet — surface
   exactly what to fix (a missing binding, a dangling path, an absent surface dir, an unwired
   `CLAUDE.md`, an unregistered analyzer task, or an analyzer dry-run probe that never derived a row).
   This is the gate the first traversal depends on.

## Hard constraints

- **Structure only — never content.** You scaffold the bound, empty surface; you never author work
  items (the front's `raise`, per `product-dashboard-conventions`), the strategy canvas
  (`strategy-curator`), or OKR values. You leave valid empty templates.
- **Harness-local writes only.** You write `bindings.yaml`, the org-root `CLAUDE.md`, the vended
  `<org-root>/.claude/sg-root-instructions.md` (the `@`-ref'd root set), the surface skeleton under
  `surface-root`, and the org-root `.claude/settings.json` **env block** (the analytics env) — nothing
  else, and **never** the vendored graph, and **never** a crontab / system scheduler (you *emit* the
  analyzer-task runbook for the operator to install). Instantiation is an additive overlay.
- **Idempotent.** Re-running `scaffold` fills only what is missing and warns on what exists; it
  never clobbers authored content, an existing `bindings.yaml`, or an existing `CLAUDE.md` (re-pointing
  bindings is `bind`'s job, with confirmation). A partial harness is *repaired*, never overwritten.
- **Carry no product literals.** Paths, ids, tiers, stage names, and toolchain are inferred from
  the workspace and confirmed by the operator — never hardcoded. The key set + format live in
  `bindings-contract`, the objective shape in `okr-schema`, the work-item shape in `work-item-schema`.
- **validate is a real gate.** Do not report a harness ready while a required binding is unresolved
  or a surface dir is absent; the loop depends on this being honest.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/bindings-contract.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/handoff-prompt-convention.md` — `handoff-prompt-convention`
- `references/okr-schema.md` — `okr-schema`
- `references/sg-root-instructions.md` — `sg-root-instructions`
- `references/work-item-schema.md` — `work-item-schema`

