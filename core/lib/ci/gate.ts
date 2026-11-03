import type { CiCondition, CiSettings } from "../config.ts";
import { isOpen, computeVerdict } from "../verdict.ts";
import type { RunData } from "../report.ts";

/**
 * What a finished run means for the pull request (spec 13.2): fail, warn or pass, by the config's `ci.fail_on` and `ci.warn_on`. Decided from the run's own data files, never from the agent's words.
 * A critical problem or an environment problem fails by default; an important problem warns.
 */
export type CiOutcome = "pass" | "warn" | "fail";

export interface CiFacts {
  critical: number;
  important: number;
  minor: number;
  environment_problem: boolean;
  came_back: number;
  bank_failures: number;
  verdict: "ready" | "ready-with-risks" | "not-ready";
}

export interface CiGate {
  outcome: CiOutcome;
  failed: CiCondition[];
  warned: CiCondition[];
  /** One plain sentence for each condition that matched. */
  reasons: string[];
  facts: CiFacts;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function factsOf(data: RunData): CiFacts {
  const open = data.findings.filter(isOpen);
  const verdict = computeVerdict(data);
  return {
    critical: open.filter((f) => f.severity === "critical").length,
    important: open.filter((f) => f.severity === "important").length,
    minor: open.filter((f) => f.severity === "minor").length,
    environment_problem: verdict.environment_problem || data.meta?.stop_reason === "environment problem",
    came_back: (data.lifecycle?.findings ?? []).filter((l) => l.status === "regressed").length,
    bank_failures: data.bank?.failed ?? 0,
    verdict: verdict.level,
  };
}

function holds(c: CiCondition, f: CiFacts): string | undefined {
  switch (c) {
    case "critical":
      return f.critical > 0 ? `${plural(f.critical, "critical problem", "critical problems")}` : undefined;
    case "important":
      return f.important > 0 ? `${plural(f.important, "important problem", "important problems")}` : undefined;
    case "minor":
      return f.minor > 0 ? `${plural(f.minor, "minor problem", "minor problems")}` : undefined;
    case "environment-problem":
      return f.environment_problem ? "the test environment had a problem, so the change could not be checked" : undefined;
    case "came-back":
      return f.came_back > 0 ? `${plural(f.came_back, "problem", "problems")} came back after being fixed` : undefined;
    case "bank-failure":
      return f.bank_failures > 0 ? `${plural(f.bank_failures, "saved check", "saved checks")} failed` : undefined;
    case "not-ready":
      return f.verdict === "not-ready" ? "the release verdict is Not ready" : undefined;
  }
}

export function evaluateGate(data: RunData, settings: Pick<CiSettings, "fail_on" | "warn_on">): CiGate {
  const facts = factsOf(data);
  const failed = settings.fail_on.filter((c) => holds(c, facts));
  const warned = settings.warn_on.filter((c) => !failed.includes(c) && holds(c, facts));
  const reasons = [...failed, ...warned].map((c) => holds(c, facts) as string);
  return { outcome: failed.length ? "fail" : warned.length ? "warn" : "pass", failed, warned, reasons, facts };
}
