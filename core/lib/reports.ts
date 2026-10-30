import fs from "node:fs";
import path from "node:path";
import { buildAdminModel, renderAdminMarkdown } from "./adminreport.ts";
import type { AdminModel } from "./adminreport.ts";
import { readJson } from "./fsutil.ts";
import { storeSubdirs } from "./paths.ts";
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

export function renderReports(runDir: string, store?: string): RenderedReports {
  const first = readRunData(runDir);
  assignIds(runDir, first);
  const data = readRunData(runDir);
  const model = buildAdminModel(data, previousRuns(store, data.meta?.run_id));
  return { data, model, technical: renderTechnicalReport(data), admin: renderAdminMarkdown(model) };
}

/** Write TECHNICAL-REPORT.md and ADMIN-REPORT.md from the same structured data. */
export function writeReports(runDir: string, store?: string): RenderedReports {
  const r = renderReports(runDir, store);
  fs.writeFileSync(path.join(runDir, "TECHNICAL-REPORT.md"), r.technical, "utf8");
  fs.writeFileSync(path.join(runDir, "ADMIN-REPORT.md"), r.admin, "utf8");
  return r;
}

/** Everything `report lint` enforces: the evidence rules plus the consistency of the two written reports. */
export function lintReports(runDir: string, knownSecrets: string[] = []): LintResult & { consistency: ReturnType<typeof checkConsistency> } {
  const data = readRunData(runDir);
  const base = lintRun(runDir, data, knownSecrets);
  const consistency = checkConsistency(runDir);
  const errors = [...base.errors, ...consistency.errors.filter((e) => !base.errors.includes(e))];
  return { ok: errors.length === 0, errors, warnings: [...base.warnings, ...consistency.warnings], consistency };
}
