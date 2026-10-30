# Express: notes for QA

Load this when `package.json` depends on `express` (also covers apps built on top of it, such as NestJS with the
Express adapter, though Nest has its own guard and decorator conventions). Express has no built-in authorization,
validation or schema: every protection is a middleware someone had to add in the right order, so reading the app file
is the fastest way to find gaps.

## Detect it
- `package.json` dependency `express`; `scripts.start` or `main` pointing at `server.js`, `app.js`, `index.js`,
  `src/server.ts` or `dist/...`.
- Version matters: Express 5 forwards rejected promises from async handlers to the error handler; Express 4 does not,
  so async handlers need a wrapper or `try/catch` with `next(err)`. Check `node_modules/express/package.json`.
- Supporting packages that show intent: `helmet`, `cors`, `cookie-parser`, `express-session` or `cookie-session`,
  `passport`, `jsonwebtoken`, `express-jwt`, `express-validator`, `joi`, `zod`, `express-rate-limit`, `multer`
  (uploads), `morgan` (logs), `mongoose`, `sequelize`, `prisma`, `knex`, `pg`.
- Frameworks wrapping it: NestJS (`@nestjs/platform-express`), LoopBack, Feathers, Strapi.

## Where to look in the source
- Entry file: `const app = express()`, then the order of `app.use(...)` calls. Order is behaviour: anything registered
  before an auth middleware is public, and anything after the error handler is not covered by it.
- Routes: `grep -rnE "(app|router)\.(get|post|put|patch|delete|all|use)\(" src routes server.js app.js`; mounted
  routers (`app.use('/api/orders', ordersRouter)`) combine prefixes, so build the full path by hand. Folders commonly
  named `routes/`, `controllers/`, `handlers/`, `api/`.
- Auth middleware:
  `grep -rnE "authenticate|requireAuth|isAuthenticated|verifyToken|jwt\.verify|passport\.authenticate|ensureLoggedIn|checkRole" src`.
  For each route list: is the middleware applied on the router, on the route, or not at all? A router mounted before
  `app.use(auth)` is unprotected. Role checks are often only on some verbs of the same path.
- Ownership checks: handlers using `req.params.id` straight in a query (`findById(req.params.id)`,
  `WHERE id = ${...}`) without also constraining by `req.user.id` or tenant are isolation bugs.
- Validation: `express-validator`, `Joi`, `Zod` schemas, or none at all. Look for `req.body` passed whole into
  `create()`/`update()` (mass assignment) and for `req.query` values used as numbers or regular expressions without
  checks.
- Body parsing: `express.json()`, `express.urlencoded()`, `bodyParser`; note the `limit` options, and whether `multer`
  bounds file size and type.
- Error handling: a four-argument middleware `(err, req, res, next)` registered last; a catch-all 404 handler;
  uncaught-exception and unhandled-rejection handlers in the entry file.
- CORS and cookies: `cors({ origin: ... })` (an echoing origin or `true` with `credentials: true` is risky),
  `app.set('trust proxy', ...)`, session cookie options (`secure`, `httpOnly`, `sameSite`),
  `app.disable('x-powered-by')`, `helmet()`.
- Config: `.env`, `config/`, `process.env.NODE_ENV`; swagger or OpenAPI files (`swagger.json`, `openapi.yaml`) for the
  declared contract.

## Run it and its tests
- `npm install`, then `npm start` or `npm run dev` (nodemon or `node --watch`). The default port is whatever
  `app.listen(...)` or `PORT` says; 3000 is common, 8080 also. Set `NODE_ENV=production` for the realistic
  error-handling behaviour; with it unset, the built-in error handler returns stack traces.
- Tests: Jest, Mocha with Chai, Vitest or Node's built-in runner (`node --test`), almost always with `supertest`
  hitting the exported `app` without a listening port. Files named `*.test.js` / `*.spec.ts` in `test/`, `tests/`,
  `__tests__/` or beside source. Single test: `npx jest path -t "name"`, `npx mocha path --grep "name"`,
  `npx vitest run path -t "name"`.
- Regression test in the project's style: import the app (the project must export it separately from `listen`,
  otherwise follow what existing tests do), create data through the same helper or factory other tests use, issue the
  request with `supertest` (`request(app).post('/path').set(auth).send(body)`), assert on status, body shape and,
  where possible, the stored data. Cross-user check: record from user A fetched with user B's token expects 403 or
  404. Run it against a test database or an in-memory store; look at `NODE_ENV=test` handling in the config before
  running anything.
- Databases: check which connection string tests use and whether a migration or seed script runs on start; never let
  tests or seeds point at shared data.

## Common bug patterns
- Middleware order: auth registered after the route, or on one router and not another; static folders
  (`express.static`) serving files that should be protected; `app.use('/admin', auth)` guarding the path prefix while
  a differently cased or trailing-slash variant is served by another route. Probe every route anonymously and with
  each role. See `permissions-and-data-isolation.md`.
- Async errors that hang or crash: in Express 4 a rejected promise in an async handler never reaches the error
  handler, so the request hangs until timeout or the process crashes on an unhandled rejection. Symptom: a request
  that never answers after bad input (non-existent id, malformed value). Throws inside callbacks or timers behave the
  same in every version unless wrapped in `try/catch` with `next(err)`.
- Error handler that does not answer: custom error middleware that logs but never sends a response or calls
  `next(err)` makes requests hang; one that returns `err.message` or `err.stack` leaks internals. Trigger a controlled
  error (invalid id format, malformed JSON) and read the body. The built-in handler hides stacks only when
  `NODE_ENV=production`.
- Wrong status codes: invalid input giving 500 (unvalidated cast, `null` property access), unknown route giving 200
  with HTML, or authorization failure returned as 200 with an error body. Walk invalid ids, wrong types and empty
  bodies through every route.
- Body parser limits: JSON bodies over the default 100 kilobytes are rejected with 413; check the product gives a
  clear error. Malformed JSON yields 400. Missing or wrong `Content-Type` can leave `req.body` empty or undefined and
  produce a 500 from code that assumes an object. Test empty body, wrong content type and arrays where objects are
  expected, and at most one body just over the limit, sent once; never large or repeated payloads.
- Mass assignment and operator injection: `Model.create(req.body)` or `Object.assign(doc, req.body)` lets a client set
  `role`, `isAdmin`, `userId`, `price`. With MongoDB drivers, an object where a string is expected (`{"$ne": null}`)
  can bypass lookups. Use only test-prefixed records and read values back.
- Regular expressions and SQL built from input: `new RegExp(req.query.q)` with an invalid pattern such as a lone `(`
  should not give a 500 (spotting slow-pattern risk is done by reading the code, never by sending crafted slow input);
  string-concatenated SQL shows up as a 500 or SQL error text when a search term contains a single quote.
- Query parameter shapes: repeated parameters (`?id=1&id=2`) or bracket syntax produce arrays or objects where code
  expects strings, giving 500s.
- CORS and cookies: a permissive CORS configuration combined with cookie auth; session cookies lacking `secure`,
  `httpOnly` or sensible `sameSite`; default cookie name left unchanged; in-memory session store in production
  (sessions vanish on restart or differ per instance). Inspect `Set-Cookie` and preflight responses.
- Proxy awareness: with `trust proxy` unset behind a proxy, `req.ip` and secure-cookie handling are wrong; set too
  loosely, clients can spoof their address and bypass IP-based rate limits.
- Rate limiting on login and expensive routes exists or does not; probe a handful of attempts only, never a loop.
- Missing security headers and fingerprinting: no `helmet`, `X-Powered-By` present.
- Open redirects: `res.redirect(req.query.next)` without an allow-list; test with an `example.com` URL and report the
  response.

## Environment gotchas
- `NODE_ENV` changes error output, view caching and some libraries' behaviour; staging should use `production`.
- Process restarts are manual unless the project uses nodemon, pm2 or a container restart policy; after code changes
  confirm the running process has the new code.
- In-memory state (sessions, rate-limit counters, caches) disappears on restart and is not shared across multiple
  processes, so behaviour can change between requests behind a load balancer.
- Dependencies: `npm audit` (read-only) lists known vulnerable packages; report it as a finding, do not upgrade
  anything.
- `.env` values load only at startup. Mail, payment and webhook credentials must point at sandboxes or log drivers in
  staging.

## See also
`api-testing.md`, `permissions-and-data-isolation.md`, `auth-and-sessions.md`, `test-design.md`, `security-checks.md`.
