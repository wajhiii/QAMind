# Release verdict and agent metrics, end to end: phase-7.10

2026-11-03T09:09:54.301Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code, the built plugin, a copy of the demo app. Release rules: `{"max_critical":100,"max_important":0,"not_ready_when":["important"]}`. Total cost $1.25.

| Step | Minutes | Cost | Result |
|------|---------|------|--------|
| run 1: the verdict follows the project's rules, and the run is recorded | 3.18 | $0.68 | FAIL: run 1 marked no area as tested without a finding, so there is nothing for an escaped bug to land in |
| a bug reaches production in an area run 1 marked as passing | - | - | FAIL: run 1 gave no area to use |
| run 2: the table, the escaped bug, and the same rules | 2.44 | $0.58 | FAIL: the section does not show the escaped bug as the agent's miss; the escaped bug is not listed; memory stats does not show 2 runs and 1 missed escaped bug |

## run 1: the verdict follows the project's rules, and the run is recorded

```json
{
  "password_values_seen_in_product_source_the_agent_chose_to_read": [],
  "owner_only_commands_tried": [],
  "rules_frozen_in_the_run": {
    "max_critical": 100,
    "max_important": 0,
    "allow_regressed": false,
    "not_ready_when": [
      "important"
    ]
  },
  "metric": {
    "verdict": "not-ready",
    "findings": {
      "critical": 2,
      "important": 4,
      "minor": 1,
      "unconfirmed": 1
    },
    "coverage": {
      "journeys_tested": 1,
      "journeys_total": 5,
      "areas_tested": 4,
      "areas_partial": 0,
      "areas_not_tested": 0,
      "pages": 0,
      "endpoints": 0,
      "api_probes": 122
    },
    "areas": 4
  },
  "verdict_line": "⛔ **Not ready to release:** 4 important problems are open.",
  "areas_marked_passing": [],
  "final_message": "⛔ **Not ready to release:** 4 important problems are open.\n\n- **Findings:** 7 in total, 2 of them 🔴 critical.\n  - 🔴 Any company can read another company's order by its id. bright-1 and zain-1 both got a full Acme order.\n  - 🔴 Client accounts can read the admin customers list.\n  - 🟠 Orders accept quantities of 0, -1, -5, 1.5, 1001 and 1,000,000,000. Text and null quantities are refused correctly.\n  - 🟠 Orders with no items are accepted.\n  - 🟠 `page_size=0`, and `q` values of `(` or a lone backslash, return HTTP 500.\n  - 🟠 Malformed JSON returns a stack trace and server file paths.\n  - 🟡"
}
```

## a bug reaches production in an area run 1 marked as passing

```json
{}
```

## run 2: the table, the escaped bug, and the same rules

```json
{
  "password_values_seen_in_product_source_the_agent_chose_to_read": [],
  "owner_only_commands_tried": [],
  "metric": {
    "verdict": "not-ready",
    "findings": {
      "critical": 2,
      "important": 3,
      "minor": 1,
      "unconfirmed": 0
    }
  },
  "verdict_line": "⛔ **Not ready to release:** 3 important problems are open.",
  "agent_performance_section": "## Agent performance\n\n_How the agent is doing on this project: from run records, people's verdicts and bugs that reached production (spec 13.16). Numbers that need data nobody has given yet are said to be unavailable._\n\n| Run | Mode | Verdict | 🔴 + 🟠 | 🟡 | Key journeys | Areas tested | Bank pass rate | Minutes | Cost |\n|---|---|---|---|---|---|---|---|---|---|\n| run-20261103T090423Z | quick | ⛔ Not ready | 6 | 1 | 1/5 | 4 | - | 2.9 | - |\n| **this run** | quick | ⛔ Not ready | 5 | 1 | 0/5 | 4 | 0% (0/2) | 2.3 | - |\n\n- **Precision:** not available yet. Nobody has given feedback on a finding yet.\n- **Escaped bugs:** none recorded.\n- _A trend needs at least 6 runs; this project has 2._\n- _No escaped bug is recorded. Record one with `qamind escaped add` (Sentry and ticket labels will do it by themselves in a later phase); until then this count cannot show a miss._\n",
  "context_names_the_escaped_area": true,
  "memory_stats_performance": {
    "total_runs": 2,
    "escaped": {
      "total": 0,
      "missed": 0,
      "reported_before": 0,
      "partly_checked": 0,
      "not_checked": 0,
      "never_covered": 0,
      "recent": []
    }
  },
  "final_message": "⛔ **Not ready to release:** 3 important problems are open.\n\n- **Findings:** 2 critical, 3 important, 1 minor. All six are bugs from the previous run that are still open. I reproduced each one twice.\n  - 🔴 Any company can read another company's order by id. Bright Foods and Zain Traders both opened an Acme order.\n  - 🔴 Clients can read the admin customers list.\n- **Orders API:**\n  - Creating an order accepts quantities of 0, -5, 1.5, 1001 and 1e9, and accepts an empty items list.\n  - Quantity 1000 is correctly accepted, and the text \"5\" is correctly refused.\n  - The list returns a server erro"
}
```
