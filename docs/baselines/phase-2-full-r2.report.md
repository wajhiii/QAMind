# QAMind Technical Report: run-20261030T065323Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T06:53:23.259Z |
| Project | ws (path-ws-7dbdf7f4c2b5) |
| Environment | local demo |
| Branch / commit | main @ 6a010f4 |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 4m 19s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.0 |
| Stop reason | completed |

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (17 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (3 ms) |
| API base responds | ✅ ok | HTTP 404 (1 ms) |
| Health check /health | ✅ ok | HTTP 200 (2 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (6 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **3**   🟡 Minor: **5**
- Unconfirmed (not reproduced twice): **0**
- Areas not tested: **6**
- API probes executed: **197** (42 produced a signal worth a look)

## Test plan (charters)

### C1: API contract, auth and validation baseline  `api`

- **Goal:** Every documented endpoint behaves per openapi.yaml
- **Risk:** Spec drift, 5xx on bad input, error leakage
- **Entry point:** api plan as admin and as a client (openapi.yaml inventory)
- **Expected results:** 401 without token, 400 on bad input, documented statuses only
- **Exit condition:** Baseline plans run as admin and client; signals judged

### C2: Order totals, discount threshold and quantity limits  `business-rule`

- **Goal:** Totals follow subtotal, 5% discount at >=1000.00, 10% tax on discounted subtotal
- **Risk:** Money wrong
- **Entry point:** POST /api/orders as acme-1, then UI
- **Expected results:** total = subtotal - discount + tax, where tax is 10% of (subtotal - discount); quantity 1..1000 integers
- **Exit condition:** Just below, at and above 1000.00 checked; quantity 0, 1, 1000, 1001, decimals checked

### C3: Role and tenant isolation  `permissions`

- **Goal:** Clients never see other companies' data; only admins reach admin endpoints
- **Risk:** Data exposure
- **Entry point:** API chains and direct URLs in both portals
- **Expected results:** 403/404 across tenants, 403 for clients on admin endpoints, same-company sharing works
- **Exit condition:** All role/tenant pairs probed by API and by URL

### C4: Sessions and sign-out  `api`

- **Goal:** Logout revokes the token at once
- **Risk:** Session reuse
- **Entry point:** POST /auth/logout then GET /me
- **Expected results:** 401 after logout
- **Exit condition:** Probed via API and UI

### C5: Client Portal critical flow  `ui`

- **Goal:** Client places an order and sees it in My Orders
- **Risk:** Core flow broken
- **Entry point:** http://127.0.0.1:4102 as acme-1
- **Expected results:** Confirmation with correct total; order listed
- **Exit condition:** Desktop and mobile; audit on each page; Urdu client checked for RTL

### C6: Admin Portal: orders, status, customers, reports  `ui`

- **Goal:** Admin finds order, advances status, sees reports
- **Risk:** Core flow broken, wrong report figures
- **Entry point:** http://127.0.0.1:4101 as admin
- **Expected results:** Status moves forward; reports equal sum of orders
- **Exit condition:** All admin pages desktop and mobile

### C7: Cross-UI consistency  `cross`

- **Goal:** Admin status change shows in client UI and API; totals agree
- **Risk:** Stale or inconsistent data
- **Entry point:** Order created in C5
- **Expected results:** Same status/total everywhere
- **Exit condition:** Verified after reload in all three places

### C8: Password reset flow  `ui`

- **Goal:** Forgot/reset pages behave; email goes only to local catcher
- **Risk:** Real email side effect, token weakness
- **Entry point:** Client Portal forgot-password
- **Expected results:** Generic response; no account enumeration
- **Exit condition:** Pages and validation checked; email delivery judged against safety rules

## Findings

### ISSUE-001 🔴 Critical: Orders: any signed-in user can read another company's order

- **Surface:** permissions · **Area:** Orders / tenant isolation · **Type:** permissions
- **Roles:** bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

A client from one company can open orders that belong to another company by id, in the API and in the Client Portal. This breaks the rule that different companies never see each other's data.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-iso and one line (p-101, quantity 2); note the returned id
2. Sign in as bright-1 and GET /api/orders/{id} for that id (see evidence rules-I03 for the exact request)
3. Repeat as zain-1 (rules-I04)
4. In the Client Portal, signed in as zain-1, open order.html?id=<an Acme order id> and read the page title and contents (screenshots/zain-views-acme-order.png)

**Expected:** HTTP 403 or 404 for an order of another company

**Actual:** HTTP 200 with the full order for bright-1 and zain-1; the Client Portal shows the Acme order to a Zain user

**Evidence**

- [evidence/api/rules-I03.json](evidence/api/rules-I03.json)
- [evidence/api/rules-I04.json](evidence/api/rules-I04.json)
- [screenshots/zain-views-acme-order.png](screenshots/zain-views-acme-order.png)

**Suspected root cause:** GET /orders/{id} does not compare the order's client to the caller's company (the list endpoint does filter correctly)

**Proposed regression test:** As a client of company B, GET an order of company A and expect 403/404 (suggested location: `test/orders.test.mjs`)

### ISSUE-002 🔴 Critical: Admin customers: any client can list every customer record with personal and payment details

- **Surface:** permissions · **Area:** Admin API / customers · **Type:** permissions
- **Roles:** acme-1, bright-1, acme-2, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

GET /api/admin/customers returns the full customer list to client accounts, not only admins. The records include contact details, an identity number, address, card digits and free-text notes for other companies.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/admin/customers (evidence rules-R01)
3. Repeat as bright-1 (rules-R02)
4. Observe HTTP 200 with every company's record

**Expected:** HTTP 403 for non-admin roles (config rule: only admins can see customers)

**Actual:** HTTP 200 with all customer records. The role matrix shows 200 for all four client accounts, while /admin/reports/sales correctly gives 403

**Evidence**

- [evidence/api/rules-R01.json](evidence/api/rules-R01.json)
- [evidence/api/rules-R02.json](evidence/api/rules-R02.json)

**Suspected root cause:** Missing admin role check on the customers route

**Proposed regression test:** GET /admin/customers as a client expects 403 (suggested location: `test/admin.test.mjs`)

### ISSUE-003 🔴 Critical: Orders: total is wrong on orders at or above 1,000.00 because tax ignores the discount

- **Surface:** business-rule · **Area:** Orders / pricing · **Type:** business-rule
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

Tax is calculated on the full subtotal instead of the discounted subtotal, so every discounted order is overcharged. The wrong total appears in the API, the order confirmation, My Orders and the Admin Portal.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with p-102 x 80 (subtotal 1,000.00) (rules-T01); then p-104 x 1000 (subtotal 3,500.00) (rules-T04)
3. Compare the response with the rule: tax = 10% of (subtotal - discount)
4. In the Client Portal as acme-1, place an order of Ballpoint Pens x 80 with reference QA-ui-1 and read the confirmation banner

**Expected:** 1,000.00: discount 50.00, tax 95.00, total 1,045.00. 3,500.00: discount 175.00, tax 332.50, total 3,657.50

**Actual:** 1,000.00: tax 100.00, total 1,050.00 (banner says $1,050.00). 3,500.00: tax 350.00, total 3,675.00. Orders below 1,000.00 are correct (989.89 gives 98.99 tax)

**Evidence**

- [evidence/api/rules-T01.json](evidence/api/rules-T01.json)
- [evidence/api/rules-T04.json](evidence/api/rules-T04.json)
- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)

**Suspected root cause:** src/pricing.mjs computes tax from subtotal rather than subtotal - discount

**Proposed regression test:** Price a 1,000.00 order and expect tax 9500 and total 104500 cents (suggested location: `test/orders.test.mjs`)

### ISSUE-004 🔴 Critical: Sign-out: the token still works after signing out

- **Surface:** api · **Area:** Auth / sessions · **Type:** auth
- **Roles:** acme-2
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

After POST /auth/logout returns 204, the same token still reads /me and /orders. A stolen or left-behind session cannot be ended.

**Steps to reproduce**

1. Sign in over the API as acme-2
2. POST /api/auth/logout (204)
3. GET /api/me with the same token, then GET /api/orders (evidence rules-L02, rules-L03)

**Expected:** HTTP 401 immediately after sign-out (config rule: signing out ends the session at once)

**Actual:** HTTP 200 for both requests, 2 of 2 runs

**Evidence**

- [evidence/api/rules-L02.json](evidence/api/rules-L02.json)
- [evidence/api/rules-L03.json](evidence/api/rules-L03.json)

**Suspected root cause:** Logout does not revoke the token, or the auth check does not consult the revocation list

**Proposed regression test:** Log out, then GET /me with the same token and expect 401 (suggested location: `test/auth.test.mjs`)

### ISSUE-005 🔴 Critical: Orders: zero, negative, fractional and oversized quantities and empty item lists are accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

POST /orders accepts an empty items list and quantities of 0, -3, 1.5 and 1001, creating orders (one with a negative total of -21.45) that appear in both portals and in sales reporting.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items = [] (client-baseline-P043)
3. POST with quantity 0, 1001 and 1.5 (P044, P045, P046)
4. POST with quantity -3 (rules-T07) and read the negative total

**Expected:** HTTP 400 (rule: whole number 1 to 1,000, at least one item)

**Actual:** HTTP 201 each time; order created. The negative-quantity order shows -$21.45 in the Admin Portal list

**Evidence**

- [evidence/api/client-baseline-P043.json](evidence/api/client-baseline-P043.json)
- [evidence/api/client-baseline-P044.json](evidence/api/client-baseline-P044.json)
- [evidence/api/client-baseline-P045.json](evidence/api/client-baseline-P045.json)
- [evidence/api/client-baseline-P046.json](evidence/api/client-baseline-P046.json)
- [evidence/api/rules-T07.json](evidence/api/rules-T07.json)

**Suspected root cause:** No server-side validation of items in the order handler

**Proposed regression test:** POST orders with empty items and quantities 0, -1, 1.5, 1001 and expect 400 (suggested location: `test/orders.test.mjs`)

### ISSUE-006 🟠 Important: Orders list: page_size=0 and search text '(' or '\' return HTTP 500

- **Surface:** api · **Area:** Orders / list · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /orders crashes with a server error on page_size=0 and on searches containing an unbalanced bracket or backslash, so a client searching for such text gets an error. The spec says 400 for invalid input.

**Steps to reproduce**

1. Sign in over the API as acme-1 (or admin)
2. GET /api/orders?page_size=0 (P019)
3. GET /api/orders?q=( (P024) and ?q=\ (P028)

**Expected:** 200 with results (search) or 400 (page_size=0)

**Actual:** HTTP 500 each time, 2 of 2 runs, as both roles. The same probes ran as admin: admin-baseline-P019, P024, P028

**Evidence**

- [evidence/api/client-baseline-P019.json](evidence/api/client-baseline-P019.json)
- [evidence/api/client-baseline-P024.json](evidence/api/client-baseline-P024.json)
- [evidence/api/client-baseline-P028.json](evidence/api/client-baseline-P028.json)

**Suspected root cause:** The search text is used as a regular expression without escaping, and page_size 0 is not rejected

**Proposed regression test:** GET /orders?q=( and ?page_size=0 and expect non-5xx (suggested location: `test/orders.test.mjs`)

### ISSUE-008 🟠 Important: API: malformed JSON returns a stack trace and server file paths

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Sending invalid JSON to POST /auth/login or POST /orders returns a 400 whose body includes a stack trace and source paths on the server.

**Steps to reproduce**

1. POST /api/auth/login with body {bad (client-baseline-P007)
2. As acme-1 POST /api/orders with malformed JSON (client-baseline-P048)

**Expected:** A short 400 message without internal details

**Actual:** 400 with stack and file paths in the body, 2 of 2 runs

**Evidence**

- [evidence/api/client-baseline-P007.json](evidence/api/client-baseline-P007.json)
- [evidence/api/client-baseline-P048.json](evidence/api/client-baseline-P048.json)

**Suspected root cause:** The error handler returns the error stack to the client

**Proposed regression test:** Malformed JSON expects 400 and a body without 'stack' or file paths (suggested location: `test/auth.test.mjs`)

### ISSUE-009 🟠 Important: Orders: submitting the same order twice at once creates two orders

- **Surface:** api · **Area:** Orders / duplicates · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

Two identical POST /orders sent in parallel both returned 201. The API has no duplicate protection, so a double click can place and bill two orders. The spec does not document duplicates as intended, so this is reported with that doubt.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send the same POST /api/orders twice in parallel (client-baseline-P049)

**Expected:** One order, or a documented duplicate rule

**Actual:** 201 for both requests in 2 of 2 runs

**Evidence**

- [evidence/api/client-baseline-P049.json](evidence/api/client-baseline-P049.json)

**Proposed regression test:** Two parallel identical order POSTs yield one order (suggested location: `test/orders.test.mjs`)

### ISSUE-007 🟡 Minor: Orders list: page_size=-1 is accepted instead of refused

- **Surface:** api · **Area:** Orders / list · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /orders?page_size=-1 returns 200 and echoes page_size -1, which is outside the documented minimum of 1.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?page_size=-1 (client-baseline-P020)

**Expected:** HTTP 400, or a clamp to a valid size

**Actual:** HTTP 200 and page_size -1 in the body

**Evidence**

- [evidence/api/client-baseline-P020.json](evidence/api/client-baseline-P020.json)

**Proposed regression test:** page_size=-1 expects 400 (suggested location: `test/orders.test.mjs`)

### ISSUE-010 🟡 Minor: Sales report is slow: GET /admin/reports/sales takes about 4 seconds

- **Surface:** api · **Area:** Reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

The sales summary takes 4.0 s every time, and the Admin Portal Reports page shows only a heading until it finishes.

**Steps to reproduce**

1. Sign in over the API as admin
2. GET /api/admin/reports/sales (admin-baseline-P061, admin-baseline-P093, sums-U02)

**Expected:** Under 3 s on a small data set

**Actual:** 4002 to 4007 ms in 3 of 3 runs

**Evidence**

- [evidence/api/admin-baseline-P061.json](evidence/api/admin-baseline-P061.json)
- [evidence/api/sums-U02.json](evidence/api/sums-U02.json)
- [screenshots/admin-reports-desktop.png](screenshots/admin-reports-desktop.png)

**Proposed regression test:** Sales report responds in under 3 s on the seed data (suggested location: `test/admin.test.mjs`)

### ISSUE-011 🟡 Minor: Client Portal (mobile 390px): My orders toolbar covers the first row and the Total column is cut off

- **Surface:** ui · **Area:** My orders · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

On a phone-width screen the Status filter and New order button overlap the top of the orders table, and the Total amounts are clipped inside a sideways-scrolling table.

**Steps to reproduce**

1. Set the viewport to 390x844
2. Sign in to the Client Portal as acme-1
3. Open My orders and look at the first row and the Total column (screenshots/client-myorders-mobile.png)
4. Reload and run the page audit: coveredElements lists the first row and the reference link

**Expected:** No overlap; amounts readable

**Actual:** The toolbar sits over the first row; totals such as $1,050.00 show truncated

**Evidence**

- [screenshots/client-myorders-mobile.png](screenshots/client-myorders-mobile.png)

**Proposed regression test:** Layout check at 390px: toolbar does not cover the table (suggested location: `test/ui (browser test)`)

### ISSUE-012 🟡 Minor: Portals: some controls have no accessible name

- **Surface:** ui · **Area:** Accessibility · **Type:** accessibility
- **Roles:** admin, acme-1
- **Browser / viewport:** Chromium / 1366x768 and 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C6

Two icon buttons (refresh and clear filters) and the search box on the Admin Portal Orders page, and the product dropdown on the Client Portal New order page, have no label for screen readers.

**Steps to reproduce**

1. Sign in to the Admin Portal as admin and open Orders
2. Read the page snapshot: two buttons with no name; run the page audit at 390px (admin-orders-mobile.png)
3. Sign in to the Client Portal as acme-1, open New order and run the audit: the product select is unnamed

**Expected:** Every control has an accessible name

**Actual:** Unnamed controls as listed

**Evidence**

- [screenshots/admin-orders-mobile.png](screenshots/admin-orders-mobile.png)
- [screenshots/client-confirmation-desktop.png](screenshots/client-confirmation-desktop.png)

**Proposed regression test:** Audit the Orders and New order pages for unnamed controls (suggested location: `test/ui (browser test)`)

### ISSUE-013 🟡 Minor: Client Portal: Urdu order references show the hyphen on the wrong side

- **Surface:** ui · **Area:** i18n / RTL · **Type:** rtl
- **Roles:** zain-1
- **Browser / viewport:** Chromium / 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

For the Urdu company, references such as the Urdu word followed by a hyphen and 1044 appear with the hyphen at the left edge, because the text sits in a left-to-right cell. The audit reports 3 such cells. This may be a rendering preference; it reads oddly to an Urdu reader.

**Steps to reproduce**

1. Sign in to the Client Portal as zain-1
2. Open My orders
3. Look at the Reference column (screenshots/zain-myorders-desktop.png)

**Expected:** Mixed Urdu and number text in a sensible visual order

**Actual:** Hyphen displayed first, before the number, on 3 of 3 rows

**Evidence**

- [screenshots/zain-myorders-desktop.png](screenshots/zain-myorders-desktop.png)

**Proposed regression test:** Render an Urdu reference with dir=auto and check order (suggested location: `test/ui (browser test)`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

_None._

## Coverage matrix

| Surface | Area | Role | Viewport | Status | Note |
|---|---|---|---|---|---|
| api | All 13 documented endpoints (baseline plans) | admin | - | ◐ partial | forgot/reset password excluded as side-effect endpoints |
| api | Orders validation, totals, thresholds | acme-1 | - | ✅ tested | 999.89, 1000.00, 1003.50, 3500.00, quantity bounds |
| permissions | Tenant and role isolation | acme-1, acme-2, bright-1, zain-1 | - | ✅ tested | status change and list isolation OK; order detail and customers leak |
| api | Order status lifecycle | admin | - | ✅ tested | skip, backward and after-cancel moves refused |
| api | Sign-out | acme-2 | - | ✅ tested | token still valid |
| ui | New order and confirmation | acme-1 | desktop | ✅ tested |  |
| ui | My orders | acme-1 | mobile | ✅ tested |  |
| ui | My orders (Urdu) | zain-1 | desktop | ✅ tested |  |
| ui | Admin Orders, order detail, status update | admin | desktop | ✅ tested |  |
| ui | Admin Orders | admin | mobile | ✅ tested |  |
| ui | Admin Reports | admin | desktop | ✅ tested | report totals add up: 28+4+3 orders, 2,679,678 cents |
| cross | Status change to client view | acme-1 | - | ◐ partial | verified through the API; Client Portal reload not repeated after the UI change |

## Not tested

_Nothing here is reported as passing._

- **Password reset (forgot-password and reset-password, API and Client Portal pages)**: Endpoints send email; they were left out of the API plans and no confirmed local mail catcher was set up for this run
- **Admin Portal: Export CSV**: Not covered in this run; file download not exercised
- **Admin Portal: Customers page in the browser, order detail at mobile width, search and pagination edge values in the UI**: Not covered in this run; customers data is reached through the API only (finding reported)
- **UI form edge cases (long text, special characters, double-click submit, expired session via cleared storage) on New order**: Not covered in this run; API equivalents were tested
- **Client Portal New order and order detail pages at mobile width; admin Reports at mobile width**: Not covered in this run
- **Rate limiting**: No limit documented; not verified

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| admin-baseline | 100 | 85 | 8 | 11 | [data/api-results/admin-baseline.json](data/api-results/admin-baseline.json) |
| client-baseline | 64 | 52 | 12 | 21 | [data/api-results/client-baseline.json](data/api-results/client-baseline.json) |
| rules | 29 | 21 | 8 | 9 | [data/api-results/rules.json](data/api-results/rules.json) |
| sums | 4 | 3 | 1 | 1 | [data/api-results/sums.json](data/api-results/sums.json) |

## Memory

_No project memory was applied (first run, or memory held nothing relevant)._

_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: As a client of company B, GET an order of company A and expect 403/404 → `test/orders.test.mjs`
- **ISSUE-002**: GET /admin/customers as a client expects 403 → `test/admin.test.mjs`
- **ISSUE-003**: Price a 1,000.00 order and expect tax 9500 and total 104500 cents → `test/orders.test.mjs`
- **ISSUE-004**: Log out, then GET /me with the same token and expect 401 → `test/auth.test.mjs`
- **ISSUE-005**: POST orders with empty items and quantities 0, -1, 1.5, 1001 and expect 400 → `test/orders.test.mjs`
- **ISSUE-006**: GET /orders?q=( and ?page_size=0 and expect non-5xx → `test/orders.test.mjs`
- **ISSUE-008**: Malformed JSON expects 400 and a body without 'stack' or file paths → `test/auth.test.mjs`
- **ISSUE-009**: Two parallel identical order POSTs yield one order → `test/orders.test.mjs`
- **ISSUE-007**: page_size=-1 expects 400 → `test/orders.test.mjs`
- **ISSUE-010**: Sales report responds in under 3 s on the seed data → `test/admin.test.mjs`
- **ISSUE-011**: Layout check at 390px: toolbar does not cover the table → `test/ui (browser test)`
- **ISSUE-012**: Audit the Orders and New order pages for unnamed controls → `test/ui (browser test)`
- **ISSUE-013**: Render an Urdu reference with dir=auto and check order → `test/ui (browser test)`
