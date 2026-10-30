# QAMind Technical Report: run-20261030T065755Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T06:57:55.062Z |
| Project | ws (path-ws-cf222683987e) |
| Environment | local demo |
| Branch / commit | main @ 3f70e83 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 8m 37s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.0 |
| Stop reason | completed |

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (14 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (8 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **4**   🟠 Important: **6**   🟡 Minor: **3**
- Unconfirmed (not reproduced twice): **2**
- Areas not tested: **9**
- API probes executed: **209** (47 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders validated and totalled by the stated rule
- **Risk:** Money wrong, bad input accepted
- **Entry point:** POST /api/orders as acme-1
- **Expected results:** qty 1..1000 whole; >=1 item; discount 5% at subtotal>=1000.00; tax 10% on discounted; server ignores client prices
- **Exit condition:** Boundaries 999.99/1000.00/1000.01, qty 0/-1/1000/1001/1.5, empty items, mass assignment checked

### C2: Role and tenant isolation (API)  `permissions`

- **Goal:** Clients see only own company orders; admin endpoints admin only
- **Risk:** Data exposure across tenants
- **Entry point:** GET/PATCH /orders, /admin/* as acme-1, acme-2, bright-1, zain-1, anonymous
- **Expected results:** Same company shares; other company 403/404; admin endpoints 403 for clients
- **Exit condition:** Create/read/list/status-change chains run for each pair

### C3: Auth, logout and session  `api`

- **Goal:** Logout revokes token; bad credentials refused
- **Risk:** Session stays valid
- **Entry point:** POST /auth/login, /auth/logout, GET /me
- **Expected results:** Token invalid after logout; no user enumeration
- **Exit condition:** Logout chain, wrong password, malformed token checked

### C4: Order status transitions and lists  `api`

- **Goal:** placed>processing>shipped>delivered|cancelled enforced; pagination/search sane
- **Risk:** Illegal transitions, broken paging
- **Entry point:** PATCH /admin/orders/{id}/status, GET /orders params
- **Expected results:** 409 for illegal moves; 400 for bad params
- **Exit condition:** All transitions and param boundaries checked

### C5: Client Portal critical flow (acme-1, zain-1 RTL)  `ui`

- **Goal:** Place order, confirmation total, My Orders
- **Risk:** Flow blocked, wrong totals
- **Entry point:** http://127.0.0.1:4102
- **Expected results:** Totals match rules; Urdu renders RTL
- **Exit condition:** Desktop and mobile, form edge cases, double submit, direct URL, expired session

### C6: Admin Portal orders, status, customers, reports  `ui`

- **Goal:** Admin finds order, advances status, sees reports
- **Risk:** Wrong status/report numbers
- **Entry point:** http://127.0.0.1:4101
- **Expected results:** Status visible to client after reload; report totals match orders
- **Exit condition:** Desktop and mobile, audit on every page

### C7: Cross-UI consistency and sign-out  `cross`

- **Goal:** Admin change shows in client UI; sign-out ends session
- **Risk:** Stale data, session reuse
- **Entry point:** Both UIs and API
- **Expected results:** Consistent totals/status; token dead after sign-out
- **Exit condition:** Each cross-check done

### C8: Password reset  `api`

- **Goal:** Forgot/reset flow
- **Risk:** Sends email
- **Entry point:** POST /auth/forgot-password
- **Expected results:** Demo uses a local mail catcher only
- **Exit condition:** Decide if safe; otherwise Not tested

## Findings

### ISSUE-001 🔴 Critical: Any client can read any other company's order by id

- **Surface:** permissions · **UI:** Client Portal · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** bright-1, zain-1, acme-1
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/orders/{id} returns 200 with full order data to a user from a different company; the Client Portal order page shows it too. The orders list is correctly scoped, only the detail lookup is not (OWASP API1:2023).

**Steps to reproduce**

1. Sign in over the API as acme-1 (Acme Traders) and POST /api/orders with reference QA-iso-1 (probe I1); note the returned id
2. Sign in as bright-1 (Bright Foods) and GET /api/orders/{that id} (probe I3), then as zain-1 (probe I4); see evidence for the exact requests
3. Also, in the Client Portal as acme-1, open order.html?id=o-1009 (a Bright Foods order) and see it with company name and items
4. Repeat: same result on the second attempt of each probe

**Expected:** HTTP 403 or 404 with no order data for a user of another company

**Actual:** HTTP 200 with the order, including the QA-iso-1 marker. The portal page 'Order BF-2216' for a Bright Foods order rendered for acme-1. A custom X-Client-Id header made no difference (probe I13).

**Evidence**

- [evidence/api/rules-I3.json](evidence/api/rules-I3.json)
- [evidence/api/rules-I4.json](evidence/api/rules-I4.json)
- [evidence/api/rules-I13.json](evidence/api/rules-I13.json)
- [screenshots/client-other-company-order.png](screenshots/client-other-company-order.png)

**Suspected root cause:** The detail handler looks the order up by id without comparing its client_id to the caller's

**Proposed regression test:** Create an order as acme-1, GET it as bright-1 and expect 403/404; GET as acme-2 expects 200 (suggested location: `test/orders.test.js`)

### ISSUE-002 🔴 Critical: Client accounts can list all customers' personal and payment details

- **Surface:** permissions · **Area:** Customers · **Type:** function-level-access
- **Roles:** acme-1, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/admin/customers is documented as admin-only (403 for others) but returns 200 for every client account, exposing every company's contact name, email, phone, national ID, address, card details and internal notes (OWASP API5:2023). The role matrix confirms 200 for acme-1, acme-2, bright-1 and zain-1.

**Steps to reproduce**

1. Sign in over the API as bright-1
2. GET /api/admin/customers (probe I11) and again as zain-1 (probe I12)
3. Observe 200 with a record per company, including other companies' data
4. Fields exposed (names only): contact_name, email, phone, cnic, address, card_last4, notes (one note contains what looks like a full card number and expiry)

**Expected:** HTTP 403 for any non-admin role (spec lists 403)

**Actual:** HTTP 200 with all customer records

**Evidence**

- [evidence/api/rules-I11.json](evidence/api/rules-I11.json)
- [evidence/api/rules-I12.json](evidence/api/rules-I12.json)
- [evidence/api/explore-E2.json](evidence/api/explore-E2.json)

**Suspected root cause:** Customers route is missing the admin role check that /admin/reports/sales has

**Proposed regression test:** GET /admin/customers as each client role and expect 403; as admin expect 200 (suggested location: `test/admin.test.js`)

### ISSUE-003 🔴 Critical: Signing out does not end the session: the token keeps working

- **Surface:** api · **Area:** Auth · **Type:** session
- **Roles:** acme-2
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /api/auth/logout returns 204, the same bearer token still gets 200 on /api/me and /api/orders. The spec says logout revokes the token, and the business rule says signing out ends the session at once. The portal's Sign out only clears browser storage.

**Steps to reproduce**

1. Sign in over the API as acme-2
2. POST /api/auth/logout (probe S1) and see 204
3. With the same token GET /api/me (probe S2) and GET /api/orders (probe S3)
4. Observe 200 on both, twice each

**Expected:** HTTP 401 for every call with the signed-out token

**Actual:** HTTP 200 with the user's data

**Evidence**

- [evidence/api/rules-S2.json](evidence/api/rules-S2.json)
- [evidence/api/rules-S3.json](evidence/api/rules-S3.json)

**Suspected root cause:** Logout does not add the token to a revocation list or the auth middleware does not check one

**Proposed regression test:** Log out, then GET /me with the same token and expect 401 (suggested location: `test/auth.test.js`)

### ISSUE-004 🔴 Critical: Tax is charged on the full subtotal instead of the discounted subtotal

- **Surface:** business-rule · **UI:** Client Portal and Admin Portal · **Area:** Order totals · **Type:** calculation
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

For orders with a subtotal of 1,000.00 or more the 5% discount is applied, but tax is still 10% of the undiscounted subtotal. The rule is tax on the discounted subtotal, so every discounted order is overcharged by 0.5% of the subtotal (5.00 on a 1,000.00 order). Seeded orders show the same pattern.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with reference QA-b2 and items p-102 x 80 (subtotal 1,000.00; probe B2)
3. Expected discount 50.00, tax 95.00, total 1,045.00; observe tax 100.00, total 1,050.00
4. Same with p-101 x 156 (probe B3: expected total 1,059.63, got 1,064.70) and p-101 x 1000 (probe B4: expected 6,792.50, got 6,825.00)
5. In the Client Portal as acme-1 order 80 x Ballpoint Pens: confirmation says Total: $1,050.00; the Admin Portal order page shows Subtotal 1,000.00, Discount -50.00, Tax 100.00, Total 1,050.00

**Expected:** Total 1,045.00 (1,000.00 - 50.00 + 95.00). Below the threshold (998.00, probe B1) the totals are correct.

**Actual:** Total 1,050.00, in the API, both portals and the CSV export; the discount is applied but tax is computed before it

**Evidence**

- [evidence/api/rules-B2.json](evidence/api/rules-B2.json)
- [evidence/api/rules-B3.json](evidence/api/rules-B3.json)
- [evidence/api/rules-B4.json](evidence/api/rules-B4.json)
- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)
- [screenshots/admin-order-tax-on-undiscounted.png](screenshots/admin-order-tax-on-undiscounted.png)

**Suspected root cause:** tax_cents is computed from subtotal_cents rather than subtotal_cents - discount_cents

**Proposed regression test:** Order of exactly 100000 cents expects discount 5000, tax 9500, total 104500; 101400 cents expects total 105963 (suggested location: `test/pricing.test.js`)

### ISSUE-005 🟠 Important: Order quantity limits are not enforced: 0, 1001, 1.5 and an empty item list are accepted

- **Surface:** api · **UI:** Client Portal · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /api/orders returns 201 for quantity 0, 1001 and 1.5 and for an empty items array, although the spec and rules say whole numbers 1 to 1,000 and at least one item. The Client Portal form accepts quantity 0 too and shows 'Order QA-ui-q0 placed. Total: $0.00.'

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items [] (probe P043), then with items[0].quantity 0, 1001 and 1.5 (probes P044, P045, P046)
3. Observe 201 each time
4. In the Client Portal as acme-1 open New order, enter reference QA-ui-q0, choose A4 Copy Paper, quantity 0, click Place order, and see a $0.00 order created

**Expected:** HTTP 400 naming the field; the form should refuse too

**Actual:** HTTP 201 and orders stored (zero-value orders, quantity 1001 and 1.5). Quantity 1000 and a string quantity '5' behave correctly.

**Evidence**

- [evidence/api/client-P043.json](evidence/api/client-P043.json)
- [evidence/api/client-P044.json](evidence/api/client-P044.json)
- [evidence/api/client-P045.json](evidence/api/client-P045.json)
- [evidence/api/client-P046.json](evidence/api/client-P046.json)
- [screenshots/client-qty0-accepted.png](screenshots/client-qty0-accepted.png)

**Suspected root cause:** No range or integer check on quantity and no minimum on items in the order handler or the form

**Proposed regression test:** POST orders with items [], quantity 0, 1001 and 1.5 and expect 400 each (suggested location: `test/orders.test.js`)

### ISSUE-006 🟠 Important: The same order submitted twice at once creates two orders

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Two identical POST /api/orders sent in parallel both return 201 and two orders with the same reference and items are stored. Nothing in the spec allows duplicates or offers an idempotency key. I am unsure the product intends one order per click, so severity follows user impact (double billing).

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send two identical POST /api/orders in parallel (probe P049)
3. Observe two 201 responses; GET /api/orders lists two QA-reference orders created in the same millisecond (o-1025 and o-1026)

**Expected:** One order, or a clear duplicate refusal (409)

**Actual:** Two orders created

**Evidence**

- [evidence/api/client-P049.json](evidence/api/client-P049.json)

**Suspected root cause:** No de-duplication or idempotency handling on order creation

**Proposed regression test:** Send two identical parallel POST /orders and expect exactly one order created (suggested location: `test/orders.test.js`)

### ISSUE-007 🟠 Important: Order search with ( or \ and page_size=0 crash the server (HTTP 500); negative page_size accepted

- **Surface:** api · **UI:** Admin Portal · **Area:** Orders list · **Type:** validation
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

GET /api/orders?q=( and q=\ return 500, probably an unescaped regular expression. page_size=0 returns 500 and page_size=-1 returns 200 with page_size -1 although the spec minimum is 1 (400 expected). In the Admin Portal, typing ( in the search box shows 'Could not load orders (500).' and leaves the previous list on screen.

**Steps to reproduce**

1. Sign in over the API as acme-1 (or admin) and GET /api/orders?q=( (probe P024), q=\ (P028), page_size=0 (P019), page_size=-1 (P020)
2. Observe 500, 500, 500 and 200
3. In the Admin Portal as admin, open Orders, type ( in Search and press Enter: the page shows 'Could not load orders (500).' and the console shows the failed request

**Expected:** Special characters are searched literally (200); invalid page_size gives 400

**Actual:** HTTP 500 for q=( , q=\ and page_size=0; 200 with an invalid echoed page_size for -1

**Evidence**

- [evidence/api/client-P024.json](evidence/api/client-P024.json)
- [evidence/api/client-P028.json](evidence/api/client-P028.json)
- [evidence/api/client-P019.json](evidence/api/client-P019.json)
- [evidence/api/client-P020.json](evidence/api/client-P020.json)
- [evidence/api/admin-P024.json](evidence/api/admin-P024.json)

**Suspected root cause:** The query string is passed to new RegExp without escaping and page_size is not range-checked

**Proposed regression test:** GET /orders?q=( expects 200 with an empty list; page_size=0 and -1 expect 400 (suggested location: `test/orders.test.js`)

### ISSUE-008 🟠 Important: Malformed JSON requests return a stack trace and server file paths

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

Sending invalid JSON to POST /api/auth/login (and POST /api/orders) gives a 400 whose body contains a stack trace, a stack field and server source file paths.

**Steps to reproduce**

1. POST /api/auth/login with the raw body {bad json (probe P007), anonymous or any role
2. POST /api/orders with malformed JSON as acme-1 (probe P048)
3. Read the response body in the evidence: stack trace and file paths present both times

**Expected:** A short 400 error naming the problem, no internals

**Actual:** 400 with stack trace and absolute server paths

**Evidence**

- [evidence/api/client-P007.json](evidence/api/client-P007.json)
- [evidence/api/client-P048.json](evidence/api/client-P048.json)
- [evidence/api/admin-P007.json](evidence/api/admin-P007.json)

**Suspected root cause:** The default error handler returns the error stack to the client

**Proposed regression test:** POST malformed JSON and expect a 400 body without 'stack' or file paths (suggested location: `test/errors.test.js`)

### ISSUE-009 🟠 Important: Urdu order notes and company names display reversed on the order detail page

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / Order detail · **Type:** i18n-rtl
- **Roles:** zain-1
- **Browser / viewport:** chromium / desktop 1366x768 and mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

On the order page the Company and Note values (class text-cell) use unicode-bidi: bidi-override with direction ltr, so Urdu letters are shown in reverse order and unconnected. The note 'ہنگامی آرڈر، آج ہی بھیجیں' reads as scrambled text, and the title 'Order زین-1044' shows the number before the dash. The header and order list show the same Urdu correctly.

**Steps to reproduce**

1. Sign in to the Client Portal as zain-1 in a fresh profile
2. Open My orders and click View on the first order (زین-1044, order id o-1012)
3. Compare the Company and Note rows with the same text in the page header and the orders list
4. In the browser check the computed style of #o-note: unicode-bidi bidi-override, direction ltr
5. Reload the page and check again

**Expected:** Urdu text right-to-left and readable (dir=auto or bdi, no bidi-override)

**Actual:** Letters reversed ('زرڈیرٹ نیز' for 'زین ٹریڈرز'); both reproduced after reload

**Evidence**

- [screenshots/zain-order-detail2.png](screenshots/zain-order-detail2.png)
- [screenshots/zain-order-detail-mobile.png](screenshots/zain-order-detail-mobile.png)

**Suspected root cause:** CSS rule on .text-cell forces bidi-override and ltr

**Proposed regression test:** Render order page for the Urdu order and assert #o-note computed unicode-bidi is not bidi-override (suggested location: `test/ui/order-detail.test.js`)

### ISSUE-010 🟠 Important: On a phone the New order form runs off screen and the Place order button is out of view

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / New order · **Type:** layout
- **Roles:** acme-1, bright-1
- **Browser / viewport:** chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

At 390px wide the page is 555px wide: the reference and note fields, the quantity box, the Remove button and Place order start or end outside the screen. Place order begins at x=435 on a 390px screen, so a client must scroll sideways to place an order.

**Steps to reproduce**

1. Sign in to the Client Portal (acme-1, then again bright-1 in a fresh profile)
2. Resize to 390x844
3. Open New order and run the page audit or look at the screenshot
4. The page scrolls sideways by 165px; input fields are cut off on the right and Place order is off screen

**Expected:** All fields and Place order fit within the width

**Actual:** Controls pushed 45 to 165px outside the viewport

**Evidence**

- [screenshots/client-neworder-mobile.png](screenshots/client-neworder-mobile.png)

**Suspected root cause:** Fixed-width form rows (item row with select, quantity and Remove) force the card wider than the screen

**Proposed regression test:** At 390px width, assert the document scroll width equals the viewport width on new-order.html (suggested location: `test/ui/layout.test.js`)

### ISSUE-011 🟡 Minor: My orders on mobile: first row sits under the toolbar and Total and View are hidden in a scroll box

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

At 390px the orders table (457px wide) scrolls inside a 359px box with no visible cue, so the Total is clipped and the View link is out of sight. The first row overlaps the toolbar (New order button) by about 22px.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1, resize to 390x844
2. Open My orders, look at the first row and the right edge of the table
3. Reload and measure: the table's scrollWidth is 457 and its box is 359; first row top is 241px, toolbar bottom 263px

**Expected:** Row clear of the toolbar; key columns reachable or a visible scroll cue

**Actual:** Overlap and clipped columns

**Evidence**

- [screenshots/client-orders-mobile.png](screenshots/client-orders-mobile.png)

**Suspected root cause:** Table wrapper with overflow auto and no spacing below the sticky or floated toolbar

**Proposed regression test:** At 390px assert the first order row does not intersect the toolbar (suggested location: `test/ui/layout.test.js`)

### ISSUE-012 🟡 Minor: The product selector on the New order form has no accessible name

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / New order · **Type:** accessibility
- **Roles:** acme-1, bright-1
- **Browser / viewport:** chromium / desktop and mobile
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

The product dropdown has no label, so a screen reader announces it only as a combobox and the page audit lists it as an unnamed control.

**Steps to reproduce**

1. Sign in to the Client Portal and open New order
2. Read the page snapshot: combobox with no name next to the Quantity spinbutton (named)
3. Run the audit: unnamedControls lists select[name=product]; same result for bright-1 in a fresh profile

**Expected:** A label such as 'Product' for each line

**Actual:** No accessible name

**Evidence**

- [screenshots/client-neworder-mobile.png](screenshots/client-neworder-mobile.png)

**Suspected root cause:** Select rendered without label or aria-label

**Proposed regression test:** Assert every select on new-order.html has an accessible name (suggested location: `test/ui/a11y.test.js`)

### ISSUE-013 🟡 Minor: Sales report takes about 4 seconds to answer

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

GET /api/admin/reports/sales consistently takes 4.0 to 4.2 seconds while other calls take a few milliseconds. The Admin Portal Reports page shows only the heading until it arrives.

**Steps to reproduce**

1. Sign in as admin over the API
2. GET /api/admin/reports/sales (probes P061, P093, E6)
3. Observe 4004 to 4226 ms each time

**Expected:** A response in well under 3 seconds, or a loading indicator on the page

**Actual:** About 4 seconds on every call (6 of 6)

**Evidence**

- [evidence/api/explore-E6.json](evidence/api/explore-E6.json)
- [evidence/api/admin-P093.json](evidence/api/admin-P093.json)
- [evidence/api/admin-P061.json](evidence/api/admin-P061.json)

**Suspected root cause:** A deliberate delay or an unindexed aggregation in the report handler

**Proposed regression test:** Time GET /admin/reports/sales and expect under 1500 ms on the seeded data (suggested location: `test/admin.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Admin orders page: search box and two icon buttons (refresh, clear filters) have no accessible name** (ui, tried 1×): The page audit on Admin Portal Orders at desktop listed input#search (placeholder only) and the buttons #refresh and #clear-filters as unnamed controls. Why unconfirmed: Seen in one audit only; not re-run from a fresh load
- **UNCONFIRMED-02: Orders CSV export has no UTF-8 byte-order mark** (ui, tried 1×): The downloaded orders.csv starts directly with 'id,reference,...' and contains Urdu references and company names. Spreadsheet apps may show these garbled. Why unconfirmed: No spreadsheet application available to confirm how it opens; a single export checked

## Coverage matrix

| Surface | Area | Role | Viewport | Status | Note |
|---|---|---|---|---|---|
| api | Auth: login, wrong password vs unknown email, bad token, logout | all | n/a | ✅ tested | logout does not revoke; login errors checked |
| api | Orders create: validation, totals, mass assignment, client price | acme-1 | n/a | ✅ tested | totals wrong above 1,000; client price and status fields ignored |
| api | Orders list and detail: params, search, isolation | all clients | n/a | ✅ tested | list scoped; detail not scoped |
| api | Status transitions | admin | n/a | ✅ tested | all legal and illegal moves behaved correctly; client change refused |
| api | Admin customers and reports role matrix | all | n/a | ✅ tested | customers open to clients; reports admin-only |
| ui | Client sign in and sign out | acme-1 | desktop | ✅ tested | signed-out page redirects; token still valid on the server |
| ui | New order form | acme-1 | desktop and mobile | ✅ tested | empty reference, quantity 0, confirmation total |
| ui | My orders | acme-1 | desktop and mobile | ✅ tested | list, mobile layout |
| ui | Order detail incl. other company by URL | acme-1 | desktop | ✅ tested | cross-company id visible |
| ui | My orders and order detail (Urdu) | zain-1 | desktop and mobile | ✅ tested | bidi-override on detail |
| ui | New order form mobile | bright-1 | mobile | ✅ tested | second reproduction of overflow |
| ui | Admin orders list, search, CSV export | admin | desktop and mobile | ✅ tested | search with ( fails; export complete, 39 rows |
| ui | Admin order detail and status update | admin | desktop | ✅ tested | placed to processing to shipped |
| ui | Admin customers | admin | desktop | ◐ partial | audit only |
| ui | Admin reports | admin | desktop and mobile | ✅ tested | counts and totals consistent with orders; slow load |
| cross | Status change in admin visible to client | admin, acme-2 | n/a | ✅ tested | API read-back showed processing after admin change |
| ui | Missing session redirect | admin | desktop | ✅ tested | clearing stored token redirects to sign in |

## Not tested

_Nothing here is reported as passing._

- **API / password reset (forgot-password, reset-password) and Client Portal Forgot password page**: Would send email; the config mentions a local mail catcher but no mail catcher address or API is configured, so I could not confirm nothing real is sent
- **Admin Portal / sign-in with a client account, and client use of admin portal pages**: Not covered by a separate browser pass; admin endpoints were checked directly through the API role matrix instead
- **Expired session (time-based expiry)**: No way to age a token in this environment; only missing-session (cleared storage redirects to sign in) and logout were tested
- **Admin Portal / Customers page screenshots and mobile layout**: Page shows personal and payment-style data; audit was run at desktop only and no screenshot taken. Mobile viewport not covered for this page
- **Admin Portal / Reports and order detail at mobile viewport**: Reports and a mobile pass of the admin order detail were audited at 390px with no leads, but visually reviewed only for Orders
- **Client Portal as acme-2 (UI)**: acme-2 was used through the API only (shared-company read and logout); no UI pass was needed beyond acme-1 for the same pages
- **Zain Traders new-order form with Urdu input**: Not covered in this pass; Urdu display was checked on the existing orders only
- **Rate limiting, CORS and other security header smoke checks**: Not covered in this pass
- **Order status moved to cancelled and cancelled-order cases**: Cancel was not exercised for non-final orders; only the delivered-to-cancelled refusal was checked

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin | 100 | 85 | 8 | 11 | [data/api-results/admin.json](data/api-results/admin.json) |
| client | 64 | 52 | 12 | 21 | [data/api-results/client.json](data/api-results/client.json) |
| explore | 6 | 5 | 1 | 1 | [data/api-results/explore.json](data/api-results/explore.json) |
| rules | 39 | 29 | 10 | 14 | [data/api-results/rules.json](data/api-results/rules.json) |

## Memory

- Applied: First run: no earlier findings; used detected stack only

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Create an order as acme-1, GET it as bright-1 and expect 403/404; GET as acme-2 expects 200 → `test/orders.test.js`
- **ISSUE-002**: GET /admin/customers as each client role and expect 403; as admin expect 200 → `test/admin.test.js`
- **ISSUE-003**: Log out, then GET /me with the same token and expect 401 → `test/auth.test.js`
- **ISSUE-004**: Order of exactly 100000 cents expects discount 5000, tax 9500, total 104500; 101400 cents expects total 105963 → `test/pricing.test.js`
- **ISSUE-005**: POST orders with items [], quantity 0, 1001 and 1.5 and expect 400 each → `test/orders.test.js`
- **ISSUE-006**: Send two identical parallel POST /orders and expect exactly one order created → `test/orders.test.js`
- **ISSUE-007**: GET /orders?q=( expects 200 with an empty list; page_size=0 and -1 expect 400 → `test/orders.test.js`
- **ISSUE-008**: POST malformed JSON and expect a 400 body without 'stack' or file paths → `test/errors.test.js`
- **ISSUE-009**: Render order page for the Urdu order and assert #o-note computed unicode-bidi is not bidi-override → `test/ui/order-detail.test.js`
- **ISSUE-010**: At 390px width, assert the document scroll width equals the viewport width on new-order.html → `test/ui/layout.test.js`
- **ISSUE-011**: At 390px assert the first order row does not intersect the toolbar → `test/ui/layout.test.js`
- **ISSUE-012**: Assert every select on new-order.html has an accessible name → `test/ui/a11y.test.js`
- **ISSUE-013**: Time GET /admin/reports/sales and expect under 1500 ms on the seeded data → `test/admin.test.js`

## Notes

- Evidence for the admin customers finding (evidence/api/explore-E2.json, rules-I11 and rules-I12) contains personal data and what looks like a full card number from demo records; review before sharing. Automatic masking of screenshots is not available in this version.
- The run created many QA- prefixed orders (including zero-value ones from validation probes). They were not deleted because the API has no delete endpoint.
- The client token is stored in browser localStorage (lumen.token); noted, not judged.
- Seeded orders show the same tax-before-discount pattern as the totals finding.
- Note: during report writing I overwrote data/meta.json and rebuilt its run fields from the run marker; the content is equivalent.
