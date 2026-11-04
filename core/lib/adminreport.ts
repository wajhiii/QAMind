import type { Severity } from "./config.ts";
import { countBySeverity, mergedNotTested } from "./report.ts";
import type { Finding, FixStatus, RunData } from "./report.ts";
import { renderAdminCoverage } from "./coverage-report.ts";
import { renderAdminChecklist } from "./ticket.ts";
import { adminTicketsLine } from "./tracker.ts";
import { adminSentryLine } from "./sentry.ts";
import type { RunSummary } from "./run.ts";
import { describeChanges } from "./memory/productmap.ts";
import { computeVerdict, flowStatus, isOpen } from "./verdict.ts";
import type { Verdict } from "./verdict.ts";

/**
 * ADMIN-REPORT.md: the plain-language report for non-technical readers (spec §11.1). It is rendered from the same
 * structured run data as TECHNICAL-REPORT.md, so the problems and severities are the same by construction;
 * `checkConsistency` then verifies the two written files agree.
 */

export const MISSING_PLAIN = "(plain-language text not written yet)";
export const TECHNICAL_FILE = "TECHNICAL-REPORT.md";
export const MAX_NEXT_STEPS = 3;
export const MAX_SUMMARY_LINES = 6;

const ICON: Record<Severity, string> = { critical: "🔴", important: "🟠", minor: "🟡" };
const LABEL: Record<Severity, string> = { critical: "Critical", important: "Important", minor: "Minor" };
const SEVERITY_ORDER: Severity[] = ["critical", "important", "minor"];

export interface AreaRow {
  area: string;
  result: "✅" | "⚠️" | "⛔";
  note: string;
}

export interface AdminProblem {
  id: string;
  severity: Severity;
  title: string;
  where: string;
  what: string;
  who: string;
  steps: string[];
  expected: string;
  screenshot?: string;
  status: string;
  ticket?: string;
  missingPlain: boolean;
  /** What this problem is across checks, in plain words (new, still open, came back). */
  history?: string;
  /** True for a problem that was fixed before and was found again. */
  cameBack?: boolean;
  /** Set when a person's feedback changed the severity. */
  severityNote?: string;
}

export interface AdminModel {
  verdict: Verdict;
  summary: string[];
  environment: string[];
  areas: AreaRow[];
  problems: AdminProblem[];
  trend: string[];
  /** What changed since the last check, in plain words. */
  changes: string[];
  notTested: Array<{ area: string; reason: string }>;
  nextSteps: string[];
  /** Present in a `/qa` run that fixed (or tried to fix) things. */
  fixes?: AdminFixes;
  /** Problems from earlier checks that are fixed now, with how that was seen. */
  fixedSince: string[];
  /** Problems a person decided to live with: listed, not counted. */
  knownAccepted: string[];
  /** Ticket mode: the checklist of what was asked for (spec 13.4). */
  ticketLines: string[];
  /** Tickets made for the developers and what the error monitor saw (spec 11.4), in plain words. */
  trackerLines: string[];
  /** Where and how it was checked: screens and devices, speed, messages (spec 13.7, 13.9 to 13.11). */
  checkedLines: string[];
}

export const CANNOT_SEE_ON_SCREEN = "This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.";
export const LOGIN_NOTE = "To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one.";

export const BEHIND_NOTE = "Problems marked \"Behind the screens\" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.";
export const hasBehindTheScreens = (m: { problems: Array<{ where: string }> }): boolean => m.problems.some((p) => /^behind the screens/i.test(p.where));

/** Fixed explanations of the words the report itself uses, so a reader never has to guess what a severity or "behind the screens" means. */
export const GLOSSARY: Array<[string, string]> = [
  ["🔴 Critical", "People are blocked, information is wrong, lost or seen by the wrong people, money is affected, or security is at risk."],
  ["🟠 Important", "Something works badly or confusingly, but there is a way around it."],
  ["🟡 Minor", "Something looks wrong or is a small annoyance."],
  ["Behind the screens", "The part of the system that does its work out of sight. People never see it directly, but every screen depends on it."],
  ["Seen only once", "Something we noticed but could not repeat. It is not counted as a problem until it is confirmed."],
  ["Not tested", "Something we did not check, with the reason. It is never reported as working."],
];

const one = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const cell = (s: string) => one(s).replace(/\|/g, "\\|");
const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;

const MODE_TEXT: Record<string, string> = {
  full: "full check (everything we could reach)",
  quick: "quick check (key journeys and biggest risks)",
  regression: "re-check of earlier problems",
  diff: "check of recent changes",
  ticket: "check of one request (a ticket)",
};

export function plainDate(iso: string | undefined): string {
  const d = iso ? new Date(iso) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "date unknown";
}

const SURFACE_AREA: Record<string, string> = {
  api: "Behind the screens (the back-end system)",
  cross: "Changes showing up correctly across screens",
  permissions: "Who can see and do what (permissions)",
  "business-rule": "Business rules (prices, totals, limits)",
  other: "Other checks",
};

function areaOf(surface: string, ui: string | undefined): string {
  if (surface === "ui") return ui?.trim() || "Web screens";
  return SURFACE_AREA[surface] ?? "Other checks";
}

interface Tally {
  tested: number;
  partial: number;
  notTested: number;
  findings: Record<Severity, number>;
}

function buildAreas(data: RunData): AreaRow[] {
  const tallies = new Map<string, Tally>();
  const get = (k: string): Tally => {
    let t = tallies.get(k);
    if (!t) tallies.set(k, (t = { tested: 0, partial: 0, notTested: 0, findings: { critical: 0, important: 0, minor: 0 } }));
    return t;
  };
  for (const r of data.coverage) {
    const t = get(areaOf(r.surface, r.ui));
    if (r.status === "tested") t.tested++;
    else if (r.status === "partial") t.partial++;
    else t.notTested++;
  }
  for (const f of data.findings.filter(isOpen)) get(areaOf(f.surface, f.ui)).findings[f.severity]++;
  const fixedIn = new Map<string, number>();
  for (const f of data.findings.filter((x) => !isOpen(x))) fixedIn.set(areaOf(f.surface, f.ui), (fixedIn.get(areaOf(f.surface, f.ui)) ?? 0) + 1);

  const rows: AreaRow[] = [];
  for (const [area, t] of tallies) {
    const problems = t.findings.critical + t.findings.important + t.findings.minor;
    const parts = SEVERITY_ORDER.filter((s) => t.findings[s] > 0).map((s) => `${t.findings[s]} ${s}`);
    const partlyChecked = t.partial > 0 || t.notTested > 0;
    let result: AreaRow["result"];
    let note: string;
    if (t.findings.critical > 0) result = "⛔";
    else if (t.tested === 0 && t.partial === 0 && problems === 0) result = "⛔";
    else if (problems > 0 || partlyChecked) result = "⚠️";
    else result = "✅";
    if (problems > 0) note = `Problems found: ${parts.join(", ")}.${partlyChecked ? " Part of this area was not fully checked." : ""}`;
    else if (t.tested === 0 && t.partial === 0) note = "Not checked.";
    else if (partlyChecked) note = "Nothing wrong found, but part of this area was not fully checked.";
    else note = "Nothing wrong found in what was checked.";
    const fixed = fixedIn.get(area) ?? 0;
    if (fixed > 0) note = `${note.replace(/^Nothing wrong found in what was checked\.$/, "Nothing is left open in what was checked.")} ${fixed === 1 ? "A problem" : `${fixed} problems`} found here ${fixed === 1 ? "was" : "were"} fixed and checked (see "What was fixed").`;
    rows.push({ area, result, note });
  }
  const rank = { "⛔": 0, "⚠️": 1, "✅": 2 } as const;
  return rows.sort((a, b) => rank[a.result] - rank[b.result] || a.area.localeCompare(b.area));
}

function environmentLines(data: RunData): string[] {
  if (!data.health || data.health.environment_ok) return [];
  const lines: string[] = [];
  for (const c of data.health.checks.filter((x) => !x.ok && !x.skipped)) {
    let m: RegExpExecArray | null;
    if ((m = /^Web UI "(.+)" loads$/.exec(c.name))) lines.push(`The "${m[1]}" did not open.`);
    else if (/^API base responds$/.test(c.name)) lines.push("The back-end system behind the screens did not respond.");
    else if ((m = /^Test account "(.+)" can sign in$/.exec(c.name))) lines.push(`The test account "${m[1]}" could not sign in.`);
    else lines.push("A basic health check of the test system did not pass.");
  }
  return lines.length ? lines : ["The test environment did not pass its health check."];
}

export const STATUS_FIXED = "Fixed and checked";
export const STATUS_CONFIRM = "Fixed, needs a human to confirm";
export const STATUS_NOT_FIXED = "Not fixed yet";

function statusText(f: Finding): string {
  const s: FixStatus | undefined = f.fix_status;
  if (s === "fixed-verified" || f.fix?.outcome === "verified") return STATUS_FIXED;
  if (s === "fixed-needs-confirmation" || f.fix?.outcome === "best-effort") return STATUS_CONFIRM;
  return f.fix?.outcome === "reverted" ? `${STATUS_NOT_FIXED} (a fix was tried and taken back)` : STATUS_NOT_FIXED;
}

/** What a manager can be told about the fix run, without file names, commands or test output. */
export interface AdminFixes {
  lines: string[];
  branchLine: string;
  warning?: string;
}

export const branchLine = (branch: string): string => `Fixes are on branch ${branch}; a developer must review and merge them.`;

function fixesOf(data: RunData): AdminFixes | undefined {
  const fix = data.fix;
  if (!fix) return undefined;
  const lines: string[] = [];
  for (const f of [...data.findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || (a.id ?? "").localeCompare(b.id ?? ""))) {
    const title = one(f.plain?.title) || f.title;
    const o = f.fix?.outcome;
    if (o === "verified") lines.push(`✅ ${title}: fixed and checked.`);
    else if (o === "best-effort") lines.push(`⚠️ ${title}: fixed, but a person needs to confirm it.`);
    else if (o === "reverted") lines.push(`↩️ ${title}: a fix was tried and taken back because it did not work out.`);
    else if (o === "deferred") lines.push(`➖ ${title}: left for a person to decide.`);
  }
  const regression = fix.comparison?.verdict === "regression";
  const stopped = fix.stop ? "The fixing stopped early and is waiting for someone to say whether to go on." : "";
  return {
    lines: lines.length ? lines : ["No fix was made in this check."],
    branchLine: branchLine(fix.branch),
    ...(regression || stopped ? { warning: [regression ? "⚠️ After the fixes, an automatic check that used to pass now fails. A developer must look at this before the fixes are merged." : "", stopped].filter(Boolean).join(" ") } : {}),
  };
}

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

const dayText = (iso: string): string => plainDate(iso);

function historyOf(data: RunData, f: Finding): { history?: string; cameBack?: boolean } {
  const l = data.lifecycle?.findings.find((x) => x.issue === f.id);
  if (!l) return {};
  if (l.status === "regressed") return { cameBack: true, history: `Came back: this problem was fixed${l.fixed_on ? ` on ${dayText(l.fixed_on)}` : ""} and has now been found again.` };
  if (l.status === "still-open") return { history: `Still open: found in ${plural(l.times_seen, "check", "checks")} so far, first on ${dayText(l.first_seen)}.` };
  if (l.status === "new") return { history: "New: not seen in earlier checks." };
  return {};
}

function toProblem(f: Finding, data: RunData): AdminProblem {
  const p = f.plain;
  const complete = !!p && !!one(p.title) && !!one(p.where) && !!one(p.what_happens) && !!one(p.who_is_affected) && !!one(p.expected) && Array.isArray(p.how_to_see_it);
  const shot = p?.screenshot ?? f.evidence.find((e) => IMAGE.test(e));
  return {
    id: f.id ?? "ISSUE-???",
    severity: f.severity,
    title: one(p?.title) || f.title,
    where: one(p?.where) || MISSING_PLAIN,
    what: one(p?.what_happens) || MISSING_PLAIN,
    who: one(p?.who_is_affected) || MISSING_PLAIN,
    steps: (p?.how_to_see_it ?? []).map(one).filter(Boolean),
    expected: one(p?.expected) || MISSING_PLAIN,
    ...(shot ? { screenshot: shot } : {}),
    status: statusText(f),
    ...((): { ticket?: string } => {
      const url = data.tickets?.links.find((l) => l.issue === f.id && l.url)?.url ?? p?.ticket;
      return url ? { ticket: url } : {};
    })(),
    ...historyOf(data, f),
    ...(f.severity_note && f.severity_assessed ? { severityNote: `A person set this to ${f.severity} (the check judged it ${f.severity_assessed}).` } : {}),
    missingPlain: !complete,
  };
}

function trendLines(data: RunData, previous: RunSummary[]): string[] {
  const last = previous[0];
  if (!last) return ["This is the first check of this project, so there is nothing to compare with yet."];
  const now = countBySeverity(data.findings); // what was found this time, as the earlier checks counted it (fixes are reported separately)
  const diff = (a: number, b: number) => (b === a ? "same" : b > a ? `${b - a} more` : `${a - b} fewer`);
  const lines = [
    `Last check (${plainDate(last.started)}, ${MODE_TEXT[last.mode]?.split(" (")[0] ?? last.mode}): ${last.counts.critical} critical, ${last.counts.important} important, ${last.counts.minor} minor.`,
    `This check: ${now.critical} critical (${diff(last.counts.critical, now.critical)}), ${now.important} important (${diff(last.counts.important, now.important)}), ${now.minor} minor (${diff(last.counts.minor, now.minor)}).`,
  ];
  // Compared by key journeys, which the config fixes. The number of coverage rows is how finely the agent split the work, so it is not a trend.
  const journeysNow = flowStatus(data);
  if (last.journeys && journeysNow.total > 0) lines.push(`Key journeys fully checked: ${journeysNow.tested.length} of ${journeysNow.total} this time, ${last.journeys.tested} of ${last.journeys.total} last time.`);
  if (last.mode !== data.meta?.mode) lines.push("The two checks were not the same kind, so the numbers are not directly comparable.");
  const life = data.lifecycle;
  if (life) {
    const n = (st: string): number => life.findings.filter((x) => x.status === st).length;
    lines.push(`Of the problems found now: ${n("new")} new, ${n("still-open")} already open before, ${n("regressed")} came back after being fixed.`);
    if (life.fixed.length) lines.push(`${plural(life.fixed.length, "problem from before is", "problems from before are")} fixed now.`);
    if (life.not_rechecked.length) lines.push(`${plural(life.not_rechecked.length, "problem from before was", "problems from before were")} not looked at again this time, so we cannot say whether ${life.not_rechecked.length === 1 ? "it is" : "they are"} fixed.`);
    if (life.accepted_seen.length) lines.push(`${plural(life.accepted_seen.length, "known problem was", "known problems were")} seen again; ${life.accepted_seen.length === 1 ? "it was" : "they were"} accepted earlier and ${life.accepted_seen.length === 1 ? "is" : "are"} not counted.`);
  } else lines.push("We could not tell which problems are new and which are repeats of earlier ones, because no earlier results were available.");
  return lines;
}

function changeLines(data: RunData): string[] {
  const c = data.changes;
  if (!c) return ["We could not tell what changed, because no list of screens and functions was recorded for this check."];
  if (c.first_run) return ["This is the first check, so there is nothing to compare with."];
  const plain = describeChanges(c, (text) => lintAdminLanguage(text).length === 0).plain;
  const out = plain.length ? plain : ["Nothing new or removed: the same screens and functions as last time."];
  if (data.meta?.mode !== "full") out.push("Screens that were not visited are not listed as gone, because this was not a full check.");
  return out;
}

const topOpen = (open: Finding[]): Finding => [...open].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || (a.id ?? "").localeCompare(b.id ?? ""))[0] as Finding;

export function buildAdminModel(data: RunData, previous: RunSummary[] = []): AdminModel {
  const verdict = computeVerdict(data);
  const open = data.findings.filter(isOpen);
  const found = countBySeverity(data.findings); // everything found, as the technical report counts it; fixes are shown next to it
  const counts = countBySeverity(open);
  const fixedVerified = data.findings.length - open.length;
  const fixes = fixesOf(data);
  const areas = buildAreas(data);
  const cameBackIds = new Set((data.lifecycle?.findings ?? []).filter((l) => l.status === "regressed").map((l) => l.issue));
  // Problems that came back are listed first, then by severity.
  const problems = [...data.findings]
    .sort((a, b) => Number(cameBackIds.has(b.id ?? "")) - Number(cameBackIds.has(a.id ?? "")) || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || (a.id ?? "").localeCompare(b.id ?? ""))
    .map((f) => toProblem(f, data));
  const notTested = mergedNotTested(data).map((n) => {
    if (n.plain?.area?.trim() && n.plain?.reason?.trim()) return { area: one(n.plain.area), reason: one(n.plain.reason) };
    const row = n.fromCoverage;
    // A coverage row that was not tested has no wording of its own: name it by its area and say honestly that nothing was recorded.
    if (row) return { area: `${areaOf(row.surface, row.ui)} → ${one(row.area)}`, reason: /^(not covered|reason not recorded)\.?$/i.test(one(row.note)) || !one(row.note) ? "This was not checked in this run." : one(row.note) };
    return { area: one(n.area), reason: one(n.reason) };
  });

  const fine = areas.filter((a) => a.result === "✅").length;
  const withProblems = areas.filter((a) => /^Problems found/.test(a.note)).length;
  const notChecked = areas.filter((a) => a.note === "Not checked.").length;
  const partly = areas.length - fine - withProblems - notChecked;
  const areaParts = [`${fine} fine`, `${withProblems} with problems`, ...(partly > 0 ? [`${partly} partly checked`] : []), `${notChecked} not checked`];

  const meta = data.meta;
  // What the agent wrote at baseline (biggest risk, next steps) is not true after fixes: it is used only if it was written after the last fix.
  const authored = data.adminStale ? undefined : data.admin;
  const biggest =
    one(authored?.biggest_risk) ||
    (open[0] && open.some((f) => f.severity !== "minor") ? `${one(toProblem(topOpen(open), data).title)}.`.replace(/\.\.$/, ".") : "No serious risk was found in what was checked.");
  const names = notTested.slice(0, 3).map((n) => (n.area.length > 60 ? `${n.area.slice(0, 57)}...` : n.area));
  const summary = [
    `Checked on ${plainDate(meta?.started)} · Environment: ${meta?.environment ?? "unknown"} · Type of check: ${MODE_TEXT[meta?.mode ?? ""] ?? meta?.mode ?? "unknown"}`,
    `We looked at ${plural(areas.length, "area", "areas")}: ${areaParts.join(", ")}.`,
    `Problems: 🔴 ${found.critical} critical · 🟠 ${found.important} important · 🟡 ${found.minor} minor${fixedVerified > 0 ? ` · ${fixedVerified} of them fixed and checked` : ""}`,
    ...(cameBackIds.size > 0 ? [`⚠️ ${plural(cameBackIds.size, "problem came", "problems came")} back after being fixed: ${problems.filter((p) => p.cameBack).slice(0, 3).map((p) => one(p.title).replace(/[.\s]+$/, "")).join("; ")}${cameBackIds.size > 3 ? ` and ${cameBackIds.size - 3} more` : ""}.`] : []),
    `Biggest risk: ${biggest}`,
    notTested.length ? `Not tested: ${names.join("; ")}${notTested.length > 3 ? ` and ${notTested.length - 3} more` : ""}.` : "Not tested: nothing; everything planned was checked.",
  ];
  // The summary is at most six lines. The fix branch must be stated in it; the note about leads seen only once folds into the last line if both are present.
  const extra: string[] = [];
  if (meta?.budget?.reached) extra.push("This check stopped early because its time limit ran out, so some areas were not checked.");
  if (fixes) extra.push(fixes.branchLine);
  if (data.unconfirmed.length) extra.push(`${plural(data.unconfirmed.length, "other thing was", "other things were")} seen only once and could not be repeated; they are not counted as problems.`);
  while (summary.length + extra.length > MAX_SUMMARY_LINES) summary[summary.length - 1] += ` ${extra.pop() as string}`;
  summary.push(...extra);

  const fallbackSteps: string[] = [];
  if (data.findings.some((f) => f.fix?.outcome === "verified" || f.fix?.outcome === "best-effort")) fallbackSteps.push("Have a developer review the fixes and merge them.");
  if (counts.critical > 0) fallbackSteps.push(fixedVerified > 0 ? "Have a developer fix the critical problems that are still open." : "Have a developer fix the critical problems first.");
  if (notTested.length > 0) fallbackSteps.push("Arrange what is needed to check the areas that were not tested (see the list below).");
  if (problems.length > 0) fallbackSteps.push("Run the check again after the fixes to confirm them.");
  const authoredSteps = (authored?.next_steps ?? []).map(one).filter(Boolean);
  const nextSteps = (authoredSteps.length ? authoredSteps : fallbackSteps).slice(0, MAX_NEXT_STEPS);

  // A bug fixed since the last check is no finding of this run, so it has no `plain` block here: its plain title was kept in memory when it was found.
  const fixedSince = (data.lifecycle?.fixed ?? []).map((x) => `${one(x.plain_title ?? `A problem in "${x.area}" found earlier`).replace(/[.\s]+$/, "")}: ${x.source === "bank-test" ? "the saved automatic check for it passes now" : one(x.how).replace(/[.\s]+$/, "")}.`);
  const knownAccepted = (data.accepted ?? []).map((f) => {
    const l = data.lifecycle?.accepted_seen.find((a) => a.bug === f.bug);
    return `${one(f.plain?.title) || f.title}${l ? ` (accepted by ${l.by} on ${dayText(l.at)}${l.note ? `: ${one(l.note)}` : ""})` : ""}.`.replace(/\.\.$/, ".");
  });
  const ticketLines = data.ticket?.ticket ? renderAdminChecklist(data.ticket) : [];
  const checkedLines = data.checks ? renderAdminCoverage(data.checks) : [];
  const trackerLines = [data.tickets ? adminTicketsLine(data.tickets) : undefined, adminSentryLine(data.sentry, data.findings)].filter((x): x is string => !!x);
  return { verdict, summary: summary.slice(0, MAX_SUMMARY_LINES), environment: environmentLines(data), areas, problems, trend: trendLines(data, previous), changes: changeLines(data), notTested, nextSteps, fixedSince, knownAccepted, ticketLines, trackerLines, checkedLines, ...(fixes ? { fixes } : {}) };
}

export function renderAdminMarkdown(m: AdminModel): string {
  const L: string[] = [m.verdict.line, ""];
  if (m.environment.length) {
    L.push("## The test environment has a problem", "", "Nothing below can be trusted as a statement about the product until this is fixed:", "", ...m.environment.map((e) => `- ${e}`), "");
  }
  L.push("> **30-second summary**", ...m.summary.map((s) => `> - ${s}`), "");

  L.push("## What we found, by area", "", "| Area | Result | Notes |", "|---|---|---|");
  for (const a of m.areas) L.push(`| ${cell(a.area)} | ${a.result} | ${cell(a.note)} |`);
  if (m.areas.length === 0) L.push("| (nothing was recorded) | ⛔ | No areas were checked. |");
  L.push("", "✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked", "");

  if (m.ticketLines.length) L.push(...m.ticketLines);
  if (m.checkedLines.length) L.push("## Where and how it was checked", "", ...m.checkedLines, "");
  if (m.trackerLines.length) L.push("## Tickets and error monitoring", "", ...m.trackerLines.map((l) => `- ${l}`), "");

  L.push("## Problems found", "");
  if (m.problems.length === 0) L.push("No problems were confirmed in what was checked.", "");
  else {
    const notes = [...(m.problems.some((p) => p.steps.length > 0) ? [LOGIN_NOTE] : []), ...(hasBehindTheScreens(m) ? [BEHIND_NOTE] : [])];
    if (notes.length) L.push(notes.join(" "), "");
  }
  for (const p of m.problems) {
    L.push(`### ${ICON[p.severity]} ${LABEL[p.severity]}: ${one(p.title)}`, "");
    L.push(`- **Where:** ${p.where}`, `- **What happens:** ${p.what}`, `- **Who is affected:** ${p.who}`);
    if (p.steps.length) {
      L.push("- **How to see it yourself:**");
      p.steps.forEach((s, i) => L.push(`  ${i + 1}. ${s}`));
    } else L.push(`- **How to see it yourself:** ${CANNOT_SEE_ON_SCREEN}`);
    L.push(`- **What should happen:** ${p.expected}`);
    L.push(p.screenshot ? `- **Screenshot:** [view the screenshot](${p.screenshot})` : "- **Screenshot:** none (this is not visible on screen)");
    if (p.history) L.push(`- **History:** ${p.history}`);
    if (p.severityNote) L.push(`- **Importance:** ${p.severityNote}`);
    L.push(`- **Status:** ${p.status}`, `- **Ticket:** ${p.ticket ? `[open the ticket](${p.ticket})` : "none yet"}`, "- **Your feedback (optional):** ______");
    L.push(`- **For developers:** [${p.id}](${TECHNICAL_FILE}#${p.id})`, "");
  }

  if (m.fixedSince.length) L.push("## Fixed since the last check", "", ...m.fixedSince.map((l) => `- ${l}`), "");
  if (m.knownAccepted.length) L.push("## Known problems that were accepted", "", "These were seen again. Someone decided to live with them, so they are not counted above.", "", ...m.knownAccepted.map((l) => `- ${l}`), "");
  if (m.fixes) {
    L.push("## What was fixed", "", ...m.fixes.lines.map((l) => `- ${l}`), "", m.fixes.branchLine, "");
    if (m.fixes.warning) L.push(m.fixes.warning, "");
  }

  L.push("## What changed since the last check", "", ...m.changes.map((t) => `- ${t}`), "");
  L.push("## Compared with the last check", "", ...m.trend.map((t) => `- ${t}`), "");
  L.push("## What was not tested", "");
  if (m.notTested.length === 0) L.push("Everything planned was checked.", "");
  else L.push(...m.notTested.map((n) => `- **${one(n.area)}**: ${one(n.reason)}`), "");
  if (m.nextSteps.length) L.push("## Suggested next steps", "", ...m.nextSteps.map((s, i) => `${i + 1}. ${s}`), "");
  L.push("## Words used in this report", "", ...GLOSSARY.map(([w, d]) => `- **${w}**: ${d}`), "");
  L.push(
    "---",
    `The full technical details, with exact steps for developers, are in \`${TECHNICAL_FILE}\`. To give feedback, start the line with one of: not a bug, confirmed, won't fix, fixed, good catch, wrong severity (and the right level), or duplicate of (and the problem number), then a short reason. A developer reads it into QAMind's memory (/qa-feedback import); nothing is picked up by itself.`,
    "Before you share this report outside your team, look at the screenshots for personal information.",
    "",
  );
  return L.join("\n");
}

// ---- language check: no jargon outside "For developers" lines (spec §11.1) ----

const JARGON: Array<[RegExp, string]> = [
  [/\bHTTP\b|\bstatus code\b|\b(status|code|error|returns?|responds?|got|gets|answers?)\s*:?\s*[1-5]\d\d\b/i, "a status code"],
  [/stack\s?trace|traceback|\bexception\b/i, "a stack trace or exception"],
  [/\b(JSON|XML|API|SQL|CSS|DOM|regex|curl|endpoint|payload|header|headers|token|cookie|selector|query string|parameter|backend|frontend)\b/i, "a technical term"],
  [/\b(null|undefined)\b/i, "a programming word"],
  [/\b(GET|POST|PUT|PATCH|DELETE)\b/, "a request method"],
  [/`/, "code formatting"],
  [/\bISSUE-\d+/, "an issue id (only allowed in the For developers line)"],
  [/(^|[\s(])\/?[\w.-]+\/[\w./-]+\.\w{1,5}\b|\b[\w-]+\.(js|mjs|ts|py|php|rb|java|cs|json|ya?ml|html|css)\b|\bsrc\//i, "a file path"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, "an identifier"],
];

export interface LanguageIssue {
  line: number;
  found: string;
  text: string;
}

export function lintAdminLanguage(markdown: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];
  markdown.split("\n").forEach((raw, i) => {
    if (/^\s*-\s+\*\*For developers:\*\*/.test(raw)) return;
    if (raw.startsWith("The full technical details, with exact steps for developers")) return; // fixed footer names the file once
    if (/^(?:>\s*-\s+|-\s+)?Fixes are on branch .+; a developer must review and merge them\.$/.test(raw)) return; // the branch name is the developer's own, whatever it looks like
    const text = raw.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"); // link targets are file paths by nature
    for (const [re, label] of JARGON) if (re.test(text)) issues.push({ line: i + 1, found: label, text: raw.trim().slice(0, 110) });
  });
  return issues;
}
