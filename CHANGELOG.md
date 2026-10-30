# Changelog

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
