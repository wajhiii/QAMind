# Memory and state (Phases 1 and 4)

All of this is **private to the user and the machine**: it lives in `$QAMIND_HOME` (default `~/.qamind`), never in the
project's git, and is never uploaded. One store serves every host on the machine.

```
$QAMIND_HOME/
├── state/browser-state.json          which credential NAMES each project's browser tool started with (no values)
└── projects/<project-id>/
    ├── project.json                  identity: id, id_source, name, git_remote, paths_seen, created, last_seen
    ├── memory/
    │   ├── stack.json                detected frameworks, test runners, commands (rewritten only when it changes)
    │   ├── product-map.json          pages per web UI and role, API endpoints, roles, key flows (Phase 4)
    │   ├── risk-areas.json           where problems have been found, with severity and date (Phase 4)
    │   ├── learnings.jsonl           short, confirmed lessons about this product (Phase 4)
    │   ├── false-alarms.jsonl        things reported once that were not bugs, so they are not reported again (Phase 4)
    │   ├── archive/                  learnings that lost confidence or fell out of the cap, kept for review
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

## How a run uses memory

1. **Start:** `qamind memory context --run ID` returns one compact bundle: the stack, the last few runs, a list of
   things to focus on (the top risk areas, re-verifying the last run's serious findings, known environment quirks), the top risk areas, the top learnings per type, every false alarm, the previous findings
   (for regression checks), a short product-map summary, and any warnings about unreadable lines.
2. **Plan:** after the flows and rules from the config, the agent tests risk areas first, then **new or changed
   endpoints** (`api inventory` prints `changes_vs_memory`), and does not rediscover what the product map already holds.
3. **Test:** a finding that matches a known false alarm is not reported again. If it only looks similar, the agent
   records why it is genuinely different (`not_a_known_false_alarm`); the lint rejects the rest.
4. **Report:** the technical report gets "What changed since the last run", a **Trend** table (this run and up to four
   before it) and a Memory section (applied, saved, state after the run). The admin report gets "What changed since
   the last check" in plain words.
5. **Finish:** `qamind run finish` updates the product map, records the risk areas (once per run id) and counts the
   false alarms it skipped. The agent saves new learnings with `memory learn` just before that.

Everything the agent cites must exist: `memory applied` only accepts real ids, and the report lint rejects invented ones.
Memory is **leads, not proof**: the agent re-verifies before relying on it.

## Files

Every file carries `schema_version`. JSON Lines files start with `{"_meta":{"schema_version":1,"kind":"..."}}`.
They are **safe to edit by hand**: unreadable lines are kept as they are and reported as warnings, and unknown fields survive.

### `learnings.jsonl`
`id (L-001…), type (behavior | pitfall | test-tip | fix-pattern | env-quirk), area, text, evidence_run, confidence (1–10),
created, last_confirmed, hits`. A new learning that is at least 60% similar to an existing one **merges** into it
(confidence +1). `memory learn --confirms ID` adds 1, `--contradicts ID` takes away 2, and below 3 it moves to
`archive/`. At most 200 stay active; the weakest are archived, never deleted.

### `false-alarms.jsonl`
`id (FA-001…), area, symptom, reason, source (reproduction | owner | spec), evidence_run, created, last_seen, hits`.
A finding matches when at least 60% of the alarm's symptom words appear in the finding (and the symptom has at least
three words). The lint treats a match as an **error** when the alarm came from the owner or the spec (unless the finding
explains why it is different), and only as a **warning** when it came from the agent's own reproduction, because a
reproduction can be wrong.

### `risk-areas.json`
Per area, the most recent events (`run, date, severity`). The score is `Σ weight × recency`, with weights 10 / 4 / 1 for
critical / important / minor and a recency half-life of 90 days, so an old problem fades and a repeated one stays on top.

### `product-map.json`
Pages per UI (`title, roles, first_seen, last_seen`), API endpoints (`summary, auth, first/last seen`), roles and key
flows. Paths are normalised (`/orders/123` becomes `/orders/:id`). Changes are described twice from the same facts: exactly
for developers, and in plain words (no paths or request methods) for the admin report.

## Change detection

`run finish` (and `report build`) compare the run with the map and write `data/changes.json`:
new pages, endpoints added or removed, and pages not seen. Two guards avoid false claims:

- "Not seen" is only asserted after a **full** run; a quick run never claims a page is gone.
- Endpoints are reported added or removed only when **both** the old and new picture came from the OpenAPI spec, so a
  run that merely did not exercise an endpoint cannot make it look removed.

## Run summary (`memory/runs/<run-id>.json`)

`run_id, mode, trigger, kind, host, started, finished, duration_s, counts {critical, important, minor, unconfirmed},
finding_ids, findings (compact: id, severity, area, title), coverage {tested, partial, not_tested}, journeys {total, tested} (key journeys from the config; the number to
compare runs by), not_tested_count,
blocked_areas, cost, stop_reason, agent_version, knowledge_version, branch, commit, report, memory_updated` plus
`schema_version`. Summaries are computed from the run's data files by `run finish`, not typed by the agent.

## Rules

- No secrets, tokens, passwords or real people's data are ever stored. Every saved text is screened (the project's known test
  passwords, tokens and keys, email addresses other than reserved test domains, national-ID-, card- and phone-number-like
  values); a failing text is refused, not trimmed. The screen is best-effort, which is why the learning test also scans the whole store.
- `schema_version` is checked **before anything is written**: if any memory file was written by a newer QAMind, the run
  finishes without touching memory and says why, so memory is never half-updated.
- Memory is private per user: not in git, not uploaded, shared across hosts on the same machine.
- **Not yet:** fix log (Phase 6), bug lifecycle and feedback (7.7), performance and metrics (7.9, 7.10), migrations with
  backups (when the first schema change needs one). The folders for them exist.
- Phase 5 wraps these same library functions in the `qa-memory` MCP server; the file formats do not change.

## CLI

```
qamind memory context --run ID
qamind memory learn --run ID --type T --area A --text TEXT [--confidence N]
qamind memory learn --run ID --confirms L-001 | --contradicts L-001
qamind memory applied --run ID --ids L-001,FA-002
qamind memory false-alarm --run ID --area A --symptom S --reason R [--source reproduction|owner|spec]
qamind memory show --run ID --what learnings|false-alarms|risk|map
qamind memory where
```

## Run folder in the project (`.qa/`, git-ignored)

`config.md`, `reports/run-<timestamp>/{TECHNICAL-REPORT.md, ADMIN-REPORT.md, data/, evidence/, screenshots/}`, `suggested-improvements.md`.
`data/` holds `meta.json`, `charters.json`, `findings.json`, `unconfirmed.json`, `not-tested.json`, `coverage.json`,
`health.json`, `api-inventory.json`, `endpoints.json`, `pages.json`, `changes.json`, `memory-log.json`, `admin.json`,
`plans/`, `api-results/`.
