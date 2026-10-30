⛔ **Not ready to release:** 5 critical problems found and 5 important problems, for example: Customers with discounted orders are charged too much tax.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 5 areas: 0 fine, 5 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 5 important · 🟡 2 minor
> - Biggest risk: Any customer can read other companies' orders and the full customer records, including personal and card details.
> - Not tested: Password reset emails; Sign-in expiring after 15 minutes; Admin Portal pages on a phone (except Orders) and 3 more.
> - 1 other thing was seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 3 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 important, 1 minor. Part of this area was not fully checked. |
| Client Portal | ⚠️ | Problems found: 1 important. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Customers with discounted orders are charged too much tax

- **Where:** Client Portal → New order, and every order page
- **What happens:** When an order is $1,000 or more, the 5% discount is given but tax is still worked out on the price before the discount. An $1,000 order shows a total of $1,050.00 instead of $1,045.00.
- **Who is affected:** Every customer placing an order of $1,000 or more, and staff reading those totals and the sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer.
  2. Click New order.
  3. Type a reference such as QA-test, choose Ballpoint Pens, box of 50, and set the quantity to 80.
  4. Click Place order.
  5. The green message says Total: $1,050.00. Open the order: Subtotal $1,000.00, Discount -$50.00, Tax $100.00.
- **What should happen:** Tax should be $95.00 and the total $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-order-detail-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any customer can see other companies' private contact and payment details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A signed-in customer can retrieve the full customer list, which holds other companies' names, phone numbers, addresses, ID numbers and card details. The screens hide this, but the system does not refuse it.
- **Who is affected:** All customers, whose private details are exposed to every other customer.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Customers are refused; only staff can see this list.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: A customer can view another company's orders by changing the address

- **Where:** Client Portal → My orders → an order page
- **What happens:** If a customer of Company B opens the address of a Company A order, the full order is shown. The orders list is filtered correctly, but the direct address is not protected.
- **Who is affected:** All customers; each company's orders can be read by every other company.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Company A, open an order and note the number at the end of the address bar.
  2. Sign in to the Client Portal as a customer of Company B (use a fresh browser window).
  3. Type the Company A order address into the address bar, keeping the same number at the end.
  4. You see Company A's order details.
- **What should happen:** Company B should be told the order does not exist.
- **Screenshot:** [view the screenshot](screenshots/bright-sees-acme-order-ui.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Signing out does not actually end the session

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** After someone signs out, their old sign-in is still accepted by the system. The sign-out button takes them to the sign-in page, but anyone holding the old sign-in can keep working.
- **Who is affected:** Every user of both portals, especially on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the session at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts impossible orders, such as minus one item or no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order for a negative or zero number of items, more than 1,000 of one item, or with no items at all is accepted and saved. A negative order shows a negative total and distorts sales figures.
- **Who is affected:** Customers and staff reading order totals; the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** These orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Error messages expose the system's internal workings

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When the system receives a malformed request it answers with internal technical details and the location of files on the server, which helps an attacker.
- **Who is affected:** The company's security; not visible to normal users.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only a short, plain error message is returned.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching with certain characters in the orders list makes the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** Typing a bracket or backslash into order search, or asking for zero orders per page, makes the system fail with an error instead of showing results.
- **Who is affected:** Staff and customers who search orders using such characters.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Searches work normally and invalid page sizes are refused politely.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: A double click on Place order may create two identical orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When the same order is sent twice at the same moment, two orders are created. It is not stated whether this is intended; we did not check a double click on the screen.
- **Who is affected:** Customers who double click, and staff handling duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** One order is created, or the customer is warned.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: On a phone, the New order form is cut off and the Place order button is out of view

- **Where:** Client Portal → New order
- **What happens:** On a narrow screen the form is wider than the screen, so the fields are cut off and the Place order button is off to the right, hard to find.
- **Who is affected:** Customers ordering from a phone.
- **How to see it yourself:**
  1. Open the Client Portal on a phone, or make the browser window very narrow.
  2. Sign in as a customer and click New order.
  3. The text boxes run past the right edge and Place order is not visible without sliding the page sideways.
- **What should happen:** The whole form fits the screen.
- **Screenshot:** [view the screenshot](screenshots/client-new-order-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟠 Important: Urdu customer names appear reversed and broken in the Admin Portal

- **Where:** Admin Portal → Orders, Customers and Reports
- **What happens:** The Urdu company name is displayed back to front with its letters not joined, so staff cannot read it correctly.
- **Who is affected:** Staff dealing with the Urdu-language customer.
- **How to see it yourself:**
  1. Sign in to the Admin Portal.
  2. Click Orders and find an order from the Urdu customer.
  3. Look at the Client column: the Urdu name reads back to front.
  4. Click Reports: the same name in Sales by client is also reversed.
- **What should happen:** The name reads correctly.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: The Reports page takes about four seconds to show its figures

- **Where:** Admin Portal → Reports
- **What happens:** After opening Reports, only the heading and a spinner appear for around four seconds before the figures show.
- **Who is affected:** Staff who read reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal.
  2. Click Reports.
  3. A spinner shows under Sales summary for about four seconds before the figures appear.
- **What should happen:** The report appears quickly.
- **Screenshot:** [view the screenshot](screenshots/admin-reports-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: Some Admin Portal buttons cannot be understood by screen-reading software

- **Where:** Admin Portal → Orders
- **What happens:** The search box and the two small round icon buttons next to it have no names, so software that reads the screen aloud for blind users cannot say what they do.
- **Who is affected:** Staff who use screen-reading software.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every control has a spoken name.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Checking them would send emails and no safe test mailbox is set up.
- **Sign-in expiring after 15 minutes**: We did not wait the 15 minutes needed to check it.
- **Admin Portal pages on a phone (except Orders)**: These pages were only checked on a computer-sized screen.
- **Client order page on a phone, and the second Acme account on screen**: Not checked on screen in this run.
- **Moving orders to shipped and delivered on screen**: Only the first step was done on screen; the rest were checked behind the screens.
- **Extra security checks**: A dedicated security pass was not run in this check.

## Suggested next steps

1. Have a developer fix the access problems (customer list and other companies' orders) before anything else.
2. Fix the tax calculation and make the system refuse impossible quantities, then make signing out really end the session.
3. Fix the phone layout of New order and the reversed Urdu names, then re-run this check.

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
