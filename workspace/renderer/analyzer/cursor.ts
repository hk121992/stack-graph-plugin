// cursor.ts — the analyzer's per-transcript skip-cache (Cluster A §9, idempotency S2).
//
// PERFORMANCE OPTIMISATION ONLY. The analyzer FULL-REWRITES analyzer-events.jsonl every run in
// canonical sorted order, so correctness NEVER depends on the cursor — a `--no-cursor` full
// rebuild produces the byte-identical file. The cursor only lets a re-run skip re-reading a
// transcript whose bytes are unchanged (same size + mtime, cross-checked by a sha256 of the head).
//
// PORTABILITY: node `fs`/`crypto` + `JSON` only — no Bun.* globals (matches lib/transcript-usage.ts),
// so the analyzer runs under both `bun` (renderer) and `node`.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, statSync, openSync, readSync, closeSync } from "node:fs";

/** How many head bytes to hash for the change-detection cross-check. A transcript that grows by
 *  append keeps its head stable; a rewrite (rare for Claude transcripts) changes size+mtime AND the
 *  head hash, so it is re-read. */
const HEAD_BYTES = 4096;

/** One transcript's cache entry. `last_offset` records the byte length already processed so a grown
 *  transcript could be read from there (the analyzer re-derives whole-transcript rows regardless, so
 *  this is informational/forward-compat, not load-bearing for correctness). */
export interface CursorEntry {
  path: string;
  size: number;
  mtime: number;
  sha256_head: string;
  last_offset: number;
}

export interface CursorFile {
  v: string;
  entries: Record<string, CursorEntry>;
}

const CURSOR_V = "1";

/** Hash the first HEAD_BYTES of a file (or the whole file if smaller). Pure, never throws — an
 *  unreadable file yields an empty-string hash so the caller treats it as changed. */
export function sha256Head(filePath: string): string {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buf, 0, HEAD_BYTES, 0);
    return createHash("sha256").update(buf.subarray(0, read)).digest("hex");
  } catch {
    return "";
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/** The change-detection signature of a transcript on disk: size, mtime, head hash. */
export function fileSignature(filePath: string): { size: number; mtime: number; sha256_head: string } {
  const st = statSync(filePath);
  return { size: st.size, mtime: Math.floor(st.mtimeMs), sha256_head: sha256Head(filePath) };
}

/** Load the cursor file. A missing/malformed cursor → an empty cache (correctness is independent of
 *  the cursor, so a corrupt cache is simply discarded, never fatal). */
export function loadCursor(cursorPath: string): CursorFile {
  if (!existsSync(cursorPath)) return { v: CURSOR_V, entries: {} };
  try {
    const obj = JSON.parse(readFileSync(cursorPath, "utf8")) as Partial<CursorFile>;
    if (!obj || typeof obj !== "object" || typeof obj.entries !== "object" || obj.entries === null) {
      return { v: CURSOR_V, entries: {} };
    }
    return { v: CURSOR_V, entries: obj.entries as Record<string, CursorEntry> };
  } catch {
    return { v: CURSOR_V, entries: {} };
  }
}

/** Decide whether a transcript is UNCHANGED versus the cache (and may be skipped). A skip requires an
 *  exact match of size + mtime + head hash. Any difference (or no prior entry) → not skippable. */
export function isUnchanged(prev: CursorEntry | undefined, sig: { size: number; mtime: number; sha256_head: string }): boolean {
  if (!prev) return false;
  return prev.size === sig.size && prev.mtime === sig.mtime && prev.sha256_head === sig.sha256_head;
}

/** Persist the cursor. Written as pretty JSON for diff-friendliness; the cursor is a local-only,
 *  gitignored cache so its exact bytes are not a contract. */
export function saveCursor(cursorPath: string, cursor: CursorFile): void {
  const sorted: Record<string, CursorEntry> = {};
  for (const k of Object.keys(cursor.entries).sort()) sorted[k] = cursor.entries[k];
  writeFileSync(cursorPath, JSON.stringify({ v: CURSOR_V, entries: sorted }, null, 2) + "\n", "utf8");
}
