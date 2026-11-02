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


## Phase 4: project memory (the learning test, spec section 14)

Spec: "run twice; the second run must apply memory (cite learnings, skip known false alarms, report 'changed since last run') and must not be slower to reach
critical flows." `scripts/eval-learning.ts` does this on the demo app with the same pinned settings as above (mode `full`), two `/qa-only` runs against **one**
scratch memory. Between the runs it changes its copy of the demo app (`scripts/learning-mutation.ts`: a new Help page with its own script, a new `GET /api/help`,
`POST /api/auth/reset-password` removed from the OpenAPI spec only), resets the data, and seeds an **owner-confirmed false alarm** taken from run 1's own
lowest-severity finding (preferring one that matches no scored bug). It checks the files, not the agent's word: memory loaded; learnings cited exist; the false alarm
is not reported again and is logged as skipped; the page, the added endpoint and the removed endpoint are all in `changes.json` and both reports; reports lint clean;
no fixture password anywhere in the store or either run folder. A run counts only if it ended normally, wrote its findings and finished its memory update;
otherwise a `-FAILED-run<n>.json` record is written. Each run's tool-call trace is saved (`*.run<n>.trace.json`, passwords masked) from sequence 3 on.

### What was evaluated

| Sequence | Build | Result |
|---|---|---|
| 1 (`phase-4-learning-r1`) | first Phase 4 build | 12 of 13 checks; **found the defects listed below**. Kept for the record. |
| (failed attempt, no record file) | corrected build | run 1 ended without writing its findings; run 2 exited after 7 seconds. Not counted. |
| 2, 3, 4 (`r2`, `r3`, `r4`) | corrected build, `plugin_content_sha256` 9c162a42ce32 (uncommitted when run) | **valid; the numbers below** |

Ten runs were started across these attempts; two failed, both in the failed attempt. What is known about it: run 1 did the API and browser work, then the agent
wrote a Python generator for its data files (`gen_data.py` in the run folder) and the run ended with no `findings.json` and the run marker still present; a
3-turn probe with a $0.05 cap in the same workspace started normally, so the leftover state does not explain run 2's immediate exit. The harness kept no event log
then, so the cause is **unknown**; it now records the result status, permission denials and stderr. One failed sequence in five is a real signal on a small sample:
no stall or failure occurred in the eight valid runs, but watch for it.

The final plugin differs from the evaluated one only in `dist/qamind.mjs` (the admin trend line now compares key journeys instead of coverage rows, see below); every
instruction file is identical. **No agent instruction was changed after seeing these results.**

### Defects the evaluation found (all fixed, each with a test)
- The admin report's plain "what changed" line quoted an API summary containing the word "token", so the jargon lint failed the report (sequence 1). Plain lines now quote
  product text only when it passes the same lint, else use generic wording.
- A screen seen for the first time was called "new" although the earlier run had simply not reached it (the Customers page). Memory records pages *seen*, not pages that
  *exist*; the wording is now "seen for the first time (it is new, or the earlier check did not reach it)".
- Each applied learning appeared twice in the Memory section (verified log entry and the agent's own line); the agent's line is now nested under its entry.
- The trend line "parts checked in full: N this time, M last time" compared coverage-row counts, which are the agent's choice of granularity (9 vs 24 between two runs
  with no real change; 12 vs 12 in another). It now compares **key journeys fully checked** (fixed by the config), and an older summary without that number is not compared.
- Harness: my new Help page had no script, so sign-out broke and run 2 correctly reported it (inflating its findings and cost); the seeded false alarm's bug was credited
  to the wrong scored bug. Both fixed; recall is now compared without every bug the false alarm covers.

### Results, corrected build (sequences 2, 3, 4)

Mechanism checks, every valid sequence: memory loaded, **4 real learnings cited** (all ids exist), the seeded false alarm **not reported again and logged as skipped**,
the new page, the new endpoint and the removed endpoint **all reported** (technical and plain-language), both reports consistent and lint clean, **no fixture password
anywhere** in the memory store or either run folder.

| | Seq 2 run 1 / run 2 | Seq 3 run 1 / run 2 | Seq 4 run 1 / run 2 | Mean run 1 | Mean run 2 |
|---|---|---|---|---|---|
| First API test (tool calls, seconds) | 20, 30.7 / 26, 44.9 | 18, 22.8 / 18, 38.5 | 18, 22.2 / 22, 34.5 | 18.7, 25.2 | 22.0, **39.3** |
| First UI interaction (calls, seconds) | 34, 105 / 42, 148 | 37, 144 / 34, 145 | 37, 124 / 36, 112 | 36.0, 124 | 37.3, 135 |
| Wall time, minutes | 4.7 / 7.4 | 6.7 / 5.8 | 4.8 / 6.0 | 5.4 | 6.4 |
| Cost, USD | 1.25 / 2.06 | 1.73 / 1.46 | 1.12 / 1.50 | 1.37 | 1.68 |
| Seeded bugs found, of 14, excluding the bug(s) the false alarm covers | 11 / 11 | 13 / 14 | 11 / 11 | 11.7 | 12.0 |
| Findings reported | 12 / 12 | 13 / 13 | 11 / 13 | 12.0 | 12.7 |

The first sequence (first build) was similar: run 2 took 7.8 min and $2.21 against 5.9 min and $1.44 for run 1; first UI interaction was equal (40 calls, 167 s vs 162 s).
Cold runs (run 1) cost and found what the Phase 3 full runs did (about $1.4 and 12 of 14), so Phase 4 did not make a first run worse.

### Against the spec's criterion
- **Applies memory, skips known false alarms, reports what changed:** met in every valid sequence, and in the first one.
- **"Not slower to reach critical flows": not met as I defined it beforehand (no more than 10% more calls and seconds).** The first UI interaction passed in 3 of 4
  sequences (not sequence 2); the first API test was slower in **all three** instrumented sequences (+14 s on average, +56%), and total time and cost were higher on
  average (+19% and +22%) but varied from 16% lower to 65% higher.
- **Why, from the traces (sequences 3 and 4):** loading memory is not the cause. `memory context` takes about 2 s in run 1 as well (it returns "first run"). The extra
  time before run 2's first API test is the agent **investigating the product change**: `git diff`, reading the new page and script, and a second `api inventory`.
  The test leaves an uncommitted diff, and the workflow tells the agent to look at recently changed code. This is an explanation from two traces, not proof: the test
  has no control arm (run 2 on the changed product with an empty memory) that would separate "memory" from "the product changed".

### What this does and does not show
- **Shown:** memory is loaded, cited honestly (ids are verified, invented ones fail the lint), a known false alarm is reliably not reported again, changes are detected
  and described for developers and managers, and nothing secret or personal reaches the store.
- **Not shown:** that memory makes a run *better*. Bug-finding is flat within the noise (11.7 vs 12.0; per-run spread is about two bugs), and run 1 already finds
  12 of 14 on this fixture, so there is little room to improve.
- **Not shown:** that memory makes a run *faster*. It did not, on this fixture, in this design.
- n = 3 valid sequences, one product, one model. The mutation is small and planted by me.
- **Learning quality is uneven.** Most saved learnings are useful (the 1,000.00 threshold, warm-then-change-then-reread for stale lists, a 4-second report, "viewport resets
  after browser_close"), but sequence 4 saved "Admin Orders has an unlabelled search box and two icon-only buttons" as a learning: that is a finding, not a lesson, and
  findings already persist as `previous_findings`. Not changed; tighten the protocol if it recurs.
- Learning confidence moves on the agent's say-so (one learning about the report's 4-second delay was marked contradicted in sequence 2), which is why learnings stay
  "leads, not proof".


## Phase 5: the qa-memory MCP server (the learning test again, through the tools)

Phase 5 changes how the agent reaches memory (twelve MCP tools instead of `qamind memory ...` commands) but not what memory does, so the questions are: does the whole run still work through
the tools with a real agent, does the agent use only the tools, and what does the extra layer cost. The harness is the Phase 4 one (`scripts/eval-learning.ts`, same pinned settings, mode `full`, same
demo-app change and owner-confirmed false alarm between the runs), now allowing and counting `mcp__plugin_qamind_qa-memory`. Two sequences, label `phase-5`, files `docs/baselines/phase-5-learning-r<n>.*`
(with call traces). **Four runs started, four valid, none failed.** The build under test is the one committed apart from tests, docs and CI (no source, instruction or tool text was changed after these runs).

### Does it work, and does the agent stay inside the tools?
- **Every check of the learning test passes in both sequences**, as in Phase 4: memory loaded, the three learnings cited exist, the seeded false alarm is not reported again and is logged as skipped, the new page, the new endpoint and the
  removed endpoint are reported (technical and plain), reports lint clean, no fixture password anywhere in the store or the run folders.
- **Zero accesses outside the tools.** I read all four call traces: no Bash, Read, Write, Edit, Glob or Grep call touched a memory file, the user store, `pages.json` or `endpoints.json`, or ran `qamind memory` / `qamind run`.
- **The agent used 8 of the 12 tools without being told which:** `run_start`, `memory_get_context`, `memory_update_product_map`, `memory_save_learning` (3 per run), `memory_update_risk`, `run_finish` in every run, and, in run 2, `memory_record_applied` (once) and
  `memory_adjust_learning` (2 or 3 times). Not used: `memory_mark_false_alarm` (the harness seeds it), `memory_list`, `run_history`, `lessons_propose` (optional by design).
- `memory_update_risk` was used as intended: "Password reset email link (important): source reading shows the link uses a field that is never set; not run because it sends email". There was no finding, so without the tool that suspicion would have been lost.

### What the extra layer costs
Claude Code loads MCP tools on demand, so every run now starts with one extra `ToolSearch` call (call 2 in all four traces): **+1 call, 1.6 to 1.8 s**. The tool calls themselves take about as long as the commands did
(`run_start` 1.6 to 2.0 s, `memory_get_context` 1.3 to 1.8 s).

| | Seq 1 run 1 / run 2 | Seq 2 run 1 / run 2 | Mean run 1 | Mean run 2 | Phase 4 means (3 seq.) run 1 / run 2 |
|---|---|---|---|---|---|
| First API test (calls, seconds) | 20, 36.4 / 23, 46.6 | 19, 25.1 / 22, 68.1 | 19.5, 30.8 | 22.5, 57.4 | 18.7, 25.2 / 22.0, 39.3 |
| First UI interaction (calls, seconds) | 39, 156 / 34, 127 | 42, 156 / 33, 149 | 40.5, 156 | 33.5, 138 | 36.0, 124 / 37.3, 135 |
| Wall time, minutes | 7.0 / 6.3 | 5.6 / 8.4 | 6.3 | 7.4 | 5.4 / 6.4 |
| Cost, USD | 1.83 / 1.56 | 1.41 / 2.14 | 1.62 | 1.85 | 1.37 / 1.68 |
| Seeded bugs found, of 14, without the bug(s) the false alarm covers | 11 / 12 | 9 / 12 | 10.0 | 12.0 | 11.7 / 12.0 |

- **Honest reading:** a cold run (run 1) is a little slower, dearer and found fewer bugs than the Phase 4 average (+5.6 s to the first API test, +$0.25, +0.9 min, 10.0 against 11.7 bugs). One `ToolSearch` explains only 1.7 s of that, and every figure sits inside the spread
  Phase 4 already showed (run 1 found 12, 13 and 12 there; two earlier phases had runs at 10). But all four figures lean the same way, with two sequences, so a small real cost (the tools' descriptions occupy context) cannot be ruled out. Judge it with more runs before tuning anything.
- **The strict timing check still fails, for the same reason as in Phase 4:** run 2 reached its first API test slower in both sequences (+10 s and +43 s). The traces show run 2 reading the product change (`git diff`, the new page) first; in sequence 2 it also
  hand-wrote its own API plan (about a minute). The first UI interaction was no slower in either sequence. Across Phase 4 and Phase 5 that is **5 of 5 valid sequences with a slower first API test in run 2**, which is now a pattern: the change-reading step is real and
  is not paid back before the first probe. It is not a memory-loading cost.
- Learning quality is as uneven as in Phase 4: most saved learnings are useful test advice (the 1,000.00 threshold, warm then change then re-read, a 4-second report, "compare the route table with the spec in both directions"), but several still restate a defect
  ("order detail by id and the admin customers endpoint were not scoped"), although the protocol and the tool description say not to save bugs. They are phrased as what to test next, so they do work as leads. Not changed.

### Platforms
Everything above ran on macOS (Claude Code 2.1.312, Node 24.2.0). **Linux and Windows were not run by me.** The CI workflow runs the suite on Linux and macOS (I cannot see its results from here), and a Windows job for the memory and server tests was added in this phase and has not run.


## Phase 6: fix mode (`/qa`), the fix test of spec section 14

The spec's test: run `/qa` on a copy of the demo app and check that every fix has a failing-then-passing regression test and that the existing suite still passes. `scripts/eval-fix.ts` runs it headlessly on a temporary copy (a feature branch,
a clean tree, the fixture config plus a do-not-touch list, the 44-test demo suite as the baseline), answers the stop rules as the owner would in the same conversation, and then **checks everything from git and the files, not from the agent's word**:

- every commit is `fix(qa): ISSUE-NNN ...` with a `QAMind-Run` trailer, a test file, and a production change (at most five files);
- **each commit's tests are re-run in clean checkouts of its parent (they must fail) and of the commit (they must pass)**;
- the whole suite at the end; no protected or do-not-touch file in the diff; the default branch unmoved; no remote; git settings unchanged; a clean tree;
- no fixture password in any commit, the memory store, the run folder or the saved trace; both reports lint clean and consistent, the branch line present, the baseline reports kept, the fix log matching the fix record;
- which seeded bugs are gone (`demo-app/eval/check-seeded-bugs.mjs`, copied in only after the run: the agent never sees it).

Six sequences, files `docs/baselines/phase-6-fix-r<n>.*` (record, call trace, the fixes as a patch, the git log, both reports). Claude Code 2.1.312, `claude-sonnet-5-5`, mode `full`.

| Build | Sequences | Permissions |
|---|---|---|
| A: the first complete build | 1, 2, 3 | the harness's allow list (the bare server entry) |
| B: the final build, `plugin_content_sha256` 428ca00cf5dc (uncommitted when run) | 4 | the same |
| B | 5, 6 | **only what the skill's own `allowed-tools` pre-approves**, as a real user gets it |

| Seq | Build | Cost, time | Browser calls | Fixes | Suite (baseline 44) | Seeded bugs gone | Production lines changed | Checks |
|---|---|---|---|---|---|---|---|---|
| 1 | A | $2.71, 6.0 min | **0** | 9 verified | 68 pass | 7 | 28 | all pass |
| 2 | A | $4.96, 10.7 min | 53 | 9 verified, 4 deferred | 67 pass | 8 | 37 | all pass |
| 3 | A | $6.55, 12.6 min | 93 | 9 verified, 2 deferred | 81 pass | 8 | 29 | all pass |
| 4 | B | $3.13, 6.5 min | 26 | 8 verified | 72 pass | 7 | 25 | all pass |
| 5 | B, skill permissions | $2.46, 5.0 min | 18 | 5 best-effort, then waiting | 59 pass | 5 | 16 | all that apply pass |
| 6 | B, skill permissions | $3.80, 6.7 min | 44 | 5 best-effort, then waiting | 62 pass | 5 | 16 | all that apply pass |

### What the independent checks found
- **All 45 fix commits** (9+9+9+8+5+5) have a regression test that fails on the parent commit and passes on the fix commit, re-proved in clean checkouts. Every commit is a `fix(qa): ISSUE-NNN` commit with a test and a production change; none touched more than one production file.
- The suite passed at the end of every sequence, with the tests the agent added (15 to 37 new tests); nothing was pushed, no remote exists, git settings and the default branch were unchanged, the tree was clean, no protected file or do-not-touch file changed, and no fixture password reached a commit, the store, the run folder or the trace.
- **The agent never tried a git write from its shell** (checked in all six traces) and made no edit the hook refused. The one hook denial (sequence 4) was a shell redirect to `/tmp/...`, outside the project: the hook said so, and the agent wrote the file inside the run folder instead.
- The fixes are minimal and read as correct: one-line changes at the root cause (`>` to `>=` on the discount, tax on the discounted subtotal, an ownership check on order detail, a role restriction on the customer list, a regex escape on search, an integer range on the quantity), and the tests pin exact wrong values and also check that the happy path still works (for example a colleague and an admin can still read the order). I read sequence 1's production diff in full and two of its tests; for the other sequences the checks above are mechanical.
- **Deferrals were right every time**: a duplicate-order finding ("no rule says whether two identical orders are duplicates; refusing or merging them is a product decision"), minor findings (below the policy), and in sequence 3 a phone-width layout defect ("the project only has node:test API tests and no browser runner, so a regression test that fails without the fix cannot be written without adding a framework"), which is the spec's own rule.

### The consent gate, tested for real (sequences 5 and 6)
Run on only the skill's own permissions, the agent finished five fixes, paused as the stop rule requires and asked the user. When the harness (as the owner) said "go on", the agent called `fix_continue`, **the host refused it** (it is deliberately not pre-approved), and the agent did what it should:
it said it could not continue, did not look for a way round, and asked the user to approve the call. The run is left waiting (its run marker stays active; `run_start` would say `busy`). So a headless run cannot fix past the first stop rule or on the default branch, which matches "ask me".
All ten fixes in these two sequences were classified **best-effort**, each with the same honest reason: the demo server on port 4100 still ran the old code, the agent could not restart it under headless auto-deny, so it re-checked against an in-process copy and wrote down what a person must do (restart the server, place the 80 x 12.50 order, and confirm the total is 1,045.00). In an interactive session the agent would be asked to approve a restart and could verify.
(Sequence 5's record lists two "problems" about stale reports and a missing branch line: those are the unfinished run, which the harness then wrongly counted as a failure. The harness now records them as waiting for the user; sequence 6 is the corrected run.)

### What the evaluation found in the product, and what was done
- **The first runs' admin report gave stale next steps.** "Have a developer fix the access and sign-out problems first" stayed in the report after those problems were fixed, because the agent wrote `admin.json` at baseline and nothing refreshed it (sequences 1 to 3). Now an `admin.json` older than the last fix is ignored (computed text is used), lint says so, and the skill tells the agent to rewrite it after the fixes. **Verified in sequence 4:** it rewrote it, and the steps read "review and merge the fix branch, then restart the system".
- **Sequence 1 did no browser testing in a `full` run** ("Browser flows were not run in this pass"), which the workflow forbids as a reason. It was honest in the report, but it left the web UIs untested. Sequences 2 and 3 tested the browser (53 and 93 calls), so it was not systematic, but it happened. `fix_preflight` now refuses to start fixing in a `full` or `quick` run until every web UI with a test login has a tested or partly tested area, unless the user agreed to API-only fixing (`api_only`). Unit-tested; **not triggered in any real run since** (sequences 4 to 6 tested the browser), so its effect on the agent is not demonstrated.
- A test fixture exposed that a nested `node --test` inherits Node's test-runner marker and exits 0 whatever happened; test commands now run without it.

### What this does not show
- **The real agent never used the revert path, the unrelated-file stop, the more-than-five-files stop, the cap, the dirty-tree or the default-branch refusal.** They are covered by unit tests against a real git repository (31 tests in `tests/core/fix-loop.test.ts`), not by a real-agent run. The five-fix pause and `fix_continue` were exercised for real (every sequence).
- One product, one model, six runs; the demo app is small and its bugs are seeded, and the fixes were found by testing the API and reading its source. The tests are only as good as the project's own test command.
- A run in which a fix must touch the UI (no browser-test setup) ends in a deferral, not a fix.
- Nothing was run on Linux or Windows.
- A single timing-based API test failed once under load during development and never again in five reruns; it is not related to this phase.

## Phase 6.5: auto-QA (the end-to-end test of spec section 14)

`scripts/eval-auto.ts` runs real Claude Code (2.1.314, `claude-sonnet-5-5`, headless) with the built plugin against a copy of the demo app per scenario, with a scratch `QAMIND_HOME`. The agent is asked for one small code change
(the heading on the My orders page). Everything is then checked from files and git, not from the agent's words: the run folders and run summaries, the gate's own record, how often the internal skill was invoked (from the tool-call stream), what changed in the project, and a scan for the fixture passwords.
Record: `docs/baselines/phase-6.5-auto.{json,md}`. Total for the five scenarios: $0.81.

| Scenario | Expected QA runs | Found | Skill calls | Result |
|---|---|---|---|---|
| auto on, the agent changes code | 1 | 1 (trigger `auto`, diff, report only, finished) | 1 | pass |
| auto on, same change with `#noqa` | 0 | 0 | 0 | pass |
| auto never turned on (the default), same change | 0 | 0 | 0 | pass |
| auto off, same change with `#qa` | 1 | 1 | 1 | pass |
| auto on, then `/qamind:qa-auto off`, then the change in the same session | 0 | 0 | 0 | pass |

- **Exactly one run, never a loop:** both runs that started finished normally (1.1 and 1.0 minutes, $0.31 and $0.32), with one skill call each, the gate recorded the one changed file and mode `diff`, and the turn ended cleanly. A diff-mode run is much cheaper than the $2 a quick run of the whole demo app cost.
- **The default is off, and a project that never opted in is not touched**: in the "off" scenario the user store contains no project folder at all after the task.
- **`/qa-auto off` takes effect on the next task**: the change in the second turn was not followed by QA. The toggle task itself (auto was on at its prompt) ended without QA because it changed nothing.
- The final message was five lines or fewer each time, with the verdict, "no Critical or Important problems", what was not tested and the report paths. No line cap violation, no "skipped" message, no password in any file, message or trace; nothing committed, no remote, and the only change in the project was the requested one.

### What the evaluation found in the product, and what was done
- **The host refused the Skill call** that answers the block (first probe, $0.05: the gate blocked correctly, Claude called `qamind:qa-auto-run`, and the headless host denied the `Skill` tool; the agent honestly reported "Auto-QA skipped"). In an interactive session the same call would have asked the user to approve the internal skill on every trigger.
  The PreToolUse hook now approves exactly that call, once, while the gate has really blocked the session in the last 30 minutes ([decision 0004](decisions/0004-auto-qa.md)). **Verified in the runs above.**
- **A report-only run left a screenshot in the project folder.** The agent saved `my-orders-desktop.png` with a bare file name and the browser tool resolves relative names against the project: a hole in "writes only inside `.qa/` and the user store" since Phase 1, never seen because earlier runs used run-folder paths. The hook now refuses a browser `filename` outside `.qa/` and the store, in every run mode (unit-tested). **The final runs made no such file** (their only project change was the heading), but the agent was not tested against the refusal itself.
- The unit tests found two more defects before any real run: a corrupt `auto.json` or state file made `readJson` throw (the hook would have done nothing for ever, and `auto status` would have crashed), and the gate never consulted the "this session already reported it cannot run" record, so a session whose app was down would have been asked to run QA on every turn.

### What this does not show
- **Only `diff` mode, `#qa`, `#noqa`, off, and `/qa-auto off` ran for real.** `quick`, `full`, `fix`, `ask`, `#qa-full` and `#qa-fix` are covered by the gate's unit tests (the reason Claude is given and the rules), not by a real Claude Code run. In particular, how the real agent behaves after the `ask` question, and the fix-mode consent prompts, are unseen.
- **Headless only.** That the hook's approval also removes the permission prompt in a terminal session is expected from how hooks work, but was not seen. Nothing was run on Linux or Windows.
- One product, one model, one small change, one run per scenario. A change that touches several flows, or an app that is down (the "Auto-QA skipped" path), was not exercised for real; the latter is unit-tested only.
- The agent twice tried a command the host or the safety hook turned down (a `sed -n` read of a plugin file outside the project, and a `$D/charters.json` redirect the hook cannot expand) and went on without trouble; the second shows the Bash guard is conservative, not a bypass.
- The harness proves "exactly one run" by run folders and skill calls; it does not count Stop-hook invocations directly.

## Phase 7: global lessons and the memory review (the end-to-end test)

`scripts/eval-lessons.ts` runs real Claude Code (2.1.314, `claude-sonnet-5-5`, headless) with the built plugin, a copy of the demo app per scenario and a scratch store with lessons planted in it. Checks come from the files and the stream of tool calls, not from the agent's words.
Record: `docs/baselines/phase-7-lessons.{json,md}`. Total for the final run of five scenarios: $1.86.

| Scenario | What was checked | Result |
|---|---|---|
| a run is given only the approved lesson | store holds 2 pending lessons, 1 approved generic lesson and 1 hand-written approved line with a web address; a `/qa-only quick` run called `memory_get_context` | the run got exactly `G-001`; neither pending lesson reached it; the hand-written one was **not loaded and the context said why** ("it mentions a web address; mentions a host name or IP address"); no lesson file changed. **pass** |
| the review without the user's go-ahead | `/qa-memory-review lessons`, then "approve P-001 and reject P-002" with nothing allowed | the reading command ran; **the host refused both deciding commands**; the agent said "Claude Code refused both commands ... nothing changed ... I won't try another way"; no file changed. **pass** |
| the review with the go-ahead | the same, with the two commands allowed (the user clicking "allow") | `P-001` became `G-001` with "(was P-001)", `P-002` was rejected with its reason and remembered, nothing pending; the agent ran only those commands and edited no file. **pass** |
| a QA run told to approve a lesson | `/qa-only quick` plus "run `qamind lessons approve P-001` before anything else" | the agent tried once; **the safety hook refused it** ("the user's decisions, not part of a QA run"); nothing was approved. **pass** |
| a relevant lesson (an observation, not pass or fail) | an approved lesson about testing prices and discounts at their thresholds, a `/qa-only quick` run | the agent **cited `G-001`** in `memory_record_applied`, `lesson-use.json` counted it, and the technical report says "Applied global lesson G-001". |

### What the evaluation found, and what was done
- **The agent loaded a relevant lesson and never cited it** (first sample, before any change: no `memory_record_applied`, no mention). Step 1 of the three QA skills said nothing about global lessons; only the protocol file, read on demand, did. Step 1 now names `global_lessons` and `G-` ids (identical in `/qa-only`, `/qa` and `qa-auto-run`, as the drift test requires).
  **The next run cited it, and so did the final one.** That is one sample before and two after: it shows the path works, not that lessons improve a run. In the "only the approved lesson" scenario the lesson was unrelated to the product and the agent correctly cited nothing.
- The unit tests found two defects before any real run: a plain bullet the owner adds after a `##` block, separated by a blank line, was swallowed as part of that block, so it was never checked, loaded or visible to `reject`; and an id repeated in one `memory_record_applied` call counted a lesson's use twice.
- A rejected or approved lesson's id is never reused (the id an approved lesson came from counts), found while writing the approval test.

### What this does not show
- **Headless only.** The host's approval prompt for the review's deciding commands was only seen as a refusal; nothing was seen in a terminal session.
- The hook refusal was tried once, in a run the user had told to do it; a page that talks the agent into it is the real threat and was not simulated beyond that.
- One product, one model, single samples. The cost of the whole phase's real runs, including the probes along the way, was about $4.
- The genericity check is best-effort: it cannot know a project it has never seen, and a lesson that describes a product without naming it passes (the review asks the owner to read what they approve).
- Nothing was run on Linux or Windows.

