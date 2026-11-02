import path from "node:path";
import type { Severity } from "../config.ts";
import { readJson, writeJson } from "../fsutil.ts";

/**
 * The fix loop's record for one run: what was attempted, the proof for each fix, and the counters behind the stop rules (spec 9.3).
 * It lives in the run folder (`data/fix-state.json`), is written only by the fix tools (the safety hook refuses edits to it), and is
 * what the reports render, so what the report says about a fix is what the tools actually did.
 */
export const FIX_STATE_SCHEMA = 1;
/** Stop and ask after this many reverts (spec 9.3). */
export const MAX_REVERTS = 2;
/** Pause to show progress after every this many fixes (spec 9.3). */
export const PAUSE_EVERY = 5;
/** A fix that needs more files than this is a change to stop and ask about (knowledge/fixing-safely.md). */
export const MAX_FILES_PER_FIX = 5;

export type FixOutcome = "verified" | "best-effort" | "reverted" | "deferred";
export type StopKind = "reverts" | "pause" | "unrelated-files" | "wide-change" | "cap";

export interface TestRunRecord {
  command: string;
  exit_code: number | null;
  passed: boolean;
  timed_out: boolean;
  duration_s: number;
  at: string;
  /** The end of the output, masked for secrets. */
  tail: string;
}

export interface SuiteRecord extends TestRunRecord {
  /** Names of failing tests when the runner's output was understood; empty does not mean none failed. */
  failed_tests: string[];
}

export interface FixAttempt {
  issue: string;
  severity: Severity;
  title: string;
  status: "in-progress" | FixOutcome;
  /** The diagnosis in two sentences: what is wrong and where. */
  plan: string;
  /** Production files this attempt declared it would change. */
  files: string[];
  /** The regression test file(s). */
  test_files: string[];
  started_at: string;
  finished_at?: string;
  /** The regression test run with the fix taken out: it must fail. */
  without_fix?: TestRunRecord;
  /** The same test run with the fix in: it must pass. */
  with_fix?: TestRunRecord;
  commit?: string;
  commit_files?: string[];
  summary?: string;
  root_cause?: string;
  recheck?: string;
  adjacent?: string;
  /** Why a fix is best-effort rather than verified. */
  best_effort_reason?: string;
  /** Why it was reverted or deferred. */
  reason?: string;
  defer_kind?: string;
  /** The revert commit, when a committed fix was undone. */
  reverted_by?: string;
  /** Where an undone attempt's files were kept as evidence. */
  saved_to?: string;
}

export interface SuiteComparison {
  verdict: "no-regression" | "regression" | "cannot-compare";
  regressions: string[];
  note: string;
}

export interface FixState {
  schema_version: number;
  run: string;
  branch: string;
  base_branch?: string;
  base_commit: string;
  started: string;
  max_fixes: number;
  severities: Severity[];
  commands: { suite?: string; file?: string };
  /** True when the user agreed to fix without the web UIs having been tested (for example the browser tool was unavailable). */
  api_only?: boolean;
  baseline?: SuiteRecord;
  after?: SuiteRecord;
  comparison?: SuiteComparison;
  attempts: FixAttempt[];
  reverts: number;
  reverts_at_last_continue: number;
  paused_at: number;
  stop?: { kind: StopKind; reason: string; at: string };
  continues: Array<{ at: string; reason: string; was: StopKind }>;
}

export const statePath = (runDir: string): string => path.join(runDir, "data", "fix-state.json");

export function loadFixState(runDir: string): FixState | undefined {
  const s = readJson<FixState>(statePath(runDir));
  return s && Array.isArray(s.attempts) ? s : undefined;
}

export function saveFixState(runDir: string, state: FixState): void {
  writeJson(statePath(runDir), state);
}

/** Fixes that are in the branch right now: committed, and not undone since. */
export const committedFixes = (s: FixState): FixAttempt[] => s.attempts.filter((a) => a.status === "verified" || a.status === "best-effort");

export const activeAttempt = (s: FixState): FixAttempt | undefined => s.attempts.find((a) => a.status === "in-progress");

export const attemptFor = (s: FixState, issue: string): FixAttempt | undefined => [...s.attempts].reverse().find((a) => a.issue === issue);

/** Which stop rule, if any, applies now (spec 9.3). A stop already pending is kept: it is cleared only by `fix_continue`. */
export function pendingStop(s: FixState): FixState["stop"] | undefined {
  if (s.stop) return s.stop;
  const done = committedFixes(s).length;
  const at = new Date().toISOString();
  if (done >= s.max_fixes) return { kind: "cap", reason: `The cap of ${s.max_fixes} fixes for this run was reached. Stop here and report; the cap is final for this run (it is set in fix_policy.max_fixes).`, at };
  if (s.reverts - s.reverts_at_last_continue >= MAX_REVERTS) return { kind: "reverts", reason: `${MAX_REVERTS} fixes were reverted. Stop, show what happened, and ask the user how to continue.`, at };
  if (done > 0 && done % PAUSE_EVERY === 0 && done > s.paused_at) return { kind: "pause", reason: `${done} fixes are committed. Pause: show the user the progress (files touched, anything that drifted from the minimal change) and ask whether to go on.`, at };
  return undefined;
}

/** Record a stop if one applies. Returns it. */
export function applyStop(s: FixState): FixState["stop"] | undefined {
  const stop = pendingStop(s);
  if (stop && !s.stop) s.stop = stop;
  return s.stop;
}
