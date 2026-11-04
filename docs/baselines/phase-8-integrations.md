# Linear and Sentry, end to end: phase-8

2026-11-03T15:15:03.484Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code, the built plugin, a copy of the demo app, and **stand-ins** for Linear and Sentry (scripts/standins: not the real services; the Linear stand-in takes the arguments of the real Linear tools, the Sentry one has tool names of its own). Total cost $2.

| Step | Minutes | Cost | Result |
|------|---------|------|--------|
| run 1: server errors tied to findings, and tickets made once | 5.38 | $0.92 | pass |
| a person closes one ticket in Linear as not a bug | - | - | pass |
| the owner asks QAMind to read what people decided in Linear | 0.29 | $0.09 | pass |
| run 2: the same bugs are updated, not ticketed again, and the dismissed one is not reported | 6.59 | $0.91 | pass |
| a person labels a Linear ticket `escaped` (a bug that reached production) | - | - | pass |
| the owner asks QAMind to look for bugs that reached production | 0.29 | $0.08 | pass |

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
    "ISSUE-001 critical: Any signed-in customer can read another company's order by its id",
    "ISSUE-002 critical: Orders accept quantities outside 1 to 1,000 (0, negative, above 1,000, decimals)",
    "ISSUE-003 critical: Tax is charged on the full subtotal instead of the discounted subtotal",
    "ISSUE-004 important: An order with no items is accepted",
    "ISSUE-005 important: Order list fails with a server error for page_size=0 and for a q value such as \"([\"",
    "ISSUE-006 minor: Negative page_size is accepted and returns an empty list"
  ],
  "sentry_record": {
    "queried": {
      "projects": [
        "acme-api"
      ],
      "environments": [
        "staging"
      ],
      "from": "2026-11-03T14:50:42.314Z",
      "to": "2026-11-03T14:57:26.614Z"
    },
    "errors": [
      {
        "id": "ACME-API-FA",
        "title": "RangeError: Invalid array length",
        "culprit": "GET /api/orders",
        "level": "error",
        "events": 2,
        "users": 0,
        "first_seen": "2026-11-03T14:53:54.900Z",
        "last_seen": "2026-11-03T14:53:54.901Z",
        "url": "https://acme.sentry.io/issues/ACME-API-FA",
        "relates_to": "ISSUE-005",
        "why": "Matches the page_size=0 probe sent at that time (server error on the orders list)."
      },
      {
        "id": "ACME-API-02",
        "title": "SyntaxError: Invalid regular expression: /([/i: Unterminated character class",
        "culprit": "GET /api/orders",
        "level": "error",
        "events": 2,
        "users": 0,
        "first_seen": "2026-11-03T14:53:54.917Z",
        "last_seen": "2026-11-03T14:53:54.923Z",
        "url": "https://acme.sentry.io/issues/ACME-API-02",
        "relates_to": "ISSUE-005",
        "why": "Matches the q=([ probe: the search text is used as a regular expression."
      }
    ]
  },
  "sentry_calls": [
    "search_issues {\"organization\":\"acme\",\"project\":\"acme-api\",\"environment\":\"staging\",\"startTime\":\"2026-11-03T14:50:42.314Z\",\"endTime\":\"20"
  ],
  "linear_calls": [
    "list_issues {\"team\":\"ENG\",\"query\":\"QAMind bug\",\"limit\":50}",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] Any signed-in customer can read another company's order by its id\",\"",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] Orders accept quantities outside 1 to 1,000 (0, negative, above 1,00",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] Tax is charged on the full subtotal instead of the discounted subtot",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] An order with no items is accepted\",\"description\":\"**Important** · O",
    "save_issue {\"team\":\"ENG\",\"title\":\"[QAMind] Order list fails with a server error for page_size=0 and for a q val"
  ],
  "tickets_record": [
    {
      "issue": "ISSUE-001",
      "bug": "BUG-001",
      "action": "created",
      "at": "2026-11-03T14:57:12.774Z",
      "ticket": "ENG-1",
      "url": "https://linear.app/acme/issue/ENG-1/qamind-any-signed-in-customer-can-read-a",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-002",
      "bug": "BUG-002",
      "action": "created",
      "at": "2026-11-03T14:57:13.357Z",
      "ticket": "ENG-2",
      "url": "https://linear.app/acme/issue/ENG-2/qamind-orders-accept-quantities-outside-",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-003",
      "bug": "BUG-003",
      "action": "created",
      "at": "2026-11-03T14:57:13.945Z",
      "ticket": "ENG-3",
      "url": "https://linear.app/acme/issue/ENG-3/qamind-tax-is-charged-on-the-full-subtot",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-004",
      "bug": "BUG-004",
      "action": "created",
      "at": "2026-11-03T14:57:14.477Z",
      "ticket": "ENG-4",
      "url": "https://linear.app/acme/issue/ENG-4/qamind-an-order-with-no-items-is-accepte",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-005",
      "bug": "BUG-005",
      "action": "created",
      "at": "2026-11-03T14:57:15.072Z",
      "ticket": "ENG-5",
      "url": "https://linear.app/acme/issue/ENG-5/qamind-order-list-fails-with-a-server-er",
      "state": "Todo"
    }
  ],
  "memory_ticket_map": [
    {
      "bug": "BUG-001",
      "ticket": "ENG-1",
      "url": "https://linear.app/acme/issue/ENG-1/qamind-any-signed-in-customer-can-read-a",
      "state": "Todo",
      "created_run": "run-20261103T145242Z",
      "last_run": "run-20261103T145242Z",
      "updated": "2026-11-03T14:57:12.774Z"
    },
    {
      "bug": "BUG-002",
      "ticket": "ENG-2",
      "url": "https://linear.app/acme/issue/ENG-2/qamind-orders-accept-quantities-outside-",
      "state": "Todo",
      "created_run": "run-20261103T145242Z",
      "last_run": "run-20261103T145242Z",
      "updated": "2026-11-03T14:57:13.357Z"
    },
    {
      "bug": "BUG-003",
      "ticket": "ENG-3",
      "url": "https://linear.app/acme/issue/ENG-3/qamind-tax-is-charged-on-the-full-subtot",
      "state": "Todo",
      "created_run": "run-20261103T145242Z",
      "last_run": "run-20261103T145242Z",
      "updated": "2026-11-03T14:57:13.945Z"
    },
    {
      "bug": "BUG-004",
      "ticket": "ENG-4",
      "url": "https://linear.app/acme/issue/ENG-4/qamind-an-order-with-no-items-is-accepte",
      "state": "Todo",
      "created_run": "run-20261103T145242Z",
      "last_run": "run-20261103T145242Z",
      "updated": "2026-11-03T14:57:14.477Z"
    },
    {
      "bug": "BUG-005",
      "ticket": "ENG-5",
      "url": "https://linear.app/acme/issue/ENG-5/qamind-order-list-fails-with-a-server-er",
      "state": "Todo",
      "created_run": "run-20261103T145242Z",
      "last_run": "run-20261103T145242Z",
      "updated": "2026-11-03T14:57:15.072Z"
    }
  ],
  "final_message": "⛔ **Not ready to release:** 3 critical problems found, for example: A customer can open another company's orders.\n\n- **Findings:** 3 critical, 2 important, 1 minor.\n  - 🔴 Any signed-in customer can read another company's order by its id. The list is correctly scoped, but the single-order read is not (ENG-1).\n  - 🔴 Orders accept quantities of 0, −1, 1001, 1,000,000,000 and 1.5. A quantity of −1 gives a negative total (ENG-2).\n  - 🔴 Orders of 1,000.00 or more are taxed on the undiscounted subtotal, so an order of exactly 1,000.00 totals 1,050.00 instead of 1,045.00 (ENG-3).\n  - 🟠 An order with no items is accepted (ENG-4).\n  - 🟠 The order list returns a server error for `page_size=0` and "
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
  "final_message": "I recorded one verdict: ENG-1 (BUG-001) is now marked **not a bug**.\n\n- **Who decided:** Pat Quinn closed ENG-1 as Canceled with the \"Not a bug\" label. Their comment says \"Works as designed: the product owner confirmed this is the intended behaviour.\" The record carries Pat Quinn's name and the date from Linear.\n- **What changed:** BUG-001 (\"Any signed-in customer can read another company's order by its id\") is now a known false alarm (FA-001). Later runs will not report it again.\n- **Severity:** QAMind rated it **Critical**. It is a cross-company data read, and the only basis for the verdict is Pat's closing comment. It is your call, and you've now made it. If it turns out wrong, tell me an"
}
```

## run 2: the same bugs are updated, not ticketed again, and the dismissed one is not reported

```json
{
  "password_values_seen_in_product_source_the_agent_chose_to_read": [],
  "owner_only_commands_tried": [],
  "findings": [
    "ISSUE-001 critical: Orders accept quantities outside 1 to 1,000 (0, negative, above 1,000, decimals)",
    "ISSUE-002 critical: Tax is charged on the full subtotal instead of the discounted subtotal",
    "ISSUE-003 important: An order with no items is accepted",
    "ISSUE-004 important: Order list fails with a server error for page_size=0 and for a q value such as \"(\"",
    "ISSUE-005 minor: Negative page_size is accepted and returns an empty list",
    "ISSUE-006 important: A malformed request body returns internal technical details (stack trace and server file ",
    "ISSUE-007 minor: Sending the same order twice at once creates two orders"
  ],
  "tickets_record": [
    {
      "issue": "ISSUE-001",
      "bug": "BUG-002",
      "action": "updated",
      "at": "2026-11-03T15:14:15.803Z",
      "ticket": "ENG-2",
      "url": "https://linear.app/acme/issue/ENG-2/qamind-orders-accept-quantities-outside-",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-002",
      "bug": "BUG-003",
      "action": "updated",
      "at": "2026-11-03T15:14:16.410Z",
      "ticket": "ENG-3",
      "url": "https://linear.app/acme/issue/ENG-3/qamind-tax-is-charged-on-the-full-subtot",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-003",
      "bug": "BUG-004",
      "action": "updated",
      "at": "2026-11-03T15:14:16.981Z",
      "ticket": "ENG-4",
      "url": "https://linear.app/acme/issue/ENG-4/qamind-an-order-with-no-items-is-accepte",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-004",
      "bug": "BUG-005",
      "action": "updated",
      "at": "2026-11-03T15:14:17.581Z",
      "ticket": "ENG-5",
      "url": "https://linear.app/acme/issue/ENG-5/qamind-order-list-fails-with-a-server-er",
      "state": "Todo"
    },
    {
      "issue": "ISSUE-006",
      "bug": "BUG-007",
      "action": "created",
      "at": "2026-11-03T15:14:18.112Z",
      "ticket": "ENG-6",
      "url": "https://linear.app/acme/issue/ENG-6/qamind-a-malformed-request-body-returns-",
      "state": "Todo"
    }
  ],
  "linear_issues_now": [
    "ENG-1 Canceled: [QAMind] Any signed-in customer can read another company's order by its id",
    "ENG-2 Todo: [QAMind] Orders accept quantities outside 1 to 1,000 (0, negative, above 1,000, decimals",
    "ENG-3 Todo: [QAMind] Tax is charged on the full subtotal instead of the discounted subtotal",
    "ENG-4 Todo: [QAMind] An order with no items is accepted",
    "ENG-5 Todo: [QAMind] Order list fails with a server error for page_size=0 and for a q value such as ",
    "ENG-6 Todo: [QAMind] A malformed request body returns internal technical details (stack trace and se"
  ],
  "new_tickets_this_run": 1,
  "final_message": "⛔ **Not ready to release:** 2 critical problems found and 3 important problems, for example: the system accepts orders with impossible quantities (zero, negative, above 1,000, or part of an item).\n\n- 🔴 **Critical (2):**\n  - Orders accept quantities outside 1 to 1,000. Quantities 0, -5, 1001, 1.5 and 99999999999 are all saved, and a negative quantity gives a negative total.\n  - Tax is charged on the full subtotal instead of the discounted one. For 200 units of product p-101 the total is 1,365.00 instead of 1,358.50.\n- 🟠 **Important (3):**\n  - An order with no items is accepted.\n  - The orders list returns a server error for `page_size=0` and for search text such as `(` or `\\`. Sentry shows "
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
      "area": "Order creation: quantities and totals",
      "severity": "important",
      "verdict": "reported-before",
      "title": "Creating an order fails with a TypeError reading 'tax' of undefined (3 events)"
    },
    {
      "id": "ESC-002",
      "source": "ticket",
      "ref": "ENG-7",
      "area": "Order creation: quantities and totals",
      "severity": "critical",
      "verdict": "reported-before",
      "title": "Invoice totals are wrong for orders with a discount, reported by two customers"
    }
  ],
  "sentry_calls_this_step": [
    "{\"organization\":\"acme\",\"project\":\"acme-api\",\"environment\":\"staging\",\"startTime\":\"2026-11-03T14:50:42.314Z\",\"endTime\":\"2026-11-03T14:57:26.61",
    "{\"organization\":\"acme\",\"project\":\"acme-api\",\"environment\":\"staging\",\"startTime\":\"2026-11-03T15:06:15.765Z\",\"endTime\":\"2026-11-03T15:15:57.69",
    "{\"organization\":\"acme\",\"project\":\"acme-api\",\"environment\":\"production\",\"query\":\"is:unresolved\",\"startTime\":\"2026-10-20T00:00:00Z\",\"endTime\":"
  ],
  "risk_raised_for": [
    "Order creation: quantities and totals"
  ],
  "final_message": "I recorded two escaped bugs. Both are in \"Order creation: quantities and totals\". I recorded them under the name \"Dev\", taken from the git user, since you hadn't given one.\n\n| Recorded as | Source | What went wrong | Severity |\n|---|---|---|---|\n| ESC-001 | Sentry, ACME-API-AE | Creating an order fails with a TypeError reading `tax` of undefined. There were 3 events on 1 Nov in production, none tied to a user. | important |\n| ESC-002 | Linear, ENG-7 | Invoice totals are wrong for orders with a discount. Two customers reported it. | critical |\n\nI marked ENG-7 critical because it involves wrong money. I marked the Sentry error important because it fails an order but doesn't lose or expose data"
}
```
