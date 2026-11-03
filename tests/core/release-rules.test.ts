import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkConfigText, DEFAULT_RELEASE_RULES } from "../../core/lib/config.ts";
import type { ReleaseRules } from "../../core/lib/config.ts";
import { evaluateGate } from "../../core/lib/ci/gate.ts";
import { DEFAULT_CI } from "../../core/lib/config.ts";
import { readRunData } from "../../core/lib/report.ts";
import type { Finding, RunData } from "../../core/lib/report.ts";
import { writeReports } from "../../core/lib/reports.ts";
import { computeVerdict } from "../../core/lib/verdict.ts";
import { ALL_FLOWS_TESTED, DEMO_ENV, finding, makeProject, makeRunWithData, withConfigYaml } from "./helpers.ts";

// The release readiness verdict (spec 13.13): the default rules, a project's own rules, and the two things no rule can change.

const cfg = (yaml: string) => checkConfigText(withConfigYaml(yaml), { projectRoot: makeProject({ files: { "openapi.yaml": "x" } }), env: DEMO_ENV });

test("the default rules are the spec's, and a project may write its own; every mistake is named", () => {
  const none = checkConfigText(withConfigYaml(""), { projectRoot: makeProject({ files: { "openapi.yaml": "x" } }), env: DEMO_ENV }).config;
  assert.deepEqual(none?.release.rules, DEFAULT_RELEASE_RULES);
  assert.deepEqual(DEFAULT_RELEASE_RULES, { max_critical: 0, max_important: 2, allow_regressed: false, not_ready_when: ["critical"] });
  const ok = cfg("release:\n  rules:\n    max_critical: 1\n    max_important: 5\n    max_minor: 20\n    allow_regressed: true\n    not_ready_when: [critical, regressed, flows-untested, critical]");
  assert.equal(ok.status, "ok", ok.problems.join("; "));
  assert.deepEqual(ok.config?.release.rules, { max_critical: 1, max_important: 5, max_minor: 20, allow_regressed: true, not_ready_when: ["critical", "regressed", "flows-untested"] });
  const bad = cfg("release:\n  extra: 1\n  rules:\n    max_critical: -1\n    max_important: 2.5\n    max_minor: lots\n    allow_regressed: maybe\n    not_ready_when: [critical, everything]\n    require_flows_tested: false").problems.join("\n");
  for (const re of [/release\.extra is not a setting/, /release\.rules\.max_critical must be a whole number from 0 to 1000/, /release\.rules\.max_important must be a whole number/, /release\.rules\.max_minor must be a whole number/, /release\.rules\.allow_regressed must be true or false/, /not_ready_when: "everything" is not a condition/, /release\.rules\.require_flows_tested is not a rule[\s\S]*can never be "Ready"/]) assert.match(bad, re);
  assert.match(cfg("release: 5").problems.join(), /release must be a mapping/);
  assert.match(cfg("release:\n  rules: [1]").problems.join(), /release\.rules must be a mapping/);
  assert.match(cfg("release:\n  rules:\n    not_ready_when: critical").problems.join(), /must be a list of: critical, important, minor, regressed, flows-untested/);
});

/** A finished-looking run's data with the given findings, every key journey tested, a healthy environment, and the given rules. */
function dataWith(findings: Finding[], rules?: Partial<ReleaseRules>, over: { regressed?: boolean; coverage?: boolean; health?: boolean } = {}): RunData {
  const fx = makeRunWithData({ findings, ...(over.coverage === false ? {} : { coverage: ALL_FLOWS_TESTED }), notTested: [] });
  const d = readRunData(fx.runDir);
  d.meta = { ...(d.meta as NonNullable<RunData["meta"]>), critical_flows: ["a", "b", "c", "d", "e"], ...(rules ? { release_rules: { ...DEFAULT_RELEASE_RULES, ...rules } } : {}) };
  if (over.health === false) d.health = { environment_ok: false, checks: [], ran_at: "" };
  if (over.regressed) d.lifecycle = { findings: [{ issue: findings[0]?.id ?? "ISSUE-001", bug: "BUG-001", status: "regressed", times_seen: 2, first_seen: "2026-10-01" }], fixed: [], accepted_seen: [], not_rechecked: [] } as never;
  return d;
}
const f = (id: string, severity: Finding["severity"]): Finding => finding({ id, severity });
const many = (sev: Finding["severity"], n: number): Finding[] => Array.from({ length: n }, (_, i) => f(`ISSUE-${sev[0]}${i + 1}`, sev));

test("with no rules written the verdict is the default: ready, ready with risks, not ready", () => {
  assert.equal(computeVerdict(dataWith(many("important", 2))).level, "ready");
  assert.match(computeVerdict(dataWith(many("important", 2))).line, /^✅ \*\*Ready to release:\*\* no critical problems, 2 important problems, and every key journey was checked\.$/);
  const risk = computeVerdict(dataWith(many("important", 3)));
  assert.equal(risk.level, "ready-with-risks");
  assert.equal(risk.line, "⚠️ **Ready with risks:** 3 important problems are open.");
  const not = computeVerdict(dataWith([...many("critical", 1), ...many("important", 3)]));
  assert.equal(not.level, "not-ready");
  assert.match(not.line, /^⛔ \*\*Not ready to release:\*\* 1 critical problem found and 3 important problems, for example: /);
  assert.equal(computeVerdict(dataWith(many("important", 1), undefined, { regressed: true })).level, "ready-with-risks");
});

test("a project's rules change the limits and which violations mean Not ready", () => {
  // stricter: one important problem is a risk, and with not_ready_when it is Not ready
  assert.equal(computeVerdict(dataWith(many("important", 1), { max_important: 0 })).line, "⚠️ **Ready with risks:** 1 important problem is open.");
  const strict = computeVerdict(dataWith(many("important", 1), { max_important: 0, not_ready_when: ["important"] }));
  assert.equal(strict.level, "not-ready");
  assert.equal(strict.line, "⛔ **Not ready to release:** 1 important problem is open.");
  // looser: more important problems are allowed
  assert.equal(computeVerdict(dataWith(many("important", 5), { max_important: 5 })).level, "ready");
  // a critical problem the rules allow is still a risk, and says so
  const allowed = computeVerdict(dataWith(many("critical", 1), { max_critical: 1 }));
  assert.equal(allowed.level, "ready-with-risks");
  assert.equal(allowed.line, "⚠️ **Ready with risks:** 1 critical problem is open (your release rules allow 1).");
  assert.equal(computeVerdict(dataWith(many("critical", 2), { max_critical: 1 })).level, "not-ready");
  // a critical problem need not mean Not ready
  const soft = computeVerdict(dataWith(many("critical", 1), { not_ready_when: [] }));
  assert.equal(soft.level, "ready-with-risks");
  assert.equal(soft.line, "⚠️ **Ready with risks:** 1 critical problem found.");
  // minor problems, when the project sets a limit
  assert.equal(computeVerdict(dataWith(many("minor", 30))).level, "ready", "no limit by default");
  assert.equal(computeVerdict(dataWith(many("minor", 4), { max_minor: 3 })).line, "⚠️ **Ready with risks:** 4 minor problems are open (your release rules allow 3).");
  // a problem that came back
  assert.equal(computeVerdict(dataWith(many("important", 1), { allow_regressed: true }, { regressed: true })).level, "ready");
  const back = computeVerdict(dataWith(many("important", 1), { not_ready_when: ["regressed"] }, { regressed: true }));
  assert.equal(back.level, "not-ready");
  assert.match(back.line, /1 problem came back after being fixed/);
});

test("no rule makes a run Ready when a key journey was not tested, and a broken environment is always Not ready", () => {
  const loose = { max_critical: 1000, max_important: 1000, max_minor: 1000, allow_regressed: true, not_ready_when: [] as ReleaseRules["not_ready_when"] };
  const untested = computeVerdict(dataWith([], loose, { coverage: false }));
  assert.equal(untested.level, "ready-with-risks", "even the loosest rules cannot make it Ready");
  assert.match(untested.line, /key journeys? (was|were) not fully checked/);
  const hard = computeVerdict(dataWith([], { not_ready_when: ["flows-untested"] }, { coverage: false }));
  assert.equal(hard.level, "not-ready");
  assert.match(hard.line, /^⛔ \*\*Not ready to release:\*\* 1 key journey was not fully checked\.$/);
  const broken = computeVerdict(dataWith([], loose, { health: false }));
  assert.equal(broken.level, "not-ready");
  assert.equal(broken.environment_problem, true);
});

test("the rules are frozen when the run starts: changing the config later does not change what a report says about that run", () => {
  const fx = makeRunWithData({ findings: many("important", 1), coverage: ALL_FLOWS_TESTED, notTested: [], configYaml: "release:\n  rules:\n    max_important: 0\n    not_ready_when: [important]" });
  const meta = JSON.parse(fs.readFileSync(path.join(fx.runDir, "data", "meta.json"), "utf8")) as { release_rules: ReleaseRules };
  assert.deepEqual(meta.release_rules, { max_critical: 0, max_important: 0, allow_regressed: false, not_ready_when: ["important"] });
  const first = writeReports(fx.runDir, fx.store);
  assert.match(first.admin.split("\n")[0] as string, /^⛔ \*\*Not ready to release:\*\* 1 important problem is open\.$/);
  fs.writeFileSync(path.join(fx.proj, ".qa", "config.md"), withConfigYaml("release:\n  rules:\n    max_important: 10"));
  const again = writeReports(fx.runDir, fx.store);
  assert.equal(again.admin.split("\n")[0], first.admin.split("\n")[0], "the run keeps the rules it started with");
  assert.equal(again.model.verdict.level, "not-ready");
});

test("the CI gate's not-ready condition follows the same rules", () => {
  const strict = dataWith(many("important", 1), { max_important: 0, not_ready_when: ["important"] });
  assert.equal(evaluateGate(strict, { fail_on: ["not-ready"], warn_on: [] }).outcome, "fail");
  assert.equal(evaluateGate(dataWith(many("important", 1)), { fail_on: ["not-ready"], warn_on: [] }).outcome, "pass");
  void DEFAULT_CI;
});
