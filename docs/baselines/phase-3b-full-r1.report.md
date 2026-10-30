# QAMind Technical Report: run-20261030T081402Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T08:14:02.416Z |
| Project | ws (path-ws-29d040eedf31) |
| Environment | local demo |
| Branch / commit | main @ 8d320dc |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 3m 59s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (13 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (3 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (2 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **4**   🟡 Minor: **1**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **7**
- API probes executed: **184** (37 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the stated rules
- **Risk:** Money is calculated wrongly; bad orders accepted
- **Entry point:** POST /api/orders as a client
- **Expected results:** Invalid input refused; total = subtotal - discount + tax on discounted subtotal
- **Exit condition:** Both sides of the 1,000.00 threshold and quantity edges checked

### C2: Role and company isolation  `permissions`

- **Goal:** Clients only see own company; only admins reach admin data
- **Risk:** Data exposure
- **Entry point:** Admin endpoints as client; order ids across companies
- **Expected results:** 403/404 for other companies and non-admins
- **Exit condition:** Role matrix and one cross-company chain checked

### C3: Sign-out and sessions  `api`

- **Goal:** Signing out ends the session at once
- **Risk:** Stolen or old sessions stay usable
- **Entry point:** POST /api/auth/logout then GET /api/me
- **Expected results:** 401 after sign-out
- **Exit condition:** Reuse after logout checked

### C4: Client Portal order flow  `ui`

- **Goal:** Place an order and see it in My orders
- **Risk:** Wrong total shown
- **Entry point:** Client Portal new-order page
- **Expected results:** Confirmation total matches the rules
- **Exit condition:** One discounted order placed

### C5: Admin Portal reports  `ui`

- **Goal:** Admin sees the sales summary
- **Risk:** Report slow or wrong
- **Entry point:** Admin Portal Reports
- **Expected results:** Summary loads promptly
- **Exit condition:** Page opened

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Any client can read all customers' personal data through the admin customers list

- **Surface:** permissions · **Area:** Customers · **Type:** permissions
- **Roles:** acme-1, acme-2, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/admin/customers returns HTTP 200 with every customer's contact name, email, phone, national ID, address and card last-4 to a client account. The spec says only admins may call it (403 for others).

**Steps to reproduce**

1. Sign in as acme-1 (a client) over the API
2. GET /api/admin/customers (see evidence for the exact request)
3. Observe HTTP 200 with the full customer records, including other companies

**Expected:** HTTP 403 for non-admin roles

**Actual:** HTTP 200 with all customer records (personal data) for all four client accounts

**Evidence**

- [evidence/api/undefined-R2.json](evidence/api/undefined-R2.json)
- [evidence/api/undefined-R3.json](evidence/api/undefined-R3.json)

**Suspected root cause:** The route checks that the caller is signed in but not that the role is admin (the sibling /admin/reports/sales does return 403).

**Proposed regression test:** As each client role, GET /api/admin/customers and expect 403 (suggested location: `test/permissions.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: A client from one company can open another company's order

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/orders/{id} returns HTTP 200 and the full order to bright-1 (Bright Foods) for an order created by acme-1 (Acme Traders). The order list itself is correctly filtered.

**Steps to reproduce**

1. Sign in as acme-1 and POST /api/orders (reference QA-T1), note the returned id
2. Sign in as bright-1 and GET /api/orders/{id} for that id (see evidence)
3. Observe HTTP 200 with Acme's order

**Expected:** HTTP 403 or 404

**Actual:** HTTP 200 with the order body (company name, items, totals)

**Evidence**

- [evidence/api/undefined-X2.json](evidence/api/undefined-X2.json)
- [evidence/api/undefined-L1.json](evidence/api/undefined-L1.json)

**Suspected root cause:** Order detail lookup is by id only, with no company ownership check (the list endpoint filters by company).

**Proposed regression test:** Create an order as company A, GET it as company B, expect 403/404 (suggested location: `test/orders.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Signing out does not end the session

- **Surface:** api · **Area:** Sign-in · **Type:** auth
- **Roles:** bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /api/auth/logout returns 204, the same bearer token still gets HTTP 200 from GET /api/me.

**Steps to reproduce**

1. Sign in as bright-1 over the API
2. POST /api/auth/logout and observe 204
3. GET /api/me with the same token (see evidence)
4. Observe HTTP 200 instead of 401

**Expected:** HTTP 401 immediately after sign-out

**Actual:** HTTP 200 with the user's profile

**Evidence**

- [evidence/api/undefined-A2.json](evidence/api/undefined-A2.json)

**Suspected root cause:** Logout does not revoke the token server-side, despite the spec saying it does.

**Proposed regression test:** Log in, log out, call /me with the same token and expect 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Tax is charged on the full amount instead of the discounted amount

- **Surface:** business-rule · **Area:** Orders · **Type:** calculation
- **Roles:** acme-1
- **Reproduced:** 3 of 3 attempts
- **Charter:** C1

For orders with subtotal >= 1,000.00, tax is 10% of the undiscounted subtotal. Subtotal 1000.00: discount 50.00, tax 100.00, total 1050.00 (expected tax 95.00, total 1045.00). Subtotal 1002.00: total 1052.10 (expected 1047.09). Orders under the threshold are right. The UI shows the same wrong total ($1,133.88 for 12 x $89.99; expected $1,128.47).

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with p-101 x2 and p-104 x282 (subtotal 100000 cents)
3. Observe discount_cents 5000, tax_cents 10000, total_cents 105000; expected tax 9500, total 104500
4. Repeat with p-101 x5 and p-104 x277 (subtotal 100200): total 105210, expected 104709

**Expected:** total = subtotal - discount + 10% of (subtotal - discount)

**Actual:** tax = 10% of subtotal before discount, so customers are overcharged 5% of the tax base

**Evidence**

- [evidence/api/undefined-T3.json](evidence/api/undefined-T3.json)
- [evidence/api/undefined-T4.json](evidence/api/undefined-T4.json)
- [screenshots/client-order-confirmation.png](screenshots/client-order-confirmation.png)

**Suspected root cause:** Tax is computed from the subtotal rather than subtotal minus discount.

**Proposed regression test:** Orders at 1000.00 and 1002.00 expect total 1045.00 and 1047.09 (suggested location: `test/pricing.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders with zero, negative, fractional or over-limit quantities are accepted

- **Surface:** business-rule · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /api/orders returns 201 for quantity -3 (total -21.45), 0, 1001 and 1.5; the rule and spec say whole numbers 1 to 1000.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with items[0].quantity = -3 (see evidence)
3. Observe HTTP 201 and total_cents -2145
4. Repeat for 0, 1001 and 1.5 (baseline probes P044 to P046)

**Expected:** HTTP 400 with a quantity message

**Actual:** HTTP 201; negative totals appear in the customer's My orders list

**Evidence**

- [evidence/api/undefined-T5.json](evidence/api/undefined-T5.json)
- [evidence/api/client-baseline-P044.json](evidence/api/client-baseline-P044.json)
- [evidence/api/client-baseline-P045.json](evidence/api/client-baseline-P045.json)
- [evidence/api/client-baseline-P046.json](evidence/api/client-baseline-P046.json)

**Suspected root cause:** No range or integer check on quantity in the order handler.

**Proposed regression test:** POST quantities -3, 0, 1001, 1.5 and expect 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Orders with no items are accepted

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /api/orders with items: [] returns 201; the rule requires at least one item.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with an empty items list (see evidence)
3. Observe HTTP 201

**Expected:** HTTP 400

**Actual:** HTTP 201

**Evidence**

- [evidence/api/client-baseline-P043.json](evidence/api/client-baseline-P043.json)

**Suspected root cause:** No minimum-length check on items.

**Proposed regression test:** POST empty items and expect 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Order list fails with an error for page size 0 and for searches containing ( or \

- **Surface:** api · **Area:** Orders · **Type:** robustness
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/orders returns HTTP 500 for page_size=0, q=( and q=\; page_size=-1 returns 200 although the spec minimum is 1.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?page_size=0 (see evidence)
3. Observe HTTP 500
4. Repeat with q=( and q=\

**Expected:** HTTP 400 for bad page_size; special characters in q treated as plain text

**Actual:** HTTP 500

**Evidence**

- [evidence/api/client-baseline-P019.json](evidence/api/client-baseline-P019.json)
- [evidence/api/client-baseline-P024.json](evidence/api/client-baseline-P024.json)
- [evidence/api/client-baseline-P028.json](evidence/api/client-baseline-P028.json)
- [evidence/api/client-baseline-P020.json](evidence/api/client-baseline-P020.json)

**Suspected root cause:** Search text is used unescaped in a regular expression; page_size used as a divisor without checking.

**Proposed regression test:** GET orders with page_size=0 and q=( and expect no 5xx (suggested location: `test/orders.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Malformed requests return internal technical details

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Malformed JSON to POST /api/auth/login and POST /api/orders returns HTTP 400 with a stack trace and server source file paths in the body.

**Steps to reproduce**

1. POST /api/auth/login with body {bad (no sign-in needed)
2. Observe HTTP 400 with stack and file paths (see evidence)

**Expected:** A short generic error message

**Actual:** Stack trace and server paths exposed

**Evidence**

- [evidence/api/admin-baseline-P007.json](evidence/api/admin-baseline-P007.json)
- [evidence/api/client-baseline-P048.json](evidence/api/client-baseline-P048.json)

**Suspected root cause:** Default error handler returns err.stack outside production mode.

**Proposed regression test:** Send malformed JSON and assert the body has no stack or path (suggested location: `test/errors.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Placing the same order twice at once creates duplicate orders

- **Surface:** api · **Area:** Orders · **Type:** concurrency
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Two identical simultaneous POST /api/orders were both accepted with 201. It is unconfirmed whether the product intends to prevent duplicates, so impact is judged by likely user effect (double-click creating two orders).

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. Send two identical POST /api/orders at the same time (see evidence)
3. Observe two 201 responses

**Expected:** Duplicates prevented or reference uniqueness enforced

**Actual:** Both created

**Evidence**

- [evidence/api/client-baseline-P049.json](evidence/api/client-baseline-P049.json)

**Suspected root cause:** No idempotency or duplicate-reference check.

**Proposed regression test:** Send two identical orders concurrently and expect one to be refused (suggested location: `test/orders.test.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟡 Minor: The sales report takes about 4 seconds to load

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 4 of 4 attempts
- **Charter:** C5

GET /api/admin/reports/sales consistently takes about 4000 ms (limit 3000 ms) with 25 orders.

**Steps to reproduce**

1. Sign in as admin over the API
2. GET /api/admin/reports/sales (see evidence)
3. Observe about 4000 ms in repeated runs

**Expected:** Under 3 seconds

**Actual:** About 4 seconds every time

**Evidence**

- [evidence/api/undefined-R4.json](evidence/api/undefined-R4.json)
- [evidence/api/admin-baseline-P061.json](evidence/api/admin-baseline-P061.json)

**Suspected root cause:** A fixed delay or inefficient aggregation in the report handler.

**Proposed regression test:** Assert the sales report responds in under 3 seconds (suggested location: `test/reports.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| api | Orders: validation and totals | acme-1 | n/a | - | ✅ tested | threshold 99900/100000/100200, quantity edges |
| api | Role matrix on list endpoints | all | n/a | - | ✅ tested | admin, 4 clients, anonymous |
| permissions | Cross-company order access | bright-1 | n/a | - | ✅ tested | acme order read as bright-1 |
| api | Order status transitions | admin | n/a | #3 | ✅ tested | skip, forward, backward; client re-read |
| api | Sign-out and session reuse | bright-1 | n/a | #5 | ✅ tested | token reused after logout |
| ui | Sign in, New order, confirmation | acme-1 | desktop | #1 | ✅ tested | discounted order placed |
| ui | My orders list | acme-1 | desktop | #1 | ✅ tested | page audit clean |
| ui | Sign in and Orders page | admin | desktop | #2 | ◐ partial | signed in; status change not driven on screen |
| ui | Reports | admin | desktop | #4 | ✅ tested | page opened |
| ui | Changing an order's status on screen | admin | desktop | #2 | ⛔ not tested | API only |
| ui | Customers page | admin | desktop | - | ⛔ not tested | not opened |
| ui | Signing out on screen | acme-1 | desktop | #5 | ⛔ not tested | API only |

## Not tested

_Nothing here is reported as passing._

- **Password reset emails**: Would send email; no safe test mailbox confirmed
- **Changing an order's status on screen**: Status changes were tested only over the API, not driven in the browser
- **Customers page**: Not opened in the browser in this run
- **Signing out on screen**: Sign-out checked over the API only
- **Mobile layout and accessibility of all pages**: Only the desktop viewport and two pages were audited
- **Client Portal / Urdu company (zain-1) right-to-left display**: Not opened in the browser in this run
- **Expired sessions**: No safe way to force expiry in this run

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-baseline | 100 | 86 | 8 | 11 | [data/api-results/admin-baseline.json](data/api-results/admin-baseline.json) |
| client-baseline | 64 | 52 | 12 | 21 | [data/api-results/client-baseline.json](data/api-results/client-baseline.json) |
| rules | 16 | 13 | 3 | 4 | [data/api-results/undefined-2.json](data/api-results/undefined-2.json) |
| products | 4 | 3 | 1 | 1 | [data/api-results/undefined.json](data/api-results/undefined.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: As each client role, GET /api/admin/customers and expect 403 → `test/permissions.test.js`
- **ISSUE-002**: Create an order as company A, GET it as company B, expect 403/404 → `test/orders.test.js`
- **ISSUE-003**: Log in, log out, call /me with the same token and expect 401 → `test/auth.test.js`
- **ISSUE-004**: Orders at 1000.00 and 1002.00 expect total 1045.00 and 1047.09 → `test/pricing.test.js`
- **ISSUE-005**: POST quantities -3, 0, 1001, 1.5 and expect 400 → `test/orders.test.js`
- **ISSUE-006**: POST empty items and expect 400 → `test/orders.test.js`
- **ISSUE-007**: GET orders with page_size=0 and q=( and expect no 5xx → `test/orders.test.js`
- **ISSUE-008**: Send malformed JSON and assert the body has no stack or path → `test/errors.test.js`
- **ISSUE-009**: Send two identical orders concurrently and expect one to be refused → `test/orders.test.js`
- **ISSUE-010**: Assert the sales report responds in under 3 seconds → `test/reports.test.js`
