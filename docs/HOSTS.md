# Hosts

| Host | Tier | Status | Command names | MCP | Safety enforcement |
|------|------|--------|---------------|-----|--------------------|
| Claude Code | `full` target | **built (Phases 1 to 6)**; certification result below | `/qamind:qa-only`, `/qamind:qa` (`/qamind:qa-auto`, … later) | plugin `.mcp.json` (browser, qa-memory) | PreToolUse hook + instructions |
| OpenAI Codex CLI | `experimental` target | Phase 7.5 | - | - | - |
| Cursor | `experimental` target | Phase 7.5 | - | - | - |
| Generic (`AGENTS.md` + MCP) | `instruction-only` | Phase 7.5 | - | - | instructions only |

A host is labelled **full** only after a real end-to-end run on that host passes. Results are recorded here with the date and
host version.

## How a host registers the servers

The servers are listed once, without any host's syntax, in `core/mcp/servers.ts` (`MCP_SERVERS`: name, the file in `dist/` that runs it over stdio with Node, arguments). A host adapter
turns that list into the host's own registration: for Claude Code, `claudeMcpConfig()` in `hosts/claude/adapter.ts` writes the plugin's `.mcp.json`. Adding a host means writing its
function (for example Codex's `config.toml` entries or Cursor's `mcp.json`) from the same list, and noting its tool-name prefix and how it approves tools in `hosts/<host>/host.json`.
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
- Plugin dependencies (`@playwright/mcp`) are installed by Claude Code when it copies a marketplace plugin into its cache.
  A plugin loaded in place from a local path (development) gets none, so the launcher falls back to
  `npx @playwright/mcp@<pinned version>`.

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

**Not yet verified:** installing from a Git URL (where Claude Code copies the plugin and installs `@playwright/mcp` itself), Windows,
Linux (the CI workflow runs the suite on Linux and macOS, but I cannot see its results from here; the Windows job is new in Phase 5 and has not run). Tier: **full**, for the Phase 1 feature set only (`/qa-only`); other skills arrive in later phases.
