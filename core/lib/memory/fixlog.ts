import type { Severity } from "../config.ts";
import type { FixOutcome } from "../fix/state.ts";
import { appendArchive, assertSafeText, memoryPaths, nextId, readJsonl, screenForSecretsAndPii, writeJsonl } from "./store.ts";

/**
 * The fix log (spec 10.1): every fix attempted in a `/qa` run, in every run, so later runs know what was fixed, where, with which test,
 * and what failed. Entries hold titles and short root causes only; text that would not pass the memory screen is withheld, never saved.
 */
export const FIX_LOG_CAP = 300;
const WITHHELD = "[withheld: it contained sensitive data]";

export interface FixLogEntry {
  id: string;
  run: string;
  issue: string;
  severity: Severity;
  area: string;
  title: string;
  outcome: FixOutcome;
  branch: string;
  commit?: string;
  files: string[];
  test_files: string[];
  root_cause?: string;
  reason?: string;
  at: string;
  [extra: string]: unknown;
}

export interface FixLogInput {
  run: string;
  issue: string;
  severity: Severity;
  area: string;
  title: string;
  outcome: FixOutcome;
  branch: string;
  commit?: string;
  files: string[];
  test_files: string[];
  root_cause?: string;
  reason?: string;
}

export function loadFixLog(store: string): { entries: FixLogEntry[]; warnings: string[]; unparsed: string[] } {
  const r = readJsonl<FixLogEntry>(memoryPaths(store).fixLog);
  const entries = r.records.filter((e): e is FixLogEntry => typeof e.id === "string" && typeof e.issue === "string");
  const dropped = r.records.length - entries.length;
  return { entries, warnings: [...r.warnings, ...(dropped ? [`fix-log.jsonl: ${dropped} entr${dropped === 1 ? "y" : "ies"} without an id or issue were ignored (kept in the file).`] : [])], unparsed: r.unparsed };
}

export function appendFixLog(store: string, input: FixLogInput, opts: { knownSecrets?: string[]; now?: Date } = {}): { entry: FixLogEntry; withheld: string[] } {
  const now = opts.now ?? new Date();
  const secrets = opts.knownSecrets ?? [];
  const withheld: string[] = [];
  const safe = (field: string, value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    if (screenForSecretsAndPii(value, secrets).length === 0) return value;
    withheld.push(field);
    return WITHHELD;
  };
  for (const p of [...input.files, ...input.test_files]) assertSafeText("a file path in the fix log", p, secrets);
  const loaded = loadFixLog(store);
  const root = safe("root_cause", input.root_cause);
  const reason = safe("reason", input.reason);
  const entry: FixLogEntry = {
    ...input,
    id: nextId("F", loaded.entries.map((e) => e.id)),
    area: safe("area", input.area) ?? input.area,
    title: safe("title", input.title) ?? input.title,
    ...(root !== undefined ? { root_cause: root } : {}),
    ...(reason !== undefined ? { reason } : {}),
    at: now.toISOString(),
  };
  const all = [...loaded.entries, entry];
  const keep = all.slice(-FIX_LOG_CAP);
  const drop = all.slice(0, Math.max(0, all.length - FIX_LOG_CAP));
  if (drop.length) appendArchive(store, "fix-log", drop.map((e) => ({ ...e, archived_at: now.toISOString(), archived_reason: "over the size limit; the oldest entries are archived" })));
  writeJsonl(memoryPaths(store).fixLog, "fix-log", keep, loaded.unparsed);
  return { entry, withheld };
}

/** The compact form shown to the agent before it plans. */
export function recentFixes(store: string, limit = 8): Array<Pick<FixLogEntry, "issue" | "severity" | "area" | "title" | "outcome" | "files" | "test_files" | "root_cause">> {
  return loadFixLog(store)
    .entries.slice(-limit)
    .reverse()
    .map((e) => ({ issue: e.issue, severity: e.severity, area: e.area, title: e.title, outcome: e.outcome, files: e.files, test_files: e.test_files, ...(e.root_cause ? { root_cause: e.root_cause } : {}) }));
}
