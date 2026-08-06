// scan-gate-tags.ts — the PROVENANCE-BOUND `<sg-gate>` script-channel scan (IU-6, gate-channel-e2e).
//
// SEPARATE from scan-sg-tags.ts (the MODEL family, captured from assistant PROSE on any turn). `sg-gate`
// is the one `emitter-class: script` member: the record-gate runner appends it to stdout on a SUCCESSFUL
// enactment. Prose can never mint one — a gate tag is captured ONLY with EXECUTED-RUNNER PROVENANCE:
//
//   1. tool_use / tool_result ID PAIRING — the tag must ride the `content` of a `tool_result` whose
//      `tool_use_id` pairs a Bash `tool_use` earlier in the transcript, AND
//   2. EXECUTED-ARGV-ANCHORED command match — that tool_use's command must have EXECUTED the runner: the
//      runner path is the EXECUTED SCRIPT (the program, or the script argument of an interpreter like
//      `bun`), NEVER a substring anywhere in the command (a comment, a quoted argument, a `cat`/Read of
//      the source, a mention).
//
// A SHAPE-CONFORMING tag that fails provenance — assistant prose, a replay through a non-runner
// tool_result, a mention-only command (`echo '<sg-gate>…' # …record-gate.ts`), a registry/runner read
// echo — is REFUSED: it derives ZERO rows but INCREMENTS `provenanceRefused`, so a forgery attempt is
// VISIBLE, never silent. A malformed (multi-line / non-JSON / out-of-shape) tag is simply dropped (it is
// not a "conforming body", so it is not a refusal either).
//
// SAFETY (plan §Standing build policy 4): the command string is untrusted TRANSCRIPT DATA — it is
// TOKENISED (quote-aware, comment-stripped) and inspected, NEVER eval'd, and no captured text crosses
// into a row (only the bounded, shape-gated fields do). The tag body is JSON.parsed, never eval'd.
//
// PORTABILITY: pure types + small pure functions + JSON only (no fs/Bun globals).

import { GATE_ENACTMENT_GATES, GATE_ENACTMENT_DECISIONS, ID_RE, normalizeTs, SG_GATE_FIELDS } from "./schema.ts";
import type { TranscriptEntry, TranscriptMeta } from "./schema.ts";

/** The `<sg-gate>` body's REQUIRED key set, sorted — the conformance twin (schema.ts SG_GATE_FIELDS). A
 *  captured tag must carry EXACTLY these keys (an extra key is non-conforming — a forger cannot smuggle a
 *  fifth field). */
const GATE_BODY_KEYS = [...SG_GATE_FIELDS].sort();

/** One captured, shape-conforming, PROVENANCE-BOUND `<sg-gate>` enactment — the input to the
 *  gate-enactment row (derive-activity.ts). Every field is bounded (closed enum / ID_RE id / integer);
 *  no free-text is carried. */
export interface GateProposal {
  gate: string;
  decision: string;
  carrier: string;
  seq: number;
  /** The capturing (transcript) session. */
  session: string;
  /** The tag-bearing tool_result entry's instant (strict-UTC normalised), or null when unparseable. */
  ts: string | null;
  /** The paired tool_use id that carried the executed-runner provenance (the dedup grain). */
  toolUseId: string;
}

/** The result of the gate scan over one or more transcripts: the provenance-bound proposals plus the
 *  aggregate `provenanceRefused` count (shape-conforming tags that FAILED provenance — forgery visible). */
export interface GateScanResult {
  proposals: GateProposal[];
  provenanceRefused: number;
}

/** A paired `<sg-gate>…</sg-gate>` tag; the body is JSON.parsed, never eval'd. Global + non-greedy so
 *  multiple tags in one text are each seen. */
const SG_GATE_TAG_RE = /<sg-gate>([\s\S]*?)<\/sg-gate>/g;

/** The runner as an EXECUTED SCRIPT: a token ending `record-gate/record-gate.ts` (the node's own dir +
 *  file). The shipped runner lives at `scripts/record-gate/record-gate.ts`; the factory copy at
 *  `graph-vUnified/record-gate/record-gate.ts` — both end `…/record-gate/record-gate.ts`. Requiring the
 *  parent dir (not a bare `record-gate.ts`) means an unrelated `record-gate.ts` in cwd cannot
 *  false-positive; anchored to the END of a single token (checked ONLY in executed-script position), a
 *  substring elsewhere never matches. (A forger planting a full `record-gate/record-gate.ts` and running
 *  it is out of scope — that requires host-recorded plant tool_uses, visible in the same transcript, a
 *  far higher bar than the prose/echo/mention forgeries this channel closes.) */
const RUNNER_SCRIPT_RE = /(^|\/)record-gate\/record-gate\.ts$/;

/** Interpreter programs that take a SCRIPT argument — the runner is `bun <path>/record-gate.ts …`. When
 *  the program is one of these, the executed script is the first non-`run`, non-flag argument. */
const INTERPRETERS: ReadonlySet<string> = new Set(["bun", "node", "deno", "tsx", "ts-node"]);

interface Token {
  value: string;
  isOp: boolean;
}

/**
 * Tokenise a shell command as DATA (never eval'd): quote-aware, comment-stripped. Single quotes are
 * literal; double quotes honour `\"`; an unquoted `#` at a token boundary begins a comment (rest
 * discarded). Command SEPARATORS — `;`, `&&`, `||`, `|`, a bare background `&`, AND a bare newline — are
 * emitted as `isOp` tokens so the caller can split into command segments; a `\`-newline is a line
 * CONTINUATION (joined). REDIRECTIONS are NON-splitting (part of the single command): `>`/`>>`/`<` are
 * ordinary word chars, and the redirection forms of `&`/`|` — `2>&1`/`>&2` (the `&` follows a `>`),
 * `&>`/`&>>` (the `&` precedes a `>`), and `>|` (noclobber) — are folded into the word, NOT treated as
 * control operators (so a legit `bun <runner> … 2>&1` stays ONE command). This is the whole trust
 * boundary — a runner mention in a quote/comment is not a token in executed-script position, and a
 * `;`/`&&`/`&`/newline-chained SECOND command is a separate segment (see commandExecutesRunner).
 */
function tokenize(command: string): Token[] {
  const tokens: Token[] = [];
  let cur = "";
  let inTokenValue = false; // true once the current word has ≥1 char (so `#` mid-word is literal)
  // Whether the LAST char appended to `cur` was a GENUINE UNQUOTED `>` — the only context in which a
  // following `&`/`|` is a redirection (`2>&1`, `>|`) and not a control operator. A quoted (`'>'`) or
  // backslash-escaped (`\>`) `>` is a LITERAL, not a redirect, so it must NOT arm the fold — else a
  // chained forgery `bun <runner> '>'& echo '<forged>'` would merge the control `&` into one segment and
  // mint a fake enactment. A char-level `cur.endsWith(">")` cannot tell the two apart; this flag can.
  let redirPending = false;
  const flush = () => {
    if (inTokenValue) tokens.push({ value: cur, isOp: false });
    cur = "";
    inTokenValue = false;
    redirPending = false;
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    // Line continuation: `\` + newline is removed (the next line joins THIS command — the real runner
    // invocation is written with `\`-continuations). It is NOT a separator.
    if (ch === "\\" && (command[i + 1] === "\n" || command[i + 1] === "\r")) {
      i++; // step onto the newline char
      if (command[i] === "\r" && command[i + 1] === "\n") i++; // CRLF: consume the paired \n too
      continue; // the for-loop's i++ consumes the (last) newline char
    }
    // An unquoted backslash escapes the NEXT char → a literal, never a metacharacter (`\>` is a literal
    // `>`, `\&` a literal `&`). Append it literally; it does NOT arm a redirect fold.
    if (ch === "\\" && i + 1 < command.length) {
      cur += command[i + 1];
      inTokenValue = true;
      redirPending = false;
      i++;
      continue;
    }
    if (ch === "'") {
      // Single-quoted: everything up to the next single quote is literal (part of the current token).
      const end = command.indexOf("'", i + 1);
      const inner = end === -1 ? command.slice(i + 1) : command.slice(i + 1, end);
      cur += inner;
      inTokenValue = true;
      redirPending = false; // quoted content — even a trailing `>` is a literal, not a redirect
      i = end === -1 ? command.length : end;
      continue;
    }
    if (ch === '"') {
      // Double-quoted: honour `\"` and `\\`; everything else literal up to the closing quote.
      i++;
      while (i < command.length && command[i] !== '"') {
        if (command[i] === "\\" && i + 1 < command.length) { cur += command[i + 1]; i += 2; continue; }
        cur += command[i];
        i++;
      }
      inTokenValue = true;
      redirPending = false; // quoted content — a trailing `>` is a literal, not a redirect
      continue;
    }
    if (ch === "#" && !inTokenValue) {
      // A comment begins only at a token boundary (`echo foo # bar`), never mid-word (`foo#bar`).
      break;
    }
    // A BARE newline (not a `\`-continuation, handled above) SEPARATES commands — a chained second
    // command whose output could pollute the shared tool_result. Emit it as a separator.
    if (ch === "\n" || ch === "\r") {
      flush();
      tokens.push({ value: "\n", isOp: true });
      continue;
    }
    if (ch === " " || ch === "\t") {
      flush();
      continue;
    }
    // `&` — redirection-aware. `2>&1` / `>&2` (the `&` follows a GENUINE UNQUOTED `>`, i.e. redirPending)
    // and `&>` / `&>>` (the next raw char is `>`, which cannot be quoted at this position) are
    // REDIRECTIONS — folded into the word, NON-splitting. Only a control `&&` or a bare background `&`
    // SPLITS (a chained / backgrounded SECOND command). A quoted/escaped `>` left redirPending false, so
    // `'>'&` correctly splits as a control `&` (fail-closed against the quoted-`>` forgery).
    if (ch === "&") {
      if (redirPending || command[i + 1] === ">") { cur += "&"; inTokenValue = true; redirPending = false; continue; }
      flush();
      if (command[i + 1] === "&") { i++; tokens.push({ value: "&&", isOp: true }); }
      else tokens.push({ value: "&", isOp: true });
      continue;
    }
    // `|` — a `>|` noclobber redirection (the `|` follows a genuine unquoted `>`) is folded into the word,
    // NON-splitting; a pipe `|` or an or-list `||` SPLITS. A quoted `>` does not arm the fold.
    if (ch === "|") {
      if (redirPending) { cur += "|"; inTokenValue = true; redirPending = false; continue; }
      flush();
      if (command[i + 1] === "|") { i++; tokens.push({ value: "||", isOp: true }); }
      else tokens.push({ value: "|", isOp: true });
      continue;
    }
    if (ch === ";") { flush(); tokens.push({ value: ";", isOp: true }); continue; }
    cur += ch;
    inTokenValue = true;
    // Arm the redirect fold ONLY for a LONE genuine unquoted `>`. A RUN of ≥2 `>` (`>>|`, `>>&`, `>>>&`)
    // is a bash SYNTAX ERROR — bash echoes the command source (with any embedded forged tag) to the
    // captured tool_result — so a run must NOT arm the fold; the trailing `&`/`|` then splits (refuses).
    // `command[i-1] !== ">"` refuses every ≥2 run while preserving every genuine redirect (`2>&1`, `>&2`,
    // `>|out`). (Escaped/quoted-`>`-then-`>` edge cases fail-closed to a split — safe, non-real inputs.)
    redirPending = ch === ">" && command[i - 1] !== ">";
  }
  flush();
  return tokens;
}

/** True when a single command SEGMENT (a run of word tokens between operators) EXECUTES the runner: skip
 *  leading `VAR=value` env-assignment prefixes, take the program; if it is an interpreter, the executed
 *  script MUST be the IMMEDIATE next token (after an optional `run` subcommand); otherwise the program
 *  itself is the executed script. The executed-script token must match RUNNER_SCRIPT_RE.
 *
 *  WHY "immediate", not "first non-flag": an interpreter FLAG in script position is an inline-eval or a
 *  value-taking flag, NEVER the enacting main script — `bun --preload <runner> -e '<forged>'` runs the
 *  inline `-e` code (its output pollutes the tool_result) while merely PRELOADING the runner path, and a
 *  lenient "skip flags, take the first bare token" would mis-pick that preload VALUE as the script. So a
 *  flag in script position REFUSES (fail-closed). The real firing-node call puts the runner path
 *  immediately after `bun`/`bun run` with no leading interpreter flag. A `cat …/record-gate.ts` (program
 *  `cat`, runner as an ARGUMENT) or an `echo …` never matches — the runner is not the executed program. */
function segmentExecutesRunner(words: string[]): boolean {
  let i = 0;
  // Skip env-assignment prefixes (`FOO=bar bun …`).
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  if (i >= words.length) return false;
  const program = words[i];
  const programBase = program.replace(/\/+$/, "").split("/").pop() ?? program;
  if (INTERPRETERS.has(programBase)) {
    // The executed script is the IMMEDIATE token after the interpreter (and an optional `run`). A FLAG
    // there (an inline eval like `-e`, or a value-taking flag like `--preload <file>` whose value is not
    // the main script) refuses provenance — the runner is not the enacting program. Fail-closed.
    let j = i + 1;
    if (j < words.length && words[j] === "run") j++; // `bun run <script>`
    if (j >= words.length || words[j].startsWith("-")) return false;
    return RUNNER_SCRIPT_RE.test(words[j]);
  }
  // Non-interpreter: the program itself is the executed script (e.g. an executable `./record-gate.ts`).
  return RUNNER_SCRIPT_RE.test(program);
}

/**
 * Does `command` EXECUTE the record-gate runner as its SOLE command (executed-argv-anchored)? Tokenise as
 * data, split on command separators (`;`/`&&`/`||`/`|`/`&`/newline) into segments, and return true ONLY
 * when there is EXACTLY ONE command segment and it executes the runner.
 *
 * THE LOAD-BEARING ANTI-FORGERY PROPERTY (fail-closed): the tag rides the tool_result, which is the
 * COMBINED output of every command the shell ran. A tag is trustworthy only when the runner's OWN output
 * IS the whole result — so a CHAINED second command is refused, because `bun <runner> ; echo '<forged>'`
 * (or `|| echo …`, `| sed …`, a newline-chained `echo`) would satisfy a lenient "any segment runs the
 * runner" gate while a DIFFERENT segment injects an attacker-chosen `<sg-gate>` tag into the same result.
 * The real firing-node invocation is a single `bun …/record-gate/record-gate.ts <flags>` command (env
 * prefixes stay within the segment; `\`-continuations are joined), so this accepts the genuine call and
 * refuses every chained forgery. A mention in a comment / quoted arg / as an argument to `cat`/`grep`
 * fails `segmentExecutesRunner` regardless.
 *
 * SUBSTITUTION GUARD (fail-closed): command substitution `$(…)` / backticks and process substitution
 * `<(…)` / `>(…)` run ANOTHER command whose output leaks into the shared tool_result, yet sit WITHIN one
 * segment (so the sole-command split does not catch them) — e.g. `bun <runner> $(echo '<forged>' >&2)`.
 * The genuine invocation (ID_RE ids + flag values, `${VAR}` parameter expansion — NOT `$(`) never uses
 * them, so their mere presence refuses provenance. `${VAR}` is parameter expansion, not `$(`, and passes.
 */
const SUBSTITUTION_RE = /\$\(|\x60|<\(|>\(/; // `$(` command-sub · `\x60`=backtick · `<(`/`>(` process-sub
export function commandExecutesRunner(command: unknown): boolean {
  if (typeof command !== "string" || command === "") return false;
  if (SUBSTITUTION_RE.test(command)) return false; // a subshell could inject a forged tag into the result
  const segments: string[][] = [[]];
  for (const t of tokenize(command)) {
    if (t.isOp) segments.push([]);
    else segments[segments.length - 1].push(t.value);
  }
  const nonEmpty = segments.filter((s) => s.length > 0);
  // Exactly one command, and it is the runner — any chained extra command refuses provenance (fail-closed).
  return nonEmpty.length === 1 && segmentExecutesRunner(nonEmpty[0]);
}

/** Validate a parsed `<sg-gate>` body against the closed script-member shape (registry `sg-gate`): EXACTLY
 *  the four fields `gate` (∈ GATE_ENACTMENT_GATES), `decision` (∈ GATE_ENACTMENT_DECISIONS), `carrier`
 *  (ID_RE-clean), `seq` (a non-negative integer) — nothing more (an extra key is non-conforming, so a
 *  forger cannot smuggle a fifth field). Returns the bounded fields, or null when out of shape. */
function validGateBody(body: unknown): { gate: string; decision: string; carrier: string; seq: number } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const keys = Object.keys(b).sort();
  if (keys.length !== GATE_BODY_KEYS.length || !GATE_BODY_KEYS.every((k, i) => keys[i] === k)) return null;
  const { gate, decision, carrier, seq } = b;
  if (typeof gate !== "string" || !GATE_ENACTMENT_GATES.has(gate)) return null;
  if (typeof decision !== "string" || !GATE_ENACTMENT_DECISIONS.has(decision)) return null;
  if (typeof carrier !== "string" || !ID_RE.test(carrier)) return null;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return null;
  return { gate, decision, carrier, seq };
}

/** Parse a shape-conforming `<sg-gate>` body from a raw inner string, or null. STRICT single-line JSON
 *  (a multi-line body is malformed — dropped, never a refusal); then the closed shape gate above. */
function parseGateBody(rawInner: string): { gate: string; decision: string; carrier: string; seq: number } | null {
  const raw = rawInner.trim();
  if (raw.includes("\n")) return null; // strict single-line — a pretty/YAML-ish body is malformed
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  return validGateBody(body);
}

/** The text of a tool_result block's `content` (a string, or an array of `{text}` parts) — inspected for
 *  the tag bytes only; never emitted. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
      .join("\n");
  }
  return "";
}

/** Iterate an entry's message content blocks (portable: only the fields we read). */
function contentBlocks(entry: TranscriptEntry): unknown[] {
  const msg = entry.message;
  if (!msg || typeof msg !== "object") return [];
  const content = (msg as { content?: unknown }).content;
  return Array.isArray(content) ? content : [];
}

/**
 * Scan ONE transcript for provenance-bound `<sg-gate>` enactments. Two passes:
 *   1. Collect the tool_use ids whose Bash command EXECUTED the runner (executed-argv-anchored).
 *   2. Walk every text region and gate each `<sg-gate>` tag:
 *        · in a tool_result whose tool_use_id EXECUTED the runner → a proposal (provenance-bound);
 *        · anywhere else (assistant/user prose, a non-runner tool_result, a mention-only command's
 *          result) AND shape-conforming → `provenanceRefused` (forgery visible, zero rows).
 * Deduped: a byte-identical tag replayed on the same provenance key (a streamed/retry JSONL dup) counts
 * once. METRICS-ONLY — reads bytes, returns proposals + a count; performs no write.
 */
export function scanGateTagsResult(entries: TranscriptEntry[], meta: TranscriptMeta): GateScanResult {
  // Pass 1 — the executed-runner tool_use ids (host-recorded id + command; a subagent cannot forge them).
  const executedRunnerIds = new Set<string>();
  for (const entry of entries) {
    for (const block of contentBlocks(entry)) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: unknown; name?: unknown; id?: unknown; input?: unknown };
      if (b.type !== "tool_use" || b.name !== "Bash" || typeof b.id !== "string") continue;
      const cmd = b.input && typeof b.input === "object" ? (b.input as { command?: unknown }).command : undefined;
      if (commandExecutesRunner(cmd)) executedRunnerIds.add(b.id);
    }
  }

  // Pass 2 — gate every `<sg-gate>` tag by the position it was found in.
  const proposals: GateProposal[] = [];
  const seen = new Set<string>();
  let provenanceRefused = 0;

  /** Gate one text region. `provenanceKey` is the executed-runner tool_use id when the region is a
   *  provenance-bound tool_result, else null (prose / non-runner result). */
  const scanRegion = (text: string, provenanceKey: string | null, ts: string | null, dedupScope: string): void => {
    if (!text || !text.includes("<sg-gate>")) return;
    SG_GATE_TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SG_GATE_TAG_RE.exec(text)) !== null) {
      const fields = parseGateBody(m[1]);
      if (!fields) continue; // malformed — not a conforming body, so neither a proposal nor a refusal
      const bodyKey = JSON.stringify(fields);
      if (provenanceKey !== null) {
        const key = `ok:${provenanceKey}:${bodyKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        proposals.push({ ...fields, session: meta.sessionId, ts, toolUseId: provenanceKey });
      } else {
        const key = `refused:${dedupScope}:${bodyKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        provenanceRefused++;
      }
    }
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const ts = normalizeTs(entry.timestamp) ?? meta.firstTs ?? meta.lastTs ?? null;
    const msg = entry.message;
    const content = msg && typeof msg === "object" ? (msg as { content?: unknown }).content : undefined;
    // Prose dedup rides message.id grain (like scan-sg-tags), so a byte-identical duplicated JSONL entry
    // (streamed / retry) counts a forgery once; a message with no id never collapses (unique by index).
    const midRaw = msg && typeof msg === "object" ? (msg as { id?: unknown }).id : undefined;
    const proseScope = typeof midRaw === "string" ? `msg:${midRaw}` : `noid:${i}`;

    // A bare string content (assistant/user prose) is never provenance-bound.
    if (typeof content === "string") {
      scanRegion(content, null, ts, proseScope);
      continue;
    }
    if (!Array.isArray(content)) continue;

    for (let j = 0; j < content.length; j++) {
      const block = content[j];
      if (!block || typeof block !== "object") continue;
      const bb = block as { type?: unknown; text?: unknown; tool_use_id?: unknown; content?: unknown };
      if (bb.type === "tool_result") {
        const tuid = typeof bb.tool_use_id === "string" ? bb.tool_use_id : null;
        const bound = tuid !== null && executedRunnerIds.has(tuid);
        // A tag in a NON-runner tool_result is refused; scope its dedup on the tool_use_id (a replayed
        // identical result collapses). A missing id falls back to the entry position.
        scanRegion(resultText(bb.content), bound ? tuid : null, ts, tuid ?? `tr:${i}:${j}`);
      } else if (bb.type === "text" && typeof bb.text === "string") {
        // Assistant/user prose text — never provenance-bound; deduped at message.id grain.
        scanRegion(bb.text, null, ts, proseScope);
      }
    }
  }

  return { proposals, provenanceRefused };
}

/** Scan a set of parsed transcripts for ALL provenance-bound gate proposals + the aggregate refused
 *  count. Pure: same parsed transcripts in ⇒ the same result out. */
export function scanAllGateTagsResult(
  parsed: readonly { entries: TranscriptEntry[]; meta: TranscriptMeta }[],
): GateScanResult {
  const proposals: GateProposal[] = [];
  let provenanceRefused = 0;
  for (const p of parsed) {
    const r = scanGateTagsResult(p.entries, p.meta);
    proposals.push(...r.proposals);
    provenanceRefused += r.provenanceRefused;
  }
  return { proposals, provenanceRefused };
}
