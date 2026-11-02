# Changelog

## 0.7.6 (Phase 7.6, unreleased)

Reliability foundations ([decision 0007](docs/decisions/0007-reliability.md)).

- **A broken environment is an "Environment problem", not a bug.** The health check retries a failed check once and marks flaky and slow ones (kept as `env-quirk` learnings); a failed check makes `report lint` refuse any finding, `run finish` default the stop reason to `environment problem`, and the skills stop at Step 2 instead of testing on top of it.
- **Test data setup** (`setup:` in `.qa/config.md`): `reset_command`, `seed_command`, optional `snapshot_command` with `restore_command`, `run_before: never | full_runs | always`, `timeout_s`. One-line commands, run in the project folder, refused when they name a blocked production address; output kept in `data/env-prep.json` with credentials removed and private data masked;
  a snapshot is restored by `run finish`, also after an early stop.
- **Budgets** (`budget:`): `time_minutes` per mode, `ci` and `auto` (auto-QA defaults to 5) is a real deadline in the run marker: `qamind budget status`, the API runner (stops between requests) and `fix_begin` (refuses another fix) honour it, and the reports say "time budget reached" for what was not covered.
  `max_cost` is advisory (QAMind cannot see a host's spending) and recorded as `usage` in the run summary. `daily_max` pauses auto-QA once per day when auto-QA and CI have used their minutes; a `#qa` tag still runs.
- **Privacy** (`privacy:`): emails (reserved test domains, the test accounts and `QA-` data stay readable), national ID numbers, Luhn-valid card numbers, phone numbers (not the fictional `555-01xx`), your `mask_patterns`, and `mask_fields` in API evidence are masked in evidence, reports and setup output.
  `run finish` and `report lint` scan the whole run folder and refuse a leak (never printing the value); `qamind privacy scan | mask` do it by hand. Screenshots are taken with a blur script injected as a second `--init-script` of the browser tool (text patterns, input values and `mask_selectors`).
- **Memory schema 2 and real migration**: the run summary gained `usage`; the other files moved to 2 unchanged. An older store is copied byte for byte to `backups/<time>-schema-1-to-2/`, migrated, and logged to `backups/migrations.log.jsonl` on first use; a newer store is refused untouched.
  Tested on a real format 1 store written by the 0.7.5 build (`tests/core/fixtures/memory-v1/`).
- **New commands**: `qamind budget status`, `qamind privacy scan|mask`; `qamind health` now runs the configured preparation first. `scripts/eval-reliability.ts` is the real-agent test (broken environment, one-minute budget, old memory with reset and privacy).
- **Found by testing and fixed**: `writeMemoryJson` let a stale default `schema_version` win and `stack.json` wrote an old constant (the store would have migrated again on every run); the in-page script threw before `document.documentElement` existed (found only in real Chrome); a card number at the end of a sentence was not masked.
- Not in this phase: cost enforcement (impossible from outside the host), detection of names and addresses in free text, scanning images, any run on Linux or Windows (the new tests are in the Windows CI job), interactive Claude Code, Cursor or generic hosts.

## 0.7.5 (Phase 7.5, unreleased)

- **Multi-host install** ([decision 0006](docs/decisions/0006-multi-host.md), [docs/ADDING-A-HOST.md](docs/ADDING-A-HOST.md)): a host is a folder, `hosts/<id>/` with `host.json` and `adapter.ts`, found by scanning. **Codex was deferred by the owner and is not built.**
  An adapter describes the install as edits (`file`, `json`, `block`, `command`); one engine (`cli/src/setup/ops.ts`) applies, verifies and reverses them the same way for every host: idempotent, a backup before overwriting, user edits left alone on uninstall, invalid JSON never overwritten, only created folders removed.
- **`qamind setup | status | update | uninstall`** (`./setup`, `setup.cmd`, `bin/qamind.mjs`, `cli/src/setup-main.ts`): `--host auto|claude|cursor|generic`, `--project`, `--dry-run`, `--version vX.Y.Z`; a `qamind` launcher on the PATH; an install record in the store so `status` tells the truth
  and `uninstall` removes exactly what was added (the user's store is kept unless `--purge --yes`); `update` moves to the latest release tag (or `--edge` while there are none) and re-renders every install.
- **Hosts**: `claude` (installs through Claude Code's own CLI), `cursor` (experimental: skills in `.cursor/skills`, `mcp.json`, `hooks.json` with `stop` and `beforeSubmitPrompt`, a rule file; **never run in a real Cursor**), `generic` (instruction-only: an `AGENTS.md` section and printed MCP registration).
- **The auto-QA gate serves other hosts**: the hook format is data in `host.json` (`core/auto-qa/hostio.ts`), the project is found from `QAMIND_PROJECT_DIR`, `CLAUDE_PROJECT_DIR` or `CURSOR_PROJECT_DIR` (an unexpanded `${workspaceFolder}` is ignored), a QA run is matched by project on a host that gives skills no session id,
  the gate's own message coming back as a prompt starts no task, and `qamind auto skipped` works without a session. New placeholders `{{SESSION_ARG}}` and `{{SESSION_FLAG}}` (Claude Code's rendered skills are byte-identical to before).
- **Conformance suite** (`tests/conformance/`): one battery for every host and a made-up dummy host (setup and idempotence, status, MCP registered and reachable, skills discoverable, a `/qa-only` run through the registered server, uninstall leaving nothing and other tools' config intact, project level, auto-QA enforced or advisory as declared),
  a memory-interoperability test (a chain of runs through Claude Code's, Cursor's and the generic host's registrations: one store, one project id, the same approved lessons), and a test that core names no host.
- **Found by it and fixed**: runs finished in the same second were listed in the wrong order in the history; runtime messages named Claude Code's commands; uninstall left a skill folder when its file was deleted by hand, and the lock's empty folder.
- Not in this phase: any real run inside Cursor or with a generic agent (so Cursor stays `experimental` and generic `instruction-only`), Codex, Linux and Windows runs (the Windows CI job now includes the new tests), a Cursor safety hook (see decision 0006 for why not).

## 0.7.0 (Phase 7, unreleased)

- **Global lessons you approve** (`core/lib/memory/lessons.ts`, [decision 0005](docs/decisions/0005-global-lessons.md)): pending lessons (`P-001`) are used by nothing; approved ones (`G-001`) in `global-lessons.md` are given to **every** project's runs as `global_lessons` in `memory_get_context` (the 25 best-used and newest at most);
  rejected or retired ones are remembered (`rejected-lessons.jsonl`) so a near copy is not proposed again (`lessons_propose` answers `rejected-before`). A run cites an approved lesson in `memory_record_applied` (`G-001`); the technical report says "Applied global lesson G-001" and `lesson-use.json` counts it.
- **Generic, checked at three points**: when proposed, when approved (against every project known on the machine, and as the owner reworded it) and every time it is loaded, because the files are plain Markdown the owner may edit by hand (a bullet line is enough; notes and headings survive every rewrite). A hand edit that names a project,
  a web address, a file or code is not loaded and the run's context says why.
- **`/qamind:qa-memory-review [lessons|prune|stats]`** and the commands under it: `qamind lessons list|approve|reject`, `qamind memory review|stats|prune`. The review marks stale learnings, false alarms and risk areas with the reason; `prune` archives (never deletes) one named entry with the owner's reason;
  `stats` gives runs by mode and trigger, a trend only with six or more runs, memory use and lesson use, and lists precision and escaped bugs as **not available yet** instead of guessing them.
- **No run can decide for the owner**: the qa-memory server has no approve, reject or remove tool; the PreToolUse hook refuses `lessons approve|reject`, `memory prune`, the auto-QA settings commands and any write to the lesson files and `auto.json` in every run mode; the review skill pre-approves only reading commands,
  so Claude Code asks the user for each decision.
- Step 1 of `/qa-only`, `/qa` and `qa-auto-run` now names the approved global lessons and `G-` ids (found by the evaluation: without it the agent loaded a relevant lesson and never cited it).
- **Tests**: `lessons-review` (approve, reject, hand edits, caps, the review, prune, stats, the CLI), `review-skill` (static: only reading commands pre-approved, every command real, the decisions are the ones the hook refuses in a run), more hook and server cases. `scripts/eval-lessons.ts` is the real-agent end-to-end test. Results: `docs/EVALUATION-LOG.md`.
- Not in this phase: the "Agent performance" section of the technical report (7.10), feedback verdicts and so precision (7.7), escaped bugs (Sentry, phase 8), interactive-session behaviour, Linux and Windows runs (the Windows CI job now includes the lesson tests).

## 0.6.5 (Phase 6.5, unreleased)

- **Auto-QA** (`core/auto-qa/`, `/qamind:qa-auto`): when turned on, every task that changed code is checked before Claude Code finishes it. **Off by default**, per project (`<store>/auto.json`) or globally (`$QAMIND_HOME/auto.json`), the project winning; `QAMIND_AUTO=0` switches it off for a session.
  A project that never opted in is not written to. See [decision 0004](docs/decisions/0004-auto-qa.md).
- **Two hooks** run the existing bundle: `qamind hook user-prompt-submit` (reads `#qa`, `#qa-full`, `#qa-fix`, `#noqa`; snapshots the project) and `qamind hook stop` (the seven gate rules of spec 9.5 in order; answers with `{"decision":"block","reason":...}` so Claude continues).
  They never fail a turn: any error is a silent no-op.
- **What a task changed** is what differs from the snapshot taken when it began, plus the task's own commits, minus documentation, lock files and the configurable ignore list: work already in progress is not blamed on the task.
- **It cannot loop**: `stop_hook_active`, a record consumed once per task, the state hash and time stored when QA is *asked for*, the QA-run check (an open marker, a `/qa` prompt, or the new `state/last-run.json` that `run finish` writes), and a cooldown (3 minutes).
- **`qa-auto-run`**, an internal skill (`user-invocable: false`) the hook's message tells Claude to run, because the model cannot run `/qa-only` itself. Steps 1 to 5 are word for word `/qa-only`'s (tested); it never asks the user, ends with a five-line summary, and says "Auto-QA skipped: <reason>" once per session when it cannot run.
- **`qamind auto` commands** (`status`, `on`, `off`, `mode`, `pause`, `resume`, `global`, `set cooldown|budget|ignore`, `skipped`) and the **`/qa-auto` skill** over them.
- Modes: `diff` (default), `quick`, `full`, `fix` (only when set, or `#qa-fix` for one task; every fix rule stands), `ask`.
- **Tests**: the settings, tags, change detection and the reason text (`auto-qa-units`), every gate rule through the real CLI with hook JSON on stdin (`auto-qa-gate`: loop prevention, cooldown, docs-only, each tag, env override, pause expiry, preconditions, corrupt files, sessions) and the static side (`auto-qa-skills`).
  `scripts/eval-auto.ts` is the spec's end-to-end test with real Claude Code. Results: `docs/EVALUATION-LOG.md`.
- **The PreToolUse hook approves the one Skill call that answers a block** (`approveAutoSkill`): the headless host refused it, and an interactive user would be asked every time. Only `qa-auto-run`, only while the gate really blocked this session in the last 30 minutes, once.
- **Found by the end-to-end run and fixed:** the browser tool saved a screenshot with a bare file name into the project folder, so a report-only run could litter the user's tree (the hook now refuses a browser `filename` outside `.qa/` and the store, in every run mode); a corrupt `auto.json` or state file no longer breaks the hooks and commands.
- **Evaluation** (real Claude Code, headless, the demo app): five scenarios, all pass: auto on and a code change gives exactly one QA run; `#noqa` none; auto off none (and nothing written to the store); `#qa` while off one; `/qa-auto off` then a change none. $0.81 in all. See `docs/EVALUATION-LOG.md`.
- Not in this phase: Linux and Windows runs (the Windows CI job now includes the gate tests), interactive-session behaviour (the end-to-end test is headless), the `background` mode.

## 0.6.0 (Phase 6, unreleased)

- **`/qa`: fix mode** (`core/skills/qa/SKILL.md`, `core/shared/fix-loop.md`). It runs the `/qa-only` steps word for word (a test fails if they drift apart), writes the baseline report, then fixes the confirmed critical and important
  problems (`fix_policy.fix_severities`) one at a time on a git branch. It never pushes, merges or opens a pull request. See [decision 0003](docs/decisions/0003-fix-mode.md).
- **The spec's fix rules are checked by code**, in ten new tools of the qa-memory server: `fix_preflight` (clean tree, not the default branch, baseline report lints clean, the suite as a baseline), `fix_create_branch`, `fix_begin`, `fix_run_tests`,
  `fix_commit`, `fix_revert`, `fix_defer`, `fix_run_suite`, `fix_continue`, `fix_status`. Only a `/qa` run started by a person can use them; a report-only run or a CI run is refused.
- **`fix_commit` proves the regression test**: it takes the fix out and runs the test (it must fail), puts the fix back byte for byte and runs it again (it must pass). It also refuses undeclared files (a stop rule), protected files, a commit with no production
  change or no test, and any change to an existing test line. The commit is `fix(qa): ISSUE-NNN <summary>` with the root cause, the verification and `QAMind-*` trailers. The project's own git hooks are never bypassed.
- **Stop rules are state, not advice**: two reverts, every five fixes, an unrelated file, more than five files, and the hard cap (`fix_policy.max_fixes`, default 30). Every fix tool refuses until `fix_continue`; `fix_create_branch` and `fix_continue` are left out of
  the skill's pre-approved tools, so the host asks the user.
- **A safety hook for fix runs**: edits are allowed inside the project but never to credentials, CI and deployment files, lock files, dependency manifests, generated code, migrations or the config's `fix_policy.do_not_touch`; git writes, the git host's CLI, dependency
  changes and in-place edits from the agent's shell are blocked (the tools do the git work). A CI run stays read-only even if its kind is `qa`.
- **Config**: `fix_policy` gains `max_fixes`, `test_command`, `test_file_command`, `test_timeout_s` and `do_not_touch`, validated.
- **Reports**: both list every problem with its status ("Fixed and checked", "Fixed, needs a human to confirm", "Not fixed yet"); the technical report has a "Fix run" section (branch, outcomes, suite before and after, stops) and the proof for each fix; the admin report has
  "What was fixed" and says "Fixes are on branch X; a developer must review and merge them." The verdict counts verified fixes as merged and says so, and a regression after the fixes stops it saying "Ready". The consistency check compares statuses and the branch line; lint refuses a fix claim
  the fix loop did not record, a fix left open, and fixes with no final suite run. An `admin.json` written before the last fix is ignored (its next steps would be out of date).
- **Fix log** (`fix-log.jsonl`): every fix attempted, with outcome, files, test and root cause; shown to the next run in `memory_get_context` (`fix_log`) and by `memory_list`. `run_finish` refuses to finish a run with a fix in progress or fixes with no final suite run, and the run summary records the fixes.
- A QAMind-only change to `.gitignore` (the first run's entries) no longer makes the tree look dirty; a project inside a larger repository is supported; Node's nested-test marker is removed from test commands (a nested `node --test` that inherits it exits 0 whatever happened).
- **Evaluation**: `scripts/eval-fix.ts` is the spec's fix test: it runs `/qa` on a copy of the demo app and re-proves from git itself that every fix commit has a test that is red on its parent and green on the commit, the whole suite passes, nothing protected changed, nothing was pushed
  and no secret leaked. Results (six sequences on the demo app, 45 fix commits, all re-proved; the consent gate refused `fix_continue` as designed): `docs/EVALUATION-LOG.md`.
- **Found by that evaluation and fixed:** the admin report kept next steps written before the fixes (now ignored when older than the last fix, and the skill says to rewrite them); a `full` run skipped the web UIs entirely once, so `fix_preflight` now
  refuses to start fixing until every web UI with a test login was tested (unless the user agreed to API-only: `api_only`).
- Not in this phase: UI-level regression tests, auto-QA's `#qa-fix` tag (Phase 6.5), Linux and Windows runs (the Windows CI job now includes the fix tests).

## 0.5.0 (Phase 5, unreleased)

- **`qa-memory` MCP server** (`core/mcp/qa-memory/`, bundled as `dist/qa-memory.mjs`, registered in the plugin's `.mcp.json`). Twelve tools: `run_start`, `run_finish`, `run_history`,
  `memory_get_context`, `memory_list`, `memory_save_learning`, `memory_adjust_learning`, `memory_record_applied`, `memory_mark_false_alarm`, `memory_update_risk`,
  `memory_update_product_map` and `lessons_propose`. Every text field has a length limit and every list a count limit in its published schema; invalid input comes back as a result
  flagged `isError` naming each bad field; texts that contain secrets or personal data are refused without repeating them; near copies are merged; nothing is recorded if a cited id does not exist.
  Built on the official SDK (`@modelcontextprotocol/sdk` 1.32.1, `zod` 4.6.7, exact pins, dev dependencies bundled by esbuild). See [decision 0002](docs/decisions/0002-qa-memory-server.md).
- **One implementation:** `core/lib/memory/service.ts` is called by both the tools and the `qamind memory ...` / `qamind run ...` commands, which remain for people, tests and hosts without MCP.
- **The skill uses only the tools for memory and run bookkeeping.** `core/skills/qa-only` and `core/shared/*` no longer name a memory command or a memory file (a test scans for both), tell the agent to
  load the tools with one `ToolSearch` call first (Claude Code defers MCP tools), and to stop if the server did not start.
- **Registration is a function of the host adapter:** `core/mcp/servers.ts` lists the servers; `hosts/claude/adapter.ts` renders `.mcp.json` from it; `host.json` records what was verified with Claude Code 2.1.312
  (tool names keep the hyphen, a bare server entry pre-approves all its tools, the server starts in the project folder with `CLAUDE_PROJECT_DIR` set).
- **Safe sharing and upgrades (spec 13.17):** a per-store lock so several processes can change memory at once; format migrations with a backup, a log, a refusal to drop a field silently and a refusal of memory from
  a newer QAMind as a whole (also at `run_start`). Format 1 is the first format, so no migration exists yet; the framework is tested with synthetic ones.
- **New memory behaviour:** `memory_update_risk` flags an area that has no confirmed finding (it survives `run_finish`, and stands down when a finding covers the area); `memory_update_product_map` records pages and endpoints,
  validated and merged (the agent no longer writes `pages.json` by hand); `lessons_propose` writes generic lessons to `~/.qamind/pending-lessons.md`, refusing project names, addresses, files, tickets, code and personal data.
  `memory_record_applied` is now all-or-nothing.
- **License notices:** the build generates `THIRD-PARTY-NOTICES.md` for everything bundled and fails on a non-permissive license. This also fixes a gap since Phase 1: the bundled `yaml` (ISC) shipped without its notice.
- **Evaluation:** both evaluation scripts allow and count the new server's tools. Results: `docs/EVALUATION-LOG.md`.
- Not in this phase: the API runner, OpenAPI parsing, report generation and the consistency check stay on the CLI (the spec says "where practical"); the review of pending lessons (Phase 7); Only macOS was run by me; the Linux and macOS CI jobs exist and a Windows job is added (its first run is yours to read).

## 0.4.0 (Phase 4, unreleased)

- **Project memory, files first** (`core/lib/memory/`, private per user in `$QAMIND_HOME`): `product-map.json`, `risk-areas.json`, `learnings.jsonl`,
  `false-alarms.jsonl` and an `archive/`, next to the existing `stack.json` and `runs/`. Every file carries `schema_version`; JSON Lines files start with a
  `_meta` line. Hand edits are tolerated (unreadable lines are kept and reported, unknown fields survive). A store written by a newer QAMind is refused
  **before anything is written**, so memory is never half-updated.
- **Learnings:** five types, merged when 60% similar, confidence +1 when confirmed and -2 when contradicted, archived below 3, capped at 200. **False alarms:**
  matched against new findings; the lint refuses an unexplained match against an owner- or spec-sourced alarm (a warning for a reproduction-sourced one).
  **Risk areas:** frequency x severity x recency (90-day half-life), recorded once per run id. **Product map and change detection:** normalised paths,
  new pages, endpoints added or removed (only when both pictures come from the OpenAPI spec), pages not seen (only after a full run).
- **Nothing secret or personal is saved:** every text is screened for the project's test passwords, tokens and keys, non-reserved email addresses and national-ID-,
  card- and phone-number-like values, and refused rather than trimmed.
- **Citations are checked:** `memory applied` accepts only ids that exist, and the report lint rejects an invented `L-`/`FA-` id.
- **CLI:** `memory context | learn | applied | false-alarm | show | where`; `api inventory` prints `changes_vs_memory`; `report build` refreshes change detection.
- **Reports:** the technical report gains "What changed since the last run", a Trend table (this run and up to four before it) and a Memory section (applied,
  saved, state after the run); the admin report gains "What changed since the last check" in plain words and a "key journeys fully checked" trend line (also in the HTML export). The number of coverage rows is not used as a trend: the agent chooses how finely to split the work (9 vs 24 rows between two runs with no real change).
- **Agent instructions:** load memory first, plan from risk areas and changes, record `pages.json`, skip known false alarms, save learnings before finishing.
  `core/lib/memory.ts` was replaced by the `core/lib/memory/` modules.
- **Evaluation:** `scripts/eval-learning.ts` runs the spec's learning test (two runs on the demo app against one memory, with a product change and an owner-confirmed
  false alarm in between), saves each run's call trace, counts a run only if it ended normally and finished its memory update, and writes a failure record otherwise.
  Both evaluation scripts now refuse to start if something is already listening on the demo port. Results: `docs/EVALUATION-LOG.md`.
- Found by that evaluation and fixed: plain change lines quoted jargon from an API summary; a page seen for the first time was called "new" although the earlier run had only not reached it;
  applied learnings were listed twice; the trend compared coverage-row counts.
- Not in this phase: fix log (6), bug lifecycle and feedback (7.7), performance and metrics (7.9, 7.10), the `qa-memory` MCP server (5).

## 0.3.0 (Phase 3, unreleased)

- **Admin report** (`ADMIN-REPORT.md`), rendered from the same data as the technical report: release verdict first line (default rules from the
  spec), six-line summary, results by area (✅ ⚠️ ⛔), problems in plain language with where / what happens / who is affected / steps anyone can follow /
  what should happen / screenshot / status / ticket / feedback and one "For developers" link, trend against the last check, plain not-tested reasons,
  at most three next steps, and a plain explanation when the test environment is broken.
- **Consistency check** (`report check`, part of `report lint`): fails if the admin and technical reports disagree, if a Critical or Important problem
  is missing, anything is added, counts or the verdict contradict the findings, a problem block is incomplete, or jargon appears outside "For developers" lines.
- **HTML export** (`report export-html`): one self-contained file, screenshots embedded, no external resources, all text escaped.
- Findings need a `plain` block, not-tested entries a plain wording, coverage rows `ui` and `critical_flow`; `data/admin.json` holds the biggest risk and next steps.
  `run start` copies the critical journeys from the config. The technical report links each issue with an anchor and shows the key journey per coverage row.
- New shared guide `core/shared/admin-report.md` (how to write for non-technical readers). It was refined by the readability test: steps must be
  self-contained and in the right order, must not depend on data that only existed during the check, must not overstate what the screen shows, and must
  explain browser actions and specialist words.
- The admin report also carries a short glossary (severity words, "behind the screens"), a note about where to get test logins, and a one-line explanation
  of "behind the screens" problems, all added after a reader test found them missing.
- Evaluation: `scripts/eval-readability.ts` (a text-only reader and a browser-only novice replay that tries to follow each problem's steps on the live demo app);
  `scripts/eval-demo.ts` records admin-report results and, for a run that stalls, keeps its workspace and writes diagnostics.
- Example output in `docs/examples/ADMIN-REPORT.example.md` (kept equal to the golden test file).
- Spec section 16: README no longer lists credits (owner's decision).

## 0.2.0 (Phase 2, unreleased)

- **Knowledge base 0.1.0** (`core/knowledge/`): 18 topic files (test design, exploratory charters, forms, auth and sessions, permissions and data
  isolation, API testing, security smoke checks, accessibility, UI and layout, i18n and RTL including Urdu/Arabic, payments and money, file uploads,
  search/filter/pagination, notifications and email, bug reporting, debugging and root cause, fixing safely, flaky checks), a browser-testing guide,
  eight framework notes (React, Next.js, Vue, Laravel, Django, Rails, Express, ASP.NET Core), and `INDEX.md`. Written from 149 sources in our own
  words; every source is credited in `docs/KNOWLEDGE-SOURCES.md`.
- Knowledge 0.1.1: added "staleness across roles: warm, change, re-read" to `api-testing.md` (a gap found by the evaluation: nothing
  taught reading before the change, so cached lists were never caught); skill lists the knowledge to load for each pass.
- The skill and shared documents load knowledge on demand (INDEX at planning time, matching files per surface, framework note per detected framework).
- `full` mode may no longer leave areas out as "not covered in this pass" (that reason is for `quick` and `diff` only).
- Evaluation harness: `scripts/eval-demo.ts` (pinned settings, repetitions, saved records under `docs/baselines/`) and `scripts/eval-summary.ts`.
  Phase 1 baseline (3 runs, full mode) recorded.
- Knowledge checks in `tests/core/knowledge.test.ts` (size, structure, index, sources, no host or demo-specific content).

## 0.1.0 (Phase 1, unreleased)

- Core skeleton (`core/`, `hosts/claude/`, `cli/`) and a build that renders the Claude Code plugin into `plugins/qamind/`.
- `/qa-only` skill with shared workflow, safety, surfaces and reporting documents.
- First-run setup (config and credentials templates, `.gitignore`), config validation, production-URL rules.
- API testing from OpenAPI: inventory, generated baseline probe plan, deterministic runner with oracles, automatic
  reproduction, redacted evidence with curl reproductions.
- Browser testing through Playwright MCP behind a fail-closed guard proxy, with credentials kept out of the conversation.
- PreToolUse safety hook (report-only writes, no credential reads).
- Technical report rendered from structured run data; lint for the evidence rules.
- Per-page audit script (`window.__qamindAudit()`) injected into every browser page: unnamed controls, controls off-screen, covered
  elements, clipped text, RTL text in LTR boxes.
- Plan validation, write probes limited to run-created records, side-effect endpoints excluded from generated plans.
- Private per-user store (`$QAMIND_HOME`): project identity, stack, run summaries.
- `demo-app/` fixture with seeded bugs, a private answer key, and a run scorer.
- Knowledge base version: 0.0.0 (arrives in Phase 2).
