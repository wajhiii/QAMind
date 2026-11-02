⛔ **Not ready to release:** 3 critical problems found and 7 important problems, for example: Any signed-in customer can read the list of all customers and their details.

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 3 critical · 🟠 7 important · 🟡 2 minor
> - Biggest risk: Any signed-in customer can see other companies' orders and the full customer list, and orders of $1,000 or more are overcharged.
> - Not tested: Password reset emails; Exporting orders to a spreadsheet file; Expired sign-in and double-clicking Place order on screen and 1 more.
> - 1 other thing was seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 2 minor. Part of this area was not fully checked. |
| Behind the screens (the back-end system) | ⚠️ | Problems found: 5 important. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 important. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Any signed-in customer can read the list of all customers and their details

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** A customer's sign-in is enough to fetch the full customer list that only staff should see, including personal and payment details. The Client Portal has no page for it, so it is not visible there, but anyone who asks the system directly gets it.
- **Who is affected:** Every customer whose details are stored, and the company's privacy obligations.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Customers are refused; only staff can see the customer list.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: A customer can open another company's order by changing the number in the address

- **Where:** Client Portal → My orders → an order page
- **What happens:** A customer from one company who knows or guesses an order number can see another company's order: items, prices and totals. The My orders list is correct; only the order page is open.
- **Who is affected:** Every company that places orders.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Company A
  2. Place a new order and, on the confirmation, click View order; note the number at the end of the address
  3. Close the browser, then sign in to the Client Portal as a customer of a different company
  4. Type the same page address, with Company A's order number, into the address bar
  5. You see Company A's order, although it is not yours
- **What should happen:** The second customer is refused or told the order does not exist.
- **Screenshot:** [view the screenshot](screenshots/zain-opens-acme-order.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Orders of $1,000 or more are charged $5 too much tax

- **Where:** Client Portal → New order → the confirmation and the order pages
- **What happens:** When the 5% discount applies, tax is still worked out on the price before the discount. An order of exactly $1,000.00 shows $1,050.00 instead of $1,045.00.
- **Who is affected:** Every customer who places an order of $1,000 or more, and anyone reading sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type a reference, choose Ballpoint Pens, box of 50, and set the quantity to 80
  4. Click Place order
  5. The confirmation says Total: $1,050.00; it should say $1,045.00. Click View order to see Tax $100.00 where it should be $95.00
- **What should happen:** The total is $1,045.00: tax is worked out on the discounted amount.
- **Screenshot:** [view the screenshot](screenshots/order-confirmation-1000.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🟠 Important: Signing out does not really end the session

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** The Sign out button takes the person back to the sign-in page, but the sign-in itself stays valid on the server. Anyone who copied it earlier can keep using the account.
- **Who is affected:** Every user, especially people on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Once someone signs out, that sign-in stops working immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🟠 Important: The system accepts orders with zero, negative or fractional quantities, or with nothing in them

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order for 0, 1001 or 1.5 items, or with no items at all, is accepted and saved, which gives wrong or empty orders and totals.
- **Who is affected:** Staff processing orders and the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** These orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: My orders keeps showing an old status after staff change it

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the My orders list can keep showing the old status for a long time, while the order's own page shows the new one. Customers see two different statuses.
- **Who is affected:** Customers following their orders, and staff answering their questions.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer, open My orders and note the status of an order that is Placed
  2. In the Admin Portal as staff, open that order and change its status to Processing
  3. Return to My orders and refresh the page (the circular arrow next to the address bar)
  4. The list still says Placed, but clicking View shows Processing
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** [view the screenshot](screenshots/client-list-stale.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders with some characters, or asking for zero per page, makes the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** A search containing a character such as an opening bracket or a backslash makes the system fail instead of showing no results. Asking for zero orders per page also fails.
- **Who is affected:** Customers and staff using order search.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The search shows matching orders or none, and bad page sizes are refused politely.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Some error messages reveal the system's internal workings

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** If a badly formed request is sent, the reply includes internal technical details and the location of files on the server, which helps an attacker.
- **Who is affected:** The company, since the details make attacks easier.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, plain error message with no internal details.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: On a phone, the New order page is too wide and the Place order button is off the screen

- **Where:** Client Portal → New order
- **What happens:** On a phone-sized screen the page is wider than the screen. The Place order button sits partly out of view, so ordering from a phone is awkward and the Remove button is hidden behind the quantity box.
- **Who is affected:** Customers who order from a phone.
- **How to see it yourself:**
  1. Open the Client Portal on a phone, or make the browser window narrow by dragging its edge
  2. Sign in as a customer and click New order
  3. The page is wider than the screen and Place order is cut off at the right
- **What should happen:** Everything fits the screen and Place order can be tapped without sideways scrolling.
- **Screenshot:** [view the screenshot](screenshots/new-order-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟠 Important: The password-reset step is still working but has been removed from the written description of the system

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The written description no longer lists the step where a customer chooses a new password, yet the system still accepts it. Either the description is wrong or the step should have been switched off. We only tried an invalid reset code, so no password was changed.
- **Who is affected:** Developers and testers relying on the description, and customers if the step was meant to be removed.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The description and the system agree.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: The Reports page is slow to show figures

- **Where:** Admin Portal → Reports
- **What happens:** After opening Reports the page waits about four seconds before the sales figures appear.
- **Who is affected:** Staff who open the sales summary.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as staff
  2. Click Reports
  3. Count the seconds until the sales figures appear: about four
- **What should happen:** The figures appear within about three seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: A few buttons and fields have no name for people who use screen readers

- **Where:** Admin Portal → Orders, and Client Portal → New order
- **What happens:** Two small icon buttons and the search box on the staff Orders page, and the product list on the New order page, are not described to software that reads the screen aloud for blind users.
- **Who is affected:** Blind or low-vision users.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every button and field has a clear name.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

## What changed since the last check

- Seen for the first time: the "Order details" screen in the Client Portal (it is new, or the earlier check did not reach it).
- Seen for the first time: the "Help centre" screen in the Client Portal (it is new, or the earlier check did not reach it).
- Seen for the first time: the "Customers" screen in the Admin Portal (it is new, or the earlier check did not reach it).
- New since the last check: a new behind-the-screens function ("List help articles").
- No longer found: a behind-the-screens function that existed before.

## Compared with the last check

- Last check (2 November 2026, full check): 3 critical, 6 important, 2 minor.
- This check: 3 critical (same), 7 important (1 more), 2 minor (same).
- Key journeys fully checked: 5 of 5 this time, 5 of 5 last time.
- We do not yet track which problems are new and which are repeats of earlier ones.

## What was not tested

- **Password reset emails**: Checking them would send emails and no safe test mailbox could be used in this run. Reading the code suggests the link in the email may be broken, so a developer should check it.
- **Exporting orders to a spreadsheet file**: The Export button on the staff Orders page was not tried in this run.
- **Expired sign-in and double-clicking Place order on screen**: These were not tried on screen in this run.
- **Two of the customer test accounts on screen**: These accounts were checked behind the screens but not by signing in to the portal.

## Suggested next steps

1. Have a developer fix the customer and order access problems first.
2. Correct the tax calculation for discounted orders.
3. Make signing out really end the session, then fix the order checks and the phone layout.

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
