---
subject: sg-tag-registry
title: sg-tag registry — the closed <sg-*> member contract
provenance: vendored
level: L2
cadence: on-demand
read-when: "Emitting, capturing, or conforming an <sg-*> process tag."
reviews-on: sg-tag-registry-source
last-reviewed: unset
entropy: unmeasured
status: drafted
related: [sg-root-instructions]
---

# sg-tag registry — the closed <sg-*> member contract

The closed registration home for the `<sg-*>` process-tag family. The always-on floor
([sg-root-instructions](sg-root-instructions.md)) states the emission contract — which members a
turn emits, and when; this registry fixes the **capture contract** — each member's fields, bounds,
source rule, and emitter class — as one machine-readable definition every code twin conforms to.
Emission contract and capture contract move together, so a live tag and its derived row never
drift apart.

The family is **closed**: six members, no more. Five are **model-emitted** (an agent writes them
as paired tags in assistant text); one — `sg-gate` — is **script-emitted** (the record-gate runner
appends it, accepted only with executed-runner provenance). An unlisted member name, or a listed
member carrying out-of-bounds values, captures **nothing** — it fails a gate and drops.

## The member block {#member-block}

The fenced JSON block below is the **sole machine-readable surface**. The factory conformance suite
parses it and asserts **bidirectional set equality with exact member count** against the analyzer's
code twins (the scan registry, the schema projector, the publisher re-enforcement twins). Edit it as
**data, not prose** — a member added, renamed, or re-fielded here without the matching twin edit
fails the suite.

```json
{
  "members": [
    {
      "member": "sg-decision",
      "fields": ["kind", "subject"],
      "bounds": "kind: closed enum; subject: bounded token",
      "source-rule": "the model, on any turn, when a load-bearing decision is settled; also recorded durably via log-decision",
      "emitter-class": "model"
    },
    {
      "member": "sg-open-item",
      "fields": ["id", "status", "kind"],
      "bounds": "id: collection-unique correlation id; status: open|closed; kind: closed enum",
      "source-rule": "the model, on any turn, when an out-of-scope deferral needs closure; paired-close on an identical id, an attended same-collection turn only",
      "emitter-class": "model"
    },
    {
      "member": "sg-friction",
      "fields": ["kind", "severity", "description", "target"],
      "bounds": "kind: closed enum; severity: closed enum; description: <20 words, sanitised (control-char strip, markup neutralised); target: upstream|local",
      "source-rule": "the model, on any turn, when the doing is impeded — a missing or failed tool, a denial, or an operator correction",
      "emitter-class": "model"
    },
    {
      "member": "sg-conflict",
      "fields": ["kind", "description", "paths"],
      "bounds": "kind: closed enum; description: <20 words, sanitised; paths: relative-only (no parent-escape, no absolute, no scheme), list + entry caps",
      "source-rule": "the model, on any turn, when the context contradicts or confuses",
      "emitter-class": "model"
    },
    {
      "member": "sg-operator-action",
      "fields": ["id", "status"],
      "bounds": "id: collection-unique correlation id; status: open|closed",
      "source-rule": "the model, on any turn, when an operator-only obligation stands; paired-close on an identical id, an attended same-collection turn only",
      "emitter-class": "model"
    },
    {
      "member": "sg-gate",
      "fields": ["gate", "decision", "carrier", "seq"],
      "bounds": "gate: closed enum; decision: closed enum; carrier: normalised carrier id (ID_RE); seq: integer",
      "source-rule": "the record-gate runner, on a successful enactment only (never on a rejection); accepted only with executed-runner provenance — tool_use/tool_result id pairing plus an executed-argv-anchored command match",
      "emitter-class": "script"
    }
  ]
}
```

## Reading the block {#reading}

Each member entry carries five attributes:

- **`member`** — the exact tag name (without angle brackets); the scan keys on it verbatim.
- **`fields`** — the closed key set of the tag body. The set is load-bearing: the conformance suite
  set-compares it against the code twins.
- **`bounds`** — the per-field gates. Closed enums (`kind`, `severity`, `target`, `status`, `gate`,
  `decision`) reject any out-of-enum value; the bounded free-text field (`description`) is
  length-capped and sanitised at the capture boundary (control-char strip, markup neutralised); the
  token fields (`subject`, `id`, `carrier`) carry a restricted grammar that excludes control
  characters and markup; `paths` is relative-only with list and entry caps; `seq` is an integer.
- **`source-rule`** — the allowed producer and occasion. This is the provenance gate: a member is
  captured only from the class that owns it.
- **`emitter-class`** — `model` or `script`. **`model`** members are paired tags in assistant text,
  captured on any turn. **`script`** members (`sg-gate`) are captured only from a
  provenance-bound tool_result — an executed runner, never a prose echo, a file read of this
  reference, a fixture, or an external issue.

## Format example — non-conforming by construction {#example}

This reference is `on-demand` (pulled at need), never always-on, and it carries **no conforming
tag**. The example below shows the paired-tag *shape* while failing **every** gate — a non-member
name, out-of-enum values, an over-length marked-up description, and rejected path tokens — so a read
or echo of it captures nothing:

```text
<sg-example>{"kind":"NOT-AN-ENUM","severity":"P9","description":"this illustrative body deliberately runs well past the twenty word cap and carries <b>markup</b> so the length gate and the sanitiser both reject it outright right here","target":"sideways","paths":["../secret","/etc/passwd","https://x"]}</sg-example>
```

A conforming instance is never committed anywhere — tests construct one at runtime from
non-conforming fragments, and the gate channel's tag comes from executing the real runner.

## Cite out {#cite-out}

- **The emission contract** — which members a turn emits, and the paired-close / attended
  same-collection close rule → [sg-root-instructions](sg-root-instructions.md).
- **`sg-decision`'s durable record** — the two-layer decision write → [decisions-schema](decisions-schema.md).
- **`sg-gate`'s runtime** — the gated lifecycle and the enactment the runner records → [gate-model](gate-model.md).
- **`sg-friction`'s `severity` vocabulary** → [severity-scale](severity-scale.md).
- **Term** senses (member, provenance, collection) → [glossary](glossary.md).
