import path from "node:path";
import { readJson } from "./fsutil.ts";
import { findPii } from "./privacy.ts";
import type { PrivacyContext } from "./privacy.ts";

/**
 * "Test this ticket" mode (spec 13.4): a ticket, a story file or pasted text becomes a list of acceptance criteria, each criterion is tested, and both reports carry a checklist:
 * every criterion is met, not met, or not testable (with the reason). The agent reads the ticket and writes `data/ticket.json`; QAMind checks it and the results, and a run cannot finish its report without
 * an answer for every criterion. Ticket text is data from outside: it is read for what the product should do and never obeyed as an instruction.
 */

export const TICKET_SOURCES = ["linear", "github", "file", "url", "pasted", "other"] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];
export type CriterionOrigin = "stated" | "derived";

export interface Criterion {
  id: string;
  /** The criterion as the ticket says it (or, for a derived one, as the agent worded it). */
  text: string;
  /** The same in words a manager understands; the admin report uses it when there is one. */
  plain?: string;
  /** `stated`: written in the ticket. `derived`: the agent worked it out because the ticket had none. */
  origin: CriterionOrigin;
  /** A derived criterion in a run with a person: they were shown it and agreed. Set by the agent after asking. */
  confirmed?: boolean;
}

export interface TicketFile {
  /** The ticket's id, its address without any query, a file path, or "pasted text". */
  ref: string;
  source: TicketSource;
  title: string;
  criteria: Criterion[];
}

export type CriterionStatus = "met" | "not-met" | "not-testable";
export const CRITERION_STATUSES: CriterionStatus[] = ["met", "not-met", "not-testable"];

export interface CriterionResult {
  criterion: string;
  status: CriterionStatus;
  /** What was done and seen (met), what went wrong (not met), or why it cannot be tested (not testable). */
  why: string;
  /** The same in plain words for the admin report. */
  plain_why?: string;
  /** Evidence files inside the run folder. */
  evidence?: string[];
  /** The findings (ISSUE-001) that explain a criterion that is not met. */
  findings?: string[];
  /** The bank tests (T-001) that now check it. */
  tests?: string[];
}

export const ticketFilePath = (runDir: string): string => path.join(runDir, "data", "ticket.json");
export const ticketResultsPath = (runDir: string): string => path.join(runDir, "data", "ticket-results.json");

export const MAX_CRITERIA = 30;
const one = (s: string): string => s.replace(/\s+/g, " ").trim();

/** A reference safe to keep in the run's files: a URL loses its query and fragment (they can carry tokens), and a long text is cut. */
export function cleanRef(ref: string): string {
  const r = one(ref).slice(0, 200);
  if (/^https?:\/\//i.test(r)) {
    try {
      const u = new URL(r);
      return `${u.origin}${u.pathname}`;
    } catch {
      return r.replace(/[?#].*$/, "");
    }
  }
  return r;
}

export interface TicketCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  ticket?: TicketFile;
  /** Criteria the agent derived that nobody could confirm (a CI run): the reports call them "assumed". */
  assumed: string[];
}

/** Checks `data/ticket.json`. In a run with a person, a derived criterion must have been confirmed by them; in CI (nobody to ask) it is listed as assumed. */
export function checkTicket(raw: unknown, opts: { trigger: string; privacy?: PrivacyContext; expectedRef?: string }): TicketCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ['data/ticket.json must be { "ref", "source", "title", "criteria": [ { "id": "AC-1", "text", "origin": "stated|derived" } ] }.'], warnings, assumed: [] };
  const o = raw as Record<string, unknown>;
  const ref = typeof o["ref"] === "string" ? one(o["ref"]) : "";
  if (!ref) errors.push('"ref" is the ticket id, its address, the file or "pasted text".');
  else if (opts.expectedRef && cleanRef(ref) !== opts.expectedRef) errors.push(`"ref" is "${ref}" but the run was started for "${opts.expectedRef}".`);
  const source = o["source"];
  if (!(TICKET_SOURCES as readonly unknown[]).includes(source)) errors.push(`"source" must be one of ${TICKET_SOURCES.join(", ")}.`);
  const title = typeof o["title"] === "string" ? one(o["title"]) : "";
  if (!title || title.length > 200) errors.push('"title" is the ticket title, up to 200 characters.');
  const list = o["criteria"];
  if (!Array.isArray(list) || list.length === 0) errors.push('"criteria" needs at least one acceptance criterion (derive them when the ticket has none, and say so with origin "derived").');
  else if (list.length > MAX_CRITERIA) errors.push(`At most ${MAX_CRITERIA} criteria (found ${list.length}): group them, or test the ticket in parts.`);
  const criteria: Criterion[] = [];
  const seen = new Set<string>();
  const assumed: string[] = [];
  for (const [i, c] of (Array.isArray(list) ? list : []).slice(0, MAX_CRITERIA).entries()) {
    const x = (c ?? {}) as Record<string, unknown>;
    const at = `criteria[${i}]`;
    const id = typeof x["id"] === "string" ? x["id"] : "";
    if (!/^AC-\d{1,3}$/.test(id)) errors.push(`${at}: "id" must look like AC-1.`);
    else if (seen.has(id)) errors.push(`${at}: the id ${id} is used twice.`);
    seen.add(id);
    const text = typeof x["text"] === "string" ? one(x["text"]) : "";
    if (text.length < 8 || text.length > 500) errors.push(`${at} (${id}): "text" is one testable statement of 8 to 500 characters.`);
    if (x["origin"] !== "stated" && x["origin"] !== "derived") errors.push(`${at} (${id}): "origin" is "stated" (the ticket says it) or "derived" (you worked it out).`);
    const plain = typeof x["plain"] === "string" ? one(x["plain"]) : undefined;
    for (const [what, v] of [["text", text], ["plain", plain ?? ""]] as const) {
      if (v && opts.privacy && findPii(v, opts.privacy).length > 0) errors.push(`${at} (${id}): "${what}" holds private data (an email address, number or ID). Describe it without the data: a ticket's examples are not copied into the reports.`);
    }
    const origin: CriterionOrigin = x["origin"] === "derived" ? "derived" : "stated";
    if (origin === "derived") {
      if (opts.trigger === "ci") assumed.push(id);
      else if (x["confirmed"] !== true) errors.push(`${at} (${id}): a criterion you derived has to be shown to the person who asked and confirmed before you test it (set "confirmed": true after they agree). In a CI run nobody can confirm, so it is listed as assumed.`);
    }
    if (/^AC-\d{1,3}$/.test(id) && text.length >= 8) criteria.push({ id, text, ...(plain ? { plain } : {}), origin, ...(x["confirmed"] === true ? { confirmed: true } : {}) });
  }
  if (criteria.length > 0 && criteria.every((c) => c.origin === "derived")) warnings.push("Every criterion was derived: the ticket stated none. The reports say so.");
  const ok = errors.length === 0;
  return { ok, errors, warnings, assumed, ...(ok ? { ticket: { ref: cleanRef(ref), source: source as TicketSource, title, criteria } } : {}) };
}

export interface TicketData {
  ticket?: TicketFile;
  results: CriterionResult[];
  /** Criteria derived in a run nobody could confirm. */
  assumed: string[];
}

/** What the reports show: the ticket, the results, and which criteria are only assumed. Reads loosely (the lint is where problems are reported). */
export function readTicketData(runDir: string, trigger?: string): TicketData | undefined {
  const raw = readJson<TicketFile>(ticketFilePath(runDir));
  if (!raw || !Array.isArray(raw.criteria)) return undefined;
  const results = readJson<unknown>(ticketResultsPath(runDir));
  const list = Array.isArray(results) ? (results as CriterionResult[]) : [];
  return { ticket: raw, results: list, assumed: trigger === "ci" ? raw.criteria.filter((c) => c.origin === "derived").map((c) => c.id) : [] };
}

export interface TicketLint {
  errors: string[];
  warnings: string[];
}

/** Every criterion has exactly one answer, and each answer is backed: met says what was seen, not met names a finding, not testable says why. */
export function lintTicketResults(runDir: string, data: TicketData | undefined, known: { findings: string[]; unconfirmed: string[]; tests?: string[] }, meta: { ticket_ref?: string }): TicketLint {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!meta.ticket_ref) return { errors, warnings };
  if (!data?.ticket) {
    errors.push("This is a ticket run but data/ticket.json is missing or unreadable: write the ticket's criteria first (`qamind ticket check --run ID` says what is wrong).");
    return { errors, warnings };
  }
  const raw = readJson<unknown>(ticketResultsPath(runDir));
  if (raw === undefined) {
    errors.push("data/ticket-results.json is missing: every criterion needs a result (met, not-met or not-testable, with why).");
    return { errors, warnings };
  }
  if (!Array.isArray(raw)) {
    errors.push("data/ticket-results.json must be a list of { criterion, status, why }.");
    return { errors, warnings };
  }
  const ids = new Set(data.ticket.criteria.map((c) => c.id));
  const answered = new Set<string>();
  for (const [i, r] of data.results.entries()) {
    const at = `ticket-results.json[${i}]${r?.criterion ? ` (${r.criterion})` : ""}`;
    if (!r?.criterion || !ids.has(r.criterion)) {
      errors.push(`${at}: "criterion" must be one of ${[...ids].join(", ")}.`);
      continue;
    }
    if (answered.has(r.criterion)) errors.push(`${at}: ${r.criterion} is answered twice.`);
    answered.add(r.criterion);
    if (!CRITERION_STATUSES.includes(r.status)) {
      errors.push(`${at}: "status" must be met, not-met or not-testable.`);
      continue;
    }
    if (one(r.why ?? "").length < 12) errors.push(`${at}: "why" is a real sentence: ${r.status === "met" ? "what you did and saw" : r.status === "not-met" ? "what went wrong" : "why it cannot be tested here"}.`);
    if (r.status === "met" && !(r.evidence?.length || r.tests?.length)) errors.push(`${at}: a criterion is only "met" with something to show for it: "evidence" (files in the run folder) or "tests" (bank tests that check it).`);
    if (r.status === "not-met") {
      const refs = r.findings ?? [];
      if (refs.length === 0) errors.push(`${at}: a criterion that is not met is a finding: list it in "findings" (the ISSUE ids), or in unconfirmed.json if you could not reproduce it twice and use status not-testable.`);
      for (const f of refs) if (!known.findings.includes(f)) errors.push(`${at}: ${f} is not a finding of this run.`);
    }
    for (const t of r.tests ?? []) if (known.tests && !known.tests.includes(t)) warnings.push(`${at}: ${t} is not in the test bank.`);
  }
  for (const id of ids) if (!answered.has(id)) errors.push(`Criterion ${id} has no result in data/ticket-results.json.`);
  return { errors, warnings };
}

export interface ChecklistRow {
  id: string;
  text: string;
  origin: CriterionOrigin;
  assumed: boolean;
  status: CriterionStatus | "no-result";
  why: string;
  evidence: string[];
  findings: string[];
  tests: string[];
}

const MARK: Record<CriterionStatus | "no-result", string> = { met: "✅ Met", "not-met": "❌ Not met", "not-testable": "⛔ Cannot be tested", "no-result": "⛔ No result" };
export const checklistMark = (s: CriterionStatus | "no-result"): string => MARK[s];

export function checklistRows(d: TicketData, plain: boolean): ChecklistRow[] {
  return (d.ticket?.criteria ?? []).map((c) => {
    const r = d.results.find((x) => x.criterion === c.id);
    return {
      id: c.id,
      text: plain ? c.plain || c.text : c.text,
      origin: c.origin,
      assumed: d.assumed.includes(c.id),
      status: r && CRITERION_STATUSES.includes(r.status) ? r.status : "no-result",
      why: one((plain ? r?.plain_why || r?.why : r?.why) ?? ""),
      evidence: r?.evidence ?? [],
      findings: r?.findings ?? [],
      tests: r?.tests ?? [],
    };
  });
}

export function ticketCounts(d: TicketData): { total: number; met: number; not_met: number; not_testable: number; assumed: number } {
  const rows = checklistRows(d, false);
  return { total: rows.length, met: rows.filter((r) => r.status === "met").length, not_met: rows.filter((r) => r.status === "not-met").length, not_testable: rows.filter((r) => r.status === "not-testable" || r.status === "no-result").length, assumed: d.assumed.length };
}

const cell = (s: string): string => one(s).replace(/\|/g, "\\|");

export function renderTechnicalChecklist(d: TicketData): string[] {
  const c = ticketCounts(d);
  const t = d.ticket as TicketFile;
  const L: string[] = [`## Ticket: ${cell(t.ref)} (acceptance criteria)`, "", `**${cell(t.title)}**: ${c.met} of ${c.total} criteria met, ${c.not_met} not met, ${c.not_testable} could not be tested.${c.assumed ? ` ${c.assumed} criteria were derived by QAMind and nobody could confirm them (assumed).` : ""}`, ""];
  L.push("| Criterion | Result | Why | Findings | Tests |", "|---|---|---|---|---|");
  for (const r of checklistRows(d, false)) L.push(`| **${r.id}** ${cell(r.text)}${r.assumed ? " _(assumed)_" : r.origin === "derived" ? " _(derived, confirmed)_" : ""} | ${MARK[r.status]} | ${cell(r.why)} | ${r.findings.map((f) => `[${f}](#${f})`).join(", ") || "-"} | ${r.tests.join(", ") || "-"} |`);
  L.push("");
  return L;
}

export function renderAdminChecklist(d: TicketData): string[] {
  const c = ticketCounts(d);
  const t = d.ticket as TicketFile;
  const L: string[] = [`## What was asked for (${cell(t.title)})`, "", `${c.met} of ${c.total} things that were asked for are working${c.not_met ? `, ${c.not_met} are not` : ""}${c.not_testable ? `, ${c.not_testable} could not be checked` : ""}.${c.assumed ? ` ${c.assumed} of them were worked out by the checker because the request did not say what "done" means, and nobody could confirm them.` : ""}`, ""];
  for (const r of checklistRows(d, true)) L.push(`- ${MARK[r.status]}: ${cell(r.text)}${r.assumed ? " (assumed)" : ""}${r.why ? ` — ${cell(r.why)}` : ""}`);
  L.push("");
  return L;
}
