import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { parse as parseYaml } from "yaml";
import { apiFor, CiApiError } from "../../core/lib/ci/api.ts";
import { COMMENT_MARKER, readAdminReport, renderComment } from "../../core/lib/ci/comment.ts";
import { evaluateGate } from "../../core/lib/ci/gate.ts";
import { agentArgs, agentCommandOf, findHostSpec, hasAuth, invokeFor, loadHeadless, parseHeadless } from "../../core/lib/ci/host.ts";
import { detectCi } from "../../core/lib/ci/provider.ts";
import { runCi } from "../../core/lib/ci/run.ts";
import { DEFAULT_CI, normalizeConfig, splitFrontMatter } from "../../core/lib/config.ts";
import type { QamindConfig } from "../../core/lib/config.ts";
import { readJson, writeJson } from "../../core/lib/fsutil.ts";
import { gitInfo, porcelainFiles } from "../../core/lib/git.ts";
import { ensureGitignoreEntries } from "../../core/lib/gitignore.ts";
import { readRunData } from "../../core/lib/report.ts";
import { loadBugs } from "../../core/lib/memory/bugs.ts";
import { startMockGithub } from "./fixtures/mock-github.ts";
import { DEMO_CONFIG, DEMO_ENV, makeProject, makeRunWithData, repoRoot, tmp } from "./helpers.ts";

// ---------------------------------------------------------------------------------------------- a mock GitHub

const gh = await startMockGithub();
const mock = gh.mock;
after(() => gh.close());
const reset = (): void => {
  mock.comments.length = 0;
  mock.statuses.length = 0;
  mock.calls.length = 0;
  mock.deny.clear();
  mock.tokens.clear();
};

const SHA = "abcdef1234567890abcdef1234567890abcdef12";
function ghEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const ev = path.join(tmp("qamind-event-"), "event.json");
  fs.writeFileSync(ev, JSON.stringify({ number: 7, pull_request: { number: 7, head: { sha: SHA, ref: "feature" }, base: { ref: "main" } } }));
  return { ...process.env, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "acme/shop", GITHUB_API_URL: mock.url, GITHUB_TOKEN: "ghs_secrettoken1234567890", GITHUB_EVENT_PATH: ev, GITHUB_RUN_ID: "99", GITHUB_SERVER_URL: "https://github.com", ...extra };
}

const AGENT = `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(repoRoot, "tests", "core", "fixtures", "ci-fake-agent.ts"))}`;
const raw = (): Record<string, any> => parseYaml(splitFrontMatter(DEMO_CONFIG)?.yaml ?? "") as Record<string, any>;

function ciProject(ci?: Record<string, unknown>): string {
  const proj = makeProject({ files: { "README.md": "# shop\n" } });
  fs.mkdirSync(path.join(proj, ".qa"), { recursive: true });
  fs.writeFileSync(path.join(proj, ".qa", "config.md"), ci ? DEMO_CONFIG.replace(/\n---\n/, `\nci:\n${Object.entries(ci).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n`) : DEMO_CONFIG);
  fs.copyFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), path.join(proj, "openapi.yaml"));
  fs.writeFileSync(path.join(proj, ".env.qa"), Object.entries(DEMO_ENV).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  return proj;
}

// ---------------------------------------------------------------------------------------------- where we are, and what the config may say

test("the CI service is recognised from its environment: the pull request, the head commit, the base and the token", () => {
  const gh = detectCi(ghEnv({ GITHUB_BASE_REF: "main" }));
  assert.deepEqual({ provider: gh.provider, repo: gh.repo, pr: gh.pr, sha: gh.sha, base: gh.base_ref, token: gh.token_name }, { provider: "github", repo: "acme/shop", pr: 7, sha: SHA, base: "main", token: "GITHUB_TOKEN" });
  assert.equal(gh.run_url, "https://github.com/acme/shop/actions/runs/99");
  const byRef = detectCi({ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "a/b", GITHUB_REF: "refs/pull/12/merge", GITHUB_SHA: "deadbeef" });
  assert.equal(byRef.pr, 12, "without an event file the pull request number comes from the ref");
  const gl = detectCi({ GITLAB_CI: "true", CI_PROJECT_PATH: "acme/shop", CI_PROJECT_ID: "55", CI_MERGE_REQUEST_IID: "4", CI_COMMIT_SHA: "cafe", CI_MERGE_REQUEST_TARGET_BRANCH_NAME: "main", CI_API_V4_URL: "https://gitlab.example/api/v4", CI_JOB_URL: "https://gitlab.example/j/1", QAMIND_GITLAB_TOKEN: "glpat-x" });
  assert.deepEqual({ provider: gl.provider, pr: gl.pr, project: gl.project_id, token: gl.token_name, run: gl.run_url }, { provider: "gitlab", pr: 4, project: "55", token: "QAMIND_GITLAB_TOKEN", run: "https://gitlab.example/j/1" });
  assert.equal(detectCi({ CI_JOB_TOKEN: "x", GITLAB_CI: "true" }).token, undefined, "a job token cannot write notes: it is not taken for one");
  assert.equal(detectCi({}).provider, "local");
});

test("ci settings have safe defaults and a bad value is refused with what to write", () => {
  const ok: string[] = [];
  const c = normalizeConfig(raw(), ok) as QamindConfig;
  assert.deepEqual(ok, []);
  assert.deepEqual(c.ci, DEFAULT_CI);
  assert.deepEqual(c.ci.fail_on, ["critical", "environment-problem"]);
  assert.deepEqual(c.ci.warn_on, ["important"]);
  const p: string[] = [];
  const bad = normalizeConfig({ ...raw(), ci: { fail_on: ["critical", "everything"], warn_on: ["critical", "important"], mode: "ticket", cache_memory: "yes", timeout_minutes: 0, status_context: "bad;name" } }, p) as QamindConfig;
  const text = p.join("\n");
  assert.match(text, /ci\.fail_on: "everything" is not a condition/);
  assert.match(text, /"critical" is in both fail_on and warn_on/);
  assert.match(text, /ci\.mode must be one of diff, quick, regression, full/);
  assert.match(text, /ci\.cache_memory must be true or false/);
  assert.match(text, /ci\.timeout_minutes must be a number of minutes from 1 to 360/);
  assert.match(text, /ci\.status_context must be a short name/);
  assert.deepEqual(bad.ci.warn_on, ["important"], "a condition in both lists fails; it is not also a warning");
});

// ---------------------------------------------------------------------------------------------- the gate

test("the gate: a critical problem or an environment problem fails by default, an important one warns, a clean run passes", async () => {
  const fx = makeRunWithData();
  const data = readRunData(fx.runDir);
  const base = { fail_on: DEFAULT_CI.fail_on, warn_on: DEFAULT_CI.warn_on };
  const g = evaluateGate(data, base);
  assert.equal(g.outcome, "fail");
  assert.deepEqual(g.failed, ["critical"]);
  assert.deepEqual(g.warned, ["important"]);
  assert.match(g.reasons.join(" "), /1 critical problem/);
  assert.equal(evaluateGate(data, { fail_on: [], warn_on: ["critical", "important"] }).outcome, "warn");
  assert.equal(evaluateGate({ ...data, findings: data.findings.filter((f) => f.severity === "important") }, base).outcome, "warn");
  assert.equal(evaluateGate({ ...data, findings: [] }, base).outcome, "pass");
  assert.equal(evaluateGate({ ...data, findings: [], health: { environment_ok: false, ran_at: "x", checks: [] } }, base).outcome, "fail", "a broken environment fails the run, not the change: it is the default gate");
  assert.deepEqual(evaluateGate({ ...data, findings: [], health: { environment_ok: false, ran_at: "x", checks: [] } }, base).failed, ["environment-problem"]);
  const back = { ...data, findings: data.findings.filter((f) => f.severity === "minor"), lifecycle: { schema_version: 1 as const, run_id: "r", computed_at: "x", applied: true, findings: [{ issue: "ISSUE-003", bug: "BUG-001", status: "regressed" as const, times_seen: 2, first_seen: "x" }], fixed: [], not_rechecked: [], accepted_seen: [] } };
  assert.equal(evaluateGate(back, { fail_on: ["came-back"], warn_on: [] }).outcome, "fail");
  assert.equal(evaluateGate(back, base).outcome, "pass", "a bug that came back is only a failure when the config says so");
  assert.equal(evaluateGate({ ...data, findings: [], bank: { schema_version: 1, run_id: "r", ran_at: "x", total: 3, passed: 2, flaky: 0, failed: 1, quarantined: 0, skipped: 0, results: [], covered_areas: [] } }, { fail_on: ["bank-failure"], warn_on: [] }).outcome, "fail");
});

// ---------------------------------------------------------------------------------------------- the comment

test("the comment carries the verdict, the 30-second summary, why it fails and a link; it is masked, marked and bounded", () => {
  const fx = makeRunWithData();
  const admin = "⛔ **Not ready to release:** 1 critical problem found.\n\n> **30-second summary**\n> - Checked on 2 November 2026\n> - Problems: 🔴 1 critical · 🟠 1 important · 🟡 0 minor\n> - Contact jane.smith@gmail.com about it\n\n### 🔴 Critical: A customer can open another company's order\n- **Where:** x\n\n### 🟠 Important: Technical error details are shown\n";
  const r = readAdminReport(admin);
  assert.equal(r.verdict.startsWith("⛔"), true);
  assert.equal(r.summary.length, 3);
  assert.deepEqual(r.problems.map((p) => p.severity), ["Critical", "Important"]);
  const gate = evaluateGate(readRunData(fx.runDir), DEFAULT_CI);
  const body = renderComment({ outcome: "fail", gate, adminReport: admin, mode: "diff", sha: SHA, runUrl: "https://github.com/acme/shop/actions/runs/99", minutes: 6.5, now: new Date("2026-11-02T10:00:00Z") }, { prefix: "QA-", allow: [], patterns: [], fields: [] });
  assert.ok(body.startsWith(`${COMMENT_MARKER}\n## QAMind ⛔ Failed`));
  assert.match(body, /\*\*Why this fails:\*\*\n- 1 critical problem/);
  assert.match(body, /> - Problems: 🔴 1 critical/);
  assert.match(body, /\[Full reports in the CI run\]\(https:\/\/github\.com\/acme\/shop\/actions\/runs\/99\) · mode `diff` · commit `abcdef1` · 6.5 min/);
  assert.ok(!body.includes("jane.smith@gmail.com"), "a customer's address in a report is masked again before it reaches a pull request");
  assert.match(body, /never changes, commits or pushes your code/);
  const err = renderComment({ outcome: "error", mode: "diff", error: "the agent ended (exit code 3) before it finished a run" }, { prefix: "QA-", allow: [], patterns: [], fields: [] });
  assert.match(err, /## QAMind ⚪ Could not check this change\n\nQAMind could not complete a check of this change: the agent ended/);
  assert.match(err, /says nothing about the change itself/);
  const huge = renderComment({ outcome: "pass", adminReport: `ok\n\n> - ${"x".repeat(80_000)}`, mode: "diff" }, { prefix: "QA-", allow: [], patterns: [], fields: [] });
  assert.ok(huge.length < 61_000, "GitHub refuses comments over 65,536 characters");
});

// ---------------------------------------------------------------------------------------------- the API clients

test("one comment is kept: created the first time, updated after that; only a bot's comment with the marker is ours", async () => {
  reset();
  const api = apiFor(detectCi(ghEnv()), DEFAULT_CI).api!;
  const first = await api.upsertComment(`${COMMENT_MARKER}\nfirst`);
  assert.equal(first.action, "created");
  const second = await api.upsertComment(`${COMMENT_MARKER}\nsecond`);
  assert.equal(second.action, "updated");
  assert.equal(second.id, first.id);
  assert.equal(mock.comments.length, 1, "one comment, however many times it is posted");
  assert.match(mock.comments[0]?.body ?? "", /second/);
  assert.ok([...mock.tokens].every((t) => t === "Bearer ghs_secrettoken1234567890"), "the token goes only in the Authorization header");

  // a person pasting the marker is not us: their comment is left alone
  reset();
  mock.comments.push({ id: 5, body: `${COMMENT_MARKER}\npasted by a person`, html_url: "x", user: { type: "User" } });
  const made = await apiFor(detectCi(ghEnv()), DEFAULT_CI).api!.upsertComment(`${COMMENT_MARKER}\nours`);
  assert.equal(made.action, "created");
  assert.equal(mock.comments.length, 2);
  assert.match(mock.comments[0]?.body ?? "", /pasted by a person/);

  // the marker may be on page two
  reset();
  for (let i = 0; i < 130; i++) mock.comments.push({ id: i + 1, body: i === 120 ? `${COMMENT_MARKER}\nold` : `chat ${i}`, html_url: "x", user: { type: i === 120 ? "Bot" : "User" } });
  const found = await apiFor(detectCi(ghEnv()), DEFAULT_CI).api!.upsertComment(`${COMMENT_MARKER}\nnew`);
  assert.equal(found.action, "updated");
  assert.equal(mock.comments.length, 130);
});

test("a refused write says what the job needs, and never contains the token", async () => {
  reset();
  mock.deny.add("POST");
  const api = apiFor(detectCi(ghEnv()), DEFAULT_CI).api!;
  await assert.rejects(api.upsertComment("x"), (e: Error) => e instanceof CiApiError && /Posting the comment was refused \(HTTP 403\).*pull-requests: write/.test(e.message) && !e.message.includes("ghs_"));
  await assert.rejects(api.setStatus("success", "ok"), /Setting the commit status was refused \(HTTP 403\).*statuses: write/);
  const w = apiFor(detectCi({ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "a/b" }), DEFAULT_CI);
  assert.equal(w.canComment, false);
  assert.match(w.why.join(" "), /no token: set GITHUB_TOKEN/);
  assert.match(w.why.join(" "), /not for a pull request/);
});

// ---------------------------------------------------------------------------------------------- qamind ci, end to end with a stand-in agent

const run = (proj: string, env: NodeJS.ProcessEnv, extra: Partial<Parameters<typeof runCi>[0]> = {}) => runCi({ projectDir: proj, env, agentCommand: AGENT, timeoutMs: 120_000, ...extra });

test("a pull request gets ONE comment that is updated on the next push, and the right status each time; the job fails on a critical problem", async () => {
  reset();
  const proj = ciProject();
  const env = ghEnv({ FAKE_SCENARIO: "critical" });
  const a = await run(proj, env);
  assert.equal(a.outcome, "fail", JSON.stringify(a.reasons) + (a.error ?? ""));
  assert.equal(a.exit_code, 1);
  assert.deepEqual(a.gate?.failed, ["critical"]);
  assert.equal(a.comment && "action" in a.comment ? a.comment.action : "", "created");
  assert.deepEqual(mock.statuses.map((s) => s.state), ["pending", "failure"], "pending while it checks, then the result");
  assert.ok(mock.statuses.every((s) => s.sha === SHA && s.context === "qamind"), "on the pull request's head commit, under the configured name");
  assert.match(mock.statuses[1]?.description ?? "", /^Failed: 1 critical problem/);
  assert.equal(mock.statuses[1]?.target_url, "https://github.com/acme/shop/actions/runs/99");
  assert.equal(mock.comments.length, 1);
  assert.match(mock.comments[0]?.body ?? "", /## QAMind ⛔ Failed/);
  assert.match(mock.comments[0]?.body ?? "", /Any client can read another company's order|A customer can open another company's order/);

  // the next push: the same pull request, a clean result now
  const b = await run(proj, { ...env, FAKE_SCENARIO: "clean" });
  assert.equal(b.outcome, "pass");
  assert.equal(b.exit_code, 0);
  assert.equal(mock.comments.length, 1, "still one comment");
  assert.match(mock.comments[0]?.body ?? "", /## QAMind ✅ Passed/);
  assert.ok(!/Failed/.test(mock.comments[0]?.body ?? ""), "the old verdict was replaced, not kept");
  assert.deepEqual(mock.statuses.map((s) => s.state), ["pending", "failure", "pending", "success"]);
  assert.equal(mock.calls.filter((c) => c === "POST /repos/acme/shop/issues/7/comments").length, 1, "created once");
  assert.equal(mock.calls.filter((c) => c.startsWith("PATCH /repos/acme/shop/issues/comments/")).length, 1, "then updated in place");
});

test("an important problem is a warning: exit 0, a passing status, said in the comment", async () => {
  reset();
  const a = await run(ciProject(), ghEnv({ FAKE_SCENARIO: "important" }));
  assert.equal(a.outcome, "warn");
  assert.equal(a.exit_code, 0);
  assert.equal(mock.statuses.at(-1)?.state, "success");
  assert.match(mock.statuses.at(-1)?.description ?? "", /^Passed with warnings: 1 important problem/);
  assert.match(mock.comments[0]?.body ?? "", /## QAMind ⚠️ Passed with warnings[\s\S]*\*\*To look at:\*\*\n- 1 important problem/);
});

test("the gate is the config's: fail_on and warn_on decide, not the agent", async () => {
  reset();
  const proj = ciProject({ fail_on: ["important"], warn_on: ["critical"] });
  const a = await run(proj, ghEnv({ FAKE_SCENARIO: "critical" }));
  assert.equal(a.outcome, "fail");
  assert.deepEqual(a.gate?.failed, ["important"]);
  assert.deepEqual(a.gate?.warned, ["critical"]);
});

test("a broken environment fails the run with the reason: the change is not blamed", async () => {
  reset();
  const a = await run(ciProject(), ghEnv({ FAKE_SCENARIO: "env" }));
  assert.equal(a.outcome, "fail");
  assert.deepEqual(a.gate?.failed, ["environment-problem"]);
  assert.match(mock.comments[0]?.body ?? "", /the test environment had a problem/);
});

test("a run that cannot be trusted is an error, not a verdict: a changed checkout, a crashed agent, a hang, a run left open, no credentials", async () => {
  reset();
  const edited = await run(ciProject(), ghEnv({ FAKE_SCENARIO: "edit" }));
  assert.equal(edited.outcome, "error");
  assert.equal(edited.exit_code, 2);
  assert.match(edited.error ?? "", /the run changed the checkout, which a report-only run must never do \(changed: README\.md\)/);
  assert.equal(mock.statuses.at(-1)?.state, "error");
  assert.match(mock.comments[0]?.body ?? "", /## QAMind ⚪ Could not check this change/);

  reset();
  const crashed = await run(ciProject(), ghEnv({ FAKE_SCENARIO: "crash" }));
  assert.match(crashed.error ?? "", /the agent ended \(exit code 3\) before it finished a run/);
  assert.equal(crashed.exit_code, 2);

  reset();
  const open = await run(ciProject(), ghEnv({ FAKE_SCENARIO: "unfinished" }));
  assert.match(open.error ?? "", /before it finished a run \(run-\d{8}T\d{6}Z was started and left open\)/);

  reset();
  const t0 = Date.now();
  const hung = await run(ciProject(), ghEnv({ FAKE_SCENARIO: "hang" }), { timeoutMs: 2500 });
  assert.match(hung.error ?? "", /the agent was stopped at the time limit before it finished a run/);
  assert.equal(hung.agent?.timed_out, true);
  assert.ok(Date.now() - t0 < 60_000, "a hung agent is killed, not waited for");

  reset();
  const noKey = await runCi({ projectDir: ciProject(), host: "claude", env: { ...ghEnv(), ANTHROPIC_API_KEY: "", CLAUDE_CODE_OAUTH_TOKEN: "", CLAUDE_CODE_USE_BEDROCK: "", CLAUDE_CODE_USE_VERTEX: "", CLAUDE_CODE_USE_FOUNDRY: "" } });
  assert.match(noKey.error ?? "", /no Claude Code credentials in the environment \(ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN/);
  assert.equal(noKey.exit_code, 2);
  const noHost = await runCi({ projectDir: ciProject(), env: ghEnv() });
  assert.match(noHost.error ?? "", /no host is named, so QAMind does not know which CLI to run/);
  const badHost = await runCi({ projectDir: ciProject(), host: "nowhere", env: ghEnv() });
  assert.match(badHost.error ?? "", /cannot find hosts\/nowhere\/host\.json/);
  const noLogins = ciProject();
  fs.rmSync(path.join(noLogins, ".env.qa"));
  const e = ghEnv({ FAKE_SCENARIO: "clean" });
  for (const k of Object.keys(DEMO_ENV)) delete e[k];
  assert.match((await run(noLogins, e)).error ?? "", /no test account has both its username and password set/);
});

test("a result that cannot be posted is still the result: the exit code is the gate's, and the reason is told", async () => {
  reset();
  mock.deny.add("POST");
  const a = await run(ciProject(), ghEnv({ FAKE_SCENARIO: "critical" }));
  assert.equal(a.outcome, "fail");
  assert.equal(a.exit_code, 1, "a refused comment does not turn a failing check into a passing one, nor the reverse");
  assert.match(a.warnings.join("\n"), /The pull request comment could not be posted: Posting the comment was refused \(HTTP 403\).*pull-requests: write/);
  assert.match(a.warnings.join("\n"), /The commit status could not be set/);
  assert.ok(fs.existsSync(path.join(a.out_dir, "PR-COMMENT.md")), "the comment is on disk anyway");

  reset();
  const noToken = ghEnv({ FAKE_SCENARIO: "clean" });
  delete noToken["GITHUB_TOKEN"];
  const b = await run(ciProject(), noToken);
  assert.equal(b.outcome, "pass");
  assert.match(JSON.stringify(b.comment), /no token: set GITHUB_TOKEN/);
  assert.equal(mock.calls.length, 0, "nothing was sent anywhere");

  reset();
  const local = await run(ciProject(), { ...process.env, FAKE_SCENARIO: "critical", GITHUB_ACTIONS: "", GITLAB_CI: "" });
  assert.equal(local.exit_code, 1);
  assert.match(JSON.stringify(local.comment), /not running in GitHub Actions or GitLab CI/);
});

test("the outputs: a result file, the comment file, the reports as artifacts and a scrubbed agent log; a dry run posts nothing", async () => {
  reset();
  const proj = ciProject();
  const summary = path.join(tmp("qamind-summary-"), "summary.md");
  const output = path.join(path.dirname(summary), "output.txt");
  fs.writeFileSync(output, "");
  const a = await run(proj, ghEnv({ FAKE_SCENARIO: "critical", GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output }), { dryRun: true });
  assert.equal(mock.calls.length, 0, "a dry run sends nothing");
  const out = a.out_dir;
  assert.equal(out, path.join(fs.realpathSync(proj), "qamind-reports"));
  const result = readJson<{ outcome: string; run_id: string }>(path.join(out, "ci-result.json"));
  assert.equal(result?.outcome, "fail");
  assert.ok(fs.existsSync(path.join(out, result?.run_id as string, "ADMIN-REPORT.md")), "the run's reports are copied for the artifact upload");
  assert.ok(fs.existsSync(path.join(out, result?.run_id as string, "TECHNICAL-REPORT.md")));
  const log = fs.readFileSync(path.join(out, "agent.log"), "utf8");
  assert.match(log, /fake agent: scenario critical/);
  assert.ok(!log.includes(DEMO_ENV["QA_ADMIN_PASS"] as string), "the agent printed a password; the log has it scrubbed");
  assert.match(fs.readFileSync(summary, "utf8"), /## QAMind ⛔ Failed/);
  assert.match(fs.readFileSync(output, "utf8"), /outcome=fail\nexit_code=1\nrun_id=run-/);
});

test("CI starts with no memory; with ci.cache_memory a CI-only store is kept in the project and the next run builds on it", async () => {
  reset();
  const env = ghEnv({ FAKE_SCENARIO: "critical" });
  const plain = ciProject();
  const a = await run(plain, env);
  const b = await run(plain, env);
  assert.notEqual(a.store, b.store, "each CI run gets a fresh store");
  assert.equal(fs.realpathSync(path.dirname(a.store)), fs.realpathSync(os.tmpdir()), "in the machine's temp folder, not in the project or the person's own store");
  assert.equal(JSON.stringify(loadBugs(path.join(b.store, "projects", fs.readdirSync(path.join(b.store, "projects"))[0] as string)).bugs.map((x) => x.times_seen)), "[1,1]", "the second run knew nothing of the first: both problems are new again");

  const cached = ciProject({ cache_memory: true });
  const c = await run(cached, env);
  const d = await run(cached, env);
  assert.equal(c.store, d.store);
  assert.equal(c.store, path.join(fs.realpathSync(cached), ".qamind-ci", "home"));
  const store = path.join(d.store, "projects", fs.readdirSync(path.join(d.store, "projects"))[0] as string);
  assert.equal(JSON.stringify(loadBugs(store).bugs.map((x) => [x.id, x.status, x.times_seen])), '[["BUG-001","still-open",2],["BUG-002","still-open",2]]', "the same problems are still open: the memory carried over");
  void writeJson;
});

test("diff mode lists a modified file by its whole name, even when it is the first line of git's status (it lost its first letter before)", () => {
  const proj = makeProject({ files: { "README.md": "# r\n", "src/app.js": "1\n" } });
  fs.appendFileSync(path.join(proj, "README.md"), "changed\n"); // an unstaged change: git prints " M README.md", and trimming the whole output cut the first character of the name
  fs.writeFileSync(path.join(proj, "notes.txt"), "new\n");
  assert.deepEqual(porcelainFiles(proj).sort(), ["README.md", "notes.txt"]);
  assert.deepEqual(porcelainFiles(proj, { untracked: false }), ["README.md"]);
  assert.deepEqual(gitInfo(proj).changed_files.sort(), ["README.md", "notes.txt"]);
});

// ---------------------------------------------------------------------------------------------- how a host's CLI is run

test("a host describes its own headless CLI in host.json: the command line is built from it, never from core", () => {
  const spec = loadHeadless("claude");
  assert.equal(spec.command, "claude");
  assert.equal(invokeFor(spec, "diff"), "/qamind:qa-only diff");
  const args = agentArgs(spec, { prompt: "the prompt", plugin: "/opt/qamind/plugins/qamind", maxCost: 7, mode: "diff" });
  assert.deepEqual(args, ["-p", "the prompt", "--plugin-dir", "/opt/qamind/plugins/qamind", "--setting-sources", "project,local", "--permission-mode", "dontAsk", "--output-format", "json", "--no-session-persistence", "--max-budget-usd", "7"]);
  assert.ok(!args.includes("--bare"), "--bare would skip QAMind's safety hook and its plugin");
  assert.ok(!args.includes("--dangerously-skip-permissions"));
  assert.deepEqual(agentArgs(spec, { prompt: "p", plugin: "x", maxCost: 1, mode: "full", model: "claude-sonnet-5-5" }).slice(-2), ["--model", "claude-sonnet-5-5"]);
  assert.equal(agentCommandOf(spec, { QAMIND_CLAUDE_BIN: "/opt/claude" }), "/opt/claude");
  assert.equal(agentCommandOf(spec, {}), "claude");
  assert.equal(hasAuth(spec, { ANTHROPIC_API_KEY: "k" }), true);
  assert.equal(hasAuth(spec, { CLAUDE_CODE_USE_BEDROCK: "1" }), true);
  assert.equal(hasAuth(spec, {}), false);
  assert.deepEqual(spec.child_env_remove, ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"]);
  assert.deepEqual(spec.ci_install, { npm_package: "@anthropic-ai/claude-code", version: "2.1.314", label: "the Claude Code CLI" });
});

test("a damaged or missing headless block is said, in words, and a host spec can be pointed at by hand", () => {
  assert.throws(() => parseHeadless({}), /has no headless block in its host\.json/);
  assert.throws(() => parseHeadless({ headless: { label: "X", command: "x", args: "nope" } }), /needs args \(a list of strings\)/);
  assert.throws(() => parseHeadless({ headless: { label: "X", command: "x", args: [], invoke: "/x {mode}", auth_secret: "S", auth_hint: "h", cost_field: "c", ci_install: { npm_package: "p" } } }), /needs ci_install\.version/);
  const dir = tmp("qamind-spec-");
  const file = path.join(dir, "host.json");
  fs.writeFileSync(file, JSON.stringify({ headless: { label: "Other CLI", command: "other", args: ["run", "{prompt}"], invoke: "do {mode}", auth_env_any: ["OTHER_KEY"], auth_secret: "OTHER_KEY", auth_hint: "OTHER_KEY", cost_field: "cost", ci_install: { npm_package: "other-cli", version: "1.0.0", label: "the other CLI" } } }));
  assert.equal(findHostSpec("anything", file), file, "an explicit file wins");
  assert.equal(findHostSpec("anything", path.join(dir, "missing.json")), undefined);
  const spec = loadHeadless("anything", file);
  assert.deepEqual(agentArgs(spec, { prompt: "P", plugin: "x", maxCost: 1, mode: "diff" }), ["run", "P"], "another host is a file, not a change to core");
  assert.throws(() => loadHeadless("nowhere"), /cannot find hosts\/nowhere\/host\.json \(QAMind has to run from a checkout/);
  fs.writeFileSync(file, "{ not json");
  assert.throws(() => loadHeadless("anything", file), /host\.json:/);
});

test("a CI run never edits the checkout, .gitignore included; and `.qa/*` with the config carved out already ignores the reports", async () => {
  const proj = ciProject();
  fs.writeFileSync(path.join(proj, ".gitignore"), "node_modules\n");
  execFileSync("git", ["-C", proj, "add", "-A"], { stdio: "ignore" });
  execFileSync("git", ["-C", proj, "commit", "-qm", "gitignore"], { stdio: "ignore" });
  reset();
  const r = await run(proj, ghEnv({ FAKE_SCENARIO: "clean" }));
  assert.equal(r.outcome, "pass", r.error ?? "");
  assert.equal(fs.readFileSync(path.join(proj, ".gitignore"), "utf8"), "node_modules\n", "QAMind's usual first-run edit of .gitignore does not happen in a CI run");

  // the setup CI needs: the folder's contents ignored, the config committed
  const team = tmp("qamind-team-");
  fs.writeFileSync(path.join(team, ".gitignore"), ".env.qa\n.qa/*\n!.qa/config.md\n");
  assert.deepEqual(ensureGitignoreEntries(team), [], "nothing to add: the reports are already ignored");
  assert.equal(fs.readFileSync(path.join(team, ".gitignore"), "utf8"), ".env.qa\n.qa/*\n!.qa/config.md\n");
  const plain = tmp("qamind-plain-");
  assert.deepEqual(ensureGitignoreEntries(plain), [".env.qa", ".qa/"], "a project with nothing still gets the usual two lines");
});
