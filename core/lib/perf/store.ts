import type { PerformanceSettings } from "../config.ts";
import { memoryPaths, readMemoryJson, writeMemoryJson } from "../memory/store.ts";

/**
 * What pages and API endpoints took in recent runs (spec 13.11), kept in the project's memory so a run can say "this page now takes twice as long as last week" even when it is still under budget.
 * Only runs that finished write here, and only from a fixed set of measurements, so a run that was cut short cannot move the numbers.
 */

export interface PerfPoint {
  ms: number;
  run: string;
  at: string;
}
interface PerfFile {
  schema_version?: number;
  /** key -> the latest measurements, oldest first. */
  series: Record<string, PerfPoint[]>;
}

export const KEEP_POINTS = 8;
const MAX_SERIES = 600;
/** Smaller differences are noise, whatever their percentage: 40 ms to 90 ms is 125% slower and means nothing. */
export const MIN_PAGE_DELTA_MS = 250;
export const MIN_API_DELTA_MS = 100;

export const pageKey = (v: { page: string; role?: string; browser: string; viewport: string }): string => `page|${v.page}|${v.role ?? "-"}|${v.browser}|${v.viewport}`;
export const apiKey = (method: string, apiPath: string, role?: string): string => `api|${method.toUpperCase()} ${apiPath}|${role ?? "-"}`;

export function loadPerf(store: string): PerfFile {
  const f = readMemoryJson<PerfFile>(memoryPaths(store).perf);
  return f && f.series && typeof f.series === "object" ? f : { series: {} };
}

/** Adds this run's measurements (the caller holds the store's lock). The oldest series go first when the file grows past its limit. */
export function recordPerf(store: string, points: Array<{ key: string; ms: number }>, run: string, now: Date): number {
  if (points.length === 0) return 0;
  const f = loadPerf(store);
  for (const p of points) {
    const list = f.series[p.key] ?? [];
    list.push({ ms: Math.round(p.ms), run, at: now.toISOString() });
    f.series[p.key] = list.slice(-KEEP_POINTS);
  }
  const keys = Object.keys(f.series);
  if (keys.length > MAX_SERIES) {
    const oldest = keys.sort((a, b) => (f.series[a]?.at(-1)?.at ?? "").localeCompare(f.series[b]?.at(-1)?.at ?? "")).slice(0, keys.length - MAX_SERIES);
    for (const k of oldest) delete f.series[k];
  }
  writeMemoryJson(memoryPaths(store).perf, { series: f.series });
  return points.length;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  // nearest rank: with five calls the 95th percentile is the slowest
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] as number;
}
export { median };

export interface Judgement {
  /** Over the budget. */
  over_budget: boolean;
  budget_ms: number;
  /** Slower than the recent runs by more than regression_pct (and by enough milliseconds to matter). */
  regressed: boolean;
  previous_ms?: number;
  previous_at?: string;
  previous_runs?: number;
  /** How much slower than before, in percent, when there is something to compare with. */
  slower_pct?: number;
}

/** Judges one measurement against its budget and its recent history. */
export function judge(ms: number, budgetMs: number, history: PerfPoint[], regressionPct: number, minDeltaMs: number): Judgement {
  const recent = history.slice(-5);
  const prev = recent.length ? median(recent.map((p) => p.ms)) : undefined;
  const slowerPct = prev && prev > 0 ? Math.round(((ms - prev) / prev) * 100) : undefined;
  const regressed = prev !== undefined && slowerPct !== undefined && slowerPct > regressionPct && ms - prev >= minDeltaMs;
  return {
    over_budget: ms > budgetMs,
    budget_ms: budgetMs,
    regressed,
    ...(prev !== undefined ? { previous_ms: Math.round(prev), previous_runs: recent.length, ...(recent.at(-1) ? { previous_at: recent.at(-1)?.at as string } : {}) } : {}),
    ...(slowerPct !== undefined ? { slower_pct: slowerPct } : {}),
  };
}

/** The budget for a page: its own entry (by path, without the query) or the default. */
export function pageBudget(perf: PerformanceSettings, pagePath: string): number {
  const bare = pagePath.split("?")[0] as string;
  return perf.pages[pagePath] ?? perf.pages[bare] ?? perf.page_load_ms;
}
/** The budget for an endpoint: its own entry (`GET /admin/reports/sales`) or the default. */
export function endpointBudget(perf: PerformanceSettings, method: string, apiPath: string): number {
  const bare = apiPath.split("?")[0] as string;
  return perf.endpoints[`${method.toUpperCase()} ${apiPath}`] ?? perf.endpoints[`${method.toUpperCase()} ${bare}`] ?? perf.endpoints[bare] ?? perf.api_p95_ms;
}

/** Plain wording for a duration: "4.3 seconds", "850 ms". */
export function plainDuration(ms: number): string {
  return ms >= 1000 ? `${(Math.round(ms / 100) / 10).toString().replace(/\.0$/, "")} seconds` : `${Math.round(ms)} ms`;
}
