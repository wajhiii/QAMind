import path from "node:path";
import { readJson } from "./fsutil.ts";
import type { LinearSettings, Severity } from "./config.ts";
import { addFeedback, loadFeedback } from "./memory/feedback.ts";
import type { Verdict } from "./memory/feedback.ts";
import { fingerprintOf, loadBugs } from "./memory/bugs.ts";
import type { RunScope } from "./memory/service.ts";
import { contextForRun, maskText } from "./privacy.ts";
import { findSecretLeaks } from "./redact.ts";
import { readRunData } from "./report.ts";
import type { Finding } from "./report.ts";
import { bugForTicket, eligibleFindings, loadTicketMap, noteTicketState, readTicketsFile, severityPriority, ticketForBug } from "./tracker.ts";
import type { LifeLike } from "./tracker.ts";

/** What to put in Linear for a finished run, and what a person's decision in Linear means for memory. The agent does the talking to Linear; this decides and records. */

export interface PlannedTicket {
  issue: string;
  bug: string;
  fingerprint: string;
  severity: Severity;
  /** What the bug is across runs: new, still open, or came back. */
  status: "new" | "still-open" | "regressed";
  title: string;
  /** Linear's own scale: 1 urgent, 2 high. */
  priority: 1 | 2;
  labels: string[];
  /** Markdown, masked, with the bug's fingerprint on the last line (that line is what a later run searches for). */
  description: string;
  /** The ticket an earlier run opened for this bug, when memory knows one. */
  known_ticket?: { ticket: string; url?: string; state?: string; last_run: string };
  /** What to add to an existing open ticket. */
  update_comment: string;
  /** Set when the text could not be made safe to send: nothing is created for it. */
  blocked?: string;
}

export interface TrackerPlan {
  configured: boolean;
  message?: string;
  team?: string;
  project?: string;
  create?: "ask" | "never";
  trigger?: string;
  tickets: PlannedTicket[];
  skipped: Array<{ issue: string; reason: string }>;
  masked_values: number;
  ask?: string;
  steps: string[];
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const one = (s: string): string => s.replace(/\s+/g, " ").trim();
const SEV: Record<Severity, string> = { critical: "Critical", important: "Important", minor: "Minor" };

function bodyOf(f: Finding, bug: string, fingerprint: string, runId: string, status: PlannedTicket["status"]): string {
  const where = [f.surface, f.ui, f.roles?.length ? `as ${f.roles.join(", ")}` : "", f.browser, f.viewport].filter(Boolean).join(" · ");
  const L: string[] = [
    `**${SEV[f.severity]}** · ${f.area}${where ? ` · ${where}` : ""}`,
    status === "regressed" ? "\n⚠️ **This bug had been fixed and has come back.**" : "",
    "",
    "## What is wrong",
    f.summary,
    "",
    "## Steps to reproduce",
    ...f.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `**Expected:** ${f.expected}`,
    `**Actual:** ${f.actual}`,
    "",
    `Reproduced ${f.reproduced.times} of ${f.reproduced.of} times.`,
  ];
  if (f.suspected_cause) L.push("", `**Suspected cause:** ${f.suspected_cause}`);
  if (f.evidence.length) L.push("", `Evidence (kept with the QA run, not attached here): ${f.evidence.slice(0, 6).map((e) => `\`${e}\``).join(", ")}`);
  L.push("", "---", `Found by QAMind in ${runId}. QAMind bug: ${bug} · fingerprint: ${fingerprint}`);
  return L.filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
}

const STEPS_ASK = [
  "Check that a Linear tool is connected in this session (one that can search issues and create or update them). If none is, run `tracker skip --reason \"no Linear tool is connected in this session\"` and stop.",
  "Ask the person ONCE, showing the tickets below (issue, title, severity, and whether it is new or an update). If they say no, run `tracker skip --reason \"the person chose not to create tickets\"` and stop. Do nothing in Linear before they say yes.",
];
const STEPS_WORK = [
  "For each ticket without `known_ticket`: search Linear (`team` and the fingerprint text from the last line of `description`, open issues only). One found: add `update_comment` to it as a comment and record it with `tracker record --action updated`. None found: create the issue (`team`, `title`, `description`, `priority`, `labels` that exist, `project` when set) and record it with `--action created`.",
  "For each ticket with `known_ticket`: read that ticket. Still open: add `update_comment` to it and record `--action updated`. Closed (done or canceled) and the bug is `regressed` or `still-open`: search for another open ticket; none: create a new one that says in its first line it is a regression of the closed ticket, and record `--action created`. Never reopen, close, move, assign or delete a ticket yourself.",
  "Record every ticket with `tracker record --run <id> --issue ISSUE-001 --action <created|updated|existing> --ticket ENG-123 --url <its address> --state <its state>`. Send only the text in the plan: no screenshots, no extra data, nothing from the product's pages.",
];

export function buildPlan(scope: RunScope): TrackerPlan {
  const settings = scope.ctx.config.integrations.linear as LinearSettings | undefined;
  if (!settings) return { configured: false, message: "Linear is not configured. Add an `integrations.linear` block (team) to .qa/config.md to use it. Nothing was planned.", tickets: [], skipped: [], masked_values: 0, steps: [] };
  const data = readRunData(scope.runDir);
  const life = data.lifecycle as LifeLike | undefined;
  const { eligible, skipped } = eligibleFindings(data.findings, life);
  const store = scope.store;
  const bugs = loadBugs(store).bugs;
  const map = loadTicketMap(store);
  const privacy = contextForRun(scope.runDir);
  let masked = 0;
  const safe = (s: string): string => {
    const r = maskText(s, privacy);
    masked += r.count;
    return r.text;
  };

  const tickets: PlannedTicket[] = eligible.map(({ finding: f, bug, status }) => {
    const fp = bugs.find((b) => b.id === bug)?.fingerprint ?? fingerprintOf({ area: f.area, type: f.type, title: f.title, steps: f.steps });
    const known = ticketForBug(map, bug);
    const description = safe(bodyOf(f, bug, fp, scope.runId, status)).slice(0, 6000);
    const title = safe(`[QAMind] ${one(f.title)}`).slice(0, 180);
    const leaks = findSecretLeaks(`${title}\n${description}`, scope.ctx.passwords, { generic: true });
    const t: PlannedTicket = {
      issue: f.id as string,
      bug,
      fingerprint: fp,
      severity: f.severity,
      status,
      title,
      priority: severityPriority(f.severity),
      labels: settings.labels,
      description,
      ...(known ? { known_ticket: { ticket: known.ticket, ...(known.url ? { url: known.url } : {}), ...(known.state ? { state: known.state } : {}), last_run: known.last_run } } : {}),
      update_comment: safe(status === "regressed" ? `⚠️ QAMind found this again in ${scope.runId}: it had been fixed and has come back.` : `QAMind found this still open in ${scope.runId}.`),
      ...(leaks.length ? { blocked: `the text contains ${leaks[0]}: no ticket is made for it, and the finding's report needs the same cleaning` } : {}),
    };
    return t;
  });

  const trigger = scope.ctx.marker.trigger;
  const nobody = trigger !== "manual";
  const steps: string[] = [];
  if (nobody) steps.push(`This is ${trigger === "ci" ? "a CI" : "an automatic"} run: nobody is there to be asked, so no ticket is created or changed. Run \`tracker skip --run ${scope.runId} --reason "nobody was there to ask (${trigger === "ci" ? "CI" : "automatic"} run)"\`.`);
  else if (settings.create === "never") steps.push("`integrations.linear.create` is `never`: only tickets that already exist (`known_ticket`, or found by the fingerprint search) are updated and linked; for a bug with none, run `tracker record --action skipped --reason \"create is set to never\"`. Do not ask.", ...STEPS_WORK);
  else steps.push(...STEPS_ASK, ...STEPS_WORK);
  if (tickets.some((t) => t.blocked)) steps.push("A ticket with `blocked` is not made: skip it with `tracker record --action skipped --reason <that reason>`.");

  const ask = !nobody && settings.create === "ask" && tickets.length ? `Create or update ${tickets.length} Linear ${tickets.length === 1 ? "ticket" : "tickets"} in team ${settings.team}${settings.project ? `, project ${settings.project}` : ""}? ${tickets.map((t) => `${t.issue} (${t.severity}, ${t.known_ticket ? `update ${t.known_ticket.ticket}` : "new unless one already exists"})`).join("; ")}.` : undefined;
  return {
    configured: true,
    team: settings.team,
    ...(settings.project ? { project: settings.project } : {}),
    create: settings.create,
    trigger,
    tickets,
    skipped,
    masked_values: masked,
    ...(ask ? { ask } : {}),
    steps: tickets.length ? steps : ["Nothing in this run needs a ticket (no Critical or Important bug that is not fixed and checked)."],
  };
}

// ---------------------------------------------------------------------------------------------- what a person did in Linear

export interface TrackerState {
  ticket: string;
  /** The state's name (Canceled, Done, ...). */
  state: string;
  labels?: string[];
  /** Who changed it, and when. */
  by?: string;
  at?: string;
  /** What they wrote when they closed it. */
  comment?: string;
  /** The ticket this one was closed as a duplicate of. */
  duplicate_of?: string;
}

export interface StateOutcome {
  ticket: string;
  bug?: string;
  result: "recorded" | "already-recorded" | "noted" | "ignored";
  verdict?: Verdict;
  why: string;
  effects?: string[];
}

const lc = (s: string): string => s.toLowerCase().trim();

/**
 * Reads what people did to the tickets (spec 13.5): "closed as not a bug" and "won't fix" are feedback, with the person's name from Linear. A ticket that is Done is not: nobody
 * has looked at the product, and the next run checks the bug again by itself. A closed ticket that says nothing (Canceled with no reason) is not guessed at.
 */
export function applyTrackerStates(store: string, settings: LinearSettings, states: TrackerState[], by: string, now = new Date()): StateOutcome[] {
  const out: StateOutcome[] = [];
  const map = loadTicketMap(store);
  for (const s of states) {
    const ticket = String(s.ticket ?? "").trim().toUpperCase();
    const entry = bugForTicket(map, ticket);
    if (!entry) {
      out.push({ ticket, result: "ignored", why: "QAMind did not create or link this ticket, so there is no bug to give feedback on." });
      continue;
    }
    const names = [lc(s.state), ...(s.labels ?? []).map(lc)];
    const hit = (list: string[]): string | undefined => names.find((n) => list.includes(n));
    const who = one(s.by ?? "").length >= 2 ? one(s.by as string) : by;
    const at = s.at && !Number.isNaN(Date.parse(s.at)) ? new Date(s.at) : now;
    const reason = one(s.comment ?? "").slice(0, 200);
    let verdict: Verdict | undefined;
    let value: string | undefined;
    let note = "";
    const nb = hit(settings.not_a_bug);
    const wf = hit(settings.wont_fix);
    if (nb) {
      verdict = "not-a-bug";
      note = `Closed in Linear (${ticket}) as "${nb}"${reason ? `: ${reason}` : ""}`;
    } else if (wf) {
      verdict = "wont-fix";
      note = `Closed in Linear (${ticket}) as "${wf}"${reason ? `: ${reason}` : ""}`;
    } else if (lc(s.state) === "duplicate" || s.duplicate_of) {
      const parent = s.duplicate_of ? bugForTicket(map, s.duplicate_of.trim().toUpperCase()) : undefined;
      if (parent && parent.bug !== entry.bug) {
        verdict = "duplicate-of";
        value = parent.bug;
        note = `Closed in Linear (${ticket}) as a duplicate of ${parent.ticket}`;
      }
    }
    noteTicketState(store, ticket, s.state, now);
    if (!verdict) {
      out.push({ ticket, bug: entry.bug, result: "noted", why: /^(done|completed|merged|released|shipped)$/.test(lc(s.state)) ? `The ticket is ${s.state}. That is not feedback: the next run checks the bug again by itself.` : `The ticket is "${s.state}", which does not say whether this is a bug or will be fixed: nothing is recorded. If it means one of them, give the feedback yourself (/qa-feedback ${entry.bug} ...).` });
      continue;
    }
    const again = loadFeedback(store).records.some((r) => r.bug === entry.bug && r.verdict === verdict && r.via === "tracker");
    if (again) {
      out.push({ ticket, bug: entry.bug, result: "already-recorded", verdict, why: "This decision was already recorded." });
      continue;
    }
    try {
      const r = addFeedback(store, { target: entry.bug, verdict, ...(value ? { value } : {}), note, by: who, via: "tracker" }, at);
      out.push({ ticket, bug: entry.bug, result: "recorded", verdict, why: `${who} decided it in Linear.`, effects: r.effects });
    } catch (e) {
      out.push({ ticket, bug: entry.bug, result: "ignored", verdict, why: (e as Error).message });
    }
  }
  return out;
}

export const trackerStatus = (scope: RunScope): { configured: boolean; team?: string; linked: Array<{ issue: string; ticket?: string; action: string; reason?: string }>; waiting: string[] } => {
  const settings = scope.ctx.config.integrations.linear;
  const data = readRunData(scope.runDir);
  const { eligible } = eligibleFindings(data.findings, data.lifecycle as LifeLike | undefined);
  const file = readTicketsFile(scope.runDir);
  return {
    configured: !!settings,
    ...(settings ? { team: settings.team } : {}),
    linked: (file?.links ?? []).map((l) => ({ issue: l.issue, ...(l.ticket ? { ticket: l.ticket } : {}), action: l.action, ...(l.reason ? { reason: l.reason } : {}) })),
    waiting: eligible.filter((e) => !file?.links.some((l) => l.issue === e.finding.id)).map((e) => e.finding.id as string),
  };
};

export const readTrackerStatesFile = (file: string): TrackerState[] => {
  const v = readJson<unknown>(path.resolve(file));
  if (!Array.isArray(v)) throw new Error(`${file} must hold a JSON list of tickets: [{ "ticket": "ENG-12", "state": "Canceled", "labels": ["Not a bug"], "by": "Pat Quinn", "at": "2026-11-03T10:00:00Z", "comment": "works as designed" }].`);
  return v.map((x, i) => {
    if (typeof x !== "object" || x === null || typeof (x as TrackerState).ticket !== "string" || typeof (x as TrackerState).state !== "string") throw new Error(`Entry ${i + 1} of ${file} needs a "ticket" (ENG-12) and a "state" (the state's name).`);
    return x as TrackerState;
  });
};
