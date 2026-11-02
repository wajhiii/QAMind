import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { loadFixLog } from "../../core/lib/memory/fixlog.ts";
import { runScope } from "../../core/lib/memory/service.ts";
import type { RunScope } from "../../core/lib/memory/service.ts";
import { readRunData } from "../../core/lib/report.ts";
import { lintReports, writeReports } from "../../core/lib/reports.ts";
import { getContext, finishRunTracked, runHistory } from "../../core/lib/memory/service.ts";
import { checkConsistency } from "../../core/scripts/consistency-check.ts";
import { exportAdminHtml } from "../../core/scripts/export-html.ts";
import { startRun } from "../../core/lib/run.ts";
import { begin, commit, compareSuites, continueAfterStop, createFixBranch, defer, preflight, revert, runSuite, runTests, statusOf } from "../../core/lib/fix/loop.ts";
import { PAUSE_EVERY, loadFixState, pendingStop, saveFixState } from "../../core/lib/fix/state.ts";
import type { FixState, SuiteRecord } from "../../core/lib/fix/state.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { ALL_FLOWS_TESTED, DEMO_CONFIG, DEMO_ENV, finding, tmp, writeFixtureData } from "./helpers.ts";

// A small project with genuine bugs, in a real git repository, and a fix run started on it. Everything the fix tools do is checked against git itself.

const BUGGY_PRICE = "export function discount(total) {\n  return total > 1000 ? total * 0.95 : total;\n}\n";
const FIXED_PRICE = "export function discount(total) {\n  return total >= 1000 ? total * 0.95 : total;\n}\n";
const BUGGY_ORDERS = "export function validQuantity(q) {\n  return typeof q === \"number\";\n}\n";
const FIXED_ORDERS = "export function validQuantity(q) {\n  return Number.isInteger(q) && q >= 1 && q <= 1000;\n}\n";
const IMPORTS = 'import test from "node:test";\nimport assert from "node:assert/strict";\n';
const REGRESSION_PRICE = `${IMPORTS}import { discount } from "../src/price.mjs";\ntest("an order of exactly 1000.00 gets the 5% discount", () => {\n  assert.equal(discount(1000), 950);\n});\n`;
const REGRESSION_ORDERS = `${IMPORTS}import { validQuantity } from "../src/orders.mjs";\ntest("a negative or fractional quantity is refused", () => {\n  assert.equal(validQuantity(-5), false);\n  assert.equal(validQuantity(1.5), false);\n  assert.equal(validQuantity(2), true);\n});\n`;
const T1 = "test/qa-regression-issue-001.test.mjs";
const T2 = "test/qa-regression-issue-002.test.mjs";
const NOW = new Date("2026-11-03T09:00:00Z");

const plain = (title: string) => ({ title, where: "Client Portal → New order", what_happens: "The order total or the accepted quantity is wrong.", who_is_affected: "Customers placing orders.", how_to_see_it: ["Open New order.", "Enter the values from the finding.", "Place the order."], expected: "The rule is applied as written." });

interface Fx {
  home: string;
  repo: string;
  proj: string;
  runId: string;
  runDir: string;
  store: string;
  scope: () => RunScope;
  write: (rel: string, content: string) => void;
  read: (rel: string) => string;
  g: (...args: string[]) => string;
}

function makeFixture(opts: { subdir?: boolean; branch?: "feature" | "main" | "detached"; doNotTouch?: string[]; noTestScript?: boolean; existingTestEncodesBug?: boolean; kind?: "qa" | "qa-only"; skipReport?: boolean; allJourneys?: boolean; coverage?: Array<Record<string, unknown>>; mode?: "full" | "quick" | "diff" } = {}): Fx {
  const repo = tmp("qamind-fixrepo-");
  const proj = opts.subdir ? path.join(repo, "app") : repo;
  fs.mkdirSync(proj, { recursive: true });
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
    fs.writeFileSync(path.join(proj, rel), content);
  };
  const g = (...args: string[]) => execFileSync("git", ["-C", proj, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  write("package.json", JSON.stringify({ name: "shop", type: "module", ...(opts.noTestScript ? {} : { scripts: { test: "node --test" } }) }));
  write("src/price.mjs", BUGGY_PRICE);
  write("src/orders.mjs", BUGGY_ORDERS);
  write("test/price.test.mjs", `${IMPORTS}import { discount } from "../src/price.mjs";\ntest("no discount below 1000", () => {\n  assert.equal(discount(500), 500);\n});\ntest("discount above 1000", () => {\n  assert.equal(discount(2000), 1900);\n});\n${opts.existingTestEncodesBug ? 'test("the boundary stays as it is", () => {\n  assert.equal(discount(1000), 1000);\n});\n' : ""}`);
  write("src/legacy/old.mjs", "export const old = 1;\n");
  write(".gitignore", "node_modules\n");
  write(".qa/config.md", opts.doNotTouch ? DEMO_CONFIG.replace(/fix_policy:\n(\s+)fix_severities:[^\n]*/, (m, ind: string) => `${m}\n${ind}do_not_touch: [${opts.doNotTouch!.map((x) => JSON.stringify(x)).join(", ")}]`) : DEMO_CONFIG);
  write(".env.qa", Object.entries(DEMO_ENV).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  fs.copyFileSync(path.join(path.resolve(import.meta.dirname, "..", ".."), "demo-app", "openapi.yaml"), path.join(proj, "openapi.yaml"));
  for (const c of [["init", "-q", "-b", "main"], ["config", "user.name", "Dev"], ["config", "user.email", "dev@example.test"], ["remote", "add", "origin", "https://github.com/acme/shop.git"]]) execFileSync("git", ["-C", repo, ...c], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "add", "--", ...[".gitignore", "package.json", "src", "test", "openapi.yaml"].map((p) => (opts.subdir ? `app/${p}` : p))], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "commit", "-qm", "initial"], { stdio: "ignore" });
  if (opts.branch === "detached") execFileSync("git", ["-C", repo, "checkout", "-q", "--detach"], { stdio: "ignore" });
  else if (opts.branch !== "main") execFileSync("git", ["-C", repo, "switch", "-q", "-c", "feature/qa-fixture"], { stdio: "ignore" });

  const home = tmp("qamind-home-");
  const r = startRun({ cwd: proj, mode: opts.mode ?? "quick", kind: opts.kind ?? "qa", host: "test", home, env: {}, sessionId: "s-fix", now: NOW });
  assert.equal(r.status, "ready", r.message);
  const runDir = r.run!.dir;
  writeFixtureData(runDir, {
    ...(opts.coverage ? { coverage: opts.coverage as never } : opts.allJourneys ? { coverage: [...ALL_FLOWS_TESTED, { surface: "ui", ui: "Admin Portal", area: "Orders", status: "tested" as const }] } : {}),
    findings: [
      finding({ id: "ISSUE-001", severity: "critical", surface: "api", area: "Orders / totals", title: "No discount at exactly 1,000.00", plain: plain("An order of exactly 1,000.00 gets no discount"), expected: "Total is 950.00", actual: "Total is 1000.00" }),
      finding({ id: "ISSUE-002", severity: "important", surface: "api", area: "Orders / validation", title: "Negative or fractional quantities are accepted", plain: plain("An order can be placed with a negative quantity") }),
      finding({ id: "ISSUE-003", severity: "minor", surface: "ui", area: "Orders / display", title: "Zero discount shown as -$0.00", plain: plain("A discount of nothing shows as a negative amount") }),
    ],
  });
  if (!opts.skipReport) writeReports(runDir, r.project!.store);
  const fx: Fx = { home, repo, proj, runId: r.run!.id, runDir, store: r.project!.store, scope: () => runScope(home, r.run!.id, {}), write, read: (rel) => fs.readFileSync(path.join(proj, rel), "utf8"), g };
  return fx;
}

const fixInput = (issue: string, over: Record<string, unknown> = {}) => ({
  issue,
  summary: issue === "ISSUE-001" ? "apply the discount at exactly 1,000.00" : "refuse negative and fractional quantities",
  root_cause: issue === "ISSUE-001" ? "discount() compared with > where the rule says 1,000.00 or more" : "validQuantity() only checked the type",
  recheck: "Repeated the finding's steps: the total for 1000.00 is now 950.00.",
  adjacent: "An order of 999.99 still has no discount.",
  classification: "verified" as const,
  ...over,
});

async function readyFor001(fx: Fx) {
  const pf = await preflight(fx.scope(), NOW);
  assert.equal(pf.ok, true, JSON.stringify(pf));
  const b = begin(fx.scope(), { issue: "ISSUE-001", files: ["src/price.mjs"], test_files: [T1], plan: "discount() compares with > instead of >= in src/price.mjs." }, NOW);
  assert.equal(b.ok, true, JSON.stringify(b));
  return { pf, b };
}

// ------------------------------------------------------------------------------------------------ the happy path

test("a fix goes red, green, commit: proof by removing the fix, a commit with the test, the finding and the log updated, nothing pushed", async () => {
  const fx = makeFixture();
  const { pf } = await readyFor001(fx);
  assert.deepEqual((pf as any).queue.map((q: any) => q.id), ["ISSUE-001", "ISSUE-002"], "critical first, then important; the minor one is not fixable by policy");
  assert.equal((pf as any).baseline.passed, true);
  assert.equal(pf.ok && (pf as any).branch, "feature/qa-fixture");
  assert.ok(fs.existsSync(path.join(fx.runDir, "BASELINE-TECHNICAL-REPORT.md")), "the baseline report is kept before any fix");

  fx.write(T1, REGRESSION_PRICE);
  const red = await runTests(fx.scope(), {}, NOW);
  assert.equal((red as any).passed, false, "the regression test fails before the fix");
  assert.match((red as any).tail, /1000|950/, "and shows the wrong value");
  fx.write("src/price.mjs", FIXED_PRICE);
  assert.equal(((await runTests(fx.scope(), {}, NOW)) as any).passed, true, "and passes after it");

  const before = fx.g("rev-parse", "main");
  const c = await commit(fx.scope(), fixInput("ISSUE-001"), NOW);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal((c as any).proof.without_fix.exit_code === 0, false, "the proof ran the test with the fix taken out, and it failed");
  assert.match(fx.g("log", "-1", "--format=%s"), /^fix\(qa\): ISSUE-001 apply the discount at exactly 1,000\.00$/);
  assert.deepEqual(fx.g("show", "--name-only", "--format=", "HEAD").split("\n").sort(), ["src/price.mjs", T1].sort());
  assert.match(fx.g("log", "-1", "--format=%b"), /Root cause: discount\(\) compared with >.*\nRegression test: test\/qa-regression-issue-001\.test\.mjs.*\nVerification:.*\nAdjacent check:.*\n\nQAMind-Run: run-.*\nQAMind-Issue: ISSUE-001\nQAMind-Classification: verified/s);
  assert.equal(fx.g("rev-parse", "main"), before, "the default branch did not move");
  assert.equal(fx.g("branch", "--show-current"), "feature/qa-fixture");
  assert.equal(fx.g("status", "--porcelain").split("\n").filter((l) => l && !/\.gitignore/.test(l)).length, 0, "the tree is clean after the commit");
  assert.equal(fx.g("remote", "get-url", "origin"), "https://github.com/acme/shop.git");
  assert.equal(fx.read("src/price.mjs"), FIXED_PRICE, "the fix is in place after the proof put it back");

  const f = readRunData(fx.runDir).findings.find((x) => x.id === "ISSUE-001")!;
  assert.equal(f.fix_status, "fixed-verified");
  assert.equal(f.fix?.outcome, "verified");
  assert.deepEqual(f.fix?.files, ["src/price.mjs"]);
  const st = loadFixState(fx.runDir)!;
  assert.equal(st.attempts[0]?.status, "verified");
  assert.equal(st.attempts[0]?.without_fix?.passed, false);
  assert.equal(st.attempts[0]?.with_fix?.passed, true);
  const log = loadFixLog(fx.store).entries;
  assert.deepEqual([log[0]?.id, log[0]?.issue, log[0]?.outcome, log[0]?.files], ["F-001", "ISSUE-001", "verified", ["src/price.mjs"]]);
  assert.ok(fs.existsSync(path.join(fx.runDir, "evidence", "fix", "ISSUE-001", "fixed", "src", "price.mjs")), "the fixed file is kept as evidence");

  const suite = await runSuite(fx.scope(), NOW);
  assert.deepEqual([suite.ok, (suite as any).passed, (suite as any).verdict], [true, true, "no-regression"]);
  assert.equal((statusOf(fx.scope()) as any).committed, 1);
  assert.deepEqual((statusOf(fx.scope()) as any).queue.map((q: any) => q.id), ["ISSUE-002"]);
});

test("QAMind's own .gitignore entries do not make the tree look dirty, but the user's own edit to it does", async () => {
  const fx = makeFixture();
  assert.match(fx.read(".gitignore"), /# QAMind \(private test credentials and reports\)\n\.env\.qa\n\.qa\//, "the first run added its entries");
  assert.match(fx.g("status", "--porcelain"), /\.gitignore/, "git sees the change");
  assert.equal((await preflight(fx.scope(), NOW)).ok, true, "but a fix run does not");
  const fx2 = makeFixture();
  fx2.write(".gitignore", `${fx2.read(".gitignore")}*.log\n`);
  const pf = await preflight(fx2.scope(), NOW);
  assert.equal((pf as any).problem, "dirty-tree");
  assert.deepEqual((pf as any).files, [".gitignore"]);
});

// ------------------------------------------------------------------------------------------------ the proof refuses bad tests and bad fixes

test("a regression test that passes without the fix is refused, the fix stays in place, and nothing is committed", async () => {
  const fx = makeFixture();
  await readyFor001(fx);
  fx.write(T1, `${IMPORTS}import { discount } from "../src/price.mjs";\ntest("a discounted order is cheaper", () => {\n  assert.equal(discount(2000), 1900);\n});\n`);
  fx.write("src/price.mjs", FIXED_PRICE);
  const head = fx.g("rev-parse", "HEAD");
  const c = await commit(fx.scope(), fixInput("ISSUE-001"), NOW);
  assert.deepEqual([c.ok, (c as any).problem], [false, "test-passes-without-fix"]);
  assert.match((c as any).message, /PASSES with the fix taken out/);
  assert.equal(fx.g("rev-parse", "HEAD"), head, "no commit");
  assert.equal(fx.read("src/price.mjs"), FIXED_PRICE, "the fix is back in place");
  assert.equal(loadFixState(fx.runDir)!.attempts[0]?.status, "in-progress");
});

test("a broken test (it fails with the fix too) is refused: it proves nothing", async () => {
  const fx = makeFixture();
  await readyFor001(fx);
  fx.write(T1, `${IMPORTS}import { discount } from "../src/price.mjs";\ntest("typo", () => {\n  assert.equal(discount(1000), 950);\n  not_defined_anywhere();\n});\n`);
  fx.write("src/price.mjs", FIXED_PRICE);
  const c = await commit(fx.scope(), fixInput("ISSUE-001"), NOW);
  assert.deepEqual([c.ok, (c as any).problem], [false, "test-fails-with-fix"]);
  assert.equal(fx.g("log", "--oneline").split("\n").length, 1, "still only the initial commit");
});

test("no test file, no fix, an unchanged tree, and changes to existing test assertions are each refused", async () => {
  const fx = makeFixture();
  await readyFor001(fx);
  fx.write("src/price.mjs", FIXED_PRICE);
  assert.equal(((await commit(fx.scope(), fixInput("ISSUE-001"), NOW)) as any).problem, "no-regression-test");
  fs.writeFileSync(path.join(fx.proj, "src/price.mjs"), BUGGY_PRICE);
  fx.write(T1, REGRESSION_PRICE);
  assert.equal(((await commit(fx.scope(), fixInput("ISSUE-001"), NOW)) as any).problem, "no-fix");

  const fx2 = makeFixture();
  await preflight(fx2.scope(), NOW);
  begin(fx2.scope(), { issue: "ISSUE-001", files: ["src/price.mjs"], test_files: ["test/price.test.mjs"], plan: "discount() uses > where >= is meant." }, NOW);
  fx2.write("src/price.mjs", FIXED_PRICE);
  fx2.write("test/price.test.mjs", fx2.read("test/price.test.mjs").replace("assert.equal(discount(500), 500);", "assert.equal(discount(500), 500); assert.equal(discount(1000), 950);"));
  const c = await commit(fx2.scope(), fixInput("ISSUE-001"), NOW);
  assert.equal((c as any).problem, "existing-test-changed", "an existing line was changed: add a new test instead");
});

test("adding a test to an existing test file is fine as long as no existing line changes", async () => {
  const fx = makeFixture();
  await preflight(fx.scope(), NOW);
  begin(fx.scope(), { issue: "ISSUE-001", files: ["src/price.mjs"], test_files: ["test/price.test.mjs"], plan: "discount() uses > where >= is meant." }, NOW);
  fx.write("src/price.mjs", FIXED_PRICE);
  fx.write("test/price.test.mjs", `${fx.read("test/price.test.mjs")}test("exactly 1000 is discounted", () => {\n  assert.equal(discount(1000), 950);\n});\n`);
  const c = await commit(fx.scope(), fixInput("ISSUE-001"), NOW);
  assert.equal(c.ok, true, JSON.stringify(c));
});

// ------------------------------------------------------------------------------------------------ stop rules

test("an edit to a file the fix did not declare stops the run until the user says to continue", async () => {
  const fx = makeFixture();
  await readyFor001(fx);
  fx.write(T1, REGRESSION_PRICE);
  fx.write("src/price.mjs", FIXED_PRICE);
  fx.write("src/orders.mjs", FIXED_ORDERS);
  const c = await commit(fx.scope(), fixInput("ISSUE-001"), NOW);
  assert.deepEqual([c.ok, (c as any).problem], [false, "unrelated-files"]);
  assert.deepEqual((c as any).files, ["src/orders.mjs"]);
  assert.equal((c as any).stop.kind, "unrelated-files");
  // while the stop is in force nothing new starts
  const again = begin(fx.scope(), { issue: "ISSUE-002", files: ["src/orders.mjs"], test_files: [T2], plan: "validQuantity() only checks the type." }, NOW);
  assert.equal((again as any).problem, "stopped");
  // the user has been asked; the stray edit is undone; they say go on
  fs.writeFileSync(path.join(fx.proj, "src/orders.mjs"), BUGGY_ORDERS);
  assert.equal((continueAfterStop(fx.scope(), "The user said the extra edit was a mistake; carry on with ISSUE-001.", NOW) as any).ok, true);
  assert.equal(((await commit(fx.scope(), fixInput("ISSUE-001"), NOW)) as any).ok, true);
});

test("two reverts stop the run; continuing needs a reason and then two more reverts are needed to stop again", async () => {
  const fx = makeFixture();
  await preflight(fx.scope(), NOW);
  const attempt = async (issue: string, file: string, testFile: string) => {
    assert.equal((begin(fx.scope(), { issue, files: [file], test_files: [testFile], plan: "Looking at it." }, NOW) as any).ok, true);
    fx.write(testFile, REGRESSION_PRICE);
    fx.write(file, file.endsWith("price.mjs") ? FIXED_PRICE : FIXED_ORDERS);
    return revert(fx.scope(), { issue, reason: "The recheck still failed after one revised fix." }, NOW) as any;
  };
  const r1 = await attempt("ISSUE-001", "src/price.mjs", T1);
  assert.deepEqual([r1.ok, r1.reverts, r1.stop], [true, 1, undefined]);
  assert.equal(fx.read("src/price.mjs"), BUGGY_PRICE, "the tree is put back exactly");
  assert.ok(!fs.existsSync(path.join(fx.proj, T1)), "and the test file is gone from the tree");
  assert.ok(fs.existsSync(path.join(fx.runDir, "evidence", "fix", "ISSUE-001", "reverted-attempt", T1)), "but kept as evidence");
  assert.match(fs.readFileSync(path.join(fx.runDir, "evidence", "fix", "ISSUE-001", "reverted-attempt", "attempt.patch"), "utf8"), />= 1000/);
  const r2 = await attempt("ISSUE-002", "src/orders.mjs", T2);
  assert.equal(r2.stop.kind, "reverts");
  assert.equal(statusOf(fx.scope()).stop?.kind, "reverts");
  assert.equal((begin(fx.scope(), { issue: "ISSUE-001", files: ["src/price.mjs"], test_files: ["test/qa-x.test.mjs"], plan: "x" }, NOW) as any).problem, "stopped", "while a stop is in force nothing new starts");
  assert.equal((continueAfterStop(fx.scope(), "The user read the summary and said to go on.", NOW) as any).ok, true);
  assert.equal(statusOf(fx.scope()).reverts_since_last_continue, 0);
  assert.equal(readRunData(fx.runDir).findings.find((f) => f.id === "ISSUE-001")?.fix?.outcome, "reverted");
  assert.equal(readRunData(fx.runDir).findings.find((f) => f.id === "ISSUE-001")?.fix_status, undefined, "a reverted finding is simply not fixed");
});

test("the stop rules as pure logic: every 5 fixes pause, 2 reverts, the hard cap that cannot be continued", () => {
  const base = (over: Partial<FixState> = {}): FixState => ({ schema_version: 1, run: "r", branch: "b", base_commit: "abc", started: "x", max_fixes: 8, severities: ["critical"], commands: {}, attempts: [], reverts: 0, reverts_at_last_continue: 0, paused_at: 0, continues: [], ...over });
  const fixed = (n: number) => Array.from({ length: n }, (_, i) => ({ issue: `ISSUE-${i + 1}`, severity: "critical" as const, title: "t", status: "verified" as const, plan: "", files: [], test_files: [], started_at: "x" }));
  assert.equal(pendingStop(base({ attempts: fixed(PAUSE_EVERY - 1) })), undefined);
  assert.equal(pendingStop(base({ attempts: fixed(PAUSE_EVERY) }))?.kind, "pause");
  assert.equal(pendingStop(base({ attempts: fixed(PAUSE_EVERY), paused_at: PAUSE_EVERY }))?.kind, undefined, "after the user continued, the same five do not stop again");
  assert.equal(pendingStop(base({ attempts: fixed(PAUSE_EVERY + 1), paused_at: PAUSE_EVERY }))?.kind, undefined);
  assert.equal(pendingStop(base({ attempts: fixed(2 * PAUSE_EVERY), max_fixes: 99, paused_at: PAUSE_EVERY }))?.kind, "pause", "and again after the next five");
  assert.equal(pendingStop(base({ reverts: 2 }))?.kind, "reverts");
  assert.equal(pendingStop(base({ reverts: 3, reverts_at_last_continue: 1 }))?.kind, "reverts");
  assert.equal(pendingStop(base({ reverts: 2, reverts_at_last_continue: 1 })), undefined);
  assert.equal(pendingStop(base({ attempts: fixed(8), paused_at: 5 }))?.kind, "cap");
});

test("the hard cap cannot be continued past, and a fix that touches more than five files is a stop, not an attempt", async () => {
  const fx = makeFixture();
  await preflight(fx.scope(), NOW);
  const wide = begin(fx.scope(), { issue: "ISSUE-001", files: ["src/a.mjs", "src/b.mjs", "src/c.mjs", "src/d.mjs", "src/e.mjs", "src/f.mjs"], test_files: [T1], plan: "Everything is wrong." }, NOW);
  assert.deepEqual([(wide as any).problem, (wide as any).stop.kind], ["stopped", "wide-change"]);
  assert.equal(loadFixState(fx.runDir)!.attempts.length, 0, "no attempt was recorded");
  assert.equal((continueAfterStop(fx.scope(), "The user agreed to a wide change.", NOW) as any).ok, true);

  const st = loadFixState(fx.runDir)!;
  st.max_fixes = 1;
  st.attempts.push({ issue: "ISSUE-002", severity: "important", title: "t", status: "verified", plan: "", files: [], test_files: [], started_at: "x" });
  saveFixState(fx.runDir, st);
  const capped = begin(fx.scope(), { issue: "ISSUE-001", files: ["src/price.mjs"], test_files: [T1], plan: "x" }, NOW);
  assert.equal((capped as any).stop.kind, "cap");
  assert.equal((continueAfterStop(fx.scope(), "Please go on anyway.", NOW) as any).problem, "cap", "the cap is final for the run");
});

// ------------------------------------------------------------------------------------------------ what may be touched

test("protected files and the do-not-touch list cannot even be declared; tests must look like tests; production files must not", async () => {
  const fx = makeFixture({ doNotTouch: ["src/legacy/**"] });
  await preflight(fx.scope(), NOW);
  const tryBegin = (files: string[], test_files: string[]) => begin(fx.scope(), { issue: "ISSUE-001", files, test_files, plan: "x" }, NOW) as any;
  assert.match(tryBegin(["package.json"], [T1]).message, /dependency manifest/);
  assert.match(tryBegin([".env.qa"], [T1]).message, /protected/);
  assert.match(tryBegin(["src/legacy/old.mjs"], [T1]).message, /do-not-touch list \(src\/legacy\/\*\*\)/);
  assert.match(tryBegin(["../outside.js"], [T1]).message, /outside the project/);
  assert.equal(tryBegin(["src/price.mjs"], ["src/orders.mjs"]).problem, "not-a-test-file");
  assert.equal(tryBegin(["test/price.test.mjs"], [T1]).problem, "test-listed-as-production");
  assert.equal(tryBegin(["src/price.mjs"], ["test/has space.test.mjs"]).problem, "unsafe-test-path");
  assert.equal(tryBegin(["src/nothing.mjs"], []).problem, "incomplete");
  assert.equal(tryBegin(["src/price.mjs"], [T1]).ok, true, "and a proper declaration is accepted");
  assert.equal(tryBegin(["src/price.mjs"], [T1]).problem, "attempt-open", "one fix at a time");
});

test("only findings the policy allows, that exist, and that were not tried, can be started", async () => {
  const fx = makeFixture();
  await preflight(fx.scope(), NOW);
  const tryBegin = (issue: string) => begin(fx.scope(), { issue, files: ["src/price.mjs"], test_files: [T1], plan: "x" }, NOW) as any;
  assert.equal(tryBegin("ISSUE-003").problem, "below-severity");
  assert.equal(tryBegin("ISSUE-099").problem, "unknown-issue");
  assert.equal(tryBegin("ISSUE-001").ok, true);
  assert.equal((defer(fx.scope(), { issue: "ISSUE-001", reason: "x", kind: "other" }, NOW) as any).problem, "attempt-open");
  assert.equal(((revert(fx.scope(), { issue: "ISSUE-001", reason: "Gave up: nothing changed yet." }, NOW)) as any).ok, true);
  assert.equal(tryBegin("ISSUE-001").problem, "already-attempted", "a reverted finding is left for a person");
});

test("a finding can be deferred with a reason, which is recorded on the finding and in the fix log", async () => {
  const fx = makeFixture();
  await preflight(fx.scope(), NOW);
  const d = defer(fx.scope(), { issue: "ISSUE-002", reason: "The rule is ambiguous in the spec; a person has to decide the limit.", kind: "needs-decision" }, NOW);
  assert.equal((d as any).ok, true);
  assert.equal(readRunData(fx.runDir).findings.find((f) => f.id === "ISSUE-002")?.fix?.outcome, "deferred");
  assert.match(readRunData(fx.runDir).findings.find((f) => f.id === "ISSUE-002")?.fix?.reason ?? "", /^needs-decision: The rule is ambiguous/);
  assert.equal(loadFixLog(fx.store).entries[0]?.outcome, "deferred");
  assert.deepEqual((statusOf(fx.scope()) as any).queue.map((q: any) => q.id), ["ISSUE-001"]);
});

// ------------------------------------------------------------------------------------------------ preflight refusals and branches

test("preflight refuses when the tree is dirty, naming the files and telling the agent to ask, never to decide", async () => {
  const fx = makeFixture();
  fx.write("src/price.mjs", `${BUGGY_PRICE}// my work in progress\n`);
  fx.write("notes.txt", "untracked");
  const pf = (await preflight(fx.scope(), NOW)) as any;
  assert.equal(pf.problem, "dirty-tree");
  assert.deepEqual(pf.files.sort(), ["notes.txt", "src/price.mjs"]);
  assert.match(pf.message, /commit them, stash them, or abort.*Never decide that for them/s);
  assert.equal(loadFixState(fx.runDir), undefined, "nothing started");
  assert.match(fx.read("src/price.mjs"), /my work in progress/, "and nothing was touched");
});

test("on the default branch no fix starts; creating a branch is a separate step, and then the run proceeds", async () => {
  const fx = makeFixture({ branch: "main" });
  const pf = (await preflight(fx.scope(), NOW)) as any;
  assert.equal(pf.problem, "on-default-branch");
  assert.equal(pf.suggested_branch, "qa/fix-20261103-0900");
  assert.match(pf.message, /fix_create_branch/);
  const made = createFixBranch(fx.scope(), undefined, NOW) as any;
  assert.deepEqual([made.ok, made.branch], [true, "qa/fix-20261103-0900"]);
  assert.equal(fx.g("branch", "--show-current"), "qa/fix-20261103-0900");
  assert.equal(((await preflight(fx.scope(), NOW)) as any).ok, true);
  assert.equal((createFixBranch(fx.scope(), undefined, NOW) as any).problem, "already-on-a-branch");
  assert.equal(fx.g("rev-parse", "main"), fx.g("rev-parse", "HEAD"), "the new branch starts where main is");
});

test("branch creation refuses odd names, an existing name, a dirty tree and a detached head is treated as the default", async () => {
  const fx = makeFixture({ branch: "main" });
  assert.equal((createFixBranch(fx.scope(), "feature/x", NOW) as any).problem, "bad-name");
  assert.equal((createFixBranch(fx.scope(), "qa/$(rm -rf)", NOW) as any).problem, "bad-name");
  fx.g("branch", "qa/taken");
  assert.equal((createFixBranch(fx.scope(), "qa/taken", NOW) as any).problem, "exists");
  fx.write("src/price.mjs", `${BUGGY_PRICE}// wip\n`);
  assert.equal((createFixBranch(fx.scope(), undefined, NOW) as any).problem, "dirty-tree");
  const detached = makeFixture({ branch: "detached" });
  assert.equal(((await preflight(detached.scope(), NOW)) as any).problem, "on-default-branch");
});

test("without a way to run tests no fix is possible: the agent is told to propose a framework and ask", async () => {
  const fx = makeFixture({ noTestScript: true });
  const pf = (await preflight(fx.scope(), NOW)) as any;
  assert.equal(pf.problem, "no-test-framework");
  assert.match(pf.message, /Propose a test framework in the report and ask the user before adding one/);
});

test("the baseline report must exist and lint clean before any fix, and a report-only run cannot use the fix tools at all", async () => {
  const fx = makeFixture({ skipReport: true });
  assert.equal(((await preflight(fx.scope(), NOW)) as any).problem, "no-baseline-report");
  const noPlain = makeFixture();
  const file = path.join(noPlain.runDir, "data", "findings.json");
  const list = JSON.parse(fs.readFileSync(file, "utf8"));
  delete list[0].plain;
  fs.writeFileSync(file, JSON.stringify(list));
  writeReports(noPlain.runDir, noPlain.store);
  assert.equal(((await preflight(noPlain.scope(), NOW)) as any).problem, "baseline-report-not-clean");

  const only = makeFixture({ kind: "qa-only" });
  await assert.rejects(preflight(only.scope(), NOW), /is report-only .*cannot fix anything/);
  assert.throws(() => begin(only.scope(), { issue: "ISSUE-001", files: ["src/price.mjs"], test_files: [T1], plan: "x" }), /report-only/);
});

test("preflight is idempotent: asking again later reports where the loop stands without re-running the baseline", async () => {
  const fx = makeFixture();
  await readyFor001(fx);
  const again = (await preflight(fx.scope(), NOW)) as any;
  assert.equal(again.resumed, true);
  assert.equal(again.in_progress.issue, "ISSUE-001");
});

// ------------------------------------------------------------------------------------------------ reverting a committed fix, the final suite, monorepos

test("a committed fix can be undone with a normal revert commit, and the finding goes back to not fixed", async () => {
  const fx = makeFixture();
  await readyFor001(fx);
  fx.write(T1, REGRESSION_PRICE);
  fx.write("src/price.mjs", FIXED_PRICE);
  assert.equal(((await commit(fx.scope(), fixInput("ISSUE-001"), NOW)) as any).ok, true);
  const r = revert(fx.scope(), { issue: "ISSUE-001", reason: "The full suite showed it breaks another feature." }, NOW) as any;
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(fx.g("log", "-1", "--format=%s"), /^Revert "fix\(qa\): ISSUE-001/);
  assert.equal(fx.read("src/price.mjs"), BUGGY_PRICE);
  assert.equal(fx.g("log", "--oneline").split("\n").length, 3, "history is kept: initial, fix, revert");
  const f = readRunData(fx.runDir).findings.find((x) => x.id === "ISSUE-001")!;
  assert.deepEqual([f.fix?.outcome, f.fix_status], ["reverted", undefined]);
  assert.ok(f.fix?.reverted_by);
});

test("the final suite run flags a regression loudly: here an existing test had encoded the bug", async () => {
  const fx = makeFixture({ existingTestEncodesBug: true });
  await readyFor001(fx);
  fx.write(T1, REGRESSION_PRICE);
  fx.write("src/price.mjs", FIXED_PRICE);
  assert.equal(((await commit(fx.scope(), fixInput("ISSUE-001"), NOW)) as any).ok, true);
  const s = (await runSuite(fx.scope(), NOW)) as any;
  assert.equal(s.passed, false);
  assert.equal(s.verdict, "regression");
  assert.match(s.warning, /REGRESSION/);
  assert.ok(s.regressions.some((n: string) => /boundary stays as it is/.test(n)), `the failing test is named: ${JSON.stringify(s.regressions)}`);
});

test("suite comparison: pass, new failure, only old failures, and output that cannot be read", () => {
  const rec = (passed: boolean, failed: string[], over: Partial<SuiteRecord> = {}): SuiteRecord => ({ command: "npm test", exit_code: passed ? 0 : 1, passed, timed_out: false, duration_s: 1, at: "x", tail: "", failed_tests: failed, ...over });
  assert.equal(compareSuites(rec(true, []), rec(true, [])).verdict, "no-regression");
  assert.equal(compareSuites(rec(true, []), rec(false, ["a"])).verdict, "regression");
  assert.deepEqual(compareSuites(rec(false, ["a"]), rec(false, ["a", "b"])).regressions, ["b"]);
  assert.equal(compareSuites(rec(false, ["a"]), rec(false, ["a"])).verdict, "no-regression");
  assert.equal(compareSuites(rec(false, []), rec(false, [])).verdict, "cannot-compare");
  assert.equal(compareSuites(undefined, rec(false, ["a"])).verdict, "cannot-compare");
  assert.equal(compareSuites(rec(true, []), rec(false, [], { timed_out: true })).verdict, "cannot-compare");
});

test("a project inside a larger repository (a monorepo) works: paths are relative to the project folder", async () => {
  const fx = makeFixture({ subdir: true });
  await readyFor001(fx);
  fx.write(T1, REGRESSION_PRICE);
  fx.write("src/price.mjs", FIXED_PRICE);
  const c = await commit(fx.scope(), fixInput("ISSUE-001"), NOW);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.deepEqual((c as any).files, ["src/price.mjs"]);
  assert.deepEqual(fx.g("show", "--name-only", "--format=", "HEAD", "--relative").split("\n").sort(), ["src/price.mjs", T1].sort());
  // a change elsewhere in the repository is the user's work and blocks the next fix instead of being swept into a commit
  fs.writeFileSync(path.join(fx.repo, "README.md"), "someone else's file");
  const b = begin(fx.scope(), { issue: "ISSUE-002", files: ["src/orders.mjs"], test_files: [T2], plan: "x" }, NOW) as any;
  assert.equal(b.problem, "dirty-tree");
  assert.deepEqual(b.files, ["../README.md"]);
});

test("the fix loop has no way to push, pull, fetch, force or skip a hook", () => {
  const dir = path.resolve(import.meta.dirname, "..", "..", "core", "lib", "fix");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ['"push"', '"pull"', '"fetch"', '"remote"', '"--force"', '"--no-verify"', '"--hard"', '"clean"', '"stash"', '"checkout"']) assert.ok(!src.includes(bad), `${f} must not use git ${bad}`);
  }
});


// ------------------------------------------------------------------------------------------------ what the reports say about a fix run

async function finishedFixRun(opts: { existingTestEncodesBug?: boolean } = {}) {
  const fx = makeFixture({ allJourneys: true, ...opts });
  await readyFor001(fx);
  fx.write(T1, REGRESSION_PRICE);
  fx.write("src/price.mjs", FIXED_PRICE);
  const c = await commit(fx.scope(), fixInput("ISSUE-001"), NOW);
  assert.equal((c as any).ok, true, JSON.stringify(c));
  defer(fx.scope(), { issue: "ISSUE-002", kind: "needs-decision", reason: "The allowed range of the quantity is not in the spec; a person must choose it." }, NOW);
  await runSuite(fx.scope(), NOW);
  writeReports(fx.runDir, fx.store);
  return { fx, tech: () => fs.readFileSync(path.join(fx.runDir, "TECHNICAL-REPORT.md"), "utf8"), admin: () => fs.readFileSync(path.join(fx.runDir, "ADMIN-REPORT.md"), "utf8"), commit: (c as any).commit as string };
}

test("both reports show every problem with its status, the branch line, the proof and the suite result, and agree", async () => {
  const { fx, tech, admin, commit: sha } = await finishedFixRun();
  const t = tech();
  assert.match(t, /\n## Fix run\n/);
  assert.match(t, /- \*\*Branch:\*\* `feature\/qa-fixture`, started from commit `[0-9a-f]{7}` on `main`\. The commits are local to this branch: \*\*nothing was pushed or merged\.\*\*/);
  assert.match(t, /1 fixed and verified · 0 best-effort \(a person must confirm\) · 0 reverted · 1 deferred · 1 not attempted/);
  assert.match(t, /- \*\*Test suite:\*\* before any fix: passed .* after the fixes: passed .* no regression/);
  assert.match(t, new RegExp(`- \\*\\*Fix outcome:\\*\\* verified \\(commit \`${sha}\`\\)`));
  assert.match(t, /- \*\*Fix outcome:\*\* deferred/);
  assert.match(t, /- \*\*Fix outcome:\*\* not attempted/);
  assert.match(t, /\*\*Fix: verified\*\*[\s\S]*Regression test: `test\/qa-regression-issue-001\.test\.mjs`[\s\S]*Test with the fix taken out: \*\*failed\*\*[\s\S]*Test with the fix in: \*\*passed\*\*/);
  assert.match(t, /Why it was not fixed: needs-decision: The allowed range/);
  assert.match(t, /\[BASELINE-TECHNICAL-REPORT\.md\]/);

  const a = admin();
  assert.match(a.split("\n")[0] as string, /^✅ \*\*Ready to release:\*\* .*\(This counts the 1 fix made in this check as merged; they are on a separate branch until a developer reviews and merges them\.\)$/);
  assert.match(a, /Problems: 🔴 1 critical · 🟠 1 important · 🟡 1 minor · 1 of them fixed and checked/);
  assert.match(a, /> - Fixes are on branch feature\/qa-fixture; a developer must review and merge them\./);
  assert.match(a, /### 🔴 Critical: An order of exactly 1,000\.00 gets no discount[\s\S]*?- \*\*Status:\*\* Fixed and checked/);
  assert.match(a, /### 🟠 Important: An order can be placed with a negative quantity[\s\S]*?- \*\*Status:\*\* Not fixed yet/);
  assert.match(a, /## What was fixed\n\n- ✅ An order of exactly 1,000\.00 gets no discount: fixed and checked\.\n- ➖ An order can be placed with a negative quantity: left for a person to decide\.\n\nFixes are on branch feature\/qa-fixture; a developer must review and merge them\./);
  assert.match(a, /1. Have a developer review the fixes and merge them\./);
  assert.doesNotMatch(a, /src\/price\.mjs|node --test|exit \d/, "no files, commands or test output in the plain report");

  const check = checkConsistency(fx.runDir);
  assert.deepEqual(check.errors, []);
  const lint = lintReports(fx.runDir, Object.values(DEMO_ENV), fx.store);
  assert.deepEqual(lint.errors, []);

  const html = exportAdminHtml(fx.runDir, fx.store, { embedImages: false, out: path.join(fx.runDir, "x.html") });
  assert.match(fs.readFileSync(html.file, "utf8"), /What was fixed/);
});

test("the consistency check catches an admin report that disagrees with the fix record", async () => {
  const { fx, admin } = await finishedFixRun();
  const file = path.join(fx.runDir, "ADMIN-REPORT.md");
  const original = admin();
  fs.writeFileSync(file, original.replace("- **Status:** Fixed and checked", "- **Status:** Not fixed yet"));
  assert.match(checkConsistency(fx.runDir).errors.join("\n"), /ISSUE-001 is "verified" in the technical report but its status in the admin report is "Not fixed yet"/);
  fs.writeFileSync(file, original.split("\n").filter((l) => !l.includes("Fixes are on branch")).join("\n"));
  assert.match(checkConsistency(fx.runDir).errors.join("\n"), /In a fix run the admin report must say: "Fixes are on branch feature\/qa-fixture; a developer must review and merge them\."/);
  fs.writeFileSync(file, original.replace("## What was fixed", "## Something else"));
  assert.match(checkConsistency(fx.runDir).errors.join("\n"), /no "What was fixed" section/);
});

test("lint refuses fix claims the fix loop did not record, half-done work, and fixes with no final suite run", async () => {
  const fx = makeFixture({ allJourneys: true });
  await readyFor001(fx);
  // a claim written by hand
  const file = path.join(fx.runDir, "data", "findings.json");
  const list = JSON.parse(fs.readFileSync(file, "utf8"));
  list[2].fix_status = "fixed-verified";
  fs.writeFileSync(file, JSON.stringify(list));
  writeReports(fx.runDir, fx.store);
  const errors = lintReports(fx.runDir, [], fx.store).errors.join("\n");
  assert.match(errors, /ISSUE-003 is marked fixed but the fix loop has no committed fix for it/);
  assert.match(errors, /ISSUE-001 is still being fixed: commit it/, "an attempt left open is an error too");
  // a report-only run cannot carry fix details at all
  const only = makeFixture({ kind: "qa-only" });
  const l2 = JSON.parse(fs.readFileSync(path.join(only.runDir, "data", "findings.json"), "utf8"));
  l2[0].fix = { outcome: "verified" };
  fs.writeFileSync(path.join(only.runDir, "data", "findings.json"), JSON.stringify(l2));
  assert.match(lintReports(only.runDir, [], only.store).errors.join("\n"), /carries a fix record but this run has no fix loop record/);

  // committed fixes need the suite run afterwards
  const fx3 = makeFixture({ allJourneys: true });
  await readyFor001(fx3);
  fx3.write(T1, REGRESSION_PRICE);
  fx3.write("src/price.mjs", FIXED_PRICE);
  assert.equal(((await commit(fx3.scope(), fixInput("ISSUE-001"), NOW)) as any).ok, true);
  writeReports(fx3.runDir, fx3.store);
  assert.match(lintReports(fx3.runDir, [], fx3.store).errors.join("\n"), /full test suite was not run afterwards\. Call fix_run_suite/);
  await runSuite(fx3.scope(), NOW);
  writeReports(fx3.runDir, fx3.store);
  assert.deepEqual(lintReports(fx3.runDir, [], fx3.store).errors, []);
});

test("a regression after the fixes shows loudly in both reports and stops the verdict from saying Ready", async () => {
  const { fx, tech, admin } = await finishedFixRun({ existingTestEncodesBug: true });
  assert.match(tech(), /> ⚠️ \*\*REGRESSION after the fixes:\*\*/);
  const a = admin();
  assert.match(a.split("\n")[0] as string, /^⚠️ \*\*Ready with risks:\*\* an automatic check that passed before the fixes fails after them\./);
  assert.match(a, /⚠️ After the fixes, an automatic check that used to pass now fails\. A developer must look at this before the fixes are merged\./);
  assert.deepEqual(checkConsistency(fx.runDir).errors, []);
  const lint = lintReports(fx.runDir, [], fx.store);
  assert.ok(lint.warnings.some((w) => /REGRESSION after the fixes/.test(w)));
});

test("run_finish refuses to leave a half-done fix, or fixes with no final suite run, and then records the fixes in the summary, history and memory", async () => {
  const fx = makeFixture({ allJourneys: true });
  await readyFor001(fx);
  await assert.rejects(async () => finishRunTracked(fx.home, fx.runId, { now: NOW }), /ISSUE-001 is still being fixed.*would leave uncommitted changes/);
  fx.write(T1, REGRESSION_PRICE);
  fx.write("src/price.mjs", FIXED_PRICE);
  assert.equal(((await commit(fx.scope(), fixInput("ISSUE-001"), NOW)) as any).ok, true);
  await assert.rejects(async () => finishRunTracked(fx.home, fx.runId, { now: NOW }), /full test suite was not run afterwards/);
  await runSuite(fx.scope(), NOW);
  writeReports(fx.runDir, fx.store);
  const summary = finishRunTracked(fx.home, fx.runId, { now: NOW });
  assert.deepEqual(summary.fixes, { branch: "feature/qa-fixture", base_commit: summary.fixes!.base_commit, verified: 1, best_effort: 0, reverted: 0, deferred: 0, commits: [summary.fixes!.commits[0] as string], suite: "no-regression" });
  assert.equal(summary.fixes!.commits.length, 1);

  // the next run, and run history, know about it
  const later = startRun({ cwd: fx.proj, mode: "quick", kind: "qa-only", host: "test", home: fx.home, env: {}, sessionId: "s-next", now: new Date("2026-11-04T09:00:00Z") });
  assert.equal(later.status, "ready", later.message);
  const next = runScope(fx.home, later.run!.id, {});
  const ctx = getContext(next);
  assert.deepEqual(ctx.fix_log.map((f) => [f.issue, f.outcome, f.files]), [["ISSUE-001", "verified", ["src/price.mjs"]]]);
  assert.equal(ctx.fix_log[0]?.root_cause, "discount() compared with > where the rule says 1,000.00 or more");
  assert.equal(runHistory(next, 5).runs[0]?.fixes?.verified, 1);
});

test("the biggest risk and next steps the agent wrote before the fixes are not shown after them; ones written afterwards are", async () => {
  const fx = makeFixture({ allJourneys: true });
  const adminFile = path.join(fx.runDir, "data", "admin.json");
  writeJson(adminFile, { biggest_risk: "Customers can read other companies' orders.", next_steps: ["Have a developer fix the access problems first."] });
  writeReports(fx.runDir, fx.store); // the baseline report, with what the agent wrote before any fix
  await readyFor001(fx);
  fx.write(T1, REGRESSION_PRICE);
  fx.write("src/price.mjs", FIXED_PRICE);
  assert.equal(((await commit(fx.scope(), fixInput("ISSUE-001"), NOW)) as any).ok, true); // finished at 09:00, after admin.json
  await runSuite(fx.scope(), NOW);
  writeReports(fx.runDir, fx.store);
  const stale = fs.readFileSync(path.join(fx.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.doesNotMatch(stale, /Have a developer fix the access problems first/, "a next step that was written before the fix is not shown");
  assert.doesNotMatch(stale, /Customers can read other companies' orders/);
  assert.match(stale, /1\. Have a developer review the fixes and merge them\./, "the computed steps are used instead");
  assert.ok(lintReports(fx.runDir, [], fx.store).warnings.some((w) => /admin\.json .* was written before the last fix/.test(w)));

  writeJson(adminFile, { biggest_risk: "The allowed quantity range is still undecided.", next_steps: ["Review and merge the fix branch.", "Decide the allowed quantity range."] });
  fs.utimesSync(adminFile, new Date("2026-11-03T09:30:00Z"), new Date("2026-11-03T09:30:00Z"));
  writeReports(fx.runDir, fx.store);
  const fresh = fs.readFileSync(path.join(fx.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(fresh, /Biggest risk: The allowed quantity range is still undecided\./);
  assert.match(fresh, /1\. Review and merge the fix branch\.\n2\. Decide the allowed quantity range\./);
  assert.ok(!lintReports(fx.runDir, [], fx.store).warnings.some((w) => /admin\.json/.test(w)));
});

test("a full or quick baseline must have tested every web UI with a test login before any fix; api_only is the user's explicit exception; diff mode is not held to it", async () => {
  const apiOnlyCoverage = [{ surface: "api", area: "Orders API", status: "tested" }, { surface: "ui", ui: "Admin Portal", area: "Orders", status: "not-tested", note: "Browser flows were not run in this pass" }];
  const fx = makeFixture({ coverage: apiOnlyCoverage });
  const pf = (await preflight(fx.scope(), NOW)) as any;
  assert.equal(pf.problem, "baseline-incomplete");
  assert.deepEqual(pf.missing_uis.sort(), ["Admin Portal", "Client Portal"]);
  assert.match(pf.message, /"Not run in this pass"|nothing is recorded as tested for Admin Portal and Client Portal/);
  assert.match(pf.message, /only if they agree, call fix_preflight with api_only set to true/);
  assert.equal(loadFixState(fx.runDir), undefined, "nothing started");

  const ok = (await preflight(fx.scope(), NOW, { api_only: true })) as any;
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(loadFixState(fx.runDir)?.api_only, true);
  writeReports(fx.runDir, fx.store);
  assert.match(fs.readFileSync(path.join(fx.runDir, "TECHNICAL-REPORT.md"), "utf8"), /\*\*Baseline scope:\*\* the API only: the user agreed/);

  // one UI covered is not enough when two have logins
  const half = makeFixture({ coverage: [{ surface: "ui", ui: "Client Portal", area: "My orders", status: "partial" }] });
  assert.deepEqual(((await preflight(half.scope(), NOW)) as any).missing_uis, ["Admin Portal"]);
  // a covered UI row that was not actually tested does not count
  assert.equal(((await preflight(makeFixture({ coverage: [{ surface: "ui", ui: "Client Portal", area: "x", status: "not-tested" }, { surface: "ui", ui: "Admin Portal", area: "y", status: "not-tested" }] }).scope(), NOW)) as any).problem, "baseline-incomplete");
  // the quick mode is held to it too; diff mode narrows the scope by design
  assert.equal(((await preflight(makeFixture({ mode: "quick", coverage: apiOnlyCoverage }).scope(), NOW)) as any).problem, "baseline-incomplete");
  assert.equal(((await preflight(makeFixture({ mode: "diff", coverage: apiOnlyCoverage }).scope(), NOW)) as any).ok, true);
});
