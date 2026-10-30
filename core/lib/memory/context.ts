import fs from "node:fs";
import path from "node:path";
import { readJson } from "../fsutil.ts";
import type { CompactFinding } from "../report.ts";
import type { RunSummary } from "../run.ts";
import type { StackInfo } from "../stack.ts";
import { loadFalseAlarms } from "./falsealarms.ts";
import type { FalseAlarm } from "./falsealarms.ts";
import { LEARNING_TYPES, learningScore, loadLearnings } from "./learnings.ts";
import type { Learning, LearningType } from "./learnings.ts";
import { pageCount, loadMap } from "./productmap.ts";
import { loadRisk, scoreAreas } from "./risk.ts";
import type { ScoredArea } from "./risk.ts";
import { memoryPaths } from "./store.ts";

export interface MemoryContext {
  /** One line on whether there is anything to build on. */
  note: string;
  stack?: StackInfo;
  last_runs: Array<Pick<RunSummary, "run_id" | "mode" | "finished" | "counts" | "not_tested_count" | "finding_ids" | "stop_reason">>;
  /** Where to look first, computed from risk areas and the last run. Leads, not proof. */
  focus: string[];
  risk_areas: ScoredArea[];
  /** Active learnings by type, best first. `env-quirk` and `test-tip` change how you run tests; the others tell you what to look for. */
  learnings: Partial<Record<LearningType, Array<Pick<Learning, "id" | "area" | "text" | "confidence" | "last_confirmed">>>>;
  /** Things already known not to be bugs. Do not report them again (cite the id in memory_applied). */
  false_alarms: Array<Pick<FalseAlarm, "id" | "area" | "symptom" | "reason" | "source">>;
  /** The findings of the last finished run, for `regression` mode and for re-verifying. */
  previous_findings: { from_run?: string; findings: CompactFinding[] };
  product_map: { pages: number; endpoints: number; last_run?: string; uis: Record<string, string[]> };
  warnings: string[];
}

const PER_TYPE = 6;
const MAX_PAGES_SHOWN = 40;

export function recentRunSummaries(store: string, limit = 3): RunSummary[] {
  const dir = memoryPaths(store).runs;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => readJson<RunSummary>(path.join(dir, f)))
    .filter((r): r is RunSummary => !!r);
}

/** Everything the agent should know before planning. Bounded in size; memory is leads, not proof. */
export function loadMemoryContext(store: string, limit = 3, now = new Date()): MemoryContext {
  const paths = memoryPaths(store);
  const stack = readJson<StackInfo>(paths.stack);
  const runs = recentRunSummaries(store, limit);
  const risk = scoreAreas(loadRisk(store), now).slice(0, 8);
  const learned = loadLearnings(store, now);
  const alarms = loadFalseAlarms(store, now);
  const map = loadMap(store);

  const learnings: MemoryContext["learnings"] = {};
  for (const type of LEARNING_TYPES) {
    const best = learned.active
      .filter((l) => l.type === type)
      .sort((a, b) => learningScore(b, now) - learningScore(a, now))
      .slice(0, PER_TYPE)
      .map((l) => ({ id: l.id, area: l.area, text: l.text, confidence: l.confidence, last_confirmed: l.last_confirmed.slice(0, 10) }));
    if (best.length) learnings[type] = best;
  }

  const focus: string[] = risk
    .filter((r) => r.score > 0.5)
    .slice(0, 5)
    .map((r) => `${r.area}: ${r.occurrences} earlier run${r.occurrences === 1 ? "" : "s"} with problems (worst: ${r.worst_severity}, last ${r.last_seen.slice(0, 10)}). Test it early.`);
  const last = runs[0];
  if (last && last.counts.critical + last.counts.important > 0) focus.push(`The last run (${last.run_id}) found ${last.counts.critical} critical and ${last.counts.important} important problems: re-verify them first.`);
  if ((learnings["env-quirk"]?.length ?? 0) > 0) focus.push("Known environment quirks exist: read them before running anything slow or order-dependent.");

  const uis: Record<string, string[]> = {};
  if (map) for (const [ui, entry] of Object.entries(map.uis)) uis[ui] = Object.keys(entry.pages).sort().slice(0, MAX_PAGES_SHOWN);

  return {
    note: runs.length === 0 && !map ? "No memory for this project yet: treat this as a first run." : `Memory from ${runs.length} earlier run(s). It is leads, not proof: re-verify current behaviour and say when it shaped a decision.`,
    ...(stack ? { stack } : {}),
    last_runs: runs.map((r) => ({ run_id: r.run_id, mode: r.mode, finished: r.finished, counts: r.counts, not_tested_count: r.not_tested_count, finding_ids: r.finding_ids, stop_reason: r.stop_reason })),
    focus,
    risk_areas: risk,
    learnings,
    false_alarms: alarms.alarms.slice(0, 30).map((a) => ({ id: a.id, area: a.area, symptom: a.symptom, reason: a.reason, source: a.source })),
    previous_findings: { ...(last ? { from_run: last.run_id } : {}), findings: (last?.findings ?? []).slice(0, 25) },
    product_map: { pages: pageCount(map), endpoints: map ? Object.keys(map.api.endpoints).length : 0, ...(map ? { last_run: map.last_run } : {}), uis },
    warnings: [...learned.warnings, ...alarms.warnings],
  };
}
