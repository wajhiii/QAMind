⛔ **Not ready to release:** 5 critical problems found and 3 important problems, for example: Customers who earn the 5% discount are charged too much tax.

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 4 with problems, 2 partly checked, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 3 important · 🟡 2 minor
> - Biggest risk: Any customer can read other customers' private details and orders, and signing out does not end a sign-in.
> - Not tested: Admin Portal pages on a phone-width screen; New order and order pages on a phone-width screen; Password reset emails and 2 more.
> - 4 other things were seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 2 important, 2 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Customers who earn the 5% discount are charged too much tax

- **Where:** Client Portal → New order → order confirmation (also Admin Portal → Orders → an order page)
- **What happens:** On orders of 1,000.00 or more the discount is given but tax is still worked out on the full price, so the total is higher than the company's own rule says.
- **Who is affected:** Every customer placing a large order, and staff reading those totals and the sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Choose Printer Toner Cartridge and set the quantity to 12
  4. Click Place order
  5. You see a total of $1,133.88; by the stated rules it should be $1,128.48
- **What should happen:** Tax is worked out after the discount is taken off.
- **Screenshot:** [view the screenshot](screenshots/order-confirm-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any customer can see other customers' personal and payment details

- **Where:** Behind the screens (the part that talks to the Admin Portal)
- **What happens:** A customer's sign-in is enough to fetch the full customer list, including other companies' phone numbers, ID numbers, addresses and card details.
- **Who is affected:** Every customer company; their private data is exposed to the others.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only admins can see the customer list; customers are refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: A customer can see another company's order by changing the number in the address

- **Where:** Client Portal → an order page
- **What happens:** Opening an order page whose number belongs to another company shows that company's order details.
- **Who is affected:** All customer companies.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Company A, place an order and note the number at the end of its address
  2. Close the browser, then sign in as a customer of a different company
  3. Type the first company's order address (ending in that number) into the address bar
  4. You see Company A's order
- **What should happen:** The second customer is refused or told the order does not exist.
- **Screenshot:** [view the screenshot](screenshots/cross-tenant-order-ui.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Signing out does not really end the sign-in

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** After a user signs out, their old sign-in still works if someone has a copy of it.
- **Who is affected:** Every user, especially on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the sign-in at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities, including negative ones

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders for zero, minus three, 1.5 or more than 1,000 items, or with no items, are accepted, giving wrong or negative totals.
- **Who is affected:** Customers and staff reading order totals; the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Searching orders for certain characters, or an invalid page size, makes the system fail

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** Searching for a bracket or backslash makes the order list fail instead of showing a result.
- **Who is affected:** Customers and staff searching orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Searches with any characters work or give a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Error messages expose the system's internal technical details

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** Badly formed requests get a reply containing internal technical details and file locations, which help an attacker.
- **Who is affected:** The company's security.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Errors are short and reveal nothing internal.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Customers keep seeing an old order status for a while after staff change it

- **Where:** Client Portal → My orders
- **What happens:** After an admin moves an order forward, the customer's list can still show the old status for a time, though the order page is right.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The new status shows as soon as the page is refreshed.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟡 Minor: The sales summary page is slow to load

- **Where:** Admin Portal → Reports
- **What happens:** The Sales summary shows a loading message for several seconds before figures appear.
- **Who is affected:** Admins opening Reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal
  2. Click Reports
  3. You see the heading and a loading message for about four seconds before the figures
- **What should happen:** The figures appear in a couple of seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: Double-clicking Place order may create two identical orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Two identical orders sent at the same moment are both accepted.
- **Who is affected:** Customers who double-click, and staff handling duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Admin Portal pages on a phone-width screen**: Not reached in this check; only the customer's My orders page was looked at on a phone-sized screen.
- **New order and order pages on a phone-width screen**: Not reached in this check.
- **Password reset emails**: Checking them could send real emails and no safe test mailbox is set up.
- **Exporting orders to a spreadsheet file**: The button is not described in the specification and was not used.
- **Double-clicking Place order, expired sign-ins and keyboard-only use**: Not reached in this check.

## Suggested next steps

1. Have a developer fix the customer-list and order access problems first, then make sign-out end the sign-in.
2. Correct the tax calculation on discounted orders and refuse impossible quantities.
3. Re-run this check after the fixes, then look at the phone-sized screens that were not reached.

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
