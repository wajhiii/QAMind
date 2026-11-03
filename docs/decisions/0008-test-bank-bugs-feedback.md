# 0008: The test bank, bugs across runs, and what people say about findings

Status: accepted (Phase 7.7). Date: 2026-11-02.

Three features that make runs build on each other: checks that earlier runs found worth keeping are run first, every problem has an identity so a report can say what is new, what is still open and what **came back**, and a person's verdict on a finding changes what the next run does.

## 1. The test bank (spec 13.3)

- **A test is data, not code.** An API test is a plan (requests, and what each must answer: the same format `api run` executes); a UI test is a list of steps in a fixed vocabulary (`goto`, `click`, `fill`, `select`, `press`, `wait`, and the checks `expect_text`, `expect_no_text`, `expect_visible`, `expect_url`, `expect_count`).
  QAMind runs both itself. Saving agent-written scripts was considered and left out: a script would run with the user's rights, started by a command (`qamind tests run`) the host pre-approves, outside every check this tool has. `tests export` turns a test into a real Playwright Test file for the project, **written by code from the saved data**, with no credential in it; a person reviews it like any other code.
- **Saving is validated.** A test needs a **value card** (what it protects, when it fails, why it is not a duplicate; three real sentences), every request needs `expect.status` and every UI test a check (or it can never fail), roles and web UIs must exist in the config, a UI `fill` may only name the config's login variables, nothing may hold a secret or personal data,
  and a near-duplicate is refused with the id of the test to extend (`extends`). Tests are saved from a file the agent writes in the run folder (`bank_save_test`), not through a large nested tool schema.
- **A run must leave something behind.** `run finish` refuses a manual run with critical or important findings that saved no test, unless `data/bank-skip.json` says why none can be written (a real sentence, kept in the summary and shown in the report); auto-QA, CI, out-of-time and broken-environment runs are exempt. The instructions alone were not enough: in a real run the agent finished with seven findings and no test.
- **The bank runs first** (`qamind tests run`, Step 2 of the QA skills), under the run's budget. A failure is run again at once: a pass on the retry is **flaky** (counts as a pass), a test that passes only on a retry twice in its last five runs, or whose result flips four times in its last eight, is **quarantined**: listed, not run, until the owner releases it. A test that **fails twice** is a lead that `report lint` makes the run settle:
  report it as a finding that names the test (`bank_tests`), or list it as unconfirmed with the same field. A run cannot retire a test.
- **UI tests run in a browser of their own, behind the same policy.** Every request is checked against the run's policy, and **redirects are not left to the browser**: the first version used `route.continue()`, and a test in real Chrome showed a redirect to an address outside the policy was *followed*. Each request is now made without following redirects, the `Location` is checked, and only then is the answer handed to the browser,
  which asks again (and is checked again). A sub-resource on another origin is refused the same way. If Playwright cannot be found, UI tests are reported as skipped with the reason, never as passed.
- **Outside a run** (`/qa-tests run`) the bank uses the same config checks as `run start` (an unfilled template, a production address and an unconfirmed address all refuse) and writes to `.qa/bank-runs/`, not to the run history.
- **Export and retirement are the owner's.** The hook refuses `tests retire|quarantine|unquarantine` in every run, and `tests export` in a report-only run; export writes nothing without `--yes`, which the skill passes only after the user said yes, and never overwrites a file.

## 2. Bugs across runs (spec 13.12)

- **A fingerprint** (area, type, the symptom's significant words; numbers and odd characters kept because they are the trigger) identifies a problem across runs; `BUG-001` is the project's own id. Matching is **cautious**: two different bugs in one area read alike ("fails for page_size=0", "fails when q is '('"), so a close title is not enough: the trigger has to match.
  A finding that resembles a known bug without clearly being it makes `report lint` ask the agent which it is (`"bug": "BUG-003"` or `"new"`); code never guesses across that line. A finding that lists a failing bank test takes the bug that test protects.
- **Statuses**: `new`, `still-open`, `fixed`, `regressed` (shown to people as **came back**), `accepted`, plus `not-a-bug` and `duplicate` from feedback. **Fixed is never assumed**: an open bug that was not found is fixed only if its protecting bank test passed (proof without a line from the agent) or the agent wrote a re-check saying what it repeated and saw (`data/rechecks.json`, validated); otherwise it stays open and is reported as "not looked at again".
  A bug that was fixed and is found again is `regressed`. A fix made on a `/qa` branch does not mark a bug fixed: it is not merged.
- **Reports**: bugs that came back are listed first, called out in the 30-second summary and in the technical report's own section, each problem says "New", "Still open (seen N times, since DATE)" or "Came back (fixed on DATE)", and a bug that came back keeps the verdict from being "Ready". A bug that is not a finding of the run (fixed, accepted) is named by its **plain title**, stored with the bug,
  because the admin report may not use technical words (the first version used the technical title and the admin-language check refused it).
- Bug records, the lifecycle of each run (`data/lifecycle.json`, frozen at `run finish` so a later render says what the run said) and test links are written under the store's lock. Tests saved from a finding learn which bug they protect when the run finishes, because that id is only final then.

## 3. What people say (spec 13.5)

- `qamind feedback add <ISSUE-nnn|BUG-nnn> <verdict>` with `not-a-bug` (needs a reason; it becomes a known false alarm that carries who and when, so the agent can cite "Per feedback from <name> on <date>"), `wrong-severity <level>` (the next reports show that level, say who set it and keep what the run judged; a learning is saved),
  `duplicate-of`, `confirmed` / `good-catch` (the learnings that shaped the finding gain confidence, the area's risk rises), `fixed` (a later find shows as came back), `wont-fix` (listed under "Known, accepted", not counted).
- **A QA run cannot give feedback**: the hook refuses `feedback add|import` and writes to the feedback and bug files in every run mode; the skill's deciding commands are not pre-approved, so the host asks. Notes are screened for secrets and personal data. The name is whoever the person says (`--by`), the project's git user, or the account name; nothing verifies it, and the docs say so.
- **From the admin report**: the "Your feedback" line under a problem is read by `feedback import --run ID --by NAME`; lines that do not start with a verdict are returned, never guessed, and importing twice applies nothing twice.
- **Stats**: verdicts feed `memory stats`; precision is given only from 5 judged findings on (one verdict per bug), never from a handful.

## Memory formats

`bugs.jsonl`, `feedback.jsonl` and `test-bank/bank.jsonl` are new at schema 2 (nothing existed in format 1, so nothing migrates); they are in the list the store check uses, so a store from a newer QAMind is refused as a whole. Run summaries gain `lifecycle` counts and a `bug` on each compact finding (optional fields).

## Found while building, and fixed

- The shared test helper `cli()` captured *all* standard output while a command ran, including the test runner's own result events: tests that finished in that window vanished from the count (3 of 8 in the first bank test file). It now captures only the command's JSON.
- Findings the owner accepted were moved out of `findings.json` before the lifecycle was worked out, so the report could not say who accepted them.
- The redirect hole in the UI runner and the technical title in the admin report, above.
- **From the real-agent run:** the test protecting a bug the owner had accepted kept failing and `report lint` kept demanding that the run account for it (it blocked the agent twice); such a failure is now expected and does not stop the run. And an agent that rewrote `findings.json` after a lint error made one accepted bug count twice
  (the finding came back without its id and got a new one); entries are de-duplicated by bug and title.
- **A request that got no answer counted as a pass.** The API runner skips its expectation checks when a request fails at the network level, so a bank test whose server was down saw no failed expectation and came out green. It is now skipped with the reason (never passed, never failed: an environment that stopped answering is not a product bug),
  and the remaining API tests are skipped at once instead of each waiting out its timeouts. Found while reading why one agent run's bank took seven minutes (the machine had gone to sleep; the question it raised was what the bank does when the API stops answering).
- **A path rule in a skill's allowed-tools is relative to the agent's current directory**, which its Bash `cd` moves: after `cd <run folder>` the next write was refused (seen in two real runs; reproduced with the CLI). The skills now use `Edit(/.qa/**)`, anchored to the project root.

## Not done, or not verified

- **Linear ticket feedback and updating tickets by fingerprint** wait for Phase 8 (Linear and Sentry). **Metrics and escaped bugs** are Phase 7.10; the feedback and bug data they need is recorded now. **Visual baselines, ticket mode, email sandbox** are Phase 7.9.
- **UI tests use a small vocabulary**; anything it cannot say (file uploads, drag and drop, multi-step dialogs with waits for animations) cannot be saved as a UI test. They run in one browser (Chrome or Edge) at one viewport. WebSockets are not checked by the policy.
- **Replaying a test that creates data** adds test records each run (the `QA-` prefix is advised and warned about, not enforced); cleanup is the setup commands' job (Phase 7.6).
- **Exported tests** were checked for valid syntax and for holding no credentials, **not run** (`@playwright/test` is not installed here), so what a project's own Playwright setup makes of them is untested.
- **Bug matching is a heuristic** with an explicit escape (`bug`), tested on the demo app and on constructed cases, not on a project with hundreds of bugs. The bug file keeps 1000 records; older fixed ones move to the archive.
- **Feedback names are not verified.** Windows and Linux were not run; the new tests are in the Windows CI job's list.
