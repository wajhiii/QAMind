import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, test } from "node:test";
import type { BankTest } from "../../core/lib/bank/bank.ts";
import { createUiRunner } from "../../core/lib/bank/uirunner.ts";
import type { UiRunner } from "../../core/lib/bank/uirunner.ts";
import { detectChromeChannel } from "../../core/lib/browserdetect.ts";
import { repoRoot, tmp } from "./helpers.ts";

/**
 * The bank's UI runner in a real Chrome, against pages served from this file. Skipped when there is no Chrome or no playwright-core next to the plugin
 * (in a fresh clone, `npm ci --ignore-scripts` in plugins/qamind provides it).
 */
const pwCore = path.join(repoRoot, "plugins", "qamind", "node_modules", "playwright-core");
const missing = !fs.existsSync(pwCore) ? "needs playwright-core next to the plugin" : !detectChromeChannel() ? "needs Google Chrome or Edge" : undefined;
process.env["QAMIND_PLAYWRIGHT_CORE"] = pwCore;

let outsideHits = 0;
const outside = http.createServer((_req, res) => {
  outsideHits++;
  res.writeHead(200, { "content-type": "text/html" }).end("<h1>Outside the test environment</h1>");
});
const app = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const html = (body: string) => res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><meta charset="utf-8"><body>${body}</body>`);
  if (url.pathname === "/login.html")
    return html(`<h1>Sign in</h1><label>Email <input id="e" name="email"></label><label>Password <input id="p" type="password" name="password"></label><button id="go">Sign in</button><p id="msg"></p>
      <script>document.getElementById("go").onclick=()=>{ if (document.getElementById("p").value==="pw-acme1-1234") location.href="/my-orders.html"; else document.getElementById("msg").textContent="Wrong password"; };</script>`);
  if (url.pathname === "/my-orders.html") return html(`<h1>My orders</h1><ul><li data-testid="order">ORD-1</li><li data-testid="order">ORD-2</li></ul><p>Contact jane.smith@gmail.com</p>`);
  if (url.pathname === "/go") {
    res.writeHead(302, { location: `http://127.0.0.1:${(outside.address() as AddressInfo).port}/hit` }).end();
    return;
  }
  if (url.pathname === "/leaky.html") return html(`<h1>Leaky page</h1><img src="http://127.0.0.1:${(outside.address() as AddressInfo).port}/pixel.png">`);
  res.writeHead(404).end("no");
});
await new Promise<void>((r) => outside.listen(0, "127.0.0.1", r));
await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
after(() => {
  app.close();
  outside.close();
});

const uiTest = (id: string, steps: BankTest["steps"]): BankTest => ({
  id,
  kind: "ui",
  title: `UI test ${id} for the bank runner`,
  area: "Client Portal",
  status: "active",
  card: { protects: "p".repeat(20), fails_when: "f".repeat(20), not_duplicate: "n".repeat(20) },
  ui: "Client Portal",
  steps,
  created: "2026-10-30T00:00:00Z",
  updated: "2026-10-30T00:00:00Z",
  revisions: 1,
  stats: { runs: 0, passes: 0, failures: 0, flaky: 0, flips: 0, history: [], avg_ms: 0 },
});

async function runner(): Promise<{ r: UiRunner; evidence: string }> {
  const evidence = path.join(tmp("qamind-ui-"), "evidence", "bank");
  const made = await createUiRunner({
    baseUrls: { "Client Portal": BASE },
    policy: { allowed_origins: [BASE], blocked_patterns: [] },
    secrets: { QA_ACME1_USER: "a1@acme.test", QA_ACME1_PASS: "pw-acme1-1234" },
    evidenceDir: evidence,
    stepTimeoutMs: 2500,
    redact: (t) => t.replaceAll("pw-acme1-1234", "[REDACTED]"),
  });
  if ("unavailable" in made) throw new Error(made.unavailable);
  return { r: made, evidence };
}

test("a UI test signs in with login variables, follows its steps and passes; a wrong password fails at the step that shows it", { skip: missing }, async () => {
  const { r } = await runner();
  try {
    const login = (password: string): BankTest["steps"] => [
      { do: "goto", path: "/login.html" },
      { do: "fill", target: { label: "Email" }, secret: "QA_ACME1_USER" },
      { do: "fill", target: { label: "Password" }, ...(password === "good" ? { secret: "QA_ACME1_PASS" } : { value: "not-the-password" }) },
      { do: "click", target: { role: "button", name: "Sign in" } },
    ];
    const ok = await r.run(uiTest("T-001", [...(login("good") as never[]), { do: "expect_text", text: "My orders" }, { do: "expect_url", contains: "/my-orders.html" }, { do: "expect_count", target: { testid: "order" }, count: 2 }, { do: "expect_no_text", text: "Wrong password" }]));
    assert.equal(ok.ok, true, ok.detail);

    const bad = await r.run(uiTest("T-002", [...(login("bad") as never[]), { do: "expect_text", text: "My orders" }]));
    assert.equal(bad.ok, false);
    assert.match(bad.detail ?? "", /^Step 5, to see the text "My orders": seeing the text "My orders" did not happen within 3 s/);
    assert.ok(bad.screenshot && bad.screenshot.endsWith("T-002.png"), "a failure leaves a screenshot");
    assert.ok(!(bad.detail ?? "").includes("pw-acme1-1234"));

    const missing = await r.run(uiTest("T-003", [{ do: "goto", path: "/my-orders.html" }, { do: "click", target: { role: "button", name: "Does not exist" } }]));
    assert.equal(missing.ok, false);
    assert.match(missing.detail ?? "", /^Step 2, to click button "Does not exist"/);
  } finally {
    await r.close();
  }
});

test("a request to an address outside the policy is refused, a redirect included, and the test says so", { skip: missing }, async () => {
  const { r } = await runner();
  try {
    outsideHits = 0;
    const redirected = await r.run(uiTest("T-004", [{ do: "goto", path: "/go" }, { do: "expect_text", text: "Outside the test environment" }]));
    assert.equal(redirected.ok, false, "the page behind the redirect must not be reachable");
    assert.equal(outsideHits, 0, "the outside server never saw the request");

    const leaky = await r.run(uiTest("T-005", [{ do: "goto", path: "/leaky.html" }, { do: "expect_text", text: "Leaky page" }, { do: "expect_text", text: "never shown" }]));
    assert.equal(leaky.ok, false);
    assert.equal(outsideHits, 0, "a sub-resource on another origin is not fetched either");
    assert.match(leaky.detail ?? "", /1 request\(s\) to addresses outside the test environment were refused/);
  } finally {
    await r.close();
  }
});

test("without Playwright the runner says so, and the bank reports UI tests as skipped, never as passed", async () => {
  const keep = process.env["QAMIND_PLAYWRIGHT_CORE"];
  process.env["QAMIND_PLAYWRIGHT_CORE"] = path.join(tmp(), "nowhere");
  try {
    // resolution falls through to the installed copies; to prove the message, make every attempt fail with a path that cannot be required
    const { runBank } = await import("../../core/lib/bank/runner.ts");
    const { saveTest } = await import("../../core/lib/bank/bank.ts");
    const store = tmp("qamind-store-");
    saveTest(store, { kind: "ui", title: "A client sees their orders after signing in", area: "Client Portal", ui: "Client Portal", card: { protects: "p".repeat(20), fails_when: "f".repeat(20), not_duplicate: "n".repeat(20) }, steps: [{ do: "goto", path: "/x" }, { do: "expect_text", text: "x" }] }, { roles: [], uis: ["Client Portal"], secretNames: [], knownSecrets: [], now: new Date() });
    const outDir = tmp("qamind-out-");
    const results = await runBank(
      { store, outDir, runId: "run-x", config: { api: {}, web_uis: [{ name: "Client Portal", url: BASE }], privacy: { mask_selectors: [], mask_patterns: [], mask_fields: [] }, test_data_prefix: "QA-" } as never, policy: { allowed_origins: [BASE], blocked_patterns: [] }, roles: [], secrets: {}, passwords: [], privacy: { prefix: "QA-", allow: [], patterns: [], fields: [] } },
      { uiRunnerFactory: async () => ({ unavailable: "Playwright (playwright-core) is not installed next to QAMind" }) },
    );
    assert.equal(results.skipped, 1);
    assert.equal(results.passed, 0);
    assert.match(results.results[0]?.detail ?? "", /Playwright .* is not installed/);
  } finally {
    if (keep === undefined) delete process.env["QAMIND_PLAYWRIGHT_CORE"];
    else process.env["QAMIND_PLAYWRIGHT_CORE"] = keep;
  }
});
