# QAMind Technical Report: run-20261030T074306Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T07:43:06.533Z |
| Project | ws (path-ws-0790ef96af5b) |
| Environment | local demo |
| Branch / commit | main @ c64d4bb |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 6m 00s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (15 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (3 ms) |
| API base responds | ✅ ok | HTTP 404 (6 ms) |
| Health check /health | ✅ ok | HTTP 200 (2 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (9 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (3 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (2 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **4**   🟡 Minor: **1**
- Unconfirmed (not reproduced twice): **2**
- Areas not tested: **6**
- API probes executed: **194** (57 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and priced by the stated rules
- **Risk:** Money is wrong; invalid quantities accepted
- **Entry point:** POST /api/orders as acme-1
- **Expected results:** Quantity 1-1000 whole numbers only; discount 5% at subtotal >= 1000.00; tax 10% of discounted subtotal
- **Exit condition:** Below, at and above the 1,000.00 threshold and quantity bounds checked, arithmetic recomputed by hand

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients see only their company's orders; only admins see customers/reports/change status
- **Risk:** Cross-company data exposure
- **Entry point:** GET /orders/{id}, GET /admin/customers as bright-1 / acme-2
- **Expected results:** 403/404 for other company; same-company users share orders
- **Exit condition:** Every id-taking and admin endpoint tried as each role

### C3: Sessions and sign-out  `api`

- **Goal:** Sign-out ends the session at once
- **Risk:** Token usable after logout
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Reuse after logout checked twice

### C4: Status change visibility (warm, change, re-read)  `cross`

- **Goal:** Admin status change is seen by the client at once
- **Risk:** Stale cached order list
- **Entry point:** Client list warm, admin PATCH, client re-read list and detail
- **Expected results:** New status in list and detail immediately
- **Exit condition:** List, detail and Admin Portal compared

### C5: List parameters  `api`

- **Goal:** page, page_size, status, q behave and never 500
- **Risk:** Server errors on odd input
- **Entry point:** GET /orders with edge values
- **Expected results:** 400 for invalid, clamp or empty list otherwise
- **Exit condition:** Boundaries and special characters tried

### C6: Client Portal critical flow 1 and 3  `ui`

- **Goal:** Place order, see confirmation total, find it in My Orders and see new status
- **Risk:** Core flow broken
- **Entry point:** Client Portal as acme-1
- **Expected results:** Totals match rules; list and detail agree
- **Exit condition:** Desktop and mobile, page audit, RTL for zain-1

### C7: Admin Portal flows 2, 4  `ui`

- **Goal:** Find order, advance status, view Reports
- **Risk:** Admin cannot operate; report wrong
- **Entry point:** Admin Portal as admin
- **Expected results:** Status moves forward; report agrees with orders
- **Exit condition:** All pages desktop and mobile

### C8: Password reset  `api`

- **Goal:** Reset flow works
- **Risk:** Broken reset link
- **Entry point:** POST /auth/forgot-password
- **Expected results:** Working link
- **Exit condition:** Left out unless a local mail catcher is confirmed

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Tax is calculated on the undiscounted subtotal, so orders of 1,000.00 or more are overcharged

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / pricing · **Type:** business-rule
- **Roles:** acme-1
- **Browser / viewport:** chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Tax is 10% of the subtotal before the 5% discount instead of 10% of the discounted subtotal. Every discounted order total is too high by 0.5% of the subtotal.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with 80 x p-102 (1,250 each): subtotal 100000, discount 5000 (see evidence/api/undefined-B3.json)
3. Observe tax_cents 10000 and total_cents 105000
4. Repeat with 12 x p-107 (evidence/api/undefined-B4.json): tax 10799, total 113388
5. UI: Client Portal > New order, reference QA-ui-1, Printer Toner Cartridge x 12, Place order: confirmation says Total $1,133.88

**Expected:** Tax = 10% of (subtotal - discount): 9500 / total 104500 for the first case; 10259 / 112848 for the second ($1,128.48 on screen)

**Actual:** Tax 10000 and total 105000; tax 10799 and total 113388 ($1,133.88 on screen). Below 1,000.00 totals are correct (987.50 case matched).

**Evidence**

- [evidence/api/undefined-B3.json](evidence/api/undefined-B3.json)
- [evidence/api/undefined-B4.json](evidence/api/undefined-B4.json)
- [screenshots/client-order-confirmation.png](screenshots/client-order-confirmation.png)

**Suspected root cause:** src/pricing.mjs computes tax from subtotal rather than subtotal - discount

**Proposed regression test:** Price an order at exactly 100000 cents subtotal and expect tax 9500 and total 104500 (suggested location: `test/pricing.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Order quantities are not checked: 0, negative, decimals, above 1,000 and empty orders are accepted

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /api/orders accepts quantity 0, -3, 1.5 and 1001, and an empty items list. A negative quantity produces a negative total.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with quantity -3 (evidence/api/undefined-Q-1.json) and observe 201
3. Repeat with 0, 1.5, 1001 and items [] (other evidence files)

**Expected:** 400 naming the field: whole number 1 to 1000, at least one item

**Actual:** 201 for every one of these; order created

**Evidence**

- [evidence/api/undefined-Q-1.json](evidence/api/undefined-Q-1.json)
- [evidence/api/undefined-Q0.json](evidence/api/undefined-Q0.json)
- [evidence/api/undefined-Qdec.json](evidence/api/undefined-Qdec.json)
- [evidence/api/undefined-Q1001.json](evidence/api/undefined-Q1001.json)
- [evidence/api/undefined-Qempty.json](evidence/api/undefined-Qempty.json)

**Suspected root cause:** validateOrderInput only checks that quantity is a number and does not check range, integer or non-empty items

**Proposed regression test:** POST orders with quantity 0, -3, 1.5, 1001 and empty items; expect 400 each (suggested location: `test/orders.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: A customer can open another company's order by its address

- **Surface:** permissions · **Area:** Orders · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/orders/{id} returns any order to any signed-in client without checking the company.

**Steps to reproduce**

1. Sign in as acme-1, POST /api/orders with reference QA-iso-1 and note the id
2. Sign in as bright-1 (a different company) and GET /api/orders/<that id>
3. Observe 200 with the order body (evidence/api/undefined-I2.json)

**Expected:** 403 or 404 and no order data

**Actual:** 200 with the other company's order including its reference

**Evidence**

- [evidence/api/undefined-I2.json](evidence/api/undefined-I2.json)

**Suspected root cause:** getOrder looks up the order by id only, with no client_id comparison (the list endpoint does filter)

**Proposed regression test:** Client B requests client A's order id and expects 403 or 404 (suggested location: `test/orders.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Customers can read the admin customer list

- **Surface:** permissions · **Area:** Customers · **Type:** permissions
- **Roles:** bright-1, acme-1, acme-2, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/admin/customers returns 200 to client accounts; only admins should see customers.

**Steps to reproduce**

1. Sign in as bright-1 over the API
2. GET /api/admin/customers
3. Observe 200 with customer records (evidence/api/undefined-I6.json); the same for acme-1, acme-2 and zain-1 in the admin baseline role matrix

**Expected:** 403 for clients (per business rules and spec)

**Actual:** 200 with the full customer list of all companies

**Evidence**

- [evidence/api/undefined-I6.json](evidence/api/undefined-I6.json)

**Suspected root cause:** The route has no roles: ['admin'] option

**Proposed regression test:** Client calls /admin/customers and expects 403 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: A signed-out session still works

- **Surface:** api · **Area:** Authentication · **Type:** auth
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /api/auth/logout returns 204, the same bearer token still gets 200 from /api/me and /api/orders.

**Steps to reproduce**

1. Sign in as zain-1 over the API
2. POST /api/auth/logout (204)
3. GET /api/me with the same token (evidence/api/undefined-A3.json) and GET /api/orders (undefined-A4.json)
4. Observe 200 for both

**Expected:** 401 immediately after sign-out

**Actual:** 200; the session stays valid

**Evidence**

- [evidence/api/undefined-A3.json](evidence/api/undefined-A3.json)
- [evidence/api/undefined-A4.json](evidence/api/undefined-A4.json)

**Suspected root cause:** logout only sets endedAt and authenticate() never checks endedAt or expiresAt

**Proposed regression test:** Log out, then call /me with the same token and expect 401; also with an expired session (suggested location: `test/auth.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Clients see an old order status in My Orders after an admin changes it

- **Surface:** cross · **UI:** Client Portal · **Area:** Orders list · **Type:** stale-data
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

After an admin moves an order to processing, the client's order list still shows placed while the order detail shows processing.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 and open My orders (list is read)
2. Close the browser; sign in to the Admin Portal as admin, open order QA-ui-1, set New status to Processing, click Update status
3. Close the browser; sign in to the Client Portal as acme-1 and open My orders: row shows Placed
4. Open the order: Status shows Processing
5. API chain: undefined-S3.json shows the same stale list

**Expected:** My orders shows Processing straight away

**Actual:** List shows Placed (also after a reload, about 10 seconds later); detail shows Processing

**Evidence**

- [screenshots/client-list-stale-status.png](screenshots/client-list-stale-status.png)
- [evidence/api/undefined-S3.json](evidence/api/undefined-S3.json)

**Suspected root cause:** listClientOrders caches copies of orders for 10 minutes and a status change does not clear the cache (only creating an order does)

**Proposed regression test:** Warm a client's list, change status as admin, re-read the list and expect the new status (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Malformed requests return internal technical details including server file paths

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

Malformed JSON to /api/auth/login or /api/orders returns 400 whose body includes a stack trace with server file paths.

**Steps to reproduce**

1. POST /api/auth/login with raw body {"broken": (evidence/api/client-baseline-P007.json)
2. Observe error.trace containing a stack and local file paths
3. Same on POST /api/orders (client-baseline-P048.json)

**Expected:** A 400 with a short message only

**Actual:** 400 body includes trace with file paths and function names

**Evidence**

- [evidence/api/client-baseline-P007.json](evidence/api/client-baseline-P007.json)
- [evidence/api/client-baseline-P048.json](evidence/api/client-baseline-P048.json)

**Suspected root cause:** Error serializer includes err.stack for invalid_json

**Proposed regression test:** Send malformed JSON and assert the body has no 'trace' or file paths (suggested location: `test/http.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Order list fails with a server error for page_size=0 and for search text that is not a valid pattern; negative page_size is accepted

- **Surface:** api · **Area:** Orders list · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

GET /api/orders returns 500 for page_size=0 and for q=( or q=\ (q is used as a regular expression); page_size=-1 or -5 returns 200.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?page_size=0 (evidence client-baseline-P019.json): 500
3. GET /api/orders?q=( (P024) and q=\ (P028): 500
4. GET /api/orders?page_size=-5 (undefined-L3.json): 200 with page_size -5

**Expected:** 400 for invalid page_size; search text treated literally

**Actual:** 500 internal_error; 200 for negative

**Evidence**

- [evidence/api/client-baseline-P019.json](evidence/api/client-baseline-P019.json)
- [evidence/api/client-baseline-P024.json](evidence/api/client-baseline-P024.json)
- [evidence/api/client-baseline-P028.json](evidence/api/client-baseline-P028.json)
- [evidence/api/undefined-L3.json](evidence/api/undefined-L3.json)

**Suspected root cause:** page_size lower bound is not checked (Math.ceil(n/0) gives Infinity array length); q is passed to new RegExp()

**Proposed regression test:** GET /orders with page_size=0, q='(' and expect 400 or 200, never 500 (suggested location: `test/orders.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Sending the same order twice at once creates two orders

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Two identical simultaneous POST /api/orders both return 201 and create separate orders. The spec does not document duplicates as intended; uncertain whether product wants protection.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. Send the same POST /api/orders body twice in parallel (evidence/api/client-baseline-P049.json)
3. Observe two 201 responses with different ids

**Expected:** One order, or the second refused (no duplicate-protection is documented, so this is a judgment call)

**Actual:** Two orders with the same reference

**Evidence**

- [evidence/api/client-baseline-P049.json](evidence/api/client-baseline-P049.json)

**Suspected root cause:** No idempotency key or duplicate reference check; order creation also has 800 ms latency, which invites double clicks

**Proposed regression test:** Submit the same order twice in parallel and assert only one is created (suggested location: `test/orders.test.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟡 Minor: My orders on a phone: first order row is hidden under the toolbar and the Total column is cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

At 390 px the table's header and first row are covered by the status filter/New order toolbar, and the Total column is clipped inside a sideways-scrolling box with no hint.

**Steps to reproduce**

1. Sign in to Client Portal as acme-1 at width 390x844
2. Open My orders
3. Audit shows covered elements (first row under toolbar); table scrollWidth 452 vs 359 wide; totals cut off (screenshots/client-my-orders-mobile.png)

**Expected:** No overlap; all columns reachable or stacked

**Actual:** Row overlapped and totals show as '$1,133.' / '$7'

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** Toolbar overlaps the table wrapper and the table has a fixed minimum width

**Proposed regression test:** At 390 px viewport the order totals are fully visible and no element overlaps (suggested location: `test/e2e/my-orders.spec.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Urdu order references are left-aligned in the My orders table** (ui, tried 1×): Audit lists Urdu references in left-to-right cells with left alignment; the text itself renders correctly. Why unconfirmed: A judgment call on alignment, not clearly wrong; not checked in the other portal beyond the customer name cell
- **UNCONFIRMED-02: Sales report takes about 4 seconds and shows only the heading while loading** (api, tried 2×): GET /admin/reports/sales took 4004 ms twice; the page showed only 'Sales summary' until data arrived. Why unconfirmed: Probably deliberate demo latency; no loading indicator check was made on screen

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in, New order, confirmation | acme-1 | desktop | #1 | ✅ tested | order placed; total wrong (finding) |
| ui | My orders and order detail | acme-1 | desktop | #1 | ✅ tested | order found in list |
| ui | My orders | acme-1 | mobile | - | ✅ tested | layout finding |
| ui | Order detail | acme-1 | mobile | - | ✅ tested |  |
| ui | My orders (RTL) | zain-1 | desktop | - | ✅ tested | Urdu text lead unconfirmed |
| ui | New order page | acme-1 | mobile | - | ⛔ not tested |  |
| ui | Status after change: list and detail | acme-1 | desktop | #3 | ✅ tested | list stale (finding) |
| ui | Order detail and status update | admin | desktop | #2 | ◐ partial | placed to processing only; Orders list opened but search and filters not exercised |
| ui | Reports | admin | desktop | #4 | ✅ tested | summary loads; totals match API |
| ui | Customers | admin | desktop | - | ✅ tested |  |
| ui | Orders list | admin | mobile | - | ✅ tested |  |
| ui | Sign out | acme-1 | desktop | #5 | ◐ partial | returns to sign-in page; old session still valid behind the screens (finding) |
| api | Authentication and sign-out | zain-1 | - | #5 | ✅ tested |  |
| api | Orders create/validate/pricing | acme-1 | - | #1 | ✅ tested |  |
| api | Order status change | admin | - | #2 | ✅ tested |  |
| api | Admin reports | admin | - | #4 | ✅ tested |  |
| permissions | Role and company isolation | bright-1 | - | - | ✅ tested |  |
| api | Order list parameters | acme-1 | - | - | ✅ tested |  |
| api | Password reset | anonymous | - | - | ⛔ not tested | sends email |

## Not tested

_Nothing here is reported as passing._

- **Password reset (forgot-password and reset-password)**: Sends email; left out by the API plan as a possible side effect and no mail catcher was confirmed. Source reading suggests the emailed link uses an undefined token (user.resetToken) and would be broken: unverified lead.
- **Admin Portal: Orders list filters/search, moving orders to shipped, and Customers page on mobile**: Not covered beyond one status change (placed to processing), the Customers and Reports pages on desktop and Orders on mobile; the remaining steps were checked through the API rules only
- **Client Portal: forms edge cases in the browser (long text, special characters, double-click), New order and Order pages on mobile, expired-session behaviour**: Not run in the browser within this run; order validation was covered through the API only
- **Rate limiting, CORS and security headers**: No limit documented; not verified in this run
- **ui / New order page / acme-1 / mobile**: Reason not recorded
- **api / Password reset / anonymous**: sends email

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-baseline | 100 | 85 | 8 | 11 | [data/api-results/admin-baseline.json](data/api-results/admin-baseline.json) |
| client-baseline | 64 | 51 | 12 | 21 | [data/api-results/client-baseline.json](data/api-results/client-baseline.json) |
| session | 4 | 2 | 2 | 2 | [data/api-results/undefined-2.json](data/api-results/undefined-2.json) |
| business | 26 | 13 | 13 | 23 | [data/api-results/undefined.json](data/api-results/undefined.json) |

## Memory

- Applied: First run: no earlier memory to apply

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Price an order at exactly 100000 cents subtotal and expect tax 9500 and total 104500 → `test/pricing.test.js`
- **ISSUE-002**: POST orders with quantity 0, -3, 1.5, 1001 and empty items; expect 400 each → `test/orders.test.js`
- **ISSUE-003**: Client B requests client A's order id and expects 403 or 404 → `test/orders.test.js`
- **ISSUE-004**: Client calls /admin/customers and expects 403 → `test/permissions.test.js`
- **ISSUE-005**: Log out, then call /me with the same token and expect 401; also with an expired session → `test/auth.test.js`
- **ISSUE-006**: Warm a client's list, change status as admin, re-read the list and expect the new status → `test/orders.test.js`
- **ISSUE-007**: Send malformed JSON and assert the body has no 'trace' or file paths → `test/http.test.js`
- **ISSUE-008**: GET /orders with page_size=0, q='(' and expect 400 or 200, never 500 → `test/orders.test.js`
- **ISSUE-009**: Submit the same order twice in parallel and assert only one is created → `test/orders.test.js`
- **ISSUE-010**: At 390 px viewport the order totals are fully visible and no element overlaps → `test/e2e/my-orders.spec.js`

## Notes

- Testing created many QA- prefixed orders (repeat runs of failing probes add duplicates), so report totals and order counts include test data.
- Admin status change was only tried on one QA- order; shipped and delivered steps were checked through the API rules only.
- Screenshots show only test accounts' data.
