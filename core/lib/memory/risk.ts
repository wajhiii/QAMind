import type { Severity } from "../config.ts";
import { daysBetween, memoryPaths, readMemoryJson, writeMemoryJson } from "./store.ts";

/** Areas with past bugs, scored by frequency x severity x recency (spec 10.1). */

export interface RiskEvent {
  run: string;
  date: string;
  severity: Severity;
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

/** Records this run's findings. Idempotent per run: events of the same run id are replaced, never doubled. */
export function recordRisk(store: string, runId: string, date: Date, findings: RiskFinding[]): RiskFile {
  const file = loadRisk(store);
  for (const a of file.areas) a.events = a.events.filter((e) => e.run !== runId);
  for (const f of findings) {
    const key = areaKey(f.area);
    if (!key) continue;
    let entry = file.areas.find((a) => areaKey(a.area) === key);
    if (!entry) file.areas.push((entry = { area: f.area.trim(), ...(f.surface ? { surface: f.surface } : {}), events: [] }));
    entry.events.unshift({ run: runId, date: date.toISOString(), severity: f.severity });
  }
  for (const a of file.areas) a.events = a.events.sort((x, y) => y.date.localeCompare(x.date)).slice(0, MAX_EVENTS);
  file.areas = file.areas.filter((a) => a.events.length > 0).slice(0, MAX_AREAS);
  file.updated = date.toISOString();
  writeMemoryJson(memoryPaths(store).riskAreas, file as unknown as Record<string, unknown>);
  return file;
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
