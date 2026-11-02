# QAMind Technical Report: run-20261102T063924Z

| | |
|---|---|
| Date (UTC) | 2026-11-02T06:39:24.106Z |
| Project | ws (path-ws-14249d28d33d) |
| Environment | local demo |
| Branch / commit | feature/qa-eval @ 391a671 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 10m 25s |
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
| Test account "admin" can sign in | ✅ ok | signed in over the API (6 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **5**   🟡 Minor: **3**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **6**
- API probes executed: **214** (56 produced a signal worth a look)

## Fix run

- **Branch:** `feature/qa-eval`, started from commit `391a671` on `main`. The commits are local to this branch: **nothing was pushed or merged.** A developer must review and merge them.
- **Outcome:** 9 fixed and verified · 0 best-effort (a person must confirm) · 0 reverted · 4 deferred · 0 not attempted
- **Test suite:** before any fix: passed (`npm test`, 0.5 s) · after the fixes: passed (`npm test`, 1 s) · no regression: The full test suite passes.
- **Limits:** at most 30 fixes; severities fixed: critical, important; reverts so far: 0
- **Stops and what the user said:** pause: The owner read the summary after the five-fix pause and said to go on with the remaining fixes.
- **Reports from before any fix:** [BASELINE-TECHNICAL-REPORT.md](BASELINE-TECHNICAL-REPORT.md), [BASELINE-ADMIN-REPORT.md](BASELINE-ADMIN-REPORT.md)

| Issue | Severity | Outcome | Commit | Production files | Regression test |
|---|---|---|---|---|---|
| [ISSUE-001](#ISSUE-001) | critical | verified | `a0994a2` | `src/api.mjs` | `test/regression-order-isolation.test.mjs` |
| [ISSUE-002](#ISSUE-002) | critical | verified | `24b7044` | `src/api.mjs` | `test/regression-customers-admin-only.test.mjs` |
| [ISSUE-003](#ISSUE-003) | critical | verified | `eb323b1` | `src/pricing.mjs` | `test/regression-tax-after-discount.test.mjs` |
| [ISSUE-004](#ISSUE-004) | critical | verified | `e405b59` | `src/api.mjs` | `test/regression-session-end.test.mjs` |
| [ISSUE-005](#ISSUE-005) | critical | verified | `be4a85b` | `src/api.mjs` | `test/regression-order-quantity.test.mjs` |
| [ISSUE-006](#ISSUE-006) | important | verified | `5eff6bc` | `src/api.mjs` | `test/regression-order-search.test.mjs` |
| [ISSUE-007](#ISSUE-007) | important | verified | `9580a8d` | `src/api.mjs` | `test/regression-page-size.test.mjs` |
| [ISSUE-008](#ISSUE-008) | important | verified | `2466016` | `src/api.mjs` | `test/regression-fresh-status.test.mjs` |
| [ISSUE-009](#ISSUE-009) | important | verified | `071d549` | `src/http.mjs` | `test/regression-no-stack-leak.test.mjs` |
| [ISSUE-010](#ISSUE-010) | important | deferred | - | - | - |
| [ISSUE-011](#ISSUE-011) | minor | deferred | - | - | - |
| [ISSUE-012](#ISSUE-012) | minor | deferred | - | - | - |
| [ISSUE-013](#ISSUE-013) | minor | deferred | - | - | - |

## What changed since the last run

_First run for this project: there is nothing to compare with yet._

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Key journeys tested | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 5 | 3 | 1 | 5/5 | 17 | 0 | 6 |

_No earlier run to compare with._

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and priced by the stated rules
- **Risk:** Money is calculated wrongly; invalid quantities accepted
- **Entry point:** POST /api/orders as a client
- **Expected results:** Quantity 1-1000 whole numbers, at least one item; total = (subtotal - discount) + tax with tax on the discounted subtotal
- **Exit condition:** Both sides of the 1,000.00 threshold and quantity boundaries checked

### C2: Roles and company isolation  `permissions`

- **Goal:** Clients see only their own company's data; only admins reach customers, reports and status changes
- **Risk:** Data exposure across companies or roles
- **Entry point:** GET /api/orders/{id}, /api/admin/* as clients and anonymous
- **Expected results:** 403/404 for other companies and roles
- **Exit condition:** Role matrix and a cross-company chain checked

### C3: Sign-in, sign-out and sessions  `api`

- **Goal:** Logout ends the session at once
- **Risk:** Token still works after sign-out
- **Entry point:** POST /api/auth/logout then GET /api/me
- **Expected results:** 401 after logout
- **Exit condition:** Same token tried after logout

### C4: Lists, search and paging  `api`

- **Goal:** Order lists page, filter and search safely and show fresh data
- **Risk:** Crashes on odd input; stale lists after changes
- **Entry point:** GET /api/orders with page, page_size, q, status
- **Expected results:** 400 for bad input; new and changed orders visible at once
- **Exit condition:** Edge values and warm-change-reread checked

### C5: Status change visible to the client  `cross`

- **Goal:** Admin status change shows to the client after reload
- **Risk:** Stale data
- **Entry point:** Client list, admin PATCH status, client list again
- **Expected results:** New status shown
- **Exit condition:** Warm, change, re-read sequence done

### C6: Client Portal critical flow  `ui`

- **Goal:** Place an order and find it in My Orders
- **Risk:** Flow blocked, wrong totals shown, RTL problems for the Urdu company
- **Entry point:** Client Portal login
- **Expected results:** Confirmation with the right total; order in My Orders
- **Exit condition:** Desktop and mobile with page audit

### C7: Admin Portal orders, detail, customers, reports  `ui`

- **Goal:** Admin finds orders, changes status, sees customers and reports
- **Risk:** Wrong figures, broken pages
- **Entry point:** Admin Portal login
- **Expected results:** Figures match the API
- **Exit condition:** All admin pages visited desktop and mobile

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Orders: any signed-in customer can open another company's order by its id

- **Surface:** permissions · **UI:** Client Portal · **Area:** Orders / access · **Type:** permissions
- **Roles:** bright-1, zain-1, acme-1
- **Browser / viewport:** Chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `a0994a2`)
- **Charter:** C2

GET /api/orders/{id} returns any order to any signed-in user; the company is never checked. Customers of Bright Foods and Zain Traders read an Acme Traders order.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-iso (product p-101, quantity 1); note the returned id
2. Sign in as bright-1 and GET /api/orders/{id} for that id (see evidence for the exact request)
3. Observe HTTP 200 with the Acme order; repeat as zain-1
4. In the Client Portal signed in as zain-1, open order.html?id=<that id>: the Acme order page is shown

**Expected:** HTTP 403 or 404 for a user of another company (business rule: different companies never see each other's data)

**Actual:** HTTP 200 with the full order (reference, items, totals) for bright-1 and zain-1

**Evidence**

- [evidence/api/rules-X03.json](evidence/api/rules-X03.json)
- [evidence/api/rules-X04.json](evidence/api/rules-X04.json)
- [screenshots/zain-sees-acme-order.png](screenshots/zain-sees-acme-order.png)

**Suspected root cause:** getOrder in src/api.mjs looks the order up by id only and does not compare order.client_id with the caller's client_id

**Proposed regression test:** Client of company B requests company A's order and expects 404; same-company user still gets 200 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `a0994a2` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/regression-order-isolation.test.mjs`
- Diagnosis before the fix: getOrder in src/api.mjs finds an order by id and returns it without comparing order.client_id to the caller's client_id. Non-admin users must get 404 for another company's order.
- Root cause: getOrder looked up the order by id only and never compared the order's company with the caller's company.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 404, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original steps against a freshly started copy of the app over real HTTP (the running demo was not restarted): acme1 reads o-1001 (200), bright1 and zain1 get 404 for the same id.
- Adjacent check: Same-company colleague (acme2) and admin still get 200 for o-1001; unknown id still returns 404 (existing test passes).

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Customers list with personal and card details is readable by every signed-in customer

- **Surface:** permissions · **Area:** Customers / access · **Type:** permissions
- **Roles:** bright-1, acme-1, acme-2, zain-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `24b7044`)
- **Charter:** C2

GET /api/admin/customers has no admin-only check: a client user receives every company's customer records, including national id, phone, address and card fields.

**Steps to reproduce**

1. Sign in over the API as bright-1
2. GET /api/admin/customers (see evidence)
3. Observe HTTP 200 with all customers; the matrix shows 200 for all four client roles and 401 only when anonymous

**Expected:** HTTP 403 (business rule: only admins can see customers)

**Actual:** HTTP 200 with the whole customer list for each client user

**Evidence**

- [evidence/api/rules-X07.json](evidence/api/rules-X07.json)

**Suspected root cause:** The /api/admin/customers route in src/api.mjs is registered without roles: ['admin']

**Proposed regression test:** Client requests the customers list and expects 403; admin still gets 200 (suggested location: `test/admin.test.mjs`)

**Fix: verified**

- Commit `24b7044` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/regression-customers-admin-only.test.mjs`
- Diagnosis before the fix: The GET /api/admin/customers route in src/api.mjs is registered with empty options, so the role check is skipped and any signed-in user gets all customer records. It needs roles: ['admin'] like the other admin routes.
- Root cause: The customers route was registered without roles, so the role check was skipped for every signed-in user.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 403, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated GET /api/admin/customers against a freshly started app over real HTTP: acme1, acme2, bright1 and zain1 get 403 with no items in the body, anonymous gets 401 (running demo not restarted).
- Adjacent check: Admin still gets 200 with a non-empty customers list; the Admin Portal Customers page uses this call with an admin sign-in.

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Orders: tax is charged on the full subtotal instead of the discounted subtotal

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / pricing · **Type:** business-rule
- **Roles:** acme-1
- **Browser / viewport:** Chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `eb323b1`)
- **Charter:** C1

For orders of 1,000.00 or more the 5% discount is applied but tax stays 10% of the undiscounted subtotal, so the customer is overcharged.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with product p-102 (12.50) quantity 80 (subtotal 1,000.00 exactly)
3. Observe tax_cents 10000 and total_cents 105000
4. Repeat with p-107 quantity 12 (subtotal 1,079.88): tax_cents 10799, total_cents 113388
5. In the Client Portal place the order Printer Toner Cartridge x 12: the confirmation says Total: $1,133.88

**Expected:** Rule: tax is 10% of the discounted subtotal. 1,000.00: discount 50.00, tax 95.00, total 1,045.00. 1,079.88: discount 53.99, tax 102.59, total 1,128.48

**Actual:** 1,000.00 gives total 1,050.00; 1,079.88 gives total 1,133.88 (tax 107.99)

**Evidence**

- [evidence/api/rules-R02.json](evidence/api/rules-R02.json)
- [evidence/api/rules-R03.json](evidence/api/rules-R03.json)
- [screenshots/client-order-confirmation.png](screenshots/client-order-confirmation.png)

**Suspected root cause:** priceOrder in src/pricing.mjs computes tax from subtotal rather than subtotal - discount

**Proposed regression test:** Price an order with subtotal 100000 and 107988 cents and expect tax of 10% of subtotal minus discount (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `eb323b1` on `feature/qa-eval`
- Production files: `src/pricing.mjs`
- Regression test: `test/regression-tax-after-discount.test.mjs`
- Diagnosis before the fix: priceOrder in src/pricing.mjs computes tax as 10% of the undiscounted subtotal. The rule says tax is applied to the discounted subtotal, so tax must be rounded from (subtotal - discount) * 0.1.
- Root cause: priceOrder computed tax from the undiscounted subtotal instead of subtotal minus discount.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 10259, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original orders against a freshly started app over real HTTP: 80 x p-102 now gives discount 5000, tax 9500, total 104500; 12 x p-107 gives tax 10259 and total 112848 (was 10799 / 113388). Running demo not restarted, so the portal confirmation was not re-viewed.
- Adjacent check: 79 x p-102 (below threshold, no discount) still gives tax 9875 and total 108625; the existing pricing tests are unchanged.

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Sign-out: the same sign-in still works after signing out

- **Surface:** api · **Area:** Auth / sessions · **Type:** auth
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `e405b59`)
- **Charter:** C3

POST /api/auth/logout returns 204 but the same bearer token still gets 200 from /api/me and /api/orders.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. POST /api/auth/logout and observe 204
3. Using the same token, GET /api/me and GET /api/orders (see evidence)
4. Observe HTTP 200 for both

**Expected:** HTTP 401 at once (rule: signing out ends the session at once)

**Actual:** HTTP 200 with the user and orders after sign-out

**Evidence**

- [evidence/api/rules-A02.json](evidence/api/rules-A02.json)
- [evidence/api/rules-A03.json](evidence/api/rules-A03.json)

**Suspected root cause:** logout only sets endedAt on the session; authenticate() in src/api.mjs checks neither endedAt nor expiresAt

**Proposed regression test:** Log in, log out, call /me with the same token and expect 401; an expired session also gets 401 (suggested location: `test/auth.test.mjs`)

**Fix: verified**

- Commit `e405b59` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/regression-session-end.test.mjs`
- Diagnosis before the fix: logout in src/api.mjs only stamps endedAt on the session, and authenticate() accepts any token present in the sessions map without checking endedAt or expiresAt. authenticate must reject ended and expired sessions.
- Root cause: authenticate accepted any token still in the sessions map and ignored the endedAt mark set by logout and the expiresAt time.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 401, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original steps against a freshly started app over real HTTP: login as zain1, logout (204), then GET /api/me and GET /api/orders with the same token both return 401 (were 200). A session created with a negative lifetime also gets 401. Running demo not restarted.
- Adjacent check: A fresh login after sign-out returns 200 on /api/me; a normal not-yet-signed-out token still works; existing auth tests unchanged.

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders: quantities that are negative, zero, above 1,000 or fractional and empty orders are accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `be4a85b`)
- **Charter:** C1

POST /api/orders creates orders with quantity -3, 0, 1001 and 1.5, and with an empty items list; a negative quantity gives a negative total.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items[0].quantity = -3 (product p-101); see evidence
3. Observe HTTP 201 and a total of -21.45 (shown in My orders as -$21.45)
4. Repeat with quantity 0, 1001, 1.5 and with items: []; each returns 201

**Expected:** HTTP 400 (rule: whole number from 1 to 1,000 and at least one item)

**Actual:** HTTP 201 in all five cases

**Evidence**

- [evidence/api/rules-R04.json](evidence/api/rules-R04.json)
- [evidence/api/baseline-client-P043.json](evidence/api/baseline-client-P043.json)
- [evidence/api/baseline-client-P044.json](evidence/api/baseline-client-P044.json)
- [evidence/api/baseline-client-P045.json](evidence/api/baseline-client-P045.json)
- [evidence/api/baseline-client-P046.json](evidence/api/baseline-client-P046.json)

**Suspected root cause:** validateOrderInput in src/api.mjs only checks that quantity is a number and does not require items to be non-empty

**Proposed regression test:** POST orders with quantity -3, 0, 1001, 1.5 and empty items and expect 400; quantity 1 and 1000 accepted (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `be4a85b` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/regression-order-quantity.test.mjs`
- Diagnosis before the fix: validateOrderInput in src/api.mjs only checks that quantity is a number and accepts an empty items array. It must require a whole number from 1 to 1000 per line and at least one line.
- Root cause: validateOrderInput only checked that quantity was a number and had no minimum item count, so out-of-range, fractional and empty orders were priced and stored.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 400, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original orders against a freshly started app over real HTTP: quantity -3, 0, 1001, 1.5 and items [] now return 400 with a field-level message and store nothing (were 201). Running demo not restarted.
- Adjacent check: Quantity 1 and 1000 still return 201; an existing multi-line order and the pricing tests still pass.

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Orders list: searching with brackets or a backslash makes the system fail

- **Surface:** api · **UI:** Admin Portal · **Area:** Orders / search · **Type:** search
- **Roles:** acme-1, admin
- **Browser / viewport:** Chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `5eff6bc`)
- **Charter:** C4

The search text q is used as a regular expression, so q=( or q=\ returns HTTP 500; the Admin Portal shows 'Could not load orders (500).'

**Steps to reproduce**

1. Sign in over the API as acme-1 and GET /api/orders?q=(
2. Observe HTTP 500
3. In the Admin Portal signed in as admin, type ( in Search reference or note and press Enter
4. Observe the message 'Could not load orders (500).'

**Expected:** The text is searched literally and the matching orders (or none) are returned

**Actual:** HTTP 500 for ( and \ on both roles

**Evidence**

- [evidence/api/baseline-client-P024.json](evidence/api/baseline-client-P024.json)
- [evidence/api/baseline-client-P028.json](evidence/api/baseline-client-P028.json)
- [screenshots/admin-search-paren.png](screenshots/admin-search-paren.png)

**Suspected root cause:** listOrders in src/api.mjs builds new RegExp(q) from user input

**Proposed regression test:** GET /orders?q=( returns 200 and matches an order whose reference contains a bracket (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `5eff6bc` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/regression-order-search.test.mjs`
- Diagnosis before the fix: listOrders in src/api.mjs builds new RegExp(q) from the search text, so unbalanced characters throw and return 500. The search should be a case-insensitive literal substring match on reference and note.
- Root cause: listOrders built a RegExp from the user's search text, so unbalanced characters threw and became a 500.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 1, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated GET /api/orders?q=( and q=\ against a freshly started app over real HTTP: both return 200 (were 500), and an order with reference QA-(a)[b]\c.d is found by its literal text. Admin Portal search box not re-viewed (demo not restarted).
- Adjacent check: Case-insensitive search for PO-44 still finds orders, a dot is no longer a wildcard, and the existing bf-22 search test passes.

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Orders list: a page size of 0 fails and a negative page size is accepted

- **Surface:** api · **Area:** Orders / paging · **Type:** pagination
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `9580a8d`)
- **Charter:** C4

GET /api/orders?page_size=0 returns HTTP 500 and page_size=-1 returns 200 with page_size -1, although the spec requires 1 to 100.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?page_size=0 and observe HTTP 500
3. GET /api/orders?page_size=-1 and observe HTTP 200 with page_size -1

**Expected:** HTTP 400 for page_size below 1 (spec: 1 to 100)

**Actual:** HTTP 500 for 0; HTTP 200 for -1

**Evidence**

- [evidence/api/baseline-client-P019.json](evidence/api/baseline-client-P019.json)
- [evidence/api/baseline-client-P020.json](evidence/api/baseline-client-P020.json)

**Suspected root cause:** parseListQuery in src/api.mjs checks only the upper bound of page_size

**Proposed regression test:** page_size=0 and -1 return 400; page_size=1 and 100 return 200 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `9580a8d` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/regression-page-size.test.mjs`
- Diagnosis before the fix: parseListQuery in src/api.mjs only checks the upper bound of page_size, so 0 reaches paginate and throws (500) and negative values are echoed back. It must require an integer from 1 to 100.
- Root cause: parseListQuery checked only the upper bound of page_size, so 0 crashed paginate and negative values passed through.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 400, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated GET /api/orders?page_size=0 and page_size=-1 against a freshly started app over real HTTP: both return 400 naming the page_size field (were 500 and 200).
- Adjacent check: page_size=1 returns one item and page_size=100 returns 200; existing page and page_size=101 tests still pass.

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Orders: customers keep seeing an old status after an admin changes it

- **Surface:** cross · **Area:** Orders / status · **Type:** stale-data
- **Roles:** bright-1, admin
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `2466016`)
- **Charter:** C5

A client's order list is cached for 10 minutes; a status change made by an admin is not shown in the list, while the order's own page is correct.

**Steps to reproduce**

1. Sign in over the API as bright-1, POST /api/orders (QA-stale-status) and GET /api/orders?q=QA-stale-status: status placed
2. As admin PATCH /api/admin/orders/{id}/status to processing
3. GET /api/orders?q=QA-stale-status as bright-1 again: still placed, while GET /api/orders/{id} says processing (see evidence)

**Expected:** The list shows processing at once (flow 3: the client reloads and sees the new status)

**Actual:** The list shows placed; the order page shows processing

**Evidence**

- [evidence/api/stale-T02.json](evidence/api/stale-T02.json)
- [evidence/api/stale-T04.json](evidence/api/stale-T04.json)
- [evidence/api/stale-T05.json](evidence/api/stale-T05.json)

**Suspected root cause:** listClientOrders in src/api.mjs caches copies of order rows for 10 minutes and the cache is cleared only when an order is added, not when a status changes

**Proposed regression test:** Client warms the list, admin changes status, client list shows the new status (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `2466016` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/regression-fresh-status.test.mjs`
- Diagnosis before the fix: listClientOrders in src/api.mjs caches copies of a company's order rows for 10 minutes and the cache is cleared only when an order is added, so a status change by an admin is not visible in the client list. The list must read the live orders.
- Root cause: listClientOrders served a 10-minute cache of copied order rows that was cleared only when an order was added, never when a status changed.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 'processing', ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original sequence against a freshly started app over real HTTP: bright1 creates an order and warms the list (placed), admin sets processing, bright1's list, the status=processing filter and the order page all show processing (list showed placed before).
- Adjacent check: acme1's list still contains only Acme orders; a newly created order still appears in the creator's list at once (existing test passes); the list is sorted on a copy so live orders are not reordered.

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Malformed requests return internal technical details

- **Surface:** api · **Area:** Errors / leakage · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `071d549`)
- **Charter:** C1

A request with invalid JSON returns 400 with a stack trace and server file paths in the body.

**Steps to reproduce**

1. POST /api/auth/login with the raw body {not json
2. Observe HTTP 400 whose body contains a stack field with server file paths
3. Repeat on POST /api/orders as acme-1

**Expected:** A short error message without stack or paths

**Actual:** Body includes stack trace lines and source file paths

**Evidence**

- [evidence/api/baseline-client-P007.json](evidence/api/baseline-client-P007.json)
- [evidence/api/baseline-client-P048.json](evidence/api/baseline-client-P048.json)

**Suspected root cause:** readJsonBody or sendError in src/http.mjs puts the error's stack into the response

**Proposed regression test:** POST malformed JSON and expect 400 with no stack field and no file path (suggested location: `test/auth.test.mjs`)

**Fix: verified**

- Commit `071d549` on `feature/qa-eval`
- Production files: `src/http.mjs`
- Regression test: `test/regression-no-stack-leak.test.mjs`
- Diagnosis before the fix: readJsonBody in src/http.mjs puts err.stack in the error's extra data as trace, and sendError spreads it into the response, so a malformed JSON body returns a stack trace and file paths. The response must carry only a short message.
- Root cause: readJsonBody attached err.stack as trace and used the parser's message, and sendError spreads that extra data into the response body.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: undefined, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the malformed-body requests (login with {not json, create order with a truncated body) against a freshly started app over real HTTP: both return 400 invalid_json with the message 'Request body is not valid JSON' and no trace, stack or file path (before: stack and paths).
- Adjacent check: A well-formed login body with unknown credentials still returns 401 invalid_credentials; empty and over-size body handling is untouched.

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: Orders: the same order sent twice at once is created twice

- **Surface:** api · **Area:** Orders / duplicates · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** deferred
- **Charter:** C1

Two identical POST /api/orders sent in parallel both return 201 and create two orders. We could not tell whether the product intends this; it was not tested whether the Place order button blocks a double click.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send the same POST /api/orders twice in parallel
3. Observe two 201 responses and two orders in My orders

**Expected:** Likely one order for one submission, or a clear duplicate warning (unsure: no idempotency rule is stated)

**Actual:** Two orders with the same reference and items

**Evidence**

- [evidence/api/baseline-client-P049.json](evidence/api/baseline-client-P049.json)

**Suspected root cause:** createOrder in src/api.mjs has no duplicate guard

**Proposed regression test:** Two identical parallel submissions create one order (suggested location: `test/orders.test.mjs`)

**Fix: deferred**

- Why it was not fixed: needs-decision: No rule says whether two identical orders are duplicates; refusing or merging them is a product decision (idempotency key, reference uniqueness, or UI double-click guard).

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: My orders on a phone: the filter bar covers the table header and first row, and Total is cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** My orders / layout · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** deferred
- **Charter:** C6

At 390px width the Status filter and New order button overlap the first rows of the table, and the Total column sits beyond the right edge.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 at 390x844
2. Open My orders
3. Observe the filter bar over the table header and first row, and the Total column partly cut off

**Expected:** The filter bar and table do not overlap; totals are readable

**Actual:** Header and first row are hidden under the filter bar; totals clipped

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)
- [evidence/ui-mobile-my-orders.txt](evidence/ui-mobile-my-orders.txt)

**Suspected root cause:** Toolbar and table wrapper layout in public/client/client.css at narrow widths

**Proposed regression test:** Layout check at 390px that the toolbar does not overlap the table (suggested location: `test/ui-layout.test.mjs`)

**Fix: deferred**

- Why it was not fixed: below-severity: Minor layout problem; the fix policy covers critical and important only.

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Some controls have no accessible name (admin refresh and clear buttons, search box, product dropdown)

- **Surface:** ui · **UI:** Admin Portal · **Area:** Accessibility · **Type:** accessibility
- **Roles:** admin, acme-1
- **Browser / viewport:** Chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** deferred
- **Charter:** C7

The Admin Portal Orders page has two icon buttons and a search box without names, and the Client Portal product dropdown has no name.

**Steps to reproduce**

1. Sign in to the Admin Portal as admin and open Orders
2. Run the page audit at 1366x768: refresh and clear-filters buttons and the search box are listed as unnamed
3. Open New order in the Client Portal: the product dropdown has no name

**Expected:** Every control has a name that screen-reading software can announce

**Actual:** Controls unnamed

**Evidence**

- [evidence/ui-unnamed-controls.txt](evidence/ui-unnamed-controls.txt)

**Suspected root cause:** Missing aria-label or label elements in public/admin/orders.html and public/client/new-order.js

**Proposed regression test:** Static check that every button and select has an accessible name (suggested location: `test/ui-a11y.test.mjs`)

**Fix: deferred**

- Why it was not fixed: below-severity: Minor accessibility labelling; the fix policy covers critical and important only.

<a id="ISSUE-013"></a>

### ISSUE-013 🟡 Minor: Reports: the sales summary takes about 4 seconds to load

- **Surface:** api · **Area:** Reports / speed · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** deferred
- **Charter:** C7

GET /api/admin/reports/sales answered in 4005 ms and 4002 ms with only 48 orders (limit used: 3000 ms).

**Steps to reproduce**

1. Sign in over the API as admin
2. GET /api/admin/reports/sales
3. Observe about 4 seconds; open Reports in the Admin Portal and wait for the figures

**Expected:** Answer within about 3 seconds

**Actual:** About 4 seconds

**Evidence**

- [evidence/api/baseline-admin-P061.json](evidence/api/baseline-admin-P061.json)
- [evidence/api/baseline-admin-P093.json](evidence/api/baseline-admin-P093.json)

**Suspected root cause:** A configured delay (latency.salesReportMs) or slow aggregation in salesReport in src/api.mjs; not verified

**Proposed regression test:** Sales report responds within the agreed limit on the seed data (suggested location: `test/admin.test.mjs`)

**Fix: deferred**

- Why it was not fixed: below-severity: Minor slowness; the fix policy covers critical and important only, and the delay may be a configured demo latency.

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Password reset email may contain a broken link** (api, tried 0×): Reading src/api.mjs, the reset link is built from user.resetToken, which is never set (the token created is resetToken in a local variable), so the link would end in token=undefined. Not observed: no mail catcher is configured for this run. Why unconfirmed: Found by reading the source only; the email could not be read, so it was not reproduced

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in | acme-1 | desktop | #1 | ✅ tested |  |
| ui | New order and confirmation | acme-1 | desktop | #1 | ✅ tested | total shown is wrong (tax) |
| ui | My orders list | acme-1 | desktop | #1 | ✅ tested |  |
| ui | My orders list | acme-1 | mobile | #1 | ✅ tested |  |
| ui | My orders list (Urdu company) | zain-1 | mobile | - | ✅ tested |  |
| ui | Order details | acme-1 | desktop | #3 | ✅ tested |  |
| cross | Client sees the new status after the admin changes it | bright-1 | desktop | #3 | ✅ tested | checked through the API; list shows an old status |
| ui | Sign out | acme-1 | desktop | #5 | ✅ tested | screen returns to sign in; the old sign-in still works behind the screens |
| api | Sign out and sessions | zain-1 | - | #5 | ✅ tested |  |
| ui | Sign in | admin | desktop | #2 | ✅ tested |  |
| ui | Orders list and search | admin | desktop | #2 | ✅ tested |  |
| ui | Orders list | admin | mobile | - | ✅ tested |  |
| ui | Order details and status change | admin | desktop | #2 | ✅ tested |  |
| ui | Customers | admin | mobile | - | ✅ tested |  |
| ui | Reports | admin | desktop | #4 | ✅ tested | figures agree with counts; slow to load |
| api | All documented endpoints (baseline plans, role matrix) | admin | - | - | ✅ tested |  |
| api | Company isolation, pricing rules, status changes | acme-1 | - | - | ✅ tested |  |
| api | Password reset endpoints | - | - | - | ⛔ not tested | side effect |
| ui | Password reset pages | - | - | - | ⛔ not tested |  |

## Not tested

_Nothing here is reported as passing._

- **Password reset endpoints**: Excluded as a possible side effect (sends email) and no mail catcher is configured to read it
- **Password reset pages**: Needs the reset email, which cannot be read in this run
- **Admin Portal / Export CSV**: Not covered: file download was not exercised in this run
- **Client Portal / form edge cases in the UI (double click, very long text, special characters, Urdu text)**: Not covered in the browser; the same rules were checked through the API only (double send, quantity limits)
- **Admin Portal / mobile view of order page, customers and reports**: Mobile audit was run on Orders and Customers only; order page and Reports were not viewed at 390px
- **Expired sessions**: The session lifetime is not shortened in this environment, so expiry could not be reached

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| baseline-admin | 100 | 85 | 8 | 11 | [data/api-results/baseline-admin.json](data/api-results/baseline-admin.json) |
| baseline-client | 64 | 52 | 12 | 21 | [data/api-results/baseline-client.json](data/api-results/baseline-client.json) |
| prod | 1 | 1 | 0 | 0 | [data/api-results/prod.json](data/api-results/prod.json) |
| rules | 22 | 14 | 8 | 11 | [data/api-results/rules-2.json](data/api-results/rules-2.json) |
| rules | 22 | 13 | 9 | 12 | [data/api-results/rules.json](data/api-results/rules.json) |
| stale | 5 | 4 | 1 | 1 | [data/api-results/stale.json](data/api-results/stale.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

_No project memory was applied (first run, or memory held nothing relevant)._

**Saved this run**

- New learning L-001: Routes are protected one by one through the roles option and per-handler checks, so new routes and by-id lookups tend to miss company or admin checks; test every id route and admin route as another company and as a client.
- New learning L-002: A stale client order list only shows after warming the list first, then changing the status as admin, then re-reading with a status filter; creating an order clears the cache, so a read after a create looks fine.
- New learning L-003: Regression tests here are new files under test/ using startTestApp, login and call from test/helpers.mjs against a real HTTP instance; startTestApp accepts options such as sessionTtlSeconds to force expiry.
- New learning L-004: The running demo server keeps old code after fixes until it is restarted, so after a fix the live portals still show the old behaviour; verify fixes with a fresh test instance or restart the demo. Sales report takes about 4 seconds.
- Flagged risk area Auth / password reset: Auth / password reset (important): Reset email link is built from a field that is never set; not verified because no mail catcher was readable.

**Memory after the run**

- Product map: 9 page(s) and 13 endpoint(s) known.
- Risk areas: 5 area(s) tracked; highest now: Auth / password reset (score 4).
- Learnings: 4 new, 0 confirmed again, 0 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Client of company B requests company A's order and expects 404; same-company user still gets 200 → `test/orders.test.mjs`
- **ISSUE-002**: Client requests the customers list and expects 403; admin still gets 200 → `test/admin.test.mjs`
- **ISSUE-003**: Price an order with subtotal 100000 and 107988 cents and expect tax of 10% of subtotal minus discount → `test/orders.test.mjs`
- **ISSUE-004**: Log in, log out, call /me with the same token and expect 401; an expired session also gets 401 → `test/auth.test.mjs`
- **ISSUE-005**: POST orders with quantity -3, 0, 1001, 1.5 and empty items and expect 400; quantity 1 and 1000 accepted → `test/orders.test.mjs`
- **ISSUE-006**: GET /orders?q=( returns 200 and matches an order whose reference contains a bracket → `test/orders.test.mjs`
- **ISSUE-007**: page_size=0 and -1 return 400; page_size=1 and 100 return 200 → `test/orders.test.mjs`
- **ISSUE-008**: Client warms the list, admin changes status, client list shows the new status → `test/orders.test.mjs`
- **ISSUE-009**: POST malformed JSON and expect 400 with no stack field and no file path → `test/auth.test.mjs`
- **ISSUE-010**: Two identical parallel submissions create one order → `test/orders.test.mjs`
- **ISSUE-011**: Layout check at 390px that the toolbar does not overlap the table → `test/ui-layout.test.mjs`
- **ISSUE-012**: Static check that every button and select has an accessible name → `test/ui-a11y.test.mjs`
- **ISSUE-013**: Sales report responds within the agreed limit on the seed data → `test/admin.test.mjs`
