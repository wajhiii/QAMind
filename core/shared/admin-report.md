# The admin report (plain language)

`ADMIN-REPORT.md` is read by a manager or admin with **no technical knowledge**. It is rendered from the same files as the
technical report, so the problems and severities are identical. You write the plain-language wording; the tool computes the rest
(the verdict on the first line, the summary, the results-by-area table, the trend, the order, and the links).

## What you write

1. **`plain` block on every finding** in `findings.json` (next to the technical text):
   - `title`: what is wrong, in business words. Not how it works inside.
   - `where`: `Web UI → menu → page`, for example `Client Portal → My orders → an order page`. For a problem that lives behind the screens
     write `Behind the screens (the part that talks to the Client Portal)`.
   - `what_happens`: one to three sentences about what a person experiences or risks.
   - `who_is_affected`: which people, in everyday words ("every customer", "staff who read order totals", "customers of Company B").
   - `how_to_see_it`: numbered steps a non-technical person can follow **on screen**, or `[]` if it cannot be seen on screen (see below).
   - `expected`: one sentence: what should happen instead.
   - `screenshot` (optional): a run-folder path to the most helpful image; defaults to the first image in `evidence`.
2. **`plain: { "area", "reason" }` on every entry of `not-tested.json`**: what was not checked and why, in everyday words
   ("Password reset emails" / "Checking them would send real emails and no safe test mailbox is set up"). Every coverage row you mark
   `not-tested` needs its own entry here with the **same `area` text as the coverage row**, otherwise the report lists it twice or in
   technical words. One entry per thing: do not describe the same gap twice.
3. **`data/admin.json`**: `{ "biggest_risk": "<one plain sentence>", "next_steps": ["<at most three plain steps>"] }`.
4. **Tag every `coverage.json` row**: `ui` (the web UI's name from the config) on UI rows, and `critical_flow` (1, 2, 3 ... as numbered in
   `config.critical_flows` from `run start`) on rows that cover a critical journey. The verdict can be "Ready" only if every journey has
   rows and all of them are `tested`.

## How to write `how_to_see_it`

- Only things a person can do with a normal browser and the test accounts: sign in, click, type, look. Start with who signs in
  ("Sign in to the Client Portal as a customer of Company A"); never write a password, a variable name or a secret.
- One action per step. Use the exact words on the buttons and menus as they appear on screen. End with what they will see ("You see
  Company A's order.").
- The web address of a page is fine when it is visible in the address bar ("the address ends in a number such as 1050").
- If seeing the problem needs a tool, a request, code, or waiting for something you cannot show on screen, write `[]`. Do not give half a
  recipe or technical steps: the report then says plainly that a developer must confirm it. That is the honest answer for problems
  that live behind the screens.
- Steps must be **self-contained and in the right order.** Name the thing to use ("open an order that already exists", "use a customer of
  Company A") and keep the order that triggers the problem. For an old value that is still shown, that means: look at the list **first**,
  then make the change in the other portal, then look at the list again. A reader who skips the first look will not see the problem.
- **Never depend on data that only existed during your check.** A reader follows the steps later, on the product as it normally is: an
  order, number or record you created while testing may not be there. Do not write "open order 1039 (placed during this test)". Either
  use something that exists in the product normally ("open any existing order and note the number at the end of its address"), or put the
  steps that create it first ("place a new order as a customer of Company A, then note the number shown").
- Explain browser actions in plain words the first time: "refresh the page (the circular arrow next to the address bar)", "make the window
  narrow by dragging its edge, or use a phone". Explain any specialist word in the same sentence ("software that reads the screen aloud for
  blind users"), or avoid it.
- **Describe exactly what the screen shows; never overstate.** If the page shows a heading and a spinner, do not write "shows nothing".
  Someone will follow your steps and compare.
- Write in "we" or neutral wording, never "I". Do not repeat the report's own explanations (the severity words and "behind the screens" are
  already defined at the end of the report).
- Before you finish, follow your own steps once as written (or check each label against what you saw). A step that does not match the
  screen is worse than no step.

## Words you must not use outside the technical parts

The lint rejects them. Rewrite and rebuild. No status codes or "HTTP"; no stack traces or exceptions; none of API, JSON, SQL, CSS, endpoint,
payload, header, token, cookie, selector, parameter, backend, frontend, null, undefined; no request methods (GET, POST ...); no code
formatting; no file paths; no ISSUE ids (the tool adds the one "For developers" link).

| Instead of | Write |
|---|---|
| token, session cookie | sign-in, being signed in |
| API, endpoint, backend | the part of the system behind the screens |
| 500 / server error | the system fails or shows an error |
| stack trace | internal technical details |
| IDOR, broken access control | one customer can see another customer's data |
| validation missing | the system accepts something it should refuse |
| cached / stale | an old value is still shown |

## Severity, verdict and honesty

- Use the same severity as the technical finding (Critical = people blocked, data wrong, lost or exposed, money affected, a security or
  permission breach; Important = works badly, a workaround exists; Minor = cosmetic or a small annoyance). Never soften a Critical or
  Important problem in the plain wording.
- The first line (the release verdict) is computed from the default rules: Ready only with no critical problems, at most two important
  ones, a healthy test environment, and every key journey tested. You cannot edit it, and it can never say Ready if a journey was not tested.
- Say nothing the technical report does not support. Plain does not mean vaguer or more certain.
- `biggest_risk` and `next_steps` are your judgement: be concrete ("Have a developer fix the access problem first", not "improve security").

## Email-ready copy

Only when the user asks for it: `report export-html --run <id>` writes `ADMIN-REPORT.html`, one self-contained file with the screenshots
embedded. Tell the user that screenshots are not masked automatically and should be checked for personal information before emailing.
