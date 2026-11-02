import type { Severity } from "../config.ts";
import { readRunData } from "../report.ts";
import { loadFalseAlarms, markFalseAlarmsSeen } from "./falsealarms.ts";
import { learn, loadLearnings } from "./learnings.ts";
import type { HealthResult } from "../report.ts";
import { readMemoryLog } from "./memorylog.ts";
import { applyObserved, computeChanges, describeChanges, hasChanges, loadChanges, loadMap, readObserved, saveChanges, saveMap } from "./productmap.ts";
import type { Changes } from "./productmap.ts";
import { loadRisk, recordRisk, scoreAreas } from "./risk.ts";

export interface RunMemoryInput {
  store: string;
  runDir: string;
  runId: string;
  mode: string;
  now: Date;
  roles: string[];
  uiUrls: Record<string, string>;
}

/**
 * Compute what changed since the last run WITHOUT touching memory (used when the reports are built, before the run finishes).
 * The result is saved in the run folder so a later re-render shows the same thing even after memory has been updated.
 */
export function detectChanges(input: RunMemoryInput): Changes {
  const data = readRunData(input.runDir);
  const observed = readObserved(input.runDir, { roles: input.roles, uiUrls: input.uiUrls, flows: data.meta?.critical_flows ?? [], coverage: data.coverage });
  const changes = computeChanges(loadMap(input.store), observed, input.mode);
  saveChanges(input.runDir, changes);
  return changes;
}

/** Apply a finished run to memory: product map, risk areas, and the use counts of skipped false alarms. Returns plain lines for "what I learned". */
export function applyRunToMemory(input: RunMemoryInput): { updated: string[]; changes: Changes } {
  // Refuse up front if ANY memory file is newer than this QAMind, so a run never half-updates memory.
  loadMap(input.store);
  loadRisk(input.store);
  loadLearnings(input.store);
  loadFalseAlarms(input.store);
  const data = readRunData(input.runDir);
  const changes = loadChanges(input.runDir) ?? detectChanges(input);
  const observed = readObserved(input.runDir, { roles: input.roles, uiUrls: input.uiUrls, flows: data.meta?.critical_flows ?? [], coverage: data.coverage });
  const updated: string[] = [];

  const map = applyObserved(loadMap(input.store), observed, input.runId, input.mode, input.now);
  saveMap(input.store, map);
  const pageTotal = Object.values(map.uis).reduce((n, u) => n + Object.keys(u.pages).length, 0);
  updated.push(`Product map: ${pageTotal} page(s) and ${Object.keys(map.api.endpoints).length} endpoint(s) known${hasChanges(changes) ? `; ${describeChanges(changes).technical.length} change(s) since the last run` : ""}.`);
  if (observed.pages.length === 0) updated.push("No pages were recorded for this run (data/pages.json), so the map learned no pages.");

  const open = data.findings.filter((f) => f.fix_status !== "fixed-verified");
  const risk = recordRisk(input.store, input.runId, input.now, open.map((f) => ({ area: f.area, surface: f.surface, severity: f.severity as Severity })));
  const top = scoreAreas(risk, input.now)[0];
  updated.push(`Risk areas: ${risk.areas.length} area(s) tracked${top ? `; highest now: ${top.area} (score ${top.score})` : ""}.`);

  const skipped = readMemoryLog(input.runDir).filter((e) => e.kind === "false-alarm-skipped").map((e) => e.id);
  const touched = markFalseAlarmsSeen(input.store, skipped, input.now);
  if (touched.length) updated.push(`Known false alarms skipped: ${touched.join(", ")}.`);

  const quirks = recordEnvQuirks(input.store, input.runId, data.health, input.now);
  if (quirks > 0) updated.push(`Environment quirks noted: ${quirks} (slow or flaky parts of the test environment), so the next run waits and retries where it matters.`);

  const log = readMemoryLog(input.runDir);
  const count = (k: string) => log.filter((e) => e.kind === k).length;
  if (count("learning-created") + count("learning-merged") + count("learning-applied") + count("false-alarm-created") > 0) {
    updated.push(`Learnings: ${count("learning-created")} new, ${count("learning-merged")} confirmed again, ${count("learning-applied")} applied; false alarms recorded: ${count("false-alarm-created")}.`);
  } else updated.push("No learnings were saved this run.");
  return { updated, changes };
}

export function knownFalseAlarmIds(store: string): string[] {
  return loadFalseAlarms(store).alarms.map((a) => a.id);
}

/**
 * A part of the environment that answered only on the second try, or answered slowly, is an `env-quirk` learning (spec 13.1), saved without the agent having to
 * notice: the check passed, but the next run should know. Near copies merge into the existing learning (its confidence rises each time it is seen again).
 */
export function recordEnvQuirks(store: string, runId: string, health: HealthResult | undefined, now: Date): number {
  let n = 0;
  for (const c of health?.checks ?? []) {
    const text = c.flaky
      ? `${c.name}: failed on the first try and answered on the second, so expect an occasional first-request failure and retry before calling it down.`
      : c.slow
        ? `${c.name} answered slowly (${Math.round((c.ms ?? 0) / 100) / 10} s), so give it time before treating a wait as a failure.`
        : undefined;
    if (!text) continue;
    try {
      learn(store, { type: "env-quirk", area: "Environment", text, run: runId, confidence: 4 }, { now });
      n++;
    } catch {
      /* a quirk that cannot be saved (for example, text the screen refuses) must never stop a run from finishing */
    }
  }
  return n;
}
