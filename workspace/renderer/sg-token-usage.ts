#!/usr/bin/env bun
/**
 * sg-token-usage — the transcript-baseline reader (D69 / issue #21, design §10).
 *
 * A thin CLI over the deterministic core (`lib/transcript-usage.ts`): it reads a Claude Code
 * transcript JSONL, sums token usage by the pinned rules, and prints the result. The token math
 * lives ENTIRELY in the core — this file only adds invocation parsing, the STRICT-mode policy
 * (the CLI default; the hooks run the same core in TOLERANT mode), schema recognition, and output
 * formatting. Run via bun (the renderer convention) or node (the core is Bun-global-free).
 *
 *   sg-token-usage --transcript <path> [--json] [--by-model]
 *
 * Output (the §10 contract): usage {input, output, cache_creation_5m, cache_creation_1h,
 * cache_read, total}, by_model, counted_messages, deduped_message_ids, skipped_lines, warnings.
 *
 * Exit codes (design §10):
 *   0  ok
 *   1  bad invocation (missing/unknown flag, --transcript without a value)
 *   2  transcript missing or unreadable
 *   3  malformed JSONL under strict mode (a non-final line fails to parse; a single truncated
 *      FINAL line is tolerated — it is the normal tail of a live transcript, design §1)
 *   4  no usage records (the file is a recognised transcript but carries no assistant usage)
 *   5  unsupported schema (the JSONL parses but is not a Claude transcript — no recognised
 *      `type` line at all)
 *
 * The CLI is STRICT by default (exit 3 on a malformed non-final line); the hooks invoke the same
 * core in TOLERANT mode (skip-and-count, never fail) because a live session's log is read mid-flight.
 */

import { readFileSync } from "node:fs";
import { sumUsage } from "./lib/transcript-usage.ts";

const EXIT = {
  OK: 0,
  BAD_INVOCATION: 1,
  UNREADABLE: 2,
  MALFORMED_STRICT: 3,
  NO_USAGE: 4,
  UNSUPPORTED_SCHEMA: 5,
} as const;

// The transcript entry `type` values we recognise. A file with none of these is not a Claude
// transcript (→ exit 5, unsupported-schema), as distinct from one that is a transcript but has no
// assistant usage (→ exit 4, no-usage-records).
const KNOWN_TYPES = new Set(["assistant", "user", "system", "summary", "result"]);

function die(code: number, msg: string): never {
  process.stderr.write(`sg-token-usage: ${msg}\n`);
  process.exit(code);
}

interface Args {
  transcript: string;
  json: boolean;
  byModel: boolean;
}

function parseArgs(argv: string[]): Args {
  let transcript: string | null = null;
  let json = false;
  let byModel = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--transcript") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) die(EXIT.BAD_INVOCATION, "--transcript requires a path argument");
      transcript = v;
      i++;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--by-model") {
      byModel = true;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: sg-token-usage --transcript <path> [--json] [--by-model]\n",
      );
      process.exit(EXIT.OK);
    } else {
      die(EXIT.BAD_INVOCATION, `unknown argument: ${a}`);
    }
  }
  if (!transcript) die(EXIT.BAD_INVOCATION, "missing required --transcript <path>");
  return { transcript, json, byModel };
}

/**
 * STRICT-mode pre-scan + schema recognition. The core (tolerant) skips malformed lines and counts
 * them; the CLI is strict, so we re-scan here to apply policy:
 *  - a malformed JSON line that is NOT the final line → exit 3 (a single truncated final line is
 *    tolerated, design §1).
 *  - no line carries a recognised transcript `type` → exit 5 (not a Claude transcript).
 * Returns nothing on success; calls die() on a policy failure.
 */
function strictScan(path: string, text: string): void {
  const rawLines = text.split("\n");
  // Index of the last non-empty line (the only line allowed to be truncated/malformed).
  let lastNonEmpty = -1;
  for (let i = rawLines.length - 1; i >= 0; i--) {
    if (rawLines[i].trim() !== "") {
      lastNonEmpty = i;
      break;
    }
  }

  let sawKnownType = false;
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed === "") continue;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      if (i === lastNonEmpty) continue; // a truncated final line is normal — tolerate it
      die(EXIT.MALFORMED_STRICT, `malformed JSON on line ${i + 1} of ${path} (strict mode)`);
    }
    if (obj && typeof obj === "object") {
      const t = (obj as Record<string, unknown>)["type"];
      if (typeof t === "string" && KNOWN_TYPES.has(t)) sawKnownType = true;
    }
  }
  if (!sawKnownType) {
    die(EXIT.UNSUPPORTED_SCHEMA, `${path} parses as JSONL but is not a recognised Claude transcript (no known \`type\` line)`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  let text: string;
  try {
    text = readFileSync(args.transcript, "utf8");
  } catch (e) {
    die(EXIT.UNREADABLE, `cannot read transcript at ${args.transcript}: ${(e as Error).message}`);
  }

  // Strict policy first (the CLI default). The core does the math (tolerant); strictness is a
  // CLI-layer policy, not a second implementation of the parse/sum.
  strictScan(args.transcript, text);

  const r = sumUsage(args.transcript);

  // A recognised transcript with zero counted assistant-usage entries → exit 4 (no-usage-records).
  if (r.counted_messages === 0) {
    die(EXIT.NO_USAGE, `${args.transcript} carries no assistant usage records`);
  }

  const usage = {
    input: r.input,
    output: r.output,
    cache_creation_5m: r.cache_creation_5m,
    cache_creation_1h: r.cache_creation_1h,
    cache_read: r.cache_read,
    total: r.total,
  };

  if (args.json) {
    const out = {
      transcript: args.transcript,
      usage,
      by_model: r.by_model,
      counted_messages: r.counted_messages,
      deduped_message_ids: r.deduped_message_ids,
      skipped_lines: r.skipped_lines,
      warnings: r.warnings,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    process.exit(EXIT.OK);
  }

  // Human-readable.
  const lines: string[] = [];
  lines.push(`transcript        : ${args.transcript}`);
  lines.push(`input             : ${usage.input}`);
  lines.push(`output            : ${usage.output}`);
  lines.push(`cache_creation_5m : ${usage.cache_creation_5m}`);
  lines.push(`cache_creation_1h : ${usage.cache_creation_1h}`);
  lines.push(`cache_read        : ${usage.cache_read}`);
  lines.push(`total             : ${usage.total}`);
  lines.push(`counted_messages  : ${r.counted_messages}`);
  lines.push(`deduped_ids       : ${r.deduped_message_ids}`);
  lines.push(`skipped_lines     : ${r.skipped_lines}`);
  if (args.byModel) {
    lines.push("by_model:");
    for (const [model, c] of Object.entries(r.by_model)) {
      lines.push(
        `  ${model}: total=${c.total} input=${c.input} output=${c.output} ` +
          `cc5m=${c.cache_creation_5m} cc1h=${c.cache_creation_1h} read=${c.cache_read}`,
      );
    }
  }
  if (r.warnings.length > 0) {
    lines.push("warnings:");
    for (const w of r.warnings) lines.push(`  - ${w}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
  process.exit(EXIT.OK);
}

main();
