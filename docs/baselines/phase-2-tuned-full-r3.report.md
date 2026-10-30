# QAMind Technical Report: run-20261030T072143Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T07:21:43.021Z |
| Project | ws (path-ws-30b51015561a) |
| Environment | local demo |
| Branch / commit | main @ 384d5d7 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 5m 20s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed |

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (12 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (5 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **4**   🟡 Minor: **4**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **11**
- API probes executed: **210** (43 produced a signal worth a look)

## Test plan (charters)

### C1: Order creation, validation and totals  `api`

- **Goal:** Orders are validated and totalled by the config rules
- **Risk:** Money wrong; invalid quantities accepted
- **Entry point:** POST /api/orders as acme-1 (source: openapi.yaml)
- **Expected results:** qty 1..1000 whole; >=1 item; discount 5% at subtotal>=1000.00; tax 10% of discounted; rounded to cent
- **Exit condition:** Both sides of 1000.00 threshold and quantity bounds checked

### C2: Role and tenant isolation  `permissions`

- **Goal:** Clients never see other companies' data; only admins reach admin endpoints
- **Risk:** Data exposure
- **Entry point:** GET/PATCH /orders/{id}, /admin/* as clients
- **Expected results:** 403/404 for other tenants and non-admins; same-company users share orders
- **Exit condition:** Chain A->B for read and status change, role matrix done

### C3: Auth and sessions  `api`

- **Goal:** Logout revokes token; bad credentials refused
- **Risk:** Session reuse
- **Entry point:** POST /auth/login, /auth/logout, GET /me
- **Expected results:** 401 after logout
- **Exit condition:** logout chain run

### C4: Status workflow and staleness  `cross`

- **Goal:** Admin status changes show to client at once; transitions legal
- **Risk:** Stale status
- **Entry point:** Admin PATCH status; client GET list and detail (warm, change, re-read)
- **Expected results:** placed->processing->shipped->delivered; illegal moves 409
- **Exit condition:** warm/change/re-read done in API and UI

### C5: Client Portal flows  `ui`

- **Goal:** Place order, My Orders, detail, sign-out; desktop+mobile; Urdu RTL for zain-1
- **Risk:** Broken flow, layout, RTL
- **Entry point:** http://127.0.0.1:4102
- **Expected results:** Critical flows 1,3,5 work
- **Exit condition:** All pages audited

### C6: Admin Portal flows  `ui`

- **Goal:** Orders list, detail, status change, Customers, Reports
- **Risk:** Wrong numbers, broken pages
- **Entry point:** http://127.0.0.1:4101
- **Expected results:** Flows 2,4 work; reports match orders
- **Exit condition:** All pages audited

## Findings

### ISSUE-001 🔴 Critical: Any client account can list all customers' personal and payment details via /admin/customers

- **Surface:** permissions · **Area:** Admin customers · **Type:** permissions
- **Roles:** acme-1, bright-1
- **Reproduced:** 2 of 2 attempts

GET /api/admin/customers returns HTTP 200 with every customer record to client users of two different companies; the config says only admins may see customers. Records include contact name, email, phone, national ID, address and card last-4 fields.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/admin/customers (see evidence for the exact request)
3. Observe HTTP 200 with the full customer list
4. Repeat as bright-1 (a different company): same result

**Expected:** HTTP 403 for non-admin roles (as /admin/reports/sales does)

**Actual:** HTTP 200 with all customers' records, including personal-data field names such as email, phone, cnic, address, card_last4

**Evidence**

- [evidence/api/probe1-R2.json](evidence/api/probe1-R2.json)
- [evidence/api/rules-I10.json](evidence/api/rules-I10.json)

**Suspected root cause:** The customers route lacks the admin-role check that the reports route has

**Proposed regression test:** As a client, GET /api/admin/customers and expect 403 (suggested location: `test/permissions.test.js`)

### ISSUE-002 🔴 Critical: A client can read another company's orders by id

- **Surface:** permissions · **Area:** Orders · **Type:** data-isolation
- **Roles:** bright-1, zain-1, acme-1
- **Reproduced:** 2 of 2 attempts

GET /api/orders/{id} returns 200 and the full order to a user of a different company. The Client Portal order page also shows it when the id is changed in the URL. The list and search endpoints are correctly scoped.

**Steps to reproduce**

1. Sign in as acme-1 and place a QA- order, note its id
2. Sign in as bright-1 (or zain-1) and GET /api/orders/{id}
3. Observe HTTP 200 with the Acme order
4. In the Client Portal as zain-1, open order.html?id=<that id>: the order page loads

**Expected:** 403 or 404 for other companies' orders

**Actual:** HTTP 200 with the order body; the UI page title and content show the other company's order

**Evidence**

- [evidence/api/rules-I2.json](evidence/api/rules-I2.json)
- [evidence/api/rules-I8.json](evidence/api/rules-I8.json)
- [screenshots/zain-views-acme-order.png](screenshots/zain-views-acme-order.png)

**Suspected root cause:** Order detail looks up by id without filtering on the caller's company

**Proposed regression test:** Client A creates an order; client B GET /orders/{id} expects 403/404 (suggested location: `test/orders.test.js`)

### ISSUE-003 🔴 Critical: Signing out does not revoke the API token

- **Surface:** api · **Area:** Auth · **Type:** session
- **Roles:** zain-1
- **Reproduced:** 2 of 2 attempts

POST /auth/logout returns 204, but the same token keeps working on /me and /orders afterwards, against the rule that signing out ends the session at once.

**Steps to reproduce**

1. Sign in as zain-1 over the API
2. POST /api/auth/logout (204)
3. GET /api/me with the same token
4. GET /api/orders with the same token
5. Observe HTTP 200 for both

**Expected:** HTTP 401 after logout

**Actual:** HTTP 200 on /me and /orders after logout

**Evidence**

- [evidence/api/rules-A2.json](evidence/api/rules-A2.json)
- [evidence/api/rules-A3.json](evidence/api/rules-A3.json)

**Suspected root cause:** Logout does not invalidate the token server-side; the UI only clears local storage

**Proposed regression test:** Logout then GET /me with the same token expects 401 (suggested location: `test/auth.test.js`)

### ISSUE-004 🔴 Critical: Tax is charged on the pre-discount subtotal, so discounted orders are overcharged

- **Surface:** business-rule · **Area:** Orders · **Type:** calculation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

For orders at or above 1,000.00 the discount is correct but tax is 10% of the full subtotal instead of the discounted subtotal, so totals are too high.

**Steps to reproduce**

1. Sign in as acme-1
2. POST /api/orders with 100 x p-101 and 100 x p-104 (subtotal 1,000.00)
3. Observe discount 50.00, tax 100.00, total 1,050.00
4. In the Client Portal, order 12 x Printer Toner Cartridge: confirmation shows Total $1,133.88

**Expected:** Subtotal 1,000.00: discount 50.00, tax 95.00, total 1,045.00. For 12 toner (1,079.88): total 1,128.48

**Actual:** Total 1,050.00 for the 1,000.00 order (tax 100.00); UI shows $1,133.88 for the toner order (tax 107.99)

**Evidence**

- [evidence/api/thresh2-U2.json](evidence/api/thresh2-U2.json)
- [evidence/api/thresh2-U4.json](evidence/api/thresh2-U4.json)
- [screenshots/client-order-confirmation-desktop.png](screenshots/client-order-confirmation-desktop.png)

**Suspected root cause:** Tax is computed from the subtotal rather than subtotal minus discount

**Proposed regression test:** Order with subtotal 100000 cents expects discount 5000, tax 9500, total 104500 (suggested location: `test/pricing.test.js`)

### ISSUE-005 🔴 Critical: Orders accept empty item lists and out-of-range or fractional quantities, including negative totals

- **Surface:** api · **Area:** Orders · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

POST /api/orders returns 201 for an empty items array and for quantity 0, -3, 1001 and 1.5. A quantity of -3 creates an order with a negative total. Rules require a whole number from 1 to 1,000 and at least one item.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. POST /api/orders with items[0].quantity = -3 (see evidence)
3. Observe HTTP 201 with total_cents -2145
4. Repeat with items = [], quantity 0, 1001 and 1.5: all 201

**Expected:** HTTP 400 naming the field

**Actual:** HTTP 201 and the order is stored (negative order total visible in My Orders)

**Evidence**

- [evidence/api/rules-B7.json](evidence/api/rules-B7.json)
- [evidence/api/client-P043.json](evidence/api/client-P043.json)
- [evidence/api/client-P044.json](evidence/api/client-P044.json)
- [evidence/api/client-P045.json](evidence/api/client-P045.json)
- [evidence/api/client-P046.json](evidence/api/client-P046.json)

**Suspected root cause:** No quantity or items validation in the order handler

**Proposed regression test:** POST orders with each invalid quantity and empty items; expect 400 (suggested location: `test/orders.test.js`)

### ISSUE-006 🟠 Important: Client's order list shows a stale status after an admin changes it

- **Surface:** cross · **Area:** Orders · **Type:** stale-data
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts

After an admin moves an order forward, GET /orders/{id} shows the new status but the client's list (GET /orders) keeps showing 'placed', including after a reload and again after the admin changes it a second time.

**Steps to reproduce**

1. As acme-1 read GET /orders (warm)
2. As admin PATCH /admin/orders/{id}/status to processing (also done via the Admin Portal)
3. As acme-1 GET /orders/{id}: processing
4. As acme-1 GET /orders?q=<reference>: still placed

**Expected:** List and detail agree straight away

**Actual:** Detail says processing/shipped; list says placed

**Evidence**

- [evidence/api/rules-S4.json](evidence/api/rules-S4.json)
- [evidence/api/rules-S9.json](evidence/api/rules-S9.json)
- [evidence/api/stale-D2.json](evidence/api/stale-D2.json)

**Suspected root cause:** Order list is cached per company and not invalidated on status change

**Proposed regression test:** Warm list, change status as admin, list expects the new status (suggested location: `test/orders.test.js`)

### ISSUE-007 🟠 Important: GET /orders returns HTTP 500 for page_size=0 and for q=( or q=\

- **Surface:** api · **Area:** Orders list · **Type:** error-handling
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts

Zero page size and search text containing a regex special character crash the list endpoint.

**Steps to reproduce**

1. Sign in as acme-1 over the API
2. GET /api/orders?page_size=0, then ?q=( and ?q=\ (see evidence)
3. Observe HTTP 500 each time

**Expected:** HTTP 400 for page_size=0; 200 with matches (or none) for special-character searches

**Actual:** HTTP 500

**Evidence**

- [evidence/api/client-P019.json](evidence/api/client-P019.json)
- [evidence/api/client-P024.json](evidence/api/client-P024.json)
- [evidence/api/client-P028.json](evidence/api/client-P028.json)

**Suspected root cause:** Search text is used as a regular expression unescaped; page_size=0 causes a bad calculation

**Proposed regression test:** GET /orders?q=( and page_size=0 expect non-5xx (suggested location: `test/orders.test.js`)

### ISSUE-008 🟠 Important: Malformed JSON responses expose a stack trace and server file paths

- **Surface:** api · **Area:** Error handling · **Type:** information-leak
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts

Sending invalid JSON to POST /auth/login or POST /orders returns 400 with a stack trace and server source paths in the body.

**Steps to reproduce**

1. POST /api/auth/login with a malformed JSON body (see evidence)
2. Observe the 400 body contains a stack field and file paths
3. Same on POST /api/orders

**Expected:** A short error message without internals

**Actual:** Body includes stack trace and server paths

**Evidence**

- [evidence/api/client-P007.json](evidence/api/client-P007.json)
- [evidence/api/client-P048.json](evidence/api/client-P048.json)

**Suspected root cause:** Error middleware serialises err.stack

**Proposed regression test:** Malformed JSON expects 400 without 'stack' or file paths (suggested location: `test/errors.test.js`)

### ISSUE-009 🟠 Important: My Orders on mobile (390px): first row hidden under the toolbar and Total column cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / My Orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** chromium / 390x844
- **Reproduced:** 2 of 2 attempts

At 390x844 the first order row sits about 22px under the Status/New order toolbar, and the table scrolls sideways (438px in 359px) with the Total column clipped and no visible cue.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Resize to 390x844
3. Open My orders
4. Observe the first row's reference is covered and totals are cut off
5. Reload and repeat: same

**Expected:** All rows and totals visible without overlap

**Actual:** First row overlapped; Total clipped

**Evidence**

- [screenshots/client-my-orders-mobile.png](screenshots/client-my-orders-mobile.png)

**Suspected root cause:** Toolbar overlaps the table (negative margin or fixed height) and table has fixed min-width

**Proposed regression test:** Visual check at 390px that the first row is not covered (suggested location: `test/ui/my-orders.mobile.test.js`)

### ISSUE-010 🟡 Minor: Controls without accessible names: product dropdown, admin search, refresh and clear buttons

- **Surface:** ui · **UI:** both · **Area:** Accessibility · **Type:** accessibility
- **Roles:** acme-1, admin
- **Browser / viewport:** chromium / desktop
- **Reproduced:** 2 of 2 attempts

The New order product select (Client Portal) and the Admin Orders search box (placeholder only) and the refresh and clear-filter icon buttons have no accessible name.

**Steps to reproduce**

1. Open Client Portal New order and run the page audit: unnamedControls lists the product select
2. Open Admin Portal Orders and run the audit: search, refresh and clear buttons listed

**Expected:** Every control has a label or aria-label

**Actual:** Unnamed controls

**Evidence**

- [screenshots/admin-orders-mobile.png](screenshots/admin-orders-mobile.png)

**Suspected root cause:** Missing label/aria-label

**Proposed regression test:** Accessibility check that all form controls have names (suggested location: `test/ui/a11y.test.js`)

### ISSUE-011 🟡 Minor: Sales report takes about 4 seconds to load

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts

GET /admin/reports/sales consistently takes about 4 s while other calls take a few ms.

**Steps to reproduce**

1. Sign in as admin
2. GET /api/admin/reports/sales twice
3. Observe 4003 ms and 4010 ms

**Expected:** Under about 3 s

**Actual:** About 4 s

**Evidence**

- [evidence/api/probe1-R4.json](evidence/api/probe1-R4.json)

**Suspected root cause:** Artificial delay or an unindexed aggregate

**Proposed regression test:** Report responds within 3 s (suggested location: `test/reports.test.js`)

### ISSUE-012 🟡 Minor: page_size=-1 is accepted and echoed back in GET /orders

- **Surface:** api · **Area:** Orders list · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

A negative page size returns 200 with page_size -1, which breaks the documented minimum of 1.

**Steps to reproduce**

1. GET /api/orders?page_size=-1 as acme-1
2. Observe HTTP 200 and page_size -1 in the body

**Expected:** HTTP 400 or a clamped value

**Actual:** 200 with page_size -1

**Evidence**

- [evidence/api/client-P020.json](evidence/api/client-P020.json)

**Suspected root cause:** No range check on page_size

**Proposed regression test:** page_size=-1 expects 400 (suggested location: `test/orders.test.js`)

### ISSUE-013 🟡 Minor: Two simultaneous identical order submissions both create orders

- **Surface:** api · **Area:** Orders · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts

Sending the same POST /orders twice at once returns 201 for both. I am unsure whether duplicates are intended, as there is no idempotency key in the spec.

**Steps to reproduce**

1. POST /api/orders twice in parallel with identical QA- body (see evidence)
2. Observe two 201 responses

**Expected:** A single order, or a documented duplicate guard

**Actual:** Both accepted

**Evidence**

- [evidence/api/client-P049.json](evidence/api/client-P049.json)

**Suspected root cause:** No duplicate guard

**Proposed regression test:** Parallel identical POSTs create at most one order (suggested location: `test/orders.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Status | Note |
|---|---|---|---|---|---|
| api | All 13 documented operations (baseline plans, role matrix) | admin | n/a | ✅ tested | baseline plan with 100 probes |
| api | Orders create, validation, discount threshold, tax | acme-1 | n/a | ✅ tested | boundaries at 999.50, 1000.00, 1002.25 |
| permissions | Tenant and role isolation | bright-1 | n/a | ✅ tested | detail, list, search, status change, customers |
| api | Auth logout | zain-1 | n/a | ✅ tested | token after logout |
| cross | Status workflow and staleness | admin | n/a | ✅ tested | transitions, warm/change/re-read |
| ui | Sign in, New order, confirmation, order detail, My orders, sign out | acme-1 | desktop | ✅ tested | page audit |
| ui | My orders | acme-1 | mobile | ✅ tested | layout finding |
| ui | My orders and cross-company order URL | zain-1 | desktop | ✅ tested | RTL references |
| ui | Orders list, order detail and status update, Reports | admin | desktop | ✅ tested | page audit |
| ui | Orders list | admin | mobile | ✅ tested | no layout issues |
| ui | Customers page | admin | desktop | ⛔ not tested | not opened (shows personal data) |
| ui | Client Portal pages on mobile other than My orders | acme-1 | mobile | ⛔ not tested | not reached |

## Not tested

_Nothing here is reported as passing._

- **API / forgot-password and reset-password**: Would send email; excluded as possible side effect and no email sandbox confirmed
- **Client Portal / forgot-password page**: Would trigger an email; no mail catcher access configured
- **Client Portal / New order page on mobile, order detail on mobile**: Not reached in this run
- **Client Portal / Urdu (zain-1) on mobile and new-order page in RTL**: Not reached in this run; only My orders was checked on desktop
- **Admin Portal / Customers page (UI), order detail and Reports on mobile**: Not reached in this run
- **UI forms / double-submit, long input, special characters, expired session by clearing storage**: Not reached in this run; covered through the API only
- **Keyboard and focus accessibility checks**: Not reached in this run; only the automated page audit was used
- **Security headers, CORS and rate limiting**: Not reached in this run
- **Reports figures vs order totals**: Not recalculated; totals depend on the tax defect
- **ui / Customers page / admin / desktop**: not opened (shows personal data)
- **ui / Client Portal pages on mobile other than My orders / acme-1 / mobile**: not reached

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin | 100 | 85 | 8 | 11 | [data/api-results/admin.json](data/api-results/admin.json) |
| client | 64 | 52 | 12 | 21 | [data/api-results/client.json](data/api-results/client.json) |
| probe1 | 4 | 3 | 1 | 1 | [data/api-results/probe1.json](data/api-results/probe1.json) |
| rules | 31 | 23 | 8 | 9 | [data/api-results/rules.json](data/api-results/rules.json) |
| stale | 2 | 1 | 1 | 1 | [data/api-results/stale.json](data/api-results/stale.json) |
| thresh | 5 | 5 | 0 | 0 | [data/api-results/thresh.json](data/api-results/thresh.json) |
| thresh2 | 4 | 4 | 0 | 0 | [data/api-results/thresh2.json](data/api-results/thresh2.json) |

## Memory

- Applied: First run: no previous findings; stack detected as javascript/node:test

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: As a client, GET /api/admin/customers and expect 403 → `test/permissions.test.js`
- **ISSUE-002**: Client A creates an order; client B GET /orders/{id} expects 403/404 → `test/orders.test.js`
- **ISSUE-003**: Logout then GET /me with the same token expects 401 → `test/auth.test.js`
- **ISSUE-004**: Order with subtotal 100000 cents expects discount 5000, tax 9500, total 104500 → `test/pricing.test.js`
- **ISSUE-005**: POST orders with each invalid quantity and empty items; expect 400 → `test/orders.test.js`
- **ISSUE-006**: Warm list, change status as admin, list expects the new status → `test/orders.test.js`
- **ISSUE-007**: GET /orders?q=( and page_size=0 expect non-5xx → `test/orders.test.js`
- **ISSUE-008**: Malformed JSON expects 400 without 'stack' or file paths → `test/errors.test.js`
- **ISSUE-009**: Visual check at 390px that the first row is not covered → `test/ui/my-orders.mobile.test.js`
- **ISSUE-010**: Accessibility check that all form controls have names → `test/ui/a11y.test.js`
- **ISSUE-011**: Report responds within 3 s → `test/reports.test.js`
- **ISSUE-012**: page_size=-1 expects 400 → `test/orders.test.js`
- **ISSUE-013**: Parallel identical POSTs create at most one order → `test/orders.test.js`

## Notes

- Product prices are in cents; the API runs created many QA- prefixed orders (references starting QA-) that were not deleted because the API has no delete endpoint.
- The customers API response contains what looks like personal data; none is quoted in this report. Review evidence/api/probe1-R2.json before sharing.
