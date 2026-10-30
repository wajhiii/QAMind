⛔ **Not ready to release:** 5 critical problems found and 3 important problems, for example: Any customer can see the list of all customers, with personal details.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 3 important · 🟡 5 minor
> - Biggest risk: Any customer can see other companies' customer details and orders, and sign-out does not really end a sign-in.
> - Not tested: Password reset emails; Exporting the order list to a spreadsheet file; Customers screen, and Reports and order pages on a phone and 2 more.
> - 1 other thing was seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 2 important, 3 minor. Part of this area was not fully checked. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Any customer can see the list of all customers, with personal details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer account can ask the system for the full customer list and gets it, including other companies' contact details and payment information. The Admin Portal hides this page from customers, but the system itself does not refuse.
- **Who is affected:** Every customer company whose details are stored.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Customers are refused; only staff see the customer list.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: A customer can open another company's order by changing its number

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** If a customer of one company knows or guesses an order number from another company, the system shows them that order with items and prices. Order lists are correctly separated; single orders are not.
- **Who is affected:** Every customer company.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The other company's order is not shown (it behaves as if it does not exist).
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Orders over 1,000.00 are charged too much tax

- **Where:** Client Portal → New order → confirmation, and Admin Portal → Orders → an order page
- **What happens:** The 5% discount is applied but tax is still worked out on the full price, so customers are charged slightly more than the stated rules allow. A 1,000.00 order shows 1,050.00 instead of 1,045.00.
- **Who is affected:** Every customer placing an order of 1,000.00 or more, and staff reading sales totals.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type any reference, choose Ballpoint Pens, box of 50 and set the quantity to 80
  4. Click Place order
  5. The green message says the total is $1,050.00; the correct amount is $1,045.00
- **What should happen:** Tax is worked out after the discount, so the total is $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-order-confirm-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Signing out does not really end the sign-in

- **Where:** Behind the screens (the part that talks to the Client and Admin Portals)
- **What happens:** The Sign out button takes the person back to the sign-in page, but anyone who has a copy of the old sign-in can still use it afterwards.
- **Who is affected:** Every user, especially on shared or lost computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** After signing out, the old sign-in stops working immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities, including negative totals

- **Where:** Behind the screens (the part that talks to the Client Portal); results show in Client Portal → My orders and Admin Portal → Orders
- **What happens:** Orders with no items, zero, minus or part-item quantities are accepted. A minus quantity gives a negative total such as -$21.45 that then appears in order lists and sales figures.
- **Who is affected:** The company's sales figures and staff reading order totals.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Searching orders for certain characters makes the system fail

- **Where:** Admin Portal → Orders → search box (and the order list in the Client Portal)
- **What happens:** Typing a bracket or backslash into the order search, or asking for zero orders per page, makes the system fail instead of showing no results.
- **Who is affected:** Staff and customers who search orders.
- **How to see it yourself:**
  1. Sign in to the Admin Portal
  2. Open Orders
  3. Type ( in the search box and click Search
  4. The list fails to load or shows an error instead of an empty result
- **What should happen:** An empty result or a clear message, never a failure.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Error messages reveal the system's internal technical details

- **Where:** Behind the screens (the part that talks to the portals)
- **What happens:** When a broken request is sent, the reply includes internal technical details and file locations that help an attacker.
- **Who is affected:** The company's security.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only a short, harmless message is returned.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: The customer's order list still shows the old status after staff update an order

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order to Processing, the list in My orders still says Placed, although the order's own page shows Processing.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and place a new order, then open My orders and note its status (Placed)
  2. In the Admin Portal open Orders, open that order and use Update status to set Processing
  3. Back in the Client Portal, refresh My orders (the circular arrow by the address bar)
  4. The list still says Placed; opening the order shows Processing
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟡 Minor: On a phone the first order and the order totals are partly hidden

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the first order is covered by the filter area and the Total column runs off the edge.
- **Who is affected:** Customers using phones.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer who has orders
  2. Make the window narrow by dragging its edge, or use a phone
  3. Open My orders
  4. The top order is partly covered and the totals are cut off on the right
- **What should happen:** All orders and totals are fully visible.
- **Screenshot:** [view the screenshot](screenshots/client-my-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: Some buttons and fields cannot be understood by software that reads the screen aloud

- **Where:** Admin Portal → Orders; Client Portal → New order
- **What happens:** The search box and two small icon buttons on Orders, and the product and quantity fields on New order, have no name for blind users.
- **Who is affected:** Staff and customers who use screen readers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every field and button has a clear name.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: The order list accepts an impossible page size

- **Where:** Behind the screens (the part that talks to the portals)
- **What happens:** Asking for minus one orders per page is accepted instead of refused.
- **Who is affected:** Developers and integrations.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The request is refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: Clicking Place order twice quickly may create two orders

- **Where:** Client Portal → New order
- **What happens:** Two identical orders sent at the same moment are both accepted. We are not sure whether that is intended.
- **Who is affected:** Customers who double-click.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A repeated order is refused or merged.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

### 🟡 Minor: The Reports page is slow to show its figures

- **Where:** Admin Portal → Reports
- **What happens:** The sales summary takes about four seconds to appear.
- **Who is affected:** Staff opening Reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal
  2. Click Reports
  3. Wait: the figures take about four seconds to appear
- **What should happen:** Figures appear within about three seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-013](TECHNICAL-REPORT.md#ISSUE-013)

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Checking them could send real emails, so they were left out.
- **Exporting the order list to a spreadsheet file**: We did not get to this button in this check.
- **Customers screen, and Reports and order pages on a phone**: We did not get to these screens in this check.
- **A customer's order page on a phone, and double-clicking Place order**: We did not get to these in this check.
- **Behaviour after a sign-in expires, and customers opening staff pages in the browser**: We checked this only behind the screens, not on screen.

## Suggested next steps

1. Have a developer fix the customer-list and single-order access problems first
2. Fix the tax calculation and the checks on order quantities, then recheck existing order totals
3. Make sign-out end the sign-in, then rerun this check

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
