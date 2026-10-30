⛔ **Not ready to release:** 1 critical problem found, for example: A customer can open another company's order.

> **30-second summary**
> - Checked on 30 October 2026 · Environment: local demo · Type of check: full check (everything we could reach)
> - We looked at 4 areas: 1 fine, 3 with problems, 0 not checked.
> - Problems: 🔴 1 critical · 🟠 1 important · 🟡 1 minor
> - Biggest risk: Customers' orders can be read by other customers.
> - Not tested: Password reset emails; Admin Portal → Customers page.

## What we found, by area

| Area | Result | Notes |
|---|---|---|
| Who can see and do what (permissions) | ⛔ | Problems found: 1 critical. |
| Admin Portal | ⚠️ | Problems found: 1 minor. Part of this area was not fully checked. |
| Behind the screens (the back-end system) | ⚠️ | Problems found: 1 important. |
| Client Portal | ✅ | Nothing wrong found in what was checked. |

✅ nothing wrong found · ⚠️ problems found or only partly checked · ⛔ serious problems or not checked

## Problems found

To follow the steps you need a test login for each kind of person they mention (for example a customer or an administrator). Ask the person who ran this check to give you one. Problems marked "Behind the screens" are in the part of the system that works out of sight, so they cannot be seen on screen; a developer confirms them.

### 🔴 Critical: A customer can open another company's order

- **Where:** Client Portal → My orders → an order page
- **What happens:** A signed-in customer who changes the number in the page address can read another company's order, including what they bought and what they paid.
- **Who is affected:** Every customer: their orders can be seen by customers of other companies.
- **How to see it yourself:**
  1. Sign in to the Client Portal as a customer of Company A.
  2. Open any order and look at the web address: it ends in a number such as 1050.
  3. Sign out, then sign in as a customer of Company B.
  4. Type the Company A address into the address bar and press Enter.
  5. You see Company A's order.
- **What should happen:** Company B's customer is told the order is not available.
- **Screenshot:** [view the screenshot](screenshots/shot.png)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-001](TECHNICAL-REPORT.md#ISSUE-001)

### 🟠 Important: Technical error details are shown to anyone who sends a broken request

- **Where:** Behind the screens (the part that talks to the Client Portal and Admin Portal)
- **What happens:** When the system receives a request it cannot read, its reply includes internal details about how the system is built.
- **Who is affected:** Everyone indirectly: it makes the system easier to attack.
- **How to see it yourself:** This cannot be seen on screen. A developer can confirm it using the technical details linked at the end of this problem.
- **What should happen:** A short, friendly message with no internal details.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-002](TECHNICAL-REPORT.md#ISSUE-002)

### 🟡 Minor: A discount of nothing is shown as a negative amount

- **Where:** Admin Portal → Orders → an order page
- **What happens:** Orders with no discount show the discount line as -$0.00.
- **Who is affected:** Staff reading order totals; it looks like an error.
- **How to see it yourself:**
  1. Sign in to the Admin Portal.
  2. Open Orders, then open an order below 1,000.00.
  3. Look at the Discount line under the totals.
- **What should happen:** The line shows $0.00, or is hidden.
- **Screenshot:** none (this is not visible on screen)
- **Status:** Not fixed yet
- **Ticket:** none yet
- **Your feedback (optional):** ______
- **For developers:** [ISSUE-003](TECHNICAL-REPORT.md#ISSUE-003)

## What changed since the last check

- We could not tell what changed, because no list of screens and functions was recorded for this check.

## Compared with the last check

- This is the first check of this project, so there is nothing to compare with yet.

## What was not tested

- **Password reset emails**: Testing it would send real emails, and no safe test mailbox is set up.
- **Admin Portal → Customers page**: This was not checked in this run.

## Suggested next steps

1. Have a developer fix the access problem first.
2. Run the check again afterwards.

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
