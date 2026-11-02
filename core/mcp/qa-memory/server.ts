import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { qamindHome } from "../../lib/paths.ts";
import { MemoryTooNewError, UnsafeMemoryTextError } from "../../lib/memory/store.ts";
import { QAMIND_VERSION } from "../../lib/version.ts";
import { ALL_QA_TOOLS } from "../servers.ts";
import type { ToolContext } from "./common.ts";
import { ALL_TOOLS } from "./registry.ts";

/** Shown to the host once, at connection: how to use the server well. Kept short; the skills carry the detailed protocol. */
export const INSTRUCTIONS =
  "QAMind's project memory and run history. Call run_start first in a QA run, then memory_get_context; save what the next run should know with the memory_* tools; call run_finish last. " +
  "Memory is leads, not proof: re-verify before relying on it. Nothing secret or personal is ever stored: texts that contain such data are refused with a message saying what to remove.";

/** The most text one tool result may carry; hosts truncate or file-away very large results, and nothing here needs more. */
const MAX_RESULT_CHARS = 45_000;

function errorKind(err: unknown): string {
  if (err instanceof MemoryTooNewError) return "memory-too-new";
  if (err instanceof UnsafeMemoryTextError) return "unsafe-text";
  return "error";
}

function asResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  let text = JSON.stringify(value, null, 2);
  if (text.length > MAX_RESULT_CHARS) text = JSON.stringify({ truncated: true, note: `The answer was ${text.length} characters, over the ${MAX_RESULT_CHARS} limit. Ask for less (limit, include_findings) or use a narrower tool.`, start: text.slice(0, 4000) });
  return { content: [{ type: "text", text }] };
}

export function createServer(partial: Partial<ToolContext> = {}): McpServer {
  const ctx: ToolContext = { home: partial.home ?? qamindHome(), env: partial.env ?? process.env, cwd: partial.cwd ?? process.cwd(), now: partial.now ?? (() => new Date()) };
  const server = new McpServer({ name: "qa-memory", version: QAMIND_VERSION }, { instructions: INSTRUCTIONS });
  for (const tool of ALL_TOOLS) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: tool.annotations }, async (args: Record<string, unknown>) => {
      try {
        return asResult(await tool.run(args, ctx));
      } catch (err) {
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: (err as Error).message, kind: errorKind(err) }) }] };
      }
    });
  }
  // The skills, the host's pre-approval and the tests all rely on this list being exactly what the server serves.
  const served = ALL_TOOLS.map((t) => t.name).sort().join(",");
  if (served !== [...ALL_QA_TOOLS].sort().join(",")) throw new Error(`qa-memory tool list drifted from core/mcp/servers.ts: ${served}`);
  return server;
}

/** Serve over stdio until the host closes the connection. Nothing but protocol messages may be written to stdout. */
export async function serveStdio(): Promise<void> {
  const server = createServer();
  const exit = () => process.exit(0);
  server.server.onclose = exit;
  process.stdin.on("end", exit);
  process.stdin.on("close", exit);
  await server.connect(new StdioServerTransport());
}

