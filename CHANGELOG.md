# Changelog

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
