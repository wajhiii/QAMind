---
name: qa-feedback
description: Tell QAMind what you think of a finding. Say it is not a bug, the wrong severity, a duplicate, confirmed, fixed, won't fix, or a good catch, and the next run changes accordingly. Only a person can do this; a QA run cannot.
argument-hint: "[ISSUE-003 not-a-bug why | list | import <run>]"
disable-model-invocation: true
allowed-tools: "Bash(qamind bugs list) Bash(qamind bugs list *) Bash(qamind feedback list) Bash(qamind feedback list *) Bash(qamind feedback stats)"
---

# /qamind:qa-feedback: what a person says about a finding

You record the **owner's verdict** on QAMind's findings in Claude Code. Verdicts change what the next runs do, so they are the owner's alone: never give one yourself, guess one from the conversation, or turn a remark into a verdict without asking.
If the host refuses a command, say so and stop: do not look for another way.

User arguments: `$ARGUMENTS`

Everything goes through `qamind` (one command per call, no `&&`, `||` or pipes; only if the shell says `qamind: command not found`, run the same arguments as `node "${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs"`). It prints JSON. Never read or edit the memory files yourself. Report in plain words: no JSON, ids only where the user needs them.

| Arguments | What to do |
|-----------|------------|
| nothing | Show the open bugs worth a verdict: `qamind bugs list`, and `qamind feedback list` for what was already said. Ask which they want to judge. |
| `<ISSUE-003 or BUG-002> <verdict> [note]` | Give that verdict, below. |
| `list` | `qamind feedback list`: what was said, by whom, and the share of findings judged real (only once there are enough verdicts). |
| `import <run>` | Read what people wrote in a report: `qamind feedback import --run <run> --by "<name>"`, below. |

## Giving a verdict

A finding number (`ISSUE-003`) belongs to one run: it means the latest run that has it unless `--run <run-id>` says which. The bug id (`BUG-002`) is the project's own name for it and never changes.
Verdicts: `not-a-bug` (needs a reason: it becomes a known false alarm, so no later run reports it), `wrong-severity <critical|important|minor>` (later reports show the level they set), `duplicate-of <ISSUE-nnn|BUG-nnn>`, `confirmed` or `good-catch` (the area counts as riskier, the learnings behind the finding are trusted more), `fixed` (if a later run finds it again it is shown as **came back**), `wont-fix` (listed as known and accepted, not counted).

1. Make sure you know **which finding** and **which verdict** the user means; if either is unclear, ask. For `not-a-bug` and `wont-fix`, ask for the reason in their words.
2. Ask **who** is giving the verdict if it is not obviously the user (the name is recorded with the date, and the agent cites it later: "Per feedback from <name> on <date>, not reported").
3. Run it: `qamind feedback add ISSUE-003 not-a-bug --note "why" --by "<name>"` (the host asks the user to approve this command; that second question is intended).
4. Tell them in one or two sentences what changed (the command's `effects`), and if it said anything under `warnings`.
Never put a customer's name, email or other personal data in a note: the command refuses it.

## Import

Managers can write in the "Your feedback" line under a problem in `ADMIN-REPORT.md`, starting with a verdict: `not a bug`, `confirmed`, `won't fix`, `fixed`, `good catch`, `wrong severity <level>`, or `duplicate of ISSUE-nnn`, then a reason. Ask who wrote the feedback, then
`qamind feedback import --run <run> --by "<name>"`. It applies the lines that start with a verdict and **returns the others unchanged**: read those lines to the user and ask what they meant; never guess a verdict.

## Always
- Nothing is a verdict until the owner said it about that finding in this conversation.
- Plain, honest reporting; say what each verdict changed and what it did not.
