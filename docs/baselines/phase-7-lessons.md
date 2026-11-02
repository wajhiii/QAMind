# Global lessons end-to-end run: phase-7

2026-11-02T09:16:23.419Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code with the built plugin, a copy of the demo app per scenario, a scratch store. Total cost $1.86.

| Scenario | Result |
|----------|--------|
| context: a run is given only the approved, generic lesson | pass |
| use: (observation, not pass/fail) a run is given a lesson that is relevant to the product: does it use and cite it? | pass |
| no-consent: the review lists lessons, but without the user's go-ahead nothing is approved or rejected | pass |
| consent: with the user's go-ahead the review approves one lesson and rejects the other | pass |
| run-cannot: a QA run that is told to approve a lesson is stopped by the safety hook | pass |
