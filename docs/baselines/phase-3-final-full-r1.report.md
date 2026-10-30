# QAMind Technical Report: run-20261030T081942Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T08:19:42.021Z |
| Project | ws (path-ws-7737e3ff04ed) |
| Environment | local demo |
| Branch / commit | main @ a766819 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 6m 33s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (11 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (7 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (4 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **5**   🟡 Minor: **2**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **6**
- API probes executed: **219** (48 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders validated and totalled by the stated rules
- **Risk:** Money wrong; invalid input accepted
- **Entry point:** POST /api/orders as acme-1 (source: openapi.yaml)
- **Expected results:** total = subtotal - discount + tax, discount at >= 1000.00; qty 1..1000, 1..50 items, reference 1..64
- **Exit condition:** Both sides of the 1000.00 threshold and all validation edges checked

### C2: Order status transitions  `api`

- **Goal:** Only admins move status along allowed transitions
- **Risk:** Illegal transitions or client changes
- **Entry point:** PATCH /api/admin/orders/{id}/status
- **Expected results:** placed->processing->shipped->delivered; cancel from placed/processing; others 409; clients 403
- **Exit condition:** Every transition cell tried on own QA- orders

### C3: Role and tenant isolation  `permissions`

- **Goal:** Clients see only own company data; admin endpoints admin-only
- **Risk:** Data exposure across companies
- **Entry point:** GET /orders, /orders/{id}, /admin/* with each role
- **Expected results:** 404 for other company's orders; 403 for client on admin endpoints
- **Exit condition:** Role matrix and acme-1/acme-2/bright-1 chains done

### C4: Sessions and sign-out  `api`

- **Goal:** Logout revokes token at once
- **Risk:** Session usable after sign-out
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Logout and bad-token probes done

### C5: Lists, search and pagination  `api`

- **Goal:** Orders list paging, filter, search correct
- **Risk:** Wrong counts, skipped rows
- **Entry point:** GET /orders with page, page_size, status, q
- **Expected results:** Bounds enforced; totals consistent
- **Exit condition:** Boundaries and combined filters checked

### C6: Client Portal: place order and My Orders  `ui`

- **Goal:** Critical flow 1 and 3 in the UI, desktop and mobile, incl. Urdu client
- **Risk:** Wrong totals, broken layout, RTL issues
- **Entry point:** http://127.0.0.1:4102
- **Expected results:** Confirmation shows total matching rule; order in My Orders with current status
- **Exit condition:** All pages, forms, viewports audited for acme-1, bright-1, zain-1

### C7: Admin Portal: orders, status, customers, reports  `ui`

- **Goal:** Critical flows 2 and 4 in the UI
- **Risk:** Stale data, wrong report numbers
- **Entry point:** http://127.0.0.1:4101
- **Expected results:** Status change visible to client after reload; report matches API and recomputation
- **Exit condition:** All pages audited desktop and mobile

### C8: Cross-UI consistency and warm-change-reread  `cross`

- **Goal:** Admin change visible to client; report agrees with orders
- **Risk:** Stale cache
- **Entry point:** Client reads, admin changes, client re-reads
- **Expected results:** New status at once
- **Exit condition:** Checked via API and UI

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Tax is calculated on the full subtotal instead of the discounted subtotal

- **Surface:** business-rule · **Area:** Orders / pricing · **Type:** business-rule
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

For orders at or above 1,000.00 the 5% discount is applied but tax is still 10% of the undiscounted subtotal, so every discounted order is overcharged.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with 80 x p-102 (unit 12.50), subtotal 100000 cents (see evidence/api/rules-T2.json)
3. Observe tax_cents 10000 and total_cents 105000
4. UI: Client Portal as acme-1 > New order, reference QA-ui-order-1, Ballpoint Pens x 80, Place order: confirmation says Total $1,050.00 and the order page shows Tax $100.00

**Expected:** discount 5000, tax 9500 (10% of 95000), total 104500 ($1,045.00)

**Actual:** discount 5000, tax 10000, total 105000. Same error for 154 x p-101 (tax 10010 vs 9510) and a multi-line order (10989 vs 10439). Orders below 1000.00 are correct.

**Evidence**

- [evidence/api/rules-T2.json](evidence/api/rules-T2.json)
- [evidence/api/rules-T3.json](evidence/api/rules-T3.json)
- [evidence/api/rules-T5.json](evidence/api/rules-T5.json)
- [screenshots/client-new-order-confirmation-desktop.png](screenshots/client-new-order-confirmation-desktop.png)
- [screenshots/client-order-detail-desktop.png](screenshots/client-order-detail-desktop.png)

**Suspected root cause:** Tax computed from subtotal rather than subtotal - discount

**Proposed regression test:** Order with subtotal 100000 expects tax 9500 and total 104500 (suggested location: `test/orders.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Any customer can read every company's customer records, including personal and card details

- **Surface:** permissions · **Area:** Admin / customers · **Type:** permissions
- **Roles:** acme-1, zain-1
- **Reproduced:** 2 of 2 attempts

GET /api/admin/customers returns 200 with all customer records for client roles; the spec says admin only.

**Steps to reproduce**

1. Sign in as acme-1 (a client) over the API
2. GET /api/admin/customers (evidence/api/recon-R2.json)
3. Observe 200 with contact details, ID numbers, addresses and card details of all companies; zain-1 gets the same (evidence/api/rules-A1.json)

**Expected:** 403 for client roles

**Actual:** 200 with all customers' records. One record's notes also contain a full card number.

**Evidence**

- [evidence/api/recon-R2.json](evidence/api/recon-R2.json)
- [evidence/api/rules-A1.json](evidence/api/rules-A1.json)

**Suspected root cause:** Admin role check missing on the customers route (reports route does check)

**Proposed regression test:** Client calling GET /admin/customers expects 403 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: A customer can open another company's order

- **Surface:** permissions · **Area:** Orders / tenant isolation · **Type:** permissions
- **Roles:** bright-1, zain-1
- **Reproduced:** 2 of 2 attempts

GET /api/orders/{id} returns 200 for an order owned by a different company; the spec requires 404.

**Steps to reproduce**

1. Sign in as acme-1 over the API and POST /api/orders (reference QA-iso)
2. Sign in as bright-1 (Bright Foods) and GET /api/orders/{that id} (evidence/api/rules-X3.json); zain-1 same (rules-X4.json)
3. Observe 200 with the order
4. UI: sign in to the Client Portal as bright-1 and open order.html?id=o-1042 (an Acme order): the order page is shown

**Expected:** 404 for another company's order

**Actual:** 200 and full order details. The order list and search are correctly filtered, only direct access leaks.

**Evidence**

- [evidence/api/rules-X3.json](evidence/api/rules-X3.json)
- [evidence/api/rules-X4.json](evidence/api/rules-X4.json)
- [screenshots/bright-sees-acme-order-ui.png](screenshots/bright-sees-acme-order-ui.png)

**Suspected root cause:** Detail lookup does not compare the order's company with the caller's company

**Proposed regression test:** Client of company B reading company A's order expects 404 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Signing out does not end the session on the server

- **Surface:** api · **Area:** Sign-in and sessions · **Type:** auth
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts

After POST /auth/logout returns 204 the same token is still accepted.

**Steps to reproduce**

1. Sign in as zain-1 over the API
2. POST /api/auth/logout: 204
3. GET /api/me and GET /api/orders with the same token (evidence/api/rules-O2.json, rules-O3.json)
4. Observe 200 on both

**Expected:** 401 as soon as the user signs out (spec and business rule)

**Actual:** 200; the old token keeps working

**Evidence**

- [evidence/api/rules-O2.json](evidence/api/rules-O2.json)
- [evidence/api/rules-O3.json](evidence/api/rules-O3.json)

**Suspected root cause:** Logout does not add the token to a revocation list

**Proposed regression test:** After logout the same token on GET /me expects 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders with zero, negative, fractional or oversized quantities, or no items, are accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

POST /orders accepts items:[] and quantities 0, -1, 1001 and 1.5 with HTTP 201; the negative quantity gives a negative total.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with items[0].quantity=-1 (evidence/api/rules-V1.json)
3. Observe 201 and a negative total; also quantity 0, 1001, 1.5 and empty items (client-base-P043..P046)

**Expected:** 400 naming the field; quantity must be a whole number 1 to 1000 and at least one item

**Actual:** 201 for all. The order list shows -$7.15 for a negative order and the sales report counts it.

**Evidence**

- [evidence/api/rules-V1.json](evidence/api/rules-V1.json)
- [evidence/api/client-base-P043.json](evidence/api/client-base-P043.json)
- [evidence/api/client-base-P044.json](evidence/api/client-base-P044.json)
- [evidence/api/client-base-P045.json](evidence/api/client-base-P045.json)
- [evidence/api/client-base-P046.json](evidence/api/client-base-P046.json)

**Suspected root cause:** No range or integer check on quantity and no minimum item count

**Proposed regression test:** Quantities -1, 0, 1001, 1.5 and empty items each expect 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Error answers reveal internal technical details (file locations and code traces)

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts

Malformed JSON to POST /auth/login and POST /orders returns a stack trace with server file paths in the error body.

**Steps to reproduce**

1. POST /api/auth/login with raw body {"broken": (evidence/api/client-base-P007.json)
2. Observe 400 with an error.trace field holding a stack trace and absolute file paths
3. Same for POST /api/orders (client-base-P048.json)

**Expected:** A short error without internals (spec: responses never include stack traces or file paths)

**Actual:** error.trace contains the stack and server file paths

**Evidence**

- [evidence/api/client-base-P007.json](evidence/api/client-base-P007.json)
- [evidence/api/client-base-P048.json](evidence/api/client-base-P048.json)

**Suspected root cause:** Error handler attaches err.stack

**Proposed regression test:** Malformed JSON response has no trace field (suggested location: `test/errors.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Some order list requests crash the server or ignore limits

- **Surface:** api · **Area:** Orders / lists · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts

GET /orders with page_size=0, q=( or q=\ returns HTTP 500; page_size=-1 returns 200 with page_size -1.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?page_size=0 (evidence/api/client-base-P019.json): 500
3. GET /api/orders?q=( and ?q=\ (P024, P028): 500
4. GET /api/orders?page_size=-1 (P020): 200

**Expected:** 400 for invalid values; searches with punctuation return normal results

**Actual:** 500 on three inputs; page_size=-1 accepted, against the documented 1 to 100

**Evidence**

- [evidence/api/client-base-P019.json](evidence/api/client-base-P019.json)
- [evidence/api/client-base-P020.json](evidence/api/client-base-P020.json)
- [evidence/api/client-base-P024.json](evidence/api/client-base-P024.json)
- [evidence/api/client-base-P028.json](evidence/api/client-base-P028.json)

**Suspected root cause:** Unvalidated page_size and the search text used as a regular expression

**Proposed regression test:** page_size 0 and -1 expect 400; q=( expects 200 (suggested location: `test/orders.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Placing the same order twice at once creates two orders

- **Surface:** api · **Area:** Orders / duplicate submission · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

Two identical POST /orders sent in parallel both return 201 and are stored. The spec does not say duplicates must be refused, so intent is uncertain.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. Send the same POST /orders twice at once (evidence/api/client-base-P049.json)
3. Observe two 201 responses and two orders

**Expected:** Probably one order, or a duplicate warning (not specified)

**Actual:** Two identical orders are created

**Evidence**

- [evidence/api/client-base-P049.json](evidence/api/client-base-P049.json)

**Suspected root cause:** No idempotency or duplicate guard

**Proposed regression test:** Two parallel identical orders: decide and assert the intended behaviour (suggested location: `test/orders.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: New order page does not fit a phone screen; Place order button is off screen

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / New order · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** chromium / 390x844
- **Reproduced:** 2 of 2 attempts

At 390px wide the page is 555px wide; reference, note, quantity, Remove and Place order sit beyond the right edge, and Remove is covered by the quantity box.

**Steps to reproduce**

1. Fresh profile, sign in to the Client Portal as acme-1
2. Set viewport 390x844
3. Open New order
4. Observe the fields cut off at the right edge and Place order starting at x=435 of 390
5. Reload: same (scrollWidth 555)

**Expected:** All fields and the Place order button are visible without sideways scrolling

**Actual:** Page scrolls sideways; the Place order button is hidden off screen

**Evidence**

- [screenshots/client-new-order-mobile.png](screenshots/client-new-order-mobile.png)

**Suspected root cause:** Fixed minimum widths on the form row

**Proposed regression test:** At 390px width page scrollWidth equals viewport width (suggested location: `test/e2e/new-order.spec.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: Urdu company names are shown back to front in the Admin Portal

- **Surface:** ui · **UI:** Admin Portal · **Area:** Admin Portal / Orders, Customers, Reports · **Type:** i18n
- **Roles:** admin
- **Browser / viewport:** chromium / 1366x768
- **Reproduced:** 2 of 2 attempts

Cells with Urdu text have unicode-bidi: bidi-override with direction ltr, so the letters appear in reverse order and unjoined.

**Steps to reproduce**

1. Sign in to the Admin Portal as admin
2. Open Orders: the client for Zain's orders reads reversed (screenshots/admin-orders-desktop.png)
3. Open Reports, wait about 5 seconds: Sales by client shows the same reversed name (admin-reports-loaded-desktop.png)
4. Inspect: the cell text is the correct string but computed unicode-bidi is bidi-override

**Expected:** The name displays correctly right to left

**Actual:** The name is displayed with letters reversed

**Evidence**

- [screenshots/admin-orders-desktop.png](screenshots/admin-orders-desktop.png)
- [screenshots/admin-reports-loaded-desktop.png](screenshots/admin-reports-loaded-desktop.png)

**Suspected root cause:** A text-cell style forces bidi-override ltr

**Proposed regression test:** Urdu client name cell must not use bidi-override (suggested location: `test/e2e/admin-i18n.spec.js`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: Sales report is slow and shows only a spinner for about four seconds

- **Surface:** api · **Area:** Admin / Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts

GET /admin/reports/sales takes about 4.0 seconds every time; the Reports page shows a spinner meanwhile.

**Steps to reproduce**

1. Sign in as admin over the API
2. GET /api/admin/reports/sales (evidence/api/recon-R4.json)
3. Observe about 4000 ms, repeatably

**Expected:** Under 3 seconds

**Actual:** 4003 to 4016 ms on every call

**Evidence**

- [evidence/api/recon-R4.json](evidence/api/recon-R4.json)
- [evidence/api/rules-L8.json](evidence/api/rules-L8.json)
- [screenshots/admin-reports-desktop.png](screenshots/admin-reports-desktop.png)

**Suspected root cause:** Artificial delay or an unindexed aggregation

**Proposed regression test:** Sales report responds under 3000 ms (suggested location: `test/reports.test.js`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Admin order search and icon buttons have no accessible names

- **Surface:** ui · **UI:** Admin Portal · **Area:** Admin Portal / Orders · **Type:** accessibility
- **Roles:** admin
- **Browser / viewport:** chromium / 1366x768
- **Reproduced:** 2 of 2 attempts

The search box has only a placeholder, and the refresh and clear buttons are icons with no text, label or title.

**Steps to reproduce**

1. Sign in to the Admin Portal as admin
2. Open Orders
3. Run the page audit: unnamedControls lists input#search, button#refresh, button#clear-filters (also at 390px)

**Expected:** Each control has an accessible name

**Actual:** Three controls have no name

**Evidence**

- [screenshots/admin-orders-desktop.png](screenshots/admin-orders-desktop.png)

**Suspected root cause:** Missing aria-label

**Proposed regression test:** Controls on the orders page have accessible names (suggested location: `test/e2e/admin-orders.spec.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: My orders on a phone: toolbar covers the first order row and the Total column is cut off** (ui, tried 1×): At 390px the audit reported the toolbar covering the newest row and the screenshot (screenshots/client-my-orders-mobile.png) shows Total clipped inside a scrolling box with no cue. Why unconfirmed: Seen on one page load only; not repeated

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in and My orders | acme-1 | desktop | #1 | ✅ tested | list, audit |
| ui | New order and confirmation | acme-1 | desktop | #1 | ✅ tested | placed 80 x pens; total wrong |
| ui | New order and confirmation | acme-1 | mobile | #1 | ✅ tested | layout broken |
| ui | My orders | acme-1 | mobile | #1 | ◐ partial | one load |
| ui | Order detail | acme-1 | desktop | #3 | ✅ tested | totals |
| ui | Order detail, other company | bright-1 | desktop | #3 | ✅ tested | sees status Processing after admin change; isolation fails |
| ui | My orders (Urdu client) | zain-1 | desktop | - | ✅ tested | literal text escaped |
| ui | Sign out | bright-1 | desktop | #5 | ✅ tested | UI redirects to sign in; server token stays valid (API) |
| ui | Orders list and order detail, status change | admin | desktop | #2 | ✅ tested | placed to processing |
| ui | Orders list | admin | mobile | - | ✅ tested | audit |
| ui | Reports | admin | desktop | #4 | ✅ tested | figures match API |
| ui | Customers | admin | desktop | - | ✅ tested | audit only |
| api | Orders, status, permissions, sessions, lists | all | - | - | ✅ tested | three plans, role matrix |
| ui | Admin Portal / Customers, Reports, order page on mobile | admin | mobile | - | ⛔ not tested |  |
| ui | Password reset (forgot and reset password) | anonymous | - | - | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Password reset (forgot and reset password)**: Would send email; no mail catcher is configured for this run
- **Session expiry after 15 minutes**: Not waited out in this run
- **Admin Portal / Customers, Reports, order page on mobile**: Only the Orders list was audited at 390px; other admin pages were desktop only
- **Client Portal / order page on mobile and acme-2 UI session**: Not covered in the browser; acme-2 was tested through the API only
- **Admin status moves shipped and delivered in the Admin Portal**: Only placed to processing was done in the UI; later moves were tested through the API
- **Security headers, CORS and rate limiting**: Not covered; no security smoke pass was run

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-base | 100 | 85 | 8 | 11 | [data/api-results/admin-base.json](data/api-results/admin-base.json) |
| client-base | 64 | 52 | 12 | 21 | [data/api-results/client-base.json](data/api-results/client-base.json) |
| recon | 5 | 3 | 2 | 2 | [data/api-results/recon.json](data/api-results/recon.json) |
| rules | 50 | 40 | 10 | 14 | [data/api-results/rules.json](data/api-results/rules.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Order with subtotal 100000 expects tax 9500 and total 104500 → `test/orders.test.js`
- **ISSUE-002**: Client calling GET /admin/customers expects 403 → `test/permissions.test.js`
- **ISSUE-003**: Client of company B reading company A's order expects 404 → `test/permissions.test.js`
- **ISSUE-004**: After logout the same token on GET /me expects 401 → `test/auth.test.js`
- **ISSUE-005**: Quantities -1, 0, 1001, 1.5 and empty items each expect 400 → `test/orders.test.js`
- **ISSUE-006**: Malformed JSON response has no trace field → `test/errors.test.js`
- **ISSUE-007**: page_size 0 and -1 expect 400; q=( expects 200 → `test/orders.test.js`
- **ISSUE-008**: Two parallel identical orders: decide and assert the intended behaviour → `test/orders.test.js`
- **ISSUE-009**: At 390px width page scrollWidth equals viewport width → `test/e2e/new-order.spec.js`
- **ISSUE-010**: Urdu client name cell must not use bidi-override → `test/e2e/admin-i18n.spec.js`
- **ISSUE-011**: Sales report responds under 3000 ms → `test/reports.test.js`
- **ISSUE-012**: Controls on the orders page have accessible names → `test/e2e/admin-orders.spec.js`
