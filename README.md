# stack-graph

stack-graph is a graph-built engineering workflow for Claude Code and Codex. It carries work from
triage through shape, build, verification, landing, and debrief with durable work-item carriers,
explicit operator gates, and shared documentation standards.

This repository is the generated distributable. One authored graph produces one physical `skills/`
payload; the host manifests are thin projections around those same bytes.

## Compatibility contract

- Every runtime node is a skill with common `name` and `description` frontmatter.
- Context isolation is canonical graph policy; it does not create a second host-specific skill body.
- `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` share identity metadata and discover
  the same `skills/` directory.
- Shared instructions use ordinary Markdown links and bundle-relative executable paths.
- Script-owning skills carry their runners inside their own bundles.
- Harness runtime state lives under `.stack-graph/harness/`, not in duplicated host directories.

The Factory release gates reject a missing skill, manifest drift, duplicated host payload, stale
host syntax, or unresolved bundled reference.

## Prerequisites

- Claude Code or Codex with plugin support.
- [Bun](https://bun.sh) for bundled TypeScript/JavaScript runners and the optional analyzer.
- Python 3 for the carrier preflight runner.
- git. POSIX shell and cron are needed only for scheduled analytics.

## Install for Claude Code

```bash
claude plugin marketplace add hk121992/stack-graph-plugin
claude plugin install stack-graph@stack-graph
```

Restart Claude Code or reload plugins after installation. The skills appear under the
`/stack-graph:<skill>` namespace.

## Install for Codex

Codex installs plugins from a marketplace. Until this repository is listed in a shared Codex
marketplace, use a small local marketplace wrapper:

```bash
mkdir -p /absolute/path/stack-graph-marketplace/plugins \
  /absolute/path/stack-graph-marketplace/.agents/plugins
git clone https://github.com/hk121992/stack-graph-plugin.git \
  /absolute/path/stack-graph-marketplace/plugins/stack-graph
```

Create `/absolute/path/stack-graph-marketplace/.agents/plugins/marketplace.json`:

```json
{
  "name": "stack-graph-local",
  "interface": { "displayName": "Stack Graph local" },
  "plugins": [
    {
      "name": "stack-graph",
      "source": { "source": "local", "path": "./plugins/stack-graph" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

Then install it:

```bash
codex plugin marketplace add /absolute/path/stack-graph-marketplace
codex plugin add stack-graph@stack-graph-local
```

Start a new Codex task so the installed skill set is loaded.

## Initialise a workspace harness

Invoke `harness-init` in scaffold mode after installing the plugin. In Claude Code this is
`/stack-graph:harness-init scaffold`; in Codex, ask it to use stack-graph's `harness-init` skill in
scaffold mode. Confirm the workspace bindings, then invoke `harness-init` in validate mode.

Initialisation materialises:

- byte-identical root `CLAUDE.md` and `AGENTS.md` projections from one template;
- one shared `.stack-graph/harness/` home for bindings and the always-on floor;
- the bound carrier, dashboard, strategy, reference, and analytics surfaces.

Existing Claude-only or Codex-only harnesses migrate through the same materializer. Known legacy
managed prose and the retired carrier hook are removed; operator-authored root content and bindings
are preserved. Divergent custom roots or first-migration bindings fail before any write so the
operator can reconcile them explicitly. An unchanged rerun performs no writes.

Raise work by invoking `triage`. Gate decisions are collected in the active host's session and
recorded by the bundled `record-gate` runner; no host hook writes lifecycle state.

## Update

For Claude Code:

```bash
claude plugin update stack-graph@stack-graph
```

Then restart/reload the session.

For the local Codex route above:

```bash
git -C /absolute/path/stack-graph-marketplace/plugins/stack-graph pull --ff-only
codex plugin add stack-graph@stack-graph-local
```

Start a new Codex task after reinstalling. In either host, invoke `harness-update` after the plugin
bump; it re-materialises the shared floor/root projections, validates bindings, and changes nothing
when the harness is already current.

## Layout and ownership

- `skills/` — the shared workflow and specialist skills, with owned runners and reference bundles.
- `references/` — shared on-demand doctrine.
- `floor/` — the always-on core materialised by the harness lifecycle.
- `scripts/analyzer/` and `scripts/lib/` — optional transcript-derived analytics.
- `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` — generated host manifests.
- `.claude-plugin/marketplace.json`, this README, and `LICENSE` — repository-owned release files.

Do not hand-edit generated content. Changes originate in the Factory graph or generator and arrive
here as a deterministic release cut. Bug reports and proposals belong in this repository's issue
tracker.

## Licence

MIT — see [LICENSE](LICENSE).
