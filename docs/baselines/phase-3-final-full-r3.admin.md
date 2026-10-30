⛔ **Not ready to release:** 4 critical problems found and 3 important problems, for example: A customer can see another company's order if they know its number.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 5 with problems, 1 partly checked, 0 not checked.
> - Problems: 🔴 4 critical · 🟠 3 important · 🟡 1 minor
> - Biggest risk: Any customer can read other companies' orders and the full customer list with national ID numbers, and signing out does not really end a session.
> - Not tested: Forgot-password and reset-password; What happens when a sign-in expires; Customers page and 3 more.
> - 3 other things were seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 3 critical. |
| Admin Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Behind the screens (the back-end system) | ⚠️ | Problems found: 2 important. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: A customer can see another company's order if they know its number

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Customers of one company can open the full details of orders placed by a different company, which breaks the rule that companies never see each other's data.
- **Who is affected:** Every customer company; their order contents and prices are exposed to competitors.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A customer who asks for another company's order is refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any customer can download the list of all customers and their personal details

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** A customer account can obtain every customer's contact details, phone number, national ID number and address, which only staff should see.
- **Who is affected:** Every customer; their personal data is exposed to other companies' users.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only staff accounts can see the customer list.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Customers are charged too much tax on orders of 1,000.00 or more

- **Where:** Client Portal → New order → order confirmation (also My orders and the Admin Portal order page)
- **What happens:** On large orders the 5% discount is applied but tax is still worked out on the price before the discount, so the total is too high. An order for 80 boxes of pens at 12.50 shows 1,050.00 instead of 1,045.00.
- **Who is affected:** Every customer who places an order of 1,000.00 or more; the company's invoices and sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type a reference starting with QA-
  4. Choose Ballpoint Pens, box of 50 and set the quantity to 80
  5. Click Place order
  6. The message says the total is $1,050.00; the correct total is $1,045.00 (1,000.00 minus 50.00 discount plus 95.00 tax)
- **What should happen:** Tax is worked out on the discounted amount, giving a total of 1,045.00.
- **Screenshot:** [view the screenshot](screenshots/ui-order-confirmation.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: After signing out, the old sign-in still works

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** Clicking Sign out takes the person back to the sign-in page, but anyone holding their earlier sign-in could keep using the system.
- **Who is affected:** Every user, especially people on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the sign-in immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🟠 Important: The system accepts orders with impossible quantities or no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders with zero, negative, fractional or more than 1,000 items, or with nothing in them, are accepted and appear in order lists and reports with odd totals.
- **Who is affected:** Customers and staff reading order totals; the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Customers still see the old order status after staff update it

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the customer's order list keeps showing the earlier status, even after refreshing, for up to about 10 minutes.
- **Who is affected:** Every customer waiting for an order update; they may contact support unnecessarily.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and open My orders; note the status of an order that is Placed
  2. Sign in to the Admin Portal as staff, open the same order, choose Processing and click Update status
  3. Return to the Client Portal and refresh the page (the circular arrow next to the address bar)
  4. The order still shows Placed instead of Processing
- **What should happen:** The new status appears as soon as the page is refreshed.
- **Screenshot:** [view the screenshot](screenshots/client-stale-status.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders for certain characters, or an invalid page size, makes the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** Typing a bracket in the order search can cause an error instead of results, and some page-size values are not refused properly.
- **Who is affected:** Customers and staff using order search.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Search treats the text literally and invalid page sizes are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟡 Minor: On a phone, the My orders list overlaps and cuts off information

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the first order is partly hidden behind the filter bar, and the Total and View columns are cut off at the edge.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Make the window narrow by dragging its edge, or use a phone
  3. Click My orders
  4. The first order is partly covered and the Total is cut off at the right edge
- **What should happen:** Every order is fully visible and its total and View link can be reached.
- **Screenshot:** [view the screenshot](screenshots/client-my-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Forgot-password and reset-password**: These send emails, so they were not tried in this run.
- **What happens when a sign-in expires**: Checking it needs waiting for the sign-in time limit to pass, which was not done.
- **Customers page**: The Admin Portal customers page was not opened on screen in this run.
- **Admin Portal order export, order search and phone views**: These features were not tried on screen in this run.
- **Client Portal order detail page and phone view of New order**: These screens were not opened in the browser in this run.
- **Bright Foods customer in the browser**: This customer was only checked behind the screens, not on screen.

## Suggested next steps

1. Have a developer fix the access problems and the sign-out problem first.
2. Correct the tax calculation on discounted orders and add checks on order quantities.
3. Refresh the customer order list when staff change a status, then re-run this test.

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
