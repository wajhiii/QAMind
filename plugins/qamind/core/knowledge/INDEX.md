# QAMind knowledge index

Curated QA expertise, one topic per file. **Load only what matches what you are about to test**, a few files at a time (about four
at most), and again when you move to a new kind of feature. Do not read the whole folder. Knowledge is guidance, not proof:
verify against the product, and cite the file when it shaped a check or a finding.

## By situation

| You are about to... | Load |
|---|---|
| Plan a run: write charters, decide what to probe first | [exploratory-charters.md](exploratory-charters.md), [test-design.md](test-design.md) |
| Turn a rule or a field into test cases (boundaries, states, combinations, oracles) | [test-design.md](test-design.md) |
| Probe the HTTP API (contract, status codes, validation, concurrency, error leakage) | [api-testing.md](api-testing.md) |
| Check sign-in, sign-out, sessions, tokens, password reset, MFA | [auth-and-sessions.md](auth-and-sessions.md) |
| Check who may see or do what: roles, customers or tenants, admin functions, ids in URLs | [permissions-and-data-isolation.md](permissions-and-data-isolation.md) |
| Run a staging-safe security smoke pass (headers, cookies, CORS, leakage, exposed files) | [security-checks.md](security-checks.md) |
| Drive the browser: refs, waiting, roles, console and network, viewports, evidence | [browser-testing.md](browser-testing.md) |
| Test any form, wizard or editable page | [forms.md](forms.md), [test-design.md](test-design.md), [accessibility.md](accessibility.md) |
| Test a list, search, filter, sort or paging | [search-filter-pagination.md](search-filter-pagination.md), [api-testing.md](api-testing.md) |
| Judge a page's layout, responsiveness, mobile width, overflow, covered or clipped content | [ui-and-layout.md](ui-and-layout.md) |
| Check accessibility: names, labels, keyboard, focus, contrast, headings | [accessibility.md](accessibility.md) |
| See Arabic, Urdu, Hebrew or mixed-language content, locales, encodings, time zones | [i18n-and-rtl.md](i18n-and-rtl.md), [ui-and-layout.md](ui-and-layout.md) |
| Anything involving amounts, prices, discounts, tax, totals, refunds, checkout | [payments-and-money.md](payments-and-money.md), [test-design.md](test-design.md) |
| Upload or download files, import or export | [file-uploads.md](file-uploads.md), [security-checks.md](security-checks.md) |
| Check emails, SMS or notifications (needs a mail catcher or sandbox) | [notifications-email.md](notifications-email.md) |
| Write up a finding, choose severity, decide finding vs unconfirmed vs not tested | [bug-reporting.md](bug-reporting.md) |
| Work out why something fails, or state a suspected root cause | [debugging-and-root-cause.md](debugging-and-root-cause.md) |
| See a check that passes sometimes and fails sometimes | [flaky-tests.md](flaky-tests.md) |
| Fix a bug found by QA (fix mode only; report-only runs never edit code) | [fixing-safely.md](fixing-safely.md), [debugging-and-root-cause.md](debugging-and-root-cause.md) |

## By detected framework

`run start` reports `stack.frameworks`. Load the matching note once, when you start reading source or probing that layer.

| `stack.frameworks` contains | Load |
|---|---|
| `react` | [react](framework-notes/react.md) |
| `nextjs` | [nextjs](framework-notes/nextjs.md), [react](framework-notes/react.md) |
| `vue` or `nuxt` | [vue](framework-notes/vue.md) |
| `express`, `fastify`, `koa`, `hono` or `nestjs` (Node HTTP servers) | [express](framework-notes/express.md) (patterns carry over; check the framework's own middleware order) |
| `laravel` | [laravel](framework-notes/laravel.md) |
| `django` (also for Django REST framework) | [django](framework-notes/django.md) |
| `rails` | [rails](framework-notes/rails.md) |
| `dotnet` | [dotnet](framework-notes/dotnet.md) |
| none of the above (for example `angular`, `svelte`, `flask`, `fastapi`) | no note yet: use `api-testing.md` and `permissions-and-data-isolation.md` and read the source for routes and auth checks |

## Rules for using this folder

- Never edit these files during a run. If one is wrong or missing something, append a proposal to `.qa/suggested-improvements.md`
  (what, why, evidence).
- Every file here was written from the sources listed in `docs/KNOWLEDGE-SOURCES.md`, in our own words.
- Each file ends with a **See also** line; follow it only when the topic applies.
