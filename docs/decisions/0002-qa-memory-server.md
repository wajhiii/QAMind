# 0002: The qa-memory MCP server

Status: accepted (Phase 5). Date: 2026-11-02.

## Decision

Memory and run bookkeeping are served by an MCP server named `qa-memory`, started by the host from the plugin's `.mcp.json`. It has twelve tools:
`run_start`, `run_finish`, `run_history`, `memory_get_context`, `memory_list`, `memory_save_learning`, `memory_adjust_learning`, `memory_record_applied`,
`memory_mark_false_alarm`, `memory_update_risk`, `memory_update_product_map` and `lessons_propose`. The spec names nine; `memory_list`, `memory_adjust_learning`
and `memory_record_applied` are the three the Phase 4 CLI already had (read everything, confirm or contradict a learning, cite what was used), so nothing the skill
needed went missing.

- **One implementation.** The tools and the `qamind memory ...` / `qamind run ...` commands both call `core/lib/memory/service.ts`. Validation, de-duplication,
  redaction, the newer-memory refusal and the memory formats cannot differ between them. The commands stay for people, tests and hosts without MCP.
- **Built on the official SDK.** `@modelcontextprotocol/sdk` **1.32.1** (MIT) and `zod` **4.6.7** (MIT), exact versions, dev dependencies only. esbuild bundles them
  into `dist/qa-memory.mjs`, so the plugin needs no `node_modules` and runs on plain Node 20+.
- **A separate bundle from the CLI.** The safety hook runs `qamind.mjs` before every tool call, so that file stays small (0.5 MB); the server bundle carries the SDK
  (1.7 MB, of which zod is 850 KB) and is read once per session.
- **Skills use only the tools for memory.** The skill and shared guides never name a memory command or a memory file (a test scans for both), and tell the agent to
  stop if the server did not start. There is deliberately no fallback to files or the command line.
- **Registration is a function of the host adapter.** `core/mcp/servers.ts` lists the servers without any host's syntax; `hosts/claude/adapter.ts` turns the list into
  `.mcp.json`. Another host writes its own format from the same list.

## Why the SDK and not a hand-written server

A stdio MCP server is small, and writing the JSON-RPC loop by hand is possible. I did not, because the SDK also does protocol-version negotiation, capability
declaration, schema-to-JSON-Schema conversion and input validation, and it is maintained by the protocol's authors, so hosts are tested against it. What it costs:

- 95 packages in `node_modules` for development; **nine** end up in the bundle (the SDK, zod, ajv and its helpers, `zod-to-json-schema`, `yaml`), all MIT, ISC or
  BSD-3-Clause. The build fails if a bundled package is not under a permissive license, and generates `THIRD-PARTY-NOTICES.md` from the bundle's own input list
  (esbuild strips license headers, so without it we would be shipping MIT code without its notice; this also fixed a gap from Phase 1, where `yaml` (ISC) was bundled
  with no notice).
- A dependency on the SDK's 1.x line. Its README says 1.x keeps receiving fixes for at least six months after the 2.0 release (2026-07-27), and 2.0 ships as separate
  packages. Only `core/mcp/qa-memory/server.ts` touches the SDK (the tool definitions use zod), so moving to 2.x later is a contained change. Revisit before 2027-02.
- **1.32.1, not 1.32.2.** 1.32.2 was 10 days old when I chose; 1.32.1 was four weeks old. I did not read the release notes for 1.32.2, so nothing says the older one
  lacks a fix. Raise the pin deliberately, after reading them.

## What I verified against real Claude Code (2.1.312, 2026-11-02)

The docs do not say where a plugin's stdio server starts, so I ran a probe plugin through `claude -p` from a separate project folder, then the real built plugin.

| Question | Observed |
|---|---|
| Tool names | `mcp__plugin_qamind_qa-memory__<tool>` (the hyphen is kept) |
| Pre-approval | a bare server entry (`mcp__plugin_qamind_qa-memory`) in `allowed-tools` / `--allowedTools` approves every tool of the server: no denials |
| Working folder | the server starts in the project folder, and `CLAUDE_PROJECT_DIR` is set in its environment |
| Loading | MCP tools are deferred: the agent loads them with one `ToolSearch` call before the first use (the browser tools already worked this way) |
| Invalid arguments | the SDK returns a normal result with `isError: true` and one line per bad field, so the agent can correct itself |

Outside a run, tools find the project from an explicit `project`, then `QAMIND_PROJECT_DIR`, then `CLAUDE_PROJECT_DIR`, then the working folder.

## How it stays safe

- **Validation:** every tool has a zod schema with a length on each text field and a count on each list (a test walks every published schema and fails on an unbounded one);
  control characters are refused; ids and run ids are pattern-checked.
- **Redaction:** every text that is saved (learnings, false alarms, risk notes, lessons, page titles) is screened for the project's test passwords, tokens and keys,
  email addresses other than reserved test domains, and national-ID-, card- and phone-number-like values. A refusal names the kind of data, never repeats it.
  A page title that fails is dropped with a warning; the page is still recorded.
- **Consistency:** each change runs under a per-store lock (processes, not just threads: a test runs five processes against one counter), after the store has been
  migrated to the current format. Migrations (spec 13.17) back up first, log what they did, refuse to drop a field silently, and refuse memory from a newer QAMind as a
  whole. Format 1 is the first format, so no migration exists yet; the framework is tested with synthetic ones.
- **Global lessons** go to `~/.qamind/pending-lessons.md` and nothing reads them until the owner approves one. A lesson that names the project or its UIs, a web
  address, a file, a ticket id, code or personal data is refused with every reason at once.
- **No network**, no file outside the QAMind store and the run folder, no shell. The tools are annotated accordingly (`openWorldHint: false`, `destructiveHint: false`).

## What was deliberately not done

- The API runner, OpenAPI parsing, report generation and the consistency check stay on the CLI. The spec says "where practical"; moving them changes no format and can
  be done later, and Phase 5's job is memory and the run lifecycle.
- No outputSchema / structured output: results are JSON text, which every host shows the model as is.

## Consequences

- One extra `ToolSearch` call at the start of every run, because the tools are deferred: measured at +1 call and 1.6 to 1.8 s in four real runs ([EVALUATION-LOG.md](../EVALUATION-LOG.md)). Across those runs the agent never touched a memory file or the memory commands.
- If the server cannot start, a run cannot start. That is intended: the alternative is an agent quietly editing memory files.
- macOS is the only platform exercised here. The CI workflow covers Linux and macOS (I cannot see its results from where I work), and a Windows job is new in this phase and has not run.
