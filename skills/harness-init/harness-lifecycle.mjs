#!/usr/bin/env -S bun
/** Host-neutral root projection + shared harness-runtime materializer. */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const MANAGED_START = "<!-- stack-graph:managed:start -->";
const MANAGED_END = "<!-- stack-graph:managed:end -->";
const LOCAL_START = "<!-- stack-graph:local-content:start -->";
const LOCAL_END = "<!-- stack-graph:local-content:end -->";
const ROOT_FILES = ["CLAUDE.md", "AGENTS.md"];
const DEFAULT_RUNTIME = join(".stack-graph", "harness");

function fail(message) {
  process.stderr.write(`harness-lifecycle: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const mode = argv[0];
  if (mode !== "materialize" && mode !== "check") fail("mode must be materialize or check");
  const out = { mode };
  for (let i = 1; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`invalid argument ${key ?? ""}`);
    out[key.slice(2)] = value;
  }
  if (!out.root || !out.floor) fail("--root and --floor are required");
  return out;
}

function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function atomicWrite(path, content) {
  if (read(path) === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.stack-graph-tmp`;
  writeFileSync(temp, content);
  renameSync(temp, path);
  return true;
}

function joinLocalPieces(pieces) {
  let out = "";
  for (const piece of pieces) {
    if (!/\S/.test(piece)) continue;
    if (out && !out.endsWith("\n") && !piece.startsWith("\n")) out += "\n";
    out += piece;
  }
  return out;
}

function contentAfterLineMarker(raw, index, marker) {
  let start = index + marker.length;
  if (raw.slice(start, start + 2) === "\r\n") start += 2;
  else if (raw[start] === "\n") start += 1;
  return start;
}

function extractLocal(raw, file) {
  if (raw === null) return "";
  // D102's legacy root was wholly SG-managed and explicitly carried no local
  // prose. Recognise that retired projection by both its ownership declaration
  // and its old runtime import syntax; do not misclassify it as operator content.
  if (/SG-MANAGED,\s*VENDED ambient surface/i.test(raw) && /^@\.claude\//m.test(raw)) return "";
  const managedStart = raw.indexOf(MANAGED_START);
  const managedEnd = raw.indexOf(MANAGED_END);
  if ((managedStart < 0) !== (managedEnd < 0) || managedEnd < managedStart)
    fail(`${file} has malformed managed markers`);
  if (managedStart < 0) {
    if (raw.includes(LOCAL_START) || raw.includes(LOCAL_END))
      fail(`${file} has local-content markers without a managed projection`);
    return raw;
  }
  if (raw.indexOf(MANAGED_START, managedStart + 1) >= 0 || raw.indexOf(MANAGED_END, managedEnd + 1) >= 0)
    fail(`${file} has duplicate managed markers`);
  const managedTail = managedEnd + MANAGED_END.length;
  const localStart = raw.indexOf(LOCAL_START, managedTail);
  const localEnd = raw.indexOf(LOCAL_END, managedTail);
  if (localStart < 0 && localEnd < 0)
    return joinLocalPieces([raw.slice(0, managedStart), raw.slice(managedTail)]);
  if (localStart < 0 || localEnd < localStart) fail(`${file} has malformed local-content markers`);
  if (raw.indexOf(LOCAL_START, localStart + 1) >= 0 || raw.indexOf(LOCAL_END, localEnd + 1) >= 0)
    fail(`${file} has duplicate local-content markers`);
  const localContent = contentAfterLineMarker(raw, localStart, LOCAL_START);
  return joinLocalPieces([
    raw.slice(0, managedStart),
    raw.slice(managedTail, localStart),
    raw.slice(localContent, localEnd),
    raw.slice(localEnd + LOCAL_END.length),
  ]);
}

function rootProjection(runtimeRel, local) {
  const posix = runtimeRel.split("\\").join("/").replace(/\/$/, "");
  let out = [
    MANAGED_START,
    "# Stack Graph harness",
    "",
    `Before acting, read the [shared Stack Graph floor](${posix}/always-on/sg-root-instructions.md).`,
    `Resolve harness-local surfaces through [the shared bindings file](${posix}/bindings.yaml) when present.`,
    "Use the graph's skills, carrier preflights, gates, and documentation standards as the workflow authority.",
    MANAGED_END,
    "",
  ].join("\n");
  if (local !== "") {
    const separated = local.endsWith("\n") ? local : `${local}\n`;
    out += `${LOCAL_START}\n${separated}${LOCAL_END}\n`;
  }
  return out;
}

function uniqueExisting(paths) {
  return paths.map((path) => ({ path, content: read(path) })).filter((x) => x.content !== null);
}

function settingsWithoutRetiredHook(raw, path) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { fail(`${path} is not valid JSON; retired hook was not changed`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.hooks) return raw;

  const DROP = Symbol("drop");
  const scrub = (value) => {
    if (Array.isArray(value)) return value.map(scrub).filter((x) => x !== DROP);
    if (!value || typeof value !== "object") return value;
    if (typeof value.command === "string" && value.command.includes("carrier-arg-hook")) return DROP;
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const next = scrub(child);
      // A matcher/event shell emptied by removing the retired command is dead
      // configuration. Preserve arrays that were already empty.
      if (next !== DROP && !(Array.isArray(child) && child.length > 0 && Array.isArray(next) && next.length === 0))
        out[key] = next;
    }
    if (Array.isArray(value.hooks) && value.hooks.length > 0 && !Object.hasOwn(out, "hooks")) return DROP;
    return out;
  };
  const nextHooks = scrub(parsed.hooks);
  if (nextHooks === DROP || (nextHooks && typeof nextHooks === "object" && !Array.isArray(nextHooks) && Object.keys(nextHooks).length === 0))
    delete parsed.hooks;
  else parsed.hooks = nextHooks;
  const next = `${JSON.stringify(parsed, null, 2)}\n`;
  return JSON.stringify(JSON.parse(raw)) === JSON.stringify(parsed) ? raw : next;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root);
  const floorSource = resolve(args.floor);
  if (!existsSync(floorSource)) fail(`floor source does not exist: ${floorSource}`);
  const runtimeHome = resolve(root, args["runtime-home"] ?? DEFAULT_RUNTIME);
  const runtimeRel = relative(root, runtimeHome);
  if (runtimeRel === "" || runtimeRel === ".." || runtimeRel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(runtimeRel))
    fail("runtime home must be a child of the harness root");

  // Resolve all conflicts before the first write.
  const rootStates = ROOT_FILES.map((file) => ({ file, raw: read(join(root, file)) }));
  const locals = rootStates.filter((x) => x.raw !== null).map((x) => ({ file: x.file, local: extractLocal(x.raw, x.file) }));
  const distinctLocals = new Set(locals.map((x) => x.local));
  if (distinctLocals.size > 1)
    fail(`root instruction custom content diverges (${locals.map((x) => x.file).join(" vs ")}); reconcile explicitly`);
  const local = locals[0]?.local ?? "";
  const projection = rootProjection(runtimeRel, local);

  const sharedBindings = join(runtimeHome, "bindings.yaml");
  // Legacy homes are migration inputs only. Once the shared home exists it is
  // authoritative; otherwise preserved legacy copies would become false drift
  // after a legitimate shared binding edit.
  const bindingCandidates = existsSync(sharedBindings)
    ? [...(args.bindings ? [resolve(args.bindings)] : []), sharedBindings]
    : [
        ...(args.bindings ? [resolve(args.bindings)] : []),
        join(root, ".claude", "bindings.yaml"),
        join(root, ".codex", "bindings.yaml"),
      ];
  const bindingSources = uniqueExisting([...new Set(bindingCandidates)]);
  if (new Set(bindingSources.map((x) => x.content)).size > 1)
    fail(`bindings diverge (${bindingSources.map((x) => relative(root, x.path)).join(", ")}); reconcile explicitly`);
  const bindingContent = bindingSources[0]?.content ?? null;
  if (bindingContent === null)
    fail("shared bindings are missing; pass --bindings or restore one legacy bindings.yaml before materializing");

  const settingsPath = join(root, ".claude", "settings.json");
  const settingsRaw = read(settingsPath);
  const settingsNext = settingsRaw === null ? null : settingsWithoutRetiredHook(settingsRaw, settingsPath);
  const floorTarget = join(runtimeHome, "always-on", "sg-root-instructions.md");
  const floor = readFileSync(floorSource, "utf8");

  const violations = [];
  if (rootStates.some((x) => x.raw !== projection)) violations.push("root projections differ");
  if (read(floorTarget) !== floor) violations.push("shared floor differs");
  if (read(sharedBindings) !== bindingContent) violations.push("shared bindings differ");
  if (settingsNext !== null && settingsNext !== settingsRaw) violations.push("retired carrier hook remains");
  if (args.mode === "check") {
    if (violations.length) fail(violations.join("; "));
    process.stdout.write("harness-lifecycle: clean\n");
    return;
  }

  let writes = 0;
  for (const { file } of rootStates) writes += Number(atomicWrite(join(root, file), projection));
  writes += Number(atomicWrite(floorTarget, floor));
  writes += Number(atomicWrite(sharedBindings, bindingContent));
  if (settingsNext !== null) writes += Number(atomicWrite(settingsPath, settingsNext));
  process.stdout.write(`harness-lifecycle: materialized ${writes} changed file(s)\n`);
}

try { main(); } catch (error) {
  // Clean up a same-directory temp left by an interrupted atomic write where possible.
  if (error && typeof error === "object" && "path" in error) {
    const temp = `${error.path}.stack-graph-tmp`;
    if (existsSync(temp)) rmSync(temp, { force: true });
  }
  fail(error instanceof Error ? error.message : String(error));
}
