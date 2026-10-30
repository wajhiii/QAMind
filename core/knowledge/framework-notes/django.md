# Django: notes for QA

Load this when the project has `manage.py` and Django in its requirements. Many Django projects add Django REST
framework (DRF) for the API, and that is where most access-control defects hide, so this file covers both.
Template-rendered Django views follow the same data rules, with CSRF protection on by default.

## Detect it
- `manage.py` at the root; a settings module (`<project>/settings.py` or `settings/base.py`, `settings/local.py`);
  `urls.py`; `wsgi.py` / `asgi.py`.
- `requirements*.txt`, `pyproject.toml` or `Pipfile` listing `Django`; `djangorestframework`, `django-filter`,
  `drf-spectacular` or `drf-yasg` (API schema), `django-cors-headers`, `celery`, `djoser`, `dj-rest-auth`, `simplejwt`
  hint at the API and auth style.
- `INSTALLED_APPS` in settings lists each app; each app folder usually has `models.py`, `views.py`, `urls.py`,
  `serializers.py`, `admin.py`, `migrations/`, `tests.py` or `tests/`.
- Pytest users have `pytest.ini` or `[tool.pytest]` with `DJANGO_SETTINGS_MODULE`.

## Where to look in the source
- Routes: root `urls.py` with `path(...)`, `re_path(...)`, `include(...)`; DRF routers (`router.register(...)`)
  generate list and detail routes per viewset. Pattern:
  `grep -rnE "path\(|re_path\(|router\.register|include\(" --include=urls.py .`. `python manage.py show_urls` exists
  only with django-extensions.
- Access control, plain Django: `@login_required`, `@permission_required`, `LoginRequiredMixin`,
  `PermissionRequiredMixin`, `UserPassesTestMixin`, and in newer versions a `LoginRequiredMiddleware` in `MIDDLEWARE`.
  Pattern: `grep -rnE "login_required|permission_required|LoginRequiredMixin|user_passes_test" .`. Views with none are
  public. Note that `LoginRequiredMiddleware` does not cover DRF views.
- Access control, DRF: `permission_classes` on each view or viewset, plus `REST_FRAMEWORK` defaults in settings
  (`DEFAULT_PERMISSION_CLASSES`, `DEFAULT_AUTHENTICATION_CLASSES`). If the default is not set, DRF allows anyone, so
  each view must opt in. Pattern: `grep -rnE "permission_classes|AllowAny|IsAuthenticated|authentication_classes" .`.
- Object scoping: `get_queryset()` in viewsets and views. A queryset like `Model.objects.all()` on a user-owned
  resource is an isolation bug unless filtered by `request.user`. DRF object permissions (`has_object_permission`) run
  only when the view fetches a single object; they do not filter list responses and do not run on create.
- Serializers: `serializers.py`. `fields = '__all__'` exposes every column; writable fields such as `is_staff`,
  `owner`, `role`, `price`, `status` allow over-posting unless listed in `read_only_fields`. Check `validate_*`
  methods and whether they re-check ownership of related ids.
- Models: `models.py` with `unique=True`, `unique_together`/`constraints`, `choices`, `null=True`; unique and check
  constraints are what stop duplicate submissions.
- Settings: `DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`,
  `CORS_ALLOWED_ORIGINS`/`CORS_ALLOW_ALL_ORIGINS`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `DATABASES`,
  `EMAIL_BACKEND`.

## Run it and its tests
- `python manage.py runserver` (port 8000) is a development server only. `python manage.py check` and `check --deploy`
  print configuration warnings without changing anything.
- Tests: `python manage.py test` discovers `test*.py`. One test by dotted label:
  `python manage.py test app.tests.test_orders.OrderTests.test_total`. Useful flags: `--keepdb` (reuse the test
  database), `--parallel`, `--shuffle`. With pytest-django: `pytest app/tests/test_orders.py::OrderTests::test_total`
  or `-k name`.
- The test runner creates a separate `test_`-prefixed database (in-memory for SQLite) and destroys it afterwards, but
  it needs rights to create databases on the configured server. Make sure `DATABASES` points at a local server (use a
  local settings module), not a shared staging one.
- Tests always run with `DEBUG=False`, whatever settings say, so debug-only leaks never show in tests. `TestCase`
  wraps each test in a transaction; use `TransactionTestCase` when testing locking or commit behaviour.
- DRF test client: `APITestCase` and `APIClient`; `force_authenticate(user)` skips real authentication, and CSRF
  checks are off by default in the test client, so tests built on them cannot reveal CSRF or login defects.
- Regression test in the project's style: add a `test_<thing>.py` (or a method in the app's `tests.py`) inside the
  app's `tests/` folder, create users and records the way neighbours do (`setUpTestData`, factory_boy, fixtures), call
  the endpoint through `self.client`, assert status code, response data and database rows. For isolation, create a
  record for user A and request it as user B.

## Common bug patterns
- Open by default (DRF): no `permission_classes` and no global default. Call each endpoint anonymously; 200 where the
  product needs sign-in is critical. Also check `AllowAny` on write methods, and `IsAuthenticated` used where a role
  check was intended (any signed-in user passes).
- Queryset not scoped to the user: list returns everyone's rows; detail with another user's id returns 200 instead of
  404. Object permission classes do not fix the list endpoint.
- 401 versus 403: the first configured authentication class decides which one an anonymous caller sees. Treat either
  as correct; 200 is the bug.
- Over-posting through serializers: send extra writable fields (role, owner id, status, totals) on create and update,
  using a `QA-` record, and read the result back.
- CSRF: session-authenticated unsafe requests need the token. A view exempted with `csrf_exempt`, or an API using
  session cookies while exempting CSRF, deserves a flag. Missing CSRF behaviour is only visible in a real browser
  session, not in the test client.
- `DEBUG=True` outside local: the technical 500 page shows settings and local variables, and the 404 page lists URL
  patterns. Request an unknown path and a forced error and read what the page reveals; also look at `ALLOWED_HOSTS`
  set to `*`.
- ORM race conditions: read-then-write code (`obj.count += 1; obj.save()`, check stock then decrement, "create if not
  exists") loses updates under concurrent requests. Safe forms use `F()` expressions, `select_for_update()` inside
  `transaction.atomic()`, `get_or_create` with a unique constraint, or `bulk` updates. SQLite ignores row locks, so
  race bugs may hide locally. Probe with a pair of simultaneous identical requests (the API runner's `repeat` with
  `parallel`) and check counts and duplicates.
- Duplicate submission: no unique constraint on natural keys (order reference, email) so two parallel POSTs create two
  rows.
- Migrations: models changed without a migration (`python manage.py makemigrations --check --dry-run` reports it) or a
  migration that fails on populated data; both show up on deploy, not in tests.
- N+1 queries: serializers or templates touching related objects per row without `select_related` /
  `prefetch_related`; slow lists that grow with page size. Pagination missing on large lists.
- Admin exposure: `/admin/` reachable and using weak or seeded credentials is a finding to report without attempting
  logins beyond the credentials you were given.
- Validation: model `choices` and `max_length` are checked by forms and serializers, not by a bare `save()`, so any
  code path that skips them accepts bad values. Send out-of-range choices and over-long strings to every write
  endpoint, not only the main form.

## Environment gotchas
- `python manage.py migrate` changes the schema of whatever database settings point to. Run it only for a local or
  disposable database you own; `flush`, `sqlflush` and `reset_db` destroy data and are off limits on shared data.
- Static files need `collectstatic` outside the dev server; missing static files in staging often mean the step was
  skipped, not a code bug.
- `SECRET_KEY` and database credentials come from environment variables or a local settings file; never copy them into
  reports.
- Email backend should be console, file or locmem in staging, never a real provider. Celery tasks need a running
  worker, or `CELERY_TASK_ALWAYS_EAGER` set locally.
- Check `settings.DEBUG`, cookie `Secure` flags and `ALLOWED_HOSTS` on any environment that is reachable by other
  people.

## See also
`api-testing.md`, `permissions-and-data-isolation.md`, `auth-and-sessions.md`, `forms.md`, `test-design.md`, `security-checks.md`.
