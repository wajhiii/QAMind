import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { learn } from "../../core/lib/memory/learnings.ts";
import { resetMigrationMemo } from "../../core/lib/memory/migrate.ts";
import { memoryPaths } from "../../core/lib/memory/store.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { INSTRUCTIONS, createServer } from "../../core/mcp/qa-memory/server.ts";
import { ALL_QA_TOOLS } from "../../core/mcp/servers.ts";
import { DEMO_ENV, makeConfiguredProject, makeRunWithData, tmp, writeFixtureData } from "./helpers.ts";

const NOW = new Date("2026-10-30T11:00:00Z");

async function connect(opts: { home: string; cwd: string; env?: NodeJS.ProcessEnv }) {
  resetMigrationMemo();
  const server = createServer({ home: opts.home, cwd: opts.cwd, env: opts.env ?? {}, now: () => NOW });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>)[0]?.text ?? "";
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { isError: !!r.isError, text, json };
  };
  return { client, call, close: () => client.close() };
}

const listFilesUnder = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name)) : []);

// ------------------------------------------------------------------------------------------------ what the server offers

test("the server offers exactly the documented tools, each described, annotated, and with bounded inputs", async () => {
  const fx = makeRunWithData();
  const { client, close } = await connect({ home: fx.home, cwd: fx.proj });
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map((t) => t.name).sort(), [...ALL_QA_TOOLS].sort());
  assert.match(client.getInstructions() ?? "", /Call run_start first/);
  assert.equal(INSTRUCTIONS.includes("Memory is leads, not proof"), true);

  const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name).sort();
  assert.deepEqual(readOnly, ["fix_status", "memory_get_context", "memory_list", "run_history"]);
  // Only the tools that run the project's own test commands can reach beyond QAMind's folders, and only fix_revert removes edits.
  const runsProjectCode = ["fix_preflight", "fix_run_suite", "fix_run_tests"];
  for (const t of tools) {
    assert.ok((t.description ?? "").length >= 60, `${t.name} needs a real description`);
    assert.equal(t.annotations?.openWorldHint, runsProjectCode.includes(t.name), `${t.name}: open-world hint`);
    assert.equal(t.annotations?.destructiveHint, t.name === "fix_revert", `${t.name}: destructive hint`);
  }

  // Size limits are part of the contract: every free-text field and list is bounded in the schema the host shows the model.
  const unbounded: string[] = [];
  const walk = (node: any, where: string): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "string" && !node.enum && node.maxLength === undefined && node.pattern === undefined) unbounded.push(`${where} (string without a limit)`);
    if (node.type === "array" && node.maxItems === undefined) unbounded.push(`${where} (array without maxItems)`);
    for (const [k, v] of Object.entries(node.properties ?? {})) walk(v, `${where}.${k}`);
    if (node.items) walk(node.items, `${where}[]`);
  };
  for (const t of tools) walk(t.inputSchema, t.name);
  assert.deepEqual(unbounded, []);
  await close();
});

// ------------------------------------------------------------------------------------------------ a whole run through the tools

test("a run goes start to finish through the tools, and the next run sees what this one saved", async () => {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject({ remote: "https://github.com/acme/shop.git" });
  const { call, close } = await connect({ home, cwd: proj });

  const lost = await connect({ home, cwd: tmp("not-a-project-") });
  const noProject = await lost.call("run_start", {});
  assert.equal(noProject.isError, false, "a run that cannot start is an answer, not a tool failure");
  assert.equal(noProject.json.status, "no-project");
  await lost.close();

  const started = await call("run_start", { mode: "full", session: "sess-1", host: "test" });
  assert.equal(started.json.status, "ready", started.text);
  const runId = started.json.run.id as string;
  writeFixtureData(started.json.run.dir);
  assert.equal(started.json.config.critical_flows.length, 5);

  const ctx = await call("memory_get_context", { run: runId });
  assert.match(ctx.json.note, /first run/i);

  const saved = await call("memory_save_learning", { run: runId, type: "test-tip", area: "Orders / search", text: "Wait for the orders list to finish loading before counting rows." });
  assert.deepEqual([saved.json.action, saved.json.id, saved.json.confidence], ["created", "L-001", 5]);
  const merged = await call("memory_save_learning", { run: runId, type: "test-tip", area: "Orders / search", text: "Wait for the order list to finish loading before you count rows." });
  assert.deepEqual([merged.json.action, merged.json.id, merged.json.confidence], ["merged", "L-001", 6], "a near copy is merged, not stored twice");
  assert.equal((await call("memory_adjust_learning", { run: runId, id: "L-001", direction: "contradict" })).json.confidence, 4);

  const alarm = await call("memory_mark_false_alarm", { run: runId, area: "Orders / display", symptom: "A zero discount is shown as -$0.00 in the order totals", reason: "The owner says it is shown that way on purpose.", source: "owner" });
  assert.deepEqual([alarm.json.action, alarm.json.id], ["created", "FA-001"]);
  const alarmAgain = await call("memory_mark_false_alarm", { run: runId, area: "Orders / display", symptom: "The order totals show a zero discount as -$0.00", reason: "Known, accepted behaviour." });
  assert.deepEqual([alarmAgain.json.action, alarmAgain.json.id], ["existing", "FA-001"]);

  const applied = await call("memory_record_applied", { run: runId, ids: ["L-001", "FA-001", "L-001"] });
  assert.equal(applied.isError, false);
  const notReal = await call("memory_record_applied", { run: runId, ids: ["L-001", "L-777"] });
  assert.equal(notReal.isError, true);
  assert.match(notReal.json.error, /L-777.*Nothing was recorded/);

  const risk = await call("memory_update_risk", { run: runId, area: "Reports / totals", severity: "important", note: "Figures flicker before settling." });
  assert.equal(risk.json.replaced_earlier_flag, false);
  assert.equal((await call("memory_update_risk", { run: runId, area: "reports / totals", severity: "minor" })).json.replaced_earlier_flag, true);

  const map = await call("memory_update_product_map", { run: runId, pages: [{ ui: "Client Portal", path: "/my-orders.html", title: "My orders" }, { ui: "Client Portal", path: "http://127.0.0.1:4102/order.html?id=o-7" }], endpoints: ["GET /orders"] });
  assert.deepEqual([map.json.pages_added, map.json.pages_total, map.json.endpoints_added], [2, 2, 1]);
  assert.equal(map.json.changes_so_far.first_run, true);

  const lesson = await call("lessons_propose", { run: runId, text: "Date pickers often break across time zones: test a booking made near midnight.", reason: "Seen as an off-by-one-day order date." });
  assert.deepEqual([lesson.json.action, lesson.json.id], ["proposed", "P-001"]);
  assert.ok(fs.existsSync(path.join(home, "pending-lessons.md")));

  const finished = await call("run_finish", { run: runId, stop_reason: "completed" });
  assert.equal(finished.isError, false, finished.text);
  assert.equal(finished.json.journeys.total, 5);
  assert.ok(finished.json.memory_updated.some((l: string) => /Product map: 2 page/.test(l)));
  assert.match(fs.readFileSync(path.join(started.json.run.dir, "TECHNICAL-REPORT.md"), "utf8"), /Flagged risk area[^\n]*Reports \/ totals/);

  const history = await call("run_history", { limit: 3 });
  assert.equal(history.json.runs.length, 1);
  assert.equal(history.json.runs[0].run_id, runId);
  assert.equal(history.json.runs[0].findings, undefined, "findings only when asked for");
  assert.ok((await call("run_history", { include_findings: true })).json.runs[0].findings.length >= 1);

  // The next run (here: reading outside any run, by project folder) sees what was saved.
  const after = await call("memory_get_context", {});
  assert.equal(after.json.project.root, fs.realpathSync(proj));
  assert.deepEqual(after.json.learnings["test-tip"].map((l: { id: string }) => l.id), ["L-001"]);
  assert.equal(after.json.false_alarms.length, 1);
  assert.ok(after.json.risk_areas.some((a: { area: string }) => a.area === "Reports / totals"), "the flagged area survived run_finish");
  assert.equal((await call("memory_list", { what: "map" })).json.uis["Client Portal"].pages.total, 2);
  await close();
});

test("outside a run the project comes from the host's project folder, not the server's working folder", async () => {
  const fx = makeRunWithData();
  const { call, close } = await connect({ home: fx.home, cwd: tmp("elsewhere-"), env: { CLAUDE_PROJECT_DIR: fx.proj } });
  const r = await call("memory_get_context", {});
  assert.equal(r.json.project.root, fs.realpathSync(fx.proj));
  const wrong = await call("memory_get_context", { project: path.join(fx.proj, "no-such-folder") });
  assert.equal(wrong.isError, true);
  assert.match(wrong.json.error, /does not exist/);
  await close();
});

// ------------------------------------------------------------------------------------------------ validation and limits

test("invalid input is refused with the field and the limit named, and nothing is saved", async () => {
  const fx = makeRunWithData();
  const { call, close } = await connect({ home: fx.home, cwd: fx.proj });
  const bad: Array<[string, Record<string, unknown>, RegExp]> = [
    ["memory_save_learning", { run: fx.runId, type: "nonsense", area: "Orders", text: "Wait for the list to finish loading." }, /expected one of.*at type/s],
    ["memory_save_learning", { run: fx.runId, type: "test-tip", area: "Orders", text: "too short" }, /text must be at least 12 characters/],
    ["memory_save_learning", { run: fx.runId, type: "test-tip", area: "Orders", text: "x".repeat(401) }, /text must be at most 400 characters/],
    ["memory_save_learning", { run: fx.runId, type: "test-tip", area: "A".repeat(121), text: "Wait for the list to finish loading." }, /area must be at most 120 characters/],
    ["memory_save_learning", { run: fx.runId, type: "test-tip", area: "Orders", text: "Wait for the \u0007 list to finish loading." }, /text contains control characters/],
    ["memory_save_learning", { run: "../../etc/passwd", type: "test-tip", area: "Orders", text: "Wait for the list to finish loading." }, /run id printed by run_start/],
    ["memory_save_learning", { run: fx.runId, type: "test-tip", area: "Orders", text: "Wait for the list to finish loading.", confidence: 11 }, /confidence/],
    ["memory_adjust_learning", { run: fx.runId, id: "FA-001", direction: "confirm" }, /learning id such as L-012/],
    ["memory_record_applied", { run: fx.runId, ids: [] }, /ids/],
    ["memory_record_applied", { run: fx.runId, ids: Array.from({ length: 51 }, (_, i) => `L-${String(i + 1).padStart(3, "0")}`) }, /ids/],
    ["memory_update_risk", { run: fx.runId, area: "Orders", severity: "catastrophic" }, /severity/],
    ["memory_update_product_map", { run: fx.runId, pages: Array.from({ length: 101 }, (_, i) => ({ path: `/p${i}.html` })) }, /pages/],
    ["memory_update_product_map", { run: fx.runId, endpoints: ["orders"] }, /endpoint must be at least 5 characters|not an endpoint/],
    ["run_history", { limit: 99 }, /limit/],
    ["memory_list", { what: "everything" }, /what/],
    ["lessons_propose", { run: fx.runId, text: "short", reason: "short" }, /text must be at least 20 characters/],
  ];
  for (const [tool, args, expected] of bad) {
    const r = await call(tool, args);
    assert.equal(r.isError, true, `${tool} ${JSON.stringify(args).slice(0, 80)} should be refused`);
    assert.match(r.text, expected, `${tool}: ${r.text.slice(0, 200)}`);
  }
  assert.ok(!fs.existsSync(memoryPaths(fx.store).learnings), "no learning was written by any refused call");
  assert.ok(!fs.existsSync(path.join(fx.runDir, "data", "memory-log.json")), "nothing was logged either");
  await close();
});

test("a failed call says what to do next, in a form the agent can act on", async () => {
  const fx = makeRunWithData();
  const { call, close } = await connect({ home: fx.home, cwd: fx.proj });
  const unknownRun = await call("memory_save_learning", { run: "run-nope", type: "test-tip", area: "Orders", text: "Wait for the list to finish loading." });
  assert.deepEqual([unknownRun.isError, unknownRun.json.kind], [true, "error"]);
  assert.match(unknownRun.json.error, /No run "run-nope" found/);
  const notBug = await call("memory_save_learning", { run: fx.runId, type: "pitfall", area: "Orders", text: "Everything is fine here and nothing needs a fix at all." });
  assert.equal(notBug.isError, false, "ordinary text is accepted");
  const missing = await call("memory_adjust_learning", { run: fx.runId, id: "L-099", direction: "confirm" });
  assert.deepEqual([missing.isError, missing.json.error], [true, "No active learning L-099."]);
  // Contradicting takes 2 off the confidence (5 -> 3 -> 1) and below 3 the learning is archived, not deleted.
  assert.equal((await call("memory_adjust_learning", { run: fx.runId, id: "L-001", direction: "contradict" })).json.action, "contradicted");
  const archived = await call("memory_adjust_learning", { run: fx.runId, id: "L-001", direction: "contradict" });
  assert.deepEqual([archived.json.action, archived.json.confidence], ["contradicted-and-archived", 1]);
  assert.equal((await call("memory_list", { what: "learnings", run: fx.runId })).json.learnings.total, 0);
  assert.ok(fs.existsSync(path.join(memoryPaths(fx.store).archiveDir, "learnings.jsonl")));
  await close();
});

// ------------------------------------------------------------------------------------------------ redaction

test("secrets and personal data are refused everywhere text is saved, and appear in no file afterwards", async () => {
  const fx = makeRunWithData();
  const { call, close } = await connect({ home: fx.home, cwd: fx.proj });
  const password = DEMO_ENV["QA_ACME1_PASS"] as string;
  const refused: Array<[string, Record<string, unknown>]> = [
    ["memory_save_learning", { run: fx.runId, type: "pitfall", area: "Sign-in", text: `The acme sign-in accepts the password ${password} even after sign-out.` }],
    ["memory_save_learning", { run: fx.runId, type: "behavior", area: "Customers", text: "The customer record for jane.roe@gmail.com shows the wrong company name." }],
    ["memory_save_learning", { run: fx.runId, type: "behavior", area: "Payments", text: "The saved card 4242 4242 4242 4242 is shown in full on the order page." }],
    ["memory_save_learning", { run: fx.runId, type: "behavior", area: "Support", text: "Call the customer on +1 415 555 0132 to confirm the delivery window." }],
    ["memory_mark_false_alarm", { run: fx.runId, area: "Auth", symptom: "The API accepts Authorization: Bearer abcdefghijklmnopqrstuv for any user", reason: "Expected for this test token." }],
    ["memory_update_risk", { run: fx.runId, area: "Sign-in", severity: "minor", note: `Login with ${password} behaves oddly` }],
    ["lessons_propose", { run: fx.runId, text: `Password fields that echo ${password} back to the user are unsafe on any project.`, reason: "Seen on a sign-in form once." }],
  ];
  for (const [tool, args] of refused) {
    const r = await call(tool, args);
    assert.equal(r.isError, true, `${tool} should refuse`);
    assert.ok(["unsafe-text", "error"].includes(r.json.kind), r.text);
    assert.doesNotMatch(r.text, new RegExp(password), "the refusal never echoes the secret back");
  }
  const kept = await call("memory_update_product_map", { run: fx.runId, pages: [{ ui: "Admin Portal", path: "/customer.html", title: "Customer jane.roe@gmail.com" }] });
  assert.equal(kept.isError, false);
  assert.match(kept.json.warnings.join(" "), /title of Admin Portal \/customer\.html was not saved/);

  const leaks = [...listFilesUnder(fx.store), ...listFilesUnder(fx.runDir), ...listFilesUnder(fx.home)].filter((f) => /\.(json|jsonl|md|txt)$/.test(f)).filter((f) => {
    const t = fs.readFileSync(f, "utf8");
    return t.includes(password) || t.includes("jane.roe") || t.includes("4242 4242") || t.includes("555 0132") || t.includes("abcdefghijklmnop");
  });
  assert.deepEqual(leaks, [], "no secret or personal data in the store, the run folder or the lessons file");
  assert.ok(!fs.existsSync(memoryPaths(fx.store).learnings) && !fs.existsSync(memoryPaths(fx.store).falseAlarms), "nothing refused was saved");
  await close();
});

// ------------------------------------------------------------------------------------------------ bounds, newer memory, concurrency

test("memory stays bounded: 200 learnings at most, a context a host will accept, lists cut to the limit, the rest archived", async () => {
  const fx = makeRunWithData();
  for (let i = 1; i <= 205; i++) learn(fx.store, { type: i % 2 ? "test-tip" : "pitfall", area: `Area ${i % 17}`, text: `Learning ${i} concerns topic${i}x about zebra${i}y and quartz${i}z behaviour.`, run: fx.runId, confidence: 5 + (i % 4) }, { now: NOW });
  const { call, close } = await connect({ home: fx.home, cwd: fx.proj });
  const ctx = await call("memory_get_context", { run: fx.runId });
  assert.ok(ctx.text.length < 40_000, `context is ${ctx.text.length} characters`);
  const list = await call("memory_list", { what: "learnings", run: fx.runId, limit: 10 });
  assert.deepEqual([list.json.learnings.total, list.json.learnings.items.length, list.json.learnings.truncated], [200, 10, true]);
  assert.ok(fs.existsSync(path.join(memoryPaths(fx.store).archiveDir, "learnings.jsonl")), "the five over the cap were archived, not deleted");
  await close();
});

test("memory written by a newer QAMind is refused as a whole: the call fails, says to update, and nothing is written", async () => {
  const fx = makeRunWithData();
  writeJson(memoryPaths(fx.store).riskAreas, { schema_version: 99, updated: "x", areas: [] });
  const { call, close } = await connect({ home: fx.home, cwd: fx.proj });
  const save = await call("memory_save_learning", { run: fx.runId, type: "test-tip", area: "Orders", text: "Wait for the list to finish loading." });
  assert.deepEqual([save.isError, save.json.kind], [true, "memory-too-new"]);
  assert.match(save.json.error, /newer QAMind.*Update QAMind/);
  assert.equal((await call("memory_get_context", { run: fx.runId })).json.kind, "memory-too-new");
  assert.ok(!fs.existsSync(memoryPaths(fx.store).learnings), "memory was not half-updated");
  await close();
});

test("parallel calls do not lose or duplicate anything", async () => {
  const fx = makeRunWithData();
  const { call, close } = await connect({ home: fx.home, cwd: fx.proj });
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => call("memory_save_learning", { run: fx.runId, type: "behavior", area: `Area ${i}`, text: `Parallel learning ${i} concerns topic${i}q about zebra${i}w and quartz${i}e.` })));
  assert.ok(results.every((r) => !r.isError));
  assert.deepEqual(results.map((r) => r.json.id).sort(), Array.from({ length: 10 }, (_, i) => `L-${String(i + 1).padStart(3, "0")}`));
  assert.equal((await call("memory_list", { what: "learnings", run: fx.runId })).json.learnings.total, 10);
  await close();
});

test("global lessons through the server: only approved ones reach a run, a rejected near copy is refused, an approved one can be cited, nothing can approve", async () => {
  const fx = makeRunWithData();
  const { client, call, close } = await connect({ home: fx.home, cwd: fx.proj });
  const text = "Date pickers often break across time zones: test a booking made near midnight.";
  assert.equal((await call("lessons_propose", { run: fx.runId, text, reason: "Seen as an off-by-one-day order date." })).json.id, "P-001");
  assert.equal((await call("lessons_propose", { run: fx.runId, text: "Search boxes should treat punctuation as plain text, never as a pattern.", reason: "A bracket crashed one." })).json.id, "P-002");

  const before = await call("memory_get_context", { run: fx.runId });
  assert.deepEqual(before.json.global_lessons, [], "pending proposals are not lessons yet");
  assert.ok(!before.text.includes("Date pickers"), "and not in the answer anywhere");
  assert.equal((await call("memory_record_applied", { run: fx.runId, ids: ["G-001"] })).isError, true, "nothing approved yet, nothing to cite");

  // the owner decides, outside the server
  const { approveLesson, rejectLesson } = await import("../../core/lib/memory/lessons.ts");
  approveLesson(fx.home, "P-001", { now: NOW });
  rejectLesson(fx.home, "P-002", "not useful", NOW);
  const after = await call("memory_get_context", { run: fx.runId });
  assert.deepEqual(after.json.global_lessons, [{ id: "G-001", text }]);
  assert.ok(!after.text.includes("Search boxes"));
  assert.deepEqual((await call("memory_record_applied", { run: fx.runId, ids: ["G-001"] })).json, { applied: ["G-001"] });

  const again = await call("lessons_propose", { run: fx.runId, text: "Search boxes should treat punctuation as plain text and never as a pattern.", reason: "Seen again on another product." });
  assert.deepEqual([again.json.action, again.json.id], ["rejected-before", "P-002"]);
  assert.equal((await call("lessons_propose", { run: fx.runId, text, reason: "Seen again." })).json.action, "existing", "an approved lesson is not proposed again");

  const names = (await client.listTools()).tools.map((t) => t.name);
  assert.deepEqual(names.filter((n) => /approve|reject|prune|retire|archive/i.test(n)), [], "the server has no tool that approves, rejects or removes anything: that is the owner's");
  await close();
});
