import path from "node:path";
import { ensureDir, writeJson } from "../lib/fsutil.ts";
import { withStoreLock } from "../lib/memory/lock.ts";
import { storeSubdirs } from "../lib/paths.ts";
import { readJsonTolerant } from "./settings.ts";
import type { AutoMode } from "./settings.ts";
import type { ForceTag } from "./tags.ts";

/**
 * What auto-QA remembers between its two hooks, in `<store>/state/`. Everything per session is keyed by the host's session id, because
 * two sessions can work in one project at once, and old sessions are pruned. Nothing here is written for a project that has auto-QA off.
 */
const KEEP_SESSIONS = 30;

export interface NextRun {
  at: string;
  noqa?: boolean;
  force?: ForceTag;
  /** The prompt was itself a QAMind QA command, so the task is a QA run (spec 9.5 rule 4). */
  qa_command?: boolean;
}

export interface TaskStart {
  at: string;
  /** HEAD when the task began, to see commits made during it. */
  head?: string;
  /** Content hash of every file that was changed or untracked when the task began. */
  files: Record<string, string>;
  truncated?: boolean;
}

export interface AutoLast {
  at: string;
  state_hash: string;
  mode: AutoMode;
  files: string[];
  session_id?: string;
  forced?: ForceTag;
}

/** The gate blocked this session and asked for a QA run: the one Skill call that answers it may be approved by the PreToolUse hook. */
export interface PendingRun {
  at: string;
  mode: AutoMode;
}

export interface SessionNotice {
  at: string;
  reason: string;
}

/** The last QA run that finished, written by `run finish`: how the gate recognises that a task was itself a QA run. */
export interface LastRun {
  run_id: string;
  session_id?: string;
  trigger: string;
  kind: string;
  started: string;
  finished: string;
}

export const stateFile = (store: string, name: string): string => path.join(storeSubdirs(store).state, name);
export const NEXT_RUN = "next-run.json";
export const TASK_START = "task-start.json";
export const AUTO_LAST = "auto-last.json";
export const AUTO_SKIP = "auto-skip.json";
export const LAST_RUN = "last-run.json";
export const AUTO_PENDING = "auto-pending.json";

type SessionMap<T> = Record<string, T & { at: string }>;

function readMap<T>(file: string): SessionMap<T> {
  const v = readJsonTolerant(file);
  return v && typeof v === "object" && !Array.isArray(v) ? (v as SessionMap<T>) : {};
}

export const getSession = <T>(store: string, name: string, session: string): (T & { at: string }) | undefined => readMap<T>(stateFile(store, name))[session];

export function putSession<T extends { at: string }>(store: string, name: string, session: string, value: T): void {
  ensureDir(storeSubdirs(store).state);
  withStoreLock(store, () => {
    const map = readMap<T>(stateFile(store, name));
    map[session] = value;
    const keep = Object.entries(map).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, KEEP_SESSIONS);
    writeJson(stateFile(store, name), Object.fromEntries(keep));
  });
}

export function dropSession(store: string, name: string, session: string): void {
  const file = stateFile(store, name);
  if (readMap(file)[session] === undefined) return;
  withStoreLock(store, () => {
    const map = readMap(file);
    delete map[session];
    writeJson(file, map);
  });
}

export const readLast = (store: string): AutoLast | undefined => {
  const v = readJsonTolerant(stateFile(store, AUTO_LAST)) as AutoLast | null | undefined;
  return v && typeof v.at === "string" && typeof v.state_hash === "string" ? v : undefined;
};

export function writeLast(store: string, last: AutoLast): void {
  ensureDir(storeSubdirs(store).state);
  withStoreLock(store, () => writeJson(stateFile(store, AUTO_LAST), last));
}

export const readLastRun = (store: string): LastRun | undefined => {
  const v = readJsonTolerant(stateFile(store, LAST_RUN)) as LastRun | null | undefined;
  return v && typeof v.finished === "string" ? v : undefined;
};

export function writeLastRun(store: string, run: LastRun): void {
  ensureDir(storeSubdirs(store).state);
  writeJson(stateFile(store, LAST_RUN), run);
}
