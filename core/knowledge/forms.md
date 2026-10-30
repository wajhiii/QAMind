# Testing forms end to end

Load this when a page has a form (sign-up, checkout, settings, create/edit dialogs, filters that submit, wizards).
Pair it with `test-design.md` for which values to type. The server is the real gatekeeper: every UI rule must also be
enforced by the API.

## Checks

### 1. Inventory the form first
- Use the browser snapshot to list every field: label, type, required or optional, limits shown, default value,
  hidden or disabled fields, and the submit and cancel controls. Note which rules the page states ("max 50 characters").
- Find the endpoint the form calls (browser network requests) so you can replay it with the API runner.
- Run the page audit on the form page. Unnamed controls (a placeholder is not a label), controls pushed off-screen and
  covered controls are leads to confirm by looking.

### 2. Required and optional
- Submit the empty form: every required field must be flagged, in one pass, not one error per attempt.
- Fill only required fields: the submit must succeed and the optional ones must stay empty, not become "null" or "undefined".
- Fill only optional fields: still blocked, with the missing ones named.
- Required marker: is it visible and explained? A field that is required by the server but not marked is a defect.
- Whitespace-only text in a required field must count as empty.

### 3. Client versus server validation parity
- For each rule the UI enforces, send the same invalid value straight to the endpoint with the API runner (skipping the
  browser): too long, wrong type, out of range, a select value not in the list, a missing required field, an extra
  unexpected field. The server must refuse with 400 or 422 and a field-level message. A 200/201 means the rule is
  decoration only (important to critical, depending on what data it protects).
- The reverse: something the UI accepts but the server refuses (a 500 or a vague "something went wrong"), or limits that
  differ (UI allows 100 characters, server 50).
- Read-only, disabled and hidden fields: send a changed value for them. The server must ignore or refuse it (a user must
  not be able to set role, price, owner id or status by adding fields).
- Validation must also hold on edit forms, bulk imports and any second endpoint that writes the same data.

### 4. Error messages: wording and placement
- Each message names the field, says what is wrong and how to fix it ("Enter a date in the format DD/MM/YYYY"), and is
  in the page language. "Invalid input" or an error code alone is a defect.
- The message sits next to its field, is not colour-only, and the field is marked invalid in the accessibility tree.
  After a failed submit focus should go to the first error or to a summary that links to the fields.
- A message disappears once the field is fixed and does not reappear for a stale reason.
- Browser-native bubbles follow the browser's language, which may not match the page; check that the page language
  and the message language agree.
- No technical detail (SQL, stack traces, file paths, internal field names, raw JSON). Do not scold ("you made an error").
- Errors for several fields appear together; a general error banner is not the only signal when one field is at fault.

### 5. Input preserved after errors
- After a server-side rejection, every field keeps what the user typed, except password fields. Losing typed text
  after an error is important; losing a long text area is more so.
- After client-side failure, Back, a language switch or a session-expired redirect: check what is kept. File inputs cannot
  be restored; the page should say so.
- Select, radio and checkbox states must also survive.

### 6. Double submit, Back and Refresh
- Click submit twice quickly, press Enter then click, and submit on a slow connection. Count how many records are
  created (list view and API). More than one is a defect (important; critical if money or stock is involved).
  Use `repeat` with `parallel` in the API runner for the same check on the endpoint.
- The submit control should show progress and be disabled while the request runs, and return to usable if the request
  fails.
- After a successful create: press Refresh and Back. The page must not re-submit silently, and must not show a stale
  empty form that creates a duplicate on resubmit. Prefer redirect-after-submit behaviour.
- Back to a form after sign-out must not show another user's data.

### 7. Autofill, paste and keyboard
- Autofill: name, email, phone and address fields should carry sensible autocomplete hints; autofill must not leave
  a field in a state that looks filled but fails validation; password fields offer the right new/current behaviour.
- Paste: values with leading or trailing spaces or line breaks, formatted phone numbers ("+1 (555) 010-0100"), amounts
  with thousands separators, text copied from a document with smart quotes. Check they are trimmed or accepted sensibly.
  A field that blocks paste (confirm email, password) is a usability and accessibility defect.
- Keyboard only: Tab order follows the visual order, every control reachable, visible focus indicator, Enter submits
  from text fields, Space toggles checkboxes, arrow keys move within radio groups, Escape closes dialogs, no
  keyboard trap, label click focuses or toggles its control.

### 8. Disabled and loading states
- A submit button disabled until the form is valid must tell the user why (which field is missing). A silently
  disabled button blocks users.
- While loading: spinner or message, no duplicate submit, form not editable in a way that changes what is sent.
- After failure: button re-enabled, message visible, data kept. After success: clear confirmation or redirect.
- Long operation or timeout: the UI must not hang forever on an infinite spinner.

### 9. Typed inputs
- **Email:** accept plus addressing (QA-user+test@example.com), uppercase, a long but valid local part, subdomains; refuse
  a missing @, two @, spaces, a missing domain. Rejecting valid addresses is a defect. Trim surrounding spaces. Format
  checks do not prove ownership; a confirmation link does.
- **Phone:** browsers do not validate phone format, so the product must. Try letters, too short, too long, a leading plus,
  spaces, hyphens, parentheses, and local vs international form; check what is stored versus shown.
- **Number:** decimals where integers are expected, comma vs dot decimal separators, thousands separators, leading zeros,
  exponent form ("1e3"), minus sign, very large values, spinner and mouse-wheel changing the value by accident, step
  rules (3.2 refused on a whole-number step).
- **Date:** valid and invalid dates (30 Feb), past or future rules, min and max, text typing versus picker, ambiguous
  formats (03/04), leap day, and a date stored then shown one day off because of time zones.
- **Text and text area:** line breaks preserved, length counter matches the enforced limit (an emoji counts as more than one
  unit in some counters), surrounding whitespace policy is consistent, case is preserved.
- **Password:** minimum and maximum length, spaces, non-Latin characters, paste allowed, show/hide control accessible;
  the value never echoed back or logged.
- **URL:** with and without scheme, with spaces, with non-ASCII characters; scheme such as `javascript:` is not accepted as a link.

### 10. Select, radio and checkbox groups
- Default selection is sensible; a required radio group cannot submit with nothing selected.
- A select whose first option is a placeholder: submitting it must be refused when the field is required.
- Unchecking a checkbox must be saved: confirm the API receives "false" or the product reads the missing value as
  false. A box that cannot be turned off again is a common defect.
- Terms and consent checkboxes are enforced by the server, not only by the button state.
- Options with long text, translated text and RTL text display fully; the value submitted matches the option shown.
- Multi-selects: none, one, all; the order of selection does not change the result.

### 11. Dependent fields and conditional sections
- Change the parent value and check the child list refreshes and the old child value is cleared (country to state).
- Hidden conditional fields must not block submission with an invisible error, and their stale values must not be
  sent or saved.
- Edit mode populates parent and child in the right order; saving without changes does not alter data.

### 12. Multi-step forms
- Progress indicator is accurate; Back inside the wizard keeps values; Refresh mid-way either restores state or says
  clearly that progress is lost.
- Open a later step by URL: the server must refuse or redirect to the first incomplete step.
- Final submit revalidates every step on the server; the review page shows exactly what will be saved, and "edit" from the
  review returns to the right place.

### 13. Files in forms
Test attachments with `file-uploads.md` (types, size boundary, name handling, storage and access).

### 14. Session expiry mid-form
- Clear the browser's own cookies and storage with `evaluate` (or wait for expiry if the session is short), then submit.
  Expected: a clear "your session expired" path to sign in, and ideally the typed data kept. Defects: a 500, a raw JSON
  error, a blank page, a silent no-op, a successful save under another identity, or a lost long text.
- A form left open for a long time and then submitted (expired anti-forgery token) must produce a readable message, not a
  generic error page.
- After signing in again the user returns to the form or the intended page.

### 15. Markup-looking input shown back as plain text
- Enter `<b>QA-bold</b>` and `"><u>QA-x</u>` in text fields and names. Find every place the value comes back: the list,
  detail page, edit field, page title, toast messages, confirmation dialogs, emails, PDFs, exports, and error messages. It
  must appear literally everywhere. If bold or underline appears, or the layout breaks, output is not escaped: report with a
  screenshot. Use only harmless markup; do not craft scripts or anything that calls other hosts.
- In a CSV or spreadsheet export, a value starting with `=`, `+`, `-` or `@` should be neutralised; try `=1+1` as a
  QA- value and check the exported cell is not evaluated.

## Severity hints
- **critical:** server accepts what the UI forbids and data or money is affected; hidden fields change privileged data;
  double submit creates duplicate paid orders; markup executes; session expiry saves under a wrong account.
- **important:** valid input refused; typed data lost after an error; duplicate records from double submit (non-money);
  unhelpful or technical error messages; silently disabled submit; keyboard users cannot complete the form.
- **minor:** wording, message placement, inconsistent trimming without data impact, tab order oddities that do not block.

## Safe on staging
- Submit only QA- prefixed values; use reserved domains (example.com, .test) for emails.
- Use own records for edit and double-submit tests; remove what you create when the product allows.
- Forms that send email, SMS or take payment follow `notifications-email.md` and `payments-and-money.md`; if those
  cannot be made safe, do not submit them.
- Keep injection-looking strings harmless; one or two attempts per field are enough.
- Never paste real personal data into fields.

## Common bug patterns
- Validation lives only in front-end code, so the server accepts anything.
- The server trusts whatever fields arrive (mass assignment), including role, price and owner.
- The request handler trims or lowercases in one place but not another, so uniqueness checks differ.
- The UI limit is larger than the database column, producing a 500 or silent truncation.
- A disabled control is not submitted, so a "save" leaves the old value or wipes it.
- No in-flight guard on the submit handler and no server idempotency protection.
- Unchecked checkboxes are absent from the payload and the API reads absent as "unchanged".
- Dates handled as local midnight on one side and UTC on the other.
- Error pages from a proxy (HTML) shown where JSON was expected after a timeout.

## See also
`test-design.md`, `file-uploads.md`, `payments-and-money.md`, `notifications-email.md`, `search-filter-pagination.md`.
