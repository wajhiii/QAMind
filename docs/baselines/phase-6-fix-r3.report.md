# QAMind Technical Report: run-20261102T065021Z

| | |
|---|---|
| Date (UTC) | 2026-11-02T06:50:21.076Z |
| Project | ws (path-ws-984253d1121e) |
| Environment | local demo |
| Branch / commit | feature/qa-eval @ ce79fc1 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 12m 19s |
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
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (2 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **6**   🟡 Minor: **4**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **4**
- API probes executed: **194** (46 produced a signal worth a look)

## Fix run

- **Branch:** `feature/qa-eval`, started from commit `ce79fc1` on `main`. The commits are local to this branch: **nothing was pushed or merged.** A developer must review and merge them.
- **Outcome:** 9 fixed and verified · 0 best-effort (a person must confirm) · 0 reverted · 2 deferred · 4 not attempted
- **Test suite:** before any fix: passed (`npm test`, 0.4 s) · after the fixes: passed (`npm test`, 0.7 s) · no regression: The full test suite passes.
- **Limits:** at most 30 fixes; severities fixed: critical, important; reverts so far: 0
- **Stops and what the user said:** pause: The owner read the summary after the pause at 5 fixes and said to go on with the remaining fixes.
- **Reports from before any fix:** [BASELINE-TECHNICAL-REPORT.md](BASELINE-TECHNICAL-REPORT.md), [BASELINE-ADMIN-REPORT.md](BASELINE-ADMIN-REPORT.md)

| Issue | Severity | Outcome | Commit | Production files | Regression test |
|---|---|---|---|---|---|
| [ISSUE-001](#ISSUE-001) | critical | verified | `533c267` | `src/api.mjs` | `test/qa-001-order-isolation.test.mjs` |
| [ISSUE-002](#ISSUE-002) | critical | verified | `a1b3b7a` | `src/api.mjs` | `test/qa-002-customers-admin-only.test.mjs` |
| [ISSUE-003](#ISSUE-003) | critical | verified | `61d62ae` | `src/api.mjs` | `test/qa-003-logout-revokes-session.test.mjs` |
| [ISSUE-004](#ISSUE-004) | critical | verified | `fa64c72` | `src/pricing.mjs` | `test/qa-004-tax-after-discount.test.mjs` |
| [ISSUE-005](#ISSUE-005) | critical | verified | `51dbb15` | `src/api.mjs` | `test/qa-005-order-quantity-validation.test.mjs` |
| [ISSUE-006](#ISSUE-006) | important | verified | `146ed88` | `src/api.mjs` | `test/qa-006-status-change-visible-in-list.test.mjs` |
| [ISSUE-007](#ISSUE-007) | important | verified | `762bce1` | `src/api.mjs` | `test/qa-007-order-search-literal.test.mjs` |
| [ISSUE-008](#ISSUE-008) | important | verified | `283885c` | `src/api.mjs` | `test/qa-008-page-size-lower-bound.test.mjs` |
| [ISSUE-009](#ISSUE-009) | important | verified | `e975536` | `src/http.mjs` | `test/qa-009-no-stack-in-json-errors.test.mjs` |
| [ISSUE-010](#ISSUE-010) | important | deferred | - | - | - |
| [ISSUE-011](#ISSUE-011) | important | deferred | - | - | - |

## What changed since the last run

_First run for this project: there is nothing to compare with yet._

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Key journeys tested | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 6 | 4 | 1 | 5/5 | 16 | 1 | 4 |

_No earlier run to compare with._

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and priced by the config's rules
- **Risk:** Money is calculated wrongly; invalid quantities or empty orders accepted
- **Entry point:** POST /api/orders as a client (OpenAPI spec is the source of endpoints)
- **Expected results:** Quantity whole number 1..1000, at least one item; discount 5% at subtotal >= 1000.00; tax 10% of the discounted subtotal
- **Exit condition:** Both sides of the 1000.00 threshold and quantity boundaries checked via API and UI

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients only see their own company's orders; admin-only endpoints refuse clients
- **Risk:** Data exposed across customers
- **Entry point:** GET /api/orders/{id}, GET /api/admin/customers, admin endpoints as each client role
- **Expected results:** 403/404 for other companies' orders; 403 on admin endpoints for clients
- **Exit condition:** Role matrix and cross-tenant chains run for every client role

### C3: Sessions and sign-out  `api`

- **Goal:** Sign-out revokes the token at once; expired sessions are refused
- **Risk:** Session stays usable after logout
- **Entry point:** POST /api/auth/logout then GET /api/me with the same token
- **Expected results:** 401 after logout
- **Exit condition:** Logout chain run; UI sign-out checked

### C4: Status change visible to the client (warm, change, re-read)  `cross`

- **Goal:** An admin status change shows to the client at once in list and detail
- **Risk:** Stale cached order list
- **Entry point:** Client lists orders, admin PATCH status, client re-reads
- **Expected results:** New status immediately
- **Exit condition:** List, detail, API and UI compared

### C5: List parameters: pagination, status filter, search  `api`

- **Goal:** List endpoint handles edge values without errors
- **Risk:** 5xx on page_size/q edge values
- **Entry point:** GET /api/orders with page, page_size, status, q
- **Expected results:** 4xx for invalid values, never 5xx; special characters in q treated as text
- **Exit condition:** Boundary values and special characters tried

### C6: Client Portal critical flow 1 and 3  `ui`

- **Goal:** Place an order, see confirmation with total, find it in My Orders
- **Risk:** Wrong total, broken form, double submit
- **Entry point:** Client Portal login, New order, My Orders, order detail
- **Expected results:** Total matches the rules; no duplicate on double-click
- **Exit condition:** Desktop and mobile, page audit on each page

### C7: Admin Portal critical flows 2, 4  `ui`

- **Goal:** Find the order, move status forward, view reports and customers
- **Risk:** Wrong or stale figures; admin pages open to clients
- **Entry point:** Admin Portal login, Orders, order detail, Reports, Customers
- **Expected results:** Status moves forward only; reports match the API
- **Exit condition:** Desktop and mobile, page audit

### C8: Urdu (RTL) customer and password reset  `ui`

- **Goal:** RTL content displays correctly; reset flow works to the local mail catcher only
- **Risk:** Layout and direction defects; reset link broken
- **Entry point:** Client Portal as zain-1; forgot-password page
- **Expected results:** Right-to-left alignment, readable; reset link carries a working token
- **Exit condition:** Pages visited; reset checked only via local mail catcher if available

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Orders: any signed-in customer can open another company's order by its id

- **Surface:** permissions · **UI:** Client Portal · **Area:** Orders / data isolation · **Type:** permissions
- **Roles:** bright-1, zain-1, acme-2
- **Browser / viewport:** Chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `533c267`)
- **Charter:** C2

GET /api/orders/{id} returns any order to any signed-in customer, so users of one company can read orders (items, prices, notes) of other companies.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-tenant and one item p-101 x 2; note the new order id
2. Sign in over the API as bright-1 (a different company) and GET /api/orders/{that id}
3. Observe HTTP 200 with the full order of Acme Traders (same with zain-1)
4. In the Client Portal signed in as acme-2, open /order.html?id=o-1006 (a Bright Foods order): the page shows Bright Foods' order BF-2201 with its items and totals

**Expected:** HTTP 403 or 404: a client sees only their own company's orders (config business rule)

**Actual:** HTTP 200 with the other company's order; the Client Portal order page also shows it

**Evidence**

- [evidence/api/rules-T002.json](evidence/api/rules-T002.json)
- [evidence/api/rules-T003.json](evidence/api/rules-T003.json)
- [screenshots/client-sees-other-company-order-desktop.png](screenshots/client-sees-other-company-order-desktop.png)

**Suspected root cause:** getOrder in src/api.mjs looks the order up by id only and never compares order.client_id with the caller's client_id (admins excepted)

**Proposed regression test:** A client of company A requests an order of company B and expects 404 (or 403); a client of the same company still gets 200 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `533c267` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-001-order-isolation.test.mjs`
- Diagnosis before the fix: getOrder in src/api.mjs finds the order by id only and never compares order.client_id with the caller's client_id. Clients must get 404 for another company's order while admins and same-company users keep access.
- Root cause: getOrder looked the order up by id only and never compared order.client_id with the caller's client_id, so any signed-in client could read any order.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 404, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the finding's steps over real HTTP against a fresh app instance started by the test (the running demo on port 4100 still has the old code): bright1 and zain1 GET an Acme order and acme1's own QA-tenant order -> 404 instead of 200; the same company and admin still get 200.
- Adjacent check: Same-company user acme2 reads o-1001 (200) and admin reads Bright's o-1006 (200); unknown id still 404; whole existing suite checked later by fix_run_suite.

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Customers: any signed-in customer can read the full customer list with personal details

- **Surface:** permissions · **Area:** Admin / customers · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `a1b3b7a`)
- **Charter:** C2

GET /api/admin/customers answers 200 to client roles, returning contacts, emails, phone numbers, national ids, addresses and card endings of every company.

**Steps to reproduce**

1. Sign in over the API as acme-1 (a client)
2. GET /api/admin/customers
3. Observe HTTP 200 with the customer records of all companies (same for bright-1); the admin-only sales report returns 403 for the same roles

**Expected:** HTTP 403 for clients (config: only admins can see customers and reports)

**Actual:** HTTP 200 with the records of every company

**Evidence**

- [evidence/api/rules-A001.json](evidence/api/rules-A001.json)
- [evidence/api/rules-A002.json](evidence/api/rules-A002.json)

**Suspected root cause:** The GET /api/admin/customers route in src/api.mjs is registered without roles: ['admin'] (the other admin routes have it)

**Proposed regression test:** A client requests /api/admin/customers and expects 403; admin still gets 200 (suggested location: `test/admin.test.mjs`)

**Fix: verified**

- Commit `a1b3b7a` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-002-customers-admin-only.test.mjs`
- Diagnosis before the fix: The GET /api/admin/customers route in src/api.mjs is registered with no roles option, so any signed-in client can call it. Adding roles: ['admin'] like the other admin routes makes clients get 403.
- Root cause: The GET /api/admin/customers route was registered without roles: ['admin'], unlike the other admin routes, so the role check never ran for it.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 403, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the finding's steps over real HTTP against a fresh app instance started by the test (the live demo on port 4100 still runs the old code): acme1, acme2, bright1 and zain1 GET /api/admin/customers -> 403 forbidden with no items instead of 200.
- Adjacent check: Admin GET /api/admin/customers still returns 200 with 3 companies (the Admin Portal Customers page uses the admin sign-in); anonymous stays 401 per the existing admin suite.

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Sign-out: the old sign-in still works after signing out

- **Surface:** api · **Area:** Auth / sessions · **Type:** auth
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `61d62ae`)
- **Charter:** C3

After POST /api/auth/logout returns 204 the same bearer token still gets 200 from /api/me and /api/orders.

**Steps to reproduce**

1. Sign in over the API as zain-1 and keep the bearer token
2. GET /api/me with the token: 200
3. POST /api/auth/logout with the token: 204
4. GET /api/me and GET /api/orders with the same token
5. Observe HTTP 200 for both (the Client Portal's Sign out button only forgets the token in the browser)

**Expected:** HTTP 401 at once after sign-out (config: signing out ends the session at once)

**Actual:** HTTP 200: the signed-out token keeps working

**Evidence**

- [evidence/api/rules-X003.json](evidence/api/rules-X003.json)
- [evidence/api/rules-X004.json](evidence/api/rules-X004.json)

**Suspected root cause:** logout in src/api.mjs only sets session.endedAt and authenticate never checks endedAt (nor expiresAt)

**Proposed regression test:** Log in, call /api/me (200), log out, call /api/me again with the same token and expect 401 (suggested location: `test/auth.test.mjs`)

**Fix: verified**

- Commit `61d62ae` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-003-logout-revokes-session.test.mjs`
- Diagnosis before the fix: logout in src/api.mjs only sets session.endedAt, but authenticate never looks at endedAt, so the token keeps working. authenticate must treat a session with endedAt as no session (401).
- Root cause: logout only stamped session.endedAt and authenticate never checked it, so a signed-out bearer token stayed valid.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 401, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the finding's chain over real HTTP against a fresh app instance started by the test (the live demo on port 4100 still runs the old code): zain1 /api/me 200, logout 204, then /api/me and /api/orders with the same token -> 401 instead of 200, and a second logout also 401.
- Adjacent check: A second login of the same user (acme1) stays signed in after the first token is signed out; ordinary login and /api/me work. Session expiry (expiresAt) is not checked either; it was not part of this finding and was not changed.

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Orders: tax is charged on the full subtotal instead of the discounted subtotal

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / pricing · **Type:** business-rule
- **Roles:** acme-1
- **Browser / viewport:** Chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `fa64c72`)
- **Charter:** C1

For orders at or above 1,000.00 the 5% discount is applied but tax is still 10% of the undiscounted subtotal, so customers are overcharged.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with reference QA-at and items [p-102 x 80] (subtotal 1,000.00)
3. Observe discount_cents 5000 but tax_cents 10000 and total_cents 105000
4. Repeat with p-102 x 160 (subtotal 2,000.00): tax_cents 20000, total_cents 210000
5. In the Client Portal: New order, Ballpoint Pens quantity 80, Place order: confirmation says Total: $1,050.00; the order page shows Tax $100.00

**Expected:** Tax = 10% of the discounted subtotal: 950.00 -> tax 95.00, total 1,045.00 (2,000.00 -> 190.00 tax, 2,090.00 total); computed independently from the config rule

**Actual:** Tax 100.00 / total 1,050.00 (and 200.00 / 2,100.00)

**Evidence**

- [evidence/api/rules-R002.json](evidence/api/rules-R002.json)
- [evidence/api/rules-R003.json](evidence/api/rules-R003.json)
- [screenshots/client-order-total-wrong-desktop.png](screenshots/client-order-total-wrong-desktop.png)

**Suspected root cause:** priceOrder in src/pricing.mjs computes tax from subtotal rather than subtotal - discount

**Proposed regression test:** priceOrder for a 1000.00 subtotal returns tax_cents 9500 and total_cents 104500; below 1000.00 is unchanged (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `fa64c72` on `feature/qa-eval`
- Production files: `src/pricing.mjs`
- Regression test: `test/qa-004-tax-after-discount.test.mjs`
- Diagnosis before the fix: priceOrder in src/pricing.mjs computes tax as 10% of the full subtotal instead of the discounted subtotal, so orders of 1,000.00 or more are overcharged. Tax must be Math.round((subtotal - discount) * TAX_RATE).
- Root cause: priceOrder computed tax as Math.round(subtotal * 10%) instead of using subtotal minus discount, so discounted orders were taxed on the pre-discount amount.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 9500, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the finding's order over real HTTP against a fresh app instance started by the test (the live demo still runs the old code): POST 80 x p-102 (subtotal 1000.00) -> discount 5000, tax 9500, total 104500 instead of tax 10000/total 105000; 160 x p-102 -> tax 19000, total 209000.
- Adjacent check: Order below the threshold (79 x p-102, 987.50) is unchanged: no discount, tax 98.75, total 1086.25; existing pricing tests are checked by fix_run_suite.

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders: zero, negative, fractional or huge quantities and empty orders are accepted

- **Surface:** api · **UI:** Client Portal · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Browser / viewport:** Chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `51dbb15`)
- **Charter:** C1

POST /api/orders accepts quantity -3, 0, 1.5 and 1001 and an empty items list; negative quantities create orders with negative totals that also reach the sales figures.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items [{product_id p-101, quantity -3}]: HTTP 201, negative total
3. Repeat with quantity 0, 1.5, 1001 and with items []: each answers HTTP 201
4. In the Client Portal: New order, A4 Copy Paper, quantity -5, Place order: confirmation says Total: -$35.75

**Expected:** HTTP 400: quantity must be a whole number from 1 to 1,000 and an order needs at least one item (config business rule, OpenAPI minimum 1 / maximum 1000)

**Actual:** HTTP 201 and the order is stored (for example total -$21.45 for quantity -3)

**Evidence**

- [evidence/api/rules-R005.json](evidence/api/rules-R005.json)
- [evidence/api/client-P043.json](evidence/api/client-P043.json)
- [evidence/api/client-P044.json](evidence/api/client-P044.json)
- [evidence/api/client-P045.json](evidence/api/client-P045.json)
- [evidence/api/client-P046.json](evidence/api/client-P046.json)

**Suspected root cause:** validateOrderInput in src/api.mjs only checks that quantity is a number, and never checks integer, range 1..1000 or that items is non-empty

**Proposed regression test:** POST orders with quantity -3, 0, 1.5, 1001 and empty items and expect 400 with a message naming the field; quantity 1 and 1000 still accepted (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `51dbb15` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-005-order-quantity-validation.test.mjs`
- Diagnosis before the fix: validateOrderInput in src/api.mjs only checks that quantity is a number and never that it is a whole number from 1 to 1000, nor that items is non-empty. Add those checks, returning 400 with the offending field.
- Root cause: validateOrderInput only checked that quantity was a number and that items was an array, with no integer, 1..1000 range or non-empty check, so negative, zero, fractional, huge quantities and empty orders were stored.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 400, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the finding's POSTs over real HTTP against a fresh app instance started by the test (live demo still runs old code): quantity -3, 0, 1.5, 1001 and items [] -> 400 validation_error naming items[0].quantity or items, and the order count did not change (previously 201 and a stored order).
- Adjacent check: Quantity 1 and 1000 (the boundaries) still create orders with 201, and existing order tests (checked fully by fix_run_suite) cover valid orders, unknown product and text quantity.

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: My orders: an old order status is still shown in the list after an admin changed it

- **Surface:** cross · **UI:** Client Portal · **Area:** Orders / status · **Type:** stale-data
- **Roles:** acme-1, acme-2, admin
- **Browser / viewport:** Chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `146ed88`)
- **Charter:** C4

After the client's list is loaded once, an admin status change is not shown in the list for the whole company (up to the 10 minute cache lifetime) while the order page shows the new status.

**Steps to reproduce**

1. As acme-1 (or in the Client Portal) load the order list: the order shows Placed
2. As admin, change that order to Processing (PATCH /api/admin/orders/{id}/status or the Admin Portal order page)
3. As acme-2 (same company) open My orders: the order still shows Placed; the order page shows Processing
4. Repeat via API: GET /api/orders?q=QA-stale answers status placed while GET /api/orders/{id} answers processing

**Expected:** The list shows the new status at once, same as the order page

**Actual:** List: placed; order page: processing

**Evidence**

- [evidence/api/rules-S005.json](evidence/api/rules-S005.json)
- [evidence/api/rules-S006.json](evidence/api/rules-S006.json)
- [evidence/api/rules-S004.json](evidence/api/rules-S004.json)
- [screenshots/client-list-stale-status-desktop.png](screenshots/client-list-stale-status-desktop.png)

**Suspected root cause:** listClientOrders in src/api.mjs caches copies of a company's orders for 10 minutes; only addOrder clears the cache, a status change does not

**Proposed regression test:** Client lists orders, admin moves an order to processing, client lists again and sees processing (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `146ed88` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-006-status-change-visible-in-list.test.mjs`
- Diagnosis before the fix: listClientOrders caches copies of a company's orders for 10 minutes and only addOrder clears that cache, so updateOrderStatus leaves the client list stale. updateOrderStatus must delete the cache entry of the order's company after changing the status.
- Root cause: The per-company order list cache (10 minutes) was only cleared when an order was added, never when an admin changed an order's status, so the list kept the old status.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 'processing', ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.4 s)
- Re-check of the original steps: Repeated the warm, change, re-read sequence over real HTTP against a fresh app instance started by the test (live demo still runs old code): acme1 and acme2 list o-1004 (placed), admin PATCHes it to processing, both lists and the detail now show processing instead of placed.
- Adjacent check: Another company's list (bright1, o-1008) also shows its own change at once and acme's list is unaffected; the existing test that a new order appears straight away is covered by fix_run_suite.

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Order search: typing ( or \ in the search box makes the orders list fail

- **Surface:** api · **UI:** Admin Portal · **Area:** Orders / search · **Type:** server-error
- **Roles:** acme-1, admin
- **Browser / viewport:** Chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `762bce1`)
- **Charter:** C5

GET /api/orders?q=( and q=\ return HTTP 500 because the search text is used as a pattern; the Admin Portal shows 'Could not load orders (500).'

**Steps to reproduce**

1. Sign in over the API as acme-1 (or admin)
2. GET /api/orders?q=%28 : HTTP 500
3. GET /api/orders?q=%5C : HTTP 500
4. In the Admin Portal Orders page type ( in the search box and press Enter: the red message 'Could not load orders (500).' appears

**Expected:** Search text is treated literally: HTTP 200 with matching rows (none) and no error

**Actual:** HTTP 500; UI error message

**Evidence**

- [evidence/api/client-P024.json](evidence/api/client-P024.json)
- [evidence/api/client-P028.json](evidence/api/client-P028.json)
- [evidence/api/baseline-P024.json](evidence/api/baseline-P024.json)
- [screenshots/admin-orders-search-paren-desktop.png](screenshots/admin-orders-search-paren-desktop.png)

**Suspected root cause:** listOrders in src/api.mjs builds new RegExp(q, 'i') from user input (also a pattern-complexity risk)

**Proposed regression test:** GET /api/orders?q=( returns 200 and an empty list; q=QA- still matches by reference (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `762bce1` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-007-order-search-literal.test.mjs`
- Diagnosis before the fix: listOrders in src/api.mjs builds new RegExp(q, 'i') from the user's search text, so ( or a backslash throws and becomes a 500. Replace it with a case-insensitive literal substring match on reference and note.
- Root cause: listOrders built new RegExp(q, 'i') from user input, so regex metacharacters such as ( or a backslash threw an uncaught SyntaxError (HTTP 500) and others acted as patterns.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 1, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the finding's searches over real HTTP against a fresh app instance started by the test (live demo still runs old code): q=( , \, [, *, + and ? -> 200 with total 0 instead of 500; BF-.* matches nothing instead of 4 rows.
- Adjacent check: Search still finds orders by reference (bf-22) and by note (case-insensitive 'LOADING DOCK' -> o-1001), and a reference with punctuation 'QA-(x)+y' is found by '(x)+y'.

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Orders list: page size 0 fails with a server error and a negative page size is accepted

- **Surface:** api · **Area:** Orders / pagination · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `283885c`)
- **Charter:** C5

GET /api/orders?page_size=0 returns HTTP 500 and page_size=-1 returns HTTP 200 although the spec says the minimum is 1.

**Steps to reproduce**

1. Sign in over the API as acme-1 (or admin)
2. GET /api/orders?page_size=0 : HTTP 500
3. GET /api/orders?page_size=-1 : HTTP 200 with page_size -1 in the body

**Expected:** HTTP 400 naming page_size (between 1 and 100), per the spec and the handler's own message

**Actual:** HTTP 500 for 0; HTTP 200 with page_size -1 for -1

**Evidence**

- [evidence/api/client-P019.json](evidence/api/client-P019.json)
- [evidence/api/client-P020.json](evidence/api/client-P020.json)
- [evidence/api/baseline-P019.json](evidence/api/baseline-P019.json)

**Suspected root cause:** parseListQuery in src/api.mjs checks only pageSize > 100 and integer; the lower bound of 1 is missing, so paginate divides by zero

**Proposed regression test:** GET /api/orders with page_size 0 and -1 expects 400 naming page_size; page_size 1 and 100 expect 200 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `283885c` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-008-page-size-lower-bound.test.mjs`
- Diagnosis before the fix: parseListQuery in src/api.mjs checks page_size is an integer and at most 100 but never that it is at least 1, so 0 reaches paginate (Infinity pages, HTTP 500) and -1 is echoed back with 200. Add the lower bound so both return 400 naming page_size.
- Root cause: parseListQuery validated page_size as an integer of at most 100 but had no lower bound, so 0 reached paginate and divided by zero (HTTP 500) and -1 was accepted and echoed back.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 400, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the finding's requests over real HTTP against a fresh app instance started by the test (live demo still runs old code): page_size=0 -> 400 naming page_size (was 500) and page_size=-1 -> 400 (was 200 with page_size -1).
- Adjacent check: page_size=1 returns one row with page_size 1 and page_size=100 returns 200; page_size=101, 1.5 and abc are still refused with 400.

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Malformed requests: the error response includes internal technical details and file paths

- **Surface:** api · **Area:** API / error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `e975536`)
- **Charter:** C5

Sending malformed JSON to POST /api/auth/login or POST /api/orders answers HTTP 400 with a stack trace and server file paths in the body.

**Steps to reproduce**

1. POST /api/auth/login with the raw body {bad json and Content-Type application/json
2. Observe HTTP 400 whose body has a stack field with file paths of the server
3. Repeat with POST /api/orders (signed in as acme-1)

**Expected:** A short 400 message naming the problem, with no stack trace or paths

**Actual:** 400 with stack trace and absolute server paths in the body

**Evidence**

- [evidence/api/client-P007.json](evidence/api/client-P007.json)
- [evidence/api/client-P048.json](evidence/api/client-P048.json)
- [evidence/api/baseline-P007.json](evidence/api/baseline-P007.json)

**Suspected root cause:** readJsonBody / sendError in src/http.mjs includes err.stack in the error body of a parse failure

**Proposed regression test:** Send malformed JSON and assert 400 and that the body has no stack field and no file paths (suggested location: `test/auth.test.mjs`)

**Fix: verified**

- Commit `e975536` on `feature/qa-eval`
- Production files: `src/http.mjs`
- Regression test: `test/qa-009-no-stack-in-json-errors.test.mjs`
- Diagnosis before the fix: readJsonBody in src/http.mjs answers a JSON parse failure with HttpError(400, 'invalid_json', err.message, { trace: err.stack }), which sends the server stack trace and file paths to the caller. Drop the trace and use a fixed message.
- Root cause: readJsonBody put the caught SyntaxError's message and stack (err.stack, with absolute server file paths) into the 400 response body for any JSON parse failure.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: undefined, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the finding's malformed bodies over real HTTP against a fresh app instance started by the test (live demo still runs old code): POST /api/auth/login with '{bad json' and POST /api/orders with a truncated body -> 400 invalid_json 'Request body must be valid JSON', no trace or stack field and no file paths in the body (previously a full stack trace).
- Adjacent check: An ordinary validation error (login with an empty object) still returns 400 validation_error unchanged; valid JSON bodies still parse (all other suites post JSON, checked by fix_run_suite).

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: Orders: two identical submissions at the same moment create two orders

- **Surface:** api · **Area:** Orders / duplicate submission · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** deferred
- **Charter:** C1

Two identical POST /api/orders sent in parallel both answer 201 and create two separate orders (o-1023 and a second id); the spec documents no duplicate protection. Unsure whether the product intends to allow duplicates, so the doubt is stated here.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send POST /api/orders twice in parallel with the same reference QA-reference and the same item p-101 x 1
3. Observe two HTTP 201 answers with different order ids

**Expected:** One order (or the second refused with 409) when the same reference and items are submitted twice at once; if duplicates are allowed the spec should say so

**Actual:** Two orders created (both 201); the UI double-click was not tested

**Evidence**

- [evidence/api/client-P049.json](evidence/api/client-P049.json)

**Suspected root cause:** createOrder in src/api.mjs has no duplicate check or idempotency key

**Proposed regression test:** Two parallel identical order submissions leave exactly one order (or one refused) (suggested location: `test/orders.test.mjs`)

**Fix: deferred**

- Why it was not fixed: needs-decision: The spec documents no duplicate protection and two orders with the same reference may be legal; the owner must decide what counts as a duplicate (same reference, same items, time window) before code is changed.

<a id="ISSUE-011"></a>

### ISSUE-011 🟠 Important: New order on a phone: the form is wider than the screen and the Place order button is off-screen

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / new order · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** deferred
- **Charter:** C6

At 390 px width the New order page scrolls sideways by 165 px; the reference and note boxes extend past the right edge, the Remove button overlaps the quantity box, and Place order starts at 435 px.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 with a fresh browser profile
2. Resize the window to 390x844 (phone width)
3. Open New order (new-order.html)
4. Run the page audit / measure: page width 555 px against a 390 px screen; the Place order button spans 435 to 555 px

**Expected:** The form fits the phone screen and every control, including Place order, is reachable without sideways scrolling

**Actual:** Controls pushed past the right edge; Place order is outside the visible screen

**Evidence**

- [screenshots/client-new-order-mobile.png](screenshots/client-new-order-mobile.png)

**Suspected root cause:** Fixed or minimum widths on the line-item row and form fields in public/client/client.css

**Proposed regression test:** Not testable with the project's node:test unit suite; a browser layout check at 390 px that scrollWidth <= innerWidth (suggested location: `test/ (needs a browser test runner, none exists)`)

**Fix: deferred**

- Why it was not fixed: no-test-possible: A phone-width layout defect in the client CSS; the project only has node:test API tests and no browser runner, so a regression test that fails without the fix cannot be written without adding a framework.

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: My orders on a phone: the filter bar covers the top of the table and the Total column is cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / my orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** not attempted
- **Charter:** C6

At 390 px the table box starts 64 px above the bottom of the Status/New order bar, so the header row and the first order are partly hidden; Total is cut off with no sign that it scrolls.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 with a fresh profile and resize to 390x844
2. Open My orders (my-orders.html)
3. Observe the first row partly covered by the Status / New order bar, no visible column headings, and the Total values cut off at the right edge

**Expected:** The table starts below the bar; all columns are visible or a visible cue shows the table scrolls

**Actual:** Table top covered by the bar; Total cut off

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** Toolbar and table wrapper overlap (negative margin or fixed height) in public/client/client.css at narrow widths

**Proposed regression test:** Not testable with the project's node:test suite (needs a browser layout check) (suggested location: `test/ (needs a browser test runner, none exists)`)

<a id="ISSUE-013"></a>

### ISSUE-013 🟡 Minor: Admin Orders: the search box and the refresh and clear buttons have no accessible names

- **Surface:** ui · **UI:** Admin Portal · **Area:** Admin Portal / orders · **Type:** accessibility
- **Roles:** admin
- **Browser / viewport:** Chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** not attempted
- **Charter:** C7

The search input has only a placeholder and the two icon buttons (refresh, clear filters) have no text or label, so screen readers announce them as unnamed.

**Steps to reproduce**

1. Sign in to the Admin Portal as admin
2. Open Orders (orders.html)
3. Run the page audit: unnamedControls lists input#search (placeholder only), button#refresh and button#clear-filters; repeated after reloading

**Expected:** Every control has an accessible name (a label or aria-label)

**Actual:** Three unnamed controls

**Evidence**

- [screenshots/admin-orders-search-paren-desktop.png](screenshots/admin-orders-search-paren-desktop.png)

**Suspected root cause:** Missing label / aria-label on #search, #refresh and #clear-filters in public/admin/orders.html

**Proposed regression test:** Not testable with the node:test suite: assert every input and button on admin orders.html has a name (static HTML check possible) (suggested location: `test/admin.test.mjs`)

<a id="ISSUE-014"></a>

### ISSUE-014 🟡 Minor: Urdu text is shown in left-to-right boxes: references with numbers and notes read in the wrong order

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / Urdu content · **Type:** i18n
- **Roles:** zain-1, admin
- **Browser / viewport:** Chromium / desktop 1366x768 and mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** not attempted
- **Charter:** C8

Urdu references, company names and notes are displayed with direction left-to-right and no dir=auto or isolation; the reference 'زین-1044' shows its number to the right of the word, and notes are left-aligned.

**Steps to reproduce**

1. Sign in to the Client Portal as zain-1 with a fresh profile
2. Open My orders: the references show the Urdu word to the left and the number to its right
3. Open an order (order.html?id=o-1012): the page audit lists the company name and the note as Urdu text in left-to-right boxes
4. Same in Admin Portal Customers and Reports tables (audit rtlTextInLtrContainer)

**Expected:** Urdu text from the database is isolated (dir=auto or bdi) so numbers and punctuation read correctly for right-to-left readers

**Actual:** Urdu text rendered in left-to-right containers

**Evidence**

- [screenshots/client-urdu-my-orders-desktop.png](screenshots/client-urdu-my-orders-desktop.png)
- [screenshots/client-urdu-order-detail-mobile.png](screenshots/client-urdu-order-detail-mobile.png)

**Suspected root cause:** User-generated text is inserted without dir=auto or a bdi element in the shared UI scripts

**Proposed regression test:** Not testable with node:test (needs a browser); static check that table cells for names, references and notes carry dir=auto (suggested location: `test/ (needs a browser test runner, none exists)`)

<a id="ISSUE-015"></a>

### ISSUE-015 🟡 Minor: Reports: the sales summary takes about four seconds to load

- **Surface:** api · **UI:** Admin Portal · **Area:** Admin / reports · **Type:** performance
- **Roles:** admin
- **Browser / viewport:** Chromium / desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** not attempted
- **Charter:** C7

GET /api/admin/reports/sales answered in 4,005 ms and 4,003 ms on two runs (limit 3,000 ms) with about 40 orders; the Reports page shows its heading while waiting.

**Steps to reproduce**

1. Sign in over the API as admin
2. GET /api/admin/reports/sales twice and time it
3. Observe about 4 seconds each time; the Admin Portal Reports page needs several seconds before the figures appear

**Expected:** A summary of a few dozen orders in well under three seconds

**Actual:** About 4 seconds (cause unknown; may be deliberate latency in the demo configuration)

**Evidence**

- [evidence/api/baseline-P061.json](evidence/api/baseline-P061.json)
- [evidence/api/baseline-P093.json](evidence/api/baseline-P093.json)

**Suspected root cause:** Unknown; salesReport in src/api.mjs waits for config.latency.salesReportMs

**Proposed regression test:** No automated regression test proposed (timing) (suggested location: `n/a`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Password reset email may contain a link without a valid reset code** (api, tried 1×): Reading src/api.mjs, forgotPassword builds the link from user.resetToken, a field that does not exist, while the real code is stored under a different variable. Not run: the email goes to a local mail catcher this run cannot read. Why unconfirmed: Found in the source only; the email could not be read, so it was not reproduced

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| api | Orders: create, validation, pricing, list, detail | acme-1 | - | #1 | ✅ tested | business-rule boundaries, quantity edges, pagination, search, duplicate submission |
| api | Orders: status changes and transitions | admin | - | #2 | ✅ tested | allowed and refused transitions, unknown status |
| api | Role and tenant isolation | bright-1 | - | - | ✅ tested | cross-company reads, admin endpoints per role, role matrix |
| api | Sign-in, sign-out and sessions | zain-1 | - | #5 | ✅ tested | token reuse after sign-out |
| api | Sales summary report | admin | - | #4 | ✅ tested | admin allowed, clients refused, response time |
| ui | Sign in and My orders | acme-1 | desktop | #1 | ✅ tested | page audit, list of 30 orders, paging control present |
| ui | New order and confirmation | acme-1 | desktop | #1 | ✅ tested | order of 80 pens, negative quantity, confirmation total |
| ui | New order and My orders | acme-1 | mobile | #1 | ✅ tested | page audit at 390x844 |
| ui | Order page and status after admin change | acme-2 | desktop | #3 | ✅ tested | list versus order page, other company's order by address |
| ui | Sign out | acme-2 | desktop | #5 | ✅ tested | returns to sign-in and protects pages in the browser |
| ui | Urdu customer: My orders and order page | zain-1 | desktop | - | ✅ tested | desktop My orders; mobile order page; RTL leads judged on screenshots |
| ui | Forgot and reset password pages | anonymous | mobile | - | ◐ partial | pages load and audit clean; the email and reset link were not exercised |
| ui | Orders list and search | admin | desktop | #2 | ✅ tested | page audit, search with a bracket |
| ui | Order page and status update | admin | desktop | #2 | ✅ tested | moved an order from placed to processing |
| ui | Reports | admin | desktop | #4 | ✅ tested | figures load after about 4 seconds |
| ui | Customers | admin | desktop | - | ✅ tested | page audit |
| ui | Orders, order page, Customers, Reports | admin | mobile | - | ✅ tested | page audit at 390x844, no layout leads |
| ui | Export of orders to a spreadsheet file | admin | - | - | ⛔ not tested |  |
| ui | Password reset by email | anonymous | - | - | ⛔ not tested |  |
| ui | Expired sign-in | acme-1 | - | - | ⛔ not tested |  |
| ui | Double click on Place order | acme-1 | - | - | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Export of orders to a spreadsheet file**: The Export CSV button was not used in this run (not covered in this pass).
- **Password reset by email**: The reset email goes to a local mail catcher that this run cannot read, so the emailed link and the reset were not checked.
- **Expired sign-in**: Waiting for a sign-in to expire was not done and the lifetime is not stated in the config.
- **Double click on Place order**: Not covered in this pass; only the parallel duplicate submission was run through the API.

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| baseline | 100 | 85 | 8 | 11 | [data/api-results/baseline.json](data/api-results/baseline.json) |
| client | 64 | 52 | 12 | 21 | [data/api-results/client.json](data/api-results/client.json) |
| rules | 30 | 19 | 11 | 14 | [data/api-results/rules.json](data/api-results/rules.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

_No project memory was applied (first run, or memory held nothing relevant)._

**Saved this run**

- New learning L-001: Order handlers in src/api.mjs miss ownership and role checks (getOrder by id only; a route lacked roles). Fix with an owner check returning 404, or roles: ['admin'] on the route, tested via startTestApp in a new test/qa-NNN file.
- New learning L-002: The per-company order list is cached for 10 minutes, so any write path that changes an order must clear the cache. Always run warm, change, re-read through the list as well as the detail page.
- New learning L-003: The demo app on port 4100 keeps running old code during fixes; rechecks go through the node:test helper startTestApp (a fresh instance over real HTTP). The sales report takes about 4 seconds, so wait for the Gross sales text.
- New learning L-004: At 390 px width the New order page overflows sideways and the My orders toolbar overlaps its table. Run the page audit on both pages at mobile first. The project has no browser test runner, so layout fixes cannot get a regression test.
- Flagged risk area Auth / session expiry: Auth / session expiry (important): authenticate never checks session expiresAt; not tested because the lifetime is not stated, so expired sign-ins may still work.

**Memory after the run**

- Product map: 11 page(s) and 13 endpoint(s) known.
- Risk areas: 7 area(s) tracked; highest now: Auth / session expiry (score 4).
- Learnings: 4 new, 0 confirmed again, 0 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: A client of company A requests an order of company B and expects 404 (or 403); a client of the same company still gets 200 → `test/orders.test.mjs`
- **ISSUE-002**: A client requests /api/admin/customers and expects 403; admin still gets 200 → `test/admin.test.mjs`
- **ISSUE-003**: Log in, call /api/me (200), log out, call /api/me again with the same token and expect 401 → `test/auth.test.mjs`
- **ISSUE-004**: priceOrder for a 1000.00 subtotal returns tax_cents 9500 and total_cents 104500; below 1000.00 is unchanged → `test/orders.test.mjs`
- **ISSUE-005**: POST orders with quantity -3, 0, 1.5, 1001 and empty items and expect 400 with a message naming the field; quantity 1 and 1000 still accepted → `test/orders.test.mjs`
- **ISSUE-006**: Client lists orders, admin moves an order to processing, client lists again and sees processing → `test/orders.test.mjs`
- **ISSUE-007**: GET /api/orders?q=( returns 200 and an empty list; q=QA- still matches by reference → `test/orders.test.mjs`
- **ISSUE-008**: GET /api/orders with page_size 0 and -1 expects 400 naming page_size; page_size 1 and 100 expect 200 → `test/orders.test.mjs`
- **ISSUE-009**: Send malformed JSON and assert 400 and that the body has no stack field and no file paths → `test/auth.test.mjs`
- **ISSUE-010**: Two parallel identical order submissions leave exactly one order (or one refused) → `test/orders.test.mjs`
- **ISSUE-011**: Not testable with the project's node:test unit suite; a browser layout check at 390 px that scrollWidth <= innerWidth → `test/ (needs a browser test runner, none exists)`
- **ISSUE-012**: Not testable with the project's node:test suite (needs a browser layout check) → `test/ (needs a browser test runner, none exists)`
- **ISSUE-013**: Not testable with the node:test suite: assert every input and button on admin orders.html has a name (static HTML check possible) → `test/admin.test.mjs`
- **ISSUE-014**: Not testable with node:test (needs a browser); static check that table cells for names, references and notes carry dir=auto → `test/ (needs a browser test runner, none exists)`
- **ISSUE-015**: No automated regression test proposed (timing) → `n/a`
