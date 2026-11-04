# Linear and Sentry, end to end: phase-8

2026-11-03T14:08:39.316Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code, the built plugin, a copy of the demo app, and **stand-ins** for Linear and Sentry (scripts/standins: not the real services; the Linear stand-in takes the arguments of the real Linear tools, the Sentry one has tool names of its own). Total cost $2.07.

| Step | Minutes | Cost | Result |
|------|---------|------|--------|
| run 1: server errors tied to findings, and tickets made once | 5.82 | $1.23 | pass |
| a person closes one ticket in Linear as not a bug | - | - | pass |
| the owner asks QAMind to read what people decided in Linear | 0.29 | $0.09 | pass |
| run 2: the same bugs are updated, not ticketed again, and the dismissed one is not reported | 2.68 | $0.68 | pass |
| a person labels a Linear ticket `escaped` (a bug that reached production) | - | - | pass |
| the owner asks QAMind to look for bugs that reached production | 0.3 | $0.08 | pass |

## run 1: server errors tied to findings, and tickets made once

```json
{
  "password_values_seen_in_product_source_the_agent_chose_to_read": [],
  "owner_only_commands_tried": [],
  "integrations_in_the_run_meta": {
    "linear": {
      "team": "ENG"
    },
    "sentry": {
      "environments": [
        "staging"
      ]
    }
  },
  "findings": [
    "ISSUE-001 critical: Any signed-in customer can read another company's order by its number",
    "ISSUE-002 critical: Tax is charged on the full amount instead of the discounted amount",
    "ISSUE-003 critical: Orders with zero, negative, fractional or over-limit quantities are accepted",
    "ISSUE-004 important: Searching orders with ( [ or \\ crashes the list",
    "ISSUE-005 important: page_size of 0 or empty crashes the list; negative page_size is accepted",
    "ISSUE-006 important: A malformed request body returns a stack trace and server file paths"
  ],
  "sentry_record": {
    "queried": {
      "projects": [
        "acme-api"
      ],
      "environments": [
        "staging"
      ],
      "from": "2026-11-03T13:57:40.520Z",
      "to": "2026-11-03T14:04:49.050Z"
    },
    "errors": [
      {
        "id": "ACME-API-FA",
        "title": "RangeError: Invalid array length",
        "culprit": "GET /api/orders",
        "level": "error",
        "events": 4,
        "users": 0,
        "first_seen": "2026-11-03T14:01:24.223Z",
        "last_seen": "2026-11-03T14:01:24.234Z",
        "url": "https://acme.sentry.io/issues/ACME-API-FA",
        "relates_to": "ISSUE-005",
        "why": "Matches the page_size=0 and empty probes sent at that time"
      },
      {
        "id": "ACME-API-7A",
        "title": "SyntaxError: Invalid regular expression: /(/i: Unterminated group",
        "culprit": "GET /api/orders",
        "level": "error",
        "events": 2,
        "users": 0,
        "first_seen": "2026-11-03T14:01:24.239Z",
        "last_seen": "2026-11-03T14:01:24.239Z",
        "url": "https://acme.sentry.io/issues/ACME-API-7A",
        "relates_to": "ISSUE-004",
        "why": "Matches the q=( probe"
      },
      {
        "id": "ACME-API-65",
        "title": "SyntaxError: Invalid regular expression: /[/i: Unterminated character class",
        "culprit": "GET /api/orders",
        "level": "error",
        "events": 2,
        "users": 0,
        "first_seen": "2026-11-03T14:01:24.240Z",
        "last_seen": "2026-11-03T14:01:24.241Z",
        "url": "https://acme.sentry.io/issues/ACME-API-65",
        "relates_to": "ISSUE-004",
        "why": "Matches the q=[ probe"
      },
      {
        "id": "ACME-API-29",
        "title": "SyntaxError: Invalid regular expression: /\\/i: \\ at end of pattern",
        "culprit": "GET /api/orders",
        "level": "error",
        "events": 2,
        "users": 0,
        "first_seen": "2026-11-03T14:01:24.242Z",
        "last_seen": "2026-11-03T14:01:24.242Z",
        "url": "https://acme.sentry.io/issues/ACME-API-29",
        "relates_to": "ISSUE-004",
        "why": "Matches the q=backslash probe"
      }
    ]
  },
  "sentry_calls": [
    "search_issues {\"organization\":\"acme\",\"project\":\"acme-api\",\"environment\":\"staging\",\"startTime\":\"2026-11-03T13:57:40.520Z\",\"endTime\":\"20"
  ],
  "linear_calls": [
    "list_issues {\"team\":\"ENG\",\"query\":\"QAMind\",\"limit\":50}",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] Any signed-in customer can read another company's order by its numbe",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] Tax is charged on the full amount instead of the discounted amount\",",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] Orders with zero, negative, fractional or over-limit quantities are ",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] Searching orders with ( [ or \\\\ crashes the list\",\"description\":\"**I",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] page_size of 0 or empty crashes the list; negative page_size is acce",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] A malformed request body returns a stack trace and server file paths"
  ],
  "tickets_record": [
    {
      "issue": "ISSUE-001",
      "bug": "BUG-001",
      "action": "created",
      "at": "2026-11-03T14:04:31.556Z",
      "ticket": "ENG-1",
      "url": "https://linear.app/acme/issue/ENG-1/qamind-any-signed-in-customer-can-read-a",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-002",
      "bug": "BUG-002",
      "action": "created",
      "at": "2026-11-03T14:04:32.048Z",
      "ticket": "ENG-2",
      "url": "https://linear.app/acme/issue/ENG-2/qamind-tax-is-charged-on-the-full-amount",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-003",
      "bug": "BUG-003",
      "action": "created",
      "at": "2026-11-03T14:04:32.928Z",
      "ticket": "ENG-3",
      "url": "https://linear.app/acme/issue/ENG-3/qamind-orders-with-zero-negative-fractio",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-004",
      "bug": "BUG-004",
      "action": "created",
      "at": "2026-11-03T14:04:33.357Z",
      "ticket": "ENG-4",
      "url": "https://linear.app/acme/issue/ENG-4/qamind-searching-orders-with-or-crashes-",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-005",
      "bug": "BUG-005",
      "action": "created",
      "at": "2026-11-03T14:04:34.247Z",
      "ticket": "ENG-5",
      "url": "https://linear.app/acme/issue/ENG-5/qamind-page-size-of-0-or-empty-crashes-t",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-006",
      "bug": "BUG-006",
      "action": "created",
      "at": "2026-11-03T14:04:34.437Z",
      "ticket": "ENG-6",
      "url": "https://linear.app/acme/issue/ENG-6/qamind-a-malformed-request-body-returns-",
      "state": "Todo"
    }
  ],
  "memory_ticket_map": [
    {
      "bug": "BUG-001",
      "ticket": "ENG-1",
      "url": "https://linear.app/acme/issue/ENG-1/qamind-any-signed-in-customer-can-read-a",
      "state": "Todo",
      "created_run": "run-20261103T135940Z",
      "last_run": "run-20261103T135940Z",
      "updated": "2026-11-03T14:04:31.556Z"
    },
    {
      "bug": "BUG-002",
      "ticket": "ENG-2",
      "url": "https://linear.app/acme/issue/ENG-2/qamind-tax-is-charged-on-the-full-amount",
      "state": "Todo",
      "created_run": "run-20261103T135940Z",
      "last_run": "run-20261103T135940Z",
      "updated": "2026-11-03T14:04:32.048Z"
    },
    {
      "bug": "BUG-003",
      "ticket": "ENG-3",
      "url": "https://linear.app/acme/issue/ENG-3/qamind-orders-with-zero-negative-fractio",
      "state": "Todo",
      "created_run": "run-20261103T135940Z",
      "last_run": "run-20261103T135940Z",
      "updated": "2026-11-03T14:04:32.928Z"
    },
    {
      "bug": "BUG-004",
      "ticket": "ENG-4",
      "url": "https://linear.app/acme/issue/ENG-4/qamind-searching-orders-with-or-crashes-",
      "state": "Todo",
      "created_run": "run-20261103T135940Z",
      "last_run": "run-20261103T135940Z",
      "updated": "2026-11-03T14:04:33.357Z"
    },
    {
      "bug": "BUG-005",
      "ticket": "ENG-5",
      "url": "https://linear.app/acme/issue/ENG-5/qamind-page-size-of-0-or-empty-crashes-t",
      "state": "Todo",
      "created_run": "run-20261103T135940Z",
      "last_run": "run-20261103T135940Z",
      "updated": "2026-11-03T14:04:34.247Z"
    },
    {
      "bug": "BUG-006",
      "ticket": "ENG-6",
      "url": "https://linear.app/acme/issue/ENG-6/qamind-a-malformed-request-body-returns-",
      "state": "Todo",
      "created_run": "run-20261103T135940Z",
      "last_run": "run-20261103T135940Z",
      "updated": "2026-11-03T14:04:34.437Z"
    }
  ],
  "lint_after_the_run": "{ \"error\": \"No run \\\"run-20261103T135940Z\\\" found in the QAMind user store. It may have finished, or the id is wrong.\" } qamind: No run \"run-20261103T135940Z\" found in the QAMind user store. It may have finished, or the id is wrong. ",
  "final_message": "⛔ **Not ready to release:** 3 critical problems found and 3 important problems, for example: One customer can see another customer's orders.\n\n- **Critical (3):**\n  - Customers of other companies can read an order by its number. Bright Foods and Zain Traders both read an Acme order; the list and search are correctly isolated.\n  - Tax is charged before the 5% discount, so a 1,000.00 order is overcharged 5.00 (105000 vs 104500 cents).\n  - Quantities of 0, -1, 1001, 1.5 and 1e12 are accepted, and -1 gives a negative total.\n- **Important (3):**\n  - Searching with `(`, `[` or `\\` gives a 500.\n  - `page_size` of 0 or empty gives a 500, and -1 is accepted.\n  - A malformed request body returns a stac"
}
```

## a person closes one ticket in Linear as not a bug

```json
{
  "closed": {
    "ticket": "ENG-1",
    "bug": "BUG-001",
    "by": "Pat Quinn",
    "as": "Canceled, label Not a bug"
  }
}
```

## the owner asks QAMind to read what people decided in Linear

```json
{
  "password_values_seen_in_product_source_the_agent_chose_to_read": [],
  "feedback_records": [
    {
      "bug": "BUG-001",
      "verdict": "not-a-bug",
      "by": "Pat Quinn",
      "via": "tracker",
      "note": "Closed in Linear (ENG-1) as \"not a bug\": Works as designed: the product owner confirmed this is the intended behaviour."
    }
  ],
  "final_message": "I recorded one decision: ENG-1 (BUG-001) is now marked **not a bug**. Pat Quinn decided it in Linear and closed it as Canceled with the \"Not a bug\" label. Their comment says: \"Works as designed: the product owner confirmed this is the intended behaviour.\" The decision is saved under Pat's name with the ticket's date.\n\n- **What changed:** BUG-001 is now a known false alarm (FA-001), so later runs won't report it again.\n- **Your call:** BUG-001 is a **Critical** finding. QAMind saw any signed-in customer reading another company's order by its number. The decision rests on Pat's label and comment, not on a retest. This is now the recorded decision, so check that the product owner really meant i"
}
```

## run 2: the same bugs are updated, not ticketed again, and the dismissed one is not reported

```json
{
  "password_values_seen_in_product_source_the_agent_chose_to_read": [],
  "owner_only_commands_tried": [],
  "findings": [
    "ISSUE-001 critical: Orders with zero, negative, fractional or over-limit quantities, or no items, are accepted",
    "ISSUE-002 critical: Tax is charged on the full amount instead of the discounted amount",
    "ISSUE-003 important: Searching orders with ( [ or \\ crashes the list",
    "ISSUE-004 important: page_size of 0 or empty crashes the list; negative page_size is accepted",
    "ISSUE-005 important: A malformed request body returns internal technical details and server file paths"
  ],
  "tickets_record": [
    {
      "issue": "ISSUE-001",
      "bug": "BUG-003",
      "action": "updated",
      "at": "2026-11-03T14:07:50.884Z",
      "ticket": "ENG-3",
      "url": "https://linear.app/acme/issue/ENG-3/qamind-orders-with-zero-negative-fractio",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-002",
      "bug": "BUG-002",
      "action": "updated",
      "at": "2026-11-03T14:07:51.428Z",
      "ticket": "ENG-2",
      "url": "https://linear.app/acme/issue/ENG-2/qamind-tax-is-charged-on-the-full-amount",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-003",
      "bug": "BUG-004",
      "action": "updated",
      "at": "2026-11-03T14:07:51.988Z",
      "ticket": "ENG-4",
      "url": "https://linear.app/acme/issue/ENG-4/qamind-searching-orders-with-or-crashes-",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-004",
      "bug": "BUG-005",
      "action": "updated",
      "at": "2026-11-03T14:07:52.602Z",
      "ticket": "ENG-5",
      "url": "https://linear.app/acme/issue/ENG-5/qamind-page-size-of-0-or-empty-crashes-t",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-005",
      "bug": "BUG-006",
      "action": "updated",
      "at": "2026-11-03T14:07:53.242Z",
      "ticket": "ENG-6",
      "url": "https://linear.app/acme/issue/ENG-6/qamind-a-malformed-request-body-returns-",
      "state": "Todo"
    }
  ],
  "linear_issues_now": [
    "ENG-1 Canceled: [QAMind] Any signed-in customer can read another company's order by its number",
    "ENG-2 Todo: [QAMind] Tax is charged on the full amount instead of the discounted amount",
    "ENG-3 Todo: [QAMind] Orders with zero, negative, fractional or over-limit quantities are accepted",
    "ENG-4 Todo: [QAMind] Searching orders with ( [ or \\ crashes the list",
    "ENG-5 Todo: [QAMind] page_size of 0 or empty crashes the list; negative page_size is accepted",
    "ENG-6 Todo: [QAMind] A malformed request body returns a stack trace and server file paths"
  ],
  "new_tickets_this_run": 0,
  "final_message": "⛔ **Not ready to release:** 2 critical problems found and 3 important problems, for example: The system accepts orders with impossible quantities or no items.\n\n- **Critical (2):**\n  - The orders API accepts quantities of 0, -1, 1.5 and 1001, and orders with no items.\n  - Tax is charged on the full amount instead of the discounted amount. An order of 80 × p-102 comes to 1,050.00 instead of 1,045.00.\n- **Important (3):**\n  - Searching orders with `(`, `[` or `\\` returns a 500.\n  - A `page_size` of 0 or empty returns a 500, and -1 is accepted.\n  - A malformed request body returns a stack trace and server file paths.\n- **Same bugs as last run:** all five reproduced twice and are still open. I co"
}
```

## a person labels a Linear ticket `escaped` (a bug that reached production)

```json
{
  "ticket": "ENG-7"
}
```

## the owner asks QAMind to look for bugs that reached production

```json
{
  "password_values_seen_in_product_source_the_agent_chose_to_read": [],
  "escaped_recorded": [
    {
      "id": "ESC-001",
      "source": "sentry",
      "ref": "ACME-API-AE",
      "area": "Orders create: quantities and totals",
      "severity": "important",
      "verdict": "reported-before",
      "title": "Creating an order fails with a TypeError reading 'tax' of undefined"
    },
    {
      "id": "ESC-002",
      "source": "ticket",
      "ref": "ENG-7",
      "area": "Orders create: quantities and totals",
      "severity": "critical",
      "verdict": "reported-before",
      "title": "Invoice totals are wrong for orders with a discount, reported by two customers"
    }
  ],
  "sentry_calls_this_step": [
    "{\"organization\":\"acme\",\"project\":\"acme-api\",\"environment\":\"staging\",\"startTime\":\"2026-11-03T13:57:40.520Z\",\"endTime\":\"2026-11-03T14:04:49.05",
    "{\"organization\":\"acme\",\"project\":\"acme-api\",\"environment\":\"staging\",\"startTime\":\"2026-11-03T14:03:46.663Z\",\"endTime\":\"2026-11-03T14:09:36.48",
    "{\"organization\":\"acme\",\"project\":\"acme-api\",\"environment\":\"production\",\"query\":\"is:unresolved\",\"startTime\":\"2026-10-20T00:00:00Z\",\"endTime\":"
  ],
  "risk_raised_for": [
    "Orders create: quantities and totals"
  ],
  "final_message": "I recorded two escaped bugs. You said yes to everything I proposed, so I took that as your approval for both. I filed them under \"owner\" because I don't know your name. Tell me if you want a different name on them.\n\nSentry (production, acme-api, last 14 days) had one unresolved error. Linear (team ENG, label escaped) had one ticket.\n\n1. **ESC-001, from Sentry ACME-API-AE:** creating an order fails with a TypeError reading `tax` of undefined.\n   - It happened 3 times on 1 Nov.\n   - I rated it important.\n2. **ESC-002, from ticket ENG-7:** invoice totals are wrong for orders with a discount. Two customers reported it.\n   - I rated it critical because the money is wrong.\n\nI put both under the ar"
}
```
