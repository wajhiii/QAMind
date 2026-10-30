import fs from "node:fs";
import path from "node:path";
import { checkConfigFile, policyFromConfig } from "./config.ts";
import type { ConfigCheck, QamindConfig } from "./config.ts";
import { corePath } from "./corepath.ts";
import { loadQaEnv } from "./dotenv.ts";
import { ensureDir, exists, readJson, utcStamp, writeJson } from "./fsutil.ts";
import { gitInfo } from "./git.ts";
import type { GitInfo } from "./git.ts";
import { ensureGitignoreEntries } from "./gitignore.ts";
import { RUN_MARKER_FILE, SCHEMA_VERSION, projectsRoot, storeSubdirs } from "./paths.ts";
import { ensureProjectStore, listKnownProjects, looksLikeProject, resolveProject } from "./project.ts";
import { assignIds, countBySeverity, mergedNotTested, readRunData, renderTechnicalReport } from "./report.ts";
import type { RunMeta } from "./report.ts";
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
  coverage: { tested: number; partial: number; not_tested: number };
  not_tested_count: number;
  blocked_areas: string[];
  cost: string;
  stop_reason: string;
  agent_version: string;
  knowledge_version: string;
  branch?: string;
  commit?: string;
  report: string;
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
  run?: { id: string; dir: string; mode: Mode; focus?: string; readonly: boolean; report: string };
  config?: {
    environment: string;
    web_uis: Array<{ name: string; url: string }>;
    api: { base_url?: string; openapi?: string; login_configured: boolean };
    roles: Array<{ name: string; ui: string; tenant?: string; has_credentials: boolean }>;
    test_data_prefix: string;
    fix_severities: string[];
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

  const stack = detectStack(root, now);
  saveStack(storeSubdirs(store).memory, stack);
  const git = gitInfo(root);
  const policy = policyFromConfig(config);
  const readonly = opts.kind === "qa-only" || opts.trigger === "ci";
  const trigger = opts.trigger ?? "manual";

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
    run: { id: runId, dir: runDir, mode: opts.mode, ...(opts.focus ? { focus: opts.focus } : {}), readonly, report: path.join(runDir, "TECHNICAL-REPORT.md") },
    config: {
      environment: config.environment.name,
      web_uis: config.web_uis,
      api: { ...(config.api.base_url ? { base_url: config.api.base_url } : {}), ...(config.api.openapi ? { openapi: config.api.openapi } : {}), login_configured: !!config.api.login },
      roles,
      test_data_prefix: config.test_data_prefix,
      fix_severities: config.fix_policy.fix_severities,
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
  const data = readRunData(marker.run_dir);
  assignIds(marker.run_dir, data);
  const counts = countBySeverity(data.findings);
  const notTested = mergedNotTested(data);
  const started = new Date(marker.started).getTime();
  const duration_s = Math.max(0, Math.round((now.getTime() - started) / 1000));
  const meta = readJson<RunMeta>(path.join(marker.run_dir, "data", "meta.json"));
  const stop_reason = opts.stopReason ?? "completed";
  const summary: RunSummary = {
    schema_version: SCHEMA_VERSION,
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
    coverage: {
      tested: data.coverage.filter((c) => c.status === "tested").length,
      partial: data.coverage.filter((c) => c.status === "partial").length,
      not_tested: data.coverage.filter((c) => c.status === "not-tested").length,
    },
    not_tested_count: notTested.length,
    blocked_areas: notTested.map((n) => n.area),
    cost: opts.cost ?? "not available on this host",
    stop_reason,
    agent_version: QAMIND_VERSION,
    knowledge_version: KNOWLEDGE_VERSION,
    ...(meta?.branch ? { branch: meta.branch } : {}),
    ...(meta?.commit ? { commit: meta.commit } : {}),
    report: path.join(marker.run_dir, "TECHNICAL-REPORT.md"),
  };
  writeJson(path.join(storeSubdirs(marker.store).runs, `${marker.run_id}.json`), summary);
  if (meta) writeJson(path.join(marker.run_dir, "data", "meta.json"), { ...meta, finished: summary.finished, duration_s, stop_reason, cost: summary.cost });
  // Re-render so the saved report carries the final duration and stop reason.
  fs.writeFileSync(path.join(marker.run_dir, "TECHNICAL-REPORT.md"), renderTechnicalReport(readRunData(marker.run_dir)), "utf8");
  fs.rmSync(markerPath(marker.store), { force: true });
  return summary;
}
