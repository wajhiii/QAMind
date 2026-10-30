# Shared workflow (all QA runs)

Every run follows these phases in order. The skill gives the commands; this file explains the intent.

## Phase 0: setup and safety
`{{CLI}} run start` does this deterministically: picks the project, scaffolds the config on first run (and stops),
validates the config and every URL against the production rules, checks that test credentials exist (names only,
never values), detects the stack, creates the run folder under `.qa/reports/` and writes the run marker and
project memory into the private user store. Its JSON `status` tells you what to do. Never test with an
unfilled template.

## Phase 1: load memory
`{{CLI}} memory context --run <id>`. Memory is **leads, not proof**: re-verify current behaviour, and cite it
when it shaped a decision ("Applied: last run found the order totals wrong above 1,000"). In this version memory
holds the detected stack and the last runs' summaries. State in one short paragraph what it says to focus on.
Record what you applied in `data/meta.json` → `memory_applied` (a list of short strings).

## Phase 2: plan with charters (before probing)
For each surface and critical flow write a charter: goal, risk, entry point, expected results, exit condition.
Prioritize: flows and rules from the config first, then areas with past findings, then recently changed code
(`git.changed_files` from `run start`). Save `data/charters.json`, then run `{{CLI}} report build --run <id>` so the
plan is on disk before you probe.

Modes:
- `full`: every surface, every role, all critical flows, then the case types in `surfaces.md`.
- `quick`: critical flows and the top-risk areas; a desktop pass plus a mobile pass over every page of the critical
  flows, with the page audit on each page (`surfaces.md`). Smaller scope, not lower rigour: every finding still needs
  two reproductions and evidence.
- `regression`: re-run the previous run's findings and the areas next to them. Read the earlier run's
  `data/findings.json` from `.qa/reports/<run-id>/` (ids are in `memory context`). If it is gone, say so and run `quick`.
- `diff`: only the changed code and what depends on it. Map `git.changed_files` to routes, pages and endpoints by
  reading the source, test those plus their neighbours, and state the mapping in the charters.
- Free-text focus narrows any mode to that area.

## Phase 3: test, in this order
1. Health check (`{{CLI}} health --run <id>`). If the environment is broken, stop: write an Environment problem note
   (see Reporting) and finish the run. Never report product bugs from a broken environment.
2. API (`surfaces.md`, "API").
3. Each web UI, per role (`surfaces.md`, "Web UI").
4. Cross-checks: a change in one UI shows correctly in the other and in the API; role isolation; tenant isolation;
   totals and counts match.
5. Business rules from the config, each as an explicit expected result.

### Evidence rules
- Every finding must be **reproduced at least twice** and have evidence (screenshot and/or sanitized
  request/response and/or console log). `api run` re-runs flagged probes automatically; for UI findings repeat the
  steps from a fresh page load.
- Something you saw once, or could not repeat, goes to `data/unconfirmed.json`, never to the findings.
- Anything you did not test (blocked, missing credentials, needs something not configured, outside this mode's
  scope) goes to `data/not-tested.json` with the **true** reason. **Never report an untested area as passing.**
  This version has no enforced time budget, so do not write "time budget reached" unless the user or the host actually
  stopped you; for areas a `quick` or `diff` run leaves out, write "not covered in this pass (quick mode)".
- Judge every signal against the spec, the config's business rules and common sense before calling it a finding.
  Signals are leads. A 404 for an unknown id, a 403 for the wrong role and a 400 for invalid input are correct
  behaviour.

## Phase 4: fix
Not in `/qa-only`. If asked to fix, explain that `/qa-only` never changes code and point to the fix mode command.

## Phase 5: report
Write the data files (`reporting.md`), `{{CLI}} report build`, then `{{CLI}} report lint`. Fix every lint error
(missing evidence, a finding not reproduced twice, a leaked secret) before finishing.

## Phase 6: learn and finish
`{{CLI}} run finish --run <id> --stop-reason "<completed | environment problem | stopped by the user | …>"` writes
the run summary to the private store, re-renders the report with duration and stop reason, and clears the run marker.
Then give the user a short chat summary (reporting.md). If you noticed a gap in these instructions, append a proposal
to `.qa/suggested-improvements.md` (what, why, evidence); never edit the plugin's own files.
