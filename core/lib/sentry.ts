import path from "node:path";
import { readJson, writeJson } from "./fsutil.ts";
import { looksLikeProductionName } from "./urlpolicy.ts";
import { maskText } from "./privacy.ts";
import type { PrivacyContext } from "./privacy.ts";
import type { SentrySettings } from "./config.ts";
import type { Finding, Unconfirmed } from "./report.ts";

/**
 * Server errors during a run (spec 11.4): what Sentry recorded for the test system while the run lasted, tied to the findings it explains. QAMind holds no Sentry token: the agent
 * reads the errors with the tool the host has connected and writes `data/sentry.json`; this checks it, and the reports show it. Read only, and only the test system's environments.
 */

export const sentryFilePath = (runDir: string): string => path.join(runDir, "data", "sentry.json");

export interface SentryError {
  /** Sentry's short id (ACME-API-3F). */
  id: string;
  title: string;
  /** Where in the product it was raised (a route, a function). */
  culprit?: string;
  level?: string;
  /** Events in the run's window. */
  events: number;
  users?: number;
  first_seen?: string;
  last_seen?: string;
  url?: string;
  /** The finding or lead it explains (ISSUE-004, UNC-001), or "none". */
  relates_to: string;
  /** What shows the link (the request the run sent, the time), or why no finding explains it. */
  why: string;
}

export interface SentryFile {
  /** Set instead of the rest when nothing was read: no tool connected, an error from the tool, ... */
  skipped?: string;
  queried?: { projects: string[]; environments: string[]; from: string; to: string };
  errors?: SentryError[];
  notes?: string[];
}

export const readSentryFile = (runDir: string): SentryFile | undefined => {
  const v = readJson<SentryFile>(sentryFilePath(runDir));
  return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
};

export interface SentryWindow {
  from: string;
  to: string;
  margin_minutes: number;
  organization?: string;
  projects: string[];
  environments: string[];
}

/** The minutes the run lasted, widened by the margin: an error in this window, in these environments and projects, may be the run's doing. */
export function sentryWindow(settings: SentrySettings, startedIso: string, now = new Date()): SentryWindow {
  const margin = settings.window_margin_minutes * 60_000;
  return {
    from: new Date(Date.parse(startedIso) - margin).toISOString(),
    to: new Date(now.getTime() + margin).toISOString(),
    margin_minutes: settings.window_margin_minutes,
    ...(settings.organization ? { organization: settings.organization } : {}),
    projects: settings.projects,
    environments: settings.environments,
  };
}

export interface SentryCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** What was kept, masked and clipped, ready to write back. */
  file?: SentryFile;
  suggestions: Array<{ error: string; maybe_finding: string; because: string }>;
}

const MAX_ERRORS = 50;
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const words = (s: string): Set<string> => new Set(s.toLowerCase().split(/[^a-z0-9_/.-]+/).filter((w) => w.length >= 4));

function cleanSentryUrl(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return undefined;
    return `https://${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return undefined;
  }
}

/** Checks what the agent wrote against the settings, the run's findings and the privacy settings; masks what it keeps. */
export function checkSentry(raw: unknown, settings: SentrySettings, window: SentryWindow, known: { findings: Finding[]; unconfirmed: Unconfirmed[] }, privacy: PrivacyContext): SentryCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, errors: ["data/sentry.json must be a JSON object: { \"queried\": {...}, \"errors\": [...] } or { \"skipped\": \"why\" }."], warnings, suggestions: [] };
  const f = raw as Record<string, unknown>;
  if (typeof f["skipped"] === "string") {
    const why = f["skipped"].replace(/\s+/g, " ").trim();
    if (why.length < 6) errors.push("`skipped` needs the reason: no Sentry tool is connected in this session, the tool returned an error, ...");
    return { ok: errors.length === 0, errors, warnings, ...(errors.length ? {} : { file: { skipped: clip(why, 200) } }), suggestions: [] };
  }
  const q = f["queried"] as Record<string, unknown> | undefined;
  if (typeof q !== "object" || q === null) errors.push('"queried" is missing: say which projects and environments were read, and the time window ({ "projects": [...], "environments": [...], "from": "...", "to": "..." }).');
  const envs = Array.isArray(q?.["environments"]) ? (q?.["environments"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const projects = Array.isArray(q?.["projects"]) ? (q?.["projects"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (q && envs.length === 0) errors.push('"queried.environments" must list the environments that were read.');
  for (const e of envs) {
    if (looksLikeProductionName(e)) errors.push(`The environment "${e}" looks like production. A run reads the test system's errors only.`);
    else if (!settings.environments.some((s) => s.toLowerCase() === e.toLowerCase())) errors.push(`The environment "${e}" is not one of integrations.sentry.environments (${settings.environments.join(", ")}).`);
  }
  for (const p of projects) if (!settings.projects.some((s) => s.toLowerCase() === p.toLowerCase())) errors.push(`The project "${p}" is not one of integrations.sentry.projects (${settings.projects.join(", ")}).`);
  const from = typeof q?.["from"] === "string" ? Date.parse(q["from"] as string) : NaN;
  const to = typeof q?.["to"] === "string" ? Date.parse(q["to"] as string) : NaN;
  if (q && (Number.isNaN(from) || Number.isNaN(to))) errors.push('"queried.from" and "queried.to" must be times (2026-11-03T09:50:00Z).');
  else if (q && (from < Date.parse(window.from) - 60_000 || to > Date.parse(window.to) + 60_000)) errors.push(`The time window ${q["from"]} to ${q["to"]} is wider than the run's (${window.from} to ${window.to}). Errors outside it are not this run's.`);

  const list = f["errors"];
  if (!Array.isArray(list)) errors.push('"errors" must be a list (empty when Sentry recorded nothing in the window).');
  const ids = new Set([...known.findings.map((x) => x.id ?? ""), ...known.unconfirmed.map((x) => x.id ?? "")]);
  const kept: SentryError[] = [];
  const suggestions: SentryCheck["suggestions"] = [];
  for (const [i, e] of (Array.isArray(list) ? list : []).entries()) {
    const at = `errors[${i}]`;
    if (typeof e !== "object" || e === null) {
      errors.push(`${at} is not an object.`);
      continue;
    }
    const o = e as Record<string, unknown>;
    const id = typeof o["id"] === "string" ? o["id"].trim() : "";
    const title = typeof o["title"] === "string" ? o["title"].replace(/\s+/g, " ").trim() : "";
    const events = o["events"];
    const rel = typeof o["relates_to"] === "string" ? o["relates_to"].trim() : "";
    const why = typeof o["why"] === "string" ? o["why"].replace(/\s+/g, " ").trim() : "";
    if (!id || !title) errors.push(`${at} needs an "id" (Sentry's short id) and a "title".`);
    if (typeof events !== "number" || !Number.isInteger(events) || events < 1) errors.push(`${at} (${id || "?"}) needs "events": how many times it happened in the window (a whole number, 1 or more).`);
    if (rel !== "none" && !ids.has(rel)) errors.push(`${at} (${id || "?"}): "relates_to" must be the id of a finding or lead of this run (${[...ids].filter(Boolean).slice(0, 6).join(", ") || "none yet"}) or "none".`);
    if (why.length < 8) errors.push(`${at} (${id || "?"}) needs "why": what shows the link to ${rel === "none" ? "nothing (why no finding explains it)" : rel}.`);
    const seen = typeof o["last_seen"] === "string" ? Date.parse(o["last_seen"] as string) : NaN;
    if (!Number.isNaN(seen) && (seen < Date.parse(window.from) - 60_000 || seen > Date.parse(window.to) + 60_000)) errors.push(`${at} (${id}) was last seen ${o["last_seen"]}, outside the run's window: it is not this run's.`);
    const url = typeof o["url"] === "string" ? cleanSentryUrl(o["url"] as string) : undefined;
    if (typeof o["url"] === "string" && !url) warnings.push(`${at} (${id}): the address was dropped (it must be an https link without a sign-in).`);
    if (id && title && typeof events === "number") {
      const m = (s: string): string => maskText(s, privacy).text;
      kept.push({
        id: clip(id, 40),
        title: clip(m(title), 200),
        ...(typeof o["culprit"] === "string" ? { culprit: clip(m(o["culprit"] as string), 160) } : {}),
        ...(typeof o["level"] === "string" ? { level: clip(o["level"] as string, 16) } : {}),
        events,
        ...(typeof o["users"] === "number" && Number.isInteger(o["users"]) && o["users"] >= 0 ? { users: o["users"] } : {}),
        ...(typeof o["first_seen"] === "string" ? { first_seen: clip(o["first_seen"] as string, 30) } : {}),
        ...(typeof o["last_seen"] === "string" ? { last_seen: clip(o["last_seen"] as string, 30) } : {}),
        ...(url ? { url } : {}),
        relates_to: rel,
        why: clip(m(why), 300),
      });
      if (rel === "none") {
        const w = words(`${title} ${typeof o["culprit"] === "string" ? o["culprit"] : ""}`);
        const best = known.findings
          .map((x) => ({ id: x.id ?? "", shared: [...words(`${x.title} ${x.area} ${x.steps.join(" ")} ${x.actual}`)].filter((t) => w.has(t)) }))
          .filter((x) => x.id && x.shared.length >= 2)
          .sort((a, b) => b.shared.length - a.shared.length)[0];
        if (best) suggestions.push({ error: id, maybe_finding: best.id, because: `shares ${best.shared.slice(0, 4).join(", ")}` });
      }
    }
  }
  if (Array.isArray(list) && list.length > MAX_ERRORS) errors.push(`At most ${MAX_ERRORS} errors: keep the ones with the most events and say in "notes" how many were left out.`);
  const notes = Array.isArray(f["notes"]) ? (f["notes"] as unknown[]).filter((n): n is string => typeof n === "string").slice(0, 5).map((n) => clip(maskText(n, privacy).text, 240)) : [];
  const file: SentryFile = { queried: { projects, environments: envs, from: String(q?.["from"] ?? ""), to: String(q?.["to"] ?? "") }, errors: kept, ...(notes.length ? { notes } : {}) };
  return { ok: errors.length === 0, errors, warnings, ...(errors.length ? {} : { file }), suggestions };
}

export function saveSentry(runDir: string, file: SentryFile): void {
  writeJson(sentryFilePath(runDir), file);
}

// ---------------------------------------------------------------------------------------------- lint and the reports

/** Errors the report cannot be built on, and warnings. Sentry is optional: a run without it configured has nothing to lint. */
export function lintSentry(configured: boolean, file: SentryFile | undefined, known: { findings: Finding[]; unconfirmed: Unconfirmed[] }): { errors: string[]; warnings: string[] } {
  if (!configured) return { errors: [], warnings: [] };
  if (!file) return { errors: [], warnings: ["Sentry is configured but this run has no server-error record: read the errors of the run's window (`sentry window`, then write data/sentry.json and `sentry check`), or write { \"skipped\": \"why\" } there."] };
  const ids = new Set([...known.findings.map((x) => x.id ?? ""), ...known.unconfirmed.map((x) => x.id ?? "")]);
  const errors = (file.errors ?? []).filter((e) => e.relates_to !== "none" && !ids.has(e.relates_to)).map((e) => `data/sentry.json: ${e.id} relates to ${e.relates_to}, which is not a finding or lead of this run.`);
  return { errors, warnings: [] };
}

export function renderTechnicalSentry(file: SentryFile): string[] {
  const L: string[] = ["## Server errors during the run (Sentry)", ""];
  if (file.skipped) return [...L, `_Not read: ${file.skipped}_`, ""];
  const errs = file.errors ?? [];
  L.push(`_Errors Sentry recorded for ${file.queried?.environments.join(", ")} (${file.queried?.projects.join(", ")}) from ${file.queried?.from} to ${file.queried?.to}. Read only; the product's own data is not copied here._`, "");
  if (errs.length === 0) return [...L, "Sentry recorded no errors in that window.", ""];
  const cell = (e: SentryError): string => (e.url ? `[${e.id}](${e.url})` : e.id);
  const row = (e: SentryError): string => `| ${e.relates_to === "none" ? "-" : `[${e.relates_to}](#${e.relates_to})`} | ${cell(e)} | ${e.title.replace(/\|/g, "\\|")}${e.culprit ? ` (${e.culprit.replace(/\|/g, "\\|")})` : ""} | ${e.events} | ${e.why.replace(/\|/g, "\\|")} |`;
  const matched = errs.filter((e) => e.relates_to !== "none");
  const unmatched = errs.filter((e) => e.relates_to === "none");
  L.push("| Explains | Error | What | Events | Why it is linked |", "|---|---|---|---|---|");
  for (const e of [...matched, ...unmatched]) L.push(row(e));
  if (unmatched.length) L.push("", `${unmatched.length} ${unmatched.length === 1 ? "error is" : "errors are"} not explained by any finding (\`-\`): a developer should look at ${unmatched.length === 1 ? "it" : "them"}, or the "why" says why it is expected.`);
  for (const n of file.notes ?? []) L.push("", `_${n}_`);
  L.push("");
  return L;
}

/** For a finding's detail block: the server errors that explain it. */
export const sentryLinesFor = (file: SentryFile | undefined, issue: string): string[] => (file?.errors ?? []).filter((e) => e.relates_to === issue).map((e) => `- Server error: ${e.url ? `[${e.id}](${e.url})` : e.id} ${e.title} (${e.events} ${e.events === 1 ? "event" : "events"} in the run)`);

/** One plain sentence for the admin report, when the error monitor backs up a problem. */
export function adminSentryLine(file: SentryFile | undefined, findings: Finding[]): string | undefined {
  if (!file?.errors?.length) return undefined;
  const explained = new Set(file.errors.filter((e) => e.relates_to !== "none").map((e) => e.relates_to));
  const serious = findings.filter((f) => (f.severity === "critical" || f.severity === "important") && explained.has(f.id ?? ""));
  const open = file.errors.filter((e) => e.relates_to === "none").length;
  const parts: string[] = [];
  if (serious.length) parts.push(`The error monitor recorded matching server errors for ${serious.length} of the serious ${serious.length === 1 ? "problem" : "problems"} above, which backs them up`);
  if (open) parts.push(`${open} other server ${open === 1 ? "error was" : "errors were"} recorded while we tested and no problem above explains ${open === 1 ? "it" : "them"}: a developer should look`);
  return parts.length ? `${parts.join("; ")}.` : undefined;
}
