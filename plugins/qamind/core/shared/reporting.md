# Reporting

Everything you learn goes into JSON files in `<run.dir>/data/`. `qamind report build --run <id>` renders **both**
`TECHNICAL-REPORT.md` and the plain-language `ADMIN-REPORT.md` from them (and assigns stable `ISSUE-NNN` ids); `report lint` enforces the
evidence rules, that every finding and not-tested entry has plain-language text, and that the two reports agree. How to write the plain-language
parts is in `${CLAUDE_PLUGIN_ROOT}/core/shared/admin-report.md`.
Write the files with the Write tool (they are inside `.qa/`, so a report-only run may write them).

Before writing findings read `${CLAUDE_PLUGIN_ROOT}/core/knowledge/bug-reporting.md` (what to verify first, how to word titles and steps, how to group).

## Severity
- 🔴 **critical**: users blocked; data wrong, lost or exposed; money affected; security or permission breach.
- 🟠 **important**: a feature works badly or confusingly; a workaround exists.
- 🟡 **minor**: cosmetic, wording, layout, a small annoyance.

## `charters.json`: written before probing
```json
[{ "id": "C1", "surface": "api", "title": "Order creation and totals",
   "goal": "Orders are validated and totalled by the stated rule",
   "risk": "Money is calculated wrongly", "entry_point": "POST /api/orders as a client",
   "expected": "Invalid input is refused; total = (subtotal - discount) + tax",
   "exit_condition": "All validation edges and both sides of the 1,000.00 discount threshold checked" }]
```

## `findings.json`: confirmed problems only
```json
[{ "title": "Orders with a negative quantity are accepted",
   "severity": "important", "surface": "api", "area": "Orders", "type": "validation",
   "summary": "The API creates an order when an item quantity is -3, giving a negative total.",
   "steps": ["Sign in as client-a over the API", "POST /api/orders with items[0].quantity = -3 (see evidence for the exact request)", "Observe HTTP 201 and a negative total"],
   "expected": "HTTP 400: quantity must be a whole number from 1 to 1000",
   "actual": "HTTP 201; order created with total -45.00",
   "reproduced": { "times": 2, "of": 2 },
   "evidence": ["evidence/api/baseline-P014.json"],
   "roles": ["client-a"],
   "suspected_cause": "No range check on quantity in the order handler",
   "regression_test": { "description": "POST an order with quantity -3 and expect 400", "location": "test/orders.test.js" },
   "plain": { "title": "The system accepts orders with a negative number of items",
              "where": "Behind the screens (the part that talks to the Client Portal)",
              "what_happens": "An order for minus three items is accepted, which gives a negative total.",
              "who_is_affected": "Customers and staff reading order totals; the company's sales figures.",
              "how_to_see_it": [],
              "expected": "The order is refused with a clear message." } }]
```
Every finding needs the `plain` block (see `admin-report.md`; `how_to_see_it` is `[]` when it cannot be seen on screen).
- `surface` is one of `api`, `ui`, `cross`, `permissions`, `business-rule`, `other`. Add `ui`, `browser`, `viewport`
  for UI findings, and `charter` to link back to the plan.
- `steps` are exact and repeatable: sign-in role, then every click or request, with the data used. For API findings
  point at the evidence file (it contains a ready curl command). For UI findings number each action and name the
  page and menu path.
- `evidence` paths are relative to the run folder and must exist. At least one per finding.
- `reproduced.times` must be 2 or more. Otherwise it belongs in `unconfirmed.json`.
- Propose a `regression_test` for every finding (description plus a suggested location that fits `stack.json`).
  `/qa-only` never writes it into the product.
- One root cause, one finding. Group identical symptoms on several pages or browsers into one finding.

## `unconfirmed.json`: seen but NOT reproduced twice
Only for things you could not reproduce twice. Something that **does** reproduce but where you are unsure the product
intends it (for example two orders created by a double submit) is a **finding**: say what you are unsure about in
`actual`, and choose the severity by likely user impact. Do not park reproducible problems here.
`[{ "title": "…", "surface": "ui", "observation": "what you saw", "why_unconfirmed": "could not repeat after 2 tries", "attempts": 2 }]`

## `not-tested.json`: everything not tested, with the reason
`[{ "area": "Client Portal / password reset email", "reason": "No email sandbox configured", "plain": { "area": "Password reset emails", "reason": "Checking them would send real emails and no safe test mailbox is set up." } }]`
Common reasons: missing credentials for a role, blocked by the environment, needs a feature that is not configured,
not covered in this pass (quick or diff mode), would cause a real-world side effect. Only write "time budget reached" if
you were really stopped by a limit. Do not leave a planned area out.

## `coverage.json`: what was checked
`[{ "surface": "ui", "ui": "Client Portal", "area": "Orders list", "role": "client-a", "viewport": "desktop", "status": "tested", "critical_flow": 1, "note": "filters, pagination" }]`
`status` is `tested`, `partial` or `not-tested`. A `not-tested` row is also listed under Not tested automatically.

## Environment problem
If `health` fails: do not test further. Write `not-tested.json` with one entry per planned area (reason: "Environment
problem: <what failed>"), `coverage.json` rows with `not-tested`, no findings, build and lint the report, finish with
`--stop-reason "environment problem"`, and tell the user plainly what is broken.

## `pages.json` and `endpoints.json`: what exists (for the product map)
`pages.json`: `[{ "ui": "Client Portal", "path": "/my-orders.html", "title": "My orders", "roles": ["client-a"] }]`, one entry per kind of page you visited
(path without query string; ids are folded together). `endpoints.json` (only without an OpenAPI spec): `["GET /orders", "POST /orders"]`. From these and the
last run, the reports show **what changed since the last run** (new and no-longer-seen pages and endpoints). `report lint` warns if `pages.json` is missing.

## `admin.json`: the two things only you can judge for the admin report
`{ "biggest_risk": "One plain sentence.", "next_steps": ["At most three plain steps."] }`

## Notes
Add short strings to `data/meta.json` → `notes` for anything the reader should know (for example "Screenshots of the
Customers page may show personal data; review before sharing."), and to `memory_applied` for memory you used.

## Chat summary (at the end, at most 8 lines)
The verdict line from `ADMIN-REPORT.md` first (copy it exactly); counts by severity (critical titles first, clearly); what was not tested and why; both report paths (technical and admin); then "What I learned this run" (what was saved to memory, any environment quirk worth remembering).
