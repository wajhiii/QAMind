⛔ **Not ready to release:** 5 critical problems found and 4 important problems, for example: Customers are charged too much tax on large orders.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 4 important · 🟡 3 minor
> - Biggest risk: Any signed-in customer can read other companies' orders and the staff-only customer list with personal and card details.
> - Not tested: Broad automatic checks as a staff member; Password reset emails; Sessions that run out of time and 2 more.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 2 important. Part of this area was not fully checked. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 important, 2 minor. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Customers are charged too much tax on large orders

- **Where:** Client Portal → New order, and Admin Portal → Orders → an order
- **What happens:** On orders of $1,000 or more the 5% discount is given, but tax is still worked out on the price before the discount. An order that should total $1,045.00 shows $1,050.00.
- **Who is affected:** Every customer placing an order of $1,000 or more, and staff reading sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type a reference, choose Ballpoint Pens, box of 50 and set the quantity to 80
  4. Click Place order once
  5. You see the confirmation 'Total: $1,050.00'. The correct total is $1,045.00 (subtotal $1,000.00, discount $50.00, tax $95.00).
- **What should happen:** Tax is calculated after the discount, giving $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/ui-order-total-wrong.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: One company's customer can read another company's orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Anyone signed in as a customer can read the full details of another company's order if they know or guess its number. Order numbers run in sequence, so guessing is easy.
- **Who is affected:** Every customer company: their order contents and totals can be seen by competitors.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Company A and open any order; note the number at the end of the address
  2. Sign out, then sign in as a customer of Company B
  3. Change the number at the end of an order page address to the Company A order number
  4. You see Company A's order
- **What should happen:** Company B's customer is refused or told the order does not exist.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Customers can see the private customer list meant only for staff

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The staff-only customer list, which holds contact details, ID numbers, addresses and card hints, can be read by any signed-in customer. The screens hide the page, but the data is not protected.
- **Who is affected:** All customers, whose personal details are exposed.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only staff can see customer records.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Signing out does not really end the session

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** After a user signs out, their sign-in is still accepted by the system. Anyone who obtained it (shared computer, copied) can keep using the account.
- **Who is affected:** Every user, especially on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the session at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities or no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders for minus three items, zero, half an item, more than 1,000 items, or nothing at all are accepted. A negative order produces a negative total that reduces sales figures.
- **Who is affected:** The company's sales figures and staff handling such orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Customers keep seeing an old order status in My orders

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the My orders list still shows the old status for several minutes, while the order's own page shows the new one. Customers see two different statuses.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and look at My orders; note an order showing 'Placed'
  2. In the Admin Portal open that order and click Update status to Processing
  3. Back in the Client Portal refresh My orders (circular arrow next to the address bar)
  4. The list still says Placed, while opening the order shows Processing
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** [view the screenshot](screenshots/client-list-stale-status.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: A double click on Place order creates the order twice

- **Where:** Client Portal → New order
- **What happens:** If a customer clicks Place order twice quickly, two identical orders are placed and charged.
- **Who is affected:** Customers placing orders, and staff who must cancel duplicates.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order, type a reference, choose a product
  3. Double-click Place order
  4. Open My orders: the order appears twice
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Searching orders for certain characters, or an odd page size, makes the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Typing a bracket or backslash into an order search, or asking for zero items per page, produces a system failure instead of a normal result or a clear message.
- **Who is affected:** Customers and staff searching orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Odd search text is treated as plain text and bad sizes are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Error messages reveal internal technical details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When the system receives a badly formed request, its error message includes internal technical details and the location of program files on the server, which helps attackers.
- **Who is affected:** The company's security.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, plain error message with no internal details.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: On a phone, My orders hides the first order and cuts off the totals

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the filter bar sits on top of the first order, and the Total column is cut off with no sign that it can be scrolled.
- **Who is affected:** Customers using phones.
- **How to see it yourself:**
  1. Open the Client Portal on a phone (or make the browser window narrow) and sign in as a customer
  2. Click My orders
  3. The first order is partly covered by the Status filter and New order button, and totals show cut off such as '$1,0'
- **What should happen:** Nothing overlaps and the totals can be read.
- **Screenshot:** [view the screenshot](screenshots/client-myorders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: Blind users cannot tell what the product dropdown is for

- **Where:** Client Portal → New order
- **What happens:** Software that reads the screen aloud announces the product dropdown with no name.
- **Who is affected:** Customers who use screen-reading software.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The dropdown is announced as Product.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: The Reports page looks empty for about four seconds

- **Where:** Admin Portal → Reports
- **What happens:** After opening Reports only the heading 'Sales summary' is shown for about four seconds before the figures appear, with no message saying it is loading.
- **Who is affected:** Staff reading reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal
  2. Click Reports
  3. Only the heading shows at first; the figures appear about four seconds later
- **What should happen:** A loading message, or figures sooner.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Broad automatic checks as a staff member**: These were prepared but not run; staff-side behaviour was covered by targeted checks.
- **Password reset emails**: Checking them could send emails and no safe test mailbox is set up for this check.
- **Sessions that run out of time**: It would take too long to wait for a sign-in to expire.
- **Admin Portal on a phone**: The staff screens were only checked on a large screen.
- **Urdu company display in detail**: Only the orders list was looked at for the Urdu company.

## Suggested next steps

1. Have a developer fix the access problems and the sign-out problem first.
2. Correct the tax calculation and refuse impossible quantities before more orders are placed.
3. Stop duplicate orders and the old status in My orders, then re-run this check.

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
