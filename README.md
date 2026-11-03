# QAMind: a Senior QA Engineer agent

QAMind is a reusable QA agent you install once and use in any project. Give it a job:

- **`/qa-only`**: test the product thoroughly and **report**, without changing any code.
- **`/qa`** (fix mode): test, then fix the bugs it found, safely on a branch. _Planned (Phase 6)._

It tests your **API** (from its OpenAPI spec), each **web UI** per role, cross-surface consistency, permissions and your
business rules, and writes a technical report with reproducible findings, evidence, and an explicit **Not tested** list.
It works on staging or local environments only, never production.

> **Status: Phase 7.5 of 8.** Working today: `/qa-only` and `/qa` (fix mode) on **Claude Code**, API testing from OpenAPI, browser testing of web UIs, a safety guard, a built-in QA knowledge base (27 topic files, sourced in
> [docs/KNOWLEDGE-SOURCES.md](docs/KNOWLEDGE-SOURCES.md)), a technical report for developers and a plain-language admin report for managers (release verdict, email-ready HTML), **project memory** that each run applies, a validated
> **`qa-memory` MCP server**, **auto-QA** after every task that changed code (off by default), **global lessons you approve** and a memory review, and now **installation for other tools**: Cursor (experimental, from its docs, never run in a real Cursor)
> and any agent that reads `AGENTS.md` (instruction-only), with `qamind setup | status | update | uninstall`. Codex was deferred by the owner. Not built yet: CI mode and the rest of the [roadmap](#roadmap). Nothing below is claimed beyond what is built.

## Install

QAMind is installed from its Git repository only (no npm package, no registry). Pick your tool; each install is separate and `setup --host X` never touches the others.

**Claude Code** (full: hooks enforce auto-QA and the safety guard), with its plugin marketplace:

```
/plugin marketplace add <owner>/qamind
/plugin install qamind@qamind
```

Update with `/plugin marketplace update qamind`. Requires **Node 20+** (the plugin runs its own bundled code) and **Google Chrome or Microsoft Edge** for web testing (otherwise run `npx playwright-core install chromium` once).

**Cursor, any agent that reads `AGENTS.md`, and the `qamind` command** (clone and run setup):

```
git clone --depth 1 https://github.com/<owner>/qamind.git ~/.qamind/app
cd ~/.qamind/app && ./setup --host auto        # Windows: setup.cmd --host auto
```

`setup` needs **Node 22.18+** (it builds from source: `npm ci`, then the build; QAMind's runtime then runs on Node 20+), writes only what your tool needs, puts a `qamind` command in `~/.local/bin` (it tells you if that is not on your PATH) and records exactly what it did.
`--host auto` installs every supported tool it finds on your machine; name one to install just that tool. `--project` installs into the current project instead of your account. `--dry-run` shows what would happen and changes nothing.

```
qamind setup --host cursor              Cursor, for your account       (experimental)
qamind setup --host generic --project   an AGENTS.md section in this project, for any other agent   (instruction-only)
qamind setup --host claude              Claude Code through its own CLI, instead of the /plugin commands
qamind status                           one row per install: tool, tier, what is in place, how auto-QA and safety are enforced
qamind update [--version vX.Y.Z]        the latest release tag (releases are Git tags), re-rendered for every install; --edge follows the branch until there are tags
qamind uninstall --host cursor          removes exactly what setup added, restores what it replaced, leaves your other tools' settings alone
```

**What differs by tool** (stated plainly, because it matters):

| | Claude Code | Cursor | Generic |
|---|---|---|---|
| Tier | `full` (real runs recorded) | `experimental`: from Cursor's docs, **never run in a real Cursor** | `instruction-only` |
| Names | `/qamind:qa-only` ... | `/qamind-qa-only` ... | "follow the `qa-only` procedure" |
| Auto-QA | enforced by hooks | wired through Cursor's hooks, untested in Cursor | advisory: the agent is asked, nothing makes it |
| Safety guard (production, credentials, report-only writes) | enforced by a hook | **instructions only** (see [docs/HOSTS.md](docs/HOSTS.md) for why) | instructions only |

Everything else is identical on every tool: the test workflow, severity, report formats, the memory format and your private store in `~/.qamind`, which setup, update and uninstall never touch (only `qamind uninstall --purge --yes` does). To try a trial install without touching your real tool, set
`QAMIND_USER_HOME` (and `QAMIND_HOME`). Details and limits: [docs/HOSTS.md](docs/HOSTS.md); adding another tool: [docs/ADDING-A-HOST.md](docs/ADDING-A-HOST.md).

To try Claude Code from a local clone:

```
claude plugin marketplace add /path/to/qamind
claude plugin install qamind@qamind
```

## First run

1. Open your project in Claude Code and run `/qamind:qa-only quick`.
2. On the first run QAMind creates `.qa/config.md` and `.env.qa.example`, adds `.qa/` and `.env.qa` to your `.gitignore`,
   tells you what to fill in, and **stops without testing anything**.
3. Fill in `.qa/config.md` (URLs, the production addresses to block, test accounts, critical flows, business rules) and
   copy `.env.qa.example` to `.env.qa` with **test** logins. Use at least two client accounts from different customers.
4. Restart the Claude Code session once (the browser tool reads credentials when it starts), then run `/qamind:qa-only` again.

## Commands

| What | Claude Code | Notes |
|------|-------------|-------|
| Test and report | `/qamind:qa-only [full\|quick\|regression\|diff] [--ticket ID\|FILE] [focus]` (Cursor: `/qamind-qa-only`) | Writes only inside `.qa/` and the QAMind user store. `--ticket` tests one request and reports its criteria, see [Coverage](#coverage-other-browsers-speed-email-and-tickets) |
| Test and fix | `/qamind:qa [full\|quick\|regression\|diff] [focus]` | Fixes on a git branch, one commit per fix with its regression test; never pushes, merges or opens a pull request. Needs a clean working tree and a project test command; see [Fix mode](#fix-mode-qamindqa) |
| Auto-QA on, off, mode, pause | `/qamind:qa-auto on\|off\|status\|mode diff\|quick\|full\|fix\|ask\|pause 1h\|global on\|off` | QA after every task that changed code. **Off by default.** See [Auto-QA](#auto-qa-qamindqa-auto) |
| Review what QAMind remembers | `/qamind:qa-memory-review [lessons\|prune\|stats]` | Approve or reject the generic lessons it proposed for all projects, archive stale memory, see run statistics. Only you decide. See [Memory review](#memory-review-qamindqa-memory-review) |
| Tell QAMind what you think of a finding | `/qamind:qa-feedback [ISSUE-003 not-a-bug why \| list \| import <run>]` | Not a bug, wrong severity, duplicate, confirmed, fixed, won't fix, good catch: the next run changes accordingly. Only you can: a QA run cannot. See [Findings across runs](#findings-across-runs-the-test-bank-and-your-feedback) |
| The test bank, baselines, browsers | `/qamind:qa-tests [status\|run\|export\|prune\|baseline accept\|browsers]` | The checks earlier runs saved. See what it holds, run it, copy tests into your project as real Playwright tests (only with your yes), retire stale ones; accept a run's screenshots as the baseline later runs are compared with; add a browser (WebKit, Firefox) |

Modes: `full` (everything), `quick` (critical flows and top risks), `regression` (re-run last findings), `diff` (changed
code and what depends on it), `ticket` (one request, with `--ticket`). Free text after the mode narrows the focus.

## What you get

Each run creates `.qa/reports/run-<timestamp>/`:

- `ADMIN-REPORT.md`: **for managers, no jargon.** The first line is the release verdict (✅ Ready to release, ⚠️ Ready with risks, ⛔ Not ready
  to release), then a six-line summary, results by area, every problem with where it happens, who is affected and steps anyone can follow on screen,
  a comparison with the last check, what was not tested and why, and at most three next steps. It is generated from the same data as the technical
  report and a consistency check fails if the two disagree. See [an example](docs/examples/ADMIN-REPORT.example.md). On request,
  `report export-html` makes one self-contained `ADMIN-REPORT.html` for emailing.
- `TECHNICAL-REPORT.md`: metadata, environment health, the test plan (charters), findings with exact reproduction steps and
  evidence, unconfirmed leads, a coverage matrix, a **Not tested** list with reasons, API results, proposed regression tests.
- `evidence/` (sanitized API requests/responses with curl reproductions), `screenshots/`, and `data/` (the structured
  results the report is rendered from).

Every finding was reproduced at least twice and has evidence; anything not reproduced is listed as _Unconfirmed_, and
anything not tested is listed with the reason. Nothing untested is ever reported as passing.

## Where files live

| Where | What |
|-------|------|
| `<project>/.qa/` (git-ignored) | `config.md`, `reports/`, `suggested-improvements.md` |
| `<project>/.env.qa` (git-ignored) | test credentials only |
| `~/.qamind/projects/<id>/` (private, per user) | project identity, detected stack, run history, product map, risk areas, learnings, known false alarms, bugs across runs, feedback, the test bank, run marker, migration backups. Never committed, never uploaded. Override with `QAMIND_HOME`. |
| `~/.qamind/pending-lessons.md` (private) | generic lessons the agent proposed for any project; nothing uses them until you approve one |

The project id comes from the git `origin` URL, so two clones of one repo share memory; without a remote it is a hash of
the path. Details in [docs/MEMORY.md](docs/MEMORY.md).

## Fix mode (`/qamind:qa`)

`/qamind:qa` tests exactly like `/qamind:qa-only` and writes the same baseline report. It then fixes the confirmed problems the config allows (`fix_policy.fix_severities`, critical and important by default), one at a time:
it diagnoses, writes a regression test in your project's own framework and sees it **fail for the right reason**, makes the smallest fix, re-checks the original steps, and commits both together as `fix(qa): ISSUE-NNN ...`.
Before each commit QAMind proves the test by taking the fix out and running it again. A fix with no automated test possible (a visual defect with no browser test setup) is left for a person, with the reason in the report.

- **What it needs:** a git repository with a clean working tree and a branch that is not the default one (it asks before creating `qa/fix-...`), and a way to run your tests (detected from your package scripts, or `fix_policy.test_command` and `test_file_command`). It runs your whole test suite before and after.
- **What it never touches:** credentials, CI and deployment files, lock files and dependency manifests, generated code, migrations, existing test assertions, and anything in `fix_policy.do_not_touch`.
- **When it stops and asks you:** after two reverts, after every five fixes, if it edits a file the fix did not declare, or if a fix needs more than five files. The host asks you to approve the tool that lets it continue. There is a hard cap on fixes per run (30 by default).
- **What you get:** both reports list every problem with its status (fixed and checked, fixed and needs a person to confirm, not fixed), say "Fixes are on branch X; a developer must review and merge them", and keep the proof; a regression after the fixes is flagged loudly. The reports from before any fix are kept.
- **Not for CI:** a run started by CI is always read-only.

Details and limits: [decision 0003](docs/decisions/0003-fix-mode.md); how it behaved on the demo app: [docs/EVALUATION-LOG.md](docs/EVALUATION-LOG.md).

## Auto-QA (`/qamind:qa-auto`)

Turn it on and QAMind checks every task that changed code before Claude Code calls the task done. **It is off until you turn it on**, it only does anything in a project where you did, and the very next task obeys `/qamind:qa-auto off`.

```
/qamind:qa-auto on                       for this project (run /qamind:qa-only once first, so it has a config and test logins)
/qamind:qa-auto status                   on or off and why, mode, last run, what would trigger next
/qamind:qa-auto mode diff|quick|full|fix|ask
/qamind:qa-auto pause 1h                 off for a while; it switches itself back on
/qamind:qa-auto global on                the default for every project that has no setting of its own
```

- **Modes:** `diff` (the default once on): report-only QA of the files the task changed and what depends on them. `quick`: `diff` plus a smoke check of the critical flows. `full`: a complete report-only run (slow). `fix`: also fixes confirmed critical and important
  problems on a branch (only because you chose it; every rule of fix mode stands). `ask`: asks "Run QA on these changes? (yes / no / always / never)" after each task.
- **Tags in a prompt** (one task only, any case, anywhere in the prompt): `#qa` runs QA after this task even when auto-QA is off, `#qa-full` forces a full report-only run, `#qa-fix` forces fix mode, `#noqa` skips it.
  `QAMIND_AUTO=0` in the environment switches it off for a whole session, whatever the settings say.
- **What triggers it:** a task that changed code. Not a task that changed nothing, only documentation (`*.md`, `docs/**`) or lock files, a task that was itself a QA run, the same state twice in a row, or a second task within 3 minutes of the last run (unless you used a tag).
  Work you already had open before the prompt is not counted as the task's change.
- **What you get:** a short chat summary (at most 5 lines: counts, the title of every critical or important problem, the report path) and the normal reports under `.qa/reports/`, marked as an automatic run. Memory is updated as in any run.
  If the logins or the config are missing, or the app is not running, it says "Auto-QA skipped: <reason>" once per session instead of failing every turn.
- **Where it lives:** your private settings are in `~/.qamind/projects/<project>/auto.json` (global: `~/.qamind/auto.json`), never in the repository. On Claude Code it is enforced by a hook, so the agent cannot skip it.

Design, limits and what was not verified: [decision 0004](docs/decisions/0004-auto-qa.md).

## Memory review (`/qamind:qa-memory-review`)

QAMind keeps private memory per project (what it learned, known false alarms, where problems were found) and, across projects, a short list of **global lessons**: generic observations (for example "date pickers often break across time zones") that would help on any product.
A run may *propose* a lesson; **nothing uses it until you approve it**, and no QA run can approve one for you.

```
/qamind:qa-memory-review              overview: what waits for you, what looks stale, what to do first
/qamind:qa-memory-review lessons      go through the proposed lessons one at a time: approve, reword, reject or skip
/qamind:qa-memory-review prune        archive stale learnings, false alarms and risk areas of this project (nothing is deleted)
/qamind:qa-memory-review stats        runs over time, how much memory is used, and what cannot be measured yet
```

- **Approved lessons are read by every project** on this machine (the 25 best-used and newest at most). Each must be generic: no project names, web addresses, files, tickets or code. That is checked when it is proposed, when you approve it (against every project QAMind has seen) and each time a run loads it, because you can also edit the files by hand.
- **Claude Code asks you to approve each deciding command** (approve, reject, archive) on top of your answer in chat; that is intended. Reading is not asked about.
- **Rejected lessons are remembered**, so a near copy is not proposed again. Memory you archive is moved to the project's archive with your reason, never deleted.
- Files: `~/.qamind/pending-lessons.md`, `~/.qamind/global-lessons.md` (plain Markdown you can edit), `~/.qamind/rejected-lessons.jsonl`. Details: [docs/MEMORY.md](docs/MEMORY.md) and [decision 0005](docs/decisions/0005-global-lessons.md).

## Reliable runs: test data, time limits, private data

Three optional blocks in `.qa/config.md` (commented examples are in the file QAMind creates). None is needed to get started.

```yaml
setup:                              # put the TEST environment in a known state before testing
  run_before: full_runs             # never (default) | full_runs | always
  reset_command: npm run reset
  seed_command: npm run seed
  snapshot_command: ./scripts/db-snapshot.sh   # optional, with its restore (both or neither); restored when the run ends
  restore_command: ./scripts/db-restore.sh
budget:
  time_minutes: 30                  # QAMind stops exploring, finishes the report and lists the rest as "time budget reached"
  modes: { quick: { time_minutes: 10 }, auto: { time_minutes: 5 } }
  daily_max: 120                    # minutes per day of auto-QA and CI together; then auto-QA pauses itself for the day and says so once
  max_cost: 10                      # told to the agent and recorded in the report; QAMind cannot see a host's spending, so it cannot enforce it
privacy:
  mask_patterns: ["ORD-\\d{6}"]      # more things that must never be saved (regular expressions)
  mask_selectors: [".customer-address"]   # screen elements blurred before a screenshot is taken
  mask_fields: [name, address]      # fields whose values are masked in saved API evidence
```

- **A broken environment is not a bug.** The health check (app opens, test accounts sign in, API answers) retries a failed check once; if it still fails the run stops as an **Environment problem**: no findings, nothing tested on top of it, the admin report says in plain words what did not work, and everything left untested says why.
  A check that only passed on the second try, or took more than 5 seconds, is marked flaky or slow and remembered.
- **Setup commands run on your machine, in the project folder, one line each**, and are refused if they mention an address in `blocked_production_patterns`. Their output is kept in the run folder with credentials removed and private data masked.
- **Time limits are real**: `qamind budget status` tells the agent how long is left, the API runner stops sending requests and `/qa` starts no further fix once the deadline has passed, and the reports say what was not covered. Cost limits are advisory, because the host, not QAMind, spends the money; use the host's own limit as the hard stop.
- **Private data is masked before it is saved and checked before a run finishes.** Email addresses, national ID and card numbers, phone numbers and your patterns are masked in saved evidence and reports; screenshots are taken with matching text and your selectors blurred; `qamind privacy scan --run ID` and the finish step refuse a run folder that still holds some.
  Your test accounts, reserved test domains (`example.com`, `*.test`), `QA-` data and the fictional `555-01xx` numbers stay readable. Names and street addresses inside ordinary text cannot be recognised: name those fields (`mask_fields`) or elements (`mask_selectors`). Images cannot be scanned, and the blur is for what is saved: the agent still reads the page's text, and what the host keeps of the conversation is the host's.
- **Old memory is migrated, not lost.** After an update that changes a memory format, the first run copies your store to `~/.qamind/projects/<id>/backups/<time>-schema-1-to-2/`, migrates it, and appends what it did to `backups/migrations.log.jsonl`. Memory written by a *newer* QAMind is never touched.

Design, limits and what was not verified: [decision 0007](docs/decisions/0007-reliability.md).

## Findings across runs: the test bank and your feedback

Each run builds on the ones before it.

- **Every problem has an identity** (`BUG-003`). The reports say whether a problem is **new**, **still open** (seen N times, since a date), or **came back** after being fixed. Problems that came back are listed first, called out in the 30-second summary, and keep the verdict from being "Ready to release".
  A problem counts as **fixed** only when QAMind looked: its saved check passes now, or the agent repeated the steps and wrote what it saw. A problem that was not looked at again is listed as such, never assumed fixed.
- **The test bank.** At the end of a run QAMind saves the checks worth keeping (at most about six: one for each problem it reproduced twice, and a smoke check of a key journey; a manual run with serious findings cannot finish without saving one or saying why none can be written) as tests it can run itself, each with a short "value card" (what it protects, when it fails, why it is not a duplicate).
  The next run **runs the bank first**, fast and cheap, and spends its time on what is new, changed or risky. A test that fails twice must be dealt with before the run can finish; one that only passes on a retry is flaky, and after a few of those it is set aside (quarantined) until you release it.
  API tests are requests with what each must answer; UI tests are a short list of steps (open, fill, click, check) run in a browser behind the same production guard. `/qamind:qa-tests export` writes them into your project as Playwright tests, with no passwords in them, after you say yes; it never overwrites a file.
- **Your feedback changes the next run.** `/qamind:qa-feedback ISSUE-003 not-a-bug "this is how we want it"` makes it a known false alarm (later runs do not report it, and say who said so); `wrong-severity important` makes the reports show that level; `wont-fix` lists it under "Known, accepted" instead of counting it;
  `fixed` makes a later find show as having come back; `confirmed` and `good-catch` raise the learnings behind it and the risk of its area. Managers can write a verdict in the "Your feedback" line of the admin report; you read it in with `/qamind:qa-feedback import <run>`.
  The name is whatever you give (or your git user): nothing checks it.

```
qamind bugs list [--status open|fixed|accepted|all]
qamind feedback add ISSUE-003|BUG-002 not-a-bug|confirmed|wont-fix|fixed|good-catch|wrong-severity LEVEL|duplicate-of ID [--note TEXT] [--by NAME] [--run ID]
qamind feedback import --run ID --by NAME  |  feedback list  |  feedback stats
qamind tests status | run [--run ID] | export [--ids T-001,T-004] [--dir D] [--yes] | prune | retire ID --reason TEXT | quarantine ID | unquarantine ID
```

Limits, and what was not verified: [decision 0008](docs/decisions/0008-test-bank-bugs-feedback.md).

## Coverage: other browsers, speed, email, and tickets

Optional, and each is a command that does exact work while the agent judges the results. Settings (`browsers`, `viewports`, `visual`, `performance`, `mail`, `sms`) are in the config QAMind creates, commented.

- **Other browsers and screen sizes.** The key pages are visited in every browser and size the mode asks for (`diff` one of each, `quick` adds the mobile size, `full` all you configured: Chromium, **WebKit** (Safari's engine), Firefox; desktop 1366×768, mobile 390×844, a tablet if you add one). A problem is reported **once, with where it happens** ("only at mobile", "only in webkit"). A browser that is not installed (`qamind browsers install webkit`, about 80 MB, yours to run) is **Not tested**, and the report must say so.
- **Does it still look right?** After a run you judge good, `/qamind:qa-tests baseline accept` saves its screenshots as the baseline per page, role, browser and screen size. Later runs compare, ignoring the parts you name (dates, avatars) and private data; a difference comes with before, after and a picture of what changed. A QA run cannot accept a baseline.
- **Is it fast enough?** Page time (until the page is ready) and a few read-only API calls (median and slowest) against `performance.page_load_ms` and `api_p95_ms`, and against recent runs: "this page takes 4 seconds, twice as long as last week" even when under budget. Not a load test.
- **Emails and texts.** With a sandbox that catches them (`mail.catcher`: Mailpit, MailHog, Mailtrap or your own API; `sms.catcher`), the agent starts a flow with a test address and checks what arrived: the right recipient, no `{{name}}` left, **every link opens and stays in the test environment**, an unsubscribe where needed, the language. **Without a sandbox those flows are Not tested ("no email sandbox configured").** Nothing is ever sent to a real address.
- **Test this ticket.** `/qamind:qa-only --ticket LUM-214` (or a file or pasted text) turns a request into acceptance criteria (ones the agent works out are shown to you first), tests each, and puts a **checklist** in both reports: ✅ met, ❌ not met, ⛔ cannot be tested, with why. Checks it saves are tagged with the ticket. In CI, `qamind ci --ticket docs/story.md` lists derived criteria as **assumed**.

```
qamind sweep check|run --run ID [--browsers webkit] [--viewports mobile]     qamind perf check|api --run ID
qamind mail wait --run ID --to a-test-address --flow "password reset"        qamind ticket check|status --run ID
qamind baseline status | accept --run ID [--pages a,b]                       qamind browsers status | install webkit
```

Details, settings and limits (Mailpit, MailHog and Mailtrap were not run against live services; Firefox was not run): [docs/COVERAGE.md](docs/COVERAGE.md), [decision 0010](docs/decisions/0010-coverage-depth.md).

## CI and pull requests (`qamind ci`)

`qamind ci` tests a pull request headlessly and says the result where your team looks: **one comment** that is rewritten on every push, a **commit status** (`qamind`), an **exit code** (0 pass or warn, 1 fail, 2 could not check) and the reports as **artifacts**. It is always report-only: it never fixes, commits or pushes, and it cannot be started by a QA run.

```
qamind ci init --provider github --write     # .github/workflows/qamind.yml (also: --provider gitlab); never overwrites a file
qamind ci --mode diff                        # what the workflow runs: also quick, regression, full
qamind schedule --provider github --write    # a nightly full run (also: gitlab, cron, windows)
```

- **What fails a pull request** is yours to set in `.qa/config.md` (`ci.fail_on`, default a critical problem or an environment problem; `ci.warn_on`, default an important problem). The result is read from the run's data, never from what the agent said, and a run that could not happen (no credentials, a crashed agent, a time-out) is reported as "could not check", not as a failed change.
- **CI starts without memory.** `ci.cache_memory: true` keeps a CI-only store in the CI's own cache (never committed, never mixed with your personal memory); without it, "came back" and the test bank do not exist in CI.
- **Set-up, secrets, limits and what was not verified** (no run on a real GitHub Actions or GitLab CI yet): [docs/CI.md](docs/CI.md), [decision 0009](docs/decisions/0009-ci-and-schedules.md).

## Safety (and how it is enforced)

QAMind never tests production, never reads or prints credentials, creates data only with your `QA-` prefix, never
triggers real payments or emails, and treats everything it sees in your app as data, not instructions.

| Rule | Claude Code | Cursor and generic (see the install table above for what is enforced) |
|------|-------------|--------------------|
| Production URLs blocked | `run start` checks the config; the browser runs behind a **fail-closed guard proxy** that also stops redirects and sub-resources; the API runner checks every request | same code, via MCP |
| `/qa-only` writes only to `.qa/` and the user store | **enforced by a PreToolUse hook** (Bash inspection is best-effort, not a sandbox) | instructions only unless the host has hooks |
| Credentials stay out of the conversation | browser `--secrets`, API runner logs in itself, hook blocks reading `.env.qa` | secrets and runner work everywhere; the read-block is a hook |
| Side-effect endpoints (email, SMS, payments) | left out of generated API plans by default and listed as Not tested | same |
| `/qa` never pushes, merges or opens a pull request, and never touches credentials, CI, lock files, generated code or your do-not-touch list | no such operation exists in the fix tools; the hook blocks git writes and the git host's CLI from the agent's shell and refuses edits to protected files | the tools are the same everywhere; the hook is Claude Code's |
| A QA run cannot approve lessons, give feedback on findings, retire or quarantine saved tests, start CI runs or write workflow files, archive memory or change auto-QA settings | the hook refuses those commands and writes to those files in every run mode; the review's deciding commands are not pre-approved, so the host asks you | the hook is Claude Code's |
| Auto-QA never fixes on its own, and is off until you turn it on | a project that never opted in is not written to; `fix` mode only when you set it or use `#qa-fix`, with all the fix rules | same code, host hooks differ |
| Every fix has a regression test that fails without it | `fix_commit` takes the fix out, runs the test (it must fail), puts the fix back and runs it again (it must pass) | same, via MCP |

Known limits are listed in [docs/decisions/0001-browser-automation.md](docs/decisions/0001-browser-automation.md).
Private-data masking and its limits (names and addresses in free text, images) are in [Reliable runs](#reliable-runs-test-data-time-limits-private-data).

## Roadmap

| Phase | Adds |
|-------|------|
| 1 ✅ | Core skeleton, Claude Code adapter, `/qa-only`, API + browser testing, technical report, demo app |
| 2 ✅ | Curated QA knowledge base, loaded on demand |
| 3 ✅ | Plain-language admin report with release verdict, consistency check, HTML export |
| 4 ✅ | Project memory that improves each run |
| 5 ✅ | `qa-memory` MCP server: validated memory and run tools, migrations, global-lesson proposals |
| 6 ✅ | `/qa` fix mode: fix loop with proof, stop rules, branch handling, fix-log memory |
| 6.5 ✅ | Auto-QA: a gate after every agent task that changed code, `/qa-auto`, tags |
| 7 ✅ | Global lessons you approve, `/qa-memory-review` (lessons, prune, stats) |
| 7.5 ✅ (without Codex) | `qamind setup \| status \| update \| uninstall`; Cursor (experimental) and generic (instruction-only) hosts; conformance suite; `docs/ADDING-A-HOST.md`. Codex deferred by the owner |
| 7.6 ✅ | Reliability: environment problems are not bugs, test data setup, time budgets, private-data masking and scan, memory migration with backup |
| 7.7 ✅ | Test bank (run first, flaky tests quarantined, export to Playwright), bugs across runs (new, still open, fixed, came back), your feedback changes the next run |
| 7.8 ✅ | `qamind ci` (one pull request comment kept up to date, a status, exit codes, artifacts), `ci.fail_on` / `ci.warn_on`, GitHub and GitLab templates, `qamind schedule` |
| 7.9 ✅ (this) | Coverage depth: ticket mode with a criteria checklist, email and SMS sandbox checks, visual baselines, other browsers (WebKit, Firefox) and screen sizes, page and API speed against budgets and recent runs |
| 7.10 | release verdict and metrics (Codex whenever the owner asks) |
| 8 | Linear and Sentry, polish |

## Development

See [MAINTAINING.md](MAINTAINING.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The `demo-app/` is a fixture
with seeded bugs used to test QAMind itself; its answer key is private to evaluation runs.

## License

MIT.
