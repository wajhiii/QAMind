import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { BUDGET_REASON, DEFAULT_AUTO_MINUTES, addToDay, budgetKey, budgetStatus, dailyBudgetProblem, dayOf, dayUsage, resolveBudget } from "../../core/lib/budget.ts";
import { normalizeConfig, policyFromConfig, splitFrontMatter } from "../../core/lib/config.ts";
import type { QamindConfig } from "../../core/lib/config.ts";
import { runPlan } from "../../core/lib/apirunner.ts";
import type { Plan } from "../../core/lib/apiplan.ts";
import { finishRunTracked } from "../../core/lib/memory/service.ts";
import { startRun } from "../../core/lib/run.ts";
import { DEMO_CONFIG, DEMO_ENV, makeConfiguredProject, makeRunWithData, repoRoot, tmp } from "./helpers.ts";

// Phase 7.6, spec 13.6: time and cost budgets. Time is a real deadline the tools check; cost cannot be seen by QAMind, so it is told and recorded, never claimed to be enforced.

const NOW = new Date("2026-11-02T12:00:00Z");
const raw = (): Record<string, any> => parseYaml(splitFrontMatter(DEMO_CONFIG)?.yaml ?? "") as Record<string, any>;
const config = (budget?: unknown): QamindConfig => {
  const problems: string[] = [];
  const c = normalizeConfig({ ...raw(), ...(budget !== undefined ? { budget } : {}) }, problems) as QamindConfig;
  assert.deepEqual(problems, []);
  return c;
};

test("budget settings are validated, and an unknown mode or a bad number is refused with what to write", () => {
  const p: string[] = [];
  normalizeConfig({ ...raw(), budget: { time_minutes: 0, max_cost: -1, daily_max: "lots", modes: { fast: { time_minutes: 5 }, quick: { time_minutes: 99999 } } } }, p);
  const text = p.join("\n");
  assert.match(text, /budget\.time_minutes must be a number of minutes from 1 to 1440/);
  assert.match(text, /budget\.max_cost must be a positive number/);
  assert.match(text, /budget\.daily_max must be a number of minutes/);
  assert.match(text, /budget\.modes\.fast: not a mode/);
  assert.match(text, /budget\.modes\.quick\.time_minutes/);
  assert.equal(config({ time_minutes: 30, max_cost: 10, daily_max: 120, modes: { quick: { time_minutes: 10 } } }).budget.modes.quick?.time_minutes, 10);
});

test("a run's budget: the mode's own limit, then the general one; auto-QA and CI use their own keys; auto-QA gets five minutes if nobody said", () => {
  const c = config({ time_minutes: 30, max_cost: 10, modes: { quick: { time_minutes: 10 }, auto: { time_minutes: 7 }, ci: { time_minutes: 20, max_cost: 3 } } });
  assert.deepEqual([budgetKey("diff", "auto"), budgetKey("full", "ci"), budgetKey("quick", "manual")], ["auto", "ci", "quick"], "a run started by auto-QA or CI is that, whatever its scope");
  assert.equal(resolveBudget(c, "quick", "manual", NOW).time_minutes, 10);
  assert.equal(resolveBudget(c, "full", "manual", NOW).time_minutes, 30, "the general limit when the mode has none");
  assert.equal(resolveBudget(c, "diff", "auto", NOW).time_minutes, 7);
  const ci = resolveBudget(c, "full", "ci", NOW);
  assert.deepEqual([ci.time_minutes, ci.max_cost, ci.deadline], [20, 3, "2026-11-02T12:20:00.000Z"]);
  assert.equal(resolveBudget(c, "full", "manual", NOW).max_cost, 10);
  assert.equal(resolveBudget(c, "diff", "auto", NOW, 3).time_minutes, 3, "the user's own auto-QA setting beats the project's config");
  assert.equal(resolveBudget(config(), "diff", "auto", NOW).time_minutes, DEFAULT_AUTO_MINUTES);
  const none = resolveBudget(config(), "full", "manual", NOW);
  assert.deepEqual([none.time_minutes, none.deadline, none.source], [undefined, undefined, "no budget is set"], "a manual run with nothing set has no limit");
});

test("budget status says how much is left, says near at the last fifth, and says over with what to do", () => {
  const b = resolveBudget(config({ time_minutes: 10 }), "full", "manual", NOW);
  const at = (min: number) => budgetStatus(b, NOW.toISOString(), new Date(NOW.getTime() + min * 60_000));
  assert.deepEqual([at(0).state, at(5).state, at(7.9).state, at(8.5).state, at(10).state, at(30).state], ["ok", "ok", "ok", "near", "over", "over"]);
  assert.equal(at(5).remaining_minutes, 5);
  assert.match(at(8.5).message, /1\.5 of 10 minutes left\. Finish what you are on/);
  const over = at(12);
  assert.equal(over.remaining_minutes, 0);
  assert.match(over.message, new RegExp(`Stop exploring now.*"${BUDGET_REASON}".*finish the run`));
  assert.equal(budgetStatus(undefined, NOW.toISOString(), NOW).state, "none");
  assert.match(budgetStatus({ max_cost: 5, source: "x" }, NOW.toISOString(), NOW).message, /cost limit of 5 is set: stay within it \(QAMind cannot see your spending\)/);
});

// ---- the deadline, enforced by the tools

async function demoServer(): Promise<{ url: string; hits: () => number; close: () => Promise<void> }> {
  let n = 0;
  const server = http.createServer((_req, res) => {
    n++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hits: () => n, close: () => new Promise((r) => server.close(() => r())) };
}

test("the API runner stops starting probes at the deadline: the rest are skipped as 'time budget reached', and nothing is faked", async () => {
  const srv = await demoServer();
  try {
    const runDir = tmp("qamind-run-");
    const plan = { name: "p", version: 1, description: "d", probes: Array.from({ length: 6 }, (_, i) => ({ id: `P${i}`, title: `probe ${i}`, role: "anonymous", method: "GET" as const, path: `/x${i}`, expect: { status: 200 } })) } as unknown as Plan;
    const common = { baseUrl: srv.url, policy: { allowed_origins: [srv.url], blocked_patterns: [] }, roles: [], runDir };
    const early = await runPlan(plan, { ...common, deadlineMs: Date.now() + 60_000 });
    assert.deepEqual([early.summary.total, early.summary.passed, early.summary.skipped, early.summary.budget_reached], [6, 6, 0, undefined]);
    const before = srv.hits();
    const late = await runPlan({ ...plan, name: "q" }, { ...common, deadlineMs: Date.now() - 1 });
    assert.equal(srv.hits(), before, "no request was made after the deadline");
    assert.deepEqual([late.summary.passed, late.summary.skipped, late.summary.budget_reached], [0, 6, 6]);
    assert.ok(late.results.every((r) => r.skipped === BUDGET_REASON));
    let calls = 0;
    const mid = await runPlan({ ...plan, name: "r" }, { ...common, deadlineMs: Date.now() + 5_000, fetchImpl: (async () => (calls++, { status: 200, headers: new Headers(), text: async () => "{}" })) as unknown as typeof fetch });
    assert.equal(mid.summary.skipped, 0, "inside the budget everything runs");
    assert.equal(calls, 6);
  } finally {
    await srv.close();
  }
});

test("the run carries its budget from the start: run_start says it, the marker holds it, run finish records how it ended", () => {
  const proj = makeConfiguredProject({ remote: "https://github.com/acme/shop.git" });
  const cfgFile = path.join(proj, ".qa", "config.md");
  fs.writeFileSync(cfgFile, DEMO_CONFIG.replace(/\nhealth:/, "\nbudget:\n  time_minutes: 30\n  max_cost: 4\n  modes:\n    quick: { time_minutes: 10 }\nhealth:"));
  const home = tmp("qamind-home-");
  const r = startRun({ cwd: proj, mode: "quick", kind: "qa-only", host: "test", home, env: {}, sessionId: "s", now: NOW });
  assert.equal(r.status, "ready", JSON.stringify(r).slice(0, 200));
  assert.deepEqual([r.run?.budget?.time_minutes, r.run?.budget?.max_cost, r.run?.budget?.deadline], [10, 4, "2026-11-02T12:10:00.000Z"]);
  assert.match(r.run?.budget?.message ?? "", /10 of 10 minutes left\. .*cost limit of 4/);
  const marker = JSON.parse(fs.readFileSync(path.join(r.project?.store as string, "state", "run-marker.json"), "utf8"));
  assert.equal(marker.budget.time_minutes, 10);
  assert.equal(marker.budget.source, "budget.modes.quick.time_minutes in the config");
});

test("a finished run records usage, the budget outcome and, by default, 'environment problem' when the environment was broken", () => {
  const fx = makeRunWithData();
  const marker = JSON.parse(fs.readFileSync(path.join(fx.store, "state", "run-marker.json"), "utf8"));
  marker.budget = { time_minutes: 1, deadline: new Date(Date.parse(marker.started) + 60_000).toISOString(), source: "test" };
  fs.writeFileSync(path.join(fx.store, "state", "run-marker.json"), JSON.stringify(marker));
  fs.writeFileSync(path.join(fx.runDir, "data", "health.json"), JSON.stringify({ environment_ok: false, ran_at: "x", checks: [{ name: "API base responds", ok: false, detail: "no response (twice)" }] }));
  fs.writeFileSync(path.join(fx.runDir, "data", "findings.json"), "[]");
  const done = finishRunTracked(fx.home, fx.runId, { cost: "$0.40", now: new Date(Date.parse(marker.started) + 90_000) });
  assert.deepEqual(done.usage, { duration_s: 90, cost_usd: 0.4, note: "$0.40" });
  assert.deepEqual([done.budget?.time_minutes, done.budget?.used_minutes, done.budget?.reached], [1, 1.5, true]);
  assert.equal(done.stop_reason, "environment problem", "a broken environment is not 'completed' even if the agent forgot to say so");
  const tech = fs.readFileSync(path.join(fx.runDir, "TECHNICAL-REPORT.md"), "utf8");
  assert.match(tech, /\| Time budget \| \*\*1 minutes: reached\*\* \(1\.5 used\)/);
  assert.match(tech, /\| Cost \/ usage \| \$0\.4 \(\$0\.40\) \|/);
  assert.match(tech, /\| Stop reason \| environment problem \|/);
  assert.match(tech, /## Environment health[\s\S]*Environment problem/);
});

test("a fix is not started after the deadline", async () => {
  const { begin } = await import("../../core/lib/fix/loop.ts");
  const { runScope } = await import("../../core/lib/memory/service.ts");
  const fx = makeRunWithData();
  const markerFile = path.join(fx.store, "state", "run-marker.json");
  const m = JSON.parse(fs.readFileSync(markerFile, "utf8"));
  fs.writeFileSync(markerFile, JSON.stringify({ ...m, kind: "qa", readonly: false, budget: { time_minutes: 1, deadline: new Date(Date.now() - 1000).toISOString(), source: "t" }, fix: { do_not_touch: [], max_fixes: 5, severities: ["critical"] } }));
  fs.mkdirSync(path.join(fx.runDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(fx.runDir, "data", "fix-state.json"), JSON.stringify({ schema_version: 1, run: fx.runId, branch: "qa/x", base_commit: "abc", started: "x", max_fixes: 5, severities: ["critical"], commands: {}, attempts: [], reverts: 0, reverts_at_last_continue: 0, paused_at: 0, continues: [] }));
  const r = begin(runScope(fx.home, fx.runId, {}), { issue: "ISSUE-001", files: ["src/a.js"], test_files: ["test/a.test.js"], plan: "x" } as never) as { ok: false; problem: string; message: string };
  assert.equal(r.ok, false);
  assert.equal(r.problem, "time-budget-reached");
  assert.match(r.message, /No new fix is started after the deadline/);
});

// ---- the daily total

test("auto-QA and CI add to a daily total that a manual run does not; auto-QA pauses when it is used up; old days are forgotten", () => {
  const store = tmp("qamind-store-");
  const c = config({ daily_max: 10 });
  assert.equal(dailyBudgetProblem(store, c, NOW), undefined);
  addToDay(store, "manual", 3600, NOW);
  assert.deepEqual(dayUsage(store, NOW), { minutes: 0, runs: 0 }, "a manual run is not counted");
  addToDay(store, "auto", 300, NOW);
  addToDay(store, "ci", 240, NOW);
  assert.deepEqual(dayUsage(store, NOW), { minutes: 9, runs: 2 });
  assert.equal(dailyBudgetProblem(store, c, NOW), undefined, "9 of 10 minutes");
  addToDay(store, "auto", 60, NOW);
  assert.match(dailyBudgetProblem(store, c, NOW) ?? "", /daily budget of 10 minutes for auto-QA and CI is used up \(10 minutes in 3 runs today\)\. It resumes tomorrow; #qa still runs QA/);
  const tomorrow = new Date(NOW.getTime() + 26 * 3600_000);
  assert.equal(dailyBudgetProblem(store, c, tomorrow), undefined, "a new day starts at zero");
  assert.equal(dailyBudgetProblem(store, config(), NOW), undefined, "no daily_max, no limit");
  for (let d = 1; d <= 20; d++) addToDay(store, "auto", 60, new Date(NOW.getTime() - d * 86_400_000));
  const kept = Object.keys(JSON.parse(fs.readFileSync(path.join(store, "state", "budget-days.json"), "utf8")));
  assert.ok(kept.length <= 14, "only two weeks are kept");
  assert.equal(dayOf(new Date(2026, 0, 5, 23, 59)), "2026-01-05", "the day is the user's own calendar day");
});

// ---- the gate

const BIN = path.join(repoRoot, "cli", "src", "bin.ts");
function hook(home: string, args: string[], input: unknown, cwd: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, QAMIND_HOME: home, NODE_NO_WARNINGS: "1", QAMIND_DEBUG: "1" };
  for (const k of ["QAMIND_AUTO", "NODE_TEST_CONTEXT", "CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "QAMIND_PROJECT_DIR"]) delete env[k];
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env, input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8" });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, rule: /\(rule (\w+)\)/.exec(r.stderr)?.[1] };
}

test("auto-QA pauses itself when the day's budget is used up, says so once, and a #qa tag still runs", async () => {
  const home = tmp("qamind-home-");
  const proj = (await import("./helpers.ts")).makeProject({ remote: "https://github.com/acme/daily.git", files: { "src/app.js": "1\n", ".gitignore": ".qa/\n.env.qa\n", "openapi.yaml": fs.readFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), "utf8") } });
  fs.mkdirSync(path.join(proj, ".qa"), { recursive: true });
  fs.writeFileSync(path.join(proj, ".qa", "config.md"), DEMO_CONFIG.replace(/\nhealth:/, "\nbudget:\n  daily_max: 10\nhealth:"));
  fs.writeFileSync(path.join(proj, ".env.qa"), Object.entries(DEMO_ENV).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  const prompt = (text: string, s = "s1") => hook(home, ["hook", "user-prompt-submit"], { session_id: s, cwd: proj, prompt: text }, proj);
  const stop = (s = "s1") => hook(home, ["hook", "stop"], { session_id: s, cwd: proj, stop_hook_active: false }, proj);
  const edit = (): void => fs.writeFileSync(path.join(proj, "src", "app.js"), `${Math.random()}\n`);
  hook(home, ["auto", "on"], "", proj);
  hook(home, ["auto", "set", "cooldown", "0"], "", proj);
  prompt("one");
  edit();
  assert.equal(stop().json?.decision, "block", "under the daily budget it runs");
  const store = path.join(home, "projects", fs.readdirSync(path.join(home, "projects"))[0] as string);
  addToDay(store, "auto", 11 * 60, new Date());
  prompt("two");
  edit();
  const first = stop();
  assert.equal(first.json?.decision, undefined);
  assert.match(first.json?.systemMessage ?? "", /^Auto-QA paused for today: the daily budget of 10 minutes for auto-QA and CI is used up/);
  assert.equal(first.rule, "budget");
  prompt("three");
  edit();
  const second = stop();
  assert.equal(second.stdout, "", "said once, not on every turn");
  assert.equal(second.rule, "budget");
  prompt("four #qa");
  edit();
  assert.equal(stop().json?.decision, "block", "a tag still asks for a run");
  const status = hook(home, ["auto", "status"], "", proj).json;
  assert.deepEqual([status.daily_budget.max_minutes, status.daily_budget.used_minutes, status.daily_budget.paused_today], [10, 11, true]);
});
