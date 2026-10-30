# Evaluation log

How QAMind is scored against the demo app, and the results so far. The answer key (`demo-app/SEEDED-BUGS.md`) and the
scorer (`demo-app/eval/score-run.mjs`) are private to evaluation: the agent under test must never see them.

## How to reproduce a scored run

1. Copy the demo **without** the key: `rsync -a --exclude node_modules --exclude .qa --exclude .env.qa --exclude .env.qa.fixture --exclude SEEDED-BUGS.md --exclude eval --exclude qa-fixture demo-app/ /some/scratch/ws/`, then `git init` and commit it there.
2. In that copy: `cp <repo>/demo-app/qa-fixture/config.md .qa/config.md` (run `qamind run start` once first, or `mkdir .qa`), `cp <repo>/demo-app/.env.qa.fixture .env.qa`, start the app (`node server.mjs`), reset it (`node scripts/reset.mjs`).
3. Run the agent headlessly with a scratch `QAMIND_HOME`, for example (the `claude` binary may not be on PATH; the VS Code extension bundles one under `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/`):
   `claude -p "/qamind:qa-only quick" --plugin-dir <repo>/plugins/qamind --allowedTools Read Glob Grep Write Edit "Bash(qamind *)" "Bash(curl *)" "Bash(git status *)" "Bash(git diff *)" "Bash(git log *)" "Bash(ls *)" mcp__plugin_qamind_browser --max-budget-usd 6 --no-session-persistence --output-format stream-json --verbose < /dev/null`
4. Score: `node demo-app/eval/score-run.mjs <ws>/.qa/reports/run-...` (keyword matching: **review the unmatched findings and the per-bug mapping by hand**).

Scored bugs are DB-01 … DB-13 and DB-15 (14). DB-14 needs a mail catcher and DB-16 needs WebKit, so they are out of scope until
Phase 7.9. DB-17 is the privacy-masking fixture (Phase 7.6).

## Phase 1 results (mode `quick`, Claude Code 2.1.312, one run each)

| | Run 1 (first build) | Run 2 (Phase 1 final) |
|---|---|---|
| Seeded bugs found, of 14 | **8** | **14** |
| Seeded bugs surfaced only as a lead | 2 (DB-07, DB-11) | 0 |
| Missed | DB-05, DB-08, DB-09, DB-15 | none (DB-11 and DB-12 partly, see below) |
| Findings reported | 10 | 16 |
| Decoy (false positive) reported | 1 (table scrolling inside its own box) | 0 |
| Valid findings outside the key | 0 | 1 (`-$0.00` discount, now listed as a known unintended behaviour) |
| Every finding reproduced twice with evidence, lint clean | yes | yes |
| Fixture passwords found in any run output | none | none |
| Cost / time / agent turns | $1.96 / 9.0 min / 124 | $3.11 / 13.5 min / 237 |

What changed between the runs, all found by reading run 1 and the agent's own `suggested-improvements.md`:
a per-page **audit script** injected into every page (unnamed controls, controls off-screen, covered elements, clipped text,
RTL text in LTR boxes; wide tables that scroll inside their own box are reported as informational), plan **validation** and
list-or-string body checks (a string was being read as a list of characters), **write probes only on records the run creates**,
plan names accepted by `api run`, an honest-reasons rule (no "time budget reached" without a real budget), and a hook fix.

### Read these numbers with care
- **Single runs.** LLM runs vary; two runs do not give a distribution.
- **Tuned on this fixture.** The audit and the instructions were improved after seeing which seeded bugs run 1 missed. The
  audit's checks are standard accessibility and layout heuristics, not demo-specific rules, but 14/14 is not evidence that a real
  project will score the same. A held-out project is the real test; per decision 7 in the spec, that happens only after all phases are complete.
- **Partial credit.** DB-11 was found through its root cause (long text clipped in both portals); the reversed Urdu order stayed an
  unconfirmed lead. DB-12 was confirmed for sign-out; token expiry was listed as Not tested.
- **`quick` only.** No `full` run has been scored yet; it is the right baseline for Phase 2's "finds more than Phase 1" check.
- The scorer is keyword matching and can over- or under-credit; the table above was reviewed by hand against the reports.

### Observed problems in run 2 (all fixed or noted)
- The safety hook denied a harmless `node -e` script because it read `=>` as a shell redirect. **Fixed** (quoted text and arrows
  ignored; tests added).
- Lint rejected a hand-written plan that contained a deliberately fake `Bearer` token. **Fixed** (plans are checked only for
  real configured secrets).
- One `Connection closed` error on the very first browser call; the next call worked. Not reproduced in isolation. The run used
  the `npx` fallback, which connects about 1.3 s slower than the installed dependency (1.65 s vs 0.35 s).
