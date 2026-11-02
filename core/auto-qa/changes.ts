import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { git, headCommit, isRepo, statusEntries } from "../lib/fix/gitops.ts";
import { globToRegExp } from "../lib/fix/protect.ts";

/**
 * What did a task change? At the start of a task the project is snapshotted (a content hash of every changed or untracked file and HEAD); at the end
 * the same is taken again. A file counts as changed by the task when its hash differs, which keeps work that was already in progress out of it, and
 * commits made during the task are found through HEAD. QAMind's own folders and its `.gitignore` entries never count.
 */
const MAX_FILES = 2000;
const BIG = 5 * 1024 * 1024;

export interface Snapshot {
  head?: string;
  files: Record<string, string>;
  truncated: boolean;
}

function hashFile(abs: string): string {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return "not-a-file";
    if (st.size > BIG) return `big:${st.size}:${Math.round(st.mtimeMs)}`;
    return crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
  } catch {
    return "deleted";
  }
}

/** The snapshot of the project, or undefined outside a git repository. */
export function takeSnapshot(root: string): Snapshot | undefined {
  if (!isRepo(root)) return undefined;
  const head = headCommit(root);
  const entries = statusEntries(root);
  const files: Record<string, string> = {};
  for (const e of entries.slice(0, MAX_FILES)) files[e.path] = hashFile(path.join(root, e.path));
  return { ...(head ? { head } : {}), files, truncated: entries.length > MAX_FILES };
}

/** Anything that matches one of the globs is not code worth a QA run (documentation, lock files, ...). */
export function ignorer(globs: readonly string[]): (file: string) => boolean {
  const rules = globs.map((g) => globToRegExp(g));
  return (file) => rules.some((r) => r.test(file));
}

/**
 * The files the task changed, sorted. With the snapshot from the start of the task that is exact; without one, every file that differs from HEAD now
 * (the caller decides whether that is good enough).
 */
export function changedInTask(root: string, start: Snapshot | undefined, now: Snapshot, ignore: readonly string[]): string[] {
  const out = new Set<string>();
  if (start) {
    for (const p of new Set([...Object.keys(start.files), ...Object.keys(now.files)])) if (start.files[p] !== now.files[p]) out.add(p);
    if (start.head && now.head && start.head !== now.head) {
      // --relative reports paths from the project folder and leaves out the rest of a larger repository.
      const r = git(root, ["diff", "--name-only", "--relative", "-z", start.head, now.head]);
      for (const f of r.out.split("\0").filter(Boolean)) out.add(f);
    }
  } else for (const p of Object.keys(now.files)) out.add(p);
  const skip = ignorer(ignore);
  return [...out].filter((f) => !skip(f) && !/^\.qa\//.test(f) && !/^\.env\.qa(\.|$)/.test(f)).sort();
}

/** One hash for the whole state of the working tree (HEAD plus every changed file), to tell "nothing new since the last auto run". */
export function stateHash(now: Snapshot, ignore: readonly string[]): string {
  const skip = ignorer(ignore);
  const h = crypto.createHash("sha256");
  h.update(`head:${now.head ?? "none"}\n`);
  for (const p of Object.keys(now.files).sort()) if (!skip(p)) h.update(`${p}\0${now.files[p]}\n`);
  return h.digest("hex");
}
