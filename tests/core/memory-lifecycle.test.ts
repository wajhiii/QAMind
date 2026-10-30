import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { addFalseAlarm } from "../../core/lib/memory/falsealarms.ts";
import { readMemoryLog } from "../../core/lib/memory/memorylog.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { cli, DEMO_ENV, makeRunWithData, startAnotherRun } from "./helpers.ts";

const PAGES_1 = [
  { ui: "Client Portal", path: "/my-orders.html", title: "My orders" },
  { ui: "Client Portal", path: "/order.html?id=o-1001", title: "Order" },
  { ui: "Client Portal", path: "/help.html", title: "Help" },
  { ui: "Admin Portal", path: "/orders.html", title: "Orders" },
];
const PAGES_2 = [
  { ui: "Client Portal", path: "/my-orders.html", title: "My orders" },
  { ui: "Client Portal", path: "/order.html?id=o-2002", title: "Order" },
  { ui: "Client Portal", path: "/invoices.html", title: "Invoices" },
  { ui: "Admin Portal", path: "/orders.html", title: "Orders" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test("a run teaches memory and the next run uses it: context, change detection, trend, citations and false alarms", async () => {
  // ---------------- run 1 ----------------
  const fx = makeRunWithData({ pages: PAGES_1, endpoints: ["GET /orders", "GET /orders/{id}", "GET /legacy"], admin: { biggest_risk: "Orders can be read across companies." } });
  const learned = await cli(fx.home, "memory", "learn", "--run", fx.runId, "--type", "test-tip", "--area", "Orders / access", "--text", "Change the order number in the address to test whether another company's order can be opened.", "--confidence", "6");
  assert.equal(learned.code, 0, JSON.stringify(learned.json));
  assert.equal(learned.json.id, "L-001");
  const quirk = await cli(fx.home, "memory", "learn", "--run", fx.runId, "--type", "env-quirk", "--area", "Reports", "--text", "The sales report needs about five seconds to appear; wait for the heading before reading figures.");
  assert.equal(quirk.json.action, "created");
  const dup = await cli(fx.home, "memory", "learn", "--run", fx.runId, "--type", "test-tip", "--area", "orders", "--text", "To test whether another company's order can be opened, change the order number in the address.");
  assert.equal(dup.json.action, "merged", "a near copy confirms the existing learning instead of adding one");
  const fa = await cli(fx.home, "memory", "false-alarm", "--run", fx.runId, "--area", "Orders / lists", "--symptom", "The orders table scrolls sideways inside its own box on a phone", "--reason", "Wide tables scrolling inside their container is the intended design.", "--source", "owner");
  assert.equal(fa.json.id, "FA-001");

  // safety: nothing with a credential or a real person's data gets in
  const leaked = await cli(fx.home, "memory", "learn", "--run", fx.runId, "--type", "pitfall", "--area", "Login", "--text", `Signing in works with the password ${DEMO_ENV["QA_ADMIN_PASS"]} for the admin account.`);
  assert.equal(leaked.code, 1);
  assert.match(leaked.json.error, /Refusing to save this learning.*password/);

  assert.equal((await cli(fx.home, "report", "build", "--run", fx.runId)).code, 0);
  const lint1 = await cli(fx.home, "report", "lint", "--run", fx.runId);
  assert.equal(lint1.code, 0, JSON.stringify(lint1.json.errors));
  const fin1 = await cli(fx.home, "run", "finish", "--run", fx.runId);
  assert.equal(fin1.code, 0);
  assert.ok(fin1.json.memory_updated.some((l: string) => /Product map: 4 page\(s\) and 3 endpoint\(s\)/.test(l)));
  assert.equal(fin1.json.findings.length, 3, "the run summary keeps compact findings for regression mode");

  const mem = path.join(fx.store, "memory");
  for (const f of ["product-map.json", "risk-areas.json", "learnings.jsonl", "false-alarms.jsonl", "stack.json"]) assert.ok(fs.existsSync(path.join(mem, f)), f);
  assert.equal(JSON.parse(fs.readFileSync(path.join(mem, "product-map.json"), "utf8")).schema_version, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(mem, "risk-areas.json"), "utf8")).schema_version, 1);
  const tech1 = fs.readFileSync(path.join(fx.runDir, "TECHNICAL-REPORT.md"), "utf8");
  assert.match(tech1, /First run for this project/);
  assert.match(tech1, /- New learning L-001: Change the order number/);
  assert.match(tech1, /- Confirmed again L-001/);
  assert.match(tech1, /\*\*Memory after the run\*\*/);

  // ---------------- run 2: memory is used ----------------
  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { pages: PAGES_2, endpoints: ["GET /orders", "GET /orders/{id}", "GET /invoices"] });
  const ctx = (await cli(fx.home, "memory", "context", "--run", r2.runId)).json;
  assert.match(ctx.note, /Memory from 1 earlier run/);
  assert.ok(ctx.focus.some((f: string) => /Orders \/ access.*Test it early/.test(f)));
  assert.equal(ctx.learnings["test-tip"][0].id, "L-001");
  assert.equal(ctx.learnings["test-tip"][0].confidence, 7, "confirmed again by the duplicate");
  assert.equal(ctx.learnings["env-quirk"][0].id, "L-002");
  assert.equal(ctx.false_alarms[0].id, "FA-001");
  assert.equal(ctx.previous_findings.findings.length, 3);
  assert.equal(ctx.previous_findings.from_run, fx.runId);
  assert.equal(ctx.product_map.pages, 4);
  assert.equal(ctx.risk_areas[0].area, "Orders / access");

  // citing what exists is accepted; citing what does not exist is refused
  assert.equal((await cli(fx.home, "memory", "applied", "--run", r2.runId, "--ids", "L-001,L-002,FA-001")).code, 0);
  const bad = await cli(fx.home, "memory", "applied", "--run", r2.runId, "--ids", "L-001,L-777");
  assert.equal(bad.code, 1);
  assert.match(bad.json.error, /L-777/);
  assert.deepEqual(readMemoryLog(r2.runDir).filter((e) => e.kind === "learning-applied").map((e) => e.id), ["L-001", "L-002", "L-001"]);

  // an owner-confirmed false alarm cannot be re-reported; the override needs a reason
  addFalseAlarm(fx.store, { area: "Orders / display", symptom: "Zero discount shown as -$0.00", reason: "Shown that way on purpose.", source: "owner" });
  const data = JSON.parse(fs.readFileSync(path.join(r2.runDir, "data", "findings.json"), "utf8"));
  await cli(fx.home, "report", "build", "--run", r2.runId);
  const bounced = await cli(fx.home, "report", "lint", "--run", r2.runId);
  assert.equal(bounced.code, 1);
  assert.ok(bounced.json.errors.some((e: string) => /ISSUE-003 resembles known false alarm FA-002/.test(e)), bounced.json.errors.join("\n"));
  data[2].not_a_known_false_alarm = "This time it is the wrong sign on a non-zero discount.";
  writeJson(path.join(r2.runDir, "data", "findings.json"), data);
  const meta = JSON.parse(fs.readFileSync(path.join(r2.runDir, "data", "meta.json"), "utf8"));
  meta.memory_applied = ["Applied learning L-099 to test access"];
  writeJson(path.join(r2.runDir, "data", "meta.json"), meta);
  await cli(fx.home, "report", "build", "--run", r2.runId);
  const invented = await cli(fx.home, "report", "lint", "--run", r2.runId);
  assert.ok(invented.json.errors.some((e: string) => /cites L-099, which does not exist/.test(e)));
  meta.memory_applied = ["Applied learning L-001 to test access: changed the order number in the address"];
  writeJson(path.join(r2.runDir, "data", "meta.json"), meta);
  await cli(fx.home, "report", "build", "--run", r2.runId);
  const ok = await cli(fx.home, "report", "lint", "--run", r2.runId);
  assert.equal(ok.code, 0, ok.json.errors?.join("\n"));

  // change detection and trend in both reports
  const tech2 = fs.readFileSync(path.join(r2.runDir, "TECHNICAL-REPORT.md"), "utf8");
  assert.match(tech2, /Page seen for the first time: Client Portal `\/invoices\.html` \(Invoices\)/);
  assert.match(tech2, /Page not seen this run: Client Portal `\/help\.html` \(Help\)/);
  assert.match(tech2, /New endpoint: `GET \/invoices`/);
  assert.ok(!/Page seen for the first time: Client Portal `\/order\.html/.test(tech2), "an order page with another id is the same page");
  assert.match(tech2, new RegExp(`\\| ${fx.runId} \\| full \\| 1 \\| 1 \\| 1 \\|`), "the trend table has the previous run");
  assert.match(tech2, /Applied learning L-001: \(Orders \/ access\)/);
  assert.equal((tech2.match(/changed the order number in the address/g) ?? []).length, 1, "the agent's line appears once");
  assert.match(tech2, /Applied learning L-001: [^\n]*\n  - In this run: Applied learning L-001 to test access: changed the order number in the address/, "nested under the verified entry");
  assert.match(tech2, /Skipped known false alarm FA-001/);
  const admin2 = fs.readFileSync(path.join(r2.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(admin2, /## What changed since the last check\n\n- Seen for the first time: the "Invoices" screen in the Client Portal \(it is new, or the earlier check did not reach it\)\./);
  assert.match(admin2, /Not found this time: the "Help" screen in the Client Portal/);
  assert.match(admin2, /Key journeys fully checked: 4 of 5 this time, 4 of 5 last time\./);
  assert.ok(!/Parts of the product checked in full/.test(admin2), "the number of coverage rows is not a trend");
  assert.match(tech2, /\| Key journeys tested \|/, "the technical trend table has the journeys column");
  assert.match(tech2, new RegExp(`\\| ${fx.runId} \\| full \\| 1 \\| 1 \\| 1 \\| \\d+ \\| 4/5 \\|`), "the previous run's journeys are in its row");
  assert.ok(!/invoices\.html|GET \/invoices/.test(admin2), "no paths or request methods in plain wording");

  const fin2 = await cli(fx.home, "run", "finish", "--run", r2.runId);
  assert.equal(fin2.code, 0);
  const finalAdmin = fs.readFileSync(path.join(r2.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(finalAdmin, /Seen for the first time: the "Invoices" screen/, "after finish memory is updated, but the report still shows what changed");
  const map = JSON.parse(fs.readFileSync(path.join(memDir(fx.store), "product-map.json"), "utf8"));
  assert.equal(map.last_run, r2.runId);
  assert.ok(map.uis["Client Portal"].pages["/invoices.html"]);
  assert.equal(map.uis["Client Portal"].pages["/my-orders.html"].first_seen, fx.runId);
  const risk = JSON.parse(fs.readFileSync(path.join(memDir(fx.store), "risk-areas.json"), "utf8"));
  assert.equal(risk.areas.find((a: { area: string }) => a.area === "Orders / access").events.length, 2, "frequency: the area had a problem in both runs");
  assert.equal(JSON.parse(fs.readFileSync(path.join(memDir(fx.store), "false-alarms.jsonl"), "utf8").split("\n")[1]!).hits, 1, "the skipped false alarm was counted");

  // memory has no secrets: nothing in the whole store contains a test credential
  for (const file of walk(fx.store)) {
    const text = fs.readFileSync(file, "utf8");
    for (const [k, v] of Object.entries(DEMO_ENV)) if (/PASS/.test(k)) assert.ok(!text.includes(v), `${path.relative(fx.store, file)} contains a password`);
  }
});

const memDir = (store: string) => path.join(store, "memory");

test("a quick run never claims pages are gone, and the admin report says so", async () => {
  const fx = makeRunWithData({ pages: PAGES_1 });
  await cli(fx.home, "report", "build", "--run", fx.runId);
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { mode: "quick", pages: [PAGES_1[0]!] });
  await cli(fx.home, "report", "build", "--run", r2.runId);
  const admin = fs.readFileSync(path.join(r2.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(admin, /Nothing new or removed: the same screens and functions as last time\./);
  assert.match(admin, /Screens that were not visited are not listed as gone, because this was not a full check\./);
  assert.ok(!/Not found this time/.test(admin));
});

test("a project whose memory is newer than this QAMind is refused at the CLI with an instruction to update", async () => {
  const fx = makeRunWithData({ pages: PAGES_1 });
  writeJson(path.join(memDir(fx.store), "risk-areas.json"), { schema_version: 99, areas: [] });
  await cli(fx.home, "report", "build", "--run", fx.runId);
  const fin = await cli(fx.home, "run", "finish", "--run", fx.runId);
  assert.equal(fin.code, 1);
  assert.match(fin.json.error, /newer QAMind.*Update QAMind/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(memDir(fx.store), "risk-areas.json"), "utf8")).schema_version, 99, "the newer file was not touched");
  assert.ok(!fs.existsSync(path.join(memDir(fx.store), "product-map.json")), "and nothing else was written either: memory is never half-updated");
  assert.ok(!fs.existsSync(path.join(fx.store, "memory", "runs", `${fx.runId}.json`)), "the run was not recorded as finished");
});
