# QAMind Technical Report: run-20261030T071439Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T07:14:39.291Z |
| Project | ws (path-ws-9f0d32f978c7) |
| Environment | local demo |
| Branch / commit | main @ 4f7fc1f |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 6m 49s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (12 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (0 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **6**   🟡 Minor: **4**
- Unconfirmed (not reproduced twice): **1**
- Areas not tested: **9**
- API probes executed: **213** (42 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the stated rule
- **Risk:** Money is calculated wrongly
- **Entry point:** POST /api/orders as a client
- **Expected results:** Invalid input refused; total = subtotal - 5% (if subtotal >= 1000.00) + 10% tax, rounded to cent
- **Exit condition:** Quantity 0/1/1000/1001/-1/decimal, empty items, and subtotal 999.99/1000.00/1000.01 checked; client-supplied prices ignored

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients see only their company's orders; only admins reach admin endpoints
- **Risk:** Data exposure across customers
- **Entry point:** GET /orders, /orders/{id}, /admin/* as each role
- **Expected results:** 403/404 for other tenants and non-admins; same-company users share orders
- **Exit condition:** Chains for acme-1/acme-2/bright-1/zain-1 plus anonymous run on list, detail, status change, customers, reports

### C3: Auth and sessions  `api`

- **Goal:** Logout revokes token; bad credentials refused
- **Risk:** Session stays valid after sign out
- **Entry point:** POST /auth/login, /auth/logout, GET /me
- **Expected results:** 401 after logout; invalid login 401; no user enumeration
- **Exit condition:** Logout chain, malformed tokens, login validation checked

### C4: Order status lifecycle and lists  `api`

- **Goal:** Status moves placed->processing->shipped->delivered/cancelled; lists paginate and filter correctly
- **Risk:** Illegal transitions; wrong pagination
- **Entry point:** PATCH /admin/orders/{id}/status; GET /orders with page,page_size,status,q
- **Expected results:** Illegal transitions 409; invalid 400; pagination bounds handled
- **Exit condition:** Transitions and list edge values probed on own QA- orders

### C5: Cross-UI status propagation (warm, change, re-read)  `cross`

- **Goal:** Admin status change appears to the client at once
- **Risk:** Stale data
- **Entry point:** Client Portal My Orders; Admin Portal Orders
- **Expected results:** Client sees new status after reload
- **Exit condition:** Warm client list/detail, admin change, re-read via API and UI

### C6: Client Portal critical flow and page audit  `ui`

- **Goal:** Client signs in, places order, sees confirmation and total, finds it in My Orders (desktop+mobile, Urdu tenant RTL)
- **Risk:** Blocked ordering, wrong totals, layout
- **Entry point:** http://127.0.0.1:4102
- **Expected results:** Flow works; totals match rules; no layout defects
- **Exit condition:** Flow, form cases, audit at 1366x768 and 390x844 done

### C7: Admin Portal flows, reports and role guard  `ui`

- **Goal:** Admin manages orders, sees customers and reports
- **Risk:** Wrong report numbers; client reaching admin
- **Entry point:** http://127.0.0.1:4101
- **Expected results:** Reports match orders; non-admin refused
- **Exit condition:** All pages audited desktop+mobile; report totals recomputed

## Findings

### ISSUE-001 🔴 Critical: Any client can read every customer's contact, ID-number and card details through /admin/customers

- **Surface:** permissions · **Area:** Admin / Customers · **Type:** permissions
- **Roles:** acme-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /admin/customers returns 200 with all customer records to client accounts from three different companies; the spec and business rules say only admins may see customers.

**Steps to reproduce**

1. Sign in over the API as acme-1 (client)
2. GET /api/admin/customers (see evidence for the exact request)
3. Observe HTTP 200 with records for all three companies, including fields for phone, national ID, address and card digits
4. Repeat as zain-1 (client of another company): same result

**Expected:** HTTP 403 for non-admin roles (matches /admin/reports/sales, which does return 403)

**Actual:** HTTP 200 with the full customer list including personal and card-related fields

**Evidence**

- [evidence/api/prods-R2.json](evidence/api/prods-R2.json)
- [evidence/api/iso-X12.json](evidence/api/iso-X12.json)

**Suspected root cause:** The customers route is missing the admin role check that the reports route has

**Proposed regression test:** As a client, GET /admin/customers and expect 403 with no body data (suggested location: `test/permissions.test.js`)

### ISSUE-002 🔴 Critical: A client can open another company's order by id (cross-customer data exposure)

- **Surface:** permissions · **Area:** Orders · **Type:** permissions
- **Roles:** bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /orders/{id} returns the full order (items, company name, totals) to clients of other companies; the list endpoint is correctly scoped, but the detail endpoint is not.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-iso-1, capture the id
2. Sign in as bright-1 (Bright Foods) and GET /api/orders/{id}
3. Observe HTTP 200 containing the Acme order
4. Repeat as zain-1: same result
5. UI: signed in as zain-1 in the Client Portal, open /order.html?id=o-1036 and see Acme Traders' order QA-ui-1 (screenshot)

**Expected:** HTTP 403 or 404 and no order data

**Actual:** HTTP 200 with the other company's order, in the API and in the Client Portal

**Evidence**

- [evidence/api/iso-X3.json](evidence/api/iso-X3.json)
- [evidence/api/iso-X4.json](evidence/api/iso-X4.json)
- [screenshots/zain-reads-acme-order.png](screenshots/zain-reads-acme-order.png)

**Suspected root cause:** Order lookup by id does not filter on the caller's client_id

**Proposed regression test:** Client A creates an order; client B GETs it by id and expects 403/404; A re-reads it (suggested location: `test/orders-isolation.test.js`)

### ISSUE-003 🔴 Critical: Signing out does not revoke the token: the same token still works afterwards

- **Surface:** api · **Area:** Auth / Sessions · **Type:** security
- **Roles:** acme-2
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /auth/logout returns 204, the same bearer token still gets 200 from GET /me. The spec and business rules say sign-out ends the session at once.

**Steps to reproduce**

1. Sign in over the API as acme-2
2. POST /api/auth/logout with that token: HTTP 204
3. GET /api/me with the same token
4. Observe HTTP 200 with the user's profile

**Expected:** HTTP 401 on /me after logout

**Actual:** HTTP 200; the token remains usable

**Evidence**

- [evidence/api/iso-A2.json](evidence/api/iso-A2.json)

**Suspected root cause:** Logout does not add the token to a revocation list (or the check ignores it)

**Proposed regression test:** Login, logout, then GET /me with the same token expects 401 (suggested location: `test/auth.test.js`)

### ISSUE-004 🔴 Critical: Tax is calculated on the pre-discount subtotal, so discounted orders are overcharged

- **Surface:** business-rule · **Area:** Orders / Pricing · **Type:** business-rule
- **Roles:** acme-1
- **Reproduced:** 3 of 3 attempts
- **Charter:** C1

For orders at or above 1,000.00 the 10% tax is applied to the undiscounted subtotal instead of the discounted one, so totals are too high. Below the threshold the maths is correct.

**Steps to reproduce**

1. Sign in as acme-1; POST /api/orders with 100 x p-101 and 100 x p-104 (subtotal 1000.00)
2. Observe discount_cents 5000, tax_cents 10000, total_cents 105000; expected tax 9500 and total 104500
3. Repeat with 1000 x p-101: tax 65000, total 682500; expected tax 61750 and total 679250
4. UI: place 200 x A4 Copy Paper in the Client Portal; confirmation says $1,365.00, expected $1,358.50 (1300.00 - 65.00 + 123.50)

**Expected:** total = subtotal - discount + 10% of (subtotal - discount)

**Actual:** Tax is 10% of the full subtotal (e.g. 130.00 instead of 123.50 on a 1,300.00 order); shown identically in the UI, the list, the order detail and the admin portal

**Evidence**

- [evidence/api/rules-B3.json](evidence/api/rules-B3.json)
- [evidence/api/rules-B4.json](evidence/api/rules-B4.json)
- [evidence/api/rules-B5.json](evidence/api/rules-B5.json)
- [screenshots/client-confirmation-wrong-total.png](screenshots/client-confirmation-wrong-total.png)

**Suspected root cause:** Tax computed from subtotal_cents rather than subtotal_cents - discount_cents

**Proposed regression test:** Order at 1000.00 expects discount 5000, tax 9500, total 104500; also 999.50 and 1004.75 (suggested location: `test/pricing.test.js`)

### ISSUE-005 🔴 Critical: Order quantity is not validated: 0, negative, above 1000 and fractional quantities are accepted

- **Surface:** api · **Area:** Orders / Validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /orders returns 201 for quantity 0, -1, 1001 and 1.5, contradicting the 1 to 1000 whole-number rule; a quantity of -1 creates an order with a negative total that appears in lists and reports.

**Steps to reproduce**

1. Sign in as acme-1
2. POST /api/orders with items[0].quantity = -1 (QA- reference)
3. Observe HTTP 201 and total_cents -715
4. Repeat with quantity 0, 1001 and 1.5: all HTTP 201

**Expected:** HTTP 400 naming items[0].quantity

**Actual:** HTTP 201; negative-total orders are stored and counted in the admin sales report

**Evidence**

- [evidence/api/rules-B6.json](evidence/api/rules-B6.json)
- [evidence/api/client-P044.json](evidence/api/client-P044.json)
- [evidence/api/client-P045.json](evidence/api/client-P045.json)
- [evidence/api/client-P046.json](evidence/api/client-P046.json)

**Suspected root cause:** No range or integer check on item quantity

**Proposed regression test:** POST orders with quantity -1, 0, 1001, 1.5 expect 400; 1 and 1000 expect 201 (suggested location: `test/orders.test.js`)

### ISSUE-006 🟠 Important: An order with no items is accepted

- **Surface:** api · **Area:** Orders / Validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

POST /orders with an empty items array returns 201; the rules require at least one item.

**Steps to reproduce**

1. Sign in as acme-1
2. POST /api/orders with items: [] (see evidence)
3. Observe HTTP 201

**Expected:** HTTP 400

**Actual:** HTTP 201

**Evidence**

- [evidence/api/client-P043.json](evidence/api/client-P043.json)

**Suspected root cause:** Missing minimum-length check on items

**Proposed regression test:** POST order with empty items expects 400 (suggested location: `test/orders.test.js`)

### ISSUE-007 🟠 Important: Order list shows stale status after an admin changes it

- **Surface:** cross · **Area:** Orders / My orders · **Type:** stale-data
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

After an admin moves an order forward, the client's order detail updates at once but the client's order list keeps showing the old status for a while (warm, change, re-read).

**Steps to reproduce**

1. Sign in as acme-1; GET /api/orders?q=QA-iso-1 and GET the order (status placed)
2. As admin, PATCH /api/admin/orders/{id}/status to processing
3. As acme-1 GET the order: processing; GET /api/orders?q=QA-iso-1: still placed
4. UI: the Client Portal My orders page showed Placed for an order that was already Delivered; a later fresh load showed Delivered

**Expected:** List and detail show the new status immediately

**Actual:** List served stale data (roughly a minute or more observed in the UI); detail and list disagree

**Evidence**

- [evidence/api/iso-T5.json](evidence/api/iso-T5.json)
- [screenshots/client-my-orders-stale-desktop.png](screenshots/client-my-orders-stale-desktop.png)

**Suspected root cause:** A cache on the client order list is not invalidated by status changes

**Proposed regression test:** Warm list, change status as admin, re-read list and expect the new status (suggested location: `test/orders-cache.test.js`)

### ISSUE-008 🟠 Important: GET /orders returns HTTP 500 for page_size=0 and for q containing ( or \

- **Surface:** api · **Area:** Orders / List · **Type:** error-handling
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

Invalid or special-character query values crash the list endpoint with a 500 instead of a 400 or a plain search. Separately, page_size=-1 returns 200 although the spec minimum is 1 (and page_size=101 correctly returns 400).

**Steps to reproduce**

1. Sign in as acme-1 (admin behaves the same)
2. GET /api/orders?page_size=0 : HTTP 500
3. GET /api/orders?q=( : HTTP 500
4. GET /api/orders?q=\ : HTTP 500
5. GET /api/orders?page_size=-1 : HTTP 200

**Expected:** 400 for page_size below 1; special characters searched literally

**Actual:** HTTP 500 for three inputs; HTTP 200 for page_size=-1

**Evidence**

- [evidence/api/client-P019.json](evidence/api/client-P019.json)
- [evidence/api/client-P024.json](evidence/api/client-P024.json)
- [evidence/api/client-P028.json](evidence/api/client-P028.json)
- [evidence/api/client-P020.json](evidence/api/client-P020.json)

**Suspected root cause:** Search text is used as a raw regular expression; page_size is not range-checked at the low end

**Proposed regression test:** GET /orders with page_size=0/-1 expects 400; q='(' and q='\' expect 200 (suggested location: `test/orders-list.test.js`)

### ISSUE-009 🟠 Important: Malformed JSON responses include a stack trace and server file paths

- **Surface:** api · **Area:** Errors · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

Sending invalid JSON to POST /auth/login or POST /orders returns a 400 whose body includes a trace field with a stack trace and absolute file paths; the spec says responses never include server internals.

**Steps to reproduce**

1. POST /api/auth/login (no token needed) with the raw body {"broken":
2. Observe HTTP 400 with error.trace containing file paths and function names
3. Repeat on POST /api/orders as acme-1: same

**Expected:** A short error with code and message only

**Actual:** error.trace holds a stack trace and local file system paths

**Evidence**

- [evidence/api/baseline-P007.json](evidence/api/baseline-P007.json)
- [evidence/api/client-P048.json](evidence/api/client-P048.json)

**Suspected root cause:** The JSON-parse error handler serialises the Error stack into the response

**Proposed regression test:** Send malformed JSON and assert the body has no trace/stack and no file paths (suggested location: `test/errors.test.js`)

### ISSUE-010 🟠 Important: Submitting the same order twice at once creates two orders

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Two identical POST /orders requests sent in parallel both return 201, so one user action can place a duplicate order. I am not sure whether the product intends to allow identical orders; there is no idempotency key or duplicate warning.

**Steps to reproduce**

1. Sign in as acme-1
2. Send the same POST /api/orders (reference QA-...) twice at the same moment
3. Observe two 201 responses with different order ids

**Expected:** One order, or a clear duplicate refusal/warning

**Actual:** Two separate orders created

**Evidence**

- [evidence/api/client-P049.json](evidence/api/client-P049.json)

**Suspected root cause:** No de-duplication on reference and no idempotency support

**Proposed regression test:** Parallel identical POSTs yield one order or a 409 (suggested location: `test/orders.test.js`)

### ISSUE-012 🟠 Important: New order page is wider than the screen on mobile; Place order button is off-screen

- **Surface:** ui · **Area:** Client Portal / New order · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

At 390px the form is 555px wide: the page scrolls sideways, the Place order, Quantity and Remove controls sit past the right edge, and Remove is covered by the Quantity field.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 with a 390x844 viewport
2. Open New order (/new-order.html)
3. Observe horizontal scrolling (scroll width 555) and the Place order button starting at x=435
4. Reload and repeat: same

**Expected:** Form fits the screen and all controls are reachable

**Actual:** Controls pushed off-screen; a user must scroll sideways to place an order

**Evidence**

- [screenshots/client-new-order-mobile.png](screenshots/client-new-order-mobile.png)

**Suspected root cause:** Fixed-width line-item row with no wrapping at narrow widths

**Proposed regression test:** At 390px the New order page does not scroll sideways and Place order is within the viewport (suggested location: `e2e/new-order.mobile.spec.js`)

### ISSUE-011 🟡 Minor: Sales report endpoint takes about 4 seconds to respond

- **Surface:** api · **Area:** Admin / Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 4 of 4 attempts
- **Charter:** C7

GET /admin/reports/sales consistently takes about 4 seconds with only a few dozen orders, and the Reports page waits just as long.

**Steps to reproduce**

1. Sign in as admin
2. GET /api/admin/reports/sales
3. Observe a response time of 4001 to 4009 ms, repeated in every run

**Expected:** Under about 3 seconds for a small data set

**Actual:** About 4 seconds every time

**Evidence**

- [evidence/api/baseline-P093.json](evidence/api/baseline-P093.json)
- [evidence/api/prods-R4.json](evidence/api/prods-R4.json)

**Suspected root cause:** Artificial delay or an unoptimised aggregation

**Proposed regression test:** Report responds in under 3000 ms with the seeded data (suggested location: `test/reports.test.js`)

### ISSUE-013 🟡 Minor: My orders table cuts off the Total column on mobile with no cue

- **Surface:** ui · **Area:** Client Portal / My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

At 390px the table scrolls inside its own box; the Total column is clipped and the Date wraps to three lines, and the first row sits partly under the filter bar.

**Steps to reproduce**

1. Sign in as acme-1 with a 390x844 viewport
2. Open My orders
3. Observe the clipped Total column and a row overlapped by the toolbar
4. Reload: same

**Expected:** Totals visible without hidden horizontal scrolling

**Actual:** Total amounts are cut off

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** Table wider than the viewport inside an overflow container

**Proposed regression test:** At 390px the Total column is visible on My orders (suggested location: `e2e/my-orders.mobile.spec.js`)

### ISSUE-014 🟡 Minor: Form controls without accessible names (product select, search, icon buttons)

- **Surface:** ui · **Area:** Client and Admin Portals · **Type:** accessibility
- **Roles:** acme-1, admin
- **Browser / viewport:** Chromium / 1366x768 and 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

The product dropdown on New order, the Admin Orders search box (placeholder only) and the two icon buttons (refresh, clear filters) have no accessible name, so screen readers cannot announce them.

**Steps to reproduce**

1. Open the Client Portal New order page and run the page audit: unnamed select[name=product]
2. Open the Admin Portal Orders page and run the audit: unnamed search input, refresh and clear-filters buttons
3. Repeat at mobile width: same

**Expected:** Every control has a label or aria-label

**Actual:** Four controls are unnamed

**Evidence**

- [screenshots/client-new-order-mobile.png](screenshots/client-new-order-mobile.png)

**Suspected root cause:** Missing label / aria-label attributes

**Proposed regression test:** Accessibility check asserts every form control has an accessible name on these pages (suggested location: `e2e/a11y.spec.js`)

### ISSUE-015 🟡 Minor: Urdu order references render with the hyphen on the wrong side in a left-to-right cell

- **Surface:** ui · **Area:** Client Portal / My orders (Urdu tenant) · **Type:** i18n
- **Roles:** zain-1
- **Browser / viewport:** Chromium / 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

Urdu references such as the company-prefix plus number are placed in left-to-right, left-aligned cells without dir handling, so the hyphen and number order look scrambled.

**Steps to reproduce**

1. Sign in to the Client Portal as zain-1
2. Open My orders
3. Look at the three Urdu references: the hyphen appears at the start of the word and the number follows (see screenshot)
4. The audit flags the same three cells as RTL text in an LTR container

**Expected:** Mixed Urdu-and-number text displayed in a readable order (dir=auto or bdi)

**Actual:** Visually reversed hyphen/number order

**Evidence**

- [screenshots/zain-my-orders-desktop.png](screenshots/zain-my-orders-desktop.png)

**Suspected root cause:** No dir="auto" or <bdi> on user-provided text

**Proposed regression test:** Render an Urdu reference and assert dir=auto on the cell (suggested location: `e2e/rtl.spec.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Place order with no product selected gives no visible feedback** (ui, tried 1×): Clicking Place order on an empty New order form (desktop) showed no new message; the earlier success banner stayed on screen. Why unconfirmed: Seen once; I did not look for a native browser validation bubble or repeat it from a fresh page

## Coverage matrix

| Surface | Area | Role | Viewport | Status | Note |
|---|---|---|---|---|---|
| api | All 13 operations (baseline plans as admin and client, role matrix) | all | n/a | ✅ tested | forgot/reset password excluded (side effects) |
| api | Pricing rules and quantity boundaries | acme-1 | n/a | ✅ tested | below, at and above 1000.00; qty -1, 0, 1000, 1001, 1.5 |
| permissions | Tenant and role isolation (orders, customers, reports, status change) | acme-1, acme-2, bright-1, zain-1, anonymous | n/a | ✅ tested | two critical holes found |
| api | Status lifecycle | admin | n/a | ✅ tested | skip, backward and invalid transitions refused correctly; shipped to cancelled refused (spec says cancelled is allowed, treated as unclear) |
| api | Sign-in, sign-out, bad credentials | acme-2, anonymous | n/a | ✅ tested | login errors do not reveal which accounts exist |
| cross | Admin status change visible to client | admin, acme-1 | desktop | ✅ tested | warm, change, re-read |
| ui | Client Portal: sign in, new order, confirmation, My orders, order detail | acme-1 | desktop | ✅ tested | critical flows 1 and 3 |
| ui | Client Portal: new order, My orders | acme-1 | mobile | ✅ tested | layout findings |
| ui | Client Portal: My orders, order by direct URL | zain-1 | desktop | ✅ tested | RTL and cross-tenant URL |
| ui | Admin Portal: sign in, Orders, order detail and status change, Reports | admin | desktop | ✅ tested | critical flows 2 and 4 |
| ui | Admin Portal: Orders, Reports | admin | mobile | ✅ tested | no layout leads |
| ui | Admin Portal: Customers page | admin | desktop | ⛔ not tested | not opened |
| ui | Sign-out and session reuse in the browser | any | desktop | ◐ partial | verified at the API only |

## Not tested

_Nothing here is reported as passing._

- **Auth / forgot-password and reset-password**: Possible email side effect; excluded from the API plan and no verified safe mail catcher was checked
- **Client Portal / forgot-password page and reset email**: Would send an email; not tried
- **Admin Portal / Export CSV**: Not exercised in this run
- **Admin Portal / Customers page in the browser**: Not opened in the UI; the underlying API was tested
- **Client Portal / expired or cleared session in the browser, and double-submit of the UI form**: Not exercised in this run
- **Client Portal / order detail and order-placing at mobile width for bright-1 and acme-2 roles**: Not exercised separately; layout checked as acme-1 and zain-1
- **Admin Portal / Customers and Reports pages on mobile**: Audit run on Reports at mobile; Customers page not opened
- **Security headers, CORS and rate limiting**: Not covered in this run
- **ui / Admin Portal: Customers page / admin / desktop**: not opened

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| baseline | 100 | 85 | 8 | 11 | [data/api-results/baseline.json](data/api-results/baseline.json) |
| client | 64 | 52 | 12 | 21 | [data/api-results/client.json](data/api-results/client.json) |
| iso | 35 | 30 | 5 | 7 | [data/api-results/iso.json](data/api-results/iso.json) |
| prods | 4 | 3 | 1 | 1 | [data/api-results/prods.json](data/api-results/prods.json) |
| rules | 10 | 9 | 1 | 2 | [data/api-results/rules.json](data/api-results/rules.json) |

## Memory

- Applied: First run: no memory to apply.

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: As a client, GET /admin/customers and expect 403 with no body data → `test/permissions.test.js`
- **ISSUE-002**: Client A creates an order; client B GETs it by id and expects 403/404; A re-reads it → `test/orders-isolation.test.js`
- **ISSUE-003**: Login, logout, then GET /me with the same token expects 401 → `test/auth.test.js`
- **ISSUE-004**: Order at 1000.00 expects discount 5000, tax 9500, total 104500; also 999.50 and 1004.75 → `test/pricing.test.js`
- **ISSUE-005**: POST orders with quantity -1, 0, 1001, 1.5 expect 400; 1 and 1000 expect 201 → `test/orders.test.js`
- **ISSUE-006**: POST order with empty items expects 400 → `test/orders.test.js`
- **ISSUE-007**: Warm list, change status as admin, re-read list and expect the new status → `test/orders-cache.test.js`
- **ISSUE-008**: GET /orders with page_size=0/-1 expects 400; q='(' and q='\' expect 200 → `test/orders-list.test.js`
- **ISSUE-009**: Send malformed JSON and assert the body has no trace/stack and no file paths → `test/errors.test.js`
- **ISSUE-010**: Parallel identical POSTs yield one order or a 409 → `test/orders.test.js`
- **ISSUE-012**: At 390px the New order page does not scroll sideways and Place order is within the viewport → `e2e/new-order.mobile.spec.js`
- **ISSUE-011**: Report responds in under 3000 ms with the seeded data → `test/reports.test.js`
- **ISSUE-013**: At 390px the Total column is visible on My orders → `e2e/my-orders.mobile.spec.js`
- **ISSUE-014**: Accessibility check asserts every form control has an accessible name on these pages → `e2e/a11y.spec.js`
- **ISSUE-015**: Render an Urdu reference and assert dir=auto on the cell → `e2e/rtl.spec.js`

## Notes

- The Customers API response (evidence/api/prods-R2.json) contains what looks like personal data (contact details, national ID numbers, card digits). Automatic masking is not available in this version: review that evidence file and the zain-reads-acme-order screenshot before sharing.
- The test run created QA- prefixed orders (including negative-total orders) that remain in the demo data and are included in the admin report totals; the product has no delete endpoint, so they were not cleaned up.
- Knowledge files applied: api-testing.md, permissions-and-data-isolation.md, payments-and-money.md, browser-testing.md.
