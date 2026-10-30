# Memory protocol

Memory is private to the user and the machine: it lives in the QAMind user store (`$QAMIND_HOME`, default
`~/.qamind`), never in the project's git, and is never uploaded. Each project has its own memory. The same memory is
used on every host.

## What exists in this version
- `project.json`: the project's identity and the folders it has been seen at (written by `run start`).
- `memory/stack.json`: the detected frameworks, test runner and commands (written by `run start`).
- `memory/runs/<run-id>.json`: one summary per finished run (written by `run finish`).
- `state/`: the run marker and guard log for an active run.

Richer memory (product map, risk areas, learnings, false alarms) is added in a later version. Do not invent it.

## Rules that always apply
- Memory is **leads, not proof**. Re-verify current behaviour. Say when memory shaped a decision.
- Never store secrets, tokens, passwords or real people's personal data anywhere in memory.
- Do not write into the store by hand. Use the `qamind` commands; they validate and keep formats consistent.
- Never edit the plugin's own skill, shared or knowledge files during a run. Put improvement ideas in
  `.qa/suggested-improvements.md`.
