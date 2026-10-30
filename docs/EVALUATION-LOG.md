# Evaluation log

How QAMind is scored against the demo app, and the results so far. The answer key (`demo-app/SEEDED-BUGS.md`) and the
scorer (`demo-app/eval/score-run.mjs`) are private to evaluation: the agent under test must never see them.

## How to run a scored evaluation (use this for every phase)

```
CLAUDE_BIN=/path/to/claude node scripts/eval-demo.ts --label <phase-name> --mode full --rep 1 [--budget 15]
node scripts/eval-summary.ts <phase-name> full          # mean / min / max and per-bug detection over all repetitions
```

`scripts/eval-demo.ts` does everything with the settings pinned (so results are comparable): copies the demo app **without** the answer key
(`SEEDED-BUGS.md`, `eval/`, `qa-fixture/`, `.env.qa.fixture`), writes the fixture config and credentials, starts the app and resets its data, runs
`/qamind:qa-only <mode>` headlessly with a scratch `QAMIND_HOME`, scores the run with `demo-app/eval/score-run.mjs` and lints the report, and saves
`docs/baselines/<label>-<mode>-r<rep>.{json,report.md,findings.json}`. The JSON holds the exact settings and the results.

**Pinned settings (identical for every record below):** Claude Code 2.1.312, model `claude-sonnet-5-5` (requested and confirmed in the session),
`--setting-sources project,local` and `ENABLE_CLAUDEAI_MCP_SERVERS=false` (so only QAMind and its own browser server are loaded: no personal plugins or
connectors), permission mode default, allowed tools `Read Glob Grep Write Edit Bash(qamind *) Bash(curl *) Bash(git status *) Bash(git diff *)
Bash(git log *) Bash(ls *) mcp__plugin_qamind_browser`, budget cap $15, prompt `/qamind:qa-only full`, demo app tree `a43a2e3b` with data reset,
fixture config sha256 `a1e7f867...`, fixture env sha256 `762d8cfa...`, Chrome 156.0.8078.74, Node 24.2.0, macOS (Darwin 27.2.0).
The code under test is identified by `plugin_content_sha256` (a hash of the built plugin, since Phase 2 was not yet committed when it ran).

Scored bugs are DB-01 ... DB-13 and DB-15 (14). DB-14 needs a mail catcher and DB-16 needs WebKit, so they are out of scope until Phase 7.9. DB-17 is
the privacy-masking fixture (Phase 7.6). Depth markers (of 4) record whether the harder halves were confirmed as findings: a UI double-submit
(DB-07), all four unnamed controls (DB-09), reversed Urdu text (DB-11), personal-data exposure reported (DB-17). The scorer is keyword matching: its
per-bug mapping was reviewed by hand.

## Phase 1 results, first evaluation (mode `quick`, Claude Code 2.1.312, one run each; the user's personal plugins and connectors were also loaded)

| | Run 1 (first build) | Run 2 (Phase 1 final) |
|---|---|---|
| Seeded bugs found, of 14 | **8** | **14** |
| Seeded bugs surfaced only as a lead | 2 (DB-07, DB-11) | 0 |
| Missed | DB-05, DB-08, DB-09, DB-15 | none (DB-11 and DB-12 partly, see below) |
| Findings reported | 10 | 16 |
| Decoy (false positive) reported | 1 (table scrolling inside its own box) | 0 |
| Valid findings outside the key | 0 | 1 (`-$0.00` discount, now listed as a known unintended behaviour) |
| Every finding reproduced twice with evidence, lint clean | yes | yes |
| Fixture passwords found in any run output | none | none |
| Cost / time / agent turns | $1.96 / 9.0 min / 124 | $3.11 / 13.5 min / 237 |

What changed between the runs, all found by reading run 1 and the agent's own `suggested-improvements.md`:
a per-page **audit script** injected into every page (unnamed controls, controls off-screen, covered elements, clipped text,
RTL text in LTR boxes; wide tables that scroll inside their own box are reported as informational), plan **validation** and
list-or-string body checks (a string was being read as a list of characters), **write probes only on records the run creates**,
plan names accepted by `api run`, an honest-reasons rule (no "time budget reached" without a real budget), and a hook fix.

### Read these numbers with care
- **Single runs.** LLM runs vary; two runs do not give a distribution.
- **Tuned on this fixture.** The audit and the instructions were improved after seeing which seeded bugs run 1 missed. The
  audit's checks are standard accessibility and layout heuristics, not demo-specific rules, but 14/14 is not evidence that a real
  project will score the same. A held-out project is the real test; per decision 7 in the spec, that happens only after all phases are complete.
- **Partial credit.** DB-11 was found through its root cause (long text clipped in both portals); the reversed Urdu order stayed an
  unconfirmed lead. DB-12 was confirmed for sign-out; token expiry was listed as Not tested.
- **`quick` only.** No `full` run has been scored yet; it is the right baseline for Phase 2's "finds more than Phase 1" check.
- The scorer is keyword matching and can over- or under-credit; the table above was reviewed by hand against the reports.

### Observed problems in run 2 (all fixed or noted)
- The safety hook denied a harmless `node -e` script because it read `=>` as a shell redirect. **Fixed** (quoted text and arrows
  ignored; tests added).
- Lint rejected a hand-written plan that contained a deliberately fake `Bearer` token. **Fixed** (plans are checked only for
  real configured secrets).
- One `Connection closed` error on the very first browser call; the next call worked. Not reproduced in isolation. The run used
  the `npx` fallback, which connects about 1.3 s slower than the installed dependency (1.65 s vs 0.35 s).


## How the admin report is evaluated (Phase 3)

Three independent checks, because "plain language a non-technical person can follow" cannot be proved by a pattern match:

1. **Mechanical (every run, recorded in `results.admin`):** the admin report exists, `report check` finds the two written reports consistent (same issue
   ids and severities, nothing added or dropped, counts and verdict agree, complete problem blocks, at most 3 next steps, a summary of at most 6 lines), and no
   jargon appears outside "For developers" lines.
2. **Text-only reader** (`scripts/eval-readability.ts`): a fresh agent with no tools plays a non-technical manager and reads only the admin report. For each
   problem it says whether it could follow the steps, quotes every word it did not understand, and says whether what is wrong and who is affected are clear.
3. **Novice replay** (same script): a fresh agent with nothing but browser clicking and typing (no code, no back-end calls, no source, no developer tools,
   running inside the QAMind browser guard on the live demo) is given one problem's "How to see it yourself" steps and told to follow them exactly, stopping at
   any step it cannot do. It reports where it got stuck and whether it saw the problem described. Results are saved as `docs/baselines/<label>-readability.json`.

Both readers are LLMs, so they are a proxy for a person, not a substitute: they cannot judge tone for a particular company, and a model can follow steps a
person would find unfamiliar. They do catch the failures that matter most for the criterion: steps that cannot be followed, vague or overstated wording, and
unexplained words.

## Phase 1 baseline and Phase 2 (mode `full`, three runs each, settings pinned as above)

The first Phase 1 evaluation above used `quick` mode, one run per configuration, and loaded personal plugins; it is kept for the record. The reference for
comparing phases is the table below: `full` mode, three repetitions each, isolated.

| | **Phase 1 baseline** (build `c653f2d`) | **Phase 2, first build** (knowledge 0.1.0) | **Phase 2, tuned** (knowledge 0.1.1) |
|---|---|---|---|
| Seeded bugs found, of 14 (per run) | **11.3** (12, 12, 10) | 11.7 (10, 12, 13) | **12.7** (12, 14, 12) |
| Depth markers, of 4 (per run) | 1.0 (2, 1, 0) | 1.0 (0, 1, 2) | **2.3** (3, 2, 2) |
| Decoy false positives (mean) | 0.3 | 0.7 | 0.3 |
| Findings reported (mean) | 11.0 | 12.0 | 13.7 |
| Cost per run, USD (mean) | 0.7 | 1.4 | 1.3 |
| Wall time, minutes (mean) | 4.0 | 5.8 | 6.1 |
| Agent turns (mean) | 68 | 115 | 109 |
| Page audits per run (mean) | 4.0 | 7.7 | 7.3 |
| Knowledge files read per run (mean, range) | 0 | 4.7 (3 to 6) | 3.3 (1 to 5) |
| Every report lint-clean, no fixture password in any output | yes | yes | yes |

Runs that found each bug (of 3):

| Bug | Baseline | Phase 2 first | Phase 2 tuned |
|---|---|---|---|
| DB-01, 02, 03, 04, 06, 07, 10, 12, 13 | 3 | 3 | 3 |
| DB-05 admin change not reflected for the client | **0** | 0 | **3** |
| DB-08 New Order unusable at mobile width | 0 | 1 | 1 |
| DB-09 unnamed controls | 3 | 2 | 3 |
| DB-11 Urdu or long text clipped | 2 | 2 | 1 |
| DB-15 My Orders first row covered on mobile | 2 | 3 | 3 |

### What this does and does not show
- **The first Phase 2 build was not measurably better than the baseline** (11.7 vs 11.3, inside the noise). The knowledge was used selectively (3 to 6 of
  27 files per run, so on-demand loading works), but it did not change which bugs were found, and it roughly doubled cost and time.
- **One gap explained the stubborn miss.** DB-05 (a cached list that does not reflect another role's change) was missed in all six earlier runs because
  nothing taught the *warm, change, re-read* sequence: a read taken after the change always looks right. Adding that technique to `api-testing.md`
  (knowledge 0.1.1) made DB-05 a 3-of-3 find. That is a real, causal improvement, and the mean moved from 11.3 to 12.7 with a better floor (12 vs 10).
- **But it was tuned on this fixture.** DB-05 was added *because* the evaluation showed it missing, on the same demo app. Treat the tuned numbers as a
  development-set result. Whether the knowledge helps on an unseen product is the real question and is deferred to the real-project test after all
  phases (spec section 18, item 7).
- **n = 3 is small.** The per-run spread is about two bugs, so differences under about two bugs are not distinguishable from noise. The ranges
  overlap (12 to 14 vs 10 to 12).
- **The UI knowledge files were still never loaded.** In all six Phase 2 runs the agent read API-oriented files (`api-testing`, `permissions`,
  `payments`, `browser-testing`) and **never** `ui-and-layout.md`, `accessibility.md` or `forms.md`, even when the skill lists them per pass. The
  page audit, which came in Phase 1, is doing that work. DB-08 (New Order on mobile) therefore stays at 1 of 3. More knowledge text will not fix an
  agent that does not open it; the options are a stricter step in the workflow or a deterministic check (for example lint warning when a full run has
  desktop but no mobile coverage for a page). Not done in this phase.
- **Cost.** The knowledge roughly doubled cost and time per run ($0.7 to $1.3 per run, 4 to 6 minutes) for a modest gain on this fixture.


## Phase 3: admin report (mode `full`, settings pinned as above)

Phase 3 changes what the agent writes at the end of a run (plain-language fields, an admin report) but not how it tests, so the first question is whether
bug-finding regressed, and the second whether the admin report meets its criterion.

### Builds that were evaluated (the code under test is identified by `plugin_content_sha256`; Phase 3 was uncommitted when these ran)

| Label | What it was | Runs | `plugin_content_sha256` |
|---|---|---|---|
| `phase-3` | first Phase 3 build | 3 (+ 1 preliminary, `phase-3-prelim`) | `46c3c0bcb160` |
| `phase-3b` | after reader-test fixes (glossary, logins note, corrected wording) | 1 | `311378d6fe79` |
| `phase-3-final` | after the "behind the screens" note | 3 valid, 1 stalled | `0777ae8552d8` |
| `phase-3-c` | **the committed build**: adds the "never depend on data that only existed during the check" rule | 1 | `28fdbd879641` |

The last change (build C) is one rule in `core/shared/admin-report.md` that was added after the novice replay on `phase-3-final` found a real flaw
(below). It was verified with a single run, which stayed consistent and lint-clean but did not happen to include an on-screen problem that depends on
test-run data, so the rule itself is **in place, not demonstrated**.

### Bug-finding did not regress (three runs each; baseline and Phase 2 from the table above)

| | Phase 1 baseline | Phase 2 tuned | Phase 3 first build | Phase 3 final |
|---|---|---|---|---|
| Seeded bugs found, of 14 (per run) | 11.3 (12, 12, 10) | 12.7 (12, 14, 12) | 12.3 (12, 12, 13) | 11.7 (12, 13, 10) |
| Decoy false positives (mean) | 0.3 | 0.3 | 0.0 | 0.7 |
| Cost per run, USD (mean) | 0.7 | 1.3 | 1.5 | 1.5 |
| Wall time, minutes (mean) | 4.0 | 6.1 | 6.7 | 6.3 |
| Admin report written and consistent with the technical report | n/a | n/a | 3 of 3 | 3 of 3 |
| Plain-language lint errors at the end of the run | n/a | n/a | 0 | 0 |

All four builds sit inside each other's run-to-run spread (about two bugs); there is no sign that writing the extra report hurt testing, and none that
it helped. Build C found 11 of 14 in its single run. Writing the plain-language report adds about $0.2 per run.

### One run stalled
Repetition 2 of `phase-3-final` ran for 60 minutes without finishing and was killed by the harness (no result event, no findings; record kept as
`phase-3-final-full-r2-stalled.*`). It is the only stall in about 20 full evaluation runs. The cause is unknown: no transcript was kept. The harness now keeps
the workspace and writes diagnostics (the last tool calls) when a run ends without a result, and has a `--timeout-min` option (default 45). Spec 13.6
(time budgets, Phase 7.6) is the planned protection for real use. Repetition 2 was re-run and is the one counted above.

### Can a non-technical reader follow the steps? (`scripts/eval-readability.ts`)
| | Problems with on-screen steps | Text-only reader: steps followable | Novice replay: followed every step | Novice replay: saw the described problem |
|---|---|---|---|---|
| First build (1 report) | 4 | 4 of 4 | 4 of 4 | 2 of 4 |
| Final build (3 reports) | 12 | 12 of 12 (0 "not followable") | 12 of 12 | 10 of 12 |
| Committed build C (1 report) | 3 | 3 of 3 | 3 of 3 | 3 of 3 |

What the tests found, and what was done about it:
- **First build, stale status not reproduced:** the steps did not say to look at the list *before* the change, and did not name an existing order. Fixed in
  the guide ("self-contained and in the right order"); the final build's reports reproduced it.
- **First build, "shows nothing while loading":** the page actually shows a heading and a spinner, so the report overstated. Fixed ("describe exactly what the screen shows").
- **Text-only reader, unexplained words:** "behind the screens" was never defined; "details below" pointed at a file that is not below; managers were not told where to get
  logins; "reload the page" and "narrow window" were unclear. Fixed with a glossary (including the severity definitions), a logins note, a "behind the screens"
  note, corrected wording and a guide rule to explain browser actions.
- **Final build, IDOR steps used a test-only order (`o-1039`):** on a fresh system that order does not exist, so the reader correctly saw "Order not found". Found by the
  replay; the guide rule "never depend on data that only existed during your check" (build C) addresses it.
- **Final build, Urdu reversal not seen:** the replay agent reads the page as text, not as drawn, so it cannot see a visual reversal. A limit of the test, not shown to be a flaw of the report.
- **The harness itself had a gap:** its briefing omitted the Zain Traders login that one report's steps named, so one problem looked "not followable". Fixed and re-run; that problem then
  followed all steps (the data issue above was what stopped it reproducing).

Caveats: both readers are LLMs, a proxy for a person; the demo app is one product; the novice is a model that is good at following instructions. The text reader still lists product
names ("Client Portal") and a few specialist words as unclear on every report; those are the product's own names, which a real manager would know.

### Not tracked yet (the admin report says so in plain words)
Which problems are new, still open or came back (7.7), regressed bugs in the verdict (7.7), per-project verdict rules (7.10), fix status and branch line (6), tickets (8).
