import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { readJson, writeJson } from "../../core/lib/fsutil.ts";
import { decidePreToolUse } from "../../core/lib/hooks.ts";
import { loadBugs } from "../../core/lib/memory/bugs.ts";
import { feedbackStats, importAdminFeedback, loadFeedback, parseVerdict } from "../../core/lib/memory/feedback.ts";
import { loadFalseAlarms } from "../../core/lib/memory/falsealarms.ts";
import { loadLearnings } from "../../core/lib/memory/learnings.ts";
import { loadRisk } from "../../core/lib/memory/risk.ts";
import type { Finding } from "../../core/lib/report.ts";
import { cli, makeRunWithData, startAnotherRun } from "./helpers.ts";

const findingsOf = (runDir: string): Finding[] => readJson<Finding[]>(path.join(runDir, "data", "findings.json")) ?? [];

/** A finished first run with three findings (BUG-001 critical, BUG-002 important, BUG-003 minor). */
async function firstRun(): Promise<ReturnType<typeof makeRunWithData> & { all: Finding[] }> {
  const fx = makeRunWithData();
  const all = findingsOf(fx.runDir);
  await cli(fx.home, "report", "build", "--run", fx.runId);
  assert.equal((await cli(fx.home, "report", "lint", "--run", fx.runId)).code, 0);
  assert.equal((await cli(fx.home, "run", "finish", "--run", fx.runId)).code, 0);
  return { ...fx, all };
}
const give = (home: string, proj: string, ...args: string[]) => cli(home, "feedback", "add", ...args, "--project", proj, "--by", "Sam Rivera");

test("parsing what a person typed: verdicts in their own words, with a level, a target and a note", () => {
  assert.deepEqual(parseVerdict("not a bug, this is how we want it"), { verdict: "not-a-bug", note: "this is how we want it" });
  assert.deepEqual(parseVerdict("Won't fix: too rare to matter"), { verdict: "wont-fix", note: "too rare to matter" });
  assert.deepEqual(parseVerdict("wrong severity: important, only staff see it"), { verdict: "wrong-severity", value: "important", note: "only staff see it" });
  assert.deepEqual(parseVerdict("duplicate of issue-002"), { verdict: "duplicate-of", value: "ISSUE-002" });
  assert.deepEqual(parseVerdict("good catch"), { verdict: "good-catch" });
  assert.equal(parseVerdict("please look at this again"), undefined, "not guessed");
});

test("not-a-bug: it becomes a false alarm with who said so; a later run cannot report it again, and the agent can cite the person", async () => {
  const fx = await firstRun();
  assert.equal((await give(fx.home, fx.proj, "ISSUE-003", "not-a-bug")).code, 1, "a reason is required");
  const r = await give(fx.home, fx.proj, "ISSUE-003", "not-a-bug", "--note", "Showing a zero discount with a minus sign is our house style.");
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.match(r.json.effects[0], /BUG-003 .* marked as not a bug\. It is now a known false alarm \(FA-001\)/);
  const alarm = loadFalseAlarms(fx.store).alarms[0] as unknown as { source: string; feedback: { by: string; id: string } };
  assert.equal(alarm.source, "owner");
  assert.equal(alarm.feedback.by, "Sam Rivera");
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-003")?.status, "not-a-bug");

  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: fx.all });
  await cli(fx.home, "report", "build", "--run", r2.runId);
  const lint = await cli(fx.home, "report", "lint", "--run", r2.runId);
  assert.equal(lint.code, 1);
  const errs = lint.json.errors.join("\n");
  assert.match(errs, /ISSUE-003 resembles known false alarm FA-001/);
  assert.match(errs, /ISSUE-003 is BUG-003, which Sam Rivera marked as not a bug on \d{4}-\d\d-\d\d \("Showing a zero discount/);

  const ctx = await cli(fx.home, "memory", "context", "--run", r2.runId);
  assert.equal(ctx.json.false_alarms[0].feedback.by, "Sam Rivera", "the agent is told who said it, so it can cite them");
  assert.equal(ctx.json.bugs.not_a_bug[0].id, "BUG-003");
});

test("wrong-severity: the next run shows the severity the person set, says who set it, and the counts follow", async () => {
  const fx = await firstRun();
  const r = await give(fx.home, fx.proj, "ISSUE-001", "wrong-severity", "important", "--note", "Only our own staff can reach that page.");
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.match(r.json.effects.join(" "), /BUG-001 .* will be shown as important \(it was critical\)/);
  assert.match(r.json.effects.join(" "), /Saved as a learning \(L-001\)/);
  assert.match(loadLearnings(fx.store).active[0]?.text ?? "", /counts as important, not critical\. Severity set by Sam Rivera/);

  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: fx.all });
  await cli(fx.home, "report", "build", "--run", r2.runId);
  const shown = findingsOf(r2.runDir).find((f) => f.id === "ISSUE-001") as Finding;
  assert.equal(shown.severity, "important");
  assert.equal(shown.severity_assessed, "critical", "what the run judged is kept");
  assert.match(shown.severity_note ?? "", /Set to important by Sam Rivera on \d{4}-\d\d-\d\d; this run assessed it as critical/);
  const lint = await cli(fx.home, "report", "lint", "--run", r2.runId);
  assert.equal(lint.code, 0, JSON.stringify(lint.json.errors));
  const admin = fs.readFileSync(path.join(r2.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(admin, /Problems: 🔴 0 critical · 🟠 2 important · 🟡 1 minor/);
  assert.match(admin, /\*\*Importance:\*\* A person set this to important \(the check judged it critical\)\./);
  assert.ok(!admin.startsWith("⛔"), "with no critical problem left the verdict is no longer 'not ready'");
});

test("wont-fix: the problem is listed as known and accepted, not counted, and the run still finishes", async () => {
  const fx = await firstRun();
  const r = await give(fx.home, fx.proj, "ISSUE-002", "wont-fix", "--note", "Planned for the rewrite in spring.");
  assert.equal(r.code, 0, JSON.stringify(r.json));
  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: fx.all });
  await cli(fx.home, "report", "build", "--run", r2.runId);
  assert.deepEqual(findingsOf(r2.runDir).map((f) => f.id), ["ISSUE-001", "ISSUE-003"]);
  const accepted = readJson<Finding[]>(path.join(r2.runDir, "data", "known-accepted.json")) ?? [];
  assert.equal(accepted[0]?.id, "ISSUE-002");
  const lint = await cli(fx.home, "report", "lint", "--run", r2.runId);
  assert.equal(lint.code, 0, JSON.stringify(lint.json.errors));
  const tech = fs.readFileSync(path.join(r2.runDir, "TECHNICAL-REPORT.md"), "utf8");
  const admin = fs.readFileSync(path.join(r2.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(tech, /## Known, accepted[\s\S]*\*\*BUG-002\*\* ISSUE-002[\s\S]*accepted by Sam Rivera on \d{4}-\d\d-\d\d: Planned for the rewrite in spring\./);
  assert.match(admin, /## Known problems that were accepted\n\n[^\n]*\n\n- .*\(accepted by Sam Rivera on .*: Planned for the rewrite in spring\./);
  assert.match(admin, /Problems: 🔴 1 critical · 🟠 0 important · 🟡 1 minor/);
  const fin = await cli(fx.home, "run", "finish", "--run", r2.runId);
  assert.equal(fin.json.lifecycle.accepted, 1);
  assert.equal(fin.json.counts.important, 0);
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-002")?.status, "accepted", "accepted stays accepted");
});

test("wont-fix: an agent that rewrites findings.json after a lint error does not make the accepted problem count twice", async () => {
  const fx = await firstRun();
  assert.equal((await give(fx.home, fx.proj, "ISSUE-002", "wont-fix", "--note", "Planned for the rewrite in spring.")).code, 0);
  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: fx.all });
  await cli(fx.home, "report", "build", "--run", r2.runId);
  // the agent writes the whole file again: the accepted finding is back, this time without the id it had
  writeJson(path.join(r2.runDir, "data", "findings.json"), fx.all.map((f) => (f.id === "ISSUE-002" ? (({ id: _id, ...rest }) => rest)(f) : f)));
  await cli(fx.home, "report", "build", "--run", r2.runId);
  writeJson(path.join(r2.runDir, "data", "findings.json"), fx.all);
  await cli(fx.home, "report", "build", "--run", r2.runId);
  const known = readJson<Finding[]>(path.join(r2.runDir, "data", "known-accepted.json")) ?? [];
  assert.equal(known.length, 1, JSON.stringify(known.map((k) => k.id)));
  assert.equal(known[0]?.id, "ISSUE-002", "the entry with an id is kept");
  const fin = await cli(fx.home, "run", "finish", "--run", r2.runId);
  assert.equal(fin.json.lifecycle.accepted, 1);
  assert.equal(readJson<{ accepted_seen: unknown[] }>(path.join(r2.runDir, "data", "lifecycle.json"))?.accepted_seen.length, 1);
});

test("fixed: a person says it is fixed; if a later run finds it, it came back. duplicate-of joins two bugs", async () => {
  const fx = await firstRun();
  assert.equal((await give(fx.home, fx.proj, "ISSUE-001", "fixed", "--note", "Deployed on Tuesday.")).code, 0);
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-001")?.status, "fixed");
  assert.equal((await give(fx.home, fx.proj, "BUG-003", "duplicate-of", "BUG-002")).code, 0);
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-003")?.duplicate_of, "BUG-002");
  assert.equal((await give(fx.home, fx.proj, "BUG-002", "duplicate-of", "BUG-002")).code, 1, "not a duplicate of itself");

  const r2 = startAnotherRun(fx, "2026-10-31T10:00:00Z", { findings: fx.all });
  await cli(fx.home, "report", "build", "--run", r2.runId);
  const fin = await cli(fx.home, "run", "finish", "--run", r2.runId);
  assert.equal(fin.json.lifecycle.regressed, 1, "BUG-001 was recorded as fixed and is here again");
  const bugs = loadBugs(fx.store).bugs;
  assert.equal(bugs.find((b) => b.id === "BUG-001")?.status, "regressed");
  assert.equal(fin.json.findings.find((f: { id: string }) => f.id === "ISSUE-003").bug, "BUG-002", "a finding that matches a duplicate counts under the bug it duplicates");
});

test("confirmed and good-catch raise the learnings that shaped the finding and the area's risk; feedback is remembered with who and when", async () => {
  const fx = makeRunWithData();
  const learned = await cli(fx.home, "memory", "learn", "--run", fx.runId, "--type", "test-tip", "--area", "Orders / access", "--text", "Change the order number in the address to test whether another company's order can be opened.");
  assert.equal(learned.code, 0);
  writeJson(path.join(fx.runDir, "data", "findings.json"), findingsOf(fx.runDir).map((f) => (f.id === "ISSUE-001" ? { ...f, memory_applied: ["L-001"] } : f)));
  await cli(fx.home, "report", "build", "--run", fx.runId);
  assert.equal((await cli(fx.home, "run", "finish", "--run", fx.runId)).code, 0);
  const before = loadLearnings(fx.store).active.find((l) => l.id === "L-001")?.confidence ?? 0;
  const risk0 = loadRisk(fx.store).areas.find((a) => a.area === "Orders / access")?.events.length ?? 0;

  const r = await give(fx.home, fx.proj, "ISSUE-001", "good-catch");
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.match(r.json.effects[0], /confirmed.*1 learning\(s\) that shaped it are more trusted/);
  assert.equal(loadLearnings(fx.store).active.find((l) => l.id === "L-001")?.confidence, before + 1);
  assert.equal(loadRisk(fx.store).areas.find((a) => a.area === "Orders / access")?.events.length, risk0 + 1);
  const rec = loadFeedback(fx.store).records[0];
  assert.equal(rec?.by, "Sam Rivera");
  assert.match(rec?.at ?? "", /^\d{4}-\d\d-\d\dT/);
  assert.equal(rec?.issue, "ISSUE-001");
});

test("feedback needs a real target: unknown finding, unknown run, a finding number from no run", async () => {
  const fx = await firstRun();
  assert.match((await give(fx.home, fx.proj, "ISSUE-099", "confirmed")).json.error, /No finding ISSUE-099 in any finished run/);
  assert.match((await give(fx.home, fx.proj, "BUG-099", "confirmed")).json.error, /No bug BUG-099/);
  assert.match((await give(fx.home, fx.proj, "ISSUE-001", "confirmed", "--run", "run-none")).json.error, /No finished run run-none/);
  assert.match((await give(fx.home, fx.proj, "ISSUE-001", "wrong-severity", "huge")).json.error, /wrong-severity needs the right level/);
  assert.match((await give(fx.home, fx.proj, "ISSUE-001", "nonsense")).json.error, /is not a verdict/);
  assert.equal(loadFeedback(fx.store).records.length, 0, "nothing was written by any of them");
});

test("a person's note is screened: it cannot carry a customer's data into memory", async () => {
  const fx = await firstRun();
  const r = await give(fx.home, fx.proj, "ISSUE-003", "not-a-bug", "--note", "Reported by jane.smith@gmail.com, who says it is fine.");
  assert.equal(r.code, 1);
  assert.match(r.json.error, /Refusing to save this feedback/);
});

test("the feedback lines in ADMIN-REPORT.md are imported; a line that is not a verdict is returned, not guessed", async () => {
  const fx = await firstRun();
  const file = path.join(fx.runDir, "ADMIN-REPORT.md");
  const text = fs.readFileSync(file, "utf8")
    .replace(/(\[ISSUE-002\][\s\S]*?)/, "$1")
    .split(/^### /m)
    .map((block, i) => {
      if (block.includes("[ISSUE-003]")) return block.replace("______", "not a bug: house style for zero discounts");
      if (block.includes("[ISSUE-002]")) return block.replace("______", "can someone look at this again please");
      if (block.includes("[ISSUE-001]")) return block.replace("______", "confirmed, we reproduced it too");
      return i === 0 ? block : block;
    })
    .join("### ");
  fs.writeFileSync(file, text);
  const lines = importAdminFeedback(fx.store, fx.runDir, "Priya Nair");
  assert.deepEqual(lines.map((l) => [l.issue, l.applied?.verdict ?? "not applied"]), [["ISSUE-001", "confirmed"], ["ISSUE-002", "not applied"], ["ISSUE-003", "not-a-bug"]].sort());
  assert.match(lines.find((l) => l.issue === "ISSUE-002")?.problem ?? "", /does not start with a verdict/);
  assert.equal(loadFeedback(fx.store).records.every((r) => r.by === "Priya Nair" && r.via === "admin-report"), true);
  assert.equal(importAdminFeedback(fx.store, fx.runDir, "Priya Nair").filter((l) => l.applied).length, 0, "importing twice does not apply anything twice");
});

test("feedback stats give no rate from a handful of answers, and one verdict per bug counts", async () => {
  const fx = await firstRun();
  await give(fx.home, fx.proj, "ISSUE-001", "confirmed");
  await give(fx.home, fx.proj, "ISSUE-001", "good-catch");
  await give(fx.home, fx.proj, "ISSUE-002", "not-a-bug", "--note", "Intended behaviour of the old system.");
  const few = feedbackStats(fx.store);
  assert.equal(few.total, 3);
  assert.equal(few.precision, undefined);
  assert.match(few.note, /needs at least 5 judged findings; there are 2/);
});

test("a QA run cannot give feedback: the hook refuses the command, and writing the files by hand, in every run mode", async () => {
  const fx = makeRunWithData();
  const at = new Date("2026-10-30T10:30:00Z"); // inside the fixture run's lifetime: a marker that has expired is ignored
  const input = (cmd: string) => ({ session_id: "s1", cwd: fx.proj, tool_name: "Bash", tool_input: { command: cmd } });
  for (const cmd of ["qamind feedback add ISSUE-001 not-a-bug --note x", "qamind feedback import --run run-1", `cd /tmp && qamind feedback add BUG-001 confirmed`]) {
    assert.equal(decidePreToolUse(input(cmd), fx.home, [], at)?.decision, "deny", cmd);
    assert.match(decidePreToolUse(input(cmd), fx.home, [], at)?.reason ?? "", /giving feedback on findings/);
  }
  assert.equal(decidePreToolUse(input("qamind feedback list"), fx.home, [], at), null, "reading is fine");
  assert.equal(decidePreToolUse(input("qamind bugs list"), fx.home, [], at), null);
  for (const file of [path.join(fx.store, "memory", "bugs.jsonl"), path.join(fx.store, "memory", "feedback.jsonl"), path.join(fx.store, "test-bank", "bank.jsonl")]) {
    const write = decidePreToolUse({ session_id: "s1", cwd: fx.proj, tool_name: "Write", tool_input: { file_path: file, content: "" } }, fx.home, [], at);
    assert.equal(write?.decision, "deny", file);
  }
});
