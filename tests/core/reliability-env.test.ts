import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { checkConfigText, normalizeConfig, splitFrontMatter } from "../../core/lib/config.ts";
import type { QamindConfig } from "../../core/lib/config.ts";
import { commandProblem, prepFile, prepareEnvironment, restoreEnvironment, shouldPrepare } from "../../core/lib/envprep.ts";
import { healthWithPrep, runHealthCheck } from "../../core/lib/health.ts";
import { recordEnvQuirks } from "../../core/lib/memory/update.ts";
import { loadLearnings } from "../../core/lib/memory/learnings.ts";
import { lintRun, readRunData } from "../../core/lib/report.ts";
import { policyFromConfig } from "../../core/lib/config.ts";
import { DEMO_CONFIG, DEMO_ENV, finding, makeRunWithData, tmp } from "./helpers.ts";

// Phase 7.6, spec 13.1: test data setup and reset, and the environment health check. The commands here are real shell commands (node one-liners) in a real folder.

const raw = (): Record<string, any> => parseYaml(splitFrontMatter(DEMO_CONFIG)?.yaml ?? "") as Record<string, any>;
const config = (extra: Record<string, unknown> = {}): QamindConfig => {
  const problems: string[] = [];
  const c = normalizeConfig({ ...raw(), ...extra }, problems) as QamindConfig;
  assert.deepEqual(problems, []);
  return c;
};
const problemsOf = (extra: Record<string, unknown>): string[] => {
  const p: string[] = [];
  normalizeConfig({ ...raw(), ...extra }, p);
  return p;
};
const node = (code: string): string => `node -e "${code.replace(/"/g, '\\"')}"`;

// ---- the config keys

test("the new sections are optional, with documented defaults", () => {
  const c = config();
  assert.deepEqual(c.setup, { run_before: "never", timeout_s: 120 });
  assert.deepEqual(c.budget, { modes: {} });
  assert.deepEqual(c.privacy, { mask_patterns: [], mask_selectors: [], mask_fields: [] });
  const template = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "core", "shared", "templates", "config.md"), "utf8");
  assert.equal(checkConfigText(template, { projectRoot: tmp() }).config?.setup.run_before, "never", "the template, with its commented examples, still parses to the defaults");
});

test("setup is validated: run_before, one-line commands, a snapshot needs its restore", () => {
  const c = config({ setup: { run_before: "full_runs", reset_command: "npm run reset", seed_command: "npm run seed", snapshot_command: "./snap.sh", restore_command: "./restore.sh", timeout_s: 60 } });
  assert.deepEqual(c.setup, { run_before: "full_runs", reset_command: "npm run reset", seed_command: "npm run seed", snapshot_command: "./snap.sh", restore_command: "./restore.sh", timeout_s: 60 });
  assert.match(problemsOf({ setup: { run_before: "sometimes" } }).join(" "), /setup\.run_before must be one of never, full_runs, always/);
  assert.match(problemsOf({ setup: { reset_command: "a\nb" } }).join(" "), /one command on one line/);
  assert.match(problemsOf({ setup: { reset_command: "x".repeat(501) } }).join(" "), /up to 500 characters/);
  assert.match(problemsOf({ setup: { snapshot_command: "./snap.sh" } }).join(" "), /snapshot_command needs setup\.restore_command/);
  assert.match(problemsOf({ setup: { restore_command: "./r.sh" } }).join(" "), /restore_command needs setup\.snapshot_command/);
  assert.match(problemsOf({ setup: { timeout_s: 1 } }).join(" "), /timeout_s must be a number of seconds from 5 to 3600/);
  assert.match(problemsOf({ setup: "npm run reset" }).join(" "), /setup must be a mapping/);
});

// ---- when to prepare

test("setup.run_before decides when: never, only before full runs, before every run, and only if something is configured", () => {
  const s = (over: object) => config({ setup: { reset_command: "x", ...over } }).setup;
  assert.deepEqual(shouldPrepare(s({}), "full"), { run: false, why: "setup.run_before is never" });
  assert.equal(shouldPrepare(s({ run_before: "full_runs" }), "full").run, true);
  assert.match(shouldPrepare(s({ run_before: "full_runs" }), "quick").why, /full_runs and this is a quick run/);
  assert.equal(shouldPrepare(s({ run_before: "always" }), "diff").run, true);
  assert.deepEqual(shouldPrepare(config().setup, "full"), { run: false, why: "no setup commands are configured" });
});

// ---- the commands

function projectWith(setup: Record<string, unknown>): { cfg: QamindConfig; root: string; runDir: string } {
  const root = tmp("qamind-env-");
  const runDir = path.join(root, ".qa", "reports", "run-1");
  fs.mkdirSync(path.join(runDir, "data"), { recursive: true });
  return { cfg: config({ setup: { run_before: "always", ...setup } }), root, runDir };
}
const log = (root: string): string => (fs.existsSync(path.join(root, "order.txt")) ? fs.readFileSync(path.join(root, "order.txt"), "utf8").trim().split("\n").join(",") : "");
const append = (word: string): string => node(`require('fs').appendFileSync('order.txt','${word}\\n')`);

test("snapshot, reset and seed run in that order in the project folder, and what ran is recorded", async () => {
  const p = projectWith({ snapshot_command: append("snapshot"), restore_command: append("restore"), reset_command: append("reset"), seed_command: append("seed") });
  const prep = await prepareEnvironment({ config: p.cfg, projectRoot: p.root, runDir: p.runDir, mode: "full" });
  assert.equal(prep.ok, true);
  assert.deepEqual(prep.steps.map((s) => [s.name, s.ok]), [["snapshot", true], ["reset", true], ["seed", true]]);
  assert.equal(log(p.root), "snapshot,reset,seed");
  assert.equal(prep.snapshot_taken, true);
  assert.equal(JSON.parse(fs.readFileSync(prepFile(p.runDir), "utf8")).ran, true);
  // the restore runs once, and only because a snapshot was taken
  const r = await restoreEnvironment({ config: p.cfg, projectRoot: p.root, runDir: p.runDir });
  assert.equal(r?.ok, true);
  assert.equal(log(p.root), "snapshot,reset,seed,restore");
  await restoreEnvironment({ config: p.cfg, projectRoot: p.root, runDir: p.runDir });
  assert.equal(log(p.root), "snapshot,reset,seed,restore", "a second restore does nothing");
});

test("a failing step stops the rest and makes the environment unfit: no seed on top of a failed reset", async () => {
  const p = projectWith({ reset_command: `${append("reset")} && ${node("process.exit(3)")}`, seed_command: append("seed") });
  const prep = await prepareEnvironment({ config: p.cfg, projectRoot: p.root, runDir: p.runDir, mode: "full" });
  assert.equal(prep.ok, false);
  assert.equal(log(p.root), "reset", "the seed never ran");
  assert.deepEqual(prep.steps.map((s) => [s.name, s.ok, s.exit_code]), [["reset", false, 3]]);
});

test("a command that does not finish is stopped, and its output is masked", async () => {
  const p = projectWith({ reset_command: node("console.log('password is hunter22'); setInterval(()=>{},1000)") });
  p.cfg.setup.timeout_s = 1;
  const prep = await prepareEnvironment({ config: p.cfg, projectRoot: p.root, runDir: p.runDir, mode: "full", redact: (t) => t.replaceAll("hunter22", "[REDACTED]") });
  assert.equal(prep.steps[0]?.timed_out, true);
  assert.equal(prep.ok, false);
  assert.match(prep.steps[0]?.tail ?? "", /stopped after 1 seconds/);
  assert.doesNotMatch(prep.steps[0]?.tail ?? "", /hunter22/);
});

test("a seed script that prints the customers it made does not put them in the run folder", async () => {
  const p = projectWith({ seed_command: node("console.log('created maria.garcia@gmail.com, id 35202-1234567-1, test login qa-client@example.com')") });
  const prep = await prepareEnvironment({ config: p.cfg, projectRoot: p.root, runDir: p.runDir, mode: "full" });
  assert.equal(prep.ok, true);
  const tail = prep.steps[0]?.tail ?? "";
  assert.doesNotMatch(tail, /maria\.garcia|35202-1234567-1/);
  assert.match(tail, /qa-client@example\.com/, "a reserved test address stays readable");
  assert.doesNotMatch(fs.readFileSync(prepFile(p.runDir), "utf8"), /maria\.garcia|35202-1234567-1/);
});

test("a command that names a production address is never run", async () => {
  assert.match(commandProblem("curl -X POST https://app.example.com/api/reset", config({ security: { blocked_production_patterns: ["app.example.com"] } })) ?? "", /mentions "app\.example\.com", which is listed as production/);
  assert.match(commandProblem("curl https://www.shop.com/admin/reset", config({ security: { blocked_production_patterns: ["*.shop.com/*"] } })) ?? "", /listed as production/);
  assert.equal(commandProblem("curl http://localhost:4100/api/reset", config()), undefined);
  assert.equal(commandProblem("npm run reset", config()), undefined);
  const p = projectWith({ reset_command: append("reset") + " && echo https://www.prodsite.com" });
  p.cfg.security.blocked_production_patterns = ["www.prodsite.com"];
  const prep = await prepareEnvironment({ config: p.cfg, projectRoot: p.root, runDir: p.runDir, mode: "full" });
  assert.equal(prep.ok, false);
  assert.match(prep.steps[0]?.refused ?? "", /QAMind never runs a setup command against production/);
  assert.equal(log(p.root), "", "nothing ran, not even the harmless first half");
});

test("when nothing is asked for, nothing runs, and that is recorded with the reason", async () => {
  const p = projectWith({ run_before: "never", reset_command: append("reset") });
  const prep = await prepareEnvironment({ config: p.cfg, projectRoot: p.root, runDir: p.runDir, mode: "full" });
  assert.deepEqual([prep.ran, prep.why, prep.steps.length, log(p.root)], [false, "setup.run_before is never", 0, ""]);
});

// ---- the health check

const ok = (status = 200) => ({ status, headers: new Headers() }) as unknown as Response;
function healthArgs(c: QamindConfig, fetchImpl: typeof fetch) {
  return { config: c, policy: policyFromConfig(c), roles: [], fetchImpl, retryDelayMs: 0 };
}

test("a check that fails once and then answers passes, and is marked flaky; one that fails twice is a problem", async () => {
  const c = config();
  let calls = 0;
  const flaky = (async (url: string) => (String(url).startsWith("http://127.0.0.1:4100") && calls++ === 0 ? Promise.reject(new Error("ECONNRESET")) : ok())) as unknown as typeof fetch;
  const h = await runHealthCheck(healthArgs(c, flaky));
  assert.equal(h.environment_ok, true);
  const first = h.checks.find((x) => x.flaky);
  assert.ok(first, "one check is marked flaky");
  assert.match(first.detail, /the first try failed \(no response: ECONNRESET\)/);
  const dead = (async () => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
  const d = await runHealthCheck(healthArgs(c, dead));
  assert.equal(d.environment_ok, false);
  assert.ok(d.checks.some((x) => !x.ok && /\(twice\)$/.test(x.detail)));
  const prod = config({ security: { blocked_production_patterns: ["127.0.0.1:4100"] } });
  let tries = 0;
  const count = (async (url: string) => (String(url).includes("127.0.0.1:4100") && tries++, ok())) as unknown as typeof fetch;
  const blocked = await runHealthCheck(healthArgs(prod, count));
  assert.equal(tries, 0, "the blocked address is never fetched, so never retried");
  assert.equal(blocked.environment_ok, false);
});

test("a slow answer passes but is marked slow", async () => {
  const slow = (async () => {
    await new Promise((r) => setTimeout(r, 30));
    return ok();
  }) as unknown as typeof fetch;
  const h = await runHealthCheck({ ...healthArgs(config(), slow), slowMs: 20 });
  assert.equal(h.environment_ok, true);
  assert.ok(h.checks.filter((c) => c.slow).length >= 1);
});

test("a failed data preparation is the whole health result: environment problem, and nothing else is probed", async () => {
  const p = projectWith({ reset_command: node("process.exit(1)") });
  let probed = 0;
  const { health, prep } = await healthWithPrep({ ...healthArgs(p.cfg, (async () => (probed++, ok())) as unknown as typeof fetch), projectRoot: p.root, runDir: p.runDir, mode: "full" });
  assert.equal(health.environment_ok, false);
  assert.equal(probed, 0);
  assert.equal(health.checks[0]?.name, "Test data preparation (reset)");
  assert.equal(prep.ok, false);
  const good = projectWith({ reset_command: append("reset") });
  const g = await healthWithPrep({ ...healthArgs(good.cfg, (async () => ok()) as unknown as typeof fetch), projectRoot: good.root, runDir: good.runDir, mode: "full" });
  assert.equal(g.health.environment_ok, true);
  assert.deepEqual(g.health.checks[0], { name: "Test data preparation", ok: true, detail: "reset done" });
});

// ---- quirks in memory, and no findings from a broken environment

test("slow and flaky parts of the environment become env-quirk learnings by themselves, merged when seen again", () => {
  const store = tmp("qamind-store-");
  const health = { environment_ok: true, ran_at: "x", checks: [{ name: 'Web UI "Client Portal" loads', ok: true, detail: "HTTP 200", ms: 7200, slow: true }, { name: 'Test account "client-a" can sign in', ok: true, detail: "signed in", flaky: true }, { name: "API base responds", ok: true, detail: "HTTP 200", ms: 40 }] };
  assert.equal(recordEnvQuirks(store, "run-1", health, new Date("2026-11-02T10:00:00Z")), 2);
  const first = loadLearnings(store).active;
  assert.deepEqual(first.map((l) => [l.type, l.area]), [["env-quirk", "Environment"], ["env-quirk", "Environment"]]);
  assert.match(first.map((l) => l.text).join(" "), /Client Portal" loads answered slowly \(7\.2 s\)/);
  assert.match(first.map((l) => l.text).join(" "), /failed on the first try and answered on the second/);
  recordEnvQuirks(store, "run-2", health, new Date("2026-11-03T10:00:00Z"));
  const again = loadLearnings(store).active;
  assert.equal(again.length, 2, "the same quirks are not saved twice");
  assert.ok(again.every((l) => l.confidence > 4), "seeing them again raises their confidence");
});

test("with a failed health check there can be no product findings: lint refuses them, and the run says environment problem by default", () => {
  const fx = makeRunWithData({ findings: [finding({ id: "ISSUE-001", severity: "critical", plain: { title: "t", where: "w", what_happens: "x", who_is_affected: "y", how_to_see_it: [], expected: "z" } })] });
  fs.writeFileSync(path.join(fx.runDir, "data", "health.json"), JSON.stringify({ environment_ok: false, ran_at: "x", checks: [{ name: "API base responds", ok: false, detail: "no response (twice)" }] }));
  const lint = lintRun(fx.runDir, readRunData(fx.runDir));
  assert.match(lint.errors.join("\n"), /The health check failed \(Environment problem\), so there can be no product findings: 1 are listed/);
  assert.match(lint.errors.join("\n"), /stop_reason "environment problem"/);
  fs.writeFileSync(path.join(fx.runDir, "data", "findings.json"), "[]");
  assert.doesNotMatch(lintRun(fx.runDir, readRunData(fx.runDir)).errors.join("\n"), /Environment problem/);
});
