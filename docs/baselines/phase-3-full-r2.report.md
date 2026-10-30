# QAMind Technical Report: run-20261030T075743Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T07:57:43.393Z |
| Project | ws (path-ws-281a1bd1b7dd) |
| Environment | local demo |
| Branch / commit | main @ 7fbaebe |
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
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (13 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (3 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (2 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **4**   🟠 Important: **5**   🟡 Minor: **3**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **6**
- API probes executed: **210** (45 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the stated rule
- **Risk:** Money is calculated wrongly
- **Entry point:** POST /api/orders as a client (source: openapi.yaml)
- **Expected results:** Invalid input refused with 400; total = subtotal - discount + tax, 5% discount at >= 1000.00
- **Exit condition:** Both sides of the 1,000.00 threshold and quantity 0/1/1000/1001 checked

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients only see their own company; only admins reach /admin
- **Risk:** Data exposure across customers
- **Entry point:** GET /orders, /orders/{id}, /admin/* with each role
- **Expected results:** 403/404 for wrong role or company
- **Exit condition:** Role matrix and cross-tenant chains run

### C3: Sessions: logout and expiry  `api`

- **Goal:** Logout revokes the token at once
- **Risk:** Session stays usable
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Token reuse after logout checked

### C4: Status changes visible to client  `cross`

- **Goal:** Admin status change shows to client after reload, no stale data
- **Risk:** Stale cache
- **Entry point:** PATCH /admin/orders/{id}/status; client GET before and after
- **Expected results:** New status visible immediately; invalid transitions 409
- **Exit condition:** Warm, change, re-read done

### C5: Client Portal critical flow 1,3,5  `ui`

- **Goal:** Place order, see confirmation and total, My Orders, sign out
- **Risk:** Users blocked, wrong totals
- **Entry point:** http://127.0.0.1:4102 as acme-1
- **Expected results:** Order placed, total matches rules
- **Exit condition:** Desktop + mobile, audit per page

### C6: Admin Portal critical flows 2,4  `ui`

- **Goal:** Find order, move status, view Reports and Customers
- **Risk:** Wrong status, wrong report, exposed personal data
- **Entry point:** http://127.0.0.1:4101 as admin
- **Expected results:** Status moves forward; report matches orders
- **Exit condition:** Every page desktop + mobile

### C7: Urdu / RTL tenant  `ui`

- **Goal:** Urdu content displays correctly
- **Risk:** Broken RTL layout
- **Entry point:** Client Portal as zain-1
- **Expected results:** Correct direction, alignment and no truncation
- **Exit condition:** Pages audited at both viewports

### C8: Forgot/reset password  `api`

- **Goal:** Reset flow behaves per spec
- **Risk:** Account enumeration, real emails
- **Entry point:** /auth/forgot-password
- **Expected results:** 202 always
- **Exit condition:** Sends email, so only checked if the mail catcher is confirmed local

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Any client account can read the full customer records (contact details, national ID, address, card digits)

- **Surface:** permissions · **Area:** Admin / Customers · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts

GET /api/admin/customers is documented as admin-only but returns HTTP 200 with every company's contact name, email, phone, national ID, address and card last-4 to client accounts from two different companies.

**Steps to reproduce**

1. Sign in over the API as acme-1 (a client)
2. GET /api/admin/customers (see evidence for the exact request and curl)
3. Observe HTTP 200 with all customers
4. Repeat as bright-1 (a different company): same result

**Expected:** HTTP 403 for any non-admin

**Actual:** HTTP 200 with every customer's personal data (both clients, reproduced on re-run)

**Evidence**

- [evidence/api/disc-D2.json](evidence/api/disc-D2.json)
- [evidence/api/disc-D3.json](evidence/api/disc-D3.json)

**Suspected root cause:** The customers route checks for a signed-in user but not for the admin role (the reports route does check it)

**Proposed regression test:** GET /api/admin/customers as a client and expect 403 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: A client can open another company's order by its id

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** acme-1, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts

GET /api/orders/{id} returns 200 with the full order to clients of other companies, although the spec says other companies' orders must answer 404. The list endpoint is correctly filtered.

**Steps to reproduce**

1. Sign in as acme-1 and place an order (reference QA-ISO-1); note its id
2. Sign in as bright-1 (different company) and GET /api/orders/<id>
3. Observe HTTP 200 and the order contents
4. Repeat as zain-1: same result

**Expected:** HTTP 404 for orders of another company

**Actual:** HTTP 200 with the other company's order (2 of 2 runs, two different foreign clients)

**Evidence**

- [evidence/api/rules-X4.json](evidence/api/rules-X4.json)
- [evidence/api/rules-X5.json](evidence/api/rules-X5.json)

**Suspected root cause:** The order detail handler does not compare the order's company with the caller's company

**Proposed regression test:** Client B GETs client A's order and expects 404 (suggested location: `test/orders.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Signing out does not end the session: the token keeps working

- **Surface:** api · **Area:** Authentication · **Type:** session
- **Roles:** bright-1, acme-1
- **Reproduced:** 2 of 2 attempts

After POST /auth/logout (204) or clicking Sign out in the Client Portal, the same token still gets 200 from /me and /orders.

**Steps to reproduce**

1. Sign in as bright-1 over the API
2. POST /api/auth/logout and get 204
3. GET /api/me with the same token
4. Observe HTTP 200 (also /orders). In the Client Portal: sign in as acme-1, copy the session token in the page, click Sign out, call /api/me with it: 200

**Expected:** HTTP 401 immediately after sign-out

**Actual:** HTTP 200; the token works until it expires

**Evidence**

- [evidence/api/rules-L2.json](evidence/api/rules-L2.json)
- [evidence/api/rules-L3.json](evidence/api/rules-L3.json)

**Suspected root cause:** Logout does not add the token to a revocation list

**Proposed regression test:** Log in, log out, then GET /me with the token and expect 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Tax is calculated on the full subtotal instead of the discounted subtotal

- **Surface:** business-rule · **Area:** Orders / pricing · **Type:** money
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

For orders at or above 1,000.00 the tax is 10% of the undiscounted subtotal, so customers are overcharged. Order of 60 x $18.99 shows tax $113.94, total $1,196.37; the rules give tax $108.24, total $1,190.67. Orders below 1,000 are correct.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. New order: reference QA-UI-1, Heavy Duty Stapler, quantity 60, Place order
3. Confirmation says Total: $1,196.37; the order detail shows Discount -$56.97 and Tax $113.94
4. Same via API: POST /api/orders 80 x p-102 gives subtotal 100000, discount 5000, tax 10000, total 105000 (expected tax 9500, total 104500)

**Expected:** Tax = 10% of (subtotal - discount); total 119067 cents for the UI order

**Actual:** Tax = 10% of the subtotal; total 119637 cents (every order with a discount is too high by 5% of 10% of the subtotal)

**Evidence**

- [evidence/api/rules-B2.json](evidence/api/rules-B2.json)
- [evidence/api/rules-B3.json](evidence/api/rules-B3.json)
- [screenshots/client-order-confirmation.png](screenshots/client-order-confirmation.png)

**Suspected root cause:** Tax computed from the subtotal rather than subtotal minus discount in the pricing function

**Proposed regression test:** Order with subtotal 100000 expects tax 9500 and total 104500 (suggested location: `test/pricing.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🟠 Important: The API accepts invalid order quantities and empty orders

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

POST /api/orders returns 201 for quantity 0, -3, 1001, 1.5 and for an order with no items, producing negative or zero totals (a -3 quantity order shows a total of -$21.45 in both portals).

**Steps to reproduce**

1. Sign in as acme-1
2. POST /api/orders with items quantity -3 (see evidence for the request)
3. Observe HTTP 201; repeat with 0, 1001, 1.5 and items: []
4. The negative order appears in My Orders and the admin Orders list

**Expected:** HTTP 400: whole number 1 to 1000, at least one item

**Actual:** HTTP 201 and the order is stored

**Evidence**

- [evidence/api/rules-B7.json](evidence/api/rules-B7.json)
- [evidence/api/client-P043.json](evidence/api/client-P043.json)
- [evidence/api/client-P044.json](evidence/api/client-P044.json)
- [evidence/api/client-P045.json](evidence/api/client-P045.json)
- [evidence/api/client-P046.json](evidence/api/client-P046.json)

**Suspected root cause:** Quantity and items checks are missing server-side

**Proposed regression test:** POST quantities 0, -3, 1001, 1.5 and empty items; expect 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Order list shows a stale status after an admin changes it

- **Surface:** cross · **Area:** Orders / My Orders · **Type:** stale-data
- **Roles:** acme-1, acme-2, admin
- **Reproduced:** 2 of 2 attempts

After an admin moves an order to Processing, the order detail shows Processing but the order list (My Orders, and the list API) keeps showing Placed for the whole company.

**Steps to reproduce**

1. As acme-1 place an order QA-STALE-1 and read the list (warm)
2. As admin PATCH the order status to processing
3. As acme-1 GET the order: processing; GET /orders?q=QA-STALE-1: still placed
4. UI: Client Portal My Orders still shows Placed for QA-UI-1 while its detail shows Processing, also for acme-2

**Expected:** List and detail agree immediately

**Actual:** The list is stale (it self-corrected in neither check within the run)

**Evidence**

- [evidence/api/stale-T5.json](evidence/api/stale-T5.json)
- [evidence/api/stale-T6.json](evidence/api/stale-T6.json)

**Suspected root cause:** List responses are cached per company and not cleared on a status change

**Proposed regression test:** Warm list, PATCH status, re-read list; expect the new status (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Order list search and page size crash the server for some inputs

- **Surface:** api · **Area:** Orders list · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts

GET /api/orders?q=( or q=\ and page_size=0 return HTTP 500, and page_size=-1 returns 200 with page_size -1. The Admin Portal search box shows an error when typing ( .

**Steps to reproduce**

1. Sign in as acme-1 (or admin)
2. GET /api/orders?q=(  then ?q=\  then ?page_size=0
3. Observe HTTP 500
4. In the Admin Portal Orders page type ( in Search and press Enter: error in console, no results

**Expected:** Searches treated as plain text; invalid page_size gives 400

**Actual:** 500 server error for q=( , q=\ and page_size=0; page_size=-1 accepted

**Evidence**

- [evidence/api/client-P024.json](evidence/api/client-P024.json)
- [evidence/api/client-P028.json](evidence/api/client-P028.json)
- [evidence/api/client-P019.json](evidence/api/client-P019.json)
- [evidence/api/client-P020.json](evidence/api/client-P020.json)
- [screenshots/admin-search-paren.png](screenshots/admin-search-paren.png)
- [evidence/admin-search-paren-console.txt](evidence/admin-search-paren-console.txt)

**Suspected root cause:** The search text is used as a regular expression without escaping; page_size is not range-checked

**Proposed regression test:** GET /orders with q=( and page_size=0/-1 and expect no 500 (suggested location: `test/orders.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Malformed requests return a stack trace and internal server file paths

- **Surface:** api · **Area:** Error handling · **Type:** security
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts

Invalid JSON sent to /auth/login or /orders returns 400 whose body includes a stack trace and the server's file system paths, contradicting the spec.

**Steps to reproduce**

1. POST /api/auth/login with body {"broken":
2. Observe 400 with error.trace containing file paths
3. Repeat on POST /api/orders

**Expected:** Only code and message

**Actual:** error.trace with stack trace and source paths

**Evidence**

- [evidence/api/client-P007.json](evidence/api/client-P007.json)
- [evidence/api/client-P048.json](evidence/api/client-P048.json)

**Suspected root cause:** The JSON parse error handler returns the stack

**Proposed regression test:** Send malformed JSON and assert no trace or path in the body (suggested location: `test/errors.test.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: My Orders on a phone: the filter bar covers the first order and the total and View link are cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My Orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts

At 390px wide the Status filter and New order button overlap the first row, and the table is wider than the screen so the total is clipped and the View link is off-screen with no cue.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Resize to 390x844 and open My orders
3. Observe the first order row hidden under the filter bar, totals cut off
4. Reload: same (audit lists the covered row)

**Expected:** No overlap; all columns reachable

**Actual:** First row covered; total and View clipped (table 457px in a 359px box)

**Evidence**

- [screenshots/client-myorders-mobile.png](screenshots/client-myorders-mobile.png)

**Suspected root cause:** Sticky or fixed toolbar and a fixed-width table without responsive layout

**Proposed regression test:** At 390px width the orders table has no covered rows (suggested location: `test/ui/my-orders.spec.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟡 Minor: Admin sales report takes about 4 seconds to load

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts

GET /api/admin/reports/sales consistently takes about 4 seconds; the Reports page is blank until it finishes.

**Steps to reproduce**

1. Sign in as admin
2. GET /api/admin/reports/sales
3. Observe about 4000 ms, twice
4. Admin Portal Reports shows only the title for several seconds

**Expected:** Under 3 seconds

**Actual:** 4004 ms and 4005 ms

**Evidence**

- [evidence/api/admin-P061.json](evidence/api/admin-P061.json)
- [evidence/api/admin-P093.json](evidence/api/admin-P093.json)

**Suspected root cause:** Slow aggregation or an artificial delay in the report

**Proposed regression test:** Sales report responds under 3 seconds (suggested location: `test/reports.test.js`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: Some form controls have no label for screen readers

- **Surface:** ui · **UI:** Admin Portal · **Area:** Admin Orders search and filters; Client New order · **Type:** accessibility
- **Roles:** admin, acme-1
- **Browser / viewport:** Chromium / desktop 1366x768 and mobile 390x844
- **Reproduced:** 2 of 2 attempts

The Admin Orders search box has only a placeholder, the refresh and clear-filter icon buttons have no name, and the product dropdown on the Client New order page has no label.

**Steps to reproduce**

1. Sign in as admin, open Orders, run the page audit
2. Observe unnamed search input and two icon buttons (desktop and mobile)
3. Client Portal New order: the product select is unnamed

**Expected:** Every control has an accessible name

**Actual:** Four controls unnamed

**Evidence**

- [screenshots/admin-orders-mobile.png](screenshots/admin-orders-mobile.png)

**Suspected root cause:** Missing label or aria-label attributes

**Proposed regression test:** Accessibility check that every input and button has a name (suggested location: `test/ui/a11y.spec.js`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Urdu text is not marked right-to-left

- **Surface:** ui · **UI:** Client Portal · **Area:** Client My Orders and Admin Customers · **Type:** i18n
- **Roles:** zain-1, admin
- **Browser / viewport:** Chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts

Urdu references and the Urdu company name sit in left-to-right, left-aligned cells; the pages have no dir attribute.

**Steps to reproduce**

1. Sign in to the Client Portal as zain-1 and view My orders
2. Audit lists the three Urdu references as Urdu in an LTR container
3. Admin Customers lists the Urdu company name the same way

**Expected:** Urdu text displayed with right-to-left direction

**Actual:** Left-to-right, left aligned

**Evidence**

- [screenshots/zain-myorders-desktop.png](screenshots/zain-myorders-desktop.png)

**Suspected root cause:** No dir=auto on text cells

**Proposed regression test:** Urdu cells have dir=auto or rtl (suggested location: `test/ui/rtl.spec.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Placing the same order twice at once creates two orders** (api, tried 2×): Two identical parallel POST /orders both returned 201. The product may not intend to block repeat orders, and I did not check how many orders were stored. Why unconfirmed: Intended behaviour unclear and the stored count was not checked

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| api | All 13 endpoints baseline, validation, role matrix | admin | - | - | ✅ tested | 2 password endpoints excluded (email) |
| api | Orders, validation and pricing rules | acme-1 | - | #1 | ✅ tested | both sides of 1,000.00 |
| permissions | Tenant and role isolation | bright-1 | - | - | ✅ tested |  |
| api | Sign out and session | bright-1 | - | #5 | ✅ tested |  |
| cross | Status change visible to client | acme-1 | - | #3 | ✅ tested |  |
| ui | Sign in, New order, confirmation, My Orders, order detail | acme-1 | desktop | #1 | ✅ tested |  |
| ui | My Orders | acme-1 | mobile | - | ✅ tested |  |
| ui | New order and order detail | acme-1 | mobile | - | ⛔ not tested |  |
| ui | My Orders (Urdu) | zain-1 | desktop | - | ✅ tested |  |
| ui | Sign out | acme-1 | desktop | #5 | ✅ tested |  |
| ui | Order status after admin change | acme-1 | desktop | #3 | ✅ tested |  |
| ui | Orders list, order detail, status change | admin | desktop | #2 | ◐ partial | placed to processing only |
| ui | Orders list, order detail, Customers | admin | mobile | - | ✅ tested |  |
| ui | Reports | admin | desktop | #4 | ✅ tested | totals reconcile with by-client counts |
| ui | Customers | admin | desktop | - | ✅ tested |  |
| ui | Reports | admin | mobile | - | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Forgot and reset password (API and Client Portal pages)**: Would send email; no mail catcher confirmed safe in this session
- **New order and order detail**: Not reached in this session
- **Reports**: Not reached in this session; only Orders, Customers and Order detail were audited on mobile
- **UI sessions: expired session and direct URL access by a client to Admin Portal pages and other companies' orders**: Not run in the browser; tenant and role isolation were tested through the API only
- **Client Portal as acme-2 and bright-1 in the browser**: Only acme-1 and zain-1 were used in the browser; the other accounts were tested over the API
- **Admin order status moves beyond Processing in the UI**: Moves to Shipped and Delivered were tested over the API only

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin | 100 | 85 | 8 | 11 | [data/api-results/admin.json](data/api-results/admin.json) |
| client | 64 | 52 | 12 | 21 | [data/api-results/client.json](data/api-results/client.json) |
| disc | 4 | 2 | 2 | 2 | [data/api-results/disc.json](data/api-results/disc.json) |
| rules | 35 | 28 | 7 | 9 | [data/api-results/rules.json](data/api-results/rules.json) |
| stale | 7 | 5 | 2 | 2 | [data/api-results/stale.json](data/api-results/stale.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: GET /api/admin/customers as a client and expect 403 → `test/permissions.test.js`
- **ISSUE-002**: Client B GETs client A's order and expects 404 → `test/orders.test.js`
- **ISSUE-003**: Log in, log out, then GET /me with the token and expect 401 → `test/auth.test.js`
- **ISSUE-004**: Order with subtotal 100000 expects tax 9500 and total 104500 → `test/pricing.test.js`
- **ISSUE-005**: POST quantities 0, -3, 1001, 1.5 and empty items; expect 400 → `test/orders.test.js`
- **ISSUE-006**: Warm list, PATCH status, re-read list; expect the new status → `test/orders.test.js`
- **ISSUE-007**: GET /orders with q=( and page_size=0/-1 and expect no 500 → `test/orders.test.js`
- **ISSUE-008**: Send malformed JSON and assert no trace or path in the body → `test/errors.test.js`
- **ISSUE-010**: At 390px width the orders table has no covered rows → `test/ui/my-orders.spec.js`
- **ISSUE-009**: Sales report responds under 3 seconds → `test/reports.test.js`
- **ISSUE-011**: Accessibility check that every input and button has a name → `test/ui/a11y.spec.js`
- **ISSUE-012**: Urdu cells have dir=auto or rtl → `test/ui/rtl.spec.js`
