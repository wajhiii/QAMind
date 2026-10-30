# Test design techniques

Load this when you must decide which inputs to try, turn a business rule into concrete cases, or decide what the
correct result is. It applies to any form, endpoint or flow. Pick the cheapest technique that fits, combine them, and
write the chosen cases into the charter before probing.

## Which technique when

| Situation | Start with |
|-----------|-----------|
| One field or parameter with a range or set of valid values | Equivalence partitioning, then boundaries |
| A number, length, date, count or amount with a limit | Boundary value analysis |
| Several yes/no or enum conditions decide one outcome (discounts, permissions, eligibility) | Decision table |
| An object that moves through statuses (order, ticket, account, subscription) | State transitions |
| Many independent options that could interact (filters, settings, role x payment x delivery) | Pairwise selection |
| You have run out of rules and want to find what the spec forgot | Error guessing + the input case list |

## Equivalence partitioning
- Split the input into groups the product should treat identically: valid values, each kind of invalid value, empty,
  and "wrong type". Test one representative per group, then spend the saved effort on the edges.
- Always include the invalid partitions. A field with valid range 1 to 100 has at least three partitions: below,
  inside, above. Add: not a number, empty, decimal, and a very large value.
- Partition by behaviour, not only by value: if the rule changes at some point (a tier, a threshold, a status), that
  point separates two partitions.
- If a partition is tiny (a handful of values), try every value. If you suspect hidden sub-partitions (special
  handling for one value), add a second representative to that partition.
- Defect looks like: two values from the same partition behave differently, or an invalid partition is accepted.

## Boundary value analysis
- Boundaries are where behaviour changes, not just where numbers are round. For every ordered input, test the last
  value that should pass and the first that should fail, on each side, one smallest step apart (1 for integers,
  0.01 for money, one second or one day for time, one character for text).
- Test the boundaries of invalid partitions as well, and boundaries of outputs and internal limits (maximum rows
  returned, maximum file name length, maximum total of a cart).
- Check that both UI and API agree on where the boundary is, and that the message names the real limit.

| Input kind | Values to try |
|------------|---------------|
| Integer range [min, max] | min-1, min, min+1, a typical value, max-1, max, max+1 |
| Quantity / count | 0, 1, 2, documented max, max+1, -1, 1.5, "abc", empty |
| Text length [min, max] | 0, 1, min-1, min, max, max+1, and one far above (a few thousand characters) |
| Money | 0, 0.01, 0.99, 1.00, just below/at/above each threshold, 999999.99, max+0.01, -0.01, 3+ decimals |
| Dates | today, yesterday, tomorrow, first and last day of month, 29 Feb in leap and non-leap years, year end, a DST change day, far past (1900), far future (2100), invalid (31 Apr, month 13) |
| Date ranges | from = to, from > to, from only, to only, range spanning month or year end |
| Times | 00:00, 23:59, 24:00, midnight crossing, the exact moment a window opens or closes |
| Lists / arrays | empty, one item, two items, documented max, max+1, duplicates, a null element |
| Pages | page 0, 1, last, last+1; page size 0, 1, max, max+1 |
| Percentages | -1, 0, 0.01, 99.99, 100, 100.01 |

## Turning a plain-language rule into test cases
Method: (1) quote the rule, (2) list every input, threshold and outcome in it, (3) mark each ambiguous word, (4) write
expected results with concrete numbers computed by you, (5) put boundaries on both sides of every threshold.
Ambiguous words to resolve first: "over" vs "at least", "up to", "between" (inclusive?), "per day" (whose midnight?),
"before tax" vs "after", "per item" vs "per order". If the spec cannot settle one, test the likely reading, state your
assumption in the report, and do not invent a defect from a guess.

Worked example. Rule: "Orders over 1,000.00 get 5% off; the discount is applied before 15% tax; max 100 of one item."

| Case | Input | Expected |
|------|-------|----------|
| Just below | subtotal 999.99 | no discount; tax 150.00 (149.9985 rounded); total 1149.99 |
| Exactly at | subtotal 1000.00 | no discount ("over" means more than); total 1150.00 |
| Just above | subtotal 1000.01 | discount 50.00 (50.0005 rounded); discounted 950.01; tax 142.50; total 1092.51 |
| Quantity edges | quantity 100 / 101 / 0 / -1 / 1.5 | accepted / refused / refused / refused / refused |
| Order of operations | subtotal 2000.00 | 1900.00 discounted, tax 285.00, total 2185.00 (not 2000 + 300 - 100 = 2200.00) |

Compute every expected value yourself with exact decimal or integer-cents arithmetic, never by copying what the product
shows. Run each case through the UI and the API and compare both with your number.

## Decision tables
- List the conditions (inputs) and the actions (outputs), then one column per combination. For n yes/no conditions
  there are 2^n combinations. Check the expanded count against the rule count so no combination is missing.
- Collapse columns that differ only in a condition that cannot matter (marked "-"). When you collapse, still vary that
  condition in at least one test to prove it really does not matter.
- Look for gaps (a combination with no defined outcome) and contradictions (two rules that can both match with
  different outcomes). Both are findings in the spec; ask or note them, then test what the product actually does.

| | R1 | R2 | R3 |
|-|----|----|----|
| Member | yes | no | no |
| Subtotal >= 50.00 | - | yes | no |
| Coupon entered | - | - | - |
| Shipping | free | free | flat fee |

Tests: R1 with subtotal 49.99 and 50.00; R2 at 50.00; R3 at 49.99; and each rule with and without a coupon, to prove the
coupon column really is "-".

## State transitions
- List the states, the events that move between them, and the allowed transitions. Draw it as a table: rows = current
  state, columns = event, cell = next state or "refused".
- Cover every allowed transition once. Then try every refused cell: it must be blocked in the UI **and** in the API
  (a hidden button does not protect an endpoint), with a clear 4xx and no state change.
- Cover the awkward sequences: the same event twice in a row (cancel twice, pay twice), two conflicting events at the
  same moment (use parallel repeats for pay and cancel), an event from a stale page after the state changed, skipping
  a step by calling a later endpoint or URL directly, and acting on a terminal state (edit a delivered or cancelled
  object).
- After each transition, verify side effects: history/audit entry, totals unchanged, stock or balance adjusted exactly
  once, notifications sent once, the other UI and the API show the new state after reload.
- Illegal transitions to try for a typical order: pending -> delivered, shipped -> pending, cancelled -> paid, paid ->
  paid, delivered -> cancelled, any state -> a status name that does not exist.

## Pairwise (combinatorial) selection
Use it when three or more independent parameters have several values each and exhaustive testing is too large. Research
on real failures shows most are triggered by one or two parameters, so covering every pair of values catches most
interaction bugs with a fraction of the cases. It does not replace boundaries or business rules; rarely, three-way
interactions still hide bugs.

How: (1) list parameters and their values (use partitions, not every value); (2) write rows so that every pair of values
from two different parameters appears together in at least one row; (3) remove or fix impossible combinations and add
back any combination you know is risky; (4) run the rows, varying only what the row says.

Example: role (admin, staff, client) x payment (card, invoice) x delivery (standard, express, pickup). Exhaustive = 18.
Pairwise = 9 rows (the two three-value parameters already need 3 x 3 = 9 pairs):

| # | Role | Payment | Delivery |
|---|------|---------|----------|
| 1 | admin | card | standard |
| 2 | admin | invoice | express |
| 3 | admin | card | pickup |
| 4 | staff | invoice | standard |
| 5 | staff | card | express |
| 6 | staff | invoice | pickup |
| 7 | client | card | standard |
| 8 | client | invoice | express |
| 9 | client | card | pickup |

Check: every role has both payments, every payment appears with all deliveries, every role meets every delivery. For
more parameters, generate the rows with a small script or a pairwise generator rather than by hand.

## Error guessing: high-yield guesses
Use experience of common mistakes. Try these early, they find bugs often:
- First and last item, empty collection, exactly one item, exactly a full page.
- Zero, negative, and fractional quantities; very large numbers; numbers typed with a comma or spaces.
- Same action twice (double click, Enter plus click, retry after a timeout) and two tabs doing it at once.
- Back, Forward and Refresh in the middle of a flow, and after a successful submit.
- Stale data: edit a record that someone else changed or deleted, use an old link or an old page.
  Also read, change from another role, then re-read (the warm, change, re-read sequence in `api-testing.md`).
- Skipping steps: open step 3 by URL, call the final endpoint without the earlier ones.
- Work for the creator but not for another role; works on create but fails on edit; works with all fields but not with
  an optional field left blank; an update that omits a field and wipes it.
- Text longer than the database column (UI allows 255, storage allows fewer: expect a 500 or silent truncation).
- Names with an apostrophe, a hyphen, a leading or trailing space, non-Latin script, or just "Null" / "None" / "Test".
- Email with a plus sign, uppercase letters, trailing space, long local part.
- Dates at midnight, month end, 29 Feb, DST change, and between time zones (a date shown one day off).
- Case differences in values that should be unique (QA-User vs qa-user), and trailing spaces.
- Sorting or filtering on empty values, grouping with a single member, division with a zero count (averages, percentages).
- Delete something that is still referenced elsewhere; restore or undo; cancel half-way and re-enter.
- Sign out in another tab, then act; session expiry mid-form.

## Reusable input case list
Run these through each text field and each string parameter that matters (do not repeat the full list on every field;
choose by risk). Send everything as plain data. If a response shows a database error, a stack trace or evaluated code,
stop probing that field, record minimal evidence, and report it.

| Case | Examples |
|------|----------|
| Empty / missing | "", field omitted, null, whitespace only "   ", a tab or newline only |
| Surrounding whitespace | " QA-x", "QA-x ", internal double spaces |
| Long | 255, 256, 1,000 and a few thousand characters (never huge) |
| Special characters | `< > & " ' \ / % _ * ? # + ; : ,` and `{} [] ()` |
| Markup-looking text | `<b>QA-bold</b>` (must show as literal text everywhere) |
| Injection-looking text | `' OR '1'='1`, `{{7*7}}`, `${7*7}`, `../QA-x`: treated as plain text, stored and shown unchanged |
| Unicode | accents (cafe with an acute e), combined characters, emoji (counts as 2 UTF-16 units), zero-width space |
| Right-to-left | Arabic and Urdu words, and RTL mixed with digits and Latin |
| Numbers as text | "007", "-1", "0", "1.5", "1,5", "1e3", "NaN", "Infinity", "0x10" |
| Huge numbers | 2147483647, 2147483648, 9007199254740993, 99999999999999999999 |
| Duplicates | the same value twice; same value differing only by case or trailing space |
| Wrong type (API) | number as string, string as number, array instead of scalar, object instead of string, true/false |

## Oracles: how to decide the expected result
Without an oracle you only find crashes. Use these in order, and say which one you relied on:
1. **Written specification, API schema or config rules.** Strongest; quote it.
2. **Business rules with numbers** you compute independently of the product.
3. **Consistency:** the same fact must match everywhere (list, detail, summary, API, export, email, other role's view).
4. **Own claims:** labels, help text, error messages and docs inside the product ("max 5 MB") must be true.
5. **Previous behaviour or a sibling feature:** the same control elsewhere in the product behaves differently, or
   it worked last run (memory notes).
6. **Standards and conventions:** HTTP status semantics, accessibility criteria, email and date standards, how
   comparable products behave.
7. **Partial/invariant checks:** a narrower search returns no more rows than a broader one; sorting then reversing
   reverses the order; the sum of line items equals the subtotal; creating then deleting restores the count.
8. **Common sense of a user.** Weakest; use it to raise a question, not to assert a defect.

When the oracle is weak, report the observation with the doubt stated in `actual`, choose severity by user impact, and
never present a guess as a rule.

## Severity hints
- **critical:** an invalid value accepted that corrupts data or money; a state change that should be refused succeeds;
  a boundary error that wrongly charges, grants or exposes.
- **important:** the boundary is off by one, the UI and API disagree about a limit, valid input is wrongly refused,
  a message names the wrong limit.
- **minor:** wording of a limit message, inconsistent trimming that has no further effect.

## Safe on staging
- Keep every created value prefixed `QA-`; keep inputs bounded (no megabyte strings, no loops of thousands of calls).
- Injection-looking strings are test data only: use them to confirm literal handling, never to exploit.
- Use own accounts and own records for state and boundary probes; do not change data you did not create.

## See also
`forms.md`, `search-filter-pagination.md`, `payments-and-money.md`, `file-uploads.md`, `notifications-email.md`.
