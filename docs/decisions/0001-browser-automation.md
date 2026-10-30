# 0001: Browser automation approach

Status: accepted (Phase 1). Date: 2026-10-30.

## Decision

Use **Playwright MCP** (`@playwright/mcp`, pinned to 0.0.83) as the browser tool on every host, but never start it
directly. QAMind starts it through its own launcher (`qamind browser-mcp`), which adds two things the stock server
does not provide:

1. **A fail-closed guard proxy** in front of the browser. Every request, redirect hop, sub-resource and WebSocket
   goes through it; only origins in the active run's config are reachable, a blocked production pattern always wins,
   and with no active run nothing is reachable.
2. **A safe secrets file.** Test credentials are handed to the browser tool as `--secrets`, so the model types the
   variable *name* (for example `QA_CLIENT_A_PASSWORD`) and the tool substitutes the value and returns only
   `<secret>NAME</secret>`. The launcher also keeps the server from crashing when a project has no `.env.qa`.

An own Playwright runner is **not** built in Phase 1. It is still needed later, for replaying the saved test bank and
for CI (Phase 7.7 / 7.8), and it will reuse the same guard.

## What I measured (against a stand-in target with an "app" origin, a "production" origin and a redirect between them)

| Check | Playwright MCP, stock | Own runner (`context.route`) | MCP + QAMind guard proxy |
|---|---|---|---|
| Direct navigation to a non-allowed origin | blocked (`--allowed-origins`) | blockable | **blocked** |
| Redirect from an allowed origin to a non-allowed one | **reached the "production" server** | **reached it** (route handler never sees the hop) | **blocked, zero hits** |
| Credentials kept out of the model's context | yes (`--secrets`: typed value reached the page, output shows `<secret>NAME</secret>`) | possible in-process | yes |
| Missing `--secrets` file | server **crashes at launch** | n/a | launcher writes an empty file |
| Interactive exploration (snapshot, refs) | native | would need a session daemon | native |
| Loopback targets (the demo app) | works | works | **works** (Playwright forces loopback through the proxy) |

The Playwright MCP help text says as much about its own filter: origin allow/block lists are not a security boundary
and do not affect redirects. That matches what I saw.

## Why not the alternatives

- **Stock Playwright MCP alone:** fails the non-negotiable "never test production" rule on redirects, and crashes when
  `.env.qa` is absent.
- **Own runner only:** a lot to build and ship (browser session handling, snapshots, element refs, dependency delivery to
  every host) for no benefit in Phase 1, and `route()`-based blocking has the same redirect hole, so it needs the same
  proxy or `route.fetch({ maxRedirects: 0 })` machinery anyway.
- **Hooks only:** a host-specific hook sees the URL of a navigate call, not redirects or sub-resources, and other hosts may
  have no hooks.

## Trade-offs and known limits

- **Credentials are loaded when the browser tool starts.** If `.env.qa` is created after the session began (a first run),
  the browser tool must be restarted. `run start` detects this (`browser.status`) and tells the user.
- **Needs a browser:** system Chrome or Edge is used when present; otherwise Playwright's Chromium must be installed
  (`npx playwright-core install chromium`). WebKit/Firefox come with Phase 7.9 (`--browser`).
- **HTTPS is filtered by origin** (host and port), not path: the proxy sees the CONNECT target only. Path-level blocked
  patterns therefore apply to plain-HTTP traffic and to API calls made by the runner; for HTTPS pages use host patterns.
- **Third-party assets** (CDN, fonts, login providers) are blocked unless listed in `security.allowed_extra_origins`.
  Blocked traffic is logged per run (`qamind guard log`) so the report can explain broken pages.
- **Browser-internal traffic** (update checks, safe-browsing) is blocked and not logged.
- **`browser_run_code_unsafe` is denied** on Claude Code by the safety hook because it runs inside the process that holds
  the credentials. On hosts without hooks this is an instruction only (documented in `docs/HOSTS.md`).
- Screenshot masking of personal data (spec §13.8) is not part of Phase 1; see the Phase 7.6 plan.
- The browser tool's version is pinned in `hosts/claude/package.json`, the lockfile, and the launcher
  (`PLAYWRIGHT_MCP_VERSION`); update all three together.
