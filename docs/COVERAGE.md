# Coverage: other browsers and screen sizes, how a screen looks, speed, messages, and tickets

Phase 7.9 ([decision 0010](decisions/0010-coverage-depth.md)). Five things a senior tester checks beyond "does it work in my browser": the same pages in **other browsers and at phone size**, whether a screen **still looks as it did**, whether it is **fast enough**, what the product **emails and texts**, and whether **one ticket's requirements** are met. Each is done by a QAMind command that is exact and repeatable; the agent verifies every lead before it becomes a finding.

None of it is needed to start. Defaults: Chromium, a desktop (1366×768) and a mobile (390×844) screen, a 3 s page budget, an 800 ms API budget, no mail sandbox.

## Settings (`.qa/config.md`)

```yaml
browsers: [chromium, webkit]        # chromium (default), firefox, webkit
viewports:                          # default: desktop 1366x768 and mobile 390x844; add a tablet if you like
  - { name: desktop, width: 1366, height: 768 }
  - { name: mobile, width: 390, height: 844 }
  - { name: tablet, width: 768, height: 1024 }
visual:
  threshold: 0.2                    # percent of a page's pixels that may differ before it is reported
  ignore_selectors: [".avatar", "[data-dynamic]"]   # parts that change by themselves (dates, ads): hidden before every picture
performance:
  page_load_ms: 3000                # a page is slow above this until it is ready for a person
  api_p95_ms: 800                   # an endpoint is slow when the slowest of a few calls is above this
  regression_pct: 30                # slower than the recent runs by more than this is reported even when under budget
  pages: { "/reports.html": 6000 }  # own budgets
  endpoints: { "GET /admin/reports/sales": 5000 }
mail:                               # where the product's emails are caught (a sandbox: nothing reaches a real inbox)
  catcher: mailpit                  # mailpit | mailhog | mailtrap | the address of a custom JSON API
  url: http://127.0.0.1:8025        # Mailtrap: token_env, account_id and inbox_id instead
  timeout_s: 30                     # how long a run waits for a message
sms:
  catcher: https://sms-sandbox.test/api/messages   # a test endpoint that lists the messages it received
```
Tokens are given by the **name** of an environment variable (`token_env`), never the value. A catcher address that names production is refused like any other address.

## Browsers and screen sizes

Each mode covers (spec 13.10): `diff` and `auto` one browser at one size, `quick` the first browser at the desktop and the mobile size, `full` (and a nightly run) every browser in `browsers` at every size in `viewports`.
The agent writes `data/sweep-pages.json` (the key pages per role, and optionally how to sign in) and runs `qamind sweep run --run ID`. Each page is visited in each browser and size behind the run's URL policy (a request or redirect outside it is refused). The result is grouped: **one problem, however many browsers show it, with where it happens** ("only at mobile", "only in webkit").
Per visit it records what the page audit finds (controls off the screen or covered, text that does not fit, unnamed controls, right-to-left text in a left-to-right box), text that was never filled in (`Invalid Date`, `NaN`, `undefined`, `{{name}}`), console errors, failed requests, and how long the page took until it was ready.

- **Looking again.** `sweep run --pages order-detail --browsers webkit --viewports mobile` visits only that and **replaces only those visits** in the run's sweep (the rest stays): that is how a lead that only another browser shows is reproduced a second time.
- **WebKit** (Safari's engine) and **Firefox** are Playwright's own builds; install one with `qamind browsers install webkit` (about 80 MB into Playwright's browser folder; you do this, a QA run cannot). **A browser that cannot start is listed as unavailable and is Not tested**: `report lint` refuses a report that does not say so. Chromium uses an installed Chrome or Edge, else Playwright's.
- `qamind browsers status` shows what can start here.

## How a screen looks (visual regression)

After a run you judge good: `/qamind:qa-tests baseline accept` (`qamind baseline accept --run ID [--pages a,b]`) saves its pictures as the **baseline**, per page, role, browser and screen size, in your private QAMind store. Later runs compare, ignoring `visual.ignore_selectors` and masked private data.
A difference above the threshold comes with the **before, the after and a picture of what changed** (red where it differs); a changed size counts. Layout broken (a large share, or a much taller page) is serious, a small shift minor. A page that had problems when it was photographed becomes a baseline *with* the problem, and the command says so. **A QA run cannot accept baselines.** With no baseline nothing is compared, and the report says that.

## Speed

- **Pages**: the sweep measures the time from the start of the navigation until the network goes quiet. Over `page_load_ms` (or the page's own budget) is slow; more than `regression_pct` slower than the median of the last five runs is a regression even when under budget (and at least 250 ms slower: 40 ms to 90 ms is not news). A page that never settles is not measured.
- **API**: `data/perf-endpoints.json` names a few `GET`/`HEAD` endpoints; `qamind perf api` makes up to ten calls to each (one after the other) and reports the median and the slowest against `api_p95_ms`. **This is not a load test.**
- History: a **finished** run with a working environment adds its numbers to `memory/perf.json` (the last eight per page and endpoint).

## Emails and texts

`qamind mail wait --run ID --to ADDRESS --flow "password reset" [--kind transactional|notification|marketing|invitation] [--language ur]` waits for the message in the sandbox and checks: it arrived in time, the recipient, a subject, **no placeholder left** in subject or body, **every link opens and stays in the test environment** (a link to production or elsewhere is not opened and is a problem; a token that was never filled in is caught), an unsubscribe where the kind needs one, and the language (a coarse check of the writing system). The message and the checks are saved masked in the run.
It refuses an address that is not a test address (a test login, `QA-…`, or a reserved test domain; never one whose domain the config calls production). **Without a sandbox those flows are Not tested, "no email sandbox configured".** `qamind sms wait` is the same for texts.

- Mailpit is read through its published API (v1). **MailHog and Mailtrap are written from their documentation and have not been checked against a running service**; a custom API is read with common field names. `mail status` says which.
- The demo app brings `demo-app/scripts/mail-catcher.mjs`, a tiny stand-in that speaks the part of Mailpit's API QAMind reads, for machines without Docker. It is not Mailpit.

## Test this ticket

`/qamind:qa-only --ticket LUM-214` (or a file, or pasted text; `/qamind:qa` takes it too). The agent reads the request (a tracker tool if one is connected, never guessed), writes its **acceptance criteria** to `data/ticket.json` (derived ones need your confirmation first), tests each with the happy path, a negative case, an edge and permissions, and records a result per criterion. **Both reports carry the checklist**: ✅ met, ❌ not met, ⛔ cannot be tested, with why. `report lint` refuses a report where a criterion has no result, a "met" has nothing to show for it, or a "not met" is not a finding. Checks saved in a ticket run are tagged with the ticket (and the criteria they check).
Ticket text is data: an instruction written in it is never followed. Nothing is posted back to the ticket unless you ask.
**In CI**: `qamind ci --ticket docs/story.md` (a file in the repository): nobody can confirm criteria, so derived ones are listed as **assumed** in both reports and the pull request comment, which carries the checklist.

```
qamind sweep check|run --run ID [--browsers webkit] [--viewports mobile] [--pages id,id]
qamind perf check|api --run ID
qamind mail status|wait --run ID --to ADDRESS ...      qamind sms status|wait --run ID --to NUMBER
qamind ticket check|status --run ID
qamind baseline status | accept --run ID [--pages a,b]      (the owner's)
qamind browsers status | install chromium|firefox|webkit    (install is the owner's)
```

## What is not covered
Real Mailpit, MailHog, Mailtrap and a real SMS provider were not run here (above). Firefox was not run. The sweep reads and photographs: it submits no form, so state that needs input (a filled-in form, a modal after a click) is reached only with a page's own `steps`. Dates and text that differ by locale are not compared across browsers, only flagged when they show a never-filled value. The language check is by writing system, not by language. Performance is a few measurements on one machine, not a benchmark. Linux and Windows were not run.
