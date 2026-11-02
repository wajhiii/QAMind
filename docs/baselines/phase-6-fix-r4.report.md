# QAMind Technical Report: run-20261102T070403Z

| | |
|---|---|
| Date (UTC) | 2026-11-02T07:04:03.761Z |
| Project | ws (path-ws-e1b1de54f963) |
| Environment | local demo |
| Branch / commit | feature/qa-eval @ 285d5cb |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 6m 16s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (16 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (6 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **3**   🟡 Minor: **0**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **3**
- API probes executed: **23** (24 produced a signal worth a look)

## Fix run

- **Branch:** `feature/qa-eval`, started from commit `285d5cb` on `main`. The commits are local to this branch: **nothing was pushed or merged.** A developer must review and merge them.
- **Outcome:** 8 fixed and verified · 0 best-effort (a person must confirm) · 0 reverted · 0 deferred · 0 not attempted
- **Test suite:** before any fix: passed (`npm test`, 0.4 s) · after the fixes: passed (`npm test`, 0.6 s) · no regression: The full test suite passes.
- **Limits:** at most 30 fixes; severities fixed: critical, important; reverts so far: 0
- **Stops and what the user said:** pause: The owner read the summary of the first five fixes and said to go on with the remaining fixes.
- **Reports from before any fix:** [BASELINE-TECHNICAL-REPORT.md](BASELINE-TECHNICAL-REPORT.md), [BASELINE-ADMIN-REPORT.md](BASELINE-ADMIN-REPORT.md)

| Issue | Severity | Outcome | Commit | Production files | Regression test |
|---|---|---|---|---|---|
| [ISSUE-001](#ISSUE-001) | critical | verified | `63cd747` | `src/pricing.mjs` | `test/qa-issue-001-pricing.test.mjs` |
| [ISSUE-002](#ISSUE-002) | critical | verified | `57b2676` | `src/api.mjs` | `test/qa-issue-002-quantity.test.mjs` |
| [ISSUE-003](#ISSUE-003) | critical | verified | `96c85d6` | `src/api.mjs` | `test/qa-issue-003-order-isolation.test.mjs` |
| [ISSUE-004](#ISSUE-004) | critical | verified | `eec7bb6` | `src/api.mjs` | `test/qa-issue-004-customers-access.test.mjs` |
| [ISSUE-005](#ISSUE-005) | critical | verified | `9ebf43e` | `src/api.mjs` | `test/qa-issue-005-logout.test.mjs` |
| [ISSUE-006](#ISSUE-006) | important | verified | `d0d577a` | `src/api.mjs` | `test/qa-issue-006-status-cache.test.mjs` |
| [ISSUE-007](#ISSUE-007) | important | verified | `a8a5938` | `src/api.mjs` | `test/qa-issue-007-search.test.mjs` |
| [ISSUE-008](#ISSUE-008) | important | verified | `dc6981a` | `src/api.mjs` | `test/qa-issue-008-page-size.test.mjs` |

## What changed since the last run

_First run for this project: there is nothing to compare with yet._

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Key journeys tested | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 3 | 0 | 1 | 3/5 | 4 | 3 | 3 |

_No earlier run to compare with._

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and priced by the stated rules
- **Risk:** Money wrong; invalid quantities accepted
- **Entry point:** POST /api/orders as a client
- **Expected results:** Quantity 1..1000 whole; total = subtotal - 5% (>=1000) + 10% tax on discounted subtotal
- **Exit condition:** Both sides of the 1,000.00 threshold and quantity boundaries checked

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients see only their company's data; admin-only endpoints refuse clients
- **Risk:** Data exposure
- **Entry point:** GET /api/orders/{id}, GET /api/admin/customers, GET /api/orders as each role
- **Expected results:** 403/404 for other tenants and non-admins
- **Exit condition:** Every id-based and admin endpoint probed as each role

### C3: Sessions and sign-out  `api`

- **Goal:** Sign-out ends the session at once
- **Risk:** Session reuse after logout
- **Entry point:** POST /api/auth/logout then GET /api/me
- **Expected results:** 401 after logout
- **Exit condition:** Same token reused after logout

### C4: Status change visible to client  `cross`

- **Goal:** Admin status change shows when client reloads
- **Risk:** Stale cached order lists
- **Entry point:** Client list (warm), admin PATCH status, client list again
- **Expected results:** New status shown
- **Exit condition:** List and detail both re-read

### C5: List paging and search  `api`

- **Goal:** Odd page_size and search text are handled
- **Risk:** 500 errors
- **Entry point:** GET /api/orders?page_size=0&q=(
- **Expected results:** 400 or safe results
- **Exit condition:** Edge values checked

### C6: Password reset  `api`

- **Goal:** Reset link works
- **Risk:** Broken link
- **Entry point:** POST /api/auth/forgot-password
- **Expected results:** Link contains a valid token
- **Exit condition:** Not sent beyond local mail catcher; may be Not tested

### C7: Client and Admin portal critical flows and layout  `ui`

- **Goal:** Critical flows 1-5 work in the browser on desktop and mobile
- **Risk:** Broken flows, RTL issues
- **Entry point:** Client Portal and Admin Portal
- **Expected results:** Flows complete; layout fine
- **Exit condition:** Each flow and page visited

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Tax is calculated on the undiscounted subtotal, overcharging orders of 1,000.00 or more

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / pricing · **Type:** business-rule
- **Roles:** acme-1, admin
- **Browser / viewport:** desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `63cd747`)
- **Charter:** C1

For an order at or above the discount threshold the 10% tax is applied to the subtotal before the 5% discount instead of after it, so the total is too high.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with reference QA-thresh and items [{product_id p-102, quantity 80}] (subtotal 1000.00)
3. Observe tax_cents 10000 and total_cents 105000

**Expected:** discount 50.00, tax 95.00 (10% of 950.00), total 1,045.00

**Actual:** discount 50.00, tax 100.00, total 1,050.00 (also shown in the Client Portal confirmation and the Admin Portal order page)

**Evidence**

- [evidence/api/rules-R01.json](evidence/api/rules-R01.json)
- [screenshots/client-order-confirmation-total.png](screenshots/client-order-confirmation-total.png)

**Suspected root cause:** src/pricing.mjs computes tax from subtotal rather than subtotal minus discount

**Proposed regression test:** Price an 80 x 12.50 order and expect tax 95.00 and total 1,045.00 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `63cd747` on `feature/qa-eval`
- Production files: `src/pricing.mjs`
- Regression test: `test/qa-issue-001-pricing.test.mjs`
- Diagnosis before the fix: priceOrder in src/pricing.mjs computes tax from the undiscounted subtotal. Tax must be 10% of subtotal minus discount.
- Root cause: priceOrder computed tax as 10% of the undiscounted subtotal instead of subtotal minus discount.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 9500, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original probe in-process (POST /api/orders, 80 x p-102 as Acme): 201, discount 5000, tax 9500, total 104500 (was 10000 and 105000).
- Adjacent check: Order just below the threshold (79 x p-102) still has no discount, tax 9875 and total 108625.

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Order quantities are not checked: negative, zero, over 1,000, fractional and empty orders are accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `57b2676`)
- **Charter:** C1

POST /api/orders accepts quantity -3, 0, 1001 and 1.5, and an empty items list, creating orders with wrong or negative totals.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with quantity -3 (see evidence), then with 0, 1001, 1.5 and with items []
3. Observe HTTP 201 each time

**Expected:** HTTP 400: quantity must be a whole number from 1 to 1000 and at least one item is required

**Actual:** HTTP 201; orders created (negative quantity gives a negative total)

**Evidence**

- [evidence/api/rules-R03.json](evidence/api/rules-R03.json)
- [evidence/api/rules-R04.json](evidence/api/rules-R04.json)
- [evidence/api/rules-R05.json](evidence/api/rules-R05.json)
- [evidence/api/rules-R06.json](evidence/api/rules-R06.json)
- [evidence/api/rules-R07.json](evidence/api/rules-R07.json)

**Suspected root cause:** validateOrderInput in src/api.mjs only checks that quantity is a number and does not check range, integrality or a non-empty items list

**Proposed regression test:** POST orders with quantity -3, 0, 1001, 1.5 and empty items and expect 400 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `57b2676` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-issue-002-quantity.test.mjs`
- Diagnosis before the fix: validateOrderInput in src/api.mjs only checks that quantity is a number and accepts an empty items array. It must require a whole quantity from 1 to 1000 and at least one item.
- Root cause: validateOrderInput only checked that quantity was a number and never required a non-empty items list.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 400, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original probes in-process as Acme: quantity -3, 0, 1001, 1.5 and items [] each return 400 validation_error (previously 201).
- Adjacent check: Quantities 1 and 1000 (the boundaries) are still accepted with 201.

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: A customer can read another company's order by its number

- **Surface:** permissions · **Area:** Orders / tenant isolation · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `96c85d6`)
- **Charter:** C2

GET /api/orders/{id} returns any order to any signed-in user, including one belonging to a different company.

**Steps to reproduce**

1. Sign in as acme-1 and place an order, note its id
2. Sign in as bright-1 (a different company)
3. GET /api/orders/<that id>
4. Observe HTTP 200 with the Acme order

**Expected:** HTTP 404 (or 403)

**Actual:** HTTP 200 with the other company's order

**Evidence**

- [evidence/api/rules-I01.json](evidence/api/rules-I01.json)

**Suspected root cause:** getOrder in src/api.mjs does not compare order.client_id with the caller's client_id

**Proposed regression test:** Client of company B requests company A's order and expects 404 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `96c85d6` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-issue-003-order-isolation.test.mjs`
- Diagnosis before the fix: getOrder in src/api.mjs returns any order by id without comparing the order's client_id with the caller's. Non-admin callers must get 404 for another company's order.
- Root cause: getOrder looked up any order by id and never compared the order's client_id with the caller's company.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 404, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original steps in-process: Acme places an order, Bright GETs it by id and now gets 404 (previously 200 with the order).
- Adjacent check: The same order is still returned with 200 to the Acme user, a second Acme user and the admin.

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Clients can list all customers through the admin customers endpoint

- **Surface:** permissions · **Area:** Customers / role isolation · **Type:** permissions
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `eec7bb6`)
- **Charter:** C2

GET /api/admin/customers has no admin-only restriction, so a client account receives the full customer list.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/admin/customers
3. Observe HTTP 200 with customer records

**Expected:** HTTP 403

**Actual:** HTTP 200 with the customers list

**Evidence**

- [evidence/api/rules-I02.json](evidence/api/rules-I02.json)

**Suspected root cause:** The route in src/api.mjs is registered without roles: ['admin']

**Proposed regression test:** Client requests /api/admin/customers and expects 403 (suggested location: `test/admin.test.mjs`)

**Fix: verified**

- Commit `eec7bb6` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-issue-004-customers-access.test.mjs`
- Diagnosis before the fix: The GET /api/admin/customers route in src/api.mjs is registered without roles: ['admin'], so clients can list every customer. Restrict it to admins like the other admin routes.
- Root cause: The customers route was registered without the admin role restriction that the other admin routes have.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 403, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.3 s)
- Re-check of the original steps: Repeated the original probe in-process: Acme client GET /api/admin/customers now returns 403 (previously 200 with the list).
- Adjacent check: The admin account still gets 200 with a non-empty customers list.

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Signing out does not end the session: the old sign-in still works

- **Surface:** api · **Area:** Auth / sessions · **Type:** auth
- **Roles:** bright-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `9ebf43e`)
- **Charter:** C3

After POST /api/auth/logout returns 204 the same bearer token still gets 200 on /api/me and /api/orders.

**Steps to reproduce**

1. Sign in as bright-1 over the API
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. Observe HTTP 200

**Expected:** HTTP 401 after logout

**Actual:** HTTP 200; the session remains usable

**Evidence**

- [evidence/api/rules-S02.json](evidence/api/rules-S02.json)
- [evidence/api/rules-S03.json](evidence/api/rules-S03.json)

**Suspected root cause:** logout only sets session.endedAt, and authenticate in src/api.mjs never checks endedAt (or expiresAt)

**Proposed regression test:** Log in, log out, then GET /api/me with the same token and expect 401 (suggested location: `test/auth.test.mjs`)

**Fix: verified**

- Commit `9ebf43e` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-issue-005-logout.test.mjs`
- Diagnosis before the fix: logout in src/api.mjs only sets session.endedAt and authenticate never checks it, so a signed-out token keeps working. authenticate must treat a session with endedAt as unauthenticated.
- Root cause: logout only marked session.endedAt and authenticate never checked it, so the signed-out token kept working.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 401, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original steps in-process: login as Bright, logout 204, then GET /api/me and GET /api/orders with the same token both return 401 (previously 200).
- Adjacent check: A second sign-in of the same user (a different token) still works after the first is signed out.

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: A client's order list keeps showing the old status after an admin changes it

- **Surface:** cross · **Area:** Orders / cache · **Type:** stale-data
- **Roles:** admin, acme-2
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `d0d577a`)
- **Charter:** C4

Client order lists are cached for 10 minutes per company, and status changes do not clear the cache.

**Steps to reproduce**

1. As acme-2 GET /api/orders?q=QA-thresh (warms the cache)
2. As admin PATCH /api/admin/orders/<id>/status to processing (200)
3. As acme-2 GET the same list again
4. Observe status placed

**Expected:** status processing

**Actual:** status placed until the cache expires or a new order is placed

**Evidence**

- [evidence/api/rules-A03.json](evidence/api/rules-A03.json)
- [evidence/api/rules-A02.json](evidence/api/rules-A02.json)

**Suspected root cause:** listClientOrders caches copies of orders for 10 minutes and updateOrderStatus does not invalidate store.orderCache

**Proposed regression test:** Warm client list, admin changes status, client list shows the new status (suggested location: `test/admin.test.mjs`)

**Fix: verified**

- Commit `d0d577a` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-issue-006-status-cache.test.mjs`
- Diagnosis before the fix: listClientOrders caches copies of a company's orders for 10 minutes and updateOrderStatus never invalidates that cache. updateOrderStatus must clear the order's company cache entry.
- Root cause: updateOrderStatus changed the order but never invalidated the company's cached order list (10 minute cache).
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 'processing', ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original steps in-process: Acme2 list loaded (placed), admin PATCH to processing (200), Acme2 list and order detail now show processing (previously placed).
- Adjacent check: Bright's order list still loads with 200 and only Bright's orders.

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Searching orders with characters such as ( or * makes the system fail

- **Surface:** api · **Area:** Orders / search · **Type:** robustness
- **Roles:** admin, acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `a8a5938`)
- **Charter:** C5

The q search text is compiled as a regular expression, so invalid patterns return HTTP 500.

**Steps to reproduce**

1. Sign in as admin over the API
2. GET /api/orders?q=*
3. Observe HTTP 500

**Expected:** HTTP 200 with a literal text match

**Actual:** HTTP 500 for q=* and q=( 

**Evidence**

- [evidence/api/rules-P03.json](evidence/api/rules-P03.json)
- [evidence/api/rules-P04.json](evidence/api/rules-P04.json)

**Suspected root cause:** listOrders in src/api.mjs builds new RegExp(q) from user input

**Proposed regression test:** Search with q=( and q=* returns 200 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `a8a5938` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-issue-007-search.test.mjs`
- Diagnosis before the fix: listOrders in src/api.mjs builds new RegExp(q) from user input, so invalid patterns throw and return 500. The search must match the text literally and case-insensitively.
- Root cause: listOrders compiled the user's search text with new RegExp, so invalid patterns threw and returned 500.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 0, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original probes in-process as admin: q=(, q=*, q=[ and q=\ now return 200 (previously 500).
- Adjacent check: Searching the exact reference "qa-search (a*b)" in lower case finds the one matching order, and "QA.search" matches nothing.

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Order list page size of 0 crashes the system and negative sizes are accepted

- **Surface:** api · **Area:** Orders / pagination · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Fix outcome:** verified (commit `dc6981a`)
- **Charter:** C5

page_size=0 returns 500 and page_size=-5 returns 200 although the contract says 1 to 100.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?page_size=0
3. Observe HTTP 500; then page_size=-5 gives 200

**Expected:** HTTP 400 for page_size outside 1 to 100

**Actual:** HTTP 500 (0) and HTTP 200 (-5)

**Evidence**

- [evidence/api/rules-P01.json](evidence/api/rules-P01.json)
- [evidence/api/rules-P02.json](evidence/api/rules-P02.json)

**Suspected root cause:** parseListQuery in src/api.mjs checks only pageSize > 100, not pageSize < 1

**Proposed regression test:** page_size 0 and -5 return 400 (suggested location: `test/orders.test.mjs`)

**Fix: verified**

- Commit `dc6981a` on `feature/qa-eval`
- Production files: `src/api.mjs`
- Regression test: `test/qa-issue-008-page-size.test.mjs`
- Diagnosis before the fix: parseListQuery in src/api.mjs only rejects page_size above 100, so 0 reaches paginate and crashes with 500 and negatives are accepted. It must require page_size from 1 to 100.
- Root cause: parseListQuery only rejected page_size above 100, so 0 caused a crash in paginate and negatives were accepted.
- Test with the fix taken out: **failed** (exit 1), as it must: `    expected: 400, ⏎     operator: 'strictEqual' ⏎   }`
- Test with the fix in: **passed** (exit 0, 0.2 s)
- Re-check of the original steps: Repeated the original probes in-process as Acme: page_size=0 and page_size=-5 now return 400 (previously 500 and 200).
- Adjacent check: page_size=1 returns one item and page_size=100 returns 200; 101 and 1.5 still return 400.

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Password reset email link may contain an undefined token** (api, tried 0×): Reading src/api.mjs, the reset link uses user.resetToken (never set) instead of the generated token. Not exercised because the flow sends email. Why unconfirmed: Read from source only; not run twice

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in, New order, confirmation, My orders | acme-1 | desktop | #1 | ✅ tested | order placed, found in list |
| ui | My orders mobile | acme-1 | mobile | - | ◐ partial | audit leads on covered elements not judged as findings |
| ui | Orders list, order page, status update | admin | desktop | #2 | ✅ tested | status moved to processing |
| cross | Client sees new status | acme-2 | - | #3 | ◐ partial | API only, found stale |
| ui | Reports | admin | desktop | #4 | ◐ partial | page loaded; figures not verified |
| api | Sign out and session reuse | bright-1 | - | #5 | ✅ tested | API |
| api | Orders, pricing, validation, isolation, paging, search | acme-1 | - | - | ✅ tested | rules plan |

## Not tested

_Nothing here is reported as passing._

- **Client Portal / password reset**: Excluded as a possible email side effect; not exercised end to end
- **Admin Portal / Customers page and other pages, mobile and Urdu (RTL) layout**: Not covered in this pass: browser checks were limited to the critical flow pages; the Zain Traders Urdu account and mobile layouts of most pages were not visited
- **Client Portal / My orders after status change (browser reload)**: Checked through the API only; not repeated in the browser

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| rules | 23 | 8 | 15 | 24 | [data/api-results/rules.json](data/api-results/rules.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

_No project memory was applied (first run, or memory held nothing relevant)._

**Saved this run**

- New learning L-001: This product tends to miss server-side checks: detail endpoints skip company ownership, list routes skip role restriction, and input ranges are not enforced. Probe each id and admin route as another company and as a client.
- New learning L-002: Regression tests go in new files under test/ using startTestApp, login and call from test/helpers.mjs (in-process app, no live server). Existing tests stay untouched; npm test picks the new files up. Error bodies look like {error:{code,message}}.
- New learning L-003: Client order lists are cached per company for 10 minutes: load the client list first, change the order as admin, then reload the list, otherwise stale data is missed. Other writes may bypass cache invalidation too.
- New learning L-004: The demo servers do not reload code, so fixes are only visible in the browser or API after a restart. In fix runs, repeat the finding's steps through the in-process test app instead.
- Flagged risk area Auth / session expiry: Auth / session expiry (important): authenticate ignores expiresAt in source; an expired session may still work, not probed.

**Memory after the run**

- Product map: 7 page(s) and 13 endpoint(s) known.
- Risk areas: 1 area(s) tracked; highest now: Auth / session expiry (score 4).
- Learnings: 4 new, 0 confirmed again, 0 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Price an 80 x 12.50 order and expect tax 95.00 and total 1,045.00 → `test/orders.test.mjs`
- **ISSUE-002**: POST orders with quantity -3, 0, 1001, 1.5 and empty items and expect 400 → `test/orders.test.mjs`
- **ISSUE-003**: Client of company B requests company A's order and expects 404 → `test/orders.test.mjs`
- **ISSUE-004**: Client requests /api/admin/customers and expects 403 → `test/admin.test.mjs`
- **ISSUE-005**: Log in, log out, then GET /api/me with the same token and expect 401 → `test/auth.test.mjs`
- **ISSUE-006**: Warm client list, admin changes status, client list shows the new status → `test/admin.test.mjs`
- **ISSUE-007**: Search with q=( and q=* returns 200 → `test/orders.test.mjs`
- **ISSUE-008**: page_size 0 and -5 return 400 → `test/orders.test.mjs`
