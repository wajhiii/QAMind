import type { CoverageRow, Finding, RunData } from "./report.ts";

export type VerdictLevel = "ready" | "ready-with-risks" | "not-ready";

export interface Verdict {
  level: VerdictLevel;
  /** The first line of the admin report. One line, plain words. */
  line: string;
  /** The risks or reasons behind it, in plain words. */
  reasons: string[];
  /** True when the verdict is "not ready" because the test environment was broken, not because of the product. */
  environment_problem: boolean;
}

export interface FlowStatus {
  total: number;
  tested: number[];
  untested: number[];
}

/** A critical journey counts as tested only when it has coverage rows and every one of them is "tested". */
export function flowStatus(data: RunData): FlowStatus {
  const total = data.meta?.critical_flows?.length ?? 0;
  const tested: number[] = [];
  const untested: number[] = [];
  for (let i = 1; i <= total; i++) {
    const rows: CoverageRow[] = data.coverage.filter((r) => r.critical_flow === i);
    (rows.length > 0 && rows.every((r) => r.status === "tested") ? tested : untested).push(i);
  }
  return { total, tested, untested };
}

export const isOpen = (f: Finding): boolean => f.fix_status !== "fixed-verified";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sentence = (s: string) => s.trim().replace(/[.\s]+$/, "");

/**
 * Default release rules (spec §13.13): Ready only with 0 critical problems, at most 2 important ones, a passing health
 * check and every critical journey tested. Never "Ready" if a journey was not tested. (Regressed bugs and per-project
 * rule overrides arrive with later phases; until then regressions are not tracked.)
 */
export function computeVerdict(data: RunData): Verdict {
  const open = data.findings.filter(isOpen);
  const critical = open.filter((f) => f.severity === "critical");
  const important = open.filter((f) => f.severity === "important");
  const plainTitle = (f: Finding) => sentence(f.plain?.title ?? f.title);

  if (data.health && !data.health.environment_ok) {
    return {
      level: "not-ready",
      environment_problem: true,
      reasons: ["The test environment had a problem, so the product could not be checked."],
      line: "⛔ **Not ready to release:** the test environment has a problem, so nothing could be checked (see below).",
    };
  }
  if (critical.length > 0) {
    const first = plainTitle(critical[0] as Finding);
    const more = important.length > 2 ? ` and ${plural(important.length, "important problem", "important problems")}` : "";
    return {
      level: "not-ready",
      environment_problem: false,
      reasons: critical.map(plainTitle),
      line: `⛔ **Not ready to release:** ${plural(critical.length, "critical problem", "critical problems")} found${more}, for example: ${first}.`,
    };
  }

  const risks: string[] = [];
  if (important.length > 2) risks.push(`${important.length} important problems are open`);
  const flows = flowStatus(data);
  if (flows.total === 0) risks.push("the key journeys were not listed, so they could not be confirmed as checked");
  else if (flows.untested.length > 0) risks.push(`${plural(flows.untested.length, "key journey was", "key journeys were")} not fully checked`);
  if (!data.health) risks.push("the test environment was not confirmed healthy");
  if (risks.length === 0) {
    return {
      level: "ready",
      environment_problem: false,
      reasons: [],
      line: `✅ **Ready to release:** no critical problems, ${plural(important.length, "important problem", "important problems")}, and every key journey was checked.`,
    };
  }
  return { level: "ready-with-risks", environment_problem: false, reasons: risks, line: `⚠️ **Ready with risks:** ${risks.join("; ")}.` };
}
