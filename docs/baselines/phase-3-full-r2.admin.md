⛔ **Not ready to release:** 4 critical problems found and 5 important problems, for example: Any customer can see every other customer's personal and payment details.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 4 critical · 🟠 5 important · 🟡 3 minor
> - Biggest risk: Any customer can read every other customer's personal and card details and other companies' orders, and sign-out does not end a session.
> - Not tested: Password reset emails; Placing an order and viewing one on a phone-sized screen; Admin Reports on a phone-sized screen and 3 more.
> - 1 other thing was seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 1 critical, 3 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 important, 1 minor. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

### 🔴 Critical: Any customer can see every other customer's personal and payment details

- **Where:** Behind the screens (the part that feeds the Admin Portal's Customers page)
- **What happens:** A signed-in customer account can ask for the customer list and gets back everyone's contact details, national ID number, address and card digits.
- **Who is affected:** Every customer company; the business's data-protection obligations.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Customers are refused; only staff can see this list.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: A customer can open another company's order by changing the order number

- **Where:** Behind the screens, and the order page of the Client Portal
- **What happens:** If a customer knows or guesses another company's order id, they can read that order's items, prices and totals.
- **Who is affected:** All customer companies; their commercial confidentiality.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** The other company's order is reported as not found.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not actually end the session

- **Where:** Behind the screens, affecting both the Client and Admin Portals
- **What happens:** After a user signs out, their old session key still works for up to 15 minutes, so anyone holding it can keep reading data.
- **Who is affected:** Anyone using a shared or lost device, and the company's security promise.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Signing out ends the session at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Orders over 1,000 are charged too much tax

- **Where:** Client Portal order confirmation and order pages, Admin Portal orders and reports
- **What happens:** When the 5% discount applies, tax is still worked out on the price before the discount. A $1,139.40 order shows $1,196.37 instead of $1,190.67.
- **Who is affected:** Every customer placing an order of 1,000 or more, and the sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal and open New order
  2. Choose Heavy Duty Stapler, quantity 60, and place the order
  3. Compare the total shown ($1,196.37) with the correct $1,190.67
- **What should happen:** Tax is charged only on the discounted amount.
- **Screenshot:** [view the screenshot](screenshots/client-order-confirmation.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🟠 Important: Orders with zero, negative, huge or no items are accepted

- **Where:** Behind the screens (Client Portal ordering)
- **What happens:** The system accepts an order for minus three items, which gives a negative total that shows in both portals and the sales figures.
- **Who is affected:** Staff reading orders and the sales report; anyone calling the system directly.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: My Orders can keep showing an old status after staff update an order

- **Where:** Client Portal, My Orders
- **What happens:** Staff move an order to Processing, the order page shows it, but the My Orders list still says Placed.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:**
  1. Open My Orders as a client and note an order's status
  2. Have an admin change that order's status
  3. Reload My Orders and compare with the order page
- **What should happen:** The list shows the new status.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders for some characters breaks the page

- **Where:** Admin Portal Orders search and the order lists
- **What happens:** Typing a bracket or backslash into the search box makes the system fail instead of showing no results.
- **Who is affected:** Staff and customers searching orders.
- **How to see it yourself:**
  1. Open Orders in the Admin Portal
  2. Type ( into Search and press Enter
- **What should happen:** A normal list or 'no results'.
- **Screenshot:** [view the screenshot](screenshots/admin-search-paren.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Error messages reveal internal details of the server

- **Where:** Behind the screens
- **What happens:** A badly formed request makes the system answer with technical internals such as file locations.
- **Who is affected:** The company's security; it helps attackers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** A short, safe error message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: My Orders is hard to use on a phone

- **Where:** Client Portal, My Orders
- **What happens:** On a phone the filter bar sits on top of the newest order and the total and View link are cut off.
- **Who is affected:** Customers on phones.
- **How to see it yourself:**
  1. Open My Orders on a phone or narrow window (390 wide)
  2. Look at the first order and the right-hand columns
- **What should happen:** Every order and column can be seen and tapped.
- **Screenshot:** [view the screenshot](screenshots/client-myorders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: The Reports page is slow

- **Where:** Admin Portal, Reports
- **What happens:** The sales summary takes about four seconds to appear and the page looks empty meanwhile.
- **Who is affected:** Admins opening Reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal and open Reports
  2. Wait for the figures to appear
- **What should happen:** The summary appears quickly or shows a loading message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: Some buttons and fields cannot be understood by screen readers

- **Where:** Admin Portal Orders page; Client Portal New order page
- **What happens:** The search box, two small icon buttons and the product dropdown have no name.
- **Who is affected:** Users of screen readers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Each control is named.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: Urdu text is laid out as if it were English

- **Where:** Client Portal My Orders; Admin Customers
- **What happens:** Urdu order names and company names are aligned left, which can look wrong or scramble numbers.
- **Who is affected:** Urdu-speaking customers.
- **How to see it yourself:**
  1. Sign in as the Urdu customer and open My Orders
- **What should happen:** Urdu text reads right to left.
- **Screenshot:** [view the screenshot](screenshots/zain-myorders-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Checking them would send emails and no safe test mailbox was confirmed.
- **Placing an order and viewing one on a phone-sized screen**: Not checked in this session.
- **Admin Reports on a phone-sized screen**: Not checked in this session.
- **Browser checks of expired sessions and typing another company's order link**: Only checked through the system's back end, not in the browser.
- **Browser sign-in as the other customer accounts**: Tested only behind the screens.
- **Moving orders to Shipped and Delivered on screen**: Tested only behind the screens.

## Suggested next steps

1. Fix the customer list and order access checks so customers only see their own data
2. Make signing out end the session and correct the tax calculation on discounted orders
3. Add checks for order quantities and re-run QA

---
The full technical details, with exact steps for developers, are in `TECHNICAL-REPORT.md`. Feedback written in this report is read by a developer; it is not picked up automatically yet.
Before you share this report outside your team, look at the screenshots for personal information.
