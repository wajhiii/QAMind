# QAMind Technical Report: run-20261030T064911Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T06:49:11.698Z |
| Project | ws (path-ws-b660cd22cff9) |
| Environment | local demo |
| Branch / commit | main @ 6071219 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 3m 58s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.0 |
| Stop reason | completed (partial UI coverage; see Not tested) |

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (15 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (7 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (0 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **4**   🟡 Minor: **1**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **8**
- API probes executed: **194** (39 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders validated and totalled by the stated rules
- **Risk:** Money wrong
- **Entry point:** POST /api/orders as acme-1
- **Expected results:** qty 1..1000 whole, >=1 item; 5% discount at subtotal>=1000; tax 10% on discounted subtotal
- **Exit condition:** Both sides of 1000.00 threshold and qty bounds checked

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients see only own company orders; admin endpoints refuse clients
- **Risk:** Data exposure
- **Entry point:** GET/PATCH orders, /admin/* as clients and anonymous
- **Expected results:** 403/404 for other tenants and non-admins
- **Exit condition:** Chains for detail, list, search, status change done

### C3: Auth and session  `api`

- **Goal:** Logout revokes token; bad logins refused
- **Risk:** Session misuse
- **Entry point:** /auth/*, /me
- **Expected results:** 401 after logout
- **Exit condition:** logout chain run

### C4: Status transitions  `api`

- **Goal:** placed>processing>shipped>delivered/cancelled enforced
- **Risk:** Illegal states
- **Entry point:** PATCH /admin/orders/{id}/status
- **Expected results:** 409/400 for illegal moves
- **Exit condition:** valid and invalid transitions tried on QA- order

### C5: Client Portal order flow (desktop+mobile, acme-1, bright-1, zain-1 RTL)  `ui`

- **Goal:** Place order, see confirmation and My Orders
- **Risk:** Flow blocked, wrong totals
- **Entry point:** http://127.0.0.1:4102
- **Expected results:** Totals match rules
- **Exit condition:** all pages audited

### C6: Admin Portal orders, customers, reports  `ui`

- **Goal:** Admin finds order, advances status; reports correct
- **Risk:** Wrong data
- **Entry point:** http://127.0.0.1:4101
- **Expected results:** Status visible to client after reload
- **Exit condition:** all pages audited

### C7: Cross-checks  `cross`

- **Goal:** UI/API agreement, totals match
- **Risk:** Stale/mismatched data
- **Entry point:** both UIs and API
- **Expected results:** consistent
- **Exit condition:** status change and report totals compared

## Findings

### ISSUE-001 🔴 Critical: Any client can read another company's orders by id

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts

GET /api/orders/{id} returns the full order to a user from a different company.

**Steps to reproduce**

1. Sign in over the API as acme-1 (Acme Traders)
2. POST /api/orders with reference QA-at, 80 x p-102; note the id
3. Sign in as bright-1 (Bright Foods) and GET /api/orders/{id} (see evidence for the exact request)
4. Observe HTTP 200 with Acme's order

**Expected:** 403 or 404 for a different company's order

**Actual:** HTTP 200 with the full order body, twice

**Evidence**

- [evidence/api/undefined-I1.json](evidence/api/undefined-I1.json)

**Suspected root cause:** Order detail lookup by id without filtering on the caller's client_id (the list endpoint is scoped correctly: the QA- search as bright-1 did not return it)

**Proposed regression test:** Client B GETs client A's order id and expects 403/404 (suggested location: `test/orders.test.js`)

### ISSUE-002 🔴 Critical: Client accounts can list all customer records (admin endpoint unprotected)

- **Surface:** permissions · **Area:** Admin customers · **Type:** function-level-access
- **Roles:** acme-1, acme-2, bright-1
- **Reproduced:** 2 of 2 attempts

GET /api/admin/customers returns 200 with data to client users; only admins should see customers.

**Steps to reproduce**

1. Sign in over the API as acme-1, then as bright-1 and acme-2
2. GET /api/admin/customers
3. Observe HTTP 200 and the customer list; the sales report on the same prefix correctly returns 403

**Expected:** 403 for non-admin roles

**Actual:** HTTP 200 with customer records for every client role, twice each

**Evidence**

- [evidence/api/undefined-A1.json](evidence/api/undefined-A1.json)
- [evidence/api/undefined-A2.json](evidence/api/undefined-A2.json)
- [evidence/api/undefined-R2.json](evidence/api/undefined-R2.json)

**Suspected root cause:** Missing admin role check on the customers route

**Proposed regression test:** Each client role GETs /admin/customers and expects 403 (suggested location: `test/admin.test.js`)

### ISSUE-003 🔴 Critical: Order tax is calculated on the undiscounted subtotal, so discounted orders are overcharged

- **Surface:** business-rule · **Area:** Order totals · **Type:** money
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

For orders at or above 1,000.00 the 5% discount is applied but tax is still 10% of the full subtotal; the rule says tax applies to the discounted subtotal.

**Steps to reproduce**

1. Sign in as acme-1 and POST /api/orders with 80 x p-102 (12.50 each): subtotal 1000.00
2. Expected discount 50.00, tax 95.00, total 1045.00
3. Observe tax_cents 10000 and total_cents 105000 (1050.00)
4. Repeat with 81 units: expected total 1058.06, got 1063.12
5. Same wrong total shown in the Client Portal confirmation (New order, 80 x Ballpoint Pens): 'Total: $1,050.00'

**Expected:** total = subtotal - discount + 10% of discounted subtotal (1045.00)

**Actual:** total 1050.00 (tax on undiscounted subtotal); every order of 1000.00+ is overcharged by 5% of the discount's tax effect. Orders below 1000.00 are correct (987.50 -> 1086.25).

**Evidence**

- [evidence/api/undefined-B2.json](evidence/api/undefined-B2.json)
- [evidence/api/undefined-B3.json](evidence/api/undefined-B3.json)
- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)

**Suspected root cause:** Tax computed from subtotal_cents instead of subtotal minus discount

**Proposed regression test:** Order of 80 x 12.50 expects tax 9500 and total 104500; 81 x 12.50 expects total 105806 (suggested location: `test/orders.test.js`)

### ISSUE-004 🔴 Critical: Signing out does not revoke the session token

- **Surface:** api · **Area:** Auth · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts

After POST /auth/logout returns 204, the same token still works on GET /me.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. POST /api/auth/logout and observe 204
3. GET /api/me with the same token
4. Observe HTTP 200 with the user profile

**Expected:** 401 after logout (rule: signing out ends the session at once)

**Actual:** HTTP 200 with the profile, twice

**Evidence**

- [evidence/api/undefined-X2.json](evidence/api/undefined-X2.json)

**Suspected root cause:** Logout does not add the token to a revocation list or the check ignores it

**Proposed regression test:** Logout then GET /me with the same token expects 401 (suggested location: `test/auth.test.js`)

### ISSUE-005 🔴 Critical: Order validation is missing: zero/negative/over-limit/fractional quantities and empty orders are accepted

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

POST /api/orders accepts quantity 0, -3, 1001 and 1.5 and an empty items list, producing negative or meaningless totals.

**Steps to reproduce**

1. Sign in as acme-1
2. POST /api/orders with items[0].quantity = -3 (and 0, 1001, 1.5), and separately with items: []
3. Observe HTTP 201 each time; the -3 order appears in My Orders with a negative total

**Expected:** HTTP 400 naming the field (quantity must be a whole number 1..1000; at least one item)

**Actual:** HTTP 201 in every case, twice each

**Evidence**

- [evidence/api/undefined-B5.json](evidence/api/undefined-B5.json)
- [evidence/api/baseline-client-P043.json](evidence/api/baseline-client-P043.json)
- [evidence/api/baseline-client-P044.json](evidence/api/baseline-client-P044.json)
- [evidence/api/baseline-client-P045.json](evidence/api/baseline-client-P045.json)
- [evidence/api/baseline-client-P046.json](evidence/api/baseline-client-P046.json)

**Suspected root cause:** No server-side range/integer/min-items check

**Proposed regression test:** POST quantities 0,-3,1001,1.5 and empty items expect 400 (suggested location: `test/orders.test.js`)

### ISSUE-006 🟠 Important: Double submit creates duplicate orders

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

Two identical simultaneous POST /orders calls both return 201; no duplicate protection. Unsure whether the product intends duplicates, so severity is by user impact.

**Steps to reproduce**

1. Sign in as acme-1
2. Send the same valid POST /api/orders twice in parallel (see evidence)
3. Observe two 201 responses and two orders

**Expected:** One order or an idempotency/duplicate refusal

**Actual:** Both accepted

**Evidence**

- [evidence/api/baseline-client-P049.json](evidence/api/baseline-client-P049.json)

**Suspected root cause:** No idempotency key or duplicate-reference check

**Proposed regression test:** Parallel identical POSTs yield one order or a 409 (suggested location: `test/orders.test.js`)

### ISSUE-007 🟠 Important: Order list returns 500 for page_size=0 and for search q containing ( or \; page_size=-1 is accepted

- **Surface:** api · **Area:** Orders list · **Type:** server-error
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts

GET /api/orders crashes on page_size=0 and on q=( / q=\ (likely an unescaped regular expression), and accepts page_size=-1 against the spec minimum of 1.

**Steps to reproduce**

1. Sign in as acme-1
2. GET /api/orders?page_size=0, then ?q=( , then ?q=\
3. Observe HTTP 500 each time; ?page_size=-1 returns 200

**Expected:** 400 for invalid input; search treats the text literally

**Actual:** HTTP 500 (and 200 for -1), reproduced for client and admin

**Evidence**

- [evidence/api/baseline-client-P019.json](evidence/api/baseline-client-P019.json)
- [evidence/api/baseline-client-P024.json](evidence/api/baseline-client-P024.json)
- [evidence/api/baseline-client-P028.json](evidence/api/baseline-client-P028.json)
- [evidence/api/baseline-client-P020.json](evidence/api/baseline-client-P020.json)

**Suspected root cause:** Search text compiled as a regex; page size used as a divisor without validation

**Proposed regression test:** GET /orders with page_size=0 and q=( expect 400 / 200, never 500 (suggested location: `test/orders.test.js`)

### ISSUE-008 🟠 Important: Malformed JSON errors leak stack traces and server file paths

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts

Invalid JSON to /auth/login and /orders returns a 400 body containing a stack trace and source paths.

**Steps to reproduce**

1. POST /api/auth/login with a malformed JSON body
2. POST /api/orders as acme-1 with a malformed JSON body
3. Observe a stack field and file paths in the error body

**Expected:** A short error message without internals

**Actual:** Stack trace and server paths in the body, twice

**Evidence**

- [evidence/api/baseline-client-P007.json](evidence/api/baseline-client-P007.json)
- [evidence/api/baseline-client-P048.json](evidence/api/baseline-client-P048.json)

**Suspected root cause:** Default error handler serializes the exception stack

**Proposed regression test:** Malformed JSON returns 400 with no 'stack' field or file paths (suggested location: `test/errors.test.js`)

### ISSUE-009 🟠 Important: My Orders table overflows and hides its first row on mobile (390px)

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My Orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 390x844
- **Reproduced:** 2 of 2 attempts

At 390x844 the orders table is wider than the screen (right edge about 496px), the Total column is cut off, and the first order row sits under the toolbar.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Resize to 390x844
3. Open My orders
4. Observe the Total column cut off and the newest order row covered by the Status / New order toolbar

**Expected:** All columns reachable and no row hidden

**Actual:** Totals clipped, first row covered; audit reports covered elements on both loads

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** Table not in a scroll container and toolbar overlapping its top

**Proposed regression test:** At 390px the table has no hidden rows and totals visible (suggested location: `test/ui/my-orders.test.js`)

### ISSUE-010 🟡 Minor: Sales report endpoint is slow (about 4 seconds)

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts

GET /api/admin/reports/sales consistently takes about 4 s, so the Admin report page shows an empty heading for several seconds.

**Steps to reproduce**

1. Sign in as admin
2. GET /api/admin/reports/sales
3. Observe ~4000 ms response, repeated

**Expected:** Under 3 s

**Actual:** 4005-4010 ms every time

**Evidence**

- [evidence/api/baseline-admin-P061.json](evidence/api/baseline-admin-P061.json)

**Suspected root cause:** Unindexed aggregation or deliberate delay

**Proposed regression test:** Sales report responds in under 3000 ms (suggested location: `test/reports.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Product select on New order has no accessible name** (ui, tried 1×): Page audit flagged the product dropdown as unnamed on desktop; seen on one page load only and not re-checked Why unconfirmed: seen once

## Coverage matrix

| Surface | Area | Role | Viewport | Status | Note |
|---|---|---|---|---|---|
| api | All 13 endpoints baseline plans | admin | n/a | ✅ tested | validation, auth, query edges, role matrix |
| api | Orders validation and totals | acme-1 | n/a | ✅ tested | both sides of 1000.00, qty bounds, mass assignment (ignored correctly) |
| permissions | Tenant and role isolation | acme-1, acme-2, bright-1 | n/a | ✅ tested | order detail, status change (403 correct), list search, customers |
| api | Status transitions | admin | n/a | ✅ tested | skip and backward moves refused, invalid value refused |
| api | Logout | zain-1 | n/a | ✅ tested | token not revoked |
| ui | Client Portal sign-in, New order, confirmation | acme-1 | desktop | ✅ tested | total matches API bug |
| ui | Client Portal My orders | acme-1 | mobile | ✅ tested | layout finding |
| ui | Admin Portal sign-in and Reports | admin | desktop | ◐ partial | report numbers internally consistent (client rows sum to billable orders) |
| ui | Admin Orders and Customers pages | admin | desktop | ⛔ not tested | not visited |

## Not tested

_Nothing here is reported as passing._

- **Password reset / forgot-password flow (API and UI)**: Would send email; no email sandbox confirmed
- **Client Portal as bright-1 and zain-1 (UI), including Urdu RTL layout**: Not reached in this session; only acme-1 was driven in the browser
- **Admin Portal Orders and Customers pages: status change in UI, mobile viewport, audits**: Only sign-in and Reports were visited in the browser; status changes were tested through the API only
- **Client Portal order confirmation / New order on mobile**: Only My orders was checked at 390px
- **UI edge cases (long/special-character input, double click, expired session, direct URL to admin pages as client)**: Not covered in this session
- **Cross-check of admin status change in the client UI after reload**: Verified via API only (client saw 'processing'); UI reload not done
- **Security smoke checks (headers, CORS)**: Not covered in this session
- **ui / Admin Orders and Customers pages / admin / desktop**: not visited

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| baseline-admin | 100 | 85 | 8 | 11 | [data/api-results/baseline-admin.json](data/api-results/baseline-admin.json) |
| baseline-client | 64 | 52 | 12 | 21 | [data/api-results/baseline-client.json](data/api-results/baseline-client.json) |
| probe0 | 2 | 2 | 0 | 0 | [data/api-results/undefined-2.json](data/api-results/undefined-2.json) |
| rules | 26 | 20 | 6 | 7 | [data/api-results/undefined-3.json](data/api-results/undefined-3.json) |
| probe0-first | 2 | 2 | 0 | 0 | [data/api-results/undefined.json](data/api-results/undefined.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Client B GETs client A's order id and expects 403/404 → `test/orders.test.js`
- **ISSUE-002**: Each client role GETs /admin/customers and expects 403 → `test/admin.test.js`
- **ISSUE-003**: Order of 80 x 12.50 expects tax 9500 and total 104500; 81 x 12.50 expects total 105806 → `test/orders.test.js`
- **ISSUE-004**: Logout then GET /me with the same token expects 401 → `test/auth.test.js`
- **ISSUE-005**: POST quantities 0,-3,1001,1.5 and empty items expect 400 → `test/orders.test.js`
- **ISSUE-006**: Parallel identical POSTs yield one order or a 409 → `test/orders.test.js`
- **ISSUE-007**: GET /orders with page_size=0 and q=( expect 400 / 200, never 500 → `test/orders.test.js`
- **ISSUE-008**: Malformed JSON returns 400 with no 'stack' field or file paths → `test/errors.test.js`
- **ISSUE-009**: At 390px the table has no hidden rows and totals visible → `test/ui/my-orders.test.js`
- **ISSUE-010**: Sales report responds in under 3000 ms → `test/reports.test.js`
