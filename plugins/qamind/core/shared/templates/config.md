---
# QAMind project configuration. Fill in every REPLACE_ME, then run QA again.
# This file stays on your machine (.qa/ is git-ignored). Never put passwords here:
# passwords and logins go in .env.qa and are referenced below by variable NAME.
schema_version: 1

environment:
  name: staging                   # a label for reports, e.g. staging, qa, local
  # QAMind refuses any URL that does not look like a test environment (staging, dev, qa,
  # localhost, ...). If your test site has an ordinary-looking name, confirm it is NOT
  # production and set this to true.
  confirmed_non_production: false

# Every web interface to test (add or remove entries; 0 or more).
web_uis:
  - name: Admin Portal
    url: REPLACE_ME               # e.g. https://admin.staging.example.com
  - name: Client Portal
    url: REPLACE_ME               # e.g. https://app.staging.example.com

api:
  base_url: REPLACE_ME            # e.g. https://api.staging.example.com  (or "none" if there is no API)
  openapi: REPLACE_ME             # file path in this project, a URL, or "none" (routes are then read from the source code). In a folder that holds several repositories: the path from here, e.g. backend/openapi.yaml
  # How the test runner signs in over the API (credentials come from the roles table below).
  login:
    path: /api/auth/login
    method: POST
    username_field: email
    password_field: password
    token_path: token             # where the token is in the JSON response; use "cookie" if the API sets a session cookie
    auth_header: "Authorization: Bearer {token}"

security:
  # Addresses that must NEVER be tested (your real production site). Host names or host/path,
  # "*" is a wildcard: www.example.com, app.example.com, "*.example.com/live/*".
  blocked_production_patterns:
    - REPLACE_ME
  # Extra addresses a test page may load assets from (CDN, fonts, login provider). Everything else is blocked.
  allowed_extra_origins: []
  # Only if a host looks like production by name but is NOT (e.g. "prod-mirror.test.example.com").
  not_production_hosts: []

# Everything QAMind creates is named with this prefix, and only things it created are cleaned up.
test_data_prefix: QA-

# Test accounts. Put the actual values in .env.qa (see .env.qa.example).
# Use at least two client accounts from different customers so data-isolation can be checked.
roles:
  - name: admin
    ui: Admin Portal              # one of the web_uis names, or "api"
    username_env: QA_ADMIN_USERNAME
    password_env: QA_ADMIN_PASSWORD
  - name: client-a
    ui: Client Portal
    tenant: Customer A            # which customer this account belongs to
    username_env: QA_CLIENT_A_USERNAME
    password_env: QA_CLIENT_A_PASSWORD
  - name: client-b
    ui: Client Portal
    tenant: Customer B
    username_env: QA_CLIENT_B_USERNAME
    password_env: QA_CLIENT_B_PASSWORD

# What /qa (fix mode) may do. Minor problems are always only reported. Everything except fix_severities is optional.
fix_policy:
  fix_severities: [critical, important]
  # max_fixes: 30                 # hard cap on fixes in one run
  # test_command: npm test        # the whole test suite (default: detected from your package scripts or build files)
  # test_file_command: "npx jest {file}"   # one test file; {file} is where the path goes (default: the standard command for your test runner)
  # test_timeout_s: 300           # seconds one test command may run before it is stopped
  # Files a fix must never edit. Credentials, CI and deployment files, lock files, dependency manifests, generated code and migrations are
  # always off limits; add your own here (globs relative to the project, e.g. "src/billing/**").
  do_not_touch: []

# Extra addresses (beyond each web UI and the API) that must respond before testing starts, e.g. "/healthz".
health:
  checks: []

# Test data (optional). Each command runs on this machine, in this project folder, only against the environment above, and never when it mentions an address
# listed under blocked_production_patterns. Output is saved masked in the run's folder.
# setup:
#   run_before: never             # never (default), full_runs (before full runs only) or always
#   reset_command: npm run reset  # puts the test environment back to a known state
#   seed_command: npm run seed    # puts the test data in place (runs after the reset)
#   snapshot_command: ./scripts/db-snapshot.sh   # optional: a snapshot before testing ...
#   restore_command: ./scripts/db-restore.sh     # ... and its restore when the run ends (both or neither)
#   timeout_s: 120

# Time budget (optional). When it is used up QAMind stops exploring, finishes the report and lists what it did not get to as "time budget reached".
# budget:
#   time_minutes: 30              # default for every mode (leave out for no limit)
#   max_cost: 10                  # told to the agent and recorded; QAMind cannot see a host's spending, so it cannot enforce it
#   daily_max: 120                # minutes of auto-QA and CI per day; after that auto-QA pauses itself for the day and says so once
#   modes:                        # limits for one mode override the defaults above: diff, quick, regression, full, ticket, ci, auto
#     quick: { time_minutes: 10 }
#     auto: { time_minutes: 5 }

# Private data (optional). Emails, phone numbers, ID and card numbers are always masked; test accounts and test-reserved addresses (example.com, .test) stay readable.
# privacy:
#   mask_patterns: ["ORD-\\d{6}"]      # more things that must never be saved (regular expressions)
#   mask_selectors: [".customer-address", "[data-private]"]   # screen elements blurred before screenshots
#   mask_fields: [name, address]    # fields whose values are masked in saved API evidence

# Other browsers and screen sizes (optional). A run covers: diff one browser at one size, quick adds the mobile size, full every browser and size listed here.
# A browser that is not installed is reported as Not tested (the owner installs one with: qamind browsers install webkit).
# browsers: [chromium, webkit]    # chromium (default), firefox, webkit
# viewports:                      # default: desktop 1366x768 and mobile 390x844
#   - { name: desktop, width: 1366, height: 768 }
#   - { name: mobile, width: 390, height: 844 }
#   - { name: tablet, width: 768, height: 1024 }

# How a screen looks over time (optional). Baselines are accepted by the owner after a good run: /qa-tests baseline accept
# visual:
#   threshold: 0.2                          # percent of a page's pixels that may differ before it is reported
#   ignore_selectors: [".avatar", "[data-dynamic]"]   # parts that change by themselves (dates, ads), hidden before each screenshot

# Speed (optional). A few measurements, not a load test.
# performance:
#   page_load_ms: 3000               # a page is slow above this until it is ready for a person
#   api_p95_ms: 800                  # an endpoint is slow when the slowest of a few calls is above this
#   regression_pct: 30               # slower than the recent runs by more than this is reported even when under budget
#   pages: { "/reports.html": 6000 }                  # own budgets
#   endpoints: { "GET /admin/reports/sales": 5000 }

# Emails and texts the product sends (optional). A sandbox that catches them, so nothing reaches a real address. Without one, those flows are Not tested.
# mail:
#   catcher: mailpit               # mailpit | mailhog | mailtrap | the address of a custom JSON API
#   url: http://127.0.0.1:8025     # (mailtrap: token_env: MAILTRAP_API_TOKEN, account_id, inbox_id instead)
#   timeout_s: 30
# sms:
#   catcher: https://sms-sandbox.example.test/api/messages   # a test endpoint that lists the messages it received

# The release verdict on the first line of the admin report (optional). The defaults are shown. The rules are frozen into each run when it starts.
# A key journey that was not tested can never be "Ready", and a broken test environment is always "Not ready": no rule changes that.
# release:
#   rules:
#     max_critical: 0              # more open critical problems than this is a violation
#     max_important: 2             # more open important problems than this is a violation
#     # max_minor: 20              # optional: more open minor problems than this is a violation (no limit by default)
#     allow_regressed: false       # false: a problem that came back after being fixed keeps the verdict from being "Ready"
#     not_ready_when: [critical]   # violations of these mean "Not ready"; any other violation means "Ready with risks". Also: important, minor, regressed, flows-untested

# Linear and Sentry (optional). QAMind keeps no token for either: it uses the tool your coding tool has connected, and does nothing when there is none.
# Tickets: one per Critical or Important bug that is not fixed and checked, after the person agrees once; a bug that has an open ticket gets a comment instead of another ticket.
# Sentry: a run reads the errors of the TEST environments while it lasted and ties them to its findings (read only). Production names go under production_environments: only
# the owner's escaped-bug check (/qa-memory-review escaped) reads those, and never inside a run.
# integrations:
#   linear:
#     team: ENG                    # the team (key or name) tickets go in
#     # project: Release QA        # optional
#     # labels: [qamind]           # put on every ticket QAMind makes (labels that do not exist are left off)
#     # create: ask                # ask (once per run) or never (only link and comment on tickets that already exist)
#     # not_a_bug: [not a bug, invalid, cannot reproduce]    # ticket labels or states that mean "not a bug" (feedback, with the person's name)
#     # wont_fix: [won't fix, won't do]                      # ... and "we will not fix this"
#     # escaped_label: escaped     # the label for bugs that reached production
#   sentry:
#     # organization: acme
#     projects: [acme-api]
#     environments: [staging]      # the test system's environments; never a name that looks like production
#     # production_environments: [production]   # read only by the owner's escaped-bug check
#     # window_margin_minutes: 2   # minutes before and after the run that still count

# CI / pull-request mode (optional): `qamind ci` tests a pull request, report-only, and posts one comment that it updates on every push.
# ci:
#   fail_on: [critical, environment-problem]   # any of these fails the run (exit code 1, failing status). Also: important, minor, came-back, bank-failure, not-ready
#   warn_on: [important]                       # any of these is a warning: passing status, noted in the comment
#   mode: diff                                 # diff (default), quick, regression or full
#   cache_memory: false                        # true: keep a CI-only memory store in the CI's cache, keyed by repository and branch
#   comment: true                              # post and update one pull request comment
#   status: true                               # set a commit status
#   timeout_minutes: 25                        # the agent is stopped after this long, whatever the time budget says
---

# Critical flows
<!-- The journeys that must always work, in order, in plain language. QAMind tests these first. -->
1. REPLACE_ME (e.g. "A client logs in, places an order, and sees it in their order list")

# Business rules
<!-- Expected results in plain language. Each rule is checked explicitly. -->
- REPLACE_ME (e.g. "Orders of 1,000.00 or more get a 5% discount")

# Do not touch
<!-- /qa (fix mode) must never edit these files or modules, and nobody must trigger these real-world effects. -->
- Files and modules: none listed
- Never trigger: real payments, real emails or SMS to real people

# Known issues to skip
<!-- Problems you already know about, with a ticket link. QAMind will not report them again. -->
- none
