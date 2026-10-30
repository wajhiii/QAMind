import type { Severity } from "./config.ts";
import { countBySeverity, mergedNotTested } from "./report.ts";
import type { Finding, FixStatus, RunData } from "./report.ts";
import type { RunSummary } from "./run.ts";
import { computeVerdict, isOpen } from "./verdict.ts";
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
}

export interface AdminModel {
  verdict: Verdict;
  summary: string[];
  environment: string[];
  areas: AreaRow[];
  problems: AdminProblem[];
  trend: string[];
  notTested: Array<{ area: string; reason: string }>;
  nextSteps: string[];
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

function statusText(s: FixStatus | undefined): string {
  return s === "fixed-verified" ? "Fixed and checked" : s === "fixed-needs-confirmation" ? "Fixed, needs a human to confirm" : "Not fixed yet";
}

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

function toProblem(f: Finding): AdminProblem {
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
    status: statusText(f.fix_status),
    ...(p?.ticket ? { ticket: p.ticket } : {}),
    missingPlain: !complete,
  };
}

function trendLines(data: RunData, previous: RunSummary[]): string[] {
  const last = previous[0];
  if (!last) return ["This is the first check of this project, so there is nothing to compare with yet."];
  const now = countBySeverity(data.findings.filter(isOpen));
  const diff = (a: number, b: number) => (b === a ? "same" : b > a ? `${b - a} more` : `${a - b} fewer`);
  const lines = [
    `Last check (${plainDate(last.started)}, ${MODE_TEXT[last.mode]?.split(" (")[0] ?? last.mode}): ${last.counts.critical} critical, ${last.counts.important} important, ${last.counts.minor} minor.`,
    `This check: ${now.critical} critical (${diff(last.counts.critical, now.critical)}), ${now.important} important (${diff(last.counts.important, now.important)}), ${now.minor} minor (${diff(last.counts.minor, now.minor)}).`,
  ];
  if (last.mode !== data.meta?.mode) lines.push("The two checks were not the same kind, so the numbers are not directly comparable.");
  lines.push("We do not yet track which problems are new and which are repeats of earlier ones.");
  return lines;
}

export function buildAdminModel(data: RunData, previous: RunSummary[] = []): AdminModel {
  const verdict = computeVerdict(data);
  const open = data.findings.filter(isOpen);
  const counts = countBySeverity(open);
  const areas = buildAreas(data);
  const problems = [...open]
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || (a.id ?? "").localeCompare(b.id ?? ""))
    .map(toProblem);
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
  const biggest =
    one(data.admin?.biggest_risk) ||
    (problems[0] && problems[0].severity !== "minor" ? `${problems[0].title}.`.replace(/\.\.$/, ".") : "No serious risk was found in what was checked.");
  const names = notTested.slice(0, 3).map((n) => (n.area.length > 60 ? `${n.area.slice(0, 57)}...` : n.area));
  const summary = [
    `Checked on ${plainDate(meta?.started)} · Environment: ${meta?.environment ?? "unknown"} · Type of check: ${MODE_TEXT[meta?.mode ?? ""] ?? meta?.mode ?? "unknown"}`,
    `We looked at ${plural(areas.length, "area", "areas")}: ${areaParts.join(", ")}.`,
    `Problems: 🔴 ${counts.critical} critical · 🟠 ${counts.important} important · 🟡 ${counts.minor} minor`,
    `Biggest risk: ${biggest}`,
    notTested.length ? `Not tested: ${names.join("; ")}${notTested.length > 3 ? ` and ${notTested.length - 3} more` : ""}.` : "Not tested: nothing; everything planned was checked.",
  ];
  if (data.unconfirmed.length) summary.push(`${plural(data.unconfirmed.length, "other thing was", "other things were")} seen only once and could not be repeated; they are not counted as problems.`);

  const fallbackSteps: string[] = [];
  if (counts.critical > 0) fallbackSteps.push("Have a developer fix the critical problems first.");
  if (notTested.length > 0) fallbackSteps.push("Arrange what is needed to check the areas that were not tested (see the list below).");
  if (problems.length > 0) fallbackSteps.push("Run the check again after the fixes to confirm them.");
  const authored = (data.admin?.next_steps ?? []).map(one).filter(Boolean);
  const nextSteps = (authored.length ? authored : fallbackSteps).slice(0, MAX_NEXT_STEPS);

  return { verdict, summary: summary.slice(0, MAX_SUMMARY_LINES), environment: environmentLines(data), areas, problems, trend: trendLines(data, previous), notTested, nextSteps };
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
    L.push(`- **Status:** ${p.status}`, `- **Ticket:** ${p.ticket ? `[open the ticket](${p.ticket})` : "none yet"}`, "- **Your feedback (optional):** ______");
    L.push(`- **For developers:** [${p.id}](${TECHNICAL_FILE}#${p.id})`, "");
  }

  L.push("## Compared with the last check", "", ...m.trend.map((t) => `- ${t}`), "");
  L.push("## What was not tested", "");
  if (m.notTested.length === 0) L.push("Everything planned was checked.", "");
  else L.push(...m.notTested.map((n) => `- **${one(n.area)}**: ${one(n.reason)}`), "");
  if (m.nextSteps.length) L.push("## Suggested next steps", "", ...m.nextSteps.map((s, i) => `${i + 1}. ${s}`), "");
  L.push("## Words used in this report", "", ...GLOSSARY.map(([w, d]) => `- **${w}**: ${d}`), "");
  L.push(
    "---",
    `The full technical details, with exact steps for developers, are in \`${TECHNICAL_FILE}\`. Feedback written in this report is read by a developer; it is not picked up automatically yet.`,
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
    const text = raw.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"); // link targets are file paths by nature
    for (const [re, label] of JARGON) if (re.test(text)) issues.push({ line: i + 1, found: label, text: raw.trim().slice(0, 110) });
  });
  return issues;
}
