⛔ **Not ready to release:** 3 critical problems found and 6 important problems, for example: Any customer who signs in can see every other customer's personal and payment details.

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 3 critical · 🟠 6 important · 🟡 2 minor
> - Biggest risk: Any customer can read other customers' personal and payment details and other companies' orders, and large orders are over-charged.
> - Not tested: Password reset emails; Admin Portal Customers page; Admin Portal at phone size and 2 more.
> - 2 other things were seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Behind the screens (the back-end system) | ⚠️ | Problems found: 4 important, 1 minor. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 important. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Any customer who signs in can see every other customer's personal and payment details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer's sign-in is enough to download the full customer list: names, emails, phone numbers, national ID numbers, addresses, card digits and internal notes of all companies. The Admin Portal hides this page from customers, but the data itself is not protected.
- **Who is affected:** Every customer company and their contacts; the company's legal and privacy exposure.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only admins can see the customer list; everyone else is refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: A customer can open another company's order if they know its number

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Order pages are meant to be private to the company that placed them. By changing the number at the end of an order's address, a customer of one company can read another company's order, including what was bought and for how much. Lists and search do hide those orders.
- **Who is affected:** Every customer company; their order contents and prices are exposed to competitors.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A customer who opens another company's order is refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Customers are charged too much on large orders

- **Where:** Client Portal → New order → order confirmation
- **What happens:** Orders of $1,000 or more get the 5% discount, but tax is then worked out on the price before the discount. Every discounted order total is therefore a little too high (for example $1,133.88 shown instead of $1,128.48).
- **Who is affected:** Every customer placing an order of $1,000 or more; sales figures in the Reports page.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click 'New order'
  3. Type any text in 'Your PO reference'
  4. Choose 'Printer Toner Cartridge ($89.99)' and type 12 as the quantity
  5. Click 'Place order'
  6. You see 'Total: $1,133.88'. The correct total is $1,128.48 (subtotal $1,079.88, minus 5% discount $53.99, plus 10% tax on $1,025.89).
- **What should happen:** Tax is worked out after the discount, giving $1,128.48 in this example.
- **Screenshot:** [view the screenshot](screenshots/client-order-confirmation-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🟠 Important: Signing out does not actually end the session

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** After a user signs out, their sign-in still works if someone has a copy of it. A stolen or shared sign-in stays usable.
- **Who is affected:** Every user, especially staff on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Once someone signs out, their sign-in stops working immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🟠 Important: The system accepts orders with impossible quantities, including negative ones

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order for zero, minus three, 1001 or 1.5 items, or for no items at all, is accepted. A negative quantity gives a negative total, which also distorts sales figures.
- **Who is affected:** Customers and staff reading order totals; the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: A customer's My orders list can show an old status for a short while

- **Where:** Client Portal → My orders
- **What happens:** When staff move an order forward, the order's own page shows the new status straight away, but the My orders list keeps showing the old one for a while.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The list shows the new status immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders with certain characters, or asking for zero per page, makes the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** Typing a bracket or backslash in an order search, or asking for zero results per page, makes the system fail instead of answering.
- **Who is affected:** Customers and staff using order search.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Odd input is handled safely with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Some error messages reveal the system's internal technical details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When the system receives a badly formed request it replies with internal technical details, which help an attacker.
- **Who is affected:** The company's security.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, generic error message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: On a phone, the New order page does not fit and the Place order button is off-screen

- **Where:** Client Portal → New order
- **What happens:** On a narrow screen the form is wider than the screen, so the Place order button and parts of the form can only be reached by scrolling sideways.
- **Who is affected:** Customers ordering from a phone.
- **How to see it yourself:**
  1. Open the Client Portal on a phone, or make the browser window narrow by dragging its edge
  2. Sign in as a customer
  3. Click 'New order'
  4. The page is wider than the screen and the 'Place order' button sits off to the right, partly out of view.
- **What should happen:** The whole form fits the screen.
- **Screenshot:** [view the screenshot](screenshots/client-new-order-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: Double-clicking Place order could create the same order twice

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** If the same order is sent twice at the same moment, two orders are created. We could not confirm whether the company wants this.
- **Who is affected:** Customers who double-click, and staff handling duplicate orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A repeated submission is not duplicated.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: The Reports page is slow to show its figures

- **Where:** Admin Portal → Reports
- **What happens:** After opening Reports, a Loading indicator shows for about four seconds before the sales figures appear.
- **Who is affected:** Admins reading reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an admin
  2. Click 'Reports'
  3. The page shows the heading 'Sales summary' and a Loading indicator for about four seconds, then the figures.
- **What should happen:** Figures appear within about three seconds.
- **Screenshot:** [view the screenshot](screenshots/admin-reports-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Checking them would send emails and no safe test mailbox is set up.
- **Admin Portal Customers page**: We did not get to this screen in this check.
- **Admin Portal at phone size**: We did not get to these screens in this check.
- **Client Portal order page, forgot-password page and typing edge cases**: We did not get to these screens and tests in this check.
- **Signing out and session expiry on screen**: Sign-out was checked behind the screens only, and session expiry cannot be waited out.

## Suggested next steps

1. Have a developer fix the customer list and order access problems first.
2. Correct the tax calculation on discounted orders and refuse impossible quantities.
3. Make signing out really end the session, then re-run this check.

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
