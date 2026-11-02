⚠️ **Ready with risks:** 2 key journeys were not fully checked. (This counts the 8 fixes made in this check as merged; they are on a separate branch until a developer reviews and merges them.)

> **30-second summary**
> - Checked on 2 November 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 4 areas: 1 fine, 0 with problems, 3 partly checked, 0 not checked.
> - Problems: 🔴 5 critical · 🟠 3 important · 🟡 0 minor · 8 of them fixed and checked
> - Biggest risk: The fixes are not live until a developer reviews, merges and restarts the system, and the browser checks of the Customers page, Urdu display and phone layouts were not completed.
> - Not tested: Password reset emails; Customers page, Urdu display and phone layouts of most pages; Seeing a new status in the browser after staff change it. 1 other thing was seen only once and could not be repeated; they are not counted as problems.
> - Fixes are on branch feature/qa-eval; a developer must review and merge them.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Admin Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Changes showing up correctly across screens | ⚠️ | Nothing wrong found, but part of this area was not fully checked. A problem found here was fixed and checked (see "What was fixed"). |
| Client Portal | ⚠️ | Nothing wrong found, but part of this area was not fully checked. |
| Behind the screens (the back-end system) | ✅ | Nothing is left open in what was checked. 4 problems found here were fixed and checked (see "What was fixed"). |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: Orders of $1,000 or more are charged too much tax

- **Where:** Client Portal → New order → order confirmation (also Admin Portal → Orders → an order)
- **What happens:** When an order gets the 5% discount, the tax is worked out on the price before the discount, so the customer is charged $5.00 too much on a $1,000 order.
- **Who is affected:** Every customer placing an order of $1,000 or more, and staff reading those totals.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer
  2. Click New order
  3. Type any reference, choose Ballpoint Pens, box of 50 and set the quantity to 80
  4. Click Place order
  5. The confirmation says the total is $1,050.00; the correct total is $1,045.00
- **What should happen:** The tax is worked out after the discount, so this order totals $1,045.00.
- **Screenshot:** [view the screenshot](screenshots/client-order-confirmation-total.png)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🔴 Critical: The system accepts orders with impossible quantities

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** Orders with minus three items, zero items, more than 1,000 items, half an item, or no items at all are accepted, which can produce negative or nonsense totals.
- **Who is affected:** The company's sales figures and anyone reading order totals.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Such orders are refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🔴 Critical: One customer can see another company's order

- **Where:** Behind the screens (the part that talks to the Client Portal)
- **What happens:** A signed-in customer who knows or guesses an order number can open an order that belongs to a different company.
- **Who is affected:** Every customer: their orders can be read by customers of other companies.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A customer can open only their own company's orders.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

### 🔴 Critical: Customers can see the list of all customers

- **Where:** Behind the screens (the part that talks to the Admin Portal)
- **What happens:** A signed-in customer can retrieve the staff-only customer list, which includes other companies' contacts.
- **Who is affected:** All customers whose details are on the list.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Only admins can see the customer list.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-004](TECHNICAL-REPORT.md#ISSUE-004)

### 🔴 Critical: Signing out does not actually sign you out

- **Where:** Behind the screens (the part that talks to both portals)
- **What happens:** After a person signs out, their previous sign-in still works for anyone who has a copy of it.
- **Who is affected:** Every user, especially on shared computers.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** Signing out ends the sign-in immediately.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-005](TECHNICAL-REPORT.md#ISSUE-005)

### 🟠 Important: Customers keep seeing an old order status

- **Where:** Client Portal → My orders
- **What happens:** After staff move an order forward, the customer's My orders list can keep showing the old status for up to ten minutes.
- **Who is affected:** Customers waiting on an order.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** My orders shows the new status as soon as the page is reloaded.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-006](TECHNICAL-REPORT.md#ISSUE-006)

### 🟠 Important: Searching orders for some symbols causes an error

- **Where:** Admin Portal → Orders and Client Portal → My orders (search box)
- **What happens:** Typing a symbol such as ( or * in the order search makes the system fail instead of showing results.
- **Who is affected:** Staff and customers who search orders.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The search treats the text literally and shows matching orders or none.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-007](TECHNICAL-REPORT.md#ISSUE-007)

### 🟠 Important: An unusual page size makes the order list fail

- **Where:** Behind the screens (the part that talks to the portals)
- **What happens:** Asking for a page size of zero makes the system fail, and a negative size is wrongly accepted.
- **Who is affected:** Anyone using the order lists in unusual ways; developers integrating.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** The request is refused with a clear message.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Fixed and checked
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-008](TECHNICAL-REPORT.md#ISSUE-008)

## What was fixed

- ✅ Orders of $1,000 or more are charged too much tax: fixed and checked.
- ✅ The system accepts orders with impossible quantities: fixed and checked.
- ✅ One customer can see another company's order: fixed and checked.
- ✅ Customers can see the list of all customers: fixed and checked.
- ✅ Signing out does not actually sign you out: fixed and checked.
- ✅ Customers keep seeing an old order status: fixed and checked.
- ✅ Searching orders for some symbols causes an error: fixed and checked.
- ✅ An unusual page size makes the order list fail: fixed and checked.

Fixes are on branch feature/qa-eval; a developer must review and merge them.

## What changed since the last check

- This is the first check, so there is nothing to compare with.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: The reset flow sends email, so it was not run end to end in this check.
- **Customers page, Urdu display and phone layouts of most pages**: The visual checks stopped after the main order and report pages; these were not looked at.
- **Seeing a new status in the browser after staff change it**: This was confirmed behind the screens but not repeated by reloading the page in a browser.

## Suggested next steps

1. Have a developer review and merge the fix branch, then restart the system
2. Finish the browser checks that were not covered, including Urdu and phone layouts
3. Check whether signed-in sessions also stop working once they expire, and test the password reset email

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
