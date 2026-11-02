import path from "node:path";
import { ensureDir, readJson, writeJson } from "../lib/fsutil.ts";
import { withStoreLock } from "../lib/memory/lock.ts";

/**
 * Auto-QA settings (spec 9.5). One small file per project in the user's store (`<store>/auto.json`) and one global default (`<home>/auto.json`);
 * the project's setting wins over the global one, and **the default is OFF** until the user turns it on. `QAMIND_AUTO=0` switches it off for a
 * session whatever the files say (CI, or a hurry). These files are the same on every host.
 */
export const AUTO_SCHEMA = 1;
export const AUTO_MODES = ["diff", "quick", "full", "fix", "ask"] as const;
export type AutoMode = (typeof AUTO_MODES)[number];

export const DEFAULT_MODE: AutoMode = "diff";
export const DEFAULT_COOLDOWN_MINUTES = 3;
export const DEFAULT_TIME_BUDGET_MINUTES = 5;
/** Changes to these do not trigger QA: documentation and lock files (spec 9.5 rule 5). */
export const DEFAULT_IGNORE: readonly string[] = ["*.md", "docs/**", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "composer.lock", "Gemfile.lock", "poetry.lock", "Pipfile.lock", "go.sum", "Cargo.lock"];

export interface AutoSettings {
  schema_version: number;
  enabled?: boolean;
  mode?: AutoMode;
  /** ISO time until which auto-QA is paused (it switches itself back on). */
  paused_until?: string;
  cooldown_minutes?: number;
  time_budget_minutes?: number;
  /** Globs of files whose changes do not trigger QA. Replaces the default list when present. */
  ignore?: string[];
}

export interface AutoEffective {
  enabled: boolean;
  /** Where the on/off answer comes from, in plain words. */
  why: string;
  source: "env" | "pause" | "project" | "global" | "default";
  mode: AutoMode;
  cooldown_minutes: number;
  time_budget_minutes: number;
  ignore: string[];
  paused_until?: string;
  /** A settings file was written by a newer QAMind: auto-QA stays off until QAMind is updated. */
  too_new?: string;
}

export const projectAutoFile = (store: string): string => path.join(store, "auto.json");
export const globalAutoFile = (home: string): string => path.join(home, "auto.json");

export class AutoTooNewError extends Error {
  constructor(file: string, found: number) {
    super(`${path.basename(file)} was written by a newer QAMind (auto-QA settings schema ${found}, this QAMind understands ${AUTO_SCHEMA}). Update QAMind before changing auto-QA settings.`);
  }
}

/** A file that cannot be parsed counts as unreadable (auto-QA stays at its defaults) instead of breaking every hook and command. */
export function readJsonTolerant(file: string): unknown {
  try {
    return readJson<unknown>(file);
  } catch {
    return null;
  }
}

export function readAutoFile(file: string): { settings: AutoSettings; too_new?: number; unreadable?: boolean } {
  const raw = readJsonTolerant(file);
  if (raw === undefined) return { settings: { schema_version: AUTO_SCHEMA } };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { settings: { schema_version: AUTO_SCHEMA }, unreadable: true };
  const o = raw as Record<string, unknown>;
  const version = typeof o["schema_version"] === "number" ? o["schema_version"] : AUTO_SCHEMA;
  if (version > AUTO_SCHEMA) return { settings: { schema_version: version }, too_new: version };
  const s: AutoSettings = { schema_version: version };
  if (typeof o["enabled"] === "boolean") s.enabled = o["enabled"];
  if (typeof o["mode"] === "string" && (AUTO_MODES as readonly string[]).includes(o["mode"])) s.mode = o["mode"] as AutoMode;
  if (typeof o["paused_until"] === "string" && !Number.isNaN(Date.parse(o["paused_until"]))) s.paused_until = o["paused_until"];
  if (typeof o["cooldown_minutes"] === "number" && o["cooldown_minutes"] >= 0) s.cooldown_minutes = o["cooldown_minutes"];
  if (typeof o["time_budget_minutes"] === "number" && o["time_budget_minutes"] > 0) s.time_budget_minutes = o["time_budget_minutes"];
  if (Array.isArray(o["ignore"])) s.ignore = o["ignore"].filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 200);
  return { settings: s };
}

const envOff = (env: NodeJS.ProcessEnv): boolean => /^(0|false|off)$/i.test((env["QAMIND_AUTO"] ?? "").trim());

/** What actually applies now: the environment, then a pause, then the project, then the global default, then OFF. */
export function resolveEffective(project: AutoSettings, global: AutoSettings, env: NodeJS.ProcessEnv, now: Date, tooNew?: string): AutoEffective {
  const base = {
    mode: project.mode ?? global.mode ?? DEFAULT_MODE,
    cooldown_minutes: project.cooldown_minutes ?? global.cooldown_minutes ?? DEFAULT_COOLDOWN_MINUTES,
    time_budget_minutes: project.time_budget_minutes ?? global.time_budget_minutes ?? DEFAULT_TIME_BUDGET_MINUTES,
    ignore: project.ignore ?? global.ignore ?? [...DEFAULT_IGNORE],
    ...(tooNew ? { too_new: tooNew } : {}),
  };
  if (tooNew) return { ...base, enabled: false, source: "default", why: `auto-QA is off: ${tooNew}` };
  if (envOff(env)) return { ...base, enabled: false, source: "env", why: "QAMIND_AUTO=0 is set in the environment" };
  const pausedUntil = [project.paused_until, global.paused_until].filter((x): x is string => !!x && Date.parse(x) > now.getTime()).sort().pop();
  if (pausedUntil) return { ...base, enabled: false, source: "pause", why: `paused until ${pausedUntil}`, paused_until: pausedUntil };
  if (project.enabled !== undefined) return { ...base, enabled: project.enabled, source: "project", why: project.enabled ? "turned on for this project" : "turned off for this project" };
  if (global.enabled !== undefined) return { ...base, enabled: global.enabled, source: "global", why: global.enabled ? "turned on globally" : "turned off globally" };
  return { ...base, enabled: false, source: "default", why: "never turned on (auto-QA is off by default)" };
}

/** `30m`, `1h`, `2d` (or `90s`) in milliseconds. */
export function parseDuration(text: string): number {
  const m = /^(\d+)\s*(s|m|h|d)$/i.exec(text.trim());
  if (!m) throw new Error(`"${text}" is not a duration. Use a number and a unit: 30m, 1h, 2d.`);
  const n = Number(m[1]);
  const ms = n * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[(m[2] as string).toLowerCase() as "s" | "m" | "h" | "d"];
  if (ms < 60_000 || ms > 14 * 86_400_000) throw new Error("A pause is between 1 minute and 14 days.");
  return ms;
}

function validate(patch: Partial<AutoSettings>): void {
  if (patch.mode !== undefined && !(AUTO_MODES as readonly string[]).includes(patch.mode)) throw new Error(`mode must be one of ${AUTO_MODES.join(", ")}.`);
  if (patch.cooldown_minutes !== undefined && !(patch.cooldown_minutes >= 0 && patch.cooldown_minutes <= 1440)) throw new Error("cooldown_minutes must be from 0 to 1440.");
  if (patch.time_budget_minutes !== undefined && !(patch.time_budget_minutes >= 1 && patch.time_budget_minutes <= 120)) throw new Error("time_budget_minutes must be from 1 to 120.");
  if (patch.ignore !== undefined && (patch.ignore.length > 100 || patch.ignore.some((g) => g.length === 0 || g.length > 200 || g.split("/").includes("..")))) throw new Error("ignore is a list of up to 100 globs relative to the project (no ..).");
}

/** Change one settings file, atomically and under a lock. `undefined` values remove a key. Refuses a file written by a newer QAMind. */
export function updateAutoFile(file: string, lockDir: string, patch: { [K in keyof Omit<AutoSettings, "schema_version">]?: AutoSettings[K] | undefined }): AutoSettings {
  validate(patch as Partial<AutoSettings>);
  ensureDir(path.dirname(file));
  return withStoreLock(lockDir, () => {
    const cur = readAutoFile(file);
    if (cur.too_new) throw new AutoTooNewError(file, cur.too_new);
    const next: Record<string, unknown> = { ...cur.settings, schema_version: AUTO_SCHEMA };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    writeJson(file, next);
    return next as unknown as AutoSettings;
  });
}
