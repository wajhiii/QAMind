import type { Severity } from "../config.ts";
import { daysBetween, memoryPaths, readMemoryJson, writeMemoryJson } from "./store.ts";

/** Areas with past bugs, scored by frequency x severity x recency (spec 10.1). */

export interface RiskEvent {
  run: string;
  date: string;
  severity: Severity;
  /** Where the event came from: a confirmed finding (the default, written at run finish) or an area the agent flagged mid-run. */
  source?: "finding" | "agent";
  /** Why the agent flagged the area (agent events only). Screened: no secrets or personal data. */
  note?: string;
}

export interface RiskArea {
  /** Display name as the agent wrote it. */
  area: string;
  surface?: string;
  /** Most recent events first; bounded. */
  events: RiskEvent[];
}

export interface RiskFile {
  schema_version: number;
  updated: string;
  areas: RiskArea[];
}

export interface ScoredArea {
  area: string;
  surface?: string;
  score: number;
  occurrences: number;
  worst_severity: Severity;
  last_seen: string;
}

const WEIGHT: Record<Severity, number> = { critical: 10, important: 4, minor: 1 };
const HALF_LIFE_DAYS = 90;
const MAX_EVENTS = 30;
export const MAX_AREAS = 200;

export const areaKey = (area: string): string => area.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function loadRisk(store: string): RiskFile {
  return readMemoryJson<RiskFile>(memoryPaths(store).riskAreas) ?? { schema_version: 1, updated: new Date(0).toISOString(), areas: [] };
}

export interface RiskFinding {
  area: string;
  surface?: string;
  severity: Severity;
}

const isAgentEvent = (e: RiskEvent): boolean => e.source === "agent";

function tidy(file: RiskFile, date: Date): void {
  for (const a of file.areas) a.events = a.events.sort((x, y) => y.date.localeCompare(x.date)).slice(0, MAX_EVENTS);
  file.areas = file.areas.filter((a) => a.events.length > 0).slice(0, MAX_AREAS);
  file.updated = date.toISOString();
}

/**
 * Records this run's findings. Idempotent per run: finding events of the same run id are replaced, never doubled.
 * An area the agent flagged during this run stands down once a finding covers the same area (the finding is the better evidence);
 * otherwise the flag stays, so it is not lost when the run finishes.
 */
export function recordRisk(store: string, runId: string, date: Date, findings: RiskFinding[]): RiskFile {
  const file = loadRisk(store);
  for (const a of file.areas) a.events = a.events.filter((e) => e.run !== runId || isAgentEvent(e));
  for (const f of findings) {
    const key = areaKey(f.area);
    if (!key) continue;
    let entry = file.areas.find((a) => areaKey(a.area) === key);
    if (!entry) file.areas.push((entry = { area: f.area.trim(), ...(f.surface ? { surface: f.surface } : {}), events: [] }));
    entry.events = entry.events.filter((e) => !(e.run === runId && isAgentEvent(e)));
    entry.events.unshift({ run: runId, date: date.toISOString(), severity: f.severity });
  }
  tidy(file, date);
  writeMemoryJson(memoryPaths(store).riskAreas, file as unknown as Record<string, unknown>);
  return file;
}

export interface FlagInput {
  area: string;
  severity: Severity;
  surface?: string;
  note?: string;
}

/**
 * Flags an area as risky for future runs without a confirmed finding (a lead that could not be reproduced twice, a fragile feature).
 * Idempotent per run and area: flagging it again replaces the earlier flag. Returns what is now recorded for the area.
 */
export function flagRisk(store: string, runId: string, date: Date, input: FlagInput): { area: string; events_for_run: RiskEvent[]; replaced: boolean } {
  const key = areaKey(input.area);
  if (!key) throw new Error("A risk area needs a name.");
  const file = loadRisk(store);
  let entry = file.areas.find((a) => areaKey(a.area) === key);
  if (!entry) file.areas.push((entry = { area: input.area.trim(), ...(input.surface ? { surface: input.surface } : {}), events: [] }));
  const before = entry.events.length;
  entry.events = entry.events.filter((e) => !(e.run === runId && isAgentEvent(e)));
  const replaced = entry.events.length < before;
  entry.events.unshift({ run: runId, date: date.toISOString(), severity: input.severity, source: "agent", ...(input.note ? { note: input.note } : {}) });
  tidy(file, date);
  writeMemoryJson(memoryPaths(store).riskAreas, file as unknown as Record<string, unknown>);
  return { area: entry.area, events_for_run: entry.events.filter((e) => e.run === runId), replaced };
}

export function scoreAreas(file: RiskFile, now = new Date()): ScoredArea[] {
  const order: Severity[] = ["critical", "important", "minor"];
  return file.areas
    .filter((a) => a.events.length > 0)
    .map((a) => ({
      area: a.area,
      ...(a.surface ? { surface: a.surface } : {}),
      score: Math.round(a.events.reduce((s, e) => s + WEIGHT[e.severity] * Math.pow(0.5, daysBetween(e.date, now) / HALF_LIFE_DAYS), 0) * 100) / 100,
      occurrences: new Set(a.events.map((e) => e.run)).size,
      worst_severity: a.events.map((e) => e.severity).sort((x, y) => order.indexOf(x) - order.indexOf(y))[0] as Severity,
      last_seen: a.events[0]?.date ?? "",
    }))
    .sort((a, b) => b.score - a.score || a.area.localeCompare(b.area));
}
