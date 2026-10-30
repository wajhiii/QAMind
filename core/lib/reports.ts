import fs from "node:fs";
import path from "node:path";
import { buildAdminModel, renderAdminMarkdown } from "./adminreport.ts";
import type { AdminModel } from "./adminreport.ts";
import { readJson } from "./fsutil.ts";
import { storeSubdirs } from "./paths.ts";
import { loadFalseAlarms, matchFalseAlarms } from "./memory/falsealarms.ts";
import { loadLearnings } from "./memory/learnings.ts";
import { detectChanges } from "./memory/update.ts";
import { assignIds, lintRun, readRunData, renderTechnicalReport } from "./report.ts";
import type { LintResult, RunData } from "./report.ts";
import { checkConsistency } from "../scripts/consistency-check.ts";
import type { RunSummary } from "./run.ts";

/** Summaries of earlier runs of this project, newest first, excluding the one being reported. */
export function previousRuns(store: string | undefined, currentRunId: string | undefined, limit = 3): RunSummary[] {
  if (!store) return [];
  const dir = storeSubdirs(store).runs;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => readJson<RunSummary>(path.join(dir, f)))
    .filter((r): r is RunSummary => !!r && r.run_id !== currentRunId)
    .slice(0, limit);
}

export interface RenderedReports {
  data: RunData;
  model: AdminModel;
  technical: string;
  admin: string;
}

/** What `detectChanges` needs from the project config. */
export interface ReportContext {
  mode: string;
  runId: string;
  roles: string[];
  uiUrls: Record<string, string>;
  /** Recompute "what changed since the last run" against memory (at `report build`). At `run finish` memory is about to change, so the saved result is used. */
  refreshChanges?: boolean;
}

export function renderReports(runDir: string, store?: string, ctx?: ReportContext): RenderedReports {
  const first = readRunData(runDir);
  assignIds(runDir, first);
  if (store && ctx?.refreshChanges) detectChanges({ store, runDir, runId: ctx.runId, mode: ctx.mode, now: new Date(), roles: ctx.roles, uiUrls: ctx.uiUrls });
  const data = readRunData(runDir);
  const previous = previousRuns(store, data.meta?.run_id);
  const model = buildAdminModel(data, previous);
  return { data, model, technical: renderTechnicalReport(data, { previous }), admin: renderAdminMarkdown(model) };
}

/** Write TECHNICAL-REPORT.md and ADMIN-REPORT.md from the same structured data. */
export function writeReports(runDir: string, store?: string, ctx?: ReportContext): RenderedReports {
  const r = renderReports(runDir, store, ctx);
  fs.writeFileSync(path.join(runDir, "TECHNICAL-REPORT.md"), r.technical, "utf8");
  fs.writeFileSync(path.join(runDir, "ADMIN-REPORT.md"), r.admin, "utf8");
  return r;
}

/** Everything `report lint` enforces: the evidence rules, the consistency of the two written reports, and that memory was used honestly. */
export function lintReports(runDir: string, knownSecrets: string[] = [], store?: string): LintResult & { consistency: ReturnType<typeof checkConsistency> } {
  const data = readRunData(runDir);
  const base = lintRun(runDir, data, knownSecrets);
  const consistency = checkConsistency(runDir);
  const errors = [...base.errors, ...consistency.errors.filter((e) => !base.errors.includes(e))];
  const warnings = [...base.warnings, ...consistency.warnings];

  if (store) {
    // A finding that restates something the owner already said is not a bug must not be reported again.
    const alarms = loadFalseAlarms(store).alarms;
    for (const m of matchFalseAlarms(data.findings, alarms)) {
      const msg = `${m.finding.id ?? m.finding.title} resembles known false alarm ${m.alarm.id} ("${m.alarm.symptom}", ${m.alarm.source}: ${m.alarm.reason}). Do not report it, or set "not_a_known_false_alarm" on the finding with the reason it is different.`;
      (m.alarm.source === "reproduction" ? warnings : errors).push(msg);
    }
    // Citations must be real: memory cannot be cited if it does not exist.
    const learningIds = new Set(loadLearnings(store).active.map((l) => l.id));
    const alarmIds = new Set(alarms.map((a) => a.id));
    for (const text of data.meta?.memory_applied ?? []) {
      for (const id of text.match(/\b(?:L|FA)-\d{3,}\b/g) ?? []) {
        if (!learningIds.has(id) && !alarmIds.has(id)) errors.push(`memory_applied cites ${id}, which does not exist in this project's memory.`);
      }
    }
  }
  if (!fs.existsSync(path.join(runDir, "data", "pages.json"))) warnings.push("data/pages.json was not written: the product map will not learn which screens exist, and what changed since the last run cannot be reported for screens.");
  return { ok: errors.length === 0, errors, warnings, consistency };
}
