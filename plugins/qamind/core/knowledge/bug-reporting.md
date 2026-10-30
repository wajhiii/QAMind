# Bug reporting

Load this when you are about to write up a finding, decide between finding, unconfirmed and not tested, choose a severity, or
merge duplicates. The goal is a report a developer can act on without asking you anything, and a manager can understand in
one read.

## Anatomy of a good finding
- **Title**: names the place, the wrong outcome and the trigger. Pattern: "<Area>: <what goes wrong> when <condition>".
  Good: "Orders: a negative quantity is accepted and gives a negative total". Weak: "Order bug", "Validation broken",
  "Quantity should be checked" (a fix request, not a symptom). Leave the cause out of the title.
- **Summary**: one or two plain sentences: who is affected, what they see, what it costs them. A non-technical reader
  should understand the stake from this alone.
- **Steps**: numbered, exact, repeatable (see below).
- **Expected** and **actual**: side by side, each with concrete values (see below).
- **Evidence**: proof of the actual result, at least one file per finding.
- **Environment**: where and how you ran it (see below).
- **Suspected cause**: optional, clearly labelled, with its evidence level (see `debugging-and-root-cause.md`).
- **Suggested regression test**: one sentence on the check that would fail today and guard the fix.

## Choosing severity
Decide from user impact first, then adjust for reach. Ask in this order:
1. Does it expose, lose or corrupt data, change money, or break a permission or security boundary? That is **critical**, even
   if it needs an unusual input. Rarity can lower urgency but does not change the class of harm.
2. Does it block users from a core task with no workaround? **critical**.
3. Does the task work but badly, confusingly or with a workaround (wrong ordering, misleading message, lost input that can
   be retyped)? **important**.
4. Is it cosmetic, wording or a small annoyance? **minor**.
- Judge by the worst realistic consequence, not by how it looked in your run. A wrong total on one test order is a money bug.
- Do not raise severity because you found it often, or lower it because it was easy to find.
- One root cause, one finding: take the severity of its worst manifestation.
- If you are unsure whether the product intends the behaviour, report it anyway, say what you are unsure about in the
  actual-result text, and choose severity by likely user impact.

## Exact reproduction steps
- Start with the state: role, signed in or not, browser and viewport (UI) or request method and path (API), and any data that
  must already exist. Name data you created (`QA-` prefixed) and how to create it.
- Then one action per line, using words that appear on screen: the page and menu path, the label of each control, the exact
  value typed. Say "click the button labelled Save", not "click it". Avoid pronouns that need context.
- End with the observation: what to look at and where (the toast text, the status of the request, the total in the row).
- For API findings, give method, path, role, body and the response status; point to the evidence file holding a ready command.
- Include timing only when it matters (double submit within a second, wait for expiry, order of two actions).
- Check the steps by following them yourself from a fresh page load or fresh session. A step you skipped in your head is
  the usual reason a developer cannot reproduce.

## Expected versus actual
- **Expected** cites its source: the spec, a stated business rule, the way the same thing works elsewhere in the product, or
  a widely accepted standard (for example 400 for invalid input, a label for every field). "I think it should" is not a source.
- Put numbers on both sides: "total 45.00" versus "total -45.00", "HTTP 400" versus "HTTP 201".
- Copy error text exactly, including any codes. Do not retype from memory.
- Show arithmetic you recomputed independently so the reader can check it.

## Evidence
- Capture it at the moment the problem is visible: the screenshot, the console lines, the failed request, the response body.
- Open and check each screenshot you saved. A file you never looked at is not evidence. Say in words what it shows.
- For interactive bugs capture before and after the action. For static problems (wording, layout) one screenshot and a
  sentence is enough.
- Keep evidence small and sanitised: relevant lines only, tokens and cookies replaced, no bulk copies of personal data.
- Name evidence files by a short slug that describes the content, not by an issue number.

## Minimal reproduction
After you have reproduced the problem twice, shrink it:
- Remove steps one at a time; keep only those without which it stops happening.
- Shrink the input: fewer fields, shorter text, the smallest value that still triggers it. Halve a large payload until the
  trigger is isolated.
- Try the simplest role and a fresh session. Note which conditions do not matter ("also happens without a filter").
- Test the API path separately. If the API shows it too, the cause is behind the UI, and that belongs in the finding.

## Environment
Record: the environment name (staging or local, never a secret), build or commit if known, browser and version, viewport,
role, locale and time zone if relevant, date and time of the run, and relevant flags or data state. For a UI finding, the
viewport and role are mandatory.

## Grouping duplicates
- Ask: would one fix resolve all of these? If yes, one finding. List every affected page, form, role, browser or viewport
  inside it, and cite evidence for the most telling one or two.
- Different symptoms from one cause are one finding with several symptoms. The same symptom from different causes is several
  findings, because each needs its own fix.
- Do not split a finding by viewport or browser unless the behaviour differs and needs a different fix.
- Before reporting, check your own list so you do not file the same problem twice under different words.

## Avoiding false alarms
Before you call something a finding, confirm each of these:
- It reproduces from a fresh page load or session, twice, with the same steps.
- The expectation has a source, and you checked whether the behaviour is documented or intended.
- You used the right role. A 403 for a role that should not do the action is correct, as are 401 without credentials,
  404 for an unknown id and 400 for invalid input.
- The data was not damaged by your own earlier probes (leftover `QA-` records, a half-completed flow, an edited setting).
- The environment is healthy: no ongoing outage, no expired session, no blocked origin, no stale cache. Reload once
  and repeat in a fresh profile if you suspect state.
- Your input was what you meant (right value, right field, no stray space, no autofill).
- Numbers were recomputed independently, and dates and times were compared in the same time zone.
- A leading signal (an automatic flag, an audit lead, a console warning) was confirmed on the page or in the
  response. Signals are leads, not verdicts.

## Finding, unconfirmed, or not tested
- **Finding**: reproduced at least twice, evidence exists, and it breaks a sourced expectation or causes likely harm. Behaviour
  that reproduces but may be intended is still a finding; state the doubt.
- **Unconfirmed**: seen, but you could not reproduce it twice. Record what you saw, the conditions, the number of attempts
  and the reason it is unconfirmed. For an intermittent problem write the observed ratio ("2 of 6 attempts").
  Do not park a reproducible problem here.
- **Not tested**: you did not try it. State the true reason (no credentials for the role, environment broken, needs a
  feature that is not configured, would cause a real-world side effect, outside this pass). Never describe an untested
  area as passing and never invent "time budget reached".
- Never promote an unconfirmed item to a finding by rewording it. Reproduce it, or leave it where it is.

## Wording rules
- State facts in neutral language: what you did, what you saw. No blame, sarcasm, capitals or words like "terrible".
- Keep observation and opinion apart. Causes and fixes belong in their own labelled fields.
- Be quantitative: counts, values, statuses, durations, "2 of 2 attempts". Replace "sometimes" with a ratio.
- One problem per finding. A finding with "also" in the summary is probably two findings.
- Write for the reader who was not there: define the abbreviation, name the page, avoid your own shorthand.
- Do not repeat secrets or personal data. Describe them generically ("a customer's phone number").

## Anti-patterns
- "It doesn't work" or "page is broken" with no action, input or result.
- A title that states a wish ("Add validation") or a cause ("Missing null check").
- Steps that start in the middle ("then the second tab...") or rely on state the reader cannot create.
- Evidence that does not show the claim: a whole-page screenshot where the problem is a small detail you never described.
- Expected result taken from your taste, or from another product.
- Seven findings for one root cause, or one finding that hides three.
- A severity inflated to get attention, or a cosmetic issue labelled critical.
- Reporting a signal without reading the response it came from.
- Reporting something seen once as a confirmed finding.
- Reporting an environment fault as a product bug.

## Severity hints
- **critical**: another customer's record is readable; money is miscalculated; data is silently lost; a core flow cannot be
  completed by anyone; a lower role performs an admin action.
- **important**: works badly or confusingly with a workaround; validation exists only in the UI; stale data after a change;
  an unhelpful error on a common path; an intermittent failure that users can retry.
- **minor**: typo, misaligned element, inconsistent wording, a small annoyance with a clear workaround.

## Safe on staging
- Never put credentials, tokens, cookies or `Authorization` values in a report. Write `Authorization: Bearer $TOKEN`.
- Keep evidence to the lines that matter. If a screenshot or response shows what looks like real personal data, describe it
  generically in the text and note that the evidence should be reviewed before sharing.
- Reproduce with your own `QA-` data. Do not re-run a destructive step on data you did not create.

## See also
`debugging-and-root-cause.md`, `exploratory-charters.md`, `flaky-tests.md`, `browser-testing.md`, `fixing-safely.md`.
