import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { git, headCommit, isRepo, statusEntries } from "../lib/fix/gitops.ts";
import { globToRegExp } from "../lib/fix/protect.ts";
import { workspaceRepos } from "../lib/project.ts";

/**
 * What did a task change? At the start of a task the project is snapshotted (a content hash of every changed or untracked file and HEAD); at the end
 * the same is taken again. A file counts as changed by the task when its hash differs, which keeps work that was already in progress out of it, and
 * commits made during the task are found through HEAD. QAMind's own folders and its `.gitignore` entries never count.
 */
const MAX_FILES = 2000;
const BIG = 5 * 1024 * 1024;

export interface Snapshot {
  head?: string;
  /** A workspace (a folder that holds several repositories): HEAD of each repository, by its folder. Its files are named under their repository's folder. */
  heads?: Record<string, string>;
  files: Record<string, string>;
  truncated: boolean;
}

/** Is there a git repository, or several in a workspace, to see a task's changes in? */
export const canSeeChanges = (root: string): boolean => isRepo(root) || workspaceRepos(root).length > 0;

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

/** The snapshot of the project, or undefined when there is no git repository to read (a workspace is read repository by repository). */
export function takeSnapshot(root: string): Snapshot | undefined {
  if (!isRepo(root)) return takeWorkspaceSnapshot(root);
  const head = headCommit(root);
  const entries = statusEntries(root);
  const files: Record<string, string> = {};
  for (const e of entries.slice(0, MAX_FILES)) files[e.path] = hashFile(path.join(root, e.path));
  return { ...(head ? { head } : {}), files, truncated: entries.length > MAX_FILES };
}

function takeWorkspaceSnapshot(root: string): Snapshot | undefined {
  const names = workspaceRepos(root).filter((n) => isRepo(path.join(root, n)));
  if (names.length === 0) return undefined;
  const heads: Record<string, string> = {};
  const files: Record<string, string> = {};
  let truncated = false;
  for (const name of names) {
    const dir = path.join(root, name);
    const head = headCommit(dir);
    if (head) heads[name] = head;
    for (const e of statusEntries(dir)) {
      if (Object.keys(files).length >= MAX_FILES) {
        truncated = true;
        break;
      }
      files[`${name}/${e.path}`] = hashFile(path.join(dir, e.path));
    }
  }
  return { heads, files, truncated };
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
    if (start.heads && now.heads) {
      for (const [name, was] of Object.entries(start.heads)) {
        const is = now.heads[name];
        if (!is || is === was) continue;
        for (const f of git(path.join(root, name), ["diff", "--name-only", "--relative", "-z", was, is]).out.split("\0").filter(Boolean)) out.add(`${name}/${f}`);
      }
    }
  } else for (const p of Object.keys(now.files)) out.add(p);
  const skip = ignorer(ignore);
  // In a workspace a repository's own .qa and .env.qa sit one folder down.
  const own = now.heads ? /^[^/]+\/(\.qa\/|\.env\.qa(\.|$))/ : undefined;
  return [...out].filter((f) => !skip(f) && !/^\.qa\//.test(f) && !/^\.env\.qa(\.|$)/.test(f) && !own?.test(f)).sort();
}

/** One hash for the whole state of the working tree (HEAD plus every changed file), to tell "nothing new since the last auto run". */
export function stateHash(now: Snapshot, ignore: readonly string[]): string {
  const skip = ignorer(ignore);
  const h = crypto.createHash("sha256");
  h.update(`head:${now.head ?? "none"}\n`);
  for (const [name, head] of Object.entries(now.heads ?? {}).sort(([a], [b]) => a.localeCompare(b))) h.update(`head:${name}:${head}\n`);
  for (const p of Object.keys(now.files).sort()) if (!skip(p)) h.update(`${p}\0${now.files[p]}\n`);
  return h.digest("hex");
}
