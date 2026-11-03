import fs from "node:fs";
import path from "node:path";
import type { RoleCredentials } from "../auth.ts";
import { checkConfigFile, policyFromConfig } from "../config.ts";
import type { QamindConfig } from "../config.ts";
import { loadQaEnv } from "../dotenv.ts";
import { ensureDir, readJson, utcStamp } from "../fsutil.ts";
import { withStoreLock } from "../memory/lock.ts";
import { ensureMigrated } from "../memory/migrate.ts";
import { projectScope, runScope } from "../memory/service.ts";
import type { RunScope } from "../memory/service.ts";
import { storeDir } from "../paths.ts";
import { resolveProject } from "../project.ts";
import { contextFrom } from "../privacy.ts";
import type { Finding } from "../report.ts";
import { loadBank, pruneCandidates, saveTest, summariseBank } from "./bank.ts";
import type { BankTest, SaveInput, SaveResult } from "./bank.ts";
import { exportDir, generateExports } from "./export.ts";
import type { ExportedFile } from "./export.ts";
import { runBank } from "./runner.ts";
import type { BankRunContext, BankRunOptions } from "./runner.ts";
import type { BankResults } from "./results.ts";

/** What the CLI and the qa-memory server call for the test bank (spec 13.3), so the two can never disagree. */

const secretNamesOf = (config: QamindConfig): string[] => config.roles.flatMap((r) => [r.username_env, r.password_env]);

/** Saves one test from a run. `from_issue` must be one of the run's own findings; the bug it becomes is linked when the run finishes. */
export function saveBankTest(scope: RunScope, input: SaveInput, now = new Date()): SaveResult {
  const ctx = scope.ctx;
  if (input.from_issue) {
    const findings = readJson<Finding[]>(path.join(scope.runDir, "data", "findings.json")) ?? [];
    if (!findings.some((f) => f.id === input.from_issue)) throw new Error(`from_issue ${input.from_issue} is not a finding of this run (findings.json has ${findings.map((f) => f.id).filter(Boolean).join(", ") || "none yet"}). Write the findings first, then save the tests that protect them.`);
  }
  return withStoreLock(scope.store, () =>
    saveTest(
      scope.store,
      { ...input, ...(input.from_issue ? { from_run: scope.runId } : {}) },
      { roles: ctx.config.roles.map((r) => r.name), uis: ctx.config.web_uis.map((u) => u.name), secretNames: secretNamesOf(ctx.config), knownSecrets: ctx.passwords, now },
    ),
  );
}

/**
 * Reads a test the agent wrote as JSON and saves it. Inside a QA run the file has to be in the run's folder (the agent writes it with its own Write tool, like a plan);
 * `anywhere` is for the command line, where a person names the file.
 */
export function saveBankTestFromFile(scope: RunScope, file: string, opts: { anywhere?: boolean; now?: Date } = {}): SaveResult {
  const base = path.join(scope.runDir, "data", "bank");
  const abs = path.isAbsolute(file) ? path.resolve(file) : path.resolve(fs.existsSync(path.resolve(file)) && opts.anywhere ? path.resolve(file) : path.join(base, file));
  const inside = abs === scope.runDir || abs.startsWith(scope.runDir + path.sep);
  if (!opts.anywhere && !inside) throw new Error(`The test file has to be inside the run folder (write it to ${path.join(scope.runDir, "data", "bank", "<name>.json")}).`);
  if (!fs.existsSync(abs)) throw new Error(`No test file at ${abs}. Write the test as JSON there first.`);
  if (fs.statSync(abs).size > 120_000) throw new Error("The test file is larger than 120 KB: a test checks one thing, split it.");
  let input: SaveInput;
  try {
    input = JSON.parse(fs.readFileSync(abs, "utf8")) as SaveInput;
  } catch (e) {
    throw new Error(`The test file is not valid JSON: ${(e as Error).message}`);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("The test file must hold one JSON object (kind, title, area, card, plan or ui and steps).");
  return saveBankTest(scope, input, opts.now);
}

function secretsOf(root: string, config: QamindConfig, env: NodeJS.ProcessEnv): Record<string, string> {
  return loadQaEnv(root, env, secretNamesOf(config)).values;
}

/** The context to run the bank inside a QA run: the run's own policy, folder and deadline. */
export function bankContextForRun(scope: RunScope): BankRunContext {
  const ctx = scope.ctx;
  return {
    store: scope.store,
    outDir: scope.runDir,
    runId: scope.runId,
    config: ctx.config,
    policy: ctx.policy,
    roles: ctx.roles,
    secrets: secretsOf(ctx.projectRoot, ctx.config, process.env),
    passwords: ctx.passwords,
    privacy: contextFrom(ctx.config, ctx.roles.map((r) => r.username)),
    ...(ctx.marker.budget?.deadline ? { deadlineMs: Date.parse(ctx.marker.budget.deadline) } : {}),
  };
}

/**
 * The context to run the bank outside a QA run (`/qa-tests run`): the same checks `run start` makes of the config (an unfilled template, a production address and an unconfirmed address all refuse),
 * the same policy, credentials from `.env.qa`. Results go to a folder of their own under `.qa/bank-runs/`, not to a run's reports.
 */
export function bankContextStandalone(home: string, projectDir: string, now: Date, env: NodeJS.ProcessEnv = process.env): BankRunContext {
  const root = path.resolve(projectDir);
  const info = resolveProject(root);
  const store = storeDir(home, info.id);
  ensureMigrated(store);
  const check = checkConfigFile(root, env);
  if (check.status !== "ok" || !check.config) throw new Error(`The config is not usable (${check.status}): ${[...check.problems, ...check.blocked.map((b) => `${b.url}: ${b.reason}`), ...check.ambiguous.map((a) => `${a.url}: ${a.reason}`)].join(" ") || "run /qa-only first to create it"}. Nothing was tested.`);
  const config = check.config;
  const { values } = loadQaEnv(root, env, secretNamesOf(config));
  const roles: RoleCredentials[] = [];
  for (const r of config.roles) {
    const username = values[r.username_env];
    const password = values[r.password_env];
    if (username && password) roles.push({ name: r.name, username, password });
  }
  if (roles.length === 0) throw new Error("No test account has both its username and password set in .env.qa. Nothing was tested.");
  const id = `bank-${utcStamp(now)}`;
  const outDir = path.join(root, ".qa", "bank-runs", id);
  ensureDir(path.join(outDir, "data"));
  return {
    store,
    outDir,
    runId: id,
    config,
    policy: policyFromConfig(config),
    roles,
    secrets: values,
    passwords: roles.map((r) => r.password),
    privacy: contextFrom(config, roles.map((r) => r.username)),
  };
}

export async function runBankForRun(scope: RunScope, opts: BankRunOptions = {}): Promise<BankResults> {
  return runBank(bankContextForRun(scope), opts);
}

export interface BankStatusRow {
  id: string;
  title: string;
  area: string;
  kind: string;
  status: string;
  protects_bug?: string;
  runs: number;
  last?: string;
  last_run?: string;
  flaky: number;
  flips: number;
  avg_ms: number;
  card: { protects: string };
  quarantine?: string;
}

export function bankStatus(store: string, now = new Date()): { summary: ReturnType<typeof summariseBank>; tests: BankStatusRow[]; prune_candidates: ReturnType<typeof pruneCandidates>; warnings: string[] } {
  const loaded = loadBank(store);
  return {
    summary: summariseBank(loaded.tests),
    tests: loaded.tests.map((t) => ({
      id: t.id,
      title: t.title,
      area: t.area,
      kind: t.kind,
      status: t.status,
      ...(t.protects_bug ? { protects_bug: t.protects_bug } : {}),
      runs: t.stats.runs,
      ...(t.stats.last ? { last: t.stats.last.result, last_run: t.stats.last.run } : {}),
      flaky: t.stats.flaky,
      flips: t.stats.flips,
      avg_ms: t.stats.avg_ms,
      card: { protects: t.card.protects },
      ...(t.quarantine ? { quarantine: t.quarantine.reason } : {}),
    })),
    prune_candidates: pruneCandidates(loaded.tests, now),
    warnings: loaded.warnings,
  };
}

export interface ExportPlan {
  dir: string;
  files: Array<{ path: string; tests: string[]; exists: boolean }>;
  /** Written only when the caller confirmed; otherwise this is a preview. */
  written: boolean;
  skipped_existing: string[];
}

/**
 * Previews, or with `confirmed` writes, Playwright versions of bank tests into the project's test folder. An existing file is never overwritten.
 * Writing in the project is the user's decision: the command refuses to write without `confirmed`, and the skill sets it only after they said yes.
 */
export function exportTests(home: string, projectDir: string | undefined, input: { ids?: string[]; dir?: string; confirmed: boolean }): ExportPlan & { generated: ExportedFile[] } {
  const scope = projectScope(home, { ...(projectDir ? { project: projectDir } : {}) });
  const config = checkConfigFile(scope.project.root).config;
  if (!config) throw new Error("The config is not usable, so the tests cannot be exported with the right logins and addresses. Run /qa-only first.");
  const all = loadBank(scope.store).tests.filter((t) => t.status !== "retired");
  const pick = input.ids?.length ? all.filter((t) => input.ids?.includes(t.id)) : all.filter((t) => t.status === "active");
  const missing = (input.ids ?? []).filter((id) => !all.some((t) => t.id === id));
  if (missing.length) throw new Error(`No such test: ${missing.join(", ")}.`);
  if (pick.length === 0) throw new Error("There are no tests to export.");
  const dir = exportDir(scope.project.root, input.dir);
  if (path.isAbsolute(dir) || dir.split("/").includes("..")) throw new Error("--dir must be a folder inside the project.");
  const generated = generateExports(pick as BankTest[], config, dir);
  const files = generated.map((f) => ({ path: f.path, tests: f.tests, exists: fs.existsSync(path.join(scope.project.root, f.path)) }));
  const skipped: string[] = [];
  if (input.confirmed) {
    for (const f of generated) {
      const abs = path.join(scope.project.root, f.path);
      if (fs.existsSync(abs)) {
        skipped.push(f.path);
        continue;
      }
      ensureDir(path.dirname(abs));
      fs.writeFileSync(abs, f.content, "utf8");
    }
  }
  return { dir, files, written: input.confirmed, skipped_existing: skipped, generated };
}

export { runScope };
