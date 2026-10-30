⛔ **Not ready to release:** 5 critical problems found and 7 important problems, for example: A customer can open another company's order if they know its number.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 7 important · 🟡 2 minor
> - Biggest risk: Any signed-in customer can read another company's orders and every customer's private details, and signing out does not really end a session.
> - Not tested: Password reset emails; What the portals do when a sign-in is missing or has run out; A second user of the same company in the Client Portal sc... and 4 more.
> - 2 other things were seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 4 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. |
| Client Portal | ⚠️ | Problems found: 2 important. Part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: A customer can open another company's order if they know its number

- **Where:** Client Portal → an order page
- **What happens:** Typing another company's order number into the address of the order page shows that company's order, items and prices.
- **Who is affected:** Every company that places orders: their orders can be read by customers of other companies.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of one company and place a new order; note the number at the end of the address when you open it
  2. Sign out, then sign in as a customer of a different company
  3. In the address bar replace the order number at the end of an order page address with the number you noted
  4. You see the first company's order.
- **What should happen:** The second customer is told the order cannot be found.
- **Screenshot:** [view the screenshot](screenshots/cross-company-order-ui.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any signed-in customer can read the full customer list with private details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer's sign-in is enough to fetch every customer's contact details, ID numbers and card digits. The Admin Portal hides this from customers but the system behind it does not.
- **Who is affected:** All customers whose personal details are stored.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only administrators can see customer records.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not actually end the session

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The portals take the person back to the sign-in page, but anyone who kept the old sign-in can still read orders and other data afterwards.
- **Who is affected:** Every user, especially on shared or lost devices.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** After signing out the old sign-in stops working immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Customers are charged too much tax on orders of $1,000 or more

- **Where:** Client Portal → New order → order confirmation
- **What happens:** The 5% discount is applied but tax is still worked out on the price before the discount, so the total is higher than the stated rule.
- **Who is affected:** Customers placing orders of $1,000 or more, and staff reading sales totals.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type any reference, choose Printer Toner Cartridge ($89.99) and type 12 as the quantity
  4. Click Place order
  5. The message says the total is $1,133.88; the correct total is $1,128.48.
- **What should happen:** Tax is worked out on the price after the discount, so the total is $1,128.48.
- **Screenshot:** [view the screenshot](screenshots/order-confirmation-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities or no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders for zero, negative, fractional or over 1,000 items, or with nothing in them, are accepted. A negative order shows a negative total in My orders.
- **Who is affected:** Customers and staff reading order totals; sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Customers keep seeing an old order status in My orders

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, My orders still says Placed while the order's own page says Processing.
- **Who is affected:** Customers following their orders; staff who answer their questions.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and open My orders; note the status of an order that is still Placed
  2. In the Admin Portal, sign in as an administrator, open that order and change its status to Processing
  3. Back in the Client Portal, refresh My orders (the circular arrow next to the address bar)
  4. The order still says Placed, but opening it shows Processing.
- **What should happen:** My orders shows the new status straight away.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Double-clicking Place order can create two identical orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Sending the same order twice at the same moment creates two orders and doubles the charge.
- **Who is affected:** Customers on slow connections and staff handling duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Error messages reveal the system's internal workings

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A badly formed request produces an error containing internal technical details and where files are stored on the server.
- **Who is affected:** The company; it helps an attacker.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, clear message with no internal details.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Searching orders with a bracket or backslash makes the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The search fails with an error when the text contains certain punctuation.
- **Who is affected:** Staff and customers searching orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The search works with any text.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟠 Important: Order lists fail when asked for zero or negative items per page

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A page size of zero makes the system fail and a negative one is silently accepted.
- **Who is affected:** Anything that builds on the order list.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such requests are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟠 Important: The new Help page's Sign out button does nothing

- **Where:** Client Portal → Help
- **What happens:** On the Help page the person's name is missing and clicking Sign out has no effect, so they stay on the page and signed in.
- **Who is affected:** Customers who sign out from the Help page, for example on a shared computer.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click Help in the top menu
  3. Click Sign out at the top right
  4. Nothing happens; the Help page stays open, and My orders still opens without asking you to sign in.
- **What should happen:** Sign out ends the session and shows the sign-in page, like on the other pages.
- **Screenshot:** [view the screenshot](screenshots/help-after-signout-click.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟠 Important: On a phone, the New order form is cut off and the Place order button is hard to reach

- **Where:** Client Portal → New order
- **What happens:** The form is wider than the phone screen, so the right part, including Place order, is out of view.
- **Who is affected:** Customers ordering from a phone.
- **How to see it yourself:**
  1. Open the Client Portal on a phone, or make the browser window very narrow by dragging its edge
  2. Sign in as a customer and click New order
  3. The fields are cut off on the right and the page scrolls sideways; Place order is not visible.
- **What should happen:** The whole form fits on the screen.
- **Screenshot:** [view the screenshot](screenshots/new-order-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

### 🟡 Minor: Some buttons and fields cannot be identified by screen-reading software

- **Where:** Admin Portal → Orders, and Client Portal → New order
- **What happens:** A few controls have no name, so software that reads the screen aloud for blind users cannot tell what they do.
- **Who is affected:** Staff and customers who use screen-reading software.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every field and button has a name.
- **Screenshot:** [view the screenshot](screenshots/admin-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-013](TECHNICAL-REPORT.md#ISSUE-013)

### 🟡 Minor: The sales summary is slow to appear

- **Where:** Admin Portal → Reports
- **What happens:** Opening Reports takes about four seconds before the figures appear.
- **Who is affected:** Administrators.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an administrator
  2. Click Reports
  3. The figures take about four seconds to appear.
- **What should happen:** The figures appear within a couple of seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-014](TECHNICAL-REPORT.md#ISSUE-014)

## What changed since the last check

- New since the last check: the "Help centre" screen in the Client Portal.
- New since the last check: the "Customers" screen in the Admin Portal.
- New since the last check: a new behind-the-screens function ("List help articles").
- No longer found: the behind-the-screens function "Choose a new password with a reset token".

## Compared with the last check

- Last check (30 October 2026, full check): 5 critical, 4 important, 2 minor.
- This check: 5 critical (same), 7 important (3 more), 2 minor (same).
- Parts of the product checked in full: 21 this time, 14 last time.
- We do not yet track which problems are new and which are repeats of earlier ones.

## What was not tested

- **Password reset emails**: Checking them would send emails and no safe test mailbox is set up for this check.
- **What the portals do when a sign-in is missing or has run out**: Not covered in this check.
- **A second user of the same company in the Client Portal screens**: Only checked behind the screens, not on the portal pages.
- **Odd entries and double clicks on the New order form**: Only checked behind the screens, not by typing into the form.
- **Order pages and the Urdu customer's pages on a phone**: Not covered in this check.
- **Using the portals with only a keyboard**: Only an automatic check was done, not a manual one.
- **Protection against repeated wrong passwords and automatic sign-out after a time**: No spare test account or short test timer is available.

## Suggested next steps

1. Have a developer fix the access problems first: other companies' orders, the customer list, and sign-out.
2. Then correct the tax on discounted orders and refuse impossible quantities, because both affect money.
3. Finally fix the Help page sign-out, the phone layout of New order and the old status in My orders.

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
