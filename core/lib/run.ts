import fs from "node:fs";
import path from "node:path";
import { checkConfigFile, parseCriticalFlows, policyFromConfig } from "./config.ts";
import type { ConfigCheck, QamindConfig, Severity } from "./config.ts";
import { corePath } from "./corepath.ts";
import { loadQaEnv } from "./dotenv.ts";
import { ensureDir, exists, readJson, utcStamp, writeJson } from "./fsutil.ts";
import { gitInfo } from "./git.ts";
import type { GitInfo } from "./git.ts";
import { ensureGitignoreEntries } from "./gitignore.ts";
import { RUN_MARKER_FILE, SCHEMA_VERSION, projectsRoot, storeSubdirs } from "./paths.ts";
import { MEMORY_SCHEMA } from "./memory/store.ts";
import { ensureProjectStore, listKnownProjects, looksLikeProject, resolveProject } from "./project.ts";
import { assignIds, countBySeverity, mergedNotTested, readRunData } from "./report.ts";
import { compactFinding } from "./report.ts";
import type { CompactFinding, RunBudgetOutcome, RunMeta } from "./report.ts";
import { ensureMigrated } from "./memory/migrate.ts";
import { applyRunToMemory } from "./memory/update.ts";
import { writeReports } from "./reports.ts";
import { globalAutoFile, projectAutoFile, readAutoFile } from "../auto-qa/settings.ts";
import { writeLastRun } from "../auto-qa/state.ts";
import { addToDay, budgetStatus, parseUsage, resolveBudget } from "./budget.ts";
import type { RunBudget, Usage } from "./budget.ts";
import { readPrep } from "./envprep.ts";
import { contextForRun, scanRun } from "./privacy.ts";
import { loadFixState } from "./fix/state.ts";
import { flowStatus } from "./verdict.ts";
import { detectStack, saveStack } from "./stack.ts";
import type { StackInfo } from "./stack.ts";
import type { RunPolicy } from "./urlpolicy.ts";
import { KNOWLEDGE_VERSION, QAMIND_VERSION } from "./version.ts";

export const MODES = ["full", "quick", "regression", "diff"] as const;
export type Mode = (typeof MODES)[number];
export const MARKER_TTL_HOURS = 8;

export interface RunMarker {
  schema_version: number;
  run_id: string;
  project_id: string;
  project_root: string;
  store: string;
  run_dir: string;
  mode: Mode;
  kind: "qa-only" | "qa";
  /** True when the run must not change anything outside .qa/ and the user store (/qa-only, CI, auto-QA report modes). */
  readonly: boolean;
  trigger: "manual" | "auto" | "ci";
  host: string;
  session_id?: string;
  focus?: string;
  started: string;
  expires: string;
  policy: RunPolicy;
  /** The run's time and cost budget (spec 13.6), resolved when the run started. The tools check the deadline before each new probe and each new fix. */
  budget?: RunBudget;
  /** Fix runs only: the part of the config's fix_policy that the safety hook and the fix tools enforce, as it was when the run started. */
  fix?: { do_not_touch: string[]; max_fixes: number; severities: Severity[] };
}

export interface RunSummary {
  schema_version: number;
  run_id: string;
  mode: string;
  trigger: string;
  kind: string;
  host: string;
  started: string;
  finished: string;
  duration_s: number;
  counts: { critical: number; important: number; minor: number; unconfirmed: number };
  finding_ids: string[];
  /** Compact copies of the findings, so a later run (regression mode) has them even if the report folder is gone. */
  findings?: CompactFinding[];
  coverage: { tested: number; partial: number; not_tested: number };
  /** A `/qa` run's fixes: where they are and how many of each outcome (the details are in the fix log and the run's reports). */
  fixes?: { branch: string; base_commit: string; verified: number; best_effort: number; reverted: number; deferred: number; commits: string[]; suite: "no-regression" | "regression" | "cannot-compare" | "not-run" };
  /** Key journeys from the config that were tested end to end. A stable measure to compare runs by: the number of coverage rows is the agent's choice of granularity. */
  journeys?: { total: number; tested: number };
  not_tested_count: number;
  blocked_areas: string[];
  cost: string;
  /** The same, structured (memory schema 2): the measured duration, and cost or tokens when the host or agent gave them. */
  usage?: Usage;
  budget?: RunBudgetOutcome;
  /** What test data preparation did (spec 13.1), when it was configured and ran. */
  environment?: { prepared: boolean; steps: string[]; snapshot_taken: boolean; restored?: boolean };
  stop_reason: string;
  agent_version: string;
  knowledge_version: string;
  branch?: string;
  commit?: string;
  report: string;
  /** What this run saved to project memory. */
  memory_updated?: string[];
}

export interface BrowserStatus {
  status: "ok" | "restart-needed" | "not-seen";
  message: string;
  missing?: string[];
}

function realOrResolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * The browser tool loads credentials when it starts. Compare what it loaded for this project with what the
 * config needs now, so a first run (config and .env.qa written mid-session) is explained instead of failing oddly.
 */
export function browserStatus(home: string, projectRoot: string, expectedNames: string[]): BrowserStatus {
  const state = readJson<Record<string, { secret_names?: string[] }>>(path.join(home, "state", "browser-state.json"));
  const key = Object.keys(state ?? {}).find((k) => realOrResolved(k) === realOrResolved(projectRoot));
  if (!state || !key) {
    return {
      status: "not-seen",
      message: "The browser tool has not been started for this project folder (it starts with the session, in the folder the agent was opened in). UI testing needs it: start the agent from the project folder.",
    };
  }
  const have = new Set(state[key]?.secret_names ?? []);
  const missing = expectedNames.filter((n) => !have.has(n));
  if (missing.length > 0) {
    return {
      status: "restart-needed",
      message: "The browser tool started before these test credentials were available, so it cannot sign in with them. Restart the session (or reload plugins) so it picks them up.",
      missing,
    };
  }
  return { status: "ok", message: "The browser tool has the test credentials." };
}

export type StartStatus = "no-project" | "needs-config" | "unfilled" | "invalid" | "blocked-url" | "ambiguous-url" | "missing-env" | "busy" | "ready";

export interface StartResult {
  status: StartStatus;
  /** Plain-language next step for the user. */
  message: string;
  project?: { id: string; name: string; root: string; id_source: string; store: string };
  created?: string[];
  gitignore_added?: string[];
  problems?: string[];
  blocked?: Array<{ url: string; reason: string }>;
  ambiguous?: Array<{ url: string; reason: string }>;
  missing_env?: string[];
  advisories?: string[];
  known_projects?: Array<{ id: string; name: string; paths_seen: string[]; last_seen: string }>;
  active_run?: { run_id: string; started: string };
  run?: { id: string; dir: string; mode: Mode; focus?: string; readonly: boolean; report: string; /** The run's budget in words, and the deadline: check it with `qamind budget status` before each new area. */ budget?: { message: string; time_minutes?: number; max_cost?: number; deadline?: string } };
  config?: {
    environment: string;
    web_uis: Array<{ name: string; url: string }>;
    api: { base_url?: string; openapi?: string; login_configured: boolean };
    roles: Array<{ name: string; ui: string; tenant?: string; has_credentials: boolean }>;
    test_data_prefix: string;
    fix_severities: string[];
    /** The critical journeys from the config, numbered from 1. Coverage rows reference these numbers (`critical_flow`). */
    critical_flows: string[];
  };
  stack?: StackInfo;
  git?: GitInfo;
  policy?: RunPolicy;
  browser?: BrowserStatus;
}

export interface StartOptions {
  cwd: string;
  project?: string;
  mode: Mode;
  focus?: string;
  sessionId?: string;
  host: string;
  kind: "qa-only" | "qa";
  trigger?: "manual" | "auto" | "ci";
  force?: boolean;
  home: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

function copyIfMissing(from: string, to: string, created: string[]): void {
  if (exists(to)) return;
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  created.push(to);
}

export function markerPath(store: string): string {
  return path.join(storeSubdirs(store).state, RUN_MARKER_FILE);
}

export function readMarker(store: string): RunMarker | undefined {
  return readJson<RunMarker>(markerPath(store));
}

export function isExpired(marker: RunMarker, now = new Date()): boolean {
  return new Date(marker.expires).getTime() <= now.getTime();
}

/** Active (unexpired) run markers across every project in the user store. Used by hooks and the browser guard. */
export function findActiveMarkers(home: string, now = new Date()): RunMarker[] {
  const root = projectsRoot(home);
  if (!exists(root)) return [];
  const out: RunMarker[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = readJson<RunMarker>(path.join(root, entry.name, "state", RUN_MARKER_FILE));
    if (m && !isExpired(m, now)) out.push(m);
  }
  return out;
}

export function findMarkerByRunId(home: string, runId: string): RunMarker | undefined {
  return scanAllMarkers(home).find((m) => m.run_id === runId);
}

function scanAllMarkers(home: string): RunMarker[] {
  const root = projectsRoot(home);
  if (!exists(root)) return [];
  const out: RunMarker[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = readJson<RunMarker>(path.join(root, entry.name, "state", RUN_MARKER_FILE));
    if (m) out.push(m);
  }
  return out;
}

export function startRun(opts: StartOptions): StartResult {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const root = path.resolve(opts.project ?? opts.cwd);
  if (!exists(root) || !fs.statSync(root).isDirectory()) {
    return { status: "no-project", message: `The folder ${root} does not exist. Ask the user which project folder to test.`, known_projects: listKnownProjects(opts.home) };
  }
  if (!opts.project && !looksLikeProject(root)) {
    return {
      status: "no-project",
      message: "The current folder does not look like a project (no git repository, app code or .qa/config.md). Ask the user which project folder to test, offering the known projects below, then run again with --project <folder>.",
      known_projects: listKnownProjects(opts.home),
    };
  }

  const info = resolveProject(root);
  const { store } = ensureProjectStore(opts.home, info, now);
  ensureMigrated(store); // old memory is migrated (after a backup); memory from a newer QAMind refuses the run here, before anything is written
  const projectOut = { id: info.id, name: info.name, root: info.root, id_source: info.idSource, store };

  // First run: scaffold the config and stop. Never overwrites anything that exists.
  const configFile = path.join(root, ".qa", "config.md");
  const gitignoreAdded = ensureGitignoreEntries(root);
  if (!exists(configFile)) {
    const created: string[] = [];
    const core = corePath();
    copyIfMissing(path.join(core, "shared", "templates", "config.md"), configFile, created);
    copyIfMissing(path.join(core, "shared", "templates", "env.qa.example"), path.join(root, ".env.qa.example"), created);
    return {
      status: "needs-config",
      message:
        "First run in this project: QAMind created .qa/config.md and .env.qa.example and added .qa/ and .env.qa to .gitignore. " +
        "Fill in .qa/config.md (every REPLACE_ME), copy .env.qa.example to .env.qa and add the TEST account logins, then run QA again. Nothing was tested.",
      project: projectOut,
      created,
      gitignore_added: gitignoreAdded,
    };
  }

  const check: ConfigCheck = checkConfigFile(root, env);
  if (check.status !== "ok" || !check.config) {
    const status: StartStatus = check.status === "ok" ? "invalid" : check.status;
    const message: Record<string, string> = {
      unfilled: "The config is still the unfilled template. Fill in the REPLACE_ME values, then run again. Nothing was tested.",
      invalid: "The config has problems. Fix them, then run again. Nothing was tested.",
      "blocked-url": "A configured URL is blocked as production. QAMind never tests production. Fix the URL or the blocked patterns. Nothing was tested.",
      "ambiguous-url": "A configured URL does not look like a test environment. Ask the user to confirm it is NOT production; if they confirm, set environment.confirmed_non_production: true in .qa/config.md and run again. Nothing was tested.",
    };
    return {
      status,
      message: message[check.status] ?? "The config could not be used.",
      project: projectOut,
      problems: check.problems,
      blocked: check.blocked,
      ambiguous: check.ambiguous,
    };
  }
  const config: QamindConfig = check.config;

  const credNames = config.roles.flatMap((r) => [r.username_env, r.password_env]);
  const { values } = loadQaEnv(root, env, credNames);
  const roles = config.roles.map((r) => ({ name: r.name, ui: r.ui, ...(r.tenant ? { tenant: r.tenant } : {}), has_credentials: !!values[r.username_env] && !!values[r.password_env] }));
  if (!roles.some((r) => r.has_credentials)) {
    return {
      status: "missing-env",
      message: "No test account has both its username and password set. Add them to .env.qa (names below) and run again. Values are never printed.",
      project: projectOut,
      missing_env: check.missing_env,
    };
  }

  const existing = readMarker(store);
  if (existing && !isExpired(existing, now) && !opts.force) {
    const sameSession = !!opts.sessionId && existing.session_id === opts.sessionId;
    if (!sameSession) {
      return {
        status: "busy",
        message: `Another QA run (${existing.run_id}) is still active for this project. Finish it, or run again with --force if it was abandoned.`,
        project: projectOut,
        active_run: { run_id: existing.run_id, started: existing.started },
      };
    }
  }

  let runId = `run-${utcStamp(now)}`;
  const reports = path.join(root, ".qa", "reports");
  for (let n = 2; exists(path.join(reports, runId)); n++) runId = `run-${utcStamp(now)}-${n}`;
  const runDir = path.join(reports, runId);
  for (const sub of ["screenshots", "evidence", "data"]) ensureDir(path.join(runDir, sub));

  const criticalFlows = parseCriticalFlows(check.body ?? "");
  const stack = detectStack(root, now);
  saveStack(storeSubdirs(store).memory, stack);
  const git = gitInfo(root);
  const policy = policyFromConfig(config);
  const readonly = opts.kind === "qa-only" || opts.trigger === "ci";
  const trigger = opts.trigger ?? "manual";
  // Auto-QA's own setting (the user's, in auto.json) is the one budget that beats the project's config.
  const userAuto = trigger === "auto" ? readAutoFile(projectAutoFile(store)).settings.time_budget_minutes ?? readAutoFile(globalAutoFile(opts.home)).settings.time_budget_minutes : undefined;
  const budget = resolveBudget(config, opts.mode, trigger, now, userAuto);

  const marker: RunMarker = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    project_id: info.id,
    project_root: info.root,
    store,
    run_dir: runDir,
    mode: opts.mode,
    kind: opts.kind,
    readonly,
    trigger,
    host: opts.host,
    ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
    ...(opts.focus ? { focus: opts.focus } : {}),
    started: now.toISOString(),
    expires: new Date(now.getTime() + MARKER_TTL_HOURS * 3600_000).toISOString(),
    policy,
    ...(budget.time_minutes !== undefined || budget.max_cost !== undefined ? { budget } : {}),
    ...(!readonly && opts.kind === "qa" ? { fix: { do_not_touch: config.fix_policy.do_not_touch, max_fixes: config.fix_policy.max_fixes, severities: config.fix_policy.fix_severities } } : {}),
  };
  writeJson(markerPath(store), marker);

  const meta: RunMeta = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    project_id: info.id,
    project_name: info.name,
    environment: config.environment.name,
    mode: opts.mode,
    trigger,
    kind: opts.kind,
    host: opts.host,
    ...(opts.focus ? { focus: opts.focus } : {}),
    started: now.toISOString(),
    critical_flows: criticalFlows,
    ...(git.branch ? { branch: git.branch } : {}),
    ...(git.commit ? { commit: git.commit } : {}),
    agent_version: QAMIND_VERSION,
    knowledge_version: KNOWLEDGE_VERSION,
  };
  writeJson(path.join(runDir, "data", "meta.json"), meta);

  return {
    status: "ready",
    message: "Ready. Credentials are present for the roles listed (values are never shown).",
    project: projectOut,
    gitignore_added: gitignoreAdded,
    run: { id: runId, dir: runDir, mode: opts.mode, ...(opts.focus ? { focus: opts.focus } : {}), readonly, report: path.join(runDir, "TECHNICAL-REPORT.md"), budget: { message: budgetStatus(marker.budget, marker.started, now).message, ...(budget.time_minutes !== undefined ? { time_minutes: budget.time_minutes } : {}), ...(budget.max_cost !== undefined ? { max_cost: budget.max_cost } : {}), ...(budget.deadline ? { deadline: budget.deadline } : {}) } },
    config: {
      environment: config.environment.name,
      web_uis: config.web_uis,
      api: { ...(config.api.base_url ? { base_url: config.api.base_url } : {}), ...(config.api.openapi ? { openapi: config.api.openapi } : {}), login_configured: !!config.api.login },
      roles,
      test_data_prefix: config.test_data_prefix,
      fix_severities: config.fix_policy.fix_severities,
      critical_flows: criticalFlows,
    },
    ...(check.missing_env.length ? { missing_env: check.missing_env } : {}),
    ...(check.advisories.length ? { advisories: check.advisories } : {}),
    stack,
    git,
    policy,
    browser: browserStatus(opts.home, root, credNames.filter((n) => !!values[n])),
  };
}

export interface FinishOptions {
  home: string;
  runId: string;
  stopReason?: string;
  cost?: string;
  now?: Date;
}

export function finishRun(opts: FinishOptions): RunSummary {
  const marker = findMarkerByRunId(opts.home, opts.runId);
  if (!marker) throw new Error(`No run ${opts.runId} found in the user store (already finished, or wrong id).`);
  const now = opts.now ?? new Date();
  // The privacy scan (spec 13.8): a run whose output still holds unmasked private data does not finish. Nothing is changed by the refusal.
  const scan = scanRun(marker.run_dir, contextForRun(marker.run_dir));
  if (!scan.ok) {
    const where = scan.leaks.slice(0, 8).map((l) => `${l.file} (${Object.entries(l.kinds).map(([k, n]) => `${n} ${k}`).join(", ")})`).join("; ");
    throw new Error(`Privacy scan failed: the run's output still holds private data in ${scan.leaks.length} file(s): ${where}${scan.leaks.length > 8 ? "; ..." : ""}. Run \`qamind privacy mask --run ${marker.run_id}\` (it masks them in place; test accounts' own data stays), rebuild the reports with \`report build\` and \`report lint\`, then finish the run again. Nothing was finished.`);
  }
  const data = readRunData(marker.run_dir);
  assignIds(marker.run_dir, data);
  const counts = countBySeverity(data.findings);
  const notTested = mergedNotTested(data);
  const journeys = flowStatus(data);
  const started = new Date(marker.started).getTime();
  const duration_s = Math.max(0, Math.round((now.getTime() - started) / 1000));
  const meta = readJson<RunMeta>(path.join(marker.run_dir, "data", "meta.json"));
  // A run whose environment was broken is an environment problem whatever the agent calls it: say so by default, so no summary claims "completed".
  const health = readJson<{ environment_ok?: boolean }>(path.join(marker.run_dir, "data", "health.json"));
  const stop_reason = opts.stopReason ?? (health && health.environment_ok === false ? "environment problem" : "completed");
  const usage = parseUsage(opts.cost, duration_s);
  const bstat = budgetStatus(marker.budget, marker.started, now);
  const budgetOutcome: RunBudgetOutcome | undefined = marker.budget ? { ...(marker.budget.time_minutes !== undefined ? { time_minutes: marker.budget.time_minutes } : {}), ...(marker.budget.max_cost !== undefined ? { max_cost: marker.budget.max_cost } : {}), used_minutes: Math.round((duration_s / 60) * 10) / 10, reached: bstat.state === "over", source: marker.budget.source } : undefined;
  const prep = readPrep(marker.run_dir);
  const environment = prep?.ran ? { prepared: true, steps: prep.steps.map((x) => `${x.name} ${x.ok ? "ok" : "failed"}`), snapshot_taken: prep.snapshot_taken, ...(prep.restore ? { restored: prep.restore.ok } : {}) } : undefined;
  const summary: RunSummary = {
    schema_version: MEMORY_SCHEMA,
    run_id: marker.run_id,
    mode: marker.mode,
    trigger: marker.trigger,
    kind: marker.kind,
    host: marker.host,
    started: marker.started,
    finished: now.toISOString(),
    duration_s,
    counts: { ...counts, unconfirmed: data.unconfirmed.length },
    finding_ids: data.findings.map((f) => f.id ?? "").filter(Boolean),
    findings: data.findings.map(compactFinding),
    coverage: {
      tested: data.coverage.filter((c) => c.status === "tested").length,
      partial: data.coverage.filter((c) => c.status === "partial").length,
      not_tested: data.coverage.filter((c) => c.status === "not-tested").length,
    },
    ...(journeys.total > 0 ? { journeys: { total: journeys.total, tested: journeys.tested.length } } : {}),
    not_tested_count: notTested.length,
    blocked_areas: notTested.map((n) => n.area),
    cost: opts.cost ?? "not available on this host",
    usage,
    ...(budgetOutcome ? { budget: budgetOutcome } : {}),
    ...(environment ? { environment } : {}),
    stop_reason,
    agent_version: QAMIND_VERSION,
    knowledge_version: KNOWLEDGE_VERSION,
    ...(meta?.branch ? { branch: meta.branch } : {}),
    ...(meta?.commit ? { commit: meta.commit } : {}),
    report: path.join(marker.run_dir, "TECHNICAL-REPORT.md"),
  };
  // Apply this run to project memory (product map, risk areas, false-alarm use counts) from what the config says is in the product.
  const config = checkConfigFile(marker.project_root, process.env).config;
  const memory = applyRunToMemory({
    store: marker.store,
    runDir: marker.run_dir,
    runId: marker.run_id,
    mode: marker.mode,
    now,
    roles: (config?.roles ?? []).map((r) => r.name),
    uiUrls: Object.fromEntries((config?.web_uis ?? []).map((u) => [u.name, u.url])),
  });
  if (meta) writeJson(path.join(marker.run_dir, "data", "meta.json"), { ...meta, finished: summary.finished, duration_s, stop_reason, cost: summary.cost, usage, ...(budgetOutcome ? { budget: budgetOutcome } : {}), ...(prep?.ran ? { environment_prep: { prepared: true, why: prep.why, steps: prep.steps.map((x) => `${x.name} ${x.ok ? "ok" : "failed"}`), snapshot_taken: prep.snapshot_taken, ...(prep.restore ? { restored: prep.restore.ok } : {}) } } : {}), memory_updated: memory.updated });
  summary.memory_updated = memory.updated;
  const fixState = loadFixState(marker.run_dir);
  if (fixState) {
    const by = (o: string): number => fixState.attempts.filter((a) => a.status === o).length;
    summary.fixes = { branch: fixState.branch, base_commit: fixState.base_commit.slice(0, 7), verified: by("verified"), best_effort: by("best-effort"), reverted: by("reverted"), deferred: by("deferred"), commits: fixState.attempts.filter((a) => a.commit && (a.status === "verified" || a.status === "best-effort")).map((a) => a.commit as string).map((c) => c.slice(0, 7)), suite: fixState.comparison?.verdict ?? "not-run" };
  }
  writeJson(path.join(storeSubdirs(marker.store).runs, `${marker.run_id}.json`), summary);
  // Re-render both reports so they carry the final duration, stop reason and memory updates (what changed uses the saved result).
  writeReports(marker.run_dir, marker.store);
  fs.rmSync(markerPath(marker.store), { force: true });
  addToDay(marker.store, marker.trigger, duration_s, now);
  // Auto-QA's Stop hook reads this to know that the task which just ended was itself a QA run (spec 9.5 rule 4).
  writeLastRun(marker.store, { run_id: marker.run_id, trigger: marker.trigger, kind: marker.kind, started: marker.started, finished: summary.finished, ...(marker.session_id ? { session_id: marker.session_id } : {}) });
  return summary;
}
