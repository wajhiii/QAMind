import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ensureGitignoreEntries } from "../../core/lib/gitignore.ts";
import { ensureProjectStore, listKnownProjects, normalizeGitRemote, resolveProject } from "../../core/lib/project.ts";
import { makeProject, tmp } from "./helpers.ts";

test("normalizeGitRemote makes ssh, https and credentialed urls comparable", () => {
  const same = "github.com/owner/repo";
  assert.equal(normalizeGitRemote("git@github.com:Owner/Repo.git"), same);
  assert.equal(normalizeGitRemote("https://github.com/Owner/Repo"), same);
  assert.equal(normalizeGitRemote("https://user:secret@github.com/Owner/Repo.git"), same);
  assert.equal(normalizeGitRemote("ssh://git@github.com:22/Owner/Repo.git"), same);
  assert.equal(normalizeGitRemote("not a url"), null);
});

test("two clones of the same repo share one project id; no remote gives a path-based id", () => {
  const a = makeProject({ remote: "https://github.com/acme/shop.git" });
  const b = makeProject({ remote: "git@github.com:acme/shop.git" });
  const c = makeProject();
  const ia = resolveProject(a);
  const ib = resolveProject(b);
  const ic = resolveProject(c);
  assert.equal(ia.id, ib.id);
  assert.equal(ia.idSource, "git-remote");
  assert.equal(ic.idSource, "path");
  assert.match(ic.id, /^path-/);
  assert.notEqual(ic.id, ia.id);
});

test("the store lives under QAMIND_HOME, records every path seen, and never touches the project", () => {
  const home = tmp("qamind-home-");
  const a = makeProject({ remote: "https://github.com/acme/shop.git" });
  const b = makeProject({ remote: "https://github.com/acme/shop.git" });
  const before = fs.readdirSync(a).sort();
  const { store } = ensureProjectStore(home, resolveProject(a));
  const second = ensureProjectStore(home, resolveProject(b));
  assert.equal(store, second.store);
  assert.ok(store.startsWith(home));
  assert.deepEqual(second.project.paths_seen.sort(), [a, b].sort());
  for (const sub of ["memory", "memory/runs", "state", "test-bank", "baselines", "backups"]) assert.ok(fs.existsSync(path.join(store, sub)), sub);
  assert.deepEqual(fs.readdirSync(a).sort(), before, "nothing was written into the project");
  assert.equal(listKnownProjects(home).length, 1);
});

test("memory written by a newer QAMind is refused", () => {
  const home = tmp("qamind-home-");
  const proj = makeProject();
  const info = resolveProject(proj);
  const { store } = ensureProjectStore(home, info);
  const file = path.join(store, "project.json");
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), schema_version: 99 }));
  assert.throws(() => ensureProjectStore(home, info), /newer QAMind/);
});

test("gitignore: creates the file, is idempotent, keeps existing entries, handles a missing trailing newline", () => {
  const dir = tmp();
  assert.deepEqual(ensureGitignoreEntries(dir), [".env.qa", ".qa/"]);
  assert.deepEqual(ensureGitignoreEntries(dir), []);
  const dir2 = tmp();
  fs.writeFileSync(path.join(dir2, ".gitignore"), "node_modules\n/.qa");
  assert.deepEqual(ensureGitignoreEntries(dir2), [".env.qa"]);
  const text = fs.readFileSync(path.join(dir2, ".gitignore"), "utf8");
  assert.ok(text.startsWith("node_modules\n/.qa\n"));
  assert.ok(text.includes(".env.qa"));
});
