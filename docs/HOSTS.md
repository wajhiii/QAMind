# Hosts

| Host | Tier | Status | Names the user types | MCP | Auto-QA | Safety guard |
|------|------|--------|----------------------|-----|---------|--------------|
| Claude Code | `full` | built; real end-to-end runs recorded below | `/qamind:qa-only`, `/qamind:qa`, `/qamind:qa-auto`, `/qamind:qa-memory-review` | plugin `.mcp.json` | **enforced** (Stop and UserPromptSubmit hooks) | **enforced** (PreToolUse hook) |
| Cursor | `experimental` | built (Phase 7.5) from Cursor's docs; **never run in a real Cursor** | `/qamind-qa-only`, `/qamind-qa`, `/qamind-qa-auto`, `/qamind-qa-memory-review` | `~/.cursor/mcp.json` or `<project>/.cursor/mcp.json` | **enforced** by design (stop and beforeSubmitPrompt hooks), untested in Cursor | instructions only |
| Generic (`AGENTS.md` + MCP) | `instruction-only` | built (Phase 7.5) | "follow the QAMind `qa-only` procedure" | printed for you to register | **advisory** (the agent is asked) | instructions only |
| OpenAI Codex CLI | `experimental` target | **deferred by the owner (2026-11-02), not built** | - | - | - | - |

A host is labelled **full** only after a real end-to-end run on that host passes ([ADDING-A-HOST.md](ADDING-A-HOST.md) section 5; a test refuses any other host claiming it). Results are recorded below with the date and the host's version.
Install with `qamind setup` ([README](../README.md#install)); add a host with [ADDING-A-HOST.md](ADDING-A-HOST.md).

## How a host registers the servers

The servers are listed once, without any host's syntax, in `core/mcp/servers.ts` (`MCP_SERVERS`: name, the file in `dist/` that runs it over stdio with Node, arguments). A host adapter
turns that list into the host's own registration: for Claude Code, `claudeMcpConfig()` in `hosts/claude/adapter.ts` writes the plugin's `.mcp.json`; for Cursor, `hosts/cursor/adapter.ts` plans the `mcpServers` entries of `mcp.json`.
Adding a host means writing that function from the same list, and noting its tool-name prefix and how it approves tools in `hosts/<host>/host.json`.
The server needs only Node 20+ and the two files in `dist/`; it is host-neutral and takes the project from an explicit `project`, `QAMIND_PROJECT_DIR`, `CLAUDE_PROJECT_DIR` or its working folder.

## Claude Code

- Install: marketplace from the Git repository (see the README). Docs consulted 2026-10-30: plugins reference, plugin
  marketplaces, skills, hooks, MCP (see `hosts/claude/host.json`).
- Skills are namespaced by plugin: `/qamind:qa-only`. `qamind` is put on the Bash tool's PATH by the plugin's `bin/`.
- Three hooks: PreToolUse (the safety guard, a no-op unless a QAMind run is active in the same session), and Stop and UserPromptSubmit for auto-QA (silent no-ops unless the user turned auto-QA on or used a tag; [decision 0004](decisions/0004-auto-qa.md)). Facts verified with 2.1.312 are in `hosts/claude/host.json` (`hooks.verified`): both run in headless `claude -p`, what is on stdin, how `stop_hook_active` behaves, and that a block makes Claude continue and invoke a `user-invocable: false` skill.
- Auto-QA is **enforced** on this host (the Stop hook blocks). A host with no "agent finished" hook gets a rules-file instruction instead, and `/qa-auto status` and the docs must call it **advisory** there.
- Two MCP servers are registered by the plugin: `browser` (browser tool behind the production guard) and `qa-memory` (project memory and the run lifecycle, Phase 5;
  [decision 0002](decisions/0002-qa-memory-server.md)). Their tools are named `mcp__plugin_qamind_<server>__<tool>`, the skill pre-approves both servers, and because Claude Code
  loads MCP tools on demand the skill tells the agent to load the memory tools with one `ToolSearch` call first. The server starts in the project folder with `CLAUDE_PROJECT_DIR` set
  (observed with 2.1.312; the docs do not say).
- **Installing from a Git URL** (checked 2026-11-03, Claude Code 2.1.314, the `claude plugin` commands, against a local Git server standing in for GitHub: `scripts/standins/git-http-server.mjs`, an isolated config folder, and by a fresh agent that had only the README and this file: `docs/baselines/phase-8-firstrun.md`): `plugin marketplace add <git URL ending in .git>` and `plugin install qamind@qamind` copy the plugin into Claude Code's cache, run npm for its dependencies (`@playwright/mcp`, 22 MB) and list it as enabled. **If npm cannot run** (no Node or npm on the PATH; on one machine a broken `node` earlier on the PATH) the install still completes and `plugin list` says "The packages it lists are not installed"; fixing Node and running `claude plugin update qamind@qamind` installs them. Until then the browser launcher falls back to `npx @playwright/mcp@<pinned version>`, which needs the network and is slower the first time. Whether the interactive `/plugin install` behaves the same was not tried. A plugin loaded in place from a local path (development) gets no dependencies.

## Cursor (experimental)

Built from Cursor's current documentation, read 2026-11-02 (the pages are listed in `hosts/cursor/host.json`). **QAMind has never run inside a real Cursor**, neither the editor nor the agent CLI (not installed here); that is why this is `experimental`.
What setup writes: skills in `.cursor/skills/qamind-*/SKILL.md` (the folder is the skill name and the slash command, and the front matter name equals it), the two MCP servers in `mcp.json`, and two hooks in `hooks.json`
(`stop` and `beforeSubmitPrompt`, both of which let the action go on if they fail; `qamind status` counts three entries because the file's `version` marker is one of them), plus a rule file in `.cursor/rules/qamind.mdc` for project installs.

- **Auto-QA** uses Cursor's `stop` hook: printing `{"followup_message": "..."}` makes Cursor submit it as the next user message, `loop_count` is the loop guard (Cursor's own limit is also set, `loop_limit: 3`), and an aborted or failed turn is not checked.
  Cursor submits the follow-up as a prompt, so the gate recognises its own message and starts no new task from it. A Cursor skill is given no session id, so a QA run is matched to the project. A Cursor stop hook cannot show the user a notice, so "Auto-QA skipped" is silent there.
- **The safety guard is not a hook on Cursor, on purpose.** Cursor's permission hooks (`preToolUse`, `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`) block the action when their output is invalid, and their payloads are only partly documented: a mistake in
  QAMind's guard could stop all of the user's tool use. The rules (never read `.env.qa`, never touch production, no git writes in a report-only run, ...) are instructions, as they are on any host without the hook; the fix tools still refuse protected files and unproven fixes.
- **Not documented by Cursor, so not relied on:** skill arguments (a skill reads what the user typed after its name from the message), the name the model sees for an MCP tool, the working folder of a stdio MCP server, and what `${workspaceFolder}` means in the user-level `mcp.json`.
  QAMind passes the project as `QAMIND_PROJECT_DIR=${workspaceFolder}` and ignores a value that was left unexpanded (it then uses the server's working folder; `run_start` also accepts an explicit project).
- Cursor asks to approve each MCP call unless it is on its allowlist; setup prints the entries to add and says to keep `fix_create_branch` and `fix_continue` off it. If you also use Claude Code, Cursor's Third-Party Imports setting may show the same skills twice.

## Generic (instruction-only)

Any agent that reads `AGENTS.md` and supports MCP. `qamind setup --host generic --project` renders the procedures as plain Markdown, writes a compact section into the project's `AGENTS.md` (between `qamind:start` and `qamind:end` markers, removed again by uninstall) and prints the
MCP registration to put in the agent's own config. Auto-QA is **advisory**: the section asks the agent to run `qamind auto status` after changing code. Nothing enforces it, and nothing enforces the safety rules. QAMind has not been run with a real agent through this path.

## Claude Code and `setup`

`qamind setup --host claude` asks Claude Code's own CLI to add this checkout as a marketplace and install the plugin (the same as the `/plugin` commands), and `uninstall` asks it to remove both. It needs the `claude` command (or `CLAUDE_BIN`); without it setup says so and does nothing.

### Certification log

| Date | Host version | Check | Result |
|------|--------------|-------|--------|
| 2026-10-30 | Claude Code 2.1.312 (VS Code extension build) | `claude plugin validate` on the plugin and the marketplace | pass (optional icon and README advice only) |
| 2026-10-30 | same | marketplace add + install from a local path, isolated config dir | pass |
| 2026-10-30 | same | first run on a fresh project creates config and stops; only `.qa/`, `.gitignore`, `.env.qa.example` added | pass |
| 2026-10-30 | same | `/qamind:qa-only quick` on the demo app (twice): report with reproducible findings and a Not tested list, nothing changed in the project, memory only in the store, run marker cleared | pass (details: [EVALUATION-LOG.md](EVALUATION-LOG.md)) |
| 2026-10-30 | same | PreToolUse hook: report-only writes, credential reads blocked | unit tests pass; seen enforcing during run 2 |
| 2026-11-02 | same | probe plugin with a stdio server named `qa-memory`: tool naming, a bare server entry in `--allowedTools`, the server's working folder and `CLAUDE_PROJECT_DIR` | pass; facts recorded in `hosts/claude/host.json` |
| 2026-11-02 | same | the built plugin: both MCP servers connect; `memory_get_context` loaded with `ToolSearch` and approved by the bare server rule | pass |
| 2026-11-02 | same | `/qamind:qa-only full` twice in each of two sequences, memory and run bookkeeping only through the qa-memory tools | pass: 4 of 4 runs valid, no access outside the tools (details: [EVALUATION-LOG.md](EVALUATION-LOG.md)) |
| 2026-11-02 | same | `/qamind:qa full` on a copy of the demo app, six sequences: 45 fix commits, each re-proved red on its parent and green on the commit; full suite green; nothing pushed; no protected file touched | pass (details: [EVALUATION-LOG.md](EVALUATION-LOG.md)) |
| 2026-11-02 | same | a skill's `allowed-tools` listing the qa-memory tools one by one is honoured in a headless run, and a tool left out (`fix_continue`) is refused by the host: the agent stopped and asked the user to approve it instead of working round it | pass (2 sequences) |
| 2026-11-02 | same | the user is asked interactively to approve `fix_continue` and `fix_create_branch` | **not tested**: only the headless refusal was observed |

| 2026-11-02 | same | probe plugin with Stop and UserPromptSubmit hooks: events fire in `claude -p`, stdin fields, `stop_hook_active`, a block makes Claude continue and invoke a model-invocable skill, `systemMessage` reaches the user | pass; facts recorded in `hosts/claude/host.json` |
| 2026-11-02 | Claude Code 2.1.314 (VS Code extension build) | auto-QA end to end, headless, five scenarios on the demo app (auto on + change; `#noqa`; auto off; `#qa`; `/qa-auto off` then change) | pass: exactly one run where one is expected, none otherwise (details: [EVALUATION-LOG.md](EVALUATION-LOG.md)) |
| 2026-11-02 | same | the headless host refuses the `Skill` call that answers an auto-QA block; the PreToolUse hook's `allow` for that one call is honoured | refused without the hook, pass with it |
| 2026-11-02 | same | auto-QA in an interactive session: no permission prompt for the skill, `ask` mode, fix-mode consent prompts | **not tested** |
| 2026-11-02 | same | `/qamind:qa-memory-review` headless: the pre-approved reading command runs; approve and reject are refused by the host when not allowed, and the agent stops and says so; allowed, they work | pass (details: [EVALUATION-LOG.md](EVALUATION-LOG.md)) |
| 2026-11-02 | same | a QA run told to run `qamind lessons approve`: the PreToolUse hook refuses it | pass |
| 2026-11-02 | same | the interactive approval prompt for the review's deciding commands | **not tested**: only the headless refusal was observed |
| 2026-11-02 | Claude Code 2.1.314 | the host conformance suite (`tests/conformance/`), `setup --host claude` through Claude Code's own CLI into an isolated config folder: install and re-run, status, the registered servers, skills, a run through them, uninstall leaving nothing, auto-QA hooks | pass |
| 2026-11-03 | Claude Code 2.1.314 | `claude plugin marketplace add <git URL>`, `plugin install`, `plugin update` in an isolated config folder, from a local smart-HTTP Git server (not GitHub) | pass; the install ran npm itself; a broken `node` on the PATH leaves the packages uninstalled until `plugin update` (see above) |
| 2026-11-02 | none (Cursor not run) | the same suite for `cursor`, from Cursor's documentation: files, formats, hooks run with Cursor's documented payloads | pass; **not run in a real Cursor** |
| 2026-11-02 | none | the same suite for `generic` and for a made-up host that exists only in a temp folder (no core change needed) | pass |
| 2026-11-02 | n/a | memory interoperability: a chain of runs through Claude Code's, Cursor's and the generic host's registrations against one store: each sees the earlier learnings, one project id, the same approved lessons | pass |
| - | - | a real run inside Cursor (editor or `agent -p`): skills listed, MCP servers connect, hooks fire and a follow-up continues the agent | **not tested**: this is what would raise Cursor to `full` |

**Not yet verified:** installing from GitHub itself (the repository was never pushed from the environment the phases were built in, so only a local stand-in for a Git host was used), the interactive `/plugin` commands, Windows,
Linux (the CI workflow runs the suite on Linux and macOS, but I cannot see its results from here; the Windows job is new in Phase 5 and has not run). Tier: **full**, for the Phase 1 feature set only (`/qa-only`); other skills arrive in later phases.
