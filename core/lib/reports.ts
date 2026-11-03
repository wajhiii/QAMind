import { contextForRun, maskText, scanRun } from "./privacy.ts";
import fs from "node:fs";
import path from "node:path";
import { buildAdminModel, renderAdminMarkdown } from "./adminreport.ts";
import type { AdminModel } from "./adminreport.ts";
import { readJson } from "./fsutil.ts";
import { storeSubdirs } from "./paths.ts";
import { loadFalseAlarms, matchFalseAlarms } from "./memory/falsealarms.ts";
import { loadLearnings } from "./memory/learnings.ts";
import { lintLifecycle, refreshLifecycle } from "./memory/runlife.ts";
import { detectChanges } from "./memory/update.ts";
import { assignIds, lintRun, readRunData, renderTechnicalReport } from "./report.ts";
import type { Finding, LintResult, RunData } from "./report.ts";
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
  if (store && ctx?.refreshChanges) refreshLifecycle(store, runDir, ctx.runId);
  if (store && ctx?.refreshChanges) detectChanges({ store, runDir, runId: ctx.runId, mode: ctx.mode, now: new Date(), roles: ctx.roles, uiUrls: ctx.uiUrls });
  const data = readRunData(runDir);
  const previous = previousRuns(store, data.meta?.run_id);
  const model = buildAdminModel(data, previous);
  return { data, model, technical: renderTechnicalReport(data, { previous }), admin: renderAdminMarkdown(model) };
}

/** Write TECHNICAL-REPORT.md and ADMIN-REPORT.md from the same structured data. */
export function writeReports(runDir: string, store?: string, ctx?: ReportContext): RenderedReports {
  const r = renderReports(runDir, store, ctx);
  // Private data is masked in the rendered text too (spec 13.8), whatever the data files held: a report is the thing most likely to be e-mailed.
  const privacy = contextForRun(runDir);
  const technical = maskText(r.technical, privacy).text;
  const admin = maskText(r.admin, privacy).text;
  fs.writeFileSync(path.join(runDir, "TECHNICAL-REPORT.md"), technical, "utf8");
  fs.writeFileSync(path.join(runDir, "ADMIN-REPORT.md"), admin, "utf8");
  return { ...r, technical, admin };
}

/** In a `/qa` run, what the reports say about fixes must be what the fix tools recorded (spec 9.3). */
function lintFixRun(data: RunData, errors: string[], warnings: string[]): void {
  const claimsFix = (f: Finding): boolean => f.fix_status === "fixed-verified" || f.fix_status === "fixed-needs-confirmation" || f.fix?.outcome === "verified" || f.fix?.outcome === "best-effort";
  const fix = data.fix;
  if (!fix) {
    for (const f of data.findings) if (claimsFix(f) || f.fix) errors.push(`${f.id ?? f.title} carries a fix record but this run has no fix loop record. Fix details are written by the fix tools, never by hand.`);
    return;
  }
  for (const f of data.findings) {
    if (!claimsFix(f)) continue;
    const a = [...fix.attempts].reverse().find((x) => x.issue === f.id);
    if (!a || !(a.status === "verified" || a.status === "best-effort") || !a.commit) errors.push(`${f.id} is marked fixed but the fix loop has no committed fix for it. Fix statuses are written by fix_commit, never by hand.`);
    else if ((f.fix_status === "fixed-verified") !== (a.status === "verified")) errors.push(`${f.id}: the finding says ${f.fix_status} but the fix loop recorded the fix as ${a.status}.`);
  }
  for (const a of fix.attempts) if (a.status === "in-progress") errors.push(`${a.issue} is still being fixed: commit it (fix_commit), undo it (fix_revert) or give it up (fix_defer) before the final report, so no half-done change is left in the project.`);
  if (data.adminStale) warnings.push("data/admin.json (the biggest risk and the next steps) was written before the last fix, so the admin report ignores it and uses computed text. Rewrite it for the situation after the fixes.");
  const committed = fix.attempts.filter((a) => a.status === "verified" || a.status === "best-effort").length;
  if (committed > 0 && !fix.after) errors.push("Fixes were committed but the full test suite was not run afterwards. Call fix_run_suite after the last fix, before the final report.");
  if (fix.comparison?.verdict === "regression") warnings.push(`REGRESSION after the fixes: ${fix.comparison.note} The reports say so; tell the user loudly.`);
  if (fix.comparison?.verdict === "cannot-compare") warnings.push(`The suite result could not be compared with the baseline: ${fix.comparison.note}`);
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
  if (store) {
    const life = lintLifecycle(store, runDir, data.findings, data.unconfirmed);
    errors.push(...life.errors);
    warnings.push(...life.warnings);
  }
  lintFixRun(data, errors, warnings);
  // Private data (spec 13.8): the same scan `run finish` gates on, so it is found while there is still time to mask it.
  const scan = scanRun(runDir, contextForRun(runDir));
  for (const leak of scan.leaks.slice(0, 10)) errors.push(`Privacy: ${leak.file} holds ${leak.count} unmasked item(s) (${Object.entries(leak.kinds).map(([k, n]) => `${n} ${k}`).join(", ")}). Run \`qamind privacy mask --run ${path.basename(runDir)}\`, rebuild the reports and lint again.`);
  if (scan.leaks.length > 10) errors.push(`Privacy: ${scan.leaks.length - 10} more file(s) hold unmasked data (\`qamind privacy scan --run ${path.basename(runDir)}\` lists them all).`);
  if (!fs.existsSync(path.join(runDir, "data", "pages.json"))) warnings.push("data/pages.json was not written: the product map will not learn which screens exist, and what changed since the last run cannot be reported for screens.");
  return { ok: errors.length === 0, errors, warnings, consistency };
}
