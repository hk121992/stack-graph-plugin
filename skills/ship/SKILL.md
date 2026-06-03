---
name: "ship"
description: "Run the test suite, enforce the coverage gate, bump the version (if configured), commit the staged changes, and open a pull request — ending when the PR is open and ready. Invoked by land; also standalone. Use when: A change is ready to move from a working implementation to a pull request — tests should pass, coverage gate should hold, and a PR should be opened for review and downstream merge/deploy."
---


# Ship

You are the `ship` sub-arc — the **first step of the land sequence**. You take a
working implementation and turn it into an **open pull request**: tests pass, the
coverage gate holds, the change is committed, and the PR is open for review. You end
when the PR is open and its URL is reported. You do **not** merge, deploy, or confirm
health — those belong to `deploy` and `canary`, which follow in the land sub-arc.

You are **general and harness-agnostic**. Test commands, the coverage threshold, the
version strategy (semver patch/minor/major, or no bump), and the target branch are all
**harness-supplied** — read them from the harness overlay before running. You carry no
product's toolchain or paths.

You are **standalone-capable**: operators may invoke you directly, outside the `land`
backbone stage, whenever a change is ready to PR. When invoked standalone, treat the
harness overlay as your configuration source exactly as you would inside `land`.

The `land` backbone stage invokes you as its first step. Once you surface the PR URL,
`deploy` takes over (the `ship → deploy → canary` sequence is the land sub-arc; the
exact handoff prose is in the `land` node — `deploy` is authored in the same wave and
will be edged into `land` once both nodes exist).

## You do not write the carrier

You read the carrier (the work-item) for context only — its `lifecycle_state`, the
commit-to-land gate decision that cleared before `land` invoked you — and you do not
write any carrier field. Your completion is the signal: the PR URL is the artefact that
`deploy` (and the operator) observe as your output. Stage projection and gate
bookkeeping are the carrier layer's concern, not yours.

## Preflight

Before running, confirm:

1. **Harness configuration is reachable.** Read the harness overlay: test command(s),
   coverage threshold, version strategy (semver patch/minor/major, or "no bump"),
   target branch, and PR tooling (e.g. `gh`). If any required field is missing, surface
   the gap to the operator and stop — do not proceed with assumed defaults.
2. **Working tree state.** The working tree should be clean or have staged changes that
   represent the change to ship. Surface any unstaged changes and confirm with the
   operator before proceeding.
3. **PR tooling authenticated.** Confirm PR tooling (e.g. `gh auth status`) is
   authenticated. Abort and surface the auth error if not.

## Phase 1 — Run the test suite

Run the test suite using the harness-configured command. Report the result:

- **Pass** — proceed to Phase 2.
- **Fail** — surface the failure output to the operator. Do **not** proceed to commit
  or PR. Ask: "Tests failed — fix and re-invoke ship, or abort?" The operator decides.
  If the failure warrants a return to `build` or `reconcile`, name it — you do not
  invoke those stages yourself, but you can recommend the arc re-entry path.

## Phase 2 — Enforce the coverage gate

Compute the coverage delta against the harness-configured threshold. Report:

- **Gate holds** (coverage at or above threshold, or no regression) — proceed to
  Phase 3.
- **Regression** — surface the delta and the specific files/lines below threshold.
  Ask: "Coverage gate failed — fix the coverage gap and re-invoke ship, or proceed
  anyway (override)?" The operator decides. **Do not silently proceed past a coverage
  regression** — every override is explicit and logged.

## Phase 3 — Bump the version (if configured)

If the harness overlay specifies a version bump strategy:

1. Determine the bump level (`patch`/`minor`/`major`) from the overlay or the operator's
   instruction (if passed as an argument).
2. Apply the bump to the version file(s) the overlay names (e.g. `package.json`,
   `pyproject.toml`). Stage the version bump.
3. Report the old and new version numbers.

If the overlay specifies "no bump" or is silent on versioning, skip this phase entirely.

## Phase 4 — Commit

Author a **descriptive commit message** from the staged diff and any context the
operator has provided (the work-item title, the design doc pointer, key decisions).
Follow the project's commit convention (read from the harness overlay if specified;
otherwise use the `<type>: <summary>` convention).

Present the draft commit message to the operator for confirmation. On confirmation,
commit the staged changes. Report the commit SHA.

**Checkpoint discipline:** if the change is large, the checkpoint has already happened
incrementally during `build`. The ship commit is the **delivery commit** — the one that
opens the PR. It should be clean (not a WIP stash). If there are WIP commits in the
history that should be squashed before the PR opens, surface them to the operator and
squash on confirmation.

## Phase 5 — Open the pull request

Author a **PR description** from:

- The commit history (since the base branch diverged), summarising what changed and why.
- The work-item context (the carrier's `outcome_link` and title, if available via the
  overlay).
- Key decisions or trade-offs the reviewer should know about.

Present the draft PR title and body to the operator. On confirmation, open the PR
against the harness-configured target branch using PR tooling. Report the **PR URL**.

**PR description discipline:** the description should let a reviewer judge the change
without reading the full diff. Include: a one-sentence summary of what changed; the
rationale (why); any notable trade-offs or deferred items; a test plan (what the
reviewer should verify). This is the minimum — add more if the change is large or has
nuance.

## Output

- **Test results** summary (pass/fail, duration).
- **Coverage delta** (current vs threshold; any files below gate).
- **Version bump** (old → new, or "no bump").
- **Commit SHA**.
- **Pull request URL** (the primary deliverable — what `deploy` and `land` observe as
  ship's completion signal).

If any phase fails, ship stops at that phase and surfaces the failure — it does not
partially complete a later phase.

## Modes

Ship does not have named modes in the standard sense. The three configuration axes —
test command, version strategy, and target branch — are harness-supplied, not mode
branches. The body above covers all configurations through its preflight + phase
structure. A future `headless` mode (no operator confirmations, CI-style) may be added
via `amend` if the need is validated.
