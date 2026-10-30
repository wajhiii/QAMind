# QAMind Technical Report: run-20261030T080355Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T08:03:55.266Z |
| Project | ws (path-ws-c57ec64f46a0) |
| Environment | local demo |
| Branch / commit | main @ f8f9905 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 6m 27s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (13 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (4 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **4**   🟡 Minor: **4**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **5**
- API probes executed: **197** (40 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the stated rules
- **Risk:** Money is calculated wrongly
- **Entry point:** POST /api/orders as a client
- **Expected results:** Quantity 1-1000 whole; at least one item; subtotal>=1000 gets 5% off; tax 10% on discounted subtotal
- **Exit condition:** Boundaries 999.99/1000.00/1000.01 and quantity 0,1,1000,1001 checked

### C2: Role and customer isolation  `permissions`

- **Goal:** Clients cannot reach admin functions or other companies' orders; same company shares
- **Risk:** Data exposure
- **Entry point:** API as acme-1, acme-2, bright-1, zain-1, anonymous
- **Expected results:** 403/404 across companies, 403 on admin endpoints
- **Exit condition:** Chains for detail, list, search and status change done

### C3: Status changes and sessions  `api`

- **Goal:** Status moves placed>processing>shipped>delivered/cancelled; logout revokes token
- **Risk:** Illegal transitions, live token after logout
- **Entry point:** PATCH /admin/orders/{id}/status, POST /auth/logout
- **Expected results:** 409 on illegal moves; 401 after logout
- **Exit condition:** Transitions and logout chain checked

### C4: Critical flows 1-5 in the two portals  `ui`

- **Goal:** Place order, admin moves status, client sees it, reports, sign out
- **Risk:** Core journey broken or stale
- **Entry point:** Client Portal, Admin Portal
- **Expected results:** As in config
- **Exit condition:** All five flows run end to end

### C5: Page audit desktop and mobile, Urdu tenant  `ui`

- **Goal:** Pages are usable, accessible and RTL-correct
- **Risk:** Layout, labels, RTL defects
- **Entry point:** Every page, zain-1 for RTL
- **Expected results:** No overflow, named controls, correct direction
- **Exit condition:** Every page audited at 1366x768 and 390x844

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Any signed-in customer can list every customer's personal and payment details

- **Surface:** permissions · **Area:** Admin customers · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts

GET /api/admin/customers returns 200 with all customer records (contact name, email, phone, national ID, address, card last 4 digits, internal notes including a card number mentioned in a note) to client accounts. The spec says 401/403 only for admins.

**Steps to reproduce**

1. Sign in over the API as acme-1 (a client account)
2. GET /api/admin/customers (see evidence for the curl)
3. Observe HTTP 200 with records of three companies
4. Repeat as bright-1: same result

**Expected:** HTTP 403 for any non-admin role

**Actual:** HTTP 200 with all customers' personal data for acme-1 and bright-1 (reproduced twice each; anonymous is correctly 401)

**Evidence**

- [evidence/api/reread-RR4.json](evidence/api/reread-RR4.json)
- [evidence/api/undefined-M1.json](evidence/api/undefined-M1.json)
- [evidence/api/undefined-R2.json](evidence/api/undefined-R2.json)

**Suspected root cause:** The customers route only checks for a valid sign-in, not the admin role (BFLA, OWASP API5:2023)

**Proposed regression test:** As each client role, GET /admin/customers and expect 403 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: A customer of one company can open another company's order

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** bright-1, acme-1
- **Reproduced:** 2 of 2 attempts

GET /api/orders/{id} for an order created by acme-1 returns 200 with full contents when requested by bright-1 (a different company). The list endpoint did not show it, so only the detail is unscoped.

**Steps to reproduce**

1. Sign in over the API as acme-1, POST /api/orders with reference QA-rule-at and one line of 80 x p-102; note the order id
2. Sign in as bright-1 and GET /api/orders/{id}
3. Observe HTTP 200 and Acme Traders' order
4. Repeat once more (see evidence)

**Expected:** HTTP 403 or 404 and no order data

**Actual:** HTTP 200 with the order, client name, items and totals (2 of 2). The same order is correctly absent from bright-1's list.

**Evidence**

- [evidence/api/undefined-I2.json](evidence/api/undefined-I2.json)
- [evidence/api/undefined-I3.json](evidence/api/undefined-I3.json)

**Suspected root cause:** Order lookup by id does not filter on the caller's company (BOLA, OWASP API1:2023)

**Proposed regression test:** Client A creates an order; client B (other company) GETs it and expects 403/404 (suggested location: `test/isolation.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Signing out does not end the session: the old sign-in still works

- **Surface:** api · **Area:** Authentication · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts

After POST /api/auth/logout returns 204, the same token still gets 200 from GET /api/me.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. POST /api/auth/logout and observe 204
3. GET /api/me with the same token
4. Observe HTTP 200 instead of 401 (see evidence for both attempts)

**Expected:** HTTP 401 for the token after logout (config rule: signing out ends the session at once)

**Actual:** HTTP 200 with the user's profile (2 of 2)

**Evidence**

- [evidence/api/undefined-L2.json](evidence/api/undefined-L2.json)

**Suspected root cause:** Logout does not revoke the token server-side

**Proposed regression test:** Log out then call /me with the same token and expect 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Order tax is calculated on the undiscounted subtotal, so totals are wrong whenever the 5% discount applies

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / totals · **Type:** money
- **Roles:** acme-1
- **Browser / viewport:** chromium / desktop
- **Reproduced:** 2 of 2 attempts

For subtotals of 1,000.00 or more the discount is correct but tax is 10% of the full subtotal instead of the discounted subtotal. Example: 80 x 12.50 = 1,000.00, discount 50.00, tax 100.00 (expected 95.00), total 1,050.00 (expected 1,045.00). Below the threshold (990.99) totals are correct.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders reference QA-rule-at with items [{product_id p-102, quantity 80}]
3. Compare subtotal_cents 100000, discount_cents 5000, tax_cents 10000, total_cents 105000 with expected 100000/5000/9500/104500
4. Repeat with 80 x p-102 + 2 x p-101 (expected tax about 96.24, got 101.30) and 1000 x p-104
5. UI: Client Portal New order, 12 x Printer Toner Cartridge shows Total $1,133.88; expected $1,128.47

**Expected:** Total = subtotal - discount + 10% of the discounted subtotal (e.g. 1,045.00 for 1,000.00)

**Actual:** Tax uses the undiscounted subtotal on every order at or above 1,000.00; customers are overcharged about 0.5% (reproduced on 4 orders in the API and in the UI)

**Evidence**

- [evidence/api/undefined-T2.json](evidence/api/undefined-T2.json)
- [evidence/api/undefined-T3.json](evidence/api/undefined-T3.json)
- [evidence/api/undefined-T4.json](evidence/api/undefined-T4.json)
- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)
- [screenshots/client-order-detail-desktop.png](screenshots/client-order-detail-desktop.png)

**Suspected root cause:** Tax computed from subtotal instead of subtotal minus discount

**Proposed regression test:** Order of 1,000.00 expects discount 50.00, tax 95.00, total 1,045.00; 990.99 expects no discount (suggested location: `test/orders.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders with zero, negative, fractional or too-large quantities, or no items, are accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

POST /api/orders returns 201 for items = [], quantity 0, 1001, 1.5 and -3. Quantity -3 produces an order with total -21.45 that also appears in the admin list and in sales figures. The spec and config say quantity is a whole number 1-1000 and at least one item.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items [{product_id p-101, quantity -3}] and reference QA-rule-neg
3. Observe 201 and total_cents -2145
4. Repeat for items [] , quantity 0, 1001 and 1.5 (see baseline-client evidence)

**Expected:** HTTP 400 naming the field

**Actual:** HTTP 201 for all five invalid bodies (2 of 2 each)

**Evidence**

- [evidence/api/undefined-T7.json](evidence/api/undefined-T7.json)
- [evidence/api/baseline-client-P043.json](evidence/api/baseline-client-P043.json)
- [evidence/api/baseline-client-P044.json](evidence/api/baseline-client-P044.json)
- [evidence/api/baseline-client-P045.json](evidence/api/baseline-client-P045.json)
- [evidence/api/baseline-client-P046.json](evidence/api/baseline-client-P046.json)

**Suspected root cause:** No range or integer check on item quantity and no check that items is non-empty

**Proposed regression test:** POST orders with quantity 0, -1, 1001, 1.5 and empty items; expect 400 each (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Order list returns a server error for page_size=0 and for searches containing ( or \, and accepts page_size=-1

- **Surface:** api · **Area:** Orders / list · **Type:** validation
- **Roles:** admin, acme-1
- **Reproduced:** 2 of 2 attempts

GET /api/orders?page_size=0, ?q=( and ?q=\ return HTTP 500 for every role tried; page_size=-1 returns 200 although the spec minimum is 1.

**Steps to reproduce**

1. Sign in over the API as admin or acme-1
2. GET /api/orders?page_size=0
3. GET /api/orders?q=(
4. Observe HTTP 500 each time (evidence has the curl)

**Expected:** HTTP 400 for invalid page_size; special characters in search treated as plain text

**Actual:** HTTP 500 (2 of 2 each, as admin and as client)

**Evidence**

- [evidence/api/baseline-admin-P019.json](evidence/api/baseline-admin-P019.json)
- [evidence/api/baseline-admin-P024.json](evidence/api/baseline-admin-P024.json)
- [evidence/api/baseline-admin-P028.json](evidence/api/baseline-admin-P028.json)
- [evidence/api/baseline-client-P019.json](evidence/api/baseline-client-P019.json)
- [evidence/api/baseline-client-P020.json](evidence/api/baseline-client-P020.json)

**Suspected root cause:** page_size not validated; q is probably used unescaped as a regular expression

**Proposed regression test:** GET /orders with page_size 0/-1 expects 400; q='(' expects 200 (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Malformed requests return internal technical details (stack trace and file paths)

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts

Malformed JSON sent to POST /auth/login and POST /orders returns 400 with a stack trace, server file paths and a stack field.

**Steps to reproduce**

1. POST /api/auth/login with body {bad json
2. Read the 400 body: it contains a stack trace and server source paths
3. Repeat on POST /api/orders as acme-1

**Expected:** A short error message without internals

**Actual:** Stack trace and file paths in the response (2 of 2 on both endpoints)

**Evidence**

- [evidence/api/baseline-admin-P007.json](evidence/api/baseline-admin-P007.json)
- [evidence/api/baseline-client-P048.json](evidence/api/baseline-client-P048.json)

**Suspected root cause:** Default error handler returns the error stack to the client

**Proposed regression test:** Send malformed JSON and assert the body has no 'stack' or file paths (suggested location: `test/errors.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: The customer's orders list keeps showing an old status after an admin changes it

- **Surface:** cross · **Area:** Orders / status · **Type:** stale-data
- **Roles:** acme-1, acme-2, admin
- **Reproduced:** 2 of 2 attempts

After an admin set QA-ui-order-1 to processing in the Admin Portal, GET /api/orders/{id} shows processing at once but GET /api/orders?q=QA-ui-order-1 (the list) still shows placed for acme-1 and acme-2, still stale about 50 seconds later.

**Steps to reproduce**

1. Warm: sign in as acme-1 and view the order in the Client Portal (status placed)
2. Admin Portal: open the order, choose Processing, click Update status (message confirms)
3. As acme-1 over the API, GET /orders/{id} -> processing
4. GET /orders?q=QA-ui-order-1 -> still placed (repeat after ~50 s: still placed)

**Expected:** List and detail agree immediately

**Actual:** The list shows the old status; the detail shows the new one (2 of 2 for acme-1 and acme-2)

**Evidence**

- [evidence/api/reread-RR2.json](evidence/api/reread-RR2.json)
- [evidence/api/stale-ST2.json](evidence/api/stale-ST2.json)
- [evidence/api/stale-ST3.json](evidence/api/stale-ST3.json)
- [evidence/api/stale-ST1.json](evidence/api/stale-ST1.json)

**Suspected root cause:** A cached orders list per company is not cleared when a status changes (an unwaited cache lifetime may be longer than 50 s)

**Proposed regression test:** Warm list, admin changes status, re-read list and expect new status (suggested location: `test/orders.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Sending an order twice at once creates two identical orders

- **Surface:** api · **Area:** Orders / duplicates · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

Two identical simultaneous POST /api/orders were both accepted with 201 (two orders). No idempotency mechanism is documented, so it is unclear whether this is intended; the risk is a customer double-clicking.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send the same POST /api/orders twice at the same moment
3. Observe two 201 responses with different ids

**Expected:** One order, or a clear duplicate warning (not stated in the spec)

**Actual:** Two orders created (2 of 2); I could not tell whether this is intended

**Evidence**

- [evidence/api/baseline-client-P049.json](evidence/api/baseline-client-P049.json)

**Suspected root cause:** No de-duplication or idempotency key

**Proposed regression test:** Parallel identical order POSTs expect a single order (suggested location: `test/orders.test.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟡 Minor: The Sales summary report takes about 4 seconds to load

- **Surface:** ui · **UI:** Admin Portal · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Browser / viewport:** chromium / desktop
- **Reproduced:** 2 of 2 attempts

GET /api/admin/reports/sales takes 4003 ms and 4006 ms against a 3000 ms guideline; the Reports page shows only a spinner meanwhile.

**Steps to reproduce**

1. Sign in to the Admin Portal
2. Open Reports
3. Wait for the spinner (about 4 s); the API call measures 4.0 s on two runs

**Expected:** Under 3 seconds

**Actual:** About 4 seconds (2 of 2)

**Evidence**

- [evidence/api/baseline-admin-P061.json](evidence/api/baseline-admin-P061.json)
- [evidence/api/baseline-admin-P093.json](evidence/api/baseline-admin-P093.json)
- [screenshots/admin-reports-desktop.png](screenshots/admin-reports-desktop.png)

**Suspected root cause:** A slow query or an artificial delay in the report

**Proposed regression test:** Report responds in under 3 s (suggested location: `test/reports.test.js`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: On a phone, My orders hides the first order and cuts off the Total column

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts

At 390x844 the filter toolbar overlaps the first order row and the table scrolls sideways (474 px inside 359 px) with no visible cue, so Total is cut off.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Set the window to 390x844
3. Open My orders
4. Observe the first row under the toolbar and totals clipped (second fresh load measured the same numbers)

**Expected:** All rows and totals visible or an obvious way to scroll

**Actual:** First row covered, Total cut off (2 of 2)

**Evidence**

- [screenshots/client-orders-mobile.png](screenshots/client-orders-mobile.png)
- [evidence/ui-audit-notes.txt](evidence/ui-audit-notes.txt)

**Suspected root cause:** Table wrapper overlaps the toolbar on narrow screens

**Proposed regression test:** At 390px width no element covers the first order row (suggested location: `test/ui/my-orders.spec.js`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Some controls have no accessible name (product choice, search box, refresh and clear buttons)

- **Surface:** ui · **UI:** Client Portal and Admin Portal · **Area:** Accessibility · **Type:** accessibility
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop and mobile
- **Reproduced:** 2 of 2 attempts

The product dropdown on New order (Client Portal) has no label; on the Admin Orders page the search box has only a placeholder and the refresh and clear-filters icon buttons have no name.

**Steps to reproduce**

1. Open Client Portal New order and run the page audit: select[name=product] is unnamed
2. Open Admin Portal Orders and run the audit at 390x844: input#search, #refresh and #clear-filters are unnamed
3. Repeat at desktop width (the two icon buttons are also nameless in the page structure)

**Expected:** Every control has a label a screen reader can announce

**Actual:** Four unnamed controls on two pages (2 of 2)

**Evidence**

- [evidence/ui-audit-notes.txt](evidence/ui-audit-notes.txt)

**Suspected root cause:** Missing label or aria-label attributes

**Proposed regression test:** Accessibility check that no input or button lacks a name (suggested location: `test/ui/a11y.spec.js`)

<a id="ISSUE-013"></a>

### ISSUE-013 🟡 Minor: Urdu order references show their hyphen and digits in a confusing order

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My orders (Urdu company) · **Type:** i18n
- **Roles:** zain-1
- **Browser / viewport:** chromium / desktop
- **Reproduced:** 2 of 2 attempts

References mixing Urdu text and digits (for example the one ending in 1044) are shown in a left-to-right cell and the hyphen and number display scrambled.

**Steps to reproduce**

1. Sign in to the Client Portal as the Urdu company's user
2. Open My orders
3. Look at the Reference column (page audit lists 3 rows)

**Expected:** The reference reads correctly in order

**Actual:** Hyphen and digits appear in an unexpected visual order (3 of 3 rows; screenshot)

**Evidence**

- [screenshots/zain-orders.png](screenshots/zain-orders.png)
- [evidence/ui-audit-notes.txt](evidence/ui-audit-notes.txt)

**Suspected root cause:** No dir/bdi isolation for mixed-direction text

**Proposed regression test:** Reference cells use bdi or dir=auto (suggested location: `test/ui/rtl.spec.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in, New order and confirmation | acme-1 | desktop | #1 | ✅ tested | order placed, total wrong (finding) |
| ui | My orders and order detail | acme-1 | desktop and mobile | #1 | ✅ tested | order found; mobile layout finding |
| ui | Orders list and order status change | admin | desktop | #2 | ✅ tested | moved to processing in UI; API covers placed-processing-shipped |
| cross | Client sees new status after reload | acme-1 | desktop | #3 | ◐ partial | order detail updated; list view stale (finding) |
| ui | Reports | admin | desktop | #4 | ✅ tested | loads in about 4 s; figures read, not recomputed |
| ui | Sign out | acme-1 | desktop | #5 | ◐ partial | screen sign-out returns to sign-in; old sign-in still works over the API (finding) |
| api | All 13 API operations incl. role matrix | admin and 4 clients | n/a | - | ✅ tested | baseline plans plus rules and isolation plans |
| business-rule | Discount, tax and quantity rules | acme-1 | n/a | - | ✅ tested | boundaries 990.99, 1000.00, above; qty -3,0,1,1000,1001 |
| permissions | Company isolation and admin-only endpoints | all | n/a | - | ✅ tested | findings raised |
| ui | Urdu company My orders | zain-1 | desktop | - | ✅ tested | mixed-direction references |
| ui | Orders list on mobile | admin | mobile | - | ✅ tested | unnamed controls |
| ui | Customers page on screen | admin | desktop | - | ⛔ not tested | not opened |
| ui | Password reset | anonymous | n/a | - | ⛔ not tested | email side effect |

## Not tested

_Nothing here is reported as passing._

- **Password reset**: Would send real email; no email sandbox confirmed
- **Customers page on screen**: Not opened in the browser this run (data checked via the API only)
- **Admin Portal / Export CSV**: Not exercised; file download content not verified
- **Expired sign-ins and phone layout of remaining pages**: Session expiry could not be waited out; pages other than My orders and Admin Orders not audited on mobile
- **Report figures and later status steps on screen**: Report totals only read, not recomputed; admin UI status change tested only to processing (API covered placed to shipped and illegal moves)

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| baseline-admin | 100 | 86 | 8 | 11 | [data/api-results/baseline-admin.json](data/api-results/baseline-admin.json) |
| baseline-client | 64 | 52 | 12 | 21 | [data/api-results/baseline-client.json](data/api-results/baseline-client.json) |
| reread | 4 | 2 | 2 | 2 | [data/api-results/reread.json](data/api-results/reread.json) |
| stale | 3 | 1 | 2 | 2 | [data/api-results/stale.json](data/api-results/stale.json) |
| rules | 23 | 19 | 4 | 4 | [data/api-results/undefined-2.json](data/api-results/undefined-2.json) |
| recon | 3 | 3 | 0 | 0 | [data/api-results/undefined.json](data/api-results/undefined.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: As each client role, GET /admin/customers and expect 403 → `test/permissions.test.js`
- **ISSUE-002**: Client A creates an order; client B (other company) GETs it and expects 403/404 → `test/isolation.test.js`
- **ISSUE-003**: Log out then call /me with the same token and expect 401 → `test/auth.test.js`
- **ISSUE-004**: Order of 1,000.00 expects discount 50.00, tax 95.00, total 1,045.00; 990.99 expects no discount → `test/orders.test.js`
- **ISSUE-005**: POST orders with quantity 0, -1, 1001, 1.5 and empty items; expect 400 each → `test/orders.test.js`
- **ISSUE-006**: GET /orders with page_size 0/-1 expects 400; q='(' expects 200 → `test/orders.test.js`
- **ISSUE-007**: Send malformed JSON and assert the body has no 'stack' or file paths → `test/errors.test.js`
- **ISSUE-008**: Warm list, admin changes status, re-read list and expect new status → `test/orders.test.js`
- **ISSUE-009**: Parallel identical order POSTs expect a single order → `test/orders.test.js`
- **ISSUE-010**: Report responds in under 3 s → `test/reports.test.js`
- **ISSUE-011**: At 390px width no element covers the first order row → `test/ui/my-orders.spec.js`
- **ISSUE-012**: Accessibility check that no input or button lacks a name → `test/ui/a11y.spec.js`
- **ISSUE-013**: Reference cells use bdi or dir=auto → `test/ui/rtl.spec.js`
