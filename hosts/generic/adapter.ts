import fs from "node:fs";
import path from "node:path";
import type { HostAdapter, HostContext, McpRegistration, Op } from "../host-api.ts";
import { MCP_SERVERS } from "../../core/mcp/servers.ts";
import { renderText } from "../render.ts";

/**
 * The generic host: any agent that reads AGENTS.md and supports MCP (instruction-only). Setup renders the procedures as plain Markdown, writes a compact AGENTS.md section
 * into the project (`--project`), and prints the MCP registration for the user to put into their agent's own config, since there is no standard place for it.
 */
const SECTION_ID = "qamind";

const procedures = (ctx: HostContext): Array<{ name: string; file: string }> => {
  const dir = path.join(ctx.runtimeDir, "skills");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => ({ name: f.replace(/\.md$/, ""), file: path.join(dir, f) })) : [];
};

const mcpJson = (ctx: HostContext): string => JSON.stringify({ mcpServers: Object.fromEntries(MCP_SERVERS.map((s) => [s.name, { command: "node", args: [path.join(ctx.runtimeDir, "dist", s.entry), ...s.args] }])) }, null, 2);

export const adapter: HostAdapter = {
  id: "generic",
  detect: () => ({ found: true, note: "Generic: nothing to detect." }),
  placeholders: (ctx, host) => ({
    HOST_NAME: host.name,
    HOST_ID: host.id,
    CLI: "qamind",
    CLI_FALLBACK: `node "${path.join(ctx.runtimeDir, "dist", "qamind.mjs")}"`,
    CORE_PATH: path.join(ctx.runtimeDir, "core"),
    SESSION_ID: "",
    SESSION_ARG: "",
    SESSION_FLAG: "",
    ARGUMENTS: "(the words the user gave after naming the procedure; none if there are none)",
    BROWSER_TOOLS: "the tools of the `browser` MCP server",
    MEMORY_TOOLS: "the tools of the `qa-memory` MCP server",
    MEMORY_TOOLS_LOAD: "The tools are provided by the `qa-memory` MCP server: call them by the names listed here",
    FIX_TOOLS_LOAD: "The tools are provided by the `qa-memory` MCP server: call them by the names listed here; ask the user before `fix_create_branch` and `fix_continue`, because they decide those",
    QA_TOOLS_APPROVED: "",
    ...host.commands,
  }),
  plan: (ctx): Op[] => {
    if (ctx.scope !== "project") return [];
    const template = fs.readFileSync(path.join(ctx.repoRoot, "hosts", "generic", "AGENTS.section.md"), "utf8");
    return [{ op: "block", kind: "instructions", path: path.join(ctx.projectDir, "AGENTS.md"), id: SECTION_ID, syntax: "html", text: renderText(template, { RUNTIME: ctx.runtimeDir }, "hosts/generic/AGENTS.section.md") }];
  },
  mcpRegistrations: (ctx): McpRegistration[] => MCP_SERVERS.map((s) => ({ name: s.name, command: "node", args: [path.join(ctx.runtimeDir, "dist", s.entry), ...s.args] })),
  skills: (ctx) => procedures(ctx).map((p) => ({ name: p.name, file: p.file })),
  notes: (ctx) => [
    ctx.scope === "project" ? `A QAMind section was written into ${path.join(ctx.projectDir, "AGENTS.md")} (between qamind:start and qamind:end markers; edit around it, not inside).` : "User-level generic setup writes no file: there is no standard place for it. Run `qamind setup --host generic --project` in a project to add the AGENTS.md section there.",
    "Register the two MCP servers in your agent's own MCP configuration (the format is the common one):",
    ...mcpJson(ctx).split("\n").map((l) => `    ${l}`),
    "Set QAMIND_PROJECT_DIR to the project folder if your agent starts MCP servers elsewhere.",
    "Generic is instruction-only: auto-QA and the safety rules are things the agent is asked to do, not things anything enforces.",
  ],
};
