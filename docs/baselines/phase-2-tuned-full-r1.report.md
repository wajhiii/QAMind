# QAMind Technical Report: run-20261030T070855Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T07:08:55.589Z |
| Project | ws (path-ws-f87fd1368c27) |
| Environment | local demo |
| Branch / commit | main @ 62d41a8 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 5m 31s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (28 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (4 ms) |
| Health check /health | ✅ ok | HTTP 200 (2 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (9 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (4 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (3 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **5**   🟡 Minor: **3**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **8**
- API probes executed: **140** (48 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and priced by the stated rules
- **Risk:** Money wrong; invalid orders accepted
- **Entry point:** POST /api/orders as acme-1
- **Expected results:** qty whole 1..1000, >=1 item; discount 5% at >=1000.00; tax 10% on discounted subtotal
- **Exit condition:** Both sides of the 1,000.00 threshold and quantity/items edges checked (source: openapi.yaml + src/api.mjs, src/pricing.mjs)

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients see only own company orders; only admins see customers/reports/status change
- **Risk:** Data exposure across companies
- **Entry point:** GET /orders/{id}, GET /admin/customers, PATCH /admin/orders/{id}/status
- **Expected results:** 403/404 for wrong role or tenant
- **Exit condition:** Role matrix and cross-tenant chains run

### C3: Sessions and sign-out  `api`

- **Goal:** Logout ends the session at once
- **Risk:** Token usable after logout
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Chain run twice

### C4: List, search and pagination  `api`

- **Goal:** Filters/paging validated; no 5xx
- **Risk:** 500s on bad input
- **Entry point:** GET /orders with page, page_size, q, status
- **Expected results:** 400 for invalid values
- **Exit condition:** Edge values run

### C5: Status change visible to client (warm, change, re-read)  `cross`

- **Goal:** Admin status change shows for client in list and detail
- **Risk:** Stale data
- **Entry point:** Client Portal My Orders + Admin Portal order
- **Expected results:** New status after reload
- **Exit condition:** Warm read, change, re-read done

### C6: Client Portal flows (all client roles, desktop+mobile)  `ui`

- **Goal:** Order placement, My Orders, order detail, RTL for zain-1
- **Risk:** Broken flow or layout
- **Entry point:** http://127.0.0.1:4102
- **Expected results:** Flows work; Urdu renders RTL
- **Exit condition:** Pages audited

### C7: Admin Portal flows (desktop+mobile)  `ui`

- **Goal:** Orders, order detail status change, customers, reports
- **Risk:** Broken flow, exposed data
- **Entry point:** http://127.0.0.1:4101
- **Expected results:** Flows work
- **Exit condition:** Pages audited

## Findings

### ISSUE-001 🔴 Critical: Tax is charged on the undiscounted subtotal, so discounted orders are overcharged

- **Surface:** business-rule · **Area:** Orders / pricing · **Type:** calculation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

For orders at or above 1,000.00 the 10% tax is calculated on the full subtotal instead of the subtotal after the 5% discount, so every discounted order total is too high.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with 100 x p-101 and 100 x p-104 (subtotal 1,000.00, exactly at the threshold), see evidence for the exact request
3. Read tax_cents and total_cents
4. Repeat in Client Portal > New order with 12 x Printer Toner Cartridge: the confirmation shows $1,133.88

**Expected:** Subtotal 100000, discount 5000, tax 9500 (10% of 95000), total 104500. For 12 toners: tax 10259, total 112848.

**Actual:** Tax 10000 and total 105000 at the threshold; tax 10799 and total 113388 ($1,133.88) for 12 toners. Order detail and admin Reports totals inherit the wrong figure.

**Evidence**

- [evidence/api/rules-R02.json](evidence/api/rules-R02.json)
- [evidence/api/rules-R03.json](evidence/api/rules-R03.json)
- [screenshots/client-order-confirm-desktop.png](screenshots/client-order-confirm-desktop.png)

**Suspected root cause:** src/pricing.mjs computes tax from subtotal rather than subtotal minus discount

**Proposed regression test:** Price an order with subtotal 100000 and expect tax 9500 and total 104500 (suggested location: `test/orders.test.mjs`)

### ISSUE-002 🔴 Critical: Any signed-in client can read another company's order by id

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/orders/{id} does not check which company owns the order, so a client from one company can read another company's order.

**Steps to reproduce**

1. Sign in as acme-1 and POST /api/orders (reference QA-T01), note the id
2. Sign in as bright-1 and GET /api/orders/{id}
3. Repeat as zain-1

**Expected:** HTTP 403 or 404 for a different company

**Actual:** HTTP 200 with the full order (items, prices, totals) for both bright-1 and zain-1

**Evidence**

- [evidence/api/rules-T02.json](evidence/api/rules-T02.json)
- [evidence/api/rules-T03.json](evidence/api/rules-T03.json)

**Suspected root cause:** getOrder looks the order up by id only and never compares client_id to the caller

**Proposed regression test:** Client B requests client A's order id and expects 404 (suggested location: `test/orders.test.mjs`)

### ISSUE-003 🔴 Critical: Clients can list all customers, including personal and payment details

- **Surface:** permissions · **Area:** Admin / Customers · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/admin/customers has no admin-only check: any signed-in client receives every company's customer records, which contain personal contact data and card details.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/admin/customers
3. Repeat as bright-1

**Expected:** HTTP 403 (only admins may see customers)

**Actual:** HTTP 200 with all customers from all companies (contact names, phone numbers, national IDs, addresses, card fragments and notes)

**Evidence**

- [evidence/api/rules-T07.json](evidence/api/rules-T07.json)
- [evidence/api/rules-T08.json](evidence/api/rules-T08.json)

**Suspected root cause:** Route is declared without roles: ['admin'] in src/api.mjs

**Proposed regression test:** Client calls GET /admin/customers and expects 403 (suggested location: `test/admin.test.mjs`)

### ISSUE-004 🔴 Critical: A session token keeps working after sign-out

- **Surface:** api · **Area:** Auth / sessions · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

POST /api/auth/logout returns 204 but the same token is still accepted afterwards.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. GET /api/orders with the same token

**Expected:** HTTP 401 immediately after sign-out

**Actual:** HTTP 200 on both calls; the data is still readable. The Client Portal Sign out button only returns to the sign-in page.

**Evidence**

- [evidence/api/rules-A02.json](evidence/api/rules-A02.json)
- [evidence/api/rules-A03.json](evidence/api/rules-A03.json)

**Suspected root cause:** Logout only sets endedAt on the session; authenticate() never checks endedAt or expiresAt

**Proposed regression test:** Logout, then GET /me with the same token and expect 401 (suggested location: `test/auth.test.mjs`)

### ISSUE-005 🔴 Critical: Orders accept quantity 0, negative, above 1000 and fractional values, and orders with no items

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

The order endpoint only checks that quantity is a number; the documented 1 to 1,000 whole-number rule and the at-least-one-item rule are not enforced.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with quantity -3 (and separately 0, 1001, 2.5)
3. POST /api/orders with items: []

**Expected:** HTTP 400 for each (quantity must be a whole number from 1 to 1000; at least one item)

**Actual:** HTTP 201 each time; a negative quantity creates a negative-value order, and an empty order is created

**Evidence**

- [evidence/api/rules-V01.json](evidence/api/rules-V01.json)
- [evidence/api/rules-V02.json](evidence/api/rules-V02.json)
- [evidence/api/rules-V03.json](evidence/api/rules-V03.json)
- [evidence/api/rules-V04.json](evidence/api/rules-V04.json)
- [evidence/api/rules-V05.json](evidence/api/rules-V05.json)
- [evidence/api/client-baseline-P043.json](evidence/api/client-baseline-P043.json)

**Suspected root cause:** validateOrderInput in src/api.mjs checks typeof quantity only and does not check items.length

**Proposed regression test:** POST orders with quantity -3, 0, 1001, 1.5 and empty items; expect 400 each (suggested location: `test/orders.test.mjs`)

### ISSUE-006 🟠 Important: Client order list shows stale status after an admin changes it

- **Surface:** cross · **Area:** My Orders · **Type:** stale-data
- **Roles:** acme-1, acme-2, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

My Orders (and the status filter) is served from a 10-minute per-company cache, so a status change made by an admin is not shown in the list although the order detail shows it.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 and open My orders (warms the list)
2. In the Admin Portal open order QA-UI-1 and click Update status to Processing
3. Sign in to the Client Portal as acme-2 and open My orders
4. Open order QA-UI-1 detail, then reload My orders

**Expected:** List and detail both show Processing

**Actual:** Detail shows Processing, list still shows Placed (and GET /api/orders?status=processing does not return the changed order)

**Evidence**

- [evidence/api/rules-K06.json](evidence/api/rules-K06.json)
- [screenshots/client-stale-status-list.png](screenshots/client-stale-status-list.png)

**Suspected root cause:** listClientOrders caches copies of orders for 10 minutes and status updates do not invalidate them

**Proposed regression test:** Warm client list, change status as admin, re-read list and expect new status (suggested location: `test/admin.test.mjs`)

### ISSUE-007 🟠 Important: Double-clicking Place order creates duplicate orders

- **Surface:** ui · **Area:** Client Portal / New order · **Type:** double-submit
- **Roles:** acme-1
- **Browser / viewport:** chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

The Place order button is not disabled after the first click and the API has no duplicate protection, so a double click creates two identical orders. I am not sure the product intends to block duplicates, but a customer would be charged twice for one intent.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Open New order: reference QA-UI-2, product Staples box of 5000, quantity 1
3. Double-click Place order
4. Open My orders

**Expected:** One order

**Actual:** Two orders QA-UI-2 appear (two QA-UI-1 also appeared with the toner order); POST /api/orders sent twice at once returns 201 for both

**Evidence**

- [screenshots/client-order-confirm-desktop.png](screenshots/client-order-confirm-desktop.png)
- [evidence/api/client-baseline-P049.json](evidence/api/client-baseline-P049.json)

**Suspected root cause:** No in-flight guard on the submit button and no idempotency key

**Proposed regression test:** Double-click submit and expect a single order in the list (suggested location: `test/orders.test.mjs`)

### ISSUE-008 🟠 Important: Order list search with a regex character (for example '(') returns a server error

- **Surface:** api · **Area:** Orders / search · **Type:** error-handling
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

The q parameter is compiled as a regular expression, so invalid patterns crash with HTTP 500.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?q=(
3. GET /api/orders?q=\

**Expected:** Literal text search; HTTP 200 with no matches

**Actual:** HTTP 500

**Evidence**

- [evidence/api/rules-L03.json](evidence/api/rules-L03.json)
- [evidence/api/client-baseline-P024.json](evidence/api/client-baseline-P024.json)

**Suspected root cause:** new RegExp(q) in listOrders; should escape the text or use includes()

**Proposed regression test:** GET /orders?q=( expects 200 with no items (suggested location: `test/orders.test.mjs`)

### ISSUE-009 🟠 Important: page_size=0 causes HTTP 500 and negative page_size is accepted

- **Surface:** api · **Area:** Orders / pagination · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

page_size is only checked against the upper bound of 100. Zero crashes the request and negative values return 200 with a negative page_size.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?page_size=0
3. GET /api/orders?page_size=-5

**Expected:** HTTP 400: page_size must be between 1 and 100

**Actual:** HTTP 500 for 0; HTTP 200 for -5

**Evidence**

- [evidence/api/rules-L01.json](evidence/api/rules-L01.json)
- [evidence/api/rules-L02.json](evidence/api/rules-L02.json)

**Suspected root cause:** parseListQuery lacks a pageSize < 1 check

**Proposed regression test:** page_size 0 and -5 expect 400 (suggested location: `test/orders.test.mjs`)

### ISSUE-010 🟠 Important: Malformed JSON responses expose a stack trace and server file paths

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Sending a malformed JSON body returns 400 with a stack trace and source paths in the body.

**Steps to reproduce**

1. POST /api/auth/login with a body that is not valid JSON
2. POST /api/orders as acme-1 with a malformed body

**Expected:** A short error message with no internals

**Actual:** Body contains a stack field with server file paths

**Evidence**

- [evidence/api/client-baseline-P007.json](evidence/api/client-baseline-P007.json)
- [evidence/api/client-baseline-P048.json](evidence/api/client-baseline-P048.json)

**Suspected root cause:** The body parser error includes err.stack in the response

**Proposed regression test:** Malformed JSON returns 400 with no stack field (suggested location: `test/auth.test.mjs`)

### ISSUE-011 🟡 Minor: On mobile, the My orders toolbar covers the top of the table and the Total and View columns are cut off

- **Surface:** ui · **Area:** Client Portal / My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

At 390px wide the table starts underneath the status filter toolbar, hiding the column headers and the first row, and Total and View sit outside the visible width with no cue.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Set the viewport to 390x844
3. Open My orders

**Expected:** Table starts below the toolbar and key columns are reachable

**Actual:** Table top (199px) is behind the toolbar (bottom 263px); the table is 450px wide inside a 359px box

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** Toolbar overlaps .table-wrap at narrow widths

**Proposed regression test:** Check toolbar bottom is at or above table top at 390px (suggested location: `test/ (no UI tests exist yet)`)

### ISSUE-012 🟡 Minor: Several controls have no accessible name

- **Surface:** ui · **Area:** Both portals · **Type:** accessibility
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

The product select on New order, the Admin Orders search box (placeholder only) and the two icon buttons beside the status filter (refresh, clear filters) have no accessible name.

**Steps to reproduce**

1. Open Client Portal > New order and run the page audit
2. Open Admin Portal > Orders and run the page audit

**Expected:** Every control has a label

**Actual:** Audit lists select[name=product], input#search, button#refresh and button#clear-filters as unnamed

**Evidence**

- [screenshots/admin-orders-mobile.png](screenshots/admin-orders-mobile.png)

**Suspected root cause:** Missing label or aria-label

**Proposed regression test:** Assert each form control has an accessible name (suggested location: `test/ (no UI tests exist yet)`)

### ISSUE-013 🟡 Minor: Sales report takes about 4 seconds and shows only a spinner

- **Surface:** ui · **Area:** Admin Portal / Reports · **Type:** performance
- **Roles:** admin
- **Browser / viewport:** chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C7

GET /api/admin/reports/sales took over 4 seconds in both runs; the page shows a spinner with no text meanwhile.

**Steps to reproduce**

1. Sign in to the Admin Portal
2. Open Reports and watch the page for 4 seconds

**Expected:** Report within about 3 seconds, or a loading message

**Actual:** 4008 ms; spinner only

**Evidence**

- [evidence/api/client-baseline-P093.json](evidence/api/client-baseline-P093.json)
- [screenshots/admin-reports-desktop.png](screenshots/admin-reports-desktop.png)

**Suspected root cause:** Deliberate latency or slow aggregation in salesReport

**Proposed regression test:** Report responds within 3000 ms (suggested location: `test/admin.test.mjs`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Urdu references may display in confusing order in a left-to-right list** (ui, tried 2×): Zain's references such as زین-1044 sit in LTR cells (dir not set), so the Urdu word and number sit at the left with the hyphen between; it looks readable but I could not tell whether the intended order is number-first. Why unconfirmed: Judgement call on intended reading order; the audit lead is reproducible but I have no expected design

## Coverage matrix

| Surface | Area | Role | Viewport | Status | Note |
|---|---|---|---|---|---|
| api | Orders create, validation, totals | acme-1 | - | ✅ tested | boundaries at 1000.00, quantity, items |
| api | Order list, search, pagination | acme-1 | - | ✅ tested |  |
| api | Role and tenant matrix | all | - | ✅ tested | orders, customers, reports, status change |
| api | Order status transitions | admin | - | ✅ tested | valid and invalid transitions behaved correctly |
| api | Sign-out | zain-1 | - | ✅ tested |  |
| ui | New order, My orders, order detail | acme-1 | desktop | ✅ tested |  |
| ui | My orders | acme-1 | mobile | ✅ tested |  |
| ui | My orders and order detail | acme-2 | desktop | ✅ tested |  |
| ui | My orders (Urdu) | zain-1 | desktop | ◐ partial |  |
| ui | Client sign-in and sign-out | zain-1 | desktop | ✅ tested |  |
| ui | Admin Orders, order detail and status change | admin | desktop | ✅ tested |  |
| ui | Admin Orders | admin | mobile | ◐ partial |  |
| ui | Admin Customers | admin | desktop | ◐ partial |  |
| ui | Admin Reports | admin | desktop | ✅ tested |  |
| cross | Admin status change visible to client | admin, acme-2 | - | ✅ tested |  |

## Not tested

_Nothing here is reported as passing._

- **API / forgot-password and reset-password**: Would send email; excluded by the plan. No mail catcher was confirmed for this run.
- **Client Portal / forgot and reset password pages**: Would trigger emails; no email sandbox was confirmed
- **Admin Portal / Export CSV**: Not exercised in this run
- **UI / mobile pass on New order, order detail, Customers, Reports and Zain's pages**: Not covered in this run; only My orders (client) and Orders (admin) were checked at 390px
- **UI / New order form edge cases (long input, special characters, Urdu text, boundaries)**: Not covered in this run; these were tested through the API only
- **UI / cleared session and direct URL access to other roles' and companies' pages**: Not covered in this run; role and tenant isolation was tested through the API only
- **API / expired session (token past expiry)**: Not tested: the session lifetime is too long to wait out in this run
- **Client Portal / My orders for bright-1**: Not covered in this run; bright-1 was used through the API only

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| client-baseline | 100 | 86 | 13 | 22 | [data/api-results/client-baseline.json](data/api-results/client-baseline.json) |
| rules | 40 | 23 | 17 | 26 | [data/api-results/rules.json](data/api-results/rules.json) |

## Memory

- Applied: First run: no memory to apply

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Price an order with subtotal 100000 and expect tax 9500 and total 104500 → `test/orders.test.mjs`
- **ISSUE-002**: Client B requests client A's order id and expects 404 → `test/orders.test.mjs`
- **ISSUE-003**: Client calls GET /admin/customers and expects 403 → `test/admin.test.mjs`
- **ISSUE-004**: Logout, then GET /me with the same token and expect 401 → `test/auth.test.mjs`
- **ISSUE-005**: POST orders with quantity -3, 0, 1001, 1.5 and empty items; expect 400 each → `test/orders.test.mjs`
- **ISSUE-006**: Warm client list, change status as admin, re-read list and expect new status → `test/admin.test.mjs`
- **ISSUE-007**: Double-click submit and expect a single order in the list → `test/orders.test.mjs`
- **ISSUE-008**: GET /orders?q=( expects 200 with no items → `test/orders.test.mjs`
- **ISSUE-009**: page_size 0 and -5 expect 400 → `test/orders.test.mjs`
- **ISSUE-010**: Malformed JSON returns 400 with no stack field → `test/auth.test.mjs`
- **ISSUE-011**: Check toolbar bottom is at or above table top at 390px → `test/ (no UI tests exist yet)`
- **ISSUE-012**: Assert each form control has an accessible name → `test/ (no UI tests exist yet)`
- **ISSUE-013**: Report responds within 3000 ms → `test/admin.test.mjs`

## Notes

- Customers data contains personal and payment-like details; the Customers screenshot and the customers API evidence files should be reviewed before sharing (automatic masking is not available in this version).
- Test orders created by this run use the QA- prefix and were not deleted (the API has no delete).
