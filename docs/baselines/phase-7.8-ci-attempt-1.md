# CI end to end: phase-7.8

2026-11-03T06:25:40.150Z, Claude Code 2.1.314 (Claude Code). The real `qamind ci` with real headless Claude Code on a feature branch of the demo app, against a stand-in GitHub API. 2.48 minutes.

**Result: FAIL.** qamind ci could not check the change: the run changed the checkout, which a report-only run must never do (changed: .gitignore). Nothing was reverted: look at agent.log in the artifacts; tracked files changed in the checkout: M .gitignore; the CI store is not a fresh temporary folder: 

```json
{
  "result": {
    "outcome": "error",
    "exit_code": 2,
    "mode": "diff",
    "reasons": [
      "the run changed the checkout, which a report-only run must never do (changed: .gitignore). Nothing was reverted: look at agent.log in the artifacts"
    ],
    "comment": {
      "action": "created",
      "id": "101",
      "url": "https://github.com/acme/shop/pull/7#issuecomment-101"
    },
    "status": {
      "state": "error",
      "posted": true
    },
    "warnings": [
      "The base branch origin/main is not available (use fetch-depth: 0 in the checkout), so diff mode cannot tell what changed."
    ],
    "agent": {
      "exit_code": 0,
      "timed_out": false,
      "cost_usd": 0.8995895999999999,
      "minutes": 2.5
    },
    "error": "the run changed the checkout, which a report-only run must never do (changed: .gitignore). Nothing was reverted: look at agent.log in the artifacts"
  },
  "comments_on_the_pull_request": 1,
  "statuses": [
    "pending: QAMind is checking this change",
    "error: Could not check: the run changed the checkout, which a report-only run must neve"
  ],
  "files_with_a_secret": [],
  "store_is_fresh_temp_folder": false
}
```
