#!/usr/bin/env -S bun run
/**
 * record-gate.ts — the executable runner of `record-gate`: the SINGLE mechanical writer of a
 * carrier's `lifecycle_state` + append-only `gate_decisions[]` log.
 *
 * A firing gate node (triage · shape · verify · land · debrief · auto-shaper · dispatch) enacts a
 * lifecycle transition by DISPATCHING this runner (bun/node) with the gate inputs — it does NOT
 * hand-execute the procedure in its own session. The single-writer boundary is thereby held by an
 * actual separate writer (this code + the pinned canonical.ts), not by the firing session writing
 * on itself.
 *
 * CONTRACT (record-gate.md, unchanged — only the ENACTMENT moves to code):
 *   1. Check the FIVE preconditions; a non-compliant write is REJECTED — lifecycle_state and the
 *      log are left unchanged and the reason is surfaced (non-zero exit, stderr).
 *   2. On a compliant write, compute the chain link with the PINNED serialization
 *      (scripts/record-gate/deps/canonical.ts) — never re-implemented here — append
 *      the growth-only entry, and advance lifecycle_state to the gate's target (except the
 *      no-advance genesis: intent-to-build on a standalone IU appends seq 0, state untouched).
 *
 * SAFETY DISCIPLINE (the writer is the ONLY runtime backstop — the build-time guard never sees a
 * runtime-written carrier):
 *   · RECOMPUTE, DON'T TRUST — verifyChain(head) BEFORE extending it; refuse to grow a chain the
 *     runner cannot itself re-derive (an edit/reorder/replay of the head is caught here, not silently
 *     grown over).
 *   · seq from the head's OWN tail seq + 1 (never array length) — correct-by-construction contiguity.
 *   · GROWTH-ONLY, PRIOR ENTRIES VERBATIM — the existing `gate_decisions:` block text is preserved
 *     byte-for-byte; only the new entry's block is spliced in. No prior entry is re-serialised, so no
 *     authored field can be dropped and no value re-coerced.
 *   · Every emitted scalar is JSON-quoted — a caller-supplied field can never inject YAML structure
 *     or be re-read as a different type than the one that was hashed.
 *   · Closed enums — gate / decision-provenance / context / kind are validated against their
 *     enumerations; an unknown value REJECTS (fail-closed), never falls through to a permissive branch.
 *
 * This runner owns the carrier-frontmatter YAML read/write AROUND canonical.ts's pure-object core
 * (canonical.ts's header pins extraction as the caller's job): it reads via the vendored js-yaml
 * parser, and writes by TEXT SPLICE (preserve-and-append), never a whole-frontmatter re-dump.
 *
 * Runtime: bun/node. Deps: node stdlib + the vendored js-yaml (read-only) + the pinned canonical.ts.
 *
 * SHIPPING: the plugin carries no factory tree, so at emit time generate re-homes this file's
 * out-of-node import closure into `deps/` beside the vendored copy and rewrites the specifiers
 * (build/generate.ts, emitAsset) — the shipped runner is self-sufficient. Author against the
 * factory paths here; never hand-edit the shipped copy.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { load as loadYaml } from "./deps/js-yaml.mjs";
import {
  linkHash,
  verifyChain,
  GENESIS_PREV,
  type GateDecisionEntry,
} from "./deps/canonical.ts";

// ────────────────────────────────────────────────────────────────────────────
// Closed enums (record-gate.md) — validated, fail-closed. An unknown value REJECTS.
// ────────────────────────────────────────────────────────────────────────────

/** The five product-gate ids. Every gate id is a product gate (record-gate.md) ⇒ operator-attested;
 *  `decision_provenance: agent-auto` is structurally prohibited on ANY of them (precondition 1).
 *  A gate outside this set is malformed (precondition 5) — never silently written with no advance,
 *  which would also bypass the agent-auto ban (that ban keys on gate ∈ this set). */
const PRODUCT_GATES = new Set([
  "intent-to-build",
  "commit-to-build",
  "commit-to-land",
  "live-confirmed",
  "closeout",
]);

const PROVENANCE = new Set(["operator-attested", "agent-auto", "agent-provisional"]);
const CONTEXTS = new Set(["attended", "unattended"]);
const KINDS = new Set(["standalone-iu", "work-item"]);

// IU-6 (gate-channel-e2e) — the bounded carrier-id grammar for the `<sg-gate>` tag. Inlined here (not
// imported from the analyzer's schema.ts) so the shipped runner's out-of-node import closure stays
// minimal; it MATCHES the reader's ID_RE / normalizeCarrierOperand (scripts/analyzer/schema.ts)
// by construction — the reader RE-validates the emitted id against the same grammar, so the two need only
// agree on the ID_RE bound, not share a function. Ids ride the tag body as JSON values, so they are a
// locality boundary: bounded + metachar-free, never a free-text channel.
const CARRIER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Normalise the `--carrier` PATH operand to a clean carrier id for the `<sg-gate>` tag: basename minus
 *  `.md`, ID_RE-validated. Null — never a guessed/truncated id — when it does not normalise cleanly (a
 *  pathological path); the tag is then simply not emitted (the enactment still succeeded — the chain
 *  write is the record of truth, the tag is the derivable channel over it). A real carrier path always
 *  normalises. */
function carrierIdFromPath(carrierPath: string): string | null {
  const base = carrierPath.replace(/\/+$/, "").split("/").pop() ?? "";
  const id = base.endsWith(".md") ? base.slice(0, -".md".length) : base;
  return CARRIER_ID_RE.test(id) ? id : null;
}

/** The lifecycle_state a gate advances to (record-gate.md § five gates + the cascade). A no-advance
 *  case (the standalone-IU genesis) returns null — the state is left untouched. `gate` is validated
 *  to be a member of PRODUCT_GATES before this is called, so the default is unreachable. */
function targetState(gate: string, kind: string): string | null {
  switch (gate) {
    case "intent-to-build":
      // Two-faced by carrier kind: a grouping work-item advances idea → discovery; a standalone
      // IU records a NO-ADVANCE genesis (seq 0) — state untouched.
      return kind === "standalone-iu" ? null : "discovery";
    case "commit-to-build":
      return "committed";
    case "commit-to-land":
      // Per-IU in-delivery → shipped (`promote`); the reconcile write records an already-true
      // terminal transition on the same gate — it too lands at shipped.
      return "shipped";
    case "live-confirmed":
      return "live";
    case "closeout":
      // Terminal `shipped|live → closed` (decision `closed | promoted` — both land at `closed`).
      return "closed";
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Inputs — the gate inputs a firing node supplies on the command line.
// ────────────────────────────────────────────────────────────────────────────

interface Inputs {
  carrier: string;
  gate: string;
  decision: string;
  decisionProvenance: string; // operator-attested | agent-auto | agent-provisional
  owner: string;
  context: string; // attended | unattended
  kind: string; // standalone-iu | work-item (drives the no-advance genesis; required for intent-to-build)
  evidence: string[];
  confidence?: string;
  conditions?: string;
  override?: string;
  timestamp?: string;
}

function parseArgs(argv: string[]): Inputs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const all = (flag: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < argv.length - 1; i++) if (argv[i] === flag) out.push(argv[i + 1]);
    return out;
  };
  return {
    carrier: get("--carrier") ?? "",
    gate: get("--gate") ?? "",
    decision: get("--decision") ?? "",
    decisionProvenance: get("--decision-provenance") ?? "",
    owner: get("--owner") ?? "",
    context: get("--context") ?? "attended",
    kind: get("--kind") ?? "",
    evidence: all("--evidence"),
    confidence: get("--confidence"),
    conditions: get("--conditions"),
    override: get("--override"),
    timestamp: get("--timestamp"),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// The carrier frontmatter read (js-yaml, read-only) + the growth-only text splice.
// ────────────────────────────────────────────────────────────────────────────

interface Frontmatter {
  raw: string;
  block: string; // the frontmatter text between the --- delimiters
  bodyStart: number; // index in `raw` where the closing --- line begins ("\n---…")
  data: Record<string, unknown>; // js-yaml-parsed frontmatter (read-only)
}

function readFrontmatter(carrierPath: string): Frontmatter {
  // An unreadable carrier path (a directory, a permission failure — existsSync passes for both)
  // is a CONTRACTED rejection like every other precondition failure — reason on stderr, exit 1,
  // nothing written — never a raw stack trace.
  let raw = "";
  try {
    raw = readFileSync(carrierPath, "utf8");
  } catch (e) {
    reject(`cannot read carrier: ${e instanceof Error ? e.message : String(e)}`);
  }
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) reject(`carrier ${carrierPath} has no YAML frontmatter block`);
  const block = m![1];
  const data = (loadYaml(block) ?? {}) as Record<string, unknown>;
  const closeIdx = raw.indexOf("\n---", 3);
  return { raw, block, bodyStart: closeIdx + 1, data };
}

/** Serialise ONE new entry as a `gate_decisions[]` YAML list item. Every scalar is JSON-quoted
 *  (a JSON string is a valid YAML flow scalar): a caller-supplied value can neither inject YAML
 *  structure nor be re-read as a non-string type — so the value js-yaml parses back is byte-identical
 *  to the one the runner hashed. seq stays a bare integer (it is chain metadata, always numeric). */
function serialiseEntry(e: GateDecisionEntry): string {
  const q = (v: unknown) => JSON.stringify(String(v));
  const lines: string[] = [];
  lines.push(`  - seq: ${Number(e.seq)}`);
  lines.push(`    hash: ${q(e.hash)}`);
  lines.push(`    gate: ${q(e.gate)}`);
  lines.push(`    decision: ${q(e.decision)}`);
  if (e.decision_provenance) lines.push(`    decision_provenance: ${q(e.decision_provenance)}`);
  lines.push(`    owner: ${q(e.owner)}`);
  if (e.timestamp) lines.push(`    timestamp: ${q(e.timestamp)}`);
  const refs = e.evidence_refs as string[] | undefined;
  if (refs && refs.length > 0) {
    lines.push(`    evidence_refs:`);
    for (const r of refs) lines.push(`      - ${q(r)}`);
  }
  if (e.confidence) lines.push(`    confidence: ${q(e.confidence)}`);
  if (e.conditions) lines.push(`    conditions: ${q(e.conditions)}`);
  if (e.override !== undefined) lines.push(`    override: ${q(e.override)}`);
  if (e.pending_retro_ratification) lines.push(`    pending_retro_ratification: true`);
  return lines.join("\n");
}

/**
 * Growth-only text splice: preserve the existing `gate_decisions:` block VERBATIM and append the new
 * entry's block; set the `lifecycle_state:` scalar unless no-advance. Every other frontmatter line
 * and the whole body are byte-preserved. Because prior entries are never re-serialised, no authored
 * field can be dropped and no value re-coerced — the "no prior entry touched" invariant holds by
 * construction, and verifyChain over the result still accepts the untouched prefix.
 */
function writeCarrier(
  fm: Frontmatter,
  carrierPath: string,
  newEntry: GateDecisionEntry,
  hadEntries: boolean,
  newState: string | null,
): void {
  const lines = fm.block.split("\n");
  const out: string[] = [];
  let i = 0;
  let wroteGD = false;
  let wroteLS = false;
  const entryBlock = serialiseEntry(newEntry);
  while (i < lines.length) {
    const line = lines[i];
    if (/^gate_decisions\s*:/.test(line)) {
      if (hadEntries) {
        // A block list already: keep the key line + all its indented continuation VERBATIM, then
        // splice the new entry after the last continuation line.
        out.push(line);
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i])) {
          out.push(lines[i]);
          i++;
        }
        out.push(entryBlock);
      } else {
        // An empty/inline `gate_decisions: []` (or the key with no list): replace it with a block
        // list carrying the single new entry. Skip any inline-array remnant on the key line.
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i])) i++; // (defensive; none for `[]`)
        out.push(`gate_decisions:`);
        out.push(entryBlock);
      }
      wroteGD = true;
      continue;
    }
    if (newState !== null && /^lifecycle_state\s*:/.test(line)) {
      out.push(`lifecycle_state: ${newState}`);
      wroteLS = true;
      i++;
      continue;
    }
    out.push(line);
    i++;
  }
  // Defensive: a carrier missing the key entirely (real carriers always carry it).
  if (!wroteGD) {
    out.push(`gate_decisions:`);
    out.push(entryBlock);
  }
  if (newState !== null && !wroteLS) out.push(`lifecycle_state: ${newState}`);
  const rebuilt = `---\n${out.join("\n")}\n` + fm.raw.slice(fm.bodyStart);
  writeFileSync(carrierPath, rebuilt);
}

// ────────────────────────────────────────────────────────────────────────────
// The FIVE preconditions (record-gate.md § "Precondition — check before any write").
// A failure REJECTS (non-zero exit, reason surfaced) leaving the carrier unchanged.
// ────────────────────────────────────────────────────────────────────────────

function checkPreconditions(inp: Inputs, head: GateDecisionEntry[]): void {
  const attended = inp.context === "attended";

  // 5. Reject a malformed precondition FIRST — a missing/invalid gate, decision, provenance,
  //    context, kind, or chain head. Every free-string arg is validated against its closed enum:
  //    an unknown value fails closed here, so it can never fall through to a permissive branch
  //    (e.g. an unknown gate bypassing the agent-auto ban, or a mistyped context reading attended).
  if (!inp.gate) reject("malformed: missing --gate");
  if (!PRODUCT_GATES.has(inp.gate))
    reject(
      `malformed: --gate must be one of ${[...PRODUCT_GATES].join(" | ")} (got "${inp.gate}") — ` +
        `an unrecognised gate is refused, never written with no advance.`,
    );
  if (!inp.decision) reject("malformed: missing --decision");
  if (!PROVENANCE.has(inp.decisionProvenance))
    reject(
      `malformed: --decision-provenance must be ${[...PROVENANCE].join(" | ")} (got "${inp.decisionProvenance}")`,
    );
  if (!CONTEXTS.has(inp.context))
    reject(`malformed: --context must be attended | unattended (got "${inp.context}") — fail-closed on an unexpected value`);
  // `--kind` is required for intent-to-build (it selects the no-advance genesis vs the WI advance);
  // for the other gates it is unused, so an absent kind is fine there.
  if (inp.gate === "intent-to-build" && !KINDS.has(inp.kind))
    reject(
      `malformed: intent-to-build requires --kind standalone-iu | work-item (got "${inp.kind}") — ` +
        `the no-advance genesis vs the idea→discovery advance turns on it.`,
    );
  // The chain head must be a well-formed array (possibly empty) — enforced by the caller (main),
  // which rejects a non-array gate_decisions rather than coercing it. A defensive re-check:
  if (!Array.isArray(head)) reject("malformed: carrier gate_decisions is not a list");

  // RECOMPUTE, DON'T TRUST. Before any provenance/authority reasoning, refuse to extend a chain the
  // runner cannot itself re-derive: verifyChain over the existing head (edit/reorder/in-file replay
  // are caught here). A non-empty head that fails is a tampered or corrupt log — reject, never grow.
  if (head.length > 0) {
    const res = verifyChain(head);
    if (!res.ok) {
      reject(
        `precondition-5: the carrier's existing gate_decisions chain does not verify ` +
          `(${res.reason}${"at" in res ? ` at ${res.at}` : ""}) — refusing to append onto a ` +
          `tampered or corrupt head; the chain must be reconciled before a new gate is recorded.`,
      );
    }
  }

  // 1. A PRODUCT GATE can ONLY be recorded operator-attested. agent-auto is structurally prohibited
  //    on a product gate id (every gate is a product gate). The reconcile path uses `reconciled`
  //    with its reconciler's provenance — agent-auto is refused regardless.
  if (inp.decisionProvenance === "agent-auto") {
    reject(
      `precondition-1: gate \`${inp.gate}\` is a product gate — decision_provenance: agent-auto is ` +
        `structurally prohibited; a product-gate decision the operator did not attest must never reach the log.`,
    );
  }

  // 2 + 3. An UNATTENDED context has exactly two legal writes: the ancestry-reconcile record — a
  //    `commit-to-land` entry with `decision: reconciled` (record-gate.md scopes it to that gate) —
  //    and the agent-provisional commit-to-build carve-out hold (rule 3). Everything else from an
  //    unattended session is refused — we put no decision to an absent operator.
  if (!attended) {
    const isReconcile = inp.decision === "reconciled" && inp.gate === "commit-to-land";
    const isProvisionalHold =
      inp.decisionProvenance === "agent-provisional" && inp.gate === "commit-to-build";
    if (!isReconcile && !isProvisionalHold) {
      reject(
        `precondition-2: an unattended context may write only the ancestry-reconcile record ` +
          `(commit-to-land / reconciled) or the agent-provisional commit-to-build hold — refusing ` +
          `gate \`${inp.gate}\` / decision \`${inp.decision}\` / provenance \`${inp.decisionProvenance}\`.`,
      );
    }
  }

  // 3. The agent-provisional carve-out is ONLY the commit-to-build hold. Any other gate id with
  //    agent-provisional is refused (attended or not).
  if (inp.decisionProvenance === "agent-provisional" && inp.gate !== "commit-to-build") {
    reject(
      `precondition-3: decision_provenance: agent-provisional is admissible only for the ` +
        `commit-to-build carve-out hold — refusing gate \`${inp.gate}\`.`,
    );
  }

  // 4. The ratification guard: reject a commit-to-land `promote` while any prior entry on this
  //    carrier still carries an unresolved pending_retro_ratification. (Cross-carrier promotion-set
  //    ratification is the caller's to marshal; the writer enforces the on-carrier flag.)
  if (inp.gate === "commit-to-land" && inp.decision === "promote") {
    const unresolved = head.some((e) => e.pending_retro_ratification === true);
    if (unresolved) {
      reject(
        `precondition-4: a commit-to-land promote is blocked while an unresolved ` +
          `pending_retro_ratification remains on the carrier — ratify or drop it first.`,
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Enact: compute the chain link (pinned canonical.ts), append, advance the state.
// ────────────────────────────────────────────────────────────────────────────

function enact(inp: Inputs, fm: Frontmatter, head: GateDecisionEntry[]): void {
  // seq + prevHash from the head's OWN tail (never array length) — with verifyChain(head) already
  // asserting contiguity, the tail's seq + 1 is the one correct next seq.
  const tail = head.length > 0 ? head[head.length - 1] : null;
  const prevHash = tail ? String(tail.hash) : GENESIS_PREV;
  const seq = tail ? Number(tail.seq) + 1 : 0;

  // The entry's CONTENT (seq + hash are chain metadata, bound separately by linkHash).
  const entry: GateDecisionEntry = {
    seq,
    hash: "",
    gate: inp.gate,
    decision: inp.decision,
    decision_provenance: inp.decisionProvenance,
    owner: inp.owner || "operator",
    timestamp: inp.timestamp || new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  if (inp.evidence.length > 0) entry.evidence_refs = inp.evidence;
  if (inp.confidence) entry.confidence = inp.confidence;
  if (inp.conditions) entry.conditions = inp.conditions;
  // `override` is a chain-bound content field (gate-model / record-gate.md Inputs). Plumb it so an
  // override-carrying entry is hashed WITH it — a later hand-added override would break verifyChain
  // (canonical() binds every non-meta key), so the writer must own it here.
  if (inp.override !== undefined) entry.override = inp.override;
  // The agent-provisional hold also sets pending_retro_ratification (record-gate.md rule 3).
  if (inp.decisionProvenance === "agent-provisional") entry.pending_retro_ratification = true;

  // Compute the chain link with the PINNED serialization — writer and guard share ONE function so
  // the stated chain and the checked chain cannot drift. Never re-implement it here.
  entry.hash = linkHash(entry, prevHash);

  const newState = targetState(inp.gate, inp.kind);
  writeCarrier(fm, inp.carrier, entry, head.length > 0, newState);

  // Surface the enacted record to the caller (stdout — the firing node reads it).
  const stateNote = newState === null ? "(no-advance genesis)" : `lifecycle_state → ${newState}`;
  process.stdout.write(
    `record-gate: enacted \`${inp.gate}\` / \`${inp.decision}\` — seq ${seq}, hash ${entry.hash.slice(0, 12)}…, ${stateNote}\n`,
  );

  // IU-6 (gate-channel-e2e) — on a SUCCESSFUL enactment only, append the bounded `<sg-gate>` tag. This
  // reaches here ONLY past every precondition (reject() exits first), so a refused write emits no tag —
  // the tag and the enactment are one boundary. The analyzer's gate scanner accepts this tag ONLY when
  // it appears in the tool_result of an EXECUTED-runner Bash tool_use (executed-argv-anchored provenance);
  // a prose echo, a mention-only command, or a non-runner tool_result can never mint a gate-enactment
  // row. Bounded, strict single-line JSON: gate (a validated product gate), decision, carrier (the id
  // normalised from the PATH operand — never the raw path), seq (the chain integer). Emitted only when
  // the carrier path normalises to a clean id (the tag needs a bounded carrier); a pathological path
  // still enacts (the chain is the record of truth), it just carries no tag.
  const carrierId = carrierIdFromPath(inp.carrier);
  if (carrierId !== null) {
    process.stdout.write(
      `<sg-gate>${JSON.stringify({ gate: inp.gate, decision: inp.decision, carrier: carrierId, seq })}</sg-gate>\n`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────

/** Reject a non-compliant write: surface the reason on stderr, exit non-zero, WRITE NOTHING. */
function reject(reason: string): never {
  process.stderr.write(`record-gate: REJECTED — ${reason}\n`);
  process.exit(1);
}

function main(): void {
  const inp = parseArgs(process.argv.slice(2));
  if (!inp.carrier) reject("malformed: missing --carrier");
  if (!existsSync(inp.carrier)) reject(`carrier not found at ${inp.carrier}`);

  const fm = readFrontmatter(inp.carrier);
  const gd = fm.data.gate_decisions;
  // A PRESENT-but-non-array gate_decisions is a malformed/corrupt carrier — reject (precondition 5),
  // never coerce it to [] and silently overwrite (that would discard the corrupt value with data
  // loss on a path the contract says must reject). Absent ⇒ genuinely empty.
  if (gd !== undefined && gd !== null && !Array.isArray(gd)) {
    reject("precondition-5: carrier gate_decisions is present but not a list — a malformed/corrupt chain head; reconcile it before recording a gate.");
  }
  const head: GateDecisionEntry[] = Array.isArray(gd) ? (gd as GateDecisionEntry[]) : [];

  // 1. Precondition — reject or proceed. A rejection leaves the carrier byte-for-byte unchanged.
  checkPreconditions(inp, head);

  // 2. Enact — compute the link, append growth-only, advance lifecycle_state.
  enact(inp, fm, head);
}

if (import.meta.main) {
  main();
}
