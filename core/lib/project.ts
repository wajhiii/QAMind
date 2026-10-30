import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, exists, readJson, writeJson } from "./fsutil.ts";
import { SCHEMA_VERSION, projectsRoot, storeDir, storeSubdirs } from "./paths.ts";

export interface ProjectInfo {
  id: string;
  name: string;
  root: string;
  idSource: "git-remote" | "path";
  gitRemote?: string;
}

export interface ProjectJson {
  schema_version: number;
  id: string;
  id_source: "git-remote" | "path";
  name: string;
  git_remote?: string;
  paths_seen: string[];
  created: string;
  last_seen: string;
}

/** `git@github.com:Owner/Repo.git`, `https://user:pw@github.com/Owner/Repo` → `github.com/owner/repo`. */
export function normalizeGitRemote(url: string): string | null {
  let s = url.trim();
  if (!s) return null;
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(s);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    s = `${scp[1]}/${scp[2]}`;
  } else {
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^[^@/]+@/, "");
  }
  s = s.replace(/[?#].*$/, "").replace(/\.git$/i, "").replace(/\/+$/, "").replace(/:\d+(?=\/)/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.join("/").toLowerCase();
}

function slug(text: string, max = 60): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "project"
  );
}

function sha(text: string, len: number): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, len);
}

function gitOutput(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export function isGitRepo(root: string): boolean {
  return gitOutput(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
}

/** Project ID: normalized `origin` URL when there is one (so clones share memory), else a hash of the real path. */
export function resolveProject(root: string): ProjectInfo {
  const real = fs.realpathSync(root);
  const name = path.basename(real);
  const remoteRaw = gitOutput(real, ["remote", "get-url", "origin"]);
  const remote = remoteRaw ? normalizeGitRemote(remoteRaw) : null;
  if (remote) {
    return { id: `${slug(remote.replace(/\//g, "-"))}-${sha(remote, 8)}`, name: remote.split("/").pop() ?? name, root: real, idSource: "git-remote", gitRemote: remote };
  }
  const key = process.platform === "win32" ? real.toLowerCase() : real;
  return { id: `path-${slug(name, 40)}-${sha(key, 12)}`, name, root: real, idSource: "path" };
}

const PROJECT_MARKERS = ["package.json", "composer.json", "pyproject.toml", "requirements.txt", "manage.py", "Gemfile", "pom.xml", "build.gradle", "go.mod", "Cargo.toml"];

/** Heuristic for Phase 0 step 0: is this folder a project QAMind could test? */
export function looksLikeProject(root: string): boolean {
  if (exists(path.join(root, ".qa", "config.md"))) return true;
  if (isGitRepo(root)) return true;
  if (PROJECT_MARKERS.some((m) => exists(path.join(root, m)))) return true;
  try {
    return fs.readdirSync(root).some((f) => f.endsWith(".csproj") || f.endsWith(".sln"));
  } catch {
    return false;
  }
}

/** Create the project's store folders and keep project.json current. Never touches the project folder. */
export function ensureProjectStore(home: string, info: ProjectInfo, now = new Date()): { store: string; project: ProjectJson } {
  const store = storeDir(home, info.id);
  const dirs = storeSubdirs(store);
  for (const d of Object.values(dirs)) ensureDir(d);
  const file = path.join(store, "project.json");
  const existing = readJson<ProjectJson>(file);
  if (existing && existing.schema_version > SCHEMA_VERSION) {
    throw new Error(
      `Memory for this project was written by a newer QAMind (schema ${existing.schema_version}, this is ${SCHEMA_VERSION}). Update QAMind before running.`,
    );
  }
  const stamp = now.toISOString();
  const project: ProjectJson = existing ?? {
    schema_version: SCHEMA_VERSION,
    id: info.id,
    id_source: info.idSource,
    name: info.name,
    ...(info.gitRemote ? { git_remote: info.gitRemote } : {}),
    paths_seen: [],
    created: stamp,
    last_seen: stamp,
  };
  if (!project.paths_seen.includes(info.root)) project.paths_seen.push(info.root);
  project.last_seen = stamp;
  writeJson(file, project);
  return { store, project };
}

export function listKnownProjects(home: string): Array<{ id: string; name: string; paths_seen: string[]; last_seen: string }> {
  const root = projectsRoot(home);
  if (!exists(root)) return [];
  const out: Array<{ id: string; name: string; paths_seen: string[]; last_seen: string }> = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = readJson<ProjectJson>(path.join(root, entry.name, "project.json"));
    if (p) out.push({ id: p.id, name: p.name, paths_seen: p.paths_seen, last_seen: p.last_seen });
  }
  return out.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
}
