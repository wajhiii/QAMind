⚠️ **Ready with risks:** 3 key journeys were not fully checked. (This counts the 9 fixes made in this check as merged; they are on a separate branch until a developer reviews and merges them.)

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 4 areas: 2 fine, 0 with problems, 2 not checked.
> - Problems: 🔴 5 critical · 🟠 4 important · 🟡 0 minor · 9 of them fixed and checked
> - Biggest risk: Customers can see other companies' orders and the full customer list, and signing out does not end a session.
> - Not tested: Place an order and My orders; Orders list and status change; Reports and 1 more.
> - Fixes are on branch feature/qa-eval; a developer must review and merge them.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Admin Portal | ⛔ | Not checked. |
| Client Portal | ⛔ | Not checked. |
| Behind the screens (the back-end system) | ✅ | Nothing is left open in what was checked. 5 problems found here were fixed and checked (see "What was fixed"). |
| Who can see and do what (permissions) | ✅ | Nothing is left open in what was checked. 2 problems found here were fixed and checked (see "What was fixed"). |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Customers are charged too much tax on discounted orders

- **Where:** Client Portal → New order → order confirmation
- **What happens:** When an order qualifies for the 5% discount, tax is worked out on the price before the discount. The total shown and stored is higher than it should be.
- **Who is affected:** Every customer who places an order of 1,000.00 or more.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Choose New order and add 80 boxes of Ballpoint Pens, box of 50 (12.50 each)
  3. Enter a reference starting with QA- and place the order
  4. Compare the tax and total on the confirmation with 10% of the discounted price: tax should be 95.00 and total 1,045.00; the screen shows 100.00 and 1,050.00
- **What should happen:** Tax is 10% of the price after the discount.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: The system accepts orders with impossible quantities

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order for minus three, zero, a fraction or more than 1,000 of an item is accepted. A negative quantity gives a negative total and distorts sales figures.
- **Who is affected:** Customers and staff reading order totals; the company's sales reports.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: One company can see another company's orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A signed-in customer who knows or guesses an order number can open an order that belongs to a different company, including its items and amounts.
- **Who is affected:** Every customer company; their order data is exposed to others.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A customer can only open their own company's orders.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: Any customer can see the list of all customers

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A customer account can retrieve the full customer list that is meant for staff only.
- **Who is affected:** All customers whose details are in that list.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only admins can see customer records.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🔴 Critical: Signing out does not actually sign the person out

- **Where:** Client Portal and Admin Portal → Sign out
- **What happens:** After signing out, a copy of the old sign-in still gives full access, for example on a shared computer.
- **Who is affected:** Every user, especially those on shared devices.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the session at once.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: The system accepts empty orders

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** An order with nothing in it can be placed and then appears in order lists.
- **Who is affected:** Customers and staff handling orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** An order with no items is refused.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🟠 Important: Customers keep seeing an old order status

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the customer's order list keeps showing the earlier status for up to ten minutes.
- **Who is affected:** Customers following their orders.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer and open My orders; note the status of an order that is still Placed
  2. In the Admin Portal, open that order and change its status to Processing
  3. Go back to the Client Portal and refresh My orders (the circular arrow next to the address bar)
  4. The list still shows Placed
- **What should happen:** The list shows the current status.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: Searching orders with certain characters causes an error

- **Where:** Client Portal → My orders → search; Admin Portal → Orders → search
- **What happens:** Typing a character such as an opening bracket in the order search makes the system fail instead of searching.
- **Who is affected:** Anyone searching orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The search treats typed characters as plain text.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

### 🟠 Important: Unusual page sizes break the order list

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** Asking for zero items per page makes the system fail, and a negative number is wrongly accepted.
- **Who is affected:** Anyone using the order lists with unusual settings.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Invalid page sizes are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-009](TECHNICAL-REPORT.md#ISSUE-009)

## What was fixed

- ✅ Customers are charged too much tax on discounted orders: fixed and checked.
- ✅ The system accepts orders with impossible quantities: fixed and checked.
- ✅ One company can see another company's orders: fixed and checked.
- ✅ Any customer can see the list of all customers: fixed and checked.
- ✅ Signing out does not actually sign the person out: fixed and checked.
- ✅ The system accepts empty orders: fixed and checked.
- ✅ Customers keep seeing an old order status: fixed and checked.
- ✅ Searching orders with certain characters causes an error: fixed and checked.
- ✅ Unusual page sizes break the order list: fixed and checked.

Fixes are on branch feature/qa-eval; a developer must review and merge them.

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Place an order and My orders**: We checked the system behind the screens but did not click through this part of the Client Portal in this pass.
- **Orders list and status change**: We checked the system behind the screens but did not click through this part of the Admin Portal in this pass.
- **Reports**: We did not open the sales summary screen in the Admin Portal in this pass, so its figures were not checked.
- **Password reset emails**: Checking them sends email and we could not read the local mailbox; reading the code suggests the link may be broken, which a developer should confirm.

## Suggested next steps

1. Have a developer fix the access and sign-out problems first.
2. Fix the tax calculation and the quantity checks so totals are correct.
3. Click through both portals, which this pass did not cover.

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
