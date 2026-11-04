# Memory and state (Phases 1, 4, 5, 6, 7, 7.6 and 7.7)

All of this is **private to the user and the machine**: it lives in `$QAMIND_HOME` (default `~/.qamind`), never in the
project's git, and is never uploaded. One store serves every host on the machine.

```
$QAMIND_HOME/
├── state/browser-state.json          which credential NAMES each project's browser tool started with (no values)
├── pending-lessons.md                generic lessons the agent proposed for any project; used by nothing until you approve one (Phase 5)
├── global-lessons.md                 the lessons you approved: the ONLY lesson file every project reads (Phase 7; approve in /qa-memory-review, or edit by hand)
├── rejected-lessons.jsonl            lessons you turned down or retired, so a near copy is not proposed again (Phase 7)
├── lesson-use.json                   how often runs applied each approved lesson (Phase 7)
├── auto.json                         the global auto-QA default (Phase 6.5)
└── projects/<project-id>/
    ├── project.json                  identity: id, id_source, name, git_remote, paths_seen, created, last_seen
    ├── memory/
    │   ├── stack.json                detected frameworks, test runners, commands (rewritten only when it changes)
    │   ├── product-map.json          pages per web UI and role, API endpoints, roles, key flows (Phase 4)
    │   ├── risk-areas.json           where problems have been found, with severity and date (Phase 4)
    │   ├── learnings.jsonl           short, confirmed lessons about this product (Phase 4)
    │   ├── false-alarms.jsonl        things reported once that were not bugs, so they are not reported again (Phase 4)
    │   ├── fix-log.jsonl             every fix `/qa` attempted: outcome, files, test, root cause (Phase 6)
    │   ├── bugs.jsonl                every problem found across runs: fingerprint, status, history (Phase 7.7)
    │   ├── feedback.jsonl            what people said about findings, with who and when (Phase 7.7)
    │   ├── archive/                  learnings that lost confidence or fell out of the cap, kept for review
    │   └── runs/<run-id>.json        one summary per finished run
    ├── state/
    │   ├── run-marker.json           present only while a run is active (session, mode, policy)
    │   ├── memory.lock               held for milliseconds while memory is being changed (Phase 5)
    │   └── guard-blocked.jsonl       origins the browser guard refused
    ├── backups/                      copies of memory files taken before a format migration, and migrations.log.jsonl (Phase 5)
    ├── test-bank/bank.jsonl          the saved checks: value card, plan or steps, and how each test has done (Phase 7.7)
    ├── baselines/                    created now, used by a later phase
```

## Project id

The normalized git `origin` URL (`git@github.com:Owner/Repo.git` and `https://github.com/owner/repo` both become
`github.com/owner/repo`) gives `<slug>-<8 hex>`, so two clones of one repo share memory. Without a remote it is
`path-<folder>-<12 hex of the real path>`. Every path seen is recorded in `project.json`.

## How a run uses memory

1. **Start:** `memory_get_context` returns one compact bundle: the stack, the last few runs, a list of
   things to focus on (the top risk areas, re-verifying the last run's serious findings, known environment quirks), the top risk areas, the top learnings per type, every false alarm, the previous findings
   (for regression checks), a short product-map summary, and any warnings about unreadable lines.
2. **Plan:** after the flows and rules from the config, the agent tests risk areas first, then **new or changed
   endpoints** (`api inventory` prints `changes_vs_memory`), and does not rediscover what the product map already holds.
3. **Test:** a finding that matches a known false alarm is not reported again. If it only looks similar, the agent
   records why it is genuinely different (`not_a_known_false_alarm`); the lint rejects the rest.
4. **Report:** the technical report gets "What changed since the last run", a **Trend** table (this run and up to four
   before it) and a Memory section (applied, saved, state after the run). The admin report gets "What changed since
   the last check" in plain words.
5. **Finish:** `run_finish` updates the product map, records the risk areas (once per run id) and counts the
   false alarms it skipped. The agent saves new learnings with `memory_save_learning` just before that.

Everything the agent cites must exist: `memory_record_applied` only accepts real ids, and the report lint rejects invented ones.
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

### `fix-log.jsonl`
`id (F-001…), run, issue, severity, area, title, outcome (verified | best-effort | reverted | deferred), branch, commit, files, test_files, root_cause, reason, at`. Written by the fix tools, never by hand: one entry for
each fix attempted in a `/qa` run, including the ones that were reverted or deferred, so a later run knows what was fixed and where, and what did not work. Titles and root causes are screened like every saved text; one that would not pass is replaced by
"[withheld: it contained sensitive data]", never saved. At most 300 entries stay; older ones go to `archive/`. `memory_get_context` shows the latest eight (`fix_log`), and `memory_list` with `what: "fix-log"` shows all of them.

### `bugs.jsonl` (Phase 7.7)

`id` (BUG-001), `fingerprint` (area, type and the symptom's significant words), `area, type, surface, title, plain_title, summary, severity, status`, `first_seen`, `last_seen`, `times_seen`, `history` (new, seen, fixed, regressed, accepted ... with who and why),
and from feedback `severity_override`, `accepted`, `not_a_bug`, `duplicate_of`, `confirmed_by`. Status: `new`, `still-open`, `fixed`, `regressed` (shown as "came back"), `accepted`, `not-a-bug`, `duplicate`. **Fixed is only written with proof**: a passing bank test that protects the bug, a validated re-check the agent wrote, or a person's verdict.
Written when a run finishes (and by feedback); a run cannot write it by hand.

### `feedback.jsonl` (Phase 7.7)

`id` (F-001), `bug`, `issue` and `run` (what the person pointed at), `verdict`, `level`, `duplicate_of`, `note`, `by`, `at`, `via` (command or admin-report) and `effects` (what it changed, in words). Notes are screened for secrets and personal data.

### `test-bank/bank.jsonl` (Phase 7.7)

One test per line: `id` (T-001), `kind` (api or ui), `title`, `area`, `status` (active, quarantined, retired), `card` {protects, fails_when, not_duplicate}, `protects_bug`, `from_run`, `from_issue`, `plan` (API: requests and what each must answer) or `ui` and `steps`, `revisions`,
and `stats` {runs, passes, failures, flaky, flips, last, history (p, f or x = passed only on a retry), avg_ms}. Retired tests move to `memory/archive/test-bank.jsonl` with the reason.

### `metrics.json` (Phase 7.10)

`runs`: one record per finished run (not one whose test environment was broken), at most 200: `run_id, finished, mode, trigger, verdict, findings` {critical, important, minor, unconfirmed}, `bugs` {new, still_open, came_back}, `coverage` {journeys_tested, journeys_total, areas_tested, areas_partial, areas_not_tested, pages, endpoints, api_probes}, `bank` {total, ran, passed, failed, pass_rate}, `tests_saved, duration_s, cost_usd, tokens` `areas` (each area of the coverage matrix with its status) and `finding_list` (id, area and title of each finding, up to 40).
`escaped`: `id` (ESC-001), `area, title, severity, source` (manual, sentry, ticket, other), `ref`, `recorded`, `by`, `note`, `verdict` (what the runs had said about the area: `missed`, `reported-before`, `partly-checked`, `not-checked`, `never-covered`) and `matched` (the run, the area it matched and, for a tested area, the findings that looked related). Written by `run finish` and by `qamind escaped add` (the owner's); a run cannot write it by hand.
Precision is not stored: it is worked out from the feedback file whenever it is shown.

### `tickets.json` (Phase 8)

`tickets`: which Linear ticket each bug has (at most 500): `bug` (BUG-003), `ticket` (ENG-412), `url` (https on linear.app), `state` (as last seen: Todo, Canceled, ...), `created_run`, `last_run`, `updated`. A run writes a bug's entry only through `qamind tracker record`, and `feedback from-tracker` updates the state it read; the next run's `tracker plan` uses it to comment on the ticket instead of opening another. Nothing else is kept from Linear: no ticket text, no names.

### `risk-areas.json`
Per area, the most recent events (`run, date, severity`, and `source`: a finding, the agent's flag, a person's feedback, or an escaped bug (by hand, or from Sentry or a ticket), whose event is kept under its own id). The score is `Σ weight × recency`, with weights 10 / 4 / 1 for
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
finding_ids, findings (compact: id, severity, area, title, bug), coverage {tested, partial, not_tested}, journeys {total, tested} (key journeys from the config; the number to
compare runs by), not_tested_count,
blocked_areas, lifecycle {new, still_open, regressed, accepted, fixed, not_rechecked}, cost, usage {duration_s, cost_usd?, tokens?, note} (schema 2: what the host said, or "not available on this host"), budget {time_minutes?, max_cost?, used_minutes, reached, source} (when the run had one), stop_reason, agent_version, knowledge_version, branch, commit, report, memory_updated` plus
`schema_version`. Summaries are computed from the run's data files by `run finish`, not typed by the agent.

## Rules

- No secrets, tokens, passwords or real people's data are ever stored. Every saved text is screened (the project's known test
  passwords, tokens and keys, email addresses other than reserved test domains, national-ID-, card- and phone-number-like
  values); a failing text is refused, not trimmed. The screen is best-effort, which is why the learning test also scans the whole store.
- **Migrations** (Phase 7.6): memory is at `schema_version` 2 (the run summary gained `usage`; every other file kind moved with its content unchanged, so a store is at one version). A store at an older version is copied byte for byte to `backups/<time>-schema-1-to-2/` first, then migrated file by file;
  `backups/migrations.log.jsonl` has a line per file (what, from, to, which migrations). It happens on a run's first use of the store, with the lock held. `tests/core/fixtures/memory-v1/` is a real format 1 store written by QAMind 0.7.5.
- `schema_version` is checked **before anything is written**: if any memory file was written by a newer QAMind, the run
  does not start (or finishes without touching memory) and says why, so memory is never half-updated.
- Memory is private per user: not in git, not uploaded, shared across hosts on the same machine.
- **Not yet:** performance and metrics (7.9, 7.10), visual baselines (7.9). The folders for them exist.

## The qa-memory tools (Phase 5)

The skill reads and writes memory only through the `qa-memory` MCP server ([decision 0002](decisions/0002-qa-memory-server.md)). It calls the same functions as the commands below, so the
two cannot disagree. Every text field has a length limit and every list a count limit in the schema the host shows the model; invalid input comes back as a result with `isError` and one line per bad field.

| Tool | What it does | Limits |
|---|---|---|
| `run_start` | gate and setup of a run; returns run id/folder, config summary, stack, git changes, browser status | focus 300, session 200 |
| `run_finish` | summary, product map, risk areas, history, both reports; ends the run | stop reason 200 |
| `run_history` | recent finished runs (counts, journeys, coverage); findings on request | 1 to 20 runs |
| `memory_get_context` | what memory knows, bounded, including the approved global lessons; works in a run or by project folder | about 40,000 characters at most |
| `memory_list` | learnings, false alarms, scored risk areas or the product map in full | `limit` 1 to 200 per list |
| `memory_save_learning` | one atomic learning; a near copy (60% similar) is merged | text 12 to 400, area 120 |
| `memory_adjust_learning` | confirm (+1) or contradict (-2; below 3 it is archived) | id `L-nnn` |
| `memory_record_applied` | cite learnings used, false alarms skipped and approved global lessons used (`G-nnn`); **nothing is recorded if any id does not exist** | 1 to 50 ids |
| `memory_mark_false_alarm` | something that is not a bug, with who established it; a near copy (70%) is not saved twice | symptom 12 to 300, reason 8 to 300 |
| `memory_update_risk` | flag an area with no confirmed finding; once per run and area; stands down when a finding covers the area | note 200 |
| `memory_update_product_map` | record pages (and endpoints without a spec); paths lose host, query and hash, ids collapse; returns what differs from the map | 100 pages, 500 endpoints per call; 300 pages, 1,000 endpoints per run |
| `lessons_propose` | one generic lesson for the owner's pending list | text 20 to 280, reason 10 to 280 |
| `fix_*` (10 tools) | the fix loop of `/qa`: preflight, branch, begin, run tests, commit with proof, revert, defer, final suite, continue, status | see [decision 0003](decisions/0003-fix-mode.md) |

Redaction applies to every text that is saved: a refusal names the kind of data found and never repeats it. A page title that fails is dropped with a warning (the page is still recorded).

**Global lessons.** `lessons_propose` appends to `pending-lessons.md` in the store (a plain Markdown list you can edit). A lesson that names the project or one of its UIs, a web address, a host or IP, a file, a ticket id, code or personal data is refused with every reason at once.
Near copies of pending, approved or rejected lessons are not added again (a rejected one answers `rejected-before`: do not reword and retry), and at most 100 can wait.

**Concurrency.** Each change runs under a lock file in the store (`state/memory.lock`): processes wait up to 10 seconds, and a lock left by a crashed process is taken over. Writes are replace-by-rename, so a reader never sees half a file.

**Migrations (spec 13.17).** Every entry point migrates the store once per process before touching it. A migration copies the files it will change into `backups/<time>-schema-<from>-to-<to>/`, rewrites them, and appends what it did to
`backups/migrations.log.jsonl`. It refuses, before writing anything, to drop a field it did not declare, and a gap in the chain is an error. Hand-written files with no version are left alone. Format 1 is the first format, so there is nothing to migrate
today; the framework is tested with synthetic migrations (`tests/core/memory-infra.test.ts`).

## CLI

The same operations as commands, for people, tests and hosts without MCP (the skill does not use them):

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
`health.json`, `env-prep.json` (setup commands, when configured), `lifecycle.json` (what each finding is across runs), `bank-results.json` (the test bank's turn at the start), `rechecks.json` (written by the agent), `bank-skip.json` (why a run saved no test), `known-accepted.json`, `bank/` (tests the agent wrote before saving them), `api-inventory.json`, `endpoints.json`, `pages.json`, `changes.json`, `memory-log.json`, `admin.json`,
`plans/`, `api-results/`.

## Global lessons and the owner's review (Phase 7)

A lesson goes through three states, and only the last one reaches a run ([decision 0005](decisions/0005-global-lessons.md)).

| State | Where | Who moves it | Does any run read it? |
|---|---|---|---|
| pending (`P-001`) | `pending-lessons.md` | the agent proposes it (`lessons_propose`) | **no** |
| approved (`G-001`; `H-xxxxxx` for a line you wrote by hand) | `global-lessons.md` | **you**, with `qamind lessons approve` (through `/qa-memory-review`) or by editing the file | yes, every project, at most the 25 best-used and newest |
| rejected or retired | `rejected-lessons.jsonl` | you, with `qamind lessons reject` | no, and a near copy is not proposed again |

- **Generic by rule, checked three times:** when proposed (against the current project's names), when approved (against **every project this machine has seen**, and as you reworded it), and every time a run loads it, because you may edit the files by hand.
  A lesson that names a project, a web address, a host or IP, a file, a ticket, code or personal data is refused or, for a hand edit, not loaded; the run's context and the review say which one and why. The name check is an exact match on a project's name or folder name
  (four characters or more), so it is a safety net, not a judge: read what you approve.
- **No run can approve.** The server has no approve tool; the safety hook refuses `qamind lessons approve|reject`, `memory prune`, the auto-QA settings commands and any write to these files while a QA run is active; and the review skill leaves the deciding commands out of its pre-approved tools, so the host asks you each time.
- **Your own edits are kept.** The files are plain Markdown: `## G-001 · date · area` blocks with `- **Lesson:**` and `- **Why:**`, or just a bullet line of at least 20 characters. Notes and headings you add survive every rewrite.
- **Citing:** a run lists an approved lesson that shaped a decision in `memory_record_applied` (`G-001`); the technical report then shows "Applied global lesson G-001: ...", and `lesson-use.json` counts it (best-used lessons are loaded first).

**The review** (`/qamind:qa-memory-review`, or `qamind lessons ...` and `qamind memory review|stats|prune`):

| Command | What it does |
|---|---|
| `lessons list` | pending, approved (with times applied, and whether each is loaded here, with the reason if not) and rejected lessons |
| `lessons approve ID [--text "reworded"]` | pending to approved; checked again first |
| `lessons reject ID [--reason ...]` | turn a pending lesson down, or retire an approved one |
| `memory review [--project DIR]` | this project's learnings, false alarms and risk areas; entries that look stale are marked with why (low confidence, not confirmed for 180 days, never used, never matched, an old problem). A mark is a suggestion |
| `memory prune --learning L-001 \| --false-alarm FA-001 \| --risk AREA [--reason ...]` | **archive** one entry with your reason (`memory/archive/`); nothing is deleted, so a mistake is undone by moving the line back |
| `memory stats [--project DIR]` | runs by mode and trigger, the last ten, a trend (latest three runs against the three before, only with six or more), memory use, and the global lessons |

`memory stats` says what it cannot tell yet: **precision** needs your verdicts on findings (a later phase) and **escaped bugs** need Sentry or labelled tickets (a later phase). It does not guess.
