# QAMind Technical Report: run-20261030T111037Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T11:10:37.791Z |
| Project | ws (path-ws-3dda1c61d61d) |
| Environment | local demo |
| Branch / commit | main @ 3a9ad9e |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 5m 40s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

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

- 🔴 Critical: **5**   🟠 Important: **4**   🟡 Minor: **4**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **5**
- API probes executed: **140** (30 produced a signal worth a look)

## What changed since the last run

- Page seen for the first time: Client Portal `/help.html` (Help centre) (new, or not reached by earlier runs)
- Page seen for the first time: Admin Portal `/customers.html` (Customers) (new, or not reached by earlier runs)
- New endpoint: `GET /help` (List help articles)
- Endpoint removed: `POST /auth/reset-password` (Choose a new password with a reset token)

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 4 | 4 | 0 | 12 | 2 | 5 |
| run-20261030T110354Z | full | 5 | 3 | 5 | 1 | 12 | 1 | 5 |

## Test plan (charters)

### C1: Role and tenant isolation (memory risk area)  `permissions`

- **Goal:** Clients cannot read admin data or other companies' orders
- **Risk:** Data exposure
- **Entry point:** GET /api/admin/customers, GET /api/orders/{id} as clients
- **Expected results:** 403 for clients on admin routes; 403/404 for another company's order
- **Exit condition:** Role matrix and cross-tenant chain checked

### C2: Order totals, discount threshold and tax  `business-rule`

- **Goal:** total = subtotal - 5% discount (>=1000.00) + 10% tax on discounted subtotal
- **Risk:** Money wrong
- **Entry point:** POST /api/orders and Client Portal New order
- **Expected results:** Exact cents on both sides of 1,000.00
- **Exit condition:** Below, at and above threshold checked via API and UI

### C3: Order validation and list errors  `api`

- **Goal:** Quantity 1-1000 whole, at least one item; list params/search safe
- **Risk:** Bad data, 5xx
- **Entry point:** POST /api/orders, GET /api/orders
- **Expected results:** 400 for invalid input
- **Exit condition:** Boundary values and search specials checked

### C4: Sessions and sign-out  `api`

- **Goal:** Logout revokes token at once
- **Risk:** Session stays valid
- **Entry point:** POST /api/auth/logout then GET /api/me
- **Expected results:** 401 after logout
- **Exit condition:** Checked via API and UI

### C5: Status change visibility (warm, change, re-read)  `cross`

- **Goal:** Admin status change shows in client list and detail at once
- **Risk:** Stale data
- **Entry point:** Admin Portal order page, Client Portal My orders
- **Expected results:** New status visible after reload
- **Exit condition:** Warm, change, re-read done

### C6: New/changed code: Help page and GET /api/help; undocumented reset-password route  `api`

- **Goal:** Changed files work; spec matches server
- **Risk:** Spec drift, broken new page
- **Entry point:** GET /api/help, public/client/help.html, POST /api/auth/reset-password
- **Expected results:** Help works for clients; routes match openapi.yaml
- **Exit condition:** Help page checked desktop and mobile; spec drift noted

### C7: Client Portal all pages, desktop and mobile, incl. Urdu client  `ui`

- **Goal:** Critical flows 1,3,5 work and look right
- **Risk:** Layout, a11y, RTL
- **Entry point:** http://127.0.0.1:4102
- **Expected results:** Usable pages; no console errors
- **Exit condition:** Every page audited at 1366x768 and 390x844

### C8: Admin Portal all pages, desktop and mobile  `ui`

- **Goal:** Critical flows 2,4 work
- **Risk:** Layout, a11y, wrong numbers
- **Entry point:** http://127.0.0.1:4101
- **Expected results:** Orders, order detail, customers, reports usable
- **Exit condition:** Every page audited at both viewports

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Any customer can read the full customer list, including contact and card details

- **Surface:** permissions · **Area:** Customers · **Type:** access-control
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/admin/customers returns 200 with the full customer list to a client role (acme-1). The route has no role restriction; the admin UI only hides the link.

**Steps to reproduce**

1. Sign in over the API as acme-1 (client)
2. GET /api/admin/customers (see evidence for the curl)
3. Observe HTTP 200 and the customer records

**Expected:** HTTP 403 for non-admin roles (config: only admins can see customers)

**Actual:** HTTP 200 with the customer list

**Evidence**

- [evidence/api/custom-X05.json](evidence/api/custom-X05.json)

**Suspected root cause:** route('GET','/api/admin/customers', {}, listCustomers) in src/api.mjs has no roles: ['admin']

**Proposed regression test:** As a client, GET /api/admin/customers and expect 403 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: A customer of one company can open another company's order

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** acme-1, bright-1, acme-2
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/orders/{id} does not check the order's company. bright-1 receives HTTP 200 for an order placed by acme-1; the Client Portal order page also shows a Bright Foods order to an Acme user by changing the id in the address.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-ISO-1 (capture id)
2. Sign in as bright-1 and GET /api/orders/<id>
3. Observe HTTP 200 with Acme's order
4. UI: sign in to the Client Portal as acme-2, open http://127.0.0.1:4102/order.html?id=o-1006 and see Bright Foods' order BF-2201

**Expected:** HTTP 403 or 404 for another company's order

**Actual:** HTTP 200 and full order details

**Evidence**

- [evidence/api/custom-X02.json](evidence/api/custom-X02.json)
- [screenshots/client-other-company-order.png](screenshots/client-other-company-order.png)

**Suspected root cause:** getOrder in src/api.mjs finds the order by id without comparing client_id to the user's client_id

**Proposed regression test:** Client A creates an order; client B GET of that id expects 403/404 (suggested location: `test/orders.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Tax is calculated on the price before the discount

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / totals · **Type:** calculation
- **Roles:** acme-1
- **Browser / viewport:** desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

Tax is 10% of the undiscounted subtotal instead of the discounted subtotal. Subtotal 1,000.00 gives tax 100.00 and total 1,050.00 (expected tax 95.00, total 1,045.00); subtotal 1,025.46 shows total $1,076.74 (expected $1,071.61). Below the threshold the total is correct (994.50 -> 1,093.95).

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with reference QA-TOT-AT and 80 x p-102 (subtotal 1,000.00)
3. Observe tax_cents 10000, total_cents 105000
4. UI: Client Portal, New order, QA-UI-1 with 54 x Heavy Duty Stapler, Place order; confirmation says Total: $1,076.74

**Expected:** discount 50.00, tax 95.00, total 1,045.00 (and $1,071.61 for the UI order)

**Actual:** tax 100.00, total 1,050.00 (and $1,076.74)

**Evidence**

- [evidence/api/custom-T02.json](evidence/api/custom-T02.json)
- [evidence/api/custom-T03.json](evidence/api/custom-T03.json)
- [screenshots/client-order-total-wrong.png](screenshots/client-order-total-wrong.png)

**Suspected root cause:** src/pricing.mjs computes tax = round(subtotal * TAX_RATE) rather than on subtotal - discount

**Proposed regression test:** Orders with subtotal 100000 and 102546 cents expect totals 104500 and 107161 (suggested location: `test/pricing.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Signing out does not end the session on the server

- **Surface:** api · **Area:** Authentication · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

After POST /api/auth/logout (204), the same bearer token still gets HTTP 200 from GET /api/me. The Client Portal sign-out only forgets the token in the browser.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. POST /api/auth/logout and observe 204
3. GET /api/me with the same token
4. Observe HTTP 200

**Expected:** HTTP 401 after sign-out

**Actual:** HTTP 200 with the user's details

**Evidence**

- [evidence/api/custom-S02.json](evidence/api/custom-S02.json)

**Suspected root cause:** logout() in src/api.mjs sets session.endedAt but authenticate() never checks endedAt (or expiresAt)

**Proposed regression test:** Logout then GET /api/me with the same token expects 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders with no items, quantity 0, negative, fractional or above 1,000 are accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

POST /api/orders returns 201 for empty items, quantity 0, -1, 1.5 and 1001. Rule: whole number 1 to 1,000 and at least one item. Boundaries 1 and 1000 are correctly accepted.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with items [] (reference QA-V-EMPTY)
3. POST with quantity 0, -1, 1.5, 1001 (references QA-V-Q0, QA-V-QNEG, QA-V-QFRAC, QA-V-Q1001)
4. Observe HTTP 201 each time

**Expected:** HTTP 400 naming the field

**Actual:** HTTP 201, order created

**Evidence**

- [evidence/api/custom-V01.json](evidence/api/custom-V01.json)
- [evidence/api/custom-V02.json](evidence/api/custom-V02.json)
- [evidence/api/custom-V03.json](evidence/api/custom-V03.json)
- [evidence/api/custom-V04.json](evidence/api/custom-V04.json)
- [evidence/api/custom-V05.json](evidence/api/custom-V05.json)

**Suspected root cause:** validateOrderInput only checks that quantity is a number; no range, integer or minimum-length check on items

**Proposed regression test:** Table test of invalid quantities and empty items expecting 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Order list fails with an error for a page size of 0 and for searches containing ( or \

- **Surface:** api · **Area:** Orders / list · **Type:** server-error
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

GET /api/orders?page_size=0 returns 500 (division of empty pages), and q=( or q=\ returns 500 because the search text is used as a regular expression. (A page size below 1 being accepted, e.g. -1, is the known false alarm and is not reported here; this is the 500 for 0 and for punctuation.)

**Steps to reproduce**

1. Sign in over the API as admin
2. GET /api/orders?page_size=0
3. GET /api/orders?q=(
4. Observe HTTP 500 each time

**Expected:** HTTP 400 for page_size 0; search with punctuation returns normal results

**Actual:** HTTP 500 internal_error

**Evidence**

- [evidence/api/admin-base-P020.json](evidence/api/admin-base-P020.json)
- [evidence/api/admin-base-P025.json](evidence/api/admin-base-P025.json)
- [evidence/api/admin-base-P029.json](evidence/api/admin-base-P029.json)

**Suspected root cause:** parseListQuery lacks a lower bound; listOrders passes q to new RegExp()

**Proposed regression test:** page_size=0 expects 400; q='(' expects 200 (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Malformed requests return internal technical details

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

POST /api/auth/login with invalid JSON returns 400 whose body contains a stack trace, server file paths and a stack field.

**Steps to reproduce**

1. POST /api/auth/login with body {bad (no sign-in needed)
2. Observe 400 with stack trace and file paths in the body

**Expected:** A short message such as 'Request body is not valid JSON'

**Actual:** Body includes stack and server source paths

**Evidence**

- [evidence/api/admin-base-P007.json](evidence/api/admin-base-P007.json)

**Suspected root cause:** Body-parse error object is serialised with its stack in src/http.mjs

**Proposed regression test:** Malformed JSON response must not contain 'stack' or file paths (suggested location: `test/http.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Customer's order list keeps showing an old status after an admin changes it

- **Surface:** cross · **UI:** Client Portal · **Area:** Orders / status · **Type:** stale-data
- **Roles:** acme-1, acme-2, admin
- **Browser / viewport:** desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

After the client's order list has been loaded, an admin status change is not reflected in GET /api/orders (list) for that company, while GET /api/orders/{id} shows the new status. UI: My orders shows Placed while the order page shows Processing. The list cache lives 10 minutes with no invalidation on status change.

**Steps to reproduce**

1. Client Portal as acme-2: open My orders (list shows QA-UI-1 Placed)
2. Admin Portal: open QA-UI-1 and set status to Processing
3. Client Portal: reload My orders
4. Observe Placed in the list; the order page shows Processing

**Expected:** List shows Processing straight after reload

**Actual:** List shows Placed (old); detail shows Processing

**Evidence**

- [evidence/api/custom-W05.json](evidence/api/custom-W05.json)
- [screenshots/client-list-stale-status.png](screenshots/client-list-stale-status.png)

**Suspected root cause:** listClientOrders caches copied rows per client for 10 minutes (ORDER_CACHE_TTL_MS) and updateOrderStatus does not invalidate it

**Proposed regression test:** Warm client list, admin changes status, client list must show new status (suggested location: `test/orders.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Reset-password operation works and is used by the Client Portal but is missing from the written API description

- **Surface:** api · **Area:** API contract · **Type:** spec-drift
- **Roles:** anonymous
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

POST /api/auth/reset-password answers (HTTP 400 for an invalid link) and is called by the Client Portal reset page, but the uncommitted openapi.yaml no longer lists it (it was listed in the previous version). GET /api/help was added to both.

**Steps to reproduce**

1. POST /api/auth/reset-password with a made-up link code and a new password of 12 characters (see evidence)
2. Observe HTTP 400 invalid_token: the route exists
3. Compare with openapi.yaml: no such operation listed

**Expected:** Every reachable operation is documented

**Actual:** Operation exists but is not in the spec

**Evidence**

- [evidence/api/custom-H02.json](evidence/api/custom-H02.json)

**Suspected root cause:** The reset-password path was removed from openapi.yaml in the working-tree change while the route in src/api.mjs remained

**Proposed regression test:** Every route registered in src/api.mjs appears in openapi.yaml (suggested location: `test/contract.test.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟡 Minor: Orders list on a phone is partly hidden and cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C7

At 390 px the orders table sits under the Status filter and New order button (the first rows are covered) and the Total column is clipped inside a sideways-scrolling box with no visible cue.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Resize to 390x844
3. Open My orders
4. Observe the first row under the toolbar and totals cut off; page audit lists coveredElements

**Expected:** All rows and totals reachable

**Actual:** First row covered, total clipped

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** Table wrapper overlaps the toolbar and has a fixed width

**Proposed regression test:** Visual check at 390px for covered elements on My orders (suggested location: `test/ui/my-orders.spec.js`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: Some form fields and buttons have no name for screen readers

- **Surface:** ui · **UI:** Admin Portal · **Area:** Accessibility · **Type:** accessibility
- **Roles:** admin, acme-1
- **Browser / viewport:** desktop and mobile
- **Reproduced:** 2 of 2 attempts
- **Charter:** C8

Admin Orders: the search box (placeholder only), the Refresh and Clear-filters icon buttons have no accessible name. Client Portal New order: the product drop-down has no name.

**Steps to reproduce**

1. Sign in as admin, open Orders, run the page audit at 1366x768 and 390x844
2. Observe 3 unnamed controls both times
3. Client Portal, New order: audit lists select[name=product] unnamed

**Expected:** Every control has a label or accessible name

**Actual:** 4 unnamed controls

**Evidence**

- [screenshots/admin-orders-mobile.png](screenshots/admin-orders-mobile.png)

**Suspected root cause:** Missing <label>/aria-label on #search, #refresh, #clear-filters and the product select

**Proposed regression test:** Axe-style check that controls have names on Orders and New order (suggested location: `test/ui/a11y.spec.js`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Sending an order twice at once creates two orders

- **Surface:** api · **Area:** Orders / duplicates · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

Two identical parallel POST /api/orders with reference QA-DOUBLE both returned 201 with separate ids. No spec rule requires duplicates to be refused, so the severity reflects likely impact (a double click places two orders).

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. Send the same POST /api/orders twice in parallel
3. Observe two 201 responses with different ids

**Expected:** One order, or the second refused

**Actual:** Two orders created

**Evidence**

- [evidence/api/custom-H05.json](evidence/api/custom-H05.json)

**Suspected root cause:** No idempotency key or duplicate-reference check in createOrder

**Proposed regression test:** Parallel identical POST creates one order (suggested location: `test/orders.test.js`)

<a id="ISSUE-013"></a>

### ISSUE-013 🟡 Minor: The sales report takes about four seconds to load

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C8

GET /api/admin/reports/sales took about 4.0 s on both runs.

**Steps to reproduce**

1. Sign in as admin over the API
2. GET /api/admin/reports/sales twice
3. Observe about 4000 ms each

**Expected:** Under about 1 second

**Actual:** About 4 seconds

**Evidence**

- [evidence/api/admin-base-P062.json](evidence/api/admin-base-P062.json)
- [evidence/api/admin-base-P100.json](evidence/api/admin-base-P100.json)

**Suspected root cause:** Artificial or slow aggregation in salesReport (latency config)

**Proposed regression test:** Sales report responds in under 1500 ms (suggested location: `test/reports.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in, New order, confirmation, My orders | acme-1 | desktop | #1 | ✅ tested | order placed, total checked |
| ui | Orders list, order page, status change | admin | desktop | #2 | ✅ tested | placed to processing |
| cross | Status visible to client after admin change | acme-2 | desktop | #3 | ✅ tested | list stale, detail correct |
| ui | Reports | admin | desktop | #4 | ✅ tested | figures shown after about 4 s |
| ui | Sign out | acme-1 | desktop | #5 | ✅ tested | UI redirects; server token still valid (API) |
| api | Sign out and session | zain-1 | - | #5 | ✅ tested |  |
| ui | Help page (new) | acme-1 | mobile | - | ✅ tested | audit clean |
| ui | My orders | acme-1 | mobile | - | ✅ tested |  |
| ui | My orders (Urdu company) | zain-1 | desktop | - | ◐ partial | viewed; no mobile or detail pages |
| ui | Orders and Customers | admin | mobile | - | ✅ tested |  |
| ui | Customers | admin | desktop | - | ◐ partial | audit only |
| api | All documented endpoints (admin plan, client plan) | admin | - | - | ✅ tested |  |
| permissions | Role and company isolation | acme-1 | - | - | ✅ tested |  |
| business-rule | Order totals and discount threshold | acme-1 | - | - | ✅ tested |  |
| ui | Client Portal / password reset emails | anonymous | - | - | ⛔ not tested | emails |

## Not tested

_Nothing here is reported as passing._

- **Client Portal / password reset emails**: POST /auth/forgot-password sends email; no verified safe mail catcher access in this run. Source reading suggests the emailed link may be built from a missing value (user.resetToken) and a /reset path, unverified.
- **Client Portal / expired session behaviour**: Session lifetime is long and the browser cannot change the server clock; only sign-out was tested.
- **Client Portal / Bright Foods user in the browser**: bright-1 was tested over the API only; Client Portal pages were checked with the Acme and Zain accounts.
- **Admin Portal / Orders list filters and paging on mobile**: Mobile pass covered Orders, Customers and the page audit only; filter, search and paging controls were not exercised by hand in the browser.
- **Rate limiting and keyboard-only use**: Rate limits are not documented and flooding is not allowed; keyboard-only navigation was not walked through.

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-base | 107 | 93 | 8 | 11 | [data/api-results/admin-base.json](data/api-results/admin-base.json) |
| custom | 33 | 20 | 13 | 19 | [data/api-results/custom.json](data/api-results/custom.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

- Applied learning L-001: (Orders / totals) Tax is computed on the undiscounted subtotal; check totals on both sides of the 1,000.00 discount threshold with exact cents.
  - In this run: Applied L-001 to test totals on both sides of the 1,000.00 threshold with exact cents
- Applied learning L-002: (Permissions) Customer-facing roles can reach admin customer list and other companies' single orders over the API even though the UIs hide them; always probe detail endpoints and admin routes as clients.
  - In this run: Applied L-002 to probe admin routes and other companies' orders as clients
- Applied learning L-003: (API runner) Always give a plan file a name field, otherwise the run summary has no plan name and report build crashes; plan files need a probes wrapper object.
  - In this run: Applied L-003 to write plan files with a name and probes wrapper
- Applied learning L-004: (Reports) The sales report takes about 4 seconds to load; wait for its figures before reading.
  - In this run: Applied L-004 to wait for the sales report figures
- Skipped known false alarm FA-001: Page size below 1 is accepted on the order list
  - In this run: Skipped false alarm FA-001: page size below 1 accepted (only the 500 for 0 is reported)

**Saved this run**

- Confirmed again L-001: Tax is computed on the undiscounted subtotal; check totals on both sides of the 1,000.00 discount threshold with exact cents.
- Confirmed again L-002: Customer-facing roles can reach admin customer list and other companies' single orders over the API even though the UIs hide them; always probe detail endpoints and admin routes as clients.
- New learning L-005: A stale order list only shows when the client list is loaded before the admin changes the status; the order detail page is always current, so compare list with detail.
- New learning L-006: Flagged probes are re-run automatically, so each flagged order creation makes extra QA- orders; count duplicates from the evidence, not from a list total.

**Memory after the run**

- Product map: 10 page(s) and 13 endpoint(s) known; 4 change(s) since the last run.
- Risk areas: 13 area(s) tracked; highest now: Authentication (score 20).
- Known false alarms skipped: FA-001.
- Learnings: 2 new, 2 confirmed again, 4 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: As a client, GET /api/admin/customers and expect 403 → `test/permissions.test.js`
- **ISSUE-002**: Client A creates an order; client B GET of that id expects 403/404 → `test/orders.test.js`
- **ISSUE-003**: Orders with subtotal 100000 and 102546 cents expect totals 104500 and 107161 → `test/pricing.test.js`
- **ISSUE-004**: Logout then GET /api/me with the same token expects 401 → `test/auth.test.js`
- **ISSUE-005**: Table test of invalid quantities and empty items expecting 400 → `test/orders.test.js`
- **ISSUE-006**: page_size=0 expects 400; q='(' expects 200 → `test/orders.test.js`
- **ISSUE-007**: Malformed JSON response must not contain 'stack' or file paths → `test/http.test.js`
- **ISSUE-008**: Warm client list, admin changes status, client list must show new status → `test/orders.test.js`
- **ISSUE-009**: Every route registered in src/api.mjs appears in openapi.yaml → `test/contract.test.js`
- **ISSUE-010**: Visual check at 390px for covered elements on My orders → `test/ui/my-orders.spec.js`
- **ISSUE-011**: Axe-style check that controls have names on Orders and New order → `test/ui/a11y.spec.js`
- **ISSUE-012**: Parallel identical POST creates one order → `test/orders.test.js`
- **ISSUE-013**: Sales report responds in under 1500 ms → `test/reports.test.js`

## Notes

- Screenshots of other companies' orders may show business data; review before sharing. Automatic masking is not available in this version.
- Re-run flagged probes created extra QA- prefixed orders (e.g. QA-DOUBLE four times); cleanup was not possible in a report-only run.
