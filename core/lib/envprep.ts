import path from "node:path";
import type { QamindConfig, SetupSettings } from "./config.ts";
import { ensureDir, readJson, writeJson } from "./fsutil.ts";
import { runShell, tailOf } from "./fix/testrun.ts";
import { contextFrom, maskText } from "./privacy.ts";
import { classifyUrl, matchesPattern, parseUrl } from "./urlpolicy.ts";

/**
 * Test data setup and reset (spec 13.1): an optional snapshot, reset and seed before testing (when `setup.run_before` says so) and the snapshot's restore when the run
 * ends. The commands are the user's own and run in the project folder, so the only safety QAMind can add is to refuse a command that names a production address, to
 * stop each one at a time limit, and to record what ran. A failing step is an environment problem: nothing is tested on top of a half-reset environment.
 */
export type PrepStepName = "snapshot" | "reset" | "seed" | "restore";

export interface PrepStep {
  name: PrepStepName;
  /** The command as configured (never contains secrets: it is the user's own line, and its output is masked). */
  command: string;
  ok: boolean;
  /** Not run, with the reason (a production address in the command). */
  refused?: string;
  exit_code: number | null;
  timed_out: boolean;
  duration_s: number;
  tail: string;
}

export interface EnvPrep {
  schema_version: number;
  at: string;
  /** Whether anything was configured to run for this run, and why or why not. */
  ran: boolean;
  why: string;
  steps: PrepStep[];
  snapshot_taken: boolean;
  ok: boolean;
  restore?: PrepStep;
}

export const prepFile = (runDir: string): string => path.join(runDir, "data", "env-prep.json");
export const readPrep = (runDir: string): EnvPrep | undefined => readJson<EnvPrep>(prepFile(runDir));

const hasCommands = (s: SetupSettings): boolean => !!(s.seed_command || s.reset_command || s.snapshot_command);

/** Does `setup.run_before` ask for the preparation in this run? Auto-QA and CI runs count as the mode they run in. */
export function shouldPrepare(setup: SetupSettings, mode: string): { run: boolean; why: string } {
  if (!hasCommands(setup)) return { run: false, why: "no setup commands are configured" };
  if (setup.run_before === "never") return { run: false, why: "setup.run_before is never" };
  if (setup.run_before === "full_runs" && mode !== "full") return { run: false, why: `setup.run_before is full_runs and this is a ${mode} run` };
  return { run: true, why: `setup.run_before is ${setup.run_before}` };
}

/** Why a configured command must not run: it names a production address. Returns undefined when it is fine. */
export function commandProblem(command: string, config: Pick<QamindConfig, "security">): string | undefined {
  const lower = command.toLowerCase();
  for (const pattern of config.security.blocked_production_patterns) {
    const bare = pattern.toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\*/g, "").replace(/^\.+|\/+$/g, "");
    if (bare.length >= 4 && lower.includes(bare)) return `it mentions "${pattern}", which is listed as production`;
  }
  for (const m of command.matchAll(/https?:\/\/[^\s"'<>)]+/gi)) {
    const u = parseUrl(m[0]);
    if (!u) continue;
    if (config.security.blocked_production_patterns.some((p) => matchesPattern(u, p))) return `it mentions ${u.origin}, which is listed as production`;
    const v = classifyUrl(m[0], config.security);
    if (v.verdict === "blocked") return `it mentions ${u.origin}: ${v.reason}`;
  }
  return undefined;
}

async function step(name: PrepStepName, command: string, o: { config: QamindConfig; cwd: string; redact?: (t: string) => string }): Promise<PrepStep> {
  const problem = commandProblem(command, o.config);
  if (problem) return { name, command: maskText(command, contextFrom(o.config)).text, ok: false, refused: `Not run: ${problem}. QAMind never runs a setup command against production.`, exit_code: null, timed_out: false, duration_s: 0, tail: "" };
  const r = await runShell(command, { cwd: o.cwd, timeoutMs: o.config.setup.timeout_s * 1000, tailChars: 1500, ...(o.redact ? { redact: o.redact } : {}) });
  // Credentials are removed by `redact`; a seed script that prints the customers it made must not put them in the run folder either.
  const ctx = contextFrom(o.config);
  const tail = maskText(r.timed_out ? `${r.output_tail}\n(stopped after ${o.config.setup.timeout_s} seconds)`.trim() : r.output_tail, ctx).text;
  return { name, command: maskText(command, ctx).text, ok: r.passed, exit_code: r.exit_code, timed_out: r.timed_out, duration_s: r.duration_s, tail };
}

export interface PrepOptions {
  config: QamindConfig;
  projectRoot: string;
  runDir: string;
  mode: string;
  redact?: (t: string) => string;
  now?: Date;
}

/** Snapshot, reset, seed, in that order, when configured and asked for; stops at the first failure. Always writes `data/env-prep.json`. */
export async function prepareEnvironment(o: PrepOptions): Promise<EnvPrep> {
  const decision = shouldPrepare(o.config.setup, o.mode);
  const prep: EnvPrep = { schema_version: 1, at: (o.now ?? new Date()).toISOString(), ran: decision.run, why: decision.why, steps: [], snapshot_taken: false, ok: true };
  if (decision.run) {
    const plan: Array<[PrepStepName, string | undefined]> = [["snapshot", o.config.setup.snapshot_command], ["reset", o.config.setup.reset_command], ["seed", o.config.setup.seed_command]];
    for (const [name, command] of plan) {
      if (!command) continue;
      const s = await step(name, command, { config: o.config, cwd: o.projectRoot, ...(o.redact ? { redact: o.redact } : {}) });
      prep.steps.push(s);
      if (name === "snapshot" && s.ok) prep.snapshot_taken = true;
      if (!s.ok) {
        prep.ok = false;
        break;
      }
    }
  }
  ensureDir(path.dirname(prepFile(o.runDir)));
  writeJson(prepFile(o.runDir), prep);
  return prep;
}

/** Put the snapshot back when the run ends, if this run took one. A failed restore is reported, never hidden. */
export async function restoreEnvironment(o: Omit<PrepOptions, "mode">): Promise<PrepStep | undefined> {
  const prep = readPrep(o.runDir);
  const command = o.config.setup.restore_command;
  if (!prep?.snapshot_taken || !command || prep.restore) return prep?.restore;
  const s = await step("restore", command, { config: o.config, cwd: o.projectRoot, ...(o.redact ? { redact: o.redact } : {}) });
  writeJson(prepFile(o.runDir), { ...prep, restore: s });
  return s;
}

/** The health check's view of the preparation: one line in the table, and a failure makes the environment unfit for testing. */
export function prepCheck(prep: EnvPrep): { name: string; ok: boolean; detail: string; skipped?: boolean } | undefined {
  if (!prep.ran) return undefined;
  const failed = prep.steps.find((s) => !s.ok);
  if (failed) return { name: `Test data preparation (${failed.name})`, ok: false, detail: failed.refused ?? `${failed.name} failed (${failed.timed_out ? "timed out" : `exit ${failed.exit_code}`}): ${tailOf(failed.tail, 300) || "no output"}` };
  return { name: "Test data preparation", ok: true, detail: `${prep.steps.map((s) => s.name).join(", ")} done` };
}
