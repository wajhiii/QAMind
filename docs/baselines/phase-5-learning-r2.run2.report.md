# QAMind Technical Report: run-20261102T052654Z

| | |
|---|---|
| Date (UTC) | 2026-11-02T05:26:54.905Z |
| Project | ws (path-ws-6bcbb37395a2) |
| Environment | local demo |
| Branch / commit | main @ 3d58158 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 8m 10s |
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
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (6 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **6**   🟡 Minor: **2**
- Unconfirmed (not reproduced twice): **3**
- Areas not tested: **5**
- API probes executed: **61** (36 produced a signal worth a look)

## What changed since the last run

- Page seen for the first time: Client Portal `/help.html` (Help centre) (new, or not reached by earlier runs)
- New endpoint: `GET /help` (List help articles)
- Endpoint removed: `POST /auth/reset-password` (Choose a new password with a reset token)

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Key journeys tested | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 6 | 2 | 3 | 5/5 | 17 | 0 | 5 |
| run-20261102T052116Z | full | 5 | 3 | 2 | 4 | 3/5 | 9 | 2 | 5 |

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the stated rule
- **Risk:** Money wrong; invalid quantities accepted (memory: Orders / totals, Orders / validation)
- **Entry point:** POST /api/orders as acme-1
- **Expected results:** Quantity whole 1..1000, at least one item; total = subtotal - 5% discount (>= 1000.00) + 10% tax on discounted subtotal
- **Exit condition:** 79/80 unit threshold, quantity bounds and empty items checked

### C2: Tenant and role isolation  `permissions`

- **Goal:** Companies never see each other's data; only admins reach admin data
- **Risk:** Order detail and admin customers readable by any user (memory: Orders / isolation, Admin / customers)
- **Entry point:** GET /api/orders/{id}, GET /api/admin/customers as clients
- **Expected results:** 403/404 for other company and for clients on admin endpoints
- **Exit condition:** Chain tests for acme-2 (same company), bright-1 and zain-1 done

### C3: Sign-in, sign-out and password reset  `api`

- **Goal:** Logout ends the session; reset flow is documented and safe
- **Risk:** Token valid after logout (memory: Auth / sessions); reset-password route is no longer in the spec but still answers; forgot-password link built from a missing field
- **Entry point:** POST /api/auth/logout then GET /api/me; POST /api/auth/reset-password
- **Expected results:** 401 after logout; every reachable route documented
- **Exit condition:** Logout and reset-password probed

### C4: Orders list, errors and new Help endpoint  `api`

- **Goal:** List handles odd input; errors reveal nothing internal; GET /help works
- **Risk:** page_size 0 and regex characters in q cause 500 (memory: Orders / list, Errors); /help is new
- **Entry point:** GET /api/orders, GET /api/help
- **Expected results:** 4xx for bad input, generic error messages
- **Exit condition:** page_size boundaries, q with ( and \, malformed JSON, /help checked

### C5: Status change visible to client (warm, change, re-read)  `cross`

- **Goal:** Admin status change shows in the client's list and detail at once
- **Risk:** List cache is stale (memory: Orders / status)
- **Entry point:** PATCH /api/admin/orders/{id}/status then GET /api/orders as client
- **Expected results:** New status immediately
- **Exit condition:** API and UI reload both checked

### C6: Critical flows in both portals  `ui`

- **Goal:** Place order, admin moves status, client sees it, reports, sign out
- **Risk:** Core journeys break; new Help page and nav link
- **Entry point:** Client Portal /new-order.html, Admin Portal /orders.html
- **Expected results:** Flows 1 to 5 from the config work end to end
- **Exit condition:** All pages visited on desktop and mobile with audit, Help page included

### C7: Duplicate submission and reports  `api`

- **Goal:** Double submit does not create two orders; sales summary correct
- **Risk:** Duplicates (memory: Orders / duplicates); reports slow is a known accepted behaviour (FA-001)
- **Entry point:** POST /api/orders with parallel repeat; GET /api/admin/reports/sales
- **Expected results:** One order per intent; report figures equal order totals
- **Exit condition:** Parallel pair sent; report compared with orders

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Tax is calculated on the pre-discount subtotal for orders that earn the 5% discount

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / totals · **Type:** calculation
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

For orders with a subtotal of 1,000.00 or more the discount is applied but tax is 10% of the undiscounted subtotal, so the total is too high. The Client Portal confirmation and order pages show the wrong total.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with p-102 x80 (subtotal 1000.00), probe R02 in plans/main.json
3. Observe tax_cents 10000 and total_cents 105000
4. Repeat with p-107 x12 (probe R03): tax_cents 10799, total_cents 113388
5. In the UI: Client Portal > New order, 12 x Printer Toner Cartridge, Place order; the confirmation says Total: $1,133.88 and the order page shows Tax $107.99

**Expected:** Tax = 10% of the discounted subtotal: 1000.00 order -> tax 95.00, total 1,045.00; 1,079.88 order -> discount 53.99, tax 102.59, total 1,128.48

**Actual:** Tax 100.00 / total 1,050.00 and tax 107.99 / total 1,133.88. Orders below 1,000.00 (79 x p-102) are correct.

**Evidence**

- [evidence/api/main-R02.json](evidence/api/main-R02.json)
- [evidence/api/main-R03.json](evidence/api/main-R03.json)
- [screenshots/client-new-order-confirmation.png](screenshots/client-new-order-confirmation.png)

**Suspected root cause:** Tax is computed from the subtotal instead of subtotal minus discount (src/pricing.mjs)

**Proposed regression test:** Order at 1000.00 and above expects total = (subtotal - discount) * 1.10 (suggested location: `test/orders.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Any signed-in customer can read every customer's private records

- **Surface:** permissions · **Area:** Admin / customers · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/admin/customers returns 200 with all customers' records to client roles; the spec and rules say admins only.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/admin/customers (probe P06 in plans/main.json)
3. Observe 200 with records of other companies; repeat as bright-1 (probe I11) with the same result

**Expected:** HTTP 403 for any client role

**Actual:** HTTP 200 with the full customer list including other companies

**Evidence**

- [evidence/api/main-P06.json](evidence/api/main-P06.json)
- [evidence/api/main-I11.json](evidence/api/main-I11.json)

**Suspected root cause:** Admin role check missing on the customers route (roles option not set in src/api.mjs)

**Proposed regression test:** As a client, GET /admin/customers expects 403 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: A customer can open another company's order

- **Surface:** permissions · **UI:** Client Portal · **Area:** Orders / isolation · **Type:** permissions
- **Roles:** bright-1, zain-1
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/orders/{id} returns 200 with the order to users of other companies, although the orders list is correctly scoped. The Client Portal order page shows it.

**Steps to reproduce**

1. Sign in as acme-1 over the API and POST an order with reference QA-iso, capture its id (probe I01)
2. Sign in as bright-1 and GET /api/orders/{id} (probe I03); repeat as zain-1 (probe I04)
3. Observe 200 and the order body
4. In the UI: sign in to the Client Portal as bright-1 and open order.html?id=<that id>; the page opens Order QA-ui-flow1 of Acme Traders

**Expected:** HTTP 403 or 404 for a user of another company

**Actual:** HTTP 200 with the other company's order

**Evidence**

- [evidence/api/main-I03.json](evidence/api/main-I03.json)
- [evidence/api/main-I04.json](evidence/api/main-I04.json)
- [screenshots/client-other-company-order.png](screenshots/client-other-company-order.png)

**Suspected root cause:** getOrder looks the order up by id with no company check

**Proposed regression test:** Order created by company A requested by company B expects 403 or 404 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Signing out does not end the session

- **Surface:** api · **Area:** Auth / sessions · **Type:** auth
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /api/auth/logout returns 204 the same bearer token still works on GET /api/me and GET /api/orders. The Client Portal and Admin Portal sign-out buttons only clear the browser side.

**Steps to reproduce**

1. Sign in as zain-1 over the API
2. POST /api/auth/logout (probe A01), observe 204
3. GET /api/me with the same token (probe A02) and GET /api/orders (probe A03)
4. Observe 200 on both

**Expected:** HTTP 401 once signed out

**Actual:** HTTP 200 with the user's data

**Evidence**

- [evidence/api/main-A02.json](evidence/api/main-A02.json)
- [evidence/api/main-A03.json](evidence/api/main-A03.json)

**Suspected root cause:** logout only sets endedAt on the session and authenticate() never checks it

**Proposed regression test:** After logout, GET /me with the same token expects 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders accept zero, negative, fractional and above-limit quantities and empty item lists

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /api/orders returns 201 for quantity 0, -3, 1.5 and 1001 and for an empty items array, against the 1 to 1,000 whole-number rule. Negative quantities give negative totals and empty orders are created with a total of 0.00.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with quantity 0 (probe V01), 1001 (V02), 1.5 (V03), -3 (R07) and items [] (V04)
3. Observe HTTP 201 each time

**Expected:** HTTP 400 naming the quantity or items field

**Actual:** HTTP 201 and the order is created (visible in both order lists, e.g. QA-empty at $0.00 and QA-qfrac at $10.73)

**Evidence**

- [evidence/api/main-V01.json](evidence/api/main-V01.json)
- [evidence/api/main-V02.json](evidence/api/main-V02.json)
- [evidence/api/main-V03.json](evidence/api/main-V03.json)
- [evidence/api/main-V04.json](evidence/api/main-V04.json)
- [evidence/api/main-R07.json](evidence/api/main-R07.json)

**Suspected root cause:** validateOrderInput only checks that quantity is a number and does not check range, integer or empty list

**Proposed regression test:** Quantities 0, -1, 1.5, 1001 and an empty items list expect 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: The orders list fails with a system error for page size 0 and for search text containing ( or \

- **Surface:** api · **UI:** Admin Portal · **Area:** Orders / list · **Type:** robustness
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

GET /api/orders returns 500 for page_size=0 and for q=( or q=\ because the search text is used as a regular expression and a page size of 0 passes validation. In the Admin Portal, typing ( in the Orders search shows 'Could not load orders (500).'

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?page_size=0 (probe L01), q=( (L04), q=\ (L05)
3. Observe HTTP 500
4. In the UI: Admin Portal > Orders, type ( in the search box and press Enter; the red message 'Could not load orders (500).' appears

**Expected:** HTTP 400 for page_size 0; HTTP 200 with a literal search for punctuation

**Actual:** HTTP 500 for all three

**Evidence**

- [evidence/api/main-L01.json](evidence/api/main-L01.json)
- [evidence/api/main-L04.json](evidence/api/main-L04.json)
- [evidence/api/main-L05.json](evidence/api/main-L05.json)
- [screenshots/admin-orders-search-paren.png](screenshots/admin-orders-search-paren.png)

**Suspected root cause:** new RegExp(q) on user text, and the page_size lower bound is missing in parseListQuery

**Proposed regression test:** page_size=0 expects 400; q='(' expects 200 or 400, never 500 (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Error responses reveal internal technical details

- **Surface:** api · **Area:** Errors · **Type:** leakage
- **Roles:** anonymous
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

A malformed JSON body to POST /api/auth/login returns 400 whose body includes a stack trace, server file paths and a stack field.

**Steps to reproduce**

1. POST /api/auth/login with body '{' and Content-Type application/json (probe E01)
2. Read the response body

**Expected:** A short generic message with no stack or file paths

**Actual:** Body contains a stack trace and server source paths

**Evidence**

- [evidence/api/main-E01.json](evidence/api/main-E01.json)

**Suspected root cause:** The body parser error is passed to the response with its stack (src/http.mjs)

**Proposed regression test:** Malformed JSON expects 400 and a body without 'stack' or file paths (suggested location: `test/errors.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: A customer's order list keeps showing an old status after an admin changes it

- **Surface:** cross · **UI:** Client Portal · **Area:** Orders / status · **Type:** stale-data
- **Roles:** admin, acme-1, acme-2
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

After a customer has opened their orders list, an admin status change shows on the order detail but the customer's list keeps the old status (the list is cached per company for 10 minutes and not refreshed on a status change). Seen over the API for a colleague of the same company and in the Client Portal.

**Steps to reproduce**

1. Sign in as acme-1 in the Client Portal, place order QA-ui-flow1 and open My orders (status Placed)
2. In the Admin Portal open that order and click Update status to Processing (message 'Status updated to processing.')
3. Sign in again as acme-1 and open the order page: it shows Processing
4. Open My orders and reload: the row still shows Placed (second load the same)
5. Over the API the same happens: acme-2 warmed list (W01), admin PATCH (S02), list probe S03b lacks 'processing'

**Expected:** My orders shows Processing straight after the change

**Actual:** My orders shows Placed while the order page shows Processing

**Evidence**

- [evidence/api/main-S03b.json](evidence/api/main-S03b.json)
- [screenshots/client-my-orders-stale.png](screenshots/client-my-orders-stale.png)

**Suspected root cause:** listClientOrders caches copies of orders per company for 10 minutes and updateOrderStatus does not invalidate the cache

**Proposed regression test:** Warm the client list, change the status as admin, re-read the list and expect the new status (suggested location: `test/orders.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: A route that was removed from the documentation still works: reset-password

- **Surface:** api · **Area:** Auth / password reset · **Type:** spec-drift
- **Roles:** anonymous
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

POST /api/auth/reset-password was removed from openapi.yaml in the working changes but the server still answers it (400 invalid_token for a made-up token and 400 for a short password). The Client Portal still has a reset-password page that relies on it.

**Steps to reproduce**

1. POST /api/auth/reset-password with a made-up token and an 8+ character password (probe N03 and X01)
2. Observe HTTP 400 with code invalid_token, not 404
3. Compare with openapi.yaml, which no longer lists the path

**Expected:** Either the path is documented, or it is removed and answers 404

**Actual:** The path is reachable and active but undocumented

**Evidence**

- [evidence/api/main-N03.json](evidence/api/main-N03.json)
- [evidence/api/extra-X01.json](evidence/api/extra-X01.json)
- [evidence/api/extra-X02.json](evidence/api/extra-X02.json)

**Suspected root cause:** The route was left in ROUTES in src/api.mjs while its spec entry was deleted

**Proposed regression test:** Every route in ROUTES appears in openapi.yaml (contract test) (suggested location: `test/contract.test.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: On a phone-width screen the New order form runs off the edge and Place order cannot be seen

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / New order · **Type:** layout
- **Roles:** acme-1, bright-1
- **Browser / viewport:** chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

At 390x844 the New order page is 555 px wide: the reference and note boxes, the quantity box, Remove and the Place order button sit past the right edge and the page scrolls sideways.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 and set the window to 390x844
2. Open new-order.html (fresh load)
3. Run the page audit: scrollWidth 555 vs 390 and Place order at x 435 to 555
4. Repeat in a new profile as bright-1: same numbers

**Expected:** The form fits the screen width and Place order is visible

**Actual:** Fields are cut off and the Place order button is outside the visible area

**Evidence**

- [evidence/client-my-orders-mobile-covered.txt](evidence/client-my-orders-mobile-covered.txt)
- [screenshots/client-new-order-mobile.png](screenshots/client-new-order-mobile.png)

**Suspected root cause:** The line row has a fixed minimum width so the form container overflows at narrow widths

**Proposed regression test:** At 390 px width the New order page does not scroll sideways and Place order is inside the viewport (suggested location: `test/e2e/new-order.mobile.spec.js`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟠 Important: On a phone-width screen the newest order in My orders is hidden under the filter bar and cannot be tapped

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

At 390x844 the orders table scrolls inside its own box that starts underneath the status filter and New order button. The first row (the newest order) is covered by the toolbar, the table header is hidden and the Total column is cut off at the right.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 and set the window to 390x844
2. Open my-orders.html (fresh load, twice)
3. Page audit lists the newest order link and row as covered by the toolbar
4. Click the newest order link: blocked, 'toolbar intercepts pointer events'

**Expected:** All rows including the newest are visible and tappable

**Actual:** The newest row is overlapped and the click is blocked

**Evidence**

- [evidence/client-my-orders-mobile-covered.txt](evidence/client-my-orders-mobile-covered.txt)
- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** The table wrapper overlaps the toolbar when it wraps at narrow widths

**Proposed regression test:** At 390 px the first order row is not covered and is clickable (suggested location: `test/e2e/my-orders.mobile.spec.js`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Several controls have no name for screen readers: product picker, order search and two icon buttons

- **Surface:** ui · **UI:** Admin Portal · **Area:** Both portals / accessibility · **Type:** accessibility
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

The page audit finds controls with no accessible name: the product select on Client Portal New order, and on Admin Portal Orders the search box (placeholder only), the refresh icon button and the clear-filters icon button.

**Steps to reproduce**

1. Open Client Portal new-order.html as acme-1 and run the page audit (desktop and mobile): select[name=product] has no name
2. Open Admin Portal orders.html as admin and run the page audit (desktop twice and mobile): input#search, #refresh and #clear-filters are listed

**Expected:** Each control has a label or aria-label

**Actual:** The listed controls have no accessible name

**Evidence**

- [evidence/ui-unnamed-controls.txt](evidence/ui-unnamed-controls.txt)
- [screenshots/admin-orders-desktop.png](screenshots/admin-orders-desktop.png)

**Suspected root cause:** Missing label and aria-label attributes

**Proposed regression test:** Accessibility check that every form control and icon button has an accessible name (suggested location: `test/e2e/a11y.spec.js`)

<a id="ISSUE-013"></a>

### ISSUE-013 🟡 Minor: Submitting the same order twice at once creates two orders

- **Surface:** api · **Area:** Orders / duplicates · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C7

Two identical POST /api/orders requests sent in parallel both return 201 and two separate orders appear in the list. The spec documents no duplicate protection. Unsure whether duplicates are intended, so rated by likely impact.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. Send POST /api/orders twice in parallel with reference QA-dup (probe D01)
3. GET /api/orders?q=QA-dup (probe D02)
4. Observe separate order ids for the same reference and items

**Expected:** One order, or the second refused as a duplicate

**Actual:** Two orders created

**Evidence**

- [evidence/api/main-D01.json](evidence/api/main-D01.json)
- [evidence/api/main-D02.json](evidence/api/main-D02.json)

**Suspected root cause:** No idempotency or duplicate-reference check in createOrder

**Proposed regression test:** Two parallel identical orders expect one order or a 409 (suggested location: `test/orders.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Password reset email link may contain 'undefined' instead of the reset code** (api, tried 0×): Reading src/api.mjs, forgotPassword stores a new reset code in a local variable but builds the email link from user.resetToken, which is not set anywhere, so the link would end in token=undefined. The link also points to /reset while the client page is reset-password.html. The email itself was not opened. Why unconfirmed: No way to read the local mail catcher in this run, so the email was never seen; source reading only
- **UNCONFIRMED-02: Order references starting with = + - or @ are exported unchanged in the Admin Portal CSV export** (ui, tried 0×): In public/admin/orders.js the CSV cell escaping only quotes commas, quotes and line breaks, so a reference such as =HYPERLINK(...) would be written as a spreadsheet formula. Not demonstrated because test data must start with QA-, so the reference cannot start with a formula character, and the downloaded file was not opened. Why unconfirmed: Source reading only; cannot create a reference that starts with = under the QA- prefix rule
- **UNCONFIRMED-03: Urdu company name is left-aligned in the Admin Portal tables** (ui, tried 1×): The page audit on Admin Portal Customers lists the Urdu company name in a left-to-right cell with left alignment. It is shown in a mixed English table where this may be intended. Why unconfirmed: Seen once on one page and not judged wrong against any stated rule

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| api | Orders: validation, totals, discount threshold | acme-1 | - | #1 | ✅ tested | 79/80 units, 12 x toner, rounding, multi-line, quantity bounds, mass assignment |
| api | Orders: status changes and sign-out | admin | - | #2 | ✅ tested | allowed and refused transitions, logout |
| api | Tenant and role isolation | bright-1 | - | - | ✅ tested | order detail, list, status change, customers; acme-2, zain-1 and anonymous too |
| api | Orders list, errors and Help endpoint | acme-1 | - | - | ✅ tested | page size, search characters, malformed JSON, new GET /help |
| api | Sales summary and customers | admin | - | #4 | ✅ tested | role matrix; figures agree with order totals |
| api | Sign-out | zain-1 | - | #5 | ✅ tested | token still works after logout |
| ui | Sign in, New order and confirmation | acme-1 | desktop | #1 | ✅ tested | 12 x toner order |
| ui | My orders and order page | acme-1 | desktop | #3 | ✅ tested | status after admin change |
| ui | New order, My orders, Help | acme-1 | mobile | #1 | ✅ tested | audit, screenshots, repeated |
| ui | Help page (new) | acme-1 | desktop | - | ✅ tested | audit clean, no console errors; page needs sign-in while the endpoint is public |
| ui | Other company's order page | bright-1 | desktop | - | ✅ tested | opened by changing the address |
| ui | Sign out | acme-1 | desktop | #5 | ✅ tested | returns to sign-in, protected pages redirect |
| ui | Orders list and order page with status update | admin | desktop | #2 | ✅ tested | Processing set, search with ( fails |
| ui | Reports | admin | desktop | #4 | ✅ tested | figures add up to the order totals |
| ui | Customers | admin | desktop | - | ✅ tested | audit only |
| ui | Orders, order page, Reports, Customers | admin | mobile | - | ✅ tested | audit; only unnamed controls on Orders |
| ui | Sign out | admin | desktop | #5 | ✅ tested | returns to sign-in; client login refused in the Admin Portal |
| ui | Urdu company (zain-1) screens | zain-1 | desktop | - | ⛔ not tested |  |
| ui | Password reset pages | acme-1 | desktop | - | ⛔ not tested |  |
| ui | Export CSV | admin | desktop | - | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Urdu company (zain-1) screens**: Not covered in this pass: zain-1 was only used over the API; the right-to-left screens were not driven in the browser
- **Password reset pages**: Would send email and the local mail catcher cannot be read in this run
- **Export CSV**: The download was not triggered or opened; only the export code was read
- **Client Portal order page on a phone-width screen**: Not covered in this pass
- **Keyboard-only use and expired sign-ins in the portals**: Not covered in this pass

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| extra | 2 | 0 | 2 | 2 | [data/api-results/extra.json](data/api-results/extra.json) |
| main | 59 | 39 | 20 | 34 | [data/api-results/main.json](data/api-results/main.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

- Applied learning L-001: (Orders / totals) Probe the 1,000.00 discount threshold at 79 and 80 units of the 12.50 product: the tax-after-discount rule only breaks on discounted orders, so below-threshold orders look correct.
  - In this run: Applied learning L-001 to test the 79 and 80 unit discount threshold
- Applied learning L-002: (Permissions) Order lists are scoped per company but single-order detail and admin-prefixed read endpoints were not; always test detail by id across companies and every admin read endpoint as a client.
  - In this run: Applied learning L-002 to test order detail across companies and admin endpoints as a client
- Applied learning L-003: (Admin / reports) The sales summary takes about 4 seconds; wait for the figures text before judging the Reports page. The runner's own login tokens survive logout, so use fresh role tokens per plan.
  - In this run: Applied learning L-003 to wait for the Reports figures and use fresh tokens
- Skipped known false alarm FA-001: The sales summary takes about four seconds to load
  - In this run: Skipped known false alarm FA-001 (slow sales summary)

**Saved this run**

- Confirmed again L-001: Probe the 1,000.00 discount threshold at 79 and 80 units of the 12.50 product: the tax-after-discount rule only breaks on discounted orders, so below-threshold orders look correct.
- Confirmed again L-002: Order lists are scoped per company but single-order detail and admin-prefixed read endpoints were not; always test detail by id across companies and every admin read endpoint as a client.
- Confirmed again L-003: The sales summary takes about 4 seconds; wait for the figures text before judging the Reports page. The runner's own login tokens survive logout, so use fresh role tokens per plan.
- New learning L-004: At 390 px width the Client Portal New order form overflows (Place order off screen) and My orders hides its newest row under the toolbar; run the page audit on both after every layout change.
- New learning L-005: Routes can stay in src/api.mjs after their spec entry is deleted (reset-password this run); compare the ROUTES list with the inventory, not only the inventory with memory.
- New learning L-006: The stale My orders status needs the client list opened before the admin change; a fresh sign-in as the same company still shows the cached list for 10 minutes, so the UI check works across profiles.
- Flagged risk area Auth / password reset email: Auth / password reset email (important): Source suggests the reset email link is built from an unset field; email was not opened.

**Memory after the run**

- Product map: 10 page(s) and 13 endpoint(s) known; 3 change(s) since the last run.
- Risk areas: 16 area(s) tracked; highest now: Admin / customers (score 20).
- Known false alarms skipped: FA-001.
- Learnings: 3 new, 3 confirmed again, 3 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Order at 1000.00 and above expects total = (subtotal - discount) * 1.10 → `test/orders.test.js`
- **ISSUE-002**: As a client, GET /admin/customers expects 403 → `test/permissions.test.js`
- **ISSUE-003**: Order created by company A requested by company B expects 403 or 404 → `test/permissions.test.js`
- **ISSUE-004**: After logout, GET /me with the same token expects 401 → `test/auth.test.js`
- **ISSUE-005**: Quantities 0, -1, 1.5, 1001 and an empty items list expect 400 → `test/orders.test.js`
- **ISSUE-006**: page_size=0 expects 400; q='(' expects 200 or 400, never 500 → `test/orders.test.js`
- **ISSUE-007**: Malformed JSON expects 400 and a body without 'stack' or file paths → `test/errors.test.js`
- **ISSUE-008**: Warm the client list, change the status as admin, re-read the list and expect the new status → `test/orders.test.js`
- **ISSUE-009**: Every route in ROUTES appears in openapi.yaml (contract test) → `test/contract.test.js`
- **ISSUE-010**: At 390 px width the New order page does not scroll sideways and Place order is inside the viewport → `test/e2e/new-order.mobile.spec.js`
- **ISSUE-011**: At 390 px the first order row is not covered and is clickable → `test/e2e/my-orders.mobile.spec.js`
- **ISSUE-012**: Accessibility check that every form control and icon button has an accessible name → `test/e2e/a11y.spec.js`
- **ISSUE-013**: Two parallel identical orders expect one order or a 409 → `test/orders.test.js`

## Notes

- Evidence and screenshots of the Customers data and the other company's order may show personal data of test customers; automatic masking of screenshots is not available in this version, so review them before sharing.
- The sales summary taking about four seconds is a known accepted behaviour and was not reported.
