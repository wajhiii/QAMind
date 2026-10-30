# Rails: notes for QA

Load this when the project has a `Gemfile` with `rails` and a `config/routes.rb`. Rails apps are conventional: routes,
controllers, models and views live in fixed places, so endpoint mapping and authorization review can be done almost
mechanically by reading.

## Detect it
- `Gemfile` / `Gemfile.lock` containing `rails`; `bin/rails`; `config/application.rb`, `config/routes.rb`,
  `config/database.yml`, `db/schema.rb` or `db/structure.sql`.
- Folders `app/controllers`, `app/models`, `app/views`, `app/jobs`, `app/mailers`, `app/policies` (Pundit) or
  `app/models/ability.rb` (CanCanCan).
- Auth gems that shape where checks live: `devise`, `has_secure_password`, `rodauth-rails`; authorization gems:
  `pundit`, `cancancan`, `action_policy`.
- Variants: full-stack with ERB, Hotwire (`turbo-rails`, `stimulus-rails`) or React/Vue through `jsbundling`; API-only
  apps whose controllers inherit from `ActionController::API` (`config.api_only = true`), which lack the
  browser-oriented stack.
- Tests: `test/` (Minitest, the default) or `spec/` (RSpec: `rspec-rails`).

## Where to look in the source
- Routes: `config/routes.rb` (`resources`, `namespace`, `scope`, `member`, `collection`, `mount`). The authoritative
  list comes from `bin/rails routes` (add `-g keyword` to filter, `-c Controller` for one controller); it only reads
  configuration and is safe locally.
- Controllers: `app/controllers/**`. Authentication is usually a `before_action :authenticate_user!` (or similar) in
  `ApplicationController`; look for `skip_before_action` in children, because every skip is a public or semi-public
  action. Pattern:
  `grep -rnE "skip_before_action|skip_forgery_protection|protect_from_forgery|allow_unauthenticated" app`.
- Authorization: `authorize @record` and `policy_scope(...)` (Pundit), `load_and_authorize_resource` / `authorize!`
  (CanCanCan), or hand-written `before_action`s. Missing `authorize` in a state-changing action is a lead. Pundit's
  `verify_authorized` after-action, when present, makes gaps loud.
- Record lookup: `Model.find(params[:id])` against user-owned data is an isolation bug; the safe form is a scoped
  finder such as `current_user.projects.find(params[:id])`. Pattern:
  `grep -rnE "\.(find|find_by|find_by!|where)\(.*params" app/controllers`.
- Mass assignment: `params.require(:x).permit(...)` or, in newer Rails, `params.expect(x: [...])`. Danger signs:
  `permit!`, permitting `role`, `admin`, `user_id`, `account_id`, `price`, `status`, or models built from raw
  `params`.
- Models: `app/models` for validations (`validates`), callbacks (`before_save`, `after_create`, `after_commit`),
  associations, scopes, `default_scope`, enums, `has_secure_password`, and DB constraints in `db/schema.rb` (unique
  indexes, null constraints).
- Jobs and mail: `app/jobs`, `app/mailers`; mailers often fire from callbacks, so a model save may send mail.
- Config: `config/environments/*.rb`, `config/credentials*.yml.enc`, `.env` if `dotenv` is used.

## Run it and its tests
- `bin/rails server` (port 3000, `-p` to change). `bin/dev` is used where a Procfile starts assets as well. Console
  access (`bin/rails console`) can modify data; use it read-only or on local data only.
- Minitest layout: `test/models`, `test/controllers`, `test/integration`, `test/system` (browser tests with Capybara),
  `test/fixtures` (YAML, one file per model), `test/test_helper.rb`. RSpec equivalents are `spec/models`,
  `spec/requests`, `spec/system`, with FactoryBot in `spec/factories`.
- Commands: `bin/rails test` (everything except system tests), `bin/rails test test/models/order_test.rb`, a single
  test at a line `bin/rails test test/models/order_test.rb:27`, by name `-n test_total_includes_tax`, system tests
  `bin/rails test:system`. RSpec: `bundle exec rspec spec/requests/orders_spec.rb:27`.
- Each test runs inside a transaction that is rolled back, against a separate test database (`RAILS_ENV=test`,
  configured in `config/database.yml`). If migrations are pending: `bin/rails db:migrate RAILS_ENV=test`, or
  `bin/rails db:test:prepare`. Check the test database name before running so it cannot be the shared staging
  database.
- Regression test in the project's style: for behaviour over HTTP add an integration (request) test: create the
  records through fixtures or factories, sign in the way neighbouring tests do (a test helper such as `sign_in`),
  issue `get`/`post`/`patch` with parameters, assert with `assert_response` and on the database. For isolation, build
  a record for user A, request it as user B and expect a 404 or 403.
- Test mail and jobs through the test adapters (`ActionMailer::Base.deliveries`, `assert_enqueued_jobs`); never
  configure a real SMTP provider.

## Common bug patterns
- IDOR through unscoped finders: change the id in a show, edit, update, delete or nested route to a record owned by
  another user; any 200 is critical. Also test ids in the body (`account_id`, `owner_id`) and in nested routes where a
  child id is not checked against the parent in the path.
- Strong parameter gaps: send extra attributes (`role`, `admin`, owner ids, prices, status) on a `QA-` record; read
  the record back. Unpermitted keys are normally dropped silently (and logged), so absence of an error proves nothing.
  A wrongly shaped payload (missing root key) should give a 400, not a 500.
- Missing authorization on non-obvious actions: `index` with `policy_scope` but `export`, `bulk_update` or custom
  member routes without `authorize`. Walk the route list per controller, not per page.
- CSRF: browser-facing controllers need the authenticity token on non-GET requests; `skip_forgery_protection` or token
  checks disabled for cookie-authenticated JSON endpoints are findings. API-only controllers skip this protection, so
  check that they authenticate by token, not by session cookie alone.
- Session fixation and logout: the session should be reset on sign-in; after logout a replay of the old cookie must
  fail. See `auth-and-sessions.md`.
- `find` versus `find_by`: `find` raises RecordNotFound (a 404 in production), whereas `find_by` returns nil and
  calling a method on it gives a 500. Request unknown ids on every route and expect 404.
- N+1 queries: lists whose views or serializers touch associations per row without `includes`, `preload` or
  `eager_load`; slow pages that grow with page size. `strict_loading` can be used to surface them.
- Callbacks with side effects: updating through `update_column`, `update_all` or `delete` skips validations and
  callbacks; saving triggers mail or jobs even when a later step fails (`after_save` versus `after_commit`). Compare
  counts of side effects with the number of user actions.
- Concurrency: read-modify-write in controllers (`stock -= 1`, balance updates) without row locks or a `lock_version`
  column; double-click or parallel requests then lose updates or violate uniqueness. Rails offers `with_lock`
  (pessimistic) and optimistic locking that raises `StaleObjectError`; check the error is handled with a clear
  message, not a 500. Probe with the API runner's parallel `repeat`.
- Validation versus database constraints: model validations without a unique index allow duplicates under parallel
  requests (a race the validation cannot prevent).
- Unsafe redirects and file paths: `redirect_to params[:return_to]` or `send_file` with user-controlled names; test
  with an absolute external URL (use `example.com`) and with `../` segments, and report only the response, not file
  contents.
- Error leakage: in non-production mode, the rich error page shows source and variables; confirm `RAILS_ENV` and
  `config.consider_all_requests_local` on staging.

## Environment gotchas
- `bin/rails db:reset`, `db:drop`, `db:schema:load`, `db:migrate:reset` destroy or rebuild data; use only on a
  disposable local database. `db:seed` may create demo accounts; read `db/seeds.rb` to learn them.
- Credentials: `config/credentials*.yml.enc` need `config/master.key` or `RAILS_MASTER_KEY`; never print them in
  reports.
- Asset caching: precompiled assets (`public/assets`) and fingerprinted files can leave stale CSS or JS on staging;
  hard reload with a clean profile before reporting UI differences.
- Background jobs need a running worker (Sidekiq, GoodJob, Solid Queue); with the async or inline adapter locally the
  behaviour differs from staging.
- Production mode caches classes and templates; edits do not appear without restart. Mailers should use letter_opener,
  log or a sandbox, never a live provider.

## See also
`api-testing.md`, `permissions-and-data-isolation.md`, `auth-and-sessions.md`, `forms.md`, `test-design.md`, `security-checks.md`.
