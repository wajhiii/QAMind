⛔ **Not ready to release:** 5 critical problems found and 3 important problems, for example: Customers are charged too much tax on orders that get the discount.

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 1 fine, 5 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 3 important · 🟡 1 minor
> - Biggest risk: Customers can see other companies' orders and the customer list, and signed-out sessions stay valid.
> - Not tested: Password reset emails; Sessions that expire; Admin Portal on a phone and 1 more.
> - 2 other things were seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 2 important. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 minor. |
| Admin Portal | ✅ | Nothing wrong found in what was checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Customers are charged too much tax on orders that get the discount

- **Where:** Client Portal → New order, and every order page and total
- **What happens:** For orders of 1,000.00 or more the 10% tax is worked out before the 5% discount instead of after. An order that should total 1,045.00 shows 1,050.00.
- **Who is affected:** Every customer who places an order of 1,000.00 or more, and staff reading those totals.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type a reference, choose Ballpoint Pens, box of 50 ($12.50) and set the quantity to 80
  4. Click Place order
  5. You see a total of $1,050.00; the correct total is $1,045.00 (subtotal 1,000.00, discount 50.00, tax 95.00)
- **What should happen:** Tax is worked out after the discount, so this order totals $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-order-confirmation.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: The system accepts orders with impossible quantities and orders with nothing in them

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders for zero, negative, fractional or more than 1,000 items are accepted, as are empty orders. A negative quantity gives a negative total and lowers the sales figures.
- **Who is affected:** The company's sales figures and staff handling those orders; anyone able to send requests directly.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Customers can read other companies' orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer who knows or guesses the number at the end of another company's order address can see that order's items and totals.
- **Who is affected:** Every company: their order details are open to other customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Another company's order is not shown.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Any signed-in customer can see the full customer list

- **Where:** Behind the screens (the part that talks to the Admin Portal)
- **What happens:** The customer list that only staff should see is available to any customer's sign-in, including other companies' contact details.
- **Who is affected:** All customers, whose details are exposed to each other.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only admins can see the customer list.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: A signed-out session can still be used

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** Pressing Sign out only removes the sign-in from the browser; the old sign-in stays valid and anyone holding a copy can keep using it.
- **Who is affected:** Every user, especially on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** After signing out, the old sign-in stops working at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: My orders keeps showing an old status after staff update an order

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the My orders list keeps showing the old status for up to ten minutes, while the order's own page shows the new one.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and open My orders; note the status of a Placed order
  2. In the Admin Portal, open that order and click Update status to move it to Processing
  3. Back in the Client Portal, refresh My orders (the circular arrow next to the address bar)
  4. The list still says Placed, while opening the order shows Processing
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** [view the screenshot](screenshots/client-stale-status.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders with some characters makes the system fail

- **Where:** Behind the screens (the part that talks to the Admin Portal)
- **What happens:** Searching for text such as an opening bracket makes the system fail, and characters like a dot and star act as wildcards.
- **Who is affected:** Staff and customers searching orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Search matches the typed text and never fails.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: A page size of zero makes the order list fail

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** Asking for pages of zero orders makes the system fail; negative sizes are accepted.
- **Who is affected:** Anyone using the order list through other tools.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A clear message that the page size must be 1 to 100.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟡 Minor: On a phone the My orders list is partly hidden

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the filter bar sits on top of the first order and the order totals are cut off at the edge.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer on a phone, or make the browser window narrow
  2. Open My orders
  3. The first order is partly covered and the totals are cut off
- **What should happen:** Every order and total is readable.
- **Screenshot:** [view the screenshot](screenshots/client-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: No safe test mailbox was running, so the reset email could not be checked.
- **Sessions that expire**: Waiting for the sign-in to time out was not done in this run.
- **Admin Portal on a phone**: The Admin Portal was only checked on a desktop-size window.
- **Client Portal forms on a phone and unusual input**: Forms were only checked with normal input on a desktop-size window.

## Suggested next steps

1. Have a developer review and merge the fixes
2. Then fix what is still open and cover password reset emails and phone layouts

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
