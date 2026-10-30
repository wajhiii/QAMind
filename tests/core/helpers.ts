import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function tmp(prefix = "qamind-test-"): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t.t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** A project folder, optionally a git repo with an origin remote. */
export function makeProject(opts: { remote?: string; git?: boolean; files?: Record<string, string> } = {}): string {
  const dir = tmp("qamind-proj-");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "p", scripts: { test: "node --test" } }));
  for (const [f, c] of Object.entries(opts.files ?? {})) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  if (opts.git !== false) {
    git(dir, "init", "-q", "-b", "main");
    if (opts.remote) git(dir, "remote", "add", "origin", opts.remote);
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "init");
  }
  return dir;
}

export const DEMO_CONFIG = fs.readFileSync(path.join(repoRoot, "demo-app", "qa-fixture", "config.md"), "utf8");

export const DEMO_ENV: Record<string, string> = {
  QA_ADMIN_USER: "admin@lumen.test",
  QA_ADMIN_PASS: "pw-admin-1234",
  QA_ACME1_USER: "a1@acme.test",
  QA_ACME1_PASS: "pw-acme1-1234",
  QA_ACME2_USER: "a2@acme.test",
  QA_ACME2_PASS: "pw-acme2-1234",
  QA_BRIGHT1_USER: "b1@bright.test",
  QA_BRIGHT1_PASS: "pw-bright-1234",
  QA_ZAIN1_USER: "z1@zain.test",
  QA_ZAIN1_PASS: "pw-zain-1234",
};

/** Project with the demo config filled in, plus a matching .env.qa (so no process env is needed). */
export function makeConfiguredProject(opts: { remote?: string } = {}): string {
  const dir = makeProject(opts);
  fs.mkdirSync(path.join(dir, ".qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".qa", "config.md"), DEMO_CONFIG);
  fs.copyFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), path.join(dir, "openapi.yaml"));
  fs.writeFileSync(path.join(dir, ".env.qa"), Object.entries(DEMO_ENV).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  return dir;
}

export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(root, p).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}
