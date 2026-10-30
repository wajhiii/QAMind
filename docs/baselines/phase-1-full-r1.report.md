# QAMind Technical Report: run-20261030T062859Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T06:28:59.018Z |
| Project | ws (path-ws-0c14a4269377) |
| Environment | local demo |
| Branch / commit | main @ 8f486b3 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 3m 46s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.0.0 |
| Stop reason | completed |

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (15 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (3 ms) |
| Health check /health | ✅ ok | HTTP 200 (6 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **4**   🟠 Important: **5**   🟡 Minor: **3**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **8**
- API probes executed: **187** (43 produced a signal worth a look)

## Test plan (charters)

### C1: Baseline API contract, auth and role matrix  `api`

- **Goal:** Every endpoint behaves per openapi.yaml and role rules
- **Risk:** Permission breach, 5xx, error leakage
- **Entry point:** qamind api plan/run as admin and a client (source: openapi.yaml)
- **Expected results:** 401 anonymous, 403 for clients on admin endpoints, 400 on invalid input
- **Exit condition:** Baseline plans run as admin and client; role matrix read

### C2: Order totals, discount threshold, quantity limits  `business-rule`

- **Goal:** Totals follow subtotal, 5% discount at >=1000, 10% tax on discounted subtotal
- **Risk:** Money wrong
- **Entry point:** POST /api/orders as a client
- **Expected results:** Exact arithmetic; quantity 1..1000 whole; at least one item
- **Exit condition:** Below, at, above 1000.00 and quantity edges checked

### C3: Tenant and role isolation, sessions  `permissions`

- **Goal:** Companies never see each other's orders; same-company users share; logout revokes token
- **Risk:** Data exposure
- **Entry point:** acme-1/acme-2/bright-1 API chains; client calls to /admin/*
- **Expected results:** 403/404 cross tenant; 401 after logout
- **Exit condition:** Chains executed

### C4: Client Portal critical flow  `ui`

- **Goal:** Client places order, sees confirmation and My Orders entry
- **Risk:** Core flow broken, totals shown wrong
- **Entry point:** http://127.0.0.1:4102 as acme-1 (and zain-1 for RTL)
- **Expected results:** Confirmation total matches rules
- **Exit condition:** Desktop and mobile, audit run, edge inputs tried

### C5: Admin Portal orders, status and reports  `ui`

- **Goal:** Admin finds order, advances status, sees reports
- **Risk:** Status/stale data, wrong report
- **Entry point:** http://127.0.0.1:4101 as admin
- **Expected results:** Status moves forward; client sees update
- **Exit condition:** Flow and cross-check done

### C6: Cross-UI consistency and sign-out  `cross`

- **Goal:** Admin changes appear to client; totals agree across list/detail/API/report; sign-out ends session
- **Risk:** Stale or inconsistent data
- **Entry point:** Both portals and API
- **Expected results:** Consistent
- **Exit condition:** Checked

## Findings

### ISSUE-001 🔴 Critical: A client can read another company's order

- **Surface:** permissions · **Area:** Orders · **Type:** tenant-isolation
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

GET /api/orders/{id} returns 200 with the full order to a user of a different company.

**Steps to reproduce**

1. Sign in as acme-1 over the API and POST /api/orders (reference QA-rule-1, one item p-101 x1); note the order id
2. Sign in as bright-1 (Bright Foods) and GET /api/orders/{that id}
3. Observe HTTP 200 with Acme Traders' order (see evidence for the curl)

**Expected:** HTTP 403 or 404; companies never see each other's data

**Actual:** HTTP 200 with the order body

**Evidence**

- [evidence/api/rules-R8.json](evidence/api/rules-R8.json)

**Suspected root cause:** Order detail handler does not compare the order's client_id with the caller's company

**Proposed regression test:** Client B GETs client A's order id and expects 403/404 (suggested location: `test/orders.test.js`)

### ISSUE-002 🔴 Critical: A client can list customer records via the admin endpoint

- **Surface:** permissions · **Area:** Customers · **Type:** role-isolation
- **Roles:** acme-1, acme-2, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/admin/customers returns 200 for every client role; only admins should see customers. Records may contain personal data.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/admin/customers
3. Observe HTTP 200 (the role matrix in the admin-base run shows 200 for acme-1, acme-2, bright-1 and zain-1; reports endpoint correctly returns 403)

**Expected:** HTTP 403 for non-admin roles

**Actual:** HTTP 200 with customer data

**Evidence**

- [evidence/api/rules-R2.json](evidence/api/rules-R2.json)

**Suspected root cause:** Missing admin role check on the customers route

**Proposed regression test:** Each client role GETs /admin/customers and expects 403 (suggested location: `test/permissions.test.js`)

### ISSUE-003 🔴 Critical: Sign-out does not revoke the session token

- **Surface:** permissions · **Area:** Auth · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /auth/logout returns 204, the same token still works on GET /me.

**Steps to reproduce**

1. Sign in as zain-1 over the API
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. Observe HTTP 200

**Expected:** HTTP 401 once signed out

**Actual:** HTTP 200; the session stays usable

**Evidence**

- [evidence/api/rules-R16.json](evidence/api/rules-R16.json)

**Suspected root cause:** Logout does not add the token to a revocation list

**Proposed regression test:** Log out then call /me with the same token; expect 401 (suggested location: `test/auth.test.js`)

### ISSUE-004 🔴 Critical: Tax is charged on the undiscounted subtotal, so totals are too high

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders · **Type:** calculation
- **Roles:** acme-1
- **Browser / viewport:** 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

With the 5% discount applied, tax is still 10% of the full subtotal. A 1,000.00 order totals $1,050.00 instead of $1,045.00. The Client and Admin portals show the same wrong total.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with 80 x p-102 (12.50 each, subtotal 1,000.00)
3. Observe discount 50.00, tax 100.00, total 1,050.00; expected tax 95.00 and total 1,045.00
4. Also seen in the UI: Client Portal > New order, 80 x Ballpoint Pens, confirmation says Total: $1,050.00 (screenshot)

**Expected:** tax = 10% of (subtotal - discount): 95.00; total 1,045.00 (81 x p-102 expects 1,058.06; 1000 x p-101 expects 6,792.50)

**Actual:** tax 100.00, total 1,050.00 (81 x: 1,063.12; 1000 x: 6,825.00)

**Evidence**

- [evidence/api/totals-T2.json](evidence/api/totals-T2.json)
- [evidence/api/totals-T3.json](evidence/api/totals-T3.json)
- [evidence/api/totals-T5.json](evidence/api/totals-T5.json)
- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)

**Suspected root cause:** Tax computed from subtotal instead of the discounted subtotal

**Proposed regression test:** Order of 80 x 12.50 expects tax 9500 and total 104500 cents (suggested location: `test/orders.test.js`)

### ISSUE-005 🟠 Important: Quantity limits and empty orders are not enforced

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

POST /api/orders returns 201 for quantity 0, -3, 1001 and 1.5, and for an empty items list. A negative quantity creates an order with a negative total (-$21.45).

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with items[0].quantity = -3 (see totals-T6)
3. Repeat with quantity 0, 1001, 1.5 and items [] (client-base P043-P046)
4. Observe HTTP 201 each time

**Expected:** HTTP 400: quantity must be a whole number from 1 to 1000; at least one item

**Actual:** HTTP 201; order created

**Evidence**

- [evidence/api/totals-T6.json](evidence/api/totals-T6.json)
- [evidence/api/client-base-P043.json](evidence/api/client-base-P043.json)
- [evidence/api/client-base-P044.json](evidence/api/client-base-P044.json)
- [evidence/api/client-base-P045.json](evidence/api/client-base-P045.json)
- [evidence/api/client-base-P046.json](evidence/api/client-base-P046.json)

**Suspected root cause:** No server-side validation of items

**Proposed regression test:** Table test for invalid quantities and empty items expecting 400 (suggested location: `test/orders.test.js`)

### ISSUE-006 🟠 Important: Order list returns 500 for page_size=0 and for q=( or q=\

- **Surface:** api · **Area:** Orders · **Type:** robustness
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/orders crashes with HTTP 500 on page_size=0 and on search text containing regex characters (likely used unescaped in a regular expression). page_size=-1 returns 200 with page_size -1 instead of 400.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?page_size=0, then ?q=( , then ?q=\
3. Observe HTTP 500 each time

**Expected:** HTTP 400 for invalid page_size; search treats text literally

**Actual:** HTTP 500

**Evidence**

- [evidence/api/client-base-P019.json](evidence/api/client-base-P019.json)
- [evidence/api/client-base-P024.json](evidence/api/client-base-P024.json)
- [evidence/api/client-base-P028.json](evidence/api/client-base-P028.json)
- [evidence/api/client-base-P020.json](evidence/api/client-base-P020.json)

**Suspected root cause:** Unescaped search string and unvalidated page_size

**Proposed regression test:** GET /orders with page_size=0 and q='(' must not return 5xx (suggested location: `test/orders.test.js`)

### ISSUE-007 🟠 Important: Malformed JSON errors expose stack traces and server file paths

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Sending malformed JSON to POST /auth/login or POST /orders returns 400 with a stack trace and source paths in the body.

**Steps to reproduce**

1. POST /api/auth/login with body {bad (see evidence)
2. Repeat for POST /api/orders as acme-1
3. Observe a stack field and file paths in the error body

**Expected:** A short error message without internals

**Actual:** Stack trace and server paths in the response

**Evidence**

- [evidence/api/admin-base-P007.json](evidence/api/admin-base-P007.json)
- [evidence/api/client-base-P048.json](evidence/api/client-base-P048.json)

**Suspected root cause:** Default error handler returns err.stack

**Proposed regression test:** Malformed JSON returns 400 whose body has no 'stack' field or paths (suggested location: `test/errors.test.js`)

### ISSUE-008 🟠 Important: Double-submitted orders are both created

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

Two identical POST /orders sent at once both return 201 and both appear in My Orders (e.g. two QA-t80, two QA-tneg). Unsure whether duplicates are intended, but a double click would charge a client twice.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. Send the same POST /orders twice in parallel (client-base P049)
3. Observe 201 twice and two identical rows in the order list

**Expected:** One order, or a clear duplicate warning

**Actual:** Two identical orders

**Evidence**

- [evidence/api/client-base-P049.json](evidence/api/client-base-P049.json)

**Suspected root cause:** No idempotency key or duplicate check

**Proposed regression test:** Parallel identical POSTs create at most one order (suggested location: `test/orders.test.js`)

### ISSUE-009 🟠 Important: Client Portal My Orders on mobile: toolbar covers the table header and first row, columns cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

At 390px the Status filter/New order toolbar overlaps the table header and first row; the Total and View columns are cut off inside a sideways-scrolling box with no visible cue.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Resize to 390x844
3. Open My orders
4. Observe the header row hidden under the toolbar, the first order partly covered, totals truncated and no View link visible

**Expected:** Table sits below the toolbar; totals and View reachable

**Actual:** Overlap and clipped columns (audit coveredElements, reproduced after fresh load)

**Evidence**

- [screenshots/client-myorders-mobile.png](screenshots/client-myorders-mobile.png)

**Suspected root cause:** Toolbar wrapping without reserving height

**Proposed regression test:** Visual check of My orders at 390px: no covered elements (suggested location: `test/ui/my-orders.test.js`)

### ISSUE-010 🟡 Minor: Sales report is slow (about 4 s) and shows only a heading while loading

- **Surface:** api · **UI:** Admin Portal · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Browser / viewport:** 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

GET /admin/reports/sales takes about 4 seconds each time; the Reports page is empty with no loading indicator until it returns.

**Steps to reproduce**

1. Sign in as admin
2. Open Admin Portal > Reports and read the page straight away
3. Or GET /api/admin/reports/sales and note the time

**Expected:** Under 3 s, or a loading message

**Actual:** 4.0 s; blank page meanwhile

**Evidence**

- [evidence/api/rules-R4.json](evidence/api/rules-R4.json)
- [screenshots/admin-reports-desktop.png](screenshots/admin-reports-desktop.png)

**Suspected root cause:** Slow aggregation, no loading state

**Proposed regression test:** Sales report responds in under 3 s (suggested location: `test/reports.test.js`)

### ISSUE-011 🟡 Minor: Urdu-language client sees left-aligned pages with no RTL direction

- **Surface:** ui · **UI:** Client Portal · **Area:** My orders · **Type:** rtl
- **Roles:** zain-1
- **Browser / viewport:** 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

For the Urdu tenant, Urdu order references render in a left-to-right container (html has no dir, lang is en); the audit flags them.

**Steps to reproduce**

1. Sign in to the Client Portal as zain-1
2. Open My orders (1366x768)
3. Observe Urdu references left-aligned in LTR cells; reload and repeat

**Expected:** Urdu text shown with correct direction/alignment

**Actual:** All content LTR (mixed digits and Urdu in references read in LTR order)

**Evidence**

- [screenshots/zain-myorders-mobile.png](screenshots/zain-myorders-mobile.png)

**Suspected root cause:** No dir=auto on text cells

**Proposed regression test:** Cells with Urdu text use dir=auto (suggested location: `test/ui/my-orders.test.js`)

### ISSUE-012 🟡 Minor: New order product dropdown has no accessible name

- **Surface:** ui · **UI:** Client Portal · **Area:** New order · **Type:** accessibility
- **Roles:** acme-1
- **Browser / viewport:** 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

The product select on New order has no label, so screen readers announce only 'combobox'.

**Steps to reproduce**

1. Sign in as acme-1
2. Open New order
3. Run the audit or inspect the snapshot: unnamedControls lists select[name=product]

**Expected:** Select has a label or aria-label

**Actual:** No accessible name

**Evidence**

- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)

**Suspected root cause:** Missing label

**Proposed regression test:** Every select on New order has an accessible name (suggested location: `test/ui/new-order.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Two unnamed icon buttons on Admin Orders toolbar** (ui, tried 1×): Snapshot of Admin > Orders showed two buttons with no name next to the Status filter Why unconfirmed: Seen once in the accessibility snapshot; not checked with the audit or repeated

## Coverage matrix

| Surface | Area | Role | Viewport | Status | Note |
|---|---|---|---|---|---|
| api | All 11 non-email endpoints, baseline plans | admin | n/a | ✅ tested | 100 probes |
| api | Baseline, validation, boundaries | acme-1 | n/a | ✅ tested | 64 probes |
| api | Totals and discount threshold | acme-1 | n/a | ✅ tested | 987.50, 1000.00, 1012.50, multi-line, qty 1000 |
| permissions | Tenant isolation and role matrix | bright-1 | n/a | ✅ tested | cross-company read and status change |
| api | Logout and token reuse | zain-1 | n/a | ✅ tested |  |
| ui | New order and confirmation | acme-1 | desktop | ✅ tested | special characters in reference, audit |
| ui | My orders | acme-1 | mobile | ✅ tested | audit and screenshot |
| ui | My orders | zain-1 | desktop | ✅ tested | RTL text |
| ui | Orders list, order detail, status update | admin | desktop | ◐ partial | placed to processing |
| ui | Reports | admin | desktop | ✅ tested | figures consistent with order list counts |

## Not tested

_Nothing here is reported as passing._

- **API / forgot-password and reset-password**: Would send email; no email sandbox confirmed, so excluded
- **Admin Portal / Customers page (UI)**: Not covered in this pass; the endpoint was tested through the API only
- **Admin Portal / mobile viewport, all pages**: Not covered in this pass
- **Client Portal / order detail page and status refresh in the UI**: Not covered in this pass; the status change was verified through the API only
- **Client Portal / sign-out and expired session in the browser**: Not covered in this pass; sign-out was tested through the API only
- **Client Portal / double-click submit, Back/refresh mid-flow, 300+ character input in the UI**: Not covered in this pass
- **Order statuses shipped, delivered and cancelled transitions**: Not covered in this pass; only placed to processing and an invalid skip were checked
- **Admin Portal Export CSV**: Not covered in this pass

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-base | 100 | 86 | 8 | 11 | [data/api-results/admin-base.json](data/api-results/admin-base.json) |
| client-base | 64 | 52 | 12 | 21 | [data/api-results/client-base.json](data/api-results/client-base.json) |
| rules | 16 | 13 | 3 | 3 | [data/api-results/rules.json](data/api-results/rules.json) |
| totals | 7 | 3 | 4 | 8 | [data/api-results/totals.json](data/api-results/totals.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Client B GETs client A's order id and expects 403/404 → `test/orders.test.js`
- **ISSUE-002**: Each client role GETs /admin/customers and expects 403 → `test/permissions.test.js`
- **ISSUE-003**: Log out then call /me with the same token; expect 401 → `test/auth.test.js`
- **ISSUE-004**: Order of 80 x 12.50 expects tax 9500 and total 104500 cents → `test/orders.test.js`
- **ISSUE-005**: Table test for invalid quantities and empty items expecting 400 → `test/orders.test.js`
- **ISSUE-006**: GET /orders with page_size=0 and q='(' must not return 5xx → `test/orders.test.js`
- **ISSUE-007**: Malformed JSON returns 400 whose body has no 'stack' field or paths → `test/errors.test.js`
- **ISSUE-008**: Parallel identical POSTs create at most one order → `test/orders.test.js`
- **ISSUE-009**: Visual check of My orders at 390px: no covered elements → `test/ui/my-orders.test.js`
- **ISSUE-010**: Sales report responds in under 3 s → `test/reports.test.js`
- **ISSUE-011**: Cells with Urdu text use dir=auto → `test/ui/my-orders.test.js`
- **ISSUE-012**: Every select on New order has an accessible name → `test/ui/new-order.test.js`
