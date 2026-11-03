/**
 * The CI end-to-end test (spec section 14, Phase 7.8): the real `qamind ci` (built bundle) starts real headless Claude Code with the QAMind plugin against a copy of the demo app on a feature branch, with the logins only
 * in the environment as in real CI, and posts to a stand-in GitHub API on a local port. Then `qamind ci --from-run` judges the same run again, which must update the same comment.
 * Everything is checked from files and from what the stand-in received, not from the agent's words. Writes docs/baselines/<label>-ci.{json,md}.
 *
 *   node scripts/eval-ci.ts --label phase-7.8 [--budget 3] [--timeout-min 12] [--keep]
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { startMockGithub } from "../tests/core/fixtures/mock-github.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { label: { type: "string" }, budget: { type: "string", default: "3" }, "timeout-min": { type: "string", default: "12" }, claude: { type: "string" }, keep: { type: "boolean", default: false } } });
if (!values.label) {
  console.error("--label is required");
  process.exit(2);
}
const claude = values.claude ?? process.env["CLAUDE_BIN"] ?? "claude";
if (spawnSync(claude, ["--version"], { encoding: "utf8" }).status !== 0) {
  console.error(`Cannot run "${claude}". Pass --claude or set CLAUDE_BIN.`);
  process.exit(2);
}
const bundle = path.join(repoRoot, "plugins", "qamind", "dist", "qamind.mjs");
if (!fs.existsSync(bundle)) {
  console.error("plugins/qamind is not built: run `node scripts/build.ts` first.");
  process.exit(2);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-ci-eval-"));
const ws = path.join(root, "ws");
fs.mkdirSync(ws, { recursive: true });
const EXCLUDE = new Set(["node_modules", ".qa", ".env.qa", ".env.qa.fixture", "SEEDED-BUGS.md", "eval", "qa-fixture"]);
fs.cpSync(path.join(repoRoot, "demo-app"), ws, { recursive: true, filter: (src) => !EXCLUDE.has(path.basename(src)) });
const git = (...a: string[]): string => execFileSync("git", ["-C", ws, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
for (const c of [["init", "-q", "-b", "main"], ["config", "user.name", "Dev"], ["config", "user.email", "dev@example.test"]]) git(...c);
fs.writeFileSync(path.join(ws, ".gitignore"), "node_modules\n.env.qa\n.qa/*\n!.qa/config.md\nqamind-reports/\n.qamind-ci/\n");
const config = fs.readFileSync(path.join(repoRoot, "demo-app", "qa-fixture", "config.md"), "utf8");
const at = config.indexOf("\n---", 5);
// What a team commits: the config (URLs, flows, rules; no passwords), here with a CI time limit.
fs.mkdirSync(path.join(ws, ".qa"), { recursive: true });
fs.writeFileSync(path.join(ws, ".qa", "config.md"), `${config.slice(0, at)}\nci:\n  timeout_minutes: ${values["timeout-min"]}\nbudget:\n  modes:\n    ci: { time_minutes: 8, max_cost: ${values.budget} }${config.slice(at)}`);
git("add", "-A");
git("commit", "-qm", "demo app");
git("checkout", "-q", "-b", "feature");
fs.appendFileSync(path.join(ws, "src", "api.mjs"), "\n// the pull request touches the API code\n");
git("commit", "-qam", "touch the API");
const headSha = git("rev-parse", "HEAD");

// The logins come from the environment only, as in CI: there is no .env.qa in the checkout.
const logins: Record<string, string> = {};
for (const l of fs.readFileSync(path.join(repoRoot, "demo-app", ".env.qa.fixture"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) logins[m[1] as string] = m[2] as string;
}
const passwords = Object.entries(logins).filter(([k, v]) => /PASS/.test(k) && v.length >= 6).map(([, v]) => v);

let server: ChildProcess | undefined;
const answering = async (): Promise<boolean> => {
  try {
    return (await fetch("http://127.0.0.1:4100/api/health")).ok;
  } catch {
    return false;
  }
};
if (await answering()) {
  console.error("Something is already listening on port 4100 (a stale demo app?). Stop it and run again.");
  process.exit(2);
}
server = spawn(process.execPath, ["server.mjs"], { cwd: ws, stdio: "ignore" });
for (let i = 0; ; i++) {
  if (server.exitCode !== null || i >= 40) throw new Error("The demo app did not start (are ports 4100-4102 free?).");
  if (await answering()) break;
  await new Promise((r) => setTimeout(r, 250));
}
spawnSync(process.execPath, ["scripts/reset.mjs"], { cwd: ws });

const gh = await startMockGithub();
const eventFile = path.join(root, "event.json");
fs.writeFileSync(eventFile, JSON.stringify({ number: 7, pull_request: { number: 7, head: { sha: headSha, ref: "feature" }, base: { ref: "main" } } }));
const ciEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => {
  const e: NodeJS.ProcessEnv = { ...process.env, ...logins, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "acme/shop", GITHUB_API_URL: gh.mock.url, GITHUB_TOKEN: "ghs_evaltoken_1234567890abcdef", GITHUB_EVENT_PATH: eventFile, GITHUB_RUN_ID: "4242", GITHUB_SERVER_URL: "https://github.com", GITHUB_BASE_REF: "main", QAMIND_CI_SKIP_AUTH_CHECK: "1", QAMIND_CLAUDE_BIN: claude, ...extra };
  for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "NODE_TEST_CONTEXT", "QAMIND_HOME", "QAMIND_AUTO"]) delete e[k];
  return e;
};
const qamindCi = (args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ code: number | null; out: string; err: string }> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [bundle, "ci", ...args], { cwd: ws, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => (err += c.toString("utf8")));
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(t);
      resolve({ code, out, err });
    });
  });

const problems: string[] = [];
const notes: Record<string, unknown> = {};
const started = Date.now();
console.log("== qamind ci --mode diff (real headless Claude Code)");
const first = await qamindCi(["--mode", "diff", "--out", path.join(ws, "qamind-reports")], ciEnv({ GITHUB_STEP_SUMMARY: path.join(root, "step-summary.md"), GITHUB_OUTPUT: path.join(root, "gh-output.txt") }), (Number(values["timeout-min"]) + 5) * 60_000);
const minutes = Math.round((Date.now() - started) / 600) / 100;
console.log(`  exit ${first.code}, ${minutes} min`);
let result: Record<string, any> = {};
try {
  result = JSON.parse(first.out) as Record<string, any>;
} catch {
  problems.push(`qamind ci printed no result: ${first.out.slice(0, 200)} ${first.err.slice(0, 200)}`);
}
notes["result"] = { outcome: result["outcome"], exit_code: result["exit_code"], mode: result["mode"], reasons: result["reasons"], comment: result["comment"], status: result["status"], warnings: result["warnings"], agent: result["agent"], error: result["error"] };
const outDir = path.join(ws, "qamind-reports");
const read = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
const runId: string | undefined = result["run_id"];

if (result["outcome"] === "error") problems.push(`qamind ci could not check the change: ${result["error"]}`);
if (first.code !== result["exit_code"]) problems.push(`the process exit code ${first.code} is not the result's ${result["exit_code"]}`);
if (runId) {
  const runDir = path.join(outDir, runId);
  const meta = JSON.parse(read(path.join(runDir, "data", "meta.json")) || "{}") as Record<string, any>;
  notes["run"] = { id: runId, trigger: meta["trigger"], kind: meta["kind"], mode: meta["mode"], stop_reason: meta["stop_reason"], changed_files_seen_by_run: undefined };
  if (meta["trigger"] !== "ci") problems.push(`the run's trigger is "${meta["trigger"]}", expected ci (the agent must not choose it)`);
  if (meta["kind"] !== "qa-only") problems.push(`the run kind is "${meta["kind"]}": a CI run is report-only`);
  const findings = JSON.parse(read(path.join(runDir, "data", "findings.json")) || "[]") as Array<{ severity: string }>;
  const count = (s: string): number => findings.filter((f) => f.severity === s).length;
  notes["findings"] = { critical: count("critical"), important: count("important"), minor: count("minor") };
  // The gate, recomputed here from the run's own data with the default rules.
  const expected = result["gate"]?.facts?.environment_problem || count("critical") > 0 ? "fail" : count("important") > 0 ? "warn" : "pass";
  notes["expected_outcome_from_findings"] = expected;
  if (result["outcome"] !== expected && !(count("critical") > 0 && result["outcome"] === "fail")) problems.push(`the outcome is "${result["outcome"]}" but the findings (${JSON.stringify(notes["findings"])}) mean "${expected}" by the default rules`);
  const admin = read(path.join(runDir, "ADMIN-REPORT.md"));
  const comment = read(path.join(outDir, "PR-COMMENT.md"));
  notes["admin_verdict_line"] = admin.split("\n")[0];
  if (!comment.includes(admin.split("\n")[0] as string)) problems.push("the comment does not carry the admin report's verdict line");
  if (!fs.existsSync(path.join(runDir, "TECHNICAL-REPORT.md"))) problems.push("the technical report was not copied to the artifacts folder");
}
// What the stand-in GitHub received
notes["comments_on_the_pull_request"] = gh.mock.comments.length;
if (gh.mock.comments.length !== 1) problems.push(`${gh.mock.comments.length} comments on the pull request, expected exactly one`);
const posted = gh.mock.comments[0]?.body ?? "";
if (!posted.startsWith("<!-- qamind-ci:v1 -->")) problems.push("the comment does not start with QAMind's marker");
if (posted !== read(path.join(outDir, "PR-COMMENT.md"))) problems.push("the posted comment differs from PR-COMMENT.md");
notes["statuses"] = gh.mock.statuses.map((s) => `${s.state}: ${s.description.slice(0, 80)}`);
if (gh.mock.statuses[0]?.state !== "pending") problems.push("the first status was not 'pending'");
const expectedState = result["outcome"] === "fail" ? "failure" : result["outcome"] === "error" ? "error" : "success";
if (gh.mock.statuses.at(-1)?.state !== expectedState) problems.push(`the last status is "${gh.mock.statuses.at(-1)?.state}", expected "${expectedState}"`);
if (!gh.mock.statuses.every((s) => s.sha === headSha && s.context === "qamind")) problems.push("a status was not set on the pull request's head commit under the name qamind");
if (!read(path.join(root, "step-summary.md")).includes("## QAMind")) problems.push("the job summary page was not written");
if (!/outcome=\w+\nexit_code=\d/.test(read(path.join(root, "gh-output.txt")))) problems.push("the step outputs were not written");
// A report-only run changed nothing
const dirty = git("status", "--porcelain", "--untracked-files=no");
if (dirty) problems.push(`tracked files changed in the checkout: ${dirty.replace(/\n/g, ", ")}`);
if (git("rev-parse", "HEAD") !== headSha) problems.push("the commit changed");
// No secret anywhere QAMind wrote, nor in what was sent
const hits: string[] = [];
const walk = (d: string): void => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(json|jsonl|md|txt|log|html|csv)$/i.test(e.name) && fs.statSync(f).size < 20_000_000) {
      const t = fs.readFileSync(f, "utf8");
      if (passwords.some((p) => t.includes(p)) || t.includes("ghs_evaltoken")) hits.push(path.relative(root, f));
    }
  }
};
walk(outDir);
walk(result["store"] ? String(result["store"]) : path.join(root, "none"));
if (passwords.some((p) => posted.includes(p)) || gh.mock.statuses.some((s) => passwords.some((p) => s.description.includes(p)))) hits.push("what was sent to GitHub");
notes["files_with_a_secret"] = hits;
if (hits.length) problems.push(`a secret is in: ${hits.slice(0, 4).join(", ")}`);
if ([...gh.mock.tokens].some((t) => t !== "Bearer ghs_evaltoken_1234567890abcdef")) problems.push("the token was sent in an unexpected form");
const store = (result["store"] as string | undefined) ?? "";
notes["store_is_fresh_temp_folder"] = !!store && fs.realpathSync(path.dirname(store)) === fs.realpathSync(os.tmpdir()) && store !== path.join(os.homedir(), ".qamind");
if (!notes["store_is_fresh_temp_folder"]) problems.push(`the CI store is not a fresh temporary folder: ${store}`);

// The same run judged again (as the next push would): the comment is updated in place, not added
let second: { code: number | null; out: string } | undefined;
if (runId) {
  console.log("== qamind ci --from-run (the same run, judged again)");
  second = await qamindCi(["--from-run", runId, "--out", path.join(root, "second")], ciEnv(), 120_000);
  notes["second_call"] = { exit: second.code, comments_after: gh.mock.comments.length, statuses_after: gh.mock.statuses.length };
  if (gh.mock.comments.length !== 1) problems.push(`after judging the run again there are ${gh.mock.comments.length} comments, expected still one`);
  if (second.code !== first.code) problems.push("judging the same run again gave another exit code");
  if (!gh.mock.calls.some((c) => c.startsWith("PATCH /repos/acme/shop/issues/comments/"))) problems.push("the comment was not updated in place");
}

server?.kill();
gh.close();
const record = { label: values.label, date: new Date().toISOString(), claude: spawnSync(claude, ["--version"], { encoding: "utf8" }).stdout.trim(), minutes, notes, problems, passed: problems.length === 0 };
const out = path.join(repoRoot, "docs", "baselines", `${values.label}-ci`);
const scrub = (t: string): string => t.split(fs.realpathSync(root)).join("<tmp>").split(root).join("<tmp>").split(os.homedir()).join("~").replace(/\/(?:private\/)?var\/folders\/[^"\s']*/g, "<tmp>");
fs.writeFileSync(`${out}.json`, scrub(JSON.stringify(record, null, 2)) + "\n");
fs.writeFileSync(`${out}.md`, scrub([`# CI end to end: ${values.label}`, "", `${record.date}, Claude Code ${record.claude}. The real \`qamind ci\` with real headless Claude Code on a feature branch of the demo app, against a stand-in GitHub API. ${minutes} minutes.`, "", record.passed ? "**Result: pass.**" : `**Result: FAIL.** ${problems.join("; ")}`, "", "```json", JSON.stringify(notes, null, 2), "```", ""].join("\n")));
console.log(`\nSaved ${path.relative(repoRoot, out)}.{json,md}; ${record.passed ? "PASSED" : `FAILED:\n  ${problems.join("\n  ")}`}`);
if (!values.keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Workspace kept at ${root}`);
process.exit(record.passed ? 0 : 1);
