import assert from "node:assert/strict";
import { test } from "node:test";
import { checkConfigText } from "../../core/lib/config.ts";
import { DEMO_CONFIG, DEMO_ENV, makeProject, withConfigYaml } from "./helpers.ts";

// The settings of the coverage features (spec 13.7, 13.9 to 13.11): every one is optional, has the documented default, and says what is wrong in plain words.

const check = (yaml: string) => checkConfigText(withConfigYaml(yaml), { projectRoot: makeProject({ files: { "openapi.yaml": "x" } }), env: DEMO_ENV });

test("without any of the new settings the defaults are the spec's: chromium, desktop and mobile, 3000 ms pages, 800 ms API, 30% regression, no catcher", () => {
  const c = checkConfigText(DEMO_CONFIG, { projectRoot: makeProject({ files: { "openapi.yaml": "x" } }), env: DEMO_ENV }).config;
  assert.ok(c);
  assert.deepEqual(c.browsers, ["chromium"]);
  assert.deepEqual(c.viewports, [{ name: "desktop", width: 1366, height: 768 }, { name: "mobile", width: 390, height: 844 }]);
  assert.deepEqual(c.visual, { threshold: 0.2, ignore_selectors: [] });
  assert.deepEqual(c.performance, { page_load_ms: 3000, api_p95_ms: 800, regression_pct: 30, pages: {}, endpoints: {} });
  assert.equal(c.mail, undefined);
  assert.equal(c.sms, undefined);
});

test("a full set of settings is read as written, a custom catcher can be given as an address, and ids may be numbers", () => {
  const r = check(`mail:
  catcher: mailpit
  url: http://127.0.0.1:8025/
  timeout_s: 45
sms:
  catcher: http://127.0.0.1:9000/messages
  token_env: SMS_TOKEN
browsers: [chromium, WebKit, webkit]
viewports:
  - { name: desktop, width: 1366, height: 768 }
  - { name: tablet, width: 768, height: 1024 }
visual:
  threshold: 1.5
  ignore_selectors: [".avatar", "[data-dynamic]"]
performance:
  page_load_ms: 2000
  api_p95_ms: 500
  regression_pct: 50
  pages: { "/reports.html": 6000 }
  endpoints: { "GET /admin/reports/sales": 5000 }`);
  assert.equal(r.status, "ok", r.problems.join("; "));
  const c = r.config;
  assert.ok(c);
  assert.deepEqual(c.mail, { type: "mailpit", url: "http://127.0.0.1:8025", timeout_s: 45 });
  assert.deepEqual(c.sms, { type: "custom", url: "http://127.0.0.1:9000/messages", token_env: "SMS_TOKEN", timeout_s: 30 });
  assert.deepEqual(c.browsers, ["chromium", "webkit"]);
  assert.deepEqual(c.viewports.map((v) => v.name), ["desktop", "tablet"]);
  assert.equal(c.visual.threshold, 1.5);
  assert.deepEqual(c.visual.ignore_selectors, [".avatar", "[data-dynamic]"]);
  assert.equal(c.performance.pages["/reports.html"], 6000);
  assert.equal(c.performance.endpoints["GET /admin/reports/sales"], 5000);

  const trap = check(`mail:\n  catcher: mailtrap\n  token_env: MAILTRAP_TOKEN\n  account_id: 12\n  inbox_id: 3456`);
  assert.equal(trap.status, "ok", trap.problems.join("; "));
  assert.deepEqual(trap.config?.mail, { type: "mailtrap", url: "https://mailtrap.io/api", token_env: "MAILTRAP_TOKEN", account_id: "12", inbox_id: "3456", timeout_s: 30 });
});

test("each mistake is named: browsers, screen sizes, catchers, tokens, thresholds, selectors and budgets", () => {
  const problems = check(`mail:
  catcher: sendgrid
sms:
  catcher: mailpit
browsers: [chrome, firefox]
viewports:
  - { name: tiny, width: 100, height: 100 }
  - { name: ok, width: 500, height: 800 }
  - { name: ok, width: 600, height: 800 }
visual:
  threshold: 300
  ignore_selectors: ["a { color: red }"]
performance:
  page_load_ms: 5
  regression_pct: 1
  pages: { "/x": 3 }`).problems.join("\n");
  for (const re of [/mail\.catcher "sendgrid" is not one of mailpit, mailhog, mailtrap, custom/, /sms\.catcher must be the http\(s\) address/, /browsers: "chrome" is not a browser/, /viewports\[0\] needs a short name/, /the name "ok" is used twice/, /visual\.threshold must be a percentage/, /not allowed in a CSS selector/, /performance\.page_load_ms must be a number of milliseconds/, /performance\.regression_pct must be a percentage/, /performance\.pages\.\/x: a number of milliseconds/]) assert.match(problems, re);
  assert.match(check(`mail:\n  catcher: mailpit`).problems.join("\n"), /mail\.url is required/);
  assert.match(check(`mail:\n  catcher: mailtrap`).problems.join("\n"), /mail\.token_env is required for mailtrap/);
  assert.match(check(`mail:\n  catcher: custom\n  url: http://x.test/api\n  token_env: "my token"`).problems.join("\n"), /not a valid variable name \(give the name, never the token itself\)/);
});

test("a catcher whose address names production is refused like any other address, and a catcher is not an origin the product may be reached at", () => {
  const r = check(`mail:\n  catcher: mailpit\n  url: https://mail.lumen-supplies.example.com`);
  assert.equal(r.status, "blocked-url");
  assert.match(r.blocked.map((b) => b.reason).join(" "), /mail\.url/);
  const ok = check(`mail:\n  catcher: mailpit\n  url: http://127.0.0.1:8025`);
  assert.equal(ok.status, "ok");
});
