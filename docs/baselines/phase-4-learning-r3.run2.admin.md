⛔ **Not ready to release:** 5 critical problems found and 4 important problems, for example: Any customer can read the company's full customer list.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 4 important · 🟡 4 minor
> - Biggest risk: Any signed-in customer can read other customers' details and orders, and signing out does not really end a sign-in.
> - Not tested: Password reset emails; What happens when a sign-in expires by itself; Bright Foods customer screens and 2 more.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 3 important, 2 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Any customer can read the company's full customer list

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A signed-in customer can fetch the staff-only customer list, which includes contact and payment details of other customers, even though the screens hide it.
- **Who is affected:** Every customer whose details are on file, and the company's reputation.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only staff can see the customer list; customers are refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: A customer can open another company's order

- **Where:** Client Portal → an order page
- **What happens:** By changing the number at the end of the page address, a customer sees the full order of a different company, including items and prices.
- **Who is affected:** Every customer: their orders can be read by competitors who use the portal.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Acme Traders
  2. Open My orders and open any order
  3. In the address bar change the number at the end of the address to 1006 and press Enter
  4. You see an order belonging to Bright Foods (reference BF-2201)
- **What should happen:** The customer is told the order cannot be found or is not theirs.
- **Screenshot:** [view the screenshot](screenshots/client-other-company-order.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Orders of 1,000.00 or more are charged too much tax

- **Where:** Client Portal → New order → order confirmation, and every order page
- **What happens:** Tax is worked out on the price before the 5% discount, so customers are charged slightly more than the rules say on every large order.
- **Who is affected:** Every customer placing an order of 1,000.00 or more, and the company's sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Acme Traders
  2. Open New order, type a reference starting with QA-, choose Heavy Duty Stapler and set the quantity to 54
  3. Click Place order
  4. The confirmation shows a total of $1,076.74; it should be $1,071.61
- **What should happen:** Tax is taken from the price after the discount.
- **Screenshot:** [view the screenshot](screenshots/client-order-total-wrong.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Signing out does not really end the sign-in

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Someone who copies a sign-in before the user signs out can keep using the account afterwards. The screens look signed out, but the system still accepts the old sign-in.
- **Who is affected:** Every user, especially on shared or borrowed computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the sign-in at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with no items or impossible quantities

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order can be placed with nothing in it, with zero, negative or part items, or with more than 1,000 of one item, which gives wrong or negative totals.
- **Who is affected:** Customers and staff reading order totals; the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Searching orders with some characters, or a page size of 0, makes the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** Typing a bracket or backslash in an order search, or asking for zero results per page, makes the system fail instead of showing results or a clear message.
- **Who is affected:** Customers and staff who search orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The search works with any characters, and bad page sizes are refused with a message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Some mistakes sent to the system reveal its internal technical details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A malformed request gets an answer that exposes where the system's files are stored and how it is built, which helps an attacker.
- **Who is affected:** The company; not visible to ordinary customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, plain error message with no internal detail.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: The customer's order list shows an old status after the order is updated

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the customer's My orders list can keep showing the old status for several minutes, while the order's own page shows the new one. Two screens disagree.
- **Who is affected:** Customers waiting for their orders, and support staff who get calls about it.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Acme Traders and place a new order with a reference starting with QA-
  2. Open My orders and note that the order shows Placed
  3. In the Admin Portal open the same order, choose Processing and click Update status
  4. Back in the Client Portal, refresh My orders (the circular arrow next to the address bar)
  5. The list still shows Placed, but opening the order shows Processing
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** [view the screenshot](screenshots/client-list-stale-status.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: The password reset step is working but is no longer in the written description of the system

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The 'choose a new password' step still exists and is used by the Client Portal, but the document that describes the system no longer lists it, so tests and partners may miss it.
- **Who is affected:** Developers and anyone building on or testing the system.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The description lists every step the system offers.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: On a phone, the order list is partly hidden and totals are cut off

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the first order is hidden behind the filter and button, and the Total column runs off the edge of the screen.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Acme Traders on a phone, or make the browser window very narrow
  2. Open My orders
  3. The first order is hidden behind the Status filter, and the totals are cut off at the right edge
- **What should happen:** Every order and its total is fully visible.
- **Screenshot:** [view the screenshot](screenshots/client-my-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: Some search boxes, buttons and menus have no name for people using screen readers

- **Where:** Admin Portal → Orders; Client Portal → New order
- **What happens:** Software that reads the screen aloud for blind users cannot say what the search box, the two icon buttons or the product menu are for.
- **Who is affected:** Blind or low-vision staff and customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every field and button has a name that is read aloud.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: Clicking Place order twice quickly can create two orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** If the same order is sent twice at the same moment, two separate orders are created.
- **Who is affected:** Customers who double click; staff who must cancel duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

### 🟡 Minor: The sales report is slow to appear

- **Where:** Admin Portal → Reports
- **What happens:** The Reports page takes about four seconds before the figures appear.
- **Who is affected:** Admins opening the sales summary.
- **How to see it yourself:**
  1. Sign in to the Admin Portal
  2. Click Reports
  3. The figures take about four seconds to appear
- **What should happen:** The report appears in about a second.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-013](TECHNICAL-REPORT.md#ISSUE-013)

## What changed since the last check

- Seen for the first time: the "Help centre" screen in the Client Portal (it is new, or the earlier check did not reach it).
- Seen for the first time: the "Customers" screen in the Admin Portal (it is new, or the earlier check did not reach it).
- New since the last check: a new behind-the-screens function ("List help articles").
- No longer found: a behind-the-screens function that existed before.

## Compared with the last check

- Last check (30 October 2026, full check): 5 critical, 3 important, 5 minor.
- This check: 5 critical (same), 4 important (1 more), 4 minor (1 fewer).
- Parts of the product checked in full: 12 this time, 12 last time.
- We do not yet track which problems are new and which are repeats of earlier ones.

## What was not tested

- **Password reset emails**: Checking them would send emails and no safe test mailbox was confirmed for this run, so the reset link was not checked.
- **What happens when a sign-in expires by itself**: It would need waiting for the full sign-in time or changing the clock, which this check cannot do.
- **Bright Foods customer screens**: Only this customer's data behind the screens was checked; the same screens were checked with other customers.
- **Admin order filters and paging**: The filter, search and paging buttons were not tried by hand in the browser in this check.
- **Request limits and keyboard-only use**: Not checked in this run.

## Suggested next steps

1. Have a developer fix the access problems and the sign-out first.
2. Then fix the tax calculation and refuse invalid order quantities.
3. Re-run this check afterwards to confirm each problem is gone.

## Words used in this report

- **🔴 Critical**: People are blocked, information is wrong, lost or seen by the wrong people, money is affected, or security is at risk.
- **🟠 Important**: Something works badly or confusingly, but there is a way around it.
- **🟡 Minor**: Something looks wrong or is a small annoyance.
- **Behind the screens**: The part of the system that does its work out of sight. People never see it directly, but every screen depends on it.
- **Seen only once**: Something we noticed but could not repeat. It is not counted as a problem until it is confirmed.
- **Not tested**: Something we did not check, with the reason. It is never reported as working.

---
The full technical details, with exact steps for developers, are in `TECHNICAL-REPORT.md`. Feedback written in this report is read by a developer; it is not picked up automatically yet.
Before you share this report outside your team, look at the screenshots for personal information.
