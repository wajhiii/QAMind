# API testing

Load this when you test an HTTP API: building a plan from an OpenAPI spec (or without one), judging status codes and
error bodies, checking methods, validation, pagination, duplicates, caching and sequences. Permission and tenant checks
live in `permissions-and-data-isolation.md`; login and session checks in `auth-and-sessions.md`.

## Checks

### 1. Use the spec as the oracle (and know what it can and cannot say)
- Treat the OpenAPI document as the stated contract. For every operation compare: method + path, required and optional
  parameters, request body schema, documented response codes, response schema, response headers, auth requirement.
  A mismatch is a defect in either the API or the spec: report it once, name both sides, and say which one you believe
  is wrong.
- Response codes are keyed by exact code, by a range (`2XX`, `4XX`) or by `default`. An exact code beats a range. A real
  response whose code matches none of these is spec drift (the runner's `contract-status` lead).
- Schema checks to run on every response body: type of each field, required fields present, enum values only from the
  list, string patterns and length limits, numeric minimum/maximum, array item shape, nullability as declared, no
  undocumented fields when the schema forbids extras (`additionalProperties: false`).
- `format` (date-time, email, uuid, uri) is only an annotation unless the validator enforces it. Check it yourself on
  responses (parse the timestamp, check the uuid shape) but report a bad value as a data-quality defect, not a crash.
- `readOnly` fields (ids, created timestamps) should appear in responses and be ignored or rejected when sent in a
  request; `writeOnly` fields (passwords) must never appear in any response.
- An operation's own `security` replaces the global one. An empty list means "public". Check both directions: a
  documented-public operation that actually needs a token is a spec bug; a documented-protected one that answers
  anonymously is a security defect (`auth-not-enforced`).
- Look at `deprecated` operations, unused parts of the spec and paths the server answers that the spec does not list.
  Undocumented but reachable operations are an inventory gap worth reporting as important.
- Use the spec's `servers` entry only to confirm the base path. Send requests only to the configured test base URL.

### 2. Status code semantics (the oracle when the spec is silent)
- 200 success with body; 201 new resource created (expect a `Location` header or the new id in the body); 202 accepted
  but not finished (expect a way to poll the outcome); 204 success with an empty body (check the body really is empty).
- 400 the request is malformed or invalid; 422 the request is well-formed but its content cannot be processed
  (business-rule or semantic failure). Both are acceptable for bad input, but one API should use one convention
  consistently. A mix on the same kind of error is minor.
- 401 no valid credentials (missing, expired, malformed token; should carry a `WWW-Authenticate` challenge for HTTP
  auth schemes). 403 identity is known but the action is not allowed. 404 not found, and also a deliberate way to hide
  existence of an object the caller must not see. A 200 or a 500 where 401/403 belongs is a defect.
- 405 the path exists but not for this method; the response should list allowed methods in an `Allow` header.
- 406 the `Accept` preferences cannot be met; 415 the request `Content-Type` is not supported.
- 409 conflicts with current state (duplicate unique value, stale version, illegal state change); 410 permanently gone.
- 412 a conditional header (`If-Match`) failed; 428 the server insists on a conditional request.
- 413 body too large; 429 rate limited (look for `Retry-After`); 503 temporarily unavailable.
- Any 500, 502, 504 caused by client input is a defect: bad input must produce a 4xx. A 500 on a happy path is critical
  if it blocks the feature.
- Redirect codes: 301/308 are permanent, 302/307 temporary; 307 and 308 keep the method, so a `POST` redirected with 307
  is sent again as `POST`. A state-changing endpoint that redirects is usually a base-URL or HTTPS misconfiguration.

### 3. Methods and idempotency
- Safe methods (`GET`, `HEAD`, `OPTIONS`) must not change data. After calling a `GET` list or detail twice, compare
  state: counters, "last seen", audit entries and stock must not move because of a read.
- `PUT` and `DELETE` are idempotent: the same request sent twice leaves the same state. Repeat a `PUT` with identical
  body and confirm the resource is unchanged and no duplicate appears. Repeat a `DELETE`: the first call succeeds
  (200, 202 or 204); the second is typically 404 (or 204); either is fine unless the spec says otherwise. A 500, or a
  second record being touched, is a defect.
- `PUT` on a resource that does not exist should create it (201) or be refused (404/405) as documented; it must not
  silently succeed with 200 and create nothing.
- `POST` (create) is not idempotent. Send the same create twice, sequentially and with the runner's parallel `repeat`.
  Two identical records, two charges or two sent notifications from one user intent is a duplicate-submission defect
  unless the spec says duplicates are legal. Use only `QA-` prefixed data.
- If the spec or docs mention an `Idempotency-Key` header (an IETF draft, not a final standard): same key and same
  body should return the original result without creating a second record; same key with a different body should be
  refused (422 is the draft's suggestion); a second request arriving while the first is running should get 409;
  a missing key where the key is required should be 400. If idempotency keys are not documented, do not demand them:
  report double creation as duplicate submission instead.
- Method override headers (`X-HTTP-Method-Override` and similar) should not turn a refused method into an accepted one.
  Check them in `security-checks.md`.
- `PATCH` merges, `PUT` replaces: send a partial body to `PUT` and confirm the omitted fields are either rejected or
  documented as reset, never silently kept or corrupted.

### 4. Input validation (per field, derived from the schema)
- For each body field and parameter try: missing, `null`, empty string, whitespace only, wrong type (string for number,
  number for string, object for array), too long (just over the maximum, then 300+ characters), too short, below and
  above numeric bounds, exactly on the bounds (on-bound values must pass), negative, zero, decimals for integers,
  very large integers (above 2^53), `NaN`-like strings, values outside the enum, wrong case of an enum value, invalid
  dates (month 13, 30 February), unicode, emoji, right-to-left text.
- Invalid input must give a 4xx that names the field. Silently accepting it (201 with a corrupted value), coercing it
  (string `"abc"` stored as 0) or truncating without notice is a validation defect.
- Extra fields: send one unknown field next to valid ones. Either ignoring it or a 400 is acceptable when documented;
  persisting it, echoing it back as stored, or letting it change protected state is a mass-assignment lead (see
  `permissions-and-data-isolation.md`).
- Path ids: unknown id, malformed id (letters where a number is expected, a very long string, negative number, zero),
  id of a deleted record. Expect 404 or 400, never 500.
- Empty body, invalid JSON, JSON with a trailing comma, a JSON array where an object is expected, duplicated keys, and
  a `Content-Type` that does not match the body. Expect 400 or 415.
- Server-side validation must match the UI limits. Take the maximum from the form and send one above it directly to the
  API; a UI-only limit is an important defect.

### 5. Error responses: shape and leakage
- Errors should share one shape (a machine code or type, a human message, the offending field when relevant) across
  endpoints, and match the documented error schema. Different shapes for the same failure class is minor/important.
- The message should help the caller fix the request and reveal nothing internal. Look for: stack traces, file paths,
  class or function names, SQL text or table/column names, ORM or framework names with versions, connection strings,
  internal host names or IPs, raw upstream error bodies. Any of these is at least important; credentials or tokens in an
  error are critical.
- Provoke errors safely: malformed JSON, wrong types, an id with a quote character, a very long value, an unsupported
  method. Do not try to crash the service on purpose.
- The same failure must not return different bodies for "exists" and "does not exist" when that would reveal data
  (accounts, other tenants' ids). See `auth-and-sessions.md`.
- 404 and 405 pages from the framework should also be consistent (JSON for an API, no default HTML error page with a
  version banner).

### 6. Pagination, filtering and sorting contracts
- Check the documented params (`page`, `limit`, `offset`, `cursor`, `sort`, filters). Defaults: call with no params and
  confirm a bounded page size; the response should say how to get more (next cursor/link, total, has-more flag).
- Boundaries: `limit=0`, `limit=1`, the maximum, maximum + 1, `-1`, a huge value (expect a clamp or 400, not a giant
  response or a 500), `page=0`, a page past the end (empty list, not an error), non-numeric values.
- Walk all pages of a small `QA-` filtered set: no item twice, none missing, the count matches `total`, and the order is
  stable between calls. Items created or deleted between page reads must not crash a cursor.
- Sorting: both directions, unknown sort field (400 or ignored, documented), sort on a nullable field, ties (a stable
  secondary key prevents duplicates across pages), case and accents.
- Filtering: each filter alone and combined; an empty result is 200 with an empty list; unknown filter names are
  rejected or ignored as documented; special characters and very long values do not cause 500; a filter must never
  widen results beyond the caller's own data.
- Totals and counts must agree between the list, the detail and any summary endpoint.

### 7. Concurrency and duplicate submissions
- Use the runner's `repeat` with `parallel: true` (count 2 or 3, no more) on create, "apply code", "redeem", "pay in test
  mode" and status-change endpoints. Exactly one should win; the others should get 409/4xx or return the same result.
- Check limited resources: two parallel requests for the last unit of stock, a one-time voucher, a unique name, a seat.
  Both succeeding is a race-condition defect (critical if money or stock is affected).
- Check two different sessions updating the same record in sequence (read, read, write A, write B). With optimistic
  locking the second write must fail (409 or 412) instead of silently overwriting. Last-write-wins on a record with
  version or ETag fields is an important defect.

### 8. ETag, conditional requests and caching
- If responses carry an `ETag`: repeat the `GET` with `If-None-Match` and expect 304 with an empty body; change the
  record, repeat, expect 200 with a new ETag.
- For updates with `If-Match`: a stale value should give 412; a missing header on an endpoint that requires it, 428.
  A server that ignores `If-Match` while documenting it is a defect.
- Cacheable `GET`s that vary by user must not be shared: check `Cache-Control` and `Vary` on authenticated responses
  (`private` or `no-store`). Sensitive data with a public cache directive is important or critical.

### 9. Content negotiation
- Send a body with the wrong `Content-Type` (`text/plain`, `application/xml`, form-encoded to a JSON endpoint): expect
  415 or 400, not a 500, and not a silent success.
- Send `Accept` with an unsupported type: expect 406 or the default JSON. The response `Content-Type` must be accurate
  (`application/json`, with charset where textual) and must not simply echo `Accept`.
- Requests without a body (`GET`, `DELETE`) must not be refused for lacking a `Content-Type`.
- Compressed responses and character encoding: non-ASCII names must round-trip unchanged through create then read.

### 10. CORS, rate limiting, size and speed
- CORS: only if a browser front end on another origin calls the API. Send a request with an `Origin` header from a
  reserved test domain and read the `Access-Control-*` response headers. Details and misconfigurations are in
  `security-checks.md`.
- Rate limiting: read the docs and response headers (`Retry-After`, `RateLimit-*`, `X-RateLimit-*`) first. Do not flood.
  If a low limit is documented for a sensitive endpoint, a few requests above that number on staging are enough to see
  a 429 with `Retry-After`. If no limit is documented, record "rate limit not verified" under Not tested.
- Large payloads: send a body modestly above the documented limit (not megabytes of junk) and expect 413. A list or
  array field with far more items than documented should be refused or bounded, not time out.
- Response time: note any single call that is far slower than its neighbours, and list endpoints that get slower
  with larger `limit`. A call over a few seconds on a trivial read is a lead (`slow-response`), confirmed by repeating
  it. Do not load-test.

### 11. State-changing sequences
- For each resource run the full lifecycle and read after every step: create (201), read it back (all submitted fields
  stored exactly, server fields set), list (appears once, in the right place), update (change one field, others
  untouched, `updated_at` moves, `created_at` does not), read again, delete, read (404 or a documented soft-deleted
  state), list (gone), delete again (idempotent), update after delete (404/409, not resurrected).
- Illegal state transitions: cancel a shipped order, approve twice, reopen a closed item. Expect 409 or 422 with a clear
  message; a transition that skips a required step is an important defect.
- Dependent resources: deleting a parent with children is either refused (409) or cascades as documented; check for
  orphans by listing children afterwards.
- Cleanup: delete only records this run created, in reverse order of creation, and confirm the delete worked.

### 12. Staleness across roles: warm, change, re-read
- Caches and read models hide behind lists, counts, dashboards, search results and detail pages. A read taken *after* a change
  usually looks right because nothing was cached yet, so a plain "change then read" check misses staleness. Use the sequence
  **warm, change, re-read**:
  1. As the viewing role, read the list and the detail of a record you created (`QA-` data) and note the values. This fills any cache.
  2. As the other role (or through the other UI or endpoint), change that record: status, quantity, price, name, assignee, flag.
  3. Immediately re-read as the first role through the same endpoint, then through the UI after a reload, then once more after
     about ten seconds. The new value must appear at once, or within a delay the product documents.
- Run it for each pair that matters: admin changes, customer views; customer cancels or edits, admin views; one user's change,
  totals and counts on reports and dashboards; changed text, search results (index lag) and exports.
- Compare each view with the record's own detail endpoint straight after the change, and with the other UI. Two values for one
  field is a finding. Stale after a reload is important; stale money, stock, status that gates an action, or permissions is critical.
- Look at the cause hints: `Cache-Control`/`max-age` or a shared cache on per-user data, `ETag` that does not change after a write,
  an in-memory list cache keyed by user or customer with no invalidation on write. Record timestamps and the three values (before,
  right after the change, after the wait) so a developer can see whether the value is late or never arrives.
- Repeat once to rule out a race. If a documented delay is longer than you can wait (a cache lifetime of minutes), report only what
  you observed and list the rest as Not tested ("cache lifetime not waited out").

### 13. Time and time zones
- Timestamps in responses should be ISO 8601 with an explicit offset or `Z`; one API should use one convention.
- Send the same instant in different offsets (`+05:00`, `Z`, `-08:00`) and confirm it is stored and returned as the
  same moment. Dates without a zone must be interpreted as documented.
- Date-only fields near midnight and month or year ends (31 December, 29 February on a leap year, end of month) must
  not shift a day. Date ranges: start after end must be refused; inclusive versus exclusive end must match the docs.
- `created_at` must be near "now" on the server clock; far-off values suggest a time zone or clock bug.

### 14. Finding endpoints when there is no spec
- Read the source for route definitions (router files, controllers, decorators, URL conf), then confirm each in the
  browser's network traffic while using the UI. Record which source you used in the charters.
- Collect from network traffic: method, path, query, request body shape, headers, status, response shape, and which calls
  fire on each user action. Group by resource.
- List the endpoints the UI never calls but the source defines (admin, export, internal, debug). Probe them the same way
  you probe documented ones; they often lack checks.
- Use `OPTIONS` (read the `Allow` header, but verify with real calls) and the 405 responses to learn supported methods.
  Sketch your own contract from observed responses and say clearly that it is inferred.

### 15. Writing the expected result for every probe
- Before sending, write one sentence: role, request, and the expected status plus the key body facts. Example:
  "role-a `POST /items` with `quantity=-1` expects 400 (or 422) and a message naming `quantity`; no record is created."
- Prefer a status list over a single code when both are legal (`[400,422]`, `[403,404]`). Add a body check for the
  fact that matters (`$.error` exists, `$.total` equals your own arithmetic, a secret field is absent).
- For writes, add the follow-up read as its own probe with `capture` (the new id) and assert the stored state.
- For negative probes, also assert the side effect did not happen (a later list or read shows no new record).
- Record the source of the expectation: spec line, config rule, or the standard semantics above. Do not file a defect
  that rests only on your taste.

## Severity hints
- **critical**: a 5xx or wrong result on a core happy path; money, stock or totals wrong; data created, changed or deleted
  without authorization; race conditions that duplicate charges or oversell; credentials or personal data in an error.
- **important**: invalid input accepted or stored wrongly; stack traces or SQL in errors; lost updates; duplicate records
  on double submit; pagination that skips or repeats items; server-side limits missing; spec drift on a documented
  operation; undocumented reachable operations.
- **minor**: inconsistent error shape or 400-versus-422 convention, missing `Allow` or `Location` headers, wording of
  messages, slightly wrong status code that clients still handle (200 versus 201).

## Safe on staging
- Only call the configured base URL. Write, update and delete only records you created with the `QA-` prefix.
- Do not send payment, email, SMS or webhook endpoints unless the product has a verified test mode; list them as Not tested.
- Keep `repeat` counts at 2 or 3 and concurrency tests to a handful of calls. Never loop requests to find a limit.
- Large-payload and long-string probes stay modest (kilobytes, not megabytes).
- Keep evidence minimal: store the request and the relevant response lines, redact tokens, and do not copy lists of
  real personal data into notes.

## Common bug patterns
- Validation only in the front end, or only on create and not on update.
- Handler trusts the type that arrived (string "10" plus 5 gives "105") or lacks range checks (negative quantity).
- Uniqueness checked in code, not by a database constraint, so parallel requests both pass.
- No transaction around a multi-step write, so a failure leaves half-created data.
- Offset pagination without a stable sort, so rows move between pages; cursor built from a non-unique column.
- Unhandled exception middleware prints the raw error; debug mode left on in the environment.
- Spec generated long ago and never updated, or response serializers returning extra fields the spec forbids.
- Soft delete flag not applied in some queries (list or search), so deleted rows reappear.
- Time handled in local server time; date-only values converted to UTC and shifted a day.

## See also
`auth-and-sessions.md`, `permissions-and-data-isolation.md`, `security-checks.md`, `search-filter-pagination.md`,
`test-design.md`, `bug-reporting.md`, `payments-and-money.md`
