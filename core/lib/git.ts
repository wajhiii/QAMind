import { execFileSync } from "node:child_process";
import path from "node:path";
import { workspaceRepos } from "./project.ts";

function git(root: string, args: string[], raw = false): string | undefined {
  try {
    const out = execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 });
    return raw ? out : out.trim();
  } catch {
    return undefined;
  }
}

/**
 * The files `git status --porcelain` lists, with their status columns. The output must not be trimmed: the columns are fixed width, and " M file" loses its leading space (and then the first
 * character of the name) if the whole text is trimmed. `untracked: false` leaves out files git does not track.
 */
export function porcelainFiles(root: string, opts: { untracked?: boolean } = {}): string[] {
  const out = git(root, ["status", "--porcelain", ...(opts.untracked === false ? ["--untracked-files=no"] : [])], true) ?? "";
  return out.split("\n").filter(Boolean).map((line) => line.slice(3).trim().replace(/^.* -> /, ""));
}

export interface GitInfo {
  is_repo: boolean;
  branch?: string;
  commit?: string;
  base?: string;
  dirty?: boolean;
  /** Files changed against the base branch plus uncommitted work (capped). Used by `diff` mode. In a workspace each path starts with its repository's folder. */
  changed_files: string[];
  /** A workspace (a folder that holds several repositories, none of them the folder itself): what each one says, with `path` its folder. `is_repo` is false for the folder itself. */
  repos?: Array<{ path: string; is_repo: boolean; branch?: string; commit?: string; base?: string; dirty?: boolean; changed_files: string[] }>;
}

const MAX_CHANGED = 300;

/** The git state of a workspace: one entry per repository in it, and every changed file under its repository's folder. */
function workspaceGitInfo(root: string, names: string[]): GitInfo {
  const repos = names.map((name) => {
    const one = gitInfo(path.join(root, name));
    return { path: name, is_repo: one.is_repo, ...(one.branch ? { branch: one.branch } : {}), ...(one.commit ? { commit: one.commit } : {}), ...(one.base ? { base: one.base } : {}), ...(one.dirty !== undefined ? { dirty: one.dirty } : {}), changed_files: one.changed_files.map((f) => `${name}/${f}`) };
  });
  return { is_repo: false, repos, changed_files: repos.flatMap((r) => r.changed_files).slice(0, MAX_CHANGED) };
}

export function gitInfo(root: string): GitInfo {
  if (git(root, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    const names = workspaceRepos(root);
    return names.length ? workspaceGitInfo(root, names) : { is_repo: false, changed_files: [] };
  }
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const commit = git(root, ["rev-parse", "--short", "HEAD"]);
  const files = porcelainFiles(root);
  const originHead = git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  // A pull request in CI is checked out detached, with no local main: `qamind ci` names the base it fetched (`origin/<target branch>`).
  const candidates = [process.env["QAMIND_BASE_REF"], originHead, "main", "master"].filter((x): x is string => !!x);
  const base = candidates.find((c) => git(root, ["rev-parse", "--verify", "--quiet", c]) !== undefined);
  const changed = new Set<string>();
  if (base && branch && branch !== base.replace(/^origin\//, "")) {
    for (const f of (git(root, ["diff", "--name-only", `${base}...HEAD`]) ?? "").split("\n")) if (f) changed.add(f);
  }
  for (const file of files) if (file && !file.startsWith(".qa/")) changed.add(file);
  return {
    is_repo: true,
    ...(branch ? { branch } : {}),
    ...(commit ? { commit } : {}),
    ...(base ? { base } : {}),
    dirty: files.length > 0,
    changed_files: [...changed].slice(0, MAX_CHANGED),
  };
}
