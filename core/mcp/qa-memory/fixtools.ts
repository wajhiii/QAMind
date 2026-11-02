import { z } from "zod";
import { DEFER_KINDS, begin, commit, continueAfterStop, createFixBranch, defer, preflight, revert, runSuite, runTests, statusOf } from "../../lib/fix/loop.ts";
import { runScope } from "../../lib/memory/service.ts";
import { ADD, READ, SET, define, line, runField as run } from "./common.ts";
import type { ToolDef } from "./common.ts";

/**
 * The fix loop's tools (spec 9.3). They are only usable in a `/qa` run started by a person: in a report-only run, or one started by CI,
 * every one of them refuses. All git writes, branch creation and test execution of a fix run happen here, never through the agent's own
 * shell (the safety hook blocks those), so the rules cannot be skipped by running a command by hand.
 */
const issue = z.string().regex(/^ISSUE-\d{3,}$/, "A finding id such as ISSUE-003.").describe("The finding's id, such as ISSUE-003.");
const paths = (max: number) => z.array(line(1, 300, "path")).min(1).max(max);
const RUNS_PROJECT_CODE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export const FIX_TOOLS: ToolDef[] = [
  define({
    name: "fix_preflight",
    title: "Check a fix run can start",
    description:
      "Start the fix loop, after the baseline report is written and lints clean. It checks a git repository with a clean working tree and a branch that is not the default one, finds how the project runs its tests, runs the whole test suite once as the baseline, keeps a copy of the baseline reports, and returns the queue of findings to fix (most severe first) with the limits. " +
      "If something is wrong it says what and what to do (for example: finish testing a web UI that the baseline skipped, ask the user what to do with their uncommitted changes, or ask whether to create a branch). Nothing is changed unless it returns ok. Calling it again later just reports where the loop stands.",
    annotations: RUNS_PROJECT_CODE,
    input: { run, api_only: z.boolean().default(false).describe("Only if the user agreed to fix without the web UIs having been tested (for example the browser tool cannot be used). Default false.") },
    run: (a, c) => preflight(runScope(c.home, a.run, c.env), c.now(), { api_only: a.api_only }),
  }),

  define({
    name: "fix_create_branch",
    title: "Create the branch for the fixes",
    description:
      "Create the branch qa/fix-YYYYMMDD-HHMM from the current commit and switch to it. Use it ONLY after the user has agreed in this conversation: fix_preflight refuses to start on the default branch and tells you to ask. The user is also asked by the host to approve this call. Refuses with uncommitted changes.",
    annotations: ADD,
    input: { run, name: line(3, 80, "name").optional().describe("Optional branch name, qa/<letters, digits, . _ ->. Default: qa/fix-YYYYMMDD-HHMM.") },
    run: (a, c) => createFixBranch(runScope(c.home, a.run, c.env), a.name, c.now()),
  }),

  define({
    name: "fix_begin",
    title: "Start fixing one finding",
    description:
      "Declare the one finding you are about to fix, the production file(s) you expect to change and the regression test file(s) you will add, and your diagnosis in two sentences (what is wrong and where). Call it BEFORE changing any file. Refuses a protected file, a file on the do-not-touch list, a finding below the allowed severity, a second fix while one is open, and more than 5 files (that is a stop: tell the user). " +
      "Then: write the regression test and run it with fix_run_tests (it must fail, for the right reason), make the smallest fix, run it again, and call fix_commit.",
    annotations: ADD,
    input: { run, issue, files: paths(12).describe("Production files you expect to change, relative to the project."), test_files: paths(5).describe("Regression test file(s), in the project's own test folder and framework."), plan: line(20, 400, "plan").describe("What is wrong and where, in two sentences.") },
    run: (a, c) => begin(runScope(c.home, a.run, c.env), { issue: a.issue, files: a.files, test_files: a.test_files, plan: a.plan }, c.now()),
  }),

  define({
    name: "fix_run_tests",
    title: "Run the regression test",
    description:
      "Run the regression test file(s) of the fix in progress (or the files you name) with the project's own test runner, and return pass or fail with the end of the output. Use it to see the test FAIL before the fix (the failure must show the same wrong value or behaviour as the finding) and PASS after. This is for your feedback; fix_commit does its own proof.",
    annotations: RUNS_PROJECT_CODE,
    input: { run, issue: issue.optional(), files: z.array(line(1, 300, "path")).min(1).max(5).optional().describe("Test files to run. Default: the fix in progress's test files.") },
    run: (a, c) => runTests(runScope(c.home, a.run, c.env), { ...(a.issue ? { issue: a.issue } : {}), ...(a.files ? { files: a.files } : {}) }, c.now()),
  }),

  define({
    name: "fix_commit",
    title: "Commit a verified fix",
    description:
      "Commit the fix together with its regression test. First it checks that only the declared files changed (anything else is a stop rule), that nothing protected was touched, that no existing test assertion was changed, and then PROVES the test: it takes your fix out, runs the test (it must fail), puts the fix back, and runs it again (it must pass). A test that passes without the fix, or fails with it, is refused. " +
      "Then it commits with the message `fix(qa): ISSUE-NNN <summary>` on the current branch (never pushed). Say what you repeated from the finding after the fix and what you saw (recheck), and the neighbouring happy path you checked (adjacent). Use classification best-effort, with the reason, only when something could not be verified.",
    annotations: ADD,
    input: {
      run,
      issue,
      summary: line(8, 72, "summary").describe("Short description of the corrected behaviour, for the commit title."),
      root_cause: line(15, 300, "root_cause").describe("The cause, in one or two sentences."),
      recheck: line(20, 400, "recheck").describe("What you repeated from the finding after the fix, exactly, and what you saw (final stored state, not just pass or fail)."),
      adjacent: line(15, 300, "adjacent").describe("The neighbouring happy path you checked and its result."),
      classification: z.enum(["verified", "best-effort"]),
      best_effort_reason: line(15, 300, "best_effort_reason").optional().describe("Required for best-effort: what could not be verified and how a person can check it."),
    },
    run: (a, c) => commit(runScope(c.home, a.run, c.env), { issue: a.issue, summary: a.summary, root_cause: a.root_cause, recheck: a.recheck, adjacent: a.adjacent, classification: a.classification, ...(a.best_effort_reason ? { best_effort_reason: a.best_effort_reason } : {}) }, c.now()),
  }),

  define({
    name: "fix_revert",
    title: "Undo a fix attempt",
    description:
      "Undo a fix: an attempt in progress is taken out of the working tree (kept as evidence in the run folder, together with the failing test), and a fix that was already committed is undone with a normal revert commit. Only your own changes are touched: if the tree has other changes it refuses and you ask the user. Two reverts stop the run until the user says to continue.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    input: { run, issue, reason: line(10, 300, "reason").describe("Why: what the recheck showed, or what the suite caught.") },
    run: (a, c) => revert(runScope(c.home, a.run, c.env), { issue: a.issue, reason: a.reason }, c.now()),
  }),

  define({
    name: "fix_defer",
    title: "Leave a finding unfixed, with a reason",
    description:
      "Record that you are not fixing a finding and why: not fixable from source (third-party, infrastructure), needs a decision, below the severity bar, a stop rule, no automated test is possible, or other. It stays in the report as not fixed, with your reason. Use it instead of a fix you cannot prove.",
    annotations: ADD,
    input: { run, issue, kind: z.enum(DEFER_KINDS), reason: line(10, 300, "reason") },
    run: (a, c) => defer(runScope(c.home, a.run, c.env), { issue: a.issue, kind: a.kind, reason: a.reason }, c.now()),
  }),

  define({
    name: "fix_run_suite",
    title: "Run the full test suite after the fixes",
    description:
      "Run the project's whole existing test suite and compare it with the baseline from fix_preflight: no regression, a regression (named when the runner's output can be read), or cannot compare. Call it once after the last fix and before the final report. If it reports a regression, tell the user loudly and consider fix_revert for the likely cause.",
    annotations: RUNS_PROJECT_CODE,
    input: { run },
    run: (a, c) => runSuite(runScope(c.home, a.run, c.env), c.now()),
  }),

  define({
    name: "fix_continue",
    title: "Continue after a stop, on the user's word",
    description:
      "Continue after a stop rule (two reverts, every five fixes, an edit to an undeclared file, a change touching more than five files) ONLY after you showed the user what happened and they said to go on; put their instruction in reason. The host also asks the user to approve this call. The hard cap on fixes cannot be continued past.",
    annotations: ADD,
    input: { run, reason: line(10, 300, "reason").describe("What the user said, in a sentence.") },
    run: (a, c) => continueAfterStop(runScope(c.home, a.run, c.env), a.reason, c.now()),
  }),

  define({
    name: "fix_status",
    title: "Where the fix loop stands",
    description: "The branch, counts of fixes by outcome, any stop rule in force, the fix in progress, the queue of findings still to fix, and the suite result. Use it to re-orient, for example after a long pause.",
    annotations: READ,
    input: { run },
    run: (a, c) => statusOf(runScope(c.home, a.run, c.env)),
  }),
];
