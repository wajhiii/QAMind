/**
 * The MCP servers QAMind ships, described once and without any host's syntax. A host adapter turns this list into that host's
 * registration (for Claude Code: the plugin's `.mcp.json`), so adding a host never means copying a server definition.
 */
export interface McpServerDef {
  /** The server name hosts show and prefix tool names with. */
  name: string;
  /** The file in the built `dist/` folder that runs the server over stdio with Node. */
  entry: "qamind.mjs" | "qa-memory.mjs";
  /** Extra arguments after the entry file. */
  args: string[];
  /** One line for documentation and `status` output. */
  purpose: string;
}

export const MCP_SERVERS: readonly McpServerDef[] = [
  { name: "browser", entry: "qamind.mjs", args: ["browser-mcp"], purpose: "Browser automation behind the production guard." },
  { name: "qa-memory", entry: "qa-memory.mjs", args: [], purpose: "Project memory and run history: validated, de-duplicated, screened for secrets." },
];

/** Names of the tools the qa-memory server offers; the skills, the host's pre-approval and the tests all check against this one list. */
export const QA_MEMORY_TOOLS = [
  "run_start",
  "run_finish",
  "run_history",
  "memory_get_context",
  "memory_list",
  "memory_save_learning",
  "memory_adjust_learning",
  "memory_record_applied",
  "memory_mark_false_alarm",
  "memory_update_risk",
  "memory_update_product_map",
  "bank_save_test",
  "lessons_propose",
] as const;

export type QaMemoryToolName = (typeof QA_MEMORY_TOOLS)[number];

/**
 * The fix loop's tools (Phase 6), served by the same server. Only a /qa run started by a person may use them.
 * `FIX_CONSENT_TOOLS` need the user's go-ahead (a branch on their repository, continuing after a stop), so a host that pre-approves tools
 * should leave them out and let the user decide when it asks.
 */
export const QA_FIX_TOOLS = ["fix_preflight", "fix_create_branch", "fix_begin", "fix_run_tests", "fix_commit", "fix_revert", "fix_defer", "fix_run_suite", "fix_continue", "fix_status"] as const;
export const FIX_CONSENT_TOOLS = ["fix_create_branch", "fix_continue"] as const;
export type QaFixToolName = (typeof QA_FIX_TOOLS)[number];

export const ALL_QA_TOOLS: readonly string[] = [...QA_MEMORY_TOOLS, ...QA_FIX_TOOLS];
