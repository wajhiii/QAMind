# Release verdict and agent metrics, end to end: phase-7.10

2026-11-03T09:42:05.202Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code, the built plugin, a copy of the demo app. Release rules: `{"max_critical":100,"max_important":0,"not_ready_when":["important"]}`. Total cost $1.33.

| Step | Minutes | Cost | Result |
|------|---------|------|--------|
| run 1: the verdict follows the project's rules, and the run is recorded | 3.03 | $0.78 | pass |
| bugs reach production: in areas run 1 tested, and in an area nobody covered | - | - | pass |
| run 2: the table, the escaped bug, and the same rules | 2.65 | $0.55 | pass |

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
      "critical": 3,
      "important": 2,
      "minor": 0,
      "unconfirmed": 1
    },
    "coverage": {
      "journeys_tested": 0,
      "journeys_total": 5,
      "areas_tested": 4,
      "areas_partial": 0,
      "areas_not_tested": 5,
      "pages": 1,
      "endpoints": 0,
      "api_probes": 103
    },
    "areas": 9
  },
  "verdict_line": "⛔ **Not ready to release:** 2 important problems are open.",
  "areas_tested": [
    "Orders list: search, status filter, pagination",
    "Orders list isolation between companies",
    "Create order: quantities and totals",
    "Read one order by role and company"
  ],
  "escaped_areas_chosen": [
    "Orders list: search, status filter, pagination",
    "Read one order by role and company"
  ],
  "final_message": "⛔ **Not ready to release:** 2 important problems are open. The orders API has 3 critical and 2 important findings, each reproduced twice.\n\n- **🔴 Critical:**\n  - Any signed-in customer can read another company's order by its id. Bright Foods and Zain Traders both read an Acme Traders order. The orders list is correctly scoped; only the lookup by id is not.\n  - Tax is charged on the undiscounted subtotal. An order of exactly 1,000.00 totals 1,050.00 instead of 1,045.00.\n  - Quantities of 0, -5, 1001 and 1.5, and an empty item list, are all accepted. A quantity of -5 gives a negative total.\n- **"
}
```

## bugs reach production: in areas run 1 tested, and in an area nobody covered

```json
{
  "run_1_findings_for_judging_the_placements": [
    "ISSUE-001: Orders / access / Any signed-in customer can read another company's order",
    "ISSUE-002: Orders / totals / Order total charges tax on the undiscounted amount",
    "ISSUE-003: Orders / validation / Orders with zero, negative, over-limit or fractional quantities, or no items, are accep",
    "ISSUE-004: Orders / list / Orders list crashes on page_size=0 and search text containing ( or \\",
    "ISSUE-005: Error handling / Malformed requests return internal technical details"
  ],
  "escaped_add": {
    "in_tested_areas": [
      {
        "area": "Orders list: search, status filter, pagination",
        "id": "ESC-001",
        "already_recorded": false,
        "verdict": "reported-before",
        "what_the_runs_had_said": "a run had reported a problem in this area",
        "matched_area": "Orders list: search, status filter, pagination",
        "in_run": "run-20261103T093628Z",
        "findings_the_run_had_that_look_related": [
          "ISSUE-004"
        ],
        "risk": "The risk of \"Orders list: search, status filter, pagination\" is raised (important): the next runs look there first."
      },
      {
        "area": "Read one order by role and company",
        "id": "ESC-002",
        "already_recorded": false,
        "verdict": "reported-before",
        "what_the_runs_had_said": "a run had reported a problem in this area",
        "matched_area": "Read one order by role and company",
        "in_run": "run-20261103T093628Z",
        "findings_the_run_had_that_look_related": [
          "ISSUE-001"
        ],
        "risk": "The risk of \"Read one order by role and company\" is raised (important): the next runs look there first."
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
    "Orders list: search, status filter, pagination",
    "Read one order by role and company",
    "Warehouse stock levels"
  ]
}
```

## run 2: the table, the escaped bug, and the same rules

```json
{
  "password_values_seen_in_product_source_the_agent_chose_to_read": [],
  "owner_only_commands_tried": [],
  "metric": {
    "verdict": "not-ready",
    "findings": {
      "critical": 3,
      "important": 1,
      "minor": 0,
      "unconfirmed": 0
    }
  },
  "verdict_line": "⛔ **Not ready to release:** 1 important problem is open.",
  "agent_performance_section": "## Agent performance\n\n_How the agent is doing on this project: from run records, people's verdicts and bugs that reached production (spec 13.16). Numbers that need data nobody has given yet are said to be unavailable._\n\n| Run | Mode | Verdict | 🔴 + 🟠 | 🟡 | Key journeys | Areas tested | Bank pass rate | Minutes | Cost |\n|---|---|---|---|---|---|---|---|---|---|\n| run-20261103T093628Z | quick | ⛔ Not ready | 5 | 0 | 0/5 | 4 | - | 2.9 | - |\n| **this run** | quick | ⛔ Not ready | 4 | 0 | 2/5 | 3 | 0% (0/3) | 2.4 | - |\n\n- **Precision:** not available yet. Nobody has given feedback on a finding yet.\n- **Escaped bugs:** 3 recorded: 2 in an area where a problem had been reported; 1 in an area no recent run covered.\n  - ESC-003 (important, 2026-11-03) Stock counts go negative after a return in production — Warehouse stock levels: no recent run covered this area\n  - ESC-002 (important, 2026-11-03) Production users see wrong results here since last week (2) — Read one order by role and company: a run had reported a problem in this area (Read one order by role and company in run-20261103T093628Z)\n  - ESC-001 (important, 2026-11-03) Production users see wrong results here since last week (1) — Orders list: search, status filter, pagination: a run had reported a problem in this area (Orders list: search, status filter, pagination in run-20261103T093628Z)\n- _A trend needs at least 6 runs; this project has 2._\n",
  "context_names_the_escaped_areas": [
    "Orders list: search, status filter, pagination",
    "Read one order by role and company"
  ],
  "memory_stats_performance": {
    "total_runs": 2,
    "escaped": {
      "total": 3,
      "missed": 0,
      "reported_before": 2,
      "partly_checked": 0,
      "not_checked": 0,
      "never_covered": 1,
      "recent": [
        {
          "id": "ESC-003",
          "area": "Warehouse stock levels",
          "title": "Stock counts go negative after a return in production",
          "severity": "important",
          "source": "manual",
          "ref": "OPS-49",
          "recorded": "2026-11-03T09:39:25.279Z",
          "by": "Pat Quinn",
          "verdict": "never-covered"
        },
        {
          "id": "ESC-002",
          "area": "Read one order by role and company",
          "title": "Production users see wrong results here since last week (2)",
          "severity": "important",
          "source": "manual",
          "ref": "OPS-41",
          "recorded": "2026-11-03T09:39:25.163Z",
          "by": "Pat Quinn",
          "verdict": "reported-before",
          "matched": {
            "run_id": "run-20261103T093628Z",
            "finished": "2026-11-03T09:39:18.991Z",
            "area": "Read one order by role and company",
            "status": "tested",
            "findings": [
              "ISSUE-001"
            ]
          }
        },
        {
          "id": "ESC-001",
          "area": "Orders list: search, status filter, pagination",
          "title": "Production users see wrong results here since last week (1)",
          "severity": "important",
          "source": "manual",
          "ref": "OPS-40",
          "recorded": "2026-11-03T09:39:25.059Z",
          "by": "Pat Quinn",
          "verdict": "reported-before",
          "matched": {
            "run_id": "run-20261103T093628Z",
            "finished": "2026-11-03T09:39:18.991Z",
            "area": "Orders list: search, status filter, pagination",
            "status": "tested",
            "findings": [
              "ISSUE-004"
            ]
          }
        }
      ]
    }
  },
  "final_message": "⛔ **Not ready to release:** 1 important problem is open.\n\n- **Critical (3), all still open from the last run:**\n  - Any signed-in customer can read another company's order. A customer of a different company got the full order, twice.\n  - Tax is worked out on the price before the 5% discount. An order of 80 × 12.50 comes to 1,050.00 instead of 1,045.00.\n  - Quantities of 0, -1, 1001 and 1.5, and an empty item list, are all accepted. A quantity of -1 gives a total of -7.15.\n- **Important (1):** the orders list returns a server error for `page_size=0` and for search text containing `(`, `[` or a "
}
```
