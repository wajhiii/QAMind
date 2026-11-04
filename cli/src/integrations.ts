import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkConfigFile } from "../../core/lib/config.ts";
import type { QamindConfig } from "../../core/lib/config.ts";
import { readJson } from "../../core/lib/fsutil.ts";
import { ESCAPED_SOURCES, importEscaped, knownAreas } from "../../core/lib/metrics.ts";
import type { EscapedInput, EscapedSource } from "../../core/lib/metrics.ts";
import { withStoreLock } from "../../core/lib/memory/lock.ts";
import { projectScope, runScope } from "../../core/lib/memory/service.ts";
import { contextForRun } from "../../core/lib/privacy.ts";
import { readRunData } from "../../core/lib/report.ts";
import { checkSentry, saveSentry, sentryFilePath, sentryWindow } from "../../core/lib/sentry.ts";
import { TICKET_ACTIONS, eligibleFindings, loadTicketMap, readTicketsFile, recordTicket } from "../../core/lib/tracker.ts";
import type { LifeLike, TicketAction } from "../../core/lib/tracker.ts";
import { applyTrackerStates, buildPlan, readTrackerStatesFile, trackerStatus } from "../../core/lib/tracker-plan.ts";
import { emit, opts, UsageError } from "./util.ts";

/** The optional integrations (spec 11.4, 13.5, 13.16): Linear tickets, Sentry's errors during a run, and what each tells memory. QAMind holds no token for either. */

/** Signs that the product already reports to Sentry, found in its own files: a hint, never a setting. */
function sentryHints(root: string): string[] {
  const hints: string[] = [];
  const pkg = readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(path.join(root, "package.json"));
  const dep = Object.keys({ ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }).find((d) => d.startsWith("@sentry/"));
  if (dep) hints.push(`package.json depends on ${dep}`);
  for (const f of ["requirements.txt", "composer.json", "Gemfile", "go.mod", "pyproject.toml"]) {
    try {
      if (/sentry/i.test(fs.readFileSync(path.join(root, f), "utf8"))) hints.push(`${f} mentions Sentry`);
    } catch {
      /* not there */
    }
  }
  for (const f of [".env.example", ".env.sample", ".env.template"]) {
    try {
      if (/^\s*SENTRY_DSN\s*=/m.test(fs.readFileSync(path.join(root, f), "utf8"))) hints.push(`${f} has SENTRY_DSN`);
    } catch {
      /* not there */
    }
  }
  return hints;
}

const configOf = (root: string): QamindConfig | undefined => {
  try {
    return checkConfigFile(root).config;
  } catch {
    return undefined;
  }
};

export function cmdIntegrations(sub: string | undefined, rest: string[], home: string): number {
  if (sub !== "status") throw new UsageError("integrations needs a subcommand: status [--project DIR]");
  const { values } = opts(rest, { project: { type: "string" } });
  const scope = projectScope(home, { ...(values.project ? { project: values.project as string } : {}) });
  const config = configOf(scope.project.root);
  const linear = config?.integrations.linear;
  const sentry = config?.integrations.sentry;
  const map = loadTicketMap(scope.store);
  const hints = sentryHints(scope.project.root);
  emit({
    linear: linear
      ? { configured: true, team: linear.team, ...(linear.project ? { project: linear.project } : {}), labels: linear.labels, create: linear.create, tickets_known: map.tickets.length, needs: "a Linear tool connected in this session (one that can search issues and create or comment on them)" }
      : { configured: false, how: "add `integrations: { linear: { team: <team key> } }` to .qa/config.md" },
    sentry: sentry
      ? { configured: true, ...(sentry.organization ? { organization: sentry.organization } : {}), projects: sentry.projects, test_environments: sentry.environments, production_environments: sentry.production_environments, needs: "a Sentry tool connected in this session (read only)" }
      : { configured: false, ...(hints.length ? { looks_like_the_product_uses_sentry: hints, how: "add `integrations: { sentry: { projects: [...], environments: [staging] } }` to .qa/config.md" } : { how: "add `integrations: { sentry: { projects: [...], environments: [staging] } }` to .qa/config.md if the product reports to Sentry" }) },
    note: "QAMind stores no token for either service. It uses the tool your host has connected; with none connected, the run says so under Not tested and carries on.",
  });
  return 0;
}

// ---------------------------------------------------------------------------------------------- Linear

export function cmdTracker(sub: string | undefined, rest: string[], home: string): number {
  if (sub === "tickets") {
    const { values: v } = opts(rest, { project: { type: "string" } });
    const sc = projectScope(home, { ...(v.project ? { project: v.project as string } : {}) });
    emit({ tickets: loadTicketMap(sc.store).tickets.map((t) => ({ ticket: t.ticket, bug: t.bug, ...(t.url ? { url: t.url } : {}), ...(t.state ? { state: t.state } : {}), last_run: t.last_run })) });
    return 0;
  }
  const { values } = opts(rest, { run: { type: "string" }, issue: { type: "string" }, action: { type: "string" }, ticket: { type: "string" }, url: { type: "string" }, state: { type: "string" }, reason: { type: "string" } });
  if (sub !== "plan" && sub !== "record" && sub !== "skip" && sub !== "status") throw new UsageError("tracker needs a subcommand: plan | record | skip | status (all with --run ID) | tickets [--project DIR]");
  const scope = runScope(home, values.run as string | undefined);
  const linear = scope.ctx.config.integrations.linear;
  if (!linear) {
    emit({ configured: false, message: "Linear is not configured: there is no integrations.linear in .qa/config.md. Nothing to do." });
    return sub === "plan" || sub === "status" ? 0 : 1;
  }
  if (sub === "plan") {
    emit(buildPlan(scope));
    return 0;
  }
  if (sub === "status") {
    emit(trackerStatus(scope));
    return 0;
  }
  const life = readRunData(scope.runDir).lifecycle as LifeLike | undefined;
  if (sub === "skip") {
    if (!values.reason) throw new UsageError("tracker skip needs --reason: the person said no, nobody was there to ask (a CI or automatic run), no Linear tool was connected, ...");
    const data = readRunData(scope.runDir);
    const { eligible } = eligibleFindings(data.findings, life);
    const already = readTicketsFile(scope.runDir)?.links.map((l) => l.issue) ?? [];
    const todo = eligible.filter((e) => !already.includes(e.finding.id as string));
    const done = withStoreLock(scope.store, () => todo.map((e) => recordTicket(scope.runDir, scope.store, scope.runId, linear.team, life, { issue: e.finding.id as string, action: "skipped", reason: values.reason as string })));
    emit({ skipped: done.map((d) => d.issue), reason: done[0]?.reason ?? values.reason, note: done.length ? "The reports say no ticket was made for these, and why." : "Nothing was waiting for a ticket." });
    return 0;
  }
  if (!values.issue || !values.action) throw new UsageError("tracker record needs --issue ISSUE-001 and --action created|updated|existing|skipped (and --ticket ENG-123 --url <address> --state <state>, or --reason for skipped)");
  if (!(TICKET_ACTIONS as readonly string[]).includes(values.action as string)) throw new UsageError(`--action must be one of ${TICKET_ACTIONS.join(", ")}`);
  const link = withStoreLock(scope.store, () => recordTicket(scope.runDir, scope.store, scope.runId, linear.team, life, { issue: values.issue as string, action: values.action as TicketAction, ...(values.ticket ? { ticket: values.ticket as string } : {}), ...(values.url ? { url: values.url as string } : {}), ...(values.state ? { state: values.state as string } : {}), ...(values.reason ? { reason: values.reason as string } : {}) }));
  emit({ recorded: link, note: "The reports link to it. The next run updates this bug's ticket instead of opening another." });
  return 0;
}

/** `feedback from-tracker`: what people decided in Linear, as feedback (the owner's, outside a run). Called from cmdFeedback. */
export function cmdFeedbackFromTracker(rest: string[], home: string, who: (flag: string | undefined, root: string) => string): number {
  const { values } = opts(rest, { project: { type: "string" }, file: { type: "string" }, by: { type: "string" } });
  if (!values.file) throw new UsageError('feedback from-tracker needs --file F: a JSON list of what you read in Linear, [{ "ticket": "ENG-12", "state": "Canceled", "labels": ["Not a bug"], "by": "Pat Quinn", "at": "2026-11-03T10:00:00Z", "comment": "works as designed" }]');
  const scope = projectScope(home, { ...(values.project ? { project: values.project as string } : {}) });
  const linear = configOf(scope.project.root)?.integrations.linear;
  if (!linear) throw new UsageError("Linear is not configured (integrations.linear in .qa/config.md), so there are no tickets to read decisions from.");
  const outcomes = withStoreLock(scope.store, () => applyTrackerStates(scope.store, linear, readTrackerStatesFile(values.file as string), who(values.by as string | undefined, scope.project.root)));
  emit({
    decisions: outcomes.map((o) => ({ ticket: o.ticket, ...(o.bug ? { bug: o.bug } : {}), result: o.result, ...(o.verdict ? { verdict: o.verdict } : {}), why: o.why, ...(o.effects ? { effects: o.effects } : {}) })),
    recorded: outcomes.filter((o) => o.result === "recorded").length,
  });
  return 0;
}

// ---------------------------------------------------------------------------------------------- Sentry

export function cmdSentry(sub: string | undefined, rest: string[], home: string): number {
  const { values } = opts(rest, { run: { type: "string" }, reason: { type: "string" } });
  if (sub !== "window" && sub !== "check" && sub !== "skip") throw new UsageError("sentry needs a subcommand: window | check | skip (all with --run ID)");
  const scope = runScope(home, values.run as string | undefined);
  const settings = scope.ctx.config.integrations.sentry;
  if (!settings) {
    emit({ configured: false, message: "Sentry is not configured: there is no integrations.sentry in .qa/config.md. Nothing to do." });
    return sub === "skip" || sub === "check" ? 1 : 0;
  }
  const window = sentryWindow(settings, scope.ctx.marker.started);
  if (sub === "window") {
    emit({
      ...window,
      read: "Read the errors (issues with their event counts) Sentry recorded in this window, for these projects and environments only. Read only: change nothing in Sentry.",
      then: `Write ${path.relative(scope.runDir, sentryFilePath(scope.runDir))} in the run folder and run \`sentry check\`.`,
      shape: { queried: { projects: settings.projects, environments: settings.environments, from: window.from, to: window.to }, errors: [{ id: "ACME-API-3F", title: "the error's title", culprit: "POST /orders", level: "error", events: 3, users: 1, first_seen: window.from, last_seen: window.to, url: "https://…sentry.io/issues/…/", relates_to: "ISSUE-004 or none", why: "what shows the link, or why no finding explains it" }] },
    });
    return 0;
  }
  if (sub === "skip") {
    if (!values.reason) throw new UsageError("sentry skip needs --reason: no Sentry tool is connected in this session, the tool returned an error, ...");
    const check = checkSentry({ skipped: values.reason }, settings, window, { findings: [], unconfirmed: [] }, contextForRun(scope.runDir));
    if (!check.ok || !check.file) {
      emit({ ok: false, errors: check.errors });
      return 1;
    }
    saveSentry(scope.runDir, check.file);
    emit({ ok: true, saved: "data/sentry.json", note: "The technical report says server errors were not read, and why." });
    return 0;
  }
  const raw = readJson<unknown>(sentryFilePath(scope.runDir));
  if (raw === undefined) {
    emit({ ok: false, errors: ["data/sentry.json does not exist yet: write it (see `sentry window`), or `sentry skip --reason` when nothing could be read."] });
    return 1;
  }
  const data = readRunData(scope.runDir);
  const check = checkSentry(raw, settings, window, { findings: data.findings, unconfirmed: data.unconfirmed }, contextForRun(scope.runDir));
  if (check.ok && check.file) saveSentry(scope.runDir, check.file); // the masked, clipped version replaces what the agent wrote
  emit({ ok: check.ok, errors: check.errors, warnings: check.warnings, ...(check.suggestions.length ? { maybe_these_explain_a_finding: check.suggestions, note: "These errors say relates_to \"none\" but share words with a finding. Look, and set relates_to if they are the same problem." } : {}), errors_kept: check.file?.errors?.length ?? 0 });
  return check.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------- escaped bugs from Sentry and tickets (owner's, outside a run)

export function cmdEscapedFromSources(sub: "areas" | "import", rest: string[], home: string): number {
  const { values } = opts(rest, { project: { type: "string" }, file: { type: "string" }, by: { type: "string" } });
  const scope = projectScope(home, { ...(values.project ? { project: values.project as string } : {}) });
  const config = configOf(scope.project.root);
  if (sub === "areas") {
    emit({
      areas: knownAreas(scope.store),
      production: { sentry_environments: config?.integrations.sentry?.production_environments ?? [], sentry_projects: config?.integrations.sentry?.projects ?? [], ticket_label: config?.integrations.linear?.escaped_label ?? "escaped", linear_team: config?.integrations.linear?.team },
      note: "Name an escaped bug's area in these words where one fits: the match to what the runs said goes by the words of the area. `status` is what the newest run that covered it said.",
    });
    return 0;
  }
  if (!values.file) throw new UsageError('escaped import needs --file F: a JSON list, [{ "area": "Orders list: search", "title": "what went wrong in production", "severity": "important", "source": "sentry", "ref": "ACME-API-3F", "note": "…" }]');
  const raw = readJson<unknown>(path.resolve(values.file as string));
  if (!Array.isArray(raw)) throw new UsageError(`${values.file} must hold a JSON list.`);
  const items: EscapedInput[] = raw.map((x, i) => {
    const o = x as Record<string, unknown>;
    if (typeof o?.["area"] !== "string" || typeof o?.["title"] !== "string") throw new UsageError(`Entry ${i + 1} needs an "area" and a "title".`);
    const source = typeof o["source"] === "string" && (ESCAPED_SOURCES as readonly string[]).includes(o["source"]) ? (o["source"] as EscapedSource) : "other";
    return { area: o["area"], title: o["title"], source, ...(typeof o["severity"] === "string" ? { severity: o["severity"] as EscapedInput["severity"] } : {}), ...(typeof o["ref"] === "string" ? { ref: o["ref"] } : {}), ...(typeof o["note"] === "string" ? { note: o["note"] } : {}) };
  });
  const results = withStoreLock(scope.store, () => importEscaped(scope.store, items, (values.by as string | undefined) ?? os.userInfo().username, new Date()));
  emit({ results, recorded: results.filter((r) => r.result === "recorded").length, refused: results.filter((r) => r.result === "refused").length, note: "Each recorded bug raised the risk of its area; `escaped list` shows what the runs had said about each." });
  return 0;
}
