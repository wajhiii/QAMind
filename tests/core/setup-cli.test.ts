import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkoutTarget, setupHosts, uninstallHosts } from "../../cli/src/setup/commands.ts";
import { files, repoRoot, sandbox } from "../conformance/harness.ts";
import { git, tmp } from "./helpers.ts";

// `qamind setup | status | update | uninstall` as a user runs them: through the launcher and the setup CLI, in a sandbox user home and store.

const LAUNCHER = path.join(repoRoot, "bin", "qamind.mjs");
const SETUP = path.join(repoRoot, "cli", "src", "setup-main.ts");

function run(sb: ReturnType<typeof sandbox>, args: string[], entry = SETUP, extra: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [entry, ...args], { encoding: "utf8", env: { ...sb.env, QAMIND_BUILD_DIR: path.join(sb.userHome, "..", `build-${path.basename(sb.userHome)}`), ...extra }, cwd: sb.project });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
const cleanup = (sb: ReturnType<typeof sandbox>): void => fs.rmSync(path.join(sb.userHome, "..", `build-${path.basename(sb.userHome)}`), { recursive: true, force: true });

test("the launcher sends setup, status, update and uninstall to the setup CLI, and everything else to the runtime CLI", () => {
  const sb = sandbox();
  const help = run(sb, ["setup", "--help"], LAUNCHER);
  assert.equal(help.status, 0, help.err);
  assert.match(help.out, /qamind setup \[--host auto\|claude\|cursor\|generic/);
  assert.match(help.out, /never touched by any of these except an explicit, confirmed --purge/);
  const version = run(sb, ["version"], LAUNCHER);
  assert.equal(version.status, 0, version.err);
  assert.match(JSON.parse(version.out).qamind, /^\d+\.\d+\.\d+/);
  const status = run(sb, ["status"], LAUNCHER);
  assert.equal(status.status, 0);
  assert.match(status.out, /Nothing is installed/);
  assert.equal(run(sb, ["uninstall"], LAUNCHER).status, 2, "uninstall needs to be told what to remove");
  // the plugin's own `qamind` does not pretend to do setup
  const plugin = run(sb, ["setup"], path.join(repoRoot, "plugins", "qamind", "dist", "qamind.mjs"));
  assert.notEqual(plugin.status, 0);
  assert.match(plugin.err, /runs from a QAMind checkout/);
});

test("setup, setup again, status, break it, status, uninstall: nothing is left, and the user's store is untouched", () => {
  const sb = sandbox();
  fs.mkdirSync(path.join(sb.store, "projects", "p1"), { recursive: true });
  fs.writeFileSync(path.join(sb.store, "global-lessons.md"), "# Global lessons\n");
  const first = run(sb, ["setup", "--host", "cursor", "--skip-build", "--no-launcher", "--json"]);
  assert.equal(first.status, 0, first.err + first.out);
  const rep = JSON.parse(first.out);
  assert.equal(rep.hosts[0].id, "cursor");
  assert.ok(rep.hosts[0].changed.length > 0);
  const second = JSON.parse(run(sb, ["setup", "--host", "cursor", "--skip-build", "--no-launcher", "--json"]).out);
  assert.deepEqual(second.hosts[0].changed, [], "idempotent");
  const ok = run(sb, ["status", "--json"]);
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.out).installs[0].ok, true);
  const text = run(sb, ["status"]).out;
  assert.match(text, /cursor \(experimental\) OK/);
  assert.match(text, /auto-QA: enforced; safety guard: instructions only/);

  fs.rmSync(path.join(sb.userHome, ".cursor", "hooks.json"));
  const broken = run(sb, ["status"]);
  assert.equal(broken.status, 1, "status exits non-zero when something is wrong");
  assert.match(broken.out, /PROBLEMS/);
  assert.match(broken.out, /hooks\.json.*missing/);

  const un = run(sb, ["uninstall", "--host", "cursor"]);
  assert.equal(un.status, 0, un.err);
  assert.match(un.out, /Your memory, run history and lessons were not touched/);
  assert.deepEqual(files(sb.userHome), [], "every file QAMind added is gone");
  assert.ok(!fs.existsSync(path.join(sb.userHome, "..", `build-${path.basename(sb.userHome)}`)), "and the rendered runtimes, folder included");
  assert.deepEqual(files(sb.store), ["global-lessons.md"], "and what the user had in the store is untouched, installs record gone");
  cleanup(sb);
});

test("setup puts a working `qamind` on the PATH and uninstall takes it away when the last host goes", { skip: process.platform === "win32" }, () => {
  const sb = sandbox();
  assert.equal(run(sb, ["setup", "--host", "cursor", "--skip-build"]).status, 0);
  assert.equal(run(sb, ["setup", "--host", "generic", "--project", "--skip-build"]).status, 0);
  const launcher = path.join(sb.userHome, ".local", "bin", "qamind");
  assert.ok(fs.existsSync(launcher));
  assert.ok((fs.statSync(launcher).mode & 0o111) !== 0, "executable");
  const v = spawnSync(launcher, ["version"], { encoding: "utf8", env: sb.env });
  assert.equal(v.status, 0, v.stderr);
  assert.match(JSON.parse(v.stdout).qamind, /^\d+\.\d+/);
  const s = run(sb, ["status"]).out;
  assert.match(s, /qamind command: .*\.local\/bin\/qamind/);
  run(sb, ["uninstall", "--host", "cursor"]);
  assert.ok(fs.existsSync(launcher), "another host still needs it");
  run(sb, ["uninstall", "--host", "generic", "--project"]);
  assert.ok(!fs.existsSync(launcher), "the last host is gone, so is the command");
  assert.ok(!fs.existsSync(path.join(sb.userHome, ".local")), "and the folders setup made for it");
  cleanup(sb);
});

test("--dry-run says what it would do and changes nothing; an unknown host is refused with the known ones", () => {
  const sb = sandbox();
  const dry = run(sb, ["setup", "--host", "cursor", "--skip-build", "--dry-run"]);
  assert.equal(dry.status, 0);
  assert.match(dry.out, /dry run: nothing was changed/);
  assert.match(dry.out, /would: write .*qamind-qa-only[\\/]SKILL\.md/);
  assert.deepEqual(files(sb.userHome), []);
  assert.deepEqual(files(sb.store), []);
  const bad = run(sb, ["setup", "--host", "emacs", "--skip-build"]);
  assert.equal(bad.status, 1);
  assert.match(bad.err, /Unknown host "emacs". Known hosts: claude, cursor, generic/);
  cleanup(sb);
});

test("--host NAME touches only that host; --host auto finds nothing when there is nothing to find", async () => {
  const sb = sandbox();
  const hostsDir = path.join(repoRoot, "hosts");
  const only = await setupHosts({ ...sb.base(hostsDir), hosts: ["generic"], scope: "project", projectDir: sb.project, launcher: false });
  assert.deepEqual(only.hosts.map((h) => h.id), ["generic"]);
  assert.ok(!fs.existsSync(path.join(sb.userHome, ".cursor")), "Cursor's folder was not touched");
  await uninstallHosts({ ...sb.base(hostsDir), hosts: "all" });
  // a checkout whose only tool is not installed on this machine: auto finds nothing and says what to do instead
  const lone = path.join(tmp("qamind-lonehosts-"), "hosts", "ghost");
  fs.mkdirSync(lone, { recursive: true });
  fs.writeFileSync(path.join(lone, "host.json"), JSON.stringify({ id: "ghost", name: "Ghost", tier: "experimental", auto_qa: { mode: "advisory" }, safety: "instructions", commands: {} }));
  fs.writeFileSync(path.join(lone, "adapter.ts"), 'export const adapter = { id: "ghost", detect: () => ({ found: false }), placeholders: () => ({}), plan: () => [], mcpRegistrations: () => [], skills: () => [], notes: () => [] };\n');
  const none = await setupHosts({ ...sb.base(path.dirname(lone)), hosts: "auto", scope: "user", projectDir: sb.project, launcher: false });
  assert.deepEqual(none.hosts, []);
  assert.match(none.problems[0] ?? "", /No supported tool was found on this machine \(looked for: ghost\).*--host generic/);
});

test("--purge deletes the user store only when confirmed, and never the install folder that may live inside it", async () => {
  const sb = sandbox();
  const home = sb.store;
  fs.mkdirSync(path.join(home, "projects", "p1", "memory"), { recursive: true });
  fs.mkdirSync(path.join(home, "app"), { recursive: true });
  fs.writeFileSync(path.join(home, "app", "keep.txt"), "the install folder");
  for (const f of ["pending-lessons.md", "global-lessons.md", "auto.json"]) fs.writeFileSync(path.join(home, f), "x");
  const hostsDir = path.join(repoRoot, "hosts");
  const refused = await uninstallHosts({ ...sb.base(hostsDir), hosts: "all", purge: true });
  assert.match(refused.problems[0] ?? "", /--purge deletes your QAMind memory.*add --yes/);
  assert.ok(fs.existsSync(path.join(home, "projects", "p1")), "nothing was deleted without confirmation");
  const done = await uninstallHosts({ ...sb.base(hostsDir), hosts: "all", purge: true, confirm: true });
  assert.ok((done.purged ?? []).length >= 4);
  assert.deepEqual(files(home), ["app/keep.txt"], "the store is gone; the install folder beside it is not");
});

test("update moves to a release tag, refuses over local changes, and says plainly when there are no tags yet", () => {
  const origin = tmp("qamind-origin-");
  const g = (cwd: string, ...a: string[]): string => git(cwd, ...a);
  g(origin, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(origin, "VERSION"), "1\n");
  g(origin, "add", "-A");
  g(origin, "commit", "-qm", "one");
  const clone = tmp("qamind-app-");
  fs.rmSync(clone, { recursive: true });
  g(path.dirname(clone), "clone", "-q", origin, clone);
  assert.throws(() => checkoutTarget(clone, {}), /no release tags yet.*--edge/);
  fs.writeFileSync(path.join(origin, "VERSION"), "2\n");
  g(origin, "commit", "-qam", "two");
  g(origin, "tag", "v1.0.0");
  fs.writeFileSync(path.join(origin, "VERSION"), "3\n");
  g(origin, "commit", "-qam", "three");
  g(origin, "tag", "v1.10.0");
  g(origin, "tag", "v1.9.0", "HEAD~1");
  fs.writeFileSync(path.join(origin, "VERSION"), "4 (untagged tip)\n");
  g(origin, "commit", "-qam", "tip");

  const moved = checkoutTarget(clone, {});
  assert.equal(fs.readFileSync(path.join(clone, "VERSION"), "utf8"), "3\n", "the latest tag by version (1.10.0 above 1.9.0), not the tip of main");
  assert.match(moved.to, /v1\.10\.0/);
  checkoutTarget(clone, { version: "v1.0.0" });
  assert.equal(fs.readFileSync(path.join(clone, "VERSION"), "utf8"), "2\n", "a named release");
  assert.throws(() => checkoutTarget(clone, { version: "v9.9.9" }), /There is no release v9.9.9. Releases: v1.10.0, v1.9.0, v1.0.0/);
  fs.writeFileSync(path.join(clone, "VERSION"), "my local edit\n");
  assert.throws(() => checkoutTarget(clone, {}), /uncommitted changes/);
  assert.equal(fs.readFileSync(path.join(clone, "VERSION"), "utf8"), "my local edit\n", "and the edit is still there");
  g(clone, "checkout", "--quiet", "--", "VERSION");
  // a rebuilt generated plugin folder is not the user's change
  fs.mkdirSync(path.join(origin, "plugins", "qamind"), { recursive: true });
  fs.writeFileSync(path.join(origin, "plugins", "qamind", "generated.txt"), "built\n");
  g(origin, "add", "-A");
  g(origin, "commit", "-qm", "plugin");
  g(origin, "tag", "v2.0.0");
  g(clone, "fetch", "--quiet", "--tags");
  g(clone, "checkout", "--quiet", "v1.10.0");
  fs.mkdirSync(path.join(clone, "plugins", "qamind"), { recursive: true });
  fs.writeFileSync(path.join(clone, "plugins", "qamind", "generated.txt"), "rebuilt differently\n");
  fs.writeFileSync(path.join(clone, "VERSION"), "3\n");
  fs.mkdirSync(path.join(clone, "build"), { recursive: true });
  fs.writeFileSync(path.join(clone, "build", "x"), "runtime");
  assert.match(checkoutTarget(clone, {}).to, /v2\.0\.0/, "generated and build folders do not block an update");
  assert.throws(() => checkoutTarget(tmp("qamind-notgit-"), {}), /not a git checkout/);
});

test("`./setup --project` means the folder it was run from, not the QAMind checkout it moves into, and prints no experimental warning", () => {
  const sb = sandbox();
  const project = tmp("qamind-proj-");
  const r = spawnSync("sh", [path.join(repoRoot, "setup"), "--host", "generic", "--project", "--skip-build", "--no-launcher", "--dry-run"], { cwd: project, encoding: "utf8", env: { ...sb.env, QAMIND_BUILD_DIR: path.join(sb.userHome, "..", `build-${path.basename(sb.userHome)}`) } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = fs.realpathSync(project);
  assert.ok(r.stdout.includes(path.join(out, "AGENTS.md")) || r.stdout.includes(path.join(project, "AGENTS.md")), `the plan names the project's AGENTS.md:\n${r.stdout}`);
  assert.ok(!r.stdout.includes(path.join(repoRoot, "AGENTS.md")), "nothing is planned inside the checkout");
  assert.doesNotMatch(r.stderr, /ExperimentalWarning|Type Stripping/);
  cleanup(sb);
});
