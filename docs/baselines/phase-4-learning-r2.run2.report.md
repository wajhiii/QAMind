# QAMind Technical Report: run-20261030T104827Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T10:48:27.652Z |
| Project | ws (path-ws-f2a2a61d59a0) |
| Environment | local demo |
| Branch / commit | main @ 804cabc |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 7m 15s |
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
| Test account "admin" can sign in | ✅ ok | signed in over the API (6 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **5**   🟡 Minor: **2**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **5**
- API probes executed: **242** (54 produced a signal worth a look)

## What changed since the last run

- Page seen for the first time: Client Portal `/help.html` (Help centre) (new, or not reached by earlier runs)
- New endpoint: `GET /help` (List help articles)
- Endpoint removed: `POST /auth/reset-password` (Choose a new password with a reset token)

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 5 | 2 | 1 | 24 | 0 | 5 |
| run-20261030T104344Z | full | 5 | 4 | 3 | 0 | 9 | 3 | 5 |

## Test plan (charters)

### C1: Order and customer access across companies and roles  `permissions`

- **Goal:** Clients only reach their own company's orders; only admins reach customers, reports and status changes
- **Risk:** Customer data or another company's orders exposed (memory: critical last run; learning L-002)
- **Entry point:** GET /orders/{id}, GET /admin/customers, PATCH /admin/orders/{id}/status as clients
- **Expected results:** 403/404 for other companies' orders and for client calls to admin routes
- **Exit condition:** Chains A creates / B reads, client vs admin routes, anonymous, all checked

### C2: Order totals, discount and tax  `business-rule`

- **Goal:** Total = subtotal - 5% discount (>= 1000.00) + 10% tax on the discounted subtotal
- **Risk:** Money wrong (memory: critical; learning L-001)
- **Entry point:** POST /orders as a client; New order page
- **Expected results:** Hand-computed totals below, at and above 1000.00
- **Exit condition:** Both sides of threshold verified via API and UI

### C3: Order validation  `api`

- **Goal:** Quantity whole 1..1000, at least one item, reference rules
- **Risk:** Invalid orders accepted (memory: critical)
- **Entry point:** POST /orders
- **Expected results:** 400 naming the field
- **Exit condition:** All boundaries sent

### C4: Sign-in, sign-out and session expiry  `api`

- **Goal:** Logout revokes the token at once; expired sessions refused; login failures generic
- **Risk:** Session still usable (memory: critical)
- **Entry point:** POST /auth/login, /auth/logout, GET /me; Sign out button
- **Expected results:** 401 after logout
- **Exit condition:** API chain and UI sign-out checked; expiry from source review/Not tested if TTL 900s not waited

### C5: Status change visible to client (warm, change, re-read)  `cross`

- **Goal:** Admin status change appears in client list and detail at once
- **Risk:** Cached list stale (memory L-003)
- **Entry point:** Client list warm, admin PATCH, re-read
- **Expected results:** Same status in list and detail
- **Exit condition:** List, detail and UI compared

### C6: List search, filter and paging; error handling  `api`

- **Goal:** Odd q and page_size values give 400 or results, never 5xx or technical leakage
- **Risk:** 5xx and error leakage (memory: important)
- **Entry point:** GET /orders?q=&page_size=; malformed JSON
- **Expected results:** 4xx with clean message
- **Exit condition:** Boundary values sent

### C7: New and changed endpoints, forgot/reset password  `api`

- **Goal:** GET /help (new, public) works; reset-password is routed but no longer in the spec; forgot-password link is valid
- **Risk:** Undocumented route; broken reset link (source review lead)
- **Entry point:** GET /help, POST /auth/reset-password, POST /auth/forgot-password (local mail catcher only)
- **Expected results:** Documented behaviour; spec matches routes
- **Exit condition:** Probed

### C8: Client Portal pages (new Help page, My orders, New order, order detail), desktop and mobile  `ui`

- **Goal:** Critical flow 1 and 3 work, page audit clean, double-submit safe, Urdu client RTL ok
- **Risk:** Duplicate orders, labels, layout (memory)
- **Entry point:** Client Portal as acme-1, acme-2, bright-1, zain-1
- **Expected results:** Order placed once; total shown; page audit clean
- **Exit condition:** Every page, both viewports, each client role

### C9: Admin Portal pages and critical flows 2, 4, 5  `ui`

- **Goal:** Orders list, order detail status change, Customers, Reports, sign-out
- **Risk:** Reports slow; admin pages reachable by clients
- **Entry point:** Admin Portal as admin; admin URLs as a client
- **Expected results:** Status moves forward; reports show figures; clients refused
- **Exit condition:** Every page, both viewports

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Tax is charged on the full subtotal instead of the discounted subtotal, so discounted orders are overcharged

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / totals · **Type:** calculation
- **Roles:** acme-1
- **Browser / viewport:** desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

For orders at or above 1,000.00 the 5% discount is applied but tax is still computed on the undiscounted subtotal.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with 80 x p-102 (subtotal 1,000.00); see evidence for the exact request
3. Observe discount 50.00, tax 100.00, total 1,050.00
4. Repeat with 84 x p-102 (1,050.00): tax 105.00, total 1,102.50
5. In the Client Portal, place 80 x Ballpoint Pens: confirmation says Total: $1,050.00

**Expected:** Tax = 10% of (subtotal - discount): 95.00, total 1,045.00 (and 99.75 / 1,097.25 for the second order)

**Actual:** tax_cents 10000 and total_cents 105000 (second order 10500 / 110250)

**Evidence**

- [evidence/api/custom-T2.json](evidence/api/custom-T2.json)
- [evidence/api/custom-T3.json](evidence/api/custom-T3.json)
- [screenshots/client-double-submit.png](screenshots/client-double-submit.png)

**Suspected root cause:** priceOrder computes tax from subtotal instead of subtotal - discount (src/pricing.mjs)

**Proposed regression test:** Price an order of exactly 1000.00 and expect tax 95.00 and total 1045.00 (suggested location: `test/pricing.test.mjs`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: A customer can open another company's order by its number

- **Surface:** permissions · **Area:** Orders / access · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/orders/{id} does not check the order belongs to the caller's company.

**Steps to reproduce**

1. Sign in as acme-1 and create order QA-iso-1 (capture its id)
2. Sign in as bright-1 (a different company)
3. GET /api/orders/{id}
4. Observe 200 with the order's contents

**Expected:** 403 or 404 with no order data

**Actual:** 200 with Acme Traders' order

**Evidence**

- [evidence/api/custom-I2.json](evidence/api/custom-I2.json)

**Suspected root cause:** getOrder looks up by id only, without comparing client_id (src/api.mjs getOrder)

**Proposed regression test:** Client B requests client A's order id and expects 403/404 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Any signed-in customer can read the full customer list, including personal and identity details

- **Surface:** permissions · **Area:** Customers / access · **Type:** permissions
- **Roles:** bright-1, acme-1, acme-2, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/admin/customers has no role check; a client receives all customer records (fields include email, phone, address, national id number, notes).

**Steps to reproduce**

1. Sign in over the API as bright-1
2. GET /api/admin/customers
3. Observe 200 with every company's customer records

**Expected:** 403 for non-admin roles

**Actual:** 200 with all customers; fields: address, cnic, company, contact_name, email, notes, phone

**Evidence**

- [evidence/api/custom-I8.json](evidence/api/custom-I8.json)

**Suspected root cause:** Route listCustomers has no roles: ['admin'] option (src/api.mjs)

**Proposed regression test:** Each client role calls /admin/customers and expects 403 (suggested location: `test/permissions.test.mjs`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Signing out does not end the session

- **Surface:** api · **Area:** Sign-in / sessions · **Type:** auth
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

After POST /api/auth/logout returns 204 the same bearer token still works.

**Steps to reproduce**

1. Sign in as zain-1
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. Observe 200

**Expected:** 401 after logout

**Actual:** 200 and the user profile

**Evidence**

- [evidence/api/custom-L2.json](evidence/api/custom-L2.json)

**Suspected root cause:** logout sets session.endedAt but authenticate never checks endedAt (or expiresAt)

**Proposed regression test:** Logout then call /me with the same token and expect 401 (suggested location: `test/auth.test.mjs`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders accept invalid quantities (negative, zero, decimal, above 1000) and no items

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

POST /api/orders only checks quantity is a number; negative orders produce negative totals that flow into reports.

**Steps to reproduce**

1. Sign in as acme-1
2. POST /api/orders with quantity -3, 0, 1.5, 1001, or items []
3. Observe 201 each time; with -3 the total is negative

**Expected:** 400 naming the field (whole number 1 to 1000, at least one item)

**Actual:** 201; order created (my orders shows -$11.55)

**Evidence**

- [evidence/api/baseline-client-P044.json](evidence/api/baseline-client-P044.json)
- [evidence/api/baseline-client-P045.json](evidence/api/baseline-client-P045.json)
- [evidence/api/baseline-client-P046.json](evidence/api/baseline-client-P046.json)
- [evidence/api/baseline-client-P047.json](evidence/api/baseline-client-P047.json)
- [evidence/api/custom-T5.json](evidence/api/custom-T5.json)

**Suspected root cause:** validateOrderInput checks typeof quantity only

**Proposed regression test:** Table-driven test of invalid quantities and empty items expecting 400 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: My orders keeps showing the old status after staff change it

- **Surface:** cross · **UI:** Client Portal · **Area:** Orders / status · **Type:** stale-data
- **Roles:** admin, bright-1, acme-2
- **Browser / viewport:** desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

The client order list is cached per company for 10 minutes and the cache is not cleared when an admin changes a status; the order detail shows the new status.

**Steps to reproduce**

1. Sign in as bright-1, GET /api/orders?q=QA-stat (warm: placed)
2. As admin PATCH the order to processing
3. bright-1 re-reads the list: still placed; the detail says processing
4. In the UI: acme-2 opens My orders (placed), admin updates the order, acme-2 reloads My orders: still Placed while the order page says Processing

**Expected:** List and detail agree immediately

**Actual:** List shows placed; detail shows processing

**Evidence**

- [evidence/api/custom-S5.json](evidence/api/custom-S5.json)
- [screenshots/client-stale-list.png](screenshots/client-stale-list.png)

**Suspected root cause:** orderCache keyed by client is only invalidated in addOrder, not on status change

**Proposed regression test:** Warm list, change status, re-read list and expect the new status (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Double-clicking Place order creates two identical orders

- **Surface:** ui · **UI:** Client Portal · **Area:** Orders / new order · **Type:** duplicate-submission
- **Roles:** acme-1
- **Browser / viewport:** desktop 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C8

The form sends two order requests when Place order is double-clicked; the API also accepts two parallel identical orders.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Open New order, enter reference QA-ui-dbl2, choose Staples, box of 5000
3. Double-click Place order
4. My orders lists two QA-ui-dbl2 orders

**Expected:** One order per submission

**Actual:** Two orders created; network shows two POST /api/orders returning 201

**Evidence**

- [evidence/client-double-submit-network.txt](evidence/client-double-submit-network.txt)
- [screenshots/client-double-submit.png](screenshots/client-double-submit.png)
- [evidence/api/baseline-client-P050.json](evidence/api/baseline-client-P050.json)

**Suspected root cause:** Submit button not disabled while the request runs (order creation takes about 0.8s)

**Proposed regression test:** Double click submit and assert one order created (suggested location: `test/e2e/new-order.test.mjs`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Some order list searches and page sizes make the system fail or are wrongly accepted

- **Surface:** api · **Area:** Orders / search and paging · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

The search text is used as a regular expression so '(' or a backslash gives HTTP 500; page_size=0 gives 500 and page_size=-1 is accepted.

**Steps to reproduce**

1. Sign in as acme-1
2. GET /api/orders?q=(  -> 500
3. GET /api/orders?q=\ -> 500
4. GET /api/orders?page_size=0 -> 500
5. GET /api/orders?page_size=-1 -> 200

**Expected:** Literal search; 400 for page_size outside 1..100

**Actual:** 500 internal errors; -1 accepted

**Evidence**

- [evidence/api/baseline-client-P020.json](evidence/api/baseline-client-P020.json)
- [evidence/api/baseline-client-P021.json](evidence/api/baseline-client-P021.json)
- [evidence/api/baseline-client-P025.json](evidence/api/baseline-client-P025.json)
- [evidence/api/baseline-client-P029.json](evidence/api/baseline-client-P029.json)

**Suspected root cause:** new RegExp(q) on user input; page_size lower bound not checked

**Proposed regression test:** Search with punctuation and page_size 0/-1 (suggested location: `test/orders.test.mjs`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Malformed requests return internal technical details

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

Invalid JSON to POST /api/auth/login or /api/orders returns 400 with a stack trace and server file paths.

**Steps to reproduce**

1. POST /api/auth/login with body {bad json
2. Observe the body contains a stack field with server file paths

**Expected:** A short 400 error without internals

**Actual:** 400 with stack and source paths

**Evidence**

- [evidence/api/baseline-admin-P007.json](evidence/api/baseline-admin-P007.json)
- [evidence/api/baseline-client-P049.json](evidence/api/baseline-client-P049.json)

**Suspected root cause:** Body parse errors serialized with stack in http.mjs

**Proposed regression test:** Malformed JSON returns 400 with no stack field (suggested location: `test/http.test.mjs`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: New order page is wider than a phone screen and the Place order button is off-screen

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / New order · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** mobile 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C8

At 390px the page scrolls sideways by 165px; the reference and note fields, quantity, Remove and Place order controls extend past the right edge.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Set the window to 390x844
3. Open New order
4. Observe the form overflows; Place order sits at x 435-555 of a 390px screen

**Expected:** The form fits the screen width

**Actual:** Page overflows sideways; Place order is off-screen

**Evidence**

- [screenshots/client-new-order-mobile.png](screenshots/client-new-order-mobile.png)

**Suspected root cause:** Fixed-width line row and inputs in client.css

**Proposed regression test:** At 390px width, assert no horizontal overflow on new-order (suggested location: `test/e2e/layout.test.mjs`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟡 Minor: Several controls have no name for screen readers (product dropdown, orders search box and two icon buttons)

- **Surface:** ui · **UI:** Client Portal and Admin Portal · **Area:** Client and Admin Portal / forms · **Type:** accessibility
- **Roles:** acme-1, admin
- **Browser / viewport:** desktop and mobile
- **Reproduced:** 2 of 2 attempts
- **Charter:** C8

The product select on New order, and on the Admin Orders page the search field (placeholder only) and the Refresh and Clear filters icon buttons, have no accessible name.

**Steps to reproduce**

1. Open Client Portal New order and run the page audit: product select unnamed
2. Open Admin Portal Orders: search input, #refresh and #clear-filters unnamed (desktop and mobile)

**Expected:** Every control has a label or accessible name

**Actual:** Four controls unnamed

**Evidence**

- [screenshots/admin-orders-mobile.png](screenshots/admin-orders-mobile.png)

**Suspected root cause:** Missing label/aria-label attributes

**Proposed regression test:** Accessibility check that each form control has a name (suggested location: `test/e2e/a11y.test.mjs`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟡 Minor: Password reset route is reachable but missing from the published API description

- **Surface:** api · **Area:** Sign-in / password reset · **Type:** spec-drift
- **Roles:** anonymous
- **Reproduced:** 2 of 2 attempts
- **Charter:** C7

POST /api/auth/reset-password answers (400 for an invalid link) but openapi.yaml no longer lists it (removed in the uncommitted changes).

**Steps to reproduce**

1. POST /api/auth/reset-password with token nope
2. Observe 400 invalid_token, not 404
3. Compare with openapi.yaml: operation absent

**Expected:** Spec and routes agree

**Actual:** Route exists, undocumented

**Evidence**

- [evidence/api/custom-R1.json](evidence/api/custom-R1.json)

**Suspected root cause:** Spec edited without updating or removing the route (reset-password.html still exists)

**Proposed regression test:** Compare routes with spec operations (suggested location: `test/spec.test.mjs`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Urdu order references sit in left-to-right boxes on My orders** (ui, tried 1×): For the Urdu-language customer the three references have direction ltr and left alignment, so the dash and number follow the Urdu word on the left. Seen on one page load only; unclear whether this is intended. Why unconfirmed: Seen on a single page load and not repeated from a fresh load

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | New order and confirmation | acme-1 | desktop | #1 | ✅ tested | place order, total, double-click |
| ui | New order and confirmation | acme-1 | mobile | #1 | ✅ tested | overflow found |
| ui | My orders | acme-1 | desktop | #1 | ✅ tested | orders appear; paging seen |
| ui | My orders | acme-1 | mobile | - | ✅ tested | known accepted layout behaviour not re-reported |
| ui | My orders | acme-2 | desktop | #3 | ✅ tested | list stale, detail new |
| ui | Order detail | acme-1 | desktop | #3 | ✅ tested | totals read |
| ui | Help page | acme-1 | desktop | - | ✅ tested | new page |
| ui | Help page | acme-1 | mobile | - | ✅ tested |  |
| ui | My orders (Urdu customer) | zain-1 | desktop | - | ✅ tested | right-to-left lead unconfirmed |
| ui | Sign out | acme-1 | desktop | #5 | ✅ tested | screen returns to sign-in; session still valid behind the screens |
| api | Sign out and session | zain-1 | - | #5 | ✅ tested | old sign-in still works |
| ui | Orders list | admin | desktop | #2 | ✅ tested |  |
| ui | Orders list | admin | mobile | - | ✅ tested |  |
| ui | Order detail and status change | admin | desktop | #2 | ✅ tested | placed to processing |
| ui | Order detail and status change | admin | mobile | - | ✅ tested |  |
| ui | Customers | admin | desktop | - | ✅ tested |  |
| ui | Customers | admin | mobile | - | ✅ tested |  |
| ui | Reports | admin | desktop | #4 | ✅ tested | figures after about 4s with a Loading indicator; counts add up |
| ui | Reports | admin | mobile | #4 | ✅ tested |  |
| ui | Client sign-in to Admin Portal | bright-1 | desktop | - | ✅ tested | refused |
| api | All 13 documented operations plus reset-password | admin and clients | - | - | ✅ tested | baseline plans, role matrix |
| permissions | Company isolation and admin-only routes | acme-1, bright-1 | - | - | ✅ tested |  |
| business-rule | Totals, discount, tax, quantity limits | acme-1 | - | - | ✅ tested |  |
| cross | Admin status change seen by client | admin, bright-1, acme-2 | - | #3 | ✅ tested |  |

## Not tested

_Nothing here is reported as passing._

- **Client Portal / password reset email**: The reset email goes to a local mail inbox this run cannot read, so the link inside could not be checked (source review suggests the link may carry an undefined token; unverified)
- **Sessions / expiry after 15 minutes**: Session lifetime is 900 seconds and no shorter test setting exists; not waited out (source review suggests expiry is not enforced; unverified)
- **Admin Portal / Export CSV button**: Not exercised: the download was not opened or checked in this run
- **Client Portal / bright-1 and zain-1 order placing in the browser**: Order placing in the browser was tested as acme-1 only; the other companies were checked through the system behind the screens
- **API / rate limiting and brute-force protection**: Not verified: no documented limit and no disposable account for repeated failed sign-ins

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| baseline-admin | 107 | 93 | 8 | 11 | [data/api-results/baseline-admin.json](data/api-results/baseline-admin.json) |
| baseline-client | 65 | 53 | 12 | 21 | [data/api-results/baseline-client.json](data/api-results/baseline-client.json) |
| custom | 34 | 27 | 7 | 11 | [data/api-results/custom-2.json](data/api-results/custom-2.json) |
| custom | 34 | 27 | 7 | 11 | [data/api-results/custom.json](data/api-results/custom.json) |
| products | 2 | 2 | 0 | 0 | [data/api-results/products.json](data/api-results/products.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

- Applied learning L-001: (Orders / totals) Discounted orders get tax on the undiscounted subtotal: test both sides of the 1,000.00 threshold and recompute tax by hand.
  - In this run: Applied learning L-001 to test both sides of the 1,000.00 threshold and recompute tax by hand.
- Applied learning L-002: (Permissions) Detail and admin-named endpoints may lack role or company checks even when the UI hides them: always probe GET order by id across companies and admin routes as a client.
  - In this run: Applied learning L-002 to probe order detail across companies and admin routes as a client.
- Applied learning L-003: (Orders / status) The client order list is cached per company for minutes: warm it, change status as admin, then compare list with the detail page.
  - In this run: Applied learning L-003 to warm the client list, change status as admin, then re-read list and detail.
- Applied learning L-004: (Admin Portal / Reports) The sales report takes about 4 seconds and shows only its heading meanwhile: wait for the figures before reading it.
  - In this run: Applied learning L-004 to wait for the report figures before reading.
- Skipped known false alarm FA-001: My orders on a phone: the filter bar covers the first order and totals are cut off
  - In this run: Skipped known false alarm FA-001 (phone filter bar covering the first order).

**Saved this run**

- Confirmed again L-001: Discounted orders get tax on the undiscounted subtotal: test both sides of the 1,000.00 threshold and recompute tax by hand.
- Confirmed again L-002: Detail and admin-named endpoints may lack role or company checks even when the UI hides them: always probe GET order by id across companies and admin routes as a client.
- Confirmed again L-003: The client order list is cached per company for minutes: warm it, change status as admin, then compare list with the detail page.
- New learning L-005: On a 390px phone the New order form overflows sideways by about 165px and Place order is off-screen; a double click sends two order requests (order creation takes about 0.8s).
- Contradicted learning L-004: The sales report takes about 4 seconds and shows only its heading meanwhile: wait for the figures before reading it.

**Memory after the run**

- Product map: 10 page(s) and 13 endpoint(s) known; 3 change(s) since the last run.
- Risk areas: 14 area(s) tracked; highest now: Customers / access (score 20).
- Known false alarms skipped: FA-001.
- Learnings: 1 new, 3 confirmed again, 4 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Price an order of exactly 1000.00 and expect tax 95.00 and total 1045.00 → `test/pricing.test.mjs`
- **ISSUE-002**: Client B requests client A's order id and expects 403/404 → `test/orders.test.mjs`
- **ISSUE-003**: Each client role calls /admin/customers and expects 403 → `test/permissions.test.mjs`
- **ISSUE-004**: Logout then call /me with the same token and expect 401 → `test/auth.test.mjs`
- **ISSUE-005**: Table-driven test of invalid quantities and empty items expecting 400 → `test/orders.test.mjs`
- **ISSUE-006**: Warm list, change status, re-read list and expect the new status → `test/orders.test.mjs`
- **ISSUE-007**: Double click submit and assert one order created → `test/e2e/new-order.test.mjs`
- **ISSUE-008**: Search with punctuation and page_size 0/-1 → `test/orders.test.mjs`
- **ISSUE-009**: Malformed JSON returns 400 with no stack field → `test/http.test.mjs`
- **ISSUE-010**: At 390px width, assert no horizontal overflow on new-order → `test/e2e/layout.test.mjs`
- **ISSUE-011**: Accessibility check that each form control has a name → `test/e2e/a11y.test.mjs`
- **ISSUE-012**: Compare routes with spec operations → `test/spec.test.mjs`

## Notes

- Evidence for the customer list problem may include personal data; automatic masking of screenshots is not available, so review before sharing.
- The Reports page now shows a Loading indicator for about four seconds, so last run's report-page finding was not reported again.
- QA- orders created during this run were left in the demo data (no delete function exists).
