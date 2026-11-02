import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * The few git operations the fix loop needs, run without a shell and with fixed arguments. There is deliberately no push, no pull, no
 * remote, no force and no reset here: a fix run commits locally to a branch and nothing leaves the machine (spec 9.3).
 */
export interface GitResult {
  ok: boolean;
  out: string;
  err: string;
  code: number;
}

export function git(root: string, args: string[], input?: string): GitResult {
  const r = spawnSync("git", ["-C", root, "-c", "core.quotepath=off", ...args], { encoding: "utf8", input, maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  return { ok: r.status === 0, out: (r.stdout ?? "").toString(), err: (r.stderr ?? "").toString().trim(), code: r.status ?? -1 };
}

const text = (r: GitResult): string => r.out.trim();

export const isRepo = (root: string): boolean => text(git(root, ["rev-parse", "--is-inside-work-tree"])) === "true";
export const headCommit = (root: string): string | undefined => {
  const r = git(root, ["rev-parse", "HEAD"]);
  return r.ok ? text(r) : undefined;
};
export const shortCommit = (root: string, sha: string): string => text(git(root, ["rev-parse", "--short", sha])) || sha.slice(0, 7);

/** The checked-out branch, or undefined on a detached HEAD. */
export function currentBranch(root: string): string | undefined {
  const r = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return r.ok ? text(r) : undefined;
}

/** The project's default branch: origin's HEAD when known, otherwise main or master if one exists. */
export function defaultBranch(root: string): string | undefined {
  const origin = git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (origin.ok && text(origin)) return text(origin).replace(/^origin\//, "");
  for (const name of ["main", "master"]) if (git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]).ok) return name;
  return undefined;
}

/** Where the project folder sits inside the repository ("" at the top, "app/" in a monorepo). git reports paths from the repository root. */
export function projectPrefix(root: string): string {
  return text(git(root, ["rev-parse", "--show-prefix"]));
}

/** A path as git reports it (from the repository root), made relative to the project folder; outside the folder it starts with "../". */
function fromRepoRoot(prefix: string, file: string): string {
  return prefix === "" ? file : path.posix.relative(prefix.replace(/\/$/, ""), file);
}

export interface StatusEntry {
  path: string;
  /** Index and working-tree status letters as git reports them ("??" for untracked). */
  code: string;
  untracked: boolean;
}

/** QAMind's own folders and credential file are not "work in progress", whatever .gitignore says. */
const QAMIND_OWN = /^(?:\.qa\/|\.env\.qa(?:$|\.))/;

const QAMIND_GITIGNORE_LINES = new Set(["# QAMind (private test credentials and reports)", ".env.qa", ".qa/"]);

/**
 * QAMind's first run appends its own lines to .gitignore (spec 7.1). That edit is not the user's work in progress, so it must not make the
 * tree look dirty: true when .gitignore differs from the committed one only by lines QAMind adds.
 */
export function gitignoreChangeIsQamindsOnly(root: string): boolean {
  const file = path.join(root, ".gitignore");
  if (!fs.existsSync(file)) return false;
  const committed = git(root, ["show", "HEAD:./.gitignore"]);
  const before = (committed.ok ? committed.out : "").split(/\r?\n/);
  const now = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let kept = 0;
  for (const line of now) {
    if (kept < before.length && line === before[kept]) kept++;
    else if (line.trim() === "" || QAMIND_GITIGNORE_LINES.has(line.trim())) continue;
    else return false;
  }
  return kept === before.length;
}

/** Changed and untracked files (ignored files are not listed), parsed from NUL-separated porcelain output so odd names are safe. */
export function statusEntries(root: string, opts: { includeQamind?: boolean } = {}): StatusEntry[] {
  const r = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!r.ok) throw new Error(`git status failed: ${r.err}`);
  const parts = r.out.split("\0");
  const prefix = projectPrefix(root);
  const out: StatusEntry[] = [];
  const gitignoreIsOurs = opts.includeQamind ? false : gitignoreChangeIsQamindsOnly(root);
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] as string;
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const file = fromRepoRoot(prefix, entry.slice(3));
    if (code[0] === "R" || code[0] === "C") i++; // a rename lists the old name next
    if (!opts.includeQamind && QAMIND_OWN.test(file)) continue;
    if (file === ".gitignore" && gitignoreIsOurs) continue;
    out.push({ path: file, code, untracked: code === "??" });
  }
  return out;
}

export function stagedFiles(root: string): string[] {
  const r = git(root, ["diff", "--cached", "--name-only", "-z"]);
  const prefix = projectPrefix(root);
  return r.out.split("\0").filter(Boolean).map((f) => fromRepoRoot(prefix, f)).filter((f) => !QAMIND_OWN.test(f));
}

/** The commit's added and deleted line counts for one tracked file, against HEAD. */
export function numstat(root: string, file: string): { added: number; deleted: number } | undefined {
  const r = git(root, ["diff", "--numstat", "HEAD", "--", file]);
  const m = /^(\d+|-)\t(\d+|-)\t/.exec(r.out);
  return m ? { added: m[1] === "-" ? 0 : Number(m[1]), deleted: m[2] === "-" ? 0 : Number(m[2]) } : undefined;
}

export const isTracked = (root: string, file: string): boolean => git(root, ["ls-files", "--error-unmatch", "--", file]).ok;

export function createBranch(root: string, name: string): GitResult {
  return git(root, ["switch", "-c", name]);
}

/** Put tracked files back to their committed content (working tree only: the index is not touched). */
export function restoreFromHead(root: string, files: string[]): GitResult {
  return git(root, ["restore", "--source=HEAD", "--worktree", "--", ...files]);
}

export function commitFiles(root: string, files: string[], message: string): GitResult & { sha?: string } {
  const add = git(root, ["add", "--", ...files]);
  if (!add.ok) return add;
  // Never --no-verify: the project's own hooks apply to a fix like any other commit.
  const c = git(root, ["commit", "-F", "-"], message);
  if (!c.ok) {
    git(root, ["reset", "--quiet", "--", ...files]); // unstage what we staged, so a failed hook leaves the index as it was
    return c;
  }
  const sha = headCommit(root);
  return sha ? { ...c, sha } : c;
}

export function revertCommit(root: string, sha: string): GitResult {
  return git(root, ["revert", "--no-edit", sha]);
}

export function commitMessageOf(root: string, sha: string): string {
  return git(root, ["log", "-1", "--format=%B", sha]).out.trim();
}

