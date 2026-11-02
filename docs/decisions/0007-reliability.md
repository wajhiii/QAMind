# 0007: Reliability foundations (environment, budgets, privacy, memory migration)

Status: accepted (Phase 7.6). Date: 2026-11-02.

Four things a QA agent has to get right before anyone can trust a report from it: tell a broken environment from a broken product, stop when told to, keep other people's data out of what it saves, and not lose what it learned when its own formats change.

## 1. Environment problems are not bugs (spec 13.1)

- **Test data preparation is configured, not guessed.** `setup` in `.qa/config.md`: `reset_command`, `seed_command`, optionally `snapshot_command` with its `restore_command` (both or neither), `run_before: never | full_runs | always`, `timeout_s`. Each step is one line, runs on this machine in the project folder, and **refuses** if it names an address in `blocked_production_patterns`
  (the same list the browser, the API runner and `run start` use). The command and its output are kept in `data/env-prep.json` with credentials removed and private data masked (a seed script that prints the customers it made must not put them in the run folder). A failed step is an environment problem, never a finding; a snapshot is restored when the run ends, also when the run stopped early (`run finish` does it, so it does not depend on the agent remembering).
- **The health check retries once.** A check that fails is run again after a short wait; failing twice is a problem, passing the second time is recorded as `flaky` (and a pass slower than 5 seconds as `slow`). Flaky and slow are told to the agent and kept as `env-quirk` learnings, so the next run expects them.
- **Environment problem is enforced, not requested.** `report lint` fails a run whose health check failed but which has findings; `run finish` defaults the stop reason to `environment problem`; every area left untested says so under Not tested; the admin report's verdict is not "Ready". The agent has no step in which it tests on top of a broken environment: Step 2 of the skills stops.

## 2. Budgets stop runs (spec 13.6)

- **Time is a deadline, not a hint.** `budget.time_minutes` (default, per mode, `ci`, `auto`) is resolved by `run start` into the run marker. `qamind budget status` says how much is left and, when over, exactly what to do (stop exploring, list the rest as `time budget reached`, build the report, finish). The API runner stops at the deadline between requests,
  `fix_begin` refuses to start another fix, and the reports say that the budget was reached and what was not covered. Auto-QA defaults to 5 minutes.
- **Cost is recorded, not enforced.** QAMind cannot see what a host spends, so `max_cost` is told to the agent and written to the run summary as `usage`, and the reports say it is advisory. Pretending to enforce it would be worse than saying it is not possible. (The host's own limit, such as Claude Code's `--max-budget-usd`, is the real stop.)
- **A daily total** for auto-QA and CI runs (`daily_max`, minutes) is kept in the store. When it is used up, the gate lets the agent stop, says so once for the day, and runs resume the next day. A `#qa` the user typed bypasses it.

## 3. Privacy (spec 13.8)

- **Masked before it is saved, and checked after.** One module (`core/lib/privacy.ts`) masks email addresses, national ID numbers (CNIC format), card numbers (Luhn-valid), phone numbers, the project's `mask_patterns`, and the values of `mask_fields` in API evidence. API evidence and rendered reports are masked on the way out;
  `run finish` and `report lint` **scan the whole run folder's text files and refuse to finish with a leak** (`qamind privacy scan` / `mask` do the same by hand). The scanner never prints a value, only the file and the kind.
- **What is left readable on purpose:** reserved test domains (`example.com`, `.test`, `.invalid`, ...), the configured test accounts' logins, anything with the `QA-` prefix, and the fiction phone range `555-01xx`. These are the data QAMind itself creates and needs in a report. A real customer's address in a test environment is masked.
- **Screenshots are blurred in the page, not after.** A script (`core/shared/page-mask.js`) is passed to the browser tool as a second `--init-script`; it blurs matching text, form values and `mask_selectors` as the page renders and as it changes. It was checked in real Chrome (a screenshot taken and read).
- **Limits, stated:** a name or a street address in running text is not detectable by pattern (only through `mask_fields`, `mask_patterns` or `mask_selectors`); images cannot be scanned, so a screenshot of a page that shows private data in a canvas or an image is not covered; the scanner reads text files only.
  **The blur is for what is saved, not for what the model sees:** the agent still reads the page's text through the browser snapshot, and the conversation with the host (its transcript, its final message) is the host's, not QAMind's. What QAMind controls is what it writes: evidence, reports, setup output and memory.

## 4. Memory formats migrate (spec 13.17)

- `MEMORY_SCHEMA` is 2. The one real change: the run summary gains `usage` (duration, and the cost when the host reported one). Every other file kind moves to 2 with its content unchanged (`unchanged(file)`), so a store is at **one** version and a newer QAMind's refusal rule stays simple.
- **Before anything is rewritten the store is copied** to `<store>/backups/<timestamp>-schema-1-to-2/`, byte for byte, and each file's migration is appended to `backups/migrations.log.jsonl`. A store written by a **newer** QAMind is still refused untouched. `memory_get_context` and `run start` migrate on first use, so no command is needed.
- **Tested against a real format 1 store**, not a synthetic one: `tests/core/fixtures/memory-v1/` was written by the 0.7.5 build through its own server. The test migrates a copy and checks the backup is byte-identical to the original, that nothing was lost, and that the second run does nothing.
- Found on the way: `writeMemoryJson` let a stale default `schema_version` in the caller's object win over the real one, and `stack.json` was written with an old constant, which would have re-migrated the store on every run. The version is written last now and every writer uses `MEMORY_SCHEMA`.

## Found by real-Chrome testing and fixed here

- The in-page script threw on first load because init scripts run before `document.documentElement` exists; style insertion now waits for it. A unit test against a fake DOM would not have shown it.
- The card pattern did not mask a number that ended a sentence (a full stop after the last digit): the look-arounds now allow a trailing `.` that is not followed by a digit.

## Not done, or not verified

- **Real agent runs**: see `docs/baselines/phase-7.6-reliability.md`, and the section for Phase 7.6 in `docs/EVALUATION-LOG.md`, for what ran and what did not.
- **Cost is not enforced** (see above). **Interactive Claude Code** was not used; every agent run was headless.
- **Names and addresses in free text** are not detected. **Images are not scanned.** The page mask is a blur, which is a screenshot convenience, not a guarantee: the owner who must keep a field out of evidence names it in `mask_fields`/`mask_selectors`.
- **Setup commands run through the shell.** They are the owner's own commands, one line each, refused when they mention a production address, but a command that reaches production by a name not in `blocked_production_patterns` is not detectable. The config's blocked list is the single source of truth.
- Windows and Linux: nothing was run there (the new tests are in the Windows CI job's list).
