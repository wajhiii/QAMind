✅ **Ready to release:** no critical problems, 1 important problem, and every key journey was checked. (This counts the 9 fixes made in this check as merged; they are on a separate branch until a developer reviews and merges them.)

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 4 areas: 1 fine, 3 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 5 important · 🟡 3 minor · 9 of them fixed and checked
> - Biggest risk: Any signed-in customer can read other companies' orders and every customer's private details, including card and national ID numbers.
> - Not tested: Password reset behind the screens; Password reset pages; Exporting orders to a spreadsheet file and 3 more. 1 other thing was seen only once and could not be repeated; they are not counted as problems.
> - Fixes are on branch feature/qa-eval; a developer must review and merge them.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Admin Portal | ⚠️ | Problems found: 1 minor. |
| Behind the screens (the back-end system) | ⚠️ | Problems found: 1 important, 1 minor. Part of this area was not fully checked. 5 problems found here were fixed and checked (see "What was fixed"). |
| Client Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ✅ | Nothing is left open in what was checked. A problem found here was fixed and checked (see "What was fixed"). |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: A customer can see another company's orders

- **Where:** Client Portal → an order page
- **What happens:** A signed-in customer who types the address of another company's order sees that order's items and prices.
- **Who is affected:** Every company that places orders: their orders can be read by customers of other companies.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Company A
  2. Place a new order and click View order; note the number at the end of the address bar
  3. Sign out, then sign in to the Client Portal as a customer of a different company
  4. Change the number at the end of the address to the one you noted and press Enter
  5. You see Company A's order
- **What should happen:** The customer is told the order does not exist, and sees nothing of it.
- **Screenshot:** [view the screenshot](screenshots/zain-sees-acme-order.png)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any customer can download the full list of customers, with private details

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** A customer's sign-in is enough to fetch every company's contact details, national ID numbers, addresses and card details. The Admin Portal hides this, but the data is not protected.
- **Who is affected:** All customers of the company: their private details can be read by any other customer.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only staff signed in as admin can see customers; everyone else is refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Orders of $1,000 or more are charged too much tax

- **Where:** Client Portal → New order → order confirmation, and every order page
- **What happens:** The 5% discount is given, but tax is still worked out on the price before the discount, so large orders cost more than they should.
- **Who is affected:** Every customer placing an order of $1,000 or more, and everyone reading those totals and the sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order, type a reference, choose Printer Toner Cartridge and set the quantity to 12
  3. Click Place order
  4. The message says the total is $1,133.88; the correct total is $1,128.48
- **What should happen:** Tax is worked out after the discount, so the total is $1,128.48.
- **Screenshot:** [view the screenshot](screenshots/client-order-confirmation.png)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Signing out does not really sign you out

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** After a person signs out, their old sign-in still works if someone has a copy of it, until the server restarts. The screens send the person back to the sign-in page, so this cannot be seen on screen.
- **Who is affected:** Anyone using a shared or lost device, and every customer whose sign-in could be copied.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Once someone signs out, the old sign-in stops working immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities and orders with nothing in them

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order for minus three items, zero items or half an item is accepted and given a total, which can be negative. Orders with no items at all are accepted too.
- **Who is affected:** The company's sales figures and anyone who reads order totals; customers could place orders that reduce sales.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Searching orders for a bracket or backslash fails

- **Where:** Admin Portal → Orders → Search
- **What happens:** Typing a bracket or backslash in the search box shows 'Could not load orders (500).' instead of results.
- **Who is affected:** Staff and customers who search orders by references that contain such characters.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an admin
  2. On the Orders page type ( in the search box and press Enter
  3. You see the message 'Could not load orders (500).'
- **What should happen:** The search simply finds orders containing that character, or none.
- **Screenshot:** [view the screenshot](screenshots/admin-search-paren.png)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: The orders list fails or misbehaves for an impossible page size

- **Where:** Behind the screens (the part that talks to the portals)
- **What happens:** Asking for zero orders per page makes the system fail, and a negative number is accepted instead of refused.
- **Who is affected:** Anyone or any tool that asks for unusual list sizes; the portals themselves do not.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The request is refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Customers keep seeing the old order status in My orders

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, My orders can keep showing the old status for up to ten minutes, while the order's own page shows the new one.
- **Who is affected:** Customers waiting for their orders, and staff who get questions about them.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and open My orders
  2. In another window sign in to the Admin Portal, open one of that customer's orders and change its status
  3. Go back to the customer's window and refresh My orders (the circular arrow next to the address bar)
  4. The order still shows its old status in the list, though opening it shows the new one
- **What should happen:** My orders shows the new status right away.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Some errors reveal internal technical details of the system

- **Where:** Behind the screens (the part that talks to the portals)
- **What happens:** When the system receives a broken request it replies with internal technical details, including where its files are stored.
- **Who is affected:** The company: it helps an attacker learn how the system is built.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, plain error message with no internal details.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟠 Important: A double click or repeated send may create the same order twice

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Sending the same order twice at the same moment creates two orders. We did not check whether the button on screen prevents a double click.
- **Who is affected:** Customers who press Place order twice, and staff who then handle a duplicate order.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** One order per submission, or a clear warning about the duplicate.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: On a phone, the filter bar hides part of the orders table

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the filter bar sits on top of the table's column titles and first order, and the Total column runs off the edge.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Open the Client Portal on a phone, or make the browser window narrow
  2. Sign in as a customer and open My orders
  3. The Status filter and New order button cover the first row of the table
- **What should happen:** Nothing is covered and the totals can be read.
- **Screenshot:** [view the screenshot](screenshots/client-my-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: Blind users cannot tell what some buttons and fields are for

- **Where:** Admin Portal → Orders; Client Portal → New order
- **What happens:** Two small buttons, the search box and the product list have no name that software reading the screen aloud can say.
- **Who is affected:** Staff and customers who rely on screen-reading software.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every button and field has a spoken name.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

### 🟡 Minor: The sales summary is slow to appear

- **Where:** Admin Portal → Reports
- **What happens:** The Reports page needs about four seconds before the figures appear, even with few orders.
- **Who is affected:** Staff opening Reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an admin
  2. Click Reports
  3. Count the seconds before the sales figures appear: about four
- **What should happen:** The figures appear within about three seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-013](TECHNICAL-REPORT.md#ISSUE-013)

## What was fixed

- ✅ A customer can see another company's orders: fixed and checked.
- ✅ Any customer can download the full list of customers, with private details: fixed and checked.
- ✅ Orders of $1,000 or more are charged too much tax: fixed and checked.
- ✅ Signing out does not really sign you out: fixed and checked.
- ✅ The system accepts orders with impossible quantities and orders with nothing in them: fixed and checked.
- ✅ Searching orders for a bracket or backslash fails: fixed and checked.
- ✅ The orders list fails or misbehaves for an impossible page size: fixed and checked.
- ✅ Customers keep seeing the old order status in My orders: fixed and checked.
- ✅ Some errors reveal internal technical details of the system: fixed and checked.
- ➖ A double click or repeated send may create the same order twice: left for a person to decide.
- ➖ On a phone, the filter bar hides part of the orders table: left for a person to decide.
- ➖ Blind users cannot tell what some buttons and fields are for: left for a person to decide.
- ➖ The sales summary is slow to appear: left for a person to decide.

Fixes are on branch feature/qa-eval; a developer must review and merge them.

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset behind the screens**: The reset email could not be read because no safe test mailbox is set up for this run.
- **Password reset pages**: They need the reset email, and no safe test mailbox is set up for this run.
- **Exporting orders to a spreadsheet file**: We did not try the download button in this check.
- **Unusual input on the New order screen**: We tried unusual input behind the screens but not by typing it into the New order page.
- **Phone view of the order page and Reports**: We looked at these pages on a normal screen only.
- **Sessions that run out of time**: We could not wait long enough to see a sign-in expire.

## Suggested next steps

1. Have a developer fix the access problems first (other companies' orders, the customer list, signing out).
2. Correct the tax calculation and the order checks so totals and quantities are right.
3. Then fix the search and list failures and the old status shown to customers.

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
