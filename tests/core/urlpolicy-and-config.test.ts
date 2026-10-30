import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkConfigText, policyFromConfig } from "../../core/lib/config.ts";
import { classifyUrl, isRequestAllowed } from "../../core/lib/urlpolicy.ts";
import type { SecuritySettings } from "../../core/lib/urlpolicy.ts";
import { DEMO_CONFIG, DEMO_ENV, repoRoot, tmp } from "./helpers.ts";

const sec = (over: Partial<SecuritySettings> = {}): SecuritySettings => ({
  blocked_production_patterns: ["www.shop.com", "*.shop.com/live/*"],
  not_production_hosts: [],
  allowed_extra_origins: [],
  confirmed_non_production: false,
  ...over,
});

test("production patterns block, test environments pass, unknown hosts are ambiguous", () => {
  assert.equal(classifyUrl("http://127.0.0.1:4100", sec()).verdict, "allowed");
  assert.equal(classifyUrl("https://staging.shop.com", sec()).verdict, "allowed");
  assert.equal(classifyUrl("https://shop.local", sec()).verdict, "allowed");
  assert.equal(classifyUrl("https://www.shop.com/admin", sec()).verdict, "blocked");
  assert.equal(classifyUrl("https://x.shop.com/live/orders", sec()).verdict, "blocked");
  assert.equal(classifyUrl("https://prod.internal-tool.io", sec()).verdict, "blocked");
  assert.equal(classifyUrl("https://app.mycompany.com", sec()).verdict, "ambiguous");
  assert.equal(classifyUrl("https://app.mycompany.com", sec({ confirmed_non_production: true })).verdict, "allowed");
  assert.equal(classifyUrl("https://prod-mirror.mycompany.com", sec({ not_production_hosts: ["prod-mirror.mycompany.com"], confirmed_non_production: true })).verdict, "allowed");
  assert.equal(classifyUrl("ftp://x", sec()).verdict, "blocked");
});

test("a blocked pattern beats an allowed origin", () => {
  const policy = { allowed_origins: ["https://www.shop.com", "http://127.0.0.1:4100"], blocked_patterns: ["www.shop.com"] };
  assert.equal(isRequestAllowed(policy, "https://www.shop.com/").allowed, false);
  assert.equal(isRequestAllowed(policy, "http://127.0.0.1:4100/api").allowed, true);
  assert.equal(isRequestAllowed(policy, "http://127.0.0.1:4101/").allowed, false, "same host, other port is another origin");
});

test("the scaffolded template is refused as unfilled, naming what to fill in", () => {
  const template = fs.readFileSync(path.join(repoRoot, "core", "shared", "templates", "config.md"), "utf8");
  const r = checkConfigText(template, { projectRoot: tmp(), env: {} });
  assert.equal(r.status, "unfilled");
  assert.ok(r.problems.some((p) => /REPLACE_ME/.test(p)));
});

test("the demo fixture config is valid and only the demo origins are allowed", () => {
  const dir = tmp();
  fs.copyFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), path.join(dir, "openapi.yaml"));
  const r = checkConfigText(DEMO_CONFIG, { projectRoot: dir, env: DEMO_ENV });
  assert.equal(r.status, "ok", r.problems.join("; "));
  assert.deepEqual(r.missing_env, []);
  assert.deepEqual(policyFromConfig(r.config!).allowed_origins, ["http://127.0.0.1:4100", "http://127.0.0.1:4101", "http://127.0.0.1:4102"]);
});

test("missing credentials are reported by name only, never by value", () => {
  const dir = tmp();
  fs.copyFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), path.join(dir, "openapi.yaml"));
  const env = { ...DEMO_ENV };
  delete (env as Record<string, string | undefined>)["QA_BRIGHT1_PASS"];
  const r = checkConfigText(DEMO_CONFIG, { projectRoot: dir, env });
  assert.deepEqual(r.missing_env, ["QA_BRIGHT1_PASS"]);
  assert.ok(!JSON.stringify(r).includes(DEMO_ENV["QA_ADMIN_PASS"] as string));
});

test("a production URL in the config blocks the run, and a bad role/ui link is an error", () => {
  const dir = tmp();
  fs.copyFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), path.join(dir, "openapi.yaml"));
  const bad = DEMO_CONFIG.replace("http://127.0.0.1:4102", "https://app.lumen-supplies.example.com");
  const r = checkConfigText(bad, { projectRoot: dir, env: DEMO_ENV });
  assert.equal(r.status, "blocked-url");
  assert.ok(r.blocked[0]?.reason.includes("blocked production pattern"));
  const bad2 = checkConfigText(DEMO_CONFIG.replace("ui: Admin Portal", "ui: Nowhere"), { projectRoot: dir, env: DEMO_ENV });
  assert.equal(bad2.status, "invalid");
  assert.ok(bad2.problems.some((p) => p.includes("Nowhere")));
});

test("garbage config fails clearly instead of throwing", () => {
  assert.equal(checkConfigText("no front matter", { projectRoot: tmp(), env: {} }).status, "invalid");
  assert.equal(checkConfigText("---\nfoo: [unclosed\n---\n", { projectRoot: tmp(), env: {} }).status, "invalid");
});
