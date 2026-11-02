# QAMind Technical Report: run-20261102T051455Z

| | |
|---|---|
| Date (UTC) | 2026-11-02T05:14:55.291Z |
| Project | ws (path-ws-31028b78cc0e) |
| Environment | local demo |
| Branch / commit | main @ a51fb32 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 6m 06s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (13 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (0 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (10 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (2 ms) |

## Summary

- 🔴 Critical: **3**   🟠 Important: **7**   🟡 Minor: **2**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **4**
- API probes executed: **193** (39 produced a signal worth a look)

## What changed since the last run

- Page seen for the first time: Client Portal `/order.html` (Order details) (new, or not reached by earlier runs)
- Page seen for the first time: Client Portal `/help.html` (Help centre) (new, or not reached by earlier runs)
- Page seen for the first time: Admin Portal `/customers.html` (Customers) (new, or not reached by earlier runs)
- New endpoint: `GET /help` (List help articles)
- Endpoint removed: `POST /auth/reset-password` (Choose a new password with a reset token)

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Key journeys tested | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| **this run** | full | 3 | 7 | 2 | 1 | 5/5 | 14 | 2 | 4 |
| run-20261102T050754Z | full | 3 | 6 | 2 | 2 | 5/5 | 12 | 0 | 5 |

## Test plan (charters)

### C1: Customer data and order isolation  `permissions`

- **Goal:** Clients cannot read other companies' orders or admin customer records
- **Risk:** Personal and payment data exposed; cross-company order access
- **Entry point:** GET /api/admin/customers and GET /api/orders/{id} as clients
- **Expected results:** 403/404 for clients; own company only
- **Exit condition:** All roles and both companies checked on list and detail

### C2: Order totals, discount and tax  `business-rule`

- **Goal:** Total = subtotal - discount + tax on the discounted subtotal
- **Risk:** Money wrong
- **Entry point:** POST /api/orders and Client Portal New order
- **Expected results:** Totals match config rules at 999.99/1000.00/1000.01
- **Exit condition:** Both sides of the threshold checked via API and UI

### C3: Sign-out and session  `api`

- **Goal:** A signed-out token stops working
- **Risk:** Session reuse after sign-out
- **Entry point:** POST /api/auth/logout then GET /api/me
- **Expected results:** 401 after logout
- **Exit condition:** Checked via API and UI

### C4: Order validation, paging, search, error handling  `api`

- **Goal:** Bad input gives clear 4xx without internal details
- **Risk:** 500s and leaked internals
- **Entry point:** POST/GET /api/orders, malformed JSON
- **Expected results:** 400 naming the field
- **Exit condition:** Quantity, items, page_size, q and malformed body edges checked

### C5: Status change shows to client (warm, change, re-read)  `cross`

- **Goal:** Admin status change appears at once for the client
- **Risk:** Stale order list
- **Entry point:** Admin PATCH status, client GET /api/orders and My Orders page
- **Expected results:** New status immediately
- **Exit condition:** List, detail and UI compared

### C6: New and changed endpoints: help, reset-password  `api`

- **Goal:** Spec and server agree; the removed reset-password operation is checked
- **Risk:** Undocumented reachable operation; spec drift
- **Entry point:** GET /api/help, POST /api/auth/reset-password (invalid token only)
- **Expected results:** Only documented operations reachable
- **Exit condition:** Both checked against spec

### C7: Client Portal critical flow 1 and new Help page  `ui`

- **Goal:** Place an order, see confirmation and My Orders; Help page works
- **Risk:** Broken flow, mobile overflow
- **Entry point:** Client Portal as acme-1, desktop and mobile
- **Expected results:** Order placed with correct total; pages usable at 390px
- **Exit condition:** All client pages audited at both viewports

### C8: Admin Portal flows 2 and 4, role access  `ui`

- **Goal:** Admin finds and advances an order; Reports shows summary
- **Risk:** Wrong figures, slow Reports, client reaching admin pages
- **Entry point:** Admin Portal as admin; admin URLs as client
- **Expected results:** Works for admin only
- **Exit condition:** All admin pages audited

### C9: Urdu tenant RTL  `ui`

- **Goal:** Urdu content displays correctly
- **Risk:** RTL layout problems
- **Entry point:** Client Portal as zain-1
- **Expected results:** Correct alignment and no truncation
- **Exit condition:** Pages viewed

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Any signed-in customer can read every customer's personal and payment details

- **Surface:** permissions · **Area:** Customers / access control · **Type:** permissions
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/admin/customers has no role restriction in the server: a client account gets HTTP 200 with the full customer list, although the config says only admins may see customers.

**Steps to reproduce**

1. Sign in over the API as acme-1 (a client)
2. GET /api/admin/customers (see evidence for the exact request)
3. Observe HTTP 200 and the customer records; repeat once with the same result

**Expected:** HTTP 403 for any client role; only admin gets the list

**Actual:** HTTP 200 with the customer list for a client role (reproduced 2 of 2)

**Evidence**

- [evidence/api/prices-R2.json](evidence/api/prices-R2.json)

**Suspected root cause:** The route for /api/admin/customers in src/api.mjs is registered without roles: ['admin']

**Proposed regression test:** As a client call GET /api/admin/customers and expect 403 (suggested location: `test/permissions.test.mjs`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: A customer can open another company's order by its number

- **Surface:** permissions · **UI:** Client Portal · **Area:** Orders / tenant isolation · **Type:** permissions
- **Roles:** bright-1, zain-1
- **Browser / viewport:** desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/orders/{id} returns any order to any signed-in user without checking the company. bright-1 and zain-1 both received an Acme Traders order. The Client Portal order page shows it too.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-iso (probe I1)
2. Sign in as bright-1 and GET /api/orders/{that id} (probe I2)
3. Observe HTTP 200 with Acme's order; repeat as zain-1 (probe I3)
4. In the Client Portal signed in as zain-1, open order.html?id=<that id> and see Acme Traders' order

**Expected:** HTTP 403 or 404 for a different company

**Actual:** HTTP 200 with the full order, including company name and items (reproduced 2 of 2 per role, plus in the browser)

**Evidence**

- [evidence/api/rules-I2.json](evidence/api/rules-I2.json)
- [evidence/api/rules-I3.json](evidence/api/rules-I3.json)
- [screenshots/zain-opens-acme-order.png](screenshots/zain-opens-acme-order.png)

**Suspected root cause:** getOrder looks the order up by id only and never compares order.client_id with the caller's client_id (the list is scoped, the detail is not)

**Proposed regression test:** Client of company A creates an order; client of company B GETs it and expects 403 or 404 (suggested location: `test/isolation.test.mjs`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Tax is calculated on the full subtotal instead of the discounted subtotal

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / totals · **Type:** business-rule
- **Roles:** acme-1, admin
- **Browser / viewport:** desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

For an 80 x 12.50 order (subtotal 1,000.00, 5% discount 50.00) tax is 100.00 and the total 1,050.00. The rule gives tax 95.00 on 950.00 and total 1,045.00. Below the threshold (999.99) the total is correct, so only discounted orders are wrong.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Open New order, reference QA-ui-1000, product Ballpoint Pens, box of 50, quantity 80, click Place order
3. Observe the confirmation Total: $1,050.00 (expected $1,045.00)
4. As admin, open the order in the Admin Portal and read Subtotal 1,000.00, Discount -50.00, Tax 100.00, Total 1,050.00
5. Repeat over the API: POST /api/orders with the same items returns total_cents 105000 instead of 104500 (probe T1)

**Expected:** Tax 95.00, total 1,045.00 (tax is 10% of the discounted subtotal)

**Actual:** Tax 100.00, total 1,050.00 (reproduced via API 2 of 2, and in both portals)

**Evidence**

- [evidence/api/rules-T1.json](evidence/api/rules-T1.json)
- [screenshots/order-confirmation-1000.png](screenshots/order-confirmation-1000.png)
- [screenshots/admin-order-tax.png](screenshots/admin-order-tax.png)

**Suspected root cause:** Tax computed from the undiscounted subtotal in src/pricing.mjs

**Proposed regression test:** Order of 1000.00 subtotal totals 1045.00; 999.99 totals 1099.99 (suggested location: `test/pricing.test.mjs`)

<a id="ISSUE-004"></a>

### ISSUE-004 🟠 Important: A signed-out session still works

- **Surface:** api · **Area:** Authentication / sign-out · **Type:** auth
- **Roles:** acme-2
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /api/auth/logout returns 204, the same bearer token still gets 200 from GET /api/me. The server records endedAt but authenticate() never checks it, so signing out only clears the browser.

**Steps to reproduce**

1. Sign in over the API as acme-2
2. POST /api/auth/logout (204)
3. GET /api/me with the same token (probe L2)
4. Observe HTTP 200 and the user record

**Expected:** HTTP 401 after sign-out, as the config says signing out ends the session at once

**Actual:** HTTP 200 (reproduced 2 of 2)

**Evidence**

- [evidence/api/rules-L2.json](evidence/api/rules-L2.json)

**Suspected root cause:** authenticate() in src/api.mjs checks only that the session exists, not session.endedAt or expiresAt

**Proposed regression test:** Logout then GET /api/me with the same token expects 401 (suggested location: `test/auth.test.mjs`)

<a id="ISSUE-005"></a>

### ISSUE-005 🟠 Important: Orders accept quantities of 0, negative numbers, over 1000 and decimals, and orders with no items

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

POST /api/orders returns 201 for items:[], quantity 0, 1001 and 1.5; the rule is a whole number from 1 to 1,000 and at least one item. The server only checks that quantity is a number.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items [] (probe P044), quantity 0 (P045), 1001 (P046), 1.5 (P047)
3. Observe HTTP 201 each time

**Expected:** HTTP 400 naming items or quantity

**Actual:** HTTP 201 and an order is created in every case (reproduced 2 of 2 each)

**Evidence**

- [evidence/api/client-baseline-P044.json](evidence/api/client-baseline-P044.json)
- [evidence/api/client-baseline-P045.json](evidence/api/client-baseline-P045.json)
- [evidence/api/client-baseline-P046.json](evidence/api/client-baseline-P046.json)
- [evidence/api/client-baseline-P047.json](evidence/api/client-baseline-P047.json)

**Suspected root cause:** validateOrderInput only checks typeof quantity === 'number' and has no minimum items check

**Proposed regression test:** POST orders with quantity 0, -1, 1001, 1.5 and no items expects 400 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: A customer's order list shows an old status after an admin changes it

- **Surface:** cross · **UI:** Client Portal · **Area:** Orders / stale data · **Type:** cross
- **Roles:** acme-1, admin
- **Browser / viewport:** desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

The per-company order list is cached for 10 minutes without invalidation on a status change. After admin moved QA-stale to processing, the order page and detail endpoint showed processing but the list still showed placed. Seen in the Client Portal for QA-ui-1000.

**Steps to reproduce**

1. As acme-1 read GET /api/orders?q=QA-stale (warm)
2. As admin PATCH /api/admin/orders/{id}/status to processing
3. As acme-1 GET /api/orders/{id}: processing; GET /api/orders?q=QA-stale: still placed (probe S5)
4. In the Client Portal signed in as acme-1, My orders lists QA-ui-1000 as Placed while its order page says Processing

**Expected:** The list shows the new status at once

**Actual:** List shows placed while detail shows processing (reproduced 2 of 2)

**Evidence**

- [evidence/api/rules-S5.json](evidence/api/rules-S5.json)
- [screenshots/client-list-stale.png](screenshots/client-list-stale.png)

**Suspected root cause:** listClientOrders caches copies of rows per client for ORDER_CACHE_TTL_MS and updateOrderStatus does not clear it

**Proposed regression test:** Warm the list, change status, re-read the list and expect the new status (suggested location: `test/orders-cache.test.mjs`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: The order list fails with an error for page_size=0 and for search text such as ( or \, and accepts a negative page_size

- **Surface:** api · **Area:** Orders / search and paging · **Type:** error-handling
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

GET /api/orders?page_size=0, ?q=( and ?q=\ return HTTP 500 (as client and admin); page_size=-1 returns 200 against the documented minimum of 1. Search text is compiled as a regular expression and page_size has no lower bound.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?page_size=0 (P020), ?q=( (P025), ?q=\ (P029)
3. Observe HTTP 500; GET ?page_size=-1 (P021) returns 200

**Expected:** HTTP 400 for bad page_size; search text treated as plain text

**Actual:** HTTP 500 three times, reproduced 2 of 2, same as admin

**Evidence**

- [evidence/api/client-baseline-P020.json](evidence/api/client-baseline-P020.json)
- [evidence/api/client-baseline-P025.json](evidence/api/client-baseline-P025.json)
- [evidence/api/client-baseline-P029.json](evidence/api/client-baseline-P029.json)
- [evidence/api/client-baseline-P021.json](evidence/api/client-baseline-P021.json)

**Suspected root cause:** new RegExp(q) on user input; parseListQuery has no pageSize < 1 check so Math.ceil(n/0) breaks the Array.from length

**Proposed regression test:** Search with ( and page_size 0 returns 400/200, never 500 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Error responses to malformed requests expose internal technical details

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

Sending malformed JSON to POST /api/auth/login or POST /api/orders returns 400 with a stack trace, server file paths and a stack field in the body.

**Steps to reproduce**

1. POST /api/auth/login with raw body {bad json (probe P007)
2. POST /api/orders with malformed JSON as acme-1 (P049)
3. Observe a stack trace and server file paths in the body

**Expected:** A short error with no internal detail

**Actual:** Stack trace and file paths returned (reproduced 2 of 2)

**Evidence**

- [evidence/api/client-baseline-P007.json](evidence/api/client-baseline-P007.json)
- [evidence/api/client-baseline-P049.json](evidence/api/client-baseline-P049.json)

**Suspected root cause:** readJsonBody in src/http.mjs passes the parser error and its stack into the HttpError details

**Proposed regression test:** Malformed JSON gets 400 and the body has no stack or path (suggested location: `test/errors.test.mjs`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: The New order page overflows a phone screen and pushes Place order off-screen

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / New order · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C7

At 390px the page is 555px wide (overflow 165px): the reference and note fields, the quantity box, Remove and Place order sit partly or fully outside the screen, and Remove is covered by the quantity box.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 with the window at 390x844
2. Open New order
3. Run the page audit and take a full-page screenshot
4. Observe scrollWidth 555 and Place order right edge at 555; reload and observe the same

**Expected:** Fields and Place order fit the screen without sideways scrolling

**Actual:** Page is 165px too wide; Place order starts at x=435 on a 390px screen (reproduced 2 of 2)

**Evidence**

- [screenshots/new-order-mobile.png](screenshots/new-order-mobile.png)

**Suspected root cause:** The item row uses a fixed minimum width with no wrapping at narrow widths in client.css

**Proposed regression test:** At 390px width the document has no horizontal overflow on new-order.html (suggested location: `e2e/new-order.mobile.spec.mjs`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: The removed password-reset operation is still reachable but no longer in the documentation

- **Surface:** api · **Area:** API contract · **Type:** spec-drift
- **Roles:** anonymous
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

POST /api/auth/reset-password was deleted from openapi.yaml in the working changes, but the server still routes it and answers 400 invalid_token for an invalid token (checked with a QA- dummy token only, no real reset). Either the spec lost a live operation or the route should have been removed. The Client Portal still ships reset-password.html.

**Steps to reproduce**

1. POST /api/auth/reset-password anonymously with a made-up token and an 8+ character dummy password (probe U1)
2. Observe HTTP 400 invalid_token instead of 404
3. Compare with openapi.yaml, where the path no longer exists

**Expected:** Spec and server agree: documented and live, or removed and answering 404

**Actual:** Live but undocumented (reproduced 2 of 2); only the invalid-token path was tried

**Evidence**

- [evidence/api/rules-U1.json](evidence/api/rules-U1.json)

**Suspected root cause:** openapi.yaml edited without matching code removal, or the operation removed from the spec by mistake

**Proposed regression test:** Every route the server answers appears in openapi.yaml and vice versa (suggested location: `test/contract.test.mjs`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: The Reports page takes about four seconds to show figures

- **Surface:** ui · **UI:** Admin Portal · **Area:** Admin Portal / Reports · **Type:** performance
- **Roles:** admin
- **Browser / viewport:** desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C8

GET /api/admin/reports/sales takes about 4.0 seconds every time (4006 ms and 4004 ms, limit 3000); the Reports page waits the same time before the figures appear.

**Steps to reproduce**

1. Sign in to the Admin Portal as admin and open Reports
2. Wait for the Billable orders heading (about 4 seconds)
3. Over the API the sales report call took 4006 ms and again 4004 ms (probes P062, P100)

**Expected:** Figures appear within about 3 seconds

**Actual:** About 4 seconds on each of 2 runs

**Evidence**

- [evidence/api/admin-baseline-P062.json](evidence/api/admin-baseline-P062.json)
- [evidence/api/admin-baseline-P100.json](evidence/api/admin-baseline-P100.json)

**Suspected root cause:** The report handler has a fixed delay (latency.salesReportMs) or an unindexed computation

**Proposed regression test:** Sales report responds in under 3 seconds (suggested location: `test/reports.test.mjs`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Some form controls have no accessible name (icon buttons, search box and product list)

- **Surface:** ui · **UI:** Admin Portal · **Area:** Accessibility / labels · **Type:** accessibility
- **Roles:** admin, acme-1
- **Browser / viewport:** desktop 1366x768 and mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C8

On Admin Portal Orders the refresh and clear-filters icon buttons have no name and the search box only has a placeholder; on Client Portal New order the product dropdown has no name. Screen readers announce them as unnamed.

**Steps to reproduce**

1. Sign in to the Admin Portal as admin and open Orders
2. Run the page audit: 3 unnamed controls (desktop and mobile)
3. Sign in to the Client Portal as acme-1 and open New order: the product dropdown is a combobox with no name

**Expected:** Every control has a label or aria-label

**Actual:** 4 controls unnamed (reproduced 2 of 2, both viewports)

**Evidence**

- [evidence/audit-unnamed-controls.txt](evidence/audit-unnamed-controls.txt)

**Suspected root cause:** Icon buttons without aria-label; placeholder used instead of a label

**Proposed regression test:** Every interactive control on orders.html and new-order.html has an accessible name (suggested location: `e2e/accessibility.spec.mjs`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Urdu order references with a hyphen and digits may display in an odd order** (ui, tried 2×): In the Client Portal My orders list for the Urdu company, references like the Urdu word followed by -1044 sit in left-to-right cells; the page audit flags them. The screenshot looks acceptable but the visual order of the hyphen and digits was not compared with the stored value by a reader of Urdu. Why unconfirmed: No clear defect seen; needs a native reader to judge

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| api | All documented operations, baseline plans as admin and client | admin | - | - | ✅ tested | validation, paging, search, errors, role matrix |
| permissions | Customers and order isolation | acme-1 | - | - | ✅ tested | client, other company, same company |
| business-rule | Order totals and discount threshold | acme-1 | - | - | ✅ tested | 999.99, 1000.00 and small order |
| cross | Admin status change shown to customer | admin | - | #3 | ✅ tested | warm, change, re-read |
| api | Sign-out and session | acme-2 | - | #5 | ✅ tested |  |
| api | Help and password-reset operations | anonymous | - | - | ✅ tested | invalid reset token only |
| ui | Sign in, My orders, New order, order confirmation | acme-1 | desktop | #1 | ✅ tested |  |
| ui | New order, Help page | acme-1 | mobile | #1 | ✅ tested |  |
| ui | Sign out | acme-1 | desktop | #5 | ✅ tested | returns to sign-in; server session not ended (see findings) |
| ui | My orders and order page for Urdu company | zain-1 | desktop | - | ✅ tested | right-to-left text |
| ui | My orders and order page | acme-1 | mobile | - | ◐ partial | My orders and order page not audited at phone width |
| ui | Orders list, order page, status update | admin | desktop | #2 | ✅ tested |  |
| ui | Orders list and order page | admin | mobile | #2 | ✅ tested |  |
| ui | Reports | admin | desktop | #4 | ✅ tested |  |
| ui | Customers | admin | desktop | - | ✅ tested |  |
| ui | Reports and Customers | admin | mobile | - | ◐ partial | not audited at phone width |
| ui | Admin Portal / Export CSV | admin | - | - | ⛔ not tested |  |
| api | Password reset email | anonymous | - | - | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Password reset email**: Would send an email and its link was not checked; a local mail catcher is mentioned in the config but its address was not available to the run. Source reading suggests the link is built from a value that is never set, which needs a developer to confirm.
- **Admin Portal / Export CSV**: The Export CSV button on the Orders page was not exercised in this run.
- **Client Portal / expired session and double-click on Place order in the browser**: Not exercised in the browser in this run; double submission over the system was checked and is a known accepted behaviour.
- **Client Portal / test accounts acme-2 and bright-1 in the browser**: These accounts were used over the system only, not through the browser.

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-baseline | 107 | 92 | 8 | 11 | [data/api-results/admin-baseline.json](data/api-results/admin-baseline.json) |
| client-baseline | 65 | 53 | 12 | 21 | [data/api-results/client-baseline.json](data/api-results/client-baseline.json) |
| prices | 2 | 1 | 1 | 1 | [data/api-results/prices.json](data/api-results/prices.json) |
| rules | 19 | 13 | 6 | 6 | [data/api-results/rules.json](data/api-results/rules.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

- Applied learning L-001: (QAMind tooling) Hand-written API plan files must start with {"probes":[...]} and include a "name" field, otherwise results are saved as "undefined" and report build crashes on a missing plan name.
- Applied learning L-002: (Orders / access control and totals) Order list and search are scoped per company but order detail by id and the admin customers endpoint were not; also tax was computed on the undiscounted subtotal. Re-check these first.
- Applied learning L-003: (Admin Portal / Reports) The Reports page and its sales endpoint need about 4 seconds; wait for the Billable orders heading text rather than reading the first snapshot.
- Skipped known false alarm FA-001: Sending the same order twice at once creates two orders

**Saved this run**

- New learning L-004: Stale order status shows only if the client list is read before the admin change: the client Orders list is cached per company, while the order page reads live data, so compare list against detail.
- New learning L-005: Check the server route table against openapi.yaml in both directions: the reset-password route stayed live after it was deleted from the spec, and the new help route was added to both.
- New learning L-006: Test the discount threshold with 80 x p-102 (12.50) for exactly 1000.00, expected total_cents 104500; and p-103 x1, p-102 x76, p-101 x1, p-104 x7 for 999.99, expected 109999.
- Confirmed again L-002: Order list and search are scoped per company but order detail by id and the admin customers endpoint were not; also tax was computed on the undiscounted subtotal. Re-check these first.
- Confirmed again L-003: The Reports page and its sales endpoint need about 4 seconds; wait for the Billable orders heading text rather than reading the first snapshot.
- Flagged risk area Password reset email link: Password reset email link (important): Source reading shows the link uses a user field that is never set; not run because it sends email.

**Memory after the run**

- Product map: 10 page(s) and 13 endpoint(s) known; 5 change(s) since the last run.
- Risk areas: 15 area(s) tracked; highest now: Customers / access control (score 20).
- Known false alarms skipped: FA-001.
- Learnings: 3 new, 2 confirmed again, 3 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: As a client call GET /api/admin/customers and expect 403 → `test/permissions.test.mjs`
- **ISSUE-002**: Client of company A creates an order; client of company B GETs it and expects 403 or 404 → `test/isolation.test.mjs`
- **ISSUE-003**: Order of 1000.00 subtotal totals 1045.00; 999.99 totals 1099.99 → `test/pricing.test.mjs`
- **ISSUE-004**: Logout then GET /api/me with the same token expects 401 → `test/auth.test.mjs`
- **ISSUE-005**: POST orders with quantity 0, -1, 1001, 1.5 and no items expects 400 → `test/orders.test.mjs`
- **ISSUE-006**: Warm the list, change status, re-read the list and expect the new status → `test/orders-cache.test.mjs`
- **ISSUE-007**: Search with ( and page_size 0 returns 400/200, never 500 → `test/orders.test.mjs`
- **ISSUE-008**: Malformed JSON gets 400 and the body has no stack or path → `test/errors.test.mjs`
- **ISSUE-009**: At 390px width the document has no horizontal overflow on new-order.html → `e2e/new-order.mobile.spec.mjs`
- **ISSUE-010**: Every route the server answers appears in openapi.yaml and vice versa → `test/contract.test.mjs`
- **ISSUE-011**: Sales report responds in under 3 seconds → `test/reports.test.mjs`
- **ISSUE-012**: Every interactive control on orders.html and new-order.html has an accessible name → `e2e/accessibility.spec.mjs`
