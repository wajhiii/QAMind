import { execFileSync } from "node:child_process";

function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch {
    return undefined;
  }
}

export interface GitInfo {
  is_repo: boolean;
  branch?: string;
  commit?: string;
  base?: string;
  dirty?: boolean;
  /** Files changed against the base branch plus uncommitted work (capped). Used by `diff` mode. */
  changed_files: string[];
}

export function gitInfo(root: string): GitInfo {
  if (git(root, ["rev-parse", "--is-inside-work-tree"]) !== "true") return { is_repo: false, changed_files: [] };
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const commit = git(root, ["rev-parse", "--short", "HEAD"]);
  const status = git(root, ["status", "--porcelain"]) ?? "";
  const originHead = git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  const candidates = [originHead, "main", "master"].filter((x): x is string => !!x);
  const base = candidates.find((c) => git(root, ["rev-parse", "--verify", "--quiet", c]) !== undefined);
  const changed = new Set<string>();
  if (base && branch && branch !== base.replace(/^origin\//, "")) {
    for (const f of (git(root, ["diff", "--name-only", `${base}...HEAD`]) ?? "").split("\n")) if (f) changed.add(f);
  }
  for (const line of status.split("\n")) {
    const file = line.slice(3).trim().replace(/^.* -> /, "");
    if (file && !file.startsWith(".qa/")) changed.add(file);
  }
  return {
    is_repo: true,
    ...(branch ? { branch } : {}),
    ...(commit ? { commit } : {}),
    ...(base ? { base } : {}),
    dirty: status.length > 0,
    changed_files: [...changed].slice(0, 300),
  };
}
