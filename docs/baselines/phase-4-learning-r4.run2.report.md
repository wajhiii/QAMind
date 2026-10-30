# QAMind Technical Report: run-20261030T112118Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T11:21:18.736Z |
| Project | ws (path-ws-89479fd1b6ee) |
| Environment | local demo |
| Branch / commit | main @ 5a87cc3 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 5m 49s |
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
| Test account "admin" can sign in | ✅ ok | signed in over the API (7 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **6**   🟡 Minor: **2**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **5**
- API probes executed: **195** (43 produced a signal worth a look)

## What changed since the last run

- Page seen for the first time: Client Portal `/help.html` (Help centre) (new, or not reached by earlier runs)
- New endpoint: `GET /help` (List help articles)
- Endpoint removed: `POST /auth/reset-password` (Choose a new password with a reset token)

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 6 | 2 | 0 | 15 | 1 | 5 |
| run-20261030T111628Z | full | 5 | 4 | 2 | 1 | 11 | 3 | 7 |

## Test plan (charters)

### C1: Cross-company order and customer access, logout  `permissions`

- **Goal:** Clients only see their own company's orders; only admins see customers; logout revokes the token
- **Risk:** Data exposure (memory: ISSUE-001/002/003 critical last run)
- **Entry point:** API as acme-1, acme-2, bright-1, zain-1, admin
- **Expected results:** 403/404 across companies; 403 for clients on admin endpoints; 401 after logout
- **Exit condition:** By-id read/status change, customers list, logout chain each run twice

### C2: Order totals, discount and tax  `business-rule`

- **Goal:** Total = subtotal - 5% discount (>=1000.00) + 10% tax on discounted subtotal
- **Risk:** Money wrong (ISSUE-004)
- **Entry point:** POST /api/orders as client and the New order page
- **Expected results:** Arithmetic matches config rules on both sides of 1,000.00
- **Exit condition:** 999.99-ish, exactly 1000.00 and above checked in API and UI

### C3: Order validation, errors, list params, duplicates  `api`

- **Goal:** Invalid input refused with 4xx, no leaks, no 5xx, no duplicates
- **Risk:** ISSUE-005/006/007/008
- **Entry point:** POST/GET /api/orders, /auth/login malformed JSON
- **Expected results:** 400 for quantities outside 1..1000, empty items; no stack traces
- **Exit condition:** Boundary set and list params run

### C4: New and changed endpoints: GET /help, reset-password removal  `api`

- **Goal:** New /help works and is public; spec matches the code (reset-password was removed from the spec)
- **Risk:** Spec drift, undocumented reachable operation
- **Entry point:** GET /api/help, POST /api/auth/reset-password
- **Expected results:** Spec and server agree
- **Exit condition:** Both probed

### C5: Critical flows 1-5 across both portals  `ui`

- **Goal:** Order placement, admin status change, client sees new status, reports, sign-out
- **Risk:** Core journeys; stale data
- **Entry point:** Client Portal, Admin Portal
- **Expected results:** As the five critical flows in the config
- **Exit condition:** All five run end to end with warm-change-reread

### C6: All pages, desktop and mobile, page audit, incl. new Help page and Urdu client  `ui`

- **Goal:** Layout, accessibility, RTL for zain-1, Help page (changed in git diff)
- **Risk:** ISSUE-009 mobile table; new help.html/help.js; changed my-orders and new-order
- **Entry point:** Every page of both portals
- **Expected results:** No clipped content, no console errors
- **Exit condition:** Each page audited at 1366x768 and 390x844

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Orders: a client from one company can open another company's order by its id

- **Surface:** permissions · **Area:** Orders · **Type:** permissions
- **Roles:** acme-1, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/orders/{id} returns any order to any signed-in client, regardless of company.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-iso-1 and one item (p-101, quantity 1); note the returned id
2. Sign in as bright-1 (Bright Foods) and GET /api/orders/<that id>
3. Repeat as zain-1 (Zain Traders)
4. Observe HTTP 200 with the Acme order, including its reference QA-iso-1 (see evidence for ready curl commands)

**Expected:** HTTP 403 or 404 for a different company (config rule: different companies never see each other's data)

**Actual:** HTTP 200 with the full order for bright-1 and zain-1 (2 of 2 attempts each). Status change by bright-1 was correctly refused.

**Evidence**

- [evidence/api/rules-isolation-ISO2.json](evidence/api/rules-isolation-ISO2.json)
- [evidence/api/rules-isolation-ISO2b.json](evidence/api/rules-isolation-ISO2b.json)

**Suspected root cause:** Order by-id handler does not compare the order's client with the caller's company (the list endpoint does)

**Proposed regression test:** Client of company A creates an order; client of company B GETs it and expects 403/404 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Customers list: any signed-in client can read all customers' personal and payment details

- **Surface:** permissions · **Area:** Customers · **Type:** permissions
- **Roles:** bright-1, acme-1, acme-2, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/admin/customers answers 200 to client roles although only admins may see customers.

**Steps to reproduce**

1. Sign in over the API as bright-1 (a client)
2. GET /api/admin/customers
3. Observe HTTP 200 and a customer list (see evidence)

**Expected:** HTTP 403 (config rule: only admins can see customers)

**Actual:** HTTP 200 with the customer records for client roles (2 of 2 attempts; the role matrix also showed 200 for acme-1, acme-2, bright-1, zain-1; the reports endpoint correctly returned 403)

**Evidence**

- [evidence/api/rules-isolation-CU1.json](evidence/api/rules-isolation-CU1.json)

**Suspected root cause:** Route for admin customers has no admin role check

**Proposed regression test:** As a client, GET /admin/customers expects 403 (suggested location: `test/permissions.test.mjs`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Sign-out: the session still works after logging out

- **Surface:** api · **Area:** Authentication · **Type:** security
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

After POST /api/auth/logout returns 204 the same token still works on GET /api/me.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. POST /api/auth/logout and observe HTTP 204
3. With the same token, GET /api/me
4. Observe HTTP 200 instead of 401

**Expected:** HTTP 401 at once (config rule: signing out ends the session at once; spec says the token is revoked)

**Actual:** HTTP 200 with the user's details (2 of 2 attempts)

**Evidence**

- [evidence/api/rules-isolation-LO2.json](evidence/api/rules-isolation-LO2.json)

**Suspected root cause:** Logout does not revoke the token

**Proposed regression test:** Logout then GET /me with the same token expects 401 (suggested location: `test/auth.test.mjs`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Orders: tax is calculated before the 5% discount, so orders of 1,000.00 or more are overcharged

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / totals · **Type:** calculation
- **Roles:** acme-1
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

For an 80 x 12.50 order (subtotal 1,000.00) the tax is 100.00 instead of 95.00, so the total is 1,050.00 instead of 1,045.00.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Open New order, enter reference QA-ui-1, choose 'Ballpoint Pens, box of 50 ($12.50)', set quantity 80, click Place order
3. Observe the message 'Total: $1,050.00'; click View order and see Subtotal $1,000.00, Discount -$50.00, Tax $100.00, Total $1,050.00
4. Same result over the API with POST /api/orders (see evidence): total_cents 105000; for 154 x 6.50 total_cents is 105105

**Expected:** Tax is 10% of the discounted subtotal: 1,000.00 - 50.00 = 950.00; tax 95.00; total 1,045.00 (and 1,046.05 for the 1,001.00 order)

**Actual:** Tax 100.00, total 1,050.00 (and 1,051.05). The order just below the threshold (994.50) was correct at 1,093.95 (2 of 2 attempts for each above-threshold order).

**Evidence**

- [evidence/api/rules-isolation-T2.json](evidence/api/rules-isolation-T2.json)
- [evidence/api/rules-isolation-T3.json](evidence/api/rules-isolation-T3.json)
- [screenshots/ui-order-confirmation.png](screenshots/ui-order-confirmation.png)
- [screenshots/order-detail-tax.png](screenshots/order-detail-tax.png)

**Suspected root cause:** Tax computed on the undiscounted subtotal

**Proposed regression test:** Order with subtotal 1000.00 expects tax 95.00 and total 1045.00; 1001.00 expects 1046.05 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders: zero, negative, decimal, over-1000 quantities and empty item lists are accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

POST /api/orders returns 201 for quantity 0, 1001 and 1.5 and for an empty items list.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items [] ; then with quantity 0; 1001; 1.5 (see evidence)
3. Observe HTTP 201 each time

**Expected:** HTTP 400 (config rule: whole number 1 to 1,000 and at least one item)

**Actual:** HTTP 201 for all four (2 of 2 attempts each)

**Evidence**

- [evidence/api/client-base-P044.json](evidence/api/client-base-P044.json)
- [evidence/api/client-base-P045.json](evidence/api/client-base-P045.json)
- [evidence/api/client-base-P046.json](evidence/api/client-base-P046.json)
- [evidence/api/client-base-P047.json](evidence/api/client-base-P047.json)

**Suspected root cause:** No server-side range or empty check in the order handler

**Proposed regression test:** POST orders with quantity 0, 1001, 1.5 and empty items expects 400 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Stale order list: a client's list still shows the old status after an admin changes it

- **Surface:** cross · **Area:** Orders / status · **Type:** stale-data
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

After an admin moved an order to processing, the order detail showed processing but the client's order list kept showing placed.

**Steps to reproduce**

1. As acme-1 place order QA-ui-1 in the Client Portal and open My orders (list warmed, status placed)
2. As admin open the order in the Admin Portal and click Update status with 'Processing'; the admin list shows Processing
3. As acme-1 GET /api/orders/<id>: status processing
4. As acme-1 GET /api/orders?q=QA-ui: status still placed; same after about 30 seconds

**Expected:** List and detail agree straight after the change

**Actual:** Detail 'processing', list 'placed' (2 of 2 reads, also after about 30 seconds). Seen through the API only; the Client Portal list screen was not re-opened after the change.

**Evidence**

- [evidence/api/reread-RR2.json](evidence/api/reread-RR2.json)
- [evidence/api/reread-RR1.json](evidence/api/reread-RR1.json)

**Suspected root cause:** Cached list for the client that is not cleared when an admin changes the status

**Proposed regression test:** Warm client list, admin changes status, client list shows the new status (suggested location: `test/status.test.mjs`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: API: malformed JSON returns a stack trace and server file paths

- **Surface:** api · **Area:** Errors · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

Sending a broken JSON body to /auth/login or /orders returns an error that includes a stack trace and source file paths.

**Steps to reproduce**

1. POST /api/auth/login with raw body {"broken": and Content-Type application/json
2. Observe HTTP 400 with a stack field and server paths
3. Same for POST /api/orders as acme-1

**Expected:** HTTP 400 with a short message and no internals

**Actual:** Stack trace and file paths in the body (2 of 2 attempts, 3 probes)

**Evidence**

- [evidence/api/client-base-P007.json](evidence/api/client-base-P007.json)
- [evidence/api/client-base-P049.json](evidence/api/client-base-P049.json)

**Suspected root cause:** Error handler returns the raw exception

**Proposed regression test:** Malformed JSON returns 400 without stack or path (suggested location: `test/errors.test.mjs`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Orders list: page_size=0 and search text with ( or \ cause errors, and page_size=-1 is accepted

- **Surface:** api · **Area:** Orders / list · **Type:** validation
- **Roles:** admin, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

GET /api/orders fails with HTTP 500 for page_size=0, q=( and q=\, and accepts page_size=-1.

**Steps to reproduce**

1. Sign in over the API as admin (also acme-1)
2. GET /api/orders?page_size=0 -> 500
3. GET /api/orders?q=( and q=\ -> 500
4. GET /api/orders?page_size=-1 -> 200 echoing page_size -1

**Expected:** HTTP 400 for invalid values; punctuation in search text is searched literally

**Actual:** HTTP 500 three times, 200 for -1 (2 of 2 attempts each, both roles)

**Evidence**

- [evidence/api/client-base-P020.json](evidence/api/client-base-P020.json)
- [evidence/api/client-base-P021.json](evidence/api/client-base-P021.json)
- [evidence/api/client-base-P025.json](evidence/api/client-base-P025.json)
- [evidence/api/client-base-P029.json](evidence/api/client-base-P029.json)

**Suspected root cause:** Search text used as a regular expression; no bounds check on page_size

**Proposed regression test:** page_size 0/-1 give 400; q='(' returns 200 (suggested location: `test/orders-list.test.mjs`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Orders: submitting the same order twice at once creates two orders

- **Surface:** api · **Area:** Orders / duplicates · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

Two identical simultaneous POST /api/orders were both accepted with 201 and stored as two orders.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send POST /api/orders twice in parallel with the same body (see evidence)
3. Observe two 201 responses and two orders in My orders

**Expected:** One order, or the duplicate refused (the spec does not say duplicates are allowed)

**Actual:** Two orders created (2 of 2 attempts). If duplicates are intended, say so in the spec.

**Evidence**

- [evidence/api/client-base-P050.json](evidence/api/client-base-P050.json)

**Suspected root cause:** No duplicate protection on order creation

**Proposed regression test:** Two parallel identical creates yield one order (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: API: the reset-password operation was removed from the spec but the server still answers it

- **Surface:** api · **Area:** Authentication / spec · **Type:** spec-drift
- **Roles:** anonymous
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

POST /api/auth/reset-password is no longer in openapi.yaml but is still routed and handled by src/api.mjs.

**Steps to reproduce**

1. POST /api/auth/reset-password anonymously with an invalid reset code and a new password (QA- values, see evidence)
2. Observe HTTP 400 'invalid_token' instead of HTTP 404

**Expected:** Spec and server agree: either the operation is documented or the route is gone (HTTP 404)

**Actual:** The route is live and processes reset codes (2 of 2 attempts). Unsure which side is intended; severity set by exposure of an undocumented password-changing operation.

**Evidence**

- [evidence/api/rules-isolation-RP1.json](evidence/api/rules-isolation-RP1.json)
- [evidence/api/rp-repeat-RP2.json](evidence/api/rp-repeat-RP2.json)

**Suspected root cause:** Spec edited (uncommitted) without removing the route

**Proposed regression test:** Every route in the server is in the spec and vice versa (suggested location: `test/spec.test.mjs`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟠 Important: Client Portal My orders: on a 390px phone the table is cut off and the header covers the first row

- **Surface:** ui · **UI:** Client Portal · **Area:** My orders / layout · **Type:** layout
- **Roles:** acme-1, zain-1
- **Browser / viewport:** chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

The orders table is 444px wide inside a 359px box, so the Total column and View links are cut off, and the toolbar and New order button sit over the first row.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 (also as zain-1) and set the window to 390x844
2. Open My orders
3. Observe the Total column cut off ('$1,050.' ) and the first order row partly hidden under the Status filter and New order button

**Expected:** All columns and the View link reachable, nothing covered

**Actual:** Table clipped (444px content, 359px box, no visible cue); audit reports the first row covered by the toolbar (2 of 2: acme-1, zain-1)

**Evidence**

- [screenshots/my-orders-mobile.png](screenshots/my-orders-mobile.png)
- [screenshots/my-orders-mobile-zain.png](screenshots/my-orders-mobile-zain.png)

**Suspected root cause:** Fixed-width table in a scroll box without a mobile layout

**Proposed regression test:** At 390px My orders has no covered elements and Total is visible (suggested location: `test/ui/my-orders.spec.mjs`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Admin Orders: the search box and the two icon buttons have no accessible name

- **Surface:** ui · **UI:** Admin Portal · **Area:** Admin orders / accessibility · **Type:** accessibility
- **Roles:** admin
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

On Orders the search field has only a placeholder, and the refresh and clear-filters buttons contain only an icon with no text or label.

**Steps to reproduce**

1. Sign in to the Admin Portal as admin
2. Open Orders
3. Run the page audit (or inspect): input#search, button#refresh and button#clear-filters have no label or aria-label
4. Reload and repeat: same result

**Expected:** Every control has a name that screen readers can announce

**Actual:** 3 controls unnamed (2 of 2 loads)

**Evidence**

- [evidence/admin-orders-unnamed-controls.txt](evidence/admin-orders-unnamed-controls.txt)
- [screenshots/admin-orders-desktop.png](screenshots/admin-orders-desktop.png)

**Suspected root cause:** Icon-only buttons and placeholder-only field

**Proposed regression test:** Orders page controls all have accessible names (suggested location: `test/ui/admin-orders.spec.mjs`)

<a id="ISSUE-013"></a>

### ISSUE-013 🟡 Minor: Admin Reports: the sales summary takes about 4 seconds to respond

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

GET /api/admin/reports/sales took 4006 to 4007 ms on every call.

**Steps to reproduce**

1. Sign in over the API as admin
2. GET /api/admin/reports/sales and note the time

**Expected:** Under 3 seconds for a trivial read

**Actual:** About 4 seconds (2 of 2 attempts, 2 probes)

**Evidence**

- [evidence/api/admin-base-P062.json](evidence/api/admin-base-P062.json)
- [evidence/api/admin-base-P100.json](evidence/api/admin-base-P100.json)

**Suspected root cause:** Unknown; consistent delay

**Proposed regression test:** Sales summary answers within 3 seconds (suggested location: `test/reports.test.mjs`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in and New order (place order, confirmation total) | acme-1 | desktop | #1 | ✅ tested | order placed, wrong total seen |
| ui | My orders list and order detail | acme-1 | mobile | #1 | ✅ tested | order found in list; mobile layout defect |
| ui | Orders list, order page, status change | admin | desktop | #2 | ◐ partial | placed to processing only |
| cross | Client sees new status after admin change | acme-1 | - | #3 | ✅ tested | API only: detail updated, list stale; Client Portal list not re-opened |
| ui | Reports | admin | desktop | #4 | ✅ tested | figures shown after ~4 s |
| ui | Sign out | admin | desktop | #5 | ✅ tested | UI redirect works; session reuse fails over API |
| api | Sign out and session reuse | zain-1 | - | #5 | ✅ tested |  |
| ui | Help page (new) | acme-1 | mobile | - | ✅ tested | no issues |
| ui | My orders (Urdu client) | zain-1 | mobile | - | ✅ tested | layout defect; RTL names noted |
| ui | Customers page | admin | mobile | - | ✅ tested |  |
| ui | Orders page accessibility | admin | desktop | - | ✅ tested |  |
| api | All 13 operations: baseline, validation, role matrix | admin | - | - | ✅ tested |  |
| api | Order validation, errors, list, duplicates | acme-1 | - | - | ✅ tested |  |
| permissions | Cross-company order access and customers list | bright-1 | - | - | ✅ tested |  |
| business-rule | Discount and tax at 994.50, 1000.00, 1001.00 | acme-1 | - | - | ✅ tested |  |
| api | New operation: help articles; removed reset-password | anonymous | - | - | ✅ tested |  |
| ui | Forgot-password page | - | - | - | ⛔ not tested |  |
| ui | New order form validation and double click | - | - | - | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Forgot-password page**: Would send a real reset email; no safe mail catcher confirmed in this run
- **New order form validation and double click**: Not covered in the browser; checked only through the API
- **Admin Portal / full status path (shipped, delivered) and mobile order page**: Only placed to processing was exercised in the browser; later steps, cancelling and the order page on a phone not run
- **Client Portal / acme-2 and bright-1 browser sessions**: Same-company and other-company roles were tested through the API only
- **Admin Portal / mobile Orders and Customers table readability**: Audited at 390px with no layout leads; screenshots not reviewed visually

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-base | 107 | 92 | 8 | 11 | [data/api-results/admin-base.json](data/api-results/admin-base.json) |
| client-base | 65 | 53 | 12 | 21 | [data/api-results/client-base.json](data/api-results/client-base.json) |
| prices | 1 | 1 | 0 | 0 | [data/api-results/prices.json](data/api-results/prices.json) |
| reread | 2 | 1 | 1 | 1 | [data/api-results/reread-2.json](data/api-results/reread-2.json) |
| reread | 2 | 1 | 1 | 1 | [data/api-results/reread.json](data/api-results/reread.json) |
| rp-repeat | 1 | 0 | 1 | 1 | [data/api-results/rp-repeat.json](data/api-results/rp-repeat.json) |
| rules-isolation | 17 | 11 | 6 | 8 | [data/api-results/rules-isolation.json](data/api-results/rules-isolation.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

- Applied learning L-001: (Orders / totals) Tax is computed on the subtotal before the 5% discount, so orders at or above 1,000.00 are overcharged; check tax and total on both sides of the threshold
  - In this run: Applied L-001 to test discount and tax on both sides of the 1,000.00 threshold; the tax error is still there.
- Applied learning L-002: (Permissions) Order by-id reads, the admin customers list and API logout lack checks even though the orders list and reports are protected; probe each endpoint separately as other companies and client roles
  - In this run: Applied L-002 to probe order by-id reads, the customers list and logout separately as other companies and client roles.
- Applied learning L-003: (Admin Reports) The sales report API takes about 4 seconds, so wait for figures on the Reports page before judging it empty
  - In this run: Applied L-003 to wait for the Reports page figures before judging it.
- Applied learning L-004: (Orders / validation) Order creation has no server-side quantity or empty-items checks; run client-role validation plans, and QA- test orders then show in lists and report counts
  - In this run: Applied L-004 to run client-role validation plans.
- Skipped known false alarm FA-001: Client Portal New order: the product drop-down has no accessible name
  - In this run: Skipped FA-001: the New order product drop-down without an accessible name is accepted by the owner.

**Saved this run**

- New learning L-005: A client's order list can keep the old status after an admin changes it while the order detail updates; compare list and detail after an admin change
- New learning L-006: The spec and the server can drift: a route removed from the spec was still live, so compare source routes with the inventory changes
- New learning L-007: The browser viewport returns to desktop size after browser_close, so resize to 390px again after each sign-in before auditing mobile
- New learning L-008: Admin Orders has an unlabelled search box and two icon-only buttons without names
- Confirmed again L-001: Tax is computed on the subtotal before the 5% discount, so orders at or above 1,000.00 are overcharged; check tax and total on both sides of the threshold

**Memory after the run**

- Product map: 10 page(s) and 13 endpoint(s) known; 3 change(s) since the last run.
- Risk areas: 14 area(s) tracked; highest now: Authentication (score 20).
- Known false alarms skipped: FA-001.
- Learnings: 4 new, 1 confirmed again, 4 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Client of company A creates an order; client of company B GETs it and expects 403/404 → `test/orders.test.mjs`
- **ISSUE-002**: As a client, GET /admin/customers expects 403 → `test/permissions.test.mjs`
- **ISSUE-003**: Logout then GET /me with the same token expects 401 → `test/auth.test.mjs`
- **ISSUE-004**: Order with subtotal 1000.00 expects tax 95.00 and total 1045.00; 1001.00 expects 1046.05 → `test/orders.test.mjs`
- **ISSUE-005**: POST orders with quantity 0, 1001, 1.5 and empty items expects 400 → `test/orders.test.mjs`
- **ISSUE-006**: Warm client list, admin changes status, client list shows the new status → `test/status.test.mjs`
- **ISSUE-007**: Malformed JSON returns 400 without stack or path → `test/errors.test.mjs`
- **ISSUE-008**: page_size 0/-1 give 400; q='(' returns 200 → `test/orders-list.test.mjs`
- **ISSUE-009**: Two parallel identical creates yield one order → `test/orders.test.mjs`
- **ISSUE-010**: Every route in the server is in the spec and vice versa → `test/spec.test.mjs`
- **ISSUE-011**: At 390px My orders has no covered elements and Total is visible → `test/ui/my-orders.spec.mjs`
- **ISSUE-012**: Orders page controls all have accessible names → `test/ui/admin-orders.spec.mjs`
- **ISSUE-013**: Sales summary answers within 3 seconds → `test/reports.test.mjs`

## Notes

- Screenshots of the Customers page may show personal data; review before sharing. Automatic masking is not available in this version.
- Test orders with the QA- prefix were created in the demo data and left in place (this run is read-only on product code).
