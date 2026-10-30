# Permissions and data isolation

Load this when you test who may see or do what: roles, tenants or customers, ownership of records, admin functions, field
visibility, exports, attachments, search, notifications and caching. Login and session mechanics are in
`auth-and-sessions.md`; general API probing is in `api-testing.md`.

Vocabulary (these map to the OWASP API Security Top 10 2023 items you may cite in findings):
API1:2023 Broken Object Level Authorization (another user's object, same function), API3:2023 Broken Object Property Level
Authorization (fields you may not read or write), API5:2023 Broken Function Level Authorization (a function your role
should not reach). Access control must be decided by the server on every request; hiding a button is never protection.

## Checks

### 1. Build the matrix before probing
- Rows: anonymous plus every role in the config (and, per role, two separate accounts or tenants where available).
  Columns: each API operation and each UI page or action. Cells: read, create, update, delete, export, or "no access".
- Fill the cells from evidence, in this order: the spec's security requirements and any role notes, the config's business
  rules, the source (route middleware, policy or guard files, permission constants), then what the UI shows each role.
  Mark each cell "documented", "inferred from source" or "guess" so the report can say how sure you are.
- Add the expected denial for each forbidden cell: 401 for anonymous, 403 for a known role without permission, and
  404 where hiding existence is the product's choice. Accept `[403,404]` for other tenants' objects.
- Test both directions: forbidden cells must refuse, and allowed cells must work. A role that is refused something it should
  be able to do is a functional defect, not a security one; do not mistake it for correct behaviour.
- Treat the matrix as a to-do list. Run every cell that reads data; run write and delete cells only on records your run created.
- Read the API runner's role matrix output (the status per role for each operation) and compare it with your cells. A
  mismatch is a lead: confirm it by hand before reporting.

### 2. Vertical escalation (a lower role reaching higher-role features)
- With a lower role's credentials call every endpoint you know to be admin or manager only: list all users, create a
  user, change roles, change settings, view reports, approve, refund, export all data, delete others' data. Expect 403
  (or 401 with no token). A 200, 201 or 204 is a finding, even if the UI hides the link.
- Open admin and manager pages directly by URL as the lower role and as anonymous. The page must refuse or redirect before
  showing data; check the API calls it makes, not only the visible screen. Pages that render empty but still receive the
  full data in the network response leak it.
- Admin-only operations often share a prefix with ordinary ones (`/users` and `/users/{id}/role`). Test each method and
  each sub-path separately: read may be open while update is not, or the reverse.
- Method tampering: if `GET` is refused, try `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, and a method override header
  (`X-HTTP-Method-Override`) on the same path; compare statuses with the allowed role. Nonstandard methods that skip the
  check are important.
- Self-promotion: update your own profile with fields such as `role`, `roles`, `is_admin`, `permissions`, `group`,
  `plan`. Read back your profile and any "me" endpoint. Any change in privilege is critical.
- Invitation, registration and role-granting flows: the lower role must not be able to create an invite or user with a
  higher role.
- Role changes must apply promptly: demote or disable a test user, and the old token must lose the extra rights on the next
  request (or soon, as documented). A token that keeps old admin rights is important.
- Feature or plan gating (paid features, feature flags): call the gated endpoint with an account lacking the feature.

### 3. Horizontal access: BOLA and IDOR on object references
- Use two accounts of the **same role** that own different data (customer A and customer B). Account A creates a `QA-`
  record and captures its id. Account B then tries to use that id on every operation that accepts it.
- Locations of references to test: path segments, query parameters, JSON body fields, hidden form fields, headers (a tenant
  or user header), cookies, filenames and download tokens, GraphQL-style arguments, and references split across fields
  (two values that together identify an object).
- For each reference test every operation, not just read: get, update, replace, delete, state change (cancel, approve),
  duplicate, export, print, download, share, comment, attach. A safe read with an unsafe update is the common gap.
- Expected result for account B: 403 or 404, no data in the body, and no change when A re-reads the record.
  A 200 with A's data, a 200 for a write, or a 204 for a delete is critical.
- Compare "exists but not yours" with "does not exist": using different status codes or messages for these (403 vs
  404) lets B discover which ids exist. Minor to important depending on how guessable ids are. Prefer one answer.
- Random or non-sequential ids are not an access control. Still run the probe: B only needs to obtain A's id (from a
  shared link, an email, a log, a list, a referrer) and the server must refuse.
- Sequential ids: test with the id of your own record and the id right next to it only if that neighbour belongs to
  your own second test account. Do not walk through ranges to see what other people own.
- A check that compares the token's user id with one id parameter does not cover other references in the same request.
  Look for endpoints with several ids (an order id and a customer id) and swap each one.
- Dependent actions: after B fails to read, also try the "action" endpoints for that object (`/orders/{id}/cancel`,
  `/documents/{id}/share`).

### 4. Tenant and customer isolation across every surface
Repeat the A-creates, B-requests chain for each way data can leave the system:
- **List**: B's list must contain none of A's `QA-` records. Check default, filtered, sorted, paginated, searched and
  "all" or `limit=max` variants. Totals and counts should reflect only B's data.
- **Detail**: covered in section 3, including related sub-resources (items, comments, history, invoices).
- **Search and suggestions**: global search, type-ahead, "find user", mention pickers and lookup lists may query a shared
  index. Search for A's `QA-` marker as B.
- **Export and report**: CSV, PDF, Excel and scheduled reports; B must receive only B's rows. Check summary and chart
  data endpoints, which are often written separately and skip the filter. Check download links: can B open A's file by
  link, and does a signed or temporary link expire and stay scoped to one file?
- **Attachments and files**: upload as A, fetch by path or id as B and anonymous. Are files served with predictable names or
  from a public folder? A file that opens without login is a leak even if no page links to it.
- **Notifications and emails**: events about A's record must not reach B (check B's notification list and inbox in test
  mode). Webhook payloads and activity feeds are also tenant-scoped.
- **Audit logs, activity feeds, dashboards, counts, badges**: aggregate numbers can reveal other tenants' activity.
- **Background jobs and imports**: an import or export job created by A must not be visible, downloadable or cancellable
  by B (job ids are references too).
- **Shared reference data** (countries, product catalog, price lists) may legitimately be global. Check the config before
  calling shared data a leak, and check that tenant-specific overrides do not cross.
- **Switching accounts in one browser**: after signing out as A and in as B, no A data should remain on screen, in
  cached pages, local storage, or the first API calls.

### 5. Function-level access
- Enumerate every function a role can reach through the UI, then separately every function the API offers. The gap is the
  test list: for each API-only function, call it as the lowest role.
- Look for functions that should never be public: debug, impersonate, import/seed, reset data, export all, metrics, internal
  jobs, mass-notify. Admin pages without a link are still reachable by anyone who guesses the path (forced browsing).
- Deny by default: a route that exists but is missing from the permission config should be refused, not allowed. Probe an
  undocumented admin-looking path you found in source with the lowest role.
- Read versus write: many products guard create/update/delete but forget export or "view all".
- Authorization on static or generated assets (invoices, reports, uploaded files, images) must match the record's
  permissions.

### 6. Property-level access (fields)
- Reading: call the same detail endpoint as each role (and as the owner versus a non-owner who may view it). Compare field by field.
  Look for fields a role should not see: cost or margin, internal notes, other users' emails or phone numbers, password
  hashes, tokens, risk or moderation flags, discount rules, full card numbers, national ids, internal ids of other tenants.
  Report the field names and the role, never copy the values.
- Responses should return only what the screen needs. A list endpoint that returns full objects when the UI shows two
  columns is a lead for over-exposure.
- Writing (mass assignment): on create and on update, add one extra protected field at a time to a valid body, using your own
  `QA-` record. Candidates: `id`, `role`, `is_admin`, `owner_id`, `user_id`, `tenant_id`, `customer_id`, `status`, `price`,
  `total`, `discount`, `balance`, `verified`, `approved`, `created_at`, `deleted`, `plan`. Then read the record back and compare.
  The value must be ignored or the request refused (400/422). A changed value is critical for privilege, owner, tenant,
  money or status fields and important for the rest.
- Also try the field inside nested objects and arrays (`items[0].price`), and via `PATCH` as well as `PUT`.
- Fields that are read-only for a role in the UI (greyed out) must be refused in the API for that role.
- A field the spec marks as read-only must not be changeable by sending it.

### 7. Indirect references and foreign keys
- Bodies that contain ids of other objects are references too: an order containing a customer id, address id, product id,
  coupon code, file id or parent id. As account B, create a record that points at an id owned by account A. Expect refusal;
  acceptance is a cross-tenant link, and reading it back may expose A's data (exposed through the joined fields).
- Nested paths (`/projects/{p}/tasks/{t}`): use a task id from a different project, and a project id from another tenant.
  The server must verify that the child belongs to the parent and that both are the caller's. Mismatched pairs should be 404.
- Moving or reassigning (change owner, move to another project, share with user): the target must be a valid and permitted
  target for the caller; cannot assign to a user in another tenant.
- Search filters and sort keys that accept relation ids (`?owner=...`, `?tenant=...`) must not widen the result set.
- A `tenant`, `account` or `user` header or query parameter that the client can set must be ignored or checked against the
  token. Send B's token with A's tenant value: expect refusal.

### 8. Caching and shared state
- Responses personalised per user should not be stored by shared caches. Check `Cache-Control` and `Vary` on authenticated
  `GET`s. Request A's resource as A, then the same URL as B and as anonymous, and compare bodies. Identical bodies for
  different users are a leak.
- Look for in-memory or global state: "last viewed", "current customer", draft carts, cached lookups, or a report
  that is cached by report name instead of by name plus tenant.
- Real-time channels (websocket, server-sent events, long polling): B must not receive A's events.
- A permission change in one session must show up in the other after reload; stale elevated UI is minor, a stale API
  right is important.

### 9. Soft-deleted, archived and expired records
- After A deletes or archives a record, B and anonymous must still be refused, and A must see the documented behaviour (404, or
  a visible "archived" state). Direct id access to a deleted record should not return the data.
- Deleted records must be absent from lists, search, exports, counts, autocomplete and related pages. Check that a
  restore action is limited to authorized roles.
- Expired or revoked shares and links (shared document, temporary file link) must stop working at the stated time.
- Deleted users: their records, tokens and notification subscriptions stop working or are reassigned as documented.

### 10. Bulk endpoints
- Bulk update, delete, assign, import and export accept many ids. Send a batch of one id you own and one that
  belongs to account A (a `QA-` record created by the run). Either the whole batch is refused or only the owned id is
  changed, with a clear result per id. Changing or exposing the foreign id is critical.
- Check "select all" and filter-based bulk actions: a filter that matches other tenants' rows must be scoped first.
- Imports: rows containing ids, owner or tenant columns must not override the importer's scope.
- Limits: a bulk request with an excessive number of ids should be refused cleanly (4xx), not time out.

### 11. Impersonation and delegated access
- "Log in as", "view as", support access and delegated accounts must be limited to the roles documented for them.
  A lower role calling the impersonation endpoint must get 403.
- While impersonating: a visible indicator exists, actions are attributed to the real actor in audit data where visible,
  and sensitive actions (password change, MFA changes, deleting the account) are blocked or re-authenticated.
- Ending impersonation really ends it: the elevated or borrowed token stops working. Impersonating an equal or higher
  role (another admin) should be refused unless documented.
- Delegation (assistant, shared inbox, parent/child accounts): the delegate sees only the granted scope.

### 12. Designing cross-tenant probe chains (runner format)
Pattern: A creates and captures, B tries every operation, A checks nothing changed, B's list does not contain it, anonymous
is refused. Use ids from the capture, never guessed ones, and prefix all data with `QA-`.

```json
[{"id":"ISO1","role":"role-a","method":"POST","path":"/things","body":{"name":"QA-iso-1"},"capture":{"thingId":"$.id"}},
 {"id":"ISO2","role":"role-b","method":"GET","path":"/things/{{thingId}}","expect":{"status":[403,404],"body_not_contains":"QA-iso-1"}},
 {"id":"ISO3","role":"role-b","method":"PATCH","path":"/things/{{thingId}}","body":{"name":"QA-hijack"},"expect":{"status":[403,404]}},
 {"id":"ISO4","role":"role-b","method":"DELETE","path":"/things/{{thingId}}","expect":{"status":[403,404]}},
 {"id":"ISO5","role":"role-a","method":"GET","path":"/things/{{thingId}}","expect":{"status":200,"json":[{"path":"$.name","equals":"QA-iso-1"}]}},
 {"id":"ISO6","role":"role-b","method":"GET","path":"/things","expect":{"body_not_contains":"QA-iso-1"}},
 {"id":"ISO7","role":"anonymous","method":"GET","path":"/things/{{thingId}}","expect":{"status":[401,403,404]}}]
```
- Repeat the chain for every resource type that has an owner or tenant, and for every endpoint family that takes the id
  (detail, sub-resources, actions, files, exports).
- Add a vertical variant: lower role against the admin operation, then the admin reading the result to confirm no change.
- Always include the follow-up read as owner (ISO5): a refused write that still changed data is the worst case, and the 4xx
  alone would hide it.
- When a probe returns 200, read the body to check what came back. An empty list or a filtered result for B is correct for a
  list endpoint; another tenant's record in it is the defect. A 200 `{}` or `{"success":true}` on a write needs the
  owner read-back to prove whether anything changed.

### 13. Minimal evidence
- Record: role used, method and path, the status, which operation, and the **names** of the exposed fields or the count of
  records that should not have been visible. One example record is enough; do not page through or download everything.
- Do not put personal data, customer names, emails, phone numbers or token values in the report text. Describe them
  generically ("a customer's phone number") and say screenshots of that page should be reviewed before sharing.
- Keep the sanitized runner evidence and its reproduction command. Include the second request that proves it is the
  other tenant's data (a `QA-` marker you planted is the best proof because it needs no real data).
- Stop probing a hole once it is proven twice. Report it and move on; extending reach to prove severity is not allowed.

## Severity hints
- **critical**: one tenant or customer can read, change or delete another's data (any object, list, search, export,
  attachment or notification); a lower role performs an admin function; self-promotion of role, owner or tenant; mass
  assignment of money, status, owner or privilege fields; bulk or import paths that bypass scoping; impersonation open to
  the wrong role; a cached response shown to another user.
- **important**: exposure of fields a role should not see within a permitted record; stale elevated rights after a
  demotion; soft-deleted data still reachable by its owner against policy; 403 versus 404 allowing id discovery; shares
  that never expire; read access where only list access was intended.
- **minor**: UI shows a control the role cannot use (API still refuses); inconsistent denial messages or status
  codes; wording of access denied pages; slightly different status on repeated denials.

## Safe on staging
- Write or delete probes touch only `QA-` records your run created. For reads of other tenants' data use records you
  planted; never enumerate real customers or walk id ranges.
- Do not try to crack ids, tokens or signed links. One or two probes per reference are enough to show whether a check exists.
- Do not escalate a proven hole into extracting data; stop at the minimal proof and record the field names.
- If a probe returns what looks like real personal data, stop that line of testing, avoid copying it, and report it.
- Clean up your own created records after the chain, as owner A, and confirm the cleanup.

## Common bug patterns
- Authorization exists only in the front end, or on the page but not on the API behind it.
- The query finds a record by id alone, without also filtering on the caller's tenant or owner.
- Tenant or user id taken from the request (body, header, query) instead of the verified token.
- Permission checked on the parent object but not on the nested child; or checked on the type ("may view orders") but
  not the instance ("this order").
- Admin routes registered under a regular router that lacks the role middleware; new routes missing from the policy list.
- Serializer returns the whole model; update binds the whole body to the model (no allow-list of writable fields).
- Export, report, search index, file storage and notification code written later and not reusing the scoping helper.
- Cache key lacks the user or tenant; shared CDN rule treats API paths as static.
- Soft-delete or archive flag missing from one query, so deleted rows come back in lists or direct reads.
- Bulk handlers check the first id only, or check each id after the action has run.
- Background worker runs with a system identity and no tenant context.

## See also
`auth-and-sessions.md`, `api-testing.md`, `security-checks.md`, `search-filter-pagination.md`, `file-uploads.md`,
`test-design.md`, `bug-reporting.md`
