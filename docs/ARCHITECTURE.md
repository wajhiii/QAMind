# Architecture

QAMind is **write once, run everywhere**: the QA logic, knowledge and file formats live in a host-agnostic core, and each
AI coding tool gets a thin generated adapter.

```
core/                         single source of truth
  skills/qa-only/SKILL.md       the job description, with {{placeholders}}
  shared/*.md                   workflow, safety, surfaces, reporting, memory protocol, templates
  knowledge/                    curated QA expertise: 27 topic files + INDEX.md + VERSION (docs/KNOWLEDGE-SOURCES.md credits every source)
  lib/*.ts                      deterministic runtime: store, config, URL policy, runs, API plan/runner, report, hooks
  lib/memory/*.ts               project memory: learnings, false alarms, risk areas, product map, change detection, context bundle
  scripts/                      browser launcher + guard proxy
cli/src/                      the `qamind` command (JSON in/out) used by skills and hooks
core/lib/fix/                 the fix loop (Phase 6): protect.ts (what may not be touched), gitops.ts, testrun.ts, state.ts, loop.ts
core/mcp/                     MCP servers: servers.ts (the shared list), qa-memory/ (tools.ts, fixtools.ts, server.ts, main.ts)
hosts/claude/                 adapter: host.json, adapter.ts (renders the plugin and .mcp.json), plugin dependency manifest + lockfile
plugins/qamind/               GENERATED Claude Code plugin (committed; CI fails if stale): dist/qamind.mjs (CLI, hooks, browser launcher), dist/qa-memory.mjs (MCP server), THIRD-PARTY-NOTICES.md
```

## The deterministic/LLM split

Anything that must be exact is code, not prose. The agent decides *what is worth testing and whether a signal is a real
bug*; code does the rest:

| Code (`qamind …`) | Agent |
|---|---|
| project identity, store, first-run scaffold, config and URL validation | choosing charters and priorities |
| health check, API inventory, baseline probe plan, plan execution, oracles, reproduction, evidence redaction | judging signals against the spec and business rules; adding business-rule probes |
| report rendering, evidence-rule lint, run summary | driving the web UI, writing findings and steps |
| safety hook, guard proxy | following `safety.md` where hooks cannot reach |

## A run

```
run_start ─► memory_get_context ─► health ─► charters ─► test (API → UI → cross-checks → rules) ─► data/*.json ─► memory_save_learning ─► report build/lint ─► run_finish
   │ writes project.json, stack.json,           │ api inventory / plan / run     │ browser tools           │ renders both reports
   │ run marker (store), run folder (.qa)        │ evidence/api/*.json            │ screenshots/            │ summary + product map + risk areas → store memory/
```

`run_start` is the gate: it picks the project, scaffolds the config on first run and stops, refuses an unfilled
template, blocked or ambiguous URLs, and a project with no usable credentials, and only then creates the run folder and
the **run marker** `<store>/state/run-marker.json`. The marker carries the session id, the mode, whether the run is
report-only, and the **policy** (allowed origins, blocked patterns). The hook and the guard proxy both read it.

## Two reports from one set of data

The agent writes structured files in `<run>/data/` (findings, coverage, not-tested, charters, `admin.json`), and code renders both reports from
them, so the problems and severities are identical by construction:

- `core/lib/report.ts` renders `TECHNICAL-REPORT.md` (each finding gets an `<a id="ISSUE-001">` anchor).
- `core/lib/verdict.ts` computes the release verdict (spec 13.13 default rules: Ready only with 0 critical, at most 2 important, a healthy
  environment and every critical journey tested; never Ready if a journey was not tested). The critical journeys are copied from the config at
  `run_start`, and coverage rows reference them by number.
- `core/lib/adminreport.ts` builds the admin view model (verdict first line, six-line summary, results by area, problems from each finding's
  `plain` block, trend from earlier run summaries, plain not-tested reasons, at most three next steps) and renders Markdown;
  `core/scripts/export-html.ts` renders the same model as one self-contained HTML file.
- `core/scripts/consistency-check.ts` parses the two **written** files and fails if they disagree: same issue ids, same severities, nothing
  added, no Critical or Important dropped, counts and verdict consistent, the same number of not-tested areas, at most three next steps, every
  problem block complete with exactly one "For developers" link, and no jargon outside those lines. `report lint` runs it and does not rebuild first,
  so a hand edit or a stale report is caught.

Not yet tracked (arrive with later phases): per-project verdict rules (7.10) and tickets (8). The admin report says so in plain words where it matters.

## Project memory

`core/lib/memory/` holds the logic. `core/lib/memory/service.ts` is the one place the operations are defined, and two front doors call it: the `qamind memory …` commands (people,
tests, hosts without MCP) and the **qa-memory MCP server** (`core/mcp/qa-memory/`, Phase 5), which is what the skill uses. Formats and lifecycle are in [MEMORY.md](MEMORY.md); why the
server is built the way it is, in [decision 0002](decisions/0002-qa-memory-server.md). The split follows the rest of the design:

| Code | Agent |
|---|---|
| reads and writes the four memory stores with schema checks, secret/PII screening, de-duplication, confidence and archiving | decides what is worth remembering: one short, atomic lesson per `memory learn` |
| builds the context bundle (top risk areas, learnings, false alarms, last findings, product-map summary) | uses it to plan, and cites only ids that exist |
| detects what changed since the last run from `data/pages.json`, `api-inventory.json` and the OpenAPI spec; scores risk areas | tests the changes and risk areas first |
| matches new findings against false alarms; the lint refuses an unexplained match and an invented citation | reports only what is genuinely new, or says why a similar finding is different |

Every change runs under a per-store lock and after the store is migrated to the current format (backup first; memory from a newer QAMind is refused as a whole), so several processes can share a
store safely. Memory is written in two places, both by code: `run_finish` updates the product map, risk areas and false-alarm counters (after checking
every memory file's schema, so a too-new store is never half-updated), and `memory learn` saves a learning. A report is rendered from the
run's data files plus the previous runs' summaries, so a trend never depends on the agent remembering numbers.

## Fix mode (`/qa`)

`/qa` is `/qa-only` plus a fix phase, and the fix phase is built so that its rules are checked by code, not asked of the agent ([decision 0003](decisions/0003-fix-mode.md)).
The agent edits files with the Edit and Write tools; everything that touches git, branches or the project's tests is a tool of the qa-memory server (`fix_*`), and only a
`/qa` run started by a person can use them (a report-only run, or one started by CI, is refused).

| Rule (spec 9.3) | Where it is enforced |
|---|---|
| clean working tree, feature branch, baseline report first | `fix_preflight`; `fix_create_branch` is a separate step the host asks the user to approve |
| never touch credentials, CI, lock files, generated code, the do-not-touch list | the safety hook on every edit and shell redirect, again in `fix_begin` and `fix_commit` |
| a regression test that fails because of the bug | `fix_commit` takes the fix out, runs the test (must fail), puts it back, runs it again (must pass) |
| minimal fix, no unrelated changes | only declared files may change; anything else is a stop; no existing assertion may be edited |
| stop after 2 reverts, every 5 fixes, an unrelated file, more than 5 files; hard cap | counters in `data/fix-state.json`; the fix tools refuse until `fix_continue` (which the host asks the user to approve) |
| full suite afterwards, regressions loud | `fix_run_suite` against the baseline; the reports and the verdict show a regression; `run_finish` refuses without it |
| never push, merge or open a PR | no such operation exists in the tools; the hook blocks `git` writes and the git host's CLI from the agent's shell |
| fix-log memory | `fix-log.jsonl`, written by the tools |

The reports render the fix state, so what they say about a fix is what the tools did: every problem is listed with its status (fixed and checked, fixed and needs a human, not fixed),
the technical report keeps the proof for each fix, and the admin report says "Fixes are on branch X; a developer must review and merge them." The verdict counts verified fixes as merged and says so.

## Auto-QA (`/qa-auto`)

Auto-QA is a gate in code, not an instruction the agent may skip ([decision 0004](decisions/0004-auto-qa.md)). `core/auto-qa/` is the host-neutral library: `settings.ts` (the project and global `auto.json`, precedence, pause, `QAMIND_AUTO`),
`tags.ts`, `changes.ts` (a snapshot at the start of a task and the files it changed), `state.ts` (per-session records in `<store>/state/`), `gate.ts` (the seven rules of spec 9.5, in order), `prompt.ts` (the message Claude is given) and `commands.ts` (`qamind auto ...`).
Claude Code reaches it through two hooks that run the existing bundle: **UserPromptSubmit** (`hook user-prompt-submit`: read the tags, take the snapshot) and **Stop** (`hook stop`: decide, and answer `{"decision":"block","reason":...}` so Claude continues).

```
prompt --UserPromptSubmit--> tags + snapshot        (nothing is written when auto-QA is off and the prompt has no tag)
agent works ...
agent done --Stop--> 1 #noqa  2 disabled?  3 stop_hook_active  4 was a QA run  5 no code change  6 cooldown  7 block
                     block => Claude runs the internal skill qa-auto-run (trigger "auto") => short summary => Stop again (rule 3: skip)
```

The skill Claude is told to run, `qa-auto-run`, is the `/qa-only` procedure without the questions (Steps 1 to 5 are word for word the same, a test enforces it), because the model cannot run `/qa-only` itself. Report-only modes start the run as `qa-only`, so the safety hook keeps them read-only.
Hooks never fail a turn: any error is a silent "no opinion". Whether a task was itself a QA run comes from the open run marker or from `state/last-run.json`, which `run finish` writes.

## Global lessons and the owner's review

Lessons the agent proposes for any project wait in `~/.qamind/pending-lessons.md`; the owner approves them into `global-lessons.md`, the only lesson file runs read ([decision 0005](decisions/0005-global-lessons.md)). `core/lib/memory/lessons.ts` holds all of it: proposing, the three-point genericity check (proposal, approval against
every known project, and every load), approval and rejection, and what a run is shown (`loadApprovedLessons`, at most 25, only approved). `core/lib/memory/review.ts` is the review of one project's memory (stale marks, archiving, statistics). The CLI (`qamind lessons ...`, `qamind memory review|stats|prune`) is the owner's interface;
the qa-memory server deliberately has no tool that decides anything, the `qa-memory-review` skill pre-approves only the reading commands (so the host asks the user for each decision), and the PreToolUse hook refuses the deciding commands and writes to these files while a QA run is active.

## Knowledge, loaded on demand

The skill is short; expertise lives in `core/knowledge/` and is loaded only when relevant. The agent reads `INDEX.md` while planning (a
situation-to-files table, plus a framework table keyed on `stack.frameworks` from `run_start`), then loads a few matching files at a
time, again when it moves to a new kind of feature. `shared/surfaces.md` names the files each section of the work draws on. The evaluation
records how many knowledge files a run actually read. Files are never edited during a run; gaps become proposals in
`.qa/suggested-improvements.md`.

## Safety enforcement

- **Guard proxy** (`core/scripts/guard-proxy.ts`): a loopback forward proxy in front of the browser. It reads the active run
  markers (every second), allows only configured origins, lets a blocked pattern beat an allowed origin, and refuses
  everything when no run is active. Why a proxy: [decision 0001](decisions/0001-browser-automation.md).
- **API runner** applies the same policy to every request, never follows redirects, and logs in per role without ever
  printing credentials.
- **PreToolUse hook** (Claude Code): while a run marker for this session exists, report-only runs may write only under
  `.qa/` and the store, git mutations / installs / in-place edits are denied, and credentials cannot be read or dumped.
  With no marker for the session it does nothing.
- **Stop and UserPromptSubmit hooks** (Claude Code): the auto-QA gate above. Silent no-ops unless the user turned auto-QA on or put a tag in the prompt.
- Everything else is in the skill's instructions (`core/shared/safety.md`), which hosts without hooks rely on.

## Host adapters and setup

`hosts/<host>/host.json` records, from that host's current docs: where skills go, how MCP is registered, which hook events are used, command names, how auto-QA and the safety guard are enforced, and the capability tier. `hosts/<host>/adapter.ts` describes the install (`HostAdapter` in `hosts/host-api.ts`):
placeholder values, a list of edits, the hook commands and the MCP registrations. Hosts are found by scanning `hosts/` (`hosts/registry.ts`); adding one is a folder, not a change to core ([ADDING-A-HOST.md](ADDING-A-HOST.md), [decision 0006](decisions/0006-multi-host.md)).

```
core/ (skills + shared docs with {{PLACEHOLDERS}})  --render per host-->  build/<host>/  skills/ core/ dist/ host.json     (Claude Code: plugins/qamind/, committed)
hosts/<host>/adapter.ts  --plan-->  edits (file | json | block | command)  --cli/src/setup/ops.ts-->  the host's own files   +  <store>/installs.json (what to undo)
qamind setup | status | update | uninstall      status verifies the recorded edits; uninstall reverses exactly them
```

The placeholders `core/` uses are a fixed list every host fills in. The hook formats are data in `host.json` (`core/auto-qa/hostio.ts` maps a host's hook JSON onto the one gate), so the gate, the memory and the servers are the same on every host; only the packaging around them changes.

## Reliability: environment, budgets, privacy

Code, not instructions, decides these ([decision 0007](decisions/0007-reliability.md)):

- **Environment** (`core/lib/envprep.ts`, `health.ts`): `run_before` decides whether the configured snapshot, reset and seed commands run (each refuses to run if it names a blocked production address); the health check retries a failed check once and marks flaky and slow ones; a failed health check makes `report lint` refuse any finding and `run finish` default the stop reason to `environment problem`. A snapshot is restored by `run finish` (`finishRunAndRestore`), so an early stop still restores.
- **Budget** (`core/lib/budget.ts`): `run start` resolves the limit (mode, `ci`, `auto`, config default) into the run marker as a deadline; `qamind budget status`, the API runner and `fix_begin` read it. Usage (duration, and cost when the host reported one) is written to the run summary; a daily total in the store lets the auto-QA gate pause itself once per day. Cost is advisory by design.
- **Privacy** (`core/lib/privacy.ts`, `core/shared/page-mask.js`): one set of detectors masks API evidence, setup output and rendered reports on the way out, scans the run folder's text files before a run may finish (never printing a value), and, as a second `--init-script` of the browser tool, blurs the same kinds of text and the configured selectors in the page before a screenshot is taken.

## The test bank, bugs across runs, feedback

([decision 0008](decisions/0008-test-bank-bugs-feedback.md))

```
run_start ─► memory_get_context ─► health ─► tests run (the bank, first) ─► explore what the bank does not cover ─► findings ─► report build/lint ─► bank_save_test ─► run_finish
                    │ bugs, bank                 │ data/bank-results.json            │ rechecks.json             │ lifecycle.json            │ bugs.jsonl, bank stats
```

- **Bank** (`core/lib/bank/`): `bank.ts` (format, validation, duplicates, flakiness, quarantine), `runner.ts` (API tests through `runPlan`, UI tests through `uirunner.ts`, a retry, results, statistics under the store lock), `uirunner.ts` (Playwright found at run time next to the plugin; every request and every redirect checked against the run's policy),
  `export.ts` (Playwright Test files written by code), `service.ts` (what the CLI and the `bank_save_test` tool call).
- **Bugs** (`core/lib/memory/bugs.ts`, `runlife.ts`): `report build` applies feedback to the run's findings and works out what each is (`data/lifecycle.json`); `run finish` does it once more from the final files, writes `bugs.jsonl`, links saved tests to their bugs and freezes the result, so every later render says what the run said.
  `report lint` refuses a bank failure nobody accounted for, a finding that resembles a known bug without saying which, a bug named that does not exist, and a re-check that contradicts a finding.
- **Feedback** (`core/lib/memory/feedback.ts`): a verdict changes memory (a false alarm with who and when, a severity the reports show, an accepted bug listed as known, a fixed bug watched for coming back). Only a person gives one: the hook refuses it in every run, and the same goes for retiring or quarantining a test and for writing the bug, feedback and bank files.

## CI and pull-request mode

([decision 0009](decisions/0009-ci-and-schedules.md), [CI.md](CI.md))

```
qamind ci ─► detect CI (provider.ts) ─► config check ─► pending status ─► host CLI headless (host.ts reads hosts/<id>/host.json `headless`) ─► QA run in a fresh store
          ─► tracked files unchanged? ─► read the run's data files ─► gate (gate.ts: ci.fail_on / ci.warn_on) ─► comment.ts ─► api.ts (one comment updated, a status) + qamind-reports/ + exit code
```

`core/lib/ci/` holds the pieces (`provider.ts` where we are, `gate.ts` what the run means, `comment.ts` the text, `api.ts` the GitHub and GitLab clients with an injectable `fetch`, `host.ts` the host's headless launcher, `templates.ts` the generated files, `run.ts` the orchestrator). The orchestrator never trusts the agent: it times it out, checks the checkout, and judges only data files.
`ci init` and `schedule` write workflow files (never over an existing one); a QA run cannot start either (hook).

## Coverage depth: browsers, pictures, timings, messages, tickets

([decision 0010](decisions/0010-coverage-depth.md), [COVERAGE.md](COVERAGE.md))

```
sweep-pages.json (agent) ─► sweep: per browser ► per screen size ► per role (signed in once) ► per page:  policy-checked context + mask + page audit
      ─► signals, time until ready, screenshot ─► compare with baseline (owner-accepted, per page/role/browser/size) ─► data/sweep.json ─► grouped by where it happens
perf-endpoints.json (agent) ─► perf api: a few GET/HEAD calls ─► median, slowest ─► budget + recent runs (memory/perf.json, written by a finished run) ─► data/perf-api.json
mail wait: poll the sandbox (mailpit | mailhog | mailtrap | custom) ─► the message ─► checks (recipient, placeholders, links in policy, unsubscribe, language) ─► data/mail-checks.json + masked evidence
ticket.json + ticket-results.json (agent) ─► ticket check (derived ⇒ confirmed, or assumed in CI) ─► lint (every criterion answered and backed) ─► checklist in both reports; bank tests tagged
```

`core/lib/browsers.ts` (Playwright discovery, engines, the request policy) and `core/lib/bank/uisteps.ts` (the step vocabulary) are shared by the bank's UI runner and the sweep, so the policy (redirects checked by hand) is one piece of code. `core/lib/sweep/` has `png.ts` (a small codec: no dependency), `visual.ts` (comparison and the baseline store), `pages.ts` (the file and the browser/size matrix per mode), `engine.ts` (the visits), `results.ts` (grouping), `service.ts` (the CLI's entry points);
`core/lib/perf/` the budgets, history and API timer; `core/lib/mail/` the catchers, a small MIME reader and the checks; `core/lib/ticket.ts` the criteria; `core/lib/coverage-report.ts` what the reports show and what the lint asks. The CLI's commands for all of it are in `cli/src/coverage.ts`.
Whose decision it is: `baseline accept` and `browsers install` are the owner's (the hook refuses them in a run, as it refuses writes to `baselines/` and `perf.json`).

## The release verdict and agent performance

([decision 0011](decisions/0011-release-verdict-and-metrics.md))

```
config release.rules ─► run start: frozen into meta.json (release_rules) ─► computeVerdict(data): violations ─► Ready | Ready with risks | Not ready  (admin report line, CI gate, summary)
run finish ─► metricFromRun(data) ─► memory/metrics.json (one record per finished run; not a broken-environment run)
qamind escaped add ─► matchEscaped(area, last runs' area marks) ─► verdict missed | reported-before | partly-checked | not-checked | never-covered ─► metrics.json + a risk event (source: escaped)
agentPerformance(store, current run) ─► "Agent performance" in the technical report, and `memory stats`
```

`core/lib/verdict.ts` is the only place the verdict is decided; `core/lib/metrics.ts` holds the records, the escaped bugs and the summary, `core/lib/metrics-report.ts` the section of the report, `cli/src/metrics.ts` the commands. Precision comes from the feedback file at read time. Recording an escaped bug is the owner's (the hook refuses `escaped add` and writes to `metrics.json` in a run).

## Linear and Sentry (optional)

([decision 0012](decisions/0012-integrations.md), [docs/INTEGRATIONS.md](INTEGRATIONS.md))

```
config integrations.* ─► run start: team and test environments stored in the run marker and meta.json ─► the run lists them for the agent (run.integrations)
finished run ─► tracker plan: eligibleFindings (Critical/Important, not fixed and checked, not accepted) ─► masked tickets + fingerprint line + the ticket memory knows
agent (host's Linear tool) ─► create / comment ─► tracker record ─► data/tickets.json + memory/tickets.json ─► reports link the tickets
agent (host's Sentry tool, read only) ─► data/sentry.json ─► sentry check (environment, window, links, masking) ─► technical and admin reports
owner: feedback from-tracker (Linear states ─► feedback) · escaped areas / import (Sentry production + labelled tickets ─► escaped bugs ─► risk)
PreToolUse: trackerToolDecision(marker, tool, input): the only place a Linear or Sentry tool call is allowed or refused
```

QAMind holds no token: the agent reaches both through whatever tool the host has connected, so the hook goes by the tool's name. `core/lib/tracker.ts` (files, the memory map, links, lint, report text), `tracker-plan.ts` (the plan, and what a Linear state means), `sentry.ts` (window, check, report text), `trackerguard.ts` (the hook rule), `cli/src/integrations.ts` (the commands). None of them names a host.

## Formats and versioning

Every file QAMind writes carries `schema_version`. Memory is at schema 2 (`perf.json` joined it in 7.9, and the baselines live in the store's `baselines/` folder); a store written by an older QAMind is **migrated on first use** after a byte-for-byte copy to `backups/<time>-schema-N-to-M/` and a line per file in `backups/migrations.log.jsonl` (`core/lib/memory/migrate.ts`); a store written by a newer QAMind is refused untouched.
Reports record the QAMind and knowledge versions. See [MEMORY.md](MEMORY.md).
