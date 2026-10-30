⛔ **Not ready to release:** 5 critical problems found and 5 important problems, for example: Any customer who signs in can read the personal details of all other customers.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 6 areas: 0 fine, 6 with problems, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 5 important · 🟡 2 minor
> - Biggest risk: Any customer who signs in can read other customers' personal details and orders, and large orders are overcharged.
> - Not tested: Password reset; Phone-sized screens for the Admin Portal and the New orde...; Unusual input typed into the screens' forms and 2 more.
> - 1 other thing was seen only once and could not be repeated; they are not counted as problems.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 2 critical, 3 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 1 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Problems found: 1 important. Part of this area was not fully checked. |
| Client Portal | ⚠️ | Problems found: 1 important. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Any customer who signs in can read the personal details of all other customers

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer account can ask the system for the full customer list and gets contact names, emails, phone numbers, national ID numbers, addresses and part of card numbers for every company.
- **Who is affected:** Every customer company whose details are stored, and the business's legal exposure for personal data.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only admins can see customer records; customers are refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: A customer can view another company's order by changing the number in the page address

- **Where:** Client Portal → an order page
- **What happens:** A customer of one company can see the full order of a different company (items, prices, totals) just by typing that order's number in the address bar. The My orders list itself is correctly separated.
- **Who is affected:** Every customer company: competitors can see each other's purchases.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Zain Traders
  2. In the address bar, change the number at the end of the address to 1039 (an order placed by Acme Traders during this test run, so the end reads id=o-1039) and press Enter
  3. You see Acme Traders' order QA-iso-1 with its items and totals
- **What should happen:** The customer is refused or told the order does not exist.
- **Screenshot:** [view the screenshot](screenshots/zain-sees-acme-order.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Customers with large orders are charged too much tax

- **Where:** Client Portal → New order → order confirmation and order page
- **What happens:** For orders of $1,000 or more the 5% discount is given, but tax is still worked out on the price before the discount. A $1,000.00 order should total $1,045.00 and is shown as $1,050.00.
- **Who is affected:** Every customer placing orders of $1,000 or more, and the company's sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type QA-UI-1 as the reference, choose Ballpoint Pens, box of 50 and set the quantity to 80
  4. Click Place order
  5. You see Total: $1,050.00; the correct total is $1,045.00
- **What should happen:** Tax is worked out after the discount: $1,045.00 for this order.
- **Screenshot:** [view the screenshot](screenshots/client-confirmation-desktop.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: After signing out, the old sign-in can still be used

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Pressing Sign out takes the person back to the sign-in page, but the sign-in they had keeps working if someone copied it, so a stolen or shared session cannot be shut down.
- **Who is affected:** Every user, especially anyone on a shared computer.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the session at once and it cannot be used again.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities, including negative ones

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders with no items, zero, negative, fractional or more than 1,000 units are accepted. A negative quantity gives an order with a negative total that then appears in the customer's and the admin's order lists.
- **Who is affected:** Staff reading order totals and the company's sales figures; anyone who can place orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Searching My orders can show an old status

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When a customer searches their orders, the results can show the status from before the admin changed it, while the order's own page shows the new status.
- **Who is affected:** Customers following their orders; the browser pages that use search would show an old value.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Search results always show the current status.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: On a phone, the My orders page hides part of the first order and the Total column

- **Where:** Client Portal → My orders (phone-sized screen)
- **What happens:** The filter bar sits on top of the first order, and the Total and View link are pushed off the right edge with nothing showing that more can be scrolled.
- **Who is affected:** Customers using a phone.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer who has orders
  2. Make the browser window narrow by dragging its edge, or use a phone (about 390 pixels wide)
  3. Click My orders
  4. You see the first order partly covered by the Status filter bar, and the Total amounts cut off at the right
- **What should happen:** The list sits below the filter bar and every column can be reached.
- **Screenshot:** [view the screenshot](screenshots/client-my-orders-mobile.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Certain searches or page settings make the order list fail

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Typing a single bracket or backslash into order search, or asking for zero items per page, makes the system fail instead of answering normally.
- **Who is affected:** Customers and staff using order search.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such input is handled gracefully.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Error messages reveal internal technical details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When a badly formed request is sent, the reply includes internal technical details and the location of files on the server, which helps an attacker.
- **Who is affected:** The company's security.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only a short, safe error message is returned.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟠 Important: A double click can place the same order twice

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Two identical orders sent at the same moment are both accepted, so a customer could be billed twice. We are unsure whether repeated references are meant to be allowed.
- **Who is affected:** Customers placing orders and staff handling duplicates.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The second identical order is refused or merged.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

### 🟡 Minor: Some buttons on the admin Orders page cannot be understood by screen readers

- **Where:** Admin Portal → Orders
- **What happens:** The two small round-arrow and clear icons next to the search have no spoken name, and the search box has no label, so blind users cannot tell what they do.
- **Who is affected:** Staff who use software that reads the screen aloud.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Every button and field has a clear name.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-011](TECHNICAL-REPORT.md#ISSUE-011)

### 🟡 Minor: The sales report is slow to appear

- **Where:** Admin Portal → Reports
- **What happens:** Opening Reports shows only the page title for about four seconds before the numbers appear.
- **Who is affected:** Admins reading the report.
- **How to see it yourself:**
  1. Sign in to the Admin Portal as an admin
  2. Click Reports
  3. You see only the heading Sales summary for about four seconds before the figures appear
- **What should happen:** The report appears within a couple of seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-012](TECHNICAL-REPORT.md#ISSUE-012)

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset**: Checking it could send real emails and no safe test mailbox was confirmed.
- **Phone-sized screens for the Admin Portal and the New order page**: We ran out of time in this run and only checked these pages on a desktop-sized screen.
- **Unusual input typed into the screens' forms**: We tested these cases behind the screens but did not repeat them by typing into the forms.
- **Export CSV button and browser checks for two of the customer accounts**: Not covered in this run.
- **Limits on repeated sign-in attempts**: No limit is described, so we did not check one.

## Suggested next steps

1. Have a developer fix the access problems first (customer list, other companies' orders, sign-out).
2. Fix the tax calculation on discounted orders and refuse impossible quantities.
3. Re-run this check after the fixes.

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
