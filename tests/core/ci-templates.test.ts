import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { decidePreToolUse } from "../../core/lib/hooks.ts";
import { describeCron, validCron } from "../../core/lib/ci/templates.ts";
import { cli, DEMO_CONFIG, DEMO_ENV, makeRunWithData, repoRoot, tmp } from "./helpers.ts";
import { makeProject } from "./helpers.ts";

// Phase 7.8, spec 13.2 and 13.15: the workflow files `qamind ci init` and `qamind schedule` write. They are checked by parsing them and by what they must and must not contain.

function project(opts: { ci?: string; ignoreQa?: boolean; gitlab?: boolean } = {}): string {
  const proj = makeProject({ files: { "README.md": "# shop\n", ...(opts.ignoreQa ? { ".gitignore": ".qa/\n.env.qa\n" } : {}), ...(opts.gitlab ? { ".gitlab-ci.yml": "stages: [test]\n" } : {}) } });
  fs.mkdirSync(path.join(proj, ".qa"), { recursive: true });
  fs.writeFileSync(path.join(proj, ".qa", "config.md"), opts.ci ? DEMO_CONFIG.replace(/\n---\n/, `\nci:\n${opts.ci}\n---\n`) : DEMO_CONFIG);
  fs.copyFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), path.join(proj, "openapi.yaml"));
  return proj;
}
const init = (home: string, proj: string, ...a: string[]) => cli(home, "ci", "init", "--project", proj, "--ref", "v1.2.3", "--repo-url", "https://example.com/qamind.git", ...a);
const secrets = Object.keys(DEMO_ENV);

test("the GitHub pull request workflow: least permissions, no forks, one comment's worth of concurrency, pinned installs, the config's own secrets and no secret value", async () => {
  const home = tmp("qamind-home-");
  const proj = project();
  const r = await init(home, proj, "--provider", "github");
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.equal(r.json.written, false, "without --write it is a preview");
  assert.equal(fs.existsSync(path.join(proj, ".github")), false);
  assert.equal(r.json.path, ".github/workflows/qamind.yml");
  const y = parseYaml(r.json.content as string) as Record<string, any>;
  assert.equal(y["name"], "QAMind");
  assert.deepEqual(y["on"]["pull_request"]["types"], ["opened", "synchronize", "reopened", "ready_for_review"]);
  assert.deepEqual(y["permissions"], { contents: "read", "pull-requests": "write", statuses: "write" }, "read the code, write the one comment, set the status: nothing more");
  assert.equal(y["concurrency"]["cancel-in-progress"], true);
  assert.match(y["concurrency"]["group"], /pull_request\.number/);
  const job = y["jobs"]["qamind"];
  assert.match(job["if"], /head\.repo\.full_name == github\.repository/, "a pull request from a fork gets no secrets, so it is not run");
  assert.equal(job["timeout-minutes"], 45);
  const steps = job["steps"] as Array<Record<string, any>>;
  const checkout = steps.find((s) => String(s["uses"]).startsWith("actions/checkout@"));
  assert.deepEqual(checkout?.["with"], { "fetch-depth": 0, "persist-credentials": false });
  assert.equal(y["env"]["QAMIND_REF"], "v1.2.3");
  assert.equal(y["env"]["QAMIND_REPO"], "https://example.com/qamind.git");
  assert.equal(y["env"]["HOST_CLI_VERSION"], "2.1.314", "the host CLI is pinned to the version this release was tested with");
  assert.match(JSON.stringify(steps), /npm install -g \\"@anthropic-ai\/claude-code@\$HOST_CLI_VERSION\\"/, "installed from the host's own block, at the pinned version");
  const run = steps.find((s) => String(s["run"] ?? "").includes("qamind.mjs"));
  assert.match(run?.["run"], /ci --mode diff$/);
  const env = run?.["env"] as Record<string, string>;
  assert.equal(env["ANTHROPIC_API_KEY"], "${{ secrets.ANTHROPIC_API_KEY }}");
  assert.equal(env["GITHUB_TOKEN"], "${{ secrets.GITHUB_TOKEN }}");
  for (const name of secrets) assert.equal(env[name], `\${{ secrets.${name} }}`, `${name} comes from the secret store`);
  const upload = steps.find((s) => String(s["uses"]).startsWith("actions/upload-artifact@"));
  assert.equal(upload?.["if"], "always()");
  assert.equal(upload?.["with"]["path"], "qamind-reports/");
  const text = r.json.content as string;
  for (const v of Object.values(DEMO_ENV)) assert.ok(!text.includes(v), "no credential value is written into a workflow");
  assert.ok(!/git clone[^\n]*@/.test(text), "no credential in a clone address");
  assert.match(text, /never a registry package/);
  assert.match(text, /clone --depth 1 --branch "\$QAMIND_REF"/);
  assert.match(text, /# - name: Start the app under test/, "the app under test is the project's to start, and the template says so");
  assert.ok(!/actions\/cache/.test(text), "no memory cache unless ci.cache_memory is on");
});

test("writing a workflow never overwrites one, and tells what is still to do", async () => {
  const home = tmp("qamind-home-");
  const proj = project({ ignoreQa: true });
  const preview = await init(home, proj, "--provider", "github");
  const notes = (preview.json.notes as string[]).join("\n");
  assert.match(notes, /`\.qa\/config\.md` is git-ignored, so CI will not find it.*`\.qa\/\*` and `!\.qa\/config\.md`/);
  assert.match(notes, /Add these as secrets of the repository.*ANTHROPIC_API_KEY, QA_ADMIN_USER/);
  assert.ok(!/no release tag/.test(notes) && !/placeholder/.test(notes), "an explicit tag and address leave nothing to warn about");
  const written = await init(home, proj, "--provider", "github", "--write");
  assert.equal(written.json.written, true);
  const file = path.join(proj, ".github", "workflows", "qamind.yml");
  assert.ok(fs.existsSync(file));
  fs.writeFileSync(file, "# my own edits\n");
  const again = await init(home, proj, "--provider", "github", "--write");
  assert.equal(again.code, 1);
  assert.equal(again.json.exists, true);
  assert.equal(fs.readFileSync(file, "utf8"), "# my own edits\n", "an existing file is never overwritten");
  const unpinned = await cli(home, "ci", "init", "--project", proj, "--provider", "github", "--ref", "main", "--repo-url", "https://example.com/q.git");
  assert.match((unpinned.json.notes as string[]).join("\n"), /QAMIND_REF is "main": there is no release tag of QAMind to pin to yet/);
  const placeholder = await cli(home, "ci", "init", "--project", proj, "--provider", "github", "--ref", "v1.0.0", "--repo-url", "https://github.com/<owner>/qamind.git");
  assert.match((placeholder.json.notes as string[]).join("\n"), /QAMIND_REPO is a placeholder/);
});

test("the GitLab job: merge request and schedule pipelines, full history, artifacts, the variables it needs, and an existing .gitlab-ci.yml is not touched", async () => {
  const home = tmp("qamind-home-");
  const r = await init(home, project(), "--provider", "gitlab");
  assert.equal(r.json.path, ".gitlab-ci.yml");
  const y = parseYaml(r.json.content as string) as Record<string, any>;
  const job = y["qamind"];
  assert.deepEqual(job["rules"], [{ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' }, { if: '$CI_PIPELINE_SOURCE == "schedule"' }]);
  assert.equal(job["variables"]["GIT_DEPTH"], "0");
  assert.equal(job["variables"]["QAMIND_REF"], "v1.2.3");
  assert.equal(job["variables"]["HOST_CLI_VERSION"], "2.1.314");
  assert.equal(job["artifacts"]["when"], "always");
  assert.deepEqual(job["artifacts"]["paths"], ["qamind-reports/"]);
  assert.match((job["script"] as string[]).join("\n"), /qamind\.mjs ci --mode "\$\{QAMIND_MODE:-diff\}"/);
  const text = r.json.content as string;
  assert.match(text, /ANTHROPIC_API_KEY, QAMIND_GITLAB_TOKEN/);
  assert.match(text, /QA_ADMIN_USER/);
  for (const v of Object.values(DEMO_ENV)) assert.ok(!text.includes(v));

  const withFile = project({ gitlab: true });
  const w = await init(home, withFile, "--provider", "gitlab", "--write");
  assert.equal(w.json.path, ".gitlab/qamind.gitlab-ci.yml");
  assert.match((w.json.notes as string[]).join("\n"), /add `include: \.gitlab\/qamind\.gitlab-ci\.yml`/);
  assert.equal(fs.readFileSync(path.join(withFile, ".gitlab-ci.yml"), "utf8"), "stages: [test]\n", "the project's own file is untouched");
});

test("ci.cache_memory adds a cache keyed by repository and branch, in the CI's own cache, never in the repository", async () => {
  const home = tmp("qamind-home-");
  const proj = project({ ci: "  cache_memory: true" });
  const gh = parseYaml(((await init(home, proj, "--provider", "github")).json.content as string)) as Record<string, any>;
  const cache = (gh["jobs"]["qamind"]["steps"] as Array<Record<string, any>>).find((s) => String(s["uses"]).startsWith("actions/cache@"));
  assert.equal(cache?.["with"]["path"], ".qamind-ci/home");
  assert.match(cache?.["with"]["key"], /github\.repository.*github\.base_ref/);
  const gl = parseYaml(((await init(home, proj, "--provider", "gitlab")).json.content as string)) as Record<string, any>;
  assert.deepEqual(gl["qamind"]["cache"]["paths"], [".qamind-ci/home"]);
  assert.match(gl["qamind"]["cache"]["key"], /CI_PROJECT_ID.*CI_MERGE_REQUEST_TARGET_BRANCH_NAME/);
});

test("the nightly workflow: a schedule and a manual trigger, full mode, read-only permissions, a longer limit, and the same secrets", async () => {
  const home = tmp("qamind-home-");
  const proj = project();
  const r = await cli(home, "schedule", "--project", proj, "--provider", "github", "--ref", "v1.2.3", "--repo-url", "https://example.com/qamind.git");
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.equal(r.json.path, ".github/workflows/qamind-nightly.yml");
  const y = parseYaml(r.json.content as string) as Record<string, any>;
  assert.deepEqual(y["on"]["schedule"], [{ cron: "0 2 * * *" }]);
  assert.ok("workflow_dispatch" in y["on"], "it can be run by hand");
  assert.deepEqual(y["permissions"], { contents: "read" }, "a nightly run comments on nothing, so it needs no write access");
  const job = y["jobs"]["nightly"];
  assert.equal(job["timeout-minutes"], 90);
  const run = (job["steps"] as Array<Record<string, any>>).find((s) => String(s["run"] ?? "").includes("qamind.mjs"));
  assert.match(run?.["run"], /ci --mode full$/);
  assert.equal(run?.["env"]["QA_ADMIN_PASS"], "${{ secrets.QA_ADMIN_PASS }}");
  assert.match((r.json.notes as string[]).join("\n"), /default branch only, in UTC \(02:00 every day\)/);
  const custom = await cli(home, "schedule", "--project", proj, "--provider", "github", "--cron", "30 4 * * 1-5", "--mode", "quick", "--ref", "v1.2.3", "--repo-url", "https://example.com/q.git");
  const cy = parseYaml(custom.json.content as string) as Record<string, any>;
  assert.deepEqual(cy["on"]["schedule"], [{ cron: "30 4 * * 1-5" }]);
  assert.match(JSON.stringify(cy["jobs"]["nightly"]["steps"]), /ci --mode quick/);
  const w = await cli(home, "schedule", "--project", proj, "--provider", "github", "--write", "--ref", "v1.2.3", "--repo-url", "https://example.com/q.git");
  assert.equal(w.json.written, true);
  assert.equal((await cli(home, "schedule", "--project", proj, "--provider", "github", "--write", "--ref", "v1.2.3", "--repo-url", "https://example.com/q.git")).code, 1, "never overwritten");
});

test("schedules for GitLab, cron and Windows are instructions and lines, never edits to anyone's scheduler", async () => {
  const home = tmp("qamind-home-");
  const proj = project();
  const gl = await cli(home, "schedule", "--project", proj, "--provider", "gitlab", "--ref", "v1.2.3", "--repo-url", "https://example.com/q.git");
  assert.match((gl.json.steps as string[]).join("\n"), /CI\/CD > Schedules.*0 2 \* \* \*.*QAMIND_MODE=full/);
  assert.match((gl.json.steps as string[]).join("\n"), /nothing for QAMind to write/);
  const cron = await cli(home, "schedule", "--project", proj, "--provider", "cron", "--cron", "15 3 * * *");
  assert.equal(cron.json.crontab_line, `15 3 * * * cd '${proj}' && qamind ci --mode full --user-store >> "$HOME/.qamind/ci.log" 2>&1`);
  assert.match(cron.json.how, /QAMind never edits your crontab/);
  const win = await cli(home, "schedule", "--project", proj, "--provider", "windows", "--cron", "15 3 * * *");
  assert.match(win.json.command, /schtasks \/Create \/SC DAILY \/ST 03:15 \/TN "QAMind nightly" \/TR "cmd \/c cd \/d \\"/);
  assert.match(win.json.how, /Not tested on Windows/);
  const odd = await cli(home, "schedule", "--project", proj, "--provider", "windows", "--time", "25:99");
  assert.match(odd.json.error, /--time must be HH:MM/);
});

test("bad input is refused with what to write: a cron expression, a mode, ticket mode, a provider", async () => {
  const home = tmp("qamind-home-");
  const proj = project();
  assert.match((await cli(home, "schedule", "--project", proj, "--provider", "cron", "--cron", "every night")).json.error, /not a five-field cron expression/);
  assert.match((await cli(home, "schedule", "--project", proj, "--provider", "cron", "--mode", "turbo")).json.error, /--mode must be one of diff, quick, regression, full/);
  assert.match((await cli(home, "schedule", "--project", proj)).json.error, /schedule needs --provider/);
  assert.match((await cli(home, "ci", "--project", proj, "--mode", "ticket")).json.error, /ticket mode needs the ticket: --ticket FILE/);
  assert.match((await cli(home, "ci", "init", "--project", proj)).json.error, /ci init needs --provider github\|gitlab/);
  assert.equal(validCron("0 2 * * *"), true);
  assert.equal(validCron("*/15 0-6 1,15 * 1-5"), true);
  assert.equal(validCron("0 2 * *"), false);
  assert.equal(describeCron("0 2 * * *"), "02:00 every day");
});

test("a QA run cannot start CI runs or write CI files: the hook refuses it in every run mode", () => {
  const fx = makeRunWithData();
  const at = new Date("2026-10-30T10:30:00Z");
  const bash = (command: string) => decidePreToolUse({ session_id: "s1", cwd: fx.proj, tool_name: "Bash", tool_input: { command } }, fx.home, [], at);
  for (const c of ["qamind ci --mode full", "qamind ci init --provider github --write", "qamind schedule --provider github --write", "cd /tmp && qamind ci"]) {
    assert.equal(bash(c)?.decision, "deny", c);
    assert.match(bash(c)?.reason ?? "", /starting a CI run or writing CI files/);
  }
  assert.equal(bash("qamind config check"), null, "other commands that start with the same letters are untouched");
});
