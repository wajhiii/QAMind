# Knowledge sources

Every file in `core/knowledge/` was written from the sources below, **in our own words**: ideas, checks and structure were
synthesized from what was read, and no passages were copied or closely paraphrased. Where a source is under a share-alike licence
(for example OWASP, MDN, Wikipedia, Rails Guides: CC BY-SA) the knowledge files contain our own wording only, and the credit here is
given for the ideas. Where a licence could not be verified it says so and the work is treated as all rights reserved, with ideas
summarized and no text reused.

All pages were accessed on 2026-10-30. Official documentation was preferred over blogs. Authors read pages through a summarizing
fetch tool, so a few long pages were read only in part; those are marked in the entry. Claims that rest on common knowledge rather
than a fetched page, or on checks run in headless Chromium or Node, are noted in the review notes at the end.

## gstack (credit and MIT notice)

The QA methods behind QAMind (charters before probing, evidence for every finding, a regression test before every fix, minimal
fixes, stop rules and self-regulation, reporting untested areas as blocked) were studied in [gstack](https://github.com/garrytan/gstack)
and adapted in our own words. No gstack text was copied into the knowledge base, so no notice is required in the files themselves;
the licence is reproduced here as credit.

```
MIT License

Copyright (c) 2026 Garry Tan

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
(the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
```

## Method, exploratory testing, debugging, fixing, browser technique

### Eradicating Non-Determinism in Tests

- URL: https://martinfowler.com/articles/nonDeterminism.html
- Publisher: Martin Fowler
- License: not stated on the article text (copyright Martin Fowler; the site's Disclosures page was not read; all rights reserved assumed); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `flaky-tests.md`
- What we used: Causes and remedies for unstable checks: quarantine with limits, isolation by rebuilding state, polling for async results instead of sleeping, test doubles for remote services, controlling the clock, resource leaks, and the loss of trust from ignored failures.

### git-bisect documentation

- URL: https://git-scm.com/docs/git-bisect
- Publisher: Git project (git-scm.com)
- License: not stated on the page (all rights reserved assumed); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `debugging-and-root-cause.md`
- What we used: Binary search over history finds the first bad commit in about log2(n) checks; a scripted check needs a clean pass/fail/cannot-test exit status; broken scripts can be mistaken for bad commits; keep test scripts outside the repository.

### gstack browse skill (browser usage)

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/browse/SKILL.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `browser-testing.md`, `bug-reporting.md`
- What we used: Snapshot-then-act with refs that go stale after navigation; wait for a selector or URL rather than sleeping; report console errors including an empty result; view every saved screenshot; work only in tabs you opened; never follow logout or delete links by accident.

### gstack ETHOS

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/ETHOS.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `fixing-safely.md`, `debugging-and-root-cause.md`, `flaky-tests.md`
- What we used: Do not claim checks you did not run; if two fixes rest on one assumption, test that assumption directly; give each writer its own state instead of retrying around a shared one.

### gstack investigate blast-radius section

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/investigate/sections/blast-radius.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `fixing-safely.md`, `debugging-and-root-cause.md`
- What we used: Before changing shared helpers or data formats, find the one fact that makes the change safe, check non-code consumers, rate a safety claim by how strong its evidence is, never invent callers; this shaped our evidence levels for a suspected cause.

### gstack investigate flake recipe

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/investigate/sections/flake.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `flaky-tests.md`
- What we used: A flake is a symptom whose cause must be named; repeat the check many times to localise it; diff passing and failing runs at the first divergence; force the suspected cause to fail every time; widening timeouts, adding retries or skipping are not fixes; bounded, logged reruns only when the cause is known and external.

### gstack investigate polluter recipe

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/investigate/sections/polluter.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `flaky-tests.md`
- What we used: Order-dependent failures: confirm the victim passes alone and fails after earlier checks, halve the earlier checks until one polluter remains, inspect it for leaked state, fix the leak at its source rather than patching the victim.

### gstack investigate race recipe

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/investigate/sections/race.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `flaky-tests.md`, `debugging-and-root-cause.md`
- What we used: Make a race reproduce on demand by widening the suspect gap, narrow it, assert the final state rather than the absence of errors, and treat a smaller window as no fix (we scaled concurrency down to a few requests for staging).

### gstack investigate skill (root-cause debugging)

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/investigate/SKILL.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `debugging-and-root-cause.md`, `fixing-safely.md`
- What we used: No fix before a root cause; reproduce, check recent changes, confirm a hypothesis with an experiment, stop after three failed hypotheses, ask when a fix spans many files, never claim an unverified fix, and attach a confidence level to a claimed cause.

### gstack LICENSE

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/LICENSE
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `browser-testing.md`, `bug-reporting.md`, `debugging-and-root-cause.md`, `exploratory-charters.md`, `fixing-safely.md`, `flaky-tests.md`
- What we used: Verified the licence and copyright holder for the gstack material; methods are adapted in our own words and no gstack text is copied, so no notice needs to ship inside the knowledge files.

### gstack qa browser-verify section

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/qa/sections/browser-verify.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `fixing-safely.md`, `browser-testing.md`
- What we used: Verify a browser fix by repeating the original interaction plus one neighbouring normal use from the affected page, save new after-evidence under a new name and never overwrite earlier evidence, and compare snapshot and console output.

### gstack qa exploratory section

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/qa/sections/exploratory.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `exploratory-charters.md`, `bug-reporting.md`
- What we used: Charter fields, one probe at a time with a recorded result, check the success path and its durable effects before failure cases, replay the exact failing steps before acting, missing prerequisites are never a pass, exit when all scoped items are tested or blocked.

### gstack qa issue taxonomy

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/qa/references/issue-taxonomy.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `bug-reporting.md`, `exploratory-charters.md`
- What we used: Cross-checked our severity ladder and the categories of issue worth probing (visual, functional, UX, content, performance, console, accessibility); our wording and levels are QAMind's own.

### gstack qa patterns section

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/qa/sections/qa-patterns.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `bug-reporting.md`, `browser-testing.md`, `exploratory-charters.md`
- What we used: Report only evidenced issues and never invent any to hit a count, confirm by repeating, minimise the reproduction, deduplicate by root cause, before and after captures for interactive bugs, check the console after every interaction, test as a user rather than reading source during black-box discovery, leave untested areas out of any score.

### gstack qa skill (test, fix, verify loop)

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/qa/SKILL.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `fixing-safely.md`, `debugging-and-root-cause.md`, `bug-reporting.md`
- What we used: Ideas for the fix loop: regression test before the fix with a value check, minimal change, re-test plus adjacent happy path, per-fix commits, verified/best-effort/reverted classification, revert-only-your-own-change, and stop rules (two reverts, unrelated file edit, hard cap).

### gstack qa-only skill (report-only QA)

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/qa-only/SKILL.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `exploratory-charters.md`, `bug-reporting.md`, `fixing-safely.md`
- What we used: Charters written before probing with expected result, risk, entry point and exit condition; report-only runs never change code; blocked areas reported as blocked; proposed tests need a stated value.

### gstack repository overview (README and directory listings of qa, qa/sections, qa/references, investigate, investigate/sections)

- URL: https://github.com/garrytan/gstack
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan (verified from the repository LICENSE file)
- Accessed: 2026-10-30
- Used for: `exploratory-charters.md`, `bug-reporting.md`, `debugging-and-root-cause.md`, `fixing-safely.md`, `flaky-tests.md`, `browser-testing.md`
- What we used: Located the qa, qa-only, browse, review and investigate skills and their section files; no text from the overview itself is reused.

### gstack review skill (pre-merge bug review)

- URL: https://raw.githubusercontent.com/garrytan/gstack/main/review/SKILL.md
- Publisher: Garry Tan (GitHub)
- License: MIT License, Copyright (c) 2026 Garry Tan
- Accessed: 2026-10-30
- Used for: `debugging-and-root-cause.md`, `fixing-safely.md`, `bug-reporting.md`
- What we used: Cite the exact code line behind a claim or mark it unverified, grep sibling call sites for the same defect, never weaken gates to pass, regression test confirmed red before the fix, and failed or not-run checks mean incomplete.

### How to Report Bugs Effectively

- URL: https://www.chiark.greenend.org.uk/~sgtatham/bugs.html
- Publisher: Simon Tatham
- License: Copyright 1999 Simon Tatham; page states the OpenContent Licence; ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `bug-reporting.md`, `flaky-tests.md`
- What we used: Describe actions, observation and expectation separately, give exact error text and environment, keep facts apart from theories about the cause, avoid vague wording, and record how often and under what pattern an intermittent problem occurs.

### Of Testing Tours and Dashboards

- URL: https://developsense.com/blog/2009/04/of-testing-tours-and-dashboards
- Publisher: Michael Bolton, DevelopSense
- License: not stated (all rights reserved assumed; page shows a copyright line for DevelopSense); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `exploratory-charters.md`
- What we used: What a testing tour is (a directed search for one class of attribute), the names of well-known tours, and the caveat that no tour is universally best so choice depends on the tester, product and risk.

### Playwright MCP README

- URL: https://github.com/microsoft/playwright-mcp
- Publisher: Microsoft (GitHub)
- License: Apache License 2.0 (verified from the repository LICENSE file)
- Accessed: 2026-10-30
- Used for: `browser-testing.md`
- What we used: Tool semantics: accessibility snapshot versus read-only screenshot, actions take a ref from the latest snapshot, wait-for-text, console and network lists scoped to the page, resize, tabs, dialog and file-chooser handling, and persistent versus isolated profiles.

### Playwright: Actions (input)

- URL: https://playwright.dev/docs/input
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`
- What we used: Filling versus typing key by key, file input selection and chooser handling, keyboard operation of controls, and that forced or synthetic events skip real user behaviour.

### Playwright: Authentication

- URL: https://playwright.dev/docs/auth
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`, `flaky-tests.md`
- What we used: Saved session state is a secret that grants account access; one clean state per role; shared accounts are only safe when checks do not change server data; session storage is not carried over automatically.

### Playwright: Auto-waiting (actionability)

- URL: https://playwright.dev/docs/actionability
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`, `flaky-tests.md`
- What we used: Meaning of visible, stable, receives events and enabled before an action, and why a covered or moving element makes a click unreliable; informed our waiting-for-state and covered-control guidance.

### Playwright: Best Practices

- URL: https://playwright.dev/docs/best-practices
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 for the microsoft/playwright repository (verified from its LICENSE file; the docs live in that repository, the site page itself carries no separate licence statement); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`, `flaky-tests.md`
- What we used: Test what users see, prefer role/label/text targeting over structure, keep checks isolated with their own state, retrying assertions instead of one-shot checks, and use traces to diagnose failures.

### Playwright: Dialogs

- URL: https://playwright.dev/docs/dialogs
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`
- What we used: Dialogs are modal and block the page until handled, an unhandled dialog is dismissed automatically, and before-unload prompts behave as dialogs.

### Playwright: Emulation

- URL: https://playwright.dev/docs/emulation
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`, `flaky-tests.md`
- What we used: Viewport, locale, time zone and colour-scheme variation as ways to reproduce responsive and date-format bugs, and that the browser's time zone is separate from the machine running the checks.

### Playwright: Locators

- URL: https://playwright.dev/docs/locators
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`, `flaky-tests.md`
- What we used: Priority of role, label, text and test id targeting, strictness when several elements match, scoping by filtering and chaining (find the row, then the control), avoiding positional and long structural selectors, and frames as separate scopes.

### Playwright: Network

- URL: https://playwright.dev/docs/network
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`, `flaky-tests.md`
- What we used: Pair a UI action with the response it triggers, wait for the response that completes an action, redirects behave as one request chain, and service workers or caches can hide traffic.

### Playwright: Pages and contexts

- URL: https://playwright.dev/docs/pages
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`
- What we used: Pop-ups and new tabs must be caught when they open and waited on until loaded before reading them; pages in one context share its settings.

### Playwright: Retries

- URL: https://playwright.dev/docs/test-retries
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `flaky-tests.md`
- What we used: A check that fails then passes on retry is classed flaky, not passed; each check should be independent; a retry does not reset server-side state, so leftovers can change the outcome.

### Playwright: Screenshots

- URL: https://playwright.dev/docs/screenshots
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `browser-testing.md`
- What we used: Viewport, full-page and single-element captures and when each suits evidence.

### Playwright: Trace Viewer

- URL: https://playwright.dev/docs/trace-viewer-intro
- Publisher: Microsoft (playwright.dev)
- License: Apache License 2.0 (repository licence); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `flaky-tests.md`, `browser-testing.md`
- What we used: A failure record that combines actions, page state, network and console per step, recorded on the first retry of a failed check, which informed capturing a failing run and comparing it with a passing one.

### Product elements (SFDIPOT) post

- URL: https://developsense.com/?p=1773
- Publisher: Michael Bolton, DevelopSense
- License: not stated (all rights reserved assumed; page shows a copyright line for DevelopSense); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `exploratory-charters.md`
- What we used: The seven product-element prompts Structure, Function, Data, Interfaces, Platform, Operations and Time as a checklist of what to vary; the one-line meanings in our file are our own wording.

### Test Heuristics Cheat Sheet

- URL: https://www.ministryoftesting.com/articles/test-heuristics-cheat-sheet
- Publisher: Ministry of Testing (original by Elisabeth Hendrickson, James Lyndsay and Dale Emery)
- License: not stated (page shows Copyright 2006 Quality Tree Software and Copyright 2022 Ministry of Testing; all rights reserved assumed); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `exploratory-charters.md`
- What we used: Names of general probing heuristics (CRUD, follow the data, Goldilocks, boundaries, count, position, flood, sequences, interruptions, configurations) and the API mnemonic of verbs, authorization, data, errors and responsiveness.

### The Debugging Book: Introduction to Debugging

- URL: https://www.debuggingbook.org/html/Intro_Debugging.html
- Publisher: Andreas Zeller et al., debuggingbook.org
- License: Text under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International; code under MIT (stated on the page); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `debugging-and-root-cause.md`, `fixing-safely.md`
- What we used: The hypothesis, prediction, experiment loop with every experiment logged; mistake to defect to infected state to failure chain; fix the cause not the symptom; rerun failing and previously passing tests and look for similar defects.

### The Debugging Book: Tracking Bugs

- URL: https://www.debuggingbook.org/html/Tracking.html
- Publisher: Andreas Zeller et al., debuggingbook.org
- License: No licence statement in the part of the page read (first 100,000 characters); the book's text is CC BY-NC-SA 4.0 per its Introduction chapter; ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `bug-reporting.md`
- What we used: Reproduction steps are the most valuable part of a report, focused evidence and observed versus expected behaviour help, one issue per report, check for an existing report first, keep a neutral tone.

## Test design and feature areas (forms, lists, money, uploads, email)

### AIP-158: Pagination

- URL: https://google.aip.dev/158
- Publisher: Google API Improvement Proposals
- License: CC BY 4.0 for text, Apache 2.0 for code samples (verified at https://github.com/aip-dev/google.aip.dev)
- Accessed: 2026-10-30
- Used for: `search-filter-pagination.md`
- What we used: Page size defaults and caps, negative sizes refused, empty next token as the only end signal, opaque tokens that grant no authorization, changed parameters between pages being an error, and totals possibly being estimates.

### All-pairs testing

- URL: https://en.wikipedia.org/wiki/All-pairs_testing
- Publisher: Wikipedia
- License: CC BY-SA 4.0 (text; verified at https://en.wikipedia.org/wiki/Wikipedia:Copyrights)
- Accessed: 2026-10-30
- Used for: `test-design.md`
- What we used: The pairwise idea (every pair of values appears in at least one case), the cost-benefit rationale and the limits for three-way interactions; our worked example is our own.

### Automated Combinatorial Testing for Software (ACTS)

- URL: https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software
- Publisher: NIST Computer Security Resource Center
- License: not verified (NIST copyright pages returned 404); the page says its ACTS tool is public domain; ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `test-design.md`
- What we used: The finding that most failures involve one or two parameters (up to six at most), so covering all pairs or t-way combinations finds most interaction faults with far fewer tests.

### Boundary-value analysis

- URL: https://en.wikipedia.org/wiki/Boundary-value_analysis
- Publisher: Wikipedia
- License: CC BY-SA 4.0 (text; verified at https://en.wikipedia.org/wiki/Wikipedia:Copyrights)
- Accessed: 2026-10-30
- Used for: `test-design.md`
- What we used: The idea that boundaries are the points where behaviour changes, tested one smallest step apart on each side, including edges of invalid partitions and output limits; ideas only, no text reused.

### Client-side form validation

- URL: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation
- Publisher: MDN Web Docs (Mozilla)
- License: CC BY-SA 2.5 or later for prose, CC0 for newer code samples (verified at https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license)
- Accessed: 2026-10-30
- Used for: `forms.md`
- What we used: Built-in constraint attributes and how they behave, browser-locale error bubbles, the need for explicit, well-placed, accessible error messages, and that the server must repeat all validation.

### Decision table

- URL: https://en.wikipedia.org/wiki/Decision_table
- Publisher: Wikipedia
- License: CC BY-SA 4.0 (text; verified at https://en.wikipedia.org/wiki/Wikipedia:Copyrights)
- Accessed: 2026-10-30
- Used for: `test-design.md`
- What we used: Table structure (conditions, actions, rules), collapsing rules with don't-care entries, and completeness checks by comparing the expanded rule count; the gap and contradiction checks are our own derivation.

### Equivalence partitioning

- URL: https://en.wikipedia.org/wiki/Equivalence_partitioning
- Publisher: Wikipedia
- License: CC BY-SA 4.0 (text; verified at https://en.wikipedia.org/wiki/Wikipedia:Copyrights)
- Accessed: 2026-10-30
- Used for: `test-design.md`
- What we used: Valid and invalid partitions, one representative per partition, partition-based coverage, and its limits (hidden sub-partitions, small ranges); ideas only, no text reused.

### Error guessing (ISTQB glossary term, third-party mirror site)

- URL: https://istqb-glossary.page/error-guessing/
- Publisher: istqb-glossary.page (unofficial site that summarizes the ISTQB glossary)
- License: not stated (all rights reserved assumed; the official ISTQB glossary is copyrighted); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `test-design.md`
- What we used: The definition of error guessing as experience-based prediction of common mistakes, and keeping those guesses in checklists; the official ISTQB site itself was not read.

### File Upload Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- Publisher: OWASP Cheat Sheet Series
- License: CC BY-SA 4.0 (stated in the site footer, verified at https://cheatsheetseries.owasp.org/)
- Accessed: 2026-10-30
- Used for: `file-uploads.md`
- What we used: Extension allowlisting and double-extension tricks, not trusting client content type, signature checks, filename handling, size limits, storage outside the web root, authorization on files, image re-encoding and metadata stripping, and download safety, turned into safe black-box checks.

### Idempotent requests

- URL: https://docs.stripe.com/api/idempotent_requests
- Publisher: Stripe documentation
- License: not stated (all rights reserved assumed); documentation summarized, no text reused
- Accessed: 2026-10-30
- Used for: `payments-and-money.md`
- What we used: How idempotency keys let a retry return the first result, same key with different parameters being refused, and keys being pruned after a period.

### input element reference

- URL: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input
- Publisher: MDN Web Docs (Mozilla)
- License: CC BY-SA 2.5 or later for prose, CC0 for newer code samples (verified at https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license); only the first 100000 of about 109600 characters were read
- Accessed: 2026-10-30
- Used for: `forms.md`, `test-design.md`
- What we used: Input type pitfalls: step rules rejecting decimals, length counted in UTF-16 units, unchecked boxes and disabled or unnamed fields not submitted, locale-dependent number parsing, tel not format-validated.

### Input Validation Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- Publisher: OWASP Cheat Sheet Series
- License: CC BY-SA 4.0 (stated in the site footer, verified at https://cheatsheetseries.owasp.org/)
- Accessed: 2026-10-30
- Used for: `forms.md`, `test-design.md`, `notifications-email.md`
- What we used: Server-side enforcement even when the browser checks, allowlist thinking, accepting broad Unicode while limiting length, and that email format checks do not prove mailbox ownership.

### Mailpit documentation

- URL: https://mailpit.axllent.org/docs/
- Publisher: Mailpit (Ralph Slooten)
- License: MIT (verified in the repository LICENSE file at https://github.com/axllent/mailpit; the docs page itself states no licence)
- Accessed: 2026-10-30
- Used for: `notifications-email.md`
- What we used: The mail-catcher concept (a local SMTP server that stores mail and shows HTML, text, headers and raw source), its link and HTML checks and SMTP failure simulation, and the risk of its release/relay feature reaching real recipients; the generic file refers to it only as 'a mail catcher'.

### Receive webhook events

- URL: https://docs.stripe.com/webhooks
- Publisher: Stripe documentation
- License: not stated (all rights reserved assumed); documentation summarized, no text reused
- Accessed: 2026-10-30
- Used for: `payments-and-money.md`
- What we used: Duplicate event delivery, no ordering guarantee, signature verification, answering quickly before heavy work, and not relying only on the customer's return to the site.

### RFC 5322: Internet Message Format

- URL: https://www.rfc-editor.org/rfc/rfc5322
- Publisher: IETF (RFC Editor)
- License: not stated on the fetched page (IETF Trust copyright assumed; RFC text is governed by the IETF Trust Legal Provisions); ideas summarized, no text reused; only the first 100000 of about 139700 characters were read
- Accessed: 2026-10-30
- Used for: `notifications-email.md`
- What we used: Header basics (required Date and From, Message-ID, Reply-To, To/Cc/Bcc semantics and the risk of revealing blind recipients, no CR or LF in header bodies) behind the recipient, header-injection and header-presence checks.

### RFC 8058: Signaling One-Click Functionality for List Email Headers

- URL: https://www.rfc-editor.org/rfc/rfc8058
- Publisher: IETF (RFC Editor)
- License: not stated on the fetched page (IETF Trust copyright assumed; RFC text is governed by the IETF Trust Legal Provisions); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `notifications-email.md`
- What we used: The two unsubscribe headers, the one-click POST with no cookies or redirect, opaque tokens, DKIM covering the headers, and that link scanners can trigger accidental unsubscribes.

### State-transition table

- URL: https://en.wikipedia.org/wiki/State-transition_table
- Publisher: Wikipedia
- License: CC BY-SA 4.0 (text; verified at https://en.wikipedia.org/wiki/Wikipedia:Copyrights)
- Accessed: 2026-10-30
- Used for: `test-design.md`
- What we used: The state-by-event table form with cells marked illegal, which we turned into the practice of testing each allowed transition and each refused one; the testing guidance is our own.

### Test oracle

- URL: https://en.wikipedia.org/wiki/Test_oracle
- Publisher: Wikipedia
- License: CC BY-SA 4.0 (text; verified at https://en.wikipedia.org/wiki/Wikipedia:Copyrights)
- Accessed: 2026-10-30
- Used for: `test-design.md`
- What we used: The kinds of oracle (specified, derived, consistency, partial/metamorphic, implicit, human, heuristic) and their limits, adapted into our ordered oracle list.

### Testing

- URL: https://docs.stripe.com/testing
- Publisher: Stripe documentation
- License: not stated (all rights reserved assumed); documentation summarized, no text reused; only the first 100000 of about 136000 characters were read
- Accessed: 2026-10-30
- Used for: `payments-and-money.md`
- What we used: Test mode versus live mode, using only published test values and never real card details, scenario categories (declines, authentication, refunds, disputes), card state carrying across tests, and sandbox rate limits.

## API testing, authentication, authorization, security smoke checks

### API1:2023 Broken Object Level Authorization

- URL: https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/API-Security repository LICENSE)
- Accessed: 2026-10-30
- Used for: `permissions-and-data-isolation.md`
- What we used: Ideas that object ids may sit in path, query, header or body, that comparing one id to the token's user id is not enough, that random ids do not replace checks, and that every function touching an object needs its own check.

### API2:2023 Broken Authentication

- URL: https://api-security.owasp.org/editions/2023/en/0xa2-broken-authentication/
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/API-Security repository LICENSE)
- Accessed: 2026-10-30
- Used for: `auth-and-sessions.md`, `security-checks.md`
- What we used: Checks for stricter limits on login and recovery, JWT signature and expiry validation, treating reset flows as authentication endpoints, re-authentication for email and password changes, and the email-change-then-reset takeover chain.

### API3:2023 Broken Object Property Level Authorization

- URL: https://api-security.owasp.org/editions/2023/en/0xa3-broken-object-property-level-authorization/
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/API-Security repository LICENSE)
- Accessed: 2026-10-30
- Used for: `permissions-and-data-isolation.md`
- What we used: The split into over-exposed response fields and mass assignment of writable fields, and the idea of probing extra protected properties and comparing responses against what the screen needs.

### API5:2023 Broken Function Level Authorization

- URL: https://api-security.owasp.org/editions/2023/en/0xa5-broken-function-level-authorization/
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/API-Security repository LICENSE)
- Accessed: 2026-10-30
- Used for: `permissions-and-data-isolation.md`
- What we used: Admin functions living beside ordinary endpoints, method tampering, guessing other groups' URLs, and deny-by-default as the expected behaviour for unmapped routes.

### API7:2023 Server Side Request Forgery

- URL: https://api-security.owasp.org/editions/2023/en/0xa7-server-side-request-forgery/
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/API-Security repository LICENSE)
- Accessed: 2026-10-30
- Used for: `security-checks.md`
- What we used: Where URL-fetching features hide (webhooks, imports, avatars, previews), basic versus blind SSRF, redirect following, and which checks a tester can run safely with a controlled URL.

### API8:2023 Security Misconfiguration

- URL: https://api-security.owasp.org/editions/2023/en/0xa8-security-misconfiguration/
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/API-Security repository LICENSE)
- Accessed: 2026-10-30
- Used for: `security-checks.md`, `api-testing.md`
- What we used: The misconfiguration signals (missing TLS, headers, CORS, verbose errors, unneeded HTTP verbs, accepting unneeded content types, cache directives on private responses) that became checks and bug patterns.

### Cross-Origin Resource Sharing (CORS) (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
- Publisher: Mozilla / MDN contributors
- License: CC BY-SA 2.5 for prose (mdn/content LICENSE.md)
- Accessed: 2026-10-30
- Used for: `security-checks.md`, `api-testing.md`
- What we used: Simple versus preflighted requests, the credentials and wildcard restriction, Vary: Origin for dynamic origins, preflight method and header lists, and which response headers to read when testing CORS.

### HTTP response status codes (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status
- Publisher: Mozilla / MDN contributors
- License: CC BY-SA 2.5 for prose (mdn/content LICENSE.md)
- Accessed: 2026-10-30
- Used for: `api-testing.md`
- What we used: The meaning of each status code a tester must distinguish (200/201/202/204, redirects 301/302/307/308, 400/401/403/404/405/406/409/410/412/413/415/422/428/429, 5xx).

### OpenAPI Specification (latest; read: servers, paths, operations, parameters, responses, schema notes)

- URL: https://spec.openapis.org/oas/latest.html
- Publisher: OpenAPI Initiative (Linux Foundation)
- License: Apache License 2.0 (OAI/OpenAPI-Specification repository LICENSE)
- Accessed: 2026-10-30
- Used for: `api-testing.md`
- What we used: How to treat the spec as an oracle: responses keyed by code, range or default, operation-level security overriding global, format as annotation, readOnly/writeOnly semantics, and parameter and server rules; request-body and security-scheme sections were not read.

### OWASP API Security Top 10 2023 (list of risks)

- URL: https://api-security.owasp.org/editions/2023/en/0x11-t10
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (repository LICENSE of OWASP/API-Security: Attribution-ShareAlike 4.0 International)
- Accessed: 2026-10-30
- Used for: `permissions-and-data-isolation.md`, `security-checks.md`, `api-testing.md`
- What we used: The ten risk names and IDs used for vocabulary and for deciding which API-specific checks (object, property and function authorization, SSRF, misconfiguration, inventory) belong in the knowledge files.

### OWASP Authentication Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/CheatSheetSeries LICENSE.md)
- Accessed: 2026-10-30
- Used for: `auth-and-sessions.md`
- What we used: Generic login, recovery and registration messages, timing parity, password length and truncation checks, per-account lockout, MFA and re-authentication expectations, and the email-change process.

### OWASP Authorization Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/CheatSheetSeries LICENSE.md)
- Accessed: 2026-10-30
- Used for: `permissions-and-data-isolation.md`
- What we used: Deny by default, checks on every request including static resources, horizontal versus vertical escalation, same response for missing and unauthorized objects, and the roles-by-resources-by-operations test matrix idea.

### OWASP Cross-Site Request Forgery Prevention Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/CheatSheetSeries LICENSE.md)
- Accessed: 2026-10-30
- Used for: `auth-and-sessions.md`, `security-checks.md`
- What we used: When CSRF applies (cookie authentication), token missing/altered/other-session tests, no state change on GET, Origin and Sec-Fetch-Site checks, custom header and content-type restrictions on JSON APIs, SameSite as defence in depth, login CSRF.

### OWASP Forgot Password Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/CheatSheetSeries LICENSE.md)
- Accessed: 2026-10-30
- Used for: `auth-and-sessions.md`
- What we used: Reset flow checks: uniform responses, token randomness, single use and expiry, link base not taken from the Host header, Referrer-Policy on the reset page, no auto-login, session invalidation, no password in the notification email.

### OWASP HTTP Headers Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/CheatSheetSeries LICENSE.md)
- Accessed: 2026-10-30
- Used for: `security-checks.md`
- What we used: The list of security response headers to check and which obsolete or information-leaking headers should be absent, plus download-serving headers and the note that no-cache does not prevent storage.

### OWASP Insecure Direct Object Reference Prevention Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/CheatSheetSeries LICENSE.md)
- Accessed: 2026-10-30
- Used for: `permissions-and-data-isolation.md`
- What we used: Where references appear (paths, hidden fields, filenames), that unguessable ids still need checks, testing every operation with two users, and answering identically for missing and forbidden objects.

### OWASP REST Security Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/CheatSheetSeries LICENSE.md)
- Accessed: 2026-10-30
- Used for: `api-testing.md`, `security-checks.md`, `auth-and-sessions.md`
- What we used: JWT validation expectations, method allow-lists with 405, 413 for oversized bodies, 415 and 406 content negotiation rules, generic error handling, status code usage, secrets kept out of URLs, security headers on API responses.

### OWASP Session Management Cheat Sheet

- URL: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Publisher: OWASP Foundation
- License: CC BY-SA 4.0 (OWASP/CheatSheetSeries LICENSE.md)
- Accessed: 2026-10-30
- Used for: `auth-and-sessions.md`, `security-checks.md`, `permissions-and-data-isolation.md`
- What we used: Session id properties, cookie attribute expectations, renewal after login, idle and absolute timeouts, server-side logout, tokens in URLs, client storage, concurrent sessions and no-store caching on session responses.

### RFC 9110: HTTP Semantics (read: section 9 Methods, section 15.4 to 15.6 status codes)

- URL: https://www.rfc-editor.org/rfc/rfc9110.html
- Publisher: IETF (RFC Editor)
- License: Copyright IETF Trust, subject to the IETF Trust Legal Provisions (BCP 78); ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `api-testing.md`
- What we used: Safe and idempotent method definitions, expected PUT/DELETE/POST outcomes, retry rules, and the requirements that 401 carries a challenge and 405 lists allowed methods; sections on conditional requests (13) were not read, so ETag guidance rests on the status-code definitions for 304 and 412 only.

### Set-Cookie header (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
- Publisher: Mozilla / MDN contributors
- License: CC BY-SA 2.5 for prose (mdn/content LICENSE.md)
- Accessed: 2026-10-30
- Used for: `auth-and-sessions.md`, `security-checks.md`
- What we used: Meaning and testable behaviour of Secure, HttpOnly, SameSite (including None requiring Secure), Domain host-only default, Path, Max-Age versus Expires, and cookie name prefixes.

### The Idempotency-Key HTTP Header Field (Internet-Draft, version 08)

- URL: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- Publisher: IETF HTTPAPI Working Group
- License: Copyright IETF Trust, subject to the IETF Trust Legal Provisions (BCP 78); Internet-Draft, work in progress; ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `api-testing.md`
- What we used: Expected server behaviour for retries with the same key (same result), the same key with a different payload (422), concurrent use of one key (409) and a missing required key (400); noted that it is a draft, not a standard.

### WSTG-ATHZ-04 Testing for Insecure Direct Object References

- URL: https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References/
- Publisher: OWASP Foundation (Web Security Testing Guide)
- License: CC BY-SA 4.0 (OWASP/wstg repository license)
- Accessed: 2026-10-30
- Used for: `permissions-and-data-isolation.md`
- What we used: The method of using two accounts, taking an identifier owned by the other account, substituting it, and trying combinations when a reference is split over several parameters.

### WSTG-CLNT-04 Testing for Client-side URL Redirect

- URL: https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/11-Client-side_Testing/04-Testing_for_Client-side_URL_Redirect/
- Publisher: OWASP Foundation (Web Security Testing Guide)
- License: CC BY-SA 4.0 (OWASP/wstg repository license)
- Accessed: 2026-10-30
- Used for: `auth-and-sessions.md`, `security-checks.md`
- What we used: The concept of user-controlled URL input reaching a navigation sink and the phishing risk; parameter names and reserved-domain test values are our own additions.

### WSTG-CONF-04 Review Old Backup and Unreferenced Files for Sensitive Information

- URL: https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information/
- Publisher: OWASP Foundation (Web Security Testing Guide)
- License: CC BY-SA 4.0 (OWASP/wstg repository license)
- Accessed: 2026-10-30
- Used for: `security-checks.md`
- What we used: Inferring unlinked files from naming patterns and page clues, reading robots.txt, common backup suffixes, directory listing checks, the false-200 custom error page caveat, and what exposure counts as a defect.

### WSTG-CONF-06 Test HTTP Methods

- URL: https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/06-Test_HTTP_Methods/
- Publisher: OWASP Foundation (Web Security Testing Guide)
- License: CC BY-SA 4.0 (OWASP/wstg repository license)
- Accessed: 2026-10-30
- Used for: `security-checks.md`, `permissions-and-data-isolation.md`, `api-testing.md`
- What we used: Checks for OPTIONS versus real behaviour, PUT and DELETE exposure, method override headers, HEAD and invented verbs bypassing authentication, and TRACE echo.

## Accessibility, layout and internationalization

### Accessibility testing | Playwright

- URL: https://playwright.dev/docs/accessibility-testing
- Publisher: Microsoft (Playwright project)
- License: Apache License 2.0 (repository LICENSE at github.com/microsoft/playwright, read directly)
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: The point that automated scans find only part of the issues (contrast, missing names, bad ARIA) and manual checks are still needed, and the idea of limiting a scan to WCAG rule tags.

### Basic concepts of logical properties and values (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values/Basic_concepts_of_logical_properties_and_values
- Publisher: Mozilla / MDN contributors
- License: Text CC-BY-SA 2.5 or later; code samples CC0 or MIT (per MDN's attribution and licence page, read)
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`
- What we used: Inline and block axes, start and end edges, and how writing mode and direction change which physical side they mean.

### CSS logical properties and values (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values
- Publisher: Mozilla / MDN contributors
- License: Text CC-BY-SA 2.5 or later; code samples CC0 or MIT (per MDN's attribution and licence page, read)
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`
- What we used: The purpose of flow-relative properties; the page's overview is short, so the physical-to-logical mapping used in the file is standard CSS knowledge, not text from this page.

### Cumulative Layout Shift (CLS)

- URL: https://web.dev/articles/cls
- Publisher: Google (web.dev)
- License: CC BY 4.0 for content and Apache 2.0 for code samples, per the Google Developers Site Policies (seen in a search summary; not shown on the fetched page itself)
- Accessed: 2026-10-30
- Used for: `ui-and-layout.md`
- What we used: The 0.1 and 0.25 thresholds, the common causes of layout shift (missing image dimensions, late content, fonts, embeds) and that shifts after a user's own input are excluded.

### Developing a Keyboard Interface (WAI-ARIA Authoring Practices Guide)

- URL: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
- Publisher: W3C Web Accessibility Initiative
- License: W3C Software and Document notice and license (W3C document licence family); not separately verified for the APG, ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: One tab stop per composite widget with arrow keys inside, visible focus, focus never dropped to the body, avoiding positive tabindex, and disabled-control handling.

### Dialog (Modal) Pattern (WAI-ARIA Authoring Practices Guide)

- URL: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Publisher: W3C Web Accessibility Initiative
- License: W3C Software and Document notice and license (W3C document licence family); not separately verified for the APG, ideas summarized, no text reused
- Accessed: 2026-10-30
- Used for: `accessibility.md`, `ui-and-layout.md`
- What we used: Where focus goes when a dialog opens and closes, Tab and Escape behaviour, and the required dialog role, name and modal flag, for the dialog focus checks.

### dir - HTML global attribute (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/dir
- Publisher: Mozilla / MDN contributors
- License: Text CC-BY-SA 2.5 or later; code samples CC0 or MIT (per MDN's attribution and licence page, read)
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`
- What we used: ltr, rtl and auto values, how auto picks a direction and what it skips, bdi as inline auto, tel inputs always left-to-right, inheritance when dir is absent, and the preference for the attribute over CSS.

### Forms Tutorial: Labeling Controls

- URL: https://www.w3.org/WAI/tutorials/forms/labels/
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: Explicit and implicit label association, hidden labels, the weakness of title, and how button names are supplied for each control type.

### How to Meet WCAG (Quick Reference), WCAG 2.2 levels A and AA

- URL: https://www.w3.org/WAI/WCAG22/quickref/?versions=2.2&levels=a,aa
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: The complete list of level A and AA success-criterion numbers and names, used to cite criteria and to decide which checks belong in the file (only the first half of the long page was read).

### Images Tutorial: An alt Decision Tree

- URL: https://www.w3.org/WAI/tutorials/images/decision-tree/
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: The informative, decorative, functional and text-image categories of alt text and what a correct value looks like for each.

### Inline markup and bidirectional text in HTML

- URL: https://www.w3.org/International/articles/inline-bidi-markup/
- Publisher: W3C Internationalization Activity
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`
- What we used: Why numbers and punctuation next to opposite-direction text spill into the wrong run, and the fixes (dir on a wrapper, bdi, dir=auto, isolates, marks, bdo only for special cases).

### Intl.NumberFormat (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
- Publisher: Mozilla / MDN contributors
- License: Text CC-BY-SA 2.5 or later; code samples CC0 or MIT (per MDN's attribution and licence page, read)
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`
- What we used: Locale-dependent grouping and separators, lakh grouping and the numbering-system extension; the page does not name ur-PK or ar-SA defaults, so the digit-system observations in the file come from my own runtime test.

### lang - HTML global attribute (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/lang
- Publisher: Mozilla / MDN contributors
- License: Text CC-BY-SA 2.5 or later; code samples CC0 or MIT (per MDN's attribution and licence page, read)
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`, `accessibility.md`
- What we used: BCP 47 tags, inheritance of lang, and its link to WCAG 3.1.1 and 3.1.2; the fact that lang does not set direction is general knowledge confirmed by the dir page.

### letter-spacing - CSS (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/CSS/letter-spacing
- Publisher: Mozilla / MDN contributors
- License: Text CC-BY-SA 2.5 or later; code samples CC0 or MIT (per MDN's attribution and licence page, read)
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`, `accessibility.md`
- What we used: The warning that letter spacing should not be applied to Arabic-script text because connected letters must stay connected.

### overflow - CSS (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/CSS/overflow
- Publisher: Mozilla / MDN contributors
- License: Text CC-BY-SA 2.5 or later; code samples CC0 or MIT (per MDN's attribution and licence page, read)
- Accessed: 2026-10-30
- Used for: `accessibility.md`, `ui-and-layout.md`
- What we used: How overflow hidden, clip, scroll and auto affect reachability, that clipped content can still take keyboard focus without scrolling into view, and that scroll containers may need to be focusable.

### Responsive design (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_design
- Publisher: Mozilla / MDN contributors
- License: Text CC-BY-SA 2.5 or later; code samples CC0 or MIT (per MDN's attribution and licence page, read)
- Accessed: 2026-10-30
- Used for: `ui-and-layout.md`, `accessibility.md`
- What we used: The viewport meta tag, content-driven breakpoints, fluid media with max-width, never sizing text in viewport units alone, and typical responsive failures.

### Snapshot testing (ARIA snapshots) | Playwright

- URL: https://playwright.dev/docs/aria-snapshots
- Publisher: Microsoft (Playwright project)
- License: Apache License 2.0 (repository LICENSE at github.com/microsoft/playwright, read directly)
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: How an accessibility-tree snapshot is written (role, quoted name, bracketed states, levels), which underlies the list of how to spot problems when reading a snapshot.

### String.prototype.normalize() (MDN Web Docs)

- URL: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
- Publisher: Mozilla / MDN contributors
- License: Text CC-BY-SA 2.5 or later; code samples CC0 or MIT (per MDN's attribution and licence page, read)
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`
- What we used: Canonical versus compatibility equivalence, why equal-looking strings differ in code points and length, and normalizing before comparing, searching or enforcing uniqueness.

### Understanding Success Criterion 1.4.10: Reflow

- URL: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`, `ui-and-layout.md`
- What we used: The 320 CSS px reflow target (1280 px at 400% zoom), the narrow exception for data tables and other two-dimensional content, and the advice to put excepted content in its own scroll container.

### Understanding Success Criterion 1.4.12: Text Spacing

- URL: https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: The four spacing multipliers a page must tolerate, the clipping and overlap failure modes, and the allowance for scripts where a spacing property does not apply.

### Understanding Success Criterion 1.4.3: Contrast (Minimum)

- URL: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: Contrast thresholds, the large-text definition, exceptions, the relative luminance and ratio formula, and the no-rounding rule, which drove the computed-style contrast check.

### Understanding Success Criterion 2.4.11: Focus Not Obscured (Minimum)

- URL: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`, `ui-and-layout.md`
- What we used: Sticky headers, footers and banners as causes of hidden focus, scroll-padding as the usual fix, and the tab-through test, reused in both the accessibility and the sticky-header layout checks.

### Understanding Success Criterion 2.5.8: Target Size (Minimum)

- URL: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`, `ui-and-layout.md`
- What we used: The 24 by 24 CSS pixel rule, the 24 px circle spacing test and the listed exceptions, turned into a measurable check on icon buttons and row actions.

### Understanding Success Criterion 3.3.8: Accessible Authentication (Minimum)

- URL: https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: The definition of a cognitive function test, the allowed mechanisms (paste, password managers) and exceptions, turned into a login-page check list (paste into each field, autofill, alternatives, code inputs).

### Understanding Success Criterion 4.1.3: Status Messages

- URL: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: What counts as a status message, when status or alert roles apply, and the pitfalls (overusing alert, announcing only part of a changing count).

### Unicode Standard Annex #9: Unicode Bidirectional Algorithm

- URL: https://www.unicode.org/reports/tr9/
- Publisher: Unicode Consortium
- License: Unicode Terms of Use (https://www.unicode.org/copyright.html): copying for personal or internal use with notices; ideas summarized, no text reused (only the first part of the long page was read)
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`
- What we used: Strong, weak and neutral character classes, how base direction and neutrals resolve, isolates and marks, and why overrides are a security concern; the worked example in the fetched summary disagreed with the algorithm, so every ordering claim in the file was instead checked by rendering test strings in a Chromium browser.

### Urdu Layout Requirements (retired W3C Group Note)

- URL: https://www.w3.org/TR/arab-ur-lreq/
- Publisher: W3C Internationalization Activity
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`
- What we used: That Urdu ascenders and descenders extend much farther than Latin ones (line height and clipping checks), that numbers run left to right, and that joining and mixed-script baseline alignment need testing; the note is marked retired, so it was used only for these general points.

### W3C Internationalization Q&A: HTML base direction (dir attribute)

- URL: https://www.w3.org/International/questions/qa-html-dir
- Publisher: W3C Internationalization Activity
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/ (title taken from the URL; page heading not separately confirmed)
- Accessed: 2026-10-30
- Used for: `i18n-and-rtl.md`
- What we used: Set dir on the root in markup rather than only in CSS, dir=auto for runtime content and form fields and its limits, lang does not imply direction, and logical properties over left and right. The planned article on structural markup and RTL text now redirects to an index, so this page was read instead.

### What's New in WCAG 2.2

- URL: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- Publisher: W3C Web Accessibility Initiative
- License: W3C Document License (2023), per https://www.w3.org/copyright/document-license/ (covers public documents on the W3C site; verbatim copying only, no derivatives)
- Accessed: 2026-10-30
- Used for: `accessibility.md`
- What we used: The list of the nine criteria added in 2.2 (focus not obscured, dragging, target size, consistent help, redundant entry, accessible authentication) and the removal of 4.1.1, so the checks carry the right numbers and levels.

## Framework notes

### <input> (React DOM component)

- URL: https://react.dev/reference/react-dom/components/input
- Publisher: Meta Platforms (React documentation)
- License: CC BY 4.0 (reactjs/react.dev LICENSE-DOCS.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/react.md`
- What we used: Informed the controlled versus uncontrolled input checks: value without onChange, null or undefined initial values, and the console warnings that signal them.

### Action Controller Overview

- URL: https://guides.rubyonrails.org/action_controller_overview.html
- Publisher: Rails core team (Rails Guides)
- License: CC BY-SA 4.0 (Rails Guides licence footer in the rails/rails repository)
- Accessed: 2026-10-30
- Used for: `framework-notes/rails.md`
- What we used: Informed the strong-parameters checks (permit, expect, permit!, forbidden attributes, 400 on wrong shape), before_action and skip_before_action review, and API-only controller inheritance.

### Active Record Query Interface

- URL: https://guides.rubyonrails.org/active_record_querying.html
- Publisher: Rails core team (Rails Guides)
- License: CC BY-SA 4.0 (Rails Guides licence footer in the rails/rails repository)
- Accessed: 2026-10-30
- Used for: `framework-notes/rails.md`
- What we used: Informed N+1 and eager-loading checks, strict_loading, optimistic and pessimistic locking, and find versus find_by behaviour. Only the first part of the long page was read.

### Authentication (Django REST framework)

- URL: https://www.django-rest-framework.org/api-guide/authentication/
- Publisher: Encode OSS Ltd
- License: BSD 3-Clause (encode/django-rest-framework LICENSE.md; docs live in that repository)
- Accessed: 2026-10-30
- Used for: `framework-notes/django.md`
- What we used: Informed CSRF enforcement under session authentication, token authentication behaviour, 401 versus 403, and the note that LoginRequiredMiddleware does not cover DRF views.

### Authorization (Laravel 12.x)

- URL: https://laravel.com/docs/12.x/authorization
- Publisher: Laravel (Taylor Otwell and contributors)
- License: MIT (laravel/docs license.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/laravel.md`
- What we used: Informed the gate and policy review: policy auto-discovery by naming, can middleware, authorize calls, before filters granting admins everything, guest handling, and 404 denial.

### Caching (Cache Components)

- URL: https://nextjs.org/docs/app/getting-started/caching
- Publisher: Vercel (Next.js documentation)
- License: MIT (vercel/next.js license.md; docs live in that repository, no separate docs licence found)
- Accessed: 2026-10-30
- Used for: `framework-notes/nextjs.md`
- What we used: Informed the caching-staleness checks: use cache with cacheLife and cacheTag, runtime data versus shared cache, per-instance in-memory caching, browser freshness windows, prerendered GET route handlers, and caches resetting on deploy.

### Controller action return types in ASP.NET Core web API

- URL: https://learn.microsoft.com/en-us/aspnet/core/web-api/action-return-types?view=aspnetcore-10.0
- Publisher: Microsoft Learn
- License: CC BY 4.0 for documentation content (dotnet/AspNetCore.Docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/dotnet.md`
- What we used: Confirmed that ApiController turns invalid model state into an automatic 400 response.

### Database Testing (Laravel 13.x)

- URL: https://laravel.com/docs/13.x/database-testing
- Publisher: Laravel (Taylor Otwell and contributors)
- License: MIT (laravel/docs license.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/laravel.md`
- What we used: Informed the database-reset options (transaction-based refresh versus migrations or truncation), factories, seeders in tests, and the query-count assertion.

### Deployment checklist

- URL: https://docs.djangoproject.com/en/stable/howto/deployment/checklist/
- Publisher: Django Software Foundation
- License: BSD 3-Clause (django/django LICENSE; docs live in that repository, no separate docs licence found)
- Accessed: 2026-10-30
- Used for: `framework-notes/django.md`
- What we used: Informed the settings checks: DEBUG, SECRET_KEY, ALLOWED_HOSTS, secure cookie flags, check --deploy, runserver not for production, and static and media file handling.

### Eloquent: Getting Started (Laravel 13.x)

- URL: https://laravel.com/docs/13.x/eloquent
- Publisher: Laravel (Taylor Otwell and contributors)
- License: MIT (laravel/docs license.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/laravel.md`
- What we used: Informed the mass-assignment checks (fillable and guarded, newer attribute forms, silent discarding of unfillable fields) and the lazy-loading and discard-prevention strictness switches. Only the sections on strictness and mass assignment were read.

### Error handling (Express)

- URL: https://expressjs.com/en/guide/error-handling.html
- Publisher: Express (OpenJS Foundation project)
- License: CC BY 4.0 (expressjs/expressjs.com LICENSE.md and README)
- Accessed: 2026-10-30
- Used for: `framework-notes/express.md`
- What we used: Informed the async and sync error propagation notes (Express 5 forwards promise rejections), the default handler and production mode, four-argument handlers and their order, headersSent, and hangs when a handler neither responds nor calls next.

### Handle errors in ASP.NET Core

- URL: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling?view=aspnetcore-10.0
- Publisher: Microsoft Learn
- License: CC BY 4.0 for documentation content (dotnet/AspNetCore.Docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/dotnet.md`
- What we used: Informed the environment-dependent leak checks: Developer Exception Page contents and Development-only default, exception handler behaviour, ProblemDetails customization leaking machine details, and the database developer page filter. Only the first part of the long page was read.

### Handling Concurrency Conflicts - EF Core

- URL: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
- Publisher: Microsoft Learn
- License: CC BY 4.0 for documentation content (dotnet/EntityFramework.Docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/dotnet.md`
- What we used: Informed the concurrency-token checks: Timestamp and ConcurrencyCheck, DbUpdateConcurrencyException on conflicting update or delete, and unique-constraint violations on concurrent inserts being a different exception.

### How to think about data security in Next.js

- URL: https://nextjs.org/docs/app/guides/data-security
- Publisher: Vercel (Next.js documentation)
- License: MIT (vercel/next.js license.md; docs live in that repository, no separate docs licence found)
- Accessed: 2026-10-30
- Used for: `framework-notes/nextjs.md`
- What we used: Informed the audit checklist: Server Actions reachable by direct POST, page-level checks not covering actions, ownership checks, untrusted params and searchParams, over-exposed props and return values, NEXT_PUBLIC_ exposure, and what to review in route handlers and the proxy.

### hydrateRoot

- URL: https://react.dev/reference/react-dom/client/hydrateRoot
- Publisher: Meta Platforms (React documentation)
- License: CC BY 4.0 (reactjs/react.dev LICENSE-DOCS.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/react.md`, `framework-notes/nextjs.md`
- What we used: Informed the hydration-mismatch checks: typical causes (dates and locale, window checks, differing data), console warnings in development, and the consequence of mismatched markup.

### Integration tests in ASP.NET Core

- URL: https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0
- Publisher: Microsoft Learn
- License: CC BY 4.0 for documentation content (dotnet/AspNetCore.Docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/dotnet.md`
- What we used: Informed the test setup notes: WebApplicationFactory, xUnit fixture shape, replacing services and the database, defaulting to the Development environment, client redirect and cookie defaults, and antiforgery in form posts. The page does not cover dotnet test filters, which come from general knowledge. Only the first part of the long page was read.

### List Rendering

- URL: https://vuejs.org/guide/essentials/list.html
- Publisher: Vue.js team (vuejs.org guide)
- License: CC BY 4.0, except images (vuejs/docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/vue.md`
- What we used: Informed the v-for key checks, in-place patching of reordered rows, v-if with v-for, and mutating sort or reverse inside computed values.

### Mocking (Laravel 13.x)

- URL: https://laravel.com/docs/13.x/mocking
- Publisher: Laravel (Taylor Otwell and contributors)
- License: MIT (laravel/docs license.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/laravel.md`
- What we used: Informed the time-travel and freeze helpers in tests. The page does not cover the Mail, Queue and Notification fakes, which are mentioned from general framework knowledge.

### Model Binding in ASP.NET Core

- URL: https://learn.microsoft.com/en-us/aspnet/core/mvc/models/model-binding?view=aspnetcore-10.0
- Publisher: Microsoft Learn
- License: CC BY 4.0 for documentation content (dotnet/AspNetCore.Docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/dotnet.md`
- What we used: Informed the over-posting checks (Bind and BindNever affect form data only, not JSON bodies; view models recommended), binding source order, and missing values becoming defaults. Only the first part of the long page was read.

### Navigation Guards

- URL: https://router.vuejs.org/guide/advanced/navigation-guards.html
- Publisher: Vue Router team
- License: MIT for the vuejs/router repository (LICENSE); no separate documentation licence verified
- Accessed: 2026-10-30
- Used for: `framework-notes/vue.md`
- What we used: Informed the router-guard checks: return values, calling next more than once, async guards, meta fields with global guards, and beforeResolve for permission-gated data loading.

### Permissions (Django REST framework)

- URL: https://www.django-rest-framework.org/api-guide/permissions/
- Publisher: Encode OSS Ltd
- License: BSD 3-Clause (encode/django-rest-framework LICENSE.md; docs live in that repository)
- Accessed: 2026-10-30
- Used for: `framework-notes/django.md`
- What we used: Informed the DRF access-control checks: AllowAny as the default, view versus object permissions, object checks not applied to lists or creates, and 401 versus 403 rules.

### Prevent Cross-Site Request Forgery attacks in ASP.NET Core

- URL: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
- Publisher: Microsoft Learn
- License: CC BY 4.0 for documentation content (dotnet/AspNetCore.Docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/dotnet.md`
- What we used: Informed the antiforgery checks: cookie-authenticated endpoints are exposed, MVC attribute variants, minimal-API validation limited to certain verbs, and bearer-token APIs differing. Only the first part of the long page was read.

### Production Best Practices: Security

- URL: https://expressjs.com/en/advanced/best-practice-security.html
- Publisher: Express (OpenJS Foundation project)
- License: CC BY 4.0 (expressjs/expressjs.com LICENSE.md and README)
- Accessed: 2026-10-30
- Used for: `framework-notes/express.md`
- What we used: Informed the hardening checks: helmet headers, X-Powered-By, error handler not leaking stacks, session cookie settings and default names, in-memory session store, login brute-force limits, open-redirect and regular-expression input checks.

### proxy.js (formerly middleware)

- URL: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Publisher: Vercel (Next.js documentation)
- License: MIT (vercel/next.js license.md; docs live in that repository, no separate docs licence found)
- Accessed: 2026-10-30
- Used for: `framework-notes/nextjs.md`
- What we used: Informed the middleware-to-proxy rename in version 16, matcher behaviour (no matcher runs on everything including assets; excluded paths also skip Server Function calls), and the experimental unit-test helpers.

### QuerySet API reference (select_for_update section)

- URL: https://docs.djangoproject.com/en/stable/ref/models/querysets/
- Publisher: Django Software Foundation
- License: BSD 3-Clause (django/django LICENSE; docs live in that repository, no separate docs licence found)
- Accessed: 2026-10-30
- Used for: `framework-notes/django.md`
- What we used: Informed the ORM race-condition notes: row locks need a transaction, SQLite ignores them, and TestCase can hide misuse. The F() expression advice is general knowledge, not from this page. Only the first part of the long page was read.

### Reactivity Fundamentals

- URL: https://vuejs.org/guide/essentials/reactivity-fundamentals.html
- Publisher: Vue.js team (vuejs.org guide)
- License: CC BY 4.0, except images (vuejs/docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/vue.md`
- What we used: Informed the reactivity-loss checks (destructuring reactive objects, replacing a reactive variable, primitives, template unwrapping) and the next-tick DOM update timing.

### Rendering Lists

- URL: https://react.dev/learn/rendering-lists
- Publisher: Meta Platforms (React documentation)
- License: CC BY 4.0 (reactjs/react.dev LICENSE-DOCS.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/react.md`
- What we used: Informed the key checks: index keys and random keys on lists that reorder or change, and the symptoms (state in the wrong row, lost input).

### Routing (Laravel 13.x)

- URL: https://laravel.com/docs/13.x/routing
- Publisher: Laravel (Taylor Otwell and contributors)
- License: MIT (laravel/docs license.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/laravel.md`
- What we used: Informed where routes live, route:list usage, web versus api middleware groups, scoped route model binding, soft-deleted binding, and rate limiting. Only the matched sections were read.

### Securing Rails Applications

- URL: https://guides.rubyonrails.org/security.html
- Publisher: Rails core team (Rails Guides)
- License: CC BY-SA 4.0 (Rails Guides licence footer in the rails/rails repository)
- Accessed: 2026-10-30
- Used for: `framework-notes/rails.md`
- What we used: Informed the CSRF token checks, scoped finders against IDOR, session reset after login, SQL placeholder use, unsafe redirects, file path handling for downloads and default security headers. Only the first part of the long page was read.

### Simple authorization in ASP.NET Core

- URL: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/simple?view=aspnetcore-10.0
- Publisher: Microsoft Learn
- License: CC BY 4.0 for documentation content (dotnet/AspNetCore.Docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/dotnet.md`
- What we used: Informed the Authorize attribute review: roles and policies, the default policy, and endpoints without authorization metadata being open unless a fallback policy exists.

### Simple authorization in ASP.NET Core MVC

- URL: https://learn.microsoft.com/en-us/aspnet/core/mvc/security/authorization/simple?view=aspnetcore-10.0
- Publisher: Microsoft Learn
- License: CC BY 4.0 for documentation content (dotnet/AspNetCore.Docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/dotnet.md`
- What we used: Informed the warning that AllowAnonymous at controller level overrides Authorize attributes on the controller and its actions.

### Synchronizing with Effects

- URL: https://react.dev/learn/synchronizing-with-effects
- Publisher: Meta Platforms (React documentation)
- License: CC BY 4.0 (reactjs/react.dev LICENSE-DOCS.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/react.md`
- What we used: Informed the notes on Strict Mode double-running effects in development only, missing cleanup, fetch race conditions, stale closures, dependency arrays, and user actions that belong in handlers rather than effects.

### Testing (Django REST framework)

- URL: https://www.django-rest-framework.org/api-guide/testing/
- Publisher: Encode OSS Ltd
- License: BSD 3-Clause (encode/django-rest-framework LICENSE.md; docs live in that repository)
- Accessed: 2026-10-30
- Used for: `framework-notes/django.md`
- What we used: Informed APITestCase and APIClient usage, force_authenticate, and the fact that CSRF checks are off by default in the test client.

### Testing (Next.js)

- URL: https://nextjs.org/docs/app/guides/testing
- Publisher: Vercel (Next.js documentation)
- License: MIT (vercel/next.js license.md; docs live in that repository, no separate docs licence found)
- Accessed: 2026-10-30
- Used for: `framework-notes/nextjs.md`
- What we used: Informed the list of supported test tools (Jest, Vitest, Playwright, Cypress) and the advice to prefer end-to-end tests for async Server Components.

### Testing (Vue)

- URL: https://vuejs.org/guide/scaling-up/testing.html
- Publisher: Vue.js team (vuejs.org guide)
- License: CC BY 4.0, except images (vuejs/docs LICENSE)
- Accessed: 2026-10-30
- Used for: `framework-notes/vue.md`
- What we used: Informed the recommended test stack (Vitest, Vue Test Utils, Testing Library, Playwright, Cypress), test file naming and how tests are run.

### Testing Rails Applications

- URL: https://guides.rubyonrails.org/testing.html
- Publisher: Rails core team (Rails Guides)
- License: CC BY-SA 4.0 (Rails Guides licence footer in the rails/rails repository)
- Accessed: 2026-10-30
- Used for: `framework-notes/rails.md`
- What we used: Informed the test folder layout, bin/rails test invocations (file, line, name), fixtures, transactional tests, test database preparation, and integration test shape. Only the first part of the long page was read.

### Testing: Getting Started (Laravel 13.x)

- URL: https://laravel.com/docs/13.x/testing
- Publisher: Laravel (Taylor Otwell and contributors)
- License: MIT (laravel/docs license.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/laravel.md`
- What we used: Informed test commands, Feature versus Unit folders, phpunit.xml testing environment, .env.testing, parallel testing and the config-cache caveat.

### Validation (Laravel 13.x)

- URL: https://laravel.com/docs/13.x/validation
- Publisher: Laravel (Taylor Otwell and contributors)
- License: MIT (laravel/docs license.md)
- Accessed: 2026-10-30
- Used for: `framework-notes/laravel.md`
- What we used: Informed the FormRequest checks: authorize and rules, validated versus raw input, 422 for JSON versus redirect for web. Only the first part of the long page was read.

### Writing and running tests

- URL: https://docs.djangoproject.com/en/stable/topics/testing/overview/
- Publisher: Django Software Foundation
- License: BSD 3-Clause (django/django LICENSE; docs live in that repository, no separate docs licence found)
- Accessed: 2026-10-30
- Used for: `framework-notes/django.md`
- What we used: Informed test discovery and dotted-path runs, keepdb and parallel flags, test database naming and destruction, tests always running with DEBUG off, and TestCase versus TransactionTestCase.

## Review notes (what was not read, not verified, or checked by hand)

- **OWASP ASVS** was named in the brief but not read, so it is not cited. RFC 9110 was read in part (methods, status codes); the
  conditional-request guidance rests on those definitions and common practice. The OpenAPI requestBody and security-scheme sections
  were not read.
- **Common knowledge, not a fetched page:** inert XSS markers and SQL-metacharacter probes, TLS and SRI basics, bcrypt-style 72-character
  truncation, currency decimal places (0, 2, 3), Laravel `Mail::fake`/`Queue::fake`, Django `F()` expressions, `dotnet test --filter`,
  default dev-server ports, Express body-parser limits and `trust proxy`, the physical-to-logical CSS property mapping.
- **Checked by hand** in headless Chromium and Node by the authors of `i18n-and-rtl.md` and `accessibility.md` (bidi rendering of mixed
  Urdu/Latin strings, contrast and overflow snippets, locale defaults, collation). The files tell the agent to check rather than
  assume for runtime-dependent facts. One fetched summary of UAX #9 contained a worked example that contradicted the algorithm and was
  not used.
- **Own derivation:** the gap and contradiction checks for decision tables and the illegal-transition tests (the cited pages do not
  discuss testing); the session-length rule of thumb in `exploratory-charters.md` (60 to 90 minutes) rests on secondary summaries.
- **Unavailable pages:** the Heuristic Test Strategy Model and session-based test management pages returned landing pages only; the
  Google flaky-tests post did not load; an ISTQB glossary was read via a third-party mirror, not the official site.
- **Licences not verified:** web.dev (stated CC BY 4.0 / Apache 2.0 from a site-policy summary), the WAI-ARIA Authoring Practices notice,
  and several vendor documentation pages (recorded as all rights reserved assumed).
- **Own practice, no external source:** the "warm, change, re-read" staleness sequence in `api-testing.md` (added after the Phase 2
  evaluation showed nothing in the knowledge base taught it). It is standard cache-invalidation testing practice written by us.
- **Version-sensitive facts** (Next.js 16 renaming `middleware.ts` to `proxy.ts`, Laravel 13 attributes, Rails 8 `params.expect`) are
  marked as such in the framework notes.
