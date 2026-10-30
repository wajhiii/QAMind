# Fixing safely

Load this only when the user has explicitly asked for a fix mode. A report-only run never edits product code, tests,
configuration or dependencies, and never commits. When in doubt about whether you may change something, stop and ask.

The loop for each finding is: diagnose, write a failing regression test, make the smallest fix, re-test, commit, classify.

## Before touching code
- Start from a confirmed finding: reproduced twice, with evidence and a stated expected result. An unclear contract is not a
  reason to change code; report the question instead. A broken environment is never a reason to change code.
- Check the working tree is clean. If it has uncommitted changes you did not make, stop and let the user choose (commit,
  stash or abort). Never decide that for them and never discard their work.
- Work on a branch that is not the main branch. Note the current commit so you can show before and after.
- Find out how the product runs its own tests (the config's detected stack, the package scripts, existing test folders). Run
  the relevant existing tests first and record failures that already exist, so you can tell your regressions from old ones.
- Work in severity order, most severe first. Unless the user says otherwise, fix critical and important findings; leave minor
  ones in the report. Skip anything that is not fixable from source (third-party widgets, infrastructure, hosting
  configuration) and mark it deferred with the reason.
- Write the diagnosis in two sentences: what is wrong and where. See `debugging-and-root-cause.md`. Restrict yourself to the
  directory or files that own that behaviour.

## Regression test first
- Write a test that reproduces the failure before you change the product. Use the lowest level that can show the bug: a unit
  test for logic, an integration test for state or requests, an end-to-end test only when nothing smaller can cover the
  journey.
- Match the product's existing conventions: framework, folder, naming, fixtures. Prefer adding a row to an existing table of
  cases, or a new test file, over editing existing tests. Never change an existing assertion to make something pass.
- Run it and read the failure. It must fail for the right reason: the output shows the same wrong value, status or behaviour as
  the finding. A failure from a missing import, a bad fixture, a typo, a timeout or the wrong role is not a valid red test;
  fix the test.
- Ask four questions and keep the answers with the test: What does it protect? What change would make it fail again? Why did
  the existing tests miss this? Does it need a hook added to production code just for testing? If the last answer is yes,
  redesign the test; do not add a test-only seam to the product.
- If no automated test is possible (a visual defect, a third-party service, a missing auth state), say so, and expect at most a
  best-effort classification with a written manual re-check.
- Keep the regression test and its failing output even if the fix is later reverted.

## Minimal fix
- Change the narrowest place that owns the root cause, not where the symptom appears. Fix the cause, not the symptom.
- No refactors, renames, reformatting, dependency upgrades, comment sweeps or "while I am here" improvements. One finding, one
  fix.
- Do not weaken a check to get green: no loosened assertion, widened timeout, extra retry, skipped test, disabled rule or
  removed validation.
- Search for the same defect in sibling code. If the same root cause appears in the same small area and your test covers it,
  fix it with the same change. Otherwise report it as its own finding.
- Before editing a shared helper, a data format, a public endpoint or a database column, check the blast radius: every caller,
  every serialised copy, every other consumer (other apps, exports, scheduled jobs). Name the single fact that makes the change
  safe and say how you verified it. Never invent callers; "none found" is a valid answer.
- Do not add speculative defensive code or broad catch-all handling that hides the original error.

## Verify
- Run the regression test: it must now pass.
- Repeat the original failing steps exactly (the same probe or the same UI actions) and inspect the final state, not just the
  pass or fail result: the stored record, the response body, the totals, the screen.
- Run the adjacent happy path: the normal use of the same feature, and a neighbouring input just inside the valid range.
- Run the product's relevant test suite, or the module's tests, and compare with the baseline you recorded.
- For UI fixes, repeat the browser steps from a fresh load, check the console and network, and save new after-evidence with a
  new file name. Never overwrite the before evidence.
- A check that is blocked, inconclusive or not run is not a pass. If a result flickers, run it several times.
- If a recheck fails, make at most one revised minimal fix based on the new evidence. If that also fails, revert.

## Commit hygiene
- One verified fix per commit, together with its regression test. Message: what behaviour is corrected, the finding it closes,
  the root cause in one line, how it was verified.
- Review the diff before committing. Stage specific paths, not everything. The commit must contain only the fix and its test:
  no evidence files, report data, local configuration, secrets or generated output.
- Never commit a red test, a half fix, or an unverified guess. Leave those uncommitted and say so.
- Never rewrite history that is not yours, never force-push, never push or open a pull request unless the user asked.
- Do not commit with failing hooks bypassed.

## Stop rules
Stop, show progress and ask how to continue when any of these happens:
- Two fixes in this session were reverted.
- You edited or need to edit a file unrelated to the finding.
- A fix needs more than about five files, a migration, a configuration or infrastructure change, or a change to shared
  behaviour you cannot verify.
- Three hypotheses about the cause failed, or two fix attempts rested on the same wrong premise.
- Fixes keep revealing new problems in other layers; the cause is probably elsewhere or design-level.
- The test suite was already failing in the area before you started and you cannot tell the difference.
- Only minor issues remain.
- After every five fixes and after any revert, pause and review: scope, files touched, any sign of drift.
- A session needs a hard cap on fixes (a few dozen at most); when it is reached, stop and report.
- Any limit from the user or host applies. Commits that only add tests do not count towards these limits.

## Never touch
- Credential files and environment files, tokens, keys, and the user's local settings.
- CI and deployment configuration, build pipelines, lock files and dependency versions (unless the finding is in them and the
  user agreed).
- Existing tests, snapshots and fixtures: do not edit them to pass. Add new ones.
- Generated code, vendored or third-party code, minified bundles, database migration files already applied elsewhere.
- Production systems and any URL that is not the configured staging or local environment.
- Data you did not create. Never run a data fix, bulk update or delete against shared data to "make the test pass".
- The user's uncommitted work.

## Classification
Report every attempted fix with one of these:
- **Verified**: the regression test went red then green, the original steps pass, the adjacent happy path passes and the
  relevant suite shows no new failure. State any coverage gap you could not close.
- **Best-effort**: applied, but not fully verifiable (needs an auth state, an external service, a visual check, or an
  intermittent defect you cannot force). Say exactly what remains unverified and how a person can check it.
- **Reverted**: a regression appeared or the problem remained. Say what you tried and why it failed; the regression test and
  evidence stay.
- **Deferred**: not attempted, with the reason (not fixable from source, needs a decision, below the severity bar, stop rule).
Never claim "this should fix it" without running the checks. For each item record: files changed, commit id (if any), the
test command and its before and after result.

## Revert discipline
- Undo only your own change: a commit you made with a normal revert commit, or the specific files you edited after you confirm
  with a diff that they contain only your edits.
- Never use commands that discard everything (hard reset, clean, dropping a stash, checkout of the whole tree). They can destroy
  the user's work.
- After the revert, rerun the tests and confirm the tree matches the state before your attempt.
- Keep the failing regression test (uncommitted) and the evidence, and record the reverted attempt in the report.

## Severity hints
- Fix order follows impact: **critical** (data, money, security, blocked users), then **important**, then **minor** only if the
  user asked for it.
- A fix that touches money, permissions or stored data deserves the strictest verification: check final stored state and
  one neighbouring role or record.

## Safe on staging
- Run tests against a local or test database, never a shared one. Do not run migrations or data fixes on shared staging.
- Use `QA-` data only, and clean up only what you created.
- No real emails, payments or external calls from tests: use the product's fakes or test mode.

## See also
`debugging-and-root-cause.md`, `bug-reporting.md`, `flaky-tests.md`, `browser-testing.md`.
