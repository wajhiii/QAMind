⛔ **Not ready to release:** 5 critical problems found and 4 important problems, for example: Any customer who signs in can see every customer's private details.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 5 areas: 0 fine, 3 with problems, 2 partly checked, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 4 important · 🟡 1 minor
> - Biggest risk: Any customer account can read other customers' private details and orders, and signing out does not end access.
> - Not tested: Password reset emails; Changing an order's status on screen; Customers page and 4 more.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Behind the screens (the back-end system) | ⛔ | Problems found: 1 critical, 4 important, 1 minor. |
| Business rules (prices, totals, limits) | ⛔ | Problems found: 2 critical. |
| Who can see and do what (permissions) | ⛔ | Problems found: 2 critical. |
| Admin Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Client Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one.

### 🔴 Critical: Any customer who signs in can see every customer's private details

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** A customer account can retrieve the full customer list that is meant for staff only, including phone numbers, national ID numbers, addresses and card digits of other companies.
- **Who is affected:** Every customer whose details are stored, and the company's legal and privacy position.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Customer details are visible to staff only; everyone else is refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: A customer can open another company's order if they know its number

- **Where:** Client Portal → My orders → an order page (address ending in the order number)
- **What happens:** Changing the order number in the address bar can show an order that belongs to a different company, including what they bought and the amounts.
- **Who is affected:** Every company that places orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A customer only ever sees their own company's orders.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: Signing out does not actually end the sign-in

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** After a user signs out, their previous sign-in still works, so anyone who obtained it earlier (for example on a shared computer) keeps access.
- **Who is affected:** All customers and staff, especially anyone using a shared device.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends access at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Orders of $1,000 or more are overcharged

- **Where:** Client Portal → New order → confirmation message
- **What happens:** The 5% discount is applied, but the 10% tax is still worked out on the price before the discount, so the total is too high by about 5% of the tax base.
- **Who is affected:** Every customer placing an order of $1,000 or more, and the company's invoices and sales figures.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Company A
  2. Click New order
  3. Type a reference starting with QA- in Your PO reference
  4. Choose Printer Toner Cartridge ($89.99) and set the quantity to 12
  5. Click Place order
  6. The green message says the total is $1,133.88; by the stated rules it should be $1,128.47.
- **What should happen:** Tax is worked out after the discount is taken off.
- **Screenshot:** [view the screenshot](screenshots/client-order-confirmation.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: The system accepts orders with impossible quantities such as minus three

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order for a negative, zero, fractional or huge number of items is accepted, producing negative totals that appear in My orders and distort sales figures.
- **Who is affected:** Customers and staff reading order totals; the company's sales figures.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The order is refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: The system accepts orders with nothing in them

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An empty order can be placed and shows up in order lists.
- **Who is affected:** Staff processing orders and customers' order history.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** An order with no items is refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders for certain characters makes the system fail

- **Where:** Client Portal → My orders; Admin Portal → Orders (search box)
- **What happens:** Searching for a bracket or backslash, or unusual page sizes, makes the system fail instead of showing results or a clear message.
- **Who is affected:** Anyone searching their orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Searches work with any characters and bad values get a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Error responses reveal internal technical details

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** When something unreadable is sent, the system answers with internal details about how it is built, which helps an attacker.
- **Who is affected:** The company's security.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Errors show a short, safe message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: A double click can place the same order twice

- **Where:** Client Portal → New order
- **What happens:** Sending the same order twice at once creates two orders. We did not try a double click on screen.
- **Who is affected:** Customers who double click and the staff who must cancel extras.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The second copy is refused or flagged.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

### 🟡 Minor: The sales report is slow to open

- **Where:** Admin Portal → Reports
- **What happens:** The report takes about four seconds to appear, and will likely get slower as orders grow.
- **Who is affected:** Staff opening Reports.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The report opens within a couple of seconds.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-010](TECHNICAL-REPORT.md#ISSUE-010)

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Checking them could send real emails and no safe test mailbox was confirmed.
- **Changing an order's status on screen**: Only checked behind the screens, not by clicking in the Admin Portal.
- **Customers page**: We did not open this page on screen in this pass.
- **Signing out on screen**: Only checked behind the screens, not with the Sign out button.
- **Phone-sized screens and accessibility**: Only a desktop-sized window and a few pages were checked.
- **Urdu company's screens (right-to-left text)**: We did not look at these screens in this pass.
- **Sessions that time out**: We could not safely make a sign-in expire during this test.

## Suggested next steps

1. Have a developer fix the access and sign-out problems first.
2. Then correct the tax on discounted orders and refuse impossible quantities.
3. Run this test again afterwards.

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
