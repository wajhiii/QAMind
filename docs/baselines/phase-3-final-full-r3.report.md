# QAMind Technical Report: run-20261030T093921Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T09:39:21.233Z |
| Project | ws (path-ws-714d8be98d21) |
| Environment | local demo |
| Branch / commit | main @ 6775873 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 4m 39s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (15 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (0 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (8 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **4**   🟠 Important: **3**   🟡 Minor: **1**
- Unconfirmed (not reproduced twice): **3**
- Areas not tested: **6**
- API probes executed: **47** (29 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders validated and totalled by the config rules
- **Risk:** Money wrong; invalid quantities accepted
- **Entry point:** POST /api/orders as acme-1 (source: openapi.yaml)
- **Expected results:** Qty 1..1000 whole; >=1 item; discount 5% at subtotal >= 1000; tax 10% on discounted; total rounded to cent
- **Exit condition:** Both sides of the 1000.00 threshold and quantity bounds checked

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients only see own company orders; admin endpoints refuse clients
- **Risk:** Cross-tenant data exposure
- **Entry point:** GET /orders/{id}, /admin/* as acme-1, acme-2, bright-1, zain-1, anonymous
- **Expected results:** Same company shares; other company 403/404; admin endpoints 403 for clients
- **Exit condition:** Chains for read and status change; role matrix read

### C3: Status workflow  `api`

- **Goal:** Status moves placed>processing>shipped>delivered/cancelled only
- **Risk:** Illegal transitions accepted
- **Entry point:** PATCH /admin/orders/{id}/status as admin
- **Expected results:** Illegal transitions 409; clients 403
- **Exit condition:** Forward, skip, backward, cancel-after-ship, invalid value checked

### C4: Auth and sessions  `api`

- **Goal:** Logout revokes token at once
- **Risk:** Session usable after sign-out
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Logout, bad token, missing token checked

### C5: Lists, search, pagination  `api`

- **Goal:** Orders list filters and paging behave
- **Risk:** Skipped/duplicated rows, 500 on edge values
- **Entry point:** GET /orders page,page_size,status,q
- **Expected results:** Bounded, consistent, own data only
- **Exit condition:** Boundary values checked

### C6: Critical flows 1-3 (client place order, admin advances, client sees status)  `ui`

- **Goal:** End-to-end flow works and agrees across UIs, warm-change-reread
- **Risk:** Stale status, wrong totals
- **Entry point:** Client Portal 4102, Admin Portal 4101
- **Expected results:** Flow works as in config
- **Exit condition:** Desktop and mobile on each page

### C7: Admin reports, customers, sign-out (flows 4-5)  `ui`

- **Goal:** Reports show sales summary matching orders; sign-out ends session
- **Risk:** Wrong numbers, session persists
- **Entry point:** Admin Portal Reports, Customers
- **Expected results:** Summary matches API; back button/session after logout refused
- **Exit condition:** Checked

### C8: Urdu tenant RTL and form edge cases  `ui`

- **Goal:** RTL layout correct; forms handle special chars, long input
- **Risk:** Layout/direction defects
- **Entry point:** Client Portal as zain-1
- **Expected results:** RTL alignment, no clipping
- **Exit condition:** Checked desktop and mobile

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Any signed-in customer can open another company's order by its id

- **Surface:** permissions · **Area:** Orders · **Type:** authorization
- **Roles:** acme-1, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/orders/{id} returns the order to any signed-in user without checking that it belongs to the caller's company. bright-1 and zain-1 (other companies) both received acme-1's order with HTTP 200.

**Steps to reproduce**

1. Sign in as acme-1 over the API and POST /api/orders with reference QA-iso-1 (one unit of p-101); note the returned id
2. Sign in as bright-1 and GET /api/orders/<id>
3. Observe HTTP 200 with the order body (also for zain-1); see evidence for exact requests

**Expected:** HTTP 403 or 404 for a different company; the list endpoint already scopes correctly

**Actual:** HTTP 200 with the full order, including the other company's name and items

**Evidence**

- [evidence/api/rules-I3.json](evidence/api/rules-I3.json)
- [evidence/api/rules-I4.json](evidence/api/rules-I4.json)

**Suspected root cause:** getOrder in src/api.mjs finds the order by id only, with no client_id check (OWASP API1:2023)

**Proposed regression test:** Order created by company A must return 403/404 to a company B user (suggested location: `test/orders.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Any customer can read the full customer list, including personal details

- **Surface:** permissions · **Area:** Customers · **Type:** authorization
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/admin/customers has no admin-only restriction; acme-1 and bright-1 (clients) receive HTTP 200 with every customer record. Fields exposed: contact_name, email, phone, cnic (national ID), address, notes, company.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/admin/customers
3. Observe HTTP 200 with all customer records; repeat as bright-1

**Expected:** HTTP 403 for non-admin roles (config rule: only admins can see customers)

**Actual:** HTTP 200 with all customers' personal fields

**Evidence**

- [evidence/api/rules-R1.json](evidence/api/rules-R1.json)
- [evidence/api/rules-R4.json](evidence/api/rules-R4.json)

**Suspected root cause:** The customers route in src/api.mjs is registered without roles:['admin'] (OWASP API5:2023)

**Proposed regression test:** GET /admin/customers as a client expects 403 (suggested location: `test/admin.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Orders of 1,000.00 or more are charged too much tax (tax ignores the discount)

- **Surface:** business-rule · **Area:** Orders / pricing · **Type:** calculation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Tax is computed on the undiscounted subtotal. 80 x 12.50 = 1,000.00; discount 50.00; expected tax 95.00 and total 1,045.00; the system gives tax 100.00 and total 1,050.00 in the API, the Client Portal confirmation and the Admin Portal order page.

**Steps to reproduce**

1. Sign in as acme-1 over the API; POST /api/orders with reference QA-b1 and items [{product_id:p-102, quantity:80}]
2. Observe subtotal_cents 100000, discount_cents 5000, tax_cents 10000, total_cents 105000
3. UI: Client Portal as acme-1 → New order → reference QA-ui-1, Ballpoint Pens quantity 80 → Place order; confirmation says Total: $1,050.00

**Expected:** Tax = 10% of discounted subtotal (95.00); total 1,045.00

**Actual:** Tax 100.00; total 1,050.00 (customer overcharged 5.00 on this order)

**Evidence**

- [evidence/api/rules-B1.json](evidence/api/rules-B1.json)
- [screenshots/ui-order-confirmation.png](screenshots/ui-order-confirmation.png)

**Suspected root cause:** priceOrder in src/pricing.mjs computes tax = round(subtotal * 0.1) instead of (subtotal - discount) * 0.1

**Proposed regression test:** Order of exactly 1000.00 expects discount 50.00, tax 95.00, total 1045.00 (suggested location: `test/pricing.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Signing out does not end the session on the server

- **Surface:** permissions · **Area:** Authentication · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

After POST /api/auth/logout returns 204, the same bearer token still gets HTTP 200 from GET /api/me.

**Steps to reproduce**

1. Sign in as zain-1 over the API
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. Observe HTTP 200 instead of 401

**Expected:** HTTP 401 immediately after sign-out (config rule: signing out ends the session at once)

**Actual:** HTTP 200; the signed-out token keeps working

**Evidence**

- [evidence/api/rules-A2.json](evidence/api/rules-A2.json)

**Suspected root cause:** logout in src/api.mjs only sets session.endedAt; authenticate() never checks endedAt (or expiresAt)

**Proposed regression test:** Token used after logout expects 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🟠 Important: Orders are accepted with quantity 0, negative, above 1,000, fractional, or with no items

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /api/orders returns 201 for quantity 0, -3, 1001, 1.5 and for an empty items list. Only a type check exists. Negative quantities produce negative totals; empty orders have total 0.00.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with reference QA-qneg and items [{product_id:p-101, quantity:-3}] (repeat with 0, 1001, 1.5, and items [])
3. Observe HTTP 201 each time

**Expected:** HTTP 400 naming the field (whole number 1 to 1,000; at least one item)

**Actual:** HTTP 201, order created (orders with odd totals appear in My orders and Reports)

**Evidence**

- [evidence/api/rules-Q0.json](evidence/api/rules-Q0.json)
- [evidence/api/rules-Q1.json](evidence/api/rules-Q1.json)
- [evidence/api/rules-Q2.json](evidence/api/rules-Q2.json)
- [evidence/api/rules-Q3.json](evidence/api/rules-Q3.json)
- [evidence/api/rules-Q5.json](evidence/api/rules-Q5.json)

**Suspected root cause:** validateOrderInput in src/api.mjs checks only typeof quantity === 'number' and never the range, integer-ness, or minimum item count

**Proposed regression test:** Quantities 0,-1,1001,1.5 and empty items each expect 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Customers keep seeing an old order status for up to 10 minutes after staff change it

- **Surface:** cross · **UI:** Client Portal · **Area:** Orders / status · **Type:** stale-data
- **Roles:** admin, acme-1, acme-2
- **Browser / viewport:** desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

The client order list is cached per company for 10 minutes and is not refreshed when an admin changes status. Warm, change, re-read: after admin moved QA-ui-1 to processing, acme-2 (same company) still saw Placed in My orders on two loads. The detail endpoint shows the new status.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 and open My orders (list shows QA-ui-1 as Placed)
2. Sign in to the Admin Portal, open order QA-ui-1 and set New status = Processing, click Update status
3. As acme-2 (same company) open My orders, then refresh the page
4. Observe QA-ui-1 still shown as Placed; API probes S4/S5 show the same

**Expected:** New status visible immediately after refresh

**Actual:** Old status Placed shown (list caches for ORDER_CACHE_TTL_MS = 10 minutes)

**Evidence**

- [evidence/api/rules-S4.json](evidence/api/rules-S4.json)
- [evidence/api/rules-S5.json](evidence/api/rules-S5.json)
- [screenshots/client-stale-status.png](screenshots/client-stale-status.png)

**Suspected root cause:** listClientOrders caches copied rows per client_id for 10 minutes; only addOrder invalidates it, updateOrderStatus does not

**Proposed regression test:** Warm client list, admin changes status, client list shows new status (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Order list fails with an error on some search text and page sizes

- **Surface:** api · **Area:** Orders list · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

GET /api/orders returns HTTP 500 for q=( and q=[ (search text is used as a regular expression), and for page_size=0; page_size=-1 returns 200 contrary to the documented minimum 1. Search text such as '.*' also acts as a pattern.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?q=(  (also q=[ and page_size=0)
3. Observe HTTP 500 internal_error; GET /api/orders?page_size=-1 returns 200

**Expected:** Literal search; HTTP 400 for page_size outside 1..100

**Actual:** HTTP 500 for q=(, q=[, page_size=0; 200 for page_size=-1

**Evidence**

- [evidence/api/rules-P4.json](evidence/api/rules-P4.json)
- [evidence/api/rules-P5.json](evidence/api/rules-P5.json)
- [evidence/api/rules-P1.json](evidence/api/rules-P1.json)
- [evidence/api/rules-P2.json](evidence/api/rules-P2.json)

**Suspected root cause:** listOrders builds new RegExp(q) from user input; parseListQuery lacks a pageSize >= 1 check and paginate divides by zero

**Proposed regression test:** q='(' returns 200 with no match; page_size 0 and -1 return 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟡 Minor: My orders on a phone: filter bar covers the first order and the Total column is cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

At 390x844 the table (457px wide) scrolls inside a 359px box with no cue; the Total and View columns are out of sight, and the toolbar/New order button overlap the first row (audit coveredElements, twice).

**Steps to reproduce**

1. Sign in as acme-1 in the Client Portal
2. Resize to 390x844
3. Open My orders and reload
4. Observe the first row partly under the filter bar; Total clipped at the right edge

**Expected:** Rows fully visible and all columns reachable on a phone

**Actual:** First row overlapped; Total and View columns partly hidden in a sideways-scrolling box

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** Table wrapper overflow with a sticky or overlapping toolbar and no responsive table layout

**Proposed regression test:** At 390px width no covered elements and Total visible (suggested location: `test/e2e/my-orders.mobile.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Product drop-down on New order has no accessible name** (ui, tried 1×): Page audit listed select[name=product] as an unnamed control (the snapshot shows a combobox with no name). Why unconfirmed: Seen in one audit at desktop only; not repeated from a fresh load
- **UNCONFIRMED-02: Two icon buttons in the Admin Orders toolbar have no name** (ui, tried 1×): Snapshot shows two buttons next to the Status filter with no accessible name. Why unconfirmed: Seen once in the snapshot; audit was not run on that page
- **UNCONFIRMED-03: Reports page shows only the heading for a few seconds before data appears** (ui, tried 1×): Right after opening Reports the page showed only 'Sales summary'; data appeared after about 8 seconds. Whether a loading message was visible was not checked. Why unconfirmed: Observed once; timing not measured twice

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| api | Orders create, validation, totals | acme-1 | n/a | #1 | ✅ tested | discount threshold, quantity bounds, mass assignment |
| api | Tenant and role isolation | acme-2, bright-1, zain-1, anonymous | n/a | - | ✅ tested | order detail, list, admin endpoints |
| api | Status workflow | admin | n/a | #2 | ✅ tested | valid and invalid transitions |
| api | Orders list search and paging | acme-1 | n/a | - | ✅ tested | boundaries |
| api | Sign-out and session | zain-1 | n/a | #5 | ✅ tested |  |
| ui | Sign in, New order, confirmation | acme-1 | desktop | #1 | ✅ tested |  |
| ui | My orders | acme-1 | mobile | #1 | ✅ tested | layout problem found |
| ui | My orders (status refresh) | acme-2 | desktop | #3 | ✅ tested | old status shown |
| ui | Sign out | acme-2 | desktop | #5 | ◐ partial | returns to sign-in page; server-side end of session checked through the API only |
| ui | My orders in Urdu | zain-1 | desktop | - | ✅ tested | Urdu references left-aligned in left-to-right table; no clipping |
| ui | Orders list and order detail, update status | admin | desktop | #2 | ✅ tested |  |
| ui | Reports | admin | desktop | #4 | ✅ tested | counts and totals consistent with orders |
| ui | Customers page | admin | desktop | - | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Password reset (forgot / reset password)**: Excluded by the runner as a possible email side effect; not run
- **Expired session handling**: Session lifetime not waited out
- **Customers page**: Not reached in this run; the page was not opened in the browser (the data behind it was checked through the API)
- **Admin Portal / Export CSV, order search and phone views**: Not reached in this run; only the Orders, order detail and Reports pages were opened in the browser
- **Client Portal / order detail page, forgot-password page and mobile on New order**: Not reached in this run
- **Client Portal as bright-1 (browser)**: Only API probes were run for this account

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| prod | 1 | 1 | 0 | 0 | [data/api-results/prod.json](data/api-results/prod.json) |
| rules | 46 | 28 | 18 | 29 | [data/api-results/rules.json](data/api-results/rules.json) |

## Memory

- Applied: First run: no earlier memory to apply

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Order created by company A must return 403/404 to a company B user → `test/orders.test.js`
- **ISSUE-002**: GET /admin/customers as a client expects 403 → `test/admin.test.js`
- **ISSUE-003**: Order of exactly 1000.00 expects discount 50.00, tax 95.00, total 1045.00 → `test/pricing.test.js`
- **ISSUE-004**: Token used after logout expects 401 → `test/auth.test.js`
- **ISSUE-005**: Quantities 0,-1,1001,1.5 and empty items each expect 400 → `test/orders.test.js`
- **ISSUE-006**: Warm client list, admin changes status, client list shows new status → `test/orders.test.js`
- **ISSUE-007**: q='(' returns 200 with no match; page_size 0 and -1 return 400 → `test/orders.test.js`
- **ISSUE-008**: At 390px width no covered elements and Total visible → `test/e2e/my-orders.mobile.test.js`

## Notes

- Evidence for the customer-list finding contains real-looking personal data (contact details, national ID); review before sharing. Automatic masking of screenshots and evidence is not available in this version.
- Test orders with the QA- prefix were created (about 30) and left in place; /qa-only does not clean up.
