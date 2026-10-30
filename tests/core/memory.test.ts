import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { addFalseAlarm, loadFalseAlarms, markFalseAlarmsSeen, matchFalseAlarms } from "../../core/lib/memory/falsealarms.ts";
import { LEARNINGS_CAP, adjustLearning, learn, loadLearnings, markApplied } from "../../core/lib/memory/learnings.ts";
import { applyObserved, computeChanges, describeChanges, humanizePath, loadMap, normalizePath, readObserved } from "../../core/lib/memory/productmap.ts";
import type { Observed, ProductMap } from "../../core/lib/memory/productmap.ts";
import { loadRisk, recordRisk, scoreAreas } from "../../core/lib/memory/risk.ts";
import { MEMORY_SCHEMA, MemoryTooNewError, memoryPaths, readJsonl, screenForSecretsAndPii, similarity, tokens, writeJsonl } from "../../core/lib/memory/store.ts";
import { lintAdminLanguage } from "../../core/lib/adminreport.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { tmp } from "./helpers.ts";

const storeDir = () => {
  const s = tmp("qamind-store-");
  fs.mkdirSync(path.join(s, "memory"), { recursive: true });
  return s;
};
const T0 = new Date("2026-10-01T00:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

// ---------------------------------------------------------------- storage and safety

test("jsonl memory tolerates hand edits, reports bad lines, keeps them on rewrite, and refuses a newer schema", () => {
  const s = storeDir();
  const file = memoryPaths(s).learnings;
  fs.writeFileSync(file, `# my notes\n\n{"id":"L-001","type":"test-tip","area":"orders","text":"Wait for the list to finish loading before counting rows.","confidence":6}\nnot json at all\n{"text":"A hand-added learning without an id or type."}\n`);
  const loaded = loadLearnings(s, T0);
  assert.equal(loaded.active.length, 2);
  assert.match(loaded.warnings.join(" "), /line 4 is not valid JSON/);
  assert.equal(loaded.active[1]!.id, "L-002", "a missing id is assigned");
  assert.equal(loaded.active[1]!.type, "behavior");
  assert.ok(loaded.warnings.some((w) => /L-002 has an unknown type/.test(w)), "a hand-added entry with no type is reported, not silently accepted");
  learn(s, { type: "pitfall", area: "forms", text: "Double submit creates two records when the button is not disabled.", run: "r1" }, { now: T0 });
  const raw = fs.readFileSync(file, "utf8");
  assert.ok(raw.includes("not json at all"), "the unreadable line was kept for the owner to fix");
  assert.ok(raw.startsWith(`{"_meta":{"schema_version":${MEMORY_SCHEMA},"kind":"learnings"}}`));

  fs.writeFileSync(file, `{"_meta":{"schema_version":99,"kind":"learnings"}}\n`);
  assert.throws(() => loadLearnings(s), MemoryTooNewError);
  assert.throws(() => learn(s, { type: "pitfall", area: "a", text: "Some perfectly fine learning text here.", run: "r" }), /newer QAMind/);
  // every JSON memory file is guarded the same way
  writeJson(memoryPaths(s).productMap, { schema_version: 99 });
  assert.throws(() => loadMap(s), MemoryTooNewError);
  writeJson(memoryPaths(s).riskAreas, { schema_version: 99, areas: [] });
  assert.throws(() => recordRisk(s, "r", T0, [{ area: "a", severity: "minor" }]), /newer QAMind/);
  assert.equal(JSON.parse(fs.readFileSync(memoryPaths(s).riskAreas, "utf8")).schema_version, 99, "a newer file is left untouched");
});

test("the secrets and personal-data screen blocks real data and lets test data and numbers through", () => {
  const bad = (t: string) => screenForSecretsAndPii(t, ["not-a-real-secret-4f9k"]);
  assert.ok(bad("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcdefghijklmnop was used").length);
  assert.ok(bad("the admin password is not-a-real-secret-4f9k").length);
  assert.ok(bad("Authorization: Bearer abcdefghijklmnopqrstuvwxyz").length);
  assert.ok(bad("contact jane.doe@realcompany.com for access").some((p) => /email/.test(p)));
  assert.ok(bad("national id 35202-1234567-1 is shown").some((p) => /national/.test(p)));
  assert.ok(bad("card 4111 1111 1111 1111 appears in the export").some((p) => /card/.test(p)));
  assert.ok(bad("call +92 300 1234567 to reset").some((p) => /phone/.test(p)));
  assert.deepEqual(bad("Totals above 1,000.00 get 5% off; page_size 2147483648 and 999999999 are rejected; order 1050 exists."), []);
  assert.deepEqual(bad("the QA account a1@acme.test and qa@example.com are test users on a .test domain"), []);
  assert.deepEqual(bad("card number 4111 1111 1111 1112 is not a valid card (fails the check digit)"), []);
});

test("similarity ignores filler words, plural forms and case", () => {
  assert.deepEqual(tokens("The Orders are listed in the page"), ["order", "listed", "page"]);
  assert.ok(similarity("Search text with a bracket makes the orders list fail", "searching text with brackets makes orders list fail") > 0.6);
  assert.ok(similarity("login is slow", "the sales report takes four seconds") < 0.2);
});

// ---------------------------------------------------------------- learnings

test("learnings: new ones are stored in the spec's shape, near duplicates are merged and gain confidence, different types are kept apart", () => {
  const s = storeDir();
  const a = learn(s, { type: "test-tip", area: "Orders / search", text: "Search text with a bracket or backslash makes the order list return a server error.", run: "run-1", confidence: 5 }, { now: T0 });
  assert.equal(a.action, "created");
  assert.equal(a.learning.id, "L-001");
  assert.deepEqual(Object.keys(a.learning).sort(), ["area", "confidence", "created", "evidence_run", "hits", "id", "last_confirmed", "text", "type"]);
  const b = learn(s, { type: "test-tip", area: "orders", text: "Searching with brackets or a backslash makes the order list return a server error.", run: "run-2" }, { now: days(3) });
  assert.equal(b.action, "merged");
  assert.equal(b.learning.id, "L-001");
  assert.equal(b.learning.confidence, 6);
  assert.equal(b.learning.last_confirmed, days(3).toISOString());
  const c = learn(s, { type: "pitfall", area: "Orders / search", text: "Search text with a bracket or backslash makes the order list return a server error.", run: "run-3" }, { now: days(4) });
  assert.equal(c.action, "created", "same words but another type is another learning");
  assert.equal(loadLearnings(s).active.length, 2);
  assert.throws(() => learn(s, { type: "nonsense" as never, area: "a", text: "A reasonable sentence of enough length.", run: "r" }), /type must be/);
  assert.throws(() => learn(s, { type: "pitfall", area: "a", text: "short", run: "r" }), /atomic statement/);
});

test("learnings: confirming raises confidence, contradicting lowers it, below 3 it is archived (not deleted), and use is counted", () => {
  const s = storeDir();
  learn(s, { type: "env-quirk", area: "login", text: "The staging login is slow for the first request after idle; wait up to 20 seconds.", run: "r1", confidence: 4 }, { now: T0 });
  assert.equal(adjustLearning(s, "L-001", "confirm", "r2", days(1)).learning.confidence, 5);
  const down = adjustLearning(s, "L-001", "contradict", "r3", days(2));
  assert.equal(down.learning.confidence, 3);
  assert.equal(down.archived, false);
  const gone = adjustLearning(s, "L-001", "contradict", "r4", days(3));
  assert.equal(gone.archived, true);
  assert.equal(loadLearnings(s).active.length, 0);
  const archive = readJsonl<{ id: string; archived_reason: string }>(path.join(memoryPaths(s).archiveDir, "learnings.jsonl"));
  assert.equal(archive.records[0]?.id, "L-001");
  assert.match(archive.records[0]!.archived_reason, /contradicted/);
  assert.throws(() => adjustLearning(s, "L-099", "confirm", "r", T0), /No active learning/);

  learn(s, { type: "test-tip", area: "forms", text: "Clear the field before typing so old input does not remain in the form.", run: "r1" }, { now: T0 });
  const u = markApplied(s, ["L-001", "L-404"], days(5));
  assert.deepEqual(u.unknown, ["L-404"]);
  assert.equal(u.applied[0]!.hits, 1);
});

test("learnings: unsafe text is refused with a useful message, and the list is capped by archiving the weakest", () => {
  const s = storeDir();
  assert.throws(() => learn(s, { type: "behavior", area: "users", text: "The user jane@realcompany.com sees the admin menu after login.", run: "r" }), /Refusing to save this learning.*email address/);
  assert.throws(() => learn(s, { type: "behavior", area: "login", text: "Logging in as admin works with password hunter2-secret-pw here.", run: "r" }, { knownSecrets: ["hunter2-secret-pw"] }), /Memory never holds secrets/);
  const file = memoryPaths(s).learnings;
  const records = Array.from({ length: LEARNINGS_CAP }, (_, i) => ({ id: `L-${String(i + 1).padStart(3, "0")}`, type: "behavior", area: "x", text: `Unique behaviour number ${i} word${i}a word${i}b word${i}c`, evidence_run: "r", confidence: i === 0 ? 1 : 8, created: T0.toISOString(), last_confirmed: T0.toISOString(), hits: 0 }));
  writeJsonl(file, "learnings", records);
  learn(s, { type: "behavior", area: "y", text: "Completely different fresh observation about exports and downloads.", run: "r", confidence: 9 }, { now: T0 });
  const after = loadLearnings(s);
  assert.equal(after.active.length, LEARNINGS_CAP);
  assert.ok(!after.active.some((l) => l.id === "L-001"), "the lowest-scoring learning was archived");
  assert.equal(readJsonl(path.join(memoryPaths(s).archiveDir, "learnings.jsonl")).records.length, 1);
});

// ---------------------------------------------------------------- false alarms

test("false alarms: stored with a source, de-duplicated, matched against findings, and overridable with a reason", () => {
  const s = storeDir();
  const a = addFalseAlarm(s, { area: "Reports", symptom: "The sales report takes about four seconds to load", reason: "The product team accepts this; reports are heavy.", source: "owner" }, { now: T0 });
  assert.equal(a.action, "created");
  assert.equal(a.alarm.id, "FA-001");
  assert.equal(addFalseAlarm(s, { area: "Reports", symptom: "Sales report takes about 4 seconds to load", reason: "same thing, again" }).action, "existing");
  assert.throws(() => addFalseAlarm(s, { area: "a", symptom: "ok", reason: "x" }), /needs an area, a symptom/);
  assert.throws(() => addFalseAlarm(s, { area: "Users", symptom: "Shows the phone +92 300 1234567 of a customer", reason: "not a bug here" }), /phone/);

  const alarms = loadFalseAlarms(s).alarms;
  const findings = [
    { id: "ISSUE-001", title: "The sales report takes about 4 seconds to load", area: "Reports", summary: "Slow page" },
    { id: "ISSUE-002", title: "Orders list fails for brackets", area: "Orders" },
    { id: "ISSUE-003", title: "Sales report is slow to load, about four seconds", area: "Reports", not_a_known_false_alarm: "It now takes 40 seconds, not 4." },
  ];
  const m = matchFalseAlarms(findings, alarms);
  assert.deepEqual(m.map((x) => x.finding.id), ["ISSUE-001"], "the unrelated finding and the explained override are not matched");
  assert.equal(markFalseAlarmsSeen(s, ["FA-001"], days(1)).length, 1);
  assert.equal(loadFalseAlarms(s).alarms[0]!.hits, 1);
});

// ---------------------------------------------------------------- risk areas

test("risk areas are scored by frequency x severity x recency, and recording a run twice does not double it", () => {
  const s = storeDir();
  recordRisk(s, "run-1", T0, [{ area: "Orders / validation", severity: "critical" }, { area: "Reports", severity: "minor" }]);
  recordRisk(s, "run-2", days(10), [{ area: "orders  /  VALIDATION", severity: "important" }]);
  recordRisk(s, "run-2", days(10), [{ area: "orders / validation", severity: "important" }]); // same run again: replaced, not added
  const file = loadRisk(s);
  assert.equal(file.schema_version, MEMORY_SCHEMA);
  const orders = file.areas.find((a) => /orders/i.test(a.area))!;
  assert.equal(orders.events.length, 2, "area names that differ only in case and spacing are one area");
  const scored = scoreAreas(file, days(10));
  assert.equal(scored[0]!.area, "Orders / validation");
  assert.equal(scored[0]!.worst_severity, "critical");
  assert.equal(scored[0]!.occurrences, 2);
  assert.ok(scored[0]!.score > scored[1]!.score);
  // an old critical fades below a fresh important one
  const later = scoreAreas(file, days(500));
  assert.ok(later[0]!.score < 0.5);
  const fresh = scoreAreas(recordRisk(s, "run-9", days(500), [{ area: "Checkout", severity: "important" }]), days(500));
  assert.equal(fresh[0]!.area, "Checkout");
});

// ---------------------------------------------------------------- product map and change detection

const obs = (over: Partial<Observed> = {}): Observed => ({ pages: [], endpoints: [], endpointsSource: "none", roles: [], flows: [], uiUrls: {}, ...over });

test("page paths are normalized so the same page is one entry however many records it shows", () => {
  assert.equal(normalizePath("http://127.0.0.1:4102/order.html?id=o-1044#x"), "/order.html");
  assert.equal(normalizePath("/orders/1050/items/"), "/orders/:id/items");
  assert.equal(normalizePath("/orders/3f2b8c1e-1234-4abc-8def-0123456789ab"), "/orders/:id");
  assert.equal(normalizePath("my-orders.html"), "/my-orders.html");
  assert.equal(normalizePath("/o-9999"), "/:id");
  assert.equal(humanizePath("/my-orders.html"), "My orders");
  assert.equal(humanizePath("/"), "Home page");
});

test("change detection: first run, new pages, pages not seen only after a full run, endpoints added and removed only against a spec", () => {
  const first = obs({ pages: [{ ui: "Client", path: "/orders" }, { ui: "Client", path: "/help" }], endpoints: [{ op: "GET /orders", summary: "List orders" }, { op: "GET /legacy", summary: "Old thing" }], endpointsSource: "openapi" });
  assert.equal(computeChanges(undefined, first, "full").first_run, true);
  const map = applyObserved(undefined, first, "run-1", "full", T0);
  assert.equal(map.uis["Client"]!.pages["/help"]!.first_seen, "run-1");

  const second = obs({ pages: [{ ui: "Client", path: "/orders" }, { ui: "Client", path: "/new-page", title: "Invoices" }], endpoints: [{ op: "GET /orders", summary: "List orders" }, { op: "GET /invoices", summary: "List invoices" }], endpointsSource: "openapi" });
  const full = computeChanges(map, second, "full");
  assert.deepEqual(full.pages_new, [{ ui: "Client", path: "/new-page", title: "Invoices" }]);
  assert.deepEqual(full.pages_not_seen.map((p) => p.path), ["/help"]);
  assert.deepEqual(full.endpoints_added.map((e) => e.op), ["GET /invoices"]);
  assert.deepEqual(full.endpoints_removed.map((e) => e.op), ["GET /legacy"]);

  const quick = computeChanges(map, second, "quick");
  assert.deepEqual(quick.pages_not_seen, [], "a quick run did not look everywhere, so nothing is called gone");
  assert.match(quick.notes.join(" "), /not a full run/);

  const observedOnly = computeChanges(map, obs({ endpoints: [{ op: "GET /orders" }], endpointsSource: "observed" }), "full");
  assert.deepEqual(observedOnly.endpoints_removed, [], "a partial list of endpoints never proves one was removed");

  const plain = describeChanges(full).plain.join("\n");
  assert.match(plain, /Seen for the first time: the "Invoices" screen in the Client \(it is new, or the earlier check did not reach it\)\./);
  assert.match(plain, /No longer found: the behind-the-screens function "Old thing"\./);
  assert.match(plain, /Not found this time: the "Help" screen in the Client/);
  assert.ok(!/\/new-page|GET |\/legacy/.test(plain), "plain wording has no paths or request methods");
  assert.match(describeChanges(full).technical.join("\n"), /New endpoint: `GET \/invoices`/);

  const next = applyObserved(map, second, "run-2", "full", days(1));
  assert.equal(next.uis["Client"]!.pages["/orders"]!.first_seen, "run-1", "first_seen survives");
  assert.equal(next.uis["Client"]!.pages["/orders"]!.last_seen, "run-2");
  assert.equal(next.api.source, "openapi");
  assert.deepEqual(Object.keys(next.api.endpoints).sort(), ["GET /invoices", "GET /orders"], "a spec replaces the endpoint list");
});

test("the observed pages come from data/pages.json (urls normalized, duplicates merged) and journeys from coverage rows", () => {
  const dir = tmp("qamind-run-");
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  writeJson(path.join(dir, "data", "pages.json"), [{ ui: "Client Portal", url: "http://127.0.0.1:4102/order.html?id=o-1", title: "Order" }, { ui: "Client Portal", path: "/order.html?id=o-2" }, { path: "/x" }, "junk"]);
  writeJson(path.join(dir, "data", "endpoints.json"), ["GET /orders", "POST /orders"]);
  const o = readObserved(dir, { roles: ["a"], uiUrls: { "Client Portal": "http://127.0.0.1:4102" }, flows: ["one", "two", "three"], coverage: [{ surface: "ui", area: "a", status: "tested", critical_flow: 1 }, { surface: "ui", area: "b", status: "partial", critical_flow: 2 }] });
  assert.deepEqual(o.pages.map((p) => `${p.ui}${p.path}`), ["Client Portal/order.html", "Client Portal/x"]);
  assert.equal(o.endpointsSource, "observed");
  assert.deepEqual(o.flows.map((f) => f.status), ["tested", "partial", "not-tested"]);
});

test("plain change lines never quote jargon from the product's own page titles or API summaries (found by the learning test)", () => {
  const changes = {
    first_run: false,
    pages_new: [{ ui: "Admin Portal", path: "/api-keys.html", title: "API keys - Lumen" }, { ui: "Client Portal", path: "/help.html", title: "Help centre" }],
    pages_not_seen: [],
    endpoints_added: [{ op: "GET /help", summary: "List help articles" }, { op: "POST /auth/token", summary: "Exchange a refresh token" }],
    endpoints_removed: [{ op: "POST /auth/reset-password", summary: "Choose a new password with a reset token" }],
    notes: [],
  };
  const isPlain = (t: string) => lintAdminLanguage(t).length === 0;
  const { plain, technical } = describeChanges(changes, isPlain);
  assert.deepEqual(lintAdminLanguage(plain.join("\n")), [], `plain lines contain jargon:\n${plain.join("\n")}`);
  assert.match(plain.join("\n"), /"Help centre" screen/, "clean text is still quoted");
  assert.match(plain.join("\n"), /"List help articles"/, "a clean API summary is still quoted");
  assert.match(plain.join("\n"), /a screen in the Admin Portal/, "a jargon title falls back to generic wording");
  assert.match(plain.join("\n"), /No longer found: a behind-the-screens function that existed before\./);
  assert.match(technical.join("\n"), /Choose a new password with a reset token/, "developers still get the exact wording");
  assert.match(technical.join("\n"), /`POST \/auth\/reset-password`/);
});
