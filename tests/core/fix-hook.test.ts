import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { decidePreToolUse } from "../../core/lib/hooks.ts";
import { startRun } from "../../core/lib/run.ts";
import { DEMO_CONFIG, makeConfiguredProject, tmp } from "./helpers.ts";

function fixRun(opts: { trigger?: "manual" | "ci"; doNotTouch?: string[] } = {}) {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject({ remote: "https://github.com/acme/shop.git" });
  if (opts.doNotTouch) {
    const cfg = path.join(proj, ".qa", "config.md");
    fs.writeFileSync(cfg, DEMO_CONFIG.replace(/fix_policy:\n(\s+)fix_severities:[^\n]*/, (m, ind: string) => `${m}\n${ind}do_not_touch: [${opts.doNotTouch!.map((g) => JSON.stringify(g)).join(", ")}]`));
  }
  const r = startRun({ cwd: proj, mode: "quick", kind: "qa", trigger: opts.trigger ?? "manual", host: "test", home, env: {}, sessionId: "s-fix" });
  assert.equal(r.status, "ready", r.message);
  const scratch = tmp("scratch-");
  const decide = (tool: string, input: Record<string, unknown>) => decidePreToolUse({ session_id: "s-fix", cwd: proj, tool_name: tool, tool_input: input }, home, [scratch]);
  return { home, proj, runDir: r.run!.dir, scratch, decide, edit: (file: string) => decide("Edit", { file_path: file }), bash: (command: string) => decide("Bash", { command }) };
}

test("a fix run may edit project source and its own reports, and nothing is blocked for a session without a run", () => {
  const f = fixRun();
  for (const file of ["src/orders.js", path.join(f.proj, "public/client/new-order.js"), "test/qa-regression.test.mjs", ".qa/reports/x/data/findings.json"]) assert.equal(f.edit(file), null, file);
  assert.equal(f.decide("Write", { file_path: path.join(f.scratch, "notes.md") }), null, "the session scratch folder is writable");
  assert.equal(decidePreToolUse({ session_id: "someone-else", tool_name: "Edit", tool_input: { file_path: "package.json" } }, f.home), null);
});

test("a fix run refuses edits to credentials, CI, lock files, manifests, generated code, the config, its own record and anything outside the project", () => {
  const f = fixRun();
  const refuse = (file: string, why: RegExp) => assert.match(f.edit(file)?.reason ?? "", why, file);
  refuse(".env.qa", /protected/);
  refuse("package.json", /dependency manifest/);
  refuse("package-lock.json", /lock file/);
  refuse(".github/workflows/ci.yml", /CI and deployment/);
  refuse("node_modules/x/index.js", /third-party/);
  refuse(".qa/config.md", /project configuration/);
  refuse(`.qa/reports/${path.basename(f.runDir)}/data/fix-state.json`, /fix loop's own record/);
  refuse(path.join(f.proj, ".git", "config"), /git's own data/);
  refuse("../elsewhere/x.js", /outside the project/);
  refuse("/etc/hosts", /outside the project/);
  assert.match(f.decide("Write", { file_path: "package.json" })?.reason ?? "", /must not touch it/, "Write is covered like Edit");
  assert.ok(f.decide("MultiEdit", { file_path: "yarn.lock" }));
});

test("the config's do-not-touch list is enforced from the start of the run", () => {
  const f = fixRun({ doNotTouch: ["src/billing/**", "*.generated.ts"] });
  assert.match(f.edit("src/billing/tax.js")?.reason ?? "", /do-not-touch list \(src\/billing\/\*\*\)/);
  assert.match(f.edit("types/a.generated.ts")?.reason ?? "", /do-not-touch list/);
  assert.equal(f.edit("src/orders.js"), null);
  assert.match(f.bash("echo x > src/billing/tax.js")?.reason ?? "", /do-not-touch/, "a shell redirect is checked like an edit");
});

test("git state is only changed by the fix tools: every writing git command and the git host's CLI is refused, reading is not", () => {
  const f = fixRun();
  for (const cmd of ["git commit -m x", "git add -A", "git push origin main", "git push", "git pull", "git merge main", "git rebase main", "git reset --hard HEAD~1", "git checkout -b feature", "git checkout .", "git switch main", "git restore src/a.js", "git stash", "git clean -fd", "git revert HEAD", "git tag v1", "git remote add o https://x", "git config user.name x", "git -C . commit -m x", "git branch -D old", "git branch newbranch", "git cherry-pick abc", "git worktree add ../x", "gh pr create --fill", "gh api repos/x/y"]) {
    assert.ok(f.bash(cmd), `${cmd} should be refused`);
  }
  for (const cmd of ["git status", "git status --short", "git diff --stat", "git diff HEAD -- src/a.js", "git log --oneline -5", "git show HEAD", "git blame src/a.js", "git ls-files", "git rev-parse HEAD", "git branch --list", "git branch --show-current", "git branch -a"]) {
    assert.equal(f.bash(cmd), null, `${cmd} is read-only and should be allowed`);
  }
  assert.equal(f.bash('echo "do not git push yet" > notes.txt'), null, "words inside quotes are not commands");
});

test("dependency changes, in-place edits and file commands aimed at protected paths or outside the project are refused", () => {
  const f = fixRun();
  for (const cmd of ["npm install left-pad", "npm ci", "yarn add x", "pip install requests", "composer require x/y", "sed -i 's/a/b/' src/a.js", "perl -pi -e 's/a/b/' src/a.js", "echo x > package.json", "echo x >> .github/workflows/ci.yml", "echo x > /etc/passwd", "echo x > ../other.txt", "rm -rf node_modules", "rm package-lock.json", "mv src/a.js package.json", "cp src/a.js .env.qa", "tee package.json < a.txt"]) {
    assert.ok(f.bash(cmd), `${cmd} should be refused`);
  }
  for (const cmd of ["echo done > src/note.txt", "rm src/old.js", "cp src/a.js src/b.js", "mv test/a.js test/b.js", "chmod +x scripts/run.sh", "ls -la", "curl -s http://127.0.0.1:4100/api/health", "qamind health --run run-1", "cat package.json", "node --test test/a.test.mjs 2>&1 | tail -5", "echo x > /dev/null"]) {
    assert.equal(f.bash(cmd), null, `${cmd} should be allowed`);
  }
});

test("credentials stay out of the conversation in a fix run too", () => {
  const f = fixRun();
  assert.match(f.decide("Read", { file_path: ".env.qa" })?.reason ?? "", /never reads .env.qa/);
  assert.match(f.bash("cat .env.qa")?.reason ?? "", /\.env\.qa/);
  assert.match(f.bash("printenv")?.reason ?? "", /environment/);
});

test("a CI run is report-only even when its kind is qa: nothing outside .qa/ may change", () => {
  const f = fixRun({ trigger: "ci" });
  assert.match(f.edit("src/orders.js")?.reason ?? "", /report-only QA run/);
  assert.match(f.bash("git commit -m x")?.reason ?? "", /report-only QA run/);
  const marker = JSON.parse(fs.readFileSync(path.join(f.home, "projects", fs.readdirSync(path.join(f.home, "projects"))[0] as string, "state", "run-marker.json"), "utf8"));
  assert.equal(marker.readonly, true);
  assert.equal(marker.fix, undefined, "a read-only run carries no fix policy");
});
