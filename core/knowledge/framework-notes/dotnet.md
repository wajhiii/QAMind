# ASP.NET Core: notes for QA

Load this when the project has a `.csproj` using `Microsoft.NET.Sdk.Web` (C# web API, MVC, Razor Pages, Blazor or
minimal APIs). Authorization here is opt-in per endpoint unless a fallback policy is set, and several protections
(antiforgery, model validation, error pages) depend on the endpoint style and the environment name, so read both.

## Detect it
- `*.csproj` with `<Project Sdk="Microsoft.NET.Sdk.Web">` and a `TargetFramework` such as `net8.0` or `net10.0`;
  `Program.cs` that calls `WebApplication.CreateBuilder(args)`; older projects also have `Startup.cs`.
- `appsettings.json`, `appsettings.Development.json`, `Properties/launchSettings.json` (profiles with the local URLs
  and `ASPNETCORE_ENVIRONMENT`).
- Style of endpoints: controllers in `Controllers/` with `[ApiController]` or `Controller`; minimal APIs with
  `app.MapGet`, `MapPost`, `MapGroup`; Razor Pages in `Pages/`; Blazor components `*.razor`; MVC views in `Views/`.
- Data layer: `Microsoft.EntityFrameworkCore.*` packages, a `DbContext` class, `Migrations/` folder; Dapper as an
  alternative.
- Identity and auth: `Microsoft.AspNetCore.Identity`, `AddAuthentication().AddJwtBearer(...)`, cookie auth, OpenID
  Connect packages.

## Where to look in the source
- Pipeline order: `Program.cs`. Check that `UseAuthentication()` comes before `UseAuthorization()`, that both run
  before the endpoint mapping, and where `UseExceptionHandler`, `UseDeveloperExceptionPage`, `UseHttpsRedirection`,
  `UseCors` and `UseAntiforgery` sit. Wrong order silently disables checks.
- Endpoint inventory:
  `grep -rnE "\[(Http(Get|Post|Put|Patch|Delete)|Route)|Map(Get|Post|Put|Patch|Delete|Group)\(" --include=*.cs .`. In
  controllers, combine the class `[Route("api/[controller]")]` with each action attribute; for groups, combine
  prefixes. Swagger (`/swagger`) usually lists them when enabled.
- Authorization:
  `grep -rnE "\[Authorize|\[AllowAnonymous|RequireAuthorization|AllowAnonymous\(\)|FallbackPolicy|AddAuthorization" --include=*.cs .`.
  An endpoint with no authorization metadata is public unless a fallback policy requires authentication.
  `[AllowAnonymous]` on a controller overrides every `[Authorize]` on that controller and its actions. Minimal APIs
  need `.RequireAuthorization()` on the endpoint or group.
- Roles and policies: `[Authorize(Roles = "...")]` and `[Authorize(Policy = "...")]`; policy definitions in
  `AddAuthorization(options => ...)`; handlers implementing `IAuthorizationHandler` or `AuthorizationHandler<T>`.
  Record-level (ownership) checks live in handlers or in the data query itself; look at actions that take an id and
  fetch with `FindAsync(id)` or `FirstOrDefault(x => x.Id == id)` without an owner or tenant predicate.
- Validation and binding: DataAnnotations on DTOs (`[Required]`, `[Range]`, `[StringLength]`), FluentValidation
  validators, `ModelState.IsValid` checks. With `[ApiController]`, invalid model state returns an automatic 400.
  Entities used directly as request bodies expose every property to over-posting; look for `[Bind]`/`[BindNever]`
  (which affect form posts but not JSON bodies) or, better, separate DTO classes.
- Data access: `DbContext` classes, `DbSet<T>` properties, LINQ chains, `FromSqlRaw`/`ExecuteSqlRaw` with string
  interpolation, `.Include(...)` use, `AsNoTracking()`, `[Timestamp]`/`[ConcurrencyCheck]`/`IsRowVersion()` for
  concurrency tokens.
- Config: `appsettings*.json`, user secrets, environment variables; `Cors` policies (`AllowAnyOrigin` with
  credentials), `AddDatabaseDeveloperPageExceptionFilter`, `UseSwagger` outside development.

## Run it and its tests
- `dotnet run` (use `--launch-profile` to pick a profile); URLs come from `launchSettings.json`, often with random
  ports in newer templates; `dotnet watch` reloads on change. `ASPNETCORE_ENVIRONMENT` selects `Development`,
  `Staging` or `Production`; when unset it is `Production`.
- `dotnet build` and `dotnet test` from the solution folder. One test:
  `dotnet test --filter "FullyQualifiedName~OrdersControllerTests.Create_ReturnsBadRequest"`.
- Test projects: xUnit (most common), NUnit or MSTest, in `tests/` or `<Project>.Tests/`. API-level tests use
  `WebApplicationFactory<Program>` from `Microsoft.AspNetCore.Mvc.Testing`, which hosts the app in memory;
  `factory.CreateClient()` follows redirects and keeps cookies by default (set `AllowAutoRedirect = false` to assert a
  302 to login).
- Regression test in the project's style: add a test class beside neighbours implementing
  `IClassFixture<WebApplicationFactory<Program>>` (or the project's own custom factory), override services in
  `ConfigureWebHost`/`ConfigureTestServices` (swap the database for SQLite in memory or a test database, replace email
  or payment clients with fakes), create or authenticate a test user the way existing tests do, send the request, and
  assert status, body and database state. Cross-user check: resource created by user A requested with user B's
  credentials expects 403 or 404.
- Notes: the test host defaults to the `Development` environment unless set, so tests do not see production-only
  behaviour such as the generic error page; POSTs to cookie-authenticated form endpoints must pass antiforgery, so
  tests fetch a token first.
- Databases: look at the connection string and the factory before running tests or migrations; confirm it targets a
  local or disposable database.

## Common bug patterns
- Authorization gaps: new controller or endpoint without `[Authorize]` or `.RequireAuthorization()`, no fallback
  policy, or `[AllowAnonymous]` placed at class level; roles checked on `GET` but not on `PUT`/`DELETE`. Call each
  endpoint anonymously and per role, expecting 401 for no credentials and 403 for a signed-in wrong role. A redirect
  to a login page (302) on an API route means cookie middleware is answering instead of a JSON 401.
- Missing resource ownership checks: any signed-in user can fetch, update or delete another user's record by id.
  Request cross-user ids on every id-based route including nested resources and bodies containing foreign keys.
  Critical when data crosses accounts.
- Over-posting: JSON bodies bound directly to entity classes accept extra properties (`IsAdmin`, `OwnerId`, `Price`,
  `Status`). Add one extra property to a `QA-` record's create or update body and read it back. `[Bind]` does not
  protect JSON bodies.
- Validation holes: DataAnnotations missing on some DTO fields; missing properties silently take default values (0,
  null, `DateTime.MinValue`) rather than failing; string length limits that exist only in the database and surface as
  500 errors. Send omitted, null, empty, very long and out-of-range values.
- Model binding surprises: binding sources differ between form, route, query and body; a body sent with the wrong
  content type may yield 415 or an empty object; culture-specific number and date formats in form posts. Send the same
  data as JSON and as form fields.
- Antiforgery: cookie-authenticated form and Razor Page posts need tokens; for minimal APIs, antiforgery validates
  only some verbs and only for endpoints that require it, so `DELETE` may be open. Bearer-token APIs are not exposed
  to the browser-driven attack, but cookie-authenticated ones are.
- Environment-dependent leaks: the Developer Exception Page, detailed ProblemDetails (machine name, stack frames), the
  database error page filter, Swagger UI, or `ASPNETCORE_ENVIRONMENT=Development` on staging expose stack traces,
  headers, cookies and query strings. Trigger a harmless error (malformed id) and inspect the body; report any stack
  frames, connection strings or machine names with minimal evidence.
- EF Core concurrency: an update with no concurrency token is last-writer-wins; with a token, a conflict throws
  `DbUpdateConcurrencyException`, which becomes a 500 unless the code translates it to 409. Parallel inserts violating
  a unique index raise a provider-specific exception, not the concurrency one, and also surface as 500. Probe with two
  simultaneous identical writes via the API runner's `repeat` (parallel).
- Tracking and N+1: queries inside loops, lazy-loading proxies, missing `Include`, large unbounded `ToList()`, missing
  pagination; symptom is slow lists that scale with data. Tracked entities returned from the API can serialize
  circular references (500) or expose navigation properties.
- Async misuse: `.Result` or `.Wait()` on tasks causing hangs under load; unawaited tasks losing errors. Visible as
  intermittent timeouts after repeated actions.
- Model state and `[ApiController]`: `ProblemDetails` 400 responses list field errors; check the field names match the
  UI so errors show beside inputs.

## Environment gotchas
- `dotnet ef database update` and migration bundles change the schema of the configured database; only run on a local
  or disposable database. `Database.EnsureCreated`/`Migrate()` at startup may do so automatically when the app starts,
  which is why the connection string deserves a look first.
- Configuration layers (later wins): `appsettings.json`, environment-specific file, user secrets (Development only),
  environment variables, command-line. A staging value can come from any layer; never copy secrets into reports.
- HTTPS redirection and dev certificates: `dotnet dev-certs https --trust` is needed locally; a failing redirect
  usually means the HTTP and HTTPS ports in `launchSettings.json` differ from what you called.
- Hosted behind IIS, Azure or a proxy, forwarded headers must be configured, otherwise absolute redirects, cookie
  flags and client IP are wrong.
- Background services (`IHostedService`, Hangfire, queues) run inside or beside the app; confirm they are running
  before treating a missing side effect as a bug. Email and payment SDKs must use sandbox settings.

## See also
`api-testing.md`, `permissions-and-data-isolation.md`, `auth-and-sessions.md`, `forms.md`, `test-design.md`, `security-checks.md`.
