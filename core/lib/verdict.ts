import { DEFAULT_RELEASE_RULES } from "./config.ts";
import type { ReleaseBlocker, ReleaseRules } from "./config.ts";
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
 * The release readiness verdict (spec §13.13). Default rules: Ready only with 0 critical problems, at most 2 important ones, a passing health
 * check, no bug that came back after being fixed, and every critical journey tested; a critical problem makes it "Not ready", anything else "Ready with risks".
 * A project may change the limits and which violations mean "Not ready" (`release.rules` in the config, frozen into the run's meta at its start so a later render
 * gives the same verdict); it cannot make a run "Ready" when a key journey was not tested, or when the test environment was broken.
 */
export function computeVerdict(data: RunData): Verdict {
  const v = verdictFromOpenFindings(data);
  if (!data.fix || v.environment_problem) return v;
  // In a fix run the open problems exclude the ones fixed and verified on the fix branch, which is only true once a person has merged it.
  const fixed = data.findings.filter((f) => f.fix_status === "fixed-verified").length;
  const regression = data.fix.comparison?.verdict === "regression";
  let { level, reasons, line } = v;
  if (regression) {
    const why = "an automatic check that passed before the fixes fails after them";
    if (level === "ready") {
      level = "ready-with-risks";
      line = `⚠️ **Ready with risks:** ${why}.`;
    }
    reasons = [...reasons, why];
    if (level === "ready-with-risks" && !line.includes(why)) line = line.replace(/\.$/, `; ${why}.`);
  }
  if (fixed > 0) line = `${line} (This counts the ${plural(fixed, "fix", "fixes")} made in this check as merged; they are on a separate branch until a developer reviews and merges them.)`;
  return { ...v, level, reasons, line };
}

/** What was found wrong against the release rules: a violation with the condition it belongs to (or none, for a risk that is never a reason for "Not ready"). */
interface Violation {
  blocker?: ReleaseBlocker;
  text: string;
}

function verdictFromOpenFindings(data: RunData): Verdict {
  const rules: ReleaseRules = data.meta?.release_rules ?? DEFAULT_RELEASE_RULES;
  const open = data.findings.filter(isOpen);
  const critical = open.filter((f) => f.severity === "critical");
  const important = open.filter((f) => f.severity === "important");
  const minor = open.filter((f) => f.severity === "minor");
  const plainTitle = (f: Finding) => sentence(f.plain?.title ?? f.title);

  if (data.health && !data.health.environment_ok) {
    return {
      level: "not-ready",
      environment_problem: true,
      reasons: ["The test environment had a problem, so the product could not be checked."],
      line: "⛔ **Not ready to release:** the test environment has a problem, so nothing could be checked (see below).",
    };
  }

  const found: Violation[] = [];
  if (critical.length > rules.max_critical) found.push({ blocker: "critical", text: `${plural(critical.length, "critical problem", "critical problems")} found` });
  else if (critical.length > 0) found.push({ text: `${plural(critical.length, "critical problem is", "critical problems are")} open (your release rules allow ${rules.max_critical})` });
  if (important.length > rules.max_important) found.push({ blocker: "important", text: `${plural(important.length, "important problem is", "important problems are")} open` });
  if (rules.max_minor !== undefined && minor.length > rules.max_minor) found.push({ blocker: "minor", text: `${plural(minor.length, "minor problem is", "minor problems are")} open (your release rules allow ${rules.max_minor})` });
  const back = (data.lifecycle?.findings ?? []).filter((l) => l.status === "regressed").length;
  if (back > 0 && !rules.allow_regressed) found.push({ blocker: "regressed", text: `${plural(back, "problem", "problems")} came back after being fixed` });
  const flows = flowStatus(data);
  if (flows.total === 0) found.push({ blocker: "flows-untested", text: "the key journeys were not listed, so they could not be confirmed as checked" });
  else if (flows.untested.length > 0) found.push({ blocker: "flows-untested", text: `${plural(flows.untested.length, "key journey was", "key journeys were")} not fully checked` });
  if (!data.health) found.push({ text: "the test environment was not confirmed healthy" });

  const blocking = found.filter((v) => v.blocker && rules.not_ready_when.includes(v.blocker));
  if (blocking.length > 0) {
    // The default rule keeps its words: the first critical problem, by name, and the important ones when there are more than the rules allow.
    if (blocking.some((v) => v.blocker === "critical")) {
      const more = important.length > rules.max_important ? ` and ${plural(important.length, "important problem", "important problems")}` : "";
      return {
        level: "not-ready",
        environment_problem: false,
        reasons: [...critical.map(plainTitle), ...blocking.filter((v) => v.blocker !== "critical").map((v) => v.text)],
        line: `⛔ **Not ready to release:** ${plural(critical.length, "critical problem", "critical problems")} found${more}, for example: ${plainTitle(critical[0] as Finding)}.`,
      };
    }
    return { level: "not-ready", environment_problem: false, reasons: found.map((v) => v.text), line: `⛔ **Not ready to release:** ${blocking.map((v) => v.text).join("; ")}.` };
  }
  if (found.length === 0) {
    return {
      level: "ready",
      environment_problem: false,
      reasons: [],
      line: `✅ **Ready to release:** no critical problems, ${plural(important.length, "important problem", "important problems")}, and every key journey was checked.`,
    };
  }
  return { level: "ready-with-risks", environment_problem: false, reasons: found.map((v) => v.text), line: `⚠️ **Ready with risks:** ${found.map((v) => v.text).join("; ")}.` };
}
