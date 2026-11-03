# Coverage checks: other browsers and screen sizes, how a screen looks, speed, and messages

Read this at Step 4, once you know the product's key pages (after the first UI pass), and again when a run's config names `browsers`, `viewports`, `mail`, `sms` or `visual`. These checks are done by QAMind's own commands: they are exact and repeatable, they are cheap, and they stay behind the same URL policy as everything else. **Every result is a lead for you to verify, not a verdict:** repeat it twice and write the finding as usual.

## 1. The page sweep: other browsers, screen sizes, load time, and how a screen looks

Write `<run.dir>/data/sweep-pages.json`: the 5 to 15 key pages of the product, per role. It is checked against the config, so it can name only its web UIs and roles.

```json
{
  "logins": {
    "acme-1": [
      { "do": "goto", "path": "/index.html" },
      { "do": "fill", "target": { "label": "Email" }, "secret": "QA_ACME1_USER" },
      { "do": "fill", "target": { "label": "Password" }, "secret": "QA_ACME1_PASS" },
      { "do": "click", "target": { "role": "button", "name": "Sign in" } },
      { "do": "expect_url", "contains": "my-orders" }
    ]
  },
  "pages": [
    { "id": "my-orders", "title": "My orders", "ui": "Client Portal", "role": "acme-1", "path": "/my-orders.html" },
    { "id": "order-detail", "title": "One order (opened from the list)", "ui": "Client Portal", "role": "acme-1", "path": "/order.html?id=1042" },
    { "id": "login", "title": "Sign-in page", "ui": "Client Portal", "path": "/index.html" }
  ]
}
```
- `id`: short, lowercase, stable (baselines and speed history are keyed by it). `role` left out means the page needs no sign-in. `path` starts with `/`. A page's own optional `steps` (same vocabulary as a bank UI test) reach a state to photograph; they cannot sign in.
- `logins` is optional: a role without an entry is signed in automatically at the form the page redirects to. Use `logins` when that fails or the form is unusual. A sign-in may use only that role's own login variables.
- **Choose the pages from what you found, not from a guess**: the pages you browsed, the product map, the links and forms in the product. Include, for every role, the **list pages, the form pages, and one detail page for each kind of record** (open the list, follow a link, and use that page's path with its id, as the example does): detail pages are where dates, amounts and per-record text appear, and a browser difference shows exactly there. Add the sign-in pages and any page you suspect is slow. A page that is not in the file is not checked, in any browser.

Then:
```
{{CLI}} sweep check --run <id>     # the file is valid; which browsers and screen sizes this mode covers
{{CLI}} sweep run --run <id>       # visits every page in each browser and size; prints the leads, slow pages and picture differences
```
What the mode covers (spec): `diff` one browser and one size; `quick` the first browser at desktop and mobile; `full` every browser in the config's `browsers` at every size in `viewports`. Pass `--browsers webkit` or `--viewports mobile` to choose.
Each lead names the **page**, the **kind**, **where it happens** (`only at mobile`, `only in webkit`, `every browser and screen size`) and the browsers and sizes it was seen on. Put that in the finding: `browser` and `viewport` on the finding say where you saw it (`"webkit"`, `"mobile 390x844"`); when it is in every browser and size, leave them out and say so in the summary. One finding for one problem, however many browsers show it.
- A lead that appears **only in one browser** (for example `bad-text` "Invalid Date" only in webkit) is a cross-browser bug. **Your own browser not showing it does not make it unconfirmed**: that is exactly what "only in webkit" means. To reproduce it a second time, look at that page again in that browser and size: `{{CLI}} sweep run --run <id> --pages <page-id> --browsers webkit --viewports mobile` replaces only those visits in the run's sweep and keeps the rest. A lead the sweep shows in two separate sweeps, or in the same browser at two screen sizes, is reproduced twice: report it with the sweep's screenshot (its path is in the lead) as evidence, set the finding's `browser`, and say in the steps that it was seen by the sweep. Only a lead the sweep itself cannot repeat goes under Unconfirmed.
- A browser that cannot start is in `unavailable_browsers`. **Everything in it is Not tested**: put it in `not-tested.json` (the reason says it was not installed or could not start). `report lint` refuses a report that does not. Never write that a product "works in Safari" without a WebKit result. Only the owner installs a browser (`qamind browsers install webkit`): tell them, do not try it.
- `slow_or_slower` are pages slower than their budget (`performance.page_load_ms`, default 3000 ms until the page is ready for a person) or slower than recent runs by more than `performance.regression_pct`. Check by hand that the page is really slow (open it, watch it) and report it as a finding of type `performance` in plain words ("The Reports page takes 4 seconds to open"), with the sweep's screenshot as evidence.
- The sweep also reports what the page audit finds on every page (unnamed controls, off-screen or covered controls, text that does not fit, right-to-left text in a left-to-right box); judge each as `surfaces.md` says.

### Visual regression
Pictures are compared with a **baseline** the owner accepted after a run they judged good (`{{CMD_QA_TESTS}} baseline accept`): per page, role, browser and screen size, ignoring `visual.ignore_selectors` and anything private data masking hides. With no baseline, the sweep says so and compares nothing: that is not a pass. A difference above `visual.threshold` comes with before, after and difference pictures: look at all three, decide whether it is a defect or an intended change, and report the defect (type `visual`, severity by impact: a broken layout is 🟠 or 🔴, a small shift 🟡). **You cannot accept baselines**: tell the owner which pictures changed on purpose, and that `baseline accept` makes them the new baseline.

## 2. Speed of the API: a few read-only calls

Write `<run.dir>/data/perf-endpoints.json`: the 3 to 10 endpoints that matter (the list and detail calls of the critical flows, the reports and search). GET and HEAD only; this is not a load test.
```json
{ "endpoints": [ { "method": "GET", "path": "/orders", "role": "acme-1" }, { "method": "GET", "path": "/admin/reports/sales", "role": "admin", "calls": 5 } ] }
```
`{{CLI}} perf check --run <id>` then `{{CLI}} perf api --run <id>` (at most 10 calls per endpoint, one after the other; median and the slowest, against `performance.api_p95_ms`, per-endpoint budgets in `performance.endpoints`, and recent runs). A slow endpoint is a finding (surface `api`, type `performance`) with the numbers. Do not say anything about traffic or capacity.

## 3. Email and SMS: what the product sends

Needs `mail.catcher` (and `sms.catcher`) in the config: a sandbox that catches what the product sends. `{{CLI}} mail status --run <id>` says whether there is one. **Without one, every flow that sends a message is Not tested, with the reason "no email sandbox configured"** (list each flow you know of: sign-up verification, password reset, invitations, order or notification emails). Never send to a real address: use only test accounts' addresses (a test login, an address starting with the test-data prefix, or one in a reserved test domain such as `.test` or `example.com`; QAMind refuses others).
1. Start the flow in the product with a test account's address (the UI or the API).
2. `{{CLI}} mail wait --run <id> --to <that address> --flow "password reset" --kind transactional [--language ur] [--subject-contains TEXT]` waits up to the configured time (`mail.timeout_s`) and checks: it arrived, the recipient, a subject, **no placeholder left** (a name in double curly braces, `${x}`, `undefined`), **every link works and points to the test environment** (a link to production or anywhere else is not opened and is a finding), an unsubscribe where the kind needs one (`marketing`, `notification`), and the language (a coarse check of the script).
3. **Read the excerpt yourself**: the checks cannot tell whether the wording makes sense. The message and the checks are saved in the run (evidence file in the output). A failed check is a lead: start the flow again and check once more before you report it.
4. If nothing arrived, first make sure the sandbox works (a flow that surely sends something); then report it, or put it under Unconfirmed.
Use `{{CLI}} sms wait --run <id> --to <number>` the same way for text messages.

## 4. What goes in the reports
The sweep, the message checks and the timings appear in the technical report on their own (matrix, leads, slow pages, picture differences, message checks, API timings) and as plain lines in the admin report. Your findings carry the detail. Whatever could not run is Not tested; whatever ran and found nothing is not a claim that the product is fine in places you did not visit.
