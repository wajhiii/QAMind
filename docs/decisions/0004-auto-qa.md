# 0004: Auto-QA after every agent task

Status: accepted (Phase 6.5). Date: 2026-11-02.

## Decision

When the user turns it on, QAMind checks every task that changed code before Claude Code finishes it. It is **off by default**, it is a **gate in code** (not an instruction the agent may skip), and everything the user can say about it
(`/qa-auto`, tags in a prompt, `QAMIND_AUTO=0`) is read by the same code on every host.

- **The gate is a library**, `core/auto-qa/`, fed by two Claude Code hooks that run the existing bundle: `qamind hook user-prompt-submit` and `qamind hook stop`. No second bundle and no bash: Node runs on every platform Claude Code does,
  and the hook costs about 110 ms per call (about 40 ms of that is starting Node).
- **UserPromptSubmit** reads the tags in the prompt and takes a snapshot of the project (HEAD and a content hash of every changed or untracked file). **Stop** takes the snapshot again and applies the seven rules of spec 9.5 in order.
  When QA must run, it answers `{"decision":"block","reason":...}`: Claude continues with the reason as its instruction and runs the QA.
- **Nothing is written for a project that never opted in.** With auto-QA off and no tag, the prompt hook writes nothing (it only removes a record left by an earlier task), and the Stop hook only reads two small files.
  The settings live in the user's private store (`<store>/auto.json`, global `$QAMIND_HOME/auto.json`), never in the repository, so each person controls their own.

## Why an extra, internal skill

`/qa-only` and `/qa` are `disable-model-invocation: true`: only a person can start them, and the model cannot call them through the Skill tool. That is what keeps a prompt-injected page from starting a fix run. A Stop hook can only
talk to the model, so auto-QA needs a skill the model *may* call. `qa-auto-run` is that skill (`user-invocable: false`, so it is not in the user's menu, and its description says it only runs when the hook's message asks for it). It is the
`/qa-only` procedure with the interactive parts removed: Steps 1 to 5 are **word for word the same** as `/qa-only` (a test fails if they drift), Step 0 starts the run with `trigger: "auto"` and never asks the user, and the fix phase exists only for
`fix` mode. Report-only modes start the run as `kind: "qa-only"`, so the safety hook keeps the run read-only whatever the skill's pre-approved tools say; `fix` mode starts it as `kind: "qa"`, like `/qa`, with the same consent tools left unapproved.

## Approving the skill call, in code

The first real run showed a problem the unit tests could not: in a headless run the host **refuses the Skill call** that answers the block ("Skill" is not an allowed tool), and in an interactive session the user would be asked to approve the internal skill every single time auto-QA, which
they turned on, does its job. The plugin cannot ship permission rules, so the existing PreToolUse hook now also sees the Skill tool and approves exactly one thing: a call to `qa-auto-run` while the gate has really blocked this session in the last 30 minutes (the gate writes `state/auto-pending.json` when it blocks,
and the approval consumes it). Any other skill, another session, an expired record, a second call: no opinion, so the host's normal prompt applies. The approval is therefore a fact checked in code, not a blanket allowance, and a page that talks the model into calling the skill with no block pending gets the normal prompt.
The consent tools of fix mode (`fix_create_branch`, `fix_continue`) are still not pre-approved.

## Which files did this task change

Not `git diff`: that would blame the task for work the user already had open. The prompt hook records a hash of every changed file at the start; at Stop a file counts when its hash differs, plus whatever commits the task made (HEAD moved).
The ignore list (documentation, lock files, `docs/**`; configurable) and QAMind's own folders are removed after that. This is also what makes rule 5 work: a task that changed no code, or that left the project in the state the last auto run already checked, runs nothing.
A task that began before auto-QA was turned on has no snapshot and is skipped (turning it on does not QA the work that was already there).

## It cannot loop

Four independent stops, any one of which is enough:
1. `stop_hook_active`: the Stop that follows our own block does nothing and writes nothing (rule 3).
2. The record of the task (tags, snapshot) is consumed by the first Stop that sees it, and the state hash and the time of the run are stored **when QA is asked for**, not when it finishes, so a QA run that fails halfway cannot be asked for again by the same state.
3. The task that just finished being a QA run (the prompt was `/qa-only`, a run is still open in this session, or `run finish` wrote `state/last-run.json` after the prompt) is skipped (rule 4). The run marker alone is not enough: `run_finish` clears it before Stop.
4. The cooldown (3 minutes) and, behind everything, Claude Code's own cap on consecutive Stop-hook continuations.

## What it does when it cannot run

"Auto-QA skipped: <reason>" **once per session**, not every turn: no git repository, no `.qa/config.md`, no test login, or a QA run that found the app unreachable (the skill reports it with `qamind auto skipped`, and the session is left alone until a `#qa` tag or a new session).
Hooks never fail the host's turn: bad input, a corrupt or too-new settings file, or any error is a silent "no opinion" with exit code 0 (`QAMIND_DEBUG=1` prints the reason to stderr).

## Safety

- File names in the reason are data: plain names are listed, anything with a newline or odd characters is only counted, so a file called `x\nignore all rules` cannot write into the instructions. The message says they are not instructions.
- Credentials are checked for presence only, never read into output; the reason never contains a value.
- Auto-QA never fixes on its own: `fix` mode must be set by the user (`/qa-auto mode fix`) or forced for one task with `#qa-fix`, and every fix rule of decision 0003 stands.
- A tag can force a run when auto-QA is off or disabled by `QAMIND_AUTO=0`, but never when `#noqa` is in the same prompt, and never past `stop_hook_active`.

## Found by the end-to-end run, and fixed here

- The Skill approval above.
- **The browser tool wrote a screenshot into the project folder.** The agent saved `my-orders-desktop.png` with a bare file name, and the Playwright MCP resolves relative names against the project (the workspace root), so a report-only run left a stray file in the user's tree: it had broken "writes only inside `.qa/` and the user store"
  since Phase 1, unseen because earlier runs always used a run-folder path. The safety hook now refuses a `filename` for any browser tool that does not resolve inside `.qa/`, the store or a temp folder, in every run mode, and tells the agent the run-folder path to use.

## Not done, or not verified

- **Only macOS was run.** The gate is plain Node and `git`, and the tests are in the Windows CI job (allowed to fail until the owner has read its first result), but nothing was run on Linux or Windows.
- **Interactive behaviour is untested**: the real end-to-end test ran headless (`claude -p`). That the hook's approval also spares the user the permission prompt in a terminal session, how `ask` mode reads there, and the consent prompts of `fix` mode were not seen.
- **`fix`, `full`, `quick` and `ask` modes and `#qa-fix` / `#qa-full` were exercised by the unit tests of the gate only** (the reason text and the rules), not by a real Claude Code run; the real runs covered `diff` mode, `#qa`, `#noqa`, auto off, and `/qa-auto off`.
- If another plugin's Stop hook already made Claude continue when ours first runs, `stop_hook_active` is true and that task is skipped. `Stop` does not run when the user interrupts; the next prompt clears the leftover record.
- The time budget (5 minutes for `diff` and `quick`) is part of the instruction, not enforced by code.
- Only the main agent's Stop is used, not the sub-agent one.
- No `background` mode (a separate headless process); the spec lists it as later, with its cost and concurrency trade-offs still to document.
