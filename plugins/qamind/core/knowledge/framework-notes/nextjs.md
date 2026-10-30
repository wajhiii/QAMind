# Next.js: notes for QA

Load this when `next` is a dependency. Next.js mixes browser code, server rendering and backend endpoints in one
project, so a single file can hide a missing authorization check or a stale cache. Also load `react.md` for the
component-level patterns.

## Detect it
- `package.json` dependency `next`; read the exact version from `node_modules/next/package.json`, because file
  conventions changed: the `middleware.ts` file was renamed `proxy.ts` in version 16, and newer apps may enable Cache
  Components (`cacheComponents: true` in the config).
- Config file `next.config.js`, `.mjs` or `.ts`; build output folder `.next/`; `next-env.d.ts`.
- Router flavour: an `app/` folder (App Router, also under `src/`) or a `pages/` folder (Pages Router). Both can exist
  in one project.
- Directives at the top of files: `'use client'`, `'use server'`, `'use cache'`.

## Where to look in the source
- App Router: `app/**/page.tsx` (pages), `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, and
  `app/**/route.ts` (HTTP endpoints exporting `GET`, `POST`, and so on). Folders in brackets (`[id]`, `[...slug]`) are
  user-controlled input; `(group)` folders do not appear in the URL.
- Pages Router: `pages/*.tsx` for pages, `pages/api/**` for endpoints, data loaders `getServerSideProps` and
  `getStaticProps`.
- Server Actions: `grep -rnE "['\"]use server['\"]" app src lib actions`. Each exported function is an endpoint that
  can be called by a direct POST, whether or not any page uses it.
- Endpoint inventory: `find . -name route.ts -not -path "./node_modules/*"` plus
  `grep -rnE "export (async )?function (GET|POST|PUT|PATCH|DELETE)" app`.
- Proxy or middleware: `proxy.ts` / `middleware.ts` at the project root or in `src/`, with an exported
  `config.matcher`. Read what the matcher excludes.
- Auth and data layer: `grep -rnE "auth\(\)|getServerSession|getSession|cookies\(\)|headers\(\)" app src lib`. Some
  projects keep a data access layer (`data/`, `lib/dal`, files importing `server-only`) that checks permission and
  returns trimmed objects; others query the database inside components.
- Caching:
  `grep -rnE "use cache|cacheLife|cacheTag|revalidate|revalidatePath|revalidateTag|unstable_cache|force-dynamic|no-store" app src lib`.
- Environment variables: `grep -rn "NEXT_PUBLIC_" .` and every `.env*` file. Anything with that prefix is shipped to
  the browser.

## Run it and its tests
- `npm run dev` (port 3000) for development. For anything about caching, static rendering or performance, run
  `npm run build` then `npm run start` as well: dev mode behaves differently. The build summary shows which routes are
  static and which are dynamic.
- Test tooling named by the framework: Jest, Vitest, Playwright, Cypress. Asynchronous Server Components are poorly
  supported by unit-test tools, so cover them with end-to-end tests. Find the setup in `jest.config.*`,
  `vitest.config.*`, `playwright.config.*`, or `cypress.config.*`.
- Single test: `npx vitest run path -t "name"`, `npx jest path -t "name"`, `npx playwright test path -g "name"`.
- Regression test in the project's style: UI and cache bugs go in the Playwright or Cypress folder (`e2e/`, `tests/`)
  following an existing spec's login helper; route handlers can be tested by calling the exported function with a
  standard `Request` object or by requesting the running server; the proxy has experimental unit helpers
  (`next/experimental/testing/server`) that check whether a URL is matched.
- Database: follow the ORM the project uses (Prisma, Drizzle, TypeORM). Confirm the test or dev connection string is a
  local or disposable database before running any test or seed script.

## Common bug patterns
- Missing auth on server endpoints: a page redirects anonymous users, but the matching `route.ts`, `pages/api` handler
  or Server Action does not check the session. A page-level check does not protect actions defined inside that page.
  Call each one directly as anonymous and as a lower role.
- Authentication without authorization: the action checks "is signed in" but not "owns this record". Change the id
  (argument, hidden form field, route parameter) to one belonging to another user, then compare. See
  `permissions-and-data-isolation.md`.
- Proxy gaps: a matcher that skips `/api`, static-looking paths or a Server Action's route leaves those unprotected;
  with no matcher, the proxy also runs on static assets and can block CSS and images. Request a sample of protected
  and unprotected paths without a session.
- Server Action input: arguments arrive as strings or loose objects. Send empty, oversized, wrong-type and extra
  fields. Thrown errors produce a generic failure for the user; check that returned errors are shown. Return values
  are sent to the client, so a whole database row returned from an action leaks internal fields.
- Props over-exposure: a Server Component passing a full database record to a Client Component puts every field in the
  page source and RSC payload. Compare displayed fields with what the page source or network response contains. Record
  only field names as evidence.
- Environment exposure: a secret behind a `NEXT_PUBLIC_` name, or a server variable read in a client file, ends up in
  the browser bundle. Check the browser's loaded scripts for secret-looking values and report names, not values.
- Stale data after a mutation: a list or detail page still shows old values after an action succeeded. Check that the
  action calls `revalidatePath` or `revalidateTag`, or that the data is not cached. Also test client-side navigation:
  the browser keeps prefetched and cached pages for a freshness window, so Back or a link click can show older data
  than a hard reload.
- Per-user data in a shared cache: a cached function or page that reads cookies, headers or the session inside a
  shared cache can serve one user's content to another. Load the same URL in two fresh sessions with different roles
  and compare. Treat any cross-user content as critical.
- Cached route handlers: under Cache Components, `GET` handlers are prerendered like pages, so an endpoint returning
  live data can return an old response. Check response headers and whether repeated GETs change after a write.
- Hydration mismatch: console warnings plus flicker. Typical causes are time or locale formatting, `Math.random`,
  `window` or `localStorage` read during render.
- Dynamic params: non-numeric or oversized `[id]` values should give 404 or 400, not a 500; check `notFound()` use.
  Calls to `redirect()` or `notFound()` inside a `try/catch` are swallowed because they work by throwing.
- Double submit on forms driven by actions: without a pending state, double click sends the action twice; confirm with
  the API runner's `repeat` option when the action is reachable.

## Environment gotchas
- Stale build: if live behaviour contradicts the source, suspect an old `.next` build or an old deployment. Rebuild
  instead of reasoning from old output.
- Server Action identifiers belong to one build. A tab opened before a redeploy may fail on submit; reload before
  judging. Self-hosted setups with several instances need a shared encryption key setting or actions fail across
  instances.
- In-memory caches are per instance and reset on every deploy, so results can differ between requests when several
  instances run.
- Which `.env*` file loads depends on the mode (`dev`, `build`, `start`); a variable fixed at build time does not
  change after editing the file without rebuilding.
- If a CDN fronts the environment, prerendered pages cached there can outlive a deploy or a data change; compare with
  a request that bypasses it when you can.

## See also
`react.md`, `api-testing.md`, `permissions-and-data-isolation.md`, `auth-and-sessions.md`, `forms.md`, `security-checks.md`.
