# Payments and money (test mode only)

Load this for carts, checkout, invoices, prices, taxes, discounts, coupons, refunds, subscriptions and any screen or
report that shows an amount. Money bugs are the most expensive ones, so test arithmetic independently of the product.

## Hard rules for this topic
1. **Test mode only.** Never use a real card, bank account or wallet. Never use, request, guess or store a production
   payment key. Use only the test credentials the payment provider publishes in its own documentation (test card numbers
   with a future expiry and any security code, or the provider's test payment tokens).
2. **Confirm test mode before paying anything.** Look for the provider's visible test-mode indicator in the checkout, check
   the product's docs or config, and ask the user if it is unclear. If you cannot confirm it, do not submit a payment: list
   the flow under Not tested ("payment mode could not be confirmed as test").
3. **No sandbox, no payment.** If the product has no test mode, list payment, refund and payout flows under Not tested
   ("would cause a real-world payment") and test only what is safe: cart arithmetic, coupon rules, price display.
4. **Never put raw card data into API probes or notes.** Pay through the product's own checkout using documented test
   values, and keep the test values out of reports beyond naming the scenario ("declined card").
5. If a live-looking secret key or a real card number shows up in page source, API responses, logs or errors, do not copy it.
   Record the location and the type only (for example "a secret key with a live prefix in the checkout config response"),
   stop probing that area and report it as critical.

## Checks

### 1. Representation of money
- Amounts should be stored and sent as integers in the smallest unit (cents) or as exact decimal strings, not as binary
  floating point. Probe with values that expose floats: line items 0.10 and 0.20 (total must be 0.30 exactly), 3 x 19.99
  (59.97), 1.005, 4.35 x 100, 0.07 x 100.
- Check the API shape: price as 19.99 (number) versus 1999 (integer) versus "19.99" (string). Compare with the spec, and check
  every screen interprets it the same way (a missed divide by 100 is a classic).
- Currencies have different numbers of decimals (none, two or three). Test each currency the product supports; amounts must
  not gain or lose a decimal place when converted, displayed or sent to the provider.
- Very large totals and quantities stay exact; no scientific notation or overflow.

### 2. Order of operations and rounding
- Find the stated rule (discount before tax? tax on shipping? tax inclusive or exclusive in prices?). Write it as a formula
  and compute the expected totals with exact arithmetic. If the rule is unwritten, derive it from the UI and flag it as an
  assumption.
- Rounding: is it half-up, half-even or truncate, and is it applied per line or on the order total? These differ. Example:
  three lines of 1.10 at 7.5% tax gives 0.08 per line (0.24 total) but 0.25 on the 3.30 subtotal. Check the product does
  the same on the cart, the order, the invoice and the API.
- Percent discounts on odd amounts (a 10% discount on 0.05), fixed discounts larger than the subtotal (total must not go
  negative or below the allowed minimum), and discounts that make the total exactly 0.
- Shipping: thresholds measured before or after discount, free-shipping boundary (49.99, 50.00, 50.01), shipping tax.
- Sum check: line totals add up to the subtotal; subtotal minus discount plus tax plus shipping equals the total, to the cent.

### 3. Server authority
- With the API runner, send an order or payment request with altered numbers on a QA- order: changed unit price, line total,
  order total, discount, currency, or a quantity of 0 or a negative one. The server must recompute from its own data and
  refuse or ignore client-supplied amounts. Accepting a client price is critical.
- Change the order id or amount between the "create" and "pay" steps; the charged amount must equal the stored order total.

### 4. Display and formatting
- Currency symbol or code is present and correct; separators fit the locale; the same amount looks the same in the list,
  detail, email, invoice and export. Negative amounts and zero are formatted sensibly ("0.00", "Free" only where intended).
- Amount fields accept typed formats ("1,000.50", "1000,50") predictably, never silently reading 1,000.50 as 1.
- RTL pages: the digits, symbol and sign stay in a readable order; the amount does not flip or split.
- Truncated or clipped amounts in narrow columns and at mobile width (390px) are a defect.

### 5. Zero, negative and tiny amounts
- Quantity 0 and -1, price 0, free items, a 100% coupon, a total of 0.00: the flow either skips payment properly or states
  why, and an order is not left in a limbo status.
- Negative price, negative refund, or negative total sent through the API must be refused.
- Amounts below the provider's minimum charge, above a maximum, with 3 or more decimals ("10.999"), as strings, NaN: refused
  with a clear message, no 500.

### 6. Idempotency and double pay
- Create the same order or payment twice, quickly (the API runner's `repeat` with `parallel`), with and without an
  idempotency key if the API supports one. With a key: one record, one charge, the second call returns the first result.
  Same key with different content: refused. Without any protection: two orders or charges is a finding.
- Click Pay twice, press Enter and click, and submit from two tabs. Exactly one payment and one order must result; stock moves
  once.
- Pay an already paid, cancelled or expired order: refused with a clear state message and no new charge.
- Use of the payment page after pressing Back, and retrying after a timeout, must not create a second charge.
- Idempotency keys may expire after some time (often a day), so a retry long afterwards is a new request; the product's
  own order-level checks must still prevent duplicates.

### 7. Return flows and webhooks
- Success and cancel redirects: open the success URL directly without paying, or with edited query parameters. The order
  must not become paid, and the page must not claim success. Paid status must come from a server-side confirmation, never from
  the return URL alone.
- Cancel, close the payment page, or press Back from the provider page: the cart and order stay intact and unpaid; the
  user can try again.
- Return in a different browser or after the session expired: the status is still correct.
- Refresh the success page: no second fulfilment, email or stock change.
- Webhooks (when the provider's test mode can send them): the same event delivered twice is processed once; events may
  arrive out of order; a slow handler must still answer quickly; while confirmation is pending the UI shows a
  "processing" state, not a final one.
- Once, with an order your run created, send an unsigned, obviously fake payment event to the webhook endpoint. It must be
  refused (4xx). A 2xx or a status change to paid is critical. Do not repeat or vary it beyond one or two tries.

### 8. Price changes between cart and checkout
- With a `QA-` product, put it in the cart, change its price (or stock, tax rate or coupon validity) as an admin, then
  continue: the product must follow a stated rule. Either the old price is honoured, or the new price is shown clearly
  before payment. Silently charging an amount different from the displayed one is critical.
- A cart left open for days, an item that went out of stock or was archived, and a currency or region change mid-way.
- A coupon that expires between cart and payment is re-checked at payment time.

### 9. Totals consistent across screens
- For one order compare subtotal, discount, tax, shipping and total across: cart, checkout, confirmation page, confirmation
  email, invoice or PDF, order list, order detail, admin screens, the API, reports and exports, and the payment provider's
  test dashboard amount. Any difference, even one cent, is a finding.
- Report totals (day, month, customer) equal the sum of the orders that make them up; refunded and cancelled orders are
  treated as the rule says.
- A change in one place (status, refund, price correction) shows in the others after reload.

### 10. Coupons and discounts
- Validity window: start and end instants (inclusive?), time zone of expiry, a code used one second before and after.
- Usage limits: allowed uses succeed, the next is refused; the last remaining use grabbed by two concurrent requests is
  granted once. Per-customer limits.
- Minimum spend: exactly at, just below and above; after removing an item the coupon is re-validated.
- Code handling: case, surrounding spaces, unknown and expired codes give distinct, clear messages; the same code applied
  twice.
- Stacking: two coupons, coupon plus sale price, coupon plus free shipping, percent plus fixed. The order of application
  changes the total; compare with the stated rule. Percent over 100 and fixed above subtotal are refused or capped.
- Excluded products or categories are not discounted; the discount splits sensibly across lines.
- A refund returns what was paid, not the pre-discount price.

### 11. Threshold boundaries
- For every threshold (free shipping, bulk tier, tax bracket, minimum or maximum order, credit limit) test just below, exactly
  at and just above, using exact amounts (49.99, 50.00, 50.01), and check whether the threshold applies before or after the
  discount.

### 12. Refunds and corrections
- Full refund, partial refund, several partial refunds that add up to exactly the total, a refund larger than what was paid
  (refused), a second refund click (refused or exactly one), refund of an unpaid or cancelled order (refused).
- Rounding leftovers: refunding line by line must never produce more or less than the order total.
- Tax and shipping portions of a refund are handled by the stated rule; the order, ledger and reports show the refund.
- The status follows the provider's real state (a refund may be pending first); the customer notification fires once.
- Only roles that may refund can do it (check by API as a lower role).

### 13. Failed and declined payments
- Using the provider's documented test cases, cover: a decline, insufficient funds, expired card, wrong security code, an
  authentication-required flow, and a processing error. Each must show a message a person can act on, leave the order unpaid
  and retryable, create no duplicate order, and leak no raw provider error text.
- A failed attempt followed by a successful one yields exactly one paid order. Card state in the provider can carry over between
  tests, so use a different documented test value for each independent scenario.
- Raw card details must never appear in the product's own logs, API responses, URLs or browser console.

### 14. Subscriptions and recurring charges
- Trial end, renewal, upgrade or downgrade with proration, cancel, resume and failed renewal. If the provider documents a
  way to move time forward in test mode, use it; otherwise list renewals under Not tested ("cannot advance time safely").

## Verify arithmetic independently
1. Write the rule as a formula in your charter, with the rounding mode and the order of operations.
2. Convert every amount to integer cents. Apply percentages with integer arithmetic and the stated rounding step by step.
3. Use a decimal or integer calculation (a short script with exact decimals), never a spreadsheet cell or float in a
   one-liner, to produce the expected values.
4. Record inputs, formula, expected and actual in one table in the evidence note.
5. Re-run at least one case through the API and the UI separately.

## Severity hints
- **critical:** a wrong amount is charged, stored, refunded or emailed as final; double charge; "paid" without payment;
  refund above paid; client-supplied price accepted; coupon rules bypassed; secrets or card data exposed.
- **important:** inconsistency shown on screen but not charged (a display-only mismatch); confusing decline messages; a stuck
  "processing" state; missing refund on a report; rounding that breaks the product's own stated rule by one cent in display only.
- **minor:** symbol position, separator style, wording of payment messages.

## Safe on staging
- Test mode confirmed, documented test credentials only, `QA-` orders and products only. Never refund or modify orders you did not create.
- Do not load-test the provider's sandbox (stricter rate limits will block you); a handful of requests per check is enough.
- Keep emails from payments in a catcher (see `notifications-email.md`); if none exists, list receipts as Not tested.
- Keep keys and secrets out of everything you write. Evidence must show amounts and statuses, not credentials.

## Common bug patterns
- Floating-point math, or integer cents divided by 100 in one layer and not another.
- Rounding per line in the cart and per order on the server, or the reverse.
- Discount applied before tax in the UI but after tax in the invoice or email.
- Totals computed in the browser and trusted by the server.
- Paid status set from the redirect URL; webhook handler not idempotent; no unique constraint on the provider reference.
- Stock and payment updated non-atomically, so a failure double-spends or oversells.
- Coupon counters incremented without locking; time zone mix-up at expiry.
- Cached price shown on the cart after the catalogue price changed.
- Assuming two decimal places for every currency.

## See also
`test-design.md`, `forms.md`, `notifications-email.md`, `search-filter-pagination.md`.
