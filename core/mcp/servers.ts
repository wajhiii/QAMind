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
  "lessons_propose",
] as const;

export type QaMemoryToolName = (typeof QA_MEMORY_TOOLS)[number];
