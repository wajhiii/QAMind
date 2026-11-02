import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PENDING_FILE, genericProblems, listPendingLessons, proposeLesson, MAX_PENDING } from "../../core/lib/memory/lessons.ts";
import { lockFile, withStoreLock } from "../../core/lib/memory/lock.ts";
import { MIGRATIONS, ensureMigrated, migrateStore, resetMigrationMemo } from "../../core/lib/memory/migrate.ts";
import type { Migration } from "../../core/lib/memory/migrate.ts";
import { MAX_PAGES, recordObservations } from "../../core/lib/memory/observations.ts";
import { flagRisk, loadRisk, recordRisk, scoreAreas } from "../../core/lib/memory/risk.ts";
import { MemoryTooNewError, memoryPaths, readJsonl, writeJsonl } from "../../core/lib/memory/store.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { startRun } from "../../core/lib/run.ts";
import { makeConfiguredProject, tmp } from "./helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const T0 = new Date("2026-11-01T00:00:00Z");

const storeDir = () => {
  const s = tmp("qamind-store-");
  fs.mkdirSync(path.join(s, "memory", "runs"), { recursive: true });
  return s;
};

// ------------------------------------------------------------------------------------------------ the lock

test("the store lock makes read-modify-write safe across processes (nothing is lost)", async () => {
  const store = storeDir();
  const counter = path.join(store, "counter.txt");
  fs.writeFileSync(counter, "0");
  const workers = 5;
  const each = 15;
  const results = await Promise.all(
    Array.from({ length: workers }, () => new Promise<number>((resolve) => spawn(process.execPath, [path.join(here, "fixtures", "lock-worker.ts"), store, counter, String(each)], { stdio: "ignore" }).on("exit", (c) => resolve(c ?? 1)))),
  );
  assert.deepEqual(results, new Array(workers).fill(0), "every worker finished cleanly");
  assert.equal(Number(fs.readFileSync(counter, "utf8")), workers * each, "no update was lost");
  assert.ok(!fs.existsSync(lockFile(store)), "the lock is released");
});

test("the lock is re-entrant, released after an error, and a dead owner's lock is taken over", () => {
  const store = storeDir();
  assert.equal(withStoreLock(store, () => withStoreLock(store, () => "inner")), "inner");
  assert.throws(() => withStoreLock(store, () => { throw new Error("boom"); }), /boom/);
  assert.ok(!fs.existsSync(lockFile(store)), "released even though the work failed");

  const dead = spawnSync(process.execPath, ["-e", ""]).pid as number; // a process that has already exited
  fs.mkdirSync(path.dirname(lockFile(store)), { recursive: true });
  fs.writeFileSync(lockFile(store), JSON.stringify({ pid: dead, at: "2026-01-01T00:00:00Z" }));
  assert.equal(withStoreLock(store, () => "took over"), "took over");
});

// ------------------------------------------------------------------------------------------------ migrations

const renameText: Migration = { id: "learnings-1-to-2", file: "learnings", from: 1, to: 2, describe: "text becomes statement", up: (r) => ({ ...r, statement: r["text"], text: undefined as never }), removes: ["text"] };
const addNote: Migration = { id: "risk-1-to-2", file: "risk-areas", from: 1, to: 2, describe: "adds a note field", up: (r) => ({ ...r, note: "" }) };
const touchRuns: Migration = { id: "runs-1-to-2", file: "run-summary", from: 1, to: 2, describe: "marks old run summaries", up: (r) => ({ ...r, migrated: true }) };

function seedV1(store: string): void {
  const p = memoryPaths(store);
  writeJsonl(p.learnings, "learnings", [{ id: "L-001", type: "test-tip", area: "Orders", text: "Wait for the list to load.", confidence: 6 }], ["{ not json"]);
  // These tests pretend format 1 is the oldest and 2 the newest: stamp the file as an old QAMind would have.
  fs.writeFileSync(p.learnings, fs.readFileSync(p.learnings, "utf8").replace(/"schema_version":\d+/, '"schema_version":1'));
  fs.appendFileSync(p.learnings, "# a hand-written note\n");
  writeJson(p.riskAreas, { schema_version: 1, updated: "x", areas: [{ area: "Orders", events: [] }] });
  writeJson(path.join(p.runs, "run-1.json"), { schema_version: 1, run_id: "run-1" });
}

test("a migration backs up first, keeps every record and unreadable line, logs what it did, and is idempotent", () => {
  const store = storeDir();
  seedV1(store);
  const before = fs.readFileSync(memoryPaths(store).learnings, "utf8");
  const r = migrateStore(store, { migrations: [renameText, addNote, touchRuns], target: 2, now: T0 });
  assert.deepEqual(r.migrated.map((m) => m.file).sort(), ["memory/learnings.jsonl", "memory/risk-areas.json", "memory/runs/run-1.json"]);

  const lines = fs.readFileSync(memoryPaths(store).learnings, "utf8").split("\n");
  assert.deepEqual(JSON.parse(lines[0] as string), { _meta: { schema_version: 2, kind: "learnings" } });
  assert.deepEqual(JSON.parse(lines[1] as string), { id: "L-001", type: "test-tip", area: "Orders", confidence: 6, statement: "Wait for the list to load." });
  assert.ok(lines.includes("{ not json"), "a line that was not valid JSON is kept as written");
  assert.ok(lines.includes("# a hand-written note"), "comments are kept");
  assert.equal(JSON.parse(fs.readFileSync(memoryPaths(store).riskAreas, "utf8")).schema_version, 2);

  const backup = r.backup as string;
  assert.equal(fs.readFileSync(path.join(backup, "memory", "learnings.jsonl"), "utf8"), before, "the backup is the file as it was");
  assert.ok(backup.startsWith(path.join(store, "backups")));
  const log = fs.readFileSync(path.join(store, "backups", "migrations.log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(log.map((e) => e.migrations[0]).sort(), ["learnings-1-to-2", "risk-1-to-2", "runs-1-to-2"]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(memoryPaths(store).runs, "run-1.json"), "utf8")).migrated, true);

  assert.deepEqual(migrateStore(store, { migrations: [renameText, addNote, touchRuns], target: 2 }), { migrated: [] }, "nothing left to do the second time");
});

test("a migration that would silently drop a field is refused before anything is written", () => {
  const store = storeDir();
  seedV1(store);
  const lossy: Migration = { id: "lossy", file: "learnings", from: 1, to: 2, describe: "drops confidence", up: ({ confidence: _c, ...rest }) => rest };
  const before = fs.readFileSync(memoryPaths(store).learnings, "utf8");
  assert.throws(() => migrateStore(store, { migrations: [lossy, addNote, touchRuns], target: 2 }), /silently drop confidence/);
  assert.equal(fs.readFileSync(memoryPaths(store).learnings, "utf8"), before);
  assert.equal(JSON.parse(fs.readFileSync(memoryPaths(store).riskAreas, "utf8")).schema_version, 1, "the other file was not migrated either");
  assert.ok(!fs.existsSync(path.join(store, "backups")), "no backup is made for a refused migration");
});

test("memory from a newer QAMind is refused as a whole, and a gap in the migration chain is reported", () => {
  const store = storeDir();
  seedV1(store);
  writeJson(memoryPaths(store).productMap, { schema_version: 9 });
  assert.throws(() => migrateStore(store, { migrations: [renameText, addNote, touchRuns], target: 2 }), MemoryTooNewError);
  assert.equal(JSON.parse(fs.readFileSync(memoryPaths(store).riskAreas, "utf8")).schema_version, 1, "nothing was touched");
  fs.rmSync(memoryPaths(store).productMap);
  assert.throws(() => migrateStore(store, { migrations: [renameText], target: 2 }), /No migration from risk-areas schema 1/);
});

test("files with no recorded version (hand-written) are left alone, and the shipped migrations cover every kind of file", () => {
  const store = storeDir();
  fs.writeFileSync(memoryPaths(store).learnings, '{"id":"L-001","type":"test-tip","area":"A","text":"Hand written learning without a header.","confidence":5}\n');
  assert.deepEqual([...new Set(MIGRATIONS.map((m) => m.file))].sort(), ["false-alarms", "fix-log", "learnings", "product-map", "risk-areas", "run-summary", "stack"], "every kind of memory file has its step from format 1");
  assert.ok(MIGRATIONS.every((m) => m.from === 1 && m.to === 2));
  assert.deepEqual(migrateStore(store), { migrated: [] });
  assert.equal(readJsonl(memoryPaths(store).learnings).records.length, 1);
});

test("starting a run on a store written by a newer QAMind is refused with a message that says to update", () => {
  resetMigrationMemo();
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject({ remote: "https://github.com/acme/shop.git" });
  const first = startRun({ cwd: proj, mode: "quick", kind: "qa-only", host: "test", home, env: {}, now: T0 });
  assert.equal(first.status, "ready");
  const store = first.project?.store as string;
  fs.rmSync(path.join(store, "state", "run-marker.json"));
  writeJson(memoryPaths(store).riskAreas, { schema_version: 9, updated: "x", areas: [] });
  resetMigrationMemo();
  assert.throws(() => startRun({ cwd: proj, mode: "quick", kind: "qa-only", host: "test", home, env: {}, now: T0 }), /newer QAMind.*Update QAMind/);
  assert.ok(!fs.existsSync(path.join(store, "state", "run-marker.json")), "no run was started");
  resetMigrationMemo();
  assert.deepEqual(ensureMigrated(tmp("qamind-store-")), { migrated: [] });
});

// ------------------------------------------------------------------------------------------------ flagged risk

test("a flagged risk area is idempotent per run, survives run finish when no finding covers it, and stands down when one does", () => {
  const store = storeDir();
  flagRisk(store, "run-1", T0, { area: "Reports / totals", severity: "important", note: "figures flicker" });
  const again = flagRisk(store, "run-1", T0, { area: "reports  / TOTALS", severity: "minor" });
  assert.equal(again.replaced, true);
  assert.equal(again.events_for_run.length, 1, "flagging again replaces, never doubles");

  recordRisk(store, "run-1", T0, [{ area: "Orders / access", severity: "critical" }]);
  const kept = loadRisk(store).areas.find((a) => a.area === "Reports / totals");
  assert.equal(kept?.events[0]?.source, "agent", "the flag is still there after the run's findings were recorded");

  recordRisk(store, "run-1", T0, [{ area: "Reports / totals", severity: "critical" }]);
  const events = loadRisk(store).areas.find((a) => a.area === "Reports / totals")?.events ?? [];
  assert.deepEqual(events.map((e) => [e.severity, e.source ?? "finding"]), [["critical", "finding"]], "the finding replaced the flag for the same run");

  recordRisk(store, "run-1", T0, [{ area: "Reports / totals", severity: "critical" }]);
  assert.equal(scoreAreas(loadRisk(store), T0).find((a) => a.area === "Reports / totals")?.occurrences, 1, "recording the same run twice does not double count");
});

// ------------------------------------------------------------------------------------------------ observations

test("observed pages are normalised, merged, stripped of query strings and bounded; bad input says what is wrong", () => {
  const runDir = tmp("qamind-run-");
  const r1 = recordObservations(runDir, { pages: [{ ui: "Client Portal", path: "http://127.0.0.1:4102/order.html?id=o-1&token=abc123def456", title: "Order" }, { path: "/order.html?id=o-2" }, { ui: "Client Portal", path: "/my-orders.html", roles: ["acme-1"] }] }, { defaultUi: "Client Portal" });
  assert.deepEqual([r1.pages_added, r1.pages_total], [2, 2], "two ids of one page are one page");
  const stored = JSON.parse(fs.readFileSync(path.join(runDir, "data", "pages.json"), "utf8"));
  assert.deepEqual(stored.map((p: { path: string }) => p.path), ["/order.html", "/my-orders.html"]);
  assert.ok(!JSON.stringify(stored).includes("token"), "the query string is dropped");

  const r2 = recordObservations(runDir, { pages: [{ ui: "Client Portal", path: "/my-orders.html", roles: ["acme-2"], title: "My orders" }], endpoints: ["get /orders?x=1", "POST /orders"] }, { defaultUi: "Client Portal" });
  assert.equal(r2.pages_added, 0);
  const merged = JSON.parse(fs.readFileSync(path.join(runDir, "data", "pages.json"), "utf8"));
  assert.deepEqual(merged[1], { ui: "Client Portal", path: "/my-orders.html", title: "My orders", roles: ["acme-1", "acme-2"] }, "roles and a late title are merged in");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runDir, "data", "endpoints.json"), "utf8")), ["GET /orders", "POST /orders"]);

  assert.throws(() => recordObservations(runDir, { endpoints: ["orders"] }, { defaultUi: "x" }), /is not an endpoint.*METHOD \/path/);
  assert.throws(() => recordObservations(runDir, { pages: Array.from({ length: MAX_PAGES + 1 }, (_, i) => ({ ui: "u", path: `/p${i}.html` })) }, { defaultUi: "x" }), /more than 300 distinct pages/);
});

test("a page title with personal data is dropped with a warning (the page is still recorded); a secret in a path is refused", () => {
  const runDir = tmp("qamind-run-");
  const r = recordObservations(runDir, { pages: [{ ui: "Admin", path: "/customer.html", title: "Customer jane.doe@gmail.com" }] }, { defaultUi: "Admin" });
  assert.equal(r.pages_added, 1);
  assert.match(r.warnings.join(" "), /title of Admin \/customer\.html was not saved/);
  assert.ok(!fs.readFileSync(path.join(runDir, "data", "pages.json"), "utf8").includes("jane.doe"));
  assert.throws(() => recordObservations(runDir, { pages: [{ ui: "Admin", path: "/reset/pw-admin-1234" }] }, { defaultUi: "Admin", knownSecrets: ["pw-admin-1234"] }), /looks like a secret/);
});

// ------------------------------------------------------------------------------------------------ global lessons

test("a lesson must be generic: addresses, files, tickets, code and this project's names are refused, all at once", () => {
  const ctx = { projectNames: ["Lumen Supplies", "shop"], now: T0 };
  const ok = "Date pickers often break across time zones: test a booking made near midnight.";
  assert.deepEqual(genericProblems(ok, ctx), []);
  assert.match(genericProblems("Open https://staging.lumen.test/orders and check the order list", ctx).join(" "), /web address/);
  assert.match(genericProblems("The bug is in src/orders.js, see ABC-123", ctx).join(" "), /file path.*ticket|ticket.*file path/);
  assert.match(genericProblems("Call getOrder(id); then check `status`", ctx).join(" "), /code/);
  assert.match(genericProblems("Lumen Supplies totals are wrong near the discount threshold", ctx).join(" "), /names this project \("Lumen Supplies"\)/);
  assert.match(genericProblems("Sign-in at 10.0.0.12 is slow", ctx).join(" "), /host name or IP/);
  assert.equal(genericProblems("A shopping basket should keep its items after sign-in", ctx).length, 0, "a short project name inside another word is not a match");
});

test("a proposed lesson goes to the pending list with its reason, is not added twice, and is bounded", () => {
  const home = tmp("qamind-home-");
  const a = proposeLesson(home, { text: "Date pickers often break across time zones: test a booking made near midnight.", reason: "Seen as an off-by-one-day order date.", area: "Forms" }, { now: T0 });
  assert.deepEqual([a.action, a.id, a.pending], ["proposed", "P-001", 1]);
  const text = fs.readFileSync(path.join(home, PENDING_FILE), "utf8");
  assert.match(text, /Nothing here is used until you approve it/);
  assert.match(text, /## P-001 · 2026-11-01 · Forms\n- \*\*Lesson:\*\* Date pickers/);
  assert.match(text, /- \*\*Why:\*\* Seen as an off-by-one-day/);

  const dup = proposeLesson(home, { text: "Date pickers often break across time zones, so test a booking made near midnight.", reason: "Another product showed it too." }, { now: T0 });
  assert.deepEqual([dup.action, dup.id, dup.pending], ["existing", "P-001", 1]);

  fs.writeFileSync(path.join(home, "global-lessons.md"), "# Global lessons\n\n- **Lesson:** Search boxes should treat punctuation as plain text, never as a pattern.\n");
  assert.equal(proposeLesson(home, { text: "Search boxes should treat punctuation as plain text and never as a pattern.", reason: "Crashed on a bracket." }, { now: T0 }).action, "existing", "already approved lessons count as known");

  assert.throws(() => proposeLesson(home, { text: "Too short", reason: "no" }), /20 to 280 characters/);
  assert.throws(() => proposeLesson(home, { text: "Contact john.smith@gmail.com when the form fails to submit.", reason: "Seen on a form." }), /not generic.*email address/);
  assert.throws(() => proposeLesson(home, { text: "Check https://example.com/page when the form fails to submit.", reason: "Seen on a form." }), /not generic.*web address/);
  assert.throws(() => proposeLesson(home, { text: "Forms that echo the password pw-admin-1234 back are unsafe on any project.", reason: "Seen on a sign-in form." }, { knownSecrets: ["pw-admin-1234"] }), /Refusing to save this lesson/);

  for (let i = 2; i <= MAX_PENDING; i++) proposeLesson(home, { text: `Lesson number ${i} about unrelated topic${i} zebra${i * 7} quartz${i * 13}.`, reason: "Filling the list for the test." }, { now: T0 });
  assert.equal(listPendingLessons(home).length, MAX_PENDING);
  assert.throws(() => proposeLesson(home, { text: "One more completely different observation about carts and coupons.", reason: "Over the cap." }), /already 100 pending lessons/);
});
