# Architecture (Phase 1)

QAMind is **write once, run everywhere**: the QA logic, knowledge and file formats live in a host-agnostic core, and each
AI coding tool gets a thin generated adapter.

```
core/                         single source of truth
  skills/qa-only/SKILL.md       the job description, with {{placeholders}}
  shared/*.md                   workflow, safety, surfaces, reporting, memory protocol, templates
  knowledge/                    curated QA expertise: 27 topic files + INDEX.md + VERSION (docs/KNOWLEDGE-SOURCES.md credits every source)
  lib/*.ts                      deterministic runtime: store, config, URL policy, runs, API plan/runner, report, hooks
  scripts/                      browser launcher + guard proxy
cli/src/                      the `qamind` command (JSON in/out) used by skills and hooks
hosts/claude/                 adapter: host.json, adapter.ts, plugin dependency manifest + lockfile
plugins/qamind/               GENERATED Claude Code plugin (committed; CI fails if stale)
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
run start ─► memory context ─► health ─► charters ─► test (API → UI → cross-checks → rules) ─► data/*.json ─► report build/lint ─► run finish
   │ writes project.json, stack.json,           │ api inventory / plan / run     │ browser tools           │ renders TECHNICAL-REPORT.md
   │ run marker (store), run folder (.qa)        │ evidence/api/*.json            │ screenshots/            │ summary → store memory/runs/
```

`run start` is the gate: it picks the project, scaffolds the config on first run and stops, refuses an unfilled
template, blocked or ambiguous URLs, and a project with no usable credentials, and only then creates the run folder and
the **run marker** `<store>/state/run-marker.json`. The marker carries the session id, the mode, whether the run is
report-only, and the **policy** (allowed origins, blocked patterns). The hook and the guard proxy both read it.

## Knowledge, loaded on demand

The skill is short; expertise lives in `core/knowledge/` and is loaded only when relevant. The agent reads `INDEX.md` while planning (a
situation-to-files table, plus a framework table keyed on `stack.frameworks` from `run start`), then loads a few matching files at a
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
