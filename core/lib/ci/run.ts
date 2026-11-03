import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { corePath } from "../corepath.ts";
import { checkConfigFile } from "../config.ts";
import type { CiMode, QamindConfig } from "../config.ts";
import { loadQaEnv } from "../dotenv.ts";
import { porcelainFiles } from "../git.ts";
import { ensureDir, readJson, writeJson } from "../fsutil.ts";
import { qamindHome } from "../paths.ts";
import { contextForRun, contextFrom } from "../privacy.ts";
import type { PrivacyContext } from "../privacy.ts";
import { makeRedactor } from "../redact.ts";
import { readRunData } from "../report.ts";
import type { RunSummary } from "../run.ts";
import { apiFor } from "./api.ts";
import { agentArgs, agentCommandOf, hasAuth, invokeFor, loadHeadless } from "./host.ts";
import type { HeadlessSpec } from "./host.ts";
import type { CommentResult, StatusState } from "./api.ts";
import { renderComment } from "./comment.ts";
import type { CiOutcomeOrError } from "./comment.ts";
import { evaluateGate } from "./gate.ts";
import type { CiGate } from "./gate.ts";
import { detectCi } from "./provider.ts";

/**
 * `qamind ci` (spec 13.2): test a pull request headlessly, report-only, and say the result where the team looks: one comment kept up to date, a commit status, an exit code, reports as artifacts.
 *
 * It starts the host's own CLI (as that host's `headless` block describes) with the QAMind runtime, waits for it under a hard time limit, and then reads the run's own data files: the verdict is never the agent's words.
 * A CI machine has no user store, so the run starts without memory unless `ci.cache_memory` keeps a CI-only store. Nothing is ever fixed, committed or pushed, and the run is checked afterwards for tracked files that changed.
 */

export const DEFAULT_CI_MAX_USD = 10;

/** What a CI run can be: one of the configured modes, or "ticket" (`--ticket FILE`): test one request and report its criteria (spec 13.4). */
export type CiRunMode = CiMode | "ticket";
const TICKET_FILE_MAX = 100_000;

export interface CiRunOptions {
  projectDir: string;
  env?: NodeJS.ProcessEnv;
  mode?: CiMode;
  /** Ticket mode: a file in the project (a story, a PRD section, an exported issue) that says what to test. Nobody can confirm criteria in CI, so the ones the agent derives are listed as assumed. */
  ticket?: string;
  outDir?: string;
  /** A shell command that does the testing instead of the host's own CLI (another tool, or a test). It gets QAMIND_CI_PROMPT and QAMIND_CI_MODE. */
  agentCommand?: string;
  /** Which host's CLI runs the testing (its `headless` block in hosts/<id>/host.json). */
  host?: string;
  /** The host.json to read when it is not in the QAMind checkout this runs from. */
  hostSpec?: string;
  /** The model passed to the host CLI. */
  model?: string;
  /** Use this store instead of a fresh one (or the cached CI store). */
  home?: string;
  /** Use the person's own `~/.qamind` (a local schedule on a developer's machine). */
  userStore?: boolean;
  /** Post nothing; write the files only. */
  dryRun?: boolean;
  /** Judge a run that already finished instead of starting an agent. */
  fromRun?: string;
  fetchImpl?: typeof fetch;
  /** Replaces ci.timeout_minutes (tests). */
  timeoutMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface CiResult {
  outcome: CiOutcomeOrError;
  exit_code: 0 | 1 | 2;
  mode: CiRunMode;
  run_id?: string;
  reasons: string[];
  gate?: CiGate;
  error?: string;
  comment?: CommentResult | { action: "skipped"; why: string };
  status?: { state: StatusState; posted: boolean };
  /** Things that did not work and did not change the result (a comment that could not be posted, ...). */
  warnings: string[];
  out_dir: string;
  agent?: { exit_code: number | null; timed_out: boolean; cost_usd?: number; minutes: number };
  store: string;
}

const git = (root: string, args: string[], timeout = 30_000): string | undefined => {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout, maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch {
    return undefined;
  }
};

/** The QAMind runtime folder to hand to the host CLI: the folder that holds the built `dist/` (next to the running bundle, or the repository's own copy when run from source). */
export function pluginRoot(): string {
  const core = corePath();
  for (const c of [path.resolve(core, ".."), path.resolve(core, "..", "plugins", "qamind")]) if (fs.existsSync(path.join(c, "dist", "qamind.mjs"))) return c;
  throw new Error("Cannot find the built QAMind runtime (dist/qamind.mjs) to give the host CLI. Run `node scripts/build.ts` first.");
}

function promptFor(invoke: string, mode: CiRunMode, pr: number | undefined, base: string | undefined): string {
  const where = pr !== undefined ? ` for pull request #${pr}${base ? ` (into ${base})` : ""}` : "";
  const focus: Record<CiRunMode, string> = {
    ticket: "Test exactly what the ticket file asks for and what it directly touches. Nobody can confirm criteria in a CI run: if the ticket states none, derive them and list them as assumed in ticket.json (origin derived, no confirmation). Record a result for every criterion.",
    diff: "Test what this change touches: the files in git.changed_files from run_start and the flows that depend on them (the product map shows what depends on what).",
    quick: "Test the critical flows and the top risks.",
    regression: "Re-run the findings of the last run and check whether they are fixed.",
    full: "Test everything you can reach.",
  };
  return `${invoke} This is a CI run${where}. It is report-only and nobody is watching: never ask a question, never change, commit or push anything. ${focus[mode]} Keep to the time budget. Finish properly: write the report files, run report build and report lint, and call run_finish before you stop.`;
}

function agentEnv(base: NodeJS.ProcessEnv, extra: Record<string, string>, remove: string[]): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...base, ...extra };
  for (const k of [...remove, "NODE_TEST_CONTEXT"]) delete e[k];
  return e;
}

interface AgentRun {
  exit_code: number | null;
  timed_out: boolean;
  minutes: number;
  cost_usd?: number;
  tail: string;
}

function runAgent(command: string, args: string[], opts: { shell: boolean; cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; logFile: string; redact: (t: string) => string; costField?: string }): Promise<AgentRun> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd: opts.cwd, env: opts.env, shell: opts.shell, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    const MAX = 4 * 1024 * 1024;
    let out = "";
    const take = (c: Buffer): void => {
      if (out.length < MAX) out += c.toString("utf8");
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    let timedOut = false;
    const killTree = (sig: NodeJS.Signals): void => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree("SIGTERM");
      setTimeout(() => killTree("SIGKILL"), 15_000).unref();
    }, opts.timeoutMs);
    const done = (code: number | null): void => {
      clearTimeout(timer);
      const clean = opts.redact(out);
      try {
        fs.writeFileSync(opts.logFile, clean, "utf8");
      } catch {
        /* the log is a convenience */
      }
      let cost: number | undefined;
      for (const line of out.trim().split("\n").reverse()) {
        if (!line.startsWith("{")) continue;
        try {
          const j = JSON.parse(line) as Record<string, unknown>;
          const c = opts.costField ? j[opts.costField] : undefined;
          if (typeof c === "number") cost = c;
          break;
        } catch {
          /* not the result line */
        }
      }
      resolve({ exit_code: code, timed_out: timedOut, minutes: Math.round(((Date.now() - started) / 60_000) * 10) / 10, ...(cost !== undefined ? { cost_usd: cost } : {}), tail: clean.slice(-600) });
    };
    child.on("error", (e) => {
      out += `\n[qamind] could not start the agent: ${e.message}\n`;
      done(null);
    });
    child.on("exit", (code) => done(code));
  });
}

/** Tracked files that differ from the commit, and the commit itself: a report-only run must leave both as they were. */
const tracked = (root: string): { head?: string; changed: string[] } => ({
  ...(git(root, ["rev-parse", "HEAD"]) ? { head: git(root, ["rev-parse", "HEAD"]) as string } : {}),
  changed: porcelainFiles(root, { untracked: false }).sort(),
});

function findRun(home: string, sinceIso: string): { summary: RunSummary; dir: string } | undefined {
  const projects = path.join(home, "projects");
  if (!fs.existsSync(projects)) return undefined;
  const found: RunSummary[] = [];
  for (const p of fs.readdirSync(projects)) {
    const runs = path.join(projects, p, "memory", "runs");
    if (!fs.existsSync(runs)) continue;
    for (const f of fs.readdirSync(runs)) {
      const s = readJson<RunSummary>(path.join(runs, f));
      if (s && s.trigger === "ci" && s.started >= sinceIso) found.push(s);
    }
  }
  const latest = found.sort((a, b) => b.started.localeCompare(a.started))[0];
  return latest ? { summary: latest, dir: path.dirname(latest.report) } : undefined;
}

const unfinishedRun = (home: string): string | undefined => {
  const projects = path.join(home, "projects");
  if (!fs.existsSync(projects)) return undefined;
  for (const p of fs.readdirSync(projects)) {
    const m = readJson<{ run_id?: string }>(path.join(projects, p, "state", "run-marker.json"));
    if (m?.run_id) return m.run_id;
  }
  return undefined;
};

const stateOf: Record<CiOutcomeOrError, StatusState> = { pass: "success", warn: "success", fail: "failure", error: "error" };

export async function runCi(opts: CiRunOptions): Promise<CiResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? ((): Date => new Date());
  const log = opts.log ?? ((): void => undefined);
  const root = fs.realpathSync(path.resolve(opts.projectDir));
  const started = now();
  const ctx = detectCi(env);
  const outDir = path.resolve(opts.outDir ?? path.join(root, "qamind-reports"));
  ensureDir(outDir);
  const warnings: string[] = [];

  const check = checkConfigFile(root, env);
  const cfg: QamindConfig | undefined = check.status === "ok" ? check.config : undefined;
  const settings = cfg?.ci ?? checkConfigFile(root, env).config?.ci ?? { fail_on: ["critical", "environment-problem"], warn_on: ["important"], cache_memory: false, mode: "diff" as CiMode, comment: true, status: true, status_context: "qamind", timeout_minutes: 25 };
  // Ticket mode needs a file inside the project that can be read as it is: a path with no spaces, not a link out of the checkout, small.
  let ticketRef: string | undefined;
  let ticketProblem: string | undefined;
  if (opts.ticket) {
    const abs = path.resolve(root, opts.ticket);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (rel.startsWith("..") || path.isAbsolute(rel)) ticketProblem = `the ticket file ${opts.ticket} is outside the project`;
    else if (/[\s"'`$;&|<>\\]/.test(rel)) ticketProblem = `the ticket file's path (${rel}) has a space or a special character: use a plain path`;
    else if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) ticketProblem = `there is no ticket file ${rel} in the project`;
    else if (fs.statSync(abs).size > TICKET_FILE_MAX) ticketProblem = `the ticket file ${rel} is larger than ${TICKET_FILE_MAX / 1000} KB: give a shorter story`;
    else ticketRef = rel;
  }
  const mode: CiRunMode = opts.ticket ? "ticket" : (opts.mode ?? settings.mode);
  const home = opts.home ?? (opts.userStore ? qamindHome(env) : settings.cache_memory ? path.join(root, ".qamind-ci", "home") : fs.mkdtempSync(path.join(os.tmpdir(), "qamind-ci-")));
  ensureDir(home);
  const poster = opts.dryRun ? { canComment: false, canStatus: false, why: ["a dry run posts nothing"] } : apiFor(ctx, settings, opts.fetchImpl);
  const post = async (state: StatusState, description: string): Promise<{ state: StatusState; posted: boolean }> => {
    if (!settings.status || !poster.canStatus || !poster.api) return { state, posted: false };
    try {
      await poster.api.setStatus(state, description, ctx.run_url);
      return { state, posted: true };
    } catch (e) {
      warnings.push(`The commit status could not be set: ${(e as Error).message}`);
      return { state, posted: false };
    }
  };

  /** Everything after a result is known: the files, the comment, the status. */
  const conclude = async (outcome: CiOutcomeOrError, p: { runDir?: string; runId?: string; gate?: CiGate; error?: string; agent?: AgentRun; bank?: ReturnType<typeof readRunData>["bank"] }): Promise<CiResult> => {
    const privacy: PrivacyContext = p.runDir ? contextForRun(p.runDir, env) : contextFrom(cfg, []);
    const adminFile = p.runDir ? path.join(p.runDir, "ADMIN-REPORT.md") : undefined;
    const adminReport = adminFile && fs.existsSync(adminFile) ? fs.readFileSync(adminFile, "utf8") : undefined;
    const minutes = Math.round(((now().getTime() - started.getTime()) / 60_000) * 10) / 10;
    const body = renderComment({ outcome, ...(p.gate ? { gate: p.gate } : {}), ...(adminReport ? { adminReport } : {}), ...(p.bank ? { bank: p.bank } : {}), mode, ...(ctx.sha ? { sha: ctx.sha } : {}), ...(ctx.run_url ? { runUrl: ctx.run_url } : {}), ...(p.error ? { error: p.error } : {}), minutes, now: now() }, privacy);
    fs.writeFileSync(path.join(outDir, "PR-COMMENT.md"), body, "utf8");
    if (p.runDir && p.runId) {
      try {
        fs.cpSync(p.runDir, path.join(outDir, p.runId), { recursive: true });
      } catch (e) {
        warnings.push(`The reports could not be copied to ${path.basename(outDir)}: ${(e as Error).message}`);
      }
    }
    let comment: CiResult["comment"];
    if (!settings.comment) comment = { action: "skipped", why: "ci.comment is false" };
    else if (!poster.canComment || !poster.api) comment = { action: "skipped", why: poster.why.join("; ") || "nothing to post to" };
    else {
      try {
        comment = await poster.api.upsertComment(body);
      } catch (e) {
        warnings.push(`The pull request comment could not be posted: ${(e as Error).message}`);
        comment = { action: "skipped", why: (e as Error).message };
      }
    }
    const reasons = p.gate?.reasons ?? (p.error ? [p.error] : []);
    const description = outcome === "pass" ? `No problem that fails this check${p.gate ? ` (${p.gate.facts.critical} critical, ${p.gate.facts.important} important)` : ""}` : outcome === "warn" ? `Passed with warnings: ${reasons.join("; ")}` : outcome === "fail" ? `Failed: ${reasons.join("; ")}` : `Could not check: ${p.error ?? "unknown"}`;
    const status = await post(stateOf[outcome], description);
    const result: CiResult = {
      outcome,
      exit_code: outcome === "fail" ? 1 : outcome === "error" ? 2 : 0,
      mode,
      ...(p.runId ? { run_id: p.runId } : {}),
      reasons,
      ...(p.gate ? { gate: p.gate } : {}),
      ...(p.error ? { error: p.error } : {}),
      comment,
      status,
      warnings,
      out_dir: outDir,
      ...(p.agent ? { agent: { exit_code: p.agent.exit_code, timed_out: p.agent.timed_out, ...(p.agent.cost_usd !== undefined ? { cost_usd: p.agent.cost_usd } : {}), minutes: p.agent.minutes } } : {}),
      store: home,
    };
    writeJson(path.join(outDir, "ci-result.json"), result);
    if (env["GITHUB_STEP_SUMMARY"]) {
      try {
        fs.appendFileSync(env["GITHUB_STEP_SUMMARY"], `${body.replace(/^<!--.*-->\n/, "")}\n`);
      } catch {
        /* the summary page is a convenience */
      }
    }
    if (env["GITHUB_OUTPUT"]) {
      try {
        fs.appendFileSync(env["GITHUB_OUTPUT"], `outcome=${outcome}\nexit_code=${result.exit_code}\n${p.runId ? `run_id=${p.runId}\n` : ""}`);
      } catch {
        /* same */
      }
    }
    return result;
  };

  if (!cfg) {
    const why = check.status === "ok" ? "the config could not be read" : `the QAMind config is not usable (${check.status}): ${[...check.problems, ...check.blocked.map((b) => `${b.url}: ${b.reason}`), ...check.ambiguous.map((a) => `${a.url}: ${a.reason}`)].join(" ") || "run /qa-only once to create it"}. In CI the config has to be in the repository (see docs/CI.md)`;
    return conclude("error", { error: why });
  }

  if (ticketProblem) return conclude("error", { error: ticketProblem });

  // ---------------------------------------------------------------------------------------------- judge an earlier run
  if (opts.fromRun) {
    const dir = path.join(root, ".qa", "reports", opts.fromRun);
    if (!fs.existsSync(path.join(dir, "data", "meta.json"))) return conclude("error", { error: `there is no run ${opts.fromRun} in ${path.join(root, ".qa", "reports")}` });
    const data = readRunData(dir);
    const gate = evaluateGate(data, settings);
    return conclude(gate.outcome, { runDir: dir, runId: opts.fromRun, gate, ...(data.bank ? { bank: data.bank } : {}) });
  }

  // ---------------------------------------------------------------------------------------------- start an agent
  const builtIn = !opts.agentCommand;
  const names = cfg.roles.flatMap((r) => [r.username_env, r.password_env]);
  const { values: logins } = loadQaEnv(root, env, names);
  if (!cfg.roles.some((r) => logins[r.username_env] && logins[r.password_env])) return conclude("error", { error: `no test account has both its username and password set (${names.join(", ")}). Give them to the job as secrets; values are never printed` });
  let spec: HeadlessSpec | undefined;
  if (builtIn) {
    if (!opts.host && !opts.hostSpec) return conclude("error", { error: "no host is named, so QAMind does not know which CLI to run (give the host, or --agent-command)" });
    try {
      spec = loadHeadless(opts.host ?? "", opts.hostSpec, env);
    } catch (e) {
      return conclude("error", { error: (e as Error).message });
    }
    // A CI machine is never signed in, so there the CLI must have credentials; a developer's machine often is (set QAMIND_CI_SKIP_AUTH_CHECK=1, or run `qamind ci` outside CI, where it is not asked).
    if (!hasAuth(spec, env) && ctx.provider !== "local" && env["QAMIND_CI_SKIP_AUTH_CHECK"] !== "1") return conclude("error", { error: `no ${spec.label} credentials in the environment (${spec.auth_hint}). Add one as a secret of the job` });
  }

  if (ctx.base_ref && ctx.provider !== "local") {
    const ref = `origin/${ctx.base_ref}`;
    if (git(root, ["rev-parse", "--verify", "--quiet", ref]) === undefined) git(root, ["fetch", "--no-tags", "--depth=100", "origin", `${ctx.base_ref}:refs/remotes/origin/${ctx.base_ref}`], 90_000);
    if (git(root, ["rev-parse", "--verify", "--quiet", ref]) === undefined) warnings.push(`The base branch ${ref} is not available (use fetch-depth: 0 in the checkout), so diff mode cannot tell what changed.`);
  }
  const before = tracked(root);
  await post("pending", "QAMind is checking this change");

  const secrets = [...Object.values(logins), ...[...(spec?.auth_env_any ?? []), "GITHUB_TOKEN", "QAMIND_GITLAB_TOKEN", "GITLAB_TOKEN"].map((k) => env[k] ?? "")].filter((v) => v.length >= 4);
  const redact = makeRedactor(secrets).text;
  const prompt = promptFor(spec ? invokeFor(spec, ticketRef ? `--ticket ${ticketRef}` : mode) : `Run the QAMind QA procedure in ${mode} mode${ticketRef ? ` for the ticket in ${ticketRef} (--ticket ${ticketRef})` : ""}.`, mode, ctx.pr, ctx.base_ref);
  const childEnv = agentEnv(env, {
    QAMIND_HOME: home,
    QAMIND_TRIGGER: "ci",
    QAMIND_PROJECT_DIR: root,
    QAMIND_AUTO: "0",
    QAMIND_CI_PROMPT: prompt,
    QAMIND_CI_MODE: mode,
    ...(ctx.base_ref && git(root, ["rev-parse", "--verify", "--quiet", `origin/${ctx.base_ref}`]) ? { QAMIND_BASE_REF: `origin/${ctx.base_ref}` } : {}),
  }, spec?.child_env_remove ?? []);
  const maxCost = cfg.budget.modes.ci?.max_cost ?? cfg.budget.max_cost ?? DEFAULT_CI_MAX_USD;
  const timeoutMinutes = Math.min(settings.timeout_minutes, 360);
  log(`QAMind CI: ${mode} mode${ctx.pr !== undefined ? `, pull request #${ctx.pr}` : ""}; the agent is stopped after ${timeoutMinutes} minutes.`);
  const sinceIso = new Date(started.getTime() - 1000).toISOString();
  const agent = await runAgent(
    spec ? agentCommandOf(spec, env) : (opts.agentCommand as string),
    spec ? agentArgs(spec, { prompt, plugin: pluginRoot(), maxCost, mode, ...(opts.model ? { model: opts.model } : {}) }) : [],
    { shell: !spec, cwd: root, env: childEnv, timeoutMs: opts.timeoutMs ?? timeoutMinutes * 60_000, logFile: path.join(outDir, "agent.log"), redact, ...(spec ? { costField: spec.cost_field } : {}) },
  );
  log(`QAMind CI: the agent finished after ${agent.minutes} minutes (exit code ${agent.exit_code ?? "none"}${agent.timed_out ? ", stopped at the time limit" : ""}).`);

  // A report-only run changes nothing in the checkout.
  const after = tracked(root);
  if (before.head !== after.head || after.changed.join("\n") !== before.changed.join("\n")) {
    const files = after.changed.filter((f) => !before.changed.includes(f));
    return conclude("error", { agent, error: `the run changed the checkout, which a report-only run must never do (${before.head !== after.head ? "the commit changed" : `changed: ${files.slice(0, 5).join(", ")}`}). Nothing was reverted: look at agent.log in the artifacts` });
  }

  const run = findRun(home, sinceIso);
  if (!run) {
    const open = unfinishedRun(home);
    return conclude("error", {
      agent,
      error: `${agent.timed_out ? `the agent was stopped at the time limit${opts.timeoutMs ? "" : ` of ${timeoutMinutes} minutes`}` : `the agent ended (exit code ${agent.exit_code ?? "none"})`} before it finished a run${open ? ` (${open} was started and left open)` : ""}. The last of its output is in agent.log in the artifacts`,
    });
  }
  const data = readRunData(run.dir);
  const gate = evaluateGate(data, settings);
  return conclude(gate.outcome, { runDir: run.dir, runId: run.summary.run_id, gate, agent, ...(data.bank ? { bank: data.bank } : {}) });
}
