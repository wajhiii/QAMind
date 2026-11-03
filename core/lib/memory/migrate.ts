import fs from "node:fs";
import path from "node:path";
import { parseUsage } from "../budget.ts";
import { ensureDir } from "../fsutil.ts";
import { storeSubdirs } from "../paths.ts";
import { withStoreLock } from "./lock.ts";
import { MEMORY_SCHEMA, MemoryTooNewError, memoryPaths } from "./store.ts";

/**
 * Memory format migrations (spec 13.17). Every memory file carries a schema version. When a file is older than this QAMind
 * understands, it is migrated after a backup into `<store>/backups/`, and what changed is logged. Nothing is dropped silently:
 * a migration that loses a field it did not declare is refused before anything is written. A file newer than this QAMind is
 * never touched (the whole store is refused, so memory is never half-updated).
 *
 * Format 2 (QAMind 0.7.6) is the first real migration: run summaries gain a structured `usage` block. Every other file is unchanged by it and only takes the new version
 * number, so a store is always at one version. A test migrates a real format-1 store written by QAMind 0.7.5 (`tests/core/fixtures/memory-v1`); the framework is also tested with synthetic ones.
 */
export type MemoryFileKind = "product-map" | "risk-areas" | "stack" | "run-summary" | "learnings" | "false-alarms" | "fix-log" | "bugs" | "feedback" | "test-bank";

export interface Migration {
  /** Stable id, recorded in the log. */
  id: string;
  file: MemoryFileKind;
  from: number;
  to: number;
  describe: string;
  /** Called once per JSON file, or once per record of a JSON Lines file. Keep every field you do not deliberately change. */
  up(value: Record<string, unknown>): Record<string, unknown>;
  /** Top-level fields this migration removes on purpose. Anything else that disappears aborts the migration. */
  removes?: string[];
}

const unchanged = (file: MemoryFileKind): Migration => ({ id: `${file}-1-to-2`, file, from: 1, to: 2, describe: `${file}: no change to the content; the version number moves to 2 so that a store is at one version`, up: (v) => v });

export const MIGRATIONS: Migration[] = [
  {
    id: "run-summary-1-to-2",
    file: "run-summary",
    from: 1,
    to: 2,
    describe: "run summaries: add `usage` (the measured duration, and the cost or tokens when the old `cost` text gave them); the old `cost` text is kept as it was",
    up: (v) => ({ ...v, usage: v["usage"] ?? parseUsage(typeof v["cost"] === "string" ? (v["cost"] as string) : undefined, typeof v["duration_s"] === "number" ? (v["duration_s"] as number) : 0) }),
  },
  unchanged("product-map"),
  unchanged("risk-areas"),
  unchanged("stack"),
  unchanged("learnings"),
  unchanged("false-alarms"),
  unchanged("fix-log"),
];

interface FileRef {
  kind: MemoryFileKind;
  file: string;
  jsonl: boolean;
}

export interface MigrationReport {
  migrated: Array<{ file: string; from: number; to: number; migrations: string[] }>;
  /** Folder holding the copies of every file that was changed, taken before the first write. */
  backup?: string;
}

function memoryFiles(store: string): FileRef[] {
  const p = memoryPaths(store);
  const refs: FileRef[] = [
    { kind: "product-map", file: p.productMap, jsonl: false },
    { kind: "risk-areas", file: p.riskAreas, jsonl: false },
    { kind: "stack", file: p.stack, jsonl: false },
    { kind: "learnings", file: p.learnings, jsonl: true },
    { kind: "false-alarms", file: p.falseAlarms, jsonl: true },
    { kind: "fix-log", file: p.fixLog, jsonl: true },
    // Phase 7.7 files were never written in format 1, so nothing migrates them yet; they are listed so a store from a newer QAMind is refused as a whole.
    { kind: "bugs", file: p.bugs, jsonl: true },
    { kind: "feedback", file: p.feedback, jsonl: true },
    { kind: "test-bank", file: p.bank, jsonl: true },
  ];
  if (fs.existsSync(p.runs)) for (const f of fs.readdirSync(p.runs).sort()) if (f.endsWith(".json")) refs.push({ kind: "run-summary", file: path.join(p.runs, f), jsonl: false });
  return refs.filter((r) => fs.existsSync(r.file));
}

function jsonVersion(file: string): number | undefined {
  try {
    const v = (JSON.parse(fs.readFileSync(file, "utf8")) as { schema_version?: unknown }).schema_version;
    return typeof v === "number" ? v : undefined;
  } catch {
    return undefined; // unreadable files are the readers' business, not the migrator's
  }
}

function headerOf(line: string): { schema_version?: unknown; kind?: unknown } | undefined {
  try {
    const parsed = JSON.parse(line) as { _meta?: { schema_version?: unknown; kind?: unknown } };
    return parsed && typeof parsed === "object" && "_meta" in parsed ? parsed._meta : undefined;
  } catch {
    return undefined;
  }
}

function jsonlVersion(file: string): number | undefined {
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const v = headerOf(line)?.schema_version;
    return typeof v === "number" ? v : undefined; // only the first real line can be the header
  }
  return undefined;
}

function chain(kind: MemoryFileKind, from: number, target: number, all: Migration[]): Migration[] {
  const steps: Migration[] = [];
  let v = from;
  while (v < target) {
    const m = all.find((x) => x.file === kind && x.from === v);
    if (!m) throw new Error(`No migration from ${kind} schema ${v} towards ${target}. Update QAMind, or restore the file from the store's backups folder.`);
    steps.push(m);
    v = m.to;
  }
  return steps;
}

function applySteps(value: Record<string, unknown>, steps: Migration[], where: string): Record<string, unknown> {
  let cur = value;
  for (const m of steps) {
    const next = m.up({ ...cur });
    const lost = Object.keys(cur).filter((k) => !(k in next) && !(m.removes ?? []).includes(k) && k !== "schema_version");
    if (lost.length) throw new Error(`Migration ${m.id} would silently drop ${lost.join(", ")} from ${where}. Nothing was changed.`);
    cur = next;
  }
  return cur;
}

const stampOf = (now: Date): string => now.toISOString().replace(/[:.]/g, "-");

/**
 * Brings every memory file of a store up to the current format. Safe to call often: it reads only the version headers when there
 * is nothing to do. Throws MemoryTooNewError (touching nothing) if any file is newer than this QAMind understands.
 */
export function migrateStore(store: string, opts: { migrations?: Migration[]; target?: number; now?: Date } = {}): MigrationReport {
  const all = opts.migrations ?? MIGRATIONS;
  const target = opts.target ?? MEMORY_SCHEMA;
  const now = opts.now ?? new Date();

  const pending: Array<{ ref: FileRef; from: number; steps: Migration[] }> = [];
  for (const ref of memoryFiles(store)) {
    const v = ref.jsonl ? jsonlVersion(ref.file) : jsonVersion(ref.file);
    if (v === undefined) continue; // no version recorded (a hand-written file): treated as current, as the readers do
    if (v > target) throw new MemoryTooNewError(ref.file, v);
    if (v < target) pending.push({ ref, from: v, steps: chain(ref.kind, v, target, all) });
  }
  if (pending.length === 0) return { migrated: [] };

  // Compute every new file first, so a refused migration changes nothing.
  const next = new Map<string, string>();
  for (const { ref, steps } of pending) {
    const to = steps[steps.length - 1]?.to ?? target;
    const where = path.basename(ref.file);
    if (!ref.jsonl) {
      const value = JSON.parse(fs.readFileSync(ref.file, "utf8")) as Record<string, unknown>;
      next.set(ref.file, JSON.stringify({ ...applySteps(value, steps, where), schema_version: to }, null, 2) + "\n");
      continue;
    }
    let sawHeader = false;
    const out = fs
      .readFileSync(ref.file, "utf8")
      .split(/\r?\n/)
      .map((raw) => {
        const line = raw.trim();
        if (!line || line.startsWith("#")) return raw;
        if (!sawHeader) {
          sawHeader = true;
          const h = headerOf(line);
          if (h) return JSON.stringify({ _meta: { ...h, schema_version: to } });
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          return raw; // not valid JSON: kept exactly as written, as the readers do
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw;
        return JSON.stringify(applySteps(parsed as Record<string, unknown>, steps, where));
      });
    next.set(ref.file, out.join("\n"));
  }

  const lowest = Math.min(...pending.map((p) => p.from));
  const backup = path.join(storeSubdirs(store).backups, `${stampOf(now)}-schema-${lowest}-to-${target}`);
  for (const { ref } of pending) {
    const dest = path.join(backup, path.relative(store, ref.file));
    ensureDir(path.dirname(dest));
    fs.copyFileSync(ref.file, dest);
  }
  const log: string[] = [];
  const report: MigrationReport = { migrated: [], backup };
  for (const { ref, from, steps } of pending) {
    const tmp = `${ref.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, next.get(ref.file) as string, "utf8");
    fs.renameSync(tmp, ref.file);
    const entry = { file: path.relative(store, ref.file).split(path.sep).join("/"), from, to: steps[steps.length - 1]?.to ?? target, migrations: steps.map((s) => s.id) };
    report.migrated.push(entry);
    log.push(JSON.stringify({ at: now.toISOString(), ...entry, backup: path.relative(store, backup).split(path.sep).join("/"), describe: steps.map((s) => s.describe) }));
  }
  fs.appendFileSync(path.join(storeSubdirs(store).backups, "migrations.log.jsonl"), `${log.join("\n")}\n`, "utf8");
  return report;
}

const checked = new Set<string>();

/** Migrates a store once per process (under the store lock), then does nothing: cheap to call from every entry point. */
export function ensureMigrated(store: string): MigrationReport {
  if (checked.has(store)) return { migrated: [] };
  const report = withStoreLock(store, () => migrateStore(store));
  checked.add(store);
  return report;
}

/** For tests: forget which stores were already checked. */
export function resetMigrationMemo(): void {
  checked.clear();
}
