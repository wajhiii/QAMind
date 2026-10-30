# Search, filters, sorting and pagination

Load this when a page or endpoint returns a list: tables, search boxes, filter bars, sort headers, page controls,
infinite scroll, or list endpoints with query parameters. The core question is always: do I see exactly the right rows,
once each, in a sensible order, with a true count?

## Checks

### 1. Establish a baseline
- Call the list endpoint with the API runner and keep the response (`keep_evidence`): item shape, total or count
  fields, paging fields, default sort, default page size. Compare with what the UI shows after a reload.
- Make sure you know the true data: create a few `QA-` records with known, distinct values (names, dates, amounts,
  statuses, two with identical sort values) so results are predictable. Search and filter for those.
- Record the documented limits (default and maximum page size, parameter names) from the API spec or config.

### 2. Empty and error states
- A query with no matches returns 200 with an empty list (not 404 or 500), and the UI shows an empty-state message that
  says nothing matched and offers a way to clear the filters. An empty table with no message, or an error banner, is a defect.
- Distinguish three states: loading, empty and failed. A failed request must not look like "no results".
- A list with no data at all (fresh account) shows a helpful empty state, not a broken layout.

### 3. Search text
- Try: empty, only spaces, surrounding spaces, a very long string (a few hundred characters), one character, a single
  word and several words.
- Special characters one at a time and combined: `% _ \ * ? . + ( ) [ ] { } ^ $ | " ' & # / < >`, an unmatched
  quote or bracket. Each must be treated as literal text (or a documented operator) and never cause a 5xx or a raw error.
- Wildcard leaks: searching for `%` or `_` must not match everything; `.*` must not behave like a pattern.
- URL handling: `+`, `&`, `#`, `%20` and non-ASCII characters in the query string survive the round trip between the
  box, the URL and the request.
- Case and accents: "CAFE", "cafe", and "café"; precomposed vs decomposed accents; Arabic and Urdu text; emoji.
  Decide from the product's own behaviour and claims whether these should match, then check that search and filter
  agree with each other.
- Match scope: whole word or substring, multi-word as AND or OR, matching on reference numbers and IDs, and which
  fields are searched. Search must never match fields the user cannot see (internal notes, other users' data), and the
  results and counts must stay inside the caller's permissions.
- Typing quickly: results must belong to the final text (an older slow response must not overwrite a newer one). Clearing
  the box restores the full list; searching returns to page 1.

### 4. Filters
- Apply each filter alone and check every row shown matches, and a row you know should match is present.
- Combine filters: the normal expectation is AND across different filters and OR within a multi-select. Contradictory
  combinations produce an empty result, not an error. Verify with your known QA- records.
- Ranges: from > to, only from, only to, equal ends, negative values, an inclusive end date (does "to" a given day include
  rows created that day, including late evening?), and time zone effects near midnight.
- Unknown or malformed filter values by URL or API (a status that does not exist, text in a numeric filter): expect a 400
  or a consistent ignore, never a 500 and never "returns everything" without notice. A silently ignored misspelled
  parameter that returns all rows is a trap for API users.
- "All" vs empty value, filter on empty or null values, and filters for values that were deleted or renamed.
- Counts shown beside options (facets, tab badges) must match what applying the option returns.
- Clear/reset removes every filter, including ones in the URL, and returns to page 1.

### 5. Filter and state persistence
- Change a filter, open a row, press Back: filters, sort and page are kept (or the product clearly resets them).
- Refresh the page: same state restored from the URL. Copy the URL into a fresh tab: same result (if it needs sign-in,
  after signing in).
- State must not leak between accounts: sign in as another role in a fresh browser profile and confirm no previous
  filter or search appears.
- A filter change must reset the page number. Landing on page 5 of a result set that has two pages is a defect.

### 6. Sorting
- Sort by each sortable column in both directions. Check it really is ascending and descending, text sort is not
  case-sensitive by accident, numbers sort numerically (10 after 2), dates chronologically, and empty values consistently
  at one end.
- Ties: sort by a column with duplicate values (you made two such rows). Rows with equal keys must come in a stable order
  and must not appear on two pages or drop out between pages.
- Sorting with a filter and a page together: the sort covers the entire result set, not just the visible page. Sorting
  inside one page of a larger set is a classic defect.
- The sort indicator matches the order; an unknown sort field via URL gives a 400 or default order, not a 500.
- A documented default sort exists and is applied even when no sort is chosen.

### 7. Page-based pagination
- Page values: 1, 2, the last page, last + 1, 0, -1, text, a decimal, and a huge number. Out-of-range pages should return an
  empty page or a 400, consistently; never a 500, and never the wrong data.
- Page size values: absent, 0, 1, the default, the maximum, maximum + 1, negative, text, a very large number. Oversized
  requests should be capped or refused according to the documented rule; the cap must be enforced by the server, not the
  UI alone.
- Arithmetic: pages = ceil(total / size). With total = exact multiple of size there is no empty extra page; with one
  extra row the last page has exactly one row. "Showing 21 to 40 of 135" must use correct bounds.
- Walk the whole set: request every page and collect the IDs. The union must equal the total, with no duplicates and no
  gaps. This single check finds off-by-one, unstable sort and wrong-count defects.
- Controls: Previous disabled on page 1, Next disabled on the last page, direct page links work, changing page size
  keeps a sensible position or resets cleanly, and the current page is announced to assistive tools.

### 8. Cursor and token pagination
- The final page has an empty or absent next token; follow tokens until then. A page with fewer rows than the page size is
  normal mid-way, so loop on the token, not on the row count.
- Garbage, truncated, tampered, expired and reused tokens must give a clear 4xx, never a 500 or data from elsewhere.
  A token created by one user must not work for another.
- Using a token with different filters, sort or page size should be refused or documented, not silently mix results.
- Tokens should not expose internals (readable IDs, SQL, internal paths).

### 9. Data changing while you page
- Create a `QA-` record while viewing page 1 and then open page 2: offset pagination may show a repeated row. Note whether
  that is accepted behaviour; cursor pagination should not repeat or skip.
- Delete a record on the current page, then move on: no gap or duplicate beyond what is documented.
- Delete the last row of the last page and reload: the UI should move to the previous page, not show an empty page.
- Edit a record so it no longer matches the filter and refresh: it disappears, counts update, selection state is sane.
- Bulk selection across pages: "select all" must say whether it means this page or all results, and a bulk action must
  affect exactly the rows it announced.

### 10. Totals versus rows
- The displayed total equals the number of rows across all pages, for each filter combination, after creates and deletes.
- The total respects permissions: it must not count rows the caller cannot see (that leaks existence).
- Header counts, tab badges, dashboard figures and exports agree with the list.
- An estimated total, if used, is labelled as approximate.

### 11. URL state and navigation
- Page, sort, search and filters are in the URL, so Back, Forward, Refresh and shared links reproduce the view.
- Each keystroke or filter click should not push dozens of history entries that trap Back.
- Hand-edited parameters (invalid, duplicate, repeated, over-long) are handled calmly with a message or defaults.
- URLs carry no sensitive data such as full names or tokens.

### 12. Infinite scroll and "load more"
- No duplicates when loading more, a clear end indicator, a keyboard-reachable control, and the footer remains reachable.
- Scroll position is restored after opening an item and going Back; the count of loaded rows matches the total.

### 13. Performance and limits
- Compare response time for the default page, the maximum size, and a deep page (try each once or twice, not in a loop).
  The API runner flags slow responses; a single page that takes many seconds is a lead.
- A list endpoint that has no pagination and returns everything is a risk as data grows; check how many items a default call
  returns.
- Watch the network requests while typing in the search box: one request per keystroke without debounce is a lead, but do
  not generate request floods on purpose.

### 14. API and UI consistency
- Run the same query (search, filters, sort, page) in the UI and with the API runner: same rows, same order, same count.
- Values displayed (dates, amounts, statuses) match the API fields after formatting.
- The UI-enforced page size and the API maximum are the same, or the difference is documented.
- Endpoint filters that exist in the API but not in the UI (and vice versa) behave the same way for the same input.

## Severity hints
- **critical:** the list or count exposes rows the user must not see (other tenant, other role); a bulk action affects
  rows other than those shown; totals used for money or stock are wrong.
- **important:** duplicated or missing rows between pages; search or filter returns wrong rows; combined filters ignored;
  sorting only the current page; filter or page lost after Back or refresh; wildcard characters match everything; a 500 on
  odd input.
- **minor:** label wording ("0 results" shown while loading), cosmetic page-control issues, missing empty-state text where
  the table is obviously empty.

## Safe on staging
- Read-only checks are safe by default. Create only `QA-` records, and only the handful you need for ties, filters and
  pagination (for instance 3 to 25), then remove them.
- Do not request page sizes or counts that stress the server; a few single requests at the documented maximum are enough.
- Records of real people shown in a list are not evidence to save: record counts and IDs only, and say so in the notes.

## Common bug patterns
- Offset paging with an `ORDER BY` that is not unique, so rows swap pages between requests.
- Count query written separately from the list query and missing a filter or the permission clause.
- Page index off by one (0-based API with 1-based UI) causing a skipped first page or a repeated last one.
- `LIKE` pattern built by concatenation without escaping `%` and `_`; search not case-folded; accent mismatch between
  index and query.
- Filtering or sorting in the browser over only the loaded page.
- Page number not reset when the filter changes.
- Cache key that omits some query parameters, so one user's filtered list is served to another.
- Race in type-ahead where an older response arrives last.
- Date-range filter comparing against midnight, losing the end day.

## See also
`test-design.md`, `forms.md`, `payments-and-money.md`.
