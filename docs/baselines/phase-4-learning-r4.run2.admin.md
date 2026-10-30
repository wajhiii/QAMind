⛔ **Not ready to release:** 5 critical problems found and 6 important problems, for example: A customer can open another company's order if they know its number.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 6 important · 🟡 2 minor
> - Biggest risk: Customers can read other companies' orders and the full customer list, and signing out does not end the sign-in.
> - Not tested: Forgot-password page; New order form validation and double click; Moving an order to shipped, delivered or cancelled, and t... and 2 more.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 4 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 1 important. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: A customer can open another company's order if they know its number

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When a signed-in customer asks for an order that belongs to a different company, the system hands it over instead of refusing.
- **Who is affected:** Every customer company: their orders, items and totals can be read by other customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The system refuses and shows nothing about another company's order.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any customer can see the full list of customers

- **Where:** Behind the screens (the part that talks to the Admin Portal)
- **What happens:** A customer who is signed in can retrieve the staff-only list of all customers and their details, even though the Admin Portal hides it from them.
- **Who is affected:** Every customer company: their contact and payment details are exposed to other customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only staff see the customers list; customers are refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not end the session behind the screens

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** The Sign out button takes the person back to the sign-in page, but the sign-in itself stays valid and can still be used to read data.
- **Who is affected:** Anyone who signs out on a shared or lost device; their account stays open to whoever holds the old sign-in.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the sign-in at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Orders of 1,000.00 or more are overcharged

- **Where:** Client Portal → New order, and the order page in both portals
- **What happens:** Tax is worked out on the price before the 5% discount, so large orders cost more than the rules say. A 1,000.00 order is charged 1,050.00 instead of 1,045.00.
- **Who is affected:** Customers who place orders of 1,000.00 or more, and staff reading those totals and the sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Enter any reference starting with QA-, choose 'Ballpoint Pens, box of 50 ($12.50)' and set the quantity to 80
  4. Click Place order
  5. You see a message with 'Total: $1,050.00'. Click View order: Subtotal is $1,000.00, Discount -$50.00, Tax $100.00.
- **What should happen:** Tax of $95.00 and a total of $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/order-detail-tax.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities or no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order for zero items, a fraction of an item, more than 1,000 items, or nothing at all is accepted and stored.
- **Who is affected:** Customers and staff reading order totals; sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: A customer's order list can keep showing an old status

- **Where:** Client Portal → My orders (seen behind the screens)
- **What happens:** After staff move an order forward, the single order page shows the new status but the list of orders still shows the old one, even after waiting half a minute.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The list shows the new status straight away.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Badly formed requests reveal internal technical details

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** If the system receives a garbled request it replies with internal technical details, including where its files are stored.
- **Who is affected:** The company: this helps an attacker learn how the system is built.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, plain error with no internal details.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Searching orders with punctuation, or an odd page size, makes the system fail

- **Where:** Behind the screens (the part that talks to the Admin and Client Portals)
- **What happens:** Searching for text such as an opening bracket, or asking for zero items per page, makes the system fail instead of answering.
- **Who is affected:** Staff and customers using order search.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A clear message for invalid values and normal search for punctuation.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Double-clicking Place order can create two identical orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** If the same order is sent twice at the same moment, both are stored and counted.
- **Who is affected:** Customers who double-click, and staff who must clean up duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟠 Important: A password-reset function is hidden from the documentation but still works

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The documentation no longer lists the step that sets a new password from a reset link, but the system still accepts it.
- **Who is affected:** The company: a working function nobody is tracking or testing.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The documentation and the system agree.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟠 Important: On a phone, the order list is cut off and the top row is hidden

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the order totals are cut off and the top order is partly covered by the filter and the New order button.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Make the window narrow by dragging its edge, or use a phone
  3. Click My orders
  4. You see the Total column cut off and the first order partly hidden under the New order button.
- **What should happen:** Every column is readable and nothing is covered.
- **Screenshot:** [view the screenshot](screenshots/my-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: Admin Orders: the search box and two icon buttons are not announced properly to screen readers

- **Where:** Admin Portal → Orders
- **What happens:** Software that reads the screen aloud for blind users cannot say what the search box, the refresh button and the clear button do.
- **Who is affected:** Staff who use screen readers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Each control has a spoken name.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

### 🟡 Minor: The sales summary page takes about four seconds to show figures

- **Where:** Admin Portal → Reports
- **What happens:** The Reports page waits about four seconds before the figures appear.
- **Who is affected:** Staff opening Reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an admin
  2. Click Reports
  3. The figures appear after about four seconds.
- **What should happen:** Figures appear within about three seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-013](TECHNICAL-REPORT.md#ISSUE-013)

## What changed since the last check

- Seen for the first time: the "Help centre" screen in the Client Portal (it is new, or the earlier check did not reach it).
- New since the last check: a new behind-the-screens function ("List help articles").
- No longer found: a behind-the-screens function that existed before.

## Compared with the last check

- Last check (30 October 2026, full check): 5 critical, 4 important, 2 minor.
- This check: 5 critical (same), 6 important (2 more), 2 minor (same).
- Parts of the product checked in full: 15 this time, 11 last time.
- We do not yet track which problems are new and which are repeats of earlier ones.

## What was not tested

- **Forgot-password page**: Checking them would send emails and no safe test mailbox was confirmed.
- **New order form validation and double click**: These were only checked behind the screens, not by using the form.
- **Moving an order to shipped, delivered or cancelled, and the admin order page on a phone**: Only the first status step was tried in this run.
- **Customer screens for the second Acme user and the Bright Foods user**: These accounts were checked behind the screens only, not in the browser.
- **Admin pages on a phone**: Automatic checks found nothing but the screens were not looked at one by one.

## Suggested next steps

1. Have a developer fix the three access problems first: other companies' orders, the customers list, and sign-out.
2. Fix the tax calculation so orders of 1,000.00 or more are charged correctly, and add checks for quantities and empty orders.
3. Fix the phone layout of My orders and the search errors, then test again.

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
