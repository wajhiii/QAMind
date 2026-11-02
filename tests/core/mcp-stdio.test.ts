import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { QA_MEMORY_TOOLS } from "../../core/mcp/servers.ts";
import { makeConfiguredProject, repoRoot, tmp } from "./helpers.ts";

// The server as a host runs it: a separate process speaking MCP over stdio. Checked from source and from the built plugin bundle,
// which is the file Claude Code actually starts. Nothing but protocol messages may reach stdout, and nothing should reach stderr.
const targets = [
  { name: "from source", file: path.join(repoRoot, "core", "mcp", "qa-memory", "main.ts"), flags: ["--disable-warning=ExperimentalWarning"] },
  { name: "the built plugin bundle", file: path.join(repoRoot, "plugins", "qamind", "dist", "qa-memory.mjs"), flags: [] as string[] },
];

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

for (const target of targets) {
  test(`qa-memory over stdio, ${target.name}: handshake, tools, a real run start, clean output, exits when the host disconnects`, async () => {
    assert.ok(fs.existsSync(target.file), `${target.file} must exist (run npm run build)`);
    const home = tmp("qamind-home-");
    const proj = makeConfiguredProject({ remote: "https://github.com/acme/shop.git" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [...target.flags, target.file],
      cwd: proj,
      env: { ...(process.env as Record<string, string>), QAMIND_HOME: home, CLAUDE_PROJECT_DIR: proj },
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    const protocolErrors: Error[] = [];
    transport.onerror = (e) => protocolErrors.push(e);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(transport);
    const pid = transport.pid as number;

    assert.equal(client.getServerVersion()?.name, "qa-memory");
    assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), [...QA_MEMORY_TOOLS].sort());

    const ctx = await client.callTool({ name: "memory_get_context", arguments: {} });
    const body = JSON.parse((ctx.content as Array<{ text: string }>)[0]?.text ?? "{}");
    assert.equal(body.project.root, fs.realpathSync(proj), "the project comes from the host's project folder");

    const start = await client.callTool({ name: "run_start", arguments: { mode: "quick", session: "sess-stdio", host: "test" } });
    const started = JSON.parse((start.content as Array<{ text: string }>)[0]?.text ?? "{}");
    assert.equal(started.status, "ready", JSON.stringify(started).slice(0, 300));
    assert.ok(started.run.id && fs.existsSync(started.run.dir));

    const bad = await client.callTool({ name: "memory_save_learning", arguments: { run: started.run.id, type: "test-tip", area: "x", text: "no" } });
    assert.equal(bad.isError, true);

    await client.close();
    for (let i = 0; i < 60 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(alive(pid), false, "the server exits when the host closes the connection");
    assert.deepEqual(protocolErrors.map((e) => e.message), [], "stdout carried only protocol messages");
    assert.equal(stderr.trim(), "", "nothing was written to stderr");
  });
}
