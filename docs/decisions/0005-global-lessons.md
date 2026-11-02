# 0005: Global lessons and the owner's memory review

Status: accepted (Phase 7). Date: 2026-11-02.

## Decision

A lesson that would help on any project goes through three states: **pending** (the agent proposed it; nothing reads it), **approved** (the owner decided; every project reads it) and **rejected or retired** (remembered, so a near copy is not proposed again).
Only the owner moves a lesson, and the rest of the system is built so that a QA run cannot do it for them.

- **The approval is a command the host asks the user about, not a tool the agent can call.** The qa-memory server has no tool that approves, rejects or removes anything (a test refuses one by name). The owner's review is the `/qa-memory-review` skill over `qamind lessons ...` and `qamind memory ...`.
  Reading commands (`lessons list`, `memory review`, `memory stats`) are pre-approved by the skill; **approve, reject and prune are left out**, so Claude Code asks the user every time, the same consent design as the fix loop's `fix_continue`. The skill also tells the model to ask first,
  one item at a time, and never to touch the files. It is `disable-model-invocation: true`.
- **A QA run cannot approve its own lessons.** A run reads untrusted pages and its Bash is pre-approved for `qamind *`, so a page that talked the agent round could otherwise approve what the agent proposed. The PreToolUse hook now refuses, in every run mode, `qamind lessons approve|reject`,
  `memory prune`, the auto-QA settings commands (`auto on|off|mode|pause|resume|global|set`) and any Write, Edit or shell write to the lesson files and `auto.json`. Reading is not refused, and the owner's own review is not a run, so it is not affected.
- **Generic by rule, enforced at three points.** The same checks apply when a lesson is proposed (against the current project's names), when it is approved (against **every project on the machine** and as the owner reworded it), and **every time a run loads it**, because the owner may edit the files by hand (the spec allows it) and a hand edit
  must not be able to leak one product's name, address or code into every other project. A lesson that fails at load time is not given to the run; the run's context and the review say which and why. The name check is an exact match on a project's name or folder name (four characters or more), so it is a safety net, not a judge: the skill asks the owner to read what they approve.
- **Only approved lessons are loaded**, at most 25 (best-used first, then newest), each 20 to 280 characters, as `global_lessons` in `memory_get_context`. A run cites one in `memory_record_applied` (`G-001`; only real approved ids are accepted); the technical report then says "Applied global lesson G-001", and `lesson-use.json` counts it so the review shows which lessons earn their place.
- **Rejection is remembered** (`rejected-lessons.jsonl`). Without it a rejected lesson would come back every run. `lessons_propose` answers `rejected-before` and the protocol tells the agent not to reword and retry.
- **The files stay the owner's.** Plain Markdown, ids are never reused (the id an approved lesson came from counts), the owner's notes and headings survive every rewrite, and a bullet line written by hand is a lesson with a stable id of its own.

## The review of project memory

`qamind memory review` lists learnings, false alarms and risk areas and **marks what looks stale, with the reason** (confidence 4 or below, not confirmed for 180 days, never used in 90 days and only moderately trusted, never matched in 120 days, a problem last seen over a year ago).
The marks are suggestions. `memory prune` archives one named entry with the owner's reason, **never deletes it** (the spec's rule for contradicted learnings, extended to the owner's pruning), and takes exactly one target per call, so a bulk deletion cannot happen by accident.

`memory stats` reports what the data can say and **lists what it cannot**: a trend needs six finished runs (latest three against the three before, with the warning that modes are mixed), and precision and escaped bugs are named as not available yet (they need the feedback and Sentry phases) instead of being estimated. The spec's "Agent performance" section of the technical report belongs to the metrics phase (7.10).

## What the real agent did

Four scenarios, real Claude Code (details: [EVALUATION-LOG.md](../EVALUATION-LOG.md)): a run was given only the approved, generic lesson, and was told why a hand-written one naming a web address was not loaded; the review skill listed the lessons, and without the user's go-ahead the host refused both deciding commands and the agent stopped and said so;
with the go-ahead it approved one lesson and rejected the other correctly; and a QA run that was told to approve a lesson tried, and was refused by the hook. The first run did not cite a relevant approved lesson; after Step 1 of the three QA skills was changed to mention global lessons, the next run did.

## Not done, or not verified

- **Interactive sessions were not seen.** The review ran headless; the host's approval prompt for each deciding command was only seen as a refusal. How it reads in a terminal, and whether answering the chat question and then the host's prompt feels like one question too many, is untested.
- One sample each for "the agent cites a relevant lesson" (no citation before the instruction change, one after). It shows the path works, not that lessons improve runs.
- The name check cannot know a project it has never seen, and a lesson that describes one product without naming it passes every automatic check: the owner's reading is the real gate.
- `approve` writes the approved file and then the pending file; a crash between the two leaves the lesson in both, and the next approval says it is a near copy and suggests rejecting the pending one.
- Nothing was run on Linux or Windows; the Windows CI job (allowed to fail) now includes the lesson tests.
- **A run that never finished keeps its marker for up to 8 hours**, and while it does the hook treats that session as a QA run: it also refuses the owner's deciding commands there (with the message that they are the user's decisions). The way out is a new session, or finishing or abandoning the run.
- The review has no way to edit an approved lesson's wording in place (retire it and approve a reworded one, or edit the file).
