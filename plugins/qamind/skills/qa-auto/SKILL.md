---
name: qa-auto
description: Turn automatic QA after every agent task on or off for this project, change what it runs (diff, quick, full, fix or ask), pause it for a while, set it for every project, or see its status. Default is off. Does not run QA itself.
argument-hint: "on | off | status | mode diff|quick|full|fix|ask | pause 1h | resume | global on|off"
disable-model-invocation: true
allowed-tools: "Bash(qamind auto *)"
---

# /qamind:qa-auto: QA after every task that changes code (default OFF)

When auto-QA is on, every time Claude Code finishes a task in this project that changed code, QAMind checks those changes before the task ends. You turn it on and off
at any time and the very next task obeys. The settings are private to you (in your QAMind user store, never in the repository), so nobody else's setup changes.

User arguments: `$ARGUMENTS`

Run exactly one `qamind auto ...` command (one command per call, no `&&`, `||` or pipes; only if the shell says `qamind: command not found`, run the same arguments as
`node "${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs"`). It prints JSON: tell the user its `message` and any `warnings` in plain words, then, for `status`, the lines below.

| The user says | Run |
|---------------|-----|
| nothing, or `status` | `qamind auto status` |
| `on` | `qamind auto on` |
| `off` | `qamind auto off` |
| `mode diff`, `quick`, `full`, `fix` or `ask` | `qamind auto mode <mode>` |
| `pause 30m` (or `1h`, `2d`) | `qamind auto pause <duration>` |
| `resume` | `qamind auto resume` |
| `global on` or `global off` | `qamind auto global on` / `qamind auto global off` |
| `cooldown 5`, `budget 10`, `ignore GLOBS` | `qamind auto set cooldown 5` / `... set budget 10` / `... set ignore "src/generated/**,*.snap"` (or `ignore default`) |

Anything else: show the table and run nothing. Never edit the settings files yourself.

For `status`, say in plain words: whether it is on and why (project setting, global default, a pause, or `QAMIND_AUTO=0` in the environment), the mode and what it means, the cooldown,
when it last ran and on how many files, and what would trigger it next. Say that on Claude Code it is enforced by a hook, so the agent cannot skip it.

**Modes.** `diff` (the default once it is on): report-only QA of the files the task changed and what depends on them. `quick`: `diff` plus a smoke check of the critical flows. `full`: a full report-only run
(slow). `fix`: also fixes confirmed critical and important problems on a branch, only because you chose it, with every rule of `/qamind:qa` (a regression test that fails without the fix; never a push or a merge).
`ask`: asks "Run QA on these changes? (yes / no / always / never)" after each task.

**Tags in a prompt** apply to that one task: `#qa` runs QA after it even when auto-QA is off, `#qa-full` forces a full report-only run, `#qa-fix` forces fix mode, `#noqa` skips it. Case does not matter and they can
stand anywhere in the prompt. `QAMIND_AUTO=0` in the environment switches auto-QA off for a whole session, whatever the settings say.

It does not run for a task that changed only documentation or lock files, for a task that was itself a QA run, twice in a row for the same state, or within the cooldown (3 minutes by default) of the last run, unless
you used a tag. If the test logins or the config are missing it says "Auto-QA skipped" once per session instead of failing every turn. The first time, turn it on only after `/qamind:qa-only` has been run once in the project.
