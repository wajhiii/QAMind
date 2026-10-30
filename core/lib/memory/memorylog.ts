import path from "node:path";
import { readJson, writeJson } from "../fsutil.ts";

/** What memory did during a run, so the reports can say it ("Applied learning L-012") and the agent cannot cite what does not exist. */
export type MemoryLogKind = "learning-created" | "learning-merged" | "learning-applied" | "learning-contradicted" | "false-alarm-created" | "false-alarm-skipped";

export interface MemoryLogEntry {
  kind: MemoryLogKind;
  id: string;
  /** The learning's text or the false alarm's symptom (already screened: no secrets or personal data). */
  text: string;
  at: string;
}

const file = (runDir: string) => path.join(runDir, "data", "memory-log.json");

export function readMemoryLog(runDir: string): MemoryLogEntry[] {
  const v = readJson<unknown>(file(runDir));
  return Array.isArray(v) ? (v as MemoryLogEntry[]) : [];
}

export function appendMemoryLog(runDir: string, entry: Omit<MemoryLogEntry, "at">, now = new Date()): void {
  const all = readMemoryLog(runDir);
  all.push({ ...entry, at: now.toISOString() });
  writeJson(file(runDir), all);
}
