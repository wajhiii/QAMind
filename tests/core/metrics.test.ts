import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { writeJson } from "../../core/lib/fsutil.ts";
import { addEscaped, agentPerformance, areaSimilarity, loadMetrics, matchEscaped, metricFromRun, recordRunMetrics } from "../../core/lib/metrics.ts";
import type { AreaMark, RunMetric } from "../../core/lib/metrics.ts";
import { renderAgentPerformance } from "../../core/lib/metrics-report.ts";
import { loadRisk, scoreAreas } from "../../core/lib/memory/risk.ts";
import { decidePreToolUse } from "../../core/lib/hooks.ts";
import { readRunData } from "../../core/lib/report.ts";
import { ALL_FLOWS_TESTED, cli, finding, makeRunWithData, startAnotherRun, tmp } from "./helpers.ts";

// Agent performance metrics and escaped bugs (spec 13.16).

const mark = (area: string, status: AreaMark["status"]): AreaMark => ({ area, status, surface: "ui" });
const note = (id: string, area: string, title: string) => ({ id, area, title });
const metric = (id: string, at: string, over: Partial<RunMetric> = {}): RunMetric => ({
  run_id: id,
  finished: at,
  mode: "full",
  trigger: "manual",
  verdict: "ready-with-risks",
  findings: { critical: 1, important: 2, minor: 1, unconfirmed: 0 },
  bugs: { new: 2, still_open: 1, came_back: 0 },
  coverage: { journeys_tested: 4, journeys_total: 5, areas_tested: 6, areas_partial: 1, areas_not_tested: 1, pages: 9, endpoints: 12, api_probes: 40 },
  tests_saved: 1,
  duration_s: 600,
  areas: [],
  ...over,
});

test("area names are compared by their words, so the reports' wording and a ticket's wording meet", () => {
  assert.equal(areaSimilarity("Orders / validation", "Order creation"), 0.5);
  assert.equal(areaSimilarity("Customers page", "Customer list"), 0.5);
  assert.equal(areaSimilarity("Reports", "reports page"), 1);
  assert.equal(areaSimilarity("Orders API", "Invoices"), 0);
  assert.equal(areaSimilarity("", "Orders"), 0);
});

test("an escaped bug is placed by what the newest run that covered its area said about it, and by whether that run had reported anything like it", () => {
  const runs = [
    metric("run-old", "2026-10-01T00:00:00Z", { areas: [mark("Billing", "tested"), mark("Search", "tested")], finding_list: [] }),
    metric("run-new", "2026-10-20T00:00:00Z", {
      areas: [mark("Orders", "tested"), mark("Customers page", "tested"), mark("Reports", "partial"), mark("Invoices", "not-tested"), mark("Search", "not-tested")],
      finding_list: [note("ISSUE-001", "Customers / export", "Customers page export drops the last row")],
    }),
  ];
  const v = (area: string) => matchEscaped(area, runs);
  assert.equal(v("Order creation").verdict, "missed", "marked as tested, and nothing the run found looks like it");
  assert.deepEqual(v("Order creation").matched, { run_id: "run-new", finished: "2026-10-20T00:00:00Z", area: "Orders", status: "tested", findings: [] });
  const before = v("Customer list");
  assert.equal(before.verdict, "reported-before");
  assert.deepEqual(before.matched?.findings, ["ISSUE-001"], "the finding that was considered is named, so a person can judge the match");
  assert.equal(v("Reports page").verdict, "partly-checked");
  assert.equal(v("Invoices").verdict, "not-checked");
  assert.equal(v("Warehouse stock").verdict, "never-covered");
  assert.equal(v("Billing").verdict, "missed", "an older run still counts when no newer run covered the area");
  assert.equal(v("Search").verdict, "not-checked", "the newest run that covered it decides, not an older one that tested it");
  assert.equal(matchEscaped("Orders", []).verdict, "never-covered");
});

test("in an app where every area is about orders, the word 'order' does not tie a finding to every area", () => {
  const fx = makeRunWithData({
    coverage: [
      { surface: "api", area: "Orders list: search and pagination", status: "tested" },
      { surface: "api", area: "Create order: quantities and totals", status: "tested" },
      { surface: "api", area: "Order read by role", status: "tested" },
      { surface: "api", area: "Admin customers", status: "tested" },
    ],
    findings: [finding({ id: "ISSUE-001", severity: "important", area: "Orders / pagination", title: "page_size=0 returns a server error" }), finding({ id: "ISSUE-002", severity: "important", area: "Orders / validation", title: "Negative quantities are accepted" }), finding({ id: "ISSUE-003", severity: "important", area: "API / error handling", title: "Malformed requests return a stack trace and the file paths by default" })],
  });
  const m = metricFromRun(readRunData(fx.runDir), { finished: "2026-10-30T10:20:00Z", duration_s: 60 }, { pages: 0, endpoints: 0 });
  assert.deepEqual(m.finding_list?.map((f) => f.id), ["ISSUE-001", "ISSUE-002", "ISSUE-003"]);
  const place = (area: string) => matchEscaped(area, [m]);
  const pagination = place("Orders list: search and pagination");
  assert.equal(pagination.verdict, "reported-before");
  assert.deepEqual(pagination.matched?.findings, ["ISSUE-001"], "only the pagination finding is related, not every finding about orders");
  assert.equal(place("Create order: quantities and totals").matched?.findings?.join(), "ISSUE-002");
  const unseen = place("Order read by role");
  assert.equal(unseen.verdict, "missed", "nothing the run reported is about reading orders by role");
  assert.deepEqual(unseen.matched?.findings, []);
  // a long area phrase needs two shared words, a short name one
  const longPhrase = matchEscaped("Orders list: pagination, search and edge values", [metric("run-y", "2026-10-30T10:20:00Z", { areas: m.areas, finding_list: [note("ISSUE-001", "Orders / list", "Pagination and search fail for page_size=0 and odd text"), note("ISSUE-002", "Orders / access", "Another company's order can be read by id"), note("ISSUE-003", "Orders / list", "The list shows the wrong status")] })]);
  assert.deepEqual(longPhrase.matched?.findings, ["ISSUE-001"], "two shared words (pagination, search); the finding that shares only 'list' is not tied to it");
  // words like "by", "and" and "id" are not what a finding is about: an area written with them is not tied to a finding that merely has them too
  const wordy = place("Order read by id and list isolation");
  assert.equal(wordy.matched?.area, "Order read by role");
  assert.deepEqual(wordy.matched?.findings, [], "the error-handling finding shares only 'and' and 'by' with it");
  assert.equal(wordy.verdict, "missed");
});

test("recording an escaped bug raises the area's risk, is idempotent, and is checked for secrets and personal data", () => {
  const store = tmp("qamind-store-");
  recordRunMetrics(store, metric("run-1", "2026-10-20T00:00:00Z", { areas: [mark("Orders", "tested")], finding_list: [] }));
  const now = new Date("2026-11-01T10:00:00Z");
  const first = addEscaped(store, { area: "Order creation", title: "Orders over 1,000.00 are charged the wrong tax in production", severity: "critical", source: "sentry", ref: "SENTRY-123", by: "Pat" }, now);
  assert.equal(first.already, false);
  assert.equal(first.bug.id, "ESC-001");
  assert.equal(first.bug.verdict, "missed");
  const risk = scoreAreas(loadRisk(store), now).find((a) => a.area === "Order creation");
  assert.ok(risk && risk.score >= 19.9 && risk.worst_severity === "critical", "a bug confirmed in production counts double: 10 x 2 for a critical one: " + JSON.stringify(risk));
  assert.equal(loadRisk(store).areas[0]?.events[0]?.source, "escaped");

  const again = addEscaped(store, { area: "Orders / creation", title: "A different title for the same Sentry error", source: "sentry", ref: "SENTRY-123" }, now);
  assert.equal(again.already, true);
  assert.equal(again.bug.id, "ESC-001");
  assert.equal(addEscaped(store, { area: "Order creation", title: "Orders over 1,000.00 are charged the wrong tax in production" }, now).already, true, "without a reference, the same area and title is the same bug");
  assert.equal(addEscaped(store, { area: "Warehouse", title: "Stock counts go negative after a return" }, now).bug.verdict, "never-covered");
  assert.equal(loadMetrics(store).escaped.length, 2);

  assert.throws(() => addEscaped(store, { area: "x", title: "A real title that is long enough" }, now), /the area it is in/);
  assert.throws(() => addEscaped(store, { area: "Orders", title: "short" }, now), /title of 8 to 200/);
  assert.throws(() => addEscaped(store, { area: "Orders", title: "A long enough title", severity: "huge" as never }, now), /severity must be/);
  assert.throws(() => addEscaped(store, { area: "Orders", title: "Customer jane.smith@gmail.com could not pay" }, now), /personal data|email/i);
});

test("a run's record: findings, bugs across runs, coverage, the bank, cost and what it said about each area", () => {
  const fx = makeRunWithData({ coverage: [...ALL_FLOWS_TESTED, { surface: "api", area: "Orders API", status: "tested" }, { surface: "ui", ui: "Admin Portal", area: "Customers page", status: "not-tested" }], pages: [{ path: "/a" }, { path: "/b" }], endpoints: ["GET /x"] });
  writeJson(path.join(fx.runDir, "data", "bank-results.json"), { schema_version: 1, run_id: fx.runId, ran_at: "2026-10-30T10:00:00Z", total: 5, passed: 2, flaky: 1, failed: 1, quarantined: 1, skipped: 0, results: [], covered_areas: [] });
  const data = readRunData(fx.runDir);
  const m = metricFromRun(data, { finished: "2026-10-30T10:20:00Z", duration_s: 1200, cost_usd: 2.5, tokens: 90_000, tests_saved: 2 }, { pages: 2, endpoints: 1 });
  assert.deepEqual(m.findings, { critical: 1, important: 1, minor: 1, unconfirmed: 0 });
  assert.equal(m.coverage.journeys_tested, 5);
  assert.equal(m.coverage.areas_tested, 6);
  assert.equal(m.coverage.areas_not_tested, 1);
  assert.deepEqual([m.coverage.pages, m.coverage.endpoints], [2, 1]);
  assert.deepEqual(m.bank, { total: 5, ran: 4, passed: 3, failed: 1, pass_rate: 0.75 }, "a pass on a retry is a pass; quarantined tests are not counted as run");
  assert.deepEqual([m.duration_s, m.cost_usd, m.tokens, m.tests_saved], [1200, 2.5, 90_000, 2]);
  assert.equal(m.areas.find((a) => a.area === "Customers page")?.status, "not-tested");
  assert.equal(m.finding_list?.length, 3);
  assert.equal(m.verdict, "not-ready");
  assert.ok(m.areas.length > 0 && JSON.stringify(m).length < 20_000);
});

test("finishing runs records them, finishing twice records once, and a run whose environment was broken says nothing about the agent", async () => {
  const fx = makeRunWithData();
  const fin = await cli(fx.home, "run", "finish", "--run", fx.runId);
  assert.equal(fin.code, 0, JSON.stringify(fin.json));
  const m = loadMetrics(fx.store);
  assert.equal(m.runs.length, 1);
  assert.equal(m.runs[0]?.run_id, fx.runId);
  assert.equal(m.runs[0]?.findings.critical, 1);
  assert.equal(m.runs[0]?.mode, "full");
  const second = startAnotherRun(fx, "2026-10-31T10:00:00Z", { health: { environment_ok: false, checks: [{ name: "API base responds", ok: false, detail: "no response" }] }, findings: [] });
  const fin2 = await cli(fx.home, "run", "finish", "--run", second.runId, "--stop-reason", "environment problem");
  assert.equal(fin2.code, 0, JSON.stringify(fin2.json));
  assert.equal(loadMetrics(fx.store).runs.length, 1, "the broken-environment run is not recorded");
});

test("six finished runs show a trend, the report carries an 'Agent performance' section, and memory stats carries the same numbers", async () => {
  const fx = makeRunWithData();
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  const days = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
  const ids: string[] = [fx.runId];
  for (const [i, d] of days.entries()) {
    const r = startAnotherRun(fx, `${d}T10:00:00Z`, i < 3 ? {} : { findings: [finding({ id: "ISSUE-001", severity: "minor" })], coverage: ALL_FLOWS_TESTED, notTested: [] });
    const done = await cli(fx.home, "run", "finish", "--run", r.runId);
    assert.equal(done.code, 0, JSON.stringify(done.json));
    ids.push(r.runId);
  }
  const p = agentPerformance(fx.store);
  assert.equal(p.total_runs, 6);
  assert.equal(p.runs.length, 5, "the last five are listed");
  assert.ok(p.trend, "six runs make a trend");
  assert.ok(p.trend && p.trend.serious_per_run[0] > p.trend.serious_per_run[1], "fewer serious problems in the later runs: " + JSON.stringify(p.trend));
  assert.ok(p.trend && p.trend.journeys_tested_share[1] > p.trend.journeys_tested_share[0]);
  const tech = fs.readFileSync(path.join(fx.proj, ".qa", "reports", ids[5] as string, "TECHNICAL-REPORT.md"), "utf8");
  assert.match(tech, /## Agent performance/);
  assert.match(tech, /\| \*\*this run\*\* \| full \|/);
  assert.match(tech, /\*\*Trend\*\* \(latest 3 runs against the 3 before\): serious problems per run 2 → 0\.67; key journeys tested 80% → 93%/);
  assert.match(tech, /\*\*Precision:\*\* not available yet\./);
  assert.match(tech, /\*\*Escaped bugs:\*\* none recorded\./);
  const stats = await cli(fx.home, "memory", "stats", "--project", fx.proj);
  assert.equal(stats.json.performance.total_runs, 6);
  assert.deepEqual(stats.json.performance.trend.serious_per_run, p.trend?.serious_per_run);
  assert.match(stats.json.not_available_yet.join(" "), /Escaped bugs[\s\S]*qamind escaped add/);
});

test("fewer than six runs say so instead of inventing a trend", async () => {
  const fx = makeRunWithData();
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  const p = agentPerformance(fx.store);
  assert.equal(p.trend, undefined);
  assert.match(p.notes.join(" "), /A trend needs at least 6 runs; this project has 1\./);
  const md = renderAgentPerformance(p).join("\n");
  assert.match(md, /A trend needs at least 6 runs/);
  assert.doesNotMatch(md, /\*\*Trend\*\*/);
});

test("a trend appears at exactly six runs, not before: five runs say so", () => {
  const store = tmp("qamind-store-");
  for (let i = 1; i <= 5; i++) recordRunMetrics(store, metric(`run-${i}`, `2026-10-0${i}T00:00:00Z`, { findings: { critical: 0, important: i, minor: 0, unconfirmed: 0 } }));
  const five = agentPerformance(store);
  assert.equal(five.trend, undefined);
  assert.match(five.notes.join(" "), /this project has 5\./);
  recordRunMetrics(store, metric("run-6", "2026-10-06T00:00:00Z", { findings: { critical: 0, important: 6, minor: 0, unconfirmed: 0 } }));
  const six = agentPerformance(store);
  assert.deepEqual(six.trend?.serious_per_run, [2, 5], "the first three against the last three: (1+2+3)/3 and (4+5+6)/3");
  // a run being built counts in place of its own earlier record
  const live = agentPerformance(store, metric("run-6", "2026-10-06T00:00:00Z", { findings: { critical: 0, important: 0, minor: 0, unconfirmed: 0 } }));
  assert.equal(live.total_runs, 6);
  assert.deepEqual(live.trend?.serious_per_run, [2, 3]);
});

test("the CLI records escaped bugs, lists them with what the runs had said, and shows the escaped bugs in the report", async () => {
  const fx = makeRunWithData({ coverage: [...ALL_FLOWS_TESTED, { surface: "ui", ui: "Admin Portal", area: "Customers page", status: "tested" }], findings: [finding({ id: "ISSUE-001", severity: "minor", area: "Orders / display" })] });
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  const added = await cli(fx.home, "escaped", "add", "--project", fx.proj, "--area", "Customers page", "--title", "Customer export drops the last row in production", "--severity", "important", "--source", "ticket", "--ref", "OPS-7");
  assert.equal(added.code, 0, JSON.stringify(added.json));
  assert.equal(added.json.verdict, "missed");
  assert.match(added.json.what_the_runs_had_said, /marked this area as tested and found nothing: the agent missed it/);
  assert.equal(added.json.matched_area, "Customers page");
  assert.match(added.json.risk, /The risk of "Customers page" is raised \(important\)/);
  const list = await cli(fx.home, "escaped", "list", "--project", fx.proj);
  assert.equal(list.json.total, 1);
  assert.equal(list.json.escaped[0].ref, "OPS-7");
  assert.equal((await cli(fx.home, "escaped", "add", "--project", fx.proj, "--area", "x", "--title", "Customer export drops the last row in production")).code, 1);
  assert.match((await cli(fx.home, "escaped", "add", "--project", fx.proj, "--area", "Customers page")).json.error, /needs --area .* and --title/);
  assert.match((await cli(fx.home, "escaped", "add", "--project", fx.proj, "--area", "Customers page", "--title", "A long enough title", "--source", "carrier-pigeon")).json.error, /--source must be one of/);
  const m = await cli(fx.home, "metrics", "--project", fx.proj);
  assert.deepEqual([m.json.escaped.total, m.json.escaped.missed], [1, 1]);
  // the next report of any run in the project shows it
  const r2 = startAnotherRun(fx, "2026-11-02T10:00:00Z", {});
  await cli(fx.home, "report", "build", "--run", r2.runId);
  const tech = fs.readFileSync(path.join(r2.runDir, "TECHNICAL-REPORT.md"), "utf8");
  assert.match(tech, /\*\*Escaped bugs:\*\* 1 recorded: 1 in an area a run had marked as passing \(the agent's miss\)\./);
  assert.match(tech, /ESC-001 \(important, \d{4}-\d{2}-\d{2}\) Customer export drops the last row in production — Customers page: a run had marked this area as tested/);
});

test("recording an escaped bug and the metrics file are the owner's: a QA run cannot do either", () => {
  const fx = makeRunWithData();
  const decide = (tool: string, input: Record<string, unknown>) => decidePreToolUse({ session_id: "s1", tool_name: tool, tool_input: input, cwd: "/" }, fx.home, [], new Date("2026-10-30T10:30:00Z"));
  for (const cmd of ["qamind escaped add --area Orders --title 'It broke in production'", "node /x/qamind.mjs escaped add --area A --title B"]) {
    const d = decide("Bash", { command: cmd });
    assert.equal(d?.decision, "deny", cmd);
    assert.match(d?.reason ?? "", /recording a bug that escaped to production/);
  }
  assert.equal(decide("Bash", { command: "qamind escaped list" }), null);
  assert.equal(decide("Bash", { command: "qamind metrics" }), null);
  assert.equal(decide("Write", { file_path: path.join(fx.home, "projects", "p1", "memory", "metrics.json"), content: "{}" })?.decision, "deny");
});
