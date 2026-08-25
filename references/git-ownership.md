---
subject: git-ownership
title: Git ownership — who performs each git act along the loop
provenance: vendored
level: L2
cadence: on-demand
read-when: "About to commit, branch, push, open a PR, merge, tear down, or revert inside the workflow."
reviews-on: git-ownership-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [git-policy-schema, handoff-prompt-convention]
---

# Git ownership

The role axis: one git act per row, one owner each. Every git-writing node cites its row and restates nothing. WHO acts lives here; HOW the write graduates is [git-policy-schema](git-policy-schema.md)'s — orthogonal, cross-pointed.

## The role table {#roles}

| act | owner |
|---|---|
| slice commit | `build` — passing state only |
| worktree + branch; submodule-aware teardown | `dispatch` |
| merge to DEV | `dispatch` (prod-facing); single-main: no pre-gate merge — the PR waits for the gate |
| per-IU push + PR-open | the dispatched session, per its envelope (single-main: against `main`, left open) |
| integration PR | `verify` |
| remote-head delete | narrow per-IU authorization only: the merge to DEV authorises deleting that IU's own `iu/<carrier>` head, never a general remote-ref-delete grant |
| merge to main | `commit-to-land`'s enactment — `land` (single-main) / `deploy` (prod-facing); the gate records, never enacts |
| revert decision | `land` |

## Fail-closed push {#push}

push is gated by the target repo's declared pre-push checks (the dispatch envelope names the check home); a repo declaring none graduates pr-gated. Repo-specific mechanics stay repo-ambient — the target repo's own instruction surface, in neither axis.
