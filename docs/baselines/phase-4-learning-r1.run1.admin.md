⛔ **Not ready to release:** 5 critical problems found and 4 important problems, for example: A customer can open another company's order if they know its number.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 1 fine, 4 with problems, 1 partly checked, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 4 important · 🟡 2 minor
> - Biggest risk: Any signed-in customer can read other companies' orders and every customer's personal details, and signing out does not really end a session.
> - Not tested: Password reset (forgot password and reset pages); Orders list; Admin Portal Customers page and 4 more.
> - 2 other things were seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 4 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Client Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ✅ | Nothing wrong found in what was checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: A customer can open another company's order if they know its number

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Users from one company can read the full details of another company's order, including items and prices, by using the order's number. The order list hides them, but the single order does not.
- **Who is affected:** Every customer company: their orders can be read by other customers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Other companies' orders are refused, as if they did not exist.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: Any signed-in customer can see the list of all customers, including personal details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer's sign-in is enough to fetch every customer's contact details, ID numbers and partial card numbers. The Client Portal does not show this, but anyone can ask for it directly.
- **Who is affected:** All customers whose details are stored.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only staff in the Admin Portal can see customer records.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not really end the session

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** After a user signs out, the old sign-in is still accepted by the system. Anyone who copied it, for example from a shared computer, can keep using the account.
- **Who is affected:** Every user, especially those on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** After signing out, the old sign-in stops working immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Large orders are charged too much tax

- **Where:** Client Portal → New order → order confirmation (also the order pages in both portals)
- **What happens:** For orders of $1,000 or more, the 5% discount is given but tax is still worked out on the price before the discount. An order of $1,000.00 shows a total of $1,050.00 instead of $1,045.00.
- **Who is affected:** Customers placing orders of $1,000 or more, and the company's sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type QA-check in the box Your PO reference
  4. Choose Ballpoint Pens, box of 50 ($12.50) and set Quantity to 80
  5. Click Place order
  6. You see Total: $1,050.00. The correct total is $1,045.00 (1,000.00 minus 50.00 discount, plus 10% tax on 950.00).
- **What should happen:** Tax is worked out after the discount: the total is $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-confirmation-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities or no items

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders with minus quantities, zero, more than 1,000 or no items at all are accepted. A minus quantity gives a negative order total.
- **Who is affected:** Staff reading order totals and the sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** These orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Pressing order twice (or a repeated request) creates two orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Two identical orders sent at the same moment are both accepted as separate orders. We are not certain whether this is intended.
- **Who is affected:** Customers who double-click, and staff who then process duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A repeated order is recognised or refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Some errors reveal the system's internal workings

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When the system receives a broken request it replies with internal technical details and the locations of files on the server, which helps attackers.
- **Who is affected:** The company's security; not visible to normal users.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, harmless error message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Searching orders with some punctuation makes the system fail

- **Where:** Client Portal → My orders and Admin Portal → Orders (search box, if the page sends the text unchanged)
- **What happens:** Searching for a bracket or backslash causes the system to fail instead of showing no results.
- **Who is affected:** Customers and staff using order search.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The search shows matching orders, or none.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: An invalid page size makes the order list fail or return nonsense

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Asking for 0 orders per page makes the system fail, and a negative number is accepted.
- **Who is affected:** Anyone who calls the order list directly; normal screens are not known to be affected.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Invalid page sizes are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: On a phone the first order in My orders is partly hidden

- **Where:** Client Portal → My orders
- **What happens:** On a narrow screen the filter bar sits on top of the first order, so its details are hard to read.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Open the Client Portal on a phone, or make the browser window narrow
  2. Sign in as a customer who has orders
  3. Click My orders
  4. You see the Status filter and New order button covering the top of the first order
- **What should happen:** All orders are fully visible below the filter.
- **Screenshot:** [view the screenshot](screenshots/client-urdu-myorders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: The Reports page is slow

- **Where:** Admin Portal → Reports
- **What happens:** The sales summary takes about four seconds to appear.
- **Who is affected:** Admin staff opening Reports.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an administrator
  2. Click Reports
  3. The Sales summary takes a few seconds to appear
- **What should happen:** The summary appears within about three seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset (forgot password and reset pages)**: Checking them would send emails and no safe test mailbox was set up for this check.
- **Orders list**: We did not open this page on screen in this check.
- **Admin Portal Customers page**: We did not open this page on screen in this check.
- **Customer screens for the other test customers**: They were checked behind the screens only, not on screen.
- **Typing unusual text and double-clicking in the order form**: Not checked on screen in this run.
- **Phone layout of most pages and keyboard-only use**: Not checked in this run.
- **Cancelling orders and automatic sign-out after a long time**: Not checked in this run.

## Suggested next steps

1. Have a developer fix the three access problems first (other companies' orders, customer records, sign out).
2. Then fix the order tax calculation and refuse impossible quantities, because money is affected.
3. Finally hide internal error details and fix the search and paging crashes.

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
