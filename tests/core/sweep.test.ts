import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, test } from "node:test";
import { detectChromeChannel } from "../../core/lib/browserdetect.ts";
import { engineStatus, findPlaywright } from "../../core/lib/browsers.ts";
import { checkConfigText, policyFromConfig } from "../../core/lib/config.ts";
import type { QamindConfig } from "../../core/lib/config.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { loadPerf, recordPerf } from "../../core/lib/perf/store.ts";
import { contextFrom } from "../../core/lib/privacy.ts";
import { lintCoverage } from "../../core/lib/coverage-report.ts";
import { mergeSweeps, perfFindings, runSweep, signalsFromProbe } from "../../core/lib/sweep/engine.ts";
import type { SweepContext } from "../../core/lib/sweep/engine.ts";
import { loadSweepPages, matrixFor, sweepPagesFile, validateSweepPages } from "../../core/lib/sweep/pages.ts";
import { describeScope, groupPerf, groupSignals } from "../../core/lib/sweep/results.ts";
import type { PerfFinding, Visit } from "../../core/lib/sweep/results.ts";
import { acceptBaselines, baselineStatus } from "../../core/lib/sweep/service.ts";
import { projectScope } from "../../core/lib/memory/service.ts";
import { cli, DEMO_CONFIG, DEMO_ENV, makeConfiguredProject, makeRunWithData, repoRoot, tmp, withConfigYaml } from "./helpers.ts";

// The page sweep (spec 13.9 to 13.11): which browsers and sizes each mode covers, the pages file, grouping across browsers, then a real browser against a small site
// with a mobile-only overflow, a slow page, a dynamic region, a sign-in, and a baseline.

const config = (extra = ""): QamindConfig => {
  const c = checkConfigText(extra ? withConfigYaml(extra) : DEMO_CONFIG, { projectRoot: makeConfiguredProject(), env: DEMO_ENV }).config;
  assert.ok(c);
  return c;
};

test("each mode covers what the spec says, and a choice on the command line overrides it", () => {
  const c = config("browsers: [chromium, webkit, firefox]");
  const names = (m: ReturnType<typeof matrixFor>) => [m.browsers.join("+"), m.viewports.map((v) => v.name).join("+")];
  assert.deepEqual(names(matrixFor("diff", c)), ["chromium", "desktop"]);
  assert.deepEqual(names(matrixFor("ticket", c)), ["chromium", "desktop"]);
  assert.deepEqual(names(matrixFor("quick", c)), ["chromium", "desktop+mobile"]);
  assert.deepEqual(names(matrixFor("regression", c)), ["chromium", "desktop+mobile"]);
  assert.deepEqual(names(matrixFor("full", c)), ["chromium+webkit+firefox", "desktop+mobile"]);
  assert.deepEqual(names(matrixFor("full", c, { browsers: ["webkit"], viewports: ["mobile"] })), ["webkit", "mobile"]);
  assert.throws(() => matrixFor("full", c, { browsers: ["opera"] }), /Not a browser: opera/);
  assert.throws(() => matrixFor("full", c, { viewports: ["watch"] }), /Not a configured screen size: watch/);
  // a project that configures only a tablet still gets a sensible quick matrix
  assert.deepEqual(names(matrixFor("quick", config("viewports:\n  - { name: tablet, width: 768, height: 1024 }"))), ["chromium", "tablet"]);
});

test("the pages file is checked against the config: UIs, roles, paths, steps and sign-ins", () => {
  const c = config();
  const good = { logins: { "acme-1": [{ do: "goto", path: "/index.html" }, { do: "fill", target: { label: "Email" }, secret: "QA_ACME1_USER" }, { do: "fill", target: { label: "Password" }, secret: "QA_ACME1_PASS" }, { do: "click", target: { role: "button", name: "Sign in" } }, { do: "expect_url", contains: "my-orders" }] }, pages: [{ id: "my-orders", title: "My orders", ui: "Client Portal", role: "acme-1", path: "/my-orders.html" }, { id: "login", title: "Sign in", ui: "Client Portal", path: "/index.html", steps: [{ do: "click", target: { text: "Forgot password" } }] }] };
  const ok = validateSweepPages(good, c);
  assert.equal(ok.ok, true, ok.errors.join("; "));
  assert.equal(ok.file?.pages.length, 2);

  const bad = validateSweepPages({
    logins: { ghost: [{ do: "goto", path: "/" }, { do: "expect_url", contains: "x" }], "acme-1": [{ do: "fill", target: { label: "Password" }, secret: "QA_ADMIN_PASS" }, { do: "expect_url", contains: "x" }] },
    pages: [
      { id: "Bad Id", title: "", ui: "Nope", path: "https://prod.example.com/x" },
      { id: "dup", title: "A", ui: "Client Portal", path: "/a" },
      { id: "dup", title: "B", ui: "Client Portal", path: "/b" },
      { id: "wrong-ui", title: "W", ui: "Admin Portal", role: "acme-1", path: "/w" },
      { id: "no-role", title: "R", ui: "Client Portal", role: "ghost", path: "/r" },
      { id: "signs-in", title: "S", ui: "Client Portal", path: "/s", steps: [{ do: "fill", target: { label: "Password" }, secret: "QA_ACME1_PASS" }] },
    ],
  }, c);
  assert.equal(bad.ok, false);
  const text = bad.errors.join("\n");
  for (const re of [/"id" must be short lowercase/, /"title" is a short name/, /ui "Nope" is not in the config's web_uis/, /not a full address/, /the id "dup" is used twice/, /role "acme-1" signs in to "Client Portal", not "Admin Portal"/, /role "ghost" is not in the config/, /a page's own steps cannot use a login variable/, /logins\.ghost: not a role in the config/, /"QA_ADMIN_PASS" is not acme-1's login variable/]) assert.match(text, re);
  assert.equal(validateSweepPages({ pages: [] }, c).ok, false);
  assert.equal(validateSweepPages([], c).ok, false);
  assert.equal(validateSweepPages({ pages: Array.from({ length: 41 }, (_, i) => ({ id: `p${i}`, title: "t", ui: "Client Portal", path: "/p" })) }, c).ok, false);
  assert.match(loadSweepPages(tmp(), c).errors.join(), /No data\/sweep-pages\.json in the run folder/);
});

const visit = (over: Partial<Visit>): Visit => ({ page: "p", title: "Order", ui: "Client Portal", browser: "chromium", viewport: "desktop", width: 1366, height: 768, url: "http://x/p", requests: 3, signals: [], ...over });

test("identical signals are grouped across browsers and sizes, and each group says where it happens", () => {
  const sig = (kind: Visit["signals"][number]["kind"], key: string, detail = key) => ({ kind, key, detail });
  const visits = [
    visit({ browser: "chromium", viewport: "desktop", signals: [sig("unnamed-control", "select#p")] }),
    visit({ browser: "chromium", viewport: "mobile", signals: [sig("unnamed-control", "select#p"), sig("scrolls-sideways", "page", "555px wide in 390px"), sig("covered-element", "tr#1 < div.toolbar")] }),
    visit({ browser: "webkit", viewport: "desktop", signals: [sig("unnamed-control", "select#p"), sig("bad-text", "Invalid Date", "Placed on Invalid Date")] }),
    visit({ browser: "webkit", viewport: "mobile", signals: [sig("unnamed-control", "select#p"), sig("scrolls-sideways", "page", "555px wide in 390px"), sig("bad-text", "Invalid Date", "Placed on Invalid Date"), sig("covered-element", "tr#1 < div.toolbar")] }),
    visit({ page: "other", browser: "chromium", viewport: "desktop", error: "could not be visited", signals: [sig("bad-text", "x")] }),
  ];
  const groups = groupSignals(visits);
  const scope = (kind: string) => groups.find((g) => g.kind === kind)?.scope;
  assert.equal(scope("unnamed-control"), "every browser and screen size that was checked");
  assert.equal(scope("scrolls-sideways"), "only at mobile");
  assert.equal(scope("bad-text"), "only in webkit");
  assert.equal(scope("covered-element"), "only at mobile");
  assert.equal(groups.length, 4, "one group per problem, however many browsers show it; a page that could not be visited adds none");
  assert.equal(groups.find((g) => g.kind === "scrolls-sideways")?.seen_on.length, 2);
  assert.equal(describeScope([{ browser: "webkit", viewport: "mobile" }], [{ browser: "chromium", viewport: "desktop" }, { browser: "webkit", viewport: "mobile" }, { browser: "webkit", viewport: "desktop" }, { browser: "chromium", viewport: "mobile" }]), "only in webkit only at mobile");
  assert.equal(describeScope([{ browser: "chromium", viewport: "desktop" }], [{ browser: "chromium", viewport: "desktop" }]), "chromium at desktop");
});

test("what the page audit and the probe found becomes signals a developer can act on", () => {
  const probe = { audit: { pageScrollsSideways: { scrollWidth: 555, viewportWidth: 390, overflowBy: 165 }, controlsOffscreen: [{ element: "button#submit-order \"Place order\"", left: 435, right: 555, viewportWidth: 390 }], coveredElements: [{ element: "tr \"PO-4430\"", coveredBy: "div.toolbar" }], brokenImages: ["http://x/logo.png?token=abc"], unnamedControls: [{ element: "input#search" }], imagesMissingAlt: ["img#hero"], clippedText: ["td.text-cell (text is 300px wide in a 144px box)"], rtlTextInLtrContainer: [{ element: "td.text-cell" }] }, badText: [{ text: "Placed on Invalid Date", match: "Invalid Date" }], timing: null, fcp: null, lcp: null, cls: null, height: 900 };
  const s = signalsFromProbe(probe, 390);
  assert.deepEqual(s.map((x) => x.kind), ["scrolls-sideways", "control-offscreen", "covered-element", "broken-image", "unnamed-control", "image-missing-alt", "clipped-text", "rtl-in-ltr", "bad-text"]);
  assert.match(s[0]?.detail ?? "", /555px wide in a 390px window, so it scrolls sideways \(165px too wide\)/);
  assert.match(s[3]?.detail ?? "", /^An image did not load: http:\/\/x\/logo\.png\?…$/, "a token in the address is not copied");
  assert.equal(signalsFromProbe({ ...probe, audit: null, badText: [] }, 390).length, 0);
});

test("slow pages and pages that got slower are told apart, in plain words, and a page that never settled is not measured", () => {
  const c = config("performance:\n  pages: { \"/reports.html\": 5000 }");
  const history = { series: { "page|orders|admin|chromium|desktop": [{ ms: 1000, run: "r1", at: "2026-10-27T10:00:00Z" }, { ms: 1100, run: "r2", at: "2026-10-28T10:00:00Z" }] } };
  const found = perfFindings([
    visit({ page: "reports", title: "Reports", role: "admin", url: "http://127.0.0.1:4101/reports.html", settled_ms: 4100 }), // under its own 5000 budget
    visit({ page: "home", title: "Home", url: "http://127.0.0.1:4101/home.html", settled_ms: 4200 }), // over the default 3000
    visit({ page: "orders", title: "Orders", role: "admin", url: "http://127.0.0.1:4101/orders.html", settled_ms: 2400 }), // under budget but twice as slow
    visit({ page: "x", title: "Never", url: "http://x/x.html", settled_ms: 15000, signals: [{ kind: "never-settled", detail: "d", key: "page" }] }),
    visit({ page: "y", title: "Broken", url: "http://x/y.html", error: "could not be visited" }),
  ], c, history);
  assert.deepEqual(found.map((f) => [f.page, f.kind]), [["home", "slow-page"], ["orders", "regression"]]);
  assert.equal(found[0]?.message, "The Home page takes 4.2 seconds to be ready (the budget is 3 seconds).");
  assert.match(found[1]?.message ?? "", /^The Orders page \(as admin\) now takes 2.4 seconds to be ready, 129% slower than in recent runs \(1\.1 seconds\), though still under its budget\.$/);
  const four: PerfFinding[] = (["chromium", "webkit"] as const).flatMap((b) => ["desktop", "mobile"].map((v) => ({ ...(found[0] as PerfFinding), browser: b, viewport: v, ms: 4000 + (b === "webkit" ? 100 : 0) })));
  const grouped = groupPerf(four);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.ms, 4100);
  assert.equal(grouped[0]?.seen_on.length, 4);
});

test("a sweep narrowed to some pages replaces only those visits: the rest of the run's sweep, its skipped list and its unavailable browsers stay unless they were looked at again", () => {
  const sweep = (over: Partial<import("../../core/lib/sweep/results.ts").SweepResults>) => ({ schema_version: 1 as const, run_id: "r", ran_at: "", matrix: { browsers: ["chromium", "webkit"], viewports: [{ name: "desktop", width: 1366, height: 768 }, { name: "mobile", width: 390, height: 844 }], why: "all" }, unavailable: [], skipped: [], visits: [], groups: [], perf: [], visual_summary: { compared: 0, different: 0, no_baseline: 0 }, notes: [], ...over });
  const bad = { kind: "bad-text" as const, key: "Invalid Date", detail: "Placed on Invalid Date" };
  const prev = sweep({
    visits: [visit({ page: "order", browser: "chromium", viewport: "desktop" }), visit({ page: "order", browser: "webkit", viewport: "desktop", signals: [bad] }), visit({ page: "order", browser: "webkit", viewport: "mobile", signals: [bad] }), visit({ page: "home", browser: "webkit", viewport: "mobile" })],
    unavailable: [{ browser: "firefox", reason: "not installed" }, { browser: "webkit", reason: "stale" }],
    skipped: [{ page: "admin", role: "admin", browser: "chromium", viewport: "desktop", reason: "Could not sign in as admin" }, { page: "order", browser: "chromium", viewport: "desktop", reason: "time budget reached" }, { page: "order", browser: "webkit", viewport: "mobile", reason: "time budget reached" }],
  });
  const cur = sweep({ matrix: { browsers: ["webkit"], viewports: [{ name: "mobile", width: 390, height: 844 }], why: "the browsers and screen sizes asked for" }, visits: [visit({ page: "order", browser: "webkit", viewport: "mobile", signals: [bad], settled_ms: 120 })] });
  const m = mergeSweeps(prev, cur);
  assert.equal(m.visits.length, 4, "the revisited combination is replaced, not added");
  assert.equal(m.visits.find((v) => v.page === "order" && v.browser === "webkit" && v.viewport === "mobile")?.settled_ms, 120);
  assert.ok(m.visits.some((v) => v.page === "home") && m.visits.some((v) => v.browser === "chromium"), "what was not looked at again stays");
  assert.deepEqual(m.unavailable.map((u) => u.browser), ["firefox"], "a browser that ran this time is no longer unavailable; the others stay");
  assert.deepEqual(m.skipped.map((k) => `${k.page}:${k.browser}`), ["admin:chromium", "order:chromium"], "a skipped page that was visited now is no longer skipped; the others stay");
  assert.deepEqual(m.matrix.browsers, ["chromium", "webkit"]);
  assert.equal(m.matrix.viewports.length, 2);
  assert.match(m.matrix.why, /then looked at again/);
  assert.equal(groupSignals(m.visits).find((g) => g.kind === "bad-text")?.scope, "only in webkit", "the grouping is worked out again from the merged visits");
});

test("the report asks for what could not run to be listed: an unavailable browser is an error until it is under Not tested", () => {
  const sweep = { schema_version: 1 as const, run_id: "r", ran_at: "", matrix: { browsers: ["chromium", "webkit"], viewports: [], why: "" }, unavailable: [{ browser: "webkit", reason: "WebKit is not installed" }], skipped: [{ page: "my-orders", role: "acme-1", reason: "Could not sign in as acme-1: the form was still there" }], visits: [], groups: [], perf: [{ kind: "slow-page" as const, page: "reports", title: "Reports", browser: "chromium", viewport: "desktop", ms: 4000, budget_ms: 3000, message: "slow" }], visual_summary: { compared: 2, different: 1, no_baseline: 0 }, notes: [] };
  const base = { findings: [], unconfirmed: [], notTested: [] as Array<{ area: string; reason: string }> };
  const none = lintCoverage({ sweep, mail: [] }, base);
  assert.match(none.errors.join(), /\(WebKit\) could not run .* list it in not-tested\.json/);
  assert.match(none.warnings.join("\n"), /could not sign in as some role[\s\S]*measured slow pages[\s\S]*differ from their baseline/);
  const listed = lintCoverage({ sweep, mail: [] }, { findings: [{ type: "performance", area: "Reports", title: "Reports page is slow" }, { type: "visual", area: "Orders", title: "Layout changed" }], unconfirmed: [], notTested: [{ area: "Safari (WebKit)", reason: "not installed" }, { area: "Client pages", reason: "could not sign in" }] });
  assert.deepEqual(listed, { errors: [], warnings: [] });
  assert.deepEqual(lintCoverage(undefined, base), { errors: [], warnings: [] });
});

test("a browser that is not installed is reported as unavailable with how to get it, never as passed", () => {
  const pw = findPlaywright();
  const prev = process.env["PLAYWRIGHT_BROWSERS_PATH"];
  process.env["PLAYWRIGHT_BROWSERS_PATH"] = tmp("qamind-nobrowsers-");
  try {
    const status = engineStatus({ chromium: { executablePath: () => "/nope/chrome" }, webkit: { executablePath: () => "/nope/webkit" }, firefox: { executablePath: () => "/nope/firefox" } }, ["webkit", "firefox"]);
    assert.deepEqual(status.map((s) => s.available), [false, false]);
    assert.match(status[0]?.detail ?? "", /WebKit \(Safari's engine\) is not installed .* `qamind browsers install webkit` .* 80 MB/);
    assert.equal(engineStatus({ error: "Playwright is not installed" }, ["chromium"])[0]?.available, false);
    void pw;
  } finally {
    if (prev === undefined) delete process.env["PLAYWRIGHT_BROWSERS_PATH"];
    else process.env["PLAYWRIGHT_BROWSERS_PATH"] = prev;
  }
});

// ---------------------------------------------------------------------------------------------- a real browser against a small site

const pwCore = path.join(repoRoot, "plugins", "qamind", "node_modules", "playwright-core");
const missing = !fs.existsSync(pwCore) ? "needs playwright-core next to the plugin" : !detectChromeChannel() ? "needs Google Chrome or Edge" : undefined;
process.env["QAMIND_PLAYWRIGHT_CORE"] = pwCore;

const site = { redesigned: false, hits: [] as string[] };
const outside = http.createServer((_q, res) => res.writeHead(200).end("outside"));
const app = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  site.hits.push(url.pathname);
  const html = (body: string, head = "") => res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${head}</head><body>${body}</body></html>`);
  const authed = (req.headers.cookie ?? "").includes("session=ok");
  if (url.pathname === "/index.html") return html(`<h1>Sign in</h1><form id="f"><label>Email <input name="email" type="email"></label><label>Password <input name="password" type="password"></label><button type="submit">Sign in</button></form><p id="m"></p>
    <script>document.getElementById("f").onsubmit=(e)=>{e.preventDefault();const pw=document.querySelector("[type=password]").value;if(pw==="pw-acme1-1234"){document.cookie="session=ok; path=/";location.href="/orders.html"}else document.getElementById("m").textContent="Wrong password"}</script>`);
  if (url.pathname === "/api/slow") return void setTimeout(() => res.writeHead(200, { "content-type": "application/json" }).end("{\"ok\":true}"), 900);
  if (!authed && url.pathname !== "/public.html") return void res.writeHead(302, { location: "/index.html" }).end();
  if (url.pathname === "/public.html") return html("<h1>Public page</h1><p>Nothing here needs a login.</p>");
  if (url.pathname === "/orders.html") return html(`<h1>My orders</h1>${site.redesigned ? '<div style="background:#c00;color:#fff;height:240px">A big new banner</div>' : ""}<ul><li>ORD-1</li><li>ORD-2</li></ul><p class="stamp">Updated ${Date.now()}</p><p>Contact jane.smith@gmail.com</p>`);
  if (url.pathname === "/new-order.html") return html(`<h1>New order</h1><form style="min-width:520px;border:1px solid #888"><label>Reference <input name="ref"></label><div style="text-align:right"><button type="button" id="place">Place order</button></div></form>`);
  if (url.pathname === "/detail.html") return html(`<h1>Order</h1><p>Placed on <span id="d">Invalid Date</span></p>`);
  if (url.pathname === "/slow.html") return html(`<h1>Reports</h1><p id="s">Loading…</p><script>fetch("/api/slow").then(r=>r.json()).then(()=>{document.getElementById("s").textContent="Done"})</script>`);
  if (url.pathname === "/leaky.html") return html(`<h1>Leaky</h1><img src="http://127.0.0.1:${(outside.address() as AddressInfo).port}/pixel.png" alt="">`);
  res.writeHead(404).end("no");
});
await new Promise<void>((r) => outside.listen(0, "127.0.0.1", r));
await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
after(() => {
  app.close();
  outside.close();
});

function siteContext(over: { yaml?: string; password?: string } = {}): { ctx: SweepContext; runDir: string; store: string } {
  const c = config(over.yaml ?? "performance:\n  pages: { \"/slow.html\": 400 }\nvisual:\n  ignore_selectors: [\".stamp\"]");
  const cfg: QamindConfig = { ...c, web_uis: [{ name: "Client Portal", url: BASE }], browsers: ["chromium"], viewports: [{ name: "desktop", width: 1100, height: 700 }, { name: "mobile", width: 390, height: 800 }], roles: [{ name: "acme-1", ui: "Client Portal", username_env: "QA_ACME1_USER", password_env: "QA_ACME1_PASS" }] };
  const runDir = tmp("qamind-sweep-run-");
  const store = tmp("qamind-sweep-store-");
  writeJson(sweepPagesFile(runDir), { pages: [
    { id: "public", title: "Public page", ui: "Client Portal", path: "/public.html" },
    { id: "my-orders", title: "My orders", ui: "Client Portal", role: "acme-1", path: "/orders.html" },
    { id: "new-order", title: "New order", ui: "Client Portal", role: "acme-1", path: "/new-order.html" },
    { id: "order-detail", title: "Order detail", ui: "Client Portal", role: "acme-1", path: "/detail.html" },
    { id: "reports", title: "Reports", ui: "Client Portal", role: "acme-1", path: "/slow.html" },
    { id: "leaky", title: "Leaky", ui: "Client Portal", role: "acme-1", path: "/leaky.html" },
  ] });
  const password = over.password ?? "pw-acme1-1234";
  return { runDir, store, ctx: { store, outDir: runDir, runId: "run-1", config: cfg, policy: policyFromConfig(cfg), roles: [{ name: "acme-1", username: "a1@acme.test", password }], secrets: { QA_ACME1_USER: "a1@acme.test", QA_ACME1_PASS: password }, passwords: [password], privacy: contextFrom(cfg, ["a1@acme.test"]) } };
}

test("a real browser: a sweep signs in by itself, finds the mobile-only overflow, the unfilled date and the slow page, masks private data and keeps to the policy", { skip: missing }, async () => {
  const { ctx, runDir } = siteContext();
  const r = await runSweep(ctx, { mode: "full" });
  assert.deepEqual(r.unavailable, []);
  assert.equal(r.visits.length, 12, "six pages at two screen sizes");
  assert.equal(r.visits.filter((v) => v.error).length, 0, JSON.stringify(r.visits.filter((v) => v.error)));
  const scope = (kind: string, page: string) => r.groups.find((g) => g.kind === kind && g.page === page)?.scope;
  assert.equal(scope("scrolls-sideways", "new-order"), "only at mobile");
  assert.ok(r.groups.some((g) => g.kind === "control-offscreen" && g.page === "new-order" && /Place order/.test(g.detail) && g.scope === "only at mobile"), "the submit button is off the screen at mobile only");
  assert.equal(scope("bad-text", "order-detail"), "every browser and screen size that was checked");
  assert.ok(!r.groups.some((g) => g.page === "my-orders" && g.kind === "scrolls-sideways"));
  const slow = groupPerf(r.perf);
  assert.deepEqual(slow.map((p) => [p.page, p.kind]), [["reports", "slow-page"]]);
  assert.ok(slow[0] && slow[0].ms >= 850 && slow[0].ms < 4000, `settled in ${slow[0]?.ms} ms`);
  assert.match(slow[0]?.message ?? "", /^The Reports page \(as acme-1\) takes \d+ ms to be ready \(the budget is 400 ms\)\.$/);
  const mine = r.visits.find((v) => v.page === "my-orders" && v.viewport === "desktop");
  assert.ok(mine?.screenshot && fs.existsSync(path.join(runDir, mine.screenshot)));
  assert.equal(mine?.status, 200);
  assert.ok((mine?.settled_ms ?? 9999) < 700, "a quick page settles quickly");
  const leaky = r.visits.find((v) => v.page === "leaky");
  assert.ok((leaky?.blocked ?? 0) >= 1, "the image on another origin was refused by the policy");
  assert.match(r.notes.join(" "), /request\(s\) to addresses outside the test environment were refused/);
  assert.match(r.notes.join(" "), /12 picture\(s\) have no baseline yet/);
  const saved = fs.readFileSync(path.join(runDir, "data", "sweep.json"), "utf8");
  assert.ok(!saved.includes("pw-acme1-1234") && !saved.includes("jane.smith@gmail.com"));
  assert.ok(!r.visits.some((v) => v.url.includes("?") && !v.url.includes("?…")));
});

test("a real browser: a baseline is compared next time, a dynamic region is ignored, a redesign is a difference with before, after and a picture of it, and an unreachable login is skipped with the reason", { skip: missing }, async () => {
  const fx = makeRunWithData();
  const { ctx, runDir, store } = siteContext();
  // the sweep belongs to a real run folder so `baseline accept` can find it by the run's id
  const projRunDir = fx.runDir;
  fs.cpSync(path.join(runDir, "data", "sweep-pages.json"), path.join(projRunDir, "data", "sweep-pages.json"));
  const first = await runSweep({ ...ctx, outDir: projRunDir, runId: fx.runId, store: fx.store }, { mode: "full", pages: ["my-orders", "new-order"] });
  assert.equal(first.visual_summary.no_baseline, 4);
  const scope = projectScope(fx.home, { project: fx.proj });
  const accepted = acceptBaselines(scope, fx.runId, { by: "owner" });
  assert.equal(accepted.accepted.length, 4);
  assert.deepEqual(accepted.with_problems, ["new-order"], "a page that had problems when photographed is named, so nobody accepts a broken look unknowingly");
  assert.equal(baselineStatus(scope).count, 4);

  const second = await runSweep({ ...ctx, outDir: projRunDir, runId: fx.runId, store: fx.store }, { mode: "full", pages: ["my-orders", "new-order"] });
  assert.equal(second.visual_summary.compared, 4);
  assert.equal(second.visual_summary.different, 0, "the timestamp on the page is in an ignored region, so an untouched page is the same picture");

  site.redesigned = true;
  try {
    const third = await runSweep({ ...ctx, outDir: projRunDir, runId: fx.runId, store: fx.store }, { mode: "full", pages: ["my-orders"], browsers: ["chromium"], viewports: ["mobile"] });
    assert.equal(third.visits.length, 4, "the narrowed sweep kept the earlier visits of the other pages and sizes");
    const v = third.visits.find((x) => x.page === "my-orders" && x.viewport === "mobile");
    assert.equal(v?.visual?.state, "different");
    assert.ok((v?.visual?.percent ?? 0) > 5 && v?.visual?.impact === "layout", JSON.stringify(v?.visual));
    for (const f of [v?.visual?.before, v?.visual?.after, v?.visual?.diff]) assert.ok(f && fs.existsSync(path.join(projRunDir, f)), `${f} is in the run folder`);
    assert.equal(third.visual_summary.different, 1);
  } finally {
    site.redesigned = false;
  }
  assert.throws(() => acceptBaselines(scope, fx.runId, { pages: ["nope"] }), /did not photograph: nope/);
  assert.throws(() => acceptBaselines(scope, "run-missing"), /There is no run folder/);

  // a login that does not work: the role's pages are skipped with the reason, never reported as clean
  const bad = siteContext({ password: "wrong-password" });
  const r = await runSweep({ ...bad.ctx, store: tmp("qamind-s-") }, { mode: "diff", pages: ["my-orders", "public"] });
  assert.deepEqual(r.visits.map((v) => v.page), ["public"], "the page that needs no login is still visited");
  assert.match(r.skipped[0]?.reason ?? "", /^Could not sign in as acme-1: the sign-in form was still there after submitting/);
  void store;
});

test("a browser that is not installed is listed as unavailable by the sweep, and the pages are not claimed as checked", { skip: missing }, async () => {
  const { ctx } = siteContext();
  const prev = process.env["PLAYWRIGHT_BROWSERS_PATH"];
  process.env["PLAYWRIGHT_BROWSERS_PATH"] = tmp("qamind-nobrowsers-");
  try {
    const r = await runSweep({ ...ctx, config: { ...ctx.config, browsers: ["webkit", "chromium"] } }, { mode: "diff", pages: ["public"], browsers: ["webkit"] });
    assert.equal(r.visits.length, 0);
    assert.equal(r.unavailable[0]?.browser, "webkit");
    assert.match(r.unavailable[0]?.reason ?? "", /not installed .* `qamind browsers install webkit`/);
  } finally {
    if (prev === undefined) delete process.env["PLAYWRIGHT_BROWSERS_PATH"];
    else process.env["PLAYWRIGHT_BROWSERS_PATH"] = prev;
  }
});

test("a run's speed history is kept from finished runs only, and the CLI commands answer for a run that has no sweep pages yet", async () => {
  const fx = makeRunWithData({ configYaml: "browsers: [chromium, webkit]" });
  const check = await cli(fx.home, "sweep", "check", "--run", fx.runId);
  assert.equal(check.code, 1);
  assert.match(check.json.errors.join(), /No data\/sweep-pages\.json in the run folder/);
  assert.deepEqual(check.json.matrix.browsers, ["chromium", "webkit"]);
  assert.equal((await cli(fx.home, "perf", "check", "--run", fx.runId)).code, 1);
  assert.equal((await cli(fx.home, "baseline", "status", "--project", fx.proj)).json.count, 0);
  assert.equal((await cli(fx.home, "browsers", "status", "--project", fx.proj)).json.engines.length, 3);
  recordPerf(fx.store, [{ key: "page|reports|-|chromium|desktop", ms: 4000 }], "run-0", new Date());
  assert.equal(loadPerf(fx.store).series["page|reports|-|chromium|desktop"]?.length, 1);
});
