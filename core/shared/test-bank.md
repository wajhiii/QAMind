# The test bank, bugs across runs, and what people said

Read this when `memory_get_context` shows `bank.active` above 0 or open `bugs`, and again at the end of a run when you save checks.

## What the bank is

Checks that earlier runs found worth keeping, saved as tests QAMind runs itself at the start of every run (`{{CLI}} tests run --run <id>`): fast and cheap, before you spend time exploring.
A test is **data, not code**: an API test is a plan (requests, and what each must answer); a UI test is a short list of steps. You never write scripts for the bank. A person can export a test as a real Playwright test later (`{{CMD_QA_TESTS}} export`).

## Running it (Step 2)

`{{CLI}} tests run --run <id>` runs every active test once. A failure is run again straight away; a pass on the second try is **flaky** (counted as a pass, and after a few of those the test is set aside as quarantined and not run until the owner releases it).
A test that **fails twice** is a lead you must settle before the run can finish (`report lint` refuses otherwise; a test for a bug the owner accepted or called not-a-bug is expected to fail and does not stop the run):
1. Reproduce it yourself, twice, as you would any finding. If it is real, report it as a finding and name the test: `"bank_tests": ["T-004"]`. If the test protects a bug (`bug` in the output), the finding is that bug coming back.
2. If you cannot reproduce it, or the product changed on purpose and the test is out of date, list it under Unconfirmed with the same `"bank_tests"` field and say why. You cannot retire a test: the owner does (`{{CMD_QA_TESTS}}`).
A test whose request got no answer at all is **skipped** with the reason, never passed or failed (the environment stopped answering: run `health` again before you conclude anything). `covered_areas` are the areas where saved tests passed. Do not repeat those by hand: put your time into what is new, changed or risky, and into what the bank does not cover.

## Bugs across runs

`memory_get_context` lists `bugs.open` (a bug that **came back** is first), `bugs.fixed_recently`, `bugs.accepted` and `bugs.not_a_bug`.
- Tie a finding to a known bug with `"bug": "BUG-003"` in `findings.json`. If it is a different problem that merely reads alike, write `"bug": "new"`. Leave `bug` out when nothing resembles it: QAMind matches by fingerprint. If a finding resembles a known bug without clearly being it, `report lint` asks you to say which.
- Do not report a bug the owner **accepted** (`bugs.accepted`) or said is **not a bug**: accepted ones are listed as known by themselves; a not-a-bug is refused by lint.
- A bug is **fixed** only when you looked: repeat its first steps. If it no longer happens, write `<run.dir>/data/rechecks.json`:
  `[{ "bug": "BUG-001", "result": "passes", "how": "Signed in as a customer of company B and opened the order of company A by its number; the page said it is not available." }]`.
  A bank test that protects the bug and passes counts as the same proof, without a line from you. A bug you neither found nor re-checked stays open and is reported as "not looked at again". Never write "fixed" from memory.
- Severities a person changed show in the reports as they set them; do not argue in `findings.json`.

## Saving a check (the last step of a run, after the findings are written)

Save at most about six: for every finding you reproduced twice a test that fails while it exists and passes once it is fixed (set `from_issue` to the finding's id, and QAMind ties the test to the bug when the run finishes), and one or two smoke checks of a critical flow that worked.
Write each as JSON in `<run.dir>/data/bank/<name>.json` and call `bank_save_test` with the run and the file name. **`run_finish` will not finish a manual run that has critical or important findings and saved no test** (auto-QA and CI runs, runs whose time ran out and runs stopped by a broken environment are not asked). If none of the findings can be written as an API or UI test (a slow screen, a visual problem), write `<run.dir>/data/bank-skip.json` as `{ "reason": "a real sentence" }`; the reason is kept and shown in the report. Extend rather than duplicate: if the answer is `duplicate`, save again with `"extends": "T-004"` and the combined requests or steps.

Every test needs a **value card**, three real sentences:
- `protects`: what it protects (the behaviour or the risk);
- `fails_when`: what has to be wrong for it to fail;
- `not_duplicate`: why it is not a copy of a test already in the bank.

### An API test

```json
{
  "kind": "api",
  "title": "The orders list answers a page size of zero with a 400",
  "area": "Orders",
  "card": { "protects": "The orders list validates its page size instead of failing.", "fails_when": "A page size of 0 gets anything but a 4xx answer, such as a server error.", "not_duplicate": "No other test sends page_size to the orders list." },
  "from_issue": "ISSUE-003",
  "plan": { "version": 1, "name": "orders-page-size", "probes": [
    { "id": "P1", "title": "page_size=0", "method": "GET", "path": "/orders", "query": { "page_size": 0 }, "role": "admin", "expect": { "status": "4xx" } }
  ] }
}
```
Every request needs `expect.status` (a number, a class like `"4xx"`, or a list), or it could never fail; add `expect.json` checks (`path`, `equals`, `exists`, `lte`, `gte`, `matches`) and `body_contains` / `body_not_contains` where the answer matters. `role` is a config role or `"anonymous"`; paths are relative to the API base and start with `/`; never put an Authorization header or a cookie in a test (the runner signs the role in itself).
Requests that create data carry the test prefix (`QA-`) in their bodies. At most 8 requests and no secrets or personal data in a test.

### A UI test

```json
{
  "kind": "ui",
  "title": "A client signs in and sees their orders",
  "area": "Client Portal / My orders",
  "ui": "Client Portal",
  "card": { "protects": "...", "fails_when": "...", "not_duplicate": "..." },
  "steps": [
    { "do": "goto", "path": "/login.html" },
    { "do": "fill", "target": { "label": "Email" }, "secret": "QA_CLIENT_A_EMAIL" },
    { "do": "fill", "target": { "label": "Password" }, "secret": "QA_CLIENT_A_PASS" },
    { "do": "click", "target": { "role": "button", "name": "Sign in" } },
    { "do": "expect_text", "text": "My orders" }
  ]
}
```
Steps (`do`): `goto` (a path on the web UI), `click`, `fill` (`value` for test data, or `secret` naming one of the config's login variables, never a value), `select`, `press`, `wait` (at most 3000 ms), and the checks `expect_text`, `expect_no_text`, `expect_visible`, `expect_url`, `expect_count`. A `target` is one of `{ "role": "button", "name": "Save" }`, `{ "label": "..." }`, `{ "text": "..." }`, `{ "testid": "..." }` or `{ "selector": "css" }`. End with at least one check. `ui` is a web UI name from the config.

## What the owner can do about it

`{{CMD_QA_FEEDBACK}}` gives verdicts on findings (not a bug, wrong severity, duplicate, confirmed, fixed, won't fix, good catch); `{{CMD_QA_TESTS}}` shows, runs, exports and retires tests. A run can do none of that: it proposes in the report.
