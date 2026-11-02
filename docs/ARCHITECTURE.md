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
core/mcp/                     MCP servers: servers.ts (the shared list), qa-memory/ (tools.ts, server.ts, main.ts)
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

Not yet tracked (arrive with later phases): regressed bugs and new/still-open/came-back lifecycle (7.7), per-project verdict rules (7.10),
fix-mode status and branch line (6), tickets (8). The admin report says so in plain words where it matters.

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
- Everything else is in the skill's instructions (`core/shared/safety.md`), which hosts without hooks rely on.

## Host adapters

`hosts/<host>/host.json` records, from that host's current docs: where skills go, how MCP is registered, which hook
events are used, command names, and the capability tier. The adapter renders `core/` into the host's layout and fills
placeholders (`{{CLI}}`, `{{CORE_PATH}}`, `{{SESSION_ID}}`, `{{CMD_QA_ONLY}}`, …); an unknown placeholder fails the build.
Adding a host means adding a folder, not changing core (documented fully in Phase 7.5).

## Formats and versioning

Every file QAMind writes carries `schema_version`. Memory written by a newer QAMind is refused. Reports record the QAMind
and knowledge versions. See [MEMORY.md](MEMORY.md).
