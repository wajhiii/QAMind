# Auto-QA end-to-end run: phase-6.5

2026-11-02T08:12:51.809Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code with the built plugin, a copy of the demo app per scenario. Total cost $0.81.

| Scenario | Expected QA runs | Found | Skill invoked | Result |
|----------|------------------|-------|---------------|--------|
| on-change: auto on, code change: exactly one QA run follows | 1 | 1 | 1 | pass |
| noqa: auto on, code change with #noqa: no QA run | 0 | 0 | 0 | pass |
| off: auto never turned on (the default), code change: no QA run | 0 | 0 | 0 | pass |
| tag-qa: auto off, code change with #qa: exactly one QA run | 1 | 1 | 1 | pass |
| off-next: auto on, then /qa-auto off, then a code change in the same session: no QA run | 0 | 0 | 0 | pass |
