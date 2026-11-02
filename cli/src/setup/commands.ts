import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { HostContext, LoadedHost, Op, OpKind } from "../../../hosts/host-api.ts";
import { renderRuntime } from "../../../hosts/render.ts";
import { discoverHosts, defaultHostsDir } from "../../../hosts/registry.ts";
import { ApplyError, applyOps, makeRunner, revertOps, verifyApplied } from "./ops.ts";
import type { Applied, CommandRunner } from "./ops.ts";
import { installsPath, loadInstalls, sameInstall, updateInstalls } from "./installs.ts";
import type { InstallRecord } from "./installs.ts";

/**
 * `qamind setup | status | update | uninstall` (spec 5.1 and 5.2). Everything a host needs is described by its adapter as a list of edits; this file renders the host's
 * runtime folder, applies the edits through the engine, records what it did, and later reports on it, updates it, or takes it away again.
 */
export interface Base {
  repoRoot: string;
  /** The QAMind user store. Never deleted from, except by an explicit, confirmed purge. */
  home: string;
  userHome: string;
  env: NodeJS.ProcessEnv;
  hostsDir?: string;
  /** Where rendered runtimes go: `<repoRoot>/build` by default (git-ignored). */
  buildRoot?: string;
  run?: CommandRunner;
  now?: Date;
}

const buildRootOf = (b: Base): string => b.buildRoot ?? path.join(b.repoRoot, "build");
const hostsDirOf = (b: Base): string => b.hostsDir ?? defaultHostsDir(b.repoRoot);
const versionOf = (repoRoot: string): string => (JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version: string }).version;

const contextFor = (b: Base, host: LoadedHost, scope: "user" | "project", projectDir: string): HostContext => ({
  repoRoot: b.repoRoot,
  runtimeDir: path.join(buildRootOf(b), host.id),
  userHome: b.userHome,
  scope,
  projectDir,
  version: versionOf(b.repoRoot),
  env: b.env,
  home: b.home,
});

// ------------------------------------------------------------------------------------------------ the launcher

const LAUNCHER = "_launcher";

function launcherOps(b: Base): { ops: Op[]; dir: string } {
  const win = process.platform === "win32";
  const dir = win ? path.join(b.userHome, ".qamind", "bin") : path.join(b.userHome, ".local", "bin");
  const entry = path.join(b.repoRoot, "bin", "qamind.mjs");
  const file = path.join(dir, win ? "qamind.cmd" : "qamind");
  const content = win ? `@echo off\r\nnode "${entry}" %*\r\n` : `#!/bin/sh\n# Installed by QAMind setup. Runs the QAMind command from ${b.repoRoot}.\nexec node "${entry}" "$@"\n`;
  return { dir, ops: [{ op: "file", kind: "launcher", path: file, content, mode: 0o755 }] };
}

// ------------------------------------------------------------------------------------------------ setup

export interface SetupRequest extends Base {
  /** Host ids, or "auto": every tool QAMind finds on this machine (never the generic host). */
  hosts: string[] | "auto";
  scope: "user" | "project";
  projectDir: string;
  /** Install the `qamind` command on the user's PATH. */
  launcher?: boolean;
  dryRun?: boolean;
}

export interface HostReport {
  id: string;
  tier: string;
  found: boolean;
  detectNote?: string;
  runtime?: string;
  changed: string[];
  unchanged: string[];
  notes: string[];
  skipped?: string;
  plan?: string[];
}

export interface SetupReport {
  hosts: HostReport[];
  launcher?: { file: string; onPath: boolean; dir: string; changed: boolean };
  problems: string[];
}

const describeOp = (op: Op): string => (op.op === "file" ? `write ${op.path}` : op.op === "json" ? `set ${op.keyPath.join(".")} in ${op.path}` : op.op === "block" ? `add a QAMind section to ${op.path}` : `run: ${op.run.join(" ")}`);

export async function setupHosts(r: SetupRequest): Promise<SetupReport> {
  const all = await discoverHosts(hostsDirOf(r));
  const run = r.run ?? makeRunner(r.env);
  const report: SetupReport = { hosts: [], problems: [] };
  let chosen: LoadedHost[];
  if (r.hosts === "auto") {
    chosen = all.filter((h) => h.id !== "generic" && h.adapter.detect(contextFor(r, h, r.scope, r.projectDir)).found);
    if (chosen.length === 0) report.problems.push(`No supported tool was found on this machine (looked for: ${all.filter((h) => h.id !== "generic").map((h) => h.id).join(", ")}). Name one with --host, or use --host generic for any agent that reads AGENTS.md.`);
  } else {
    chosen = r.hosts.map((id) => {
      const h = all.find((x) => x.id === id);
      if (!h) throw new Error(`Unknown host "${id}". Known hosts: ${all.map((x) => x.id).join(", ")}.`);
      return h;
    });
  }
  const stamp = (r.now ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(r.home, "backups", "hosts", stamp);

  for (const host of chosen) {
    const ctx = contextFor(r, host, r.scope, r.projectDir);
    const det = host.adapter.detect(ctx);
    const rep: HostReport = { id: host.id, tier: host.json.tier, found: det.found, ...(det.note ? { detectNote: det.note } : {}), changed: [], unchanged: [], notes: [] };
    report.hosts.push(rep);
    if (!det.found && host.json["requires_host"] === true) {
      rep.skipped = det.note ?? `${host.json.name} was not found.`;
      continue;
    }
    const runtime = host.json["runtime"] !== false;
    if (runtime) {
      renderRuntime({ repoRoot: r.repoRoot, runtimeDir: ctx.runtimeDir, host: host.json, values: host.adapter.placeholders(ctx, host.json) });
      rep.runtime = ctx.runtimeDir;
    }
    const plan = host.adapter.plan(ctx, host.json);
    if (r.dryRun) {
      rep.plan = plan.map(describeOp);
      if (runtime) fs.rmSync(ctx.runtimeDir, { recursive: true, force: true });
      continue;
    }
    const key = { host: host.id, scope: r.scope, ...(r.scope === "project" ? { project: r.projectDir } : {}) };
    const prior = loadInstalls(r.home).installs.find((x) => sameInstall(x, key));
    const record = (entries: Applied[]): InstallRecord => ({ ...key, version: ctx.version, installed_at: prior?.installed_at ?? (r.now ?? new Date()).toISOString(), updated_at: (r.now ?? new Date()).toISOString(), ...(runtime ? { runtime: ctx.runtimeDir } : {}), user_home: r.userHome, entries });
    try {
      const done = applyOps(plan, prior?.entries ?? [], { backupDir, run });
      // Edits recorded before that this plan no longer makes (a renamed skill, a dropped hook) are taken away again.
      const stale = (prior?.entries ?? []).filter((e) => !done.applied.some((a) => sameEdit(a, e)));
      if (stale.length) revertOps(stale, run);
      updateInstalls(r.home, key, record(done.applied));
      rep.changed = done.changed;
      rep.unchanged = done.unchanged;
    } catch (err) {
      if (err instanceof ApplyError) {
        updateInstalls(r.home, key, record([...(prior?.entries.filter((e) => !err.applied.some((a) => sameEdit(a, e))) ?? []), ...err.applied]));
        report.problems.push(`${host.id}: ${err.message} What was done before that is recorded, so \`qamind uninstall --host ${host.id}\` still removes it.`);
        continue;
      }
      throw err;
    }
    rep.notes = host.adapter.notes(ctx, host.json);
  }

  if (r.launcher !== false && !r.dryRun && report.hosts.some((h) => !h.skipped)) {
    const l = launcherOps(r);
    const key = { host: LAUNCHER, scope: "user" as const };
    const prior = loadInstalls(r.home).installs.find((x) => sameInstall(x, key));
    const done = applyOps(l.ops, prior?.entries ?? [], { backupDir, run });
    updateInstalls(r.home, key, { ...key, version: versionOf(r.repoRoot), installed_at: prior?.installed_at ?? (r.now ?? new Date()).toISOString(), updated_at: (r.now ?? new Date()).toISOString(), user_home: r.userHome, entries: done.applied });
    const onPath = (r.env["PATH"] ?? "").split(path.delimiter).some((d) => path.resolve(d || ".") === path.resolve(l.dir));
    report.launcher = { file: (l.ops[0] as { path: string }).path, onPath, dir: l.dir, changed: done.changed.length > 0 };
  }
  return report;
}

const sameEdit = (a: Applied, b: Applied): boolean => a.op === b.op && (a.path ?? "") === (b.path ?? "") && (a.keyPath ?? []).join(".") === (b.keyPath ?? []).join(".") && (a.arrayMatch?.equals ?? "") === (b.arrayMatch?.equals ?? "") && (a.id ?? "") === (b.id ?? "") && (a.label ?? "") === (b.label ?? "");

// ------------------------------------------------------------------------------------------------ status

export interface StatusRow {
  host: string;
  name: string;
  tier: string;
  scope: string;
  project?: string;
  version: string;
  installed_at: string;
  auto_qa: string;
  safety: string;
  runtime?: string;
  runtime_present?: boolean;
  host_found: boolean;
  /** For each kind of edit: how many are in place of how many setup made. */
  checks: Partial<Record<OpKind | "other", { ok: number; total: number }>>;
  problems: string[];
  ok: boolean;
}

export interface StatusReport {
  app: { repoRoot: string; version: string; ref?: string };
  installs: StatusRow[];
  launcher?: { present: boolean; file?: string };
  store: string;
}

export async function statusReport(b: Base, filter: { project?: string } = {}): Promise<StatusReport> {
  const all = await discoverHosts(hostsDirOf(b));
  const run = b.run ?? makeRunner(b.env);
  const file = loadInstalls(b.home);
  const rows: StatusRow[] = [];
  for (const rec of file.installs) {
    if (rec.host === LAUNCHER) continue;
    if (filter.project && rec.scope === "project" && path.resolve(rec.project ?? "") !== path.resolve(filter.project)) continue;
    const host = all.find((h) => h.id === rec.host);
    const problems: string[] = [];
    const checks: StatusRow["checks"] = {};
    for (const c of verifyApplied(rec.entries, run)) {
      const k = c.kind ?? "other";
      const slot = (checks[k] ??= { ok: 0, total: 0 });
      slot.total++;
      if (c.ok) slot.ok++;
      else problems.push(`${c.label}: ${c.detail}`);
    }
    const runtimePresent = rec.runtime ? fs.existsSync(path.join(rec.runtime, "dist", "qa-memory.mjs")) && fs.existsSync(path.join(rec.runtime, "core")) : undefined;
    if (rec.runtime && !runtimePresent) problems.push(`the rendered runtime ${rec.runtime} is missing or incomplete: run \`qamind setup --host ${rec.host}\` again`);
    if (!host) problems.push(`no hosts/${rec.host}/ definition in this checkout: it cannot be updated, only uninstalled`);
    const found = host ? host.adapter.detect({ ...contextFor(b, host, rec.scope, rec.project ?? process.cwd()), userHome: rec.user_home }).found : false;
    rows.push({
      host: rec.host,
      name: host?.json.name ?? rec.host,
      tier: host?.json.tier ?? "unknown",
      scope: rec.scope,
      ...(rec.project ? { project: rec.project } : {}),
      version: rec.version,
      installed_at: rec.installed_at,
      auto_qa: host?.json.auto_qa.mode ?? "unknown",
      safety: host?.json.safety ?? "unknown",
      ...(rec.runtime ? { runtime: rec.runtime, runtime_present: runtimePresent as boolean } : {}),
      host_found: found,
      checks,
      problems,
      ok: problems.length === 0,
    });
  }
  const launcherRec = file.installs.find((x) => x.host === LAUNCHER);
  const launcherFile = launcherRec?.entries[0]?.path;
  const ref = spawnSync("git", ["-C", b.repoRoot, "describe", "--tags", "--always", "--dirty"], { encoding: "utf8" });
  return {
    app: { repoRoot: b.repoRoot, version: versionOf(b.repoRoot), ...(ref.status === 0 ? { ref: ref.stdout.trim() } : {}) },
    installs: rows,
    ...(launcherRec ? { launcher: { present: !!launcherFile && fs.existsSync(launcherFile), ...(launcherFile ? { file: launcherFile } : {}) } } : {}),
    store: b.home,
  };
}

// ------------------------------------------------------------------------------------------------ uninstall

export interface UninstallRequest extends Base {
  hosts: string[] | "all";
  scope?: "user" | "project";
  projectDir?: string;
  /** Delete the user's memory, lessons and settings too. Only with `confirm`. */
  purge?: boolean;
  confirm?: boolean;
}

export interface UninstallReport {
  hosts: Array<{ id: string; scope: string; removed: string[]; kept: string[] }>;
  launcher_removed: boolean;
  purged?: string[];
  problems: string[];
}

/** The files and folders that make up the user store. The install folder (which may live inside the same folder) is not among them. */
export const STORE_ENTRIES = ["projects", "state", "backups", "installs.json", "pending-lessons.md", "global-lessons.md", "rejected-lessons.jsonl", "lesson-use.json", "auto.json", ".lock", "memory.lock"];

export async function uninstallHosts(r: UninstallRequest): Promise<UninstallReport> {
  const run = r.run ?? makeRunner(r.env);
  const report: UninstallReport = { hosts: [], launcher_removed: false, problems: [] };
  const file = loadInstalls(r.home);
  const wanted = file.installs.filter((x) => x.host !== LAUNCHER && (r.hosts === "all" || r.hosts.includes(x.host)) && (!r.scope || x.scope === r.scope) && (r.scope !== "project" || !r.projectDir || path.resolve(x.project ?? "") === path.resolve(r.projectDir)));
  if (r.hosts !== "all") for (const id of r.hosts) if (!wanted.some((x) => x.host === id)) report.problems.push(`${id}: nothing is installed${r.scope ? ` at ${r.scope} level` : ""}.`);
  for (const rec of wanted) {
    const res = revertOps(rec.entries, run);
    if (rec.runtime) fs.rmSync(rec.runtime, { recursive: true, force: true });
    updateInstalls(r.home, rec, undefined);
    report.hosts.push({ id: rec.host, scope: rec.scope, removed: res.removed, kept: res.kept });
  }
  const left = loadInstalls(r.home).installs.filter((x) => x.host !== LAUNCHER);
  const launcher = loadInstalls(r.home).installs.find((x) => x.host === LAUNCHER);
  if (launcher && left.length === 0) {
    revertOps(launcher.entries, run);
    updateInstalls(r.home, launcher, undefined);
    report.launcher_removed = true;
  }
  // Empty folders that only setup's own bookkeeping needed (the lock, the backups of host files) go once nothing is left in them.
  for (const dir of [buildRootOf(r), path.join(r.home, "backups", "hosts"), path.join(r.home, "backups"), path.join(r.home, "state"), r.home]) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      /* not empty, or not ours to remove */
    }
  }
  if (r.purge) {
    if (!r.confirm) {
      report.problems.push("--purge deletes your QAMind memory, run history, lessons and settings (the user store). Nothing was deleted: add --yes to confirm.");
    } else {
      report.purged = [];
      for (const name of STORE_ENTRIES) {
        const p = path.join(r.home, name);
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true });
          report.purged.push(p);
        }
      }
      try {
        if (fs.readdirSync(r.home).length === 0) fs.rmdirSync(r.home);
      } catch {
        /* the install folder may live inside it */
      }
    }
  }
  return report;
}

// ------------------------------------------------------------------------------------------------ update

export interface UpdateRequest extends Base {
  /** `v1.2.0`: install that release. Absent: the latest release tag. */
  version?: string;
  /** No release tag exists yet: follow the branch this checkout is on. */
  edge?: boolean;
  /** Skip `npm ci` and the build (tests, and checkouts that are already built). */
  skipBuild?: boolean;
}

export interface UpdateReport {
  from: string;
  to: string;
  reinstalled: Array<{ host: string; scope: string }>;
  built: boolean;
  problems: string[];
}

const git = (repo: string, ...args: string[]): { ok: boolean; out: string } => {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim() };
};

/** Build QAMind from source the way a user's checkout needs it: dependencies from the lockfile, then the bundles and the generated plugin. */
export function buildApp(repoRoot: string): void {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  for (const [cmd, args] of [[npm, ["ci"]], [process.execPath, ["scripts/build.ts"]]] as const) {
    const r = spawnSync(cmd, [...args], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" && cmd === npm });
    if (r.status !== 0) throw new Error(`\`${cmd} ${args.join(" ")}\` failed in ${repoRoot}.`);
  }
}

/** Move this checkout to a release (or, with `edge`, to the tip of its branch). Refuses to run over uncommitted changes. */
export function checkoutTarget(repoRoot: string, t: { version?: string; edge?: boolean }): { from: string; to: string } {
  if (!git(repoRoot, "rev-parse", "--git-dir").ok) throw new Error(`${repoRoot} is not a git checkout, so there is nothing to update from. Reinstall with git clone (see the README).`);
  // The generated plugin folder is rebuilt by setup and update, so a difference there is not the user's change: it is put back before moving. Anything else dirty is theirs.
  const mine = git(repoRoot, "status", "--porcelain", "--", ".", ":(exclude)plugins/qamind", ":(exclude)build");
  if (mine.out !== "") throw new Error(`${repoRoot} has uncommitted changes. QAMind does not move over them: commit or discard them first.`);
  git(repoRoot, "checkout", "--quiet", "--", "plugins/qamind");
  git(repoRoot, "clean", "-fdq", "--", "plugins/qamind"); // generated files an earlier build left that the target release tracks would block the checkout (ignored files, like node_modules, stay)
  const from = git(repoRoot, "describe", "--tags", "--always").out;
  const fetched = git(repoRoot, "fetch", "--tags", "--prune", "--quiet");
  if (!fetched.ok) throw new Error(`Could not fetch from the repository: ${fetched.out}`);
  if (t.edge && !t.version) {
    const pulled = git(repoRoot, "pull", "--ff-only", "--quiet");
    if (!pulled.ok) throw new Error(`Could not fast-forward this checkout: ${pulled.out}`);
  } else {
    const tags = git(repoRoot, "tag", "--list", "v[0-9]*", "--sort=-v:refname").out.split("\n").filter(Boolean);
    const tag = t.version ?? tags[0];
    if (!tag) throw new Error("This repository has no release tags yet (releases are Git tags like v1.2.0), so there is no tested release to move to. Use --edge to follow the branch, or --version vX.Y.Z.");
    if (!git(repoRoot, "rev-parse", "--verify", "--quiet", `refs/tags/${tag}`).ok) throw new Error(`There is no release ${tag}. Releases: ${tags.slice(0, 5).join(", ") || "none"}.`);
    const co = git(repoRoot, "checkout", "--quiet", tag);
    if (!co.ok) throw new Error(`Could not check out ${tag}: ${co.out}`);
  }
  return { from, to: git(repoRoot, "describe", "--tags", "--always").out };
}

export async function updateApp(r: UpdateRequest): Promise<UpdateReport> {
  const report: UpdateReport = { from: "", to: "", reinstalled: [], built: false, problems: [] };
  const moved = checkoutTarget(r.repoRoot, { ...(r.version ? { version: r.version } : {}), ...(r.edge ? { edge: r.edge } : {}) });
  report.from = moved.from;
  report.to = moved.to;
  if (!r.skipBuild) {
    buildApp(r.repoRoot);
    report.built = true;
  }
  // Re-render and re-apply every install that exists, with the same scope and project.
  for (const rec of loadInstalls(r.home).installs) {
    if (rec.host === LAUNCHER) continue;
    const res = await setupHosts({ ...r, hosts: [rec.host], scope: rec.scope, projectDir: rec.project ?? process.cwd(), userHome: rec.user_home, launcher: false });
    report.problems.push(...res.problems);
    report.reinstalled.push({ host: rec.host, scope: rec.scope });
  }
  return report;
}

export { installsPath };
