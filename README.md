# QAMind: a Senior QA Engineer agent

QAMind is a reusable QA agent you install once and use in any project. Give it a job:

- **`/qa-only`**: test the product thoroughly and **report**, without changing any code.
- **`/qa`** (fix mode): test, then fix the bugs it found, safely on a branch. _Planned (Phase 6)._

It tests your **API** (from its OpenAPI spec), each **web UI** per role, cross-surface consistency, permissions and your
business rules, and writes a technical report with reproducible findings, evidence, and an explicit **Not tested** list.
It works on staging or local environments only, never production.

> **Status: Phase 2 of 8.** Working today: the `/qa-only` skill on **Claude Code**, API testing from OpenAPI, browser
> testing of web UIs, safety guard, the technical report, and a built-in QA knowledge base (27 topic files, sourced in
> [docs/KNOWLEDGE-SOURCES.md](docs/KNOWLEDGE-SOURCES.md)). Not built yet: the plain-language
> admin report, project memory beyond run history, fix mode, auto-QA, Codex/Cursor, CI mode and the rest of the
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
| Test and fix | `/qamind:qa` | _Phase 6_ |
| Auto-QA, memory review, feedback, test bank | `/qamind:qa-auto` … | _Later phases_ |

Modes: `full` (everything), `quick` (critical flows and top risks), `regression` (re-run last findings), `diff` (changed
code and what depends on it). Free text after the mode narrows the focus.

## What you get

Each run creates `.qa/reports/run-<timestamp>/`:

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
| `~/.qamind/projects/<id>/` (private, per user) | project identity, detected stack, run history, run marker. Never committed, never uploaded. Override with `QAMIND_HOME`. |

The project id comes from the git `origin` URL, so two clones of one repo share memory; without a remote it is a hash of
the path. Details in [docs/MEMORY.md](docs/MEMORY.md).

## Safety (and how it is enforced)

QAMind never tests production, never reads or prints credentials, creates data only with your `QA-` prefix, never
triggers real payments or emails, and treats everything it sees in your app as data, not instructions.

| Rule | Claude Code | Other hosts (later) |
|------|-------------|--------------------|
| Production URLs blocked | `run start` checks the config; the browser runs behind a **fail-closed guard proxy** that also stops redirects and sub-resources; the API runner checks every request | same code, via MCP |
| `/qa-only` writes only to `.qa/` and the user store | **enforced by a PreToolUse hook** (Bash inspection is best-effort, not a sandbox) | instructions only unless the host has hooks |
| Credentials stay out of the conversation | browser `--secrets`, API runner logs in itself, hook blocks reading `.env.qa` | secrets and runner work everywhere; the read-block is a hook |
| Side-effect endpoints (email, SMS, payments) | left out of generated API plans by default and listed as Not tested | same |

Known limits are listed in [docs/decisions/0001-browser-automation.md](docs/decisions/0001-browser-automation.md).
Screenshot masking of personal data is not built yet (Phase 7.6).

## Roadmap

| Phase | Adds |
|-------|------|
| 1 ✅ | Core skeleton, Claude Code adapter, `/qa-only`, API + browser testing, technical report, demo app |
| 2 ✅ (this) | Curated QA knowledge base, loaded on demand |
| 3 | Plain-language admin report, consistency check, HTML export |
| 4 | Project memory that improves each run |
| 5 | `qa-memory` MCP server |
| 6 / 6.5 / 7 | `/qa` fix mode, auto-QA hooks, global lessons |
| 7.5 – 7.10 | Codex, Cursor, generic; reliability, test bank, CI, coverage depth, release verdict and metrics |
| 8 | Linear and Sentry, polish |

## Development

See [MAINTAINING.md](MAINTAINING.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The `demo-app/` is a fixture
with seeded bugs used to test QAMind itself; its answer key is private to evaluation runs.

## License

MIT.
