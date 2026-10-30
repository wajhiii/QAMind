import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";
import type { Plan } from "../../core/lib/apiplan.ts";
import { jsonPathGet } from "../../core/lib/auth.ts";
import { captureValue, runPlan, statusMatches } from "../../core/lib/apirunner.ts";
import type { RunnerOptions } from "../../core/lib/apirunner.ts";
import { tmp } from "./helpers.ts";

const TOKEN = "tok-abcdef-1234567890";
const PASSWORD = "pw-secret-9999";
let server: http.Server;
let base = "";
let orders = 0;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status: number, obj: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(obj));
      };
      const url = new URL(req.url ?? "/", "http://x");
      const authed = req.headers["authorization"] === `Bearer ${TOKEN}`;
      if (url.pathname === "/api/auth/login") {
        const b = JSON.parse(body || "{}") as { email?: string; password?: string };
        return b.password === PASSWORD ? send(200, { token: TOKEN }) : send(401, { error: "bad credentials" });
      }
      if (url.pathname === "/api/items" && req.method === "GET") {
        if (!authed) return send(401, { error: "no" });
        if (url.searchParams.get("q") === "(") return send(500, { error: { trace: "Error: boom\n    at handler (/srv/app/src/items.js:10:5)" } });
        return send(200, { data: [{ id: "i-1", name: "one" }] });
      }
      if (url.pathname === "/api/items" && req.method === "POST") {
        if (!authed) return send(401, {});
        orders++;
        return send(201, { id: `i-${orders}`, echoed_authorization: req.headers["authorization"] });
      }
      if (url.pathname === "/api/open") return send(200, { secret: "visible to anonymous" });
      if (url.pathname === "/api/slow") return setTimeout(() => send(200, {}), 150);
      if (url.pathname === "/api/redirect") {
        res.writeHead(302, { location: "http://127.0.0.1:1/prod" });
        return res.end();
      }
      send(404, { error: "nope" });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => server.close());

function options(runDir: string, over: Partial<RunnerOptions> = {}): RunnerOptions {
  const origin = new URL(base).origin;
  return {
    baseUrl: base,
    policy: { allowed_origins: [origin], blocked_patterns: [] },
    roles: [{ name: "client", username: "c@x.test", password: PASSWORD }],
    login: { path: "/auth/login", method: "POST", username_field: "email", password_field: "password", token_path: "token", auth_header: "Authorization: Bearer {token}" },
    runDir,
    slowMs: 100,
    ...over,
  };
}

test("helpers: json paths, captures and status expectations", () => {
  assert.equal(jsonPathGet({ a: { b: [{ c: 5 }] } }, "$.a.b[0].c"), 5);
  assert.equal(captureValue({ data: [{ id: 7 }] }, "$first:id"), 7);
  assert.equal(captureValue([{ id: 8 }], "$first:id"), 8);
  assert.ok(statusMatches(404, "4xx") && statusMatches(401, [401, 403]) && !statusMatches(200, "4xx"));
});

test("oracles flag 5xx, leakage, auth gaps, slowness and duplicates; reproduction and evidence are automatic", async () => {
  const runDir = tmp("qamind-run-");
  const plan: Plan = {
    version: 1,
    name: "t",
    probes: [
      { id: "A", title: "list ok", method: "GET", path: "/items", role: "client", expect: { status: 200 } },
      { id: "B", title: "search crash", method: "GET", path: "/items", query: { q: "(" }, role: "client" },
      { id: "C", title: "open endpoint without credentials", operation: "GET /open", method: "GET", path: "/open", role: "anonymous", expect: { status: [401, 403] } },
      { id: "D", title: "slow", method: "GET", path: "/slow", role: "anonymous" },
      { id: "E", title: "double submit", method: "POST", path: "/items", body: { name: "QA-x" }, role: "client", repeat: { count: 2, parallel: true } },
      { id: "F", title: "capture then use", method: "GET", path: "/items", role: "client", capture: { itemId: "$first:id" } },
      { id: "G", title: "uses captured id", method: "GET", path: "/items/{{itemId}}", role: "client" },
      { id: "H", title: "needs a variable nobody set", method: "GET", path: "/items/{{nope}}", role: "client" },
    ],
  };
  const inventory = { source: "t", servers: [], security_schemes: [], endpoints: [{ method: "GET", path: "/open", operation: "GET /open", tags: [], auth: "required" as const, parameters: [], responses: [{ status: "200" }, { status: "401" }] }] };
  const result = await runPlan(plan, options(runDir, { inventory }));
  const by = Object.fromEntries(result.results.map((r) => [r.id, r]));

  assert.deepEqual(by["A"]!.signals, []);
  assert.ok(by["B"]!.signals.some((s) => s.kind === "server-error"));
  assert.ok(by["B"]!.signals.some((s) => s.kind === "error-leakage"));
  assert.equal(by["B"]!.reproduced?.times, 2);
  assert.ok(by["C"]!.signals.some((s) => s.kind === "auth-not-enforced"));
  assert.ok(by["C"]!.expectation_failures.length > 0);
  assert.ok(by["D"]!.signals.some((s) => s.kind === "slow-response"));
  assert.ok(by["E"]!.signals.some((s) => s.kind === "duplicate-submission"));
  assert.equal(by["G"]!.statuses[0], 404, "the captured id was substituted");
  assert.match(by["H"]!.skipped ?? "", /nope/);
  assert.equal(result.summary.skipped, 1);

  // Evidence exists only for flagged probes, with a curl line, and contains no token or password.
  assert.equal(by["A"]!.evidence, undefined);
  const evFile = path.join(runDir, by["E"]!.evidence!);
  const ev = fs.readFileSync(evFile, "utf8");
  assert.match(ev, /curl -sS -i -X POST/);
  assert.ok(!ev.includes(TOKEN), "token redacted even where the server echoed it back");
  assert.ok(!ev.includes(PASSWORD));
  assert.ok(fs.existsSync(path.join(runDir, "data", "api-results", "t.json")));
});

test("the production policy is enforced per request; redirects out of policy are flagged, not followed", async () => {
  const runDir = tmp("qamind-run-");
  const plan: Plan = {
    version: 1,
    name: "p",
    probes: [
      { id: "A", title: "inside policy", method: "GET", path: "/open", role: "anonymous" },
      { id: "B", title: "absolute url to another origin", method: "GET", path: "http://127.0.0.1:1/anything", role: "anonymous" },
      { id: "C", title: "redirect to another origin", method: "GET", path: "/redirect", role: "anonymous" },
    ],
  };
  const result = await runPlan(plan, options(runDir));
  const by = Object.fromEntries(result.results.map((r) => [r.id, r]));
  assert.equal(by["A"]!.skipped, undefined);
  assert.match(by["B"]!.skipped ?? "", /production-safety policy/);
  assert.ok(by["C"]!.signals.some((s) => s.kind === "blocked-redirect"));
  assert.equal(by["C"]!.statuses[0], 302, "the redirect was seen but not followed");
});

test("blocked production patterns stop the probe even for an allowed origin; login failure skips the role", async () => {
  const runDir = tmp("qamind-run-");
  const plan: Plan = { version: 1, name: "b", probes: [{ id: "A", title: "x", method: "GET", path: "/open", role: "anonymous" }, { id: "B", title: "y", method: "GET", path: "/items", role: "client" }] };
  const origin = new URL(base).origin;
  const blocked = await runPlan(plan, options(runDir, { policy: { allowed_origins: [origin], blocked_patterns: ["127.0.0.1:*"] } }));
  assert.ok(blocked.results.every((r) => /production-safety policy/.test(r.skipped ?? "")));
  const badLogin = await runPlan(plan, options(tmp("qamind-run-"), { roles: [{ name: "client", username: "c", password: "wrong-wrong" }] }));
  assert.match(badLogin.results[1]!.skipped ?? "", /login for "client" failed with HTTP 401/);
});

test("body checks accept a single string; keep_evidence saves evidence for a passing probe; $find:id works; bad plans are rejected", async () => {
  const runDir = tmp("qamind-run-");
  const plan: Plan = {
    version: 1,
    name: "k",
    probes: [
      // The body is {"data":[{"id":"i-1","name":"one"}]}: single characters like "a" appear in it, the whole string does not.
      { id: "A", title: "not-contains as a plain string", method: "GET", path: "/items", role: "client", expect: { body_not_contains: "QA-iso-acme", body_contains: "one" } },
      { id: "B", title: "contains a string that is absent", method: "GET", path: "/items", role: "client", expect: { body_contains: "no-such-text" } },
      { id: "C", title: "kept evidence", method: "GET", path: "/items", role: "client", keep_evidence: true },
      { id: "D", title: "create", method: "POST", path: "/items", body: { name: "QA-x" }, role: "client", capture: { newId: "$find:id" } },
      { id: "E", title: "uses the new id", method: "GET", path: "/items/{{newId}}", role: "client" },
    ],
  };
  const r = await runPlan(plan, options(runDir));
  const by = Object.fromEntries(r.results.map((x) => [x.id, x]));
  assert.deepEqual(by["A"]!.expectation_failures, [], "a plain string is one needle, not a list of characters");
  assert.ok(by["B"]!.expectation_failures.length === 1, "a missing needle fails");
  assert.ok(by["C"]!.evidence && fs.existsSync(path.join(runDir, by["C"]!.evidence!)), "evidence kept for a probe with nothing wrong");
  assert.equal(by["E"]!.statuses[0], 404, "captured the id of the created record (i-N)");
  await assert.rejects(runPlan({ version: 1, name: "bad", probes: [{ title: "x" } as any] }, options(tmp("qamind-run-"))), /The plan has problems/);
});

test("read-only mode skips every non-GET probe", async () => {
  const plan: Plan = { version: 1, name: "r", probes: [{ id: "A", title: "w", method: "POST", path: "/items", body: {}, role: "client" }] };
  const r = await runPlan(plan, options(tmp("qamind-run-"), { readOnly: true }));
  assert.match(r.results[0]!.skipped ?? "", /read-only/);
});
