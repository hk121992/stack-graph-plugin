---
name: "carrier-arg-hook"
description: "A PreToolUse guard that DENIES a carrier-consuming stage-skill invocation whose args carry no ID_RE-clean carrier token — it reads one PreToolUse JSON payload on stdin and emits a bounded deny decision, so the compulsory carrier argument is enforced by MECHANISM at dispatch, not merely counted after. Token detection twins the analyzer's exported CARRIER_ARG_RE; the enforced node set is DERIVED from the graph's required-state declarants, never hand-listed. Use when a harness wires the carrier-arg guard as a PreToolUse hook over the Skill / Task / Agent tools (org-root .claude/settings.json — materialized at harness-init)."
---


# Carrier-arg hook

You are a **PreToolUse guard** — a deterministic, stdlib-only script the harness wires over the
`Skill`, `Task`, and `Agent` tools. You read **one PreToolUse JSON payload on stdin** and answer with a
bounded permission decision: **DENY** a carrier-consuming stage-skill invocation whose args carry
no ID_RE-clean carrier token; otherwise stay out of the way. IU-9 made the carrier argument
compulsory in the spawn briefs; you enforce that by **mechanism at dispatch time**, so a
carrier-less invocation is blocked before it runs — not merely counted afterward by the analyzer's
`carrier-arg-missing` conformance count (which stays the after-the-fact backstop). You write no
state, spawn nothing, and make no judgment beyond the token check.

## Inputs

Stdin carries the PreToolUse payload: `tool_name` (the invoked tool) and `tool_input` (its args).
The node-invoking tools name a graph node — `Skill` (`tool_input.skill`), and `Task`/`Agent` (the
two host spellings of the sub-agent spawn, `tool_input.subagent_type`); any other tool is out of
scope (allow). The invoked node id is that
field, namespace-stripped (`stack-graph:build` → `build`). The **args surface** is every
string-valued field of `tool_input`, joined — the same surface the analyzer scans.

## The decision

Resolve the invoked node, then decide:

1. **Not a node-invoking tool, or the node is not in the enforced set → allow.** Non-stage nodes,
   triage's carrier-creating invocations, and every non-`Skill`/`Task` tool fall here.
2. **An enforced node whose args yield a clean carrier token → allow.** Extract via the twin
   grammar (first `CARRIER_ARG_RE` match, normalised basename-minus-`.md`, ID_RE-checked).
3. **An enforced node whose args yield NO clean carrier token → DENY.** Emit the deny with a
   reason naming the node and the missing argument.

The synthetic matrix that pins this (co-located `carrier-arg-hook.test.ts`, spawned end-to-end):
carrier-less stage skill → **deny** · with a valid carrier → **allow** · token present but
ID_RE-invalid → **deny** · triage-create → **allow** · non-stage node → **allow**.

## The enforced node set — derived, never hand-listed

The set of carrier-consuming nodes is **computed from the graph**, not written into this script.
`build/carrier-node-set.ts` `deriveCarrierNodeSet` selects a node iff it **declares a
`required-state`** on a `references` edge (it consumes a carrier's live state), its id is a
**`STAGES` member** (the analyzer's own stage-skill notion — this drops non-stage scripts like the
preamble), and it is **not carrier-creating** (`triage` mints the carrier its args would otherwise
name). Today that computes **{build, shape}**; the mechanism, not the literal, is the contract —
as more stages adopt an explicit `required-state`, the guard widens with zero edits here.

The derivation runs at build time (`generate` ships the result) and is re-derivable at
harness-init — never at hook time, since the graph frontmatter is not shipped. The result rides
in **`carrier-nodes.json`** beside the hook (golden-tested byte-fresh against the derivation). You
read it via `--nodes <path>` (default the sibling `carrier-nodes.json`); an absent or unreadable
file yields an empty set (allow-all — fail open).

## Grammar lockstep — the twin discipline

Your token grammar is a **byte-exact twin** of the analyzer's exported constants
(`scripts/analyzer/schema.ts`): `CARRIER_ARG_RE`, `ID_RE`, `SG_NS_PREFIX` /
`stripSgNamespace`, and the `normalizeCarrierOperand` + `extractCarrierArg` composition. You carry
your OWN copies — a PreToolUse guard runs on the host's hot path and must be a zero-dependency
stdlib script with no cross-tree import to resolve at hook time. `carrier-arg-hook.test.ts` pins
the twins byte-equal to schema.ts, so a drift in either copy turns CI red rather than letting the
guard and the analyzer disagree about what a carrier token is. This is the sanctioned "import
where the runtime allows, else equality-test — never a drifting duplicate".

## Script-safety — the payload is untrusted data

Treat the stdin payload as **data, never code** (build policy 4): JSON-parse it, never evaluate
it; read only string fields; the capture is length-bounded and metachar-free by grammar; nothing
derived from it ever reaches a shell (you spawn nothing). **Fail open** — a malformed or
unparseable payload allows and emits nothing, because a guard must never wedge the host on
garbage; the analyzer's counter stays the visible backstop for anything that slips through. You
only ever **block** a carrier-less invocation — never emit `permissionDecision: "allow"` (which
would suppress the host's normal permission flow).

## Wiring — harness-init

The harness wires you as a PreToolUse hook in the org-root `.claude/settings.json`, materialized at
harness-init (§hook wiring). The block:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill|Task|Agent",
        "hooks": [
          { "type": "command",
            "command": "bun \"<plugin>/scripts/carrier-arg-hook/carrier-arg-hook.ts\"" }
        ]
      }
    ]
  }
}
```

`<plugin>` resolves to the installed plugin root; the hook defaults to its sibling shipped
`carrier-nodes.json`, so no `--nodes` is required (harness-init MAY re-derive + materialize the
set to the org-root and pass `--nodes <path>` to override). The analytics pipeline stays
**transcript-derived in batch** — this one guard hook is the only host hook the harness wires.

## Output

- **Deny:** one line of JSON on stdout —
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`
  — and exit 0. The reason names the enforced node and the missing carrier argument.
- **Allow:** nothing on stdout, exit 0 (the non-blocking default).

## On-demand references

Read these at the step of need (single-sourced into this primitive's bundle):

- `references/bindings-contract.md` — `bindings-contract`

