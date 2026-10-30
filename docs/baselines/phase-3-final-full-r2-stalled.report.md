# QAMind Technical Report: run-20261030T083917Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T08:39:17.416Z |
| Project | ws (path-ws-b076d8d7bdb8) |
| Environment | local demo |
| Branch / commit | main @ 46f8012 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | in progress |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | run not finished |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (11 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **0**   🟠 Important: **0**   🟡 Minor: **0**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **0**

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the stated rule
- **Risk:** Money is calculated wrongly
- **Entry point:** POST /api/orders as a client (source: openapi.yaml)
- **Expected results:** total = subtotal - 5% discount (>= 1000.00) + 10% tax on discounted; quantity 1..1000 whole; at least one item
- **Exit condition:** Both sides of the 1000.00 threshold, quantity edges, empty items, wrong types checked

### C2: Order status lifecycle  `api`

- **Goal:** Only legal status moves, admin only
- **Risk:** Illegal transitions or client changing status
- **Entry point:** PATCH /api/admin/orders/{id}/status
- **Expected results:** placed>processing>shipped>delivered, cancel from placed/processing; others 409; clients 403
- **Exit condition:** Every allowed and refused transition tried on QA- orders

### C3: Role and tenant isolation  `permissions`

- **Goal:** Clients see only own company; admin endpoints admin only
- **Risk:** Data exposure between companies
- **Entry point:** GET /orders, /orders/{id}, /admin/* as each role
- **Expected results:** Other company's order 404; admin endpoints 403 for clients
- **Exit condition:** Role matrix and Acme vs Bright chains checked, list and search too

### C4: Sessions, sign-out, login  `api`

- **Goal:** Logout revokes token; bad logins refused without leaking
- **Risk:** Session stays valid
- **Entry point:** POST /auth/login, /auth/logout, GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Logout chain and invalid login cases checked

### C5: Lists, search, pagination  `api`

- **Goal:** Filters and paging behave per spec
- **Risk:** Skipped or repeated items, 500 on odd input
- **Entry point:** GET /orders?page&page_size&status&q
- **Expected results:** Bounds honoured, 400 on invalid
- **Exit condition:** Edge values and search special characters checked

### C6: Client Portal critical flow 1,3,5  `ui`

- **Goal:** Client places an order, sees total, finds it, sees new status, signs out
- **Risk:** Wrong totals shown, stale status
- **Entry point:** http://127.0.0.1:4102 as acme-1, desktop and mobile
- **Expected results:** UI total equals my own arithmetic; status updates after reload
- **Exit condition:** All pages, forms, case types, audit run on desktop and mobile; Urdu tenant RTL checked

### C7: Admin Portal critical flow 2,4  `ui`

- **Goal:** Admin finds order, moves status, reads reports and customers
- **Risk:** Wrong figures, client can reach admin pages
- **Entry point:** http://127.0.0.1:4101 as admin
- **Expected results:** Status moves reflected; report figures agree with orders
- **Exit condition:** All pages audited desktop and mobile

### C8: Warm, change, re-read and report totals  `cross`

- **Goal:** Changes visible at once across roles and reports
- **Risk:** Stale data
- **Entry point:** Client reads order, admin changes, client re-reads; report totals vs orders
- **Expected results:** Immediate
- **Exit condition:** Done for status and report totals

### C9: Password reset  `api`

- **Goal:** Reset flow works safely
- **Risk:** Account enumeration, real emails
- **Entry point:** POST /auth/forgot-password, /reset-password
- **Expected results:** 202 for any well-formed email
- **Exit condition:** Config says demo mails only go to a local catcher; side-effect probes judged on that

## Findings

_No confirmed findings._

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

_No coverage recorded._

## Not tested

_Nothing here is reported as passing._

_Everything planned was tested._

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

_None._

