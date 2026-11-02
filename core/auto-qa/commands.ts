import path from "node:path";
import { parseArgs } from "node:util";
import { exists } from "../lib/fsutil.ts";
import { isRepo } from "../lib/fix/gitops.ts";
import { storeDir } from "../lib/paths.ts";
import { ensureProjectStore, resolveProject } from "../lib/project.ts";
import { effectiveFor } from "./gate.ts";
import type { HookEnv } from "./gate.ts";
import { AUTO_MODES, DEFAULT_IGNORE, globalAutoFile, parseDuration, projectAutoFile, readAutoFile, updateAutoFile } from "./settings.ts";
import type { AutoMode, AutoSettings } from "./settings.ts";
import { ANY_SESSION, AUTO_SKIP, putSession, readLast } from "./state.ts";
import type { SessionNotice } from "./state.ts";

/**
 * `qamind auto ...`: the toggle behind `/qa-auto` (spec 9.5). Every command prints one JSON document; `message` says in plain words what happened.
 * Project settings go in `<store>/auto.json` and the global default in `$QAMIND_HOME/auto.json`, both in the user's private store.
 */
export class AutoUsageError extends Error {}

export const AUTO_HELP = `qamind auto: auto-QA after every agent task (default OFF)
  auto status [--project DIR]            state, mode, last auto run, what would trigger next
  auto on | off [--project DIR]          turn it on or off for this project (on also ends a pause)
  auto mode diff|quick|full|fix|ask      what runs after a task
  auto pause DURATION                    switch it off for a while (30m, 1h, 2d); it switches itself back on
  auto resume                            end a pause now
  auto global on|off                     the default for every project (a project's own setting wins)
  auto set cooldown MINUTES | budget MINUTES | ignore GLOB,GLOB | ignore default
  auto skipped [--session ID] --reason TEXT   (used by the auto-QA skill) tell the gate why a run could not happen
`;

const MODE_TEXT: Record<AutoMode, string> = {
  diff: "QA of the files the task changed and what depends on them (report only)",
  quick: "the diff scope plus a smoke check of the critical flows (report only)",
  full: "a full report-only QA run (slow)",
  fix: "QA, then fixes for critical and important problems on a branch (every fix rule applies)",
  ask: "asks you each time: run QA on these changes?",
};

function parse(args: string[], options: Record<string, { type: "string" }>) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new AutoUsageError((err as Error).message);
  }
}

const settingsText = (s: AutoSettings): Record<string, unknown> => {
  const { schema_version: _v, ...rest } = s;
  return rest;
};

export function autoCommand(args: string[], h: HookEnv, cwd: string): Record<string, unknown> {
  const [sub, ...rest] = args;
  if (!sub || sub === "help") return { help: AUTO_HELP };
  if (sub === "global") return globalCommand(rest, h);

  const { values, positionals } = parse(rest, { project: { type: "string" }, session: { type: "string" }, reason: { type: "string" } });
  const root = path.resolve((values.project as string | undefined) ?? cwd);
  if (!exists(root)) throw new AutoUsageError(`The folder ${root} does not exist.`);
  const info = resolveProject(root);
  const store = storeDir(h.home, info.id);
  const file = projectAutoFile(store);
  const project = { id: info.id, name: info.name, root: info.root };
  const warnings: string[] = [];
  const write = (patch: Parameters<typeof updateAutoFile>[2]): AutoSettings => {
    ensureProjectStore(h.home, info, h.now);
    return updateAutoFile(file, store, patch);
  };
  const state = (message: string): Record<string, unknown> => {
    const eff = effectiveFor(store, h);
    return { message, project, ...(warnings.length ? { warnings } : {}), effective: eff };
  };

  switch (sub) {
    case "status":
      return status(project, store, h);
    case "on": {
      if (!isRepo(info.root)) warnings.push("This folder is not a git repository: auto-QA needs git to see what a task changed, so it will skip every task until it is one.");
      if (!exists(path.join(info.root, ".qa", "config.md"))) warnings.push("No .qa/config.md yet: run the QAMind qa-only skill once to set up the config and the test logins. Until then auto-QA skips with a one-line notice.");
      write({ enabled: true, paused_until: undefined });
      const eff = effectiveFor(store, h);
      const note = eff.enabled ? "" : ` It is still off because ${eff.why}.`;
      return state(`Auto-QA is on for this project (mode ${eff.mode}: ${MODE_TEXT[eff.mode]}). It runs after every task that changes code; #noqa in a prompt skips one task.${note}`);
    }
    case "off":
      write({ enabled: false, paused_until: undefined });
      return state("Auto-QA is off for this project, starting with the very next task. #qa in a prompt still runs QA once.");
    case "mode": {
      const mode = positionals[0] as AutoMode | undefined;
      if (!mode || !(AUTO_MODES as readonly string[]).includes(mode)) throw new AutoUsageError(`mode needs one of: ${AUTO_MODES.join(", ")}.`);
      write({ mode });
      if (mode === "fix") warnings.push("Fix mode changes your code on a branch after each task. It still never pushes or merges, and every fix needs a regression test that fails without it.");
      if (mode === "full") warnings.push("Full mode is slow: a complete QA run after every task that changes code. Consider diff or quick.");
      const on = effectiveFor(store, h).enabled;
      return state(`Auto-QA mode for this project is ${mode}: ${MODE_TEXT[mode]}.${on ? "" : " Auto-QA itself is off: turn it on with `qamind auto on`."}`);
    }
    case "pause": {
      if (!positionals[0]) throw new AutoUsageError("pause needs a duration, for example 30m, 1h or 2d.");
      let ms: number;
      try {
        ms = parseDuration(positionals[0]);
      } catch (err) {
        throw new AutoUsageError((err as Error).message);
      }
      const until = new Date(h.now.getTime() + ms).toISOString();
      write({ paused_until: until });
      return state(`Auto-QA is paused until ${until}; it switches itself back on then.`);
    }
    case "resume":
      write({ paused_until: undefined });
      return state("The pause is over.");
    case "set": {
      const [key, ...value] = positionals;
      const text = value.join(" ").trim();
      if (key === "cooldown" || key === "budget") {
        const n = Number(text);
        if (!text || !Number.isFinite(n)) throw new AutoUsageError(`${key} needs a number of minutes.`);
        write(key === "cooldown" ? { cooldown_minutes: n } : { time_budget_minutes: n });
        return state(`${key === "cooldown" ? "Cooldown" : "Time budget"} is now ${n} minutes.`);
      }
      if (key === "ignore") {
        if (!text) throw new AutoUsageError("ignore needs a comma-separated list of globs, or the word default.");
        write({ ignore: text === "default" ? undefined : text.split(",").map((g) => g.trim()).filter(Boolean) });
        return state(text === "default" ? `Ignored paths are back to the default: ${DEFAULT_IGNORE.join(", ")}.` : "Ignored paths updated.");
      }
      throw new AutoUsageError("set needs cooldown, budget or ignore.");
    }
    case "skipped": {
      // A host that gives the skill no session id (Cursor) reports without one: it then applies to every session of the project.
      const session = (values.session as string | undefined) || ANY_SESSION;
      const reason = ((values.reason as string | undefined) ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (!reason) throw new AutoUsageError("skipped needs --reason (and --session where the host has one).");
      ensureProjectStore(h.home, info, h.now);
      putSession<SessionNotice>(store, AUTO_SKIP, session, { at: h.now.toISOString(), reason });
      return { message: `Recorded: auto-QA will not try again ${session === ANY_SESSION ? "in this project's sessions" : "in this session"} unless a prompt carries #qa.`, project };
    }
    default:
      throw new AutoUsageError(`Unknown auto command "${sub}".\n\n${AUTO_HELP}`);
  }
}

function globalCommand(rest: string[], h: HookEnv): Record<string, unknown> {
  const which = rest[0];
  if (which !== "on" && which !== "off") throw new AutoUsageError("global needs on or off.");
  const file = globalAutoFile(h.home);
  updateAutoFile(file, h.home, { enabled: which === "on" });
  return {
    message: which === "on" ? "Auto-QA is on by default for every project that has no setting of its own." : "Auto-QA is off by default for every project that has no setting of its own.",
    global: settingsText(readAutoFile(file).settings),
  };
}

function status(project: { id: string; name: string; root: string }, store: string, h: HookEnv): Record<string, unknown> {
  const eff = effectiveFor(store, h);
  const last = readLast(store);
  const mine = readAutoFile(projectAutoFile(store));
  const glob = readAutoFile(globalAutoFile(h.home));
  const trigger = eff.enabled
    ? eff.mode === "ask"
      ? "After a task that changes code (documentation, lock files and ignored paths do not count): QAMind asks whether to run QA."
      : `After a task that changes code (documentation, lock files and ignored paths do not count): a ${eff.mode} QA run, at most one every ${eff.cooldown_minutes} minutes. #noqa in a prompt skips one task.`
    : "Nothing: auto-QA is off. #qa, #qa-full or #qa-fix in a prompt runs QA once after that task.";
  return {
    project,
    enabled: eff.enabled,
    because: eff.why,
    mode: eff.mode,
    mode_means: MODE_TEXT[eff.mode],
    cooldown_minutes: eff.cooldown_minutes,
    time_budget_minutes: eff.time_budget_minutes,
    ignore: eff.ignore,
    ...(eff.paused_until ? { paused_until: eff.paused_until } : {}),
    project_setting: settingsText(mine.settings),
    global_setting: settingsText(glob.settings),
    last_auto_run: last ? { at: last.at, mode: last.mode, files: last.files.length, ...(last.forced ? { forced_by: `#${last.forced}` } : {}) } : null,
    would_trigger_next: trigger,
    host: "Claude Code: enforced by the Stop hook (the plugin must be installed and enabled).",
  };
}
