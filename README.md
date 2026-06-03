# stack-graph (plugin)

> The **factory**, as an installable Claude Code plugin. Models an agent operating
> environment as a graph of its `.claude` primitives — skills, agents, references — and
> the workflows that traverse them, then instruments and improves them through a
> PR-gated loop.

This repository is the **clean, public plugin surface**. It is **vendored** — every file
here is generated from the authored graph in the
[`stack-graph`](https://github.com/hk121992/stack-graph) factory by that repo's
`build/vendor.ts`. **Do not hand-edit.** Changes are made to the graph in the factory and
re-vendored; edits made directly here are overwritten on the next build.

`stack-graph` is the factory; a product (e.g. Be Civic) is what **runs inside it**. This
plugin is what a consuming workspace installs to get the factory's skills and agents.

## Layout

- `.claude-plugin/` — `plugin.json` (manifest) + `marketplace.json` (marketplace entry).
- `skills/<id>/SKILL.md` — the built skill primitives, each with a co-located
  `references/` bundle.
- `agents/<id>.md` — the built agent primitives; their shared references live under
  `references/<agent-id>/`.
- `hooks/`, `lib/` — reserved plugin surfaces (currently empty).

## Install

Install through Claude's native plugin/marketplace flow against this repository. The
consuming workspace **never mutates** vendored files — all customisation is an additive
local overlay (a *harness*), so native plugin-update applies cleanly.

## Source & development

The canonical source, the authoring/review tooling, and the build live in the factory:
**https://github.com/hk121992/stack-graph**. This repo is mounted there as a git
submodule at `stack-graph-plugin/`; the factory's vendor build writes into it.

## Licence

MIT.
