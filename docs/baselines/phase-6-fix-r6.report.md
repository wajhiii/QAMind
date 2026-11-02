# QAMind Technical Report: run-20261102T071712Z

| | |
|---|---|
| Date (UTC) | 2026-11-02T07:17:12.627Z |
| Project | ws (path-ws-d96d387b24e9) |
| Environment | local demo |
| Branch / commit | feature/qa-eval @ 452af29 |
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
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (10 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (2 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (8 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **3**   🟡 Minor: **1**
- Unconfirmed (not reproduced twice): **2**
- Areas not tested: **4**
- API probes executed: **26** (24 produced a signal worth a look)

## What changed since the last run

_First run for this project: there is nothing to compare with yet._

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Key journeys tested | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 3 | 1 | 2 | 5/5 | 11 | 0 | 4 |

_No earlier run to compare with._

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and priced by the stated rules
- **Risk:** Money wrong; invalid quantities accepted
- **Entry point:** POST /api/orders as a client (source: openapi.yaml + src/api.mjs)
- **Expected results:** Quantity whole 1..1000; subtotal/discount/tax per config rules
- **Exit condition:** Both sides of the 1,000.00 threshold and quantity boundaries checked

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients see only own company data; only admins use admin data
- **Risk:** Data exposure
- **Entry point:** GET /orders/{id}, /admin/customers, /admin/reports/sales across roles
- **Expected results:** 403/404 for the wrong role or tenant
- **Exit condition:** Role matrix and cross-tenant chains checked

### C3: Status change visible to client  `cross`

- **Goal:** Admin status change appears for the client after reload
- **Risk:** Stale data
- **Entry point:** Client warms GET /orders, admin PATCH status, client re-reads
- **Expected results:** New status visible
- **Exit condition:** Warm/change/re-read done through API and UI

### C4: Sessions and sign-out  `api`

- **Goal:** Logout ends the session at once; expired sessions refused
- **Risk:** Session stays valid
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401
- **Exit condition:** Verified

### C5: List search, filter, pagination  `api`

- **Goal:** Lists handle odd input without errors
- **Risk:** 500 on special characters or page_size edges
- **Entry point:** GET /orders?q=&page_size=
- **Expected results:** 400 or correct results
- **Exit condition:** Edge values checked

### C6: Critical flows 1-5 in both portals  `ui`

- **Goal:** End-to-end journeys work on desktop and mobile
- **Risk:** Broken journeys
- **Entry point:** Client Portal and Admin Portal
- **Expected results:** As the config flows
- **Exit condition:** Each flow run once end to end

### C7: Password reset  `api`

- **Goal:** Reset email link works
- **Risk:** Broken link
- **Entry point:** POST /auth/forgot-password (local mail catcher)
- **Expected results:** Link carries a valid token
- **Exit condition:** Checked in source and mail catcher if reachable

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Tax is calculated on the undiscounted subtotal

- **Surface:** business-rule · **Area:** Orders / pricing · **Type:** business-rule
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Order tax is 10% of the subtotal before the 5% discount, so every discounted order is overcharged.

**Steps to reproduce**

1. Sign in to the API as acme-1
2. POST /api/orders with one line p-102 quantity 80 and reference QA-B01 (evidence has the exact request)
3. Observe subtotal 100000, discount 5000, tax 10000, total 105000
4. Repeat with p-101 quantity 154 (QA-B03): tax 10010 instead of 9510

**Expected:** Tax = 10% of the discounted subtotal: tax 9500, total 104500 (1,045.00)

**Actual:** tax_cents 10000, total_cents 105000 (1,050.00); the Client Portal confirmation and the Admin Portal order page also show $1,050.00

**Evidence**

- [evidence/api/biz-B01.json](evidence/api/biz-B01.json)
- [evidence/api/biz-B03.json](evidence/api/biz-B03.json)
- [screenshots/client-order-confirmation.png](screenshots/client-order-confirmation.png)
- [screenshots/admin-order-tax.png](screenshots/admin-order-tax.png)

**Suspected root cause:** src/pricing.mjs computes tax from the subtotal rather than subtotal minus discount

**Proposed regression test:** Price an order with subtotal 1000.00 and expect tax 95.00 and total 1045.00; also 994.50 and 1001.00 (suggested location: `test/pricing.test.mjs`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Orders accept quantities of 0, negatives, decimals and more than 1,000, and orders with no items

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Only the type of quantity is checked; the 1 to 1000 whole-number rule and the at-least-one-item rule are not enforced.

**Steps to reproduce**

1. Sign in to the API as acme-1
2. POST /api/orders with quantity -3 (QA-B05), 0 (QA-B04), 1.5 (QA-B06), 1001 (QA-B07), or items [] (QA-B09)
3. Observe 201 each time

**Expected:** 400 validation error: quantity must be a whole number from 1 to 1000; at least one item is needed

**Actual:** 201 and the order is stored; quantity -3 gives a negative total, empty items a 0.00 order

**Evidence**

- [evidence/api/biz-B04.json](evidence/api/biz-B04.json)
- [evidence/api/biz-B05.json](evidence/api/biz-B05.json)
- [evidence/api/biz-B06.json](evidence/api/biz-B06.json)
- [evidence/api/biz-B07.json](evidence/api/biz-B07.json)
- [evidence/api/biz-B09.json](evidence/api/biz-B09.json)

**Suspected root cause:** validateOrderInput in src/api.mjs only checks typeof quantity === 'number' and never checks that items is non-empty

**Proposed regression test:** POST orders with quantity 0, -3, 1.5, 1001 and empty items and expect 400; quantity 1 and 1000 accepted (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: A customer can open another company's order

- **Surface:** permissions · **Area:** Orders / isolation · **Type:** permissions
- **Roles:** bright-1, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /orders/{id} does not check the order's company, so any signed-in client can read any order by id.

**Steps to reproduce**

1. Sign in as acme-1 and create QA-X01, note its id
2. Sign in as bright-1 (a different company)
3. GET /api/orders/<id>
4. Observe 200 with the order

**Expected:** 403 or 404 for another company's order

**Actual:** 200 with the full order (company name, items, totals)

**Evidence**

- [evidence/api/biz-X02.json](evidence/api/biz-X02.json)

**Suspected root cause:** getOrder in src/api.mjs finds the order by id without comparing order.client_id with the user's client_id for client roles

**Proposed regression test:** Client B requests client A's order id and expects 404; a same-company colleague gets 200 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Any customer can list the customer records meant for admins

- **Surface:** permissions · **Area:** Customers / permissions · **Type:** permissions
- **Roles:** bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /admin/customers has no role restriction.

**Steps to reproduce**

1. Sign in as bright-1
2. GET /api/admin/customers
3. Observe 200 with every company's customer records

**Expected:** 403 for a client account

**Actual:** 200 with the customer list of all companies

**Evidence**

- [evidence/api/biz-X04.json](evidence/api/biz-X04.json)

**Suspected root cause:** The route in src/api.mjs is registered without roles: ['admin']

**Proposed regression test:** A client requests /admin/customers and expects 403; admin gets 200 (suggested location: `test/admin.test.mjs`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Signing out does not end the session

- **Surface:** api · **Area:** Sign-in / sessions · **Type:** security
- **Roles:** bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

After POST /auth/logout the same bearer token still works.

**Steps to reproduce**

1. Sign in as bright-1 over the API
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. Observe 200

**Expected:** 401 once signed out

**Actual:** 200 and the user's details

**Evidence**

- [evidence/api/biz-S02.json](evidence/api/biz-S02.json)

**Suspected root cause:** logout only sets session.endedAt, and authenticate in src/api.mjs checks neither endedAt nor expiresAt

**Proposed regression test:** Log in, log out, call /me with the same token and expect 401 (suggested location: `test/auth.test.mjs`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Customers see an old order status for up to 10 minutes

- **Surface:** cross · **Area:** Orders / client list · **Type:** stale-data
- **Roles:** acme-2, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

The client's order list is cached per company for 10 minutes and holds copies, so admin status changes are not shown.

**Steps to reproduce**

1. Sign in as acme-2 and open My orders (warms the list)
2. As admin, move that order to processing
3. As acme-2 reload My orders
4. Observe the list still says Placed while the order itself says processing

**Expected:** The list shows the new status after a reload

**Actual:** The list shows Placed for up to 10 minutes; the order detail shows processing

**Evidence**

- [evidence/api/biz-W03.json](evidence/api/biz-W03.json)
- [screenshots/client-stale-status.png](screenshots/client-stale-status.png)

**Suspected root cause:** listClientOrders in src/api.mjs caches copies for 10 minutes and only invalidates on new orders, not on status change

**Proposed regression test:** Warm the list, change the status, re-read the list and expect the new status (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Order search treats text as a pattern: some searches crash, others match too much

- **Surface:** api · **Area:** Orders / search · **Type:** error-handling
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

The q parameter is passed to new RegExp, so '(' gives HTTP 500 and 'BF.*' matches every reference starting with BF.

**Steps to reproduce**

1. Sign in as admin over the API
2. GET /api/orders?q=(
3. Observe 500
4. GET /api/orders?q=BF.* and observe 4 matches instead of 0

**Expected:** Literal text search; no error

**Actual:** 500 for '(' and pattern semantics otherwise

**Evidence**

- [evidence/api/biz-Q01.json](evidence/api/biz-Q01.json)
- [evidence/api/biz-Q03.json](evidence/api/biz-Q03.json)

**Suspected root cause:** listOrders in src/api.mjs builds a RegExp from user input

**Proposed regression test:** Search q='(' expects 200 with no matches; q='BF.*' expects 0 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: page_size 0 crashes the order list and negative sizes are accepted

- **Surface:** api · **Area:** Orders / pagination · **Type:** validation
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

page_size has no lower bound check: 0 causes HTTP 500, -5 returns 200.

**Steps to reproduce**

1. Sign in as admin over the API
2. GET /api/orders?page_size=0 returns 500
3. GET /api/orders?page_size=-5 returns 200

**Expected:** 400 validation error for values below 1

**Actual:** 500 for 0; 200 with page_size -5

**Evidence**

- [evidence/api/biz-Q04.json](evidence/api/biz-Q04.json)
- [evidence/api/biz-Q05.json](evidence/api/biz-Q05.json)

**Suspected root cause:** parseListQuery in src/api.mjs checks only integer and > 100

**Proposed regression test:** page_size=0 and -5 expect 400 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟡 Minor: On a phone, the My orders filter bar overlaps the table and the totals are cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My orders · **Type:** layout
- **Roles:** acme-2
- **Browser / viewport:** chromium / 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

At 390px wide the toolbar wraps and covers the first order row; the table scrolls sideways without a cue, hiding totals and View.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-2 at 390x844
2. Open My orders
3. Observe the first row under the toolbar and the Total column clipped

**Expected:** No overlap; all key columns reachable

**Actual:** Toolbar bottom at 264px over a table starting at 201px; table 466px wide in a 359px box

**Evidence**

- [screenshots/client-orders-mobile.png](screenshots/client-orders-mobile.png)

**Suspected root cause:** Toolbar height not accounted for on narrow screens (client.css)

**Proposed regression test:** Layout check in a browser at 390px (no browser test runner in this project) (suggested location: `not available`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Password reset email link may be broken** (api, tried 0×): Source builds the link with a value that is never set and a /reset path; /reset returns 404 on the Client Portal. The email itself could not be inspected. Why unconfirmed: No mail catcher running, so the email was not seen
- **UNCONFIRMED-02: Urdu order references in left-aligned cells** (ui, tried 1×): Audit flagged Urdu references in left-to-right cells; not judged as a visible defect Why unconfirmed: Not verified visually as a defect

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| api | Orders pricing and validation | acme-1 | desktop | - | ✅ tested |  |
| ui | New order and confirmation | acme-1 | desktop | #1 | ✅ tested |  |
| ui | My orders | acme-1 | desktop | #1 | ✅ tested |  |
| ui | Orders list and order status update | admin | desktop | #2 | ✅ tested |  |
| ui | My orders after a status change | acme-2 | desktop | #3 | ✅ tested |  |
| ui | Reports | admin | desktop | #4 | ✅ tested |  |
| ui | Sign out | acme-2 | desktop | #5 | ✅ tested |  |
| api | Sign out then reuse session | bright-1 | desktop | #5 | ✅ tested |  |
| permissions | Role and company isolation | bright-1 | desktop | - | ✅ tested |  |
| ui | My orders (Urdu company) | zain-1 | desktop | - | ✅ tested |  |
| ui | My orders on a phone | acme-2 | mobile | - | ✅ tested |  |

## Not tested

_Nothing here is reported as passing._

- **Password reset emails**: Mail catcher not running; sending would be a real email side effect
- **Expired session behaviour**: Session lifetime is 15 minutes; not waited for
- **Admin Portal on mobile**: Not covered in this run
- **Client Portal forms on mobile and edge input**: Not covered in this run

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| biz | 26 | 11 | 15 | 24 | [data/api-results/biz.json](data/api-results/biz.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

_No project memory was applied (first run, or memory held nothing relevant)._

**Saved this run**

_No learnings or false alarms were saved._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Price an order with subtotal 1000.00 and expect tax 95.00 and total 1045.00; also 994.50 and 1001.00 → `test/pricing.test.mjs`
- **ISSUE-002**: POST orders with quantity 0, -3, 1.5, 1001 and empty items and expect 400; quantity 1 and 1000 accepted → `test/orders.test.mjs`
- **ISSUE-003**: Client B requests client A's order id and expects 404; a same-company colleague gets 200 → `test/orders.test.mjs`
- **ISSUE-004**: A client requests /admin/customers and expects 403; admin gets 200 → `test/admin.test.mjs`
- **ISSUE-005**: Log in, log out, call /me with the same token and expect 401 → `test/auth.test.mjs`
- **ISSUE-006**: Warm the list, change the status, re-read the list and expect the new status → `test/orders.test.mjs`
- **ISSUE-007**: Search q='(' expects 200 with no matches; q='BF.*' expects 0 → `test/orders.test.mjs`
- **ISSUE-008**: page_size=0 and -5 expect 400 → `test/orders.test.mjs`
- **ISSUE-009**: Layout check in a browser at 390px (no browser test runner in this project) → `not available`
