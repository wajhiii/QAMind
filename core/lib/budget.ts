import path from "node:path";
import type { BudgetMode, QamindConfig } from "./config.ts";
import { ensureDir, readJson, writeJson } from "./fsutil.ts";
import { withStoreLock } from "./memory/lock.ts";
import { storeSubdirs } from "./paths.ts";

/**
 * Time and cost budgets (spec 13.6). QAMind can measure time exactly, so the time budget is a real deadline that the tools check before each new probe and each new fix;
 * it cannot see what a host spends, so a cost limit is told to the agent and recorded, never claimed to be enforced. A run that hits its deadline stops exploring,
 * finishes its report, and lists what it did not get to as "time budget reached".
 */
export const BUDGET_REASON = "time budget reached";
/** Auto-QA's own default (spec 9.5), when neither the user's setting nor the project's config names a limit. */
export const DEFAULT_AUTO_MINUTES = 5;

export interface RunBudget {
  time_minutes?: number;
  max_cost?: number;
  /** When the time budget runs out (ISO). Absent: no time limit. */
  deadline?: string;
  /** Where the limit came from, in words (for the report and `budget status`). */
  source: string;
}

/** Which of the config's per-mode entries applies: a run started by CI or by auto-QA is that, whatever its scope. */
export const budgetKey = (mode: string, trigger: string): BudgetMode => (trigger === "auto" ? "auto" : trigger === "ci" ? "ci" : (mode as BudgetMode));

/**
 * The budget of a run: the project's per-mode limit, then its general one; auto-QA's user setting (`auto.json`) beats both, because it is the user's own;
 * auto-QA with nothing set gets five minutes. A manual run with nothing set has no limit.
 */
export function resolveBudget(config: Pick<QamindConfig, "budget">, mode: string, trigger: string, now: Date, userAutoMinutes?: number): RunBudget {
  const key = budgetKey(mode, trigger);
  const per = config.budget.modes[key];
  let minutes = per?.time_minutes;
  let source = minutes !== undefined ? `budget.modes.${key}.time_minutes in the config` : "";
  if (minutes === undefined && config.budget.time_minutes !== undefined) {
    minutes = config.budget.time_minutes;
    source = "budget.time_minutes in the config";
  }
  if (key === "auto") {
    if (userAutoMinutes !== undefined) {
      minutes = userAutoMinutes;
      source = "your auto-QA setting";
    } else if (minutes === undefined) {
      minutes = DEFAULT_AUTO_MINUTES;
      source = "the auto-QA default";
    }
  }
  const cost = per?.max_cost ?? config.budget.max_cost;
  return {
    ...(minutes !== undefined ? { time_minutes: minutes, deadline: new Date(now.getTime() + minutes * 60_000).toISOString() } : {}),
    ...(cost !== undefined ? { max_cost: cost } : {}),
    source: minutes !== undefined || cost !== undefined ? source || "budget.max_cost in the config" : "no budget is set",
  };
}

export interface BudgetStatus {
  /** `none` (no time limit), `ok`, `near` (under a fifth left: finish what you are on, start nothing big) or `over`. */
  state: "none" | "ok" | "near" | "over";
  limit_minutes?: number;
  elapsed_minutes: number;
  remaining_minutes?: number;
  max_cost?: number;
  source: string;
  message: string;
}

export function budgetStatus(budget: RunBudget | undefined, startedIso: string, now: Date): BudgetStatus {
  const elapsedMs = Math.max(0, now.getTime() - Date.parse(startedIso));
  const elapsed = Math.round((elapsedMs / 60_000) * 10) / 10;
  const costNote = budget?.max_cost !== undefined ? ` A cost limit of ${budget.max_cost} is set: stay within it (QAMind cannot see your spending).` : "";
  if (!budget || budget.time_minutes === undefined || !budget.deadline) return { state: "none", elapsed_minutes: elapsed, ...(budget?.max_cost !== undefined ? { max_cost: budget.max_cost } : {}), source: budget?.source ?? "no budget is set", message: `No time limit is set (${elapsed} minutes so far).${costNote}` };
  const remainingMs = Date.parse(budget.deadline) - now.getTime();
  const remaining = Math.round((remainingMs / 60_000) * 10) / 10;
  const base = { limit_minutes: budget.time_minutes, elapsed_minutes: elapsed, remaining_minutes: Math.max(0, remaining), ...(budget.max_cost !== undefined ? { max_cost: budget.max_cost } : {}), source: budget.source };
  if (remainingMs <= 0) return { ...base, state: "over", message: `The time budget of ${budget.time_minutes} minutes is used up (${elapsed} minutes). Stop exploring now: write every area you did not get to under Not tested with the reason "${BUDGET_REASON}", then build the report, lint it and finish the run.${costNote}` };
  if (remainingMs <= budget.time_minutes * 60_000 * 0.2) return { ...base, state: "near", message: `${remaining} of ${budget.time_minutes} minutes left. Finish what you are on, do not start anything large, and keep time for the report.${costNote}` };
  return { ...base, state: "ok", message: `${remaining} of ${budget.time_minutes} minutes left.${costNote}` };
}

// ------------------------------------------------------------------------------------------------ usage and the daily total

export interface Usage {
  duration_s: number;
  cost_usd?: number;
  tokens?: number;
  /** What the host or agent said, or "not available on this host". */
  note: string;
}

/** Usage from what a run is told: the host's own cost text when it has one ("$0.31", "12,345 tokens"), and always the duration QAMind measured itself. */
export function parseUsage(cost: string | undefined, durationS: number): Usage {
  const note = cost?.trim() || "not available on this host";
  const usd = /\$\s*([0-9]+(?:\.[0-9]+)?)|\b([0-9]+(?:\.[0-9]+)?)\s*(?:usd|dollars)\b/i.exec(note);
  const tokens = /\b([0-9][0-9,]*)\s*(?:k\s*)?tokens?\b/i.exec(note);
  const tokenCount = tokens ? Number((tokens[1] as string).replace(/,/g, "")) * (/k\s*tokens?/i.test(tokens[0]) ? 1000 : 1) : undefined;
  const usdValue = usd ? Number(usd[1] ?? usd[2]) : undefined;
  return { duration_s: durationS, ...(usdValue !== undefined && Number.isFinite(usdValue) ? { cost_usd: usdValue } : {}), ...(tokenCount !== undefined && Number.isFinite(tokenCount) ? { tokens: tokenCount } : {}), note };
}

interface Days {
  [date: string]: { minutes: number; runs: number } | undefined;
}

const daysFile = (store: string): string => path.join(storeSubdirs(store).state, "budget-days.json");
/** The day as the user lives it: their own calendar date. */
export const dayOf = (now: Date): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

function readDays(store: string): Days {
  try {
    const v = readJson<Days>(daysFile(store));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Auto-QA and CI runs add to a rolling daily total (spec 13.6); a manual run does not count against the daily limit. Old days are dropped after two weeks. */
export function addToDay(store: string, trigger: string, durationS: number, now: Date): void {
  if (trigger !== "auto" && trigger !== "ci") return;
  ensureDir(storeSubdirs(store).state);
  withStoreLock(store, () => {
    const days = readDays(store);
    const key = dayOf(now);
    const cur = days[key] ?? { minutes: 0, runs: 0 };
    days[key] = { minutes: Math.round((cur.minutes + durationS / 60) * 10) / 10, runs: cur.runs + 1 };
    for (const d of Object.keys(days).sort().slice(0, -14)) delete days[d];
    writeJson(daysFile(store), days);
  });
}

export const dayUsage = (store: string, now: Date): { minutes: number; runs: number } => readDays(store)[dayOf(now)] ?? { minutes: 0, runs: 0 };

/** Why auto-QA must not run now because of the daily limit, or undefined. */
export function dailyBudgetProblem(store: string, config: Pick<QamindConfig, "budget">, now: Date): string | undefined {
  const max = config.budget.daily_max;
  if (max === undefined) return undefined;
  const used = dayUsage(store, now);
  return used.minutes >= max ? `the daily budget of ${max} minutes for auto-QA and CI is used up (${used.minutes} minutes in ${used.runs} run${used.runs === 1 ? "" : "s"} today). It resumes tomorrow; #qa still runs QA when you ask.` : undefined;
}
