✅ **Ready to release:** no critical problems, 2 important problems, and every key journey was checked. (This counts the 9 fixes made in this check as merged; they are on a separate branch until a developer reviews and merges them.)

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 3 areas: 0 fine, 3 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 6 important · 🟡 4 minor · 9 of them fixed and checked
> - Biggest risk: Customers can read other companies' orders and the full customer list with personal details, and signing out does not really end a session.
> - Not tested: Export of orders to a spreadsheet file; Password reset by email; Expired sign-in and 1 more. 1 other thing was seen only once and could not be repeated; they are not counted as problems.
> - Fixes are on branch feature/qa-eval; a developer must review and merge them.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Behind the screens (the back-end system) | ⚠️ | Problems found: 1 important, 1 minor. 5 problems found here were fixed and checked (see "What was fixed"). |
| Client Portal | ⚠️ | Problems found: 1 important, 2 minor. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: A customer can read another company's orders

- **Where:** Client Portal → an order page
- **What happens:** By changing the number at the end of the address of an order page, a customer sees an order that belongs to a different company, including what was bought and the prices.
- **Who is affected:** Every company that orders through the Client Portal: their order details can be read by other companies.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Acme Traders.
  2. Click "My orders", then click any order.
  3. In the address bar, replace the last part of the address (everything after the equals sign) with o-1006, and press Enter.
  4. You see the order of a different company (Bright Foods, reference BF-2201), which you should not be able to see.
- **What should happen:** A customer sees only orders of their own company; any other order is refused or reported as not found.
- **Screenshot:** [view the screenshot](screenshots/client-sees-other-company-order-desktop.png)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Customers can read every company's contact and personal details

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** A signed-in customer can ask the system for the list of all customers and receives contact names, email addresses, phone numbers, national identity numbers, addresses and the last digits of payment cards of every company.
- **Who is affected:** Every company in the customer list, and the business, because personal data is exposed.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only administrators can see the customer list; customers are refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not really end the session

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** After a user presses Sign out, anyone who still has their old sign-in can keep reading orders and account details. The screen looks signed out but the sign-in remains valid.
- **Who is affected:** Every user, especially people on shared or lost computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the sign-in immediately, so it can no longer be used.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Large orders are charged too much tax

- **Where:** Client Portal → New order → order confirmation, and the order page in both portals
- **What happens:** For orders of $1,000.00 or more the 5% discount is given, but tax is still worked out on the price before the discount. An order that should total $1,045.00 is shown and stored as $1,050.00.
- **Who is affected:** Customers placing orders of $1,000 or more, and the sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer.
  2. Click "New order".
  3. Type any reference, choose "Ballpoint Pens, box of 50 ($12.50)" and set the quantity to 80.
  4. Click "Place order".
  5. The confirmation says the total is $1,050.00. The correct total is $1,045.00 (subtotal $1,000.00, minus $50.00 discount, plus $95.00 tax).
- **What should happen:** Tax is worked out after the discount, so the total is $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-order-total-wrong-desktop.png)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities and orders with nothing in them

- **Where:** Client Portal → New order
- **What happens:** An order for minus five items is accepted and shows a negative total; zero, fractional and over-the-limit quantities and orders with no items are accepted too. Negative orders reduce the company's sales figures.
- **Who is affected:** Customers and staff reading order totals, and the company's sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer.
  2. Click "New order".
  3. Type any reference, choose "A4 Copy Paper, 500 sheets ($6.50)" and set the quantity to -5.
  4. Click "Place order".
  5. The confirmation says the order was placed with a negative total (-$35.75) instead of refusing it.
- **What should happen:** The order is refused with a clear message: quantity must be a whole number from 1 to 1,000.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Customers keep seeing an old order status in their list

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the customer's My orders list can keep showing the old status for several minutes, while the order page already shows the new one. The two screens disagree.
- **Who is affected:** Customers following their orders, and support staff who get questions about it.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Acme Traders and click "My orders"; note an order that shows "Placed".
  2. In the Admin Portal, sign in as an administrator, open that order and change its status to Processing with "Update status".
  3. Back in the Client Portal, refresh My orders (the circular arrow next to the address bar): the order still shows "Placed".
  4. Open the order: it shows "Processing".
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** [view the screenshot](screenshots/client-list-stale-status-desktop.png)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders for certain characters shows an error

- **Where:** Admin Portal → Orders → search box (and the same search in the Client Portal)
- **What happens:** Typing a bracket or a backslash in the order search fails with a red error message instead of showing no results.
- **Who is affected:** Staff and customers who search orders using ordinary punctuation.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an administrator and click "Orders".
  2. Click the search box, type ( and press Enter.
  3. A red message "Could not load orders" appears instead of an empty result.
- **What should happen:** The search treats the characters as plain text and shows "no orders" when nothing matches.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-search-paren-desktop.png)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: The orders list fails when asked for zero items per page

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** Asking the orders list for zero items per page makes the system fail, and a negative number is quietly accepted. Ordinary screens do not do this, but any other program using the list can break.
- **Who is affected:** Anything that connects to the order list, and staff running integrations.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Invalid page sizes are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Badly formed requests reveal internal technical details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When the system receives a damaged request, its reply includes internal technical details such as folder names on the server, which helps an attacker learn how the system is built.
- **Who is affected:** The company: it makes attacks easier. Customers are not directly affected.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The reply only says the request was not understood.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟠 Important: A double submission can create the same order twice

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** If the same order is sent twice at the same moment (for example a double click on a slow connection), two orders are created. We are not sure the company wants duplicates blocked, so a person should decide.
- **Who is affected:** Customers, who could be charged twice.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The same order sent twice at once is stored only once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟠 Important: On a phone the New order page does not fit the screen

- **Where:** Client Portal → New order (on a phone or a narrow window)
- **What happens:** The order form is wider than a phone screen. The boxes run off the right edge and the Place order button is hidden until the page is scrolled sideways, and the Remove button sits on top of the quantity box.
- **Who is affected:** Customers who order from a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer, on a phone or with the browser window dragged very narrow (about 390 pixels wide).
  2. Click "New order".
  3. The boxes run off the right edge and "Place order" is not visible without sliding the page sideways.
- **What should happen:** The whole form fits the screen, including the Place order button.
- **Screenshot:** [view the screenshot](screenshots/client-new-order-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: On a phone, My orders is partly hidden and the totals are cut off

- **Where:** Client Portal → My orders (on a phone or a narrow window)
- **What happens:** The bar with the Status filter and the New order button sits on top of the table's heading row and the first order, and the Total column is cut off without a sign that it can be slid sideways.
- **Who is affected:** Customers who check orders from a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer, on a phone or with the browser window dragged very narrow (about 390 pixels wide).
  2. Click "My orders".
  3. The first order is partly covered, the column headings are hidden and the Total amounts are cut off at the right edge.
- **What should happen:** The table starts below the filter bar and shows its totals or clearly shows it can be slid sideways.
- **Screenshot:** [view the screenshot](screenshots/client-my-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

### 🟡 Minor: Some controls on the admin Orders page cannot be understood by screen-reading software

- **Where:** Admin Portal → Orders
- **What happens:** The search box and the two small icon buttons next to the status filter have no name that software reading the screen aloud for blind users can announce.
- **Who is affected:** Staff who are blind or have low vision.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every control has a name that reading software can announce.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-search-paren-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-013](TECHNICAL-REPORT.md#ISSUE-013)

### 🟡 Minor: Urdu names and notes are laid out like English text

- **Where:** Client Portal → My orders and order pages for the Urdu customer; Admin Portal → Customers and Reports
- **What happens:** Urdu words are placed as if they were English, so a reference such as the Urdu word followed by a number puts the number on the wrong side, and Urdu notes are aligned to the left.
- **Who is affected:** Urdu-speaking customers and staff reading their records.
- **How to see it yourself:**
  1. Sign in to the Client Portal as the customer of Zain Traders (Urdu).
  2. Click "My orders".
  3. Look at the references: the number sits to the right of the Urdu word instead of the left, as an Urdu reader would expect.
- **What should happen:** Urdu text reads right-to-left, with numbers on the correct side and notes aligned to the right.
- **Screenshot:** [view the screenshot](screenshots/client-urdu-my-orders-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-014](TECHNICAL-REPORT.md#ISSUE-014)

### 🟡 Minor: The sales summary is slow to appear

- **Where:** Admin Portal → Reports
- **What happens:** After opening Reports the figures take about four seconds to appear.
- **Who is affected:** Administrators reading the sales summary.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an administrator.
  2. Click "Reports".
  3. The heading appears at once but the figures take about four seconds to show.
- **What should happen:** The summary appears within a second or two.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-015](TECHNICAL-REPORT.md#ISSUE-015)

## What was fixed

- ✅ A customer can read another company's orders: fixed and checked.
- ✅ Customers can read every company's contact and personal details: fixed and checked.
- ✅ Signing out does not really end the session: fixed and checked.
- ✅ Large orders are charged too much tax: fixed and checked.
- ✅ The system accepts orders with impossible quantities and orders with nothing in them: fixed and checked.
- ✅ Customers keep seeing an old order status in their list: fixed and checked.
- ✅ Searching orders for certain characters shows an error: fixed and checked.
- ✅ The orders list fails when asked for zero items per page: fixed and checked.
- ✅ Badly formed requests reveal internal technical details: fixed and checked.
- ➖ A double submission can create the same order twice: left for a person to decide.
- ➖ On a phone the New order page does not fit the screen: left for a person to decide.

Fixes are on branch feature/qa-eval; a developer must review and merge them.

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Export of orders to a spreadsheet file**: The export button was not tried in this check.
- **Password reset by email**: The email with the reset link goes to a test mailbox that we cannot read, so the link and the reset were not checked.
- **Expired sign-in**: Waiting for a sign-in to run out was not done, so we do not know whether expired sign-ins are refused.
- **Double click on Place order**: A fast double click on the button was not tried on screen.

## Suggested next steps

1. Have a developer fix the access problems first: other companies' orders, the customer list and sign-out.
2. Correct how tax and quantities are checked on orders, because customers are being overcharged and negative orders are accepted.
3. Fix the phone layout of New order and the old status shown in My orders, then re-test.

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
