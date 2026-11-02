import fs from "node:fs";
import path from "node:path";
import type { Severity } from "../config.ts";
import { budgetStatus } from "../budget.ts";
import { ensureDir, readJson, writeJson } from "../fsutil.ts";
import { appendFixLog } from "../memory/fixlog.ts";
import type { RunScope } from "../memory/service.ts";
import { makeRedactor } from "../redact.ts";
import { assignIds, readRunData } from "../report.ts";
import type { Finding, FindingFix } from "../report.ts";
import { lintReports } from "../reports.ts";
import { detectStack } from "../stack.ts";
import { commitFiles, createBranch, currentBranch, defaultBranch, git, headCommit, isRepo, isTracked, numstat, restoreFromHead, revertCommit, shortCommit, stagedFiles, statusEntries } from "./gitops.ts";
import { compileRules, isTestPath, protectedReason, relativeToRoot } from "./protect.ts";
import type { ProtectionRule } from "./protect.ts";
import { MAX_FILES_PER_FIX, MAX_REVERTS, PAUSE_EVERY, FIX_STATE_SCHEMA, activeAttempt, applyStop, attemptFor, committedFixes, loadFixState, pendingStop, saveFixState } from "./state.ts";
import type { FixAttempt, FixOutcome, FixState, StopKind, SuiteComparison, SuiteRecord, TestRunRecord } from "./state.ts";
import { resolveTestCommands, runShell, withFiles } from "./testrun.ts";
import { SAFE_REL_PATH } from "./protect.ts";

/**
 * The fix loop (spec 9.3), as operations the agent calls through the qa-memory tools. Everything that can be checked is checked here, not
 * asked of the agent: a clean tree and a feature branch, a regression test that fails without the fix and passes with it (proved by taking
 * the fix out and putting it back), only the declared files changing, nothing protected touched, the stop rules, and never a push.
 */

const fail = (problem: string, message: string, extra: Record<string, unknown> = {}): { ok: false; problem: string; message: string } & Record<string, unknown> => ({ ok: false, problem, message, ...extra });

export function requireFixRun(scope: RunScope): void {
  const m = scope.ctx.marker;
  if (m.kind !== "qa" || m.readonly) {
    throw new Error(`Run ${scope.runId} is report-only (${m.kind}${m.trigger === "ci" ? ", started by CI" : ""}), so it cannot fix anything. The fix tools work only in a /qa run that was started with run_start kind "qa" by a person; CI runs never fix.`);
  }
}

function rulesOf(scope: RunScope): ProtectionRule[] {
  return compileRules(scope.ctx.marker.fix?.do_not_touch ?? scope.ctx.config.fix_policy.do_not_touch);
}

const redactor = (scope: RunScope) => makeRedactor(scope.ctx.passwords).text;

function stateOf(scope: RunScope): FixState {
  const s = loadFixState(scope.runDir);
  if (!s) throw new Error("The fix loop has not started for this run. Call fix_preflight first (after the baseline report is written).");
  return s;
}

const findingsFile = (runDir: string): string => path.join(runDir, "data", "findings.json");

function updateFinding(runDir: string, issue: string, patch: { fix_status?: Finding["fix_status"]; fix: FindingFix }): void {
  const list = readJson<Finding[]>(findingsFile(runDir)) ?? [];
  const f = list.find((x) => x.id === issue);
  if (!f) return;
  if (patch.fix_status) f.fix_status = patch.fix_status;
  else delete f.fix_status;
  f.fix = patch.fix;
  writeJson(findingsFile(runDir), list);
}

const norm = (p: string): string => p.replace(/\\/g, "/");

function relPaths(scope: RunScope, files: string[], what: string): { rel: string[]; problem?: string } {
  const rel: string[] = [];
  const rules = rulesOf(scope);
  for (const f of files) {
    const r = relativeToRoot(scope.ctx.projectRoot, f);
    if (r === undefined || r === "") return { rel, problem: `${what} "${f}" is outside the project.` };
    const why = protectedReason(r, rules);
    if (why) return { rel, problem: `${what}: ${why}. A fix must not touch it; leave the finding for a person.` };
    rel.push(r);
  }
  return { rel };
}

const stopPayload = (s: FixState): { kind: StopKind; reason: string; resumable: boolean } | undefined => (s.stop ? { kind: s.stop.kind, reason: s.stop.reason, resumable: s.stop.kind !== "cap" } : undefined);

const timeoutMs = (scope: RunScope): number => scope.ctx.config.fix_policy.test_timeout_s * 1000;

function toRecord(c: { command: string; exit_code: number | null; passed: boolean; timed_out: boolean; duration_s: number; output_tail: string }, now: Date): TestRunRecord {
  return { command: c.command, exit_code: c.exit_code, passed: c.passed, timed_out: c.timed_out, duration_s: c.duration_s, at: now.toISOString(), tail: c.output_tail };
}

function suiteRecord(run: Awaited<ReturnType<typeof runShell>>, now: Date): SuiteRecord {
  return { ...toRecord(run, now), failed_tests: run.failed_tests };
}

// ------------------------------------------------------------------------------------------------ preflight

const SEVERITY_ORDER: Severity[] = ["critical", "important", "minor"];

export function fixQueue(scope: RunScope, state?: FixState): Array<{ id: string; severity: Severity; title: string; area: string; regression_test?: Finding["regression_test"] }> {
  const data = readRunData(scope.runDir);
  const severities = state?.severities ?? scope.ctx.marker.fix?.severities ?? scope.ctx.config.fix_policy.fix_severities;
  const tried = new Set((state?.attempts ?? []).map((a) => a.issue));
  return data.findings
    .filter((f) => f.id && severities.includes(f.severity) && !tried.has(f.id) && !f.fix)
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || (a.id ?? "").localeCompare(b.id ?? ""))
    .map((f) => ({ id: f.id as string, severity: f.severity, title: f.title, area: f.area, ...(f.regression_test ? { regression_test: f.regression_test } : {}) }));
}

const proposedBranch = (now: Date): string => `qa/fix-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.toISOString().slice(11, 16).replace(":", "")}`;

function onDefaultBranch(root: string): { branch?: string; isDefault: boolean } {
  const branch = currentBranch(root);
  if (!branch) return { isDefault: true }; // a detached HEAD is no place for commits either
  const def = defaultBranch(root);
  if (def) return { branch, isDefault: branch === def };
  const locals = git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]).out.split("\n").filter(Boolean);
  return { branch, isDefault: locals.length <= 1 };
}

/** The web UIs of the config that have a test login: the ones a full or quick baseline has to have tested. */
export function testableUis(scope: RunScope): string[] {
  const cfg = scope.ctx.config;
  const credentialed = new Set(scope.ctx.roles.map((r) => r.name));
  const uis = new Set(cfg.web_uis.map((u) => u.name));
  return [...new Set(cfg.roles.filter((r) => credentialed.has(r.name) && uis.has(r.ui)).map((r) => r.ui))];
}

export async function preflight(scope: RunScope, now = new Date(), opts: { api_only?: boolean } = {}) {
  requireFixRun(scope);
  const root = scope.ctx.projectRoot;
  const existing = loadFixState(scope.runDir);
  if (existing) return { ok: true, resumed: true, ...statusOf(scope, existing), message: "The fix loop was already started for this run; here is where it stands." };

  if (!isRepo(root)) return fail("not-a-git-repo", "A fix run needs a git repository: every fix is a commit on a branch. Nothing was changed.");
  const head = headCommit(root);
  if (!head) return fail("no-commits", "The repository has no commits yet, so there is nothing to fix on a branch. Nothing was changed.");

  const baselineReport = path.join(scope.runDir, "TECHNICAL-REPORT.md");
  if (!fs.existsSync(findingsFile(scope.runDir)) || !fs.existsSync(baselineReport)) {
    return fail("no-baseline-report", "Write the baseline report before any fix: test the product (Phases 0 to 3), write the data files, run report build and report lint, then call fix_preflight again.");
  }
  const lint = lintReports(scope.runDir, scope.ctx.passwords, scope.store);
  if (!lint.ok) return fail("baseline-report-not-clean", "The baseline report must lint clean before any fix. Fix these first, rebuild, and call fix_preflight again.", { errors: lint.errors.slice(0, 8) });

  // "Run phases 0 to 3 fully before any fix" (spec 9.3): a full or quick baseline has tested every web UI that has a test login.
  if (!opts.api_only && (scope.mode === "full" || scope.mode === "quick")) {
    const covered = new Set(readRunData(scope.runDir).coverage.filter((r) => r.ui && (r.status === "tested" || r.status === "partial")).map((r) => r.ui as string));
    const missing = testableUis(scope).filter((ui) => !covered.has(ui));
    if (missing.length) {
      return fail(
        "baseline-incomplete",
        `The baseline is not complete: nothing is recorded as tested for ${missing.join(" and ")}. A ${scope.mode} run covers every web UI that has a test login, and fixing starts only after that. Test ${missing.length === 1 ? "it" : "them"} with the browser tools (load them with ToolSearch if you have not), record the result in coverage.json with the "ui" name, rebuild the reports, and call fix_preflight again. ` +
          "If the browser tools cannot be used, tell the user why and ask whether to fix only what the API testing found; only if they agree, call fix_preflight with api_only set to true.",
        { missing_uis: missing },
      );
    }
  }

  const dirty = statusEntries(root);
  const staged = stagedFiles(root);
  if (dirty.length || staged.length) {
    return fail("dirty-tree", "The working tree has uncommitted changes that are not yours. Stop and let the user choose: commit them, stash them, or abort. Never decide that for them and never discard their work. Nothing was changed.", { files: [...new Set([...dirty.map((e) => e.path), ...staged])].slice(0, 20) });
  }

  const where = onDefaultBranch(root);
  if (where.isDefault) {
    return fail("on-default-branch", "A fix run never commits to the default branch. Ask the user whether to create a branch for the fixes; if they agree, call fix_create_branch (the host will ask them to approve that call), then call fix_preflight again.", { branch: where.branch ?? "(detached HEAD)", suggested_branch: proposedBranch(now) });
  }

  const policy = scope.ctx.config.fix_policy;
  const commands = resolveTestCommands(policy, detectStack(root, now));
  if (!commands.suite || !commands.file) {
    return fail(
      "no-test-framework",
      `No way to run tests was found (suite command: ${commands.suite ?? "none"}; single-file command: ${commands.file ?? "none"}). Every fix needs a regression test, so no fix can be made. Propose a test framework in the report and ask the user before adding one, or ask them to set fix_policy.test_command and fix_policy.test_file_command in .qa/config.md.`,
    );
  }

  const redact = redactor(scope);
  const baselineRun = await runShell(commands.suite, { cwd: root, timeoutMs: timeoutMs(scope), redact, tailChars: 4000 });
  const baseline = suiteRecord(baselineRun, now);

  const data = readRunData(scope.runDir);
  assignIds(scope.runDir, data);
  for (const [from, to] of [["TECHNICAL-REPORT.md", "BASELINE-TECHNICAL-REPORT.md"], ["ADMIN-REPORT.md", "BASELINE-ADMIN-REPORT.md"]] as const) {
    const src = path.join(scope.runDir, from);
    const dst = path.join(scope.runDir, to);
    if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
  }

  const state: FixState = {
    schema_version: FIX_STATE_SCHEMA,
    run: scope.runId,
    branch: where.branch as string,
    ...(defaultBranch(root) ? { base_branch: defaultBranch(root) as string } : {}),
    base_commit: head,
    started: now.toISOString(),
    max_fixes: scope.ctx.marker.fix?.max_fixes ?? policy.max_fixes,
    severities: scope.ctx.marker.fix?.severities ?? policy.fix_severities,
    commands: { suite: commands.suite, file: commands.file },
    ...(opts.api_only ? { api_only: true } : {}),
    baseline,
    attempts: [],
    reverts: 0,
    reverts_at_last_continue: 0,
    paused_at: 0,
    continues: [],
  };
  saveFixState(scope.runDir, state);
  const queue = fixQueue(scope, state);
  return {
    ok: true,
    branch: state.branch,
    base_commit: shortCommit(root, head),
    commands: { ...commands.source, suite: commands.suite, file: commands.file },
    baseline: { passed: baseline.passed, exit_code: baseline.exit_code, failed_tests: baseline.failed_tests.length, duration_s: baseline.duration_s, tail: baseline.passed ? undefined : baseline.tail },
    warnings: [
      ...(baseline.passed ? [] : [`The test suite already fails before any fix${baseline.failed_tests.length ? ` (${baseline.failed_tests.length} failing test names found)` : " (the output was not understood, so old failures cannot be told from new ones later)"}. Do not fix anything in the failing area without telling the user.`]),
    ],
    queue,
    nothing_to_fix: queue.length === 0,
    limits: { max_fixes: state.max_fixes, pause_every: PAUSE_EVERY, stop_after_reverts: MAX_REVERTS, max_files_per_fix: MAX_FILES_PER_FIX, severities: state.severities },
    next: queue.length ? "For each finding in order: fix_begin, write the regression test, run it (it must fail), make the minimal fix, run it (it must pass), then fix_commit." : "Nothing is fixable at the allowed severities: report that and finish with run_finish.",
  };
}

// ------------------------------------------------------------------------------------------------ branch

export function createFixBranch(scope: RunScope, name: string | undefined, now = new Date()) {
  requireFixRun(scope);
  const root = scope.ctx.projectRoot;
  if (!isRepo(root) || !headCommit(root)) return fail("not-a-git-repo", "There is no git repository with a commit to branch from.");
  if (!onDefaultBranch(root).isDefault) return fail("already-on-a-branch", `Already on the branch ${currentBranch(root)}, which is not the default branch. No new branch is needed.`);
  if (statusEntries(root).length || stagedFiles(root).length) return fail("dirty-tree", "The working tree has uncommitted changes. Stop and let the user choose (commit, stash or abort) before any branch is created.");
  const branch = name ?? proposedBranch(now);
  if (!/^qa\/[A-Za-z0-9._-]{3,70}$/.test(branch)) return fail("bad-name", "A fix branch is named qa/<something> (letters, digits, . _ - only).");
  if (git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok) return fail("exists", `A branch named ${branch} already exists.`);
  const from = headCommit(root) as string;
  const r = createBranch(root, branch);
  if (!r.ok) return fail("git-failed", `git could not create the branch: ${r.err}`);
  return { ok: true, branch, from_commit: shortCommit(root, from), next: "Call fix_preflight again." };
}

// ------------------------------------------------------------------------------------------------ begin

export interface BeginInput {
  issue: string;
  files: string[];
  test_files: string[];
  plan: string;
}

export function begin(scope: RunScope, input: BeginInput, now = new Date()) {
  requireFixRun(scope);
  const state = stateOf(scope);
  const stop = applyStop(state);
  if (stop) {
    saveFixState(scope.runDir, state);
    return fail("stopped", `A stop rule is in force: ${stop.reason}`, { stop: stopPayload(state) });
  }
  const budget = budgetStatus(scope.ctx.marker.budget, scope.ctx.marker.started, now);
  if (budget.state === "over") return fail("time-budget-reached", `${budget.message} No new fix is started after the deadline: finish the report with what is committed, and leave the rest for a person.`);
  const open = activeAttempt(state);
  if (open) return fail("attempt-open", `${open.issue} is still being fixed. Finish it (fix_commit), undo it (fix_revert) or give it up (fix_defer) before starting another.`);
  const prior = attemptFor(state, input.issue);
  if (prior) return fail("already-attempted", `${input.issue} was already ${prior.status} in this run. Leave it for a person.`);
  const finding = readRunData(scope.runDir).findings.find((f) => f.id === input.issue);
  if (!finding) return fail("unknown-issue", `There is no ${input.issue} in this run's findings.`);
  if (!state.severities.includes(finding.severity)) return fail("below-severity", `${input.issue} is ${finding.severity}; this run may fix only ${state.severities.join(" and ")} problems. Report it, do not fix it.`);

  const root = scope.ctx.projectRoot;
  if (statusEntries(root).length || stagedFiles(root).length) return fail("dirty-tree", "There are uncommitted changes in the project. Call fix_begin before changing any file, and finish or undo the previous fix first.", { files: statusEntries(root).map((e) => e.path).slice(0, 20) });

  const prod = relPaths(scope, input.files, "production file");
  if (prod.problem) return fail("protected", prod.problem);
  const tests = relPaths(scope, input.test_files, "test file");
  if (tests.problem) return fail("protected", tests.problem);
  const notTests = tests.rel.filter((f) => !isTestPath(f));
  if (notTests.length) return fail("not-a-test-file", `${notTests.join(", ")} does not look like an automated test (a tests/ folder, *.test.*, *.spec.*, test_*.py, *_test.go ...). Put the regression test where the project keeps its tests.`);
  const mixedUp = prod.rel.filter((f) => isTestPath(f));
  if (mixedUp.length) return fail("test-listed-as-production", `${mixedUp.join(", ")} is a test file: list it under test_files.`);
  if (prod.rel.length === 0 || tests.rel.length === 0) return fail("incomplete", "Name at least one production file you expect to change and one regression test file.");
  const bad = tests.rel.filter((f) => !SAFE_REL_PATH.test(f));
  if (bad.length) return fail("unsafe-test-path", `${bad.join(", ")}: test paths may use letters, digits and / . _ - @ + only (no spaces), because they are passed to the test command.`);

  if (prod.rel.length > MAX_FILES_PER_FIX) {
    state.stop = { kind: "wide-change", reason: `${input.issue} would change ${prod.rel.length} files (more than ${MAX_FILES_PER_FIX}). A fix that wide is probably the wrong fix, or needs a decision. Stop, tell the user what you found, and ask how to proceed.`, at: now.toISOString() };
    saveFixState(scope.runDir, state);
    return fail("stopped", state.stop.reason, { stop: stopPayload(state) });
  }

  const attempt: FixAttempt = { issue: input.issue, severity: finding.severity, title: finding.title, status: "in-progress", plan: input.plan, files: prod.rel, test_files: tests.rel, started_at: now.toISOString() };
  state.attempts.push(attempt);
  saveFixState(scope.runDir, state);
  return {
    ok: true,
    issue: input.issue,
    title: finding.title,
    severity: finding.severity,
    expected: finding.expected,
    actual: finding.actual,
    ...(finding.regression_test ? { suggested_regression_test: finding.regression_test } : {}),
    test_command: state.commands.file,
    next: "Write the regression test first and run it with fix_run_tests: it must fail, and for the right reason (the same wrong value or behaviour as the finding). Then make the smallest fix, run the test again, and call fix_commit.",
  };
}

// ------------------------------------------------------------------------------------------------ run tests

export async function runTests(scope: RunScope, input: { issue?: string; files?: string[] }, now = new Date()) {
  requireFixRun(scope);
  const state = stateOf(scope);
  const attempt = input.issue ? attemptFor(state, input.issue) : activeAttempt(state);
  const files = input.files ?? attempt?.test_files;
  if (!files?.length) return fail("no-files", "Say which test files to run (files), or call fix_begin first so they are known.");
  const rel = relPaths(scope, files, "test file");
  if (rel.problem) return fail("protected", rel.problem);
  for (const f of rel.rel) {
    if (!isTestPath(f)) return fail("not-a-test-file", `${f} does not look like an automated test.`);
    if (!fs.existsSync(path.join(scope.ctx.projectRoot, f))) return fail("missing", `${f} does not exist yet: write the test first.`);
  }
  let command: string;
  try {
    command = withFiles(state.commands.file as string, rel.rel);
  } catch (err) {
    return fail("bad-path", (err as Error).message);
  }
  const run = await runShell(command, { cwd: scope.ctx.projectRoot, timeoutMs: timeoutMs(scope), redact: redactor(scope) });
  return { ok: true, ...toRecord(run, now), failed_tests: run.failed_tests };
}

// ------------------------------------------------------------------------------------------------ commit

export interface CommitInput {
  issue: string;
  summary: string;
  root_cause: string;
  recheck: string;
  adjacent: string;
  classification: "verified" | "best-effort";
  best_effort_reason?: string;
}

interface Backup {
  rel: string;
  /** Present in the working tree when the fix is in. */
  content?: Buffer;
  mode?: number;
  tracked: boolean;
}

function backupFixed(root: string, evidenceDir: string, rels: string[]): Backup[] {
  return rels.map((rel) => {
    const abs = path.join(root, rel);
    const tracked = isTracked(root, rel);
    if (!fs.existsSync(abs)) return { rel, tracked }; // the fix deleted it
    const content = fs.readFileSync(abs);
    const dest = path.join(evidenceDir, "fixed", rel);
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, content);
    return { rel, content, mode: fs.statSync(abs).mode, tracked };
  });
}

function unfix(root: string, backups: Backup[]): void {
  const tracked = backups.filter((b) => b.tracked).map((b) => b.rel);
  if (tracked.length) {
    const r = restoreFromHead(root, tracked);
    if (!r.ok) throw new Error(`Could not take the fix out to prove the test: ${r.err}`);
  }
  for (const b of backups.filter((x) => !x.tracked)) fs.rmSync(path.join(root, b.rel), { force: true });
}

function refix(root: string, backups: Backup[]): void {
  for (const b of backups) {
    const abs = path.join(root, b.rel);
    if (b.content === undefined) {
      fs.rmSync(abs, { force: true });
      continue;
    }
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, b.content);
    if (b.mode !== undefined) fs.chmodSync(abs, b.mode);
  }
}

export async function commit(scope: RunScope, input: CommitInput, now = new Date()) {
  requireFixRun(scope);
  const state = stateOf(scope);
  const stop = applyStop(state);
  if (stop) {
    saveFixState(scope.runDir, state);
    return fail("stopped", `A stop rule is in force: ${stop.reason}`, { stop: stopPayload(state) });
  }
  const attempt = attemptFor(state, input.issue);
  if (!attempt || attempt.status !== "in-progress") return fail("no-attempt", `${input.issue} has no fix in progress. Call fix_begin first.`);
  if (input.classification === "best-effort" && !input.best_effort_reason) return fail("reason-needed", "A best-effort fix needs best_effort_reason: what could not be verified, and how a person can check it.");

  const root = scope.ctx.projectRoot;
  const rules = rulesOf(scope);
  const changed = statusEntries(root);
  const allowed = new Set([...attempt.files, ...attempt.test_files]);
  const unrelated = changed.map((e) => norm(e.path)).filter((p) => !allowed.has(p));
  if (unrelated.length) {
    state.stop = { kind: "unrelated-files", reason: `The working tree has changes in files that ${input.issue} did not declare: ${unrelated.slice(0, 8).join(", ")}. A fix must touch only what it needs. Stop and tell the user: either these edits belong to the fix (then say why) or they must be undone.`, at: now.toISOString() };
    saveFixState(scope.runDir, state);
    return fail("unrelated-files", state.stop.reason, { files: unrelated.slice(0, 20), stop: stopPayload(state) });
  }
  const changedPaths = changed.map((e) => norm(e.path));
  for (const p of changedPaths) {
    const why = protectedReason(p, rules);
    if (why) return fail("protected", `${why}. Undo that change (fix_revert).`);
  }
  const changedTests = changedPaths.filter(isTestPath);
  const changedProd = changedPaths.filter((p) => !isTestPath(p));
  if (changedProd.length === 0) return fail("no-fix", "No production file has changed, so there is no fix to commit.");
  if (changedTests.length === 0) return fail("no-regression-test", "No test file was added or changed. Every fix is committed together with a regression test that fails without it.");
  for (const t of changedTests) {
    if (!isTracked(root, t)) continue;
    const n = numstat(root, t);
    if (n && n.deleted > 0) return fail("existing-test-changed", `${t} is an existing test and ${n.deleted} of its lines were removed or changed. Never change an existing assertion to make something pass: add a new test instead.`);
  }
  if (stagedFiles(root).length) return fail("staged-changes", "Something is already staged in the index. Nothing may be staged before fix_commit; ask the user.");

  // The proof: take the fix out, the test must fail; put it back, the test must pass. A broken test fails both ways and is refused.
  const evidence = path.join(scope.runDir, "evidence", "fix", input.issue);
  ensureDir(evidence);
  const backups = backupFixed(root, evidence, changedProd);
  const redact = redactor(scope);
  let without: Awaited<ReturnType<typeof runShell>> | undefined;
  let withFix: Awaited<ReturnType<typeof runShell>> | undefined;
  let command: string;
  try {
    command = withFiles(state.commands.file as string, changedTests);
  } catch (err) {
    return fail("bad-path", (err as Error).message);
  }
  try {
    unfix(root, backups);
    without = await runShell(command, { cwd: root, timeoutMs: timeoutMs(scope), redact });
  } finally {
    refix(root, backups);
  }
  for (const b of backups) {
    const now2 = fs.existsSync(path.join(root, b.rel)) ? fs.readFileSync(path.join(root, b.rel)) : undefined;
    if ((now2 === undefined) !== (b.content === undefined) || (now2 && b.content && !now2.equals(b.content))) throw new Error(`Putting the fix back after the proof did not restore ${b.rel} exactly. The fixed files are saved in ${path.relative(root, path.join(evidence, "fixed"))}; restore them by hand.`);
  }
  attempt.without_fix = toRecord(without, now);
  if (without.passed || without.timed_out || without.exit_code === null) {
    saveFixState(scope.runDir, state);
    return fail(
      without.passed ? "test-passes-without-fix" : "proof-inconclusive",
      without.passed
        ? "The regression test PASSES with the fix taken out, so it does not show that this fix is needed. Rewrite the test so that it fails because of the bug (the same wrong value or behaviour the finding describes), then call fix_commit again. Nothing was committed and your fix is back in place."
        : "The regression test did not finish with the fix taken out (it timed out or could not start), so the proof is inconclusive. Nothing was committed and your fix is back in place.",
      { without_fix: attempt.without_fix },
    );
  }
  withFix = await runShell(command, { cwd: root, timeoutMs: timeoutMs(scope), redact });
  attempt.with_fix = toRecord(withFix, now);
  if (!withFix.passed) {
    saveFixState(scope.runDir, state);
    return fail("test-fails-with-fix", "The regression test fails with your fix in place, so the fix is not done (or the test is wrong). Nothing was committed. Read the output, correct it, and call fix_commit again, or undo the attempt with fix_revert.", { with_fix: attempt.with_fix });
  }

  const message = [
    `fix(qa): ${input.issue} ${input.summary}`,
    "",
    `Root cause: ${input.root_cause}`,
    `Regression test: ${changedTests.join(", ")} (fails without the fix, passes with it)`,
    `Verification: ${input.recheck}`,
    `Adjacent check: ${input.adjacent}`,
    ...(input.classification === "best-effort" ? [`Best effort: ${input.best_effort_reason}`] : []),
    "",
    `QAMind-Run: ${scope.runId}`,
    `QAMind-Issue: ${input.issue}`,
    `QAMind-Classification: ${input.classification}`,
    "",
  ].join("\n");
  const c = commitFiles(root, changedPaths, message);
  if (!c.ok || !c.sha) {
    return fail("commit-failed", `git refused the commit (a hook of the project, or missing git identity?): ${c.err.slice(0, 600)}. Nothing was committed and the index is as it was. QAMind never bypasses a project's hooks.`);
  }

  Object.assign(attempt, { status: input.classification, finished_at: now.toISOString(), commit: c.sha, commit_files: changedPaths, summary: input.summary, root_cause: input.root_cause, recheck: input.recheck, adjacent: input.adjacent, ...(input.best_effort_reason ? { best_effort_reason: input.best_effort_reason } : {}) });
  const fix: FindingFix = { outcome: input.classification, commit: shortCommit(root, c.sha), files: changedProd, test_files: changedTests, root_cause: input.root_cause, recheck: input.recheck, adjacent: input.adjacent, ...(input.best_effort_reason ? { reason: input.best_effort_reason } : {}) };
  updateFinding(scope.runDir, input.issue, { fix_status: input.classification === "verified" ? "fixed-verified" : "fixed-needs-confirmation", fix });
  const finding = readRunData(scope.runDir).findings.find((f) => f.id === input.issue);
  appendFixLog(scope.store, { run: scope.runId, issue: input.issue, severity: attempt.severity, area: finding?.area ?? "unknown", title: attempt.title, outcome: input.classification, branch: state.branch, commit: shortCommit(root, c.sha), files: changedProd, test_files: changedTests, root_cause: input.root_cause, ...(input.best_effort_reason ? { reason: input.best_effort_reason } : {}) }, { knownSecrets: scope.ctx.passwords, now });
  const nextStop = applyStop(state);
  saveFixState(scope.runDir, state);
  return {
    ok: true,
    commit: shortCommit(root, c.sha),
    classification: input.classification,
    files: changedProd,
    test_files: changedTests,
    proof: { without_fix: { exit_code: attempt.without_fix.exit_code, tail: attempt.without_fix.tail.slice(-600) }, with_fix: { exit_code: attempt.with_fix.exit_code } },
    fixes_committed: committedFixes(state).length,
    ...(nextStop ? { stop: stopPayload(state) } : { next: "Continue with the next finding in the queue (fix_begin), or when none is left, run fix_run_suite and re-check the affected flows." }),
  };
}

// ------------------------------------------------------------------------------------------------ revert

export function revert(scope: RunScope, input: { issue: string; reason: string }, now = new Date()) {
  requireFixRun(scope);
  const state = stateOf(scope);
  const attempt = attemptFor(state, input.issue);
  if (!attempt) return fail("no-attempt", `${input.issue} has no fix attempt to undo.`);
  const root = scope.ctx.projectRoot;

  if (attempt.status === "in-progress") {
    const changed = statusEntries(root);
    const allowed = new Set([...attempt.files, ...attempt.test_files]);
    const foreign = changed.map((e) => norm(e.path)).filter((p) => !allowed.has(p));
    if (foreign.length) return fail("other-changes", `The working tree also has changes this attempt did not declare (${foreign.slice(0, 8).join(", ")}). They may be the user's, so nothing was touched. Ask the user.`, { files: foreign.slice(0, 20) });
    if (stagedFiles(root).length) return fail("staged-changes", "Something is staged in the index. Nothing was touched; ask the user.");
    // Keep the attempt (the failing regression test and the edits) as evidence, then put the tree back exactly as it was.
    const saved = path.join(scope.runDir, "evidence", "fix", input.issue, "reverted-attempt");
    ensureDir(saved);
    for (const e of changed) {
      const src = path.join(root, e.path);
      if (fs.existsSync(src)) {
        const dst = path.join(saved, e.path);
        ensureDir(path.dirname(dst));
        fs.copyFileSync(src, dst);
      }
    }
    const diff = git(root, ["diff", "HEAD"]).out;
    if (diff) fs.writeFileSync(path.join(saved, "attempt.patch"), diff, "utf8");
    const tracked = changed.filter((e) => !e.untracked).map((e) => norm(e.path));
    if (tracked.length) {
      const r = restoreFromHead(root, tracked);
      if (!r.ok) return fail("git-failed", `git could not restore the files: ${r.err}`);
    }
    for (const e of changed.filter((x) => x.untracked)) fs.rmSync(path.join(root, e.path), { force: true });
    if (statusEntries(root).length) return fail("not-clean", "After undoing the attempt the working tree is still not clean. Stop and ask the user.", { files: statusEntries(root).map((e) => e.path).slice(0, 20) });
    attempt.status = "reverted";
    attempt.saved_to = path.relative(scope.runDir, saved).split(path.sep).join("/");
  } else if (attempt.status === "verified" || attempt.status === "best-effort") {
    if (!attempt.commit) return fail("no-commit", "This fix has no commit to revert.");
    if (statusEntries(root).length || stagedFiles(root).length) return fail("dirty-tree", "The working tree has changes. Ask the user before reverting a commit.");
    const r = revertCommit(root, attempt.commit);
    if (!r.ok) {
      git(root, ["revert", "--abort"]);
      return fail("revert-failed", `git could not revert the commit cleanly (${r.err.slice(0, 300)}). Nothing was changed.`);
    }
    attempt.reverted_by = shortCommit(root, headCommit(root) as string);
    attempt.status = "reverted";
  } else {
    return fail("not-revertable", `${input.issue} is ${attempt.status}; there is nothing to undo.`);
  }
  attempt.reason = input.reason;
  attempt.finished_at = now.toISOString();
  state.reverts += 1;
  const finding = readRunData(scope.runDir).findings.find((f) => f.id === input.issue);
  updateFinding(scope.runDir, input.issue, { fix: { outcome: "reverted", reason: input.reason, ...(attempt.commit ? { commit: shortCommit(root, attempt.commit) } : {}), ...(attempt.reverted_by ? { reverted_by: attempt.reverted_by } : {}), files: attempt.files, test_files: attempt.test_files } });
  appendFixLog(scope.store, { run: scope.runId, issue: input.issue, severity: attempt.severity, area: finding?.area ?? "unknown", title: attempt.title, outcome: "reverted", branch: state.branch, ...(attempt.commit ? { commit: shortCommit(root, attempt.commit) } : {}), files: attempt.files, test_files: attempt.test_files, reason: input.reason }, { knownSecrets: scope.ctx.passwords, now });
  const stop = applyStop(state);
  saveFixState(scope.runDir, state);
  return { ok: true, issue: input.issue, status: "reverted", reverts: state.reverts, ...(attempt.saved_to ? { attempt_kept_in: attempt.saved_to } : {}), ...(stop ? { stop: stopPayload(state) } : { next: "The tree is clean. Continue with the next finding, or stop if nothing safe is left." }) };
}

// ------------------------------------------------------------------------------------------------ defer

export const DEFER_KINDS = ["not-fixable-from-source", "needs-decision", "below-severity", "stop-rule", "no-test-possible", "other"] as const;

export function defer(scope: RunScope, input: { issue: string; reason: string; kind: (typeof DEFER_KINDS)[number] }, now = new Date()) {
  requireFixRun(scope);
  const state = stateOf(scope);
  const prior = attemptFor(state, input.issue);
  if (prior?.status === "in-progress") return fail("attempt-open", `${input.issue} has a fix in progress: undo it with fix_revert first.`);
  if (prior) return fail("already-attempted", `${input.issue} was already ${prior.status}.`);
  const finding = readRunData(scope.runDir).findings.find((f) => f.id === input.issue);
  if (!finding) return fail("unknown-issue", `There is no ${input.issue} in this run's findings.`);
  state.attempts.push({ issue: input.issue, severity: finding.severity, title: finding.title, status: "deferred", plan: "", files: [], test_files: [], started_at: now.toISOString(), finished_at: now.toISOString(), reason: input.reason, defer_kind: input.kind });
  updateFinding(scope.runDir, input.issue, { fix: { outcome: "deferred", reason: `${input.kind}: ${input.reason}` } });
  appendFixLog(scope.store, { run: scope.runId, issue: input.issue, severity: finding.severity, area: finding.area, title: finding.title, outcome: "deferred", branch: state.branch, files: [], test_files: [], reason: `${input.kind}: ${input.reason}` }, { knownSecrets: scope.ctx.passwords, now });
  saveFixState(scope.runDir, state);
  return { ok: true, issue: input.issue, status: "deferred" };
}

// ------------------------------------------------------------------------------------------------ suite

export function compareSuites(before: SuiteRecord | undefined, after: SuiteRecord): SuiteComparison {
  if (after.passed) return { verdict: "no-regression", regressions: [], note: "The full test suite passes." };
  if (after.timed_out) return { verdict: "cannot-compare", regressions: [], note: "The full test suite did not finish within the time limit, so nothing can be said about regressions." };
  if (!before) return { verdict: "cannot-compare", regressions: [], note: "There is no baseline run of the suite to compare with." };
  if (before.passed) return { verdict: "regression", regressions: after.failed_tests, note: `The suite passed before the fixes and fails now${after.failed_tests.length ? ` (${after.failed_tests.length} failing test names found)` : ""}.` };
  if (before.failed_tests.length && after.failed_tests.length) {
    const old = new Set(before.failed_tests);
    const fresh = after.failed_tests.filter((t) => !old.has(t));
    return fresh.length
      ? { verdict: "regression", regressions: fresh, note: `${fresh.length} test(s) fail now that did not fail before the fixes.` }
      : { verdict: "no-regression", regressions: [], note: "The suite fails, but only in tests that already failed before any fix." };
  }
  return { verdict: "cannot-compare", regressions: [], note: "The suite failed before the fixes and fails now, and the runner's output could not be read test by test, so old failures cannot be told from new ones." };
}

export async function runSuite(scope: RunScope, now = new Date()) {
  requireFixRun(scope);
  const state = stateOf(scope);
  if (activeAttempt(state)) return fail("attempt-open", `${activeAttempt(state)?.issue} is still in progress: finish or undo it before the final suite run.`);
  const root = scope.ctx.projectRoot;
  const run = await runShell(state.commands.suite as string, { cwd: root, timeoutMs: timeoutMs(scope), redact: redactor(scope), tailChars: 4000 });
  const after = suiteRecord(run, now);
  state.after = after;
  state.comparison = compareSuites(state.baseline, after);
  saveFixState(scope.runDir, state);
  const regression = state.comparison.verdict === "regression";
  return {
    ok: true,
    passed: after.passed,
    verdict: state.comparison.verdict,
    note: state.comparison.note,
    regressions: state.comparison.regressions,
    ...(regression ? { warning: "⚠️ REGRESSION: the fixes broke something that worked before. Tell the user loudly, say which fix is the likely cause, and consider fix_revert for it." } : {}),
    duration_s: after.duration_s,
    ...(after.passed ? {} : { tail: after.tail }),
    next: "Re-check the affected flows (the findings you fixed) the way you found them, then write the reports and finish.",
  };
}

// ------------------------------------------------------------------------------------------------ continue and status

export function continueAfterStop(scope: RunScope, reason: string, now = new Date()) {
  requireFixRun(scope);
  const state = stateOf(scope);
  if (!state.stop) return fail("no-stop", "No stop rule is in force; there is nothing to continue from.");
  if (state.stop.kind === "cap") return fail("cap", state.stop.reason);
  state.continues.push({ at: now.toISOString(), reason, was: state.stop.kind });
  state.paused_at = committedFixes(state).length;
  state.reverts_at_last_continue = state.reverts;
  const was = state.stop.kind;
  delete state.stop;
  const again = pendingStop(state);
  saveFixState(scope.runDir, state);
  return { ok: true, continued_from: was, ...(again ? { note: `Another rule still applies: ${again.reason}` } : { next: "Continue with the next finding (fix_begin)." }) };
}

export function statusOf(scope: RunScope, state?: FixState) {
  const s = state ?? stateOf(scope);
  const queue = fixQueue(scope, s);
  const by = (o: FixOutcome) => s.attempts.filter((a) => a.status === o).length;
  const open = activeAttempt(s);
  return {
    branch: s.branch,
    base_commit: s.base_commit.slice(0, 7),
    committed: committedFixes(s).length,
    verified: by("verified"),
    best_effort: by("best-effort"),
    reverted: by("reverted"),
    deferred: by("deferred"),
    reverts_since_last_continue: s.reverts - s.reverts_at_last_continue,
    max_fixes: s.max_fixes,
    in_progress: open ? { issue: open.issue, files: open.files, test_files: open.test_files } : null,
    stop: stopPayload(s) ?? null,
    queue,
    suite: { baseline_passed: s.baseline?.passed ?? null, after_passed: s.after?.passed ?? null, verdict: s.comparison?.verdict ?? null },
  };
}

