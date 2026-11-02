⛔ **Not ready to release:** 5 critical problems found and 6 important problems, for example: Customers who earn the 5% discount are charged too much tax.

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 6 important · 🟡 2 minor
> - Biggest risk: Any customer can read other customers' private details and other companies' orders, and signing out does not end a sign-in.
> - Not tested: Customer screens for the Urdu-language company; Password reset emails and the reset pages; The spreadsheet export of orders and 2 more.
> - 3 other things were seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 3 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 2 important. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Customers who earn the 5% discount are charged too much tax

- **Where:** Client Portal → New order → order confirmation (also the order pages in both portals)
- **What happens:** On orders of 1,000.00 or more the discount is given but tax is still worked out on the full price, so the total is higher than the company's own rule says.
- **Who is affected:** Every customer placing a large order, and staff reading those totals and the sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Choose Printer Toner Cartridge and set the quantity to 12
  4. Click Place order
  5. You see a total of $1,133.88; by the stated rules it should be $1,128.48
- **What should happen:** Tax is worked out after the discount is taken off.
- **Screenshot:** [view the screenshot](screenshots/client-new-order-confirmation.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any customer can see other customers' personal details

- **Where:** Behind the screens (the part that talks to the Admin Portal)
- **What happens:** A customer's sign-in is enough to fetch the full customer list, including other companies' private contact details.
- **Who is affected:** Every customer company; their private data is exposed to the others.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only admins can see the customer list; customers are refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: A customer can open another company's order

- **Where:** Client Portal → an order page
- **What happens:** If a customer changes the number at the end of an order page's address to another company's order number, that company's order opens.
- **Who is affected:** Every customer company; their orders can be read by other companies.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Company A, place a new order and note the number at the end of the address of its order page
  2. Sign out, then sign in as a customer of a different company
  3. Type the same address, ending with that number, into the address bar
  4. You see Company A's order instead of a refusal
- **What should happen:** A customer only ever sees their own company's orders.
- **Screenshot:** [view the screenshot](screenshots/client-other-company-order.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Signing out does not really end a sign-in

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** After a person signs out, their old sign-in still works if someone has a copy of it, so a stolen or shared sign-in stays usable.
- **Who is affected:** Every customer and staff member, especially on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the sign-in at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities and orders with no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders for zero, minus three, one and a half or more than 1,000 items are accepted, and so are orders with nothing in them. Negative quantities give negative totals.
- **Who is affected:** Staff reading order totals and the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Searching orders for a bracket or a backslash makes the order list fail

- **Where:** Admin Portal → Orders → search box
- **What happens:** Typing a bracket or a backslash in the search box gives the red message 'Could not load orders (500).' instead of results.
- **Who is affected:** Staff and customers who search orders with punctuation.
- **How to see it yourself:**
  1. Sign in to the Admin Portal
  2. Click Orders
  3. Type ( in the search box and press Enter
  4. You see the red message 'Could not load orders (500).'
- **What should happen:** The search runs and shows matching orders, or none.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-search-paren.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Some error replies expose the system's internal technical details

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** When a badly formed message is sent to the sign-in, the reply includes internal technical details that help an attacker.
- **Who is affected:** The company; the details make attacks easier.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Errors say only what went wrong in plain words.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: A customer's My orders page keeps showing the old status after staff change it

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order to Processing, the customer's order page shows Processing but the My orders list still says Placed, so the two screens disagree.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and place a new order
  2. Click My orders and note that the new order says Placed
  3. In the Admin Portal, open that order and click Update status to move it to Processing
  4. Back in the Client Portal sign in again if asked, click My orders and refresh the page (the circular arrow next to the address bar)
  5. You still see Placed in the list, while the order's own page says Processing
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** [view the screenshot](screenshots/client-my-orders-stale.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: The password reset step still works but is no longer in the system's documentation

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The step that sets a new password after a reset link is still active, yet it was taken out of the written description of the system, so nobody reviews or tests it.
- **Who is affected:** Customers resetting passwords, and the people who maintain the system.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The documentation and the system agree on which password steps exist.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟠 Important: On a phone, the New order form is cut off and the Place order button is out of sight

- **Where:** Client Portal → New order (phone-sized screen)
- **What happens:** The text boxes are cut off at the right edge and the Place order button is not visible without sliding the page sideways.
- **Who is affected:** Customers ordering from a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer on a phone, or make the browser window very narrow by dragging its edge
  2. Click New order
  3. You see the form cut off at the right edge and no Place order button
- **What should happen:** The whole form fits the screen with Place order visible.
- **Screenshot:** [view the screenshot](screenshots/client-new-order-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟠 Important: On a phone, the newest order in My orders is hidden behind the filter bar

- **Where:** Client Portal → My orders (phone-sized screen)
- **What happens:** The top order in the list sits underneath the Status filter and New order button and cannot be tapped; the amounts on the right are cut off.
- **Who is affected:** Customers checking orders from a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer who has orders, on a phone or with a very narrow browser window
  2. Click My orders
  3. You see the first order partly hidden under the filter, and tapping it does nothing
- **What should happen:** Every order in the list is fully visible and can be opened.
- **Screenshot:** [view the screenshot](screenshots/client-my-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: Some buttons and boxes cannot be understood by software that reads the screen aloud

- **Where:** Client Portal → New order (product list); Admin Portal → Orders (search box and two small icon buttons)
- **What happens:** People who use software that reads the screen aloud hear no name for the product list, the search box, the refresh button and the clear button.
- **Who is affected:** Blind and low-vision users.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every box and button has a spoken name.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

### 🟡 Minor: Double-clicking Place order could create two orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** If the same order is sent twice at the same moment, the system creates two orders for it.
- **Who is affected:** Customers who double-click, and staff who then see duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-013](TECHNICAL-REPORT.md#ISSUE-013)

## What changed since the last check

- Seen for the first time: the "Help centre" screen in the Client Portal (it is new, or the earlier check did not reach it).
- New since the last check: a new behind-the-screens function ("List help articles").
- No longer found: a behind-the-screens function that existed before.

## Compared with the last check

- Last check (2 November 2026, full check): 5 critical, 3 important, 2 minor.
- This check: 5 critical (same), 6 important (3 more), 2 minor (same).
- Key journeys fully checked: 5 of 5 this time, 3 of 5 last time.
- We do not yet track which problems are new and which are repeats of earlier ones.

## What was not tested

- **Customer screens for the Urdu-language company**: Only checked behind the screens; the right-to-left pages were not opened in the browser this time.
- **Password reset emails and the reset pages**: Checking them sends email, and there is no way to read the test mailbox in this check.
- **The spreadsheet export of orders**: The file was not downloaded or opened, so its contents were not checked.
- **A customer's single order page on a phone-sized screen**: Not looked at in this check.
- **Keyboard-only use and expired sign-ins**: Not looked at in this check.

## Suggested next steps

1. Have a developer fix the customer-list and order access problems first, then make sign-out really end the sign-in.
2. Correct the tax on discounted orders, refuse impossible quantities and empty orders, and fix the phone layout of New order and My orders.
3. Re-run this check after the fixes, then look at the Urdu-language screens, password reset emails and the order export that were not reached.

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
