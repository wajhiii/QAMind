# Changelog

## 0.4.0 (Phase 4, unreleased)

- **Project memory, files first** (`core/lib/memory/`, private per user in `$QAMIND_HOME`): `product-map.json`, `risk-areas.json`, `learnings.jsonl`,
  `false-alarms.jsonl` and an `archive/`, next to the existing `stack.json` and `runs/`. Every file carries `schema_version`; JSON Lines files start with a
  `_meta` line. Hand edits are tolerated (unreadable lines are kept and reported, unknown fields survive). A store written by a newer QAMind is refused
  **before anything is written**, so memory is never half-updated.
- **Learnings:** five types, merged when 60% similar, confidence +1 when confirmed and -2 when contradicted, archived below 3, capped at 200. **False alarms:**
  matched against new findings; the lint refuses an unexplained match against an owner- or spec-sourced alarm (a warning for a reproduction-sourced one).
  **Risk areas:** frequency x severity x recency (90-day half-life), recorded once per run id. **Product map and change detection:** normalised paths,
  new pages, endpoints added or removed (only when both pictures come from the OpenAPI spec), pages not seen (only after a full run).
- **Nothing secret or personal is saved:** every text is screened for the project's test passwords, tokens and keys, non-reserved email addresses and national-ID-,
  card- and phone-number-like values, and refused rather than trimmed.
- **Citations are checked:** `memory applied` accepts only ids that exist, and the report lint rejects an invented `L-`/`FA-` id.
- **CLI:** `memory context | learn | applied | false-alarm | show | where`; `api inventory` prints `changes_vs_memory`; `report build` refreshes change detection.
- **Reports:** the technical report gains "What changed since the last run", a Trend table (this run and up to four before it) and a Memory section (applied,
  saved, state after the run); the admin report gains "What changed since the last check" in plain words and a "key journeys fully checked" trend line (also in the HTML export). The number of coverage rows is not used as a trend: the agent chooses how finely to split the work (9 vs 24 rows between two runs with no real change).
- **Agent instructions:** load memory first, plan from risk areas and changes, record `pages.json`, skip known false alarms, save learnings before finishing.
  `core/lib/memory.ts` was replaced by the `core/lib/memory/` modules.
- **Evaluation:** `scripts/eval-learning.ts` runs the spec's learning test (two runs on the demo app against one memory, with a product change and an owner-confirmed
  false alarm in between), saves each run's call trace, counts a run only if it ended normally and finished its memory update, and writes a failure record otherwise.
  Both evaluation scripts now refuse to start if something is already listening on the demo port. Results: `docs/EVALUATION-LOG.md`.
- Found by that evaluation and fixed: plain change lines quoted jargon from an API summary; a page seen for the first time was called "new" although the earlier run had only not reached it;
  applied learnings were listed twice; the trend compared coverage-row counts.
- Not in this phase: fix log (6), bug lifecycle and feedback (7.7), performance and metrics (7.9, 7.10), the `qa-memory` MCP server (5).

## 0.3.0 (Phase 3, unreleased)

- **Admin report** (`ADMIN-REPORT.md`), rendered from the same data as the technical report: release verdict first line (default rules from the
  spec), six-line summary, results by area (✅ ⚠️ ⛔), problems in plain language with where / what happens / who is affected / steps anyone can follow /
  what should happen / screenshot / status / ticket / feedback and one "For developers" link, trend against the last check, plain not-tested reasons,
  at most three next steps, and a plain explanation when the test environment is broken.
- **Consistency check** (`report check`, part of `report lint`): fails if the admin and technical reports disagree, if a Critical or Important problem
  is missing, anything is added, counts or the verdict contradict the findings, a problem block is incomplete, or jargon appears outside "For developers" lines.
- **HTML export** (`report export-html`): one self-contained file, screenshots embedded, no external resources, all text escaped.
- Findings need a `plain` block, not-tested entries a plain wording, coverage rows `ui` and `critical_flow`; `data/admin.json` holds the biggest risk and next steps.
  `run start` copies the critical journeys from the config. The technical report links each issue with an anchor and shows the key journey per coverage row.
- New shared guide `core/shared/admin-report.md` (how to write for non-technical readers). It was refined by the readability test: steps must be
  self-contained and in the right order, must not depend on data that only existed during the check, must not overstate what the screen shows, and must
  explain browser actions and specialist words.
- The admin report also carries a short glossary (severity words, "behind the screens"), a note about where to get test logins, and a one-line explanation
  of "behind the screens" problems, all added after a reader test found them missing.
- Evaluation: `scripts/eval-readability.ts` (a text-only reader and a browser-only novice replay that tries to follow each problem's steps on the live demo app);
  `scripts/eval-demo.ts` records admin-report results and, for a run that stalls, keeps its workspace and writes diagnostics.
- Example output in `docs/examples/ADMIN-REPORT.example.md` (kept equal to the golden test file).
- Spec section 16: README no longer lists credits (owner's decision).

## 0.2.0 (Phase 2, unreleased)

- **Knowledge base 0.1.0** (`core/knowledge/`): 18 topic files (test design, exploratory charters, forms, auth and sessions, permissions and data
  isolation, API testing, security smoke checks, accessibility, UI and layout, i18n and RTL including Urdu/Arabic, payments and money, file uploads,
  search/filter/pagination, notifications and email, bug reporting, debugging and root cause, fixing safely, flaky checks), a browser-testing guide,
  eight framework notes (React, Next.js, Vue, Laravel, Django, Rails, Express, ASP.NET Core), and `INDEX.md`. Written from 149 sources in our own
  words; every source is credited in `docs/KNOWLEDGE-SOURCES.md`.
- Knowledge 0.1.1: added "staleness across roles: warm, change, re-read" to `api-testing.md` (a gap found by the evaluation: nothing
  taught reading before the change, so cached lists were never caught); skill lists the knowledge to load for each pass.
- The skill and shared documents load knowledge on demand (INDEX at planning time, matching files per surface, framework note per detected framework).
- `full` mode may no longer leave areas out as "not covered in this pass" (that reason is for `quick` and `diff` only).
- Evaluation harness: `scripts/eval-demo.ts` (pinned settings, repetitions, saved records under `docs/baselines/`) and `scripts/eval-summary.ts`.
  Phase 1 baseline (3 runs, full mode) recorded.
- Knowledge checks in `tests/core/knowledge.test.ts` (size, structure, index, sources, no host or demo-specific content).

## 0.1.0 (Phase 1, unreleased)

- Core skeleton (`core/`, `hosts/claude/`, `cli/`) and a build that renders the Claude Code plugin into `plugins/qamind/`.
- `/qa-only` skill with shared workflow, safety, surfaces and reporting documents.
- First-run setup (config and credentials templates, `.gitignore`), config validation, production-URL rules.
- API testing from OpenAPI: inventory, generated baseline probe plan, deterministic runner with oracles, automatic
  reproduction, redacted evidence with curl reproductions.
- Browser testing through Playwright MCP behind a fail-closed guard proxy, with credentials kept out of the conversation.
- PreToolUse safety hook (report-only writes, no credential reads).
- Technical report rendered from structured run data; lint for the evidence rules.
- Per-page audit script (`window.__qamindAudit()`) injected into every browser page: unnamed controls, controls off-screen, covered
  elements, clipped text, RTL text in LTR boxes.
- Plan validation, write probes limited to run-created records, side-effect endpoints excluded from generated plans.
- Private per-user store (`$QAMIND_HOME`): project identity, stack, run summaries.
- `demo-app/` fixture with seeded bugs, a private answer key, and a run scorer.
- Knowledge base version: 0.0.0 (arrives in Phase 2).
