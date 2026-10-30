# QAMind Technical Report: run-20261030T103230Z

| | |
|---|---|
| Date (UTC) | 2026-10-30T10:32:30.287Z |
| Project | ws (path-ws-9e0894d9f673) |
| Environment | local demo |
| Branch / commit | main @ 9a0b0ac |
| Mode | full |
| Trigger | manual |
| Scope | whole product |
| Host | claude-code |
| Duration | 7m 36s |
| Cost / usage | not available on this host |
| QAMind / knowledge version | 0.1.0 / 0.1.1 |
| Stop reason | completed (report lint still fails on one tool-generated line) |

_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._

## Environment health

**Environment OK.**

| Check | Result | Detail |
|---|---|---|
| Web UI "Admin Portal" loads | ✅ ok | HTTP 200 (14 ms) |
| Web UI "Client Portal" loads | ✅ ok | HTTP 200 (2 ms) |
| API base responds | ✅ ok | HTTP 404 (2 ms) |
| Health check /health | ✅ ok | HTTP 200 (1 ms) |
| Test account "admin" can sign in | ✅ ok | signed in over the API (7 ms) |
| Test account "acme-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "acme-2" can sign in | ✅ ok | signed in over the API (1 ms) |
| Test account "bright-1" can sign in | ✅ ok | signed in over the API (2 ms) |
| Test account "zain-1" can sign in | ✅ ok | signed in over the API (1 ms) |

## Summary

- 🔴 Critical: **5**   🟠 Important: **7**   🟡 Minor: **2**
- Unconfirmed (not reproduced twice): **2**
- Areas not tested: **7**
- API probes executed: **225** (50 produced a signal worth a look)

## What changed since the last run

- New page: Client Portal `/help.html` (Help centre)
- New page: Admin Portal `/customers.html` (Customers)
- New endpoint: `GET /help` (List help articles)
- Endpoint removed: `POST /auth/reset-password` (Choose a new password with a reset token)

## Trend

| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Checked | Partly checked | Not tested |
|---|---|---|---|---|---|---|---|---|
| **this run** | full | 5 | 7 | 2 | 2 | 21 | 1 | 7 |
| run-20261030T102634Z | full | 5 | 4 | 2 | 2 | 14 | 1 | 7 |

## Test plan (charters)

### C1: Tenant isolation on orders  `permissions`

- **Goal:** A client never reads another company's orders; same-company users share them
- **Risk:** Previous run: a customer could read another company's order by id (critical)
- **Entry point:** GET /api/orders/{id}, GET /api/orders as acme-1, acme-2, bright-1, zain-1; UI order detail by URL
- **Expected results:** 403/404 for other companies; list contains only own company's orders
- **Exit condition:** Chain A creates, B reads, list, search, anonymous all checked

### C2: Admin-only endpoints and customer records  `permissions`

- **Goal:** Only admins see customers, reports and change statuses
- **Risk:** Previous run: customer records readable by any signed-in customer (critical)
- **Entry point:** GET /api/admin/customers, /api/admin/reports/sales, PATCH /api/admin/orders/{id}/status as each role; admin pages by URL as a client
- **Expected results:** 401 anonymous, 403 for clients
- **Exit condition:** Role matrix read for every admin operation, plus direct page access

### C3: Sessions, sign-in and sign-out  `api`

- **Goal:** Sign-out revokes the token at once; bad logins are refused cleanly
- **Risk:** Previous run: old token still worked after sign-out (critical)
- **Entry point:** POST /api/auth/login, /api/auth/logout, GET /api/me with the same token
- **Expected results:** 401 after logout; no internal detail in errors
- **Exit condition:** Logout chain via API and via the portals

### C4: Order totals around the 1,000.00 discount threshold  `business-rule`

- **Goal:** Total = (subtotal - 5% if subtotal >= 1000) + 10% tax on discounted amount
- **Risk:** Previous run: tax taken before discount (critical)
- **Entry point:** POST /api/orders and the New order page, below, at and above 1,000.00
- **Expected results:** Numbers I compute in integer cents match API, confirmation, list and detail
- **Exit condition:** Both sides of threshold checked through API and UI

### C5: Order validation, duplicates, search and paging  `api`

- **Goal:** Invalid quantities, empty items, odd search text and paging values are refused cleanly
- **Risk:** Previous run: invalid quantities accepted, duplicate orders, search and page_size crashes, error leakage
- **Entry point:** POST /api/orders, GET /api/orders?q=&page=&page_size=
- **Expected results:** 4xx naming the field; no 5xx; no internal paths
- **Exit condition:** Boundary values 0,1,1000,1001,-1,1.5,'abc' and paging edges checked

### C6: New and changed endpoints: GET /help, spec drift  `api`

- **Goal:** The new help endpoint matches the spec; spec and routes agree
- **Risk:** Changed since last run: /help added, reset-password dropped from the spec but still routed
- **Entry point:** GET /api/help; POST /api/auth/reset-password; openapi.yaml
- **Expected results:** Documented behaviour matches; undocumented routes noted
- **Exit condition:** Inventory compared with routes

### C7: Client Portal critical flow 1 and 3  `ui`

- **Goal:** Client signs in, places an order, sees total, finds it in My Orders, later sees the new status
- **Risk:** Money shown wrong; stale status
- **Entry point:** Client Portal /index.html, /new-order.html, /my-orders.html, /order.html
- **Expected results:** Confirmation total equals my arithmetic; order visible; status fresh after admin change
- **Exit condition:** Desktop and mobile, page audit on each page, Urdu client checked for RTL

### C8: Admin Portal critical flows 2 and 4  `ui`

- **Goal:** Admin finds order, moves status, opens Reports
- **Risk:** Illegal transitions allowed; slow report
- **Entry point:** Admin Portal /orders.html, /order.html, /reports.html, /customers.html
- **Expected results:** Status moves placed to processing to shipped; summary matches orders
- **Exit condition:** Transitions and refused ones checked in UI and API; desktop and mobile

### C9: New Help page and navigation  `ui`

- **Goal:** The new Help page works and fits the portal
- **Risk:** Changed since last run: help.html added; its header looks different from sibling pages
- **Entry point:** Client Portal /help.html
- **Expected results:** Same navigation, working Sign out, requires sign-in like sibling pages
- **Exit condition:** Checked signed in, signed out, desktop and mobile

### C10: Warm, change, re-read and totals agreement  `cross`

- **Goal:** Admin status change appears at once for the client; list, detail, report totals agree
- **Risk:** Stale data
- **Entry point:** Client reads order, admin changes status, client re-reads (API and UI)
- **Expected results:** New status immediately
- **Exit condition:** API and UI re-read at once and after about ten seconds

### C11: Forgot / reset password pages  `ui`

- **Goal:** Password reset flow behaves safely
- **Risk:** Sends email
- **Entry point:** Client Portal /forgot-password.html
- **Expected results:** Same message for known and unknown addresses
- **Exit condition:** Page and form checked; sending real mail is not attempted unless safe

## Findings

<a id="ISSUE-001"></a>

### ISSUE-001 🔴 Critical: Orders: a customer can read another company's order by its id

- **Surface:** permissions · **Area:** Orders / tenant isolation · **Type:** permissions
- **Roles:** acme-1, bright-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C1

GET /api/orders/{id} returns an order that belongs to a different company; the Client Portal order page shows it too. Still present from the previous run.

**Steps to reproduce**

1. Sign in over the API as acme-1 and POST /api/orders with reference QA-iso-marker and one item p-101 x2; note the new order id
2. Sign in as bright-1 (a different company) and GET /api/orders/{id} with that id
3. Observe HTTP 200 with the full order (see evidence); zain-1 gets the same
4. UI: signed in to the Client Portal as bright-1 at 1366x768, open order.html?id=<that id>; the order page shows the Acme order (see screenshot)

**Expected:** 403 or 404 for another company's order (config rule: different companies never see each other's data)

**Actual:** HTTP 200 with the other company's order for bright-1 and zain-1 (2 of 2 runs); list endpoint correctly hides it

**Evidence**

- [evidence/api/chains-I002.json](evidence/api/chains-I002.json)
- [evidence/api/chains-I003.json](evidence/api/chains-I003.json)
- [screenshots/cross-company-order-ui.png](screenshots/cross-company-order-ui.png)

**Suspected root cause:** The single-order read looks up by id without comparing the caller's company (per permissions-and-data-isolation.md: query finds a record by id alone)

**Proposed regression test:** Company A creates an order, company B GETs it by id and expects 403/404 (suggested location: `test/orders.test.js`)

<a id="ISSUE-002"></a>

### ISSUE-002 🔴 Critical: Customer records (contact details, ID numbers, card digits) readable by any signed-in customer

- **Surface:** permissions · **Area:** Admin / customers · **Type:** permissions
- **Roles:** acme-1, zain-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C2

GET /api/admin/customers answers 200 with the full customer list for client roles; the spec and business rules say only admins may see customers.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/admin/customers
3. Observe HTTP 200 with customer records; zain-1 gets the same (see evidence). The Admin Portal Customers page lists columns for contact, email, phone, national ID, address, card and notes

**Expected:** 403 for any client role (401 when anonymous)

**Actual:** HTTP 200 for acme-1 and zain-1 (2 of 2 runs); anonymous correctly gets 401. Field names exposed include email, phone, national ID, address and card digits

**Evidence**

- [evidence/api/chains-A001.json](evidence/api/chains-A001.json)
- [evidence/api/chains-A002.json](evidence/api/chains-A002.json)

**Suspected root cause:** Route has no role restriction (the other admin routes use roles:['admin'])

**Proposed regression test:** As a client, GET /api/admin/customers and expect 403 (suggested location: `test/admin.test.js`)

<a id="ISSUE-003"></a>

### ISSUE-003 🔴 Critical: Sign out does not end the session: the old sign-in still works

- **Surface:** api · **Area:** Authentication / sessions · **Type:** auth
- **Roles:** acme-2
- **Reproduced:** 2 of 2 attempts
- **Charter:** C3

After POST /api/auth/logout returns 204, the same bearer token still gets 200 from /me, /orders and /admin/customers.

**Steps to reproduce**

1. Sign in over the API as acme-2
2. GET /api/me with the token: 200
3. POST /api/auth/logout: 204
4. GET /api/me, GET /api/orders and GET /api/admin/customers with the same token (see evidence)

**Expected:** 401 on every call after sign-out (spec: logout revokes the current token; config rule: signing out ends the session at once)

**Actual:** HTTP 200 on all three calls (2 of 2 runs)

**Evidence**

- [evidence/api/logout-L003.json](evidence/api/logout-L003.json)
- [evidence/api/logout-L004.json](evidence/api/logout-L004.json)
- [evidence/api/logout-L005.json](evidence/api/logout-L005.json)

**Suspected root cause:** Tokens are never revoked server-side; logout only returns 204

**Proposed regression test:** Log in, log out, reuse the token and expect 401 (suggested location: `test/auth.test.js`)

<a id="ISSUE-004"></a>

### ISSUE-004 🔴 Critical: Orders: tax is calculated on the undiscounted subtotal, so discounted orders are overcharged

- **Surface:** business-rule · **UI:** Client Portal · **Area:** Orders / pricing · **Type:** business-rule
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C4

For subtotals of 1,000.00 or more tax is 10% of the full subtotal instead of the discounted amount, so the total is too high. Below the threshold totals are correct.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Open New order, enter reference QA-ui-toner-12, choose Printer Toner Cartridge ($89.99), quantity 12, click Place order
3. The confirmation says Total: $1,133.88; the order page shows Subtotal $1,079.88, Discount -$53.99, Tax $107.99
4. API: POST /api/orders qty 154 of p-101 (see evidence) gives tax 10010 and total 105105 cents

**Expected:** Subtotal 1,079.88 - discount 53.99 = 1,025.89; tax 102.59; total 1,128.48 (computed by hand). For qty 154 of p-101: tax 9510, total 104605 cents

**Actual:** Tax $107.99 and total $1,133.88 (5.40 too much). API qty 154: tax 10010, total 105105; qty 1000: tax 65000, total 682500 (expected 61750 and 679250). Qty 153 (below threshold) is correct. Reproduced in UI (confirmation and order page) and API

**Evidence**

- [screenshots/order-confirmation-desktop.png](screenshots/order-confirmation-desktop.png)
- [evidence/api/chains-B003.json](evidence/api/chains-B003.json)
- [evidence/api/chains-B004.json](evidence/api/chains-B004.json)

**Suspected root cause:** Tax computed from the subtotal before the discount in the pricing step

**Proposed regression test:** Order with subtotal 1,079.88 expects total 1,128.48; also 99,450 and 100,100 cents boundaries (suggested location: `test/pricing.test.js`)

<a id="ISSUE-005"></a>

### ISSUE-005 🔴 Critical: Orders: invalid quantities and empty item lists are accepted

- **Surface:** api · **Area:** Orders / validation · **Type:** validation
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

POST /api/orders creates orders for quantity 0, 1001, 1.5, -3 and for an empty items list; a negative quantity gives a negative total that appears in My orders.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. POST /api/orders with items:[] ; then quantity 0, 1001, 1.5, -3 (see evidence for each request)
3. Observe HTTP 201 each time; the -3 order shows -$21.45 in the Client Portal My orders list

**Expected:** 400 naming the field (config rule: whole number 1 to 1,000; at least one item)

**Actual:** HTTP 201 for all five (2 of 2 runs each); quantity 'abc' and unknown products are correctly refused

**Evidence**

- [evidence/api/baseline-client-P044.json](evidence/api/baseline-client-P044.json)
- [evidence/api/baseline-client-P045.json](evidence/api/baseline-client-P045.json)
- [evidence/api/baseline-client-P046.json](evidence/api/baseline-client-P046.json)
- [evidence/api/baseline-client-P047.json](evidence/api/baseline-client-P047.json)
- [evidence/api/chains-V001.json](evidence/api/chains-V001.json)

**Suspected root cause:** No range or integer check and no minimum item count in the order handler

**Proposed regression test:** POST orders with quantity 0, 1001, 1.5, -3 and empty items; expect 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-006"></a>

### ISSUE-006 🟠 Important: Orders: the customer's order list shows an old status after an admin changes it

- **Surface:** cross · **UI:** Client Portal · **Area:** Orders / status · **Type:** stale-data
- **Roles:** acme-1, admin
- **Browser / viewport:** Chromium / 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C10

After an admin moves an order to processing, the order detail shows Processing but the customer's My orders list (and a status-filtered list) still shows Placed.

**Steps to reproduce**

1. Sign in over the API as acme-1, POST /api/orders (QA-stale), then GET /api/orders (warm the list)
2. As admin PATCH /api/admin/orders/{id}/status with processing: 200
3. GET /api/orders/{id} as acme-1: status processing
4. GET /api/orders as acme-1: the order is still placed; GET /api/orders?status=processing&q=QA-stale returns no items
5. UI: after the admin set QA-ui-toner-12 to Processing, a fresh Client Portal sign-in as acme-1 showed Placed in My orders (two page loads) and Processing on its order page

**Expected:** The list shows the new status immediately and the status filter finds the order

**Actual:** List shows placed and the processing filter is empty (2 of 2 runs); detail shows processing

**Evidence**

- [evidence/api/stale-W005.json](evidence/api/stale-W005.json)
- [evidence/api/stale-W006.json](evidence/api/stale-W006.json)

**Suspected root cause:** The order list is cached per company and not cleared when a status changes (a plain change-then-read check misses it; the list had to be read first)

**Proposed regression test:** Read list, change status as admin, re-read list and expect the new status (suggested location: `test/orders.test.js`)

<a id="ISSUE-007"></a>

### ISSUE-007 🟠 Important: Orders: sending the same order twice creates two orders

- **Surface:** api · **Area:** Orders / duplicates · **Type:** duplicate-submission
- **Roles:** acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

Two identical POST /api/orders sent at once both return 201 and both are stored.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. Send the same POST /api/orders body twice in parallel (see evidence)
3. Both return 201 and two orders appear in My orders

**Expected:** One order, or a clear duplicate refusal

**Actual:** Two orders created (2 of 2 runs). Not stated as intended; severity by likely impact

**Evidence**

- [evidence/api/baseline-client-P050.json](evidence/api/baseline-client-P050.json)

**Suspected root cause:** No duplicate protection on create

**Proposed regression test:** Parallel identical POSTs create one order (suggested location: `test/orders.test.js`)

<a id="ISSUE-008"></a>

### ISSUE-008 🟠 Important: Error messages show internal technical details and server file locations

- **Surface:** api · **Area:** Error handling · **Type:** error-leakage
- **Roles:** anonymous, acme-1
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

Malformed JSON on /auth/login and /orders returns a 400 whose body contains a stack trace and server source paths.

**Steps to reproduce**

1. POST /api/auth/login with body {"broken": and Content-Type application/json
2. Read the 400 body: stack field, file paths (see evidence)
3. Same for POST /api/orders

**Expected:** A short message without internals

**Actual:** Stack trace and server file paths in the body (2 of 2 runs, both endpoints)

**Evidence**

- [evidence/api/baseline-client-P007.json](evidence/api/baseline-client-P007.json)
- [evidence/api/baseline-client-P049.json](evidence/api/baseline-client-P049.json)

**Suspected root cause:** Parse error handler returns the raw error

**Proposed regression test:** Malformed JSON gives 400 with no stack or path (suggested location: `test/errors.test.js`)

<a id="ISSUE-009"></a>

### ISSUE-009 🟠 Important: Order search crashes when the text contains ( or \

- **Surface:** api · **Area:** Orders / search · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

GET /api/orders?q=( and ?q=\ return 500.

**Steps to reproduce**

1. Sign in over the API as acme-1 or admin
2. GET /api/orders?q=(
3. GET /api/orders?q=\

**Expected:** 200 with a normal result list (search text treated as plain text)

**Actual:** HTTP 500 for both, for both roles (2 of 2 runs)

**Evidence**

- [evidence/api/baseline-client-P025.json](evidence/api/baseline-client-P025.json)
- [evidence/api/baseline-client-P029.json](evidence/api/baseline-client-P029.json)

**Suspected root cause:** Search text used as a pattern without escaping

**Proposed regression test:** Search with ( and \ returns 200 (suggested location: `test/orders.test.js`)

<a id="ISSUE-010"></a>

### ISSUE-010 🟠 Important: Order list: page_size=0 crashes and page_size=-1 is accepted

- **Surface:** api · **Area:** Orders / paging · **Type:** validation
- **Roles:** acme-1, admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C5

page_size=0 returns 500; page_size=-1 returns 200 although the spec minimum is 1.

**Steps to reproduce**

1. Sign in over the API as acme-1
2. GET /api/orders?page_size=0 then ?page_size=-1

**Expected:** 400 for both (spec minimum 1)

**Actual:** 500 and 200 (2 of 2 runs, both roles)

**Evidence**

- [evidence/api/baseline-client-P020.json](evidence/api/baseline-client-P020.json)
- [evidence/api/baseline-client-P021.json](evidence/api/baseline-client-P021.json)

**Suspected root cause:** No lower bound on page_size

**Proposed regression test:** page_size 0 and -1 return 400 (suggested location: `test/orders.test.js`)

<a id="ISSUE-011"></a>

### ISSUE-011 🟠 Important: Client Portal Help page: Sign out does nothing, no signed-in name, Help link missing from its own menu (new page)

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / Help · **Type:** functional
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 1366x768
- **Reproduced:** 2 of 2 attempts
- **Charter:** C9

The new help.html page does not load the portal's sign-in script, so the Sign out button has no effect, the name area stays empty and the menu lacks the Help link.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1
2. Click Help in the menu of My orders
3. Click Sign out at the top right
4. Nothing happens and the user stays on the Help page; open My orders: still signed in (twice, from a fresh page load)

**Expected:** Same header as the other pages: name shown, Help highlighted, Sign out ends the session and returns to sign-in

**Actual:** Name empty, no Help link in the menu, Sign out does nothing (2 of 2). The page also opens when signed out

**Evidence**

- [screenshots/help-after-signout-click.png](screenshots/help-after-signout-click.png)

**Suspected root cause:** help.html loads only config.js and lumen.js, not the page script the sibling pages use

**Proposed regression test:** On help.html Sign out clears the session and goes to sign-in (suggested location: `test/ui/help.test.js`)

<a id="ISSUE-012"></a>

### ISSUE-012 🟠 Important: Client Portal New order at phone width: the form is wider than the screen and Place order is cut off

- **Surface:** ui · **UI:** Client Portal · **Area:** Client Portal / New order · **Type:** layout
- **Roles:** acme-1
- **Browser / viewport:** Chromium / 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C7

At 390px wide the page is 555px wide; the reference field, note, quantity, Remove and Place order controls extend past the right edge and are clipped.

**Steps to reproduce**

1. Sign in to the Client Portal as acme-1 with the window 390px wide
2. Open New order
3. Observe the right side of the form is cut off and the page scrolls sideways; the Place order button right edge is at 555px

**Expected:** The form fits the screen and Place order is reachable (critical flow 1 on a phone)

**Actual:** Overflow by 165px; controls off-screen (2 of 2 fresh loads). Desktop is fine

**Evidence**

- [screenshots/new-order-mobile.png](screenshots/new-order-mobile.png)

**Suspected root cause:** Fixed-width form grid that does not shrink on narrow screens

**Proposed regression test:** At 390px the New order page has no horizontal overflow (suggested location: `test/ui/new-order.test.js`)

<a id="ISSUE-013"></a>

### ISSUE-013 🟡 Minor: Some controls have no accessible name (product selector, order search, refresh and clear buttons)

- **Surface:** ui · **UI:** Admin Portal · **Area:** Portals / accessibility · **Type:** accessibility
- **Roles:** admin, acme-1
- **Browser / viewport:** Chromium / 1366x768 and 390x844
- **Reproduced:** 2 of 2 attempts
- **Charter:** C7

The product drop-down on New order, the search box on Admin Orders (placeholder only), and the Refresh and Clear filters icon buttons have no label for screen readers.

**Steps to reproduce**

1. Run the page audit on Client Portal New order and Admin Portal Orders (desktop and mobile)
2. unnamedControls lists select[name=product], input#search, button#refresh and button#clear-filters

**Expected:** Every control has a label or accessible name (per accessibility.md)

**Actual:** Four controls unnamed on both viewports (2 of 2)

**Evidence**

- [screenshots/admin-orders-mobile.png](screenshots/admin-orders-mobile.png)
- [screenshots/new-order-mobile.png](screenshots/new-order-mobile.png)

**Suspected root cause:** Missing label or aria-label

**Proposed regression test:** Audit finds no unnamed controls on these pages (suggested location: `test/ui/a11y.test.js`)

<a id="ISSUE-014"></a>

### ISSUE-014 🟡 Minor: Sales summary takes about four seconds to load

- **Surface:** api · **Area:** Admin / reports · **Type:** performance
- **Roles:** admin
- **Reproduced:** 2 of 2 attempts
- **Charter:** C8

GET /api/admin/reports/sales takes about 4,000 ms every time; the Reports page shows its heading before figures arrive.

**Steps to reproduce**

1. Sign in over the API as admin
2. GET /api/admin/reports/sales and note the time (4004 ms, repeated)

**Expected:** A trivial read should answer in under 3 seconds

**Actual:** 4004 to 4005 ms (2 of 2 runs); figures were internally consistent

**Evidence**

- [evidence/api/chains-R001.json](evidence/api/chains-R001.json)

**Suspected root cause:** Unknown (fixed delay)

**Proposed regression test:** Sales summary answers within 3 seconds (suggested location: `test/reports.test.js`)

## Unconfirmed (could not be reproduced twice)

_These are leads, not findings. They are not counted above._

- **UNCONFIRMED-01: Password-reset route still reachable although removed from the written spec** (api, tried 1×): POST /api/auth/reset-password with an empty body returned a validation error (400) instead of 404, so the route exists; openapi.yaml no longer lists it (uncommitted change). Why unconfirmed: Seen once and it is unclear whether the spec change or the route is the intended state
- **UNCONFIRMED-02: Urdu order references are left-aligned in a left-to-right container** (ui, tried 1×): On Client Portal My orders as zain-1 the audit flagged three Urdu references with direction ltr; they read correctly on screen. Why unconfirmed: No visible defect found; only an audit lead

## Coverage matrix

| Surface | Area | Role | Viewport | Key journey | Status | Note |
|---|---|---|---|---|---|---|
| ui | Sign in and place an order | acme-1 | desktop | #1 | ✅ tested | order placed, confirmation total checked against hand arithmetic |
| ui | Sign in and place an order | acme-1 | mobile | #1 | ◐ partial | page audited and form seen cut off; an order was not placed at phone width |
| ui | My orders list | acme-1 | desktop | #1 | ✅ tested | list, paging text, status column |
| ui | My orders list | acme-1 | mobile | #1 | ✅ tested | only the known accepted filter-bar overlap seen |
| ui | Order details | bright-1 | desktop | #3 | ✅ tested | other company's order opened by address; client view of the new status checked |
| ui | Orders in Urdu | zain-1 | desktop | - | ✅ tested | Urdu and markup-like references show as plain text |
| ui | Help page | acme-1 | desktop | - | ✅ tested | sign out broken |
| ui | Help page | acme-1 | mobile | - | ✅ tested |  |
| ui | Sign out | acme-1 | desktop | #5 | ✅ tested | portal returns to sign-in; session still works over the API |
| ui | Orders list and order details, change status | admin | desktop | #2 | ✅ tested | moved an order to Processing |
| ui | Orders list and order details, change status | admin | mobile | #2 | ✅ tested |  |
| ui | Reports | admin | desktop | #4 | ✅ tested | figures agree with each other |
| ui | Reports | admin | mobile | #4 | ✅ tested |  |
| ui | Customers | admin | desktop | - | ✅ tested |  |
| ui | Customers | admin | mobile | - | ✅ tested |  |
| ui | Sign out | admin | desktop | #5 | ✅ tested | protected page asks for sign-in afterwards |
| cross | Admin status change seen by the customer | acme-1 | - | #3 | ✅ tested | detail correct, list shows an old status |
| api | Sign out ends the session | acme-2 | - | #5 | ✅ tested |  |
| api | All documented operations and role matrix | admin | - | - | ✅ tested | baseline plans as admin and client, plus chains |
| permissions | Company isolation and admin-only operations | bright-1 | - | - | ✅ tested |  |
| business-rule | Totals around the 1,000.00 discount threshold | acme-1 | - | - | ✅ tested |  |
| business-rule | Order status moves and refused moves | admin | - | - | ✅ tested | skipping steps and going backwards are refused |

## Not tested

_Nothing here is reported as passing._

- **Client Portal / forgot and reset password**: Would send email and no way to read the local mail catcher is configured for this run; the reset route was left out by the plan
- **Client Portal / expired or cleared session in the browser**: Not run in this pass; sign-out was tested but clearing browser storage and reloading was not
- **Client Portal / second user of Acme Traders in the browser**: acme-2 was exercised over the API only (shared orders, sign-out); no browser pass
- **Client Portal / double click on Place order, and form edge values in the browser**: Edge values and double submit were checked over the API only, not through the form
- **Client Portal / order pages at phone width, Urdu client at phone width**: Not covered in this pass
- **Both portals / keyboard-only use and screen-reader behaviour**: Only the automatic page audit was run; manual keyboard walk-through was not done
- **Security / login lockout, expiry timing and cookie checks**: No spare disposable account and no short session lifetime available

## API test runs

| Plan | Probes | Passed | Failed | Signals | Details |
|---|---|---|---|---|---|
| baseline-admin | 107 | 92 | 8 | 11 | [data/api-results/baseline-admin.json](data/api-results/baseline-admin.json) |
| baseline-client | 65 | 53 | 12 | 21 | [data/api-results/baseline-client.json](data/api-results/baseline-client.json) |
| chains | 42 | 34 | 8 | 13 | [data/api-results/chains.json](data/api-results/chains.json) |
| logout | 5 | 2 | 3 | 3 | [data/api-results/logout.json](data/api-results/logout.json) |
| stale | 6 | 4 | 2 | 2 | [data/api-results/stale.json](data/api-results/stale.json) |

## Memory

**Applied this run** (memory is leads, not proof; each was re-verified)

- Applied learning L-001: (Orders / permissions) Single-record reads and admin-only lists can miss the company or role check even when the list endpoint filters correctly: test by id across companies and by role.
- Applied learning L-002: (Orders / pricing) Totals are wrong only at or above the 1,000.00 discount threshold: tax is taken before the discount. Always test both sides of the threshold.
- Applied learning L-003: (Admin / reports) The sales summary needs about 4 seconds to respond: wait for its heading before reading figures.
- Applied learning L-004: (Auth / sessions) Check sign-out by reusing the same token over the API after logout; the portal redirecting to sign-in does not prove the session ended.
- Skipped known false alarm FA-001: Client Portal (phone width): the filter bar covers the first order in My orders
- Applied learning L-001 to test single orders by id across companies and admin lists by role (both gaps are still open)
- Applied learning L-002 to test both sides of the 1,000.00 threshold (tax is still taken before the discount)
- Applied learning L-003 to wait for the Reports heading before reading figures
- Applied learning L-004 to check sign-out by reusing the same token over the API (it still works)
- Skipped known false alarm FA-001 (filter bar over the first order at phone width)

**Saved this run**

- New learning L-005: A stale order list only shows if the list is read before the admin changes the status: warm the default list first, then re-read it and the status filter; the detail endpoint is always correct.
- New learning L-006: New pages copied by hand can miss the shared page script, so Sign out and the signed-in name stop working; check header and Sign out on every new page, and check new forms at phone width.
- Confirmed again L-002: Totals are wrong only at or above the 1,000.00 discount threshold: tax is taken before the discount. Always test both sides of the threshold.

**Memory after the run**

- Product map: 10 page(s) and 13 endpoint(s) known; 4 change(s) since the last run.
- Risk areas: 15 area(s) tracked; highest now: Admin / customers (score 20).
- Known false alarms skipped: FA-001.
- Learnings: 2 new, 1 confirmed again, 4 applied; false alarms recorded: 0.

## Proposed regression tests

_/qa-only never writes tests into the product; these are proposals._

- **ISSUE-001**: Company A creates an order, company B GETs it by id and expects 403/404 → `test/orders.test.js`
- **ISSUE-002**: As a client, GET /api/admin/customers and expect 403 → `test/admin.test.js`
- **ISSUE-003**: Log in, log out, reuse the token and expect 401 → `test/auth.test.js`
- **ISSUE-004**: Order with subtotal 1,079.88 expects total 1,128.48; also 99,450 and 100,100 cents boundaries → `test/pricing.test.js`
- **ISSUE-005**: POST orders with quantity 0, 1001, 1.5, -3 and empty items; expect 400 → `test/orders.test.js`
- **ISSUE-006**: Read list, change status as admin, re-read list and expect the new status → `test/orders.test.js`
- **ISSUE-007**: Parallel identical POSTs create one order → `test/orders.test.js`
- **ISSUE-008**: Malformed JSON gives 400 with no stack or path → `test/errors.test.js`
- **ISSUE-009**: Search with ( and \ returns 200 → `test/orders.test.js`
- **ISSUE-010**: page_size 0 and -1 return 400 → `test/orders.test.js`
- **ISSUE-011**: On help.html Sign out clears the session and goes to sign-in → `test/ui/help.test.js`
- **ISSUE-012**: At 390px the New order page has no horizontal overflow → `test/ui/new-order.test.js`
- **ISSUE-013**: Audit finds no unnamed controls on these pages → `test/ui/a11y.test.js`
- **ISSUE-014**: Sales summary answers within 3 seconds → `test/reports.test.js`

## Notes

- The Admin Portal Customers page and the customer list response show personal data; review any screenshot of them before sharing.
- Automatic masking of screenshots is not available in this version.
- Changes since the last run: a Help page and a help list were added; the password-reset route was removed from the written spec but is still reachable in the running system.
