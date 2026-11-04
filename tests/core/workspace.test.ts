import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { canSeeChanges, changedInTask, stateHash, takeSnapshot } from "../../core/auto-qa/changes.ts";
import { preflight } from "../../core/lib/fix/loop.ts";
import { memoryPaths } from "../../core/lib/memory/store.ts";
import { runScope } from "../../core/lib/memory/service.ts";
import { looksLikeProject, workspaceRepos } from "../../core/lib/project.ts";
import { startRun } from "../../core/lib/run.ts";
import { DEMO_CONFIG, DEMO_ENV, git, repoRoot, tmp } from "./helpers.ts";

// A product kept as several repositories side by side in one parent folder (an API, a client portal, an admin). The parent is not a repository and has no
// dependency manifest, so it used to be refused with "does not look like a project".

const NOW = new Date("2026-11-04T09:00:00Z");

/** A parent folder like a developer's: three repositories and the tools' own folders (which are not projects). */
function makeWorkspace(opts: { configured?: boolean } = {}): string {
  const root = tmp("qamind-workspace-");
  for (const d of [".claude", ".playwright-mcp", ".worktrees/old-branch", "node_modules/some-dep", "dist"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "package.json"), "{}"); // build output that carries a manifest is not a repository either
  fs.writeFileSync(path.join(root, ".mcp.json"), "{}");
  fs.writeFileSync(path.join(root, "node_modules", "some-dep", "package.json"), "{}");
  fs.writeFileSync(path.join(root, ".playwright-mcp", "package.json"), "{}"); // a tool's own folder with a manifest in it is still not one of the product's repositories
  fs.writeFileSync(path.join(root, ".worktrees", "old-branch", "package.json"), "{}");
  for (const [name, dep] of [["reservation-backend", "express"], ["reservation-portal", "react"], ["reservation-admin", "vue"]] as const) {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, dependencies: { [dep]: "1.0.0" } }));
    fs.writeFileSync(path.join(dir, "src", "app.js"), "export const x = 1;\n");
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "init");
  }
  if (opts.configured) {
    fs.mkdirSync(path.join(root, ".qa"), { recursive: true });
    // the OpenAPI file lives in the backend repository, so the config names it by its path from the workspace
    fs.writeFileSync(path.join(root, ".qa", "config.md"), DEMO_CONFIG.replace("openapi: openapi.yaml", "openapi: reservation-backend/openapi.yaml"));
    fs.copyFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), path.join(root, "reservation-backend", "openapi.yaml"));
    fs.writeFileSync(path.join(root, ".env.qa"), Object.entries(DEMO_ENV).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  }
  return root;
}

const start = (cwd: string, over: Partial<Parameters<typeof startRun>[0]> = {}) => {
  const home = tmp("qamind-home-");
  return { home, r: startRun({ cwd, mode: "quick", kind: "qa-only", host: "test", home, env: {}, sessionId: "s1", now: NOW, ...over }) };
};

test("a folder that holds several projects is a workspace; tool folders, an empty folder and a project with its own manifest are not", () => {
  const ws = makeWorkspace();
  assert.deepEqual(workspaceRepos(ws), ["reservation-admin", "reservation-backend", "reservation-portal"], ".claude, .worktrees, node_modules and the rest are not projects");
  assert.equal(looksLikeProject(ws), true);

  const empty = tmp("qamind-empty-");
  fs.mkdirSync(path.join(empty, "node_modules", "x"), { recursive: true });
  fs.mkdirSync(path.join(empty, ".claude"));
  assert.deepEqual(workspaceRepos(empty), []);
  assert.equal(looksLikeProject(empty), false, "nothing in it is a project");

  const own = tmp("qamind-own-");
  fs.writeFileSync(path.join(own, "package.json"), "{}");
  fs.mkdirSync(path.join(own, "demo"));
  fs.writeFileSync(path.join(own, "demo", "package.json"), "{}");
  assert.deepEqual(workspaceRepos(own), [], "a project with a manifest of its own is that project, not a workspace");
  assert.equal(looksLikeProject(own), true);

  const repo = tmp("qamind-mono-");
  git(repo, "init", "-q", "-b", "main");
  fs.mkdirSync(path.join(repo, "apps", "web"), { recursive: true });
  fs.mkdirSync(path.join(repo, "web"));
  fs.writeFileSync(path.join(repo, "web", "package.json"), "{}");
  assert.deepEqual(workspaceRepos(repo), [], "inside a git repository it is that repository's project, whatever folders it has");
});

test("the first run in a workspace puts the config in it, edits no .gitignore, and says what it found", () => {
  const ws = makeWorkspace();
  const { r } = start(ws);
  assert.equal(r.status, "needs-config", r.message);
  assert.deepEqual(r.project?.workspace, { repos: ["reservation-admin", "reservation-backend", "reservation-portal"] });
  assert.match(r.message ?? "", /workspace/);
  assert.match(r.message ?? "", /no \.gitignore was touched/);
  assert.ok(fs.existsSync(path.join(ws, ".qa", "config.md")));
  assert.ok(!fs.existsSync(path.join(ws, ".gitignore")), "a parent folder that is not a repository gets no .gitignore");
  assert.deepEqual(r.gitignore_added, []);
  for (const name of workspaceRepos(ws)) assert.ok(!fs.existsSync(path.join(ws, name, ".gitignore")), "and none of the repositories is edited either");
});

test("a configured workspace runs: every repository's state and stack, and changed files under their repository's folder", () => {
  const ws = makeWorkspace({ configured: true });
  const backend = path.join(ws, "reservation-backend");
  const portal = path.join(ws, "reservation-portal");
  fs.writeFileSync(path.join(backend, "src", "app.js"), "export const x = 2;\n");
  fs.writeFileSync(path.join(portal, "src", "new-page.js"), "export const y = 1;\n");
  git(portal, "checkout", "-q", "-b", "feature/booking");
  fs.writeFileSync(path.join(portal, "src", "booked.js"), "export const z = 1;\n");
  git(portal, "add", "-A");
  git(portal, "commit", "-qm", "booked");

  const { r } = start(ws, { mode: "diff" });
  assert.equal(r.status, "ready", r.message);
  assert.equal(r.git?.is_repo, false, "the folder itself is not a repository");
  assert.deepEqual(r.git?.repos?.map((x) => x.path), ["reservation-admin", "reservation-backend", "reservation-portal"]);
  const by = Object.fromEntries((r.git?.repos ?? []).map((x) => [x.path, x]));
  assert.equal(by["reservation-backend"]?.dirty, true);
  assert.equal(by["reservation-admin"]?.dirty, false);
  assert.equal(by["reservation-portal"]?.branch, "feature/booking");
  assert.deepEqual([...(r.git?.changed_files ?? [])].sort(), ["reservation-backend/openapi.yaml", "reservation-backend/src/app.js", "reservation-portal/src/booked.js", "reservation-portal/src/new-page.js"], "a committed change on a branch and uncommitted work (the OpenAPI file is new), each under its repository");

  const stack = JSON.parse(fs.readFileSync(memoryPaths(r.project!.store).stack, "utf8")) as { frameworks: string[]; commands: Record<string, string> };
  assert.deepEqual(stack.frameworks, ["express", "react", "vue"], "the stack of every repository in the workspace");
  assert.deepEqual(stack.commands, {}, "a test command belongs to one repository");
});

test("a fix run is told up front that a workspace cannot be fixed from here, and the fix tool refuses with the way out", async () => {
  const ws = makeWorkspace({ configured: true });
  const { home, r } = start(ws, { kind: "qa" });
  assert.equal(r.status, "ready", r.message);
  assert.ok(r.advisories?.some((a) => /several repositories \(reservation-admin, reservation-backend, reservation-portal\)/.test(a) && /report-only/.test(a)), `advisories: ${JSON.stringify(r.advisories)}`);
  const pf = (await preflight(runScope(home, r.run!.id, {}), NOW)) as { ok: boolean; problem?: string; message?: string; repos?: string[] };
  assert.equal(pf.ok, false);
  assert.equal(pf.problem, "workspace");
  assert.match(pf.message ?? "", /start in that repository's folder/);
  assert.deepEqual(pf.repos, ["reservation-admin", "reservation-backend", "reservation-portal"]);

  const { r: report } = start(ws, { kind: "qa-only", sessionId: "s2" });
  assert.ok(!report.advisories?.some((a) => /several repositories/.test(a)), "a report-only run has nothing to be told");
});

test("auto-QA sees what a task changed in any repository of a workspace, and only that", () => {
  const ws = makeWorkspace();
  const backend = path.join(ws, "reservation-backend");
  const portal = path.join(ws, "reservation-portal");
  assert.equal(canSeeChanges(ws), true);
  assert.equal(canSeeChanges(tmp("qamind-nothing-")), false);

  fs.writeFileSync(path.join(portal, "src", "wip.js"), "// work in progress before the task\n");
  const before = takeSnapshot(ws);
  assert.ok(before);
  assert.deepEqual(Object.keys(before.heads ?? {}), ["reservation-admin", "reservation-backend", "reservation-portal"]);
  assert.deepEqual(changedInTask(ws, before, takeSnapshot(ws)!, []), [], "nothing changed yet; work already in progress is not the task's");
  const hashBefore = stateHash(before, []);

  fs.writeFileSync(path.join(backend, "src", "app.js"), "export const x = 3;\n");
  fs.mkdirSync(path.join(backend, ".qa"));
  fs.writeFileSync(path.join(backend, ".qa", "notes.md"), "QAMind's own folder never counts\n");
  fs.writeFileSync(path.join(portal, "src", "feature.js"), "export const f = 1;\n");
  git(portal, "add", "src/feature.js");
  git(portal, "commit", "-qm", "the task committed a file");

  const after = takeSnapshot(ws)!;
  assert.deepEqual(changedInTask(ws, before, after, []), ["reservation-backend/src/app.js", "reservation-portal/src/feature.js"], "an uncommitted edit in one repository and a commit in another");
  assert.notEqual(stateHash(after, []), hashBefore);
  assert.deepEqual(changedInTask(ws, before, after, ["**/*.md"]), ["reservation-backend/src/app.js", "reservation-portal/src/feature.js"], "ignore globs apply under a repository's folder too");
});
