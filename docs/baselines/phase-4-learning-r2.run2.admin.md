⛔ **Not ready to release:** 5 critical problems found and 5 important problems, for example: Orders of 1,000 or more are charged too much tax.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 7 areas: 1 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 5 important · 🟡 2 minor
> - Biggest risk: Any signed-in customer can read other companies' orders and every customer's personal details, and signing out does not really end a session.
> - Not tested: Password reset emails; Sign-in timing out after 15 minutes; Exporting orders from the Admin Portal and 2 more.
> - 1 other thing was seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 2 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 2 important. |
| Client Portal and Admin Portal | ⚠️ | Problems found: 1 minor. |
| Admin Portal | ✅ | Nothing wrong found in what was checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Orders of 1,000 or more are charged too much tax

- **Where:** Client Portal → New order, and every order page
- **What happens:** The 5% discount is given, but tax is still worked out on the price before the discount. An order of 1,000.00 is charged 1,050.00 instead of 1,045.00.
- **Who is affected:** Every customer placing an order of 1,000.00 or more, and the company's sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type a reference, choose Ballpoint Pens, box of 50 and set the quantity to 80
  4. Click Place order
  5. The message says the total is $1,050.00; it should be $1,045.00 (1,000.00 less 50.00 discount, plus 95.00 tax)
- **What should happen:** Tax is worked out after the discount, so the total is 1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-double-submit.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: A customer can see another company's order

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Anyone signed in as a customer can read any other company's order if they know or guess its number.
- **Who is affected:** Customers of every company: their orders and prices are visible to others.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A customer only sees orders of their own company.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Any customer can read the full list of customers, including personal details

- **Where:** Behind the screens (the part that talks to the Admin Portal)
- **What happens:** A customer's sign-in is enough to fetch every customer's contact and identity details, even though the Customers page is only shown to staff.
- **Who is affected:** Every customer whose details are stored.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only staff can see customer details.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Signing out does not really sign the person out

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** The Sign out button takes the person to the sign-in page, but their old sign-in still works if someone has a copy of it.
- **Who is affected:** Anyone who signs out on a shared or lost device.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Once signed out, the old sign-in stops working at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities or no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders for minus three items, zero, half an item, more than 1,000, or nothing at all are accepted. A negative order shows a negative total and lowers the sales figures.
- **Who is affected:** Customers and staff reading order totals; the company's sales report.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: My orders keeps showing an old status after staff update an order

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the customer's order list still says the old status for several minutes, while the order's own page shows the new one.
- **Who is affected:** Customers waiting for their order to be processed or shipped.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and look at My orders; note an order marked Placed
  2. In the Admin Portal, sign in as staff, open that order and click Update status to move it to Processing
  3. Back in the Client Portal, refresh My orders (the circular arrow next to the address bar)
  4. The order still says Placed; opening it shows Processing
- **What should happen:** My orders shows the new status straight away.
- **Screenshot:** [view the screenshot](screenshots/client-stale-list.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Double-clicking Place order creates the order twice

- **Where:** Client Portal → New order
- **What happens:** A quick double click places two identical orders, and the customer is billed twice.
- **Who is affected:** Customers who double-click, and staff who must clean up duplicates.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order, type a reference, choose a product
  3. Double-click Place order
  4. Click My orders: the same order appears twice
- **What should happen:** Only one order is created.
- **Screenshot:** [view the screenshot](screenshots/client-double-submit.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Searching for certain characters, or odd page sizes, makes the system fail

- **Where:** Behind the screens (the part that talks to My orders and the Orders list)
- **What happens:** Typing a bracket or backslash in a search, or asking for zero items per page, makes the system fail instead of answering.
- **Who is affected:** Customers and staff using search.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such searches work as plain text and bad sizes are refused clearly.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Badly formed requests show internal technical details

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** A broken request makes the system reply with internal technical details and locations of its files.
- **Who is affected:** The company, since this helps attackers; not visible to everyday users.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, plain error message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟠 Important: On a phone, the New order page does not fit and the Place order button is out of view

- **Where:** Client Portal → New order
- **What happens:** The form is wider than the phone screen, so the customer has to slide the page sideways to find the Place order button.
- **Who is affected:** Customers ordering from a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer, on a phone or with the browser window made narrow
  2. Click New order
  3. The page slides sideways and the Place order button is partly or fully off the screen
- **What should happen:** Everything fits and the button is visible.
- **Screenshot:** [view the screenshot](screenshots/client-new-order-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: Some form fields and buttons cannot be understood by screen-reading software

- **Where:** Client Portal → New order; Admin Portal → Orders
- **What happens:** The product dropdown, the search box and two small icon buttons have no name, so software that reads the screen aloud for blind users cannot say what they are.
- **Who is affected:** Blind or low-vision staff and customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every field and button has a name.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: The password reset step is working but missing from the written description of the system

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The documentation no longer mentions the final password reset step, though it still works.
- **Who is affected:** Developers who rely on the documentation.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The documentation matches what the system does.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

## What changed since the last check

- Seen for the first time: the "Help centre" screen in the Client Portal (it is new, or the earlier check did not reach it).
- New since the last check: a new behind-the-screens function ("List help articles").
- No longer found: a behind-the-screens function that existed before.

## Compared with the last check

- Last check (30 October 2026, full check): 5 critical, 4 important, 3 minor.
- This check: 5 critical (same), 5 important (1 more), 2 minor (1 fewer).
- Parts of the product checked in full: 24 this time, 9 last time.
- We do not yet track which problems are new and which are repeats of earlier ones.

## What was not tested

- **Password reset emails**: The email goes to a test inbox we cannot open, so we could not check that the reset link in it works.
- **Sign-in timing out after 15 minutes**: It would need a 15-minute wait that was not done in this run.
- **Exporting orders from the Admin Portal**: The export button was not tried in this run.
- **Placing orders in the browser as other companies' customers**: Only one company's customer placed orders on screen; the others were checked behind the screens.
- **Limits on repeated failed sign-ins**: No spare test account was available to try this safely.

## Suggested next steps

1. Have a developer fix the access problems first (other companies' orders, the customer list, sign-out).
2. Then correct the tax calculation on discounted orders and refuse impossible quantities.
3. Then fix the double order on double-click, the old status in My orders, and the phone layout of New order.

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
