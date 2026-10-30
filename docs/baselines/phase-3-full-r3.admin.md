⛔ **Not ready to release:** 5 critical problems found and 4 important problems, for example: Any customer can see the personal and card details of all other customers.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 7 areas: 0 fine, 7 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 4 important · 🟡 4 minor
> - Biggest risk: Customers can see other customers' personal and card details and each other's orders, and signing out does not really end a session.
> - Not tested: Password reset; Customers page on screen; Exporting orders to a spreadsheet and 2 more.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 3 important. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. Part of this area was not fully checked. |
| Client Portal | ⚠️ | Problems found: 2 minor. Part of this area was not fully checked. |
| Client Portal and Admin Portal | ⚠️ | Problems found: 1 minor. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

### 🔴 Critical: Any customer can see the personal and card details of all other customers

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** A customer who is signed in can ask the system for the full customer list and gets it: names, emails, phone numbers, ID numbers, addresses and card information of every company. Screenshots of this data should be reviewed before sharing.
- **Who is affected:** Every customer company and the business, which holds their personal data.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Only admins can see the customer list; everyone else is refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: A customer can open another company's order if they know its number

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order from Company A can be read in full by a signed-in customer of Company B. The other company's order list correctly does not show it, but the order itself opens.
- **Who is affected:** Every customer company: their orders, prices and items can be read by competitors.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** A customer can only open their own company's orders.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not really sign the person out

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** After someone signs out, their old sign-in still works if it was copied or left on a shared computer. The Sign out button takes them back to the sign-in page, but the access itself is not removed.
- **Who is affected:** Every user, especially on shared or lost devices.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Signing out ends access immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Customers are overcharged tax on large orders

- **Where:** Client Portal → New order → order confirmation, and every order page
- **What happens:** Orders of 1,000.00 or more get the 5% discount, but tax is still worked out on the price before the discount. Every such order total is too high.
- **Who is affected:** Customers placing orders of 1,000.00 or more, and the company's sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Choose Printer Toner Cartridge and set the quantity to 12
  4. Type a reference starting with QA-
  5. Click Place order
  6. You see a total of $1,133.88; with the 5% discount the total should be $1,128.47
- **What should happen:** Tax is calculated after the discount is taken off.
- **Screenshot:** [view the screenshot](screenshots/client-confirmation-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders for zero items, minus three items, half an item or more than 1,000 items are accepted, and an order for minus three items has a negative total that is counted in the admin order list and sales numbers.
- **Who is affected:** Staff reading order totals and the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** The order is refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Searching orders with a bracket, or an unusual page size, makes the system fail

- **Where:** Behind the screens (the part behind the orders lists)
- **What happens:** Typing a single bracket or backslash into the order search can make the system fail instead of showing no results.
- **Who is affected:** Staff and customers searching their orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** The search shows normal results or an empty list, never an error.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Some error messages show the system's internal technical details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When the system receives a badly formed request, its reply contains internal technical details that help an attacker.
- **Who is affected:** The business (security exposure); not visible to normal users.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** A short, friendly error with no internal details.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Customers can keep seeing an out-of-date order status in their orders list

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the customer's order list can keep showing the old status, even though opening the order shows the new one.
- **Who is affected:** Customers following their orders; staff who get questions about wrong statuses.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: A double click on Place order can create two orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Two identical orders sent at the same moment both go through. I did not test a real double click on the screen, and it is not stated whether this is wanted.
- **Who is affected:** Customers who click twice, and staff who must cancel duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** A repeated order is stopped or clearly warned about.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: The Reports page is slow to appear

- **Where:** Admin Portal → Reports
- **What happens:** The Sales summary shows a spinner for about four seconds before the numbers appear.
- **Who is affected:** Admins opening Reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an admin
  2. Click Reports
  3. You see a spinning circle for about four seconds before the numbers appear
- **What should happen:** The report appears in under three seconds.
- **Screenshot:** [view the screenshot](screenshots/admin-reports-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: On a phone, the orders list is partly hidden and totals are cut off

- **Where:** Client Portal → My orders (phone-sized screen)
- **What happens:** The first order is covered by the filter bar and the Total column runs off the edge of the screen with no hint to scroll.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer on a phone-sized screen
  2. Click My orders
  3. You see the first order partly hidden and the totals cut off
- **What should happen:** Every order and its total can be seen.
- **Screenshot:** [view the screenshot](screenshots/client-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: Some buttons and fields have no name for screen-reader users

- **Where:** Client Portal → New order and Admin Portal → Orders
- **What happens:** People using screen readers hear nothing meaningful for the product choice box, the search box and two small icon buttons.
- **Who is affected:** Customers and staff who use screen readers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Every field and button has a clear name.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

### 🟡 Minor: Urdu order numbers look jumbled

- **Where:** Client Portal → My orders (Urdu-language company)
- **What happens:** The order reference, which mixes Urdu letters and numbers, is shown with the dash and digits in a confusing order.
- **Who is affected:** Customers of the Urdu-language company.
- **How to see it yourself:**
  1. Sign in to the Client Portal as the Urdu company's user
  2. Open My orders
  3. Look at the Reference column
- **What should happen:** Each reference reads correctly.
- **Screenshot:** [view the screenshot](screenshots/zain-orders.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-013](TECHNICAL-REPORT.md#ISSUE-013)

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset**: Checking it could send real emails and no safe test mailbox was confirmed.
- **Customers page on screen**: I checked the customer data behind the screen but did not open the page itself.
- **Exporting orders to a spreadsheet**: I did not try the export button, so the exported file was not checked.
- **Expired sign-ins and phone layout of remaining pages**: I could not wait for a sign-in to expire, and I only checked the phone layout of two pages.
- **Report figures and later status steps on screen**: I read the report but did not re-add the numbers, and on screen I moved an order only to Processing.

## Suggested next steps

1. Have a developer fix the access problems (customer list, other companies' orders, sign-out) first, then re-test.
2. Fix the tax calculation and the quantity checks so orders are never mispriced or negative.
3. Then fix the failing searches, hidden technical details in errors, and the out-of-date order list.

---
The full technical details, with exact steps for developers, are in `TECHNICAL-REPORT.md`. Feedback written in this report is read by a developer; it is not picked up automatically yet.
Before you share this report outside your team, look at the screenshots for personal information.
