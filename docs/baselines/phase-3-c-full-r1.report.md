# QAMind Technical Report: run-20261030T095612Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T09:56:12.453Z |
| Project | ws (path-ws-8c3ade06e153) |
| Environment | local demo |
| Branch / commit | main @ 56ac1a5 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 4m 31s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (14 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (4 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **4**   🟡 Minor: **2**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **5**
- API probes executed: **112** (33 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the config rules
- **Risk:** Money is calculated wrongly; invalid input accepted
- **Entry point:** POST /api/orders as a client
- **Expected results:** Quantity 1..1000 whole, at least one item; subtotal>=1000.00 gets 5% discount; tax 10% on discounted subtotal
- **Exit condition:** Both sides of the 1,000.00 threshold and quantity edges checked; arithmetic recomputed independently

### C2: Auth, logout and sessions  `api`

- **Goal:** Logout revokes the token at once; bad credentials refused
- **Risk:** Session usable after sign-out
- **Entry point:** POST /auth/login, /auth/logout, GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Logout chain and anonymous access verified

### C3: Role and tenant isolation  `permissions`

- **Goal:** Clients see only own company; admin endpoints admin only
- **Risk:** Data exposure
- **Entry point:** GET /orders, /orders/{id}, /admin/* as each role
- **Expected results:** 403/404 across tenants; 403 for clients on admin endpoints
- **Exit condition:** Role matrix and cross-tenant chains checked via API and UI URLs

### C4: Order status lifecycle  `api`

- **Goal:** Status moves placed>processing>shipped>delivered/cancelled only
- **Risk:** Illegal transitions accepted
- **Entry point:** PATCH /admin/orders/{id}/status on a QA- order
- **Expected results:** 409 on illegal moves
- **Exit condition:** Forward, skip, backward and invalid transitions checked

### C5: Client Portal critical flow 1 and 3  `ui`

- **Goal:** Client places an order and later sees updated status
- **Risk:** Blocked ordering, stale data
- **Entry point:** Client Portal as acme-1
- **Expected results:** Confirmation with correct total; order in My Orders; status updates visible after reload
- **Exit condition:** Desktop and mobile, empty/long/special input, double submit

### C6: Admin Portal flows 2, 4  `ui`

- **Goal:** Admin finds order, changes status, sees Reports
- **Risk:** Wrong numbers, broken status change
- **Entry point:** Admin Portal as admin
- **Expected results:** Status moves forward; Reports match orders
- **Exit condition:** All pages visited, desktop and mobile

### C7: Urdu / RTL client  `ui`

- **Goal:** RTL content renders correctly
- **Risk:** Layout and truncation
- **Entry point:** Client Portal as zain-1
- **Expected results:** Correct direction, alignment, number order
- **Exit condition:** All client pages checked

### C8: Cross-checks and sign-out  `cross`

- **Goal:** Totals/counts agree across UI, API, reports; sign-out ends session
- **Risk:** Stale or inconsistent data
- **Entry point:** Warm-change-reread admin vs client
- **Expected results:** Immediate consistency
- **Exit condition:** Reports sum equals orders; stale reads checked

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Tax is calculated before the 5% discount, so orders of 1,000.00 or more are overcharged

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders · **Type:** business-rule
- **Roles:** acme-1, admin
- **Browser / viewport:** desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

For orders with subtotal >= 1,000.00 the tax is 10% of the undiscounted subtotal; the rule says tax applies to the discounted subtotal.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with 80 x p-102 (1250 cents each), subtotal 100000
3. Read the response: discount_cents 5000, tax_cents 10000, total_cents 105000
4. Repeat with 1000 x p-101 (subtotal 650000): tax 65000, total 682500
5. Same totals are shown in Client Portal confirmation ($1,050.00) and the Admin Portal order page

**Expected:** Subtotal 1000.00, discount 50.00, tax 95.00 (10% of 950.00), total 1,045.00. For 6,500.00 subtotal: tax 617.50, total 6,792.50

**Actual:** Tax 100.00 and total 1,050.00; second case tax 650.00 and total 6,825.00 (32.50 too high)

**Evidence**

- [evidence/api/rules-R3.json](evidence/api/rules-R3.json)
- [evidence/api/rules-R6.json](evidence/api/rules-R6.json)
- [screenshots/client-confirm-desktop.png](screenshots/client-confirm-desktop.png)

**Suspected root cause:** Tax computed from subtotal rather than subtotal - discount in the order total calculation

**Proposed regression test:** Order with subtotal 100000 cents expects tax 9500 and total 104500 (suggested location: `test/orders.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: A user from one company can read another company's orders by id

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

GET /api/orders/{id} returns 200 with full order details to clients of other companies (bright-1 and zain-1 read an Acme Traders order).

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders (QA- reference); note the id
2. Sign in as bright-1 and GET /api/orders/{id}
3. Sign in as zain-1 and GET /api/orders/{id}
4. Both get 200 and the full order (see evidence)

**Expected:** 403 or 404 for other companies

**Actual:** 200 with the Acme Traders order for both other companies

**Evidence**

- [evidence/api/rules-X3.json](evidence/api/rules-X3.json)
- [evidence/api/rules-X4.json](evidence/api/rules-X4.json)

**Suspected root cause:** Order detail handler looks up by id without checking the caller's client_id (the list endpoint does filter)

**Proposed regression test:** Client B requests client A's order id and expects 403/404 (suggested location: `test/orders.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Any signed-in client can list all customer records, including personal and card details

- **Surface:** permissions · **Area:** Customers · **Type:** role-isolation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

GET /api/admin/customers returns 200 to a client role; response contains contact names, emails, phone numbers, national ID numbers, addresses and card last four digits.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/admin/customers
3. Observe 200 and a list of all companies' contact records (see evidence)

**Expected:** 403 for non-admin roles

**Actual:** 200 with all customer records

**Evidence**

- [evidence/api/rules-X8.json](evidence/api/rules-X8.json)

**Suspected root cause:** Admin role check missing on the customers route (the reports and status routes do return 403)

**Proposed regression test:** Client role GET /admin/customers expects 403 (suggested location: `test/admin.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Signing out does not end the session: the old sign-in keeps working

- **Surface:** api · **Area:** Authentication · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

After POST /auth/logout returns 204, the same token still gets 200 from GET /me and GET /orders.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. GET /api/orders with the same token
5. Both return 200

**Expected:** 401 immediately after sign-out

**Actual:** 200 with the user's data; the token stays valid

**Evidence**

- [evidence/api/rules-L2.json](evidence/api/rules-L2.json)
- [evidence/api/rules-L3.json](evidence/api/rules-L3.json)

**Suspected root cause:** Logout does not revoke the token server-side (the spec says it should)

**Proposed regression test:** Logout then GET /me with the same token expects 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Order quantity and item rules are not enforced (0, 1001, 1.5, negative, and empty item lists accepted)

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /api/orders returns 201 for quantity 0, 1001, 1.5 and -3 and for an empty items array. A -3 quantity creates a negative total (-$21.45) that appears in both portals and reduces sales.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items[0].quantity = -3, then 0, 1001, 1.5, and items = []
3. Each returns 201; the -3 order has a negative total (see evidence)

**Expected:** 400 naming the field: quantity must be a whole number from 1 to 1000; at least one item required

**Actual:** 201, order created

**Evidence**

- [evidence/api/client-baseline-P043.json](evidence/api/client-baseline-P043.json)
- [evidence/api/client-baseline-P044.json](evidence/api/client-baseline-P044.json)
- [evidence/api/client-baseline-P045.json](evidence/api/client-baseline-P045.json)
- [evidence/api/client-baseline-P046.json](evidence/api/client-baseline-P046.json)
- [evidence/api/rules-R10.json](evidence/api/rules-R10.json)

**Suspected root cause:** No range or integer check and no minimum item count in the order handler

**Proposed regression test:** Table-driven test: invalid quantities and empty items return 400 and create nothing (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Orders list fails with a server error for page_size=0 and for search text such as ( or \

- **Surface:** api · **Area:** Orders · **Type:** error-handling
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/orders returns 500 for page_size=0 and q=( and q=\; page_size=-1 returns 200 although the spec minimum is 1.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?page_size=0 -> 500
3. GET /api/orders?q=( -> 500
4. GET /api/orders?q=\ -> 500

**Expected:** 400 for invalid values; special characters searched literally

**Actual:** 500 for those; 200 for page_size=-1

**Evidence**

- [evidence/api/client-baseline-P019.json](evidence/api/client-baseline-P019.json)
- [evidence/api/client-baseline-P024.json](evidence/api/client-baseline-P024.json)
- [evidence/api/client-baseline-P028.json](evidence/api/client-baseline-P028.json)
- [evidence/api/client-baseline-P020.json](evidence/api/client-baseline-P020.json)

**Suspected root cause:** Search text used unescaped as a regular expression; page_size not range checked (divide by zero)

**Proposed regression test:** q with regex characters and page_size 0/-1 return 200/400, never 500 (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Placing the same order twice at once creates two orders

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Two identical simultaneous POST /api/orders both return 201 and create two orders. No duplicate protection exists. Unsure whether this is intended; not tried via the UI button.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send the same POST /api/orders twice in parallel (see evidence)
3. Both return 201 with different order ids

**Expected:** One order, or the second refused

**Actual:** Two orders created

**Evidence**

- [evidence/api/client-baseline-P049.json](evidence/api/client-baseline-P049.json)

**Suspected root cause:** No idempotency key or duplicate check on order creation

**Proposed regression test:** Parallel identical order posts create at most one order (suggested location: `test/orders.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Malformed request bodies return stack traces and server file paths

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Invalid JSON sent to POST /auth/login and POST /orders returns 400 with a stack trace, file paths and a stack field.

**Steps to reproduce**

1. POST /api/auth/login with raw body {"broken": (no sign-in needed)
2. Observe 400 body containing stack trace and source paths
3. Repeat with POST /api/orders

**Expected:** Short generic error message

**Actual:** Stack trace and file paths exposed

**Evidence**

- [evidence/api/client-baseline-P007.json](evidence/api/client-baseline-P007.json)
- [evidence/api/client-baseline-P048.json](evidence/api/client-baseline-P048.json)

**Suspected root cause:** Default error handler returns error.stack to the client

**Proposed regression test:** Malformed JSON returns 400 with no 'stack' field or paths (suggested location: `test/errors.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: My orders table overlaps the toolbar and cuts off Total and View at phone width

- **Surface:** ui · **UI:** Client Portal · **Area:** My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

At 390px the table header and first row sit under the Status/New order toolbar, the Total column is clipped and the View link is off-screen with no cue.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Resize to 390x844
3. Open My orders
4. Header row and first row are covered by the toolbar; totals show clipped (e.g. $1,05); table scrolls sideways (460 vs 359px)

**Expected:** All columns readable and reachable on a phone

**Actual:** Overlap and clipped columns

**Evidence**

- [screenshots/client-orders-mobile.png](screenshots/client-orders-mobile.png)
- [evidence/page-audit-notes.txt](evidence/page-audit-notes.txt)

**Suspected root cause:** Toolbar and table wrapper layout overlap at narrow widths

**Proposed regression test:** Visual check of My orders at 390px: no covered elements, totals visible (suggested location: `e2e/client-orders.spec.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟡 Minor: Some controls have no accessible name (product drop-down, search box, refresh and clear-filter buttons)

- **Surface:** ui · **UI:** Client Portal, Admin Portal · **Area:** Forms · **Type:** accessibility
- **Roles:** acme-1, admin
- **Browser / viewport:** desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

New order product select has no label; Admin Orders search has only a placeholder; the refresh and clear-filters icon buttons have no name.

**Steps to reproduce**

1. Open Client Portal New order and run page audit: select[name=product] unnamed
2. Open Admin Orders and run page audit: search input, refresh and clear-filters buttons unnamed
3. Repeat from a fresh load: same result

**Expected:** Every control has a label

**Actual:** Unnamed controls

**Evidence**

- [evidence/page-audit-notes.txt](evidence/page-audit-notes.txt)

**Suspected root cause:** Missing label / aria-label attributes

**Proposed regression test:** Accessibility check: no unnamed controls on New order and Admin Orders (suggested location: `e2e/a11y.spec.js`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: The Reports page takes about four seconds to show its numbers

- **Surface:** ui · **UI:** Admin Portal · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Browser / viewport:** desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

GET /api/admin/reports/sales took 4006 ms on both tries (limit 3000 ms); the page shows only its heading meanwhile.

**Steps to reproduce**

1. Sign in as admin over the API
2. GET /api/admin/reports/sales: 4006 ms
3. Open Admin Portal Reports: wait ~4 s for data

**Expected:** Under 3 seconds

**Actual:** About 4 seconds

**Evidence**

- [evidence/api/discover-D6.json](evidence/api/discover-D6.json)
- [screenshots/admin-reports-desktop.png](screenshots/admin-reports-desktop.png)

**Suspected root cause:** Slow aggregation or deliberate delay in the report handler

**Proposed regression test:** Sales report responds in under 3 s (suggested location: `test/reports.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Urdu text left-aligned in left-to-right cells** (ui, tried 2×): Audit flags Urdu company name (Admin Customers) and Urdu references (zain-1 My orders) as left-aligned in LTR cells. Text displays correctly and whole UI is English LTR, so unclear if it is a defect. Why unconfirmed: Visual result looked acceptable; no clear expected behaviour

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in, New order, confirmation | acme-1 | desktop | #1 | ✅ tested | order placed, total shown, audit |
| ui | My orders and order detail | acme-1 | desktop and mobile | #1 | ✅ tested | order found; mobile layout issue |
| ui | Orders list and order page, status change | admin | desktop | #2 | ✅ tested | placed to processing via UI; full lifecycle via API |
| cross | Client sees new status | acme-1 | API | #3 | ◐ partial | verified through the API immediately after change; browser reload not repeated |
| ui | Reports | admin | desktop | #4 | ✅ tested | totals consistent with orders; slow load |
| ui | Sign out | acme-1 | desktop | #5 | ✅ tested | UI returns to sign-in; session not revoked server-side |
| api | Sign-out and session | zain-1 | - | #5 | ✅ tested | token still valid |
| ui | Customers | admin | mobile | - | ✅ tested | audit only |
| ui | My orders (Urdu company) | zain-1 | desktop | - | ◐ partial | viewed and audited; other pages not repeated |
| api | All documented endpoints (baseline, validation, boundaries, role matrix) | all | - | - | ✅ tested | client baseline, rules, isolation and lifecycle plans |
| business-rule | Totals, discount threshold, quantity limits, status lifecycle | acme-1, admin | - | - | ✅ tested |  |

## Not tested

_Nothing here is reported as passing._

- **Password reset (forgot / reset password)**: Would send email; excluded as a possible real-world side effect
- **Double-click on Place order in the UI**: Not run in the browser in this pass; API duplicate probe only
- **Admin Portal / mobile pages (Orders, Order, Reports)**: Only Customers checked at 390px; other admin pages not covered at mobile width
- **Client Portal / direct URL to another company's order in the browser**: Confirmed through the API only
- **Cached values after change (warm, change, re-read) in the browser**: Checked via API only (status change visible at once); browser re-read of client list not done

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| client-baseline | 64 | 52 | 12 | 21 | [data/api-results/client-baseline.json](data/api-results/client-baseline.json) |
| discover | 8 | 7 | 1 | 1 | [data/api-results/discover.json](data/api-results/discover.json) |
| rules | 40 | 32 | 8 | 11 | [data/api-results/rules.json](data/api-results/rules.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Order with subtotal 100000 cents expects tax 9500 and total 104500 → `test/orders.test.js`
- **ISSUE-002**: Client B requests client A's order id and expects 403/404 → `test/orders.test.js`
- **ISSUE-003**: Client role GET /admin/customers expects 403 → `test/admin.test.js`
- **ISSUE-004**: Logout then GET /me with the same token expects 401 → `test/auth.test.js`
- **ISSUE-005**: Table-driven test: invalid quantities and empty items return 400 and create nothing → `test/orders.test.js`
- **ISSUE-006**: q with regex characters and page_size 0/-1 return 200/400, never 500 → `test/orders.test.js`
- **ISSUE-007**: Parallel identical order posts create at most one order → `test/orders.test.js`
- **ISSUE-008**: Malformed JSON returns 400 with no 'stack' field or paths → `test/errors.test.js`
- **ISSUE-009**: Visual check of My orders at 390px: no covered elements, totals visible → `e2e/client-orders.spec.js`
- **ISSUE-010**: Accessibility check: no unnamed controls on New order and Admin Orders → `e2e/a11y.spec.js`
- **ISSUE-011**: Sales report responds in under 3 s → `test/reports.test.js`
