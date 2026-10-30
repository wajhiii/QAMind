⛔ **Not ready to release:** 4 critical problems found and 5 important problems, for example: A customer can open another company's order by changing the number in the address.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 4 critical · 🟠 5 important · 🟡 3 minor
> - Biggest risk: Any signed-in customer can read other companies' orders and every customer's private details, and signing out does not really end a session.
> - Not tested: Password reset emails; Admin Portal Customers page; Exporting orders to a file and 4 more.
> - 1 other thing was seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 1 critical, 4 important. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 2 minor. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

### 🔴 Critical: A customer can open another company's order by changing the number in the address

- **Where:** Client Portal → My orders → an order page
- **What happens:** A customer of one company can see the items, prices and totals of orders placed by a different company.
- **Who is affected:** Every customer company: their orders are visible to all other customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Customers only see their own company's orders.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any customer can read every customer's private details, including national ID numbers and payment card information

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** A customer who is signed in can retrieve the contact details, phone numbers, ID numbers, addresses, card digits and staff notes of all customers.
- **Who is affected:** All customers; the company faces privacy and legal exposure.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Only admins can see customer records; everyone else is refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not really sign the person out

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** After a user signs out, their old sign-in still works for anyone who has a copy of it, for example on a shared computer.
- **Who is affected:** Every user, especially people on shared devices.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Once someone signs out, the old sign-in stops working immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Large orders are charged too much tax

- **Where:** Client Portal → New order → order confirmation (also Admin Portal → Orders → an order)
- **What happens:** For orders of $1,000 or more the 5% discount is given, but tax is still worked out on the price before the discount. An order of 80 boxes of pens shows a total of $1,050.00 instead of $1,045.00.
- **Who is affected:** Customers placing orders of $1,000 or more, and the company's sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type a reference, choose Ballpoint Pens, box of 50 and set the quantity to 80
  4. Click Place order
  5. You see a total of $1,050.00; it should be $1,045.00
- **What should happen:** Tax is 10% of the discounted amount, so this order totals $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/admin-order-tax-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🟠 Important: The system accepts orders with impossible quantities, including negative and empty orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders for minus three items, zero items, 1001 items or half an item are accepted, giving negative or zero totals that then show in My orders and Reports.
- **Who is affected:** Staff reading totals and the sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** The order is refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: The My orders list keeps showing an old status after the order has moved on

- **Where:** Client Portal → My orders
- **What happens:** After staff mark an order as processing, the order page shows Processing but the My orders list still says Placed, so customers get conflicting information.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and place an order
  2. In the Admin Portal open that order and change its status to Processing
  3. Back in the Client Portal open My orders and reload the page
  4. The list still says Placed, while opening the order says Processing
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** [view the screenshot](screenshots/client-list-stale-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Error messages reveal the system's internal technical details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When something unexpected is sent, the system replies with internal technical details that help an attacker.
- **Who is affected:** The company's security.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Only a short, safe error message is shown.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Searching orders for certain symbols, or an invalid page size, makes the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** Searching for a bracket or a backslash causes an error instead of a result.
- **Who is affected:** Customers and staff using order search.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Search works for any text and invalid sizes get a clear refusal.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Clicking Place order twice can create two identical orders

- **Where:** Client Portal → New order
- **What happens:** Two identical orders sent at once are both accepted, so a double click may produce duplicates.
- **Who is affected:** Customers and the staff who fulfil orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: On a phone, the filter bar hides the first order and the total is cut off

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the filter and New order button sit on top of the first order and the total is partly off-screen.
- **Who is affected:** Customers using phones.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer on a phone or a narrow window
  2. Open My orders
  3. The first order is partly hidden behind the filter bar and the Total is cut off
- **What should happen:** Nothing overlaps and the totals can be read.
- **Screenshot:** [view the screenshot](screenshots/client-myorders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: The Reports page is slow and shows nothing while loading

- **Where:** Admin Portal → Reports
- **What happens:** After clicking Reports the page stays empty for about four seconds with no sign that anything is happening.
- **Who is affected:** Admin staff.
- **How to see it yourself:**
  1. Sign in to the Admin Portal
  2. Click Reports
  3. The page is empty for about four seconds before figures appear
- **What should happen:** A loading message and a faster result.
- **Screenshot:** [view the screenshot](screenshots/admin-reports-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: The product choice box on New order cannot be understood by screen readers

- **Where:** Client Portal → New order
- **What happens:** People using a screen reader hear no name for the product box.
- **Who is affected:** Customers who use assistive technology.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Every field has a clear name.
- **Screenshot:** [view the screenshot](screenshots/client-confirmation-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Checking them would send emails and no safe test mailbox was confirmed.
- **Admin Portal Customers page**: It shows private customer details, so only the data behind it was checked.
- **Exporting orders to a file**: Not checked in this run.
- **Admin Portal on a phone**: Only the Client Portal was checked on a phone-sized screen.
- **Unusual input and double clicks on the order form**: Only checked behind the screens, not on the actual form.
- **Marking orders delivered or cancelled**: Only part of the status steps were tried.
- **Right-to-left layout for the Urdu company**: Only one page was looked at briefly.

## Suggested next steps

1. Have a developer fix the access problems on order pages and the customer list first.
2. Make signing out end the session and correct the tax calculation on discounted orders.
3. Add checks for order quantities and fix the list that shows old statuses.

---
The full technical details, with exact steps for developers, are in `TECHNICAL-REPORT.md`. Feedback written in this report is read by a developer; it is not picked up automatically yet.
Before you share this report outside your team, look at the screenshots for personal information.
