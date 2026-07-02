---
name: "harness-update"
description: "Brings a harness's installed stack-graph plugin current — detects installed-vs-published version, runs the scope-aware marketplace-update → uninstall → install dance (the native `claude plugin update` is broken), regenerates the at-hand-references-index on a bump, re-binds only when the bindings-contract version moved (re-materializing the crystallised @git-policy surface and re-wiring the sg-root-instructions floor via harness-init), re-validates the ambient surface every run, and surfaces the restart reminder plus the version/commit landed. Steps — Detect, Update, Contract-drift, Ambient-sync, Hand off. Use when a harness operator needs to update an already-installed stack-graph plugin to the latest published version. NOT for first-time setup — standing up a harness from scratch is `harness-init scaffold`; this assumes the plugin is already installed and only advances its version."
---


# Harness update

You bring a **harness**'s installed stack-graph plugin **current** — from whatever version it is on
to the latest published version — in the **current workspace**. The harness lifecycle is
**two-stage**: `harness-init` *stands the harness up* (scaffold / bind / validate); you *keep it
current*. You are **periodic, not a pipeline step** — you run on demand when a bump is published
and **loop back to the steady state**; you do not flow out of a maintenance stage. You assume the
plugin is **already installed**; if it is not, this is a first-time setup and the operator wants
`harness-init scaffold`, not you.

You are **vendored and general** — you carry **no product paths, ids, or toolchain**. The binding key
set and the `bindings.yaml` format live in the **`bindings-contract`** reference (imported, not
restated here); you read its `status:` line only to detect whether the contract moved. Every path you
touch is **runtime-owned** (the Claude Code install registry, resolved per scope) or harness-local —
you never mutate the vendored plugin or the factory.

## Why the dance exists (the upstream CLI bug)

The native `claude plugin update <plugin>` is **broken** for an installed, enabled plugin: it returns
`✘ Failed to update plugin "<plugin>": Plugin "<plugin>" not found`. And `claude plugin install
<plugin>@<market>` is a no-op (`✔ already installed`) whenever the registry is still pinned to an
older `version` / `gitCommitSha`, even after the marketplace cache is refreshed. So the **only**
sequence that actually advances the install is `marketplace update → uninstall → install`. You
encapsulate that dance so the operator never has to know it. **This is a work-around, not the intended
UX** — the `claude plugin update` "not found" failure looks like a CLI bug independent of this skill
and is worth upstreaming to the plugin CLI.

## Preflight (before any step)

Load `bindings-contract` — you need its current `status:` version for the drift check, and the key
set in case a re-bind is required. Confirm the plugin is **installed** (listed/enabled in the install
registry — the same place `harness-init validate` checks). If it is **not** installed, stop and route
the operator to `harness-init scaffold` — you update an existing install; you do not perform a
first-time setup.

## Steps

### 1. Detect

1. **Read the installed version.** Resolve the Claude Code install registry (`installed_plugins.json`)
   **at run time, per scope** — it is runtime-owned, not in this repo, so do not hardcode a path; shell
   out / read it where the runtime keeps it. Note the installed `version` (and `gitCommitSha` if
   recorded) and the **scope** the plugin is installed under (`user` / `project`).
2. **Refresh the cache, THEN read the published version.** Run `claude plugin marketplace update
   <market>` **first** to refresh the local marketplace cache to the latest published state — *before*
   reading the published version. Reading the published `version` / `gitCommitSha` from a **stale**
   cache makes Detect compare against an old value and wrongly report "up to date", so the refresh is
   not optional. Then read the published version: for a **GitHub-sourced** marketplace, the source
   repo's `.claude-plugin/plugin.json` (`version` + `gitCommitSha`); for a **local/path** source, the
   bound source's `plugin.json`. Branch on the bound source kind; both resolve to a
   `version` + `gitCommitSha`.
3. **Compare.** If installed == published → print **"up to date at vX.Y.Z"** and **exit** — an
   idempotent no-op, nothing mutated. Otherwise continue to Update.

### 2. Update

Run the **scope-aware** sequence, using the scope **detected** in Detect (never assumed):

```
claude plugin marketplace update <market>        # refresh cache to latest published
claude plugin uninstall  <plugin> --scope <s>    # clear the stale version pin
claude plugin install    <plugin>@<market> --scope <s>
```

Then **confirm the new `version` + `gitCommitSha` landed** in the install registry — re-read it the
same way Detect did. If the install did not advance (still pinned to the old version), surface that as
a failure with the registry state, rather than reporting a false success.

**On every bump, regenerate the `at-hand-references-index`** — the always-on ref map is a pure
function of the on-demand reference set (each ref's `subject` + terse `read-when`, vendored + local
alike), and the vendored set may have changed with the plugin version. A stale index would leave the
floor's ref map wrong; regeneration is the bump's standing companion, not contract-gated.

### 3. Contract-drift

Compare the **new** `bindings-contract` `status:` version (the just-installed plugin's contract)
against the version the harness **last bound against**.

- If it **moved** → invoke **`harness-init bind`** then **`harness-init validate`**, so new or changed
  binding keys and the dial knobs (`bindings-contract` §dials — maturity · plan-policy ·
  stale-projection-policy · terminal-recorder) are reconciled and the harness re-passes its gate.
  The re-bind is what makes the new **always-on floor** actually load next session, not merely a key
  reconciliation: through it the crystallised **`@git-policy`** surface is reconciled (a bump that
  moves `git-policy-schema` re-materializes an ABSENT map; a **present, operator-authored map is
  never clobbered** — the shape drift surfaces as a validate failure you flag and route to the
  operator to reconcile; git-policy is a crystallised surface `@`-ref'd off the floor, **not** a
  bindings dial) and the **`sg-root-instructions`** `@`-ref is
  re-wired so the new vendored floor is what `CLAUDE.md` inlines. The full git/devops doctrine
  lives in the harness's local `devops-loops` reference — the surface you re-materialize is only
  the thin crystallised map.
- If it is **unchanged** → say so and **skip** the re-bind — do not re-bind needlessly. (The read-only
  ambient-surface `validate` of Step 3b still runs every update — what is contract-gated is the *bind*,
  not the validate.)

The definition⇄instance pairs the drift check walks (`bindings-contract`⇄`bindings.yaml` ·
`git-policy-schema`⇄`@git-policy` · the `deploy-config` values) include **optional,
conditionally-present** blocks — an unbound optional block (e.g. no `deploy-config` on a
non-deploying harness) is **not** drift; never report a false failure on a capability the harness
does not run.

### 3b. Ambient-surface sync (every run, state-based)

Independently of the contract check, **always** reconcile the harness's **ambient surface** — the
always-on band `@`-ref'd from the org-root `CLAUDE.md` (`@.claude/sg-root-instructions.md` and its
companions) that loads every session. The `@`-refs are **not binding keys**, so the Contract-drift
check above never sees them; without this step a harness whose band never got wired — or drifted —
never picks it up on update.

- **Run `harness-init validate`** (read-only — it already asserts that `CLAUDE.md` `@`-refs the vended
  `@.claude/sg-root-instructions.md` and that the band files are present + non-empty) on **every**
  update, not only on a contract move.
- **On a flagged ambient-surface gap** (an `@`-ref line missing, or a vended band file absent /
  stale), invoke **`harness-init scaffold`** in its idempotent repair posture — it re-vends the file
  and **inserts** the missing `@`-line in place (its Step 0 detection + Step 4 insert),
  non-interactively and without clobbering the authored `CLAUDE.md`. Then **re-validate** to confirm
  the gap closed.
- **State-based, not version-gated.** The trigger is the validate result — does the `@`-ref actually
  resolve? — never a version counter, so it self-heals a harness however it drifted (never-wired,
  hand-edited, half-scaffolded) and is a clean **no-op** when the surface is already current.

### 4. Hand off

Print:

- The **changelog delta** since the installed version (the entries between the old and new versions —
  from the plugin / contract changelog), so the operator sees what changed.
- The **version + `gitCommitSha` landed** — the concrete state the install moved to — plus what the
  bump re-reconciled (the regenerated index; the re-bind, when the contract moved).
- The **RESTART-REQUIRED** reminder: the new skill set loads only on a Claude Code **restart**; until
  the operator restarts, the session is still running the old skills.

## Hard constraints

- **Carry no product literals.** Plugin name, marketplace name, scope, and registry path are resolved
  from the runtime + the bound source at run time — never hardcoded. The key set + format live in
  `bindings-contract`.
- **Runtime-registry + harness-local ops only.** You operate on the Claude Code install registry (via
  `claude plugin …`) and, on a contract move, the harness-local `bindings.yaml` + the materialized
  band (through `harness-init`). You **never** mutate the vendored plugin or the factory.
- **No workflow-carrier writes.** You are a harness-lifecycle node, not a workflow gate — you never
  write a carrier's `lifecycle_state` / `gate_decisions[]` (`record-gate` is their single writer).
- **Idempotent.** Re-running when already current is a clean no-op — "up to date at vX.Y.Z", nothing
  mutated. Detect refreshes the cache before comparing so the no-op is honest, not a stale-cache
  false-positive.
- **Re-bind only on contract change.** `harness-init bind` runs **only** when the bindings-contract
  `status:` version moved — never on an unchanged contract. (The ambient-surface `validate` of Step 3b
  is separate and runs every update — see 3b. The index regeneration is bump-gated, not
  contract-gated.)
- **Always surface restart + what landed.** Every non-no-op run ends with the version + `gitCommitSha`
  it landed on and the restart-required reminder; the operator is never left unsure whether the new
  skill set is live.

## Imported references

The following references are single-sourced into this primitive's bundle and spliced at load (`@`-import). They are always present:

@references/bindings-contract.md

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/sg-root-instructions.md` — `sg-root-instructions`

