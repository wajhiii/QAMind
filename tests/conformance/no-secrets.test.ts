import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { repoRoot, tmp } from "../core/helpers.ts";

// The repository is public. Nothing that looks like a credential, or a person's home folder, may be tracked in it (scripts/scan-secrets.mjs; `--history` checks every commit).

const scan = (args: string[], cwd = repoRoot) => spawnSync(process.execPath, [path.join(repoRoot, "scripts", "scan-secrets.mjs"), ...args], { cwd, encoding: "utf8" });

test("no tracked file holds a credential, a key, or a person's home folder", () => {
  const r = scan([]);
  assert.equal(r.status, 0, `${r.stdout}\nRemove it, rotate it if it was real, and run \`node scripts/scan-secrets.mjs --history\` to see whether it is already in the history.`);
});

test("the scanner finds a planted credential, a home folder and a private key, never prints a credential, and leaves made-up test data alone", () => {
  const dir = tmp("qamind-scan-");
  const g = (...a: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t.t", ...a], { stdio: "ignore" });
  g("init", "-q", "-b", "main");
  // Built at run time, so this test file holds none of them itself.
  const token = `ghp_${"a1B2".repeat(9)}`;
  const home = `/${"Users"}/${"jdoe"}/work`;
  const key = `-----BEGIN ${"RSA"} PRIVATE KEY-----`;
  fs.writeFileSync(path.join(dir, "config.txt"), `token=${token}\npath=${home}\n${key}\n`);
  fs.mkdirSync(path.join(dir, "tests"));
  fs.writeFileSync(path.join(dir, "tests", "fixture.test.ts"), `const email = "jane.doe@gmail.com"; const h = "Bearer ${"x".repeat(40)}";\n`);
  g("add", "-A");
  g("commit", "-qm", "x");
  const r = scan(["--repo", dir]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /GitHub token: config\.txt:1/);
  assert.match(r.stdout, /personal home folder: config\.txt:2/);
  assert.match(r.stdout, /private key: config\.txt:3/);
  assert.ok(!r.stdout.includes(token), "a credential is never printed whole");
  assert.ok(!r.stdout.includes("fixture.test.ts"), "an address and a bearer value in a test file are made-up data");
  assert.ok(!r.stdout.includes("jdoe"), "a home folder is hidden unless --show is given");
  assert.match(scan(["--repo", dir, "--show"]).stdout, /jdoe/);
  // A removed credential is still in the history, and the history scan says so.
  g("rm", "-q", "config.txt");
  g("commit", "-qm", "remove it");
  assert.equal(scan(["--repo", dir]).status, 0, "gone from the files");
  assert.equal(scan(["--repo", dir, "--history"]).status, 1, "still in the history");
});

test("the ignore file keeps environment files and keys out, and still tracks the named examples", () => {
  const dir = tmp("qamind-ignore-");
  execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"], { stdio: "ignore" });
  fs.copyFileSync(path.join(repoRoot, ".gitignore"), path.join(dir, ".gitignore"));
  const ignored = (f: string): boolean => spawnSync("git", ["-C", dir, "check-ignore", "-q", f]).status === 0;
  for (const f of [".env", ".env.local", ".env.production", ".env.qa", "demo/.env", "key.pem", "deploy.key", "id_rsa", ".npmrc", ".qa/config.md"]) assert.ok(ignored(f), `${f} must be ignored`);
  for (const f of [".env.example", ".env.qa.example", "demo-app/.env.qa.fixture"]) assert.ok(!ignored(f), `${f} is a checked-in example`);
});
