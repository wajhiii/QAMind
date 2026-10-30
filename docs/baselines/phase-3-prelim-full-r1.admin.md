⛔ **Not ready to release:** 5 critical problems found and 4 important problems, for example: Customers are charged too much tax on large orders.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 5 with problems, 1 partly checked, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 4 important · 🟡 1 minor
> - Biggest risk: Any customer can read another company's orders and the full customer list, and a signed-out session still works.
> - Not tested: Password reset emails; Some Admin Portal pages and steps; Unusual input and phone layout of the New order page and 3 more.
> - 2 other things were seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 3 important. Part of this area was not fully checked. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

### 🔴 Critical: Customers are charged too much tax on large orders

- **Where:** Client Portal → New order → order confirmation, and every order page
- **What happens:** Orders of $1,000 or more get the 5% discount, but tax is still worked out on the full price. An order of $1,079.88 shows a total of $1,133.88 instead of $1,128.48.
- **Who is affected:** Every customer placing an order of $1,000 or more, and staff reading sales totals.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type a reference starting with QA-
  4. Choose Printer Toner Cartridge and set Quantity to 12
  5. Click Place order
  6. You see a total of $1,133.88; the correct total is $1,128.48
- **What should happen:** Tax is worked out after the discount is taken off.
- **Screenshot:** [view the screenshot](screenshots/client-order-confirmation.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: The system accepts orders with impossible quantities

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order can be placed for zero, negative, fractional or more than 1,000 items, or for no items at all. A negative quantity gives a negative total that reduces sales figures.
- **Who is affected:** The company's sales figures and anyone relying on order totals.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Orders are refused unless every quantity is a whole number from 1 to 1,000 and there is at least one item.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: One company's customer can read another company's order

- **Where:** Client Portal → an order page (the address ends in the order number)
- **What happens:** Anyone signed in as a customer can open any other company's order by changing the number in the address, and see its contents and prices.
- **Who is affected:** Customers of every company; their orders are not private.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Company B is refused and sees nothing of Company A's order.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Any customer can see the full list of customers

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The list of all customer records, meant for staff only, can be fetched by any customer account. The Client Portal does not show a link to it, but the system answers anyway.
- **Who is affected:** Every company on the platform; their details are exposed to other customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Customers are refused; only admins can see the list.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: Signing out does not actually end the session

- **Where:** Client Portal and Admin Portal → Sign out
- **What happens:** The Sign out button takes the person back to the sign-in page, but the old sign-in is still accepted by the system behind the screens. Anyone who has a copy of it keeps full access.
- **Who is affected:** Every user, especially those on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** After signing out the old sign-in stops working at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Customers see an out-of-date order status in their order list

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the customer's list keeps showing the old status for a long time, while the order's own page shows the new one. The two screens disagree.
- **Who is affected:** Customers tracking their orders; they may think nothing has happened.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and open My orders
  2. In another browser sign in to the Admin Portal, open that order and change its status to Processing
  3. Back in the Client Portal reload My orders: the order still shows Placed
  4. Open the order: it shows Processing
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** [view the screenshot](screenshots/client-list-stale-status.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Some error replies reveal the system's internal details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** If a badly formed request reaches the system, the reply includes internal technical details and the location of files on the server, which helps an attacker.
- **Who is affected:** The company, if someone probes the system.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Only a short, plain error message is returned.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Searching or paging orders in unusual ways makes the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Typing a bracket or backslash into an order search, or asking for zero items per page, makes the system fail instead of answering normally.
- **Who is affected:** Customers and staff who search orders using punctuation.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Search text is treated as plain text and bad page sizes are refused politely.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Double-clicking Place order may create the same order twice

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When the same order is sent twice at nearly the same moment, the system accepts both and creates two orders.
- **Who is affected:** Customers who click twice or have a slow connection.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the details below.
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: On a phone the order list is partly hidden and totals are cut off

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the first order is covered by the filter bar and the Total amounts are cut off at the screen edge with no sign that you can scroll.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Open the Client Portal on a phone (or a window about 390 pixels wide) and sign in as a customer
  2. Open My orders
  3. You see the first order partly hidden and totals cut off
- **What should happen:** All orders and totals are fully visible.
- **Screenshot:** [view the screenshot](screenshots/client-my-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Checking them would send emails and no safe test mailbox was confirmed. A developer should check that the reset link in the email works.
- **Some Admin Portal pages and steps**: Only part of the Admin Portal was walked through on screen; moving an order to shipped and filtering orders were not repeated there.
- **Unusual input and phone layout of the New order page**: These were checked only behind the screens, not on screen.
- **Protection against repeated requests**: No limit is described for the system, so it was not checked.
- **Client Portal → New order page**: This was not checked in this run.
- **Behind the screens (the back-end system) → Password reset**: sends email

## Suggested next steps

1. Have a developer fix the access and sign-out problems first
2. Then correct the tax calculation and add checks on order quantities
3. Then fix the old status in the order list and the error replies

---
The full technical details, with exact steps for developers, are in `TECHNICAL-REPORT.md`. Feedback written in this report is read by a developer; it is not picked up automatically yet.
Before you share this report outside your team, look at the screenshots for personal information.
