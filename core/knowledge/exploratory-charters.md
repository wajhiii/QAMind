# Exploratory charters

Load this when you plan a run (before the first probe), when a charter feels vague or too big, when you run out of ideas in
an area, or when you must decide whether to stop. A charter is a small written mission: one risk, a known starting point, a
way to recognise "good", and a point where you stop.

## Writing a charter
Fill all five fields. A charter missing one is a wish, not a plan.
- **Goal**: what you want to learn, as a sentence that starts with a verb. Pattern: "Explore <area> as <role> with <data or
  tool> to find out whether <behaviour that matters> holds." Weak: "Test orders." Better: "Explore order creation as a client
  to find out whether totals follow the stated discount rule."
- **Risk**: the specific bad thing that could be true. Name the harm (wrong money, leaked record, lost edit, blocked user),
  not the feature. If you cannot name a harm, the area is probably cosmetic: give it low priority.
- **Entry point**: the first page, endpoint or action, the role, and the starting data. Someone with no context should be able
  to start from it.
- **Expected**: checkable results with numbers, statuses and wording, and where each expectation comes from (spec, a stated
  business rule, behaviour elsewhere in the product, a common standard). If no source of truth exists, write "source unclear"
  and treat deviations as questions to flag in the report notes, not as defects.
- **Exit condition**: what must be true before you stop, as a short list ("both sides of the threshold checked, every
  validation edge tried once, each role tried"). Without it you will either stop too early or never stop.

Size rule: one charter fits one sitting, roughly 10 to 25 probes. If the exit condition needs more than about five items or
mixes two risks, split it. If you could finish in three probes, merge it with a neighbour.

## Prioritising
- Rank by harm if wrong times chance of being wrong. Money, permissions, personal data, irreversible actions and anything that
  blocks users come first.
- Then order by: flows and rules the config states; areas with past findings (memory is a lead, not proof); recently changed
  code; complex logic (calculations, state machines, multi-step wizards, integrations); new or unpolished features.
- For an area you have never seen, start with a short reconnaissance pass (a tour, below) and write the real charter from
  what you learn.
- Write all charters, and save them, before the first probe. Add charters later when a finding or a surprise reveals new risk.

## Timeboxing and stopping
- Box a charter by probes, or by a time limit the user or host gave. A working default is 10 to 25 probes per charter. For
  people, sessions of 60 to 90 minutes are common; treat both numbers as rules of thumb. Never claim a time budget that was
  not given, and never exceed one that was.
- Every five probes ask: what did I learn in the last five? Nothing new twice in a row means change heuristic or stop.
- Stop when: the exit condition is met; two heuristic switches in a row found nothing; the work is blocked (missing role,
  broken environment, a step that would cause a real-world side effect), in which case record it as Not tested with the true
  reason; or a safety rule applies.
- A finding does not end the charter. Bugs cluster, so spend a few probes on neighbours: the same field on other forms, the
  same endpoint with other methods, the same logic for other roles.
- Do not stretch the box to chase one cause. Finish the current probe, note it, and give deep investigation its own charter.
- If you stop before the exit condition, mark the area partial and list which exit items were not reached.

## Taking notes while exploring
- One line per probe: number, exact input and role, what you saw, evidence reference, verdict (ok, suspicious, bug, question).
- Keep three side lists: **suspicious** (needs a second reproduction), **questions** (expected behaviour unclear), **ideas**
  (new charters).
- Record passing checks too. "Tested, nothing found" must be distinguishable from "not tested" in the coverage record.
- Note every record you create (with the `QA-` prefix) so you can clean up only your own data.
- Before leaving a charter, repeat each suspicious item once from fresh state, then promote it to a finding or move it to
  unconfirmed.

## What to probe: heuristics
Pick two or three per charter as prompts. Do not run all of them.

### Product elements (Structure, Function, Data, Interfaces, Platform, Operations, Time)
- **Structure**: what the product is made of (pages, modules, shared components). Do the parts agree, for example menu
  entries versus reachable routes, list versus detail?
- **Function**: each action it performs. What should it do, and what should it refuse? How does it fail?
- **Data**: what enters, is stored and leaves: types, sizes, formats, lifecycle, related records, import and export.
- **Interfaces**: every door in: UI, API, URLs, links in messages, files. Compare doors (the UI refuses what the API accepts).
- **Platform**: what it runs on and depends on: browser, viewport, locale, time zone, other services. What if one is slow?
- **Operations**: who uses it and how: roles, novices, heavy users, two tabs, a long session, common versus rare paths.
- **Time**: order, duration and concurrency: double submit, expiry, scheduled jobs, stale data, daylight saving, month end.

### Data and flow prompts
- CRUD for every entity: create, read, update, delete, and what happens to related data afterwards.
- Follow the data: create it in one place and look for it everywhere (list, detail, totals, API, export, notification).
- Goldilocks: too small, too big, just right; plus just under, exactly at and just over each limit.
- Count, position, selection: zero, one, many, too many; first, last, middle; select none, one, all.
- Flood and sequences: many fast actions, steps in reverse order, a skipped step, a repeated step.
- Interruptions: Back, refresh, closing the tab, session expiry, losing the network in the middle of a flow.
- Configurations: another viewport, language, time zone, color scheme, with cookies cleared.
- API prompts: verbs (wrong method), authorization, data (types, boundaries), errors (body and status), responsiveness.

### Tours (short guided passes)
- Feature: touch every feature once. Money: the features users rely on or pay for. Landmark: travel between the key
  pages in different orders. Back alley: the least-visited screens and settings. All-nighter: use it continuously without
  signing out or reloading. Bad data: feed awkward values everywhere. Configuration: repeat key flows in other
  setups. Claims: check what help text, labels and documentation promise.
- No tour is "best". Choose by risk and product, and turn what a tour reveals into a charter.

## Charter templates
Adapt: replace `<...>`, drop probes that do not apply, keep the risk specific. Each template follows the charter fields.

**1. Login and session**
- Goal: Explore sign-in and sign-out as <role> to find out whether only valid users get in, errors are safe and sessions end.
- Risk: access wrongly granted or refused; a session survives logout; error text reveals which accounts exist.
- Entry point: <login page> and <login endpoint>, signed out, role <role> (secret names only).
- Probes: valid sign-in; empty fields; at most three wrong-password attempts (never hammer); same wording for unknown user and
  wrong password; spaces and letter case in the username; Enter submits; deep link while signed out returns to the page after
  login; logout, then Back and reuse of the old session over the API; log out in one tab and act in another; session expiry
  in the middle of a form (is the input kept?); password not echoed or placed in a URL.
- Expected: <valid creds> reach <home>; invalid creds get one generic message; after logout every call is refused.
- Exit: every probe above tried once per role; expired and logged-out sessions checked through UI and API.

**2. CRUD list and detail**
- Goal: Explore create, view, edit and delete of <entity> as <role> to find out whether list, detail and API agree and bad
  input is refused.
- Risk: edits lost or saved wrongly; deleted items reappear; counts wrong; validation only in the UI.
- Entry point: <entity> list page and <collection endpoint>, with one `QA-` record.
- Probes: minimal valid create; each field at maximum length, with special and non-Latin characters; empty required fields;
  duplicate of a unique value; edit then reload; edit the same record in two tabs; delete then check list, detail URL
  (expect not found), related records and totals; item on a page boundary after create or delete; double submit; refresh
  mid-edit; unsaved-changes warning; empty state; long names in narrow columns.
- Expected: <validation rules>; changes visible in UI and API after reload; deleted means gone everywhere.
- Exit: all four operations done through UI and API; each field validated at both ends; counts agree after every change.

**3. Checkout or order**
- Goal: Explore placing an order as <client role> to find out whether totals, states and duplicates follow the stated rules.
- Risk: wrong money; double orders; order in a wrong state; another customer sees the order.
- Entry point: <cart or order form> with `QA-` items. Payment only in a confirmed test mode. Otherwise stop before payment and
  list it as Not tested (real-world side effect).
- Probes: recompute subtotal, discount, tax, shipping and rounding yourself; just below, at and just above each threshold;
  quantity 0, -1, one over the maximum, decimal; change quantity after a coupon; remove an item; double click Place order;
  refresh after submit; Back after confirmation; stock limits; order history shows only the owner's orders; each allowed
  state change, and one that should be refused.
- Expected: total = <formula>; invalid quantities refused; one click creates exactly one order.
- Exit: both sides of every threshold, every validation edge, every state change tried, totals agree in list, detail and API.

**4. Settings and profile**
- Goal: Explore changing <settings> as <role> to find out whether values persist, apply everywhere and bad values are refused.
- Risk: a setting silently not saved or applied to the wrong user; a sensitive change without confirmation; sign-in breaks.
- Entry point: <settings page> and <settings endpoint> for the test account.
- Probes: change each setting, save, reload, sign out and in, then look for the effect elsewhere (language, time zone,
  currency, preferences); cancel really discards; empty, over-long and wrongly formatted values (use `.test` addresses);
  dependent toggles; defaults for a fresh account; two tabs; another role changing it by URL or API. Note each original
  value and restore it. Stop before steps that send real email.
- Expected: <valid ranges>; saved values survive reload and new sessions.
- Exit: every setting changed and restored; persistence and effect checked for each.

**5. Search, filter, sort and pagination**
- Goal: Explore finding <entity> by search, filters, sort and paging to find out whether results are complete, ordered and scoped.
- Risk: missing or extra results; unstable ordering across pages; another user's data in results.
- Entry point: <list page> and <search endpoint> with a few `QA-` records plus existing data.
- Probes: no results, one result, exact, partial, other letter case, accents, spaces; `% _ * "` and non-Latin text; very long query;
  each sort both ways with ties and empty values; filter combinations and clearing; first, last and out-of-range page;
  page-size extremes; page count versus total; results after create or delete; reload keeps state; data of other users absent.
- Expected: results match <rule>; the same order on every page; totals equal the sum of pages.
- Exit: every filter and sort used once; boundaries of paging tried; scoping checked as two roles.

**6. Admin versus client permissions**
- Goal: Explore the same operations as <admin>, <client A>, <client B> and anonymous to find out whether each role can do exactly
  what it should.
- Risk: a lower role reads or changes protected data; the UI hides it but the API allows it; admin changes do not show up.
- Entry point: a matrix of operation by role built from the spec, with records created by the run.
- Probes: per cell, try the UI path, the direct URL and the API with that role; swap ids between client A and B for read,
  update and delete; admin-only pages and endpoints as a client; list endpoints return only the caller's data; exports and
  reports; role changes take effect; start each role from a fresh browser profile.
- Expected: anonymous refused (401); wrong role or tenant refused (403 or 404); allowed roles succeed.
- Exit: every cell of the matrix tried or recorded as Not tested with its reason.

**7. File import and export**
- Goal: Explore importing and exporting <entity> data to find out whether content survives, bad files are refused clearly and
  exports respect filters and permissions.
- Risk: silent partial import; duplicates on re-import; corrupted non-Latin text; exported file shows data the user must not see.
- Entry point: <import page> with tiny `QA-` files (a few rows), and <export action>.
- Probes: smallest valid file; empty; header only; wrong extension; renamed content; just over the stated size limit (never
  huge); commas, quotes, newlines and non-Latin text in cells; cell values starting with `=`, `+`, `-` or `@` in an export
  (formula risk); duplicate rows; one invalid row among valid ones (all rejected or partly imported, and told?); same file
  twice; compare export with the screen (counts, decimals, dates, time zone, encoding); export under a filter and as a lower role.
- Expected: <format rules>; clear error for each bad file; no partial state without notice.
- Exit: each bad-file class tried; round trip (export, edit, import) checked; created records cleaned up.

**8. Notifications**
- Goal: Explore the events that notify users to find out whether the right person gets one correct notice, once.
- Risk: none, duplicate or misaddressed notices; wrong amounts or links; opt-out ignored.
- Entry point: <triggering action> and <in-app notification list or preferences>. Never send real email or SMS. Use a sandbox
  inbox only if configured. Otherwise check the visible side and list delivery under Not tested.
- Probes: trigger once and double submit (one notice, not two); recipient is the right user and role; content, names, amounts
  and links open the right record in the right environment; opt-out honoured; unread count and mark-as-read persist; times in
  the user's zone; notice for a record later deleted; link opened while signed out; RTL and non-Latin text.
- Expected: one notice per event for each intended recipient, with correct content.
- Exit: every event type triggered once; preferences, read state and links checked.

## Severity hints
- **critical**: a charter's risk comes true for money, permissions, data loss or exposure.
- **important**: the area works badly (wrong ordering, lost input with a workaround, misleading messages).
- **minor**: cosmetic or wording problems found along the way.
- A charter that ends with no findings is a valid result. Never invent findings to justify the effort.

## Safe on staging
- Create data only with the `QA-` prefix and clean up only what you created.
- Never trigger real payments, email, SMS or webhooks. Use a verified test mode or list the flow as Not tested.
- Keep login attempts to a handful, uploads small and floods tiny (two to five concurrent requests, never a load test).
- If a page shows what looks like real personal data, keep evidence minimal and describe it generically in the report.

## See also
`test-design.md`, `bug-reporting.md`, `permissions-and-data-isolation.md`, `forms.md`, `search-filter-pagination.md`,
`file-uploads.md`, `notifications-email.md`, `payments-and-money.md`.
