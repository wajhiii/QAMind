import fs from "node:fs";
import path from "node:path";
import { withStoreLock } from "./lock.ts";
import { loadFalseAlarms, archiveFalseAlarm } from "./falsealarms.ts";
import { loadBank, summariseBank } from "../bank/bank.ts";
import { loadBugs } from "./bugs.ts";
import { feedbackStats } from "./feedback.ts";
import { loadFixLog } from "./fixlog.ts";
import { archiveLearning, loadLearnings, LEARNING_TYPES } from "./learnings.ts";
import { lessonOverview, readLessonUse } from "./lessons.ts";
import type { LessonOverview } from "./lessons.ts";
import { archiveRiskArea, loadRisk, scoreAreas } from "./risk.ts";
import { projectNamesOf } from "./service.ts";
import type { Scope } from "./service.ts";
import { daysBetween, memoryPaths, readJsonl } from "./store.ts";
import { recentRunSummaries } from "./context.ts";
import type { RunSummary } from "../run.ts";
import { agentPerformance, loadMetrics } from "../metrics.ts";
import type { AgentPerformance } from "../metrics.ts";

/**
 * The owner's memory review (`/qa-memory-review`): what memory holds, what looks stale enough to archive, and the numbers over time. Reading is free;
 * everything that removes something (`pruneMemory`, rejecting a lesson) is an owner action the host asks them to approve, and nothing is ever deleted: it moves
 * to `memory/archive/` with the reason, so a mistake can be undone by moving the line back.
 */
const LOW_CONFIDENCE = 4;
const STALE_DAYS = 180;
const UNUSED_DAYS = 90;
const UNUSED_ALARM_DAYS = 120;
const OLD_RISK_DAYS = 365;

export interface ReviewOverview {
  project: { id: string; name: string };
  learnings: {
    total: number;
    by_type: Record<string, number>;
    items: Array<{ id: string; type: string; area: string; text: string; confidence: number; hits: number; last_confirmed: string; age_days: number; prune_because?: string[] }>;
  };
  false_alarms: { total: number; items: Array<{ id: string; area: string; symptom: string; reason: string; source: string; hits: number; created: string; prune_because?: string[] }> };
  risk_areas: Array<{ area: string; score: number; occurrences: number; worst_severity: string; last_seen: string; prune_because?: string[] }>;
  lessons: LessonOverview;
  archived: Record<string, number>;
  prune_candidates: number;
  warnings: string[];
}

const archivedCounts = (store: string): Record<string, number> => {
  const dir = memoryPaths(store).archiveDir;
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => [f.replace(/\.jsonl$/, ""), readJsonl<object>(path.join(dir, f)).records.length]));
};

const projectOf = (scope: Scope): { id: string; name: string } => (scope.kind === "project" ? { id: scope.project.id, name: scope.project.name } : { id: path.basename(scope.store), name: path.basename(scope.ctx.projectRoot) });

/** Everything the owner reviews, with the entries that look stale marked and why. A mark is a suggestion: nothing changes until `pruneMemory`. */
export function reviewOverview(scope: Scope, now = new Date()): ReviewOverview {
  const learned = loadLearnings(scope.store, now);
  const alarms = loadFalseAlarms(scope.store, now);
  const risk = scoreAreas(loadRisk(scope.store), now);
  const learnings = learned.active.map((l) => {
    const age = Math.round(daysBetween(l.created, now));
    const since = daysBetween(l.last_confirmed, now);
    const why: string[] = [];
    if (l.confidence <= LOW_CONFIDENCE) why.push(`low confidence (${l.confidence} of 10)`);
    if (since >= STALE_DAYS) why.push(`not confirmed for ${Math.round(since)} days`);
    if (l.hits === 0 && age >= UNUSED_DAYS && l.confidence <= 5) why.push(`never used in ${age} days and only moderately trusted`);
    return { id: l.id, type: l.type, area: l.area, text: l.text, confidence: l.confidence, hits: l.hits, last_confirmed: l.last_confirmed.slice(0, 10), age_days: age, ...(why.length ? { prune_because: why } : {}) };
  });
  const falseAlarms = alarms.alarms.map((a) => {
    const age = Math.round(daysBetween(a.created, now));
    return { id: a.id, area: a.area, symptom: a.symptom, reason: a.reason, source: a.source, hits: a.hits, created: a.created.slice(0, 10), ...(a.hits === 0 && age >= UNUSED_ALARM_DAYS ? { prune_because: [`never matched a later finding in ${age} days`] } : {}) };
  });
  const areas = risk.map((r) => ({ area: r.area, score: r.score, occurrences: r.occurrences, worst_severity: r.worst_severity, last_seen: r.last_seen.slice(0, 10), ...(daysBetween(r.last_seen, now) >= OLD_RISK_DAYS ? { prune_because: [`last problem seen ${Math.round(daysBetween(r.last_seen, now))} days ago`] } : {}) }));
  const sorted = [...learnings].sort((a, b) => Number(!!b.prune_because) - Number(!!a.prune_because) || a.confidence - b.confidence);
  return {
    project: projectOf(scope),
    learnings: { total: learnings.length, by_type: Object.fromEntries(LEARNING_TYPES.map((t) => [t, learnings.filter((l) => l.type === t).length]).filter(([, n]) => (n as number) > 0)), items: sorted.slice(0, 150) },
    false_alarms: { total: falseAlarms.length, items: falseAlarms },
    risk_areas: areas,
    lessons: lessonOverview(scope.home, { projectNames: projectNamesOf(scope) }),
    archived: archivedCounts(scope.store),
    prune_candidates: learnings.filter((l) => l.prune_because).length + falseAlarms.filter((a) => a.prune_because).length + areas.filter((a) => a.prune_because).length,
    warnings: [...learned.warnings, ...alarms.warnings],
  };
}

export interface PruneTarget {
  learning?: string;
  falseAlarm?: string;
  risk?: string;
}

/** Archive one entry on the owner's word. Exactly one target per call; the reason is kept with the archived entry. */
export function pruneMemory(scope: Scope, target: PruneTarget, reason: string | undefined, now = new Date()): { archived: string; kind: string; reason: string } {
  const picked = [target.learning, target.falseAlarm, target.risk].filter((x) => x !== undefined);
  if (picked.length !== 1) throw new Error("Name exactly one thing to archive: --learning ID, --false-alarm ID or --risk AREA.");
  const why = `owner review${reason ? `: ${reason.replace(/\s+/g, " ").trim().slice(0, 200)}` : ""}`;
  return withStoreLock(scope.store, () => {
    if (target.learning) return { archived: archiveLearning(scope.store, target.learning, why, now).id, kind: "learning", reason: why };
    if (target.falseAlarm) return { archived: archiveFalseAlarm(scope.store, target.falseAlarm, why, now).id, kind: "false alarm", reason: why };
    return { archived: archiveRiskArea(scope.store, target.risk as string, why, now).area, kind: "risk area", reason: why };
  });
}

export interface RunPoint {
  run_id: string;
  finished: string;
  mode: string;
  trigger: string;
  critical: number;
  important: number;
  minor: number;
  minutes: number;
  tested: number;
  not_tested: number;
}

export interface MemoryStats {
  project: { id: string; name: string };
  runs: { total: number; first?: string; last?: string; by_mode: Record<string, number>; by_trigger: Record<string, number>; recent: RunPoint[] };
  trend: { available: boolean; note: string; serious_problems_per_run?: { earlier: number; latest: number }; minutes_per_run?: { earlier: number; latest: number }; tested_areas_per_run?: { earlier: number; latest: number } };
  memory: {
    learnings: { active: number; archived: number; used_at_least_once: number; times_applied: number; average_confidence: number };
    false_alarms: { active: number; times_skipped: number };
    risk_areas: number;
    fixes: Record<string, number>;
  };
  global_lessons: { pending: number; approved: number; loaded_here: number; rejected: number; times_applied: number };
  /** What people said about findings (spec 13.5), and how it adds up. */
  feedback: ReturnType<typeof feedbackStats>;
  /** The project's bugs across runs (spec 13.12) and the test bank (spec 13.3). */
  bugs: { total: number; open: number; came_back: number; fixed: number; accepted: number; not_a_bug: number };
  bank: ReturnType<typeof summariseBank>;
  /** How the agent is doing (spec 13.16): the last runs, precision from your verdicts, bugs that escaped to production, and the trend once there are six runs. */
  performance: AgentPerformance;
  not_available_yet: string[];
}

const avg = (xs: number[]): number => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

/**
 * What the numbers can say today, and no more. A trend needs at least six finished runs (three against three); precision needs the owner's verdicts and escaped
 * bugs need Sentry or tickets, which later phases add, so they are listed as not available instead of being guessed.
 */
export function memoryStats(scope: Scope, now = new Date()): MemoryStats {
  const all = recentRunSummaries(scope.store, 1000).reverse();
  const point = (r: RunSummary): RunPoint => ({ run_id: r.run_id, finished: r.finished, mode: r.mode, trigger: r.trigger, critical: r.counts.critical, important: r.counts.important, minor: r.counts.minor, minutes: Math.round((r.duration_s / 60) * 10) / 10, tested: r.coverage.tested, not_tested: r.coverage.not_tested });
  const pts = all.map(point);
  const count = (key: (r: RunSummary) => string): Record<string, number> => all.reduce<Record<string, number>>((m, r) => ({ ...m, [key(r)]: (m[key(r)] ?? 0) + 1 }), {});
  const earlier = pts.slice(-6, -3);
  const latest = pts.slice(-3);
  const trend: MemoryStats["trend"] =
    pts.length >= 6
      ? {
          available: true,
          note: "The average of the latest 3 runs against the 3 before them. Runs of different modes are mixed, so read it as a direction, not a measurement.",
          serious_problems_per_run: { earlier: avg(earlier.map((p) => p.critical + p.important)), latest: avg(latest.map((p) => p.critical + p.important)) },
          minutes_per_run: { earlier: avg(earlier.map((p) => p.minutes)), latest: avg(latest.map((p) => p.minutes)) },
          tested_areas_per_run: { earlier: avg(earlier.map((p) => p.tested)), latest: avg(latest.map((p) => p.tested)) },
        }
      : { available: false, note: `A trend needs at least 6 finished runs; this project has ${pts.length}.` };

  const learned = loadLearnings(scope.store, now).active;
  const alarms = loadFalseAlarms(scope.store, now).alarms;
  const fixes = loadFixLog(scope.store).entries.reduce<Record<string, number>>((m, f) => ({ ...m, [f.outcome]: (m[f.outcome] ?? 0) + 1 }), {});
  const lessons = lessonOverview(scope.home, { projectNames: projectNamesOf(scope) });
  const use = readLessonUse(scope.home);
  const fb = feedbackStats(scope.store);
  const allBugs = loadBugs(scope.store).bugs;
  return {
    project: projectOf(scope),
    runs: { total: pts.length, ...(pts[0] ? { first: pts[0].finished.slice(0, 10) } : {}), ...(pts.length ? { last: (pts[pts.length - 1] as RunPoint).finished.slice(0, 10) } : {}), by_mode: count((r) => r.mode), by_trigger: count((r) => r.trigger), recent: pts.slice(-10) },
    trend,
    memory: {
      learnings: { active: learned.length, archived: archivedCounts(scope.store)["learnings"] ?? 0, used_at_least_once: learned.filter((l) => l.hits > 0).length, times_applied: learned.reduce((n, l) => n + l.hits, 0), average_confidence: avg(learned.map((l) => l.confidence)) },
      false_alarms: { active: alarms.length, times_skipped: alarms.reduce((n, a) => n + a.hits, 0) },
      risk_areas: loadRisk(scope.store).areas.filter((a) => a.events.length > 0).length,
      fixes,
    },
    global_lessons: { pending: lessons.pending.length, approved: lessons.approved.length, loaded_here: lessons.approved.filter((a) => a.loaded).length, rejected: lessons.rejected.length, times_applied: Object.values(use).reduce((n, u) => n + (u?.hits ?? 0), 0) },
    feedback: fb,
    bugs: { total: allBugs.length, open: allBugs.filter((b) => ["new", "still-open", "regressed"].includes(b.status)).length, came_back: allBugs.filter((b) => b.status === "regressed").length, fixed: allBugs.filter((b) => b.status === "fixed").length, accepted: allBugs.filter((b) => b.status === "accepted").length, not_a_bug: allBugs.filter((b) => b.status === "not-a-bug").length },
    bank: summariseBank(loadBank(scope.store).tests),
    performance: agentPerformance(scope.store),
    not_available_yet: [...(fb.precision ? [] : [`Precision (true findings out of all findings): it needs at least 5 findings that you judged with /qa-feedback; so far ${fb.judged}.`]), ...(loadMetrics(scope.store).escaped.length ? [] : ["Escaped bugs (production errors in areas marked as passing): none are recorded. Record one with `qamind escaped add`; Sentry and ticket labels will record them by themselves in a later phase."])],
  };
}
