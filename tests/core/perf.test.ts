import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkConfigText, policyFromConfig } from "../../core/lib/config.ts";
import type { QamindConfig } from "../../core/lib/config.ts";
import { apiPerfPoints, perfEndpointsFile, runApiPerf, validatePerfEndpoints } from "../../core/lib/perf/api.ts";
import { KEEP_POINTS, apiKey, endpointBudget, judge, loadPerf, median, pageBudget, pageKey, percentile, plainDuration, recordPerf } from "../../core/lib/perf/store.ts";
import { contextFrom } from "../../core/lib/privacy.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { DEMO_CONFIG, DEMO_ENV, makeProject, tmp, withConfigYaml } from "./helpers.ts";

// Performance checks (spec 13.11): the arithmetic, the memory of earlier runs, and the API timer.

const config = (extra = ""): QamindConfig => {
  const c = checkConfigText(extra ? withConfigYaml(extra) : DEMO_CONFIG, { projectRoot: makeProject({ files: { "openapi.yaml": "x" } }), env: DEMO_ENV }).config;
  assert.ok(c);
  return c;
};

test("median, 95th percentile (nearest rank: with five calls it is the slowest), and plain durations", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 10]), 2.5);
  assert.equal(percentile([100, 120, 110, 900, 130], 95), 900);
  assert.equal(percentile([10], 95), 10);
  assert.equal(percentile([], 95), 0);
  assert.equal(plainDuration(850), "850 ms");
  assert.equal(plainDuration(4300), "4.3 seconds");
  assert.equal(plainDuration(6000), "6 seconds");
});

test("a measurement is judged against its budget and against the recent runs, and small differences are never a regression", () => {
  const hist = (ms: number[]) => ms.map((m, i) => ({ ms: m, run: `r${i}`, at: `2026-10-0${i + 1}T00:00:00Z` }));
  assert.deepEqual(judge(2000, 3000, [], 30, 250), { over_budget: false, budget_ms: 3000, regressed: false });
  assert.equal(judge(3500, 3000, [], 30, 250).over_budget, true);
  // twice as slow as the last runs, still under budget: a regression
  const slower = judge(2400, 3000, hist([1200, 1200, 1100]), 30, 250);
  assert.equal(slower.over_budget, false);
  assert.equal(slower.regressed, true);
  assert.equal(slower.previous_ms, 1200);
  assert.equal(slower.slower_pct, 100);
  // 40 ms to 90 ms is 125% slower and means nothing
  assert.equal(judge(90, 3000, hist([40, 40, 40]), 30, 250).regressed, false);
  // a 20% slowdown is under the configured 30%
  assert.equal(judge(1440, 3000, hist([1200]), 30, 250).regressed, false);
  // faster is never a regression
  assert.equal(judge(500, 3000, hist([1200]), 30, 250).regressed, false);
  // only the last five count: an old slow run does not make a normal one look fast
  assert.equal(judge(1000, 3000, hist([9000, 1000, 1000, 1000, 1000, 1000]), 30, 250).previous_ms, 1000);
});

test("budgets: a page or endpoint's own entry beats the default, with or without its query", () => {
  const c = config("performance:\n  pages: { \"/reports.html\": 6000 }\n  endpoints: { \"GET /admin/reports/sales\": 5000, \"/health\": 100 }");
  assert.equal(pageBudget(c.performance, "/reports.html"), 6000);
  assert.equal(pageBudget(c.performance, "/reports.html?month=10"), 6000);
  assert.equal(pageBudget(c.performance, "/orders.html"), 3000);
  assert.equal(endpointBudget(c.performance, "GET", "/admin/reports/sales"), 5000);
  assert.equal(endpointBudget(c.performance, "get", "/admin/reports/sales?x=1"), 5000);
  assert.equal(endpointBudget(c.performance, "GET", "/orders"), 800);
  assert.equal(endpointBudget(c.performance, "GET", "/health"), 100);
});

test("the history keeps the latest points per page and endpoint, and survives a missing file", () => {
  const store = tmp("qamind-store-");
  assert.deepEqual(loadPerf(store).series, {});
  const key = pageKey({ page: "reports", role: "admin", browser: "chromium", viewport: "desktop" });
  assert.equal(key, "page|reports|admin|chromium|desktop");
  assert.equal(apiKey("get", "/orders", undefined), "api|GET /orders|-");
  for (let i = 0; i < KEEP_POINTS + 4; i++) recordPerf(store, [{ key, ms: 1000 + i }], `run-${i}`, new Date(`2026-10-${10 + i}T00:00:00Z`));
  const series = loadPerf(store).series[key] ?? [];
  assert.equal(series.length, KEEP_POINTS);
  assert.equal(series[0]?.ms, 1004);
  assert.equal(series.at(-1)?.run, `run-${KEEP_POINTS + 3}`);
  assert.equal(recordPerf(store, [], "x", new Date()), 0);
});

test("the endpoints file is checked: only GET and HEAD, known roles, a few calls, paths not addresses", () => {
  const c = config();
  assert.equal(validatePerfEndpoints({ endpoints: [{ path: "/orders", role: "acme-1" }, { method: "HEAD", path: "/health", calls: 3 }] }, c).ok, true);
  const bad = validatePerfEndpoints({ endpoints: [{ method: "POST", path: "/orders" }, { path: "https://prod.example.com/x" }, { path: "/x", role: "ghost" }, { path: "/y", calls: 50 }] }, c);
  assert.equal(bad.ok, false);
  const text = bad.errors.join("\n");
  for (const re of [/only GET and HEAD are timed/, /not a full address/, /role "ghost" is not in the config/, /"calls" is a whole number from 1 to 10/]) assert.match(text, re);
  assert.equal(validatePerfEndpoints({ endpoints: [] }, c).ok, false);
  assert.equal(validatePerfEndpoints({ endpoints: Array.from({ length: 30 }, () => ({ path: "/o" })) }, c).ok, false);
});

test("the API timer signs in once per role, times a few calls, flags a slow endpoint, and never times one that does not answer", async () => {
  const c = config("performance:\n  api_p95_ms: 60\n  endpoints: { \"GET /fast\": 5000 }");
  const runDir = tmp("qamind-run-");
  const store = tmp("qamind-store-");
  writeJson(perfEndpointsFile(runDir), { endpoints: [{ path: "/slow", role: "acme-1", calls: 3 }, { path: "/fast", role: "acme-1" }, { path: "/down", role: "acme-1" }, { path: "/anon" }, { path: "/orders", role: "admin" }] });
  const calls: string[] = [];
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    calls.push(`${init?.method ?? "GET"} ${u.pathname}`);
    if (u.pathname === "/api/auth/login") {
      const body = JSON.parse(String(init?.body)) as { email: string };
      return body.email === "a1@acme.test" ? new Response(JSON.stringify({ token: "tok-123" }), { status: 200 }) : new Response("{}", { status: 401 });
    }
    if (u.pathname.endsWith("/down")) throw new Error("connect ECONNREFUSED");
    if (u.pathname.endsWith("/slow")) await new Promise((r) => setTimeout(r, 90));
    assert.ok(u.pathname.endsWith("/anon") || (init?.headers as Record<string, string>)["Authorization"] === "Bearer tok-123", "calls as a role carry its token");
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
  const r = await runApiPerf({ store, runDir, runId: "run-1", config: c, policy: policyFromConfig(c), roles: [{ name: "acme-1", username: "a1@acme.test", password: "pw-acme1-1234" }], passwords: ["pw-acme1-1234"], privacy: contextFrom(c, []), fetchImpl: fakeFetch }, new Date("2026-11-01T00:00:00Z"));
  assert.equal(calls.filter((x) => x.endsWith("/auth/login")).length, 1, "one sign-in for acme-1, however many endpoints it calls; admin has no login in .env.qa, so it is never tried");
  const slow = r.timings.find((t) => t.path === "/slow");
  assert.ok(slow && slow.over_budget && slow.answered === 3 && slow.p95_ms >= 85, JSON.stringify(slow));
  assert.match(slow.message, /is slow: the slowest of 3 calls took .* the budget is 60 ms/);
  assert.equal(r.timings.find((t) => t.path === "/fast")?.over_budget, false);
  assert.ok(r.timings.find((t) => t.path === "/anon"), "an endpoint without a role is called without signing in");
  assert.match(r.skipped.find((s) => s.path === "/down")?.reason ?? "", /No answer .*nothing was concluded about its speed/);
  assert.match(r.skipped.find((s) => s.path === "/orders")?.reason ?? "", /role "admin" has no credentials/, "a role that cannot sign in is skipped with the reason");
  assert.ok(fs.existsSync(path.join(runDir, "data", "perf-api.json")));
  assert.equal(apiPerfPoints(runDir).length, 3, "only endpoints that answered feed the history");
  assert.ok(!JSON.stringify(r).includes("pw-acme1-1234") && !JSON.stringify(r).includes("tok-123"));
});

test("an endpoint outside the policy is not called", async () => {
  const c = config();
  const runDir = tmp("qamind-run-");
  writeJson(perfEndpointsFile(runDir), { endpoints: [{ path: "/orders" }] });
  const out = { ...c, api: { ...c.api, base_url: "https://shop.lumen-supplies.example.com/api" } };
  let called = 0;
  const r = await runApiPerf({ store: tmp(), runDir, runId: "r", config: out, policy: policyFromConfig(c), roles: [], passwords: [], privacy: contextFrom(c, []), fetchImpl: (async () => { called++; return new Response("x"); }) as typeof fetch });
  assert.equal(called, 0);
  assert.match(r.skipped[0]?.reason ?? "", /refused by the run's URL policy/);
});
