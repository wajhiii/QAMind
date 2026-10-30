⛔ **Not ready to release:** 5 critical problems found and 4 important problems, for example: Customers with large orders are charged too much tax.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 7 areas: 0 fine, 6 with problems, 1 partly checked, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 4 important · 🟡 2 minor
> - Biggest risk: Customers can read other companies' orders and the full list of customers' personal details, and signing out does not really end a session.
> - Not tested: Password reset emails; Double-clicking the Place order button; Admin pages on a phone and 2 more.
> - 1 other thing was seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 3 important. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. |
| Changes showing up correctly across screens | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Client Portal | ⚠️ | Problems found: 1 important. Part of this area was not fully checked. |
| Client Portal, Admin Portal | ⚠️ | Problems found: 1 minor. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Customers with large orders are charged too much tax

- **Where:** Client Portal → New order → confirmation, and every order page
- **What happens:** On orders of 1,000.00 or more the 5% discount is applied, but tax is still worked out on the full price. An order of 1,000.00 shows a total of 1,050.00 instead of 1,045.00.
- **Who is affected:** Every customer placing an order of 1,000.00 or more, and the company's sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type a reference, choose Ballpoint Pens, box of 50 and set the quantity to 80
  4. Click Place order
  5. The message says Total: $1,050.00; it should say $1,045.00 (discount $50.00, tax $95.00)
- **What should happen:** Tax is worked out after the discount, so the total is 1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-confirm-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Customers can see other companies' orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Anyone signed in as a customer can open another company's order if they know or guess its number, including items, prices and company name.
- **Who is affected:** Every customer company; their orders are not private.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A customer can only open orders belonging to their own company.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Customers can read the private records of all customers

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer account can fetch the full customer list that only staff should see, with personal details such as phone numbers, ID numbers, addresses and part of card details.
- **Who is affected:** All customers, whose personal data is exposed.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only admins can see customer records.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Signing out does not really sign the user out

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** The Sign out button takes the user back to the sign-in page, but the old sign-in still works behind the screens. Anyone who got hold of it (for example on a shared computer) can keep using the account.
- **Who is affected:** Every user, especially those on shared devices.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** After signing out, the old sign-in stops working at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities, even negative ones

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders with zero, negative, fractional or more than 1,000 items, or no items at all, are accepted. A negative quantity gives a negative total, which shows in order lists and lowers sales figures.
- **Who is affected:** The company's sales figures and staff reading order totals.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Order search and paging can make the system fail

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Searching orders for text containing a bracket or backslash, or asking for zero items per page, makes the system fail with an error.
- **Who is affected:** Staff and customers searching orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Searches with any characters work, and invalid paging values are refused politely.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: A double click or repeated send can create duplicate orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** If the same order is sent twice at the same moment, the system creates two separate orders.
- **Who is affected:** Customers on slow connections and staff who then handle duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only one order is created.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Error messages reveal internal technical details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When the system receives broken input it replies with internal technical details, which help attackers.
- **Who is affected:** The company's security.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, friendly error with no internal details.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: On a phone the My orders list is overlapped and totals are cut off

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the first order is partly hidden behind the Status and New order buttons, totals are cut off at the edge and the View link cannot be seen without scrolling sideways.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Make the window narrow by dragging its edge, or use a phone
  3. Click My orders
  4. The first order is partly hidden behind the buttons and the Total column is cut off
- **What should happen:** Every column is readable on a phone.
- **Screenshot:** [view the screenshot](screenshots/client-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: Some buttons and fields cannot be understood by screen-reading software

- **Where:** Client Portal → New order, and Admin Portal → Orders
- **What happens:** The product drop-down, the search box and two icon buttons have no name, so software that reads the screen aloud for blind users cannot say what they do.
- **Who is affected:** Users of screen-reading software.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every field and button has a clear name.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: The sales report is slow to appear

- **Where:** Admin Portal → Reports
- **What happens:** After opening Reports, the page shows only its heading for about four seconds before the numbers appear.
- **Who is affected:** Staff reading reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal
  2. Click Reports
  3. Only the heading is shown at first; the numbers appear after about four seconds
- **What should happen:** The numbers appear within a couple of seconds.
- **Screenshot:** [view the screenshot](screenshots/admin-reports-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Checking them could send real emails and no safe test mailbox was confirmed.
- **Double-clicking the Place order button**: Only the behind-the-screens version was checked, not the button itself.
- **Admin pages on a phone**: Only the Customers page was checked on a narrow screen.
- **Opening another company's order by changing the web address**: Checked behind the screens only, not in the browser.
- **Old values after an admin changes an order**: Only checked behind the screens, where changes appeared immediately.

## Suggested next steps

1. Have a developer fix the access problems and the sign-out problem first.
2. Fix the tax calculation and the order quantity checks before more orders are placed.
3. Re-run this check once those are fixed.

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
