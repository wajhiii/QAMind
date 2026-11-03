import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { readJson, writeJson } from "../../core/lib/fsutil.ts";
import { checkConsistency } from "../../core/scripts/consistency-check.ts";
import { fingerprintOf, loadBugs, matchBug, symptomTokens } from "../../core/lib/memory/bugs.ts";
import type { BugRecord } from "../../core/lib/memory/bugs.ts";
import type { Finding } from "../../core/lib/report.ts";
import { cli, finding, makeRunWithData, startAnotherRun, writeFixtureData } from "./helpers.ts";

const findingsOf = (runDir: string): Finding[] => readJson<Finding[]>(path.join(runDir, "data", "findings.json")) ?? [];
const without = (list: Finding[], id: string): Finding[] => list.filter((f) => f.id !== id);

async function buildAndLint(home: string, runId: string): Promise<{ lint: any }> {
  assert.equal((await cli(home, "report", "build", "--run", runId)).code, 0);
  return { lint: await cli(home, "report", "lint", "--run", runId) };
}

test("a bug is new, still open, fixed (re-checked, never assumed), then came back: shown first in both reports", async () => {
  // run 1: three findings, all new
  const fx = makeRunWithData();
  const all = findingsOf(fx.runDir);
  const { lint: l1 } = await buildAndLint(fx.home, fx.runId);
  assert.equal(l1.code, 0, JSON.stringify(l1.json.errors));
  const fin1 = await cli(fx.home, "run", "finish", "--run", fx.runId, "--stop-reason", "completed");
  assert.equal(fin1.code, 0);
  assert.deepEqual(fin1.json.lifecycle, { new: 3, still_open: 0, regressed: 0, accepted: 0, fixed: 0, not_rechecked: 0 });
  assert.deepEqual(fin1.json.findings.map((f: { bug: string }) => f.bug), ["BUG-001", "BUG-002", "BUG-003"], "the run summary ties each finding to the project's bug");
  assert.match(fs.readFileSync(path.join(fx.runDir, "ADMIN-REPORT.md"), "utf8"), /\*\*History:\*\* New: not seen in earlier checks\./);
  const bugs1 = loadBugs(fx.store).bugs;
  assert.equal(bugs1.length, 3);
  assert.ok(bugs1.every((b) => b.status === "new" && b.times_seen === 1 && /^[0-9a-f]{12}$/.test(b.fingerprint)));

  // run 2: the critical one is gone, and the agent re-checked it and wrote what it saw. The other two are still there.
  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: without(all, "ISSUE-001") });
  writeJson(path.join(r2.runDir, "data", "rechecks.json"), [{ bug: "BUG-001", result: "passes", how: "Repeated the three steps as a customer of company B; the order page said the order is not available." }]);
  const { lint: l2 } = await buildAndLint(fx.home, r2.runId);
  assert.equal(l2.code, 0, JSON.stringify(l2.json.errors));
  const fin2 = await cli(fx.home, "run", "finish", "--run", r2.runId);
  assert.deepEqual(fin2.json.lifecycle, { new: 0, still_open: 2, regressed: 0, accepted: 0, fixed: 1, not_rechecked: 0 });
  const b1 = loadBugs(fx.store).bugs.find((b) => b.id === "BUG-001") as BugRecord;
  assert.equal(b1.status, "fixed");
  assert.match(b1.fixed?.how ?? "", /order page said the order is not available/);
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-002")?.status, "still-open");
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-002")?.times_seen, 2);
  const admin2 = fs.readFileSync(path.join(r2.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(admin2, /## Fixed since the last check\n\n- Any client can read|## Fixed since the last check/);
  assert.match(admin2, /Still open: found in 2 checks so far/);
  assert.match(admin2, /Of the problems found now: 0 new, 2 already open before, 0 came back after being fixed\./);
  assert.match(fs.readFileSync(path.join(r2.runDir, "TECHNICAL-REPORT.md"), "utf8"), /## Fixed since the last run[\s\S]*BUG-001/);

  // run 3: the fixed bug is reintroduced
  const r3 = startAnotherRun(fx, "2026-11-01T10:00:00Z", { findings: all });
  const { lint: l3 } = await buildAndLint(fx.home, r3.runId);
  assert.equal(l3.code, 0, JSON.stringify(l3.json.errors));
  const fin3 = await cli(fx.home, "run", "finish", "--run", r3.runId);
  assert.deepEqual(fin3.json.lifecycle, { new: 0, still_open: 2, regressed: 1, accepted: 0, fixed: 0, not_rechecked: 0 });
  const back = loadBugs(fx.store).bugs.find((b) => b.id === "BUG-001") as BugRecord;
  assert.equal(back.status, "regressed");
  assert.ok(back.previously_fixed, "what had been fixed is kept");
  assert.equal(back.times_seen, 2);

  const admin3 = fs.readFileSync(path.join(r3.runDir, "ADMIN-REPORT.md"), "utf8");
  const tech3 = fs.readFileSync(path.join(r3.runDir, "TECHNICAL-REPORT.md"), "utf8");
  const summary = admin3.split("\n").filter((l) => l.startsWith("> - "));
  assert.ok(summary.some((l) => /1 problem came back after being fixed: A customer can open another company's order/.test(l)), "called out in the 30-second summary");
  assert.match(admin3, /\*\*History:\*\* Came back: this problem was fixed on \d+ \w+ 2026 and has now been found again\./);
  assert.ok(admin3.indexOf("### 🔴 Critical") < admin3.indexOf("### 🟠 Important"), "the problem that came back is listed first");
  assert.match(tech3, /## ⚠️ Came back \(fixed before, found again\)\n[\s\S]*\*\*BUG-001\*\*/);
  assert.match(tech3, /- \*\*Bug:\*\* BUG-001 · \*\*Came back\*\* \(fixed on 2026-\d\d-\d\d\)/);
  assert.match(tech3, /Bugs: \*\*0\*\* new · \*\*2\*\* still open · \*\*1\*\* came back/);
  const check = checkConsistency(r3.runDir);
  assert.deepEqual(check.errors, [], "the two finished reports agree, including about what came back");
});

test("a bug that was not found and not re-checked is not called fixed; the reports say it was not looked at", async () => {
  const fx = makeRunWithData();
  const all = findingsOf(fx.runDir);
  await buildAndLint(fx.home, fx.runId);
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: without(all, "ISSUE-003") });
  const { lint } = await buildAndLint(fx.home, r2.runId);
  assert.equal(lint.code, 0, JSON.stringify(lint.json.errors));
  assert.ok(lint.json.warnings.some((w: string) => /1 open bug\(s\) from earlier runs were neither found nor re-checked in this run \(BUG-003\)/.test(w)));
  const fin = await cli(fx.home, "run", "finish", "--run", r2.runId);
  assert.equal(fin.json.lifecycle.fixed, 0);
  assert.equal(fin.json.lifecycle.not_rechecked, 1);
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-003")?.status, "new", "unchanged");
  assert.match(fs.readFileSync(path.join(r2.runDir, "TECHNICAL-REPORT.md"), "utf8"), /## Open bugs not looked at again[\s\S]*BUG-003/);
  assert.match(fs.readFileSync(path.join(r2.runDir, "ADMIN-REPORT.md"), "utf8"), /1 problem from before was not looked at again this time/);
});

test("re-checks are checked: a made-up bug, a thin description, or a bug also reported as a finding is refused", async () => {
  const fx = makeRunWithData();
  const all = findingsOf(fx.runDir);
  await buildAndLint(fx.home, fx.runId);
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: all });
  writeJson(path.join(r2.runDir, "data", "rechecks.json"), [
    { bug: "BUG-099", result: "passes", how: "I looked and it was fine, honestly." },
    { bug: "BUG-002", result: "passes", how: "ok" },
    { bug: "BUG-001", result: "passes", how: "Repeated the steps and the order was refused, as it should be." },
  ]);
  const { lint } = await buildAndLint(fx.home, r2.runId);
  assert.equal(lint.code, 1);
  const errs: string[] = lint.json.errors;
  assert.ok(errs.some((e) => /rechecks\[0\]: BUG-099 does not exist/.test(e)));
  assert.ok(errs.some((e) => /rechecks\[1\]: say what you repeated/.test(e)));
  assert.ok(errs.some((e) => /rechecks\[2\]: BUG-001 is listed as fixed but this run also reports it as a finding/.test(e)));
});

test("two different bugs in one area are not merged; a resemblance the code cannot settle is put to the agent", async () => {
  const bug = (id: string, over: Partial<BugRecord>): BugRecord => {
    const b = { area: "Orders", type: "validation", surface: "api", title: "x", summary: "", ...over };
    return { id, fingerprint: fingerprintOf(b), severity: "important", status: "still-open", first_seen: { run: "r1", at: "2026-10-30T00:00:00Z" }, last_seen: { run: "r1", at: "2026-10-30T00:00:00Z" }, times_seen: 1, history: [], ...b } as BugRecord;
  };
  const pageSize = bug("BUG-001", { title: "GET /orders fails with HTTP 500 when page_size=0", surface: "api" });
  const search = { area: "Orders", type: "validation", surface: "api", title: "GET /orders fails with HTTP 500 when q is '('", steps: ["GET /api/orders?q=("] };
  const m = matchBug([pageSize], search);
  assert.equal(m.bug, undefined, "a different trigger is a different bug, however alike the words are");
  assert.equal(m.candidates[0]?.bug.id, "BUG-001", "but it is offered as a resemblance");

  // the same bug, worded again, with the same trigger: one bug
  const again = matchBug([pageSize], { area: "Orders", type: "validation", surface: "api", title: "GET /orders fails with HTTP 500 when page_size=0!" });
  assert.equal(again.bug?.id, "BUG-001");
  assert.equal(again.how, "fingerprint");
  // explicit beats everything
  assert.equal(matchBug([pageSize], { ...search, bug: "BUG-001" }).how, "explicit");
  assert.equal(matchBug([pageSize], { ...search, bug: "new" }).bug, undefined);
  assert.ok(symptomTokens("GET /orders?q=(").includes("sym40"), "an odd character is part of the symptom");
  assert.equal(symptomTokens("Problem ISSUE-004 seen on 2026-10-30 for order 1234567").includes("1234567"), false, "ids and dates are not the symptom");
});

test("a finding that resembles a known bug must say which it is; saying so lets the run finish", async () => {
  const fx = makeRunWithData({ findings: [finding({ id: "ISSUE-001", severity: "important", surface: "api", area: "Orders", title: "GET /orders fails with HTTP 500 when page_size=0", plain: PLAIN })] });
  await buildAndLint(fx.home, fx.runId);
  await cli(fx.home, "run", "finish", "--run", fx.runId);

  const second = [finding({ id: "ISSUE-001", severity: "important", surface: "api", area: "Orders", title: "GET /orders fails with HTTP 500 when q is '('", steps: ["GET /api/orders?q=("], plain: PLAIN })];
  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: second });
  const first = await buildAndLint(fx.home, r2.runId);
  assert.equal(first.lint.code, 1);
  assert.match(first.lint.json.errors.join("\n"), /ISSUE-001 resembles the known bug BUG-001 .*set "bug": "BUG-001" if it is, or "bug": "new"/);

  writeJson(path.join(r2.runDir, "data", "findings.json"), [{ ...second[0], bug: "new" }]);
  const ok = await buildAndLint(fx.home, r2.runId);
  assert.equal(ok.lint.code, 0, JSON.stringify(ok.lint.json.errors));
  const fin = await cli(fx.home, "run", "finish", "--run", r2.runId);
  assert.equal(fin.json.lifecycle.new, 1);
  assert.equal(loadBugs(fx.store).bugs.length, 2);
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-001")?.status, "new", "the first bug was neither found nor re-checked");
});

test("a finding that names a bug that does not exist is refused", async () => {
  const fx = makeRunWithData();
  writeJson(path.join(fx.runDir, "data", "findings.json"), findingsOf(fx.runDir).map((f, i) => (i === 0 ? { ...f, bug: "BUG-042" } : f)));
  const { lint } = await buildAndLint(fx.home, fx.runId);
  assert.equal(lint.code, 1);
  assert.match(lint.json.errors.join("\n"), /ISSUE-001: bug "BUG-042" does not exist/);
});

test("memory_get_context carries the bugs: what is open (came back first), what was fixed, what is accepted", async () => {
  const fx = makeRunWithData();
  await buildAndLint(fx.home, fx.runId);
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: without(findingsOf(fx.runDir), "ISSUE-001") });
  writeJson(path.join(r2.runDir, "data", "rechecks.json"), [{ bug: "BUG-001", result: "passes", how: "Repeated the steps; the order was refused." }]);
  await buildAndLint(fx.home, r2.runId);
  await cli(fx.home, "run", "finish", "--run", r2.runId);
  const r3 = startAnotherRun(fx, "2026-11-01T10:00:00Z", { findings: [] });
  const ctx = await cli(fx.home, "memory", "context", "--run", r3.runId);
  assert.equal(ctx.code, 0);
  assert.deepEqual(ctx.json.bugs.open.map((b: { id: string }) => b.id).sort(), ["BUG-002", "BUG-003"]);
  assert.equal(ctx.json.bugs.fixed_recently[0].id, "BUG-001");
  assert.ok(ctx.json.focus.some((l: string) => /2 bug\(s\) from earlier runs are still open/.test(l)));
  void writeFixtureData;
});

const PLAIN = {
  title: "The orders list fails on an unusual request",
  where: "Behind the screens (the part that talks to the Admin Portal)",
  what_happens: "Asking for the orders list in an unusual way makes the system fail instead of giving a clear message.",
  who_is_affected: "Staff using the orders search.",
  how_to_see_it: [],
  expected: "A short, clear message.",
};
