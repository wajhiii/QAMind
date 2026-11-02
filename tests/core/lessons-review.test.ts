import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { writeJson } from "../../core/lib/fsutil.ts";
import { loadMemoryContext } from "../../core/lib/memory/context.ts";
import { addFalseAlarm } from "../../core/lib/memory/falsealarms.ts";
import { learn, loadLearnings } from "../../core/lib/memory/learnings.ts";
import {
  APPROVED_FILE, MAX_LOADED, PENDING_FILE, REJECTED_FILE, USE_FILE, approveLesson, lessonOverview, listPendingLessons, loadApprovedLessons, parseLessons, proposeLesson, recordLessonUse, rejectLesson,
} from "../../core/lib/memory/lessons.ts";
import { readMemoryLog } from "../../core/lib/memory/memorylog.ts";
import { memoryStats, pruneMemory, reviewOverview } from "../../core/lib/memory/review.ts";
import { getContext, markFalseAlarm, proposeGlobalLesson, projectScope, recordApplied, runScope, saveLearning } from "../../core/lib/memory/service.ts";
import { flagRisk, loadRisk } from "../../core/lib/memory/risk.ts";
import { memoryPaths, readJsonl } from "../../core/lib/memory/store.ts";
import { cli, makeProject, makeRunWithData, tmp } from "./helpers.ts";

const T0 = new Date("2026-11-03T10:00:00Z");
const A = "Date pickers often break across time zones: test a booking made near midnight.";
const A_WHY = "Seen as an off-by-one-day order date.";
const B = "Search boxes should treat punctuation as plain text, never as a pattern.";
const C = "Disabled buttons must also be unreachable by keyboard, not only greyed out.";
const read = (home: string, f: string): string => fs.readFileSync(path.join(home, f), "utf8");

function propose(home: string, text: string, reason = "Seen on more than one product.", area?: string) {
  return proposeLesson(home, { text, reason, ...(area ? { area } : {}) }, { now: T0 });
}

/** A project the machine has seen, so a lesson that names it is not generic for anyone. */
function knownProject(home: string, name: string): void {
  const id = `p-${name.toLowerCase().replace(/\W+/g, "-")}`;
  writeJson(path.join(home, "projects", id, "project.json"), { schema_version: 1, id, id_source: "path", name, paths_seen: [`/work/${name}`], created: T0.toISOString(), last_seen: T0.toISOString() });
}

// ------------------------------------------------------------------------------------------------ approve and reject

test("approving moves a pending lesson to the approved file with a new id, and keeps the owner's own notes in both files", () => {
  const home = tmp("qamind-home-");
  propose(home, A, A_WHY, "Forms");
  propose(home, B);
  fs.writeFileSync(path.join(home, PENDING_FILE), read(home, PENDING_FILE).replace("# Pending lessons", "# Pending lessons\n\nMy own note: review on Fridays."));
  const r = approveLesson(home, "P-001", { now: T0 });
  assert.deepEqual([r.action, r.id, r.new_id, r.text], ["approved", "P-001", "G-001", A]);
  const approved = read(home, APPROVED_FILE);
  assert.match(approved, /## G-001 · 2026-11-03 · Forms\n- \*\*Lesson:\*\* Date pickers/);
  assert.match(approved, /- \*\*Why:\*\* Seen as an off-by-one-day order date\./);
  assert.match(approved, /- \*\*Approved:\*\* 2026-11-03 \(was P-001\)/);
  assert.deepEqual(listPendingLessons(home).map((e) => e.id), ["P-002"], "gone from pending, the other one stays");
  assert.match(read(home, PENDING_FILE), /My own note: review on Fridays\./);
  // an id is never reused, not even the one an approved lesson came from
  assert.equal(propose(home, C).id, "P-003");
});

test("a lesson is checked again when approved, against EVERY project on the machine, and as the owner reworded it", () => {
  const home = tmp("qamind-home-");
  knownProject(home, "Zebra Checkout");
  const p = propose(home, "Zebra Checkout totals look wrong when a discount is applied twice in a row.", "Seen once.");
  assert.equal(p.action, "proposed", "the proposing project did not know that name");
  assert.throws(() => approveLesson(home, p.id), /cannot be approved as written: it names this project \("Zebra Checkout"\)/);
  assert.throws(() => approveLesson(home, p.id, { text: "Totals look wrong at https://shop.example.com when a discount is applied twice." }), /web address/);
  assert.throws(() => approveLesson(home, p.id, { text: "Too short" }), /20 to 280/);
  assert.throws(() => approveLesson(home, p.id, { text: "Reach me at jane.doe@gmail.com when a discount is applied twice in a row." }), /email address/);
  assert.equal(fs.existsSync(path.join(home, APPROVED_FILE)), false, "nothing was approved by the refusals");
  const ok = approveLesson(home, p.id, { text: "Totals look wrong when a discount is applied twice in a row.", now: T0 });
  assert.equal(ok.text, "Totals look wrong when a discount is applied twice in a row.", "the owner's rewording is what was approved");
  assert.match(read(home, APPROVED_FILE), /Totals look wrong when a discount is applied twice in a row\./);
  assert.doesNotMatch(read(home, APPROVED_FILE), /Zebra/);
});

test("approving refuses an unknown id, and a near copy of a lesson that is already approved", () => {
  const home = tmp("qamind-home-");
  assert.throws(() => approveLesson(home, "P-009"), /Nothing is pending/);
  propose(home, A);
  assert.throws(() => approveLesson(home, "P-009"), /Pending: P-001/);
  approveLesson(home, "P-001", { now: T0 });
  fs.writeFileSync(path.join(home, PENDING_FILE), `${read(home, PENDING_FILE)}\n## P-005 · 2026-11-03\n- **Lesson:** Date pickers often break across time zones, so test a booking made near midnight.\n- **Why:** Same again.\n`);
  assert.throws(() => approveLesson(home, "P-005"), /near copy of the approved lesson G-001/);
});

test("rejecting a pending lesson is remembered, so a near copy is not proposed again; an approved one can be retired the same way", () => {
  const home = tmp("qamind-home-");
  propose(home, A);
  const r = rejectLesson(home, "P-001", "Too obvious to be worth a slot.", T0);
  assert.deepEqual([r.action, r.id], ["rejected", "P-001"]);
  assert.deepEqual(listPendingLessons(home), []);
  const again = proposeLesson(home, { text: "Date pickers often break across time zones, so test a booking made near midnight.", reason: "Seen it again." }, { now: T0 });
  assert.equal(again.action, "rejected-before");
  assert.equal(again.matches, A);
  assert.deepEqual(listPendingLessons(home), [], "and it was not added");
  assert.equal(readJsonl<{ reason: string; was: string }>(path.join(home, REJECTED_FILE)).records[0]?.was, "pending");

  propose(home, B);
  approveLesson(home, "P-002", { now: T0 });
  const retired = rejectLesson(home, "G-001", "Turned out to be wrong for GraphQL.", T0);
  assert.equal(retired.id, "G-001");
  assert.equal(loadApprovedLessons(home).lessons.length, 0, "no longer read by any project");
  assert.equal(readJsonl<{ was: string }>(path.join(home, REJECTED_FILE)).records[1]?.was, "approved");
  assert.equal(proposeLesson(home, { text: B, reason: "Back again for the same reason." }, { now: T0 }).action, "rejected-before");
  assert.throws(() => rejectLesson(home, "P-777"), /No pending or approved lesson P-777/);
});

// ------------------------------------------------------------------------------------------------ what every project reads

test("only approved lessons are ever loaded: pending and rejected ones never reach a run", () => {
  const home = tmp("qamind-home-");
  propose(home, A);
  propose(home, B);
  propose(home, C);
  assert.deepEqual(loadApprovedLessons(home).lessons, [], "three pending, none approved, none loaded");
  approveLesson(home, "P-002", { now: T0 });
  rejectLesson(home, "P-003", "no", T0);
  const loaded = loadApprovedLessons(home);
  assert.deepEqual(loaded.lessons.map((l) => l.text), [B]);
  const store = tmp("qamind-store-");
  const ctx = loadMemoryContext(store, 3, T0, { home, projectNames: [] });
  assert.deepEqual(ctx.global_lessons.map((l) => l.id), ["G-001"]);
  const all = JSON.stringify(ctx);
  assert.ok(all.includes("Search boxes"));
  assert.ok(!all.includes("Date pickers") && !all.includes("Disabled buttons"), "a pending or rejected lesson is nowhere in what the run is given");
  assert.deepEqual(loadMemoryContext(store, 3, T0).global_lessons, [], "without a home there is nothing to read");
});

test("a hand edit cannot smuggle a project-specific lesson in: it is checked as it is read and reported, not loaded", () => {
  const home = tmp("qamind-home-");
  fs.writeFileSync(
    path.join(home, APPROVED_FILE),
    [
      "# Global lessons", "", "My notes: I add these by hand.", "",
      "- Always test what happens when a user double-clicks a submit button.",
      "- Open https://staging.shop.test/admin and check the order list loads quickly.",
      "- Lumen Supplies orders above 1000 get a discount that is calculated wrongly.",
      "- Too short to count",
      "",
      "## G-007 · 2026-10-01 · Search",
      "- **Lesson:** Search boxes should treat punctuation as plain text, never as a pattern.",
      "- **Why:** A bracket crashed one.",
      "",
      "- Contact jane.doe@gmail.com whenever a form submits twice without any visible message.",
      "",
    ].join("\n"),
  );
  const loaded = loadApprovedLessons(home, { projectNames: ["Lumen Supplies"] });
  assert.deepEqual(loaded.lessons.map((l) => l.text).sort(), ["Always test what happens when a user double-clicks a submit button.", "Search boxes should treat punctuation as plain text, never as a pattern."]);
  assert.equal(loaded.total_approved, 5);
  const why = (start: string): string => loaded.skipped.find((x) => x.text.startsWith(start))?.problems.join(" ") ?? "";
  assert.match(why("Open https://staging"), /web address/);
  assert.match(why("Lumen Supplies orders"), /names this project/);
  assert.match(why("Contact jane.doe@gmail.com"), /email address/);
  const ctx = loadMemoryContext(tmp("qamind-store-"), 3, T0, { home, projectNames: ["Lumen Supplies"] });
  assert.equal(ctx.warnings.filter((w) => /was not loaded/.test(w)).length, 3, "each skipped lesson is reported to the run, so the owner finds out");
  const ov = lessonOverview(home, { projectNames: ["Lumen Supplies"] });
  assert.equal(ov.approved.filter((a) => !a.loaded).length, 3);
  assert.ok(ov.approved.find((a) => a.id === "G-007")?.loaded);
  assert.ok(ov.approved.some((a) => /^H-[0-9a-f]{6}$/.test(a.id)), "a line written by hand gets a stable id of its own");
  // the owner's notes survive a rewrite
  const hand = ov.approved.find((a) => /double-clicks/.test(a.text));
  rejectLesson(home, hand?.id as string, "test", T0);
  assert.match(read(home, APPROVED_FILE), /My notes: I add these by hand\./);
  assert.doesNotMatch(read(home, APPROVED_FILE), /double-clicks/);
  assert.match(read(home, APPROVED_FILE), /G-007/);
});

test("a run is shown at most MAX_LOADED approved lessons, the best-used and newest first", () => {
  const home = tmp("qamind-home-");
  const lines = Array.from({ length: MAX_LOADED + 5 }, (_, i) => `## G-${String(i + 1).padStart(3, "0")} · 2026-10-${String((i % 28) + 1).padStart(2, "0")}\n- **Lesson:** Generic observation number ${i + 1} about carts, zebra${i * 7} and quartz${i * 13} behaviour.\n`);
  fs.writeFileSync(path.join(home, APPROVED_FILE), `# Global lessons\n\n${lines.join("\n")}`);
  writeJson(path.join(home, USE_FILE), { "G-001": { hits: 9, last_applied: T0.toISOString() } });
  const loaded = loadApprovedLessons(home);
  assert.equal(loaded.lessons.length, MAX_LOADED);
  assert.equal(loaded.truncated, true);
  assert.equal(loaded.lessons[0]?.id, "G-001", "the lesson runs actually used comes first even though it is old");
  assert.match(loadMemoryContext(tmp("qamind-store-"), 3, T0, { home }).warnings.join(" "), /only the best-used and newest are shown/);
});

test("the review shows each approved lesson with how often it was applied, and the rejected ones", () => {
  const home = tmp("qamind-home-");
  propose(home, A);
  propose(home, B);
  approveLesson(home, "P-001", { now: T0 });
  rejectLesson(home, "P-002", "meh", T0);
  assert.deepEqual(recordLessonUse(home, ["G-001", "G-001", "G-404"], T0), { recorded: ["G-001"], unknown: ["G-404"] }, "a repeated id in one call counts once");
  const ov = lessonOverview(home);
  assert.deepEqual(ov.approved.map((a) => [a.id, a.hits, a.loaded]), [["G-001", 1, true]], "one application recorded");
  assert.deepEqual(ov.rejected.map((r) => [r.id, r.reason]), [["P-002", "meh"]]);
  assert.deepEqual(ov.limits, { max_pending: 100, max_loaded: MAX_LOADED });
});

test("the parser keeps what the owner wrote: headings without a lesson, blank lines and unknown lines", () => {
  const text = "# Title\n\nIntro line.\n\n## Notes to self\nremember to check this\n\n## P-004 · 2026-11-01 · Forms\n- **Lesson:** A generic statement long enough to count as one.\n- **Why:** Because.\n";
  const p = parseLessons(text);
  assert.equal(p.blocks.length, 1);
  assert.equal(p.blocks[0]?.id, "P-004");
  assert.equal(p.blocks[0]?.area, "Forms");
  assert.match(p.preamble.join("\n"), /Notes to self[\s\S]*remember to check this/);
});

// ------------------------------------------------------------------------------------------------ through the service (a run in a project)

test("a run is given the approved lessons, can cite them, and cannot cite a pending one; a lesson naming another known project is refused", () => {
  const fx = makeRunWithData();
  knownProject(fx.home, "Zebra Checkout");
  const scope = runScope(fx.home, fx.runId, {});
  propose(fx.home, A);
  propose(fx.home, B);
  approveLesson(fx.home, "P-002", { now: T0 });
  const ctx = getContext(scope);
  assert.deepEqual(ctx.global_lessons.map((l) => l.id), ["G-001"]);
  assert.throws(() => recordApplied(scope, ["P-001"], T0), /do not exist/, "a pending id is not citable (and it does not even match the id format the tool accepts)");
  assert.deepEqual(recordApplied(scope, ["G-001"], T0), { applied: ["G-001"] });
  assert.deepEqual(readMemoryLog(fx.runDir).map((e) => [e.kind, e.id]), [["global-lesson-applied", "G-001"]]);
  assert.equal(lessonOverview(fx.home).approved[0]?.hits, 1);
  assert.throws(() => recordApplied(scope, ["G-001", "G-099"], T0), /G-099/);
  assert.equal(lessonOverview(fx.home).approved[0]?.hits, 1, "nothing was recorded when one id was wrong");
  assert.throws(() => proposeGlobalLesson(scope, { text: "Zebra Checkout totals look wrong after the second discount is applied.", reason: "Seen once on one product." }, T0), /names this project \("Zebra Checkout"\)/);
});

// ------------------------------------------------------------------------------------------------ review, prune, stats

function projectWithMemory(): { home: string; scope: ReturnType<typeof projectScope>; store: string; dir: string } {
  const home = tmp("qamind-home-");
  const dir = makeProject({ remote: "https://github.com/acme/shop.git" });
  const scope = projectScope(home, { project: dir });
  return { home, scope, store: scope.store, dir };
}

test("the review marks what looks stale and says why, and changes nothing", () => {
  const { scope, store } = projectWithMemory();
  const old = new Date("2025-01-01T00:00:00Z");
  learn(store, { type: "pitfall", area: "Search", text: "Search text is used as a pattern, so punctuation can crash it.", run: "run-1", confidence: 8 }, { now: T0 });
  learn(store, { type: "env-quirk", area: "Reports", text: "The report page needs about five seconds before the figures appear.", run: "run-1", confidence: 3 }, { now: T0 });
  learn(store, { type: "behavior", area: "Orders", text: "A 403 for a customer on admin pages is the correct behaviour here.", run: "run-1", confidence: 5 }, { now: old });
  addFalseAlarm(store, { area: "Orders", symptom: "The order total shows two decimals even for whole numbers", reason: "That is the specified format.", source: "owner" }, { now: old });
  addFalseAlarm(store, { area: "Login", symptom: "The sign-in page shows no autofocus on the password field", reason: "Not required by the spec.", source: "spec" }, { now: T0 });
  flagRisk(store, "run-1", old, { area: "Old area", severity: "minor" });
  const before = JSON.stringify([loadLearnings(store, T0).active, loadRisk(store)]);
  const r = reviewOverview(scope, T0);
  const by = (id: string) => r.learnings.items.find((l) => l.id === id);
  assert.equal(by("L-001")?.prune_because, undefined, "a trusted, recent learning is not a candidate");
  assert.match((by("L-002")?.prune_because ?? []).join(" "), /low confidence \(3 of 10\)/);
  assert.match((by("L-003")?.prune_because ?? []).join(" "), /not confirmed for \d+ days/);
  assert.match((by("L-003")?.prune_because ?? []).join(" "), /never used in \d+ days/);
  assert.equal(r.learnings.items[0]?.prune_because !== undefined, true, "candidates are listed first");
  assert.deepEqual(r.false_alarms.items.map((a) => [a.id, !!a.prune_because]), [["FA-001", true], ["FA-002", false]]);
  assert.match(r.risk_areas[0]?.prune_because?.[0] ?? "", /last problem seen \d+ days ago/);
  assert.equal(r.prune_candidates, 4);
  assert.equal(JSON.stringify([loadLearnings(store, T0).active, loadRisk(store)]), before, "looking changes nothing");
});

test("pruning archives one entry with the owner's reason, never deletes it, and takes exactly one target", () => {
  const { scope, store } = projectWithMemory();
  learn(store, { type: "pitfall", area: "Search", text: "Search text is used as a pattern, so punctuation can crash it.", run: "run-1" }, { now: T0 });
  addFalseAlarm(store, { area: "Orders", symptom: "The order total shows two decimals even for whole numbers", reason: "That is the specified format." }, { now: T0 });
  flagRisk(store, "run-1", T0, { area: "Checkout", severity: "important" });

  const l = pruneMemory(scope, { learning: "L-001" }, "fixed upstream", T0);
  assert.deepEqual([l.archived, l.kind, l.reason], ["L-001", "learning", "owner review: fixed upstream"]);
  assert.equal(loadLearnings(store, T0).active.length, 0);
  const archived = readJsonl<{ id: string; archived_reason: string }>(path.join(memoryPaths(store).archiveDir, "learnings.jsonl")).records;
  assert.deepEqual(archived.map((a) => [a.id, a.archived_reason]), [["L-001", "owner review: fixed upstream"]]);

  assert.equal(pruneMemory(scope, { falseAlarm: "FA-001" }, undefined, T0).kind, "false alarm");
  assert.equal(readJsonl<object>(path.join(memoryPaths(store).archiveDir, "false-alarms.jsonl")).records.length, 1);
  assert.equal(pruneMemory(scope, { risk: "checkout" }, "renamed", T0).archived, "Checkout", "the area is matched the way memory matches it");
  assert.equal(loadRisk(store).areas.length, 0);
  assert.equal(readJsonl<object>(path.join(memoryPaths(store).archiveDir, "risk-areas.jsonl")).records.length, 1);

  assert.throws(() => pruneMemory(scope, {}, undefined, T0), /exactly one thing/);
  assert.throws(() => pruneMemory(scope, { learning: "L-001", risk: "x" }, undefined, T0), /exactly one thing/);
  assert.throws(() => pruneMemory(scope, { learning: "L-099" }, undefined, T0), /No active learning L-099/);
  assert.throws(() => pruneMemory(scope, { falseAlarm: "FA-099" }, undefined, T0), /No false alarm FA-099/);
  assert.throws(() => pruneMemory(scope, { risk: "nowhere" }, undefined, T0), /No risk area "nowhere"/);
});

function runFile(store: string, n: number, over: Record<string, unknown> = {}): void {
  const id = `run-2026100${n}T100000Z`;
  writeJson(path.join(memoryPaths(store).runs, `${id}.json`), {
    schema_version: 1, run_id: id, mode: "full", trigger: "manual", kind: "qa-only", host: "t", started: `2026-10-0${n}T10:00:00Z`, finished: `2026-10-0${n}T10:10:00Z`, duration_s: 600,
    counts: { critical: 1, important: 2, minor: 1, unconfirmed: 0 }, finding_ids: [], coverage: { tested: 10, partial: 1, not_tested: 4 }, not_tested_count: 4, blocked_areas: [], cost: "n/a", stop_reason: "completed", agent_version: "0", knowledge_version: "0", report: "r", ...over,
  });
}

test("stats: with fewer than six runs there is no trend, and what cannot be measured yet is always listed", () => {
  const { scope, store } = projectWithMemory();
  assert.deepEqual([memoryStats(scope, T0).runs.total, memoryStats(scope, T0).trend.available], [0, false]);
  for (const n of [1, 2, 3]) runFile(store, n);
  const s = memoryStats(scope, T0);
  assert.equal(s.runs.total, 3);
  assert.equal(s.trend.available, false);
  assert.match(s.trend.note, /at least 6 finished runs; this project has 3/);
  assert.equal(s.not_available_yet.length, 2);
  assert.match(s.not_available_yet.join(" "), /Precision[\s\S]*Escaped bugs/);
  assert.deepEqual(s.runs.by_mode, { full: 3 });
});

test("stats: with six runs the trend compares the latest three with the three before, and memory use is counted", () => {
  const { scope, store } = projectWithMemory();
  for (const n of [1, 2, 3]) runFile(store, n, { counts: { critical: 2, important: 3, minor: 0, unconfirmed: 0 }, duration_s: 1200, coverage: { tested: 8, partial: 0, not_tested: 6 } });
  for (const n of [4, 5, 6]) runFile(store, n, { counts: { critical: 0, important: 1, minor: 2, unconfirmed: 0 }, duration_s: 300, coverage: { tested: 14, partial: 0, not_tested: 1 }, trigger: "auto", mode: "diff" });
  learn(store, { type: "pitfall", area: "Search", text: "Search text is used as a pattern, so punctuation can crash it.", run: "run-1", confidence: 8 }, { now: T0 });
  addFalseAlarm(store, { area: "Orders", symptom: "The order total shows two decimals even for whole numbers", reason: "That is the specified format." }, { now: T0 });
  const s = memoryStats(scope, T0);
  assert.equal(s.trend.available, true);
  assert.deepEqual(s.trend.serious_problems_per_run, { earlier: 5, latest: 1 });
  assert.deepEqual(s.trend.minutes_per_run, { earlier: 20, latest: 5 });
  assert.deepEqual(s.trend.tested_areas_per_run, { earlier: 8, latest: 14 });
  assert.deepEqual(s.runs.by_trigger, { manual: 3, auto: 3 });
  assert.equal(s.runs.recent.length, 6);
  assert.equal(s.memory.learnings.active, 1);
  assert.equal(s.memory.false_alarms.active, 1);
  assert.deepEqual([s.global_lessons.pending, s.global_lessons.approved], [0, 0]);
});

// ------------------------------------------------------------------------------------------------ the CLI the review skill uses

test("the CLI: lessons list, approve (with a rewording), reject, and the errors the owner sees", async () => {
  const home = tmp("qamind-home-");
  propose(home, A, A_WHY);
  propose(home, B);
  const listed = await cli(home, "lessons", "list");
  assert.equal(listed.code, 0);
  assert.deepEqual(listed.json.pending.map((p: { id: string }) => p.id), ["P-001", "P-002"]);
  assert.deepEqual(listed.json.approved, []);
  const ok = await cli(home, "lessons", "approve", "P-001");
  assert.deepEqual([ok.code, ok.json.new_id], [0, "G-001"]);
  const worded = await cli(home, "lessons", "approve", "P-002", "--text", "Search boxes should treat punctuation as plain text and never as a pattern or a command.");
  assert.equal(worded.json.new_id, "G-002");
  assert.equal((await cli(home, "lessons", "approve", "P-002")).code, 1, "already moved");
  assert.equal((await cli(home, "lessons", "approve")).code, 2, "the id is required");
  assert.equal((await cli(home, "lessons", "bogus")).code, 2);
  const rej = await cli(home, "lessons", "reject", "G-002", "--reason", "too broad");
  assert.deepEqual([rej.code, rej.json.id], [0, "G-002"]);
  const after = await cli(home, "lessons", "list");
  assert.deepEqual([after.json.pending.length, after.json.approved.map((a: { id: string }) => a.id), after.json.rejected.map((r: { id: string }) => r.id)], [0, ["G-001"], ["G-002"]]);
});

test("the CLI: memory review, stats and prune take a project folder and need no run", async () => {
  const { home, dir, store } = projectWithMemory();
  learn(store, { type: "pitfall", area: "Search", text: "Search text is used as a pattern, so punctuation can crash it.", run: "run-1", confidence: 3 }, { now: T0 });
  const review = await cli(home, "memory", "review", "--project", dir);
  assert.equal(review.code, 0);
  assert.equal(review.json.learnings.total, 1);
  assert.match(review.json.learnings.items[0].prune_because[0], /low confidence/);
  const stats = await cli(home, "memory", "stats", "--project", dir);
  assert.equal(stats.json.runs.total, 0);
  assert.equal(stats.json.not_available_yet.length, 2);
  assert.equal((await cli(home, "memory", "prune", "--project", dir)).code, 1, "nothing named: refused");
  const pruned = await cli(home, "memory", "prune", "--project", dir, "--learning", "L-001", "--reason", "outdated");
  assert.deepEqual([pruned.code, pruned.json.archived, pruned.json.reason], [0, "L-001", "owner review: outdated"]);
  assert.equal((await cli(home, "memory", "review", "--project", dir)).json.learnings.total, 0);
  assert.equal((await cli(home, "memory", "review", "--project", path.join(dir, "missing"))).code, 1);
});

test("a lesson saved through a run and one proposed by the agent end up where the owner reviews them", () => {
  const fx = makeRunWithData();
  const scope = runScope(fx.home, fx.runId, {});
  saveLearning(scope, { type: "pitfall", area: "Search", text: "Search text is used as a pattern, so punctuation can crash it.", confidence: 4 }, T0);
  markFalseAlarm(scope, { area: "Orders", symptom: "The order total shows two decimals even for whole numbers", reason: "That is the specified format." }, T0);
  proposeGlobalLesson(scope, { text: A, reason: A_WHY }, T0);
  const r = reviewOverview(projectScope(fx.home, { project: fx.proj }), T0);
  assert.equal(r.learnings.total, 1);
  assert.equal(r.false_alarms.total, 1);
  assert.deepEqual(r.lessons.pending.map((p) => p.id), ["P-001"]);
});
