# QAMind Technical Report: run-20261030T094544Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T09:45:44.500Z |
| Project | ws (path-ws-00e6c3841999) |
| Environment | local demo |
| Branch / commit | main @ 8ef957b |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 7m 04s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / undefined |
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
| Test account "admin" can sign in | ✅ ok | signed in over the API (6 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **5**   🟡 Minor: **2**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **5**
- API probes executed: **214** (51 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders validated and totalled by the stated rules
- **Risk:** Money wrong
- **Entry point:** POST /api/orders as acme-1
- **Expected results:** qty 1-1000 integers, >=1 item; discount 5% at >=1000.00; tax 10% on discounted subtotal
- **Exit condition:** Both sides of 1000.00 and qty bounds checked (source: openapi.yaml)

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients only see own company's orders; admin endpoints refuse clients
- **Risk:** Data exposure
- **Entry point:** /orders, /admin/*
- **Expected results:** 403/404 across tenants; 403 for clients on admin
- **Exit condition:** Chains acme-1 -> bright-1, acme-2 same-company, anonymous

### C3: Sessions and sign-out  `api`

- **Goal:** Logout revokes token
- **Risk:** Session stays valid
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Token reuse refused

### C4: Status workflow  `api`

- **Goal:** placed>processing>shipped>delivered/cancelled only
- **Risk:** Illegal transitions
- **Entry point:** PATCH /admin/orders/{id}/status
- **Expected results:** 409 for illegal moves
- **Exit condition:** Forward, skip, backward, post-cancel checked

### C5: Critical flows 1-5 in Client and Admin Portals  `ui`

- **Goal:** End-to-end flows work desktop and mobile
- **Risk:** Users blocked
- **Entry point:** http://127.0.0.1:4102 and :4101
- **Expected results:** As in config critical flows
- **Exit condition:** All flows, page audit, Urdu tenant RTL

### C6: Warm, change, re-read  `cross`

- **Goal:** Status changes by admin appear for client at once
- **Risk:** Stale data
- **Entry point:** Client My Orders / order detail
- **Expected results:** New status visible immediately
- **Exit condition:** Re-read at once and after ~10s

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Any signed-in client can read every customer's personal records via the admin customers endpoint

- **Surface:** permissions · **Area:** Customers · **Type:** permissions
- **Roles:** acme-1, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /admin/customers returns the full customer list (contact names, emails, phones, national ids, addresses, card last four, notes) to client roles. The spec and business rules say only admins may see customers. Same call by anonymous gets 401; /admin/reports/sales correctly gives clients 403.

**Steps to reproduce**

1. Sign in over the API as acme-1 (a client)
2. GET /api/admin/customers (see evidence for the curl)
3. Observe HTTP 200 with all customers' records
4. Repeat as bright-1 and zain-1: same result

**Expected:** HTTP 403 for any non-admin role

**Actual:** HTTP 200 with all customers' data for acme-1, bright-1 and zain-1

**Evidence**

- [evidence/api/explore-E2.json](evidence/api/explore-E2.json)
- [evidence/api/biz-C2.json](evidence/api/biz-C2.json)
- [evidence/api/biz-C3.json](evidence/api/biz-C3.json)

**Suspected root cause:** The customers route has no admin role check (the reports route does)

**Proposed regression test:** As each client role, GET /admin/customers and expect 403 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: A client can open another company's order by its id

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** acme-1, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /orders/{id} returns an order belonging to Acme Traders to bright-1 (Bright Foods) and zain-1 (Zain Traders). The order list is correctly scoped (not found in their lists), only the detail lookup lacks the company check. Reproduced in the Client Portal by opening order.html?id=<id> as zain-1.

**Steps to reproduce**

1. As acme-1, POST /api/orders with reference QA-iso-1 and capture the id
2. As bright-1, GET /api/orders/<id>
3. Observe 200 with the Acme order
4. Repeat as zain-1
5. In the Client Portal signed in as zain-1 open order.html?id=<id> and see the Acme order

**Expected:** HTTP 403 or 404 for another company's order

**Actual:** HTTP 200 with the full order (reference, company name, items, totals)

**Evidence**

- [evidence/api/biz-I4.json](evidence/api/biz-I4.json)
- [evidence/api/biz-I9.json](evidence/api/biz-I9.json)
- [screenshots/zain-sees-acme-order.png](screenshots/zain-sees-acme-order.png)

**Suspected root cause:** Detail lookup finds the order by id without filtering on the caller's company

**Proposed regression test:** Client of company B GETs company A's order id and expects 403/404 (suggested location: `test/orders.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Tax is calculated on the undiscounted subtotal, so discounted orders are overcharged

- **Surface:** business-rule · **Area:** Orders · **Type:** business-rule
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

For subtotals of 1,000.00 or more, tax is 10% of the full subtotal instead of 10% of (subtotal - discount). Subtotal 100000c: expected tax 9500 and total 104500; actual tax 10000, total 105000. Subtotal 100475c: expected total 104996, actual 105499. Quantity 1000 of 650c: expected total 679250, actual 682500. The Client Portal confirmation shows $1,050.00 for a $1,000.00 subtotal where $1,045.00 is correct. Below the threshold totals are correct.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with 80 x p-102 (12.50 each), reference QA-T3
3. Observe tax_cents 10000 and total_cents 105000
4. Repeat
5. UI: Client Portal > New order, reference QA-UI-1, Ballpoint Pens x 80, Place order: confirmation says Total: $1,050.00

**Expected:** Discount 5000, tax 9500, total 104500 ($1,045.00)

**Actual:** Discount 5000, tax 10000, total 105000 ($1,050.00)

**Evidence**

- [evidence/api/biz-T3.json](evidence/api/biz-T3.json)
- [evidence/api/biz-T4.json](evidence/api/biz-T4.json)
- [evidence/api/biz-T5.json](evidence/api/biz-T5.json)
- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)

**Suspected root cause:** Tax computed from subtotal rather than subtotal - discount

**Proposed regression test:** Order of 80 x 1250c expects tax 9500 and total 104500 (suggested location: `test/pricing.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Signing out does not end the session: the old sign-in still works

- **Surface:** api · **Area:** Authentication · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /auth/logout returns 204, the same bearer token still gets 200 on GET /me and GET /orders. The business rule says signing out ends the session at once. The portals' Sign out button does redirect to the sign-in page, but the credential it leaves behind remains usable.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. GET /api/me -> 200
3. POST /api/auth/logout -> 204
4. GET /api/me with the same token -> 200 (should be 401)
5. GET /api/orders with the same token -> 200

**Expected:** 401 for a token after logout

**Actual:** 200 with the signed-out user's data

**Evidence**

- [evidence/api/biz-A3.json](evidence/api/biz-A3.json)
- [evidence/api/biz-A4.json](evidence/api/biz-A4.json)

**Suspected root cause:** Logout does not revoke the token server-side

**Proposed regression test:** Logout then GET /me with same token expects 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders with quantity 0, negative, above 1000, fractional, or no items are accepted (negative totals)

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /orders returns 201 for an empty items list, quantity 0, -3, 1001 and 1.5. Quantity -3 produced an order with a negative total (-$21.45, visible in My orders and the admin Orders list). Rules require a whole number 1-1000 and at least one item.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items[0].quantity = -3 (reference QA-T6)
3. Observe 201 and a negative total
4. Repeat; also quantity 0, 1001, 1.5 and items [] (see baseline evidence)

**Expected:** HTTP 400 naming the field

**Actual:** HTTP 201, order created

**Evidence**

- [evidence/api/biz-T6.json](evidence/api/biz-T6.json)
- [evidence/api/client-baseline-P043.json](evidence/api/client-baseline-P043.json)
- [evidence/api/client-baseline-P044.json](evidence/api/client-baseline-P044.json)
- [evidence/api/client-baseline-P045.json](evidence/api/client-baseline-P045.json)
- [evidence/api/client-baseline-P046.json](evidence/api/client-baseline-P046.json)

**Suspected root cause:** No server-side range and integer check on quantity or minimum on items

**Proposed regression test:** POST orders with qty -3, 0, 1001, 1.5 and empty items expects 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Searching the order list can show an old status after an admin changes it

- **Surface:** cross · **Area:** Orders · **Type:** stale-data
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

After an admin moved order o-1039 to delivered, GET /orders/o-1039 shows delivered but GET /orders?q=QA-iso-1 for the same client still returns status placed (also seen as 'processing' missing right after the first change). The unfiltered My orders page showed the correct status. Warm, change, re-read sequence: read as acme-1, admin PATCH, re-read.

**Steps to reproduce**

1. As acme-1 GET /api/orders and GET /api/orders/<id> for an order (status placed)
2. As admin PATCH /api/admin/orders/<id>/status to processing
3. As acme-1 GET /api/orders?q=<reference>: status still placed; detail shows processing
4. Repeat later after delivered: list still placed

**Expected:** Search results show the current status

**Actual:** Search results show the status from before the change

**Evidence**

- [evidence/api/biz-S3b.json](evidence/api/biz-S3b.json)
- [evidence/api/stale-L1.json](evidence/api/stale-L1.json)

**Suspected root cause:** Search results cached by query and not invalidated on status change

**Proposed regression test:** Warm filtered list, change status as admin, re-read filtered list expects new status (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: On a phone, the My orders toolbar covers the first order and the Total and View columns are cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** chromium / 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

At 390px wide the status filter/New order toolbar overlaps the top of the orders table (first row partly hidden), and the table is 457px wide inside a 359px box so Total and View are off-screen with no visible cue.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Set the window to 390x844
3. Open My orders
4. Observe first row overlapped by the toolbar and the Total/View columns cut off; reload and observe again

**Expected:** Table fully below the toolbar and key columns reachable or stacked

**Actual:** Overlap of about 22px+ and clipped columns

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)
- [evidence/client-my-orders-mobile-measure.txt](evidence/client-my-orders-mobile-measure.txt)

**Suspected root cause:** Toolbar and table-wrap positioning/overflow at narrow widths

**Proposed regression test:** At 390px width the first order row does not intersect the toolbar (suggested location: `test/e2e/my-orders.mobile.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Some order-list requests crash the server (page_size=0, search text ( or \)

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /orders?page_size=0, ?q=( and ?q=\ return HTTP 500 instead of 400 or an empty result. page_size=-1 is accepted with 200 although the spec minimum is 1 (spec drift).

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?page_size=0 -> 500
3. GET /api/orders?q=( -> 500
4. Repeat: same results

**Expected:** 400 for page_size=0; search treats punctuation as plain text

**Actual:** HTTP 500

**Evidence**

- [evidence/api/client-baseline-P019.json](evidence/api/client-baseline-P019.json)
- [evidence/api/client-baseline-P024.json](evidence/api/client-baseline-P024.json)
- [evidence/api/client-baseline-P028.json](evidence/api/client-baseline-P028.json)
- [evidence/api/client-baseline-P020.json](evidence/api/client-baseline-P020.json)

**Suspected root cause:** Divide by zero on paging; search text used unescaped as a regular expression

**Proposed regression test:** GET /orders with page_size=0 and q=( expects 400/200, never 500 (suggested location: `test/orders.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Malformed requests return internal technical details (stack trace and server file paths)

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /auth/login and POST /orders with malformed JSON return 400 whose body includes a stack trace and server source file paths.

**Steps to reproduce**

1. POST /api/auth/login with body {bad
2. Observe 400 body with stack field and file paths
3. Repeat; same for POST /api/orders

**Expected:** A short error message without internals

**Actual:** Stack trace and file paths in the response body

**Evidence**

- [evidence/api/client-baseline-P007.json](evidence/api/client-baseline-P007.json)
- [evidence/api/client-baseline-P048.json](evidence/api/client-baseline-P048.json)

**Suspected root cause:** Default error handler returns the stack outside production mode

**Proposed regression test:** Malformed JSON body response contains no stack or path (suggested location: `test/errors.test.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: Submitting the same order twice at once creates two orders

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Two identical POST /orders sent in parallel both returned 201 with the same reference (the runner flagged duplicate-submission both times). The spec does not say duplicates are legal; unsure whether the product intends to allow repeated references, so the risk is a double order from a double click.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send two identical POST /api/orders in parallel
3. Observe two 201 responses
4. Repeat

**Expected:** One order or a conflict response for the second

**Actual:** Two orders created

**Evidence**

- [evidence/api/client-baseline-P049.json](evidence/api/client-baseline-P049.json)

**Suspected root cause:** No duplicate protection on reference or idempotency key

**Proposed regression test:** Two parallel identical orders yield one 201 and one 409 (suggested location: `test/orders.test.js`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: Admin Orders page has icon buttons and a search box with no accessible name

- **Surface:** ui · **UI:** Admin Portal · **Area:** Orders list · **Type:** accessibility
- **Roles:** admin
- **Browser / viewport:** chromium / 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

The refresh and clear-filters icon buttons have no accessible name and the search box has only a placeholder, so screen readers announce them as unnamed.

**Steps to reproduce**

1. Sign in to the Admin Portal as admin
2. Open Orders
3. Run the page audit / read the accessibility snapshot
4. Observe two unnamed buttons and an unlabelled search box; repeat from a fresh load

**Expected:** Every control has a name

**Actual:** Two buttons without a name; search relies on placeholder

**Evidence**

- [evidence/admin-orders-audit.txt](evidence/admin-orders-audit.txt)

**Suspected root cause:** Icon buttons lack aria-label

**Proposed regression test:** Orders page controls all have accessible names (suggested location: `test/e2e/accessibility.test.js`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Sales report takes about 4 seconds to load

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

GET /admin/reports/sales takes about 4 seconds every time (4004, 4007, 4009, 4003 ms; limit 3000). In the Admin Portal the Reports page shows only the heading until it finishes.

**Steps to reproduce**

1. Sign in as admin
2. GET /api/admin/reports/sales
3. Observe ~4s response; repeat

**Expected:** Response within about 3 seconds

**Actual:** About 4 seconds, repeatedly

**Evidence**

- [evidence/api/admin-baseline-P061.json](evidence/api/admin-baseline-P061.json)
- [evidence/api/admin-baseline-P093.json](evidence/api/admin-baseline-P093.json)

**Suspected root cause:** Slow aggregation or deliberate delay

**Proposed regression test:** Sales report responds under 3000ms (suggested location: `test/reports.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Urdu order references sit left-aligned in a left-to-right container** (ui, tried 1×): Zain Traders' My orders shows references like زین-1044 with direction ltr and text-align left (page audit lead, 3 rows). Not judged against a stated requirement; the whole page is English and left-to-right. Why unconfirmed: Looked at once; not clearly a defect

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in, New order, confirmation, order detail | acme-1 | desktop | #1 | ✅ tested | order placed, total checked against rules |
| ui | My orders list | acme-1 | mobile | #1 | ✅ tested | layout problem found |
| ui | Orders list and order detail, status change | admin | desktop | #2 | ◐ partial | moved placed to processing only; later steps tested over the API |
| api | Order status workflow | admin | - | #2 | ✅ tested | forward, skip, backward, cancel after ship, invalid |
| cross | Client sees new status (detail and list) | acme-1 | - | #3 | ◐ partial | checked over the API; not re-checked in the portal screens because the order was moved after the client signed out |
| ui | Reports | admin | desktop | #4 | ✅ tested | counts and status table consistent (39 billable of 40 minus 1 cancelled) |
| ui | Sign out | acme-1 | desktop | #5 | ✅ tested | redirects to sign-in; protected page refused afterwards |
| api | Sign out and session reuse | zain-1 | - | #5 | ✅ tested | old sign-in still works |
| ui | Customers | admin | desktop | - | ✅ tested | page loads; personal data visible to admin as expected |
| ui | My orders (Urdu company) | zain-1 | desktop | - | ✅ tested | right-to-left lead unconfirmed |
| api | Orders, totals, validation | acme-1 | - | - | ✅ tested | both sides of the 1,000.00 threshold and quantity limits |
| permissions | Role and company isolation | bright-1 | - | - | ✅ tested | orders, customers, admin actions |
| api | Login, health, products, me | admin | - | - | ✅ tested |  |

## Not tested

_Nothing here is reported as passing._

- **Password reset (forgot / reset password)**: Left out by the safety rules because it may send an email; no email sandbox was confirmed
- **Admin Portal and Client New order page on a phone-sized screen**: Not reached in this run (desktop only for these pages)
- **Form edge cases in the portals (long text, special characters, double click, expired session)**: Covered over the system's back end only; not repeated in the browser forms in this run
- **Orders Export CSV button and client users acme-2 and bright-1 in the browser**: Not covered in this run
- **Rate limiting**: No limit documented; not verified

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-baseline | 100 | 86 | 8 | 11 | [data/api-results/admin-baseline.json](data/api-results/admin-baseline.json) |
| biz | 41 | 29 | 12 | 17 | [data/api-results/biz.json](data/api-results/biz.json) |
| client-baseline | 64 | 52 | 12 | 21 | [data/api-results/client-baseline.json](data/api-results/client-baseline.json) |
| explore | 3 | 3 | 0 | 0 | [data/api-results/explore.json](data/api-results/explore.json) |
| stale | 6 | 4 | 2 | 2 | [data/api-results/stale.json](data/api-results/stale.json) |

## Memory

- Applied: First run: no earlier runs to apply

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: As each client role, GET /admin/customers and expect 403 → `test/permissions.test.js`
- **ISSUE-002**: Client of company B GETs company A's order id and expects 403/404 → `test/orders.test.js`
- **ISSUE-003**: Order of 80 x 1250c expects tax 9500 and total 104500 → `test/pricing.test.js`
- **ISSUE-004**: Logout then GET /me with same token expects 401 → `test/auth.test.js`
- **ISSUE-005**: POST orders with qty -3, 0, 1001, 1.5 and empty items expects 400 → `test/orders.test.js`
- **ISSUE-006**: Warm filtered list, change status as admin, re-read filtered list expects new status → `test/orders.test.js`
- **ISSUE-007**: At 390px width the first order row does not intersect the toolbar → `test/e2e/my-orders.mobile.test.js`
- **ISSUE-008**: GET /orders with page_size=0 and q=( expects 400/200, never 500 → `test/orders.test.js`
- **ISSUE-009**: Malformed JSON body response contains no stack or path → `test/errors.test.js`
- **ISSUE-010**: Two parallel identical orders yield one 201 and one 409 → `test/orders.test.js`
- **ISSUE-011**: Orders page controls all have accessible names → `test/e2e/accessibility.test.js`
- **ISSUE-012**: Sales report responds under 3000ms → `test/reports.test.js`

## Notes

- Evidence for the customers finding and the Customers page may contain personal data; review before sharing. Automatic masking of screenshots is not available in this version.
- About 40 QA- prefixed test orders were created in the demo data by this run (not cleaned up: the order API has no delete).
