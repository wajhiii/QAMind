---
# QAMind configuration for the Lumen Supplies demo app (used by QAMind's own acceptance and evaluation runs).
# Credentials come from .env.qa, copied from ../.env.qa.fixture (fixture values, not real secrets).
schema_version: 1

environment:
  name: local demo
  confirmed_non_production: false

web_uis:
  - name: Admin Portal
    url: http://127.0.0.1:4101
  - name: Client Portal
    url: http://127.0.0.1:4102

api:
  base_url: http://127.0.0.1:4100/api
  openapi: openapi.yaml
  login:
    path: /auth/login
    method: POST
    username_field: email
    password_field: password
    token_path: token
    auth_header: "Authorization: Bearer {token}"

security:
  blocked_production_patterns:
    - lumen-supplies.example.com
    - "*.lumen-supplies.example.com"
  allowed_extra_origins: []
  not_production_hosts: []

test_data_prefix: QA-

roles:
  - name: admin
    ui: Admin Portal
    username_env: QA_ADMIN_USER
    password_env: QA_ADMIN_PASS
  - name: acme-1
    ui: Client Portal
    tenant: Acme Traders
    username_env: QA_ACME1_USER
    password_env: QA_ACME1_PASS
  - name: acme-2
    ui: Client Portal
    tenant: Acme Traders
    username_env: QA_ACME2_USER
    password_env: QA_ACME2_PASS
  - name: bright-1
    ui: Client Portal
    tenant: Bright Foods
    username_env: QA_BRIGHT1_USER
    password_env: QA_BRIGHT1_PASS
  - name: zain-1
    ui: Client Portal
    tenant: Zain Traders (Urdu)
    username_env: QA_ZAIN1_USER
    password_env: QA_ZAIN1_PASS

fix_policy:
  fix_severities: [critical, important]

health:
  checks: [/health]
---

# Critical flows
1. A client signs in to the Client Portal, places an order (picks products and quantities, enters a reference), sees the confirmation with the total, and finds the order in My Orders.
2. An admin signs in to the Admin Portal, finds that order in the Orders list, opens it and moves its status forward (placed, processing, shipped).
3. The client reloads My Orders and the order detail and sees the new status.
4. An admin opens Reports and sees the sales summary.
5. A user signs out and can no longer use the session.

# Business rules
- Subtotal is the sum of unit price × quantity for every line.
- An order with a subtotal of 1,000.00 or more gets a 5% discount on the subtotal.
- Tax is 10%, applied to the discounted subtotal. Total = subtotal − discount + tax, rounded to the cent.
- Quantity must be a whole number from 1 to 1,000, and an order needs at least one item.
- A client sees only their own company's orders; users of the same company share orders; different companies never see each other's data.
- Only admins can see customers and reports or change an order's status.
- Order status moves placed → processing → shipped → delivered (or cancelled).
- Signing out ends the session at once; an expired session cannot be used.

# Do not touch
- Files and modules: none listed
- Never trigger: real payments, real emails or SMS to real people (the demo sends only to a local mail catcher)

# Known issues to skip
- none
