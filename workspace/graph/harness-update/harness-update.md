---
# identity — native .claude
id: harness-update
primitive: skill
title: Harness update
description: Brings a harness's installed stack-graph plugin current — detects installed-vs-published version, runs the scope-aware marketplace-update → uninstall → install dance (the native `claude plugin update` is broken), re-binds only when the bindings-contract version moved, and surfaces the restart reminder plus the version/commit landed. Steps — Detect, Update, Contract-drift, Hand off.
when-to-use: A harness operator needs to update an already-installed stack-graph plugin to the latest published version. NOT for first-time setup — standing up a harness from scratch is `harness-init scaffold`; this assumes the plugin is already installed and only advances its version.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph
edges:
  references:
    - { id: bindings-contract, load: import }
# analytics — the loop
goals:
  - outcome: One operator invocation takes a harness from version N to the latest published version, scope-aware, with no manual uninstall/install dance — the recurring, error-prone plugin-update maintenance is encapsulated in the factory.
    metric: share of harness updates run via harness-update vs the hand-typed CLI sequence; share of update runs that land the published version + gitCommitSha in the install registry on the first invocation.
    earns-keep: an operator updates by invoking one skill, not by remembering the non-obvious marketplace-update → uninstall → install order; the dance lives in the factory, not in the operator's head.
  - outcome: Updating is idempotent and never re-binds needlessly — a harness already at the published version is a clean no-op, and harness-init bind + validate run only when the bindings-contract version actually moved.
    metric: count of update runs against an already-current harness that mutate the install (target 0); count of re-binds triggered while the contract version was unchanged (target 0); share of contract-version moves that did trigger a bind + validate.
    earns-keep: re-running when current changes nothing and says "up to date"; the harness re-reconciles its bindings exactly when the contract changed and never otherwise.
  - outcome: The operator always knows what landed and what to do next — the version/commit it moved to and the restart-required step are surfaced every run, so a stale session never silently runs an old skill set.
    metric: share of update runs that print the landed version + gitCommitSha and the restart reminder; count of post-update sessions that ran the old skill set because the restart step was missed (target 0).
    earns-keep: every update ends with the concrete version/commit landed and the restart prompt; the operator is never left guessing whether the new skill set is live.
status: v0.1.0 — 2026-06-12
---

# Harness update

You bring a **harness**'s installed stack-graph plugin **current** — from whatever version it is on
to the latest published version — in the **current workspace**. This is the back half of the harness
lifecycle: `harness-init` *stands the harness up* (scaffold / bind / validate); you *keep it current*.
You assume the plugin is **already installed**; if it is not, this is a first-time setup and the
operator wants `harness-init scaffold`, not you.

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

### 3. Contract-drift

Compare the **new** `bindings-contract` `status:` version (the just-installed plugin's contract)
against the version the harness **last bound against**.

- If it **moved** → invoke **`harness-init bind`** then **`harness-init validate`**, so new or changed
  binding keys are reconciled and the harness re-passes its gate. (This is exactly the
  0.4.1 → 0.5.0 case, where the contract added optional `architecture-reviews-root`.)
- If it is **unchanged** → say so and **skip** the re-bind — do not re-bind or re-validate needlessly.

### 4. Hand off

Print:

- The **changelog delta** since the installed version (the entries between the old and new versions —
  from the plugin / contract changelog), so the operator sees what changed.
- The **version + `gitCommitSha` landed** — the concrete state the install moved to.
- The **RESTART-REQUIRED** reminder: the new skill set loads only on a Claude Code **restart**; until
  the operator restarts, the session is still running the old skills.

## Hard constraints

- **Carry no product literals.** Plugin name, marketplace name, scope, and registry path are resolved
  from the runtime + the bound source at run time — never hardcoded. The key set + format live in
  `bindings-contract`.
- **Runtime-registry + harness-local ops only.** You operate on the Claude Code install registry (via
  `claude plugin …`) and, on a contract move, the harness-local `bindings.yaml` (through
  `harness-init`). You **never** mutate the vendored plugin or the factory.
- **Idempotent.** Re-running when already current is a clean no-op — "up to date at vX.Y.Z", nothing
  mutated. Detect refreshes the cache before comparing so the no-op is honest, not a stale-cache
  false-positive.
- **Re-bind only on contract change.** `harness-init bind` + `validate` run **only** when the
  bindings-contract `status:` version moved — never on an unchanged contract.
- **Always surface restart + what landed.** Every non-no-op run ends with the version + `gitCommitSha`
  it landed on and the restart-required reminder; the operator is never left unsure whether the new
  skill set is live.
