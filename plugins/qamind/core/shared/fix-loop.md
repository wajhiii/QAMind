# The fix loop (`/qa`)

Fix mode is `/qa-only` plus one more phase. Phases 0 to 3 and the baseline report come first, exactly as in the report-only skill, and **nothing is fixed
before the baseline report is written and lints clean.** The fix tools (`fix_*`) enforce the rules below in code and refuse what breaks them, so this guide
is about how to work with them. Read `${CLAUDE_PLUGIN_ROOT}/core/knowledge/fixing-safely.md` and `${CLAUDE_PLUGIN_ROOT}/core/knowledge/debugging-and-root-cause.md` before the first fix.

You change product code only through the loop: you edit files with the Edit and Write tools, and everything that touches git, branches or the project's tests
goes through the fix tools. The safety hook blocks git commands that change anything (the tools do those), dependency changes, and edits to protected files
(credentials, CI and deployment files, lock files and dependency manifests, generated code, migrations, the project's do-not-touch list).

## 1. Start: `fix_preflight`

Call it once the baseline report is clean. If it answers `ok: false`, read `problem` and do what it says, then call it again:
- `dirty-tree`: the user has uncommitted work. Show them the files, ask whether to commit, stash or abort, and **stop**. Never decide that for them and never discard anything.
- `on-default-branch`: fixes never go on the default branch. Ask the user whether to create the suggested branch. Only if they agree, call `fix_create_branch` (the host also asks them to approve it), then `fix_preflight` again. If they decline, report only.
- `no-test-framework`: every fix needs a regression test. Say so, propose a test framework in the report, ask before adding one, or ask them to set `fix_policy.test_command` and `fix_policy.test_file_command` in `.qa/config.md`. No fixes.
- `no-baseline-report` or `baseline-report-not-clean`: finish the baseline report first.
- `baseline-incomplete`: a `full` or `quick` run tests every web UI that has a test login before any fixing. Test the UI it names with the browser tools, record it in `coverage.json` (with `ui`), rebuild, and call it again. "Not run in this pass" is not a reason to skip a UI. Only if the browser tools truly cannot be used: tell the user why, ask whether to fix just what the API testing found, and only if they agree call `fix_preflight` again with `api_only: true`.

When it answers `ok: true` it gives you the `queue` (findings to fix, most severe first), the test commands it found, the baseline test-suite result and the limits. If the suite already
fails, tell the user, and do not touch the failing area without telling them. If the queue is empty, report that and finish.

## 2. One finding at a time, in queue order

1. **Diagnose.** Read the code that owns the behaviour (`debugging-and-root-cause.md`) and write the diagnosis in two sentences: what is wrong and where. If it is not fixable from source (a third-party widget, infrastructure, hosting), or the expected behaviour is unclear and needs a person's decision, call `fix_defer` with the reason and move on.
2. **`fix_begin`**, before you change any file: the finding, the production file(s) you expect to change, the regression test file(s) you will add, and your diagnosis. It refuses protected files, more than 5 files (that is a stop: tell the user), and starting a second fix while one is open.
3. **Write the regression test first**, in the project's own framework and folder, as a new file or as added cases only (never change an existing assertion). Run it with `fix_run_tests`: it **must fail, for the right reason**, showing the same wrong value or behaviour as the finding. A failure from a typo, a missing import or a wrong fixture is not a red test: fix the test.
4. **Make the smallest fix** that removes the root cause, in the declared files only. No refactors, renames, reformatting, dependency changes or "while I am here" improvements. Do not weaken a check to get green.
5. **Run the test again**: it must pass.
6. **Re-check like a tester, not like a developer.** Repeat the finding's original steps exactly (the same API probe, the same browser actions) and look at the final state (the stored record, the totals, the screen), then check the neighbouring happy path and one input just inside the valid range. If the re-check fails, make at most one revised minimal fix; if that fails too, `fix_revert`.
7. **`fix_commit`** with a short summary, the root cause, what you repeated and saw (`recheck`), the adjacent check, and the classification. It checks the diff (only the declared files, nothing protected, no existing assertion changed) and **proves the test**: it takes your fix out, runs the test (it must fail), puts the fix back and runs it again (it must pass). Read a refusal and act on it:
   - `test-passes-without-fix`: the test does not need the fix; rewrite it so it fails because of the bug.
   - `test-fails-with-fix`: the fix is not done, or the test is wrong.
   - `unrelated-files`: you changed a file you did not declare. That is a **stop**: tell the user which files and why, and undo them or explain.
   - `existing-test-changed`: add a new test instead of changing an old one.
8. **Classify honestly.** `verified`: the test went red then green, the original steps pass, the adjacent path passes. `best-effort`: committed with a passing regression test, but something could not be verified (an auth state, an external service, a visual check): say exactly what a person must confirm. A fix you cannot prove with an automated test is not committed: use `fix_defer` with kind `no-test-possible`.

If an attempt goes wrong, `fix_revert` undoes only your own changes (the attempt is kept as evidence) or reverts a committed fix with a normal revert commit.

## 3. Stop rules

The tools enforce them. When any fix tool answers with a `stop`, **stop**: tell the user what happened (the fixes so far with their commits, what was reverted, which files were touched, anything that drifted from the minimal change) and ask how to continue. Only after they say to go on, call `fix_continue` with their words in `reason` (the host asks them to approve it). The rules are: two reverts; every five fixes; an edit to a file the fix did not declare; a fix that needs more than five files; and the hard cap on fixes (default 30), which cannot be continued past. `fix_status` shows where things stand if you lose track.

## 4. After the last fix

1. `fix_run_suite`: the project's whole test suite against the baseline. If it reports a **regression**, say so loudly to the user, name the likely fix, and `fix_revert` it unless they tell you otherwise. An existing test that encoded the bug is a decision for the user, not for you.
2. Re-check the affected flows: for every fix, repeat the original finding's steps once more on the final code, in the browser or over the API, and note the result.
3. Write the reports again (`report build`, `report lint`). The fix status, commits and proof come from the tools: never write `fix_status` or `fix` into `findings.json` yourself (the lint refuses it). Fix every lint error.
4. Save what the next run should know (`fix-pattern` learnings: how a defect like this was fixed here), then finish with `run_finish`. It refuses to finish while a fix is open or before the final suite run.

## What you never do

Push, merge, open a pull request, change git settings, rewrite history, or bypass a hook; edit credentials, CI, lock files, dependencies or generated code; edit an existing test's assertions; change data you did not create; touch anything that is not the configured staging or local environment; or claim "this should fix it" without the checks above.

The reports say the rest on their own: **"Fixes are on branch X; a developer must review and merge them."**
