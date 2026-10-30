# QAMind Technical Report: run-20261030T063835Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T06:38:35.783Z |
| Project | ws (path-ws-a0b3de501e9e) |
| Environment | local demo |
| Branch / commit | main @ 9c9bebc |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 3m 21s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.0.0 |
| Stop reason | completed |

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (13 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (2 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (0 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **4**   🟠 Important: **3**   🟡 Minor: **3**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **7**
- API probes executed: **183** (42 produced a signal worth a look)

## Test plan (charters)

### C1: Baseline API contract, auth and validation (source: openapi.yaml)  `api`

- **Goal:** Endpoints match spec; invalid input refused
- **Risk:** 5xx, leakage, auth not enforced
- **Entry point:** qamind api plan as admin and as acme-1
- **Expected results:** Spec-conformant statuses
- **Exit condition:** Both baseline plans run and signals judged

### C2: Order totals, discount threshold, quantity limits  `business-rule`

- **Goal:** Total = (subtotal - 5% if >=1000) + 10% tax
- **Risk:** Money wrong
- **Entry point:** POST /api/orders as acme-1
- **Expected results:** Exact arithmetic; quantity 1..1000 integer
- **Exit condition:** Below, at, above 1000.00 and qty edges checked

### C3: Role and tenant isolation, session end  `permissions`

- **Goal:** Clients isolated; admin-only endpoints refused to clients; logout revokes token
- **Risk:** Data exposure
- **Entry point:** API chains acme-1/acme-2/bright-1/admin
- **Expected results:** 403/404 across tenants, same-company sharing, 401 after logout
- **Exit condition:** Chains run

### C4: Critical flows in Client and Admin portals  `ui`

- **Goal:** Order placed, status moved, client sees it, reports, sign out
- **Risk:** Flow blocked or stale data
- **Entry point:** Client Portal 4102, Admin Portal 4101
- **Expected results:** Per config flows 1-5
- **Exit condition:** Flows run end to end; desktop and mobile audit; Urdu tenant RTL

## Findings

### ISSUE-001 🔴 Critical: Clients can list all customer records through the admin API

- **Surface:** permissions · **Area:** Admin API · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

GET /api/admin/customers returns 200 to client accounts from two different companies; the spec and business rules say only admins may see customers.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/admin/customers (see evidence for the curl command)
3. Repeat as bright-1
4. Observe HTTP 200 both times

**Expected:** HTTP 403 for any non-admin role

**Actual:** HTTP 200 with the customer list for acme-1 and bright-1 (and zain-1, acme-2 in the role matrix)

**Evidence**

- [evidence/api/rules-R002.json](evidence/api/rules-R002.json)
- [evidence/api/rules-R003.json](evidence/api/rules-R003.json)

**Suspected root cause:** Missing admin role check on the customers route (the sales report route has one)

**Proposed regression test:** As a client, GET /api/admin/customers and expect 403 (suggested location: `test/permissions.test.js`)

### ISSUE-002 🔴 Critical: A client can read another company's order by id

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

GET /api/orders/{id} returns 200 for an order that belongs to a different company.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders (QA-rule-small), note the order id
2. Sign in as bright-1 (Bright Foods) and GET /api/orders/{that id}
3. Observe HTTP 200

**Expected:** HTTP 403 or 404

**Actual:** HTTP 200 with the Acme order

**Evidence**

- [evidence/api/rules-R007.json](evidence/api/rules-R007.json)

**Suspected root cause:** Order detail handler does not compare the order's client_id with the caller's company

**Proposed regression test:** Client A creates an order; client B GETs it and expects 403/404 (suggested location: `test/orders.test.js`)

### ISSUE-003 🔴 Critical: Signing out does not revoke the session token

- **Surface:** permissions · **Area:** Authentication · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /api/auth/logout the same token still works on GET /api/me.

**Steps to reproduce**

1. Sign in over the API as zain-1
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. Observe HTTP 200

**Expected:** HTTP 401 after logout

**Actual:** HTTP 200

**Evidence**

- [evidence/api/rules-R015.json](evidence/api/rules-R015.json)

**Suspected root cause:** Logout does not add the token to a revoked list, or the check ignores it

**Proposed regression test:** Login, logout, then GET /me expects 401 (suggested location: `test/auth.test.js`)

### ISSUE-004 🔴 Critical: Tax is calculated on the undiscounted subtotal for orders of 1,000.00 or more

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / totals · **Type:** business-rule
- **Roles:** acme-1
- **Browser / viewport:** Chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

The 5% discount is applied, but tax is 10% of the full subtotal instead of the discounted subtotal, so customers are overcharged. The confirmation page shows the same wrong total.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with product p-102 (12.50) quantity 80, subtotal 1,000.00
3. Observe tax_cents 10000 and total_cents 105000
4. Same in Client Portal: New order, Ballpoint Pens x80, Place order; confirmation says Total $1,050.00

**Expected:** Discount 50.00, tax 95.00, total 1,045.00 (also p-102 x100: total 1,306.25; p-101 x1000: total 6,792.50)

**Actual:** Total 1,050.00 (x100: 1,312.50; p-101 x1000: 6,825.00). Discount itself is correct; orders just below 1,000.00 (x79) are correct.

**Evidence**

- [evidence/api/totals-T80.json](evidence/api/totals-T80.json)
- [evidence/api/totals-T100.json](evidence/api/totals-T100.json)
- [evidence/api/totals-T1000.json](evidence/api/totals-T1000.json)
- [screenshots/order-confirmation-desktop.png](screenshots/order-confirmation-desktop.png)

**Suspected root cause:** Tax computed from subtotal rather than subtotal minus discount

**Proposed regression test:** Order of exactly 1,000.00 expects tax 95.00 and total 1,045.00 (suggested location: `test/pricing.test.js`)

### ISSUE-005 🟠 Important: Order creation accepts invalid quantities and an empty item list

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /api/orders returns 201 for quantity 0, 1001, 1.5 and for an empty items array, though quantity must be a whole number 1-1000 and an order needs at least one item.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items [] , then quantity 0, 1001, 1.5 (see evidence)
3. Observe HTTP 201 each time

**Expected:** HTTP 400

**Actual:** HTTP 201, order created

**Evidence**

- [evidence/api/client-base-P043.json](evidence/api/client-base-P043.json)
- [evidence/api/client-base-P044.json](evidence/api/client-base-P044.json)
- [evidence/api/client-base-P045.json](evidence/api/client-base-P045.json)
- [evidence/api/client-base-P046.json](evidence/api/client-base-P046.json)

**Suspected root cause:** No server-side validation of items or quantity

**Proposed regression test:** POST orders with empty items and out-of-range quantities, expect 400 (suggested location: `test/orders.test.js`)

### ISSUE-006 🟠 Important: Malformed JSON responses expose stack traces and server file paths

- **Surface:** api · **Area:** Error handling · **Type:** security
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Sending broken JSON to POST /auth/login or POST /orders returns 400 with a trace field containing a stack trace and local file paths.

**Steps to reproduce**

1. POST /api/auth/login with raw body {"broken":
2. Observe error.trace in the response
3. Repeat on POST /api/orders

**Expected:** A short error message without internal detail

**Actual:** Body includes stack trace and absolute server file paths

**Evidence**

- [evidence/api/client-base-P007.json](evidence/api/client-base-P007.json)
- [evidence/api/client-base-P048.json](evidence/api/client-base-P048.json)

**Suspected root cause:** Error handler serialises err.stack into the response

**Proposed regression test:** Malformed JSON returns 400 with no trace field (suggested location: `test/errors.test.js`)

### ISSUE-007 🟠 Important: GET /orders returns HTTP 500 for page_size=0 and for q=( or q=\

- **Surface:** api · **Area:** Orders list · **Type:** robustness
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Edge query values crash the orders list; also page_size=-1 is accepted with 200 although the spec minimum is 1.

**Steps to reproduce**

1. Sign in over the API as acme-1 or admin
2. GET /api/orders?page_size=0
3. GET /api/orders?q=(
4. Observe HTTP 500 each time; page_size=-1 gives 200

**Expected:** HTTP 400 for invalid page_size; search text treated literally

**Actual:** HTTP 500 (page_size=0, q=(, q=\)

**Evidence**

- [evidence/api/client-base-P019.json](evidence/api/client-base-P019.json)
- [evidence/api/client-base-P024.json](evidence/api/client-base-P024.json)
- [evidence/api/client-base-P028.json](evidence/api/client-base-P028.json)
- [evidence/api/client-base-P020.json](evidence/api/client-base-P020.json)

**Suspected root cause:** q is used as a raw regular expression; page_size is not range-checked (division by zero)

**Proposed regression test:** GET orders with page_size=0 and q=( expects 400/200, never 500 (suggested location: `test/orders.test.js`)

### ISSUE-008 🟡 Minor: Order creation is not protected against double submission

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Two identical simultaneous POST /orders were all accepted with 201. I did not confirm that duplicate orders are stored with different ids, and I do not know whether the product intends idempotency.

**Steps to reproduce**

1. Sign in as acme-1
2. Send the same POST /api/orders twice in parallel
3. Observe 201 for every request

**Expected:** One order, or a clear duplicate warning

**Actual:** All requests returned 201

**Evidence**

- [evidence/api/client-base-P049.json](evidence/api/client-base-P049.json)

**Suspected root cause:** No idempotency key or duplicate check

**Proposed regression test:** Two parallel identical orders create at most one (suggested location: `test/orders.test.js`)

### ISSUE-009 🟡 Minor: Sales report endpoint takes about 4 seconds

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

GET /api/admin/reports/sales consistently takes 4.0 s (limit 3 s); the Reports page waits equally long.

**Steps to reproduce**

1. Sign in as admin
2. GET /api/admin/reports/sales
3. Observe about 4,000 ms

**Expected:** Under 3 seconds

**Actual:** 4,022 ms and 4,024 ms

**Evidence**

- [evidence/api/admin-base-P061.json](evidence/api/admin-base-P061.json)
- [evidence/api/admin-base-P093.json](evidence/api/admin-base-P093.json)

**Suspected root cause:** Slow aggregation or an artificial delay

**Proposed regression test:** Sales report responds within 3000 ms (suggested location: `test/reports.test.js`)

### ISSUE-010 🟡 Minor: Product dropdown on New order has no accessible name

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / New order · **Type:** accessibility
- **Roles:** acme-1
- **Browser / viewport:** Chromium / desktop
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

The product select has no label, so screen readers announce it only by its first option. The page audit flagged it and it was seen again after a page reload.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Open New order
3. Run the page audit or read the accessibility snapshot: the product select has no name

**Expected:** A label such as Product

**Actual:** Unnamed combobox

**Evidence**

- [screenshots/order-confirmation-desktop.png](screenshots/order-confirmation-desktop.png)

**Suspected root cause:** Select rendered without label or aria-label

**Proposed regression test:** Product select has an accessible name (suggested location: `test/ui/new-order.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Status | Note |
|---|---|---|---|---|---|
| api | Baseline contract, auth, validation, role matrix | admin | n/a | ✅ tested | 100 probes |
| api | Baseline contract, auth, validation | acme-1 | n/a | ✅ tested | 64 probes |
| business-rule | Discount threshold and tax | acme-1 | n/a | ✅ tested | 79, 80, 100, 1000 units |
| permissions | Tenant isolation, role isolation, logout | acme-1, acme-2, bright-1, zain-1, admin | n/a | ✅ tested | status change by client refused, invalid transition refused, same-company sharing works |
| ui | Place order and confirmation | acme-1 | desktop | ✅ tested | page audit run |
| ui | Order detail | acme-1 | mobile | ✅ tested | page audit clean |
| ui | Admin sign-in and Reports | admin | desktop | ◐ partial | totals and counts consistent; no console errors |

## Not tested

_Nothing here is reported as passing._

- **Auth / forgot-password and reset-password**: Would send email; excluded as a possible real-world side effect
- **Admin Portal / Orders list, order detail and status change in the UI**: Not covered in this pass; status change was tested through the API only
- **Admin Portal / Customers page**: Not covered in this pass
- **Client Portal / My Orders and sign-out in the UI**: Not covered in this pass; session end tested through the API only
- **Client Portal / Urdu tenant (zain-1) RTL layout**: Not covered in this pass
- **UI form edge cases (long input, special characters, double click, expired session, direct URL to another tenant's order)**: Not covered in this pass
- **Mobile viewport for Admin Portal and most Client Portal pages**: Not covered in this pass; only the order detail page was checked at 390px

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-base | 100 | 85 | 8 | 11 | [data/api-results/admin-base.json](data/api-results/admin-base.json) |
| client-base | 64 | 52 | 12 | 21 | [data/api-results/client-base.json](data/api-results/client-base.json) |
| rules | 15 | 11 | 4 | 4 | [data/api-results/rules.json](data/api-results/rules.json) |
| totals | 4 | 1 | 3 | 6 | [data/api-results/totals.json](data/api-results/totals.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: As a client, GET /api/admin/customers and expect 403 → `test/permissions.test.js`
- **ISSUE-002**: Client A creates an order; client B GETs it and expects 403/404 → `test/orders.test.js`
- **ISSUE-003**: Login, logout, then GET /me expects 401 → `test/auth.test.js`
- **ISSUE-004**: Order of exactly 1,000.00 expects tax 95.00 and total 1,045.00 → `test/pricing.test.js`
- **ISSUE-005**: POST orders with empty items and out-of-range quantities, expect 400 → `test/orders.test.js`
- **ISSUE-006**: Malformed JSON returns 400 with no trace field → `test/errors.test.js`
- **ISSUE-007**: GET orders with page_size=0 and q=( expects 400/200, never 500 → `test/orders.test.js`
- **ISSUE-008**: Two parallel identical orders create at most one → `test/orders.test.js`
- **ISSUE-009**: Sales report responds within 3000 ms → `test/reports.test.js`
- **ISSUE-010**: Product select has an accessible name → `test/ui/new-order.test.js`
