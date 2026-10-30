# QAMind Technical Report: run-20261030T075036Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T07:50:36.573Z |
| Project | ws (path-ws-5537c2d44c0e) |
| Environment | local demo |
| Branch / commit | main @ 7ee95a1 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 6m 48s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (11 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (1 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (4 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (2 ms) |

## Summary

- 🔴 Critical: **4**   🟠 Important: **5**   🟡 Minor: **3**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **7**
- API probes executed: **207** (51 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the stated rules
- **Risk:** Money calculated wrongly; invalid quantities accepted
- **Entry point:** POST /api/orders as a client
- **Expected results:** Quantity 1-1000 whole; at least one item; subtotal>=1000 gets 5% discount; tax 10% on discounted subtotal
- **Exit condition:** Both sides of the 1,000.00 threshold and quantity bounds checked

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients never reach admin functions or other companies' data; same-company users share
- **Risk:** Data exposure
- **Entry point:** Orders, admin endpoints, with acme-1, acme-2, bright-1, zain-1, admin
- **Expected results:** 403/404 for foreign data, 403 for admin endpoints as client
- **Exit condition:** Read, status change and list probes done across tenants

### C3: Auth and sessions  `api`

- **Goal:** Logout revokes token; bad credentials refused
- **Risk:** Session stays valid
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Logout and invalid-token probes done

### C4: Order status lifecycle  `api`

- **Goal:** Status moves placed>processing>shipped>delivered/cancelled only
- **Risk:** Illegal transitions
- **Entry point:** PATCH /admin/orders/{id}/status as admin on own QA order
- **Expected results:** Illegal moves give 409
- **Exit condition:** Forward, backward, skip and invalid values tried

### C5: Client Portal critical flow 1 and 3  `ui`

- **Goal:** Place an order, see confirmation total, find in My Orders, see new status
- **Risk:** Flow blocked or wrong numbers
- **Entry point:** http://127.0.0.1:4102
- **Expected results:** Matches business rules
- **Exit condition:** All pages, desktop and mobile, audit done

### C6: Admin Portal critical flows 2 and 4  `ui`

- **Goal:** Find order, advance status, view reports and customers
- **Risk:** Wrong status or sales numbers
- **Entry point:** http://127.0.0.1:4101
- **Expected results:** Status changes reflected in client portal; reports match orders
- **Exit condition:** All pages, desktop and mobile

### C7: Urdu tenant RTL  `ui`

- **Goal:** Urdu content renders correctly
- **Risk:** Layout/direction defects
- **Entry point:** Client Portal as zain-1
- **Expected results:** RTL alignment, no clipping
- **Exit condition:** Pages checked

### C8: Warm, change, re-read  `cross`

- **Goal:** Admin status change shows at once to client
- **Risk:** Stale data
- **Entry point:** Client reads order, admin changes, client re-reads
- **Expected results:** New status immediately
- **Exit condition:** API and UI re-read

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Any signed-in customer can open another company's order

- **Surface:** permissions · **Area:** Orders · **Type:** permissions
- **Roles:** acme-1, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /orders/{id} returns the full order to a client of a different company (bright-1 and zain-1 reading an Acme Traders order). The list endpoint is scoped correctly; the detail endpoint is not.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-rule-small (1 x p-104); note the id
2. Sign in as bright-1 and GET /api/orders/<that id>
3. Observe HTTP 200 with the Acme order; repeat as zain-1 with the same result

**Expected:** HTTP 403 or 404 and no order data for a different company

**Actual:** HTTP 200 with the complete order (reference, items, totals) for bright-1 and zain-1

**Evidence**

- [evidence/api/undefined-I2.json](evidence/api/undefined-I2.json)
- [evidence/api/undefined-I3.json](evidence/api/undefined-I3.json)

**Suspected root cause:** Order detail lookup finds by id only, without filtering on the caller's client_id (OWASP API1:2023)

**Proposed regression test:** Client of company B requests company A's order id and expects 403/404 (suggested location: `test/orders.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Any signed-in customer can read all customers' personal and payment details

- **Surface:** permissions · **Area:** Customers · **Type:** permissions
- **Roles:** bright-1, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /admin/customers returns 200 with every customer's contact name, email, phone, national ID number, address, card digits and internal notes to client roles (acme-1, bright-1). Per the rules only admins may see customers. The sales report endpoint is correctly refused for clients, so this is a missing role check on this route.

**Steps to reproduce**

1. Sign in over the API as bright-1
2. GET /api/admin/customers
3. Observe HTTP 200 with all three companies' records; repeat as acme-1

**Expected:** HTTP 403 and no data (anonymous already gets 401)

**Actual:** HTTP 200 with every customer's personal fields (field names: email, phone, cnic, address, card_last4, notes). Note: evidence files contain this demo data; review before sharing.

**Evidence**

- [evidence/api/undefined-E3.json](evidence/api/undefined-E3.json)
- [evidence/api/undefined-I11.json](evidence/api/undefined-I11.json)

**Suspected root cause:** Role check missing on the customers route (OWASP API5:2023)

**Proposed regression test:** Client role calls /admin/customers and expects 403 with no contact fields (suggested location: `test/admin.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Signing out does not end the session

- **Surface:** api · **Area:** Authentication · **Type:** auth
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /auth/logout returns 204, the same bearer token still works on GET /me and GET /orders (HTTP 200). The spec says logout revokes the current token and the rules say signing out ends the session at once.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. Observe HTTP 200 instead of 401; GET /api/orders also 200

**Expected:** HTTP 401 on every call after logout

**Actual:** HTTP 200 on /me and /orders with the old token

**Evidence**

- [evidence/api/undefined-L2.json](evidence/api/undefined-L2.json)
- [evidence/api/undefined-L3.json](evidence/api/undefined-L3.json)

**Suspected root cause:** Logout does not delete or blacklist the token server-side

**Proposed regression test:** Log out then call /me with same token, expect 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Tax is charged on the full subtotal instead of the discounted subtotal

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / totals · **Type:** business-rule
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

For orders at or above 1,000.00 the discount is applied (5%) but tax is 10% of the undiscounted subtotal. 80 x 12.50 = 1000.00 gives tax 100.00 and total 1050.00; expected discount 50.00, tax 95.00, total 1045.00. 154 x 6.50 = 1001.00 gives total 1051.05; expected 1046.05 (tax 95.10 rounded). Orders below the threshold are correct (7.70; 1086.25). Visible in both portals.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with reference QA-rule-at and one item p-102 quantity 80
3. Observe tax_cents 10000 and total_cents 105000
4. Repeat with p-101 quantity 154: tax_cents 10010, total_cents 105105

**Expected:** tax_cents 9500 / total_cents 104500 (and 9510 / 104605)

**Actual:** tax_cents 10000 / total_cents 105000 (and 10010 / 105105)

**Evidence**

- [evidence/api/undefined-B3.json](evidence/api/undefined-B3.json)
- [evidence/api/undefined-B4.json](evidence/api/undefined-B4.json)
- [screenshots/admin-order-tax-desktop.png](screenshots/admin-order-tax-desktop.png)
- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)

**Suspected root cause:** Tax computed from subtotal instead of subtotal minus discount

**Proposed regression test:** Orders of 1000.00 and 1001.00 expect the stated tax and total (suggested location: `test/totals.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🟠 Important: Order quantities and item lists are not validated: zero, negative, over 1000, fractional and empty orders are accepted

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /orders returns 201 for quantity 0, -3, 1001 and 1.5, and for an empty items list, contradicting the spec (1-1000 integer, at least one item). Negative orders appear in both portals (for example -$11.55).

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items[0].quantity = -3 (see evidence for exact request); repeat with 0, 1001, 1.5 and items []
3. Observe HTTP 201 each time

**Expected:** HTTP 400 naming the quantity or items field

**Actual:** HTTP 201 and an order created (negative total for -3; zero total for empty items)

**Evidence**

- [evidence/api/undefined-B8.json](evidence/api/undefined-B8.json)
- [evidence/api/client-baseline-P043.json](evidence/api/client-baseline-P043.json)
- [evidence/api/client-baseline-P044.json](evidence/api/client-baseline-P044.json)
- [evidence/api/client-baseline-P045.json](evidence/api/client-baseline-P045.json)
- [evidence/api/client-baseline-P046.json](evidence/api/client-baseline-P046.json)

**Suspected root cause:** No range or type check in the order handler

**Proposed regression test:** Quantity 0, -1, 1001, 1.5 and empty items each expect 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: My orders list shows an old status after an admin changes it

- **Surface:** cross · **UI:** Client Portal · **Area:** Orders / status · **Type:** stale-data
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C8

After admin moves an order placed -> processing, GET /orders/{id} as the client shows processing at once, but GET /orders (and the My orders page, after reload) still shows placed. Warm, change, re-read, repeated twice.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1, place order QA-ui-order-1 and open My orders (status Placed)
2. In the Admin Portal open that order and click Update status with Processing
3. In the Client Portal open the order page: Processing
4. Reload My orders: the row still says Placed

**Expected:** The list shows Processing straight after the change

**Actual:** List shows Placed; detail shows Processing

**Evidence**

- [evidence/api/undefined-S3b.json](evidence/api/undefined-S3b.json)
- [screenshots/client-list-stale-desktop.png](screenshots/client-list-stale-desktop.png)

**Suspected root cause:** Per-customer order list cache not invalidated on status change

**Proposed regression test:** Warm client list, admin changes status, list re-read shows new status (suggested location: `test/orders-cache.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Malformed requests return internal technical details (stack trace and file paths)

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Sending malformed JSON to POST /auth/login or POST /orders returns HTTP 400 with a body containing a stack trace and server file paths.

**Steps to reproduce**

1. POST /api/auth/login with a malformed JSON body (see evidence)
2. Observe HTTP 400 whose body contains a stack field and source paths
3. Repeat with POST /api/orders

**Expected:** A short error message without internals

**Actual:** Stack trace and file paths in the response

**Evidence**

- [evidence/api/client-baseline-P007.json](evidence/api/client-baseline-P007.json)
- [evidence/api/client-baseline-P048.json](evidence/api/client-baseline-P048.json)

**Suspected root cause:** Default error handler prints the error object including stack

**Proposed regression test:** Malformed JSON expects 400 and no stack/path text (suggested location: `test/errors.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Order list fails with an error for page_size=0 and search text ( or \, and accepts page_size=-1

- **Surface:** api · **Area:** Orders / list · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /orders?page_size=0, ?q=( and ?q=\ return HTTP 500; page_size=-1 returns 200 against a documented minimum of 1. Spec documents 400 for bad parameters.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?page_size=0 (or q=( )
3. Observe HTTP 500; repeat for q=\ ; page_size=-1 gives 200

**Expected:** HTTP 400 for invalid parameters; search with symbols returns a normal result

**Actual:** HTTP 500

**Evidence**

- [evidence/api/client-baseline-P019.json](evidence/api/client-baseline-P019.json)
- [evidence/api/client-baseline-P024.json](evidence/api/client-baseline-P024.json)
- [evidence/api/client-baseline-P028.json](evidence/api/client-baseline-P028.json)
- [evidence/api/client-baseline-P020.json](evidence/api/client-baseline-P020.json)

**Suspected root cause:** Unescaped search text used as a regular expression; no page_size range check

**Proposed regression test:** page_size 0/-1 expects 400; q with ( and \ expects 200 (suggested location: `test/orders.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Submitting an order twice creates two identical orders

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Two identical parallel POST /orders requests both return 201 and create two orders with the same reference. No idempotency or duplicate-reference handling is documented, so intent is unclear, but a double click on Place order would create duplicate orders.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send the same POST /api/orders twice in parallel (see evidence)
3. Observe two 201 responses with different order ids

**Expected:** One order, or the second refused

**Actual:** Two orders created (unsure whether duplicates are intended)

**Evidence**

- [evidence/api/client-baseline-P049.json](evidence/api/client-baseline-P049.json)

**Suspected root cause:** No duplicate protection on order creation

**Proposed regression test:** Parallel identical orders expect one record or a 409 (suggested location: `test/orders.test.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟡 Minor: On a phone, the My orders filter bar covers the first order and the Total column is cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My orders · **Type:** layout
- **Roles:** acme-1, zain-1
- **Browser / viewport:** chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

At 390px wide the toolbar (status filter and New order button) overlaps the table header and first row, hiding the column headings and the first order. The table scrolls sideways inside its box and Total and Actions are cut off with little cue.

**Steps to reproduce**

1. Sign in to the Client Portal as any client
2. Set the viewport to 390x844 and open My orders
3. The toolbar covers the table header and first row; Total is clipped
4. Reload and repeat as a second client: same

**Expected:** Toolbar above the table, headings visible, key columns reachable

**Actual:** Overlap and clipped Total

**Evidence**

- [screenshots/client-myorders-mobile.png](screenshots/client-myorders-mobile.png)

**Suspected root cause:** Toolbar wraps to two lines but the table keeps a fixed offset

**Proposed regression test:** Visual check of My orders at 390px (suggested location: `e2e/my-orders.mobile.spec.js`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: Sales report is slow (about 4 seconds) and the page is blank while it loads

- **Surface:** ui · **UI:** Admin Portal · **Area:** Admin Portal / Reports · **Type:** performance
- **Roles:** admin
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

GET /admin/reports/sales consistently takes about 4 seconds (4003-4010 ms over several runs) and the Reports page shows only the heading, with no loading message, until it finishes.

**Steps to reproduce**

1. Sign in to the Admin Portal and click Reports
2. Page shows only the heading for about 4 seconds
3. Repeat: same

**Expected:** Response within about 3 seconds or a loading indicator

**Actual:** About 4 s with a blank page

**Evidence**

- [evidence/api/admin-baseline-P061.json](evidence/api/admin-baseline-P061.json)
- [screenshots/admin-reports-desktop.png](screenshots/admin-reports-desktop.png)

**Suspected root cause:** Slow aggregation; no loading state

**Proposed regression test:** Report endpoint responds under 3 s (suggested location: `test/reports.test.js`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: The product dropdown on New order has no label for screen readers

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / New order · **Type:** accessibility
- **Roles:** acme-1, zain-1
- **Browser / viewport:** chromium / desktop 1366x768 and mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

The product select in each order line has no accessible name (the page audit lists it as an unnamed control on desktop and mobile). Also, the Admin Orders toolbar has two icon buttons with no names (observed in the page snapshot, not separately audited).

**Steps to reproduce**

1. Sign in to the Client Portal and open New order
2. Run the page audit: unnamedControls lists select[name=product]
3. Repeat at 390px

**Expected:** Every control has a name

**Actual:** Product select unnamed

**Evidence**

- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)

**Suspected root cause:** Missing label or aria-label on the dynamically added select

**Proposed regression test:** Accessibility check that the product select has an accessible name (suggested location: `e2e/new-order.a11y.spec.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Urdu order references are left-aligned in a left-to-right table** (ui, tried 1×): On My orders for the Urdu company the page audit flagged three Urdu references as right-to-left text in a left-to-right box (left aligned). I did not review it closely enough to say it is wrong. Why unconfirmed: Only looked at once at desktop; not judged against a screenshot of mixed text and numbers

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in and New order, confirmation total | acme-1 | desktop | #1 | ✅ tested | order of 80 pens; total wrong |
| ui | My orders list | acme-1 | mobile | #1 | ✅ tested | layout defect |
| ui | My orders list and order detail after status change | acme-1 | desktop | #3 | ✅ tested | list stale, detail correct |
| ui | Orders list and order detail, status update | admin | desktop | #2 | ✅ tested | placed to processing in UI; shipped via API |
| ui | Reports | admin | desktop | #4 | ✅ tested | loads after about 4 s; counts add up |
| ui | Sign out | acme-1 | desktop | #5 | ◐ partial | UI returns to sign-in; old session still valid via API |
| api | Sign out and session | zain-1 | - | #5 | ✅ tested | token still works after logout |
| ui | Urdu company My orders | zain-1 | desktop | - | ◐ partial | brief look |
| api | Orders create, validation, totals | acme-1 | - | #1 | ✅ tested |  |
| api | Order status lifecycle | admin | - | #2 | ✅ tested | skip, backward, invalid, cancel-after-ship refused correctly |
| permissions | Tenant and role isolation | bright-1 | - | - | ✅ tested | order detail and customers open to clients |
| api | Search, paging, error handling | acme-1 | - | - | ✅ tested |  |
| ui | Admin Portal / Customers page (screen) | admin | - | - | ⛔ not tested |  |
| ui | Admin Portal / all pages on mobile | admin | mobile | - | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Password reset emails**: Endpoints that send email were left out by the safe-testing rules and no mail sandbox was confirmed
- **Admin Portal / Customers page (screen)**: Not opened in the browser: the page displays personal data; the data problem was proven through the API instead
- **Admin Portal / Export CSV**: Not run: it would export customer order data and was not covered in this pass
- **Admin Portal / all pages on mobile**: Not covered: only the Client Portal was checked at 390px
- **Client Portal / form edge cases in the browser (long text, special characters, double click, expired sign-in)**: Not covered in the browser; only tested through the API
- **Order statuses delivered and cancelled via the Admin Portal**: Only placed, processing and shipped were exercised; shipped to cancelled was refused correctly; delivered was not tried
- **Urdu company layout (full right-to-left review)**: Only a quick desktop look at My orders; order detail and new order pages not reviewed

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-baseline | 100 | 85 | 8 | 11 | [data/api-results/admin-baseline.json](data/api-results/admin-baseline.json) |
| client-baseline | 64 | 52 | 12 | 21 | [data/api-results/client-baseline.json](data/api-results/client-baseline.json) |
| rules | 37 | 26 | 11 | 18 | [data/api-results/undefined-2.json](data/api-results/undefined-2.json) |
| explore | 6 | 5 | 1 | 1 | [data/api-results/undefined.json](data/api-results/undefined.json) |

## Memory

- Applied: First run: no earlier findings to apply

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Client of company B requests company A's order id and expects 403/404 → `test/orders.test.js`
- **ISSUE-002**: Client role calls /admin/customers and expects 403 with no contact fields → `test/admin.test.js`
- **ISSUE-003**: Log out then call /me with same token, expect 401 → `test/auth.test.js`
- **ISSUE-004**: Orders of 1000.00 and 1001.00 expect the stated tax and total → `test/totals.test.js`
- **ISSUE-005**: Quantity 0, -1, 1001, 1.5 and empty items each expect 400 → `test/orders.test.js`
- **ISSUE-006**: Warm client list, admin changes status, list re-read shows new status → `test/orders-cache.test.js`
- **ISSUE-007**: Malformed JSON expects 400 and no stack/path text → `test/errors.test.js`
- **ISSUE-008**: page_size 0/-1 expects 400; q with ( and \ expects 200 → `test/orders.test.js`
- **ISSUE-009**: Parallel identical orders expect one record or a 409 → `test/orders.test.js`
- **ISSUE-010**: Visual check of My orders at 390px → `e2e/my-orders.mobile.spec.js`
- **ISSUE-011**: Report endpoint responds under 3 s → `test/reports.test.js`
- **ISSUE-012**: Accessibility check that the product select has an accessible name → `e2e/new-order.a11y.spec.js`

## Notes

- Evidence for the customer-list problem contains demo personal data; review before sharing. Automatic masking of screenshots is not available in this version.
- The test run created many QA- prefixed orders in the demo data; they were not deleted because no delete function exists.
