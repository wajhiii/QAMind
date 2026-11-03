import os from "node:os";
import { BROWSER_ENGINES, checkConfigFile } from "../../core/lib/config.ts";
import type { BrowserEngine } from "../../core/lib/config.ts";
import { engineStatus, findPlaywright, installEngine } from "../../core/lib/browsers.ts";
import { readJson } from "../../core/lib/fsutil.ts";
import { MESSAGE_KINDS, mailContextForRun, mailStatus, waitAndCheck } from "../../core/lib/mail/service.ts";
import type { MessageKind } from "../../core/lib/mail/check.ts";
import { defaultProjectDir, projectScope, runScope } from "../../core/lib/memory/service.ts";
import { perfEndpointsFile, validatePerfEndpoints } from "../../core/lib/perf/api.ts";
import { runApiPerfForRun } from "../../core/lib/perf/service.ts";
import { groupPerf } from "../../core/lib/sweep/results.ts";
import { loadSweepPages, matrixFor } from "../../core/lib/sweep/pages.ts";
import { acceptBaselines, baselineStatus, runSweepForRun } from "../../core/lib/sweep/service.ts";
import { contextFrom } from "../../core/lib/privacy.ts";
import { checkTicket, checklistMark, checklistRows, lintTicketResults, readTicketData, ticketCounts, ticketFilePath } from "../../core/lib/ticket.ts";
import { loadBank } from "../../core/lib/bank/bank.ts";
import { readRunData } from "../../core/lib/report.ts";
import { emit, opts, UsageError } from "./util.ts";

/** The commands of the coverage features (spec 13.4, 13.7, 13.9 to 13.11): the page sweep, baselines, browsers, API timing, email and SMS. */

const list = (v: unknown): string[] | undefined => (typeof v === "string" && v.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function cmdSweep(sub: string | undefined, rest: string[], home: string): Promise<number> {
  const { values } = opts(rest, { run: { type: "string" }, browsers: { type: "string" }, viewports: { type: "string" }, pages: { type: "string" } });
  if (sub !== "run" && sub !== "check") throw new UsageError("sweep needs a subcommand: run | check (both with --run ID)");
  const scope = runScope(home, values.run as string | undefined);
  const config = scope.ctx.config;
  const checked = loadSweepPages(scope.runDir, config);
  const pick = { ...(list(values.browsers) ? { browsers: list(values.browsers) as string[] } : {}), ...(list(values.viewports) ? { viewports: list(values.viewports) as string[] } : {}) };
  const matrix = matrixFor(scope.mode, config, pick);
  if (sub === "check") {
    emit({ ok: checked.ok, errors: checked.errors, pages: checked.file?.pages.length ?? 0, logins: Object.keys(checked.file?.logins ?? {}), matrix: { browsers: matrix.browsers, viewports: matrix.viewports.map((v) => `${v.name} ${v.width}x${v.height}`), why: matrix.why } });
    return checked.ok ? 0 : 1;
  }
  if (!checked.ok) {
    emit({ ok: false, errors: checked.errors, note: "Fix data/sweep-pages.json and run again. Nothing was visited." });
    return 1;
  }
  const results = await runSweepForRun(scope, { ...pick, ...(list(values.pages) ? { pages: list(values.pages) as string[] } : {}) });
  const firstShot = (page: string, seen: Array<{ browser: string; viewport: string }>): string | undefined => results.visits.find((v) => v.page === page && v.screenshot && seen.some((s) => s.browser === v.browser && s.viewport === v.viewport))?.screenshot;
  emit({
    matrix: { browsers: results.matrix.browsers, viewports: results.matrix.viewports.map((v) => `${v.name} ${v.width}x${v.height}`), why: results.matrix.why },
    visited: results.visits.filter((v) => !v.error).length,
    could_not_visit: results.visits.filter((v) => v.error).map((v) => ({ page: v.page, browser: v.browser, viewport: v.viewport, why: v.error })),
    unavailable_browsers: results.unavailable,
    skipped: results.skipped.slice(0, 30),
    ...(results.budget_reached ? { budget_reached: true } : {}),
    leads: results.groups.slice(0, 60).map((g) => ({ page: g.page, title: g.title, kind: g.kind, where: g.scope, detail: clip(g.detail, 240), seen_on: g.seen_on.map((s) => `${s.browser} ${s.viewport}`), evidence: firstShot(g.page, g.seen_on) })),
    slow_or_slower: groupPerf(results.perf).map((p) => ({ page: p.page, kind: p.kind, slowest_ms: p.ms, budget_ms: p.budget_ms, ...(p.previous_ms !== undefined ? { previous_ms: p.previous_ms } : {}), seen_on: p.seen_on, message: p.message })),
    visual: { ...results.visual_summary, differences: results.visits.filter((v) => v.visual?.state === "different").map((v) => ({ page: v.page, role: v.role, browser: v.browser, viewport: v.viewport, percent: v.visual?.percent, impact: v.visual?.impact, before: v.visual?.before, after: v.visual?.after, diff: v.visual?.diff })) },
    notes: results.notes,
    saved_to: "data/sweep.json in the run folder",
    next: "Every lead is something to verify, not a verdict: open the page, repeat it twice, then write the finding with the browser and screen size from `where`/`seen_on`. A browser that was unavailable goes under Not tested with that reason.",
  });
  return 0;
}

export function cmdBaseline(sub: string | undefined, rest: string[], home: string): number {
  const { values } = opts(rest, { run: { type: "string" }, pages: { type: "string" }, project: { type: "string" }, by: { type: "string" } });
  const scope = projectScope(home, { ...(values.project ? { project: values.project as string } : {}) });
  if (sub === "status") {
    emit(baselineStatus(scope));
    return 0;
  }
  if (sub === "accept") {
    if (!values.run) throw new UsageError("baseline accept needs --run ID: the run whose pictures you judged good");
    const r = acceptBaselines(scope, values.run as string, { ...(list(values.pages) ? { pages: list(values.pages) as string[] } : {}), by: (values.by as string | undefined) ?? os.userInfo().username });
    emit({
      accepted: r.accepted.length,
      pictures: r.accepted,
      skipped: r.skipped,
      ...(r.with_problems.length ? { warning: `These pages had problems when they were photographed (${r.with_problems.join(", ")}). Their pictures are now the baseline too, broken look included: fix the problem, run again and accept again.` } : {}),
      note: "Later runs compare their pictures with these, per page, role, browser and screen size.",
    });
    return 0;
  }
  throw new UsageError("baseline needs a subcommand: status | accept --run ID [--pages a,b]");
}

export function cmdBrowsers(sub: string | undefined, rest: string[]): number {
  const { values, positionals } = opts(rest, { project: { type: "string" } });
  if (sub === "status") {
    const root = (values.project as string | undefined) ?? defaultProjectDir();
    let configured: string[] | undefined;
    try {
      configured = checkConfigFile(root, process.env).config?.browsers;
    } catch {
      /* no config yet: show all three */
    }
    emit({ configured: configured ?? "no config here (the default is chromium)", engines: engineStatus(findPlaywright(), BROWSER_ENGINES) });
    return 0;
  }
  if (sub === "install") {
    const engine = positionals[0] as BrowserEngine | undefined;
    if (!engine || !(BROWSER_ENGINES as readonly string[]).includes(engine)) throw new UsageError(`browsers install needs one of: ${BROWSER_ENGINES.join(", ")}`);
    const r = installEngine(engine);
    emit({ engine, ok: r.ok, output: r.output });
    return r.ok ? 0 : 1;
  }
  throw new UsageError("browsers needs a subcommand: status | install chromium|firefox|webkit");
}

export async function cmdPerf(sub: string | undefined, rest: string[], home: string): Promise<number> {
  const { values } = opts(rest, { run: { type: "string" } });
  if (sub !== "api" && sub !== "check") throw new UsageError("perf needs a subcommand: api | check (both with --run ID)");
  const scope = runScope(home, values.run as string | undefined);
  const checked = validatePerfEndpoints(readJson<unknown>(perfEndpointsFile(scope.runDir)), scope.ctx.config);
  if (sub === "check" || !checked.ok) {
    emit({ ok: checked.ok, errors: checked.errors, endpoints: checked.file?.endpoints.length ?? 0, ...(checked.ok ? {} : { note: "Fix data/perf-endpoints.json and run again. Nothing was called." }) });
    return checked.ok ? 0 : 1;
  }
  const r = await runApiPerfForRun(scope);
  emit({
    timed: r.timings.length,
    slow: r.timings.filter((t) => t.over_budget).map((t) => ({ endpoint: `${t.method} ${t.path}`, role: t.role, p95_ms: t.p95_ms, median_ms: t.median_ms, budget_ms: t.budget_ms, message: t.message })),
    slower_than_before: r.timings.filter((t) => !t.over_budget && t.regressed).map((t) => ({ endpoint: `${t.method} ${t.path}`, role: t.role, p95_ms: t.p95_ms, previous_ms: t.previous_ms, slower_pct: t.slower_pct, message: t.message })),
    fine: r.timings.filter((t) => !t.over_budget && !t.regressed).map((t) => ({ endpoint: `${t.method} ${t.path}`, role: t.role, median_ms: t.median_ms, p95_ms: t.p95_ms })),
    skipped: r.skipped,
    ...(r.budget_reached ? { budget_reached: true } : {}),
    saved_to: "data/perf-api.json in the run folder",
    next: "A slow endpoint is a finding (surface api, type performance) with the timing as evidence: repeat the timing, then report it in plain wording. It is not a load test: do not claim anything about traffic.",
  });
  return 0;
}

/** `mail status|wait` and `sms wait`: read what the product sent, from the sandbox that caught it, and check it (spec 13.7). */
export async function cmdMail(channel: "email" | "sms", sub: string | undefined, rest: string[], home: string): Promise<number> {
  const { values } = opts(rest, { run: { type: "string" }, to: { type: "string" }, flow: { type: "string" }, kind: { type: "string" }, language: { type: "string" }, "subject-contains": { type: "string" }, "timeout-s": { type: "string" }, since: { type: "string" } });
  const scope = runScope(home, values.run as string | undefined);
  const ctx = mailContextForRun(scope);
  if (sub === "status") {
    emit(channel === "email" ? mailStatus(ctx) : { configured: !!ctx.config.sms, channel: "sms", note: ctx.config.sms ? `SMS messages are read from ${ctx.config.sms.url}; nothing is sent.` : "No SMS sandbox is configured (sms.catcher in the config): every flow that sends an SMS is Not tested, \"no SMS sandbox configured\"." });
    return 0;
  }
  if (sub !== "wait") throw new UsageError(`${channel === "email" ? "mail" : "sms"} needs a subcommand: status | wait --run ID --to ADDRESS [--flow "password reset"] [--kind transactional|notification|marketing|invitation] [--language ur] [--subject-contains TEXT] [--timeout-s N]`);
  if (!values.to) throw new UsageError("wait needs --to: the address (or number) the flow was started for");
  if (values.kind && !MESSAGE_KINDS.includes(values.kind as MessageKind)) throw new UsageError(`--kind must be one of ${MESSAGE_KINDS.join(", ")}`);
  const since = values.since ? new Date(values.since as string) : undefined;
  if (since && Number.isNaN(since.getTime())) throw new UsageError("--since must be a time such as 2026-11-03T10:00:00Z");
  const rec = await waitAndCheck(ctx, {
    channel,
    to: values.to as string,
    ...(values.flow ? { flow: values.flow as string } : {}),
    ...(values.kind ? { kind: values.kind as MessageKind } : {}),
    ...(values.language ? { language: values.language as string } : {}),
    ...(values["subject-contains"] ? { subjectContains: values["subject-contains"] as string } : {}),
    ...(values["timeout-s"] ? { timeoutS: Number(values["timeout-s"]) } : {}),
    ...(since ? { since } : {}),
  });
  const failed = rec.checks.filter((c) => !c.ok);
  emit({
    arrived: rec.arrived,
    waited_s: rec.waited_s,
    ...(rec.note ? { note: rec.note } : {}),
    ...(rec.message ? { message: rec.message } : {}),
    failed_checks: failed,
    passed_checks: rec.checks.filter((c) => c.ok).map((c) => `${c.name}: ${c.detail}`),
    links: rec.links,
    ...(rec.evidence ? { evidence: rec.evidence } : {}),
    next: rec.arrived ? "Read the excerpt yourself: the checks cannot tell whether the wording makes sense for the flow. A failed check is a lead: repeat the flow once more, then report it with the evidence file." : rec.note?.startsWith("No ") && !rec.note.includes("sandbox is configured") ? "Nothing arrived. Check once that the sandbox is working (a flow that surely sends something) before reporting a missing message; then report it, or list it as unconfirmed." : "Nothing was checked.",
  });
  return rec.arrived && failed.length === 0 ? 0 : 1;
}

/** `ticket check|status`: the criteria the agent wrote down for "test this ticket" mode, and the answer to each (spec 13.4). */
export function cmdTicket(sub: string | undefined, rest: string[], home: string): number {
  const { values } = opts(rest, { run: { type: "string" } });
  if (sub !== "check" && sub !== "status") throw new UsageError("ticket needs a subcommand: check | status (both with --run ID)");
  const scope = runScope(home, values.run as string | undefined);
  const marker = scope.ctx.marker;
  if (!marker.ticket) throw new UsageError("This run was not started for a ticket (run_start with mode ticket and a ticket).");
  if (sub === "check") {
    const r = checkTicket(readJson<unknown>(ticketFilePath(scope.runDir)), { trigger: marker.trigger, privacy: contextFrom(scope.ctx.config, scope.ctx.roles.map((x) => x.username)), expectedRef: marker.ticket });
    emit({
      ok: r.ok,
      errors: r.errors,
      warnings: r.warnings,
      ...(r.ticket ? { ticket: r.ticket.ref, criteria: r.ticket.criteria.length, stated: r.ticket.criteria.filter((c) => c.origin === "stated").length, derived: r.ticket.criteria.filter((c) => c.origin === "derived").length, assumed: r.assumed } : {}),
      next: r.ok ? "Test each criterion (happy path, a negative case, an edge, the permissions), then write data/ticket-results.json: one entry per criterion with status met, not-met or not-testable and why. A criterion that is not met is a finding." : "Fix data/ticket.json and check again. Nothing may be tested before the criteria are right (and, with a person, confirmed).",
    });
    return r.ok ? 0 : 1;
  }
  const data = readTicketData(scope.runDir, marker.trigger);
  if (!data?.ticket) {
    emit({ ok: false, error: "data/ticket.json is missing or unreadable. Write the criteria and run `ticket check`." });
    return 1;
  }
  const run = readRunData(scope.runDir);
  const lint = lintTicketResults(scope.runDir, data, { findings: run.findings.map((f) => f.id ?? "").filter(Boolean), unconfirmed: run.unconfirmed.map((u) => u.id ?? "").filter(Boolean), tests: loadBank(scope.store).tests.map((t) => t.id) }, { ticket_ref: marker.ticket });
  emit({ ticket: data.ticket.ref, counts: ticketCounts(data), checklist: checklistRows(data, false).map((r) => ({ criterion: r.id, text: r.text, result: checklistMark(r.status), assumed: r.assumed, why: r.why })), problems: lint.errors, warnings: lint.warnings });
  return lint.errors.length ? 1 : 0;
}
