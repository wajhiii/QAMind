import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { runPlan } from "../../core/lib/apirunner.ts";
import type { Plan } from "../../core/lib/apiplan.ts";
import { contextFrom, DEFAULT_CONTEXT, findPii, maskBody, maskJson, maskRun, maskText, scanRun } from "../../core/lib/privacy.ts";
import type { PrivacyContext } from "../../core/lib/privacy.ts";
import { finishRunTracked } from "../../core/lib/memory/service.ts";
import { lintReports, writeReports } from "../../core/lib/reports.ts";
import { PNG_1PX, cli, finding, makeRunWithData, repoRoot, tmp } from "./helpers.ts";

// Phase 7.6, spec 13.8: private data never reaches saved evidence or reports, and a scanner fails the run if any remains.

const ctx = (over: Partial<PrivacyContext> = {}): PrivacyContext => ({ ...DEFAULT_CONTEXT, allow: ["admin@lumen.test"], ...over });
const kinds = (text: string, c = ctx()): string[] => findPii(text, c).map((h) => `${h.kind}:${text.slice(h.start, h.end)}`);

test("emails: real ones are found; test accounts, the test prefix and test-reserved addresses stay readable", () => {
  assert.deepEqual(kinds("Contact jane.doe@gmail.com or bob@acme-corp.co.uk."), ["email address:jane.doe@gmail.com", "email address:bob@acme-corp.co.uk"]);
  assert.deepEqual(kinds("admin@lumen.test, a1@acme.test, x@example.com, y@shop.example.org, z@host.localhost, q@something.invalid"), [], "reserved for tests");
  assert.deepEqual(kinds("Logged in as ADMIN@lumen.test"), [], "a configured test account, whatever its case");
  assert.deepEqual(kinds("QA-buyer7@realmail.com"), [], "test data starts with the prefix");
  assert.deepEqual(kinds("jane@realmail.com", ctx({ prefix: "" })), ["email address:jane@realmail.com"]);
});

test("phone numbers, national IDs and card numbers are found in the formats people write them", () => {
  assert.deepEqual(kinds("Call +92 300 1234567 or 0300-1234567 or 0300 1234567."), ["phone number:+92 300 1234567", "phone number:0300-1234567", "phone number:0300 1234567"]);
  assert.deepEqual(kinds("US: (415) 867 5309 and 415-867-5309 and +1 415 867 5309"), ["phone number:(415) 867 5309", "phone number:415-867-5309", "phone number:+1 415 867 5309"]);
  assert.deepEqual(kinds("Fiction: 555-0132 and (212) 555 0100 are reserved for films"), [], "numbers the phone companies reserve for fiction");
  assert.deepEqual(kinds("CNIC 35202-1234567-1 on file"), ["national ID number:35202-1234567-1"]);
  assert.deepEqual(kinds("Card 4111 1111 1111 1111, and 5500-0000-0000-0004 and 378282246310005."), ["card number:4111 1111 1111 1111", "card number:5500-0000-0000-0004", "card number:378282246310005"]);
  assert.deepEqual(kinds("Not a card: 4111 1111 1111 1112 (fails the check digit)"), []);
});

test("ordinary technical text is left alone: timestamps, ids, versions, money, epoch times, ports, hashes", () => {
  const boring = "2026-11-02T10:27:23.267Z run-20261102T102723Z ISSUE-001 ORD-1050 v1.2.3 1,045.00 1730548800000 http://127.0.0.1:4100/api/orders?page=2 sha256 e3b0c44298fc1c149afbf4c8996fb924 id 550e8400-e29b-41d4-a716-446655440000 build 20261102 12345.67";
  assert.deepEqual(kinds(boring), []);
  assert.equal(maskText(boring, ctx()).text, boring);
});

test("masking replaces each find with a label, counts them by kind, and your own patterns are masked too", () => {
  const r = maskText("Mail jane@gmail.com, call +92 300 1234567, order ORD-445566, card 4111111111111111.", ctx({ patterns: [/ORD-\d{6}/gu] }));
  assert.equal(r.text, "Mail [masked email], call [masked phone], order [masked data], card [masked card].");
  assert.deepEqual(r.kinds, { "email address": 1, "phone number": 1, "custom pattern": 1, "card number": 1 });
  assert.equal(r.count, 4);
  assert.equal(contextFrom({ test_data_prefix: "TEST-", privacy: { mask_patterns: ["INV-\\d+", "("], mask_selectors: [], mask_fields: ["Name"] } }, ["A@b.c"]).patterns.length, 1, "an invalid pattern is skipped, never thrown on");
  assert.deepEqual(contextFrom({ test_data_prefix: "TEST-", privacy: { mask_patterns: [], mask_selectors: [], mask_fields: ["Name"] } }, ["A@B.c"]).allow, ["a@b.c"]);
});

test("JSON is masked field by field: the configured fields whole, test data kept, every other string by pattern", () => {
  const c = ctx({ fields: ["name", "address"] });
  const body = { id: 7, name: "Jane Doe", address: "12 Elm Street, Springfield", contact: { email: "jane@gmail.com", note: "call 0300-1234567" }, items: [{ name: "QA-Widget" }, { name: "Real Customer Ltd" }], count: 3 };
  const r = maskJson(body, c);
  assert.deepEqual(r.value, { id: 7, name: "[masked]", address: "[masked]", contact: { email: "[masked email]", note: "call [masked phone]" }, items: [{ name: "QA-Widget" }, { name: "[masked]" }], count: 3 });
  assert.equal(r.count, 5);
  assert.equal(maskBody('{"name":"Jane","qty":2}', c), '{"name":"[masked]","qty":2}');
  assert.equal(maskBody("plain text jane@gmail.com", c), "plain text [masked email]");
  assert.equal(maskBody("{ broken json jane@gmail.com", c), "{ broken json [masked email]");
  assert.deepEqual(maskJson({ name: "[masked]" }, c).value, { name: "[masked]" }, "masking twice changes nothing");
});

// ---- the scanner

function runWith(files: Record<string, string | Buffer>): string {
  const dir = tmp("qamind-scan-");
  for (const [f, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), content);
  }
  return dir;
}

test("the scanner lists where private data is, by file and kind, never the values; images are not read", () => {
  const dir = runWith({
    "data/findings.json": JSON.stringify([{ title: "Order page shows jane@gmail.com and 0300-1234567" }]),
    "evidence/api/e.json": JSON.stringify({ response: { body: "ok" } }),
    "evidence/console.txt": "user admin@lumen.test signed in, card 4111 1111 1111 1111",
    "screenshots/shot.png": PNG_1PX,
    "TECHNICAL-REPORT.md": "# Report\nNothing private here.",
  });
  const r = scanRun(dir, ctx());
  assert.equal(r.ok, false);
  assert.equal(r.files_scanned, 4, "text files only");
  assert.deepEqual(r.leaks.map((l) => [l.file, l.count]), [["data/findings.json", 2], ["evidence/console.txt", 1]]);
  assert.deepEqual(r.leaks[0]?.kinds, { "email address": 1, "phone number": 1 });
  assert.ok(!JSON.stringify(r).includes("jane@gmail.com") && !JSON.stringify(r).includes("4111"), "the result never repeats a value");
  assert.match(r.note, /Screenshots and other images are not scanned/);
  assert.equal(scanRun(runWith({ "a.md": "all clear", "b.json": "{}" }), ctx()).ok, true);
  assert.equal(scanRun(path.join(dir, "nope"), ctx()).ok, true, "a missing folder has nothing to leak");
});

test("a configured field leaks even when its value looks harmless, and masking it in place fixes the scan", () => {
  const dir = runWith({ "evidence/api/e.json": JSON.stringify({ response: { body: JSON.stringify({ name: "Jane Doe", qty: 2 }) } }), "evidence/api/f.json": JSON.stringify({ customer: { name: "Jane Doe" } }), "notes.txt": "mail jane@gmail.com" });
  const c = ctx({ fields: ["name"] });
  const before = scanRun(dir, c);
  assert.deepEqual(before.leaks.map((l) => l.file), ["evidence/api/f.json", "notes.txt"], "a field inside a JSON string is the API runner's job to mask while saving; the scan sees structured fields and text patterns");
  const done = maskRun(dir, c);
  assert.deepEqual(done.files_changed.map((f) => f.file).sort(), ["evidence/api/f.json", "notes.txt"]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "evidence/api/f.json"), "utf8")).customer.name, "[masked]");
  assert.equal(fs.readFileSync(path.join(dir, "notes.txt"), "utf8"), "mail [masked email]");
  assert.equal(scanRun(dir, c).ok, true);
  assert.equal(maskRun(dir, c).total, 0, "idempotent");
});

// ---- the run: finish refuses, lint says so first, the CLI fixes it

test("a run with unmasked private data does not finish; masking it lets it finish; nothing is lost in between", () => {
  const fx = makeRunWithData();
  fs.writeFileSync(path.join(fx.runDir, "evidence", "console.txt"), "GET /customers -> jane.doe@gmail.com, +92 300 1234567");
  assert.throws(() => finishRunTracked(fx.home, fx.runId, {}), /Privacy scan failed: the run's output still holds private data in 1 file\(s\): evidence\/console\.txt \(1 email address, 1 phone number\)\..*qamind privacy mask --run/);
  assert.ok(fs.existsSync(path.join(fx.store, "state", "run-marker.json")), "the run is still open");
  const lint = lintReports(fx.runDir, []);
  assert.match(lint.errors.join("\n"), /Privacy: evidence\/console\.txt holds 2 unmasked item\(s\) \(1 email address, 1 phone number\)\. Run `qamind privacy mask --run /);
  const done = maskRun(fx.runDir, ctx({ allow: [] }));
  assert.equal(done.total, 2);
  assert.equal(fs.readFileSync(path.join(fx.runDir, "evidence", "console.txt"), "utf8"), "GET /customers -> [masked email], [masked phone]");
  assert.equal(finishRunTracked(fx.home, fx.runId, {}).run_id, fx.runId);
});

test("the CLI: privacy scan exits 1 and lists, privacy mask masks and says to rebuild the reports", async () => {
  const fx = makeRunWithData();
  fs.writeFileSync(path.join(fx.runDir, "evidence", "console.txt"), "owner is jane.doe@gmail.com");
  const scan = await cli(fx.home, "privacy", "scan", "--run", fx.runId);
  assert.equal(scan.code, 1);
  assert.deepEqual(scan.json.leaks.map((l: { file: string }) => l.file), ["evidence/console.txt"]);
  const masked = await cli(fx.home, "privacy", "mask", "--run", fx.runId);
  assert.equal(masked.code, 0);
  assert.equal(masked.json.total, 1);
  assert.match(masked.json.message, /Rebuild the reports/);
  assert.equal((await cli(fx.home, "privacy", "scan", "--run", fx.runId)).code, 0);
  assert.equal((await cli(fx.home, "privacy", "mask", "--run", fx.runId)).json.message, "Nothing needed masking.");
  assert.equal((await cli(fx.home, "privacy", "bogus", "--run", fx.runId)).code, 2);
});

test("the rendered reports are masked too, whatever the data files held", () => {
  const fx = makeRunWithData({ findings: [finding({ id: "ISSUE-001", severity: "important", title: "The order page shows jane.doe@gmail.com to anyone", summary: "A visitor sees the buyer's address jane.doe@gmail.com", plain: { title: "Buyer addresses are shown", where: "Client Portal → Orders", what_happens: "The page lists jane.doe@gmail.com for every order.", who_is_affected: "Buyers.", how_to_see_it: ["Open Orders."], expected: "Addresses are hidden." } })] });
  writeReports(fx.runDir, fx.store);
  const tech = fs.readFileSync(path.join(fx.runDir, "TECHNICAL-REPORT.md"), "utf8");
  const admin = fs.readFileSync(path.join(fx.runDir, "ADMIN-REPORT.md"), "utf8");
  for (const text of [tech, admin]) {
    assert.ok(!text.includes("jane.doe@gmail.com"), "no real address in a report");
    assert.match(text, /\[masked email\]/);
  }
});

// ---- the API runner masks the evidence it saves

test("API evidence is masked while it is saved: bodies, URLs, the configured fields; test accounts stay readable", async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "failed for jane.doe@gmail.com", customer: { name: "Jane Doe", phone: "0300-1234567", login: "admin@lumen.test" }, token_hint: "n/a" }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const runDir = tmp("qamind-run-");
    const plan = { name: "p", version: 1, probes: [{ id: "P1", title: "customers", role: "anonymous", method: "GET", path: "/customers", query: { email: "jane.doe@gmail.com" }, expect: { status: 200 } }] } as unknown as Plan;
    await runPlan(plan, { baseUrl: url, policy: { allowed_origins: [url], blocked_patterns: [] }, roles: [], runDir, privacy: ctx({ fields: ["name"] }) });
    const file = path.join(runDir, "evidence", "api", "p-P1.json");
    const text = fs.readFileSync(file, "utf8");
    assert.ok(!text.includes("jane.doe@gmail.com"), "not in the body, the error, the URL or the curl line");
    assert.ok(!text.includes("Jane Doe"), "the configured field is masked inside the JSON body");
    assert.ok(!text.includes("0300-1234567"));
    assert.match(text, /admin@lumen\.test/);
    assert.match(text, /\[masked email\]/);
    assert.equal(scanRun(runDir, ctx({ fields: ["name"] })).ok, true, "and the scanner agrees");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

// ---- the page script and the Node detector agree

test("the in-page masking script finds exactly what the Node detector finds", () => {
  const corpus = [
    "Contact jane.doe@gmail.com or bob@acme-corp.co.uk.",
    "admin@lumen.test, x@example.com, QA-buyer7@realmail.com",
    "Call +92 300 1234567 or 0300-1234567 or (415) 867 5309",
    "Fiction: 555-0132 and (212) 555 0100",
    "CNIC 35202-1234567-1 on file",
    "Card 4111 1111 1111 1111, 5500-0000-0000-0004, 378282246310005 and not 4111 1111 1111 1112",
    "2026-11-02T10:27:23.267Z run-20261102T102723Z ORD-1050 1730548800000 http://127.0.0.1:4100/api",
    "ORD-445566 and ORD-1 and jane@gmail.com",
  ];
  const config = { selectors: [".x"], patterns: ["ORD-\\d{6}"], prefix: "QA-", allow: ["admin@lumen.test"] };
  const sandbox: Record<string, unknown> = { globalThis: undefined };
  sandbox["globalThis"] = sandbox;
  sandbox["__QAMIND_MASK_CONFIG"] = config;
  vm.runInNewContext(fs.readFileSync(path.join(repoRoot, "core", "shared", "page-mask.js"), "utf8"), sandbox);
  const page = (sandbox["__qamindMask"] as { findPii: (t: string) => Array<{ kind: string; start: number; end: number }> }).findPii;
  const node = ctx({ patterns: [/ORD-\d{6}/gu] });
  for (const text of corpus) assert.equal(JSON.stringify(page(text)), JSON.stringify(findPii(text, node)), text);
});
