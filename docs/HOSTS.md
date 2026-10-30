# Hosts

| Host | Tier | Status | Command names | MCP | Safety enforcement |
|------|------|--------|---------------|-----|--------------------|
| Claude Code | `full` target | **built (Phase 1)**; certification result below | `/qamind:qa-only` (`/qamind:qa`, `/qamind:qa-auto`, … later) | plugin `.mcp.json` | PreToolUse hook + instructions |
| OpenAI Codex CLI | `experimental` target | Phase 7.5 | - | - | - |
| Cursor | `experimental` target | Phase 7.5 | - | - | - |
| Generic (`AGENTS.md` + MCP) | `instruction-only` | Phase 7.5 | - | - | instructions only |

A host is labelled **full** only after a real end-to-end run on that host passes. Results are recorded here with the date and
host version.

## Claude Code

- Install: marketplace from the Git repository (see the README). Docs consulted 2026-10-30: plugins reference, plugin
  marketplaces, skills, hooks, MCP (see `hosts/claude/host.json`).
- Skills are namespaced by plugin: `/qamind:qa-only`. `qamind` is put on the Bash tool's PATH by the plugin's `bin/`.
- Hooks are a no-op unless a QAMind run is active in the same session.
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

**Not yet verified:** installing from a Git URL (where Claude Code copies the plugin and installs `@playwright/mcp` itself), Windows,
Linux. Tier: **full**, for the Phase 1 feature set only (`/qa-only`); other skills arrive in later phases.
