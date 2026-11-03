---
name: qa-tests
description: The test bank: checks that earlier QA runs saved as tests. See what it holds and how each test is doing, run it on its own, copy tests into the project as real Playwright tests (with your approval), or retire stale ones.
argument-hint: "[status | run | export | prune | baseline accept|status]"
---

# {{CMD_QA_TESTS}}: the test bank

You help the **owner** manage the tests QAMind's runs saved in {{HOST_NAME}} (the "test bank"). Each runs by itself at the start of every QA run; this is where a person looks at them, runs them on their own, copies them into the project, and retires the ones that are out of date.
Writing into the project and retiring a test are **the owner's decisions**: ask, wait for their answer about that in this conversation, then run the one command. If the host refuses a command, say so and stop.

User arguments: `{{ARGUMENTS}}`

Everything goes through `{{CLI}}` (one command per call, no `&&`, `||` or pipes; only if the shell says `qamind: command not found`, run the same arguments as `{{CLI_FALLBACK}}`). It prints JSON. Never read or edit the bank's files yourself. Report in plain words: test ids only where the user needs them.

| Arguments | What to do |
|-----------|------------|
| nothing or `status` | `{{CLI}} tests status`. Say how many tests there are (API and UI), which areas they cover, which failed last time, which are set aside as flaky and why, and which look stale (`prune_candidates`). |
| `run` | `{{CLI}} tests run`. It needs the test environment up and test logins in `.env.qa`; it refuses a production address. Report passed, failed, flaky and skipped, and for each failure the test's title and the detail. A test that fails twice is a lead, not yet a bug: offer `{{CMD_QA_ONLY}} regression` to confirm it. |
| `export` | Copy tests into the project, below. |
| `prune` | Walk through the stale tests, below. |
| `baseline status` | `{{CLI}} baseline status`: which pictures (page, role, browser, screen size) are the baseline now and when each was accepted. |
| `baseline accept` | Accept a run's pictures as the baseline, below. |
| `browsers` | `{{CLI}} browsers status`: which browsers QAMind's own checks can start here. To add one (`webkit` for Safari's engine, `firefox`): ask first, it is a download of about 80 MB into Playwright's own browser folder, then `{{CLI}} browsers install webkit`. |

## Export

Each test becomes a real Playwright Test file written by QAMind from the saved data. It holds **no passwords**: logins are read from the environment variables the config names.
1. `{{CLI}} tests export` shows what would be written and where (a preview: nothing is written). Add `--ids T-001,T-004` for chosen tests and `--dir <folder>` for another folder; by default it uses the folder of the project's Playwright config, else `tests/qamind/`.
2. Show the user the files and the folder, and **ask whether to write them**. Say that an existing file is never overwritten, and that the tests need `@playwright/test` and the login variables to run.
3. Only after a yes: the same command with `--yes`. Then tell them the files are there to review and commit like any other test; QAMind never commits or pushes.

## Prune

`{{CLI}} tests prune` lists tests that look stale (failed their last five runs, quarantined for over a month, never run). These are suggestions. A test that keeps failing may be a real bug that is still open: say so, and ask what they want.
For a test they want gone: `{{CLI}} tests retire T-003 --reason "why"` (it moves to the archive, never deleted). For a flaky one they want back: `{{CLI}} tests unquarantine T-003` (its history starts again); to set one aside by hand: `{{CLI}} tests quarantine T-003 --reason "why"`.

## Baseline

The sweep of a QA run photographs the key pages; a **baseline** is the set of pictures the owner judged good, and later runs are compared with it (a difference above `visual.threshold` becomes a finding with before, after and difference pictures).
1. Ask which run is good (the id is in its report folder name, `.qa/reports/<id>`), and look with them at what it photographed: the report's "Browsers, screen sizes and speed" section lists the pages. A run that found problems on a page makes that page's picture a baseline **with the problem in it**: say so, and offer to accept only the pages that look right (`--pages my-orders,login`).
2. Only after their yes: `{{CLI}} baseline accept --run <id>` (add `--pages a,b` for some pages). It replaces the earlier baseline of each picture it saves, and says which pages had problems when photographed.
3. A picture that changed on purpose (a redesign) is accepted the same way; one that changed by accident is a bug to fix, not to accept.

## Always
- The owner decides. No write into the project and no retirement without their answer in this conversation.
- Honest reporting: a test that was skipped, or could not run, is said so; it is never called passing.
