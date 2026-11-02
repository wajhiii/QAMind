# QAMind Technical Report: run-20261102T071050Z

| | |
|---|---|
| Date (UTC) | 2026-11-02T07:10:50.526Z |
| Project | ws (path-ws-e99eb4e4989c) |
| Environment | local demo |
| Branch / commit | feature/qa-eval @ 1ad6f87 |
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
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (12 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **3**   🟡 Minor: **1**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **5**
- API probes executed: **26** (21 produced a signal worth a look)

## What changed since the last run

_First run for this project: there is nothing to compare with yet._

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Key journeys tested | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 3 | 1 | 0 | 2/5 | 7 | 2 | 5 |

_No earlier run to compare with._

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and priced by the stated rules
- **Risk:** Money wrong; invalid quantities accepted
- **Entry point:** POST /api/orders as a client
- **Expected results:** Quantity 1-1000 whole numbers, at least one item; total = subtotal - 5% discount (>=1000.00) + 10% tax on discounted subtotal
- **Exit condition:** Boundaries around 1000.00 and quantity limits checked

### C2: Tenant and role isolation  `permissions`

- **Goal:** Clients see only their company's data; only admins use admin endpoints
- **Risk:** Data exposure
- **Entry point:** GET /api/orders/{id}, /admin/customers, /admin/reports/sales as clients
- **Expected results:** 403/404 for other tenants and non-admins
- **Exit condition:** Role matrix and cross-tenant chain run

### C3: Sessions and sign-out  `api`

- **Goal:** Logout ends the session at once
- **Risk:** Token reuse after logout
- **Entry point:** POST /api/auth/logout then GET /api/me
- **Expected results:** 401 after logout
- **Exit condition:** Chain run

### C4: Status change visible to client (warm, change, re-read)  `cross`

- **Goal:** Client sees fresh data after admin change
- **Risk:** Stale cache
- **Entry point:** GET /api/orders as client, PATCH status as admin, GET again
- **Expected results:** New status/new orders appear
- **Exit condition:** Chain run

### C5: List endpoints: search, paging  `api`

- **Goal:** Bad input is rejected with 400, not 500
- **Risk:** Server errors
- **Entry point:** GET /api/orders with q, page, page_size
- **Expected results:** 400 for invalid values
- **Exit condition:** Edge values run

### C6: Critical flows in Client and Admin Portals  `ui`

- **Goal:** Flows 1-5 work end to end
- **Risk:** Broken order placement or status UI
- **Entry point:** Client Portal /, Admin Portal /
- **Expected results:** As in config
- **Exit condition:** All flows walked, desktop and mobile

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Tenant isolation: any signed-in client can read another company's order by id

- **Surface:** permissions · **Area:** Orders · **Type:** permissions
- **Roles:** bright-1, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/orders/{id} returns the order to any signed-in user without checking that it belongs to the caller's company.

**Steps to reproduce**

1. Sign in as acme-1 over the API and POST /api/orders (reference QA-iso, one item) and note the order id
2. Sign in as bright-1 (a different company)
3. GET /api/orders/{id} with that id (see evidence for the exact request)
4. Observe HTTP 200 with the Acme order

**Expected:** HTTP 403 or 404 for an order of another company

**Actual:** HTTP 200 with the full order of Acme Traders returned to Bright Foods

**Evidence**

- [evidence/api/targeted-T09.json](evidence/api/targeted-T09.json)

**Suspected root cause:** getOrder in src/api.mjs finds the order by id only and never compares order.client_id with the user's client_id (admins excepted)

**Proposed regression test:** Client of company B requests company A's order and expects 404; same-company and admin still get 200 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Customer list is available to non-admin users

- **Surface:** permissions · **Area:** Customers · **Type:** permissions
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/admin/customers has no admin role restriction: a client account gets the full customer list.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/admin/customers (see evidence)
3. Observe HTTP 200 with customer records of all companies

**Expected:** HTTP 403 for non-admin users

**Actual:** HTTP 200 with customer records

**Evidence**

- [evidence/api/targeted-T11.json](evidence/api/targeted-T11.json)

**Suspected root cause:** The route for /api/admin/customers in src/api.mjs is registered without { roles: ['admin'] }

**Proposed regression test:** Client requests /api/admin/customers and expects 403; admin gets 200 (suggested location: `test/admin.test.mjs`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Signing out does not end the session: the old sign-in still works

- **Surface:** api · **Area:** Authentication · **Type:** security
- **Roles:** acme-2
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /api/auth/logout returns 204 the same bearer token is still accepted by GET /api/me.

**Steps to reproduce**

1. Sign in as acme-2 over the API
2. POST /api/auth/logout and observe 204
3. GET /api/me with the same token (see evidence)
4. Observe HTTP 200

**Expected:** HTTP 401 once signed out

**Actual:** HTTP 200 with the user's profile after sign out

**Evidence**

- [evidence/api/targeted-T25.json](evidence/api/targeted-T25.json)

**Suspected root cause:** logout sets session.endedAt but authenticate() in src/api.mjs never checks endedAt (or expiresAt)

**Proposed regression test:** Log in, log out, call /api/me with the old token and expect 401 (suggested location: `test/auth.test.mjs`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Orders are not charged the correct tax: tax is taken before the 5% discount

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / pricing · **Type:** business-rule
- **Roles:** acme-1
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Tax is 10% of the undiscounted subtotal instead of the discounted subtotal, so every discounted order is overcharged.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with 80 x p-102 (12.50 each, subtotal 1000.00) (see evidence)
3. Observe total_cents 105000
4. Rule says 1000.00 - 50.00 + 95.00 = 1045.00 (104500)

**Expected:** Total 1,045.00

**Actual:** Total 1,050.00 (API and the Client Portal confirmation message)

**Evidence**

- [evidence/api/targeted-T01.json](evidence/api/targeted-T01.json)
- [screenshots/client-order-confirmation.png](screenshots/client-order-confirmation.png)

**Suspected root cause:** priceOrder in src/pricing.mjs computes tax from subtotal, not subtotal - discount

**Proposed regression test:** Price 80 x 1250 cents and expect total 104500 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders with zero, negative, fractional or over-limit quantities, or no items, are accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /api/orders accepts quantity -3, 0, 1001 and 1.5, and an empty items list, all with 201.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with one item whose quantity is -3 (see evidence); repeat with 0, 1001, 1.5, and with items []
3. Observe HTTP 201 each time

**Expected:** HTTP 400: quantity must be a whole number from 1 to 1000 and at least one item is required

**Actual:** HTTP 201; orders created (negative quantity gives a negative total)

**Evidence**

- [evidence/api/targeted-T03.json](evidence/api/targeted-T03.json)
- [evidence/api/targeted-T04.json](evidence/api/targeted-T04.json)
- [evidence/api/targeted-T05.json](evidence/api/targeted-T05.json)
- [evidence/api/targeted-T06.json](evidence/api/targeted-T06.json)
- [evidence/api/targeted-T07.json](evidence/api/targeted-T07.json)

**Suspected root cause:** validateOrderInput in src/api.mjs only checks that quantity is a number and does not check range, integer-ness or a non-empty items array

**Proposed regression test:** POST orders with quantities -3, 0, 1001, 1.5 and with empty items, expecting 400 each (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Customers keep seeing an old order status after staff change it

- **Surface:** cross · **Area:** Orders / status · **Type:** stale-data
- **Roles:** bright-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

A client's order list is cached per company for 10 minutes and status changes are not reflected: after an admin moved an order to processing, the client's list filtered by processing did not show it.

**Steps to reproduce**

1. Sign in as bright-1 over the API and GET /api/orders (warms the cache)
2. POST /api/orders, then as admin PATCH /api/admin/orders/{id}/status to processing
3. As bright-1 GET /api/orders?status=processing&q=QA-stale (see evidence)
4. Observe total 0

**Expected:** The order is listed as processing

**Actual:** No match: the cached copy still has status placed

**Evidence**

- [evidence/api/targeted-T19.json](evidence/api/targeted-T19.json)

**Suspected root cause:** listClientOrders in src/api.mjs caches shallow copies of orders for 10 minutes; adding an order refreshes the cache but status changes do not

**Proposed regression test:** Client lists orders, admin changes status, client lists again and sees the new status (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Searching orders with a bracket or similar character causes a server error

- **Surface:** api · **Area:** Orders / search · **Type:** robustness
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

The q parameter of GET /api/orders is passed to new RegExp(), so q=( returns HTTP 500.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?q=( (see evidence)
3. Observe HTTP 500

**Expected:** Literal text search, results or an empty list

**Actual:** HTTP 500 internal_error

**Evidence**

- [evidence/api/targeted-T21.json](evidence/api/targeted-T21.json)

**Suspected root cause:** listOrders in src/api.mjs builds a RegExp from user input without escaping it

**Proposed regression test:** GET /api/orders?q=( expects 200 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Invalid page sizes: 0 causes a server error, negative values are accepted

- **Surface:** api · **Area:** Orders / paging · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

page_size=0 returns HTTP 500 and page_size=-5 returns 200, although the spec says 1 to 100.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?page_size=0 (see evidence) and observe 500
3. GET /api/orders?page_size=-5 and observe 200

**Expected:** HTTP 400 for both

**Actual:** HTTP 500 for 0; 200 for -5

**Evidence**

- [evidence/api/targeted-T22.json](evidence/api/targeted-T22.json)
- [evidence/api/targeted-T23.json](evidence/api/targeted-T23.json)

**Suspected root cause:** parseListQuery in src/api.mjs checks only the upper bound of page_size, and paginate() divides by it

**Proposed regression test:** GET /api/orders with page_size 0 and -5 expects 400 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟡 Minor: The sales report is slow (about 4 seconds)

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

GET /api/admin/reports/sales took about 4 s on a small data set, above the 3 s limit, both times.

**Steps to reproduce**

1. Sign in as admin over the API
2. GET /api/admin/reports/sales (see evidence)
3. Observe about 4000 ms

**Expected:** Under 3 seconds

**Actual:** About 4 seconds

**Evidence**

- [evidence/api/targeted-T26.json](evidence/api/targeted-T26.json)

**Suspected root cause:** Configured artificial latency in the demo (salesReportMs); not proven to be a defect

**Proposed regression test:** Not suitable for an automated regression test (suggested location: `n/a`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| api | Orders create, validation, totals | acme-1 | - | #1 | ✅ tested |  |
| ui | New order and confirmation | acme-1 | desktop | #1 | ✅ tested |  |
| api | Order status change by admin | admin | - | #2 | ✅ tested |  |
| ui | Orders, order status change | admin | desktop | #2 | ⛔ not tested |  |
| cross | Client sees new status after admin change | bright-1 | - | #3 | ◐ partial | API only |
| ui | Reports | admin | desktop | #4 | ◐ partial | page opened, figures not recomputed |
| api | Sales report | admin | - | #4 | ✅ tested |  |
| api | Sign out | acme-2 | - | #5 | ✅ tested |  |
| permissions | Tenant and role isolation | bright-1 | - | - | ✅ tested |  |
| api | Order list search and paging | acme-1 | - | - | ✅ tested |  |

## Not tested

_Nothing here is reported as passing._

- **Password reset emails**: Not run: forgot-password and reset-password were left out as possible side effects and no mail catcher was read
- **Client Portal / My Orders and order detail pages**: Not covered in this run: UI exploration was limited to placing an order and the Admin Reports page
- **Orders, order status change**: Not covered in this run: UI exploration was limited; status change was only tested through the API
- **Mobile layout, accessibility audit and Urdu (right-to-left) display**: Not covered in this run: only desktop viewport visited, no page audit run
- **Expired session handling**: Not covered: session lifetime is configured server-side and was not waited out

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| targeted | 26 | 12 | 14 | 21 | [data/api-results/targeted.json](data/api-results/targeted.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

_No project memory was applied (first run, or memory held nothing relevant)._

**Saved this run**

_No learnings or false alarms were saved._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Client of company B requests company A's order and expects 404; same-company and admin still get 200 → `test/orders.test.mjs`
- **ISSUE-002**: Client requests /api/admin/customers and expects 403; admin gets 200 → `test/admin.test.mjs`
- **ISSUE-003**: Log in, log out, call /api/me with the old token and expect 401 → `test/auth.test.mjs`
- **ISSUE-004**: Price 80 x 1250 cents and expect total 104500 → `test/orders.test.mjs`
- **ISSUE-005**: POST orders with quantities -3, 0, 1001, 1.5 and with empty items, expecting 400 each → `test/orders.test.mjs`
- **ISSUE-006**: Client lists orders, admin changes status, client lists again and sees the new status → `test/orders.test.mjs`
- **ISSUE-007**: GET /api/orders?q=( expects 200 → `test/orders.test.mjs`
- **ISSUE-008**: GET /api/orders with page_size 0 and -5 expects 400 → `test/orders.test.mjs`
- **ISSUE-009**: Not suitable for an automated regression test → `n/a`
