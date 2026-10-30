import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { BEHIND_NOTE, CANNOT_SEE_ON_SCREEN, GLOSSARY, LOGIN_NOTE, buildAdminModel, lintAdminLanguage, renderAdminMarkdown } from "../../core/lib/adminreport.ts";
import { parseCriticalFlows } from "../../core/lib/config.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { readRunData } from "../../core/lib/report.ts";
import type { CoverageRow, RunData } from "../../core/lib/report.ts";
import { lintReports, previousRuns, writeReports } from "../../core/lib/reports.ts";
import { finishRun } from "../../core/lib/run.ts";
import { computeVerdict } from "../../core/lib/verdict.ts";
import { checkConsistency } from "../../core/scripts/consistency-check.ts";
import { exportAdminHtml, renderAdminHtml } from "../../core/scripts/export-html.ts";
import { ALL_FLOWS_TESTED, DEMO_CONFIG, finding, makeRunWithData, repoRoot } from "./helpers.ts";

const dataOf = (over: Partial<RunData> = {}): RunData => ({
  meta: { schema_version: 1, run_id: "run-x", project_id: "p", project_name: "p", environment: "staging", mode: "full", trigger: "manual", kind: "qa-only", host: "t", started: "2026-10-30T10:00:00Z", agent_version: "0", knowledge_version: "0", critical_flows: ["a", "b"] },
  charters: [], findings: [], unconfirmed: [], notTested: [], apiSummaries: [], memoryLog: [],
  coverage: [1, 2].map((n): CoverageRow => ({ surface: "ui", area: `j${n}`, status: "tested", critical_flow: n })),
  health: { environment_ok: true, checks: [], ran_at: "x" },
  ...over,
});

test("critical journeys are read from the config's numbered list", () => {
  const body = DEMO_CONFIG.split(/\n---\n/).slice(1).join("\n---\n");
  const flows = parseCriticalFlows(body);
  assert.equal(flows.length, 5);
  assert.match(flows[0] as string, /^A client signs in/);
  assert.deepEqual(parseCriticalFlows("# Business rules\n- x"), []);
  assert.deepEqual(parseCriticalFlows("# Critical flows\n<!-- c -->\n1. one\n   continues\n2) two\n\n# Next\n3. no"), ["one continues", "two"]);
});

test("release verdict follows the default rules (spec 13.13) and is never Ready without every journey tested", () => {
  assert.equal(computeVerdict(dataOf()).level, "ready");
  assert.match(computeVerdict(dataOf()).line, /^✅ \*\*Ready to release/);
  const imp = (n: number) => Array.from({ length: n }, (_, i) => finding({ id: `ISSUE-00${i + 1}`, severity: "important" }));
  assert.equal(computeVerdict(dataOf({ findings: imp(2) })).level, "ready", "2 important is allowed");
  const three = computeVerdict(dataOf({ findings: imp(3) }));
  assert.equal(three.level, "ready-with-risks");
  assert.match(three.line, /3 important problems/);
  assert.equal(computeVerdict(dataOf({ findings: [finding({ id: "ISSUE-001", severity: "critical" })] })).level, "not-ready");
  // a fixed-and-verified critical problem no longer counts
  assert.equal(computeVerdict(dataOf({ findings: [finding({ id: "ISSUE-001", severity: "critical", fix_status: "fixed-verified" })] })).level, "ready");
  // a journey that is only partly covered, or missing, blocks Ready
  const partial = dataOf({ coverage: [{ surface: "ui", area: "j1", status: "tested", critical_flow: 1 }, { surface: "ui", area: "j2", status: "partial", critical_flow: 2 }] });
  assert.equal(computeVerdict(partial).level, "ready-with-risks");
  assert.match(computeVerdict(partial).line, /1 key journey was not fully checked/);
  assert.equal(computeVerdict(dataOf({ coverage: [] })).level, "ready-with-risks");
  const noFlows = dataOf();
  noFlows.meta!.critical_flows = [];
  assert.equal(computeVerdict(noFlows).level, "ready-with-risks", "unknown journeys can never be Ready");
  assert.equal(computeVerdict(dataOf({ health: undefined })).level, "ready-with-risks");
  const broken = computeVerdict(dataOf({ health: { environment_ok: false, checks: [{ name: 'Web UI "Client Portal" loads', ok: false, detail: "HTTP 503" }], ran_at: "x" } }));
  assert.equal(broken.level, "not-ready");
  assert.equal(broken.environment_problem, true);
  assert.match(broken.line, /^⛔ \*\*Not ready to release:\*\* the test environment has a problem/);
});

test("the admin report: verdict first, short summary, areas, plain problems, at most 3 next steps", () => {
  const fx = makeRunWithData({ unconfirmed: 2 });
  const { admin, model } = writeReports(fx.runDir, fx.store);
  const lines = admin.split("\n");
  assert.match(lines[0] as string, /^⛔ \*\*Not ready to release:\*\* 1 critical problem found, for example: A customer can open another company's order\./);
  assert.ok(model.summary.length <= 6);
  assert.match(admin, /> - Problems: 🔴 1 critical · 🟠 1 important · 🟡 1 minor/);
  assert.match(admin, /> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check/);
  assert.match(admin, /> - 2 other things were seen only once/);
  // areas: critical in the permissions area -> ⛔; the UI with a minor problem and an untested row -> ⚠️
  assert.match(admin, /\| Who can see and do what \(permissions\) \| ⛔ \|/);
  assert.match(admin, /\| Admin Portal \| ⚠️ \|/);
  // plain problem blocks, critical first, with numbered steps and a For developers link
  const crit = admin.indexOf("### 🔴 Critical: A customer can open another company's order");
  const imp = admin.indexOf("### 🟠 Important:");
  const min = admin.indexOf("### 🟡 Minor:");
  assert.ok(crit > 0 && crit < imp && imp < min);
  assert.match(admin, /- \*\*How to see it yourself:\*\*\n  1\. Sign in to the Client Portal as a customer of Company A\./);
  assert.match(admin, /- \*\*How to see it yourself:\*\* This cannot be seen on screen\./);
  assert.match(admin, /- \*\*Screenshot:\*\* \[view the screenshot\]\(screenshots\/shot\.png\)/);
  assert.match(admin, /- \*\*Screenshot:\*\* none \(this is not visible on screen\)/);
  assert.match(admin, /- \*\*Status:\*\* Not fixed yet/);
  assert.match(admin, /- \*\*For developers:\*\* \[ISSUE-001\]\(TECHNICAL-REPORT\.md#ISSUE-001\)/);
  assert.match(admin, /## What was not tested\n\n- \*\*Password reset emails\*\*: Testing it would send real emails/);
  assert.ok(model.nextSteps.length >= 1 && model.nextSteps.length <= 3);
  assert.deepEqual(lintAdminLanguage(admin), [], "the generated report itself has no jargon");
  assert.match(fs.readFileSync(path.join(fx.runDir, "TECHNICAL-REPORT.md"), "utf8"), /<a id="ISSUE-001"><\/a>/);
});

test("golden: the admin report for the fixture run is stable (set UPDATE_GOLDEN=1 to regenerate)", () => {
  const fx = makeRunWithData({ admin: { biggest_risk: "Customers' orders can be read by other customers.", next_steps: ["Have a developer fix the access problem first.", "Run the check again afterwards."] } });
  const { admin } = writeReports(fx.runDir, fx.store);
  const golden = path.join(repoRoot, "tests", "core", "golden", "admin-report.md");
  const example = path.join(repoRoot, "docs", "examples", "ADMIN-REPORT.example.md");
  if (process.env["UPDATE_GOLDEN"] === "1") {
    fs.mkdirSync(path.dirname(golden), { recursive: true });
    fs.mkdirSync(path.dirname(example), { recursive: true });
    fs.writeFileSync(golden, admin);
    fs.writeFileSync(example, admin);
  }
  assert.equal(admin, fs.readFileSync(golden, "utf8"));
  assert.equal(fs.readFileSync(example, "utf8"), admin, "docs/examples/ADMIN-REPORT.example.md must match the golden report");
});

test("consistency check passes on freshly built reports and fails on each kind of disagreement", () => {
  const fx = makeRunWithData();
  writeReports(fx.runDir, fx.store);
  const ok = checkConsistency(fx.runDir);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.technical.map((x) => x.id), ["ISSUE-001", "ISSUE-002", "ISSUE-003"]);

  const adminFile = path.join(fx.runDir, "ADMIN-REPORT.md");
  const original = fs.readFileSync(adminFile, "utf8");
  const bad = (mutate: (t: string) => string) => {
    fs.writeFileSync(adminFile, mutate(original));
    const r = checkConsistency(fx.runDir);
    fs.writeFileSync(adminFile, original);
    return r.errors.join("\n");
  };
  const dropBlock = (id: string) => (t: string) => t.replace(new RegExp(`### [🔴🟠🟡][^\\n]*\\n(?:(?!### )[\\s\\S])*?\\[${id}\\]\\(TECHNICAL-REPORT\\.md#${id}\\)\\n`), "");
  assert.match(bad(dropBlock("ISSUE-001")), /ISSUE-001 \(critical\).*never be dropped/);
  assert.match(bad(dropBlock("ISSUE-003")), /ISSUE-003 \(minor\) is in the technical report but missing/);
  assert.match(bad((t) => t.replace("### 🔴 Critical:", "### 🟡 Minor:")), /ISSUE-001 is critical in the technical report but minor in the admin report/);
  assert.match(bad((t) => t.replace("[ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)", "[ISSUE-099](TECHNICAL-REPORT.md#ISSUE-099)")), /ISSUE-099 is in the admin report but not in the technical report: nothing may be added/);
  assert.match(bad((t) => t.replace("🔴 1 critical", "🔴 0 critical")), /admin summary says 0 critical but the technical report lists 1/);
  assert.match(bad((t) => t.replace(/^⛔ \*\*Not ready to release:\*\*[^\n]*/, "✅ **Ready to release:** all good.")), /says Ready, but there are critical problems/);
  assert.match(bad((t) => t.replace(/^⛔[^\n]*/, "All is well.")), /first line must be the release verdict/);
  assert.match(bad((t) => t.replace(/- \*\*For developers:\*\*[^\n]*\n/, "")), /exactly one "For developers" line/);
  assert.match(bad((t) => t.replace("- **Who is affected:**", "- **People:**")), /missing "Who is affected"/);
  assert.match(bad((t) => t.replace(/- \*\*Password reset emails\*\*[^\n]*\n/, "")), /lists 2 not-tested areas but the admin report lists 1/);
  assert.match(bad((t) => t.replace("## Suggested next steps\n\n", "## Suggested next steps\n\n1. a\n2. b\n3. c\n4. d\n")), /\d+ suggested next steps \(limit 3\)/);
  assert.match(bad((t) => t.replace("A customer can open another company's order\n", "A customer can open another company's order, the API returns 403 with a JSON body\n").replace("### 🔴 Critical: A customer can open another company's order", "### 🔴 Critical: A customer can open another company's order, GET /api/orders/1 returns 403")), /contains (a status code|a request method|a technical term)/);
  assert.match(bad((t) => t.replace(/> - Problems:.*\n/, "")), /no problem-count line/);
});

test("jargon check: allowed in For developers lines and link targets, caught everywhere else", () => {
  assert.deepEqual(lintAdminLanguage("- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001) returns 500, JSON"), []);
  assert.deepEqual(lintAdminLanguage("- **Screenshot:** [view the screenshot](screenshots/ui/page.png)"), []);
  assert.deepEqual(lintAdminLanguage("The total is $1,050.00 for 80 pens; 500 customers use it; page 404 of the manual."), [], "numbers alone are not jargon");
  for (const bad of ["The page returns HTTP 500.", "It shows a stack trace.", "The API is slow.", "Send a POST request.", "See `config.json`.", "Open src/app.js", "The token is shown.", "The response is null.", "See ISSUE-004 for details.", "The reply was a JSON body.", "Error 404 appears."]) {
    assert.ok(lintAdminLanguage(bad).length > 0, `should flag: ${bad}`);
  }
});

test("lint requires plain-language text for every finding and not-tested entry, and rejects a stale report", () => {
  const fx = makeRunWithData({ findings: [finding({ id: "ISSUE-001", severity: "important" })], notTested: [{ area: "x", reason: "y" }] });
  writeReports(fx.runDir, fx.store);
  let lint = lintReports(fx.runDir);
  assert.equal(lint.ok, false);
  assert.ok(lint.errors.some((e) => /ISSUE-001: no "plain" block/.test(e)));
  assert.ok(lint.errors.some((e) => /not-tested.json: "x" needs a plain/.test(e)));
  assert.ok(lint.errors.some((e) => /no plain-language text yet/.test(e)), "the admin report carries a visible marker, and the consistency check refuses it");

  const good = makeRunWithData();
  writeReports(good.runDir, good.store);
  lint = lintReports(good.runDir);
  assert.deepEqual(lint.errors, [], lint.errors.join("; "));
  // editing the data after building makes the written reports stale
  const f = path.join(good.runDir, "data", "findings.json");
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(f, later, later);
  assert.ok(lintReports(good.runDir).errors.some((e) => /older than the data it is built from/.test(e)));
  // flows and tags
  writeJson(path.join(good.runDir, "data", "coverage.json"), [{ surface: "ui", area: "x", status: "tested", critical_flow: 9 }]);
  writeReports(good.runDir, good.store);
  const lint2 = lintReports(good.runDir);
  assert.ok(lint2.errors.some((e) => /critical_flow 9 is not one of the 5/.test(e)));
  assert.ok(lint2.warnings.some((e) => /Critical journey 1 .* has no coverage row/.test(e)));
});

test("a broken environment is explained in plain words and nothing is called a product problem", () => {
  const fx = makeRunWithData({ findings: [], coverage: [], notTested: [], health: { environment_ok: false, checks: [{ name: 'Web UI "Client Portal" loads', ok: false, detail: "no response: ECONNREFUSED" }, { name: "API base responds", ok: false, detail: "HTTP 503" }] } });
  const { admin } = writeReports(fx.runDir, fx.store);
  assert.match(admin, /^⛔ \*\*Not ready to release:\*\* the test environment has a problem/);
  assert.match(admin, /## The test environment has a problem/);
  assert.match(admin, /- The "Client Portal" did not open\./);
  assert.match(admin, /- The back-end system behind the screens did not respond\./);
  assert.ok(!/ECONNREFUSED|503/.test(admin));
  assert.deepEqual(checkConsistency(fx.runDir).errors, []);
});

test("trend compares with the previous finished run and says plainly what it cannot tell", () => {
  const fx = makeRunWithData();
  const first = writeReports(fx.runDir, fx.store);
  assert.match(first.admin, /first check of this project/);
  finishRun({ home: fx.home, runId: fx.runId, now: new Date("2026-10-30T11:00:00Z") });
  assert.ok(fs.existsSync(path.join(fx.runDir, "ADMIN-REPORT.md")), "run finish writes the admin report");
  const prev = previousRuns(fx.store, "another-run");
  assert.equal(prev.length, 1);
  const model = buildAdminModel(readRunData(fx.runDir), prev);
  const text = model.trend.join("\n");
  assert.match(text, /Last check \(30 October 2026, full check\): 1 critical, 1 important, 1 minor\./);
  assert.match(text, /This check: 1 critical \(same\), 1 important \(same\), 1 minor \(same\)\./);
  assert.match(text, /do not yet track which problems are new/);
  assert.match(text, /Key journeys fully checked: \d of 5 this time, \d of 5 last time\./, "compared by key journeys, which the config fixes");
  assert.ok(!/checked in full/.test(text), "the number of coverage rows is the agent's choice of granularity, not a trend");
  assert.equal(previousRuns(fx.store, fx.runId).length, 0, "the run being reported is never its own predecessor");
  // An older summary without journeys is not compared on a number it never recorded.
  const older = prev.map((p) => ({ ...p, journeys: undefined }));
  assert.ok(!/Key journeys fully checked/.test(buildAdminModel(readRunData(fx.runDir), older).trend.join("\n")));
});

test("HTML export is one self-contained file: no external resources, escaped text, embedded screenshots", () => {
  const fx = makeRunWithData({
    findings: [
      finding({
        id: "ISSUE-001", severity: "critical", evidence: ["evidence/api/e.json", "screenshots/shot.png"],
        plain: { title: 'Total is wrong <script>alert("x")</script> & more', where: "Client Portal → Orders", what_happens: "It shows 1 < 2 & \"quotes\".", who_is_affected: "Everyone", how_to_see_it: ["Open the page."], expected: "Right total", screenshot: "screenshots/shot.png", ticket: "https://tickets.example.test/1" },
      }),
    ],
  });
  writeReports(fx.runDir, fx.store);
  const r = exportAdminHtml(fx.runDir, fx.store);
  const html = fs.readFileSync(r.file, "utf8");
  assert.equal(r.images_embedded, 1);
  assert.match(r.warning, /not masked automatically/);
  assert.match(html, /src="data:image\/png;base64,/);
  assert.ok(!/<script/i.test(html), "no script element, and injected markup is escaped");
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more"));
  assert.ok(!/<link\b|@import|src="https?:|href="(?!https:\/\/tickets\.example\.test)https?:/i.test(html), "nothing is loaded from outside the file");
  assert.ok(html.includes("ISSUE-001") && html.includes("Not ready to release"));
  assert.match(html, /<html lang="en">/);

  const noImg = exportAdminHtml(fx.runDir, fx.store, { embedImages: false, out: path.join(fx.runDir, "plain.html") });
  assert.equal(noImg.images_embedded, 0);
  assert.ok(!fs.readFileSync(noImg.file, "utf8").includes("data:image"));
  // an image path that escapes the run folder is never embedded
  const m = buildAdminModel(readRunData(fx.runDir));
  m.problems[0]!.screenshot = "../../etc/passwd";
  assert.ok(!renderAdminHtml(m, "t", { embed: () => undefined }).includes("data:"));
});

test("every admin problem appears in the HTML with the same severity as the Markdown", () => {
  const fx = makeRunWithData();
  const { model } = writeReports(fx.runDir, fx.store);
  const html = renderAdminHtml(model, "t");
  for (const p of model.problems) assert.ok(html.includes(`id="${p.id}"`) && html.includes(p.title.replace(/'/g, "&#39;")));
  assert.equal((html.match(/class="problem sev-critical"/g) ?? []).length, 1);
  assert.deepEqual(ALL_FLOWS_TESTED.length, 5);
});

test("the report explains its own words and where to get logins, and never points at \"below\" for details that are in another file", () => {
  const fx = makeRunWithData();
  const { admin, model } = writeReports(fx.runDir, fx.store);
  assert.ok(admin.includes(LOGIN_NOTE), "some problem has on-screen steps, so the login note is shown");
  assert.ok(admin.includes(BEHIND_NOTE), "a problem is behind the screens, so that is explained where it first matters");
  assert.match(admin, /## Words used in this report/);
  for (const [word] of GLOSSARY) assert.ok(admin.includes(`- **${word}**:`), `glossary entry ${word}`);
  assert.ok(admin.includes(CANNOT_SEE_ON_SCREEN) && !/details below/.test(admin));
  assert.ok(renderAdminHtml(model, "t").includes("Words used in this report"));
  // with no on-screen steps anywhere there is nothing to log in for
  const none = makeRunWithData({ findings: [finding({ id: "ISSUE-001", severity: "minor", plain: { title: "t", where: "Behind the screens", what_happens: "w", who_is_affected: "a", how_to_see_it: [], expected: "e" } })] });
  const noneAdmin = writeReports(none.runDir, none.store).admin;
  assert.ok(!noneAdmin.includes(LOGIN_NOTE));
  assert.ok(noneAdmin.includes(BEHIND_NOTE));
  assert.deepEqual(lintAdminLanguage(admin), []);
});
