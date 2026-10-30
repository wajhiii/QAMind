# Flaky tests and intermittent failures

Load this when a UI or API check passes and fails without any change, when the product's own test suite has unstable tests,
or when something seen once will not repeat. It helps you decide whether the check is unreliable or the product is, and how
to make your own checks stable.

## First principle
A flaky check is a symptom with a cause: timing, shared state, data collision, network, clock, ordering or resources. Name the
cause before you change anything. Widening a timeout, adding a retry or skipping the check hides the symptom and is not a
fix. And an intermittent failure can be the product misbehaving: a race, a slow dependency or a cache bug is a real defect that
happens to be hard to catch.

## Is it the check or the product?
Collect these before you decide. Run the same steps a small number of times (five to ten for a read or a cheap `QA-` write)
and count.

| Observation | Points to |
|---|---|
| The failure is "element not found" or "timeout", and the page looks right in a screenshot taken a moment later | the check (timing, stale reference, wrong target) |
| The failure disappears when you wait for a named condition instead of a delay | the check, unless the wait exceeds what a user would tolerate |
| The failure depends on which other checks ran before | the check (shared state), or product state leaking between users |
| Two runs with identical fresh state and inputs give different results | the product or the environment |
| The failing run shows a 5xx, an error body, a wrong value or a console error, while the passing run does not | the product |
| The API reproduces the same variability with no browser at all | the product (the browser is not involved) |
| A user could trigger it by clicking fast, going back, or using two tabs | the product (a race a user can hit) |
| It fails only on the first request after idle, or only at a certain time of day | environment or product (cold start, scheduled job, expiry) |
| Different outcomes only when data collide with leftovers from earlier runs | the check's data, plus a possible product gap in duplicate handling |

Rules of thumb:
- If the failing run contains evidence from the product side (server error, wrong data), treat it as a product problem
  until shown otherwise.
- If you can only explain the failure by your own timing or your own leftover data, fix the check and say so.
- If you cannot decide, keep the item as unconfirmed with the observed ratio, and record what you ruled out.

## Why an intermittent product bug is still a finding
- Users meet it too, and rarely reproduced problems are the ones that corrupt data or lose money quietly.
- The reproduction bar is two occurrences, not a fixed rate. If it happens in 2 of 6 attempts with the same steps, it is a
  finding. Record the ratio, the conditions that raise or lower it, and the evidence from a failing attempt.
- Choose severity by impact on a failing attempt, not by frequency. An intermittent double charge is critical; an
  intermittent slow tooltip is minor.
- If you saw it once and the next attempts passed, it belongs in unconfirmed with the number of attempts. Do not discard it
  and do not promote it.
- Try to make it deterministic: add a delay at the suspected gap (for example, submit twice quickly), slow the network,
  change the order, use two sessions. A forced reproduction turns "sometimes" into evidence.

## Common causes in UI and API checks
- **Timing**: reading the page before it has updated; a fixed delay that is too short on a slow machine and too long on a fast one.
- **Stale references**: an element handle taken before a re-render or navigation; the page changed but your reference did not.
- **Animations and transitions**: clicking while an element moves, fades or is covered by a loading overlay.
- **Shared state**: checks that depend on each other, a test account whose settings another check changed, leftover records,
  a session or cookie left from an earlier role.
- **Data collisions**: fixed names or ids that clash with a record from a previous run or a parallel run; unique constraints.
- **Ordering**: assuming a list order that the product does not guarantee (ties, unsorted results, parallel inserts).
- **Time and time zones**: checks near midnight, month end, daylight-saving changes; comparing local and UTC; expiry windows;
  a machine clock that differs from the server's.
- **Async jobs**: emails, exports, imports and queues that finish later; asserting the result before the job completes.
- **Network and dependencies**: slow or failing third-party calls, rate limits, a cold service, a service worker or cache
  returning old data.
- **Resources**: exhausted connection pools, disk space, memory, leaked sessions in long runs.
- **Environment**: a deploy or restart in progress, a different build behind a load balancer, a feature flag toggled.

## Diagnose
1. **Reproduce the instability.** Repeat the check several times alone, then in its normal order. If it only fails in the
   full run, order or shared state is involved.
2. **Capture the failing run.** Keep the screenshot, the console and the network list from the failure and from a passing run
   (see `browser-testing.md`). Find the first point where the two runs differ.
3. **Find the polluter if it is order-dependent.** Run the failing check alone (it should pass), then after the earlier
   checks (it should fail). Halve the earlier checks repeatedly until one remains. Look in it for state it leaves behind: a
   record, a setting, a session, a flag, a running job.
4. **Force the suspected cause.** Inject the condition that you think causes it (a delay, a fixed clock, an overlapping
   action, a pre-existing record) and show that the check then fails every time. Without a forced failure the cause is
   still a guess.
5. **Compare environments.** Does it fail against a fresh local run as well, or only on staging? Only on one means
   configuration or data.

## Stabilise
- **Wait for a condition, not for time.** Wait until the text appears, the control is enabled, the URL changes or the
  request returns, with an upper limit and a clear failure message. If you must poll, use short intervals and a generous total.
- **Wait for the right thing.** For an async job, poll the visible result (status, count) rather than sleeping.
- **Target by what users perceive**: role and accessible name, label, visible text; scope to a row or section for repeated
  controls. Avoid positions and deep structure.
- **Isolate**: each check creates its own `QA-` data with a unique suffix, starts from a fresh session, and cleans up only what
  it made. Rebuild the starting state instead of relying on cleanup of other checks.
- **Control the clock** when the check depends on time: avoid running near midnight or month end, state the time zone, and
  compare in one zone.
- **Control outside services**: use test mode or a fake. Never call a real payment, email or SMS provider.
- **Assert on the final state**, not on the absence of errors: the stored value, the response body, the count.
- **Order independence**: do not rely on a default list order unless the product promises it; sort or select by identity.

## Retry and quarantine policy
- A retry is a diagnostic, not a green result. A check that fails and then passes on retry is classified flaky and reported as
  flaky, never as passed.
- Retry only when the cause is known and outside the product (a documented outage, a deploy in progress). Bound the number,
  count it and record it.
- Never retry until green after a failure that involves wrong data or a server error. That is evidence; investigate it.
  Repeating the steps to measure how often it happens is diagnosis, and is fine.
- Do not use retries to hide a product race. If the retry passes because the second attempt found the data ready, the
  product has an ordering or latency problem worth a finding.
- Quarantine means moving a flaky check out of the pass-or-fail set while it is fixed: record its name, the suspected cause
  and an owner. Do not leave it quarantined indefinitely; unstable checks erode trust because people start to ignore every red.
- A check that fails reliably is better than one that fails sometimes: the first gives a clear signal.
- Do not weaken assertions, raise thresholds or delete the check to get a pass.

## Reporting
- Flaky check in the product's own suite: report it as a finding about test reliability (it hides regressions), with the failure
  ratio, the cause if you found one and the evidence. Severity: important if it gates releases or masks real regressions, minor
  if it is isolated and harmless.
- Your own unstable check: fix it, and say in the notes which area had to be re-run and why. Do not list the area as passing
  if the final run did not pass.
- Intermittent product bug: a finding with the observed ratio, exact steps, conditions, the forced reproduction if you built
  one, and evidence from a failing attempt.
- Seen once and not repeated: unconfirmed, with attempts and conditions.

## Severity hints
- **critical**: an intermittent failure that loses or corrupts data, double-charges, leaks another user's data, or blocks sign-in.
- **important**: an intermittent failure users can retry, stale data that corrects itself after a reload, or an unstable check
  that hides regressions.
- **minor**: an intermittent cosmetic glitch or a harmless timing quirk.

## Safe on staging
- Repeat only a few times (five to ten). Use two to five concurrent requests to provoke a race, never a load test.
- Create `QA-` data with a unique suffix and remove what you created.
- Do not trigger real payments, emails or SMS while repeating a flow.
- Do not delete or alter data you did not create to make a check stable.

## Common bug patterns
- Double submit creates two records because the button stays enabled and the server has no unique key.
- A read right after a write returns old data (cache, replica lag, list not refreshed).
- A background job finishes after the page reports success.
- Two sessions overwrite each other silently (last write wins with no conflict notice).
- Expiry or schedule logic that depends on the server time zone.
- A list whose order changes between loads because of an unstable sort.

## See also
`browser-testing.md`, `debugging-and-root-cause.md`, `bug-reporting.md`, `fixing-safely.md`, `api-testing.md`.
