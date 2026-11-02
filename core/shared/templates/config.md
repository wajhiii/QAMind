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
  openapi: REPLACE_ME             # file path in this project, a URL, or "none" (routes are then read from the source code)
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
