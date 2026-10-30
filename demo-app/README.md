# Lumen Supplies (demo app)

A small B2B ordering system used as the test fixture for QAMind. Clients place and track orders for their company;
admins manage orders and read reports and customer records. It has a REST API, an admin web UI and a client web UI.

It has no runtime dependencies: plain Node.js (version 20 or newer) and static HTML, CSS and JavaScript.

## Run it

```
cd demo-app
npm start
```

| What | URL | Port variable |
|------|-----|---------------|
| REST API | http://127.0.0.1:4100/api | `DEMO_API_PORT` |
| API description (OpenAPI 3) | http://127.0.0.1:4100/openapi.yaml | |
| Admin UI | http://127.0.0.1:4101/ | `DEMO_ADMIN_PORT` |
| Client UI | http://127.0.0.1:4102/ | `DEMO_CLIENT_PORT` |

Everything binds to `127.0.0.1` only. Data lives in memory and is seeded from `data/seed.json` at start-up.

### Optional settings

| Variable | Default | Meaning |
|----------|---------|---------|
| `DEMO_SESSION_TTL_SECONDS` | `900` | Lifetime of a sign-in token |
| `DEMO_SMTP_HOST` / `DEMO_SMTP_PORT` | `127.0.0.1` / `1025` | Where password-reset emails are sent |
| `DEMO_PUBLIC_CLIENT_URL` | `http://127.0.0.1:<client port>` | Base URL used in links inside emails |

### Email (optional)

Password-reset emails go to an SMTP server on `localhost:1025`. To read them, start Mailpit:

```
docker compose up -d      # SMTP on 1025, inbox at http://127.0.0.1:8025
```

If nothing is listening on the SMTP port, the app still answers normally and logs that the email was not delivered.

## Accounts

The passwords are fixtures for this demo, not real secrets. They are also in `.env.qa.fixture` using the variable
names `QA_<ROLE>_USER` and `QA_<ROLE>_PASS`.

| Role | Email | Password | Company |
|------|-------|----------|---------|
| Admin | admin@lumen.test | `Lumen-Admin-2026` | none (sees every company) |
| Client | a1@acme.test | `Acme-One-2026` | Acme Traders |
| Client | a2@acme.test | `Acme-Two-2026` | Acme Traders |
| Client | b1@bright.test | `Bright-One-2026` | Bright Foods |
| Client | z1@zain.test | `Zain-One-2026` | زین ٹریڈرز (Urdu name) |

Users from the same company share that company's orders. Different companies must never see each other's data.

## What is in it

**Pricing rule.** Subtotal is the sum of price x quantity. An order with a subtotal of 1000.00 or more gets a 5%
discount. Tax is 10% of the discounted subtotal. Total is subtotal minus discount plus tax. Amounts are integer cents.

**Order lifecycle.** `placed` → `processing` → `shipped` → `delivered`, or `cancelled` from `placed` or `processing`.
Admins change status; `delivered` and `cancelled` are final.

**Admin UI** (port 4101): sign in, orders list (search, status filter, pagination, CSV export), order detail with
status change, customers, sales report.

**Client UI** (port 4102): sign in, my orders, new order, order detail, forgot-password and reset-password pages.

**API** (port 4100): see `openapi.yaml` for every endpoint, role rule, status code and field limit. Sign in with
`POST /api/auth/login` and send the token as `Authorization: Bearer <token>`.

## Reset

```
npm run reset
```

Restores the seed data (orders, statuses, users and passwords) and signs everyone out on a running server by calling
a loopback-only control endpoint. If the server is not running it just says so; data is re-seeded at every start.

## Tests

```
npm test            # the app's own test suite (node:test), no network needed
```

The tests use random ports and do not need the server to be running.

## Fixture folders

- `qa-fixture/` holds the QAMind configuration used to test this app (added separately).
- `eval/` holds tooling for QAMind's own evaluation runs. It is not part of the app.
