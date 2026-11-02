# QAMind Technical Report: run-20261102T063111Z

| | |
|---|---|
| Date (UTC) | 2026-11-02T06:31:11.945Z |
| Project | ws (path-ws-6628549a6272) |
| Environment | local demo |
| Branch / commit | feature/qa-eval @ 8fbd0ac |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 5m 47s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed (API pass only; browser flows not run) |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (12 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (1 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (3 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (6 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **4**   🟡 Minor: **0**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **4**
- API probes executed: **23** (21 produced a signal worth a look)

## Fix run

- **Branch:** `feature/qa-eval`, started from commit `8fbd0ac` on `main`. The commits are local to this branch: **nothing was pushed or merged.** A developer must review and merge them.
- **Outcome:** 9 fixed and verified · 0 best-effort (a person must confirm) · 0 reverted · 0 deferred · 0 not attempted
- **Test suite:** before any fix: passed (`npm test`, 0.4 s) · after the fixes: passed (`npm test`, 0.6 s) · no regression: The full test suite passes.
- **Limits:** at most 30 fixes; severities fixed: critical, important; reverts so far: 0
- **Stops and what the user said:** pause: Owner read the summary and said to go on with the remaining fixes after the five-fix pause.
- **Reports from before any fix:** [BASELINE-TECHNICAL-REPORT.md](BASELINE-TECHNICAL-REPORT.md), [BASELINE-ADMIN-REPORT.md](BASELINE-ADMIN-REPORT.md)

| Issue | Severity | Outcome | Commit | Production files | Regression test |
|---|---|---|---|---|---|
| [ISSUE-001](#ISSUE-001) | critical | verified | `edf5e70` | `src/pricing.mjs` | `test/pricing.test.mjs` |
| [ISSUE-002](#ISSUE-002) | critical | verified | `0208c78` | `src/api.mjs` | `test/order-validation.test.mjs` |
| [ISSUE-004](#ISSUE-004) | critical | verified | `8ca5e9a` | `src/api.mjs` | `test/order-isolation.test.mjs` |
| [ISSUE-005](#ISSUE-005) | critical | verified | `f20f8d9` | `src/api.mjs` | `test/customers-access.test.mjs` |
| [ISSUE-006](#ISSUE-006) | critical | verified | `dd4cf16` | `src/api.mjs` | `test/logout-session.test.mjs` |
| [ISSUE-003](#ISSUE-003) | important | verified | `e11e204` | `src/api.mjs` | `test/order-empty.test.mjs` |
| [ISSUE-007](#ISSUE-007) | important | verified | `5284ceb` | `src/api.mjs` | `test/order-freshness.test.mjs` |
| [ISSUE-008](#ISSUE-008) | important | verified | `cda3f7f` | `src/api.mjs` | `test/order-search.test.mjs` |
| [ISSUE-009](#ISSUE-009) | important | verified | `87f3506` | `src/api.mjs` | `test/order-page-size.test.mjs` |

## What changed since the last run

_First run for this project: there is nothing to compare with yet._

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Key journeys tested | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 4 | 0 | 0 | 2/5 | 5 | 0 | 4 |

_No earlier run to compare with._

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the stated rules
- **Risk:** Money is calculated wrongly; invalid quantities accepted
- **Entry point:** POST /api/orders as a client
- **Expected results:** Invalid input refused; total = (subtotal - discount) + tax on the discounted subtotal
- **Exit condition:** Quantity edges and both sides of the 1,000.00 threshold checked

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients only see their own company's data; only admins use admin functions
- **Risk:** Data exposed across companies
- **Entry point:** GET /api/orders/{id}, /api/admin/customers as clients
- **Expected results:** 403/404 for other companies' orders; 403 for admin endpoints
- **Exit condition:** Chains across Acme and Bright run; role matrix read

### C3: Sessions, sign-out and password reset  `api`

- **Goal:** Sign-out ends the session at once
- **Risk:** Token still works after logout
- **Entry point:** POST /api/auth/logout then GET /api/me
- **Expected results:** 401 after logout
- **Exit condition:** Token reuse checked

### C4: Order lists: search, paging, freshness  `api`

- **Goal:** Lists are correct and fresh after status changes
- **Risk:** Stale status for clients; crashes on odd search or paging
- **Entry point:** GET /api/orders
- **Expected results:** 400 for bad input, current status in lists
- **Exit condition:** Warm, change, re-read; odd q and page_size values tried

### C5: Critical flows in both portals  `ui`

- **Goal:** Place order, admin status change, client sees update, reports, sign out
- **Risk:** Flow broken or stale
- **Entry point:** Client Portal and Admin Portal
- **Expected results:** Flows complete with correct totals
- **Exit condition:** All five critical flows run on desktop and a mobile spot check

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Tax is calculated on the full subtotal instead of the discounted subtotal

- **Surface:** business-rule · **Area:** Orders / pricing · **Type:** calculation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `edf5e70`)
- **Charter:** C1

For an order that earns the 5% discount, tax is charged on the undiscounted subtotal, so the total is too high.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with one item p-102 quantity 80 (subtotal 1,000.00), reference QA-M1 (see evidence for the exact request)
3. Observe tax_cents 10000 and total_cents 105000

**Expected:** discount 5000, tax 9500 (10% of 95000), total 104500

**Actual:** discount 5000, tax 10000, total 105000 (customer overcharged 5.00)

**Evidence**

- [evidence/api/manual-M1.json](evidence/api/manual-M1.json)

**Suspected root cause:** priceOrder computes tax from subtotal rather than subtotal - discount (src/pricing.mjs)

**Proposed regression test:** priceOrder for an 80 x 12.50 order gives tax 9500 and total 104500 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `edf5e70` on `feature/qa-eval`
- Production files: `src/pricing.mjs`
- Regression test: `test/pricing.test.mjs`
- Diagnosis before the fix: priceOrder computes tax as 10% of the undiscounted subtotal. The rule says tax applies to the discounted subtotal, so tax must be computed from subtotal minus discount (src/pricing.mjs).
- Root cause: priceOrder computed tax as 10% of the undiscounted subtotal instead of subtotal minus discount.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 9543, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.1 s)
- Re-check of the original steps: Repeated the 80 x 12.50 order against the code under test (priceOrder and the in-process HTTP app, since the already-running demo server was not restarted): subtotal 100000, discount 5000, tax 9500, total 104500.
- Adjacent check: Below-threshold order (79 x 12.50) still taxes the full subtotal: tax 9875, total 108625; existing orders and admin tests all pass (31/31).

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Order items accept negative, zero, decimal and over-limit quantities

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `0208c78`)
- **Charter:** C1

POST /api/orders creates an order when a quantity is -3, 0, 1.5 or 1001, contrary to the rule of a whole number from 1 to 1000.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with items[0].quantity = -3 (and separately 0, 1.5, 1001; see evidence)
3. Observe HTTP 201 each time

**Expected:** HTTP 400 for each quantity

**Actual:** HTTP 201; orders created (negative quantity gives a negative total)

**Evidence**

- [evidence/api/manual-M3.json](evidence/api/manual-M3.json)
- [evidence/api/manual-M4.json](evidence/api/manual-M4.json)
- [evidence/api/manual-M5.json](evidence/api/manual-M5.json)
- [evidence/api/manual-M6.json](evidence/api/manual-M6.json)

**Suspected root cause:** validateOrderInput only checks that quantity is a number (src/api.mjs)

**Proposed regression test:** POST orders with quantity -3, 0, 1.5, 1001 expect 400; 1 and 1000 expect 201 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `0208c78` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/order-validation.test.mjs`
- Diagnosis before the fix: validateOrderInput only checks that quantity is a number, so -3, 0, 1.5 and 1001 are accepted. It must require a whole number from 1 to 1000 (src/api.mjs).
- Root cause: validateOrderInput only checked that quantity was a number; there was no integer or 1-1000 range check.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 400, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated POST /api/orders with quantity -3, 0, 1.5 and 1001 against the in-process app: each returns 400 with field items[0].quantity and no order is created.
- Adjacent check: Quantities 1 and 1000 (both ends of the valid range) still return 201; the existing orders tests pass (16/16).

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: A customer can read another company's order by its number

- **Surface:** permissions · **Area:** Orders / tenant isolation · **Type:** security
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `8ca5e9a`)
- **Charter:** C2

GET /api/orders/{id} does not check the order belongs to the caller's company.

**Steps to reproduce**

1. Sign in as acme-1 over the API and create an order (QA-X1), note its id
2. Sign in as bright-1 and GET /api/orders/<id> (see evidence)
3. Observe HTTP 200 with Acme's order

**Expected:** HTTP 403 or 404

**Actual:** HTTP 200 with the order's contents

**Evidence**

- [evidence/api/manual-X2.json](evidence/api/manual-X2.json)

**Suspected root cause:** getOrder looks up by id only, with no client_id check for client users (src/api.mjs)

**Proposed regression test:** Client of company B GETs company A's order and expects 404; same-company user gets 200; admin gets 200 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `8ca5e9a` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/order-isolation.test.mjs`
- Diagnosis before the fix: getOrder finds an order by id with no check that it belongs to the caller's company, so any client can read another company's order. Client users must get 404 unless order.client_id matches theirs; admins keep access (src/api.mjs).
- Root cause: getOrder looked an order up by id only and never compared its client_id with the caller's company.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 404, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the chain in the in-process app: Acme creates an order, Bright GETs it and now receives 404 not_found instead of 200 with the order.
- Adjacent check: A second Acme user and an admin still get 200 for the same order; existing orders and admin tests pass (31/31).

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Customers can list all customer records

- **Surface:** permissions · **Area:** Customers / access control · **Type:** security
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `f20f8d9`)
- **Charter:** C2

GET /api/admin/customers returns 200 to a client user; only admins may see customers.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/admin/customers (see evidence)
3. Observe HTTP 200 with the customer list

**Expected:** HTTP 403

**Actual:** HTTP 200 with customer records

**Evidence**

- [evidence/api/manual-X4.json](evidence/api/manual-X4.json)

**Suspected root cause:** The route has no roles: ['admin'] option (src/api.mjs)

**Proposed regression test:** Client GET /api/admin/customers expects 403; admin expects 200 (suggested location: `test/admin.test.mjs`)

**Fix: verified**

- Commit `f20f8d9` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/customers-access.test.mjs`
- Diagnosis before the fix: The GET /api/admin/customers route is registered without roles: ['admin'], so any signed-in client can list all customers. Adding the admin role restriction to the route fixes it (src/api.mjs).
- Root cause: The GET /api/admin/customers route was registered without the roles: ['admin'] option, so only authentication was enforced.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 403, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated GET /api/admin/customers as an Acme client in the in-process app: now 403 forbidden instead of 200 with the customer list.
- Adjacent check: The admin still gets 200 with customers; the existing admin endpoint tests pass (15/15).

<a id="ISSUE-006"></a>

### ISSUE-006 🔴 Critical: Signing out does not end the session

- **Surface:** api · **Area:** Auth / sessions · **Type:** security
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `dd4cf16`)
- **Charter:** C3

After POST /api/auth/logout the same token still works on GET /api/me.

**Steps to reproduce**

1. Sign in as zain-1 over the API
2. POST /api/auth/logout (204)
3. GET /api/me with the same token (see evidence)
4. Observe HTTP 200

**Expected:** HTTP 401 immediately after logout

**Actual:** HTTP 200, still signed in

**Evidence**

- [evidence/api/manual-S2.json](evidence/api/manual-S2.json)

**Suspected root cause:** logout only sets endedAt; authenticate never checks endedAt (or expiresAt) (src/api.mjs)

**Proposed regression test:** Logout then GET /api/me with same token expects 401 (suggested location: `test/auth.test.mjs`)

**Fix: verified**

- Commit `dd4cf16` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/logout-session.test.mjs`
- Diagnosis before the fix: logout only stamps endedAt on the session, and authenticate never checks endedAt or expiresAt, so a signed-out token keeps working. authenticate must reject sessions that have ended or expired (src/api.mjs).
- Root cause: authenticate looked sessions up by token but never checked endedAt (set by logout) or expiresAt, so ended and expired sessions kept working.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 401, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original chain in the in-process app: sign in as zain1, POST /api/auth/logout (204), GET /api/me with the same token now returns 401 instead of 200.
- Adjacent check: A second user's session signed in at the same time still returns 200 on /api/me; existing auth and admin tests pass (27/27).

<a id="ISSUE-003"></a>

### ISSUE-003 🟠 Important: An order with no items is accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `e11e204`)
- **Charter:** C1

POST /api/orders with items [] returns 201.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with reference QA-M7 and items []
3. Observe HTTP 201

**Expected:** HTTP 400: an order needs at least one item

**Actual:** HTTP 201, empty order created

**Evidence**

- [evidence/api/manual-M7.json](evidence/api/manual-M7.json)

**Suspected root cause:** No minimum length check on items (src/api.mjs)

**Proposed regression test:** POST order with empty items expects 400 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `e11e204` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/order-empty.test.mjs`
- Diagnosis before the fix: validateOrderInput accepts items: [] because there is no minimum length check. An order needs at least one item, so an empty array must produce a validation error on items (src/api.mjs).
- Root cause: validateOrderInput checked only that items was an array and its maximum length, never a minimum of one line.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 400, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated POST /api/orders with reference QA-empty and items [] in the in-process app: now 400 with field items, and no order is created.
- Adjacent check: An order with one valid item still returns 201; existing orders and quantity validation tests pass (22/22).

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Order lists show an old status after an admin changes it

- **Surface:** cross · **Area:** Orders / freshness · **Type:** stale-data
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `5284ceb`)
- **Charter:** C4

A client's order list is cached per company for 10 minutes; a status change by an admin is not shown after the list was already read.

**Steps to reproduce**

1. Sign in as acme-1, open the order list (search QA-X1): status placed
2. As admin PATCH the order to processing
3. Re-read the list as acme-1 (see evidence)
4. Observe status still placed

**Expected:** status processing

**Actual:** status placed

**Evidence**

- [evidence/api/manual-F3.json](evidence/api/manual-F3.json)

**Suspected root cause:** listClientOrders caches shallow copies of orders per client for 10 minutes and never invalidates (src/api.mjs)

**Proposed regression test:** Client lists orders, admin updates status, client lists again and sees the new status; a new order also appears (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `5284ceb` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/order-freshness.test.mjs`
- Diagnosis before the fix: listClientOrders caches per-company copies of orders for 10 minutes and only addOrder invalidates it, so an admin status change is never reflected. Reading the live orders array instead of the cached copies removes the staleness (src/api.mjs).
- Root cause: listClientOrders cached copies of a company's orders for 10 minutes and only new orders invalidated the cache, so admin status changes were never reflected.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 'processing', ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the warm, change, re-read chain in the in-process app: client list shows placed, admin PATCHes to processing, client re-reads the list and now sees processing (also for a colleague in the same company).
- Adjacent check: Company scoping and newly created orders in the list still work; existing orders and admin tests pass (31/31).

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Searching orders with brackets or similar characters makes the system fail

- **Surface:** api · **Area:** Orders / search · **Type:** robustness
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `cda3f7f`)
- **Charter:** C4

GET /api/orders?q=( returns 500 because q is compiled as a regular expression.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?q=(
3. Observe HTTP 500

**Expected:** HTTP 200 with a literal text match (or 400)

**Actual:** HTTP 500

**Evidence**

- [evidence/api/manual-Q1.json](evidence/api/manual-Q1.json)

**Suspected root cause:** new RegExp(q) on user input in listOrders (src/api.mjs)

**Proposed regression test:** GET /api/orders?q=( expects 200 and finds an order whose reference contains '(' (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `cda3f7f` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/order-search.test.mjs`
- Diagnosis before the fix: listOrders compiles the search text q with new RegExp(q), so characters like ( make it throw and the request returns 500. q must be matched as literal text, so regex special characters have to be escaped (src/api.mjs).
- Root cause: listOrders compiled the user's search text directly into a RegExp, so unbalanced special characters threw and surfaced as a 500.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 200, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated GET /api/orders?q=( in the in-process app: now 200 instead of 500; q=(a+b) finds the order QA-(a+b), and q=QA-.* matches nothing, so it is no longer used as a pattern.
- Adjacent check: Plain case-insensitive search (q=bf-22) still returns the three or more seeded orders; existing orders tests pass (16/16).

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Page size 0 crashes the order list and negative page sizes are accepted

- **Surface:** api · **Area:** Orders / pagination · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `87f3506`)
- **Charter:** C4

page_size=0 gives HTTP 500 and page_size=-5 gives 200, though the spec allows 1 to 100.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?page_size=0 then ?page_size=-5
3. Observe 500 and 200

**Expected:** HTTP 400 for both

**Actual:** HTTP 500 for 0; HTTP 200 for -5

**Evidence**

- [evidence/api/manual-Q2.json](evidence/api/manual-Q2.json)
- [evidence/api/manual-Q3.json](evidence/api/manual-Q3.json)

**Suspected root cause:** parseListQuery checks only the upper bound of page_size (src/api.mjs)

**Proposed regression test:** page_size 0 and -5 expect 400 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `87f3506` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/order-page-size.test.mjs`
- Diagnosis before the fix: parseListQuery checks only the upper bound of page_size, so 0 makes paginate build an invalid array (500) and negatives are accepted. page_size must be an integer from 1 to 100 (src/api.mjs).
- Root cause: parseListQuery validated only the upper bound of page_size, so 0 crashed paginate and negative values were accepted.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 400, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated GET /api/orders with page_size=0 and page_size=-5 in the in-process app: both now return 400 with field page_size (previously 500 and 200).
- Adjacent check: page_size=1 and page_size=100 (both ends of the valid range) still return 200 with the same page_size; existing orders tests pass (16/16).

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| api | Order creation and totals | acme-1 | - | #1 | ✅ tested | threshold, quantity edges |
| permissions | Tenant and role isolation | bright-1 | - | - | ✅ tested | order and admin endpoints |
| api | Order status change and client view | admin | - | #3 | ✅ tested | API only |
| api | Sign out | zain-1 | - | #5 | ✅ tested | API only |
| api | Order lists and search | acme-1 | - | - | ✅ tested |  |
| ui | Place an order and My orders | acme-1 | desktop | #1 | ⛔ not tested |  |
| ui | Orders list and status change | admin | desktop | #2 | ⛔ not tested |  |
| ui | Reports | admin | desktop | #4 | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Place an order and My orders**: Browser flows were not run in this pass; only the API behind the screens was tested
- **Orders list and status change**: Browser flows were not run in this pass; only the API behind the screens was tested
- **Reports**: Browser flows were not run in this pass; the sales report was only checked for access control
- **Password reset emails**: Excluded as a possible side effect; source reading suggests the reset link uses user.resetToken (undefined) instead of the generated token, unverified

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| manual | 23 | 10 | 13 | 21 | [data/api-results/manual.json](data/api-results/manual.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

_No project memory was applied (first run, or memory held nothing relevant)._

**Saved this run**

- New learning L-001: Per-route checks are missing in this API: new routes need an explicit roles option and an owner (company) check, and the order list had a per-company cache that was never invalidated on status change.
- New learning L-002: Regression tests here run in-process via startTestApp in test/helpers.mjs (node:test, new file per fix); app.store is reachable from tests, for example to expire a session. The demo server on port 4100 is not restarted by fixes.
- New learning L-003: The API plan runner finds the most defects with a hand-written plan: totals at exactly 1000.00, quantity edges, cross-company order read, client calls to admin routes, logout then reuse, and warm, change, re-read on the order list.
- Flagged risk area Auth / password reset email link: Auth / password reset email link (important): Code reading suggests the reset link uses an undefined token field; not verified because email was not exercised.

**Memory after the run**

- Product map: 0 page(s) and 13 endpoint(s) known.
- No pages were recorded for this run (data/pages.json), so the map learned no pages.
- Risk areas: 1 area(s) tracked; highest now: Auth / password reset email link (score 4).
- Learnings: 3 new, 0 confirmed again, 0 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: priceOrder for an 80 x 12.50 order gives tax 9500 and total 104500 → `test/orders.test.mjs`
- **ISSUE-002**: POST orders with quantity -3, 0, 1.5, 1001 expect 400; 1 and 1000 expect 201 → `test/orders.test.mjs`
- **ISSUE-004**: Client of company B GETs company A's order and expects 404; same-company user gets 200; admin gets 200 → `test/orders.test.mjs`
- **ISSUE-005**: Client GET /api/admin/customers expects 403; admin expects 200 → `test/admin.test.mjs`
- **ISSUE-006**: Logout then GET /api/me with same token expects 401 → `test/auth.test.mjs`
- **ISSUE-003**: POST order with empty items expects 400 → `test/orders.test.mjs`
- **ISSUE-007**: Client lists orders, admin updates status, client lists again and sees the new status; a new order also appears → `test/orders.test.mjs`
- **ISSUE-008**: GET /api/orders?q=( expects 200 and finds an order whose reference contains '(' → `test/orders.test.mjs`
- **ISSUE-009**: page_size 0 and -5 expect 400 → `test/orders.test.mjs`
