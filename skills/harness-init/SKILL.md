---
name: "harness-init"
description: "Stands up a harness in a consuming workspace — writes bindings.yaml, materializes the always-on band into .claude/ (the consolidated sg-root-instructions floor, the crystallised @git-policy surface, the generated at-hand-references-index, the two identity surfaces seeded from their guidance refs), crystallises the nav layer at the local-reference home (the generated decisions-index + the seeded strategy-page skeleton), scaffolds the dashboard surface skeleton plus the seeded substrate (objectives / strategy / experience-contract / personas and a thin zone-principle brief per horizontal), writes the analytics env (the SG_* vars), emits the scheduled analyzer-task install runbook, and validates every required binding resolves plus the analyzer dry-run probe. Modes — scaffold (greenfield bootstrap), bind (re-author bindings only), validate (the harness gate before the loop runs). Structure only — content is authored separately. Use when a consuming workspace needs to stand up its harness for the first time (greenfield), re-point its bindings after a path change, or verify the harness is complete before the workflow runs. NOT for authoring work-item content (the front's raise, per product-dashboard-conventions), strategy or objectives values (strategy-curator), or local doctrine (context-curator) — harness-init creates the empty, bound, seeded structure those then fill."
---


# Harness init

You stand up, re-point, or verify a **harness** — a consuming workspace's specialising layer over
the vendored, general graph — in the **current workspace**. The vendored loop reads a workspace's
surfaces (the work ledger, strategy + objectives, the event log) **through bindings**, never
hardcoded paths; you are the executable instantiation of that contract. The operator invokes you
with a mode; you run that mode's branch, pausing at every judgment point (which directory is the
org root, where the dashboard surface should live, which existing docs the personas /
experience-contract keys point at).

You are **vendored and general** — you carry **no product paths, ids, or toolchain**. The key set,
the `bindings.yaml` format, and the surface-structure template all live in the **`bindings-contract`**
reference (imported, not restated here); the objective template shape is in `okr-schema`. You infer
values from the workspace and **confirm with the operator** — you never assume a product's layout.

You are the **genesis node** — a harness has no live carrier state to inject before it exists, so
you carry no turn-1 preamble. You load your inputs by reading the workspace and the operator's
confirmations, not from a derived projection.

## The structure/content contract — read this before any mode

You create the **bound, empty structure** and the **seeded shells**; the maintainers and the front
fill the **content** (work items via `raise`, per `product-dashboard-conventions`; strategy and
objectives via `strategy-curator`; the identity surfaces via the operator + curators):

- **You write** `<org-root>/.claude/bindings.yaml` (the binding values, including the
  **`deploy-config` values** — the field set + `version_strategy`, read by `deploy` at land —
  scaffolded empty here), the **materialized always-on band** under `<org-root>/.claude/` (the
  vended `sg-root-instructions` floor, the crystallised **`@git-policy`** surface, the generated
  **`at-hand-references-index`**, and the three seeded **identity surfaces**), the **crystallised
  nav layer** at the local-reference home (the generated **`decisions-index`** + the seeded
  **`strategy-page`** skeleton), the org-root
  **`CLAUDE.md`** (the harness's **ambient surface**), the **surface skeleton** under
  `surface-root` (the `strategy.md` / `objectives.md` templates, `items/` + an empty
  `manifest.json`, `sprints/`, `learnings/`, the experience-contract and personas shells), the
  **improvements surface** under `improvements-root` (a sibling of `surface-root`: an empty
  `manifest.json`), a **thin zone-principle brief per horizontal** under `axis-root` (when axes are
  bound), the **analytics env** in `<org-root>/.claude/settings.json` (the transcript analyzer —
  `SG_TRANSCRIPT_ROOT` / `SG_EVENT_LOG` / `SG_PRICING`; `bindings-contract` §analytics-env), the
  **materialized analyzer wrapper** (`<org-root>/.claude/sg-analyze.sh`, its `@@ANALYZER_HOME@@`
  placeholder baked to the plugin analyzer-home), and the **derived-root `.gitignore`**
  (`.stack-graph/derived/`). You **emit** (do not install) the scheduled analyzer-task runbook.
- **You do NOT author work items.** Work-item content is authored via the **front's `raise`** (per
  `product-dashboard-conventions`). You scaffold an empty `items/` + manifest; the first work item is
  added through `raise`, under its PR gating.
- **You do NOT author strategy or objectives content** beyond the empty template — `strategy-curator`
  owns and authors both surfaces. You leave a valid, empty shell.
- **You do NOT fill the identity surfaces** — you seed `product-definition` / `product-principles`
  from their vendored `*-guidance` refs; the operator and curators fill and maintain them.
- **You never mutate the vendored graph.** Everything you write is **harness-local** (the overlay).

## Preflight (before any mode)

Load `bindings-contract` for the key set + the surface template. Identify the **org root** — the
directory Claude launches from, the one carrying `.claude/` (per the harness directory topology;
bindings live at `<org-root>/.claude/bindings.yaml`). If you cannot locate it unambiguously, ask.

### Band layout — the `.claude/` cadence tiers (declared once; the steps below resolve from here)

The `.claude/` overlay is organised **by cadence** (cadence = home). This is the **single in-node
declaration** of the band paths (the `harness-topology` reference owns the model; here are the
concrete homes a step writes to) — the materialization and validate steps **resolve these labels**,
they do not restate the literals:

- **`<always-on-home>`** = `<org-root>/.claude/always-on/` — the floor `@`-inlined every session:
  the vended `sg-root-instructions`, the crystallised `@git-policy` surface, the two identity
  surfaces, and the generated `at-hand-references-index`.
- **`<nav-home>`** = `<org-root>/.claude/on-demand/` — the local on-demand references, with the
  crystallised **nav layer** as siblings: the `decisions-index` (its path from the
  **`decisions-index-path`** binding — a multi-writer path, so bound not restated) and
  `<nav-home>/strategy-page/README.md` (authored doctrine lives under `<nav-home>/specs/`).

## Modes

### `scaffold` — greenfield bootstrap

0. **Detect partial state (crash-window recovery).** Before bootstrapping, check what already
   exists: the org-root `bindings.yaml`, the org-root `CLAUDE.md`, and the surface skeleton. A prior
   run interrupted *between* these writes leaves a **half-written** harness — the crash windows:
   bindings written but the surface not yet scaffolded; the surface present but bindings absent; the
   `CLAUDE.md` written but bindings not. **A `CLAUDE.md` present but missing its always-on-band
   `@`-refs — or a vended band file absent — is the same class of partial state (an ambient-surface
   drift), repairable in place by Step 4.** On a partial state, **do not error and do not
   overwrite** — switch to **targeted repair**: keep what exists (confirm *kept* artefacts with the
   operator), create only the missing artefacts via the steps below (idempotently — the
   ambient-surface `@`-line repair of Step 4 is **non-interactive** and does not prompt), then
   `validate`. A fully-absent harness is a clean greenfield run; a fully-present, consistent one —
   including the `@`-refs present and the vended files non-empty — routes to `bind` / `validate`.
1. **Locate the org root** and confirm it with the operator (this anchors every relative binding).
2. **Resolve each binding key** from `bindings-contract`. Infer where you can and **propose the
   value** for the operator to confirm or correct: the `surface-root` (where the work ledger should
   live), `personas` (an existing profiles doc, optional pre-launch), `event-log` (the
   `.stack-graph/` stream — generated/local), `learnings-archive` (the committed prior-proposals
   surface), `deploy-config` (the deploy target; optional; its field set includes
   `version_strategy` — `deploy` owns the prod version bump and reads it at land), the optional
   capability keys (`axis-root`, `pricing`, the experience-contract home), and the dial scalars
   (`maturity`, `plan-policy`, `okr-binding`, `stale-projection-policy`, `terminal-recorder`). Mark
   optional keys that don't apply yet rather than inventing targets.
3. **Write `bindings.yaml`** — flat keys per the contract, values relative to the org root.
   git-policy is **not** a bindings key — it materializes as a crystallised surface (Step 3b). Do
   not overwrite an existing `bindings.yaml`: if one exists and the rest of the harness is complete,
   this is a re-point — switch to `bind`; if the harness is partial (step 0), keep the existing
   bindings and continue with the missing artefacts. In **either** case, if the existing
   `bindings.yaml` is **missing keys now required** by `bindings-contract` (e.g. a vendored-plugin
   update added a key), **add the missing required keys** — infer + confirm each — before
   `validate`; never leave a stale key set that `validate` will then reject. This is how an existing
   harness adopts a plugin that introduced a new required binding (the plugin-update migration path).
3b. **Materialize the crystallised `@git-policy` surface** into `<always-on-home>` (§Band layout) — the
   per-repo/path write-policy map every git-writing agent reads off the floor. Author it **from the
   harness's git topology** (walk the repos the org root carries; propose an entry per repo, with
   path predicates where a repo's sub-tree wants a different mode) to the shape in
   **`git-policy-schema`** — entry = repo + optional path predicate → `direct`/`pr-gated` + label;
   most-specific-wins; no entry ⇒ labelled PR (fail-closed) — and confirm each entry with the
   operator. Do **not** restate the shape or the resolution rule; both are **single-sourced** from
   `git-policy-schema`. The surface is `@`-ref'd from `sg-root-instructions` §Git-operations (Step 4), so
   the resolved policy reaches every session's floor. **Idempotent** — never clobber an
   operator-authored `@git-policy` surface on a re-point/partial-repair; materialize it only when
   absent.
4. **Write the org-root `CLAUDE.md`** from the `bindings-contract` template — the harness's
   **ambient surface**: the pointer to the bindings reference, the how-to-use-the-graph navigation
   (node `references` edges + the inlined index), and the **always-on band** as **materialized
   fixed-path copies under `.claude/`, `@`-ref'd from `CLAUDE.md`** — never prose inlined into it.
   The band: the consolidated **`sg-root-instructions`** floor (the root set, the `<sg-*>` process
   family inline, §Reference index → `@at-hand-references-index`, §Git-operations → `@git-policy`) plus
   the two crystallised identity surfaces (`@product-definition` · `@product-principles`,
   Step 4b). **Vend the floor:** copy your bundled `sg-root-instructions` reference
   to `<always-on-home>sg-root-instructions.md` (§Band layout) and have the `CLAUDE.md`
   template carry `@.claude/always-on/sg-root-instructions.md`, so the floor is reliably **inlined every
   session** — a static `@`-ref, not a pointer the agent must choose to follow, and not a dynamic
   plugin path a `CLAUDE.md` cannot resolve. The floor stays **terse by discipline** — do not inline
   a fat operating-instructions block; the live per-turn work-state is loaded just-in-time by the
   `preamble` (the deterministic turn-1 state loader — you scaffold the file and `@`-ref the band;
   you do not hand-author a session-start procedure into the body). Also emit **one line** pointing
   at the handoff-prompt convention, so every agent that writes a chip or handoff prompt from this
   harness has the field form named ambiently — e.g. *"Writing a chip / handoff prompt: follow the
   handoff-prompt convention (the stack-graph plugin's `handoff-prompt-convention` reference,
   shipped with harness-init) — delta only, policy by pointer not by copy."* Name the convention and
   where it ships rather than a brittle filesystem path (the reference travels inside the vendored
   plugin, not at a bound surface). Structure only. **The `CLAUDE.md` is an SG-MANAGED, VENDED
   surface** — never operator-authored prose: on scaffold AND on every repair/re-vend, **write it
   wholesale from the template** (instantiated with the binding values), never an
   insert-around-existing-prose patch. All harness customisation lives in the **crystallised refs
   behind the `@`-band** — the identity surfaces, `@git-policy`, the at-hand index, the nav layer,
   the local references — never inline in `CLAUDE.md`. **Idempotent by content**: a `CLAUDE.md`
   already matching the vended shape is untouched; one that drifted is re-vended. If the existing
   file carries inline non-template content, **MIGRATE it** — quote each block to the operator with
   its right home per `context-principles` (an identity surface, a local reference, a binding) —
   **never silently drop it**. This re-vend is otherwise **non-interactive** — it does not re-run
   the Step 2 binding confirmation.
4b. **Seed the two crystallised identity surfaces** into `<always-on-home>` (§Band layout) —
   `product-definition` (what the product is: why · who · value), `product-principles` (the bar:
   the standing quality non-negotiables) — each seeded from its vendored guidance ref
   (`product-definition-guidance` / `product-principles-guidance`: read the guidance, write a
   skeleton that names what belongs and what is mis-homed) and `@`-ref'd from `CLAUDE.md` as part
   of the always-on band. The operator and curators fill and maintain them; you leave valid seeded
   shells. **Idempotent** — seed only what is absent.
4c. **Generate the `at-hand-references-index`** into `<always-on-home>` (§Band layout) — the always-on ref map,
   assembled as a **pure function of the on-demand reference set**: one entry per ref (its
   `subject` + terse `read-when`), **vendored and local alike** — only the harness can assemble the
   full set, because only it knows its local refs. `@`-ref'd from `sg-root-instructions`
   §Reference index. Never hand-author entries; regenerate on change (`harness-update` regenerates
   it on every plugin bump). The index is floor cost — keep each entry to the ref's `read-when`
   hint, nothing more.
4d. **Generate the `decisions-index`** into the path the **`decisions-index-path`** binding
   resolves (a nav-layer sibling under `<nav-home>`; multi-writer, so bound not restated — `log-decision`
   re-derives the same file) — the on-demand lookup over the **bound
   decisions store**, assembled as a **pure function of the store**: one row per settled entry
   (its id + a terse gist + its locator in the store); pointers, never conclusions. Frontmatter
   carries `read-when` (so the at-hand index lists it) and `reviews-on: decisions-store`. Never
   hand-list entries; `log-decision` re-derives the index after every store write, so it stays
   fresh between updates. An empty store yields an empty-but-valid index — generate it anyway;
   the slot must exist.
4e. **Seed the `strategy-page` skeleton** into the nav home
   (`<nav-home>/strategy-page/README.md`, §Band layout) — the **stable** strategy + top-level
   objectives reference (stable → reference; the runtime KRs stay on `objectives.md`). Seed the
   frontmatter (incl. `read-when`, so the at-hand index lists it) + empty section headings for the
   kernel synthesis and the top-level objectives; **`strategy-curator` authors and owns the
   content**. **Idempotent — never clobber a present authored page** (the same rule as the
   `@git-policy` map); seed only what is absent.
5. **Scaffold the surface skeleton** under `surface-root` per the template: `strategy.md` (vision ·
   guiding policy · JTBD · open questions — empty headings), `objectives.md` (per `okr-schema` —
   empty objective/north-star headings), `items/` with an **empty** `manifest.json` (`[]`),
   `sprints/`, `learnings/` with an **empty** `archive.md` (the committed `learnings-archive` — the
   gate populates it; you create the empty home), the **experience-contract shell** (per
   `experience-contract-schema` — the four parts as empty headings, each element's evidence-state
   slot present), and a **personas shell** (an empty profiles skeleton — no named schema fixes its
   shape; leave headings the operator fills). Then, under `improvements-root` (a **sibling** of
   `surface-root`), scaffold an **empty** `manifest.json` (`[]`) — the incremental loop's surface;
   `triage` adds standalone-IU slices here. **Idempotent:** never clobber existing content — create
   only what's missing and warn on what's already there.
5b. **Seed a thin zone-principle brief per horizontal** under `axis-root` (when the harness binds
   the zone matrix; skip when no axes are bound — an optional capability). Each brief is a zone rule
   on the **`axis-entry-schema`** shape: a `references` edge to its horizontal, the four-facet body
   (**constraints · stack · conventions · pointers** — thin seed headings with what the workspace
   already makes obvious), and the optional `deps:` / `runtimes:` frontmatter. This is a **direct
   bootstrap write** — the home must form at matrix-authoring time; thereafter agents auto-raise
   candidate zone rules into `memory.md` (the ongoing **accrete staging buffer only**, never the
   seed home) and `context-curator` reviews them in. You seed; you do not garden.
5c. **Write the analytics env** (the transcript analyzer; `bindings-contract` §analytics-env).
   Analytics are **transcript-derived in batch** — the analyzer installs **no hooks** and **no
   scope-gating flag** (the harness's one host hook is the carrier-arg guard, 5e — enforcement,
   not analytics). Write the analyzer's env into `<org-root>/.claude/settings.json` (the `env`
   block — idempotent; never clobber existing keys):
   - `SG_TRANSCRIPT_ROOT` = the analyzer's **input** root (default `~/.claude/projects`) — where the
     raw session transcripts live. An env var, **not** a binding key (no graph node resolves it).
   - `SG_EVENT_LOG` = the **absolute** path to `<org-root>/.stack-graph/derived/analyzer-events.jsonl`
     (the `event-log` binding, absolutised — the analyzer's **output**; absolute because it runs
     out-of-band in arbitrary cwd).
   - `SG_PRICING` = the absolute path to the `pricing` binding's `pricing.json`, when bound (the Cost
     block prices with it; omit if `pricing` is unbound — the block degrades to components-without-$).
   Resolve the optional `pricing` binding in step 2 alongside the others (the plugin ships a default
   `pricing.json`; bind a host one to override). This is a harness-local write under `<org-root>/.claude/`.
5d. **Materialize the analyzer wrapper, gitignore its derived output, and emit the scheduled-task
   install runbook** (`bindings-contract` §analytics-env). The analytics substrate is produced by a
   **scheduled `analyze → publish` job** that runs the vendored analyzer wrapper.
   - **Materialize the wrapper.** Copy the vendored `<plugin>/scripts/analyzer/sg-analyze.sh` (the
     analyzer asset tree `generate` ships into the plugin) to the harness-local
     `<org-root>/.claude/sg-analyze.sh`, **substituting its `@@ANALYZER_HOME@@` placeholder — the
     wrapper's baked `BAKED_ANALYZER_HOME` assignment — with the resolved absolute path to
     `<plugin>/scripts/analyzer`**, the analyzer's home inside the installed plugin. Leave the
     wrapper's fail-closed survival guard's literal sentinel intact, so an unmaterialized copy is
     still caught: the wrapper **fails closed** (non-zero exit + a remedy on stderr) if the
     placeholder ever survives, so a missed substitution never runs against a guessed path. The
     wrapper bakes an **absolute** path so a scheduler can invoke it from any cwd; `SG_ANALYZER_HOME`
     overrides the baked home for a re-point. **Idempotent** — `harness-update` re-materializes it on
     a plugin bump; never hand-edit the materialized copy.
   - **Gitignore the derived output.** Write (or extend) the consuming workspace's `.gitignore` so
     the analyzer's **derived root — `.stack-graph/derived/`** (the `SG_EVENT_LOG` parent, a
     generated local stream) — is never committed. **Idempotent** — add the entry only when absent.
   - **Emit the install runbook.** `harness-init` **does NOT install** the scheduler — registering a
     system scheduler is a privileged write outside the harness root and violates
     harness-local-writes-only. Do **one** of:
     1. **(default) Emit the exact command + a short runbook** for the operator to install — the
        analyze→publish job run from the org root with `SG_TRANSCRIPT_ROOT` in scope, default cadence
        twice daily, invoking the materialized `<org-root>/.claude/sg-analyze.sh`. The analyzer
        **ships inside the plugin** — its home is `<plugin>/scripts/analyzer` (the locality
        `bindings-contract` §analytics-env names), and the materialized wrapper's baked path resolves
        the analyzer there. Print the command for the operator to run as the privileged step (the
        provisioning-runbook pattern — `harness-init` scaffolds; the operator runs the cron step).
        **You write no crontab.**
     2. **OR**, where the runtime exposes a scheduling surface, register the job via the harness's own
        scheduler — pick this only if that is how the harness schedules.
   The job is idempotent (the analyzer full-rewrites the derived log each run), so a missed or
   duplicated run is harmless.
5e. **Wire the carrier-arg guard hook.** The plugin ships the `carrier-arg-hook` PreToolUse guard
   at `<plugin>/scripts/carrier-arg-hook/` — a deterministic stdlib script that **DENIES a
   carrier-consuming stage-skill invocation whose args carry no clean carrier token**, so the
   compulsory carrier argument is enforced by mechanism at dispatch, not only counted after.
   Add its block to `<org-root>/.claude/settings.json` under `hooks.PreToolUse` (idempotent —
   never clobber an existing hooks entry): one entry with `matcher: "Skill|Task|Agent"` and a
   single `command` hook `bun "<plugin>/scripts/carrier-arg-hook/carrier-arg-hook.ts"` (the **absolute**
   installed-plugin path). The guard reads its enforced node set from the shipped sibling
   `carrier-nodes.json` (the derivation's output — {build, shape} today, widening as declarants
   grow); pass `--nodes <path>` only to override with a re-materialized set. It **only blocks** —
   never auto-approves — and **fails open** on a malformed payload, so it cannot wedge the host.
   **Idempotent** — `harness-update` re-wires it on a plugin bump; never hand-edit.
6. **Run `validate`** (below) and report, then hand off with the **load canary**: tell the operator
   what a correctly-loaded harness looks like next session — launch at the org root, and the first
   message should show the harness was picked up (the always-on band is inlined — the floor, the
   `@git-policy` map, the reference index — and a `bindings.yaml`-bound node resolves its surface).
   Then the next steps: **work items are authored via the front's `raise`** (per
   `product-dashboard-conventions`); **objectives are authored via `strategy-curator`**; the loop
   runs once validate passes.

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
3. **The org-root `CLAUDE.md` is present, wired, and vended-shaped** — it exists at the org root,
   reaches the bindings reference, carries the **always-on band `@`-refs**: the vended floor
   (`@.claude/always-on/sg-root-instructions.md`, that file present + non-empty), the two identity surfaces,
   and — via the floor — the generated `at-hand-references-index` and the `@git-policy` surface,
   each resolving to a present, non-empty file; and **matches the vended template shape** (an
   SG-managed surface — inline non-template content is drift, flagged for re-vend + migration; the
   customisation home is the crystallised refs, never `CLAUDE.md` prose). This is the runtime
   pre-flight: a harness whose ambient surface does not load the bindings + the band will not
   orient on the next session.
4. **The surface exists**: `surface-root`, `items-root` + a parseable `manifest.json`,
   `objectives-doc`, `strategy-doc`, `sprints-root`, `improvements-root` + a parseable
   `improvements-manifest`, `learnings-archive` (the committed archive file), the
   experience-contract and personas shells, and — when `axis-root` is bound — a zone-principle
   brief per horizontal. The **crystallised nav layer** is present at the nav home (§Band layout):
   the `strategy-page` skeleton (scaffold 4e) and the generated `decisions-index` (scaffold 4d),
   each with `read-when` frontmatter. The `event-log` location is reachable (the
   `.stack-graph/derived/` parent exists or can be created).
4b. **The `@git-policy` surface is sound.** Check the materialized map against
   **`git-policy-schema`** (the single source — do not restate the shape or the resolution rule):
   the surface parses; every entry maps a **repo (+ optional path predicate)** to a legal `mode`
   (`direct` | `pr-gated`), with a `label` on every `pr-gated` entry; the `sg-root-instructions`
   §Git-operations `@`-ref resolves to it. A **thin map is not a fail** — an unlisted target rides the
   fail-closed default (labelled PR); a **malformed entry or an illegal mode is a fail** (either
   typo silently policies nothing or leaks a garbage mode) — report each. An **absent surface on a
   git-writing harness is a fail** — materialize it via scaffold Step 3b.
5. **Analytics is wired (scheduled task registered + analyzer dry-run probe).** This is the
   capture gate the analytics evidentiary layer depends on; verify it end-to-end, not by assertion:
   - **Analytics env present.** `SG_TRANSCRIPT_ROOT` (the analyzer's input root) and `SG_EVENT_LOG`
     (absolute, resolving to the org-root `.stack-graph/derived/analyzer-events.jsonl`) are exported
     (scaffold step 5c); `SG_PRICING` resolves when `pricing` is bound.
   - **Scheduled task registered (read-only).** Confirm the `analyze → publish` job is registered —
     **read-only**: inspect the crontab / scheduler (or the harness's own scheduling surface, where
     it schedules that way). You do **not** write the schedule; an unregistered task is a gap,
     not a pass — point the operator at the runbook scaffold step 5d emitted.
   - **Analyzer dry-run probe — under the cron-equivalent env.** Confirm derivation actually works
     **under the conditions the twice-daily cron actually runs**, not the in-harness rich env: invoke
     the materialized `<org-root>/.claude/sg-analyze.sh` over a **tiny fixture transcript** under the
     **real scheduler environment** — `env -i` (no inherited vars), cwd `/` — the **same
     cron-fidelity probe `harness-update`'s bump self-heal runs**. Require **exit 0 + a derived row**
     in the org-root `SG_EVENT_LOG` (e.g. a `session-usage` row).
     **Green-in-harness is not sufficient** — a rich interactive env masks a **cron-only**
     breakage: a surviving `@@ANALYZER_HOME@@` placeholder, a missing `analyze.ts`, a dropped
     `../lib/` asset → `ERR_MODULE_NOT_FOUND`, an absent/relative `SG_EVENT_LOG`.
     A **non-zero exit — or a log with no derived row — is fail-closed**: surface the remedy
     (materialize the wrapper via scaffold, reinstall the plugin to re-ship the
     `<plugin>/scripts/analyzer` asset tree, or read the wrapper's `analyze.log` for the captured
     runtime error) **at init**, so a broken / missing /
     unmaterialized analyzer fails **here**, not silently on the first cron fire. Clean up the probe
     output after (or note it is a probe).
   The probe proves the whole path — transcript → analyzer → org-root derived log — before the loop
   ever relies on it.
6. **Report pass/fail with the specific gaps.** A fail means the loop must not run yet — surface
   exactly what to fix (a missing binding, a dangling path, an absent surface dir, an unwired
   `CLAUDE.md` or band `@`-ref, a **malformed or absent `@git-policy` surface** (step 4b), an
   unregistered analyzer task, or an analyzer dry-run probe that never derived a row). This is the
   gate the first traversal depends on.

## Hard constraints

- **Structure only — never content.** You scaffold the bound, seeded structure; you never author work
  items (the front's `raise`, per `product-dashboard-conventions`), strategy or objectives values
  (`strategy-curator`), or the identity surfaces' content (the operator + curators). You leave valid
  empty or seeded templates.
- **Harness-local writes only.** You write `bindings.yaml`, the org-root `CLAUDE.md`, the
  materialized always-on band under `<org-root>/.claude/` (the vended `sg-root-instructions`, the
  `@git-policy` surface, the generated `at-hand-references-index`, the two identity surfaces), the
  surface skeleton under `surface-root`, the zone briefs under `axis-root`, the org-root
  `.claude/settings.json` **env block** (the analytics env), the **materialized analyzer wrapper**
  (`<org-root>/.claude/sg-analyze.sh`) and the **derived-root `.gitignore`** (`.stack-graph/derived/`)
  — nothing else, and **never** the vendored graph, and **never** a crontab / system scheduler (you
  *emit* the analyzer-task runbook for the operator to install). Instantiation is an additive overlay.
- **Idempotent.** Re-running `scaffold` fills only what is missing and warns on what exists; it
  never clobbers authored content, an existing `bindings.yaml`, an existing `CLAUDE.md`, or an
  operator-authored `@git-policy` surface (re-pointing bindings is `bind`'s job, with confirmation).
  A partial harness is *repaired*, never overwritten.
- **Carry no product literals.** Paths, ids, tiers, stage names, and toolchain are inferred from
  the workspace and confirmed by the operator — never hardcoded. The key set + format live in
  `bindings-contract`, the git-policy shape in `git-policy-schema`, the objective shape in
  `okr-schema`, the work-item shape in `work-item-schema`, the zone-rule shape in
  `axis-entry-schema`.
- **validate is a real gate.** Do not report a harness ready while a required binding is unresolved
  or a surface dir is absent; the loop depends on this being honest.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/bindings-contract.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/axis-entry-schema.md` — `axis-entry-schema`
- `references/experience-contract-schema.md` — `experience-contract-schema`
- `references/git-policy-schema.md` — `git-policy-schema`
- `references/handoff-prompt-convention.md` — `handoff-prompt-convention`
- `references/okr-schema.md` — `okr-schema`
- `references/product-definition-guidance.md` — `product-definition-guidance`
- `references/product-principles-guidance.md` — `product-principles-guidance`
- `references/sg-root-instructions.md` — `sg-root-instructions`
- `references/work-item-schema.md` — `work-item-schema`

