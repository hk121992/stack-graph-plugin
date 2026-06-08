---
# identity — native .claude (the builder emits the primitive from these)
id: ship
primitive: skill
title: Ship
description: Run the test suite, enforce the coverage gate, bump the version (if configured), commit the staged changes, and open a pull request. Invoked by land; also standalone.
when-to-use: A change is ready to move from a working implementation to a pull request — tests should pass, coverage gate should hold, and a PR should be opened for review and downstream merge/deploy.
# classification — graph lens
mode: collaborative
determinism: generative
# edges — the graph (scanned from here into the record)
edges:
  invokes:       []
  loads:         []
  references:
    - { id: pr-description-shape, load: on-demand }
    - { id: carrier-interface,   load: on-demand }
  composes-into: []
  can-follow:    []
  precedes:      []
# analytics — the loop
goals:
  - outcome: Every change lands as a PR with tests passing and coverage gate held, not as a direct push.
    metric: PRs opened via ship as % of all changes landing; test failures caught before PR open (not discovered at CI).
    earns-keep: Direct pushes to main trend to zero; pre-PR test failure rate above baseline triggers review of the test discipline.
  - outcome: The commit and PR description give reviewers enough context to judge the change without reading the diff in full.
    metric: Downstream review rework attributable to a missing or unclear PR description; operator-reported "can't tell what this is" rates.
    earns-keep: PR-description rework rate trends down; reviewers close without requesting context clarification.
  - outcome: Coverage regressions are surfaced at ship, not discovered post-merge.
    metric: Coverage delta reported per PR; regressions blocked before the PR opens.
    earns-keep: Coverage regressions reaching main trend to zero over N sprints.
status: v0.3.0 — 2026-06-04
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

## Confirmation model — auto-proceed by default, halt only at gates

You are **collaborative**, but collaborative does not mean confirm-every-step. The default is
**auto-proceed**: run each phase, present its result, and move on **without waiting** unless
the operator intervenes. Reserve a halt-and-wait gate for the few decisions that are genuinely
the operator's:

- **Operator gates (halt and wait):**
  - A `minor` or `major` version bump (a `patch` bump auto-proceeds).
  - A coverage-gate **regression** — present the delta and the override choice, then wait.
  - A **test failure** — surface and wait; never proceed to commit or PR.
  - An **unstaged working tree** at preflight — surface and wait.
- **Auto-proceed (present and continue):** the test run on pass, the coverage report when the
  gate holds, the WIP squash, the version `patch` bump, the drafted commit message, and the
  drafted PR title + body. Present each, then proceed — the operator can interrupt, but you do
  not block on a confirmation.

Each phase below names its mode. This keeps the collaborative gates that matter while removing
the every-step ceremony. (A pre-PR code-review pass is **not** a ship gate — review is the
upstream `review` backbone stage that runs before `land` invokes ship; ship does not re-run it.)

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

- **Pass** (auto-proceed) — report the summary and continue to Phase 2 without waiting.
- **Fail** (gate) — surface the failure output to the operator. Do **not** proceed to commit
  or PR. Ask: "Tests failed — fix and re-invoke ship, or abort?" The operator decides.
  If the failure warrants a return to `build` or `reconcile`, name it — you do not
  invoke those stages yourself, but you can recommend the arc re-entry path.

## Phase 2 — Enforce the coverage gate

Compute the coverage delta against the harness-configured threshold. Report:

- **Gate holds** (auto-proceed) — coverage at or above threshold, or no regression.
  Report the delta and continue to Phase 3 without waiting. (Keep the delta — Phase 6
  carries it into the PR body.)
- **Regression** (gate) — surface the delta and the specific files/lines below threshold.
  Ask: "Coverage gate failed — fix the coverage gap and re-invoke ship, or proceed
  anyway (override)?" The operator decides. **Do not silently proceed past a coverage
  regression** — every override is explicit and logged.

## Phase 3 — Bump the version (if configured)

If the harness overlay specifies a version bump strategy:

1. Determine the bump level (`patch`/`minor`/`major`) from the overlay or the operator's
   instruction (if passed as an argument).
2. **Gate on the level.** A `patch` bump auto-proceeds. A `minor` or `major` bump is an
   operator gate — present the proposed level and the resulting version, and wait for
   confirmation before applying (a major/minor bump is a release decision, not a mechanical step).
3. Apply the bump to the version file(s) the overlay names (e.g. `package.json`,
   `pyproject.toml`). Stage the version bump.
4. Report the old and new version numbers.

If the overlay specifies "no bump" or is silent on versioning, skip this phase entirely.

## Phase 4 — Squash WIP checkpoint commits

The `build` stage uses continuous checkpointing, so the branch may carry `WIP:`-prefixed
commits. The delivery commit must open a **clean** PR — no `WIP:` commits in the history. This
phase detects and squashes them **before** the delivery commit. It auto-proceeds (no-op when no
WIP commits exist); the only halt is the anti-footgun abort below.

1. **Detect.** List the commits on the branch ahead of the harness-configured base
   (`git log <base>..HEAD`). Identify the `WIP:`-prefixed commits.
   - **None** — nothing to squash; auto-proceed to Phase 5.
2. **Choose the squash path by branch shape:**
   - **WIP-only** (every commit ahead of base is `WIP:`) — soft-reset to the base
     (`git reset --soft <base>`), which preserves the working tree and staged changes for the
     single delivery commit in Phase 5.
   - **Mixed** (WIP and non-WIP commits interleaved) — do an interactive-equivalent rebase that
     squashes **only** the `WIP:` commits into their adjacent logical commit, preserving every
     non-WIP commit and its message. Never collapse a non-WIP commit into a WIP squash.
     **Clear the index first:** a rebase refuses to run with a dirty tree, and Phase 3 may have
     staged a version bump. Stash before, restore after — `git stash push --include-untracked`,
     rebase, `git stash pop` — so the staged bump and any delivery changes survive into the
     Phase 5 commit. (The WIP-only soft-reset path needs no stash — it preserves the index.)
3. **Anti-footgun guards (non-negotiable):**
   - **Never** blind `git reset --soft` past a non-WIP commit — that destroys delivered work.
     A soft-reset is only valid when the branch is WIP-only.
   - **Confirm the base** before resetting (the base the overlay names is the reset target —
     verify it, do not assume `main`).
   - If the WIP/non-WIP boundary is **ambiguous** (e.g. a non-WIP commit sits below a WIP commit
     you would have to reset past), **abort to the operator** with the commit list and the
     proposed plan — do not guess. This is the one halt in this phase.

After squashing, the working tree holds the change to deliver as one clean commit in Phase 5.

## Phase 5 — Commit

Author a **descriptive commit message** from the staged diff and any context the
operator has provided (a work-item's title + design-doc pointer, or a standalone-iu's `goal` +
`improves` target — branch on `carrier_kind`; key decisions).
Follow the project's commit convention (read from the harness overlay if specified;
otherwise use the `<type>: <summary>` convention).

Present the draft commit message and **auto-proceed** — commit the staged changes unless the
operator intervenes. Report the commit SHA. This is the **delivery commit** — the clean commit
that opens the PR (WIP checkpoints were squashed in Phase 4).

## Phase 6 — Open the pull request

Author a **PR description** that is a **delivery record** — it carries the verification evidence
the earlier phases already produced, not just a human-facing summary. Read the
`pr-description-shape` reference for the canonical body shape, then compose:

- **`## Summary`** — what is shipping, in one or two sentences, from the commit history since
  the base diverged (what changed and why).
- **`## Trigger`** — the carrier context, branching on `carrier_kind` (via `carrier-interface`):
  a **work-item** contributes its `outcome_link` + title (via the overlay if available); a
  **standalone-iu** has no `outcome_link`, so use its `improves` target + the slice `goal` —
  why this is shipping now.
- **`## Recommended decision`** — merge this PR; state any notable trade-off or deferred item
  the reviewer should weigh, as a recommendation (not an open question).
- **Verification evidence** — fold in the evidence ship already has at hand, so the reviewer
  does not re-derive it: the **test-suite result** (Phase 1) and the **coverage delta** (Phase 2,
  including any logged override). Add a short **test plan** (what the reviewer should verify).
- **`## Read set`** — the files/areas this change touches, bounding its scope.

For an **operator-facing change** (visible UI / CLI / API behaviour), optionally capture
evidence (a screenshot or a link) if the harness supplies a capture path. A harness may also
supply its own PR-description guide via the overlay — read it in addition to `pr-description-shape`.

Present the draft PR title and body and **auto-proceed** — open the PR against the
harness-configured target branch using PR tooling unless the operator intervenes. Report the
**PR URL**.

**PR description discipline:** the description should let a reviewer judge the change without
reading the full diff. The verification sections above are the floor — they make the PR a record
of what ship verified; add more if the change is large or has nuance.

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
structure, and already runs auto-proceed by default (see "Confirmation model" — only the
named gates halt). A future fully-unattended `headless` mode (drops even the named gates —
patch-only bumps, no override pause, CI-style) may be added via `amend` if the need is validated.
