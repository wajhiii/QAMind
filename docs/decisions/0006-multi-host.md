# 0006: Multi-host install (Cursor and generic), and the setup CLI

Status: accepted (Phase 7.5). Date: 2026-11-02. Codex was deferred by the owner the same day; it is not built.

## Decision

A host is a folder, `hosts/<id>/` with a `host.json` and an `adapter.ts`, found by scanning the folder. An adapter **describes** a host (which runtime files it needs, which edits make the host use them); it never writes the host's files. One engine in `cli/src/setup/` applies,
verifies and reverses those edits the same way for every host. Adding a host therefore touches nothing else, which the conformance suite proves with a made-up host that has its own file formats and exists only in a temp folder.

- **Edits are data** (`file`, `json`, `block`, `command`): idempotent, a backup before anything already there is overwritten, an edit the user changed afterwards is left alone on uninstall, a config that is not valid JSON is never overwritten, and only the folders setup created are removed.
  Every edit is recorded in `<store>/installs.json` with what is needed to undo it, so `status` can tell the truth (it answers from what was recorded, even if the rendered runtime is gone) and `uninstall` removes exactly that. A failure part-way still records what was done.
- **The user's store is never touched** by setup, update or uninstall; only `uninstall --purge --yes` deletes it (and not the install folder, which may live beside it). Explicit `--host X` installs only X.
- **Claude Code installs through its own CLI** (`claude plugin marketplace add`, `claude plugin install`, with the undo recorded), so QAMind never edits Claude Code's files. It is skipped with a note when the CLI is missing. The conformance suite runs it against an isolated `CLAUDE_CONFIG_DIR`.
- **The runtime is rendered per host** into `build/<id>/` (git-ignored): the shared documents with that host's placeholders, the skills with that host's names and front matter, and a copy of the two bundles. The registered MCP servers and hooks point there, so an install does not depend on the checkout's layout.
- **The hook format is data too** (`auto_qa.hooks` in `host.json`, read by `core/auto-qa/hostio.ts`): which fields hold the session, the project and the prompt, what the host's loop guard is, which endings are checked, and what to print to make the agent continue. The gate itself is unchanged.
- **Tiers are facts.** `full` needs a real end-to-end run on that host, recorded in HOSTS.md; a test refuses any host but Claude Code claiming it. Cursor is `experimental` and generic `instruction-only`, and the README, `status` and HOSTS.md say what each enforces.

## Cursor, from its documentation (never run in a real Cursor)

The Cursor docs were read on 2026-11-02 (pages in `hosts/cursor/host.json`). What was used: Agent Skills in `.cursor/skills` (name equal to folder, `disable-model-invocation` for the user-only skills, `user-invocable: false` for the internal one, which only a changelog line documents), `mcp.json` with `${workspaceFolder}`,
and the `stop` and `beforeSubmitPrompt` hooks (`followup_message` continues the agent, `loop_count` guards the loop).

- **No safety hook on Cursor.** Its permission hooks fail *closed* on invalid output and their payloads are only partly documented, so a bug in QAMind's guard could stop all of the user's tool use. The guard is instructions there, and the README says so. The two hooks that are installed let the action go on if they fail.
- **A skill is given no session id**, so the gate matches a QA run by project when the run has no session (the store is per project). `{{SESSION_ARG}}` and `{{SESSION_FLAG}}` render empty, and `qamind auto skipped` without a session applies to the whole project.
- **Cursor submits the follow-up as a prompt**, so the gate recognises its own message (it starts with "QAMind auto-QA.") and starts no task from it.
- **The skills' arguments** are not documented by Cursor: a skill is told to read what the user typed after its name. `${workspaceFolder}` in the user-level file and the stdio working folder are not documented either: the project is passed as `QAMIND_PROJECT_DIR`, an unexpanded value is ignored, and the hook also looks at `CURSOR_PROJECT_DIR`.
- **MCP approvals are Cursor's:** setup prints the allowlist entries and says to keep `fix_create_branch` and `fix_continue` off it; it does not edit `permissions.json`.

## Found by the conformance suite and fixed here

- The run history listed two runs finished in the same second in the wrong order (`.json` sorts after `-2`): the history and "the last run" now sort by run id.
- Runtime messages named Claude Code's commands (`/qamind:qa-only`): they are neutral now, and a test keeps core free of any host's names, commands, tools and folders.
- Uninstall left a skill folder behind when the user had deleted its file, and left the lock's empty folder in the store; both are cleaned up, and only folders setup itself created are ever removed.

## Not done, or not verified

- **Cursor was never run.** Neither the editor nor `agent` is installed here, and running either needs the user's login. Everything about Cursor is checked against its documentation and by the conformance suite, which feeds the hook commands Cursor's documented payloads. What is untested: that the skills appear and run, that the MCP servers connect and the model finds their tools,
  that the hooks fire, that a follow-up continues the agent, and what `${workspaceFolder}` expands to in the user-level file.
- **Generic was not run with a real agent.** The AGENTS.md section and the MCP registration are checked for form, and the registered server for behaviour, not an agent's compliance.
- **Windows and Linux were not run**: `setup.cmd`, the `.cmd` launcher and the PowerShell quoting of Cursor's hook commands are written from the documentation. The Windows CI job (allowed to fail) now includes the setup and conformance tests.
- `update` re-renders every recorded install and refuses to run over uncommitted changes; it was tested against a local repository with tags, not against GitHub, and there are no release tags yet (`--edge` follows the branch).
- `status` cannot see inside Claude Code beyond what its CLI lists, and does not re-check that a host's UI shows the skills.
- Codex: deferred by the owner. It will be a new `hosts/codex/` folder.
