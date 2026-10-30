# Authentication and sessions

Load this when you test sign-in, sign-out, session lifetime, tokens and cookies, password reset or change, registration,
MFA, "remember me", CSRF, cache behaviour of private pages, or redirects after login. Who may do what once signed in is in
`permissions-and-data-isolation.md`.

## Checks

### 1. Map the mechanism first
- Find out how the product proves identity: server-side session with a cookie, a bearer token (JWT or opaque), an API
  key, or a mix (browser uses cookies, mobile or API clients use tokens). Use the spec's security schemes, the source, and
  the browser's network traffic after a login.
- Note where the credential travels (cookie, `Authorization` header, URL, body) and where it is stored in the browser
  (cookie, `localStorage`, `sessionStorage`). Every later check depends on this.
- List every way to get in: login form, social or single sign-on, magic link, API token endpoint, registration, reset link,
  invitation link, remember-me cookie. A reset or invite link is also an authentication path, so test it as one.
- API keys identify an application, not a person. If a key alone gives access to a user's private data, report it as a lead.

### 2. Login
- Valid credentials: one success; the response gives a session or token and lands on the right page for the role.
- Invalid cases (one attempt each): wrong password, unknown user, empty fields, whitespace-padded username, wrong-case
  username or email (state whether case matters; behaviour should be consistent), very long values (300+ characters),
  special characters and non-English text in the password, SQL-looking text (only observe: a 500 or an error with SQL text is
  a defect).
- Generic failures: wrong password, unknown user, disabled account and locked account should show the same message,
  the same status code and a similar response size and headers. Compare them side by side. A message such as "no such
  user" or a different status for a disabled account is an account-enumeration defect (important).
- Timing: if one path is consistently and clearly slower (for example only existing users are hashed), note it as a lead
  with the measured numbers. Single measurements prove nothing; repeat each case 3 to 5 times and say it is only a lead.
- Disabled or deleted users: cannot sign in, and an already issued token for them stops working on the next request.
- Brute-force protection: look for a lockout, increasing delay or challenge on repeated failures, tracked per account and
  not only per source address. Verify with a **dedicated disposable test account**, at most 5 to 8 wrong attempts in total,
  and record what the product does and whether the threshold is documented. Never use a shared role account (you would
  break the rest of the run), never use a password list, and note "not tested" if no spare account exists.
- Lockout abuse: a locked account should have a recovery path, and lockout must not reveal that the account exists.
- Login over HTTP (if the test environment serves it): credentials must not be accepted in clear text, or HTTP must
  redirect to HTTPS (`security-checks.md`).
- Session renewal: compare the session identifier before and after login. A pre-login identifier that remains valid
  afterwards is session fixation (important). A new identifier should also be issued after a password change or a role
  change.
- Login CSRF: the login form should carry a token or equivalent protection when cookies are used.
- Responses to failed logins must not leak internals (stack trace, SQL, framework version).
- Credentials must not appear in URLs, query strings, redirects or console and network logs.

### 3. Logout
- Server-side revocation: use the API runner chain "call a protected endpoint with token T, log out, call the same endpoint
  again with T". The second call must be 401. A token that still works after logout is a defect (important; critical when
  the token also never expires).
- Cookies: after logout the session cookie must be cleared or replaced, and the old value must be rejected by the server
  (replay it with the runner, not only by looking at the browser).
- Back button: after logout in the browser press Back and reload. A cached private page may flash, but any action or
  refresh must require login again, and the page must not be restored from cache with live data (see section 9).
- Logout in one tab or device: a second tab should be signed out on its next request. If the product allows several
  sessions per user, state which behaviour is documented.
- Logout must be reachable on every authenticated page, and logging out must not itself be a `GET` that other sites can
  trigger through an image link (note as minor).
- Logout when the session has already expired should be harmless (no 500).

### 4. Expiry and idle timeout (without waiting)
- First look for a documented lifetime: the spec or docs, an `expires_in` field in the token response, the `exp` claim of a
  JWT, the `Max-Age` or `Expires` of the cookie, a refresh-token lifetime, or a short-TTL setting for test environments in
  the config. Use that number to plan the check.
- If a short TTL exists (seconds or a few minutes), wait it out once and confirm the next request is rejected with 401 and
  that the UI sends the user to login with a clear message and no lost-data surprise.
- If the lifetime is long and no test setting exists, do not wait. Record "idle and absolute timeout not tested: lifetime
  is N hours and no test TTL is available" under Not tested.
- Check what is observable: a token with no `exp`, no cookie lifetime and no documented limit is a lead (important). Session
  lifetime that appears extremely long (months) for a non-remember-me session is also a lead.
- Timeouts must be enforced by the server. A page that merely shows a countdown but whose API calls keep working with
  the old token is a defect.
- Refresh tokens: using a refresh token after logout, after password change, or twice (when it is meant to rotate) should
  fail.
- Clock edge: an expired token must give 401 (not 403 and not 500), and the response should let a client know to sign in
  again.

### 5. Tokens and cookies
- For each session cookie read the `Set-Cookie` header from the response (browser network view or API evidence). Expect:
  `HttpOnly` (scripts cannot read it), `Secure` (HTTPS only), an explicit `SameSite` (`Lax` or `Strict`; `None` only with
  `Secure` and a reason), no broad `Domain` (host-only is safest), a narrow `Path`, and ideally the `__Host-` prefix.
  Missing `HttpOnly` or `Secure` on the session cookie is important; missing `SameSite` is minor to important depending
  on cookie authentication and CSRF protection.
- Cookie contents: the value should be an opaque random identifier. Decode anything that looks like Base64 or hex. User
  names, roles, email addresses, prices or other business data inside a session value are defects. The name should not
  expose the framework (a lead only).
- Identifier quality: collect 3 to 5 identifiers from separate logins of test accounts and look for patterns (counters,
  timestamps, short length, repetition). Do not generate hundreds, and never try to guess other people's values.
- Browser storage: after login inspect `localStorage` and `sessionStorage` (with `evaluate`, reading only). A long-lived access or
  refresh token stored there is exposed to any script injection; report as a lead of moderate weight with the key
  name only, never the value.
- Tokens in URLs: no session or access token in the address bar, redirects, links in emails (other than single-purpose
  reset or invite tokens), or `Referer`. Search the network log URLs for token-looking query values.
- JWT sanity (when bearer tokens are JWTs): decode the header and payload without verifying (they are only encoded).
  Check: signing algorithm is a real one (not `none`); `exp` exists and is short for access tokens; `iss` and `aud` are
  present; no password, secret, full personal data or internal ids; the claims for role, tenant or user id exist and are
  consistent with the account.
- Do not trust claims blindly, and verify the server does not either: with a **test account**, change one harmless claim
  in the payload (or the signature's last characters) without re-signing, send it, and expect 401. A 200 means the
  signature is not verified: stop, keep minimal evidence and report it as critical. Do not craft tokens for other users or
  higher roles beyond that single proof.
- An expired token, a token for a deleted user, a token with a wrong `aud`, an empty `Authorization: Bearer` value and a
  malformed token must all give 401 and never 500.

### 6. Password reset ("forgot password")
- Only run this with a test mailbox, mail sandbox or a visible token in a test response. If real email would be sent to a
  real address or none can be read, list the flow under Not tested. Use reserved domains (`@example.com`, `.test`) and
  `QA-` accounts only.
- No enumeration: requesting a reset for an existing and for an unknown address must give the same message, the same
  status and a similar response time. Wording such as "no account with that email" is a defect (important).
- Token properties: it arrives by the side channel only, is long and random-looking (compare two or three tokens for
  patterns, never brute force), is bound to one user, **expires** (check the stated lifetime and, if short in a test
  setting, wait it out), and is **single use** (open the link, finish the reset, then try the same link again: expect a
  refusal).
- A newer reset request should invalidate the older token (or the older one should still expire quickly); say what you saw.
- Link construction: the link should use HTTPS and the configured site address, not a value copied from the request.
  Send the request with a different `Host` or `X-Forwarded-Host` using a reserved domain and check that the emailed link
  still points to the real site. A poisoned link is important.
- The reset page should not leak the token through the `Referer` header to third-party scripts or images (look for a
  `Referrer-Policy` such as `no-referrer` on that page).
- Rate limiting: a handful of repeated requests for one account should be throttled or at least not generate unlimited emails
  (observe; do not flood). Repeated requests must not lock the account out.
- After a successful reset: the new password works and the old one does not; the user is not silently signed in; existing
  sessions and tokens are invalidated or the user is offered that choice (use the runner: token from before, call a
  protected endpoint after); a notification is sent and does not contain the password.
- Reset must enforce the same password rules as registration and change, and the new password confirmation must match.
- The reset step must not reveal or change anything before a valid token is presented.

### 7. Password change, email change and re-authentication
- Change password: requires the current password; a wrong current password is refused without side effects; new password
  follows the policy; success issues a new session and ends other sessions (or documents otherwise); a confirmation
  message goes to the user; the old password stops working.
- The endpoint must act on the signed-in user, not on an id supplied in the body (try a different user id belonging to
  another test account: expect refusal; see `permissions-and-data-isolation.md`).
- Sensitive actions should demand fresh proof of identity (current password, a recent login, or MFA): change of email or
  phone, password change, MFA setup or removal, API key or token creation, payout or payment details, account deletion.
  Run each with a valid session but without the extra proof and expect refusal. A change of email that needs no password
  and then allows a reset to the new address is an account-takeover chain (critical if it works for a stolen session).
- Email change should confirm the new address and notify the old one; the old address keeps working until confirmed.

### 8. Registration
- Valid registration with `QA-` data and a reserved-domain address; confirm email verification is required before
  privileged use, and that no real email goes out (otherwise Not tested).
- Duplicate email or username: the response should not tell a stranger the account exists (generic "check your email"
  style message) or at least be documented. Compare with the login and reset messages.
- Password policy: minimum length enforced; long passphrases (64+ characters), spaces, Unicode and emoji accepted;
  silent truncation is a defect (set a 100-character password, log in with the full value, then with its first 72
  characters: the shorter one must fail); pasting is allowed; known-weak passwords (such as `password`) refused where the
  product says so. Composition rules are a preference, not a defect.
- Extra body fields on registration (role, admin flag, verified flag, tenant id) must be ignored or rejected. Try one,
  with your own throwaway account (mass assignment: `permissions-and-data-isolation.md`).
- Input handling: very long names, special characters and RTL text accepted or refused cleanly, never a 500.
- Unlimited self-registration producing unlimited emails is a lead: observe response headers and documents, do not loop.

### 9. Cache headers and private pages
- Authenticated pages and API responses with personal data should send `Cache-Control: no-store` (or at least `private` with
  no shared-cache storage). `no-cache` alone only forces revalidation. Check dashboards, profile, order or document
  detail, exports and downloads.
- After logout, Back must not show a usable private page, and pressing refresh must lead to login.
- Responses that set or carry session identifiers should not be cacheable.
- Shared caches: a response personalised per user must not be served to another user (`Vary` and `Cache-Control` correct).

### 10. MFA and one-time codes
- Only test MFA with a test account and a known test code, a sandbox, or a visible code in test mode. Otherwise list as Not tested.
- No bypass: after the password step, call a protected API endpoint and open a protected page directly without the code.
  Expect 401 or 403. Check that the intermediate token or session is limited and cannot call regular endpoints.
- Wrong code: the product must refuse, count attempts and slow down or lock after a small number (try at most 5 wrong
  codes on a disposable account). Never iterate through codes. Report if a code can be retried without any limit,
  recorded as important with the number of tries you made.
- Codes expire and are single use: reuse a used code, and use an old code after requesting a new one; both must fail.
- The code or secret must never appear in an API response, URL or log visible to the client.
- Disabling MFA, changing the MFA device and viewing recovery codes require re-authentication. Recovery codes are single use.
- "Skip" or "remind me later" options should not leave sensitive functions open that the policy says are protected.

### 11. Remember me and concurrent sessions
- Remember me sets a separate long-lived credential with the same cookie flags; it is cleared by logout, revoked by a
  password change, and does not unlock sensitive actions without re-authentication.
- Without the box ticked, closing the browser or removing the persistent cookie ends the session.
- Concurrent sessions: sign in twice with the same user in two clients. Compare with the stated policy: both allowed, or
  the older one ended. If a "your sessions" screen exists, revoking one session must make that token fail immediately.
- A password change or "log out everywhere" must end all other sessions.

### 12. CSRF (only where a cookie authenticates the request)
- List state-changing endpoints (create, update, delete, password and email change, role change). For cookie-authenticated
  ones, send the request with the cookie but without the CSRF token (runner or browser), with a wrong token, with a token from
  another session, and with a foreign `Origin` header (a reserved domain). Expect 403 or 400, and no change.
- Confirm no state change happens on `GET` (loading a URL or image must not delete or approve anything).
- JSON APIs: a request with `Content-Type: text/plain` or form-encoded must not be accepted as if it were JSON. A custom
  required header is a valid defence.
- Look at `SameSite` as defence in depth, not as the only protection. Bearer-token APIs that do not use cookies are not
  CSRF-prone; say so in notes rather than reporting a missing token.
- Stale token after Back or after logout should be rejected clearly, not silently succeed.

### 13. Redirect after login (open redirect)
- Find parameters such as `next`, `redirect`, `returnUrl`, `continue`, `url`, `target`. After login the product should only go
  to relative paths on its own site.
- Try a harmless absolute address on a reserved domain (`https://example.com/qa-redirect-check`), a scheme-relative one
  (`//example.com`), and a backslash or encoded variant. Read the `Location` header with the API runner (do not follow it). A
  redirect to a foreign host is important; the browser guard may block the actual navigation, which is itself the evidence.
- Open redirects also matter on logout, on reset and on single-sign-on callback pages.

## Severity hints
- **critical**: authentication or MFA can be bypassed; a protected endpoint answers without a valid session; a token whose
  signature is not verified; reset tokens that are reusable, predictable or never expire; session or reset token exposed to
  other users; email change that allows account takeover without proof; passwords or tokens exposed in responses or URLs.
- **important**: token still valid after logout, password change or reset; no server-side timeout; account enumeration; no
  brute-force protection on login or reset; session fixation; missing `HttpOnly`/`Secure` on the session cookie; open
  redirect; CSRF on an important action; private pages cacheable; sensitive actions without re-authentication.
- **minor**: missing `SameSite` where CSRF is otherwise blocked, framework-revealing cookie names, inconsistent messages that
  do not identify accounts, missing notification emails, wording of expiry messages.

## Safe on staging
- Use accounts from the config. Use a dedicated disposable account for lockout, MFA retry and wrong-password checks, and
  never lock the accounts that the rest of the run needs.
- No brute force: at most a handful of wrong attempts per check, no password lists, no code enumeration, no flood of reset
  requests.
- No real email, SMS or third-party sign-in. If you cannot read a test mailbox or sandbox, list the flow as Not tested.
- Never put a username, password, token, cookie or code into a report; show `Authorization: Bearer $TOKEN` and cookie names only.
- Do not forge tokens for other users. A single altered-claim proof on your own test account is the limit; stop at the first acceptance.
- Delete only the `QA-` accounts and data your run created.

## Common bug patterns
- Logout clears the cookie in the browser but does nothing on the server (stateless token never revoked).
- Different code paths for "unknown user" and "wrong password", each with its own wording or timing.
- Reset tokens stored and compared without expiry, or not deleted after use; token generated from time or user id.
- Link base taken from the request `Host` header.
- Session timeouts implemented only in the front-end script.
- JWT library configured to accept the algorithm named by the token, or to skip expiry checks.
- Authentication middleware applied to the main router but not to a newer or admin router.
- Role or tenant stored in a client-editable claim, cookie or hidden field.
- Redirect target taken from a query parameter without an allow-list.
- Cache or CDN rules that treat authenticated paths as static.

## See also
`permissions-and-data-isolation.md`, `security-checks.md`, `api-testing.md`, `forms.md`, `notifications-email.md`, `bug-reporting.md`
