⛔ **Not ready to release:** 5 critical problems found and 4 important problems, for example: Customers can open other companies' orders if they know the order number.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 1 fine, 4 with problems, 1 partly checked, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 4 important · 🟡 2 minor
> - Biggest risk: Customers can read other companies' orders and every customer's personal and card details, and signing out does not end a session.
> - Not tested: Password reset emails; Searching, filtering and exporting orders in the Admin Po...; Admin Portal on a phone-sized screen and 4 more.
> - 1 other thing was seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 3 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Client Portal | ⚠️ | Problems found: 1 important, 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ✅ | Nothing wrong found in what was checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Customers can open other companies' orders if they know the order number

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer from one company can read the full details of an order that belongs to a different company by using its order number.
- **Who is affected:** Every customer company; their order contents and prices are exposed to competitors.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The system refuses with 'not found' or 'not allowed'.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any customer can see every customer's personal and card details

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** A normal customer login can fetch the full customer list, including other people's contact details, ID numbers, addresses and card information.
- **Who is affected:** All customers; a privacy and legal exposure for the company.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only staff can see the customer list; customers are refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not actually end the session

- **Where:** Behind the screens (sign-in system)
- **What happens:** After a user signs out, their old session key keeps working, so anyone who has it can still act as that user.
- **Who is affected:** All users, especially on shared or lost devices.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Once signed out, the old session key stops working immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Large orders are charged too much tax

- **Where:** Client Portal (order confirmation and order pages), Admin Portal and the reports
- **What happens:** Orders of 1,000.00 or more get the 5% discount, but tax is worked out before the discount, so customers pay more than the stated rule. An 80-pen order shows $1,050.00 instead of $1,045.00.
- **Who is affected:** Customers placing large orders, and the company's sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Open New order, pick Ballpoint Pens and set quantity 80, click Place order
  3. Compare the total shown with the rule: 1,000 minus 5%, plus 10% tax = $1,045.00
- **What should happen:** The total is $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-confirmation-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities or no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders for minus three items, zero items, more than 1,000 items, half an item, or nothing at all are accepted, giving negative or zero totals that appear in the lists and sales figures.
- **Who is affected:** Staff reading order totals and the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Error messages reveal the server's internal workings

- **Where:** Behind the screens (the system's error replies)
- **What happens:** When a badly formed request is sent, the reply includes internal technical detail and the location of program files on the server.
- **Who is affected:** The company's security; it helps an attacker plan an attack.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only a short, plain error message is returned.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders for some characters, or odd page sizes, makes the system fail

- **Where:** Behind the screens (order list used by both portals)
- **What happens:** Searching for a bracket or backslash, or asking for zero items per page, produces a server failure instead of a normal result or a clear message.
- **Who is affected:** Staff and customers who search orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Searches with any characters work, and bad page sizes get a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: A double click on Place order may create two identical orders

- **Where:** Behind the screens (order placement)
- **What happens:** Two identical order requests sent at the same moment are both accepted and become two orders. We are not sure the product intends to prevent this.
- **Who is affected:** Customers who double-click, and staff who must clean up duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: The My orders list is cut off on a phone

- **Where:** Client Portal, My orders page, on a phone-sized screen
- **What happens:** Order totals are cropped and the View links are off the edge of the screen, and the top row is partly hidden.
- **Who is affected:** Customers who check orders from a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal and open My orders
  2. Make the browser window phone-sized (about 390 pixels wide)
  3. Look at the Total column and the View links
- **What should happen:** All order details and links are visible or easy to reach.
- **Screenshot:** [view the screenshot](screenshots/client-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: Screen-reader users cannot tell what the product drop-down is

- **Where:** Client Portal, New order page
- **What happens:** The product choice box has no label, so people using a screen reader are not told what it is for.
- **Who is affected:** Customers who use assistive technology.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The box is labelled, for example 'Product'.
- **Screenshot:** [view the screenshot](screenshots/client-confirmation-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: The sales report is slow to open

- **Where:** Admin Portal, Reports page
- **What happens:** The Reports page waits about four seconds before showing figures.
- **Who is affected:** Admins who use Reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal and click Reports
  2. Wait for the figures to appear
- **What should happen:** The report appears within a couple of seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Testing would send emails and no safe test mailbox was confirmed.
- **Searching, filtering and exporting orders in the Admin Portal screens**: Not tried on screen in this run; only the behind-the-scenes part was checked.
- **Admin Portal on a phone-sized screen**: Only the desktop view was checked in this run.
- **Typing unusual text into the order form on screen**: Only checked behind the scenes, not on the screen itself.
- **Moving an order on to shipped, delivered or cancelled**: Only the first step was tried on screen.
- **Full check of the report's money totals**: Only order counts were compared; amounts were not added up independently.
- **What happens when a session times out**: Could not be triggered safely in this run.

## Suggested next steps

1. Fix the three access and sign-out problems first.
2. Correct the tax calculation and refuse impossible order quantities.
3. Hide technical details from error replies and fix the order search failures.

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
