import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { repoRoot, tmp } from "./helpers.ts";

// The in-page masking script, run in a REAL Chrome (spec 13.8: blur in the page before the screenshot, not afterwards). Skipped where there is no Chrome or no Playwright
// next to the plugin (CI); the pure part of the script is tested everywhere in reliability-privacy.test.ts.
const req = createRequire(path.join(repoRoot, "plugins", "qamind", "package.json"));
let chromium: { launch: (o: object) => Promise<any> } | undefined;
try {
  chromium = (req("playwright-core") as { chromium: typeof chromium }).chromium;
} catch {
  chromium = undefined;
}
const chromeThere = process.platform === "darwin" ? fs.existsSync("/Applications/Google Chrome.app") : process.platform === "win32" ? fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe") : fs.existsSync("/usr/bin/google-chrome");
const skip = chromium && chromeThere ? false : "needs Google Chrome and playwright-core next to the plugin";

const PAGE = `<!doctype html><html><head><title>t</title></head><body>
<h1>Customer</h1>
<p id="email">Write to hannah@realmail.com about the order.</p>
<p id="test">Signed in as admin@lumen.test (a QAMind test account) and x@example.com</p>
<p id="cnic">CNIC 35202-1234567-1 on file, card 4000 0566 5566 5556.</p>
<p id="fiction">Call +1 202 555 0143 (fiction) or +92 300 1234567.</p>
<p id="boring">Order ORD-1050 placed 2026-11-02T10:27:23Z for 1,045.00</p>
<p class="address">14 Industrial Estate Road, Springfield</p>
<input id="field" value="marcus@realmail.org">
<div id="late"></div>
<script>setTimeout(() => { document.getElementById("late").textContent = "Added later: 0300-7654321"; }, 100);</script>
</body></html>`;

test("in Chrome, private data in the page is blurred before the screenshot; test accounts and ordinary text are not", { skip }, async () => {
  const server = http.createServer((_q, r) => (r.setHeader("content-type", "text/html"), r.end(PAGE)));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const cfg = { selectors: [".address"], patterns: [], prefix: "QA-", allow: ["admin@lumen.test"] };
  const script = `globalThis.__QAMIND_MASK_CONFIG = ${JSON.stringify(cfg)};\n${fs.readFileSync(path.join(repoRoot, "core", "shared", "page-mask.js"), "utf8")}`;
  const file = path.join(tmp("qamind-mask-"), "page-mask.js");
  fs.writeFileSync(file, script);
  const browser = await (chromium as NonNullable<typeof chromium>).launch({ channel: "chrome", headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.addInitScript({ path: file });
    await page.goto(url);
    await page.waitForTimeout(400);
    const info = (await page.evaluate(`(() => {
      const blurred = (el) => !!el && getComputedStyle(el).filter.includes("blur");
      const masked = Array.from(document.querySelectorAll("[data-qamind-mask]")).map((e) => ({ kind: e.getAttribute("data-qamind-mask"), blurred: blurred(e) }));
      return {
        masked,
        address: blurred(document.querySelector(".address")),
        input: blurred(document.getElementById("field")),
        boring: document.getElementById("boring").querySelector("[data-qamind-mask]") === null,
        test: document.getElementById("test").querySelector("[data-qamind-mask]") === null,
        late: (document.getElementById("late").querySelector("[data-qamind-mask]") || {}).textContent,
        count: window.__qamindMaskNow(),
      };
    })()`)) as { masked: Array<{ kind: string; blurred: boolean }>; address: boolean; input: boolean; boring: boolean; test: boolean; late?: string; count: number };
    const kinds = info.masked.map((m) => m.kind).sort();
    assert.ok(info.masked.length >= 5, `masked elements: ${JSON.stringify(info.masked)}`);
    assert.ok(info.masked.every((m) => m.blurred), "every masked piece really is blurred by CSS");
    assert.ok(kinds.includes("email address") && kinds.includes("national ID number") && kinds.includes("card number") && kinds.includes("phone number"));
    assert.equal(info.address, true, "an element matching privacy.mask_selectors is blurred");
    assert.equal(info.input, true, "a form field holding an email is blurred");
    assert.equal(info.late, "0300-7654321", "data added to the page later is masked as it arrives");
    assert.equal(info.test, true, "a test account and addresses reserved for tests stay readable");
    assert.equal(info.boring, true, "order numbers, dates and money are left alone");
    // a screenshot is taken of the blurred page; keep one when asked, to look at it
    const shot = await page.screenshot();
    assert.ok(shot.length > 1000);
    if (process.env["QAMIND_SAVE_SHOT"]) fs.writeFileSync(process.env["QAMIND_SAVE_SHOT"], shot);
    // and without the script nothing is blurred: the page itself is what holds the data
    const plain = await (await browser.newContext()).newPage();
    await plain.goto(url);
    assert.equal(await plain.evaluate(`document.querySelectorAll("[data-qamind-mask]").length`), 0);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});
