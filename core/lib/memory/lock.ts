import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "../fsutil.ts";

/**
 * A project's memory is read, changed and rewritten as a whole, and the qa-memory server, the CLI and a second session can all be
 * doing that at once. One lock file per store makes each such change happen alone. The lock is held for milliseconds, a crashed
 * holder is detected (dead process or an old lock), and nothing is ever left locked: callers use `withStoreLock`.
 */
const WAIT_MS = 10_000;
const STALE_MS = 30_000;
const POLL_MS = 25;

const held = new Map<string, number>();

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isStale(file: string): boolean {
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age > STALE_MS) return true;
    const owner = JSON.parse(fs.readFileSync(file, "utf8")) as { pid?: number };
    return typeof owner.pid === "number" && !alive(owner.pid);
  } catch {
    return false; // vanished or half-written: the next attempt will find out
  }
}

export function lockFile(store: string): string {
  return path.join(store, "state", "memory.lock");
}

/** Runs `fn` while holding the store's memory lock. Re-entrant within one process. */
export function withStoreLock<T>(store: string, fn: () => T): T {
  const file = lockFile(store);
  const depth = held.get(file) ?? 0;
  if (depth > 0) {
    held.set(file, depth + 1);
    try {
      return fn();
    } finally {
      held.set(file, depth);
    }
  }
  ensureDir(path.dirname(file));
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      fs.closeSync(fd);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (isStale(file)) {
        fs.rmSync(file, { force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error("Another QAMind process is changing this project's memory and did not finish in 10 seconds. Try again in a moment.");
      sleep(POLL_MS);
    }
  }
  held.set(file, 1);
  try {
    return fn();
  } finally {
    held.delete(file);
    fs.rmSync(file, { force: true });
  }
}
