# QAMind: a Senior QA Engineer agent

QAMind is a reusable QA agent you install once and use in any project. Give it a job:

- **`/qa-only`**: test the product thoroughly and **report**, without changing any code.
- **`/qa`** (fix mode): test, then fix the bugs it found, safely on a branch. _Planned (Phase 6)._

It tests your **API** (from its OpenAPI spec), each **web UI** per role, cross-surface consistency, permissions and your
business rules, and writes a technical report with reproducible findings, evidence, and an explicit **Not tested** list.
It works on staging or local environments only, never production.

> **Status: Phase 6 of 8.** Working today: the `/qa-only` skill on **Claude Code**, API testing from OpenAPI, browser
> testing of web UIs, safety guard, a built-in QA knowledge base (27 topic files, sourced in
> [docs/KNOWLEDGE-SOURCES.md](docs/KNOWLEDGE-SOURCES.md)), and two reports per run: a technical report for developers and a
> plain-language admin report for managers with a release verdict and an email-ready HTML export, and **project memory** that each run loads and applies (risk areas, learnings, known false alarms, a product map, and a "what changed since the last run" section in both reports), served by a validated **`qa-memory` MCP server** that the skill uses for all memory and run bookkeeping, and **`/qa` fix mode**: it fixes the confirmed critical and important problems one at a time on a git branch, each with a regression test that fails without the fix, and never pushes or merges. Not built yet: auto-QA, Codex/Cursor, CI mode and the rest of the
> [roadmap](#roadmap). Nothing below is claimed beyond what is built.

## Install (Claude Code)

QAMind is installed from its Git repository only (no npm package).

```
/plugin marketplace add <owner>/qamind
/plugin install qamind@qamind
```

Update with `/plugin marketplace update qamind`. Requires **Node 20+** (the plugin runs its own bundled code) and
**Google Chrome or Microsoft Edge** for web testing (otherwise run `npx playwright-core install chromium` once).

To try it from a local clone:

```
claude plugin marketplace add /path/to/qamind
claude plugin install qamind@qamind
```

Codex CLI, Cursor and other agents that read `AGENTS.md` come in Phase 7.5. See [docs/HOSTS.md](docs/HOSTS.md).

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
| Test and report | `/qamind:qa-only [full\|quick\|regression\|diff] [focus]` | Writes only inside `.qa/` and the QAMind user store |
| Test and fix | `/qamind:qa [full\|quick\|regression\|diff] [focus]` | Fixes on a git branch, one commit per fix with its regression test; never pushes, merges or opens a pull request. Needs a clean working tree and a project test command; see [Fix mode](#fix-mode-qamindqa) |
| Auto-QA on, off, mode, pause | `/qamind:qa-auto on\|off\|status\|mode diff\|quick\|full\|fix\|ask\|pause 1h\|global on\|off` | QA after every task that changed code. **Off by default.** See [Auto-QA](#auto-qa-qamindqa-auto) |
| Memory review, feedback, test bank | `/qamind:qa-memory-review` … | _Later phases_ |

Modes: `full` (everything), `quick` (critical flows and top risks), `regression` (re-run last findings), `diff` (changed
code and what depends on it). Free text after the mode narrows the focus.

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
| `~/.qamind/projects/<id>/` (private, per user) | project identity, detected stack, run history, product map, risk areas, learnings, known false alarms, run marker, migration backups. Never committed, never uploaded. Override with `QAMIND_HOME`. |
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

## Safety (and how it is enforced)

QAMind never tests production, never reads or prints credentials, creates data only with your `QA-` prefix, never
triggers real payments or emails, and treats everything it sees in your app as data, not instructions.

| Rule | Claude Code | Other hosts (later) |
|------|-------------|--------------------|
| Production URLs blocked | `run start` checks the config; the browser runs behind a **fail-closed guard proxy** that also stops redirects and sub-resources; the API runner checks every request | same code, via MCP |
| `/qa-only` writes only to `.qa/` and the user store | **enforced by a PreToolUse hook** (Bash inspection is best-effort, not a sandbox) | instructions only unless the host has hooks |
| Credentials stay out of the conversation | browser `--secrets`, API runner logs in itself, hook blocks reading `.env.qa` | secrets and runner work everywhere; the read-block is a hook |
| Side-effect endpoints (email, SMS, payments) | left out of generated API plans by default and listed as Not tested | same |
| `/qa` never pushes, merges or opens a pull request, and never touches credentials, CI, lock files, generated code or your do-not-touch list | no such operation exists in the fix tools; the hook blocks git writes and the git host's CLI from the agent's shell and refuses edits to protected files | the tools are the same everywhere; the hook is Claude Code's |
| Auto-QA never fixes on its own, and is off until you turn it on | a project that never opted in is not written to; `fix` mode only when you set it or use `#qa-fix`, with all the fix rules | same code, host hooks differ |
| Every fix has a regression test that fails without it | `fix_commit` takes the fix out, runs the test (it must fail), puts the fix back and runs it again (it must pass) | same, via MCP |

Known limits are listed in [docs/decisions/0001-browser-automation.md](docs/decisions/0001-browser-automation.md).
Screenshot masking of personal data is not built yet (Phase 7.6).

## Roadmap

| Phase | Adds |
|-------|------|
| 1 ✅ | Core skeleton, Claude Code adapter, `/qa-only`, API + browser testing, technical report, demo app |
| 2 ✅ | Curated QA knowledge base, loaded on demand |
| 3 ✅ | Plain-language admin report with release verdict, consistency check, HTML export |
| 4 ✅ | Project memory that improves each run |
| 5 ✅ | `qa-memory` MCP server: validated memory and run tools, migrations, global-lesson proposals |
| 6 ✅ | `/qa` fix mode: fix loop with proof, stop rules, branch handling, fix-log memory |
| 6.5 ✅ (this) | Auto-QA: a gate after every agent task that changed code, `/qa-auto`, tags |
| 7 | global lessons review |
| 7.5 – 7.10 | Codex, Cursor, generic; reliability, test bank, CI, coverage depth, release verdict and metrics |
| 8 | Linear and Sentry, polish |

## Development

See [MAINTAINING.md](MAINTAINING.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The `demo-app/` is a fixture
with seeded bugs used to test QAMind itself; its answer key is private to evaluation runs.

## License

MIT.
