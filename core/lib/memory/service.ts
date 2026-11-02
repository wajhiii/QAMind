import path from "node:path";
import type { Severity } from "../config.ts";
import { storeDir } from "../paths.ts";
import { resolveProject } from "../project.ts";
import { finishRun, findMarkerByRunId, startRun } from "../run.ts";
import type { RunSummary, StartOptions, StartResult } from "../run.ts";
import { loadRunContext } from "../runctx.ts";
import type { RunContext } from "../runctx.ts";
import { loadFixState } from "../fix/state.ts";
import { loadMemoryContext, recentRunSummaries } from "./context.ts";
import type { MemoryContext } from "./context.ts";
import { addFalseAlarm, loadFalseAlarms } from "./falsealarms.ts";
import { loadFixLog } from "./fixlog.ts";
import type { FalseAlarmSource } from "./falsealarms.ts";
import { LEARNING_TYPES, adjustLearning, learn, loadLearnings, markApplied } from "./learnings.ts";
import type { LearningType } from "./learnings.ts";
import { knownProjectNames, loadApprovedLessons, proposeLesson, recordLessonUse } from "./lessons.ts";
import type { ProposeResult } from "./lessons.ts";
import { withStoreLock } from "./lock.ts";
import { appendMemoryLog } from "./memorylog.ts";
import { ensureMigrated } from "./migrate.ts";
import { recordObservations } from "./observations.ts";
import type { ObservationInput, ObservationResult } from "./observations.ts";
import { describeChanges, loadMap } from "./productmap.ts";
import type { Changes } from "./productmap.ts";
import { flagRisk, loadRisk, scoreAreas } from "./risk.ts";
import { assertSafeText } from "./store.ts";
import { detectChanges } from "./update.ts";

/**
 * Everything the agent can do with project memory, in one place. The `qamind memory ...` commands and the qa-memory MCP server both
 * call these functions, so the two can never disagree about validation, de-duplication, redaction or the memory formats. Every
 * change happens under the store lock and after the store has been migrated to the current format.
 */

/** A run in progress: the only thing that may write memory, because it names the evidence run and holds the secrets to scrub. */
export interface RunScope {
  kind: "run";
  home: string;
  store: string;
  runId: string;
  runDir: string;
  mode: string;
  ctx: RunContext;
}

/** A project looked up by folder, for reading memory outside a run. */
export interface ProjectScope {
  kind: "project";
  home: string;
  store: string;
  project: { id: string; name: string; root: string };
}

export type Scope = RunScope | ProjectScope;

export function runScope(home: string, runId: string | undefined, env: NodeJS.ProcessEnv = process.env): RunScope {
  const ctx = loadRunContext(home, runId, env);
  ensureMigrated(ctx.marker.store);
  return { kind: "run", home, store: ctx.marker.store, runId: ctx.marker.run_id, runDir: ctx.runDir, mode: ctx.marker.mode, ctx };
}

/** The folder to treat as the project when none is given: an explicit override, then the host's project folder, then where we run. */
export function defaultProjectDir(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
  // A host that leaves `${workspaceFolder}` unexpanded in the server's environment gives a value that is not a folder: it is ignored.
  const ok = (v: string | undefined): string | undefined => (v && v.trim() !== "" && !v.includes("${") ? v : undefined);
  return ok(env["QAMIND_PROJECT_DIR"]) || ok(env["CLAUDE_PROJECT_DIR"]) || ok(env["CURSOR_PROJECT_DIR"]) || cwd;
}

export function projectScope(home: string, opts: { project?: string; env?: NodeJS.ProcessEnv; cwd?: string } = {}): ProjectScope {
  const env = opts.env ?? process.env;
  const root = path.resolve(opts.project ?? defaultProjectDir(env, opts.cwd ?? process.cwd()));
  let info;
  try {
    info = resolveProject(root);
  } catch {
    throw new Error(`The folder ${root} does not exist, so there is no project to read memory for. Pass the project folder.`);
  }
  const store = storeDir(home, info.id);
  ensureMigrated(store);
  return { kind: "project", home, store, project: { id: info.id, name: info.name, root: info.root } };
}

/** A run, if one is named; otherwise the project folder. For reads that are useful both inside and outside a run. */
export function scopeFor(home: string, opts: { run?: string; project?: string; env?: NodeJS.ProcessEnv; cwd?: string }): Scope {
  return opts.run ? runScope(home, opts.run, opts.env) : projectScope(home, opts);
}

const secretsOf = (s: RunScope): string[] => s.ctx.passwords;

// ------------------------------------------------------------------------------------------------ reads

/** What identifies the project a scope is about: a lesson that names it is not generic. */
export function projectNamesOf(scope: Scope): string[] {
  return scope.kind === "run" ? [path.basename(scope.ctx.projectRoot), ...scope.ctx.config.web_uis.map((u) => u.name)] : [scope.project.name, path.basename(scope.project.root)];
}

export function getContext(scope: Scope, limit = 3): MemoryContext & { project?: ProjectScope["project"] } {
  const ctx = loadMemoryContext(scope.store, limit, new Date(), { home: scope.home, projectNames: projectNamesOf(scope) });
  return scope.kind === "project" ? { ...ctx, project: scope.project } : ctx;
}

export type ListWhat = "learnings" | "false-alarms" | "risk" | "map" | "fix-log";

/** One part of memory in full, with each list cut to `limit` entries so the answer stays a size a host will accept. */
export function listMemory(scope: Scope, what: ListWhat, limit = 50): unknown {
  const cut = <T>(items: T[]): { items: T[]; total: number; truncated: boolean } => ({ items: items.slice(0, limit), total: items.length, truncated: items.length > limit });
  if (what === "learnings") {
    const l = loadLearnings(scope.store);
    return { learnings: cut([...l.active].sort((a, b) => b.confidence - a.confidence)), warnings: l.warnings };
  }
  if (what === "false-alarms") {
    const f = loadFalseAlarms(scope.store);
    return { false_alarms: cut(f.alarms), warnings: f.warnings };
  }
  if (what === "risk") return { areas: cut(scoreAreas(loadRisk(scope.store))) };
  if (what === "fix-log") {
    const f = loadFixLog(scope.store);
    return { fix_log: cut([...f.entries].reverse()), warnings: f.warnings };
  }
  const map = loadMap(scope.store);
  if (!map) return { note: "no product map yet" };
  return {
    updated: map.updated,
    last_run: map.last_run,
    roles: map.roles,
    flows: map.flows,
    uis: Object.fromEntries(Object.entries(map.uis).map(([name, ui]) => [name, { url: ui.url, pages: cut(Object.entries(ui.pages).map(([p, info]) => ({ path: p, ...info }))) }])),
    api: { source: map.api.source, endpoints: cut(Object.entries(map.api.endpoints).map(([op, info]) => ({ op, ...info }))) },
  };
}

export interface HistoryRun {
  run_id: string;
  mode: string;
  started: string;
  finished: string;
  duration_s: number;
  counts: RunSummary["counts"];
  journeys?: RunSummary["journeys"];
  fixes?: RunSummary["fixes"];
  coverage: RunSummary["coverage"];
  not_tested_count: number;
  stop_reason: string;
  findings?: RunSummary["findings"];
}

/** The most recent finished runs of the project, newest first. Findings are included only on request (they are the bulky part). */
export function runHistory(scope: Scope, limit = 5, includeFindings = false): { project_store: string; runs: HistoryRun[] } {
  const runs = recentRunSummaries(scope.store, limit).map((r): HistoryRun => ({
    run_id: r.run_id,
    mode: r.mode,
    started: r.started,
    finished: r.finished,
    duration_s: r.duration_s,
    counts: r.counts,
    ...(r.journeys ? { journeys: r.journeys } : {}),
    ...(r.fixes ? { fixes: r.fixes } : {}),
    coverage: r.coverage,
    not_tested_count: r.not_tested_count,
    stop_reason: r.stop_reason,
    ...(includeFindings && r.findings ? { findings: r.findings } : {}),
  }));
  return { project_store: scope.store, runs };
}

// ------------------------------------------------------------------------------------------------ writes (run scope)

export function saveLearning(scope: RunScope, input: { type: LearningType; area: string; text: string; confidence?: number }, now = new Date()) {
  return withStoreLock(scope.store, () => {
    const r = learn(scope.store, { ...input, run: scope.runId }, { knownSecrets: secretsOf(scope), now });
    appendMemoryLog(scope.runDir, { kind: r.action === "created" ? "learning-created" : "learning-merged", id: r.learning.id, text: r.learning.text }, now);
    return { action: r.action, id: r.learning.id, confidence: r.learning.confidence, archived: r.archived.map((a) => a.id), warnings: r.warnings };
  });
}

export function changeLearningConfidence(scope: RunScope, id: string, direction: "confirm" | "contradict", now = new Date()) {
  return withStoreLock(scope.store, () => {
    const r = adjustLearning(scope.store, id, direction, scope.runId, now);
    appendMemoryLog(scope.runDir, { kind: direction === "confirm" ? "learning-merged" : "learning-contradicted", id: r.learning.id, text: r.learning.text }, now);
    return { action: direction === "confirm" ? "confirmed" : r.archived ? "contradicted-and-archived" : "contradicted", id: r.learning.id, confidence: r.learning.confidence };
  });
}

/** Records learnings you used and false alarms you skipped. Accepts only ids that exist, and records nothing if any does not. */
export function recordApplied(scope: RunScope, ids: string[], now = new Date()) {
  return withStoreLock(scope.store, () => {
    const learnings = loadLearnings(scope.store, now).active;
    const alarms = loadFalseAlarms(scope.store, now).alarms;
    // Approved global lessons are cited the same way, but only the ones a run is actually given (approved, and still generic here).
    const globals = loadApprovedLessons(scope.home, { projectNames: projectNamesOf(scope) }).lessons;
    const unknown = ids.filter((id) => !learnings.some((l) => l.id === id) && !alarms.some((a) => a.id === id) && !globals.some((g) => g.id === id));
    if (unknown.length) throw new Error(`These ids do not exist in this project's memory or in the approved global lessons: ${unknown.join(", ")}. Cite only what the memory context gave you. Nothing was recorded.`);
    const applied = markApplied(scope.store, ids.filter((i) => learnings.some((l) => l.id === i)), now);
    const usedGlobals = recordLessonUse(scope.home, ids.filter((i) => globals.some((g) => g.id === i)), now).recorded;
    for (const id of usedGlobals) appendMemoryLog(scope.runDir, { kind: "global-lesson-applied", id, text: globals.find((g) => g.id === id)?.text ?? "" }, now);
    for (const l of applied.applied) appendMemoryLog(scope.runDir, { kind: "learning-applied", id: l.id, text: `(${l.area}) ${l.text}` }, now);
    for (const id of ids.filter((i) => alarms.some((a) => a.id === i))) {
      const a = alarms.find((x) => x.id === id);
      if (a) appendMemoryLog(scope.runDir, { kind: "false-alarm-skipped", id, text: a.symptom }, now);
    }
    return { applied: ids };
  });
}

export function markFalseAlarm(scope: RunScope, input: { area: string; symptom: string; reason: string; source?: FalseAlarmSource }, now = new Date()) {
  return withStoreLock(scope.store, () => {
    const r = addFalseAlarm(scope.store, { ...input, run: scope.runId }, { knownSecrets: secretsOf(scope), now });
    if (r.action === "created") appendMemoryLog(scope.runDir, { kind: "false-alarm-created", id: r.alarm.id, text: r.alarm.symptom }, now);
    return { action: r.action, id: r.alarm.id, warnings: r.warnings };
  });
}

export function updateRisk(scope: RunScope, input: { area: string; severity: Severity; surface?: string; note?: string }, now = new Date()) {
  return withStoreLock(scope.store, () => {
    const area = input.area.replace(/\s+/g, " ").trim();
    const note = input.note?.replace(/\s+/g, " ").trim();
    assertSafeText("this risk area", `${area} ${input.surface ?? ""} ${note ?? ""}`, secretsOf(scope));
    const r = flagRisk(scope.store, scope.runId, now, { area, severity: input.severity, ...(input.surface ? { surface: input.surface } : {}), ...(note ? { note } : {}) });
    appendMemoryLog(scope.runDir, { kind: "risk-flagged", id: r.area, text: `${r.area} (${input.severity})${note ? `: ${note}` : ""}` }, now);
    const top = scoreAreas(loadRisk(scope.store), now).find((a) => a.area === r.area);
    return { area: r.area, severity: input.severity, replaced_earlier_flag: r.replaced, score_now: top?.score ?? 0, note: "Confirmed findings are recorded as risk automatically at run_finish and then take over from this flag for this run." };
  });
}

export interface ProductMapUpdate extends ObservationResult {
  /** What differs from the project's product map so far (the same text the reports will show). */
  changes_so_far: { first_run: boolean; technical: string[] };
}

/** Records pages (and endpoints, when there is no OpenAPI spec) this run saw. The map itself is updated at run finish. */
export function updateProductMap(scope: RunScope, input: ObservationInput, now = new Date()): ProductMapUpdate {
  return withStoreLock(scope.store, () => {
    const cfg = scope.ctx.config;
    const defaultUi = cfg.web_uis[0]?.name ?? "Web screens";
    const result = recordObservations(scope.runDir, input, { defaultUi, knownSecrets: secretsOf(scope) });
    const changes: Changes = detectChanges({ store: scope.store, runDir: scope.runDir, runId: scope.runId, mode: scope.mode, now, roles: cfg.roles.map((r) => r.name), uiUrls: Object.fromEntries(cfg.web_uis.map((u) => [u.name, u.url])) });
    return { ...result, changes_so_far: { first_run: changes.first_run, technical: describeChanges(changes).technical } };
  });
}

export function proposeGlobalLesson(scope: RunScope, input: { text: string; reason: string; area?: string }, now = new Date()): ProposeResult {
  return proposeLesson(scope.home, input, { projectNames: knownProjectNames(scope.home, projectNamesOf(scope)), knownSecrets: secretsOf(scope), run: scope.runId, now });
}

// ------------------------------------------------------------------------------------------------ run lifecycle

export function startRunTracked(opts: StartOptions): StartResult {
  return startRun(opts);
}

export function finishRunTracked(home: string, runId: string, opts: { stopReason?: string; cost?: string; now?: Date } = {}): RunSummary {
  const marker = findMarkerByRunId(home, runId);
  if (!marker) throw new Error(`No run ${runId} found in the user store (already finished, or wrong id).`);
  // A fix run must not end with a half-done change in the project, or with fixes nobody ran the whole test suite after.
  const fix = loadFixState(marker.run_dir);
  const open = fix?.attempts.find((a) => a.status === "in-progress");
  if (open) throw new Error(`${open.issue} is still being fixed. Commit it (fix_commit), undo it (fix_revert) or give it up (fix_defer) first: finishing now would leave uncommitted changes in the project.`);
  if (fix && !fix.after && fix.attempts.some((a) => a.status === "verified" || a.status === "best-effort")) throw new Error("Fixes were committed but the full test suite was not run afterwards. Call fix_run_suite, re-check the affected flows, write the final reports, then finish.");
  return withStoreLock(marker.store, () => finishRun({ home, runId, ...opts }));
}

export { LEARNING_TYPES };
