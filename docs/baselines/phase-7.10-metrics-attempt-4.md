# Release verdict and agent metrics, end to end: phase-7.10

2026-11-03T09:29:35.448Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code, the built plugin, a copy of the demo app. Release rules: `{"max_critical":100,"max_important":0,"not_ready_when":["important"]}`. Total cost $1.02.

| Step | Minutes | Cost | Result |
|------|---------|------|--------|
| run 1: the verdict follows the project's rules, and the run is recorded | 2.28 | $0.55 | pass |
| bugs reach production: in areas run 1 tested, and in an area nobody covered | - | - | pass |
| run 2: the table, the escaped bug, and the same rules | 2.01 | $0.47 | FAIL: memory/metrics.json has 0 run(s), expected 2 |

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
      "important": 2,
      "minor": 0,
      "unconfirmed": 0
    },
    "coverage": {
      "journeys_tested": 1,
      "journeys_total": 5,
      "areas_tested": 3,
      "areas_partial": 0,
      "areas_not_tested": 0,
      "pages": 1,
      "endpoints": 0,
      "api_probes": 45
    },
    "areas": 3
  },
  "verdict_line": "⛔ **Not ready to release:** 2 important problems are open.",
  "areas_tested": [
    "Orders list: search and pagination",
    "Orders create: quantities",
    "Order read access across companies"
  ],
  "escaped_areas_chosen": [
    "Orders list: search and pagination",
    "Order read access across companies"
  ],
  "final_message": "⛔ **Not ready to release:** 2 important problems are open. The two critical findings also count against it.\n\n- **Counts:** 🔴 2 critical, 🟠 2 important, 🟡 0 minor.\n  - 🔴 A client can read another company's order by its id. Bright Foods and Zain Traders both read an Acme Traders order. The list hides it correctly, so only the detail endpoint is open.\n  - 🔴 Order quantities of 0, -1, 1001, 99999999999 and 1.5 are accepted, which breaks the 1–1000 whole-number rule.\n  - 🟠 An order with no items is accepted.\n  - 🟠 The orders list returns 500 for `page_size=0` and for `q=([`. `page_size=-5` r"
}
```

## bugs reach production: in areas run 1 tested, and in an area nobody covered

```json
{
  "run_1_findings_for_judging_the_placements": [
    "ISSUE-001: Orders / access / A client can read another company's order by its id",
    "ISSUE-002: Orders / create / Order quantities outside 1 to 1000, or with decimals, are accepted",
    "ISSUE-003: Orders / create / An order with no items is accepted",
    "ISSUE-004: Orders / list / Order list returns a server error for page_size=0 and for some search text"
  ],
  "escaped_add": {
    "in_tested_areas": [
      {
        "area": "Orders list: search and pagination",
        "id": "ESC-001",
        "already_recorded": false,
        "verdict": "reported-before",
        "what_the_runs_had_said": "a run had reported a problem in this area",
        "matched_area": "Orders list: search and pagination",
        "in_run": "run-20261103T092521Z",
        "findings_the_run_had_that_look_related": [
          "ISSUE-004"
        ],
        "risk": "The risk of \"Orders list: search and pagination\" is raised (important): the next runs look there first."
      },
      {
        "area": "Order read access across companies",
        "id": "ESC-002",
        "already_recorded": false,
        "verdict": "reported-before",
        "what_the_runs_had_said": "a run had reported a problem in this area",
        "matched_area": "Order read access across companies",
        "in_run": "run-20261103T092521Z",
        "findings_the_run_had_that_look_related": [
          "ISSUE-001"
        ],
        "risk": "The risk of \"Order read access across companies\" is raised (important): the next runs look there first."
      }
    ],
    "in_an_uncovered_area": {
      "id": "ESC-003",
      "already_recorded": false,
      "verdict": "never-covered",
      "what_the_runs_had_said": "no recent run covered this area",
      "risk": "The risk of \"Warehouse stock levels\" is raised (important): the next runs look there first."
    }
  },
  "risk_raised_for": [
    "Orders list: search and pagination",
    "Order read access across companies",
    "Warehouse stock levels"
  ]
}
```

## run 2: the table, the escaped bug, and the same rules

```json
{
  "password_values_seen_in_product_source_the_agent_chose_to_read": [],
  "owner_only_commands_tried": [],
  "final_message": "⛔ **Not ready to release:** 1 important problem is open.\n\n- **Findings:** 2 critical, 1 important, all still open from the last run. I reproduced each one twice, and the three saved bank checks (T-001 to T-003) failed twice as well.\n  - 🔴 A client can read another company's order by its id. A Bright Foods user got HTTP 200 for an Acme order.\n  - 🔴 Order quantities of 0, -1, 1001 and 1.5, and orders with no items, are accepted with HTTP 201.\n  - 🟠 The orders list returns HTTP 500 for `page_size=0` and for search text `([`. `page_size=-5` returned 200.\n- **Not tested:**\n  - **Screens:** skipp"
}
```
