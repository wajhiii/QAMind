# QAMind Technical Report: run-20261030T063412Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T06:34:12.132Z |
| Project | ws (path-ws-8b8ac68a838b) |
| Environment | local demo |
| Branch / commit | main @ 6572c9d |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 4m 11s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.0.0 |
| Stop reason | completed (full API pass; UI pass partial) |

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (31 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (3 ms) |
| API base responds | ✅ ok | HTTP 404 (3 ms) |
| Health check /health | ✅ ok | HTTP 200 (3 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (8 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **4**   🟠 Important: **4**   🟡 Minor: **3**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **7**
- API probes executed: **184** (40 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the stated rules
- **Risk:** Money is calculated wrongly
- **Entry point:** POST /api/orders as a client
- **Expected results:** Invalid input refused; total = subtotal - 5% discount (>=1000) + 10% tax
- **Exit condition:** Validation edges and both sides of the 1,000.00 threshold checked

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients only see own company's data; only admins use admin endpoints
- **Risk:** Data exposure
- **Entry point:** GET /orders/{id}, /admin/* as clients
- **Expected results:** 403/404 for other tenants and non-admins
- **Exit condition:** Role matrix and cross-tenant chain checked

### C3: Session handling  `api`

- **Goal:** Logout revokes token at once
- **Risk:** Session reuse
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Chain run

### C4: Order status transitions and reports  `api`

- **Goal:** Status moves placed>processing>shipped>delivered; reports correct
- **Risk:** Invalid states
- **Entry point:** PATCH /admin/orders/{id}/status
- **Expected results:** Illegal transitions 409
- **Exit condition:** Transitions on a QA- order checked

### C5: Client Portal order flow  `ui`

- **Goal:** Client places order and sees it in My Orders
- **Risk:** Critical flow broken
- **Entry point:** Client Portal as acme-1
- **Expected results:** Confirmation with correct total
- **Exit condition:** Order placed and listed, desktop and mobile

### C6: Admin Portal status change reflected for client  `cross`

- **Goal:** Admin changes status, client sees it
- **Risk:** Stale data
- **Entry point:** Admin Portal Orders
- **Expected results:** Client sees new status after reload
- **Exit condition:** Verified in both UIs and API

### C7: Urdu tenant RTL and page audit  `ui`

- **Goal:** RTL text correct
- **Risk:** Layout issues
- **Entry point:** Client Portal as zain-1
- **Expected results:** Proper direction/alignment
- **Exit condition:** Audit on pages

## Findings

### ISSUE-001 🔴 Critical: Any client can read another company's orders

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts

GET /orders/{id} returns an Acme Traders order to a Bright Foods user.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-rule-1 (item p-101, qty 1); note the id
2. Sign in as bright-1 and GET /api/orders/{id}
3. Observe HTTP 200 with the full order (see evidence for exact request)

**Expected:** HTTP 403 or 404; companies never see each other's data

**Actual:** HTTP 200 with the other company's order, items and totals

**Evidence**

- [evidence/api/rules-X01.json](evidence/api/rules-X01.json)

**Suspected root cause:** Order detail handler does not compare the order's client_id with the caller's

**Proposed regression test:** A Bright user GETs an Acme order id and expects 403/404 (suggested location: `test/orders.test.js`)

### ISSUE-002 🔴 Critical: Clients can list all customer records, including personal data

- **Surface:** permissions · **Area:** Admin customers · **Type:** permissions
- **Roles:** acme-1, acme-2, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts

GET /admin/customers returns 200 with contact details, phone, national ID number and address to client roles; only admins should see it.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/admin/customers
3. Observe HTTP 200 and the full customer list (see evidence)

**Expected:** HTTP 403 for non-admin roles

**Actual:** HTTP 200 for acme-1, acme-2, bright-1 and zain-1 (role matrix in the admin-base run); response includes other companies' personal data

**Evidence**

- [evidence/api/rules-X04.json](evidence/api/rules-X04.json)

**Suspected root cause:** Missing admin role check on the customers route (the sales report route has one)

**Proposed regression test:** Each client role GETs /admin/customers and expects 403 (suggested location: `test/permissions.test.js`)

### ISSUE-003 🔴 Critical: Signing out does not end the session

- **Surface:** api · **Area:** Authentication · **Type:** session
- **Roles:** bright-1
- **Reproduced:** 2 of 2 attempts

After POST /auth/logout returns success, the same token still works on GET /me.

**Steps to reproduce**

1. Sign in over the API as bright-1
2. POST /api/auth/logout
3. GET /api/me with the same token
4. Observe HTTP 200

**Expected:** HTTP 401 immediately after logout

**Actual:** HTTP 200; token still valid

**Evidence**

- [evidence/api/rules-L02.json](evidence/api/rules-L02.json)

**Suspected root cause:** Logout does not revoke the token server-side

**Proposed regression test:** Logout then GET /me expects 401 (suggested location: `test/auth.test.js`)

### ISSUE-004 🔴 Critical: Tax is charged on the undiscounted subtotal

- **Surface:** business-rule · **Area:** Order totals · **Type:** calculation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

For orders at or above 1,000.00 the 5% discount is applied but tax is calculated on the full subtotal, so customers are overcharged. The Client Portal confirmation shows the same wrong total.

**Steps to reproduce**

1. Sign in as acme-1 (API)
2. POST /api/orders with p-102 quantity 80 (subtotal 1,000.00)
3. Observe tax_cents 10000 and total_cents 105000
4. UI: Client Portal > New order, reference QA-ui-1, Ballpoint Pens x80, Place order; confirmation says Total: $1,050.00

**Expected:** Discount 50.00, tax 95.00 (10% of 950.00), total 1,045.00

**Actual:** Tax 100.00, total 1,050.00. Also: 6,500.00 subtotal gives total 6,825.00 instead of 6,792.50; 1,012.50 gives 1,063.12 instead of 1,058.06

**Evidence**

- [evidence/api/totals-T80.json](evidence/api/totals-T80.json)
- [evidence/api/totals-T1000.json](evidence/api/totals-T1000.json)
- [evidence/api/totals-T81.json](evidence/api/totals-T81.json)
- [screenshots/client-order-confirmation.png](screenshots/client-order-confirmation.png)

**Suspected root cause:** Tax computed from subtotal instead of subtotal minus discount

**Proposed regression test:** Orders of 79, 80 and 81 pens expect totals 1086.25, 1045.00 and 1058.06 (suggested location: `test/pricing.test.js`)

### ISSUE-005 🟠 Important: Order validation accepts empty, zero, over-limit and fractional quantities

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

POST /orders returns 201 for an empty items list, quantity 0, quantity 1001 and quantity 1.5, violating the stated rules and the OpenAPI spec.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items [], then quantity 0, 1001, 1.5 (separate requests, see evidence)
3. Observe HTTP 201 each time

**Expected:** HTTP 400: at least one item; quantity a whole number 1 to 1000

**Actual:** HTTP 201, order created

**Evidence**

- [evidence/api/client-base-P043.json](evidence/api/client-base-P043.json)
- [evidence/api/client-base-P044.json](evidence/api/client-base-P044.json)
- [evidence/api/client-base-P045.json](evidence/api/client-base-P045.json)
- [evidence/api/client-base-P046.json](evidence/api/client-base-P046.json)

**Suspected root cause:** No server-side validation of items

**Proposed regression test:** Invalid items/quantities expect 400 (suggested location: `test/orders.test.js`)

### ISSUE-006 🟠 Important: Server errors (HTTP 500) on odd order-list query values

- **Surface:** api · **Area:** Orders list · **Type:** robustness
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts

GET /orders returns 500 for page_size=0 and for q set to a single open parenthesis or a single backslash; page_size=-1 is accepted with 200 although the spec minimum is 1.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?page_size=0 (also q=( and a lone backslash for q)
3. Observe HTTP 500

**Expected:** HTTP 400 for invalid page_size; literal search for special characters

**Actual:** HTTP 500

**Evidence**

- [evidence/api/client-base-P019.json](evidence/api/client-base-P019.json)
- [evidence/api/client-base-P024.json](evidence/api/client-base-P024.json)
- [evidence/api/client-base-P028.json](evidence/api/client-base-P028.json)
- [evidence/api/client-base-P020.json](evidence/api/client-base-P020.json)

**Suspected root cause:** Search text used unescaped as a regular expression; page size not range-checked

**Proposed regression test:** page_size=0 expects 400; q=( expects 200 (suggested location: `test/orders.test.js`)

### ISSUE-007 🟠 Important: Malformed JSON returns a stack trace and server file paths

- **Surface:** api · **Area:** Error handling · **Type:** security
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts

Sending malformed JSON to POST /auth/login or POST /orders returns an error body containing a stack trace and server source paths.

**Steps to reproduce**

1. POST /api/auth/login with a malformed raw body
2. Observe HTTP 400 with a stack field and file paths (see evidence)

**Expected:** A short error message with no internal details

**Actual:** Stack trace and server paths in the response

**Evidence**

- [evidence/api/client-base-P007.json](evidence/api/client-base-P007.json)
- [evidence/api/client-base-P048.json](evidence/api/client-base-P048.json)

**Suspected root cause:** Default error handler returns err.stack

**Proposed regression test:** Malformed JSON expects 400 with no stack field (suggested location: `test/errors.test.js`)

### ISSUE-008 🟠 Important: Submitting an order twice at once creates duplicate orders

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

Two simultaneous identical POST /orders both succeed and create separate orders (My orders showed repeated QA-t80, QA-t81 and QA-t1000 rows). I am not sure whether the product intends to de-duplicate by reference.

**Steps to reproduce**

1. Sign in as acme-1
2. Send the same POST /api/orders twice in parallel
3. Observe two 201 responses with different ids

**Expected:** One order, or the second refused

**Actual:** Two orders created; the UI shows the same reference twice

**Evidence**

- [evidence/api/client-base-P049.json](evidence/api/client-base-P049.json)

**Suspected root cause:** No idempotency or reference uniqueness check

**Proposed regression test:** Parallel identical orders expect one order (suggested location: `test/orders.test.js`)

### ISSUE-009 🟡 Minor: Sales report is slow (about 4 seconds)

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts

GET /admin/reports/sales takes about 4 seconds; the Admin Portal Reports page stays empty meanwhile.

**Steps to reproduce**

1. Sign in as admin
2. GET /api/admin/reports/sales
3. Observe about 4003 ms

**Expected:** Under 3 seconds

**Actual:** 4003 ms on both runs

**Evidence**

- [evidence/api/admin-base-P093.json](evidence/api/admin-base-P093.json)

**Suspected root cause:** Unknown

**Proposed regression test:** Report responds within 3000 ms (suggested location: `test/reports.test.js`)

### ISSUE-010 🟡 Minor: My orders on mobile: first row hidden under toolbar and Actions column clipped

- **Surface:** ui · **UI:** Client Portal · **Area:** My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 390x844
- **Reproduced:** 2 of 2 attempts

At 390px wide the first order row is partly covered by the filter toolbar and New order button, and the Total and View columns are cut off with no visible cue to scroll sideways.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Resize to 390x844
3. Open My orders
4. The first row is hidden behind the toolbar; Total is cut off and View is off-screen

**Expected:** All rows and the View links reachable without hidden content

**Actual:** Row covered; table scrolls sideways inside its box (456px inside 359px)

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** Table wrapper overlaps the toolbar; no responsive layout

**Proposed regression test:** At 390px no row is covered and View is reachable (suggested location: `test/ui/my-orders.test.js`)

### ISSUE-011 🟡 Minor: Product dropdown on New order has no accessible label

- **Surface:** ui · **UI:** Client Portal · **Area:** New order · **Type:** accessibility
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 1366x768
- **Reproduced:** 2 of 2 attempts

The product select has no label, so screen readers announce it by its first option.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Open New order
3. Run the page audit and look at unnamedControls

**Expected:** A label such as Product

**Actual:** No accessible name

**Evidence**

- [screenshots/client-order-confirmation.png](screenshots/client-order-confirmation.png)

**Suspected root cause:** Missing label or aria-label on the select

**Proposed regression test:** Product select has an accessible name (suggested location: `test/ui/new-order.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Status | Note |
|---|---|---|---|---|---|
| api | All 13 endpoints baseline | admin | - | ✅ tested | 100 probes incl. role matrix |
| api | Orders validation and totals | acme-1 | - | ✅ tested | boundaries 79/80/81 and qty 1000 |
| permissions | Tenant and role isolation | acme-1, acme-2, bright-1, zain-1 | - | ✅ tested |  |
| api | Order status transitions | admin | - | ◐ partial | placed>processing ok; skips and backwards refused |
| api | Logout/session | bright-1 | - | ✅ tested |  |
| ui | New order and confirmation | acme-1 | desktop | ✅ tested |  |
| ui | My orders | acme-1 | mobile | ✅ tested |  |
| ui | Reports | admin | desktop | ◐ partial | figures consistent between status and client tables |
| ui | Admin orders, customers | admin | - | ⛔ not tested | not covered in this pass |

## Not tested

_Nothing here is reported as passing._

- **Password reset flow (forgot/reset password)**: Would send email; excluded as a possible side effect
- **Zain Traders (Urdu) RTL pages in the Client Portal**: Not covered in this pass: the zain-1 role was only used over the API
- **Admin Portal Orders list, order detail and status change in the browser**: Not covered in this pass: status transitions were tested over the API only
- **Admin Portal Customers page and mobile layout of admin pages**: Not covered in this pass
- **UI edge cases: long input, special characters, double-click, expired session, direct URLs**: Not covered in this pass
- **Order status delivered/cancelled transitions**: Not covered in this pass
- **ui / Admin orders, customers / admin**: not covered in this pass

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-base | 100 | 85 | 8 | 11 | [data/api-results/admin-base.json](data/api-results/admin-base.json) |
| client-base | 64 | 52 | 12 | 21 | [data/api-results/client-base.json](data/api-results/client-base.json) |
| rules | 15 | 12 | 3 | 3 | [data/api-results/rules.json](data/api-results/rules.json) |
| totals | 5 | 2 | 3 | 5 | [data/api-results/totals.json](data/api-results/totals.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: A Bright user GETs an Acme order id and expects 403/404 → `test/orders.test.js`
- **ISSUE-002**: Each client role GETs /admin/customers and expects 403 → `test/permissions.test.js`
- **ISSUE-003**: Logout then GET /me expects 401 → `test/auth.test.js`
- **ISSUE-004**: Orders of 79, 80 and 81 pens expect totals 1086.25, 1045.00 and 1058.06 → `test/pricing.test.js`
- **ISSUE-005**: Invalid items/quantities expect 400 → `test/orders.test.js`
- **ISSUE-006**: page_size=0 expects 400; q=( expects 200 → `test/orders.test.js`
- **ISSUE-007**: Malformed JSON expects 400 with no stack field → `test/errors.test.js`
- **ISSUE-008**: Parallel identical orders expect one order → `test/orders.test.js`
- **ISSUE-009**: Report responds within 3000 ms → `test/reports.test.js`
- **ISSUE-010**: At 390px no row is covered and View is reachable → `test/ui/my-orders.test.js`
- **ISSUE-011**: Product select has an accessible name → `test/ui/new-order.test.js`
