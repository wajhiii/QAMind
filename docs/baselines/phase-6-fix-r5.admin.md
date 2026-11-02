⛔ **Not ready to release:** 5 critical problems found and 3 important problems, for example: One customer can open another customer's order.

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 1 fine, 4 with problems, 1 partly checked, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 3 important · 🟡 1 minor
> - Biggest risk: Customers can read other companies' orders and the staff customer list, and signing out does not end a session.
> - Not tested: Password reset emails; Customer order list and order pages; Staff order list, status change and customers screens and 2 more.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 2 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. Part of this area was not fully checked. |
| Client Portal | ✅ | Nothing wrong found in what was checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: One customer can open another customer's order

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer who knows or guesses an order number can read the full order of a different company, including items and totals.
- **Who is affected:** Every customer company: their orders can be seen by other companies.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A customer can only open orders of their own company.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Customers can see the list of all customers meant for staff only

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A signed-in customer can retrieve the staff-only list of customer records, even though the screen for it is hidden from them.
- **Who is affected:** All customer companies, whose details are exposed to other customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only staff can see the customer list.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not actually end the session

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** After a user signs out, the old sign-in still works for anyone who has a copy of it.
- **Who is affected:** Every user, especially on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the session at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Orders of 1,000.00 or more are charged too much tax

- **Where:** Client Portal → New order → confirmation
- **What happens:** The 5% discount is applied, but tax is still worked out on the full amount. An order that should total 1,045.00 shows 1,050.00.
- **Who is affected:** Customers placing large orders, and staff reading sales totals.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type any reference in Your PO reference
  4. Choose Ballpoint Pens, box of 50 ($12.50) and set the quantity to 80
  5. Click Place order
  6. The message says Total: $1,050.00 (it should be $1,045.00).
- **What should happen:** The total is $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-order-confirmation.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities or no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order for minus three, zero, a fraction, more than 1,000 items, or no items at all is accepted, which can give negative or meaningless totals.
- **Who is affected:** Staff reading order totals and the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Customers keep seeing the old status of their order

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the customer's order list can keep showing the old status for up to ten minutes.
- **Who is affected:** Customers waiting for their orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The customer sees the new status after reloading.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders for a bracket makes the system fail

- **Where:** Behind the screens (order search)
- **What happens:** Typing a character such as an opening bracket into an order search makes the system return an error instead of results.
- **Who is affected:** Anyone searching orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The search treats the text literally and shows matching orders or none.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: The system fails or misbehaves when a page size of zero or less is requested

- **Where:** Behind the screens (order lists)
- **What happens:** Asking for zero items per page makes the system fail, and a negative number is accepted.
- **Who is affected:** Anything that lists orders with custom page sizes.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such requests are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟡 Minor: The sales report takes about four seconds to appear

- **Where:** Admin Portal → Reports
- **What happens:** The Reports page needs about four seconds before the figures show.
- **Who is affected:** Staff opening Reports.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The report appears within about three seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Not checked: it would send emails and the test mailbox was not read in this run.
- **Customer order list and order pages**: Not checked on screen in this run.
- **Staff order list, status change and customers screens**: Not checked on screen in this run; status change was only checked behind the screens.
- **Phone layout, accessibility and Urdu text display**: Not checked in this run.
- **Sessions that expire on their own**: Not checked in this run.

## Suggested next steps

1. Have a developer fix the access and sign-out problems first
2. Then fix the tax and quantity rules that make order totals wrong
3. Finish checking the screens that were not covered in this run

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
