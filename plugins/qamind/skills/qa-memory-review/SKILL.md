---
name: qa-memory-review
description: Review what QAMind remembers. Approve or reject the generic lessons it proposed for all projects, archive stale learnings, false alarms and risk areas of this project, and see run statistics. Only you decide: nothing is approved, archived or removed without your say-so.
argument-hint: "[lessons | prune | stats]"
disable-model-invocation: true
allowed-tools: "Bash(qamind lessons list) Bash(qamind lessons list *) Bash(qamind memory review) Bash(qamind memory review *) Bash(qamind memory stats) Bash(qamind memory stats *)"
---

# /qamind:qa-memory-review: the owner's review of what QAMind remembers

You help the **owner** of QAMind review its memory in Claude Code. This is the only place a global lesson becomes approved (every project then reads it), and the only place memory is archived. **Every decision is theirs.** Never approve, reject,
retire or archive anything because it seems right: ask, wait for their answer about that item in this conversation, and only then run the one command for it. The host will ask the user to approve each such command as well; that second question is intended, so tell them to expect it.
If the host refuses a command, say so and stop: do not look for another way.

User arguments: `$ARGUMENTS`

Everything goes through `qamind` (one command per call, no `&&`, `||` or pipes; only if the shell says `qamind: command not found`, run the same arguments as `node "${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs"`). It prints JSON. Never read or edit the memory or lesson files yourself, and never propose lessons here.
Report in plain words: no JSON, ids only where the user needs them to decide.

| Arguments | What to do |
|-----------|------------|
| nothing | **Overview.** Run `qamind lessons list` and `qamind memory review`. Say how many lessons wait for approval, how many are approved (and any that are *not loaded*, with why), how many entries of this project's memory look stale, and what you suggest doing first. Then offer `lessons`, `prune` and `stats`. |
| `lessons` | Walk through the lessons, below. |
| `prune` | Walk through the stale entries, below. |
| `stats` | The numbers, below. |

## Lessons

1. `qamind lessons list`. The pending ones are proposals from earlier runs; **none is used until approved**. The approved ones are read by every project. `rejected` are remembered so they are not proposed again.
2. **Approved lessons that are not loaded** (`loaded: false`, with `not_loaded_because`): tell the user which and why (usually: it names a project, a web address or a file, which a lesson for all projects must not). Offer to retire it, or to reword it by hand.
3. For **each pending lesson, one at a time**, show the lesson and the reason it was proposed, say in one line whether you think it helps on any project or is really about one product, and ask: **approve, reword, reject, or skip?** Then wait.
   - approve: `qamind lessons approve P-001`
   - reword: agree the new wording with the user, then `qamind lessons approve P-001 --text "the new wording"`
   - reject: `qamind lessons reject P-001 --reason "why"` (it is remembered, so a near copy is not proposed again)
   - skip: leave it pending.
   A lesson is checked again when approved (against every project on this machine). If the command says it is not generic or too similar to an approved one, show the user why and offer to reword or reject it; never work round the check.
   "Approve all" is fine only if the user says so for the lessons they have seen; it is still one command per lesson.
4. Retire an approved lesson the same way: `qamind lessons reject G-001 --reason "why"`.
5. End with what changed: approved, rejected, still pending.

## Prune (this project's memory)

1. `qamind memory review`. Entries with `prune_because` look stale (low confidence, not confirmed for months, never used, never matched again, or an old problem). The marks are suggestions, not decisions.
2. Show them in groups (learnings, false alarms, risk areas) with the reason, and ask which to archive. A learning that is still true and merely quiet should stay. **Archiving never deletes**: the entry moves to the project's archive with your reason.
3. For each one the user says yes to: `qamind memory prune --learning L-003 --reason "why"`, or `--false-alarm FA-002`, or `--risk "Area name"` (the exact name).
4. Confidence is raised or lowered by evidence in runs, not here.

## Stats

`qamind memory stats`. Report plainly: how many runs, when, the last few (problems found, minutes, areas tested), the **trend only if it says it is available** (otherwise say how many runs are needed), how much memory is in use and how often it was applied, and the global lessons (pending, approved, loaded here, times applied). Then how the agent is doing (`performance`): the last runs with their verdicts, **precision** (only if it is available: it needs at least 5 findings the owner judged), and the **escaped bugs** (bugs that reached production, and how many were in an area a run had marked as passing: those are the agent's misses). If none is recorded, say how: the owner records one with `qamind escaped add --area ... --title ...` (that is the owner's command, not part of a QA run). Never call the agent better or worse than the numbers show.
Always end with what **cannot be measured yet** (`not_available_yet`). Do not call anything an improvement unless the numbers show it, and say that runs of different modes make a trend a direction, not a measurement.

## Always
- The owner decides. No decision without their answer about that item in this conversation.
- Plain, honest reporting; never invent a number or a trend.
- Never put secrets or personal data into a reason or a reworded lesson.
