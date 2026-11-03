import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { readJson, writeJson } from "../../core/lib/fsutil.ts";
import { loadBank, looksFlaky, saveTest } from "../../core/lib/bank/bank.ts";
import { loadBugs } from "../../core/lib/memory/bugs.ts";
import { startRun } from "../../core/lib/run.ts";
import type { Finding } from "../../core/lib/report.ts";
import { cli, DEMO_CONFIG, finding, makeProject, repoRoot, tmp, writeFixtureData } from "./helpers.ts";

// ---------------------------------------------------------------------------------------------- a tiny API to test against

interface Behaviour {
  /** page_size=0 answers 400 (fixed) or 500 (the bug). */
  fixed: boolean;
  /** The next N calls to /api/flaky fail, then it answers again (a flaky endpoint). */
  failNext: number;
}
const behaviour: Behaviour = { fixed: false, failNext: 0 };
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/api/auth/login" && req.method === "POST") return send(200, { token: "tok-1" });
  if (url.pathname === "/api/orders") {
    const size = url.searchParams.get("page_size");
    if (size === "0") return send(behaviour.fixed ? 400 : 500, behaviour.fixed ? { error: "page_size must be at least 1" } : { error: "boom" });
    return send(200, { items: [{ id: "o-1" }], total: 1 });
  }
  if (url.pathname === "/api/flaky") {
    if (behaviour.failNext > 0) {
      behaviour.failNext--;
      return send(500, { error: "flaked" });
    }
    return send(200, { ok: true });
  }
  send(404, { error: "no" });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const PORT = (server.address() as AddressInfo).port;
after(() => server.close());

const API_PLAN_PAGE_SIZE = { version: 1, name: "orders-page-size", probes: [{ id: "P1", title: "page_size=0", method: "GET", path: "/orders", query: { page_size: 0 }, role: "admin", expect: { status: "4xx" } }] };
const CARD = { protects: "The orders list validates its page size instead of failing.", fails_when: "A page size of 0 gets a server error instead of a 4xx answer.", not_duplicate: "No other test in the bank sends page_size to the orders list." };

function project(): { home: string; proj: string } {
  const proj = makeProject({ remote: "https://github.com/acme/shop.git" });
  fs.mkdirSync(path.join(proj, ".qa"), { recursive: true });
  // The demo config, pointed at the tiny server: the same safety checks apply (an address that is not local and not confirmed would refuse).
  fs.writeFileSync(path.join(proj, ".qa", "config.md"), DEMO_CONFIG.replaceAll("127.0.0.1:4100", `127.0.0.1:${PORT}`));
  fs.copyFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), path.join(proj, "openapi.yaml"));
  fs.writeFileSync(path.join(proj, ".env.qa"), "QA_ADMIN_USER=admin@lumen.test\nQA_ADMIN_PASS=pw-admin-1234\nQA_ACME1_USER=a1@acme.test\nQA_ACME1_PASS=pw-acme1-1234\n");
  return { home: tmp("qamind-home-"), proj };
}

function startAt(p: { home: string; proj: string }, at: string, findings: Finding[]): { runId: string; runDir: string; store: string } {
  const r = startRun({ cwd: p.proj, mode: "full", kind: "qa-only", host: "test", home: p.home, env: {}, sessionId: `s-${at}`, now: new Date(at) });
  if (r.status !== "ready" || !r.run || !r.project) throw new Error(`run did not start: ${r.status} ${r.message}`);
  writeFixtureData(r.run.dir, { findings });
  return { runId: r.run.id, runDir: r.run.dir, store: r.project.store };
}

const PLAIN = { title: "The orders list fails on an unusual request", where: "Behind the screens (the part that talks to the Admin Portal)", what_happens: "Asking for the orders list in an unusual way makes the system fail instead of giving a clear message.", who_is_affected: "Staff using the orders search.", how_to_see_it: [], expected: "A short, clear message." };
const pageSizeFinding = (id = "ISSUE-001"): Finding => finding({ id, severity: "important", surface: "api", area: "Orders", title: "GET /orders fails with HTTP 500 when page_size=0", plain: PLAIN });

const saveFile = (runDir: string, name: string, body: unknown): string => {
  const f = path.join(runDir, "data", "bank", `${name}.json`);
  writeJson(f, body);
  return `${name}.json`;
};

// ---------------------------------------------------------------------------------------------- saving

test("a test is saved with a value card, refused when it cannot fail, holds a secret, or repeats another", async () => {
  const p = project();
  const r = startAt(p, "2026-10-30T10:00:00Z", [pageSizeFinding()]);
  const ctx = { roles: ["admin", "acme-1"], uis: ["Client Portal"], secretNames: ["QA_ADMIN_USER", "QA_ADMIN_PASS"], knownSecrets: ["pw-admin-1234"], now: new Date("2026-10-30T10:00:00Z") };
  const good = { kind: "api" as const, title: "The orders list answers a page size of zero with a 400", area: "Orders", card: CARD, plan: API_PLAN_PAGE_SIZE };
  const first = saveTest(r.store, good, ctx);
  assert.equal(first.action, "created");
  assert.equal(first.test?.id, "T-001");

  assert.throws(() => saveTest(r.store, { ...good, title: "Another title for the same thing" , card: { ...CARD, protects: "short" } }, ctx), /value card needs "protects"/);
  assert.throws(() => saveTest(r.store, { ...good, title: "A request with no expectation at all", plan: { version: 1, name: "n", probes: [{ id: "P1", title: "t", method: "GET", path: "/orders", role: "admin" }] } }, ctx), /needs expect\.status, or it can never fail/);
  assert.throws(() => saveTest(r.store, { ...good, title: "A request with a made-up role", plan: { version: 1, name: "n", probes: [{ id: "P1", title: "t", method: "GET", path: "/orders", role: "root", expect: { status: 200 } }] } }, ctx), /role "root" is not in the config/);
  assert.throws(() => saveTest(r.store, { ...good, title: "A request with an Authorization header", plan: { version: 1, name: "n", probes: [{ id: "P1", title: "t", method: "GET", path: "/orders", role: "admin", headers: { Authorization: "Bearer abc" }, expect: { status: 200 } }] } }, ctx), /do not put Authorization in a saved test/);
  assert.throws(() => saveTest(r.store, { ...good, title: "A request with a full address in it", plan: { version: 1, name: "n", probes: [{ id: "P1", title: "t", method: "GET", path: "https://example.com/orders", role: "admin", expect: { status: 200 } }] } }, ctx), /relative to the API base address/);
  assert.throws(() => saveTest(r.store, { ...good, title: "A test that carries a password around", plan: { version: 1, name: "n", probes: [{ id: "P1", title: "t", method: "POST", path: "/x", role: "admin", body: { password: "pw-admin-1234" }, expect: { status: 200 } }] } }, ctx), /Refusing to save this test.*password/);
  assert.throws(() => saveTest(r.store, { ...good, title: "A test about a real customer's email", plan: { version: 1, name: "n", probes: [{ id: "P1", title: "t", method: "POST", path: "/x", role: "admin", body: { email: "jane.smith@gmail.com" }, expect: { status: 200 } }] } }, ctx), /Refusing to save this test.*email/);

  // the same check worded differently is a duplicate, and the answer says how to extend instead
  const dup = saveTest(r.store, { ...good, title: "Orders list: page size zero is rejected", card: { ...CARD, not_duplicate: "It is the same request, worded another way for this test." } }, ctx);
  assert.equal(dup.action, "duplicate");
  assert.equal(dup.existing?.id, "T-001");
  assert.match(dup.message, /Extend it instead: save again with extends: "T-001"/);
  assert.equal(loadBank(r.store).tests.length, 1);

  // extending replaces the plan and keeps the test
  const more = { ...API_PLAN_PAGE_SIZE, probes: [...API_PLAN_PAGE_SIZE.probes, { id: "P2", title: "page_size=-1", method: "GET", path: "/orders", query: { page_size: -1 }, role: "admin", expect: { status: "4xx" } }] };
  const ext = saveTest(r.store, { ...good, plan: more, extends: "T-001" }, ctx);
  assert.equal(ext.action, "extended");
  assert.equal(loadBank(r.store).tests[0]?.plan?.probes.length, 2);
  assert.equal(loadBank(r.store).tests[0]?.revisions, 2);

  // a mutating request without the test prefix is warned about
  const warn = saveTest(r.store, { kind: "api", title: "Creating an order answers with a 201 and a total", area: "Orders / create", card: CARD, plan: { version: 1, name: "n", probes: [{ id: "P1", title: "create", method: "POST", path: "/orders", role: "admin", body: { reference: "plain" }, expect: { status: 201 } }] } }, ctx);
  assert.equal(warn.action, "created");
  assert.match(warn.warnings[0] ?? "", /no "QA-" test prefix/);
});

test("a UI test must name real login variables, check something, and stay in the vocabulary", () => {
  const p = project();
  const r = startAt(p, "2026-10-30T10:00:00Z", []);
  const ctx = { roles: ["admin"], uis: ["Client Portal", "Admin Portal"], secretNames: ["QA_ACME1_USER", "QA_ACME1_PASS"], knownSecrets: [], now: new Date() };
  const base = { kind: "ui" as const, title: "A client signs in and sees their orders", area: "Client Portal", ui: "Client Portal", card: CARD };
  const steps = [
    { do: "goto", path: "/login.html" },
    { do: "fill", target: { label: "Email" }, secret: "QA_ACME1_USER" },
    { do: "fill", target: { label: "Password" }, secret: "QA_ACME1_PASS" },
    { do: "click", target: { role: "button", name: "Sign in" } },
    { do: "expect_text", text: "My orders" },
  ];
  assert.equal(saveTest(r.store, { ...base, steps }, ctx).action, "created");
  const bad = (steps: unknown[], re: RegExp, title = "A UI test that is wrong in one way") => assert.throws(() => saveTest(r.store, { ...base, title, steps }, ctx), re);
  bad([{ do: "goto", path: "/a" }, { do: "click", target: { role: "button", name: "Go" } }], /has to check something/, "A UI test that never checks anything");
  bad([{ do: "fill", target: { label: "Email" }, secret: "SOME_OTHER_SECRET" }, { do: "expect_text", text: "x" }], /is not one of the config's login variables/);
  bad([{ do: "fill", target: { label: "Email" }, value: "x", secret: "QA_ACME1_USER" }, { do: "expect_text", text: "x" }], /exactly one of "value"/);
  bad([{ do: "goto", path: "https://evil.example/" }, { do: "expect_text", text: "x" }], /starting with "\/"/);
  bad([{ do: "eval", code: "1" }, { do: "expect_text", text: "x" }], /"do" must be one of/);
  bad([{ do: "click", target: { role: "button", selector: "a" } }, { do: "expect_text", text: "x" }], /exactly one of role, text, label, testid, selector/);
  bad([{ do: "wait", ms: 60000 }, { do: "expect_text", text: "x" }], /at most 3000 ms/);
  assert.throws(() => saveTest(r.store, { ...base, title: "A UI test with an unknown web UI", ui: "Moon Portal", steps }, ctx), /"ui" must be one of the config's web UIs/);
});

// ---------------------------------------------------------------------------------------------- running, fixed, came back

test("the chain: a failing test protects a bug; when the bug is fixed the bank proves it; when it comes back, the run cannot finish until it says so", async () => {
  behaviour.fixed = false;
  const p = project();

  // run 1 finds the bug and saves a test that protects it
  const r1 = startAt(p, "2026-10-30T10:00:00Z", [pageSizeFinding()]);
  const file = saveFile(r1.runDir, "orders-page-size", { kind: "api", title: "The orders list answers a page size of zero with a 400", area: "Orders", card: CARD, from_issue: "ISSUE-001", plan: API_PLAN_PAGE_SIZE });
  const saved = await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", file));
  assert.equal(saved.code, 0, JSON.stringify(saved.json));
  assert.equal(saved.json.id, "T-001");
  assert.equal((await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", file))).json.action, "duplicate", "saving it again is refused as a duplicate");
  assert.match((await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", saveFile(r1.runDir, "bad-issue", { kind: "api", title: "A test tied to a finding that is not here", area: "Orders", card: CARD, from_issue: "ISSUE-099", plan: API_PLAN_PAGE_SIZE })))).json.error, /from_issue ISSUE-099 is not a finding of this run/);
  await cli(p.home, "report", "build", "--run", r1.runId);
  assert.equal((await cli(p.home, "report", "lint", "--run", r1.runId)).code, 0);
  await cli(p.home, "run", "finish", "--run", r1.runId);
  assert.equal(loadBank(r1.store).tests[0]?.protects_bug, "BUG-001", "the test learned which bug it protects when the run finished");

  // run 2: the bug is still there. The bank runs first and the test fails twice; the finding is the same bug, and the lint wants it linked
  const r2 = startAt(p, "2026-10-31T10:00:00Z", [pageSizeFinding()]);
  const ran = await cli(p.home, "tests", "run", "--run", r2.runId);
  assert.equal(ran.code, 1, "a test that fails twice makes the command exit 1");
  assert.equal(ran.json.summary.failed, 1);
  assert.equal(ran.json.needs_attention[0].bug, "BUG-001");
  assert.match(ran.json.needs_attention[0].detail, /expected HTTP "4xx", got 500/);
  const results = readJson<{ results: Array<{ attempts: number }> }>(path.join(r2.runDir, "data", "bank-results.json"));
  assert.equal(results?.results[0]?.attempts, 2, "a failure is retried once before it counts");
  await cli(p.home, "report", "build", "--run", r2.runId);
  const unaccounted = await cli(p.home, "report", "lint", "--run", r2.runId);
  assert.equal(unaccounted.code, 1);
  assert.match(unaccounted.json.errors.join("\n"), /Bank test T-001 .* failed twice and nothing in this run accounts for it/);
  writeJson(path.join(r2.runDir, "data", "findings.json"), [{ ...pageSizeFinding(), bank_tests: ["T-001"] }]);
  await cli(p.home, "report", "build", "--run", r2.runId);
  const ok2 = await cli(p.home, "report", "lint", "--run", r2.runId);
  assert.equal(ok2.code, 0, JSON.stringify(ok2.json.errors));
  const fin2 = await cli(p.home, "run", "finish", "--run", r2.runId);
  assert.deepEqual(fin2.json.lifecycle, { new: 0, still_open: 1, regressed: 0, accepted: 0, fixed: 0, not_rechecked: 0 });
  assert.match(fs.readFileSync(path.join(r2.runDir, "TECHNICAL-REPORT.md"), "utf8"), /## Test bank\n\nThe saved checks ran first[^\n]*\*\*0\*\* passed[^\n]*\*\*1\*\* failed/);

  // run 3: the bug was fixed. No finding, no re-check written: the passing test is the proof
  behaviour.fixed = true;
  const r3 = startAt(p, "2026-11-01T10:00:00Z", []);
  const ran3 = await cli(p.home, "tests", "run", "--run", r3.runId);
  assert.equal(ran3.code, 0, JSON.stringify(ran3.json));
  assert.equal(ran3.json.summary.passed, 1);
  assert.deepEqual(ran3.json.covered_areas, ["Orders"]);
  await cli(p.home, "report", "build", "--run", r3.runId);
  const ok3 = await cli(p.home, "report", "lint", "--run", r3.runId);
  assert.equal(ok3.code, 0, JSON.stringify(ok3.json.errors));
  const fin3 = await cli(p.home, "run", "finish", "--run", r3.runId);
  assert.equal(fin3.json.lifecycle.fixed, 1);
  const bug = loadBugs(r1.store).bugs[0];
  assert.equal(bug?.status, "fixed");
  assert.match(bug?.fixed?.how ?? "", /The saved check T-001 for this problem passes now/);
  assert.match(fs.readFileSync(path.join(r3.runDir, "ADMIN-REPORT.md"), "utf8"), /## Fixed since the last check\n\n- The orders list fails on an unusual request: the saved automatic check for it passes now\./);

  // run 4: the bug is back. The bank fails it, the agent reports it, and the report calls it "came back"
  behaviour.fixed = false;
  const r4 = startAt(p, "2026-11-02T10:00:00Z", [{ ...pageSizeFinding(), bank_tests: ["T-001"] }]);
  assert.equal((await cli(p.home, "tests", "run", "--run", r4.runId)).code, 1);
  await cli(p.home, "report", "build", "--run", r4.runId);
  const ok4 = await cli(p.home, "report", "lint", "--run", r4.runId);
  assert.equal(ok4.code, 0, JSON.stringify(ok4.json.errors));
  const fin4 = await cli(p.home, "run", "finish", "--run", r4.runId);
  assert.equal(fin4.json.lifecycle.regressed, 1);
  const admin = fs.readFileSync(path.join(r4.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(admin, /problem came back after being fixed: The orders list fails on an unusual request/);
  assert.match(admin, /\*\*History:\*\* Came back: this problem was fixed on \d+ \w+ 2026 and has now been found again\./);
  assert.match(fs.readFileSync(path.join(r4.runDir, "TECHNICAL-REPORT.md"), "utf8"), /- \*\*Bug:\*\* BUG-001 · \*\*Came back\*\*.* · bank test T-001/);
  assert.equal(loadBugs(r1.store).bugs[0]?.status, "regressed");
  assert.match(admin.split("\n")[0] ?? "", /Ready with risks|Not ready/, "a bug that came back never leaves the verdict at Ready");
});

test("a failing test for a bug the owner accepted does not stop the run: the owner decided to live with it", async () => {
  behaviour.fixed = false;
  const p = project();
  const r1 = startAt(p, "2026-10-30T10:00:00Z", [pageSizeFinding()]);
  const file = saveFile(r1.runDir, "orders-page-size", { kind: "api", title: "The orders list answers a page size of zero with a 400", area: "Orders", card: CARD, from_issue: "ISSUE-001", plan: API_PLAN_PAGE_SIZE });
  assert.equal((await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", file))).code, 0);
  await cli(p.home, "report", "build", "--run", r1.runId);
  await cli(p.home, "run", "finish", "--run", r1.runId);
  assert.equal((await cli(p.home, "feedback", "add", "BUG-001", "wont-fix", "--note", "Planned for the rewrite.", "--project", p.proj, "--by", "Sam Rivera")).code, 0);

  const r2 = startAt(p, "2026-10-31T10:00:00Z", []);
  assert.equal((await cli(p.home, "tests", "run", "--run", r2.runId)).code, 1, "the test fails: the bug is still there");
  await cli(p.home, "report", "build", "--run", r2.runId);
  const lint = await cli(p.home, "report", "lint", "--run", r2.runId);
  assert.equal(lint.code, 0, JSON.stringify(lint.json.errors));
  const fin = await cli(p.home, "run", "finish", "--run", r2.runId);
  assert.equal(fin.code, 0);
  assert.equal(loadBugs(r1.store).bugs[0]?.status, "accepted", "still accepted, not reopened");
  assert.match(fs.readFileSync(path.join(r2.runDir, "TECHNICAL-REPORT.md"), "utf8"), /\*\*1\*\* failed/, "the report still shows the test failing");
});

test("an API that stops answering is neither a pass nor a failure: the tests are skipped with the reason, and the rest are not even tried", async () => {
  const p = project();
  const r1 = startAt(p, "2026-10-30T10:00:00Z", []);
  for (const [n, path_] of [[1, "/orders"], [2, "/flaky"]] as const) {
    const plan = { version: 1, name: `p${n}`, probes: [{ id: "P1", title: `listing ${n}`, method: "GET", path: path_, role: "anonymous", expect: { status: 200 } }] };
    assert.equal((await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", saveFile(r1.runDir, `d${n}`, { kind: "api", title: `The ${path_} endpoint answers with 200 (${n})`, area: `Area ${n}`, card: { ...CARD, not_duplicate: `Only this test checks ${path_} as number ${n}.` }, plan })))).code, 0);
  }
  await cli(p.home, "run", "finish", "--run", r1.runId);
  const { bankContextStandalone } = await import("../../core/lib/bank/service.ts");
  const { runBank } = await import("../../core/lib/bank/runner.ts");
  let calls = 0;
  const ctx = { ...bankContextStandalone(p.home, p.proj, new Date("2026-10-31T10:00:00Z")), fetchImpl: (() => (calls++, Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:4100")))) as unknown as typeof fetch };
  const results = await runBank(ctx);
  assert.equal(results.passed, 0, "a test whose request got no answer must never pass");
  assert.equal(results.failed, 0, "and it is not a failure of the product either");
  assert.equal(results.skipped, 2);
  assert.match(results.results[0]?.detail ?? "", /^The API did not answer \(connect ECONNREFUSED[^)]*\)\. Nothing was concluded about the product/);
  assert.equal(results.results[1]?.detail, results.results[0]?.detail, "the second test is skipped for the same reason without being tried");
  assert.ok(calls <= 4, `only the first test was tried (${calls} requests)`);
  assert.deepEqual(loadBank(p.proj ? ctx.store : "").tests.map((t) => t.stats.runs), [0, 0], "nothing is recorded in the tests' statistics");
});

// ---------------------------------------------------------------------------------------------- the run must leave something behind

function startOpen(p: { home: string; proj: string }, at: string, findings: Finding[], trigger: "manual" | "auto" = "manual"): { runId: string; runDir: string; store: string } {
  const r = startRun({ cwd: p.proj, mode: "full", kind: "qa-only", host: "test", home: p.home, env: {}, sessionId: `s-${at}`, trigger, now: new Date(at) });
  if (r.status !== "ready" || !r.run || !r.project) throw new Error(`run did not start: ${r.status} ${r.message}`);
  writeFixtureData(r.run.dir, { findings, bankSkip: false });
  return { runId: r.run.id, runDir: r.run.dir, store: r.project.store };
}

test("a run with serious findings cannot finish until it has saved a test or said why none can be written", async () => {
  const p = project();
  const r = startOpen(p, "2026-10-30T10:00:00Z", [pageSizeFinding()]);
  await cli(p.home, "report", "build", "--run", r.runId);
  const refused = await cli(p.home, "run", "finish", "--run", r.runId);
  assert.equal(refused.code, 1);
  assert.match(refused.json.error, /found 1 critical or important problem\(s\) \(ISSUE-001\) and saved no test for any of them/);
  assert.match(refused.json.error, /bank_save_test .* or, if none of them can be written as an API or UI test, say why in .*bank-skip\.json/);
  assert.ok(fs.existsSync(path.join(p.proj, ".qa", "reports", r.runId)), "nothing was changed by the refusal; the run is still open");

  // a reason that is not a sentence does not count
  writeJson(path.join(r.runDir, "data", "bank-skip.json"), { reason: "n/a" });
  assert.match((await cli(p.home, "run", "finish", "--run", r.runId)).json.error, /too short to count/);

  // saving a test is the way through
  const file = saveFile(r.runDir, "orders-page-size", { kind: "api", title: "The orders list answers a page size of zero with a 400", area: "Orders", card: CARD, from_issue: "ISSUE-001", plan: API_PLAN_PAGE_SIZE });
  fs.rmSync(path.join(r.runDir, "data", "bank-skip.json"));
  assert.equal((await cli(p.home, "tests", "save", "--run", r.runId, "--file", path.join(r.runDir, "data", "bank", file))).code, 0);
  const fin = await cli(p.home, "run", "finish", "--run", r.runId);
  assert.equal(fin.code, 0, JSON.stringify(fin.json));
  assert.deepEqual(fin.json.bank, { saved: 1 });
});

test("or by saying why in words: the reason is kept in the summary and shown in the report", async () => {
  const p = project();
  const r = startOpen(p, "2026-10-30T10:00:00Z", [pageSizeFinding()]);
  writeJson(path.join(r.runDir, "data", "bank-skip.json"), { reason: "The problem is a slow screen, which a request or a click cannot check." });
  await cli(p.home, "report", "build", "--run", r.runId);
  const fin = await cli(p.home, "run", "finish", "--run", r.runId);
  assert.equal(fin.code, 0, JSON.stringify(fin.json));
  assert.equal(fin.json.bank.saved, 0);
  assert.equal(fin.json.bank.skipped_reason, "The problem is a slow screen, which a request or a click cannot check.");
  assert.match(fs.readFileSync(path.join(r.runDir, "TECHNICAL-REPORT.md"), "utf8"), /- Test bank: no test was saved from this run\. Why: The problem is a slow screen/);
});

test("it is not asked of a run that could not: auto-QA, nothing serious found, time ran out, a broken environment", async () => {
  const p = project();
  const auto = startOpen(p, "2026-10-30T10:00:00Z", [pageSizeFinding()], "auto");
  await cli(p.home, "report", "build", "--run", auto.runId);
  assert.equal((await cli(p.home, "run", "finish", "--run", auto.runId)).code, 0, "an auto-QA run is quick feedback, with its own small budget");

  const minor = startOpen(p, "2026-10-31T10:00:00Z", [{ ...pageSizeFinding(), severity: "minor" }]);
  await cli(p.home, "report", "build", "--run", minor.runId);
  assert.equal((await cli(p.home, "run", "finish", "--run", minor.runId)).code, 0, "only critical and important problems ask for a test");

  const late = startOpen(p, "2026-11-01T10:00:00Z", [pageSizeFinding()]);
  const markerFile = path.join(late.store, "state", "run-marker.json");
  writeJson(markerFile, { ...(readJson<Record<string, unknown>>(markerFile) as Record<string, unknown>), budget: { time_minutes: 1, deadline: new Date(Date.now() - 1000).toISOString(), source: "test" } });
  await cli(p.home, "report", "build", "--run", late.runId);
  assert.equal((await cli(p.home, "run", "finish", "--run", late.runId)).code, 0, "a run whose time ran out is not asked for more work");

  const down = startOpen(p, "2026-11-02T10:00:00Z", [pageSizeFinding()]);
  writeJson(path.join(down.runDir, "data", "health.json"), { environment_ok: false, ran_at: "x", checks: [{ name: "API base responds", ok: false, detail: "no response (twice)" }] });
  writeJson(path.join(down.runDir, "data", "findings.json"), []);
  await cli(p.home, "report", "build", "--run", down.runId);
  assert.equal((await cli(p.home, "run", "finish", "--run", down.runId)).code, 0, "an environment problem has no findings to protect");
});

// ---------------------------------------------------------------------------------------------- flakiness, budget, quarantine

test("a test that fails and passes on the retry is flaky; flaky tests are set aside and not run until released", async () => {
  const p = project();
  const r1 = startAt(p, "2026-10-30T10:00:00Z", []);
  const flaky = { version: 1, name: "flaky", probes: [{ id: "P1", title: "the flaky endpoint", method: "GET", path: "/flaky", role: "admin", expect: { status: 200 } }] };
  const save = await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", saveFile(r1.runDir, "flaky", { kind: "api", title: "The flaky endpoint answers 200", area: "Flaky", card: CARD, plan: flaky })));
  assert.equal(save.code, 0, JSON.stringify(save.json));
  await cli(p.home, "run", "finish", "--run", r1.runId);

  const seen: string[] = [];
  for (const [i, at] of ["2026-10-31T10:00:00Z", "2026-11-01T10:00:00Z", "2026-11-02T10:00:00Z"].entries()) {
    const r = startAt(p, at, []);
    behaviour.failNext = 1; // the first request of each run fails, the next answers: a flaky endpoint
    const ran = await cli(p.home, "tests", "run", "--run", r.runId);
    assert.equal(ran.code, 0, `a pass on the retry is a pass (run ${i + 1}): ${JSON.stringify(ran.json).slice(0, 300)}`);
    seen.push(ran.json.needs_attention[0]?.status ?? "none");
    await cli(p.home, "run", "finish", "--run", r.runId);
  }
  assert.deepEqual(seen, ["flaky-passed", "flaky-passed", "quarantined"], "two retry-passes in a row set it aside; the third run does not run it");
  const test1 = loadBank(r1.store).tests[0];
  assert.equal(test1?.status, "quarantined");
  assert.match(test1?.quarantine?.reason ?? "", /passed only on a retry in 2 of its last 2 runs/);
  assert.equal(looksFlaky({ history: ["p", "p", "x"] }), undefined);

  const status = await cli(p.home, "tests", "status", "--project", p.proj);
  assert.equal(status.json.summary.quarantined, 1);
  assert.equal(status.json.tests[0].flaky, 2);

  // it is not run, and the report says so; releasing it starts its history again
  const r5 = startAt(p, "2026-11-03T10:00:00Z", []);
  const ran5 = await cli(p.home, "tests", "run", "--run", r5.runId);
  assert.equal(ran5.json.summary.quarantined, 1);
  assert.equal(ran5.json.summary.passed, 0);
  const rel = await cli(p.home, "tests", "unquarantine", "T-001", "--project", p.proj);
  assert.equal(rel.json.status, "active");
  assert.deepEqual(loadBank(r1.store).tests[0]?.stats.history, []);
  behaviour.failNext = 0;
});

test("when the time budget runs out the rest of the bank is skipped, and says so", async () => {
  const p = project();
  const r1 = startAt(p, "2026-10-30T10:00:00Z", []);
  for (const n of [1, 2]) {
    const plan = { version: 1, name: `p${n}`, probes: [{ id: "P1", title: `listing ${n}`, method: "GET", path: n === 1 ? "/orders" : "/flaky", role: "admin", expect: { status: 200 } }] };
    assert.equal((await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", saveFile(r1.runDir, `t${n}`, { kind: "api", title: `The orders list page number ${n} answers 200`, area: `Orders ${n}`, card: { ...CARD, not_duplicate: `Page ${n} is checked in this test only, and none other.` }, plan })))).code, 0);
  }
  await cli(p.home, "run", "finish", "--run", r1.runId);
  const r2 = startAt(p, "2026-10-31T10:00:00Z", []);
  // a deadline that has already passed, as the marker would carry it
  const markerFile = path.join(r2.store, "state", "run-marker.json");
  const marker = readJson<Record<string, unknown>>(markerFile) as Record<string, unknown>;
  writeJson(markerFile, { ...marker, budget: { time_minutes: 1, deadline: new Date(Date.now() - 1000).toISOString(), source: "test" } });
  const ran = await cli(p.home, "tests", "run", "--run", r2.runId);
  assert.equal(ran.json.summary.skipped, 2);
  assert.equal(ran.json.summary.budget_reached, true);
  assert.ok(ran.json.needs_attention.every((r: { detail: string }) => r.detail === "time budget reached"));
});

// ---------------------------------------------------------------------------------------------- standalone, owner commands, export

test("the bank can run on its own (/qa-tests run), under the same config checks, and the owner's commands need the owner", async () => {
  behaviour.fixed = true;
  const p = project();
  const r1 = startAt(p, "2026-10-30T10:00:00Z", []);
  await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", saveFile(r1.runDir, "a", { kind: "api", title: "The orders list answers a page size of zero with a 400", area: "Orders", card: CARD, plan: API_PLAN_PAGE_SIZE })));
  await cli(p.home, "run", "finish", "--run", r1.runId);

  const alone = await cli(p.home, "tests", "run", "--project", p.proj);
  assert.equal(alone.code, 0, JSON.stringify(alone.json).slice(0, 400));
  assert.equal(alone.json.summary?.passed, 1, JSON.stringify(alone.json).slice(0, 400));
  const where = path.join(p.proj, ".qa", "bank-runs");
  assert.equal(fs.readdirSync(where).length, 1, "its results are in a folder of their own, not in a run's reports");
  assert.equal(readJson<{ passed: number }>(path.join(where, fs.readdirSync(where)[0] as string, "data", "bank-results.json"))?.passed, 1);
  assert.equal(fs.readdirSync(path.join(p.proj, ".qa", "reports")).length, 1, "and it did not add to the run history");

  // a config that is not usable refuses, as `run start` does
  fs.writeFileSync(path.join(p.proj, ".qa", "config.md"), DEMO_CONFIG.replaceAll("127.0.0.1:4100", "shop.example.com").replace("confirmed_non_production: false", "confirmed_non_production: false"));
  const refused = await cli(p.home, "tests", "run", "--project", p.proj);
  assert.equal(refused.code, 1);
  assert.match(refused.json.error, /The config is not usable/);

  // retiring moves a test to the archive, with the reason
  assert.match((await cli(p.home, "tests", "retire", "T-001", "--project", p.proj, "--reason", "no")).json.error, /Say why the test is retired/);
  const retired = await cli(p.home, "tests", "retire", "T-001", "--project", p.proj, "--reason", "The page size rule was removed on purpose.");
  assert.equal(retired.json.status, "retired");
  assert.equal(loadBank(r1.store).tests.length, 0);
  assert.ok(fs.existsSync(path.join(r1.store, "memory", "archive", "test-bank.jsonl")));
});

test("export writes real Playwright tests only with a yes, never overwrites, holds no password, and the files are valid", async () => {
  const p = project();
  const r1 = startAt(p, "2026-10-30T10:00:00Z", []);
  await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", saveFile(r1.runDir, "a", { kind: "api", title: "The orders list answers a page size of zero with a 400", area: "Orders", card: CARD, plan: { ...API_PLAN_PAGE_SIZE, probes: [{ ...API_PLAN_PAGE_SIZE.probes[0], expect: { status: "4xx", json: [{ path: "$.error", matches: "page_size" }], body_not_contains: "stack" } }] } })));
  await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", saveFile(r1.runDir, "b", { kind: "ui", title: "A client signs in and sees their orders", area: "Client Portal", ui: "Client Portal", card: { ...CARD, not_duplicate: "It is the only test that signs a client in through the screen." }, steps: [{ do: "goto", path: "/login.html" }, { do: "fill", target: { label: "Email" }, secret: "QA_ACME1_USER" }, { do: "fill", target: { label: "Password" }, secret: "QA_ACME1_PASS" }, { do: "click", target: { role: "button", name: "Sign in" } }, { do: "expect_text", text: "My orders" }, { do: "expect_url", contains: "/my-orders.html" }] })));
  await cli(p.home, "run", "finish", "--run", r1.runId);

  const preview = await cli(p.home, "tests", "export", "--project", p.proj);
  assert.equal(preview.code, 0, JSON.stringify(preview.json));
  assert.equal(preview.json.written, false);
  assert.equal(preview.json.dir, "tests/qamind");
  assert.equal(fs.existsSync(path.join(p.proj, "tests", "qamind")), false, "a preview writes nothing");
  assert.match(preview.json.note, /Preview only/);

  const done = await cli(p.home, "tests", "export", "--project", p.proj, "--yes");
  assert.equal(done.json.written, true);
  const files = fs.readdirSync(path.join(p.proj, "tests", "qamind")).sort();
  assert.equal(files.length, 2);
  for (const f of files) {
    const abs = path.join(p.proj, "tests", "qamind", f);
    const code = fs.readFileSync(abs, "utf8");
    assert.match(code, /^\/\/ Generated by QAMind from test bank entry T-00\d\./);
    assert.ok(!code.includes("pw-admin-1234") && !code.includes("pw-acme1-1234") && !code.includes("admin@lumen.test"), "no credential value is written");
    const syntax = spawnSync(process.execPath, ["--check", abs], { encoding: "utf8" });
    assert.equal(syntax.status, 0, `${f} is valid TypeScript: ${syntax.stderr}`);
  }
  const api = fs.readFileSync(path.join(p.proj, "tests", "qamind", files.find((f) => f.startsWith("t-001")) as string), "utf8");
  assert.match(api, /QA_ADMIN_USER/, "logins come from the variables the config names");
  assert.match(api, /statusOk\(res\.status\(\), "4xx"\)/);
  assert.match(api, /toMatch\(new RegExp\("page_size"\)\)/);
  const ui = fs.readFileSync(path.join(p.proj, "tests", "qamind", files.find((f) => f.startsWith("t-002")) as string), "utf8");
  assert.match(ui, /fill\(secret\("QA_ACME1_USER"\)\)/);
  assert.match(ui, /getByRole\("button", \{ name: "Sign in" \}\)/);

  const again = await cli(p.home, "tests", "export", "--project", p.proj, "--yes");
  assert.equal(again.json.skipped_existing.length, 2, "an existing file is never overwritten");
  assert.match((await cli(p.home, "tests", "export", "--project", p.proj, "--dir", "../outside", "--yes")).json.error, /--dir must be a folder inside the project/);
  assert.match((await cli(p.home, "tests", "export", "--project", p.proj, "--ids", "T-099")).json.error, /No such test: T-099/);
});

test("memory_get_context tells the agent what the bank holds, and the hook keeps a run from exporting, retiring or quarantining", async () => {
  const p = project();
  const r1 = startAt(p, "2026-10-30T10:00:00Z", []);
  await cli(p.home, "tests", "save", "--run", r1.runId, "--file", path.join(r1.runDir, "data", "bank", saveFile(r1.runDir, "a", { kind: "api", title: "The orders list answers a page size of zero with a 400", area: "Orders", card: CARD, plan: API_PLAN_PAGE_SIZE })));
  const ctx = await cli(p.home, "memory", "context", "--run", r1.runId);
  assert.equal(ctx.json.bank.active, 1);
  assert.deepEqual(ctx.json.bank.areas, { Orders: 1 });
  assert.deepEqual(ctx.json.bank.by_kind, { api: 1, ui: 0 });

  const { decidePreToolUse } = await import("../../core/lib/hooks.ts");
  const at = new Date("2026-10-30T10:30:00Z");
  const bash = (command: string) => decidePreToolUse({ session_id: "s-2026-10-30T10:00:00Z", cwd: p.proj, tool_name: "Bash", tool_input: { command } }, p.home, [], at);
  for (const c of ["qamind tests retire T-001 --reason x", "qamind tests quarantine T-001", "qamind tests unquarantine T-001"]) assert.equal(bash(c)?.decision, "deny", c);
  assert.match(bash("qamind tests export --yes")?.reason ?? "", /never writes into the project/);
  for (const c of ["qamind tests run --run run-1", "qamind tests status", "qamind tests prune", "qamind tests save --run run-1 --file a.json"]) assert.equal(bash(c), null, c);
});
