# 0003: Fix mode (`/qa`)

Status: accepted (Phase 6). Date: 2026-11-03.

## Decision

`/qa` runs the whole `/qa-only` procedure, writes the baseline report, and then fixes the confirmed findings the config allows (critical and important by default), one at a time, on a
git branch. The spec's fix rules (section 9.3) are **checked by code wherever they can be**, because an agent that is only asked to follow them will, sooner or later, skip one.

- **The fix tools live in the qa-memory server** (`fix_preflight`, `fix_create_branch`, `fix_begin`, `fix_run_tests`, `fix_commit`, `fix_revert`, `fix_defer`, `fix_run_suite`,
  `fix_continue`, `fix_status`), next to the memory and run tools. The spec asks for deterministic logic to move into the server rather than into skill prose, and a second server would
  have meant a second 1.7 MB bundle and process for no gain. Only a `/qa` run started by a person can use them: a report-only run, and any run started by CI, gets a refusal that says why.
- **Git writes, branch creation and test execution are tools; the agent's shell cannot do them.** While a fix run is active the safety hook blocks every writing `git` command, the git host's CLI,
  dependency changes and in-place edits from Bash, so the rules in the tools cannot be bypassed by typing the command by hand. Edits go through Edit and Write, and the hook refuses protected paths there.
- **No operation that leaves the machine exists.** There is no push, pull, fetch, remote, force, hard reset, clean, stash or checkout in the fix code (a test scans its sources for each),
  and the project's own git hooks are never bypassed (`--no-verify` is never used).

## The proof at commit time

`fix_commit` does not trust the order the agent worked in. It checks the diff, then **takes the fix out, runs the regression test (it must fail), puts the fix back byte for byte, and runs the test again
(it must pass)**. A test that passes without the fix proves nothing and is refused; a broken test fails both ways and is refused; the fixed files are copied into the run's evidence first, so a crash in the
middle cannot lose them. The checks that come before it: only the files declared at `fix_begin` changed, nothing protected or on the do-not-touch list, a production change and a test in the same commit,
no line of an existing test removed or changed (adding cases is fine), nothing staged beforehand. A refused commit changes nothing and says what to do.

What the proof can **not** show, and the design says so instead of hiding it:
- *Why* the test failed. A test that fails without the fix because an import is missing (the fix adds the function) looks the same as one that fails on the wrong value. The skill tells the agent that the
  red run must show the finding's wrong value, and it must state what it saw in `recheck`; a person reading the technical report sees the failing output and can judge.
- Fixes no automated test can reach (visual defects, a third-party service). They are not committed: they are deferred with a reason, which is the spec's own acceptance rule ("no commit lacks a regression test").
- Anything the project's tests do not run. The proof is only as good as the project's test command.

## Stop rules, and who may lift them

Two reverts, every five fixes, an edit to a file the fix did not declare, a fix that needs more than five files: each sets a stop in `data/fix-state.json`, and every fix tool refuses until `fix_continue`.
The cap on fixes (30 by default, `fix_policy.max_fixes`) cannot be continued past. A tool cannot know what the user said, so the two tools that need the user's go-ahead, `fix_create_branch` and
`fix_continue`, are **left out of the skill's pre-approved tools** and the host asks the user to approve each call, with the reason on screen. That is a real consent step, not the agent's word.

## What may not be touched

Built in (and checked in the hook, `fix_begin` and `fix_commit`): credentials and environment files, keys, package-manager settings that can hold tokens, QAMind's own config and fix record, CI and deployment
files, Dockerfiles and compose files, infrastructure files, lock files, **dependency manifests** (`package.json`, `composer.json`, `requirements*.txt`, `pyproject.toml`, `go.mod`, ...), installed and generated code,
minified bundles and database migrations. Plus the project's own `fix_policy.do_not_touch` globs. Manifests are protected whole because the hook cannot tell a version bump from a script change; the cost is that a
finding that really lives in one cannot be fixed by `/qa`, which is what the knowledge guide ("lock files and dependency versions ... unless the user agreed") already says to leave to a person.

## Other decisions

- **QAMind's own `.gitignore` entries do not make the tree "dirty"**: the first run appends `.qa/` and `.env.qa` (spec 7.1), and refusing a fix run over QAMind's own edit would be absurd. Only a `.gitignore` whose
  every difference from the committed one is exactly those lines is ignored; a real edit by the user still blocks.
- **A project inside a larger repository works**: git reports paths from the repository root, so they are mapped to the project folder; a change elsewhere in the repository is the user's work and blocks the next fix.
- **The test command comes from the project**: `fix_policy.test_command` / `test_file_command`, else the project's package scripts and the standard command of the detected runner (node:test, jest, vitest, mocha, pytest,
  rspec). The agent supplies only file paths, and only plain relative ones (no spaces or shell syntax). Output is cut to its tail and masked for secrets, and a command that does not finish is killed with everything it started.
  Node's own marker for nested test runs is removed from the child's environment: a nested `node --test` that inherits it exits 0 whatever happened (found while testing this).
- **Both reports list every problem**, with its status. Before this phase the admin report listed only open problems, which would have hidden a fixed one from managers; now statuses are "Fixed and checked", "Fixed, needs a human to
  confirm" and "Not fixed yet". The verdict counts verified fixes as merged and says so; a regression in the final suite stops it saying "Ready". `report lint` refuses a fix claim the fix loop did not record, a fix left in progress,
  and fixes with no final suite run; `run_finish` refuses the last two outright.
- **Reverting** an attempt in progress removes only the declared files, keeping the attempt and its failing test in the run's evidence folder; a committed fix is undone with a normal revert commit. History is never rewritten.

## What it did on the demo app

Six real runs, 45 fix commits, every one re-proved red on its parent and green on the commit; the suite stayed green, nothing was pushed, no protected file changed, and the host refused `fix_continue` when the skill did not pre-approve it. The agent never tried a git
write from its shell. See [EVALUATION-LOG.md](../EVALUATION-LOG.md), including what the real agent did not exercise (reverts, the unrelated-file stop, the cap).

## Not done

- Nothing on Windows or Linux has been run. The Windows CI job (allowed to fail until the owner has read its first result) now includes the fix tests; the fix loop shells out to `git` and to the project's test command, so Windows is where a surprise is most likely.
- Test commands for frameworks outside the list above need `fix_policy.test_file_command`.
- No UI-level regression tests: a project without a browser-test setup gets its UI findings deferred, not fixed.
- `fix_policy` has no per-severity caps or per-area rules; the do-not-touch list and the severities are the controls.
