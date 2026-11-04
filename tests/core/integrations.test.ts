import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkConfigText } from "../../core/lib/config.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { decidePreToolUse } from "../../core/lib/hooks.ts";
import { loadBugs } from "../../core/lib/memory/bugs.ts";
import { loadFeedback } from "../../core/lib/memory/feedback.ts";
import { loadMetrics } from "../../core/lib/metrics.ts";
import { loadTicketMap } from "../../core/lib/tracker.ts";
import { startRun } from "../../core/lib/run.ts";
import { DEMO_ENV, cli, finding, makeConfiguredProject, makeProject, makeRunWithData, startAnotherRun, tmp, withConfigYaml, writeFixtureData } from "./helpers.ts";

// The optional integrations (spec 11.4, 13.5, 13.16): Linear tickets, Sentry's errors during a run, and what each tells memory.

const NOW = new Date("2026-10-30T10:30:00Z");
const LINEAR = "integrations:\n  linear:\n    team: ENG\n    labels: [qamind]";
const BOTH = `${LINEAR}\n  sentry:\n    organization: acme\n    projects: [acme-api]\n    environments: [staging]`;
const cfg = (yaml: string) => checkConfigText(withConfigYaml(yaml), { projectRoot: makeProject({ files: { "openapi.yaml": "x" } }), env: DEMO_ENV });

test("the integrations settings have defaults, and wrong ones are refused by name (a production environment cannot be a test environment)", () => {
  const none = cfg("").config;
  assert.deepEqual(none?.integrations, {});
  const ok = cfg(BOTH).config?.integrations;
  assert.equal(ok?.linear?.team, "ENG");
  assert.deepEqual(ok?.linear?.labels, ["qamind"]);
  assert.equal(ok?.linear?.create, "ask");
  assert.equal(ok?.linear?.escaped_label, "escaped");
  assert.ok(ok?.linear?.not_a_bug.includes("not a bug"));
  assert.ok(ok?.linear?.wont_fix.includes("won't fix"));
  assert.deepEqual(ok?.sentry?.environments, ["staging"]);
  assert.equal(ok?.sentry?.window_margin_minutes, 2);

  const bad = (yaml: string): string => cfg(yaml).problems.join("\n");
  assert.match(bad("integrations:\n  jira:\n    team: X"), /integrations\.jira is not a supported integration/);
  assert.match(bad("integrations:\n  linear:\n    labels: [a]"), /integrations\.linear\.team is needed/);
  assert.match(bad("integrations:\n  linear:\n    team: ENG\n    create: always"), /create must be "ask".*"never"/);
  assert.match(bad("integrations:\n  linear:\n    team: ENG\n    token: abc"), /integrations\.linear\.token is not a setting/);
  assert.match(bad("integrations:\n  sentry:\n    projects: [a]\n    environments: [production]"), /"production" looks like production/);
  assert.match(bad("integrations:\n  sentry:\n    projects: [a]\n    environments: [prod-eu]"), /looks like production/);
  assert.match(bad("integrations:\n  sentry:\n    environments: [staging]"), /integrations\.sentry\.projects is needed/);
  assert.match(bad("integrations:\n  sentry:\n    projects: [a]\n    environments: [staging]\n    window_margin_minutes: 99"), /window_margin_minutes must be a whole number from 0 to 30/);
  assert.equal(cfg("integrations:\n  sentry:\n    projects: [a]\n    environments: [staging]\n    production_environments: [production]").problems.length, 0, "production names are fine where the owner reads them");
});

const built = async (opts: Parameters<typeof makeRunWithData>[0] = {}) => {
  const fx = makeRunWithData({ configYaml: BOTH, ...opts });
  const b = await cli(fx.home, "report", "build", "--run", fx.runId);
  assert.equal(b.code, 0, JSON.stringify(b.json));
  return fx;
};

test("the plan has one ticket per Critical or Important bug, masked, with the bug's fingerprint on the last line; minor findings get none", async () => {
  const fx = await built({
    findings: [
      finding({ id: "ISSUE-001", severity: "critical", area: "Orders / access", title: "Any company can read another company's order", summary: "Reading order 1050 as pat.quinn@gmail.com works.", evidence: ["evidence/api/e.json"], steps: ["Sign in as company B", "GET /orders/1050"], suspected_cause: "no company check" }),
      finding({ id: "ISSUE-002", severity: "important", area: "Errors", title: "Malformed JSON returns a stack trace" }),
      finding({ id: "ISSUE-003", severity: "minor", area: "Orders / display", title: "Zero discount shown as -$0.00" }),
    ],
  });
  const r = await cli(fx.home, "tracker", "plan", "--run", fx.runId);
  assert.equal(r.code, 0);
  const plan = r.json;
  assert.equal(plan.configured, true);
  assert.equal(plan.team, "ENG");
  assert.deepEqual(plan.tickets.map((t: any) => [t.issue, t.severity, t.priority, t.status]), [["ISSUE-001", "critical", 1, "new"], ["ISSUE-002", "important", 2, "new"]]);
  const t1 = plan.tickets[0];
  assert.match(t1.title, /^\[QAMind\] Any company can read/);
  assert.deepEqual(t1.labels, ["qamind"]);
  assert.doesNotMatch(t1.description, /pat\.quinn@gmail\.com/, "private data is masked before anything is sent");
  assert.ok(plan.masked_values >= 1);
  assert.match(t1.description, /QAMind bug: BUG-001 · fingerprint: [0-9a-f]{12}$/, "the last line is what a later run searches for");
  assert.match(t1.description, /Evidence \(kept with the QA run, not attached here\)/);
  assert.match(plan.ask, /Create or update 2 Linear tickets in team ENG/);
  assert.match(plan.steps.join("\n"), /Ask the person ONCE/);
  assert.match(plan.steps.join("\n"), /Never reopen, close, move, assign or delete/);
  assert.ok(!plan.tickets.some((t: any) => t.issue === "ISSUE-003"));
});

test("a run nobody started by hand gets no ask and no ticket, and a project that sets create to never only links what exists", async () => {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject({ remote: "https://github.com/acme/shop.git", configYaml: LINEAR });
  const started = startRun({ cwd: proj, mode: "full", kind: "qa-only", host: "test", home, env: { QAMIND_TRIGGER: "ci" }, sessionId: "s1", now: NOW });
  assert.equal(started.status, "ready", started.message);
  assert.equal(started.run && fs.existsSync(started.run.dir), true);
  writeFixtureData((started.run as { dir: string }).dir);
  const ci = { home, proj, runId: (started.run as { id: string }).id };
  await cli(ci.home, "report", "build", "--run", ci.runId);
  const plan = (await cli(ci.home, "tracker", "plan", "--run", ci.runId)).json;
  assert.equal(plan.ask, undefined);
  assert.match(plan.steps.join("\n"), /nobody is there to be asked/);
  const denied = decidePreToolUse({ session_id: "s1", cwd: ci.proj, tool_name: "mcp__linear__save_issue", tool_input: { team: "ENG", title: "t", description: "d" } }, ci.home, [], NOW);
  assert.match(denied?.reason ?? "", /only in a run a person started/);

  const never = await built({ configYaml: `${LINEAR.replace("labels: [qamind]", "labels: [qamind]\n    create: never")}` });
  const p2 = (await cli(never.home, "tracker", "plan", "--run", never.runId)).json;
  assert.equal(p2.ask, undefined);
  assert.match(p2.steps.join("\n"), /create` is `never`.*only tickets that already exist/s);
});

test("a recorded ticket links the reports, and the next run's plan knows it (an update, not another ticket)", async () => {
  const fx = await built();
  const rec = await cli(fx.home, "tracker", "record", "--run", fx.runId, "--issue", "ISSUE-001", "--action", "created", "--ticket", "eng-412", "--url", "https://linear.app/acme/issue/ENG-412/any-company", "--state", "Todo");
  assert.equal(rec.code, 0, JSON.stringify(rec.json));
  assert.equal(rec.json.recorded.ticket, "ENG-412");
  assert.equal(rec.json.recorded.bug, "BUG-001");
  assert.equal((await cli(fx.home, "tracker", "record", "--run", fx.runId, "--issue", "ISSUE-002", "--action", "skipped", "--reason", "the person chose not to create tickets")).code, 0);

  // refused: not a ticket id, an address that is not Linear's, a skip with no reason, a finding that is not in the run
  for (const args of [
    ["--issue", "ISSUE-002", "--action", "created", "--ticket", "123"],
    ["--issue", "ISSUE-002", "--action", "created", "--ticket", "ENG-9", "--url", "https://evil.example/x"],
    ["--issue", "ISSUE-002", "--action", "created", "--ticket", "ENG-9", "--url", "http://linear.app/x"],
    ["--issue", "ISSUE-002", "--action", "skipped"],
    ["--issue", "ISSUE-077", "--action", "created", "--ticket", "ENG-9"],
  ]) {
    const bad = await cli(fx.home, "tracker", "record", "--run", fx.runId, ...args);
    assert.notEqual(bad.code, 0, args.join(" "));
  }

  const rep = await cli(fx.home, "report", "build", "--run", fx.runId);
  assert.equal(rep.code, 0);
  const tech = fs.readFileSync(path.join(fx.runDir, "TECHNICAL-REPORT.md"), "utf8");
  assert.match(tech, /## Tickets/);
  assert.match(tech, /\[ENG-412\]\(https:\/\/linear\.app\/acme\/issue\/ENG-412\/any-company\)/);
  assert.match(tech, /no ticket: the person chose not to create tickets/);
  assert.match(tech, /- \*\*Ticket:\*\* \[ENG-412\]/);
  const admin = fs.readFileSync(path.join(fx.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(admin, /\[open the ticket\]\(https:\/\/linear\.app\/acme\/issue\/ENG-412\/any-company\)/);
  assert.match(admin, /## Tickets and error monitoring/);
  assert.match(admin, /1 new ticket was opened for the developers \(ENG-412\)/);
  assert.equal((await cli(fx.home, "report", "lint", "--run", fx.runId)).json.warnings.filter((w: string) => /Linear is configured/.test(w)).length, 0);

  // memory knows the ticket; the next run's plan updates it
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  assert.equal(loadTicketMap(fx.store).tickets[0]?.ticket, "ENG-412");
  const second = startAnotherRun(fx, "2026-10-31T10:00:00Z");
  await cli(fx.home, "report", "build", "--run", second.runId);
  const plan = (await cli(fx.home, "tracker", "plan", "--run", second.runId)).json;
  const known = plan.tickets.find((t: any) => t.issue === "ISSUE-001");
  assert.equal(known.status, "still-open");
  assert.deepEqual(known.known_ticket, { ticket: "ENG-412", url: "https://linear.app/acme/issue/ENG-412/any-company", state: "Todo", last_run: fx.runId });
  assert.match(known.update_comment, /still open in run-/);
  assert.equal(plan.tickets.find((t: any) => t.issue === "ISSUE-002").known_ticket, undefined, "a skipped finding has no ticket to update");
});

test("a finding with a ticket decision missing is a lint warning, and `tracker skip` records why for all of them", async () => {
  const fx = await built();
  const warn = (await cli(fx.home, "report", "lint", "--run", fx.runId)).json.warnings.filter((w: string) => /Linear is configured/.test(w));
  assert.equal(warn.length, 1);
  assert.match(warn[0], /ISSUE-001, ISSUE-002 have no ticket and no reason/);
  assert.notEqual((await cli(fx.home, "tracker", "skip", "--run", fx.runId)).code, 0, "a reason is needed");
  const skipped = await cli(fx.home, "tracker", "skip", "--run", fx.runId, "--reason", "no Linear tool is connected in this session");
  assert.deepEqual(skipped.json.skipped, ["ISSUE-001", "ISSUE-002"]);
  assert.equal((await cli(fx.home, "report", "lint", "--run", fx.runId)).json.warnings.filter((w: string) => /Linear is configured/.test(w)).length, 0);
  assert.deepEqual((await cli(fx.home, "tracker", "status", "--run", fx.runId)).json.waiting, []);
  assert.equal(loadTicketMap(fx.store).tickets.length, 0, "nothing was made, so memory knows no ticket");
});

test("what people decide in Linear becomes feedback with their name: not a bug and won't fix count, Done does not, and nothing is guessed", async () => {
  const fx = await built();
  await cli(fx.home, "tracker", "record", "--run", fx.runId, "--issue", "ISSUE-001", "--action", "created", "--ticket", "ENG-1");
  await cli(fx.home, "tracker", "record", "--run", fx.runId, "--issue", "ISSUE-002", "--action", "created", "--ticket", "ENG-2");
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  const file = path.join(fx.proj, "states.json");
  writeJson(file, [
    { ticket: "ENG-1", state: "Canceled", labels: ["Not a bug"], by: "Pat Quinn", at: "2026-10-31T09:00:00Z", comment: "the old behaviour was intended" },
    { ticket: "ENG-2", state: "Done" },
    { ticket: "ENG-99", state: "Canceled", labels: ["not a bug"] },
  ]);
  const r = await cli(fx.home, "feedback", "from-tracker", "--file", file, "--project", fx.proj, "--by", "Owner");
  assert.equal(r.code, 0, JSON.stringify(r.json));
  const by = (t: string) => r.json.decisions.find((d: any) => d.ticket === t);
  assert.equal(by("ENG-1").result, "recorded");
  assert.equal(by("ENG-1").verdict, "not-a-bug");
  assert.equal(by("ENG-2").result, "noted");
  assert.match(by("ENG-2").why, /not feedback: the next run checks the bug again/);
  assert.equal(by("ENG-99").result, "ignored");
  const fb = loadFeedback(fx.store).records;
  assert.equal(fb.length, 1);
  assert.deepEqual([fb[0]?.bug, fb[0]?.verdict, fb[0]?.by, fb[0]?.via], ["BUG-001", "not-a-bug", "Pat Quinn", "tracker"]);
  assert.match(fb[0]?.note ?? "", /Closed in Linear \(ENG-1\) as "not a bug": the old behaviour was intended/);
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-001")?.status, "not-a-bug");
  assert.equal(loadTicketMap(fx.store).tickets.find((t) => t.ticket === "ENG-2")?.state, "Done", "the state is remembered either way");

  const again = await cli(fx.home, "feedback", "from-tracker", "--file", file, "--project", fx.proj);
  assert.equal(again.json.decisions.find((d: any) => d.ticket === "ENG-1").result, "already-recorded");
  assert.equal(loadFeedback(fx.store).records.length, 1);

  const wf = path.join(fx.proj, "states2.json");
  writeJson(wf, [{ ticket: "ENG-2", state: "Won't fix", by: "Sam Lee" }, { ticket: "ENG-2", state: "Canceled" }]);
  const w = await cli(fx.home, "feedback", "from-tracker", "--file", wf, "--project", fx.proj);
  assert.equal(w.json.decisions[0].verdict, "wont-fix");
  assert.equal(w.json.decisions[1].result, "noted", "a bare Canceled does not say whether it is a bug: nothing is guessed");
  assert.equal(loadBugs(fx.store).bugs.find((b) => b.id === "BUG-002")?.status, "accepted");
});

const WINDOW_FROM = "2026-10-30T09:58:00.000Z";
const sentryFile = (fx: { runDir: string }, errors: unknown[], over: Record<string, unknown> = {}) =>
  writeJson(path.join(fx.runDir, "data", "sentry.json"), { queried: { projects: ["acme-api"], environments: ["staging"], from: "2026-10-30T10:00:00Z", to: "2026-10-30T10:10:00Z", ...over }, errors });

test("the Sentry window is the run's minutes plus the margin, for the test environments only", async () => {
  const fx = await built();
  const w = (await cli(fx.home, "sentry", "window", "--run", fx.runId)).json;
  assert.equal(w.from, WINDOW_FROM);
  assert.deepEqual([w.projects, w.environments, w.organization, w.margin_minutes], [["acme-api"], ["staging"], "acme", 2]);
  assert.match(w.read, /Read only: change nothing in Sentry/);
});

test("server errors are checked: production, other environments, other times and unknown findings are refused; what is kept is masked and tied to findings", async () => {
  const fx = await built();
  const run = (...a: string[]) => cli(fx.home, "sentry", ...a, "--run", fx.runId);
  const good = { id: "ACME-API-3F", title: "TypeError: cannot read tax of undefined for pat.quinn@gmail.com", culprit: "POST /orders", level: "error", events: 3, users: 1, last_seen: "2026-10-30T10:05:00Z", url: "https://acme.sentry.io/issues/123/?query=x", relates_to: "ISSUE-002", why: "raised by the broken JSON the run sent at 10:05" };

  assert.equal((await run("check")).code, 1, "no file yet");
  sentryFile(fx, [good], { environments: ["production"] });
  assert.match((await run("check")).json.errors.join("\n"), /looks like production/);
  sentryFile(fx, [good], { environments: ["qa"] });
  assert.match((await run("check")).json.errors.join("\n"), /not one of integrations\.sentry\.environments/);
  sentryFile(fx, [good], { from: "2026-10-29T00:00:00Z" });
  assert.match((await run("check")).json.errors.join("\n"), /wider than the run's/);
  sentryFile(fx, [{ ...good, last_seen: "2026-10-28T10:05:00Z" }]);
  assert.match((await run("check")).json.errors.join("\n"), /outside the run's window/);
  sentryFile(fx, [{ ...good, relates_to: "ISSUE-099" }]);
  assert.match((await run("check")).json.errors.join("\n"), /"relates_to" must be the id of a finding/);
  sentryFile(fx, [{ ...good, why: "" }, { ...good, events: 0 }]);
  const bad = (await run("check")).json.errors.join("\n");
  assert.match(bad, /needs "why"/);
  assert.match(bad, /needs "events"/);

  sentryFile(fx, [good, { id: "ACME-API-40", title: "ValueError in order search on the orders page", culprit: "GET /orders", events: 12, last_seen: "2026-10-30T10:06:00Z", relates_to: "none", why: "not yet looked at" }]);
  const ok = await run("check");
  assert.equal(ok.code, 0, JSON.stringify(ok.json));
  assert.equal(ok.json.errors_kept, 2);
  const kept = JSON.parse(fs.readFileSync(path.join(fx.runDir, "data", "sentry.json"), "utf8"));
  assert.doesNotMatch(JSON.stringify(kept), /pat\.quinn@gmail\.com/, "private data in an error's title is masked");
  assert.equal(kept.errors[0].url, "https://acme.sentry.io/issues/123", "the query is dropped from the link");

  await cli(fx.home, "report", "build", "--run", fx.runId);
  const tech = fs.readFileSync(path.join(fx.runDir, "TECHNICAL-REPORT.md"), "utf8");
  assert.match(tech, /## Server errors during the run \(Sentry\)/);
  assert.match(tech, /\| \[ISSUE-002\]\(#ISSUE-002\) \| \[ACME-API-3F\]\(https:\/\/acme\.sentry\.io\/issues\/123\)/);
  assert.match(tech, /1 error is not explained by any finding/);
  assert.match(tech, /- Server error: \[ACME-API-3F\]\(https:\/\/acme\.sentry\.io\/issues\/123\) .*\(3 events in the run\)/);
  const admin = fs.readFileSync(path.join(fx.runDir, "ADMIN-REPORT.md"), "utf8");
  assert.match(admin, /The error monitor recorded matching server errors for 1 of the serious problem above/);
  assert.match(admin, /1 other server error was recorded while we tested/);
  assert.equal((await cli(fx.home, "report", "lint", "--run", fx.runId)).json.errors.filter((e: string) => /sentry/i.test(e)).length, 0);
});

test("an unexplained server error that shares words with a finding is suggested, a run without the record is warned, and `sentry skip` says why", async () => {
  const fx = await built();
  assert.match((await cli(fx.home, "report", "lint", "--run", fx.runId)).json.warnings.join("\n"), /Sentry is configured but this run has no server-error record/);
  sentryFile(fx, [{ id: "ACME-API-9", title: "Malformed JSON stack trace in parser", culprit: "POST /orders", events: 2, last_seen: "2026-10-30T10:06:00Z", relates_to: "none", why: "not yet looked at" }]);
  const r = await cli(fx.home, "sentry", "check", "--run", fx.runId);
  assert.deepEqual(r.json.maybe_these_explain_a_finding, [{ error: "ACME-API-9", maybe_finding: "ISSUE-002", because: "shares malformed, json, stack, trace" }]);
  assert.notEqual((await cli(fx.home, "sentry", "skip", "--run", fx.runId)).code, 0);
  const s = await cli(fx.home, "sentry", "skip", "--run", fx.runId, "--reason", "no Sentry tool is connected in this session");
  assert.equal(s.code, 0);
  await cli(fx.home, "report", "build", "--run", fx.runId);
  assert.match(fs.readFileSync(path.join(fx.runDir, "TECHNICAL-REPORT.md"), "utf8"), /_Not read: no Sentry tool is connected in this session_/);
  assert.equal((await cli(fx.home, "report", "lint", "--run", fx.runId)).json.warnings.filter((w: string) => /Sentry is configured/.test(w)).length, 0);
});

const hook = (fx: { home: string; proj: string }, tool: string, input: Record<string, unknown>) => decidePreToolUse({ session_id: "s1", cwd: fx.proj, tool_name: tool, tool_input: input }, fx.home, [], NOW)?.reason;

test("the safety hook: Sentry is read only and test-only; Linear gets a ticket in the configured team or a comment on a ticket, from the plan's fields, with nothing private", async () => {
  const fx = makeRunWithData({ configYaml: BOTH });
  // Sentry
  assert.equal(hook(fx, "mcp__sentry__search_issues", { query: "is:unresolved", environment: "staging" }), undefined);
  assert.match(hook(fx, "mcp__sentry__update_issue", { issueId: "X", status: "resolved" }) ?? "", /could change something in Sentry/);
  assert.match(hook(fx, "mcp__sentry__create_alert_rule", {}) ?? "", /could change something in Sentry/);
  assert.match(hook(fx, "mcp__sentry__search_events", { environment: "production" }) ?? "", /test system only/);
  assert.match(hook(fx, "mcp__sentry__search_issues", { query: "environment:production is:unresolved" }) ?? "", /test system only/);
  // Linear reads are always fine (ticket mode reads the ticket)
  assert.equal(hook(fx, "mcp__linear__get_issue", { id: "ENG-1" }), undefined);
  assert.equal(hook(fx, "mcp__linear__list_issues", { query: "fingerprint: abc" }), undefined);
  // creating
  const create = { team: "ENG", title: "[QAMind] Any company can read another company's order", description: "A problem.", priority: 1, labels: ["qamind"] };
  assert.equal(hook(fx, "mcp__linear__save_issue", create), undefined);
  assert.match(hook(fx, "mcp__linear__save_issue", { ...create, team: "OPS" }) ?? "", /configured team \(ENG\)/);
  assert.match(hook(fx, "mcp__linear__save_issue", { ...create, id: "ENG-5" }) ?? "", /does not edit one that exists/);
  assert.match(hook(fx, "mcp__linear__save_issue", { ...create, assignee: "me", state: "Done" }) ?? "", /plan's fields only.*not assignee, state/);
  assert.match(hook(fx, "mcp__linear__save_issue", { ...create, description: "reported by pat.quinn@gmail.com" }) ?? "", /email address/);
  assert.match(hook(fx, "mcp__linear__save_issue", { ...create, description: "header Bearer abcdefghijklmnopqrstuvwxyz0123" }) ?? "", /secret|token|Authorization/i);
  // commenting
  assert.equal(hook(fx, "mcp__linear__save_comment", { issueId: "ENG-5", body: "QAMind found this still open." }), undefined);
  assert.match(hook(fx, "mcp__linear__save_comment", { projectId: "P", body: "x" }) ?? "", /comments on a ticket \(issueId\) only/);
  assert.match(hook(fx, "mcp__linear__save_comment", { id: "c1", issueId: "ENG-5", body: "x" }) ?? "", /new comment/);
  // nothing else
  for (const t of ["delete_comment", "save_project", "merge_diff", "create_issue_label", "save_customer"]) assert.match(hook(fx, `mcp__linear__${t}`, {}) ?? "", /not something a QA run does in Linear/, t);
  // not set up: nothing is written, and Sentry is not read
  const bare = makeRunWithData();
  assert.match(hook(bare, "mcp__linear__save_issue", create) ?? "", /Linear is not set up/);
  assert.match(hook(bare, "mcp__sentry__search_issues", {}) ?? "", /Sentry is not set up/);
  assert.equal(hook(bare, "mcp__linear__get_issue", { id: "X-1" }), undefined);
  // the owner's side stays the owner's
  for (const c of ["qamind feedback from-tracker --file x.json", "qamind escaped import --file x.json", "node qamind.mjs escaped add --area A --title Tttttttt"]) assert.match(hook(fx, "Bash", { command: c }) ?? "", /user's decisions/, c);
  assert.equal(hook(fx, "Bash", { command: "qamind tracker plan --run r" }), undefined);
  assert.equal(hook(fx, "Bash", { command: "qamind escaped areas" }), undefined);
});

test("escaped bugs from Sentry and tickets: the areas to name them with, then a batch that records each once and refuses the one with private data", async () => {
  const fx = makeRunWithData({ configYaml: BOTH, findings: [finding({ id: "ISSUE-001", severity: "minor", area: "Admin / footer", title: "A footer link points nowhere" })], coverage: [{ surface: "api", area: "Orders list: search and pagination", status: "tested" }, { surface: "api", area: "Billing", status: "not-tested", note: "later" }] });
  await cli(fx.home, "report", "build", "--run", fx.runId);
  await cli(fx.home, "run", "finish", "--run", fx.runId);
  const areas = (await cli(fx.home, "escaped", "areas", "--project", fx.proj)).json;
  assert.deepEqual(areas.areas.map((a: any) => [a.area, a.status]).sort(), [["Billing", "not-tested"], ["Orders list: search and pagination", "tested"]]);
  assert.deepEqual(areas.production, { sentry_environments: [], sentry_projects: ["acme-api"], ticket_label: "escaped", linear_team: "ENG" });

  const file = path.join(fx.proj, "escaped.json");
  writeJson(file, [
    { area: "Orders list search", title: "TypeError in order search for 1,240 users a day", severity: "important", source: "sentry", ref: "ACME-API-3F" },
    { area: "Billing", title: "Invoices total is wrong, labelled escaped in Linear", source: "ticket", ref: "ENG-77" },
    { area: "Billing", title: "Customer pat.quinn@gmail.com saw another company's invoice", source: "sentry", ref: "ACME-API-5" },
  ]);
  const r = await cli(fx.home, "escaped", "import", "--file", file, "--project", fx.proj, "--by", "Owner");
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.deepEqual(r.json.results.map((x: any) => x.result), ["recorded", "recorded", "refused"]);
  assert.equal(r.json.results[0].verdict, "missed", "the area was tested and the run had reported nothing like it");
  assert.equal(r.json.results[1].verdict, "not-checked");
  assert.match(r.json.results[2].problem, /email address/);
  const again = await cli(fx.home, "escaped", "import", "--file", file, "--project", fx.proj);
  assert.deepEqual(again.json.results.map((x: any) => x.result), ["already-recorded", "already-recorded", "refused"]);
  const escaped = loadMetrics(fx.store).escaped;
  assert.deepEqual(escaped.map((e) => [e.source, e.ref]), [["sentry", "ACME-API-3F"], ["ticket", "ENG-77"]]);
});
