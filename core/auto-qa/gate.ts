import path from "node:path";
import { checkConfigFile } from "../lib/config.ts";
import { loadQaEnv } from "../lib/dotenv.ts";
import { dailyBudgetProblem, dayOf } from "../lib/budget.ts";
import { ensureDir, exists, readJson, writeJson } from "../lib/fsutil.ts";
import { isRepo } from "../lib/fix/gitops.ts";
import { ensureProjectStore, resolveProject } from "../lib/project.ts";
import type { ProjectInfo } from "../lib/project.ts";
import { storeDir, storeSubdirs } from "../lib/paths.ts";
import { findActiveMarkers } from "../lib/run.ts";
import { changedInTask, stateHash, takeSnapshot } from "./changes.ts";
import { buildReason } from "./prompt.ts";
import { AutoTooNewError, globalAutoFile, projectAutoFile, readAutoFile, resolveEffective } from "./settings.ts";
import type { AutoEffective, AutoMode } from "./settings.ts";
import { ANY_SESSION, AUTO_PENDING, AUTO_SKIP, NEXT_RUN, TASK_START, dropSession, getSession, putSession, readLast, readLastRun, writeLast } from "./state.ts";
import type { NextRun, PendingRun, SessionNotice, TaskStart } from "./state.ts";
import { isContinuation, isQaCommand, parseTags } from "./tags.ts";

/**
 * The auto-QA gate (spec 9.5). Two hook events feed it: UserPromptSubmit records what the prompt asked for (tags) and a snapshot of the project, and
 * Stop decides, with the rules in the spec's order, whether Claude must run QA before it finishes. It never throws and never writes anything for a
 * project that has auto-QA off and no tag in the prompt, so a project that never opted in is not touched.
 */
export interface HookEnv {
  home: string;
  env: NodeJS.ProcessEnv;
  now: Date;
  /** How this host tells the agent to run the internal QA skill (`{mode}` is replaced); Claude Code's wording when absent. */
  invoke?: string;
}

export interface StopInput {
  session_id?: string;
  cwd?: string;
  stop_hook_active?: boolean;
}

export interface PromptInput {
  session_id?: string;
  cwd?: string;
  prompt?: string;
}

/** What the hook prints (Claude Code JSON). `{}` is "no opinion". */
export interface HookOutput {
  decision?: "block";
  reason?: string;
  systemMessage?: string;
}

export interface Decision {
  action: "block" | "skip";
  /** The spec's rule that ended it ("1" ... "7"), or a short name for a precondition. */
  rule: string;
  why: string;
  output?: HookOutput;
}

interface Where {
  root: string;
  info: ProjectInfo;
  store: string;
  session: string;
}

/** A folder variable that a host left unexpanded (`${workspaceFolder}`) is not a folder. */
export const usableDir = (v: string | undefined): string | undefined => (v && v.trim() !== "" && !v.includes("${") ? v : undefined);

/** The project the hook fires for: the host's project folder when it says so (the same folder the qa-memory server uses), else the session's working folder. */
function locate(input: { session_id?: string; cwd?: string }, h: HookEnv): Where | undefined {
  const dir = usableDir(h.env["QAMIND_PROJECT_DIR"]) || usableDir(h.env["CLAUDE_PROJECT_DIR"]) || usableDir(h.env["CURSOR_PROJECT_DIR"]) || input.cwd;
  if (!dir || !exists(dir)) return undefined;
  const info = resolveProject(dir);
  return { root: info.root, info, store: storeDir(h.home, info.id), session: input.session_id || "unknown-session" };
}

export function effectiveFor(store: string, h: HookEnv): AutoEffective {
  const project = readAutoFile(projectAutoFile(store));
  const global = readAutoFile(globalAutoFile(h.home));
  const tooNew = project.too_new ? `the project's auto.json was written by a newer QAMind` : global.too_new ? `the global auto.json was written by a newer QAMind` : undefined;
  return resolveEffective(project.settings, global.settings, h.env, h.now, tooNew);
}

/** UserPromptSubmit: read the tags, remember them for the Stop hook, and take the start-of-task snapshot. Writes nothing when auto-QA is off and no tag asks for it. */
export function onPrompt(input: PromptInput, h: HookEnv): void {
  const where = locate(input, h);
  if (!where) return;
  const prompt = input.prompt ?? "";
  // A host that submits our block message back as the next prompt (Cursor does) must not start a new task out of it: the QA run it asks for belongs to the task before.
  if (isContinuation(prompt)) return;
  const tags = parseTags(prompt);
  const eff = effectiveFor(where.store, h);
  if (!eff.enabled && !tags.force) {
    // A record from an older task must not outlive the setting being turned off, or a stale tag would fire on the next Stop.
    dropSession(where.store, NEXT_RUN, where.session);
    dropSession(where.store, TASK_START, where.session);
    return;
  }
  ensureProjectStore(h.home, where.info, h.now);
  const at = h.now.toISOString();
  const next: NextRun = { at, ...(tags.noqa ? { noqa: true } : {}), ...(tags.force ? { force: tags.force } : {}), ...(isQaCommand(prompt) ? { qa_command: true } : {}) };
  putSession(where.store, NEXT_RUN, where.session, next);
  if (tags.noqa || next.qa_command) {
    dropSession(where.store, TASK_START, where.session);
    return;
  }
  const snap = takeSnapshot(where.root);
  if (snap) putSession<TaskStart>(where.store, TASK_START, where.session, { at, ...(snap.head ? { head: snap.head } : {}), files: snap.files, ...(snap.truncated ? { truncated: true } : {}) });
  else dropSession(where.store, TASK_START, where.session);
}

const skip = (rule: string, why: string, systemMessage?: string): Decision => ({ action: "skip", rule, why, ...(systemMessage ? { output: { systemMessage } } : {}) });

/** Say it once per session: a record of the reason is kept, and the same session is not told again. */
function onceNotice(where: Where, h: HookEnv, rule: string, reason: string, force: boolean): Decision {
  if (!force && (getSession<SessionNotice>(where.store, AUTO_SKIP, where.session) ?? getSession<SessionNotice>(where.store, AUTO_SKIP, ANY_SESSION))) return skip(rule, `${reason} (already reported in this session)`);
  putSession<SessionNotice>(where.store, AUTO_SKIP, where.session, { at: h.now.toISOString(), reason });
  return skip(rule, reason, `Auto-QA skipped: ${reason}`);
}

function dailyBudget(where: Where, h: HookEnv): Decision | undefined {
  if (!exists(path.join(where.root, ".qa", "config.md"))) return undefined;
  const config = checkConfigFile(where.root, h.env).config;
  const problem = config ? dailyBudgetProblem(where.store, config, h.now) : undefined;
  if (!problem) return undefined;
  const file = path.join(storeSubdirs(where.store).state, "budget-notice.json");
  const today = dayOf(h.now);
  let told: string | undefined;
  try {
    told = (readJson<{ day?: string }>(file) ?? {}).day;
  } catch {
    told = undefined;
  }
  if (told === today) return skip("budget", problem);
  ensureDir(path.dirname(file));
  writeJson(file, { day: today });
  return skip("budget", problem, `Auto-QA paused for today: ${problem}`);
}

/** Credentials and configuration the run needs, checked without printing any value. Returns the reason it cannot run, or undefined. */
function cannotRun(root: string, h: HookEnv): string | undefined {
  if (!exists(path.join(root, ".qa", "config.md"))) return "this project has no .qa/config.md yet. Run the QAMind qa-only skill once to set it up.";
  const check = checkConfigFile(root, h.env);
  if (check.status !== "ok" || !check.config) return `.qa/config.md is not usable (${check.status}). Run the QAMind qa-only skill to see what to fix.`;
  const names = check.config.roles.flatMap((r) => [r.username_env, r.password_env]);
  const { values } = loadQaEnv(root, h.env, names);
  if (!check.config.roles.some((r) => !!values[r.username_env] && !!values[r.password_env])) return "no test account has both its username and password in .env.qa.";
  return undefined;
}

/** Stop: the seven gate rules of spec 9.5, in order. Pure of any host: it returns the decision and the JSON the hook prints. */
export function onStop(input: StopInput, h: HookEnv): Decision {
  const where = locate(input, h);
  if (!where) return skip("0", "no project folder");
  const next = getSession<NextRun>(where.store, NEXT_RUN, where.session);
  const start = getSession<TaskStart>(where.store, TASK_START, where.session);
  const consume = (): void => {
    dropSession(where.store, NEXT_RUN, where.session);
    dropSession(where.store, TASK_START, where.session);
  };

  // Rules 1 and 2 only read; rule 3 comes before anything is written for a task, so the Stop that follows our own block can never loop.
  const eff = effectiveFor(where.store, h);
  const forced = next?.force;
  if (next?.noqa) {
    consume();
    return skip("1", "#noqa in the prompt");
  }
  if (!eff.enabled && !forced) {
    consume();
    return skip("2", eff.why);
  }
  if (input.stop_hook_active) return skip("3", "stop_hook_active (a Stop hook already made Claude continue)");

  // A host that gives the QA skill no session id (Cursor) leaves the run's session empty: then the project's own run counts, since the store is per project.
  const sameSession = (id: string | undefined): boolean => id === where.session || !id;
  const marker = findActiveMarkers(h.home, h.now).find((m) => m.store === where.store && sameSession(m.session_id));
  const last = readLastRun(where.store);
  const ranQaThisTask = !!next && !!last && sameSession(last.session_id) && last.finished >= next.at;
  if (next?.qa_command || marker || ranQaThisTask) {
    consume();
    return skip("4", "the task that just finished was itself a QA run");
  }

  if (!start) {
    consume();
    // The task began before auto-QA was on (or this is a folder with no git): there is no way to say what it changed.
    return isRepo(where.root) ? skip("5", "no start-of-task snapshot (auto-QA was turned on during this task)") : onceNotice(where, h, "5", "this folder is not a git repository, so there is no way to tell what a task changed.", !!forced);
  }
  const now = takeSnapshot(where.root);
  const startSnap = { ...(start.head ? { head: start.head } : {}), files: start.files, truncated: !!start.truncated };
  const changed = now ? changedInTask(where.root, startSnap, now, eff.ignore) : [];
  const hash = now ? stateHash(now, eff.ignore) : "";
  const lastAuto = readLast(where.store);
  if (!now || changed.length === 0 || lastAuto?.state_hash === hash) {
    consume();
    const why = changed.length === 0 ? "this task changed no code (documentation, lock files and ignored paths do not count)" : "nothing changed since the last auto-QA run";
    return skip("5", why, forced ? `Auto-QA: #${forced} was given, but ${why}, so no QA run.` : undefined);
  }

  if (!forced && lastAuto && eff.cooldown_minutes > 0 && h.now.getTime() - Date.parse(lastAuto.at) < eff.cooldown_minutes * 60_000) {
    consume();
    return skip("6", `cooldown: the last auto-QA run was less than ${eff.cooldown_minutes} minutes ago`);
  }

  // The daily budget (spec 13.6): auto-QA and CI together may use `budget.daily_max` minutes a day. When it is used up auto-QA pauses itself for the day, says so once, and a #qa tag still runs.
  const daily = forced ? undefined : dailyBudget(where, h);
  if (daily) {
    consume();
    return daily;
  }

  // The QA skill told us earlier in this session that a run cannot happen (app not reachable, ...): it was reported once, so stay quiet. A tag tries again.
  const told = getSession<SessionNotice>(where.store, AUTO_SKIP, where.session) ?? getSession<SessionNotice>(where.store, AUTO_SKIP, ANY_SESSION);
  if (told && !forced) {
    consume();
    return skip("precondition", `a run could not happen earlier in this session (${told.reason})`);
  }

  const problem = cannotRun(where.root, h);
  if (problem) {
    consume();
    return onceNotice(where, h, "precondition", problem, !!forced);
  }

  const mode: AutoMode = forced === "qa-full" ? "full" : forced === "qa-fix" ? "fix" : forced === "qa" ? (eff.enabled && eff.mode !== "ask" ? eff.mode : "diff") : eff.mode;
  const reason = buildReason({ mode, files: changed, ...(forced ? { forced } : {}), budgetMinutes: eff.time_budget_minutes, ...(h.invoke ? { invoke: h.invoke } : {}) });
  if (forced) dropSession(where.store, AUTO_SKIP, where.session); // a deliberate retry: if it fails again the skill says so again
  putSession<PendingRun>(where.store, AUTO_PENDING, where.session, { at: h.now.toISOString(), mode });
  writeLast(where.store, { at: h.now.toISOString(), state_hash: hash, mode, files: changed.slice(0, 200), session_id: where.session, ...(forced ? { forced } : {}) });
  consume();
  return { action: "block", rule: "7", why: `${changed.length} changed file(s), mode ${mode}`, output: { decision: "block", reason } };
}

const PENDING_MINUTES = 30;
const AUTO_SKILLS = new Set(["qamind:qa-auto-run", "qa-auto-run"]);

/**
 * PreToolUse for the Skill tool: the one call that answers a block of ours is approved here, in code, so the user is not asked to approve the internal skill every time
 * auto-QA, which they turned on, does its job. It is approved only while the gate really blocked this session in the last 30 minutes, and only once; any other Skill call, or the same
 * one at any other time, is left to the host's normal permission prompt. Returns the reason shown to the user, or undefined for "no opinion".
 */
export function approveAutoSkill(input: { session_id?: string; cwd?: string; tool_name?: string; tool_input?: Record<string, unknown> }, h: HookEnv): string | undefined {
  if (input.tool_name !== "Skill" || !AUTO_SKILLS.has(String(input.tool_input?.["skill"] ?? ""))) return undefined;
  const where = locate(input, h);
  if (!where) return undefined;
  const pending = getSession<PendingRun>(where.store, AUTO_PENDING, where.session);
  if (!pending || h.now.getTime() - Date.parse(pending.at) > PENDING_MINUTES * 60_000) return undefined;
  dropSession(where.store, AUTO_PENDING, where.session);
  return `QAMind auto-QA asked for this QA run (${pending.mode} mode) after a task that changed code, and auto-QA is turned on for this project.`;
}

/** Run a hook body so that nothing it does can break the user's session: an error is a silent "no opinion". */
export function safely<T>(body: () => T): T | undefined {
  try {
    return body();
  } catch (err) {
    if (err instanceof AutoTooNewError || process.env["QAMIND_DEBUG"]) process.stderr.write(`qamind auto-QA: ${(err as Error).message}\n`);
    return undefined;
  }
}
