# Laravel: notes for QA

Load this when `composer.json` requires `laravel/framework`. Laravel apps are usually server-rendered (Blade,
Livewire, Inertia) and/or expose a JSON API, with the database layer (Eloquent) and the authorization layer (policies
and gates) in predictable folders, which makes missing checks easy to find by reading.

## Detect it
- `composer.json` requires `laravel/framework`; the file `artisan` at the root; `.env` / `.env.example`; folders
  `app/`, `routes/`, `database/`, `resources/views`, `tests/`.
- Version differences that change where things live: in recent versions routing and middleware are configured in
  `bootstrap/app.php` (`withRouting`, `withMiddleware`); older versions use `app/Http/Kernel.php` and
  `app/Providers/RouteServiceProvider.php`.
- Frontend flavour: Blade views in `resources/views`; Livewire (`livewire/livewire`, `app/Livewire`); Inertia
  (`inertiajs/inertia-laravel`, with `resources/js/Pages` in React, Vue or Svelte); a separate SPA using the API.
- API auth packages: Sanctum (`laravel/sanctum`), Passport, or a custom guard. `routes/api.php` exists only if API
  routing was enabled.

## Where to look in the source
- Routes: `routes/web.php` (session, CSRF protection) and `routes/api.php` (stateless, `/api` prefix, token auth). Get
  the real list from the app itself: `php artisan route:list -v --path=api` shows each method, URI, controller and
  attached middleware. Read-only, safe on a local checkout.
- Missing auth on routes: in the route list, look for rows without `auth`, `auth:sanctum` or `can:` middleware. Source
  pattern: `grep -rnE "Route::(get|post|put|patch|delete|resource|apiResource)" routes`, then check the enclosing
  `Route::middleware([...])->group(...)`.
- Controllers: `app/Http/Controllers`. For each state-changing method look for `$this->authorize(`,
  `Gate::authorize(`, `->can(`/`->cannot(`, or a `can:` route middleware. None of those means any signed-in user may
  act on any record.
- Policies and gates: `app/Policies`, `Gate::define` in `app/Providers/AppServiceProvider.php`. Policies are
  auto-discovered when the class name is the model name plus `Policy`. A model with no policy falls back to a gate of
  the same ability name, and the real gap is a controller method that never calls either. Read `before()` methods that
  return true for admins and confirm the admin flag cannot be self-assigned.
- Validation: `app/Http/Requests` (FormRequest with `authorize()` and `rules()`), or inline
  `$request->validate([...])`. Danger signs: `authorize()` returning `true` unconditionally, `$request->all()` or
  `$request->input()` passed to `create()` or `update()` instead of `$request->validated()`.
- Models: `app/Models`. Check `$fillable`, `$guarded` (an empty array means everything is fillable), or the newer
  attribute forms, and `$hidden` for what JSON output hides. Soft deletes (`SoftDeletes`) and global scopes change
  which rows are visible.
- Route model binding: `{post}` parameters resolve by key; nested routes `/users/{user}/posts/{post}` only ensure the
  post belongs to the user when scoped (custom key such as `{post:slug}` or `scopeBindings()`).
- Jobs, mail and notifications: `app/Jobs`, `app/Mail`, `app/Notifications`, listeners and observers; these produce
  side effects the UI never shows.
- Config: `config/*.php`, `.env`; `APP_DEBUG`, `APP_ENV`, `APP_KEY`, mail and queue drivers.

## Run it and its tests
- Local server: `php artisan serve` (port 8000); front-end assets with `npm run dev` (Vite). Sail uses Docker
  (`./vendor/bin/sail up`).
- Run tests with `php artisan test` (or `./vendor/bin/pest`, `./vendor/bin/phpunit`). Pass filters straight through:
  `php artisan test --filter=CheckoutTest`, `--testsuite=Feature`, `--parallel` needs `brianium/paratest`.
- Test setup: `phpunit.xml` sets the `testing` environment, array session and cache drivers, and often an in-memory
  SQLite database; an optional `.env.testing` overrides `.env`. Check these before running so tests never point at a
  shared or staging database. After editing environment values clear config caches with `php artisan config:clear`.
- Layout: `tests/Feature` (boots the app, HTTP-level tests, most tests) and `tests/Unit` (no app boot, no database).
  Pest uses `test('...', function () {...})` closures; PHPUnit uses classes with `test_*` methods.
- Regression test in the project's style: create `tests/Feature/<Area>Test.php` (`php artisan make:test`), use the
  project's database trait (`RefreshDatabase` runs each test in a transaction; `DatabaseMigrations` or
  `DatabaseTruncation` fully reset but are slower), create users and records with model factories, call the endpoint
  with `actingAs($user)` plus `getJson`/`postJson`, and assert status, JSON and database state. Cross-user checks:
  record owned by user A, request as user B, expect 403 or 404.
- Faking side effects in tests: `Mail::fake()`, `Queue::fake()`, `Notification::fake()`, `Event::fake()`,
  `Http::fake()`, and `Storage::fake()`; time helpers `travel()` and `freezeTime()`. Assertion
  `expectsDatabaseQueryCount` can pin a query count to prove an N+1 fix.

## Common bug patterns
- Mass assignment: a model with an empty `$guarded` or a `$fillable` that includes `role`, `is_admin`, `user_id`,
  `price`, `status` plus a controller using `$request->all()`. Probe by adding the extra field to a create or update
  body in a test-prefixed record, then read it back. Models silently drop non-fillable fields by default, so absence
  of an error is not evidence of protection; read back the value.
- Missing authorization on a route: authenticated access is checked but the record owner is not. Run the role matrix
  over every id-based route; a 200 for another user's record is critical. A policy that returns 404 instead of 403 is
  acceptable.
- FormRequest confusion: `authorize()` returns true and the controller never authorizes; or validation passes
  `exists:` rules for ids belonging to other tenants. Send ids of records owned by someone else inside the body
  (relation fields, `*_id`).
- Route model binding without scoping: `/accounts/{account}/invoices/{invoice}` returns an invoice of another account
  if only the invoice is bound. Request mismatched parent and child ids.
- Soft-deleted records: deleted items should return 404; check detail, list, search and relation counts, and whether
  restoring is reachable.
- Validation edge cases: JSON requests get 422 with an `errors` object; browser form posts get a redirect back with
  errors and old input. A 500 on bad input (type juggling, null in a required cast) is a bug. Unique rules on update
  that forget to ignore the current record reject saving an unchanged value.
- N+1 queries: list pages or API resources that touch relations inside loops (`$post->author->name`) without
  `with(...)`; symptom is slow responses that grow with page size. Lazy-loading prevention
  (`Model::preventLazyLoading`) and `$this->expectsDatabaseQueryCount` expose these in development.
- Queue and mail side effects: actions that dispatch jobs or send mail inside the request (slow, fails the request) or
  after a rolled back transaction. Only observe through local log or fake drivers (`MAIL_MAILER=log`,
  `QUEUE_CONNECTION=sync` or a test queue); never trigger real mail.
- CSRF and sessions: `web` routes need the token; a route listed in the CSRF exclusion list or an API route using
  cookie auth deserves attention. Expired tokens should give a 419 page, not a crash.
- Rate limiting: `throttle` middleware on login and write routes; verify the 429 appears after a handful of requests
  only on a safe endpoint, and never loop beyond that.
- Debug leakage: `APP_DEBUG=true` shows stack traces, paths and sometimes environment values on errors. Trigger an
  unmatched id with an invalid format and look at the error body.

## Environment gotchas
- Cached config, routes and views (`php artisan optimize`, `config:cache`, `route:cache`) make staging ignore `.env`
  edits or new routes; `php artisan optimize:clear` resets them on a local checkout. Do not clear caches on shared
  staging unless the task allows it.
- Migrations: `php artisan migrate:status` reads state safely. Treat `migrate:fresh`, `migrate:rollback`, `db:wipe` as
  destructive; only on a disposable local database you created.
- Seeders (`db:seed`) may create demo users and data with predictable credentials; record them rather than assuming.
- `APP_ENV` and `APP_DEBUG` should be `production` and `false` on anything that resembles a real deployment. Mail,
  queue and filesystem drivers should point at log, sync or local fakes in staging.
- Queue workers and the scheduler run as separate processes; if jobs never complete, check whether a worker is running
  before filing a bug.

## See also
`api-testing.md`, `permissions-and-data-isolation.md`, `auth-and-sessions.md`, `forms.md`, `test-design.md`, `security-checks.md`.
