#!/usr/bin/env -S bun run
/**
 * carrier-arg-hook.ts — a PreToolUse guard: DENY a carrier-consuming stage-skill invocation
 * whose args carry no ID_RE-clean carrier token. Wired as a harness PreToolUse hook over the
 * Skill / Task / Agent tools (org-root .claude/settings.json — materialized at harness-init); it
 * never mutates state — it reads one PreToolUse payload on stdin and answers with a bounded
 * permission decision, so the compulsory carrier argument (IU-9's convention) is enforced by
 * MECHANISM at dispatch time, not left to the model.
 *
 * SELF-CONTAINED by design. The token grammar is a TWIN of the analyzer's exported
 * CARRIER_ARG_RE / ID_RE (schema.ts) held in lockstep by carrier-arg-hook.test.ts's byte-equal
 * assertion — never an import at hook time. A PreToolUse guard runs on the host's hot path for
 * every Skill/Task call; it stays a zero-dependency stdlib script (no cross-tree import to
 * resolve, no analyzer closure to drag in) so it cannot fail open on a resolution error. The
 * enforced NODE SET is not baked in either: it is read from a data file (`--nodes <path>`,
 * default the sibling `carrier-nodes.json`) that `generate` / `harness-init` derive from the
 * graph's `required-state` frontmatter declarants — never hand-listed here.
 *
 * SCRIPT-SAFETY (build policy 4). The stdin payload is UNTRUSTED data: it is JSON-parsed, never
 * evaluated; only string fields are read; the grammar capture is length-bounded and
 * metachar-free; nothing derived from it ever reaches a shell (the hook spawns nothing). A
 * malformed / unparseable payload FAILS OPEN (allow) — a guard must never wedge the host on
 * garbage; the analyzer's conformance counter is the backstop that makes a bypass visible.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── the token grammar (TWIN of schema.ts — carrier-arg-hook.test.ts pins byte-equality) ──────

/** TWIN of schema.ts `CARRIER_ARG_RE` — the carrier-arg extraction grammar (every convention
 *  spelling in one constant). Byte-equal to the analyzer's export (lockstep-tested). */
export const CARRIER_ARG_RE =
  /(?:--carrier(?:-id)?[=\s]+|(?:^|[\s"'(])carrier=)["']?([A-Za-z0-9/~][A-Za-z0-9._/~-]{0,255})/;

/** TWIN of schema.ts `ID_RE` — a clean carrier id. Byte-equal to the analyzer's export. */
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** TWIN of schema.ts `SG_NS_PREFIX` — the plugin namespace an invocation may carry. */
export const SG_NS_PREFIX = "stack-graph:";

/** TWIN of schema.ts `stripSgNamespace`. */
export function stripSgNamespace(skill: string): string {
  return skill.startsWith(SG_NS_PREFIX) ? skill.slice(SG_NS_PREFIX.length) : skill;
}

/** TWIN of schema.ts `normalizeCarrierOperand` — a CARRIER_ARG_RE capture → clean id or null.
 *  The `--carrier` operand is a FILE PATH; normalisation is basename-minus-`.md`, ID_RE-checked
 *  (a bare id is its own basename, so ids pass through). Null for anything not ID_RE-clean. */
export function normalizeCarrierOperand(raw: string): string | null {
  const base = raw.replace(/\/+$/, "").split("/").pop() ?? "";
  const id = base.endsWith(".md") ? base.slice(0, -".md".length) : base;
  return ID_RE.test(id) ? id : null;
}

/** TWIN of schema.ts `extractCarrierArg` — THE carrier id from one operand-bearing surface
 *  (a Skill/Agent args string), or null when no clean id is extractable. */
export function extractCarrierArg(text: string): string | null {
  const m = text.match(CARRIER_ARG_RE);
  return m ? normalizeCarrierOperand(m[1]) : null;
}

// ── the decision ─────────────────────────────────────────────────────────────────────────────

export interface PreToolUsePayload {
  tool_name?: unknown;
  tool_input?: unknown;
}

export interface Decision {
  permissionDecision: "allow" | "deny";
  reason: string;
}

/** The tools whose invocation names a graph node — a MIRROR of the analyzer's `SPAN_TOOLS`
 *  (attribute.ts): `Skill` (a stage skill), and `Task` / `Agent` (a dispatched agent — the two
 *  host-specific spellings of the one sub-agent spawn surface; the analyzer treats them as
 *  aliases, so the guard must too, or an `Agent`-surfaced spawn slips the net). Any other tool is
 *  out of scope — allow. The matrix pins each spelling, so dropping one turns CI red. */
const NODE_INVOKING_TOOLS = new Set(["Skill", "Task", "Agent"]);

/** Join every string-valued field of a tool_input into one scan surface (the args text) —
 *  the same surface the analyzer scans (attribute.ts `inputText`). */
function inputText(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const v of Object.values(input)) if (typeof v === "string") parts.push(v);
  return parts.join("\n");
}

/** The invoked node id (namespace-stripped), or null when the payload names no node. */
function invokedNodeId(input: Record<string, unknown>): string | null {
  const raw =
    (typeof input.skill === "string" ? input.skill : undefined) ??
    (typeof input.subagent_type === "string" ? input.subagent_type : undefined);
  return typeof raw === "string" && raw !== "" ? stripSgNamespace(raw) : null;
}

/**
 * Decide whether to allow or deny a PreToolUse invocation. Pure — no I/O, no throw.
 *   • not a node-invoking tool, or names no enforced node → allow (out of scope);
 *   • an enforced node whose args yield NO ID_RE-clean carrier token → DENY;
 *   • an enforced node with a clean carrier token → allow.
 */
export function decide(payload: PreToolUsePayload, enforced: Set<string>): Decision {
  const allow = (reason: string): Decision => ({ permissionDecision: "allow", reason });

  if (typeof payload.tool_name !== "string" || !NODE_INVOKING_TOOLS.has(payload.tool_name)) {
    return allow("not a node-invoking tool");
  }
  const input =
    payload.tool_input && typeof payload.tool_input === "object" && !Array.isArray(payload.tool_input)
      ? (payload.tool_input as Record<string, unknown>)
      : {};

  const node = invokedNodeId(input);
  if (node === null || !enforced.has(node)) {
    return allow(`\`${node ?? "?"}\` is not a carrier-consuming enforced node`);
  }

  const carrier = extractCarrierArg(inputText(input));
  if (carrier === null) {
    return {
      permissionDecision: "deny",
      reason:
        `\`${node}\` is a carrier-consuming stage skill but its args carry no ID_RE-clean ` +
        `carrier token. Pass the compulsory carrier argument (e.g. \`carrier=<id>\`).`,
    };
  }
  return allow(`carrier \`${carrier}\` present`);
}

// ── the runtime (guarded so importing the module for tests never reads stdin) ──────────────────

/** Read the enforced node set from `--nodes <path>` (default the sibling carrier-nodes.json).
 *  Fails open (empty set → allow-all) if the file is absent/unreadable — a guard must never
 *  wedge the host; the analyzer's conformance counter stays the backstop. */
function loadEnforcedNodes(argv: string[], hookDir: string): Set<string> {
  const flag = argv.indexOf("--nodes");
  const path = flag >= 0 && argv[flag + 1] ? argv[flag + 1] : `${hookDir}/carrier-nodes.json`;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const list: unknown = Array.isArray(parsed) ? parsed : parsed?.nodes;
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const hookDir = dirname(fileURLToPath(import.meta.url));
  const enforced = loadEnforcedNodes(process.argv.slice(2), hookDir);

  let payload: PreToolUsePayload;
  try {
    payload = JSON.parse(await readStdin()) as PreToolUsePayload;
  } catch {
    return; // unparseable stdin → fail open (allow), emit nothing
  }

  const decision = decide(payload, enforced);
  if (decision.permissionDecision === "deny") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: decision.reason,
        },
      }),
    );
  }
  // allow → emit nothing (exit 0): the guard only ever BLOCKS; it never auto-approves.
}

if (import.meta.main) {
  void main();
}
