import path from "node:path";
import { readJson, writeJson } from "./fsutil.ts";
import { assertSafeText, memoryPaths, readMemoryJson, writeMemoryJson } from "./memory/store.ts";
import type { Severity } from "./config.ts";
import type { Finding } from "./report.ts";

/**
 * Tickets in Linear (spec 11.4, 13.12): which ticket each bug has. QAMind holds no Linear token: the agent uses the tool the host has connected, and this file records what it did,
 * so the reports link to the tickets, the next run updates a bug's ticket instead of opening another, and a person's decision in Linear can reach memory as feedback.
 */

export const TICKET_ACTIONS = ["created", "updated", "existing", "skipped"] as const;
export type TicketAction = (typeof TICKET_ACTIONS)[number];

export interface TicketLink {
  /** The finding in this run. */
  issue: string;
  bug?: string;
  /** The tracker's own id (ENG-123). Absent when the action is `skipped`. */
  ticket?: string;
  url?: string;
  /** The ticket's state when the agent last saw it (Todo, In Progress, ...). */
  state?: string;
  action: TicketAction;
  /** Why nothing was done (action `skipped`): a person said no, nobody to ask (CI), no tool connected, ... */
  reason?: string;
  at: string;
}

export interface TicketsFile {
  schema_version: 1;
  tracker: "linear";
  team: string;
  links: TicketLink[];
}

export const ticketsFilePath = (runDir: string): string => path.join(runDir, "data", "tickets.json");
export const readTicketsFile = (runDir: string): TicketsFile | undefined => {
  const f = readJson<TicketsFile>(ticketsFilePath(runDir));
  return f && Array.isArray(f.links) ? f : undefined;
};

// ---------------------------------------------------------------------------------------------- the findings that deserve a ticket

export interface LifeLike {
  findings?: Array<{ issue: string; bug: string; status: string }>;
}
export interface Eligible {
  finding: Finding;
  bug: string;
  status: "new" | "still-open" | "regressed";
}

/**
 * Critical and Important findings that are not "Fixed and checked", and not a bug the owner has accepted or dismissed (spec 11.4). Minor findings and unconfirmed leads are not tickets:
 * a tracker full of them is a tracker nobody reads.
 */
export function eligibleFindings(findings: Finding[], life: LifeLike | undefined): { eligible: Eligible[]; skipped: Array<{ issue: string; reason: string }> } {
  const eligible: Eligible[] = [];
  const skipped: Array<{ issue: string; reason: string }> = [];
  for (const f of findings) {
    const issue = f.id ?? "";
    if (f.severity !== "critical" && f.severity !== "important") continue;
    const l = life?.findings?.find((x) => x.issue === issue);
    if (!l) {
      skipped.push({ issue, reason: "it has no bug record yet: build the report first (`report build`)" });
      continue;
    }
    if (l.status === "accepted" || l.status === "not-a-bug") {
      skipped.push({ issue, reason: l.status === "accepted" ? "the owner accepted this bug (won't fix)" : "the owner said this is not a bug" });
      continue;
    }
    if (f.fix_status === "fixed-verified") {
      skipped.push({ issue, reason: "fixed and checked in this run" });
      continue;
    }
    eligible.push({ finding: f, bug: l.bug, status: l.status as Eligible["status"] });
  }
  return { eligible, skipped };
}

// ---------------------------------------------------------------------------------------------- the memory: bug to ticket

export interface TicketMapEntry {
  bug: string;
  ticket: string;
  url?: string;
  /** The state last seen. */
  state?: string;
  created_run: string;
  last_run: string;
  updated: string;
}
export interface TicketMap {
  schema_version?: number;
  tickets: TicketMapEntry[];
}

export function loadTicketMap(store: string): TicketMap {
  const f = readMemoryJson<TicketMap>(memoryPaths(store).tickets);
  return { ...(f?.schema_version !== undefined ? { schema_version: f.schema_version } : {}), tickets: Array.isArray(f?.tickets) ? f.tickets : [] };
}
const saveTicketMap = (store: string, m: TicketMap): void => writeMemoryJson(memoryPaths(store).tickets, { tickets: m.tickets.slice(-500) });
export const ticketForBug = (m: TicketMap, bug: string): TicketMapEntry | undefined => m.tickets.find((t) => t.bug === bug);
export const bugForTicket = (m: TicketMap, ticket: string): TicketMapEntry | undefined => m.tickets.find((t) => t.ticket.toLowerCase() === ticket.toLowerCase());

/** Linear's issue identifiers: a team key and a number (ENG-123). */
export const LINEAR_ID = /^[A-Za-z][A-Za-z0-9]{0,9}-\d{1,7}$/;

/** A link the reports will show: https, on linear.app, nothing after the path. A page that talked the agent round cannot put another address in a report. */
export function cleanLinearUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`"${raw}" is not an address.`);
  }
  if (u.protocol !== "https:" || !/(^|\.)linear\.app$/i.test(u.hostname) || u.username || u.password) throw new Error("The ticket address must be an https address on linear.app, with no sign-in in it.");
  return `https://${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
}

export interface RecordInput {
  issue: string;
  action: TicketAction;
  ticket?: string;
  url?: string;
  state?: string;
  reason?: string;
}

const one = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Saves what happened to one finding's ticket: in the run (for the reports) and, for a ticket that exists, in memory (so the next run finds it). */
export function recordTicket(runDir: string, store: string, runId: string, team: string, life: LifeLike | undefined, input: RecordInput, now = new Date()): TicketLink {
  const l = life?.findings?.find((x) => x.issue === input.issue);
  if (!l) throw new Error(`${input.issue} is not a finding of this run (or the report has not been built yet: \`report build\`).`);
  if (!(TICKET_ACTIONS as readonly string[]).includes(input.action)) throw new Error(`--action must be one of ${TICKET_ACTIONS.join(", ")}.`);
  const link: TicketLink = { issue: input.issue, bug: l.bug, action: input.action, at: now.toISOString() };
  if (input.action === "skipped") {
    const reason = one(input.reason ?? "");
    if (reason.length < 6) throw new Error("A skipped ticket needs the reason (--reason): a person said no, nobody was there to ask, no Linear tool was connected, ...");
    assertSafeText("this reason", reason);
    link.reason = reason.slice(0, 200);
  } else {
    if (!input.ticket || !LINEAR_ID.test(input.ticket.trim())) throw new Error(`--ticket must be the ticket's id (like ENG-123), as Linear shows it.`);
    link.ticket = input.ticket.trim().toUpperCase();
    if (input.url) link.url = cleanLinearUrl(input.url);
    if (input.state) {
      const st = one(input.state);
      if (st.length > 40) throw new Error("--state is the ticket's state in a word or two (Todo, In Progress).");
      link.state = st;
    }
  }
  const file: TicketsFile = readTicketsFile(runDir) ?? { schema_version: 1, tracker: "linear", team, links: [] };
  file.links = [...file.links.filter((x) => x.issue !== input.issue), link];
  writeJson(ticketsFilePath(runDir), file);

  if (link.ticket) {
    const map = loadTicketMap(store);
    const prior = ticketForBug(map, l.bug);
    const entry: TicketMapEntry = { bug: l.bug, ticket: link.ticket, ...(link.url ? { url: link.url } : prior?.ticket === link.ticket && prior.url ? { url: prior.url } : {}), ...(link.state ? { state: link.state } : prior?.ticket === link.ticket && prior.state ? { state: prior.state } : {}), created_run: prior?.ticket === link.ticket ? prior.created_run : runId, last_run: runId, updated: now.toISOString() };
    map.tickets = [...map.tickets.filter((t) => t.bug !== l.bug), entry];
    saveTicketMap(store, map);
  }
  return link;
}

/** Remembers what a person did to a ticket in Linear, without changing the ticket (see `applyTrackerStates`). */
export function noteTicketState(store: string, ticket: string, state: string, now = new Date()): boolean {
  const map = loadTicketMap(store);
  const e = bugForTicket(map, ticket);
  if (!e) return false;
  e.state = one(state).slice(0, 40);
  e.updated = now.toISOString();
  saveTicketMap(store, map);
  return true;
}

// ---------------------------------------------------------------------------------------------- lint and the reports

/** Warnings (never errors: tickets are optional): a finding that deserved a ticket and has neither a link nor a reason. */
export function lintTickets(configured: boolean, file: TicketsFile | undefined, eligible: Eligible[]): string[] {
  if (!configured || eligible.length === 0) return [];
  const missing = eligible.filter((e) => !file?.links.some((l) => l.issue === e.finding.id));
  if (missing.length === 0) return [];
  return [`Linear is configured and ${missing.map((m) => m.finding.id).join(", ")} ${missing.length === 1 ? "has" : "have"} no ticket and no reason: create or update the ticket (\`tracker plan\`, then \`tracker record\`), or say why not (\`tracker skip --reason\`).`];
}

const ACTION_WORDS: Record<TicketAction, string> = { created: "ticket created", updated: "ticket updated with this run", existing: "already has an open ticket", skipped: "no ticket" };

export function renderTechnicalTickets(file: TicketsFile, findings: Finding[]): string[] {
  const L: string[] = ["## Tickets", "", `_Linear, team ${file.team}. A ticket is one per Critical or Important bug that is not fixed and checked; a bug that has an open ticket gets an update, not another ticket._`, ""];
  L.push("| Finding | Bug | Ticket | What was done |", "|---|---|---|---|");
  for (const l of file.links) {
    const f = findings.find((x) => x.id === l.issue);
    const ticket = l.ticket ? (l.url ? `[${l.ticket}](${l.url})` : l.ticket) : "-";
    const done = l.action === "skipped" ? `no ticket: ${l.reason ?? ""}` : `${ACTION_WORDS[l.action]}${l.state ? ` (${l.state})` : ""}`;
    L.push(`| [${l.issue}](#${l.issue})${f ? ` ${f.title.slice(0, 60)}` : ""} | ${l.bug ?? "-"} | ${ticket} | ${done} |`);
  }
  L.push("");
  return L;
}

/** One plain sentence for the admin report. */
export function adminTicketsLine(file: TicketsFile): string | undefined {
  const n = (a: TicketAction): TicketLink[] => file.links.filter((l) => l.action === a);
  const made = n("created");
  const updated = [...n("updated"), ...n("existing")];
  const skipped = n("skipped");
  const names = (xs: TicketLink[]): string => xs.map((x) => x.ticket).join(", ");
  const parts: string[] = [];
  if (made.length) parts.push(`${made.length} new ${made.length === 1 ? "ticket was" : "tickets were"} opened for the developers (${names(made)})`);
  if (updated.length) parts.push(`${updated.length} existing ${updated.length === 1 ? "ticket was" : "tickets were"} updated (${names(updated)})`);
  if (skipped.length) parts.push(`${skipped.length} ${skipped.length === 1 ? "problem has" : "problems have"} no ticket (${[...new Set(skipped.map((s) => s.reason))].join("; ")})`);
  return parts.length ? `${parts.join("; ")}.` : undefined;
}

export const severityPriority = (s: Severity): 1 | 2 => (s === "critical" ? 1 : 2);
