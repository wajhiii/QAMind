import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { writeJson } from "../../core/lib/fsutil.ts";
import { loadBank } from "../../core/lib/bank/bank.ts";
import { checkConfigText } from "../../core/lib/config.ts";
import { lintAdminLanguage } from "../../core/lib/adminreport.ts";
import { contextFrom } from "../../core/lib/privacy.ts";
import { lintReports, writeReports } from "../../core/lib/reports.ts";
import { startRun } from "../../core/lib/run.ts";
import { checkTicket, cleanRef, lintTicketResults, readTicketData, ticketCounts } from "../../core/lib/ticket.ts";
import type { CriterionResult, TicketFile } from "../../core/lib/ticket.ts";
import { cli, DEMO_CONFIG, DEMO_ENV, finding, makeConfiguredProject, makeRunWithData, tmp, writeFixtureData } from "./helpers.ts";

// "Test this ticket" mode (spec 13.4): criteria with a person's confirmation, a result for each criterion that is backed, a checklist in both reports, and checks tagged with the ticket.

const privacy = contextFrom(checkConfigText(DEMO_CONFIG, { projectRoot: makeConfiguredProject(), env: DEMO_ENV }).config, ["a1@acme.test"]);
const TICKET: TicketFile = {
  ref: "LUM-123",
  source: "linear",
  title: "Quantity limits on new orders",
  criteria: [
    { id: "AC-1", text: "An order line's quantity must be a whole number from 1 to 1000.", plain: "A customer can only order a whole number of items, from 1 to 1000.", origin: "stated" },
    { id: "AC-2", text: "Placing an order with no lines is refused with a clear message.", plain: "An order with nothing in it is refused, with a message that says why.", origin: "derived", confirmed: true },
  ],
};

test("references are kept without what could be a token: a URL loses its query and fragment, text is cut", () => {
  assert.equal(cleanRef("https://tracker.example.com/issue/LUM-123?token=abc#c1"), "https://tracker.example.com/issue/LUM-123");
  assert.equal(cleanRef("LUM-123"), "LUM-123");
  assert.equal(cleanRef("docs/stories/orders.md"), "docs/stories/orders.md");
  assert.equal(cleanRef("x".repeat(500)).length, 200);
});

test("the criteria are checked: shape, ids, private data, and the rule for derived ones (confirmed with a person; assumed in CI)", () => {
  const ok = checkTicket(TICKET, { trigger: "manual", privacy, expectedRef: "LUM-123" });
  assert.equal(ok.ok, true, ok.errors.join("; "));
  assert.equal(ok.ticket?.criteria.length, 2);
  assert.deepEqual(ok.assumed, []);

  const bad = checkTicket({ ref: "", source: "email", title: "", criteria: [{ id: "one", text: "short", origin: "maybe" }, { id: "AC-1", text: "A good criterion about quantity.", origin: "stated" }, { id: "AC-1", text: "The same id again, which is not allowed.", origin: "stated" }, { id: "AC-3", text: "Mail the result to jane.smith@gmail.com when done.", origin: "stated" }] }, { trigger: "manual", privacy });
  const text = bad.errors.join("\n");
  for (const re of [/"ref" is the ticket id/, /"source" must be one of linear, github, file, url, pasted, other/, /"title" is the ticket title/, /"id" must look like AC-1/, /one testable statement of 8 to 500 characters/, /"origin" is "stated"/, /the id AC-1 is used twice/, /holds private data/]) assert.match(text, re);

  assert.match(checkTicket(TICKET, { trigger: "manual", privacy, expectedRef: "LUM-999" }).errors.join(), /the run was started for "LUM-999"/);
  assert.equal(checkTicket({ ...TICKET, criteria: [] }, { trigger: "manual", privacy }).ok, false);
  assert.equal(checkTicket({ ...TICKET, criteria: Array.from({ length: 31 }, (_, i) => ({ id: `AC-${i + 1}`, text: "A criterion that is long enough.", origin: "stated" })) }, { trigger: "manual", privacy }).ok, false);

  const unconfirmed = { ...TICKET, criteria: [{ ...TICKET.criteria[1]!, confirmed: false }] };
  const manual = checkTicket(unconfirmed, { trigger: "manual", privacy });
  assert.equal(manual.ok, false);
  assert.match(manual.errors.join(), /has to be shown to the person who asked and confirmed before you test it/);
  const ci = checkTicket(unconfirmed, { trigger: "ci", privacy });
  assert.equal(ci.ok, true, "in CI nobody can confirm");
  assert.deepEqual(ci.assumed, ["AC-2"]);
  assert.match(checkTicket({ ...TICKET, criteria: [{ ...TICKET.criteria[1]!, confirmed: true }] }, { trigger: "manual", privacy }).warnings.join(), /Every criterion was derived/);
});

test("a ticket run: the mode and the ticket go together, the reference is kept clean, and the run says which ticket it is for", () => {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject();
  const base = { cwd: proj, kind: "qa-only" as const, host: "test", home, env: {}, sessionId: "s1" };
  assert.throws(() => startRun({ ...base, mode: "ticket" }), /Ticket mode needs the ticket to test/);
  assert.throws(() => startRun({ ...base, mode: "full", ticket: "LUM-1" }), /A ticket was given, so the mode is "ticket"/);
  const r = startRun({ ...base, mode: "ticket", ticket: "https://tracker.example.com/issue/LUM-123?token=secret" });
  assert.equal(r.status, "ready");
  assert.equal(r.run?.mode, "ticket");
  assert.equal(r.run?.ticket, "https://tracker.example.com/issue/LUM-123");
  const meta = JSON.parse(fs.readFileSync(path.join(r.run?.dir as string, "data", "meta.json"), "utf8")) as { ticket_ref?: string };
  assert.equal(meta.ticket_ref, "https://tracker.example.com/issue/LUM-123");
  assert.ok(!JSON.stringify(r).includes("token=secret"));
});

const results = (over: Partial<CriterionResult>[] = []): CriterionResult[] => [
  { criterion: "AC-1", status: "not-met", why: "Quantity -5 and 0 are accepted and create an order with a negative total.", plain_why: "The system accepted an order for minus five items.", findings: ["ISSUE-001"], ...over[0] },
  { criterion: "AC-2", status: "met", why: "Posted an order with an empty list as a customer: refused with 'at least one item'.", plain_why: "An order with nothing in it was refused with a clear message.", evidence: ["evidence/api/e.json"], ...over[1] },
];

function ticketRun() {
  const fx = makeRunWithData({ mode: "ticket", ticket: "LUM-123", findings: [finding({ id: "ISSUE-001", severity: "important", surface: "api", area: "Orders", type: "validation", title: "Quantity is not validated", plain: { title: "An order for minus five items is accepted", where: "Behind the screens (the part that takes orders)", what_happens: "The system accepts an order for a negative number of items and gives it a negative total.", who_is_affected: "Every customer who places an order.", how_to_see_it: [], expected: "The order is refused with a message." } })] });
  writeJson(path.join(fx.runDir, "data", "ticket.json"), TICKET);
  writeJson(path.join(fx.runDir, "data", "ticket-results.json"), results());
  return fx;
}

test("lint: every criterion needs an answer, and each answer needs its proof", async () => {
  const fx = ticketRun();
  const lint = () => lintReports(fx.runDir, [], fx.store).errors.filter((e) => /criterion|ticket/i.test(e));
  writeReports(fx.runDir, fx.store);
  assert.deepEqual(lint(), []);

  const data = readTicketData(fx.runDir) as NonNullable<ReturnType<typeof readTicketData>>;
  const known = { findings: ["ISSUE-001"], unconfirmed: [] };
  const run = (rs: CriterionResult[]) => lintTicketResults(fx.runDir, { ...data, results: rs }, known, { ticket_ref: "LUM-123" });
  writeJson(path.join(fx.runDir, "data", "ticket-results.json"), []);
  assert.match(run([]).errors.join("\n"), /Criterion AC-1 has no result[\s\S]*Criterion AC-2 has no result/);
  assert.match(run([results()[0]!]).errors.join(), /Criterion AC-2 has no result/);
  assert.match(run(results([{ findings: [] }])).errors.join(), /a criterion that is not met is a finding/);
  assert.match(run(results([{ findings: ["ISSUE-009"] }])).errors.join(), /ISSUE-009 is not a finding of this run/);
  assert.match(run(results([{}, { evidence: [] }])).errors.join(), /only "met" with something to show for it/);
  assert.match(run(results([{ why: "no" }])).errors.join(), /"why" is a real sentence/);
  assert.match(run([...results(), results()[0]!]).errors.join(), /AC-1 is answered twice/);
  assert.match(run(results([{ criterion: "AC-7" }])).errors.join(), /"criterion" must be one of AC-1, AC-2/);
  assert.equal(run(results([{}, { status: "not-testable", why: "There is no test account for the warehouse role, so the empty-order path cannot be reached.", evidence: [] }])).errors.length, 0);
  assert.match(lintTicketResults(fx.runDir, undefined, known, { ticket_ref: "LUM-123" }).errors.join(), /data\/ticket\.json is missing/);
  assert.deepEqual(lintTicketResults(fx.runDir, undefined, known, {}), { errors: [], warnings: [] }, "an ordinary run is not asked about tickets");
  fs.rmSync(path.join(fx.runDir, "data", "ticket-results.json"));
  assert.match(lint().join(), /ticket-results\.json is missing/);
});

test("both reports carry the checklist: ✅ met, ❌ not met, ⛔ cannot be tested, in the reader's own words", async () => {
  const fx = ticketRun();
  writeJson(path.join(fx.runDir, "data", "ticket-results.json"), results([{}, {}]).concat([]));
  const { technical, admin } = writeReports(fx.runDir, fx.store);
  assert.match(technical, /## Ticket: LUM-123 \(acceptance criteria\)/);
  assert.match(technical, /1 of 2 criteria met, 1 not met, 0 could not be tested/);
  assert.match(technical, /\| \*\*AC-1\*\* An order line's quantity must be a whole number from 1 to 1000\. \| ❌ Not met \| Quantity -5 and 0 are accepted[^|]*\| \[ISSUE-001\]\(#ISSUE-001\) \| - \|/);
  assert.match(technical, /\*\*AC-2\*\* Placing an order with no lines[^|]*_\(derived, confirmed\)_ \| ✅ Met/);
  assert.match(admin, /## What was asked for \(Quantity limits on new orders\)/);
  assert.match(admin, /1 of 2 things that were asked for are working, 1 are not/);
  assert.match(admin, /- ❌ Not met: A customer can only order a whole number of items, from 1 to 1000\. — The system accepted an order for minus five items\./);
  assert.match(admin, /- ✅ Met: An order with nothing in it is refused/);
  assert.deepEqual(lintAdminLanguage(admin).filter((i) => /asked for|Met|Not met/.test(i.text)), [], "the checklist is plain");

  // a criterion written in technical words, with no plain version, is caught by the admin language check
  const raw: TicketFile = { ...TICKET, criteria: [{ id: "AC-1", text: "POST /api/orders returns HTTP 400 for a negative quantity.", origin: "stated" }, TICKET.criteria[1]!] };
  writeJson(path.join(fx.runDir, "data", "ticket.json"), raw);
  const again = writeReports(fx.runDir, fx.store);
  assert.ok(lintAdminLanguage(again.admin).some((i) => /POST|HTTP|status code|request method/.test(i.found + i.text)), "technical wording in the admin checklist is refused");
  assert.match(again.technical, /POST \/api\/orders returns HTTP 400/, "the technical report keeps the ticket's words");
  assert.deepEqual(ticketCounts(readTicketData(fx.runDir) as never), { total: 2, met: 1, not_met: 1, not_testable: 0, assumed: 0 });
});

test("a CI run lists derived criteria as assumed in both reports", async () => {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject();
  const r = startRun({ cwd: proj, mode: "ticket", ticket: "docs/story.md", kind: "qa-only", host: "test", home, env: { QAMIND_TRIGGER: "ci" }, sessionId: "s1" });
  assert.equal(r.status, "ready");
  const runDir = r.run?.dir as string;
  writeFixtureData(runDir, { findings: [] });
  const t: TicketFile = { ref: "docs/story.md", source: "file", title: "Reorder", criteria: [{ id: "AC-1", text: "A customer can reorder a past order in one click.", plain: "A customer can order the same things again with one click.", origin: "derived" }] };
  writeJson(path.join(runDir, "data", "ticket.json"), t);
  writeJson(path.join(runDir, "data", "ticket-results.json"), [{ criterion: "AC-1", status: "met", why: "Clicked reorder on a past order and the same lines were in the new order.", evidence: ["evidence/api/e.json"] }]);
  const { technical, admin } = writeReports(runDir, r.project?.store);
  assert.match(technical, /1 criteria were derived by QAMind and nobody could confirm them \(assumed\)/);
  assert.match(technical, /_\(assumed\)_/);
  assert.match(admin, /worked out by the checker because the request did not say what "done" means/);
  assert.match(admin, /\(assumed\)/);
});

test("the CLI: ticket check and status say what is wrong and what is missing, and a run that is not a ticket run is told so", async () => {
  const fx = ticketRun();
  assert.equal((await cli(fx.home, "ticket", "check", "--run", fx.runId)).code, 0);
  const ok = await cli(fx.home, "ticket", "check", "--run", fx.runId);
  assert.deepEqual([ok.json.ok, ok.json.criteria, ok.json.stated, ok.json.derived], [true, 2, 1, 1]);
  writeJson(path.join(fx.runDir, "data", "ticket.json"), { ...TICKET, criteria: [{ ...TICKET.criteria[0]!, text: "x" }] });
  const bad = await cli(fx.home, "ticket", "check", "--run", fx.runId);
  assert.equal(bad.code, 1);
  assert.match(bad.json.errors.join(), /one testable statement/);

  writeJson(path.join(fx.runDir, "data", "ticket.json"), TICKET);
  writeJson(path.join(fx.runDir, "data", "ticket-results.json"), results([{}, { evidence: [], tests: ["T-001"] }]).slice(0, 1));
  const status = await cli(fx.home, "ticket", "status", "--run", fx.runId);
  assert.equal(status.code, 1);
  assert.deepEqual(status.json.counts, { total: 2, met: 0, not_met: 1, not_testable: 1, assumed: 0 });
  assert.match(status.json.problems.join(), /Criterion AC-2 has no result/);
  assert.equal(status.json.checklist[1].result, "⛔ No result");

  const plain = makeRunWithData();
  assert.match((await cli(plain.home, "ticket", "check", "--run", plain.runId)).json.error, /was not started for a ticket/);
});

test("run finish: the summary carries the ticket's counts, and checks saved in a ticket run are tagged with the ticket", async () => {
  const fx = ticketRun();
  const CARD = { protects: "Quantity limits on new orders stay enforced.", fails_when: "A negative quantity gets a 2xx answer instead of a 4xx one.", not_duplicate: "No other test sends a negative quantity to the orders endpoint." };
  const plan = { version: 1, name: "qty", probes: [{ id: "P1", title: "quantity -5", method: "POST", path: "/orders", role: "acme-1", body: { reference: "QA-1", items: [{ product_id: "p-101", quantity: -5 }] }, expect: { status: "4xx" } }] };
  const file = (name: string, extra: object): string => {
    const f = path.join(fx.runDir, "data", "bank", `${name}.json`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ kind: "api", title: "A negative quantity is refused by the orders endpoint", area: "Orders", card: CARD, from_issue: "ISSUE-001", plan, ...extra }));
    return f;
  };
  const bad = await cli(fx.home, "tests", "save", "--run", fx.runId, "--file", file("bad", { criteria: ["AC-9"] }));
  assert.match(bad.json.error, /criteria AC-9 are not in this run's ticket \(it has AC-1, AC-2\)/);
  const saved = await cli(fx.home, "tests", "save", "--run", fx.runId, "--file", file("good", { criteria: ["AC-1"] }));
  assert.equal(saved.code, 0, JSON.stringify(saved.json));
  const t = loadBank(fx.store).tests[0];
  assert.equal(t?.ticket, "LUM-123");
  assert.deepEqual(t?.criteria, ["AC-1"]);

  writeJson(path.join(fx.runDir, "data", "ticket-results.json"), results([{}, { tests: [] }]).map((r, i) => (i === 0 ? { ...r, tests: ["T-001"] } : r)));
  fs.rmSync(path.join(fx.runDir, "data", "bank-skip.json"), { force: true });
  await cli(fx.home, "report", "build", "--run", fx.runId);
  const fin = await cli(fx.home, "run", "finish", "--run", fx.runId);
  assert.equal(fin.code, 0, JSON.stringify(fin.json));
  assert.deepEqual(fin.json.ticket, { ref: "LUM-123", total: 2, met: 1, not_met: 1, not_testable: 0, assumed: 0 });
  assert.equal(fin.json.mode, "ticket");
});
