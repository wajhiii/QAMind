# Reliability end-to-end run: phase-7.6

2026-11-02T10:58:26.193Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code, the built plugin, a copy of the demo app per scenario. Total cost $1.83.

| Scenario | Minutes | Cost | Result |
|----------|---------|------|--------|
| broken-env: the demo app is not running: an Environment problem, no findings, no testing on top of it | 0.98 | $0.24 | pass |
| budget: a one-minute budget on a full run: the run stops exploring, says so, and still finishes its report | 1.91 | $0.46 | FAIL: nothing is listed as Not tested with the reason 'time budget reached' |
| privacy-ui: a screenshot of a page with personal data goes through the browser tool's in-page blur; nothing seeded reaches the run folder or the store | 0.99 | $0.28 | FAIL: the run never finished |
| privacy-memory: an old (format 1) store migrates with a backup and is used; the reset runs first; no seeded personal value reaches the run's output | 4.01 | $0.85 | pass |
