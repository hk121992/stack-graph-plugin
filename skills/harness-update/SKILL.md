---
name: "harness-update"
description: "Brings a harness's installed stack-graph plugin current: detects the installed-vs-published delta, updates in scope, re-binds on a bindings-contract move. Use when an operator advances an installed plugin to the latest published version. NOT for first-time setup; that is `harness-init scaffold`."
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
set and the `bindings.yaml` format live in the required **`bindings-contract`** reference (not
restated here); you read its **`Contract version:`** line only to detect whether the contract moved. Every path you
touch is **runtime-owned** (the active host's install registry, resolved per scope) or harness-local —
you never mutate the vendored plugin or the factory.

## Host install boundary

Resolve registry, cache refresh, update, uninstall, and install operations through the active host's
plugin controls. Keep the shared workflow invariant: refresh published state before comparing,
preserve install scope, and verify the registry advanced after mutation. If a host's native update
does not refresh an enabled install, use that host's uninstall/install fallback. Host command syntax
does not belong in this shared skill.

## Preflight (before any step)

Load `bindings-contract` — you need its **`Contract version:`** line for the drift check, and the key
set in case a re-bind is required. Confirm the plugin is **installed** (listed/enabled in the install
registry — the same place `harness-init validate` checks). If it is **not** installed, stop and route
the operator to `harness-init scaffold` — you update an existing install; you do not perform a
first-time setup.

## Steps

### 1. Detect

1. **Read the installed version.** Resolve the active host's plugin install registry
   **at run time, per scope** — it is runtime-owned, not in this repo, so do not hardcode a path; shell
   out / read it where the runtime keeps it. Note the installed `version` (and `gitCommitSha` if
   recorded) and the **scope** the plugin is installed under (`user` / `project`).
2. **Refresh the cache, THEN read the published version.** Use the host's plugin controls to refresh
   the local marketplace cache to the latest published state **before**
   reading the published version. Reading the published `version` / `gitCommitSha` from a **stale**
   cache makes Detect compare against an old value and wrongly report "up to date", so the refresh is
   not optional. Then read the published version: for a **GitHub-sourced** marketplace, the source
   source repository's published plugin metadata (`version` + `gitCommitSha`); for a **local/path**
   source, read the bound source's metadata. Branch on the bound source kind; both resolve to a
   `version` + `gitCommitSha`.
3. **Compare.** If installed == published → print **"up to date at vX.Y.Z"** and **exit** — an
   idempotent no-op, nothing mutated. Otherwise continue to Update.

### 2. Update

Run the active host's **scope-aware** update sequence, using the scope detected in Detect (never
assumed). Refresh first; if native update cannot advance the installed version, uninstall and
reinstall through the same host controls while preserving scope.

Then **confirm the new `version` + `gitCommitSha` landed** in the install registry — re-read it the
same way Detect did. If the install did not advance (still pinned to the old version), surface that as
a failure with the registry state, rather than reporting a false success.

**On every bump, regenerate the `at-hand-references-index`** — the always-on ref map is a pure
function of the on-demand reference set (each ref's `subject` + terse `read-when`, vendored + local
alike), and the vendored set may have changed with the plugin version. A stale index would leave the
floor's ref map wrong; regeneration is the bump's standing companion, not contract-gated.

**On every bump, re-materialize the analyzer wrapper and probe it under the real cron env.** The bump
ships a **new analyzer asset tree** at `<plugin>/scripts/analyzer`, so re-materialize the harness-local
`<harness-runtime-root>/sg-analyze.sh` — the same substitution `harness-init` performs at scaffold
(`@@ANALYZER_HOME@@` → the resolved absolute `<plugin>/scripts/analyzer`, the baked
`BAKED_ANALYZER_HOME` **assignment only**, the fail-closed survival guard's literal sentinel left
intact). Unlike scaffold's absent-only seed this is a **re-vend** — overwrite the materialized copy,
because the analyzer *source* moved with the version. Then **run a cron-equivalent negative probe**:
invoke the just-re-materialized wrapper over a tiny fixture under the **real scheduler environment** —
`env -i` (no inherited vars), cwd `/` — and require **exit 0**. This shares the **cron-fidelity
discipline** `validate`'s analyzer probe runs (Step 3b invokes `validate`), here over the
just-re-materialized wrapper: **green-in-harness is not sufficient** — a rich interactive env masks a
cron-only breakage (a surviving `@@ANALYZER_HOME@@` placeholder, a missing `analyze.ts`, a dropped
`../lib/` asset → `ERR_MODULE_NOT_FOUND`). A **non-zero probe exit is fail-closed**: surface the remedy
(re-run re-materialize, reinstall the plugin to re-ship the asset tree, or read the wrapper's
`analyze.log` for the captured runtime error) and **do not report a successful update over a broken
analyzer** — the consumer self-heals on the bump or fails loudly, never silently runs dark.
Bump-gated, not contract-gated.

### 3. Contract-drift

Compare the **new** `bindings-contract` **`Contract version:`** line (the just-installed plugin's
contract) against the version the harness **last bound against** (recorded in the `bindings.yaml`
header).

- If it **moved** → invoke **`harness-init bind`** then **`harness-init validate`**, so new or changed
  binding keys and the dial knobs (`bindings-contract` §dials — maturity · plan-policy ·
  stale-projection-policy · terminal-recorder) are reconciled and the harness re-passes its gate.
  The re-bind is what makes the new **always-on floor** actually load next session, not merely a key
  reconciliation: through it the crystallised **`git-policy`** surface is reconciled (a bump that
  moves `git-policy-schema` re-materializes an ABSENT map; a **present, operator-authored map is
  never clobbered** — the shape drift surfaces as a validate failure you flag and route to the
  operator to reconcile; git-policy is a crystallised surface linked off the floor, **not** a
  bindings dial) and the **`sg-root-instructions`** floor is
  re-vended and the root instruction projections **regenerated** from it (they carry the floor's
  content, so a new floor means new projections — there is no link to re-wire). The full git/devops doctrine
  lives in the harness's local `devops-loops` reference — the surface you re-materialize is only
  the thin crystallised map.
- If it is **unchanged** → say so and **skip** the re-bind — do not re-bind needlessly. (The read-only
  ambient-surface `validate` of Step 3b still runs every update — what is contract-gated is the *bind*,
  not the validate.)

The definition⇄instance pairs the drift check walks (`bindings-contract`⇄`bindings.yaml` ·
`git-policy-schema`⇄`git-policy` · the `deploy-config` values) include **optional,
conditionally-present** blocks — an unbound optional block (e.g. no `deploy-config` on a
non-deploying harness) is **not** drift; never report a false failure on a capability the harness
does not run.

### 3b. Ambient-surface sync (every run, state-based)

Independently of the contract check, **always invoke `harness-init`'s materialize operation**. Its
bundled lifecycle runner re-vends the floor into the one shared harness-runtime home, emits **one root
instruction projection per supported host** from one template model — each derived per the
`bindings-contract` §scaffolds recipe, one inlining the floor and the others importing it — refreshes the
**per-surface digest manifest** the drift check reads, preserves non-managed root content and shared
bindings, and removes only the retired carrier-argument hook from legacy settings. Then invoke
`harness-init validate`.

**This step is the floor drift's one enactment site.** Detection is available anywhere the digest
manifest is readable (`preamble` reports it at stage entry); repair happens here, because this is where
the materializer runs. A harness whose surfaces moved without regeneration is brought current by this
step without an operator having to know that is what happened.

This is **state-based, not version-gated**. A missing projection, stale floor, drifted digest manifest,
first migration, or managed projection drift repairs deterministically. Divergent root custom content or first-migration bindings
fails before writes and is surfaced for explicit reconciliation. An unchanged harness performs zero
writes. Never recreate a root projection or host-local payload in this skill; `harness-init` owns the
one materializer and one template.

### 4. Hand off

Print:

- The **changelog delta** since the installed version (the entries between the old and new versions —
  from the plugin / contract changelog), so the operator sees what changed.
- The **version + `gitCommitSha` landed** — the concrete state the install moved to — plus what the
  bump re-reconciled (the regenerated index; the re-materialized analyzer wrapper + its cron-probe
  result; the re-bind, when the contract moved).
- The **RESTART-REQUIRED** reminder: the new skill set loads only after the active host reloads its
  plugin/runtime context; until
  the operator restarts, the session is still running the old skills.

## Hard constraints

- **Carry no product literals.** Plugin name, marketplace name, scope, and registry path are resolved
  from the runtime + the bound source at run time — never hardcoded. The key set + format live in
  `bindings-contract`.
- **Runtime-registry + harness-local ops only.** You operate on the active host's plugin registry
  through its supported controls and, on a contract move, the harness-local `bindings.yaml` + the materialized
  band (through `harness-init`). You **never** mutate the vendored plugin or the factory.
- **No workflow-carrier writes.** You are a harness-lifecycle node, not a workflow gate — you never
  write a carrier's `lifecycle_state` / `gate_decisions[]` (`record-gate` is their single writer).
- **Idempotent.** Re-running when already current is a clean no-op — "up to date at vX.Y.Z", nothing
  mutated. Detect refreshes the cache before comparing so the no-op is honest, not a stale-cache
  false-positive.
- **Re-bind only on contract change.** `harness-init bind` runs **only** when the bindings-contract
  `status:` version moved — never on an unchanged contract. (The ambient-surface `validate` of Step 3b
  is separate and runs every update — see 3b. The index regeneration and the analyzer
  re-materialize + cron-probe are bump-gated, not contract-gated.)
- **Always surface restart + what landed.** Every non-no-op run ends with the version + `gitCommitSha`
  it landed on and the restart-required reminder; the operator is never left unsure whether the new
  skill set is live.

## Required references

Before taking any action, read these bundled references:

- [bindings-contract](references/bindings-contract.md)

## On-demand references

At the step of need, read these bundled references:

- [sg-root-instructions](references/sg-root-instructions.md)

