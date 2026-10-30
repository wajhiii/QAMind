# Testing each surface

Read the section you are about to work on. Safety rules (`safety.md`) apply to everything here.

## API

1. **Map the endpoints.** `qamind api inventory --run <id>` parses the OpenAPI spec named in the config (file or URL)
   and prints every operation with its auth requirement, parameters, body fields and documented responses. With no
   spec, build the list yourself: grep the source for route definitions, then confirm against traffic in the browser
   (`browser_network_requests`). Say in the charters which source you used.
2. **Generate a baseline plan.** `qamind api plan --run <id> [--role <name>] [--name <plan-name>]` writes
   `data/plans/<name>.json`: unauthenticated calls, happy paths, not-found ids, pagination and search edge values,
   missing/wrong-type/boundary body fields (including fields of the first item in arrays), empty and malformed JSON,
   duplicate submission, `setup` probes (reads use an existing id such as the first product; **writes only ever touch a
   record the run created itself**, a `QA-` prefixed one made by a setup probe), and a role matrix for
   every id-less GET. It runs as `admin` if that role has credentials, else the first available role. Endpoints that look
   like they send email or SMS, take payments or fire webhooks are **left out** (`excluded_possible_side_effects`): list
   those flows under Not tested ("would cause a real-world side effect" or "no email sandbox configured"), unless the
   product has a test mode you can confirm is safe, in which case rerun with `--include-side-effects`.
3. **Run the baseline as each kind of role.** Write endpoints are usually role-specific: a happy-path `POST` that returns
   403 for `admin` may be exactly right (only clients place orders). Generate a second plan as a client role
   (`api plan --role <client> --no-matrix`) so the validation, boundary and duplicate-submission probes run as someone
   who is allowed to make the call. A 403 on a happy path is not a finding when that role is not meant to do it.
4. **Edit the plans** to fit the product, then run them:
   - add business-rule probes from the config (expected totals, limits, state changes);
   - add **tenant-isolation** probes as a chain: client A creates something and captures its id, client B requests it:
     `{"id":"X1","role":"client-a","method":"POST","path":"/orders","body":{…},"capture":{"orderId":"$.id"}}` then
     `{"id":"X2","role":"client-b","method":"GET","path":"/orders/{{orderId}}","expect":{"status":[403,404]}}`;
   - set `vars` for ids the baseline needs (`needs_variables` lists them), or capture them from a list response;
   - add **session** probes as a chain: `{"role":"client-a","method":"POST","path":"/auth/logout"}` then
     `{"role":"client-a","method":"GET","path":"/me","expect":{"status":401}}` (both use the same token, so a token that
     still works after logout fails the second expectation);
   - delete probes that could cause real-world effects or touch data you did not create.
5. **Run it:** `qamind api run --run <id> --plan <file>`. Each probe is sent with the right role's token (login is
   done for you, credentials never shown). Anything suspicious is automatically re-run once; `reproduced.times`
   of 2 means it repeated. Sanitized request/response evidence and a curl reproduction are saved under
   `evidence/api/` and named in the output.
6. **Judge the signals.** The runner flags `server-error` (5xx), `error-leakage` (stack traces, file paths, SQL
   text), `contract-schema` and `contract-status` (response differs from the spec), `auth-not-enforced`,
   `duplicate-submission`, `slow-response`, `blocked-redirect`, and any failed `expect`. These are leads:
   confirm each against the spec and rules. Correct behaviour is not a bug: 401/403 for missing or wrong
   credentials, 404 for an unknown id, 400/422 for invalid input.
7. **Read the role matrix.** For each operation you get the status per role (anonymous, admin, clients). Compare with
   what the spec and config say each role may do. A lower role getting 200 where only admins should is a finding
   (permissions), even if the UI hides the link. Also check list endpoints return only the caller's own data.
8. **Probe by hand when needed** with extra plans (a plan can have a single probe). Use `capture` to chain calls.

Probe fields: `id`, `title`, `method`, `path` (relative to `api.base_url`), `role` (a config role or `anonymous`),
`query`, `headers`, `body` or `raw_body`, `capture` (`{"var":"$.json.path"}`, or `"$first:id"` for the `id` of the first item in a list response), `repeat` (`{"count":2,"parallel":true}`),
`expect` (`status`: number, `"4xx"`, or a list; `json`: `[{"path":"$.total","equals":1234.5}]` with `exists`, `lte`,
`gte`, `matches`; `body_contains`, `body_not_contains`: a string or a list), `keep_evidence` (save the response even if
nothing looks wrong, to read real prices or ids), `tags`, `needs`. Plans are validated before anything is sent, and
`api run --plan` accepts a file path or just the plan's name.

## Web UI (repeat per UI, per role)

Use the browser tools (their names start with mcp__plugin_qamind_browser__). Prefer `browser_snapshot` (an accessibility tree with element refs) over screenshots for finding
and operating elements; take screenshots as evidence.

- **Sign in** with the role's secret names: `browser_type` into the username and password fields with the variable
  names from the roles table as the text (see `safety.md`). To switch role, call `browser_close`; the next call opens a
  fresh, empty profile. If a role cannot sign in, list that role under Not tested with the reason.
- **Discover pages** from the navigation and from the config's flows; record each page you reach.
- **Run the critical flows** from the config first, end to end, as written.
- **Then, per page and form, the case types:**
  - empty input; very long input (300+ characters); special characters (`< > & " '`); non-English text (Urdu/Arabic
    for RTL, emoji); leading/trailing spaces;
  - boundaries: 0, -1, one above the maximum, decimals where integers are expected;
  - double-submit (click twice quickly, or submit and press Enter) and refresh or Back in the middle of a flow;
  - expired or missing session (clear cookies/storage with `browser_evaluate`, then reload or act);
  - direct URL access to another role's pages and to another customer's records (change the id in the URL).
- **After each key action** check `browser_console_messages` (errors) and `browser_network_requests` (4xx/5xx,
  failed calls). Record what you saw.
- **Audit every page you visit, at every viewport you test:** `browser_evaluate` with `() => window.__qamindAudit()`
  (QAMind injects it into every page; it only reads). It returns leads, not verdicts:
  `unnamedControls` (inputs, selects, buttons and links with no accessible name; a placeholder is not a label),
  `imagesMissingAlt`, `brokenImages`, `pageScrollsSideways`, `controlsOffscreen` (controls pushed outside the viewport),
  `coveredElements` (something else sits on top of a control or row), `clippedText`, `rtlTextInLtrContainer`
  (Arabic/Urdu/Hebrew text in a left-to-right box: check alignment and truncation), and `headings` skips.
  `controlsInsideScrollBoxes` is informational: a wide table that scrolls inside its own box is normal, so it is only a
  finding if there is no cue that more is available **and** key information is unreachable. Judge each lead on the page
  (look at a screenshot) before reporting it; group repeated leads into one finding. The audit does not replace
  looking: also watch for wording, confusing flows and wrong numbers.
- **Also check by hand:** links that 404, console errors and failed requests after each key action, and layout at
  each viewport.
- **Viewports:** desktop 1366x768 and mobile 390x844 (`browser_resize`). In `quick` mode do mobile for **every page of
  the critical flows** (forms and confirmations included, not only list pages). Also look at about 480px if mobile
  shows anything odd. Record the viewport on every finding.
- **RTL / non-Latin text:** check direction and alignment, line breaking, truncation and mixed text-and-number order.
- **Errors shown to users:** wording a person can act on, no technical detail (stack traces, SQL, file paths).
- **If something is blocked by the guard** (missing fonts, scripts, a login provider), run `qamind guard log --run <id>`.
  A legitimate asset host belongs in `security.allowed_extra_origins`; tell the user, do not edit around it silently.
- **Evidence:** `browser_take_screenshot` with `filename` set to the run folder, for example
  `<run.dir>/screenshots/<slug>.png`; save the console and network text you rely on to `<run.dir>/evidence/<slug>-console.txt`
  (redacted). Name evidence by a short slug, not an ISSUE number (numbers are assigned when the report is built).
  If saving a screenshot is refused because the path is outside the workspace, tell the user to start the agent in the
  project folder.

## Cross-checks
- A change made in one UI (for example an admin changing an order's status) shows correctly in the other UI and in the
  API, after a reload. Stale data is a finding.
- Role isolation: a client cannot reach admin pages or admin endpoints (by URL, and by calling the API directly).
- Tenant isolation: client A cannot read or change client B's data by URL or by changing an id in an API call.
- Totals and counts agree between list, detail, summary and API. Recompute arithmetic yourself.

## Business rules
Turn each rule in the config into an explicit expected result with concrete numbers, test it through the API and the
UI, and include boundary values (just below, exactly at, just above a threshold). Do the arithmetic independently of
the product.
