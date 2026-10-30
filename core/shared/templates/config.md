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

# Which problem levels /qa (fix mode) may fix. Minor problems are always only reported.
fix_policy:
  fix_severities: [critical, important]

# Extra addresses (beyond each web UI and the API) that must respond before testing starts, e.g. "/healthz".
health:
  checks: []
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
