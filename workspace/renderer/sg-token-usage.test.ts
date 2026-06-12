// CLI test for sg-token-usage (the §10 transcript-baseline reader, D69 / #21). Mirrors
// publish-projection.test.ts: drives the CLI end-to-end with execFileSync, asserts the JSON
// output shape over the REAL committed fixture, and exercises every pinned exit code (0–5)
// including the strict/tolerant boundary (a truncated FINAL line is tolerated; a malformed
// NON-final line fails strict).
//
// Run: bun run workspace/renderer/sg-token-usage.test.ts   (exit 0 = OK)

import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "sg-token-usage.ts");
const fixture = path.join(here, "fixtures", "transcript-usage", "sample-transcript.jsonl");

/** Run the CLI; return {code, stdout}. execFileSync throws on non-zero — capture status + stdout. */
function run(argv: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync("bun", ["run", cli, ...argv], { encoding: "utf8" });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string };
    return { code: typeof err.status === "number" ? err.status : -1, stdout: String(err.stdout ?? "") };
  }
}

const dir = mkdtempSync(path.join(tmpdir(), "sg-cli-test-"));
const checks: Array<[string, boolean]> = [];

// ── exit 0 + correct totals on the real fixture (matches the IU1 hand-derived numbers) ──
{
  const { code, stdout } = run(["--transcript", fixture, "--json"]);
  let parsed: any = null;
  try { parsed = JSON.parse(stdout); } catch { /* leave null */ }
  checks.push(
    ["exit 0 on the real fixture (truncated final line tolerated)", code === 0],
    ["json output parses", parsed !== null],
    ["usage.total = 241375", parsed?.usage?.total === 241375],
    ["usage.cache_read = 94362", parsed?.usage?.cache_read === 94362],
    ["usage.cache_creation_1h = 113889 (TTL split)", parsed?.usage?.cache_creation_1h === 113889],
    ["counted_messages = 5", parsed?.counted_messages === 5],
    ["deduped_message_ids = 1", parsed?.deduped_message_ids === 1],
    ["skipped_lines = 2", parsed?.skipped_lines === 2],
    ["by_model has the 3 real models", parsed && Object.keys(parsed.by_model).sort().join(",") === "claude-fable-5,claude-opus-4-6,claude-opus-4-8"],
    ["warnings carries the flat-fallback warning", Array.isArray(parsed?.warnings) && parsed.warnings.length === 1],
  );
}

// ── human-readable + --by-model ──
{
  const { code, stdout } = run(["--transcript", fixture, "--by-model"]);
  checks.push(
    ["exit 0 human mode", code === 0],
    ["human output names total", stdout.includes("total") && stdout.includes("241375")],
    ["--by-model prints per-model lines", stdout.includes("claude-opus-4-6") && stdout.includes("by_model:")],
  );
}

// ── exit 1: bad invocation (no --transcript) ──
checks.push(["exit 1 on missing --transcript", run([]).code === 1]);
checks.push(["exit 1 on --transcript without a value", run(["--transcript"]).code === 1]);
checks.push(["exit 1 on unknown flag", run(["--transcript", fixture, "--bogus"]).code === 1]);

// ── exit 2: missing / unreadable file ──
checks.push(["exit 2 on a missing transcript", run(["--transcript", path.join(dir, "does-not-exist.jsonl")]).code === 2]);

// ── exit 3: malformed JSONL under strict (a NON-final malformed line) ──
{
  const f = path.join(dir, "malformed.jsonl");
  writeFileSync(f, [
    JSON.stringify({ type: "assistant", message: { id: "a", model: "claude-opus-4-8", usage: { input_tokens: 1, output_tokens: 1 } } }),
    "{ this is not json",
    JSON.stringify({ type: "user", message: { role: "user" } }),
  ].join("\n") + "\n", "utf8");
  checks.push(["exit 3 on a malformed non-final line (strict)", run(["--transcript", f]).code === 3]);
}

// ── truncated FINAL line is tolerated (exit 0), not exit 3 ──
{
  const f = path.join(dir, "truncated-final.jsonl");
  writeFileSync(f, [
    JSON.stringify({ type: "assistant", message: { id: "a", model: "claude-opus-4-8", usage: { input_tokens: 10, output_tokens: 5 } } }),
    '{"type":"assistant","message":{"id":"b","mod',  // truncated final line
  ].join("\n"), "utf8");
  checks.push(["exit 0 with a truncated FINAL line (tolerated)", run(["--transcript", f]).code === 0]);
}

// ── exit 4: no usage records (recognised transcript, but no assistant usage) ──
{
  const f = path.join(dir, "no-usage.jsonl");
  writeFileSync(f, [
    JSON.stringify({ type: "user", message: { role: "user" } }),
    JSON.stringify({ type: "assistant", message: { id: "a", model: "claude-opus-4-8" } }), // no usage
  ].join("\n") + "\n", "utf8");
  checks.push(["exit 4 on a transcript with no usage records", run(["--transcript", f]).code === 4]);
}

// ── exit 5: unsupported schema (valid JSONL, no recognised transcript `type`) ──
{
  const f = path.join(dir, "unsupported.jsonl");
  writeFileSync(f, [
    JSON.stringify({ foo: "bar" }),
    JSON.stringify({ baz: 1 }),
  ].join("\n") + "\n", "utf8");
  checks.push(["exit 5 on a non-transcript JSONL (unsupported schema)", run(["--transcript", f]).code === 5]);
}

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  if (!pass) ok = false;
}

rmSync(dir, { recursive: true, force: true });
console.log(ok ? "\nSG-TOKEN-USAGE CLI TEST OK" : "\nSG-TOKEN-USAGE CLI TEST FAILED");
process.exit(ok ? 0 : 1);
