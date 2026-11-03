import fs from "node:fs";
import path from "node:path";
import { loadQaEnv } from "../dotenv.ts";
import { withStoreLock } from "../memory/lock.ts";
import type { ProjectScope, RunScope } from "../memory/service.ts";
import { contextFrom } from "../privacy.ts";
import { readJson } from "../fsutil.ts";
import { runSweep } from "./engine.ts";
import type { SweepContext, SweepOptions } from "./engine.ts";
import { readSweepResults } from "./results.ts";
import type { SweepResults } from "./results.ts";
import { acceptBaseline, baselineSummary } from "./visual.ts";

/** What the CLI calls for the sweep and for baselines, so the command line and the checks can never disagree. */

export function sweepContextForRun(scope: RunScope): SweepContext {
  const ctx = scope.ctx;
  const names = ctx.config.roles.flatMap((r) => [r.username_env, r.password_env]);
  return {
    store: scope.store,
    outDir: scope.runDir,
    runId: scope.runId,
    config: ctx.config,
    policy: ctx.policy,
    roles: ctx.roles,
    secrets: loadQaEnv(ctx.projectRoot, process.env, names).values,
    passwords: ctx.passwords,
    privacy: contextFrom(ctx.config, ctx.roles.map((r) => r.username)),
    ...(ctx.marker.budget?.deadline ? { deadlineMs: Date.parse(ctx.marker.budget.deadline) } : {}),
  };
}

export async function runSweepForRun(scope: RunScope, opts: Partial<SweepOptions> = {}): Promise<SweepResults> {
  return runSweep(sweepContextForRun(scope), { mode: opts.mode ?? scope.mode, ...opts });
}

export interface AcceptResult {
  accepted: Array<{ page: string; role: string; browser: string; viewport: string }>;
  /** Pictures that were not saved, and why. */
  skipped: Array<{ page: string; browser: string; viewport: string; reason: string }>;
  /** Pages that had problems when they were photographed: accepting them makes the broken look the baseline. */
  with_problems: string[];
}

/**
 * Marks a run's pictures as the baseline for later runs (spec 13.9: `/qa-tests baseline accept`). It is the owner's decision: the safety hook refuses it inside a QA run.
 * The run need not be active: its folder is read from the project.
 */
export function acceptBaselines(scope: ProjectScope, runId: string, opts: { pages?: string[]; by?: string; now?: Date } = {}): AcceptResult {
  const runDir = path.join(scope.project.root, ".qa", "reports", runId);
  if (!/^[\w.-]+$/.test(runId) || !fs.existsSync(runDir)) throw new Error(`There is no run folder .qa/reports/${runId} in this project.`);
  const sweep = readSweepResults(runDir);
  if (!sweep) throw new Error(`Run ${runId} has no sweep (data/sweep.json), so there are no pictures to accept. Run \`qamind sweep run --run ${runId}\` inside a QA run first.`);
  const now = opts.now ?? new Date();
  const out: AcceptResult = { accepted: [], skipped: [], with_problems: [] };
  const wanted = opts.pages?.length ? new Set(opts.pages) : undefined;
  if (wanted) {
    const known = new Set(sweep.visits.map((v) => v.page));
    const missing = [...wanted].filter((p) => !known.has(p));
    if (missing.length) throw new Error(`Run ${runId} did not photograph: ${missing.join(", ")} (it has ${[...known].join(", ") || "no pages"}).`);
  }
  withStoreLock(scope.store, () => {
    for (const v of sweep.visits) {
      if (wanted && !wanted.has(v.page)) continue;
      if (v.error || !v.screenshot) {
        out.skipped.push({ page: v.page, browser: v.browser, viewport: v.viewport, reason: v.error ?? "no picture was taken" });
        continue;
      }
      const file = path.join(runDir, v.screenshot);
      if (!fs.existsSync(file)) {
        out.skipped.push({ page: v.page, browser: v.browser, viewport: v.viewport, reason: "the picture is no longer in the run folder" });
        continue;
      }
      acceptBaseline(scope.store, { page: v.page, role: v.role ?? "-", browser: v.browser, viewport: v.viewport }, file, runId, now, opts.by);
      out.accepted.push({ page: v.page, role: v.role ?? "-", browser: v.browser, viewport: v.viewport });
      if (v.signals.length > 0 && !out.with_problems.includes(v.page)) out.with_problems.push(v.page);
    }
  });
  return out;
}

export function baselineStatus(scope: ProjectScope): { count: number; pages: string[]; entries: Array<{ page: string; role: string; browser: string; viewport: string; accepted_run: string; accepted_at: string }> } {
  const s = baselineSummary(scope.store);
  return { count: s.count, pages: s.pages, entries: s.entries.map((e) => ({ page: e.page, role: e.role, browser: e.browser, viewport: e.viewport, accepted_run: e.accepted_run, accepted_at: e.accepted_at })) };
}

/** The measurements of a finished run's sweep that belong in the perf history. Only pages that really settled count. */
export function sweepPerfPoints(runDir: string): Array<{ key: string; ms: number }> {
  const sweep = readJson<SweepResults>(path.join(runDir, "data", "sweep.json"));
  if (!sweep) return [];
  return sweep.visits.filter((v) => !v.error && v.settled_ms !== undefined && !v.signals.some((s) => s.kind === "never-settled")).map((v) => ({ key: `page|${v.page}|${v.role ?? "-"}|${v.browser}|${v.viewport}`, ms: v.settled_ms as number }));
}
