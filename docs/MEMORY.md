# Memory and state (Phase 1)

All of this is **private to the user and the machine**: it lives in `$QAMIND_HOME` (default `~/.qamind`), never in the
project's git, and is never uploaded. One store serves every host on the machine.

```
$QAMIND_HOME/
├── state/browser-state.json          which credential NAMES each project's browser tool started with (no values)
└── projects/<project-id>/
    ├── project.json                  identity: id, id_source, name, git_remote, paths_seen, created, last_seen
    ├── memory/
    │   ├── stack.json                detected frameworks, test runners, commands (rewritten only when it changes)
    │   └── runs/<run-id>.json        one summary per finished run
    ├── state/
    │   ├── run-marker.json           present only while a run is active (session, mode, policy)
    │   └── guard-blocked.jsonl       origins the browser guard refused
    ├── test-bank/  baselines/  backups/    created now, used by later phases
```

## Project id

The normalized git `origin` URL (`git@github.com:Owner/Repo.git` and `https://github.com/owner/repo` both become
`github.com/owner/repo`) gives `<slug>-<8 hex>`, so two clones of one repo share memory. Without a remote it is
`path-<folder>-<12 hex of the real path>`. Every path seen is recorded in `project.json`.

## Run summary (`memory/runs/<run-id>.json`)

`run_id, mode, trigger, kind, host, started, finished, duration_s, counts {critical, important, minor, unconfirmed},
finding_ids, coverage {tested, partial, not_tested}, not_tested_count, blocked_areas, cost, stop_reason, agent_version,
knowledge_version, branch, commit, report` plus `schema_version`. Summaries are computed from the run's data files by
`run finish`, not typed by the agent.

## Rules

- Memory is **leads, not proof**; the agent re-verifies and cites it.
- No secrets, tokens, passwords or real people's data are ever stored.
- `schema_version` is checked on read; a store written by a newer QAMind is refused with an instruction to update.
- **Not in Phase 1:** product map, risk areas, learnings, false alarms, bug lifecycle, feedback, metrics, migrations with
  backups. The folders for them exist; the logic arrives in Phases 4, 5, 7.6 and 7.7.

## Run folder in the project (`.qa/`, git-ignored)

`config.md`, `reports/run-<timestamp>/{TECHNICAL-REPORT.md, data/, evidence/, screenshots/}`, `suggested-improvements.md`.
`data/` holds `meta.json`, `charters.json`, `findings.json`, `unconfirmed.json`, `not-tested.json`, `coverage.json`,
`health.json`, `api-inventory.json`, `plans/`, `api-results/`.
