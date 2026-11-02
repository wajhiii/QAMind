import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { claudeMcpConfig, memoryToolName } from "../../hosts/claude/adapter.ts";
import { MCP_SERVERS, QA_MEMORY_TOOLS } from "../../core/mcp/servers.ts";
import { repoRoot } from "./helpers.ts";

// Spec Phase 5: "skills use only the tools for memory". These checks keep it true: the instructions the agent reads never tell it to run
// a memory command, open a memory file or edit the store, every tool they name exists, and the host pre-approves and registers the server.

const mdFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? mdFiles(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : []));
const instructions = [...mdFiles(path.join(repoRoot, "core", "skills")), ...mdFiles(path.join(repoRoot, "core", "shared"))];
const knowledge = mdFiles(path.join(repoRoot, "core", "knowledge"));
const rel = (f: string) => path.relative(repoRoot, f);
const read = (f: string) => fs.readFileSync(f, "utf8");

test("no instruction tells the agent to run a memory or run-lifecycle command, or to touch memory files or the store", () => {
  const forbidden: Array<[RegExp, string]> = [
    [/\{\{CLI\}\}\s+(memory|run)\b|\bqamind\s+(memory|run)\b/, "a memory or run command (use the qa-memory tool)"],
    [/learnings\.jsonl|false-alarms\.jsonl|risk-areas\.json|product-map\.json|pending-lessons\.md|global-lessons\.md|stack\.json/, "a memory file"],
    [/\$QAMIND_HOME|~\/\.qamind|QAMIND_HOME/, "the user store's location"],
    [/\bmemory\/(runs|archive)\b/, "a memory folder"],
    [/write\s+`?data\/pages\.json|write\s+`?data\/endpoints\.json/i, "writing the page files by hand (memory_update_product_map does it)"],
  ];
  const problems: string[] = [];
  for (const f of [...instructions, ...knowledge]) {
    const text = read(f);
    for (const [re, what] of forbidden) if (re.test(text)) problems.push(`${rel(f)} mentions ${what}`);
  }
  assert.deepEqual(problems, []);
});

test("every qa-memory tool the instructions name exists, and the skill names all of them", () => {
  const known = new Set<string>(QA_MEMORY_TOOLS);
  const notTools = new Set(["memory_applied", "memory_updated"]); // fields in the run's meta.json, not tools
  const unknown: string[] = [];
  for (const f of [...instructions, ...knowledge]) {
    for (const m of read(f).matchAll(/\b((?:run|memory|lessons)_[a-z_]+)\b/g)) {
      const name = m[1] as string;
      if (!known.has(name) && !notTools.has(name)) unknown.push(`${rel(f)}: ${name}`);
    }
  }
  assert.deepEqual(unknown, [], "an instruction names a tool the server does not have");
  const skill = read(path.join(repoRoot, "core", "skills", "qa-only", "SKILL.md"));
  const missing = QA_MEMORY_TOOLS.filter((t) => !new RegExp(`\`${t}\``).test(skill));
  assert.deepEqual(missing, [], "the skill lists every tool so the agent can load them in one go");
  assert.match(skill, /\{\{MEMORY_TOOLS_LOAD\}\}/);
  assert.match(skill, /tell the user that the\s+qa-memory server did not start and \*\*stop\*\*/, "there is no silent fallback to files or the command line");
});

test("the Claude Code plugin registers the server, pre-approves it for the skill, and tells the agent to load the tools", () => {
  const plugin = path.join(repoRoot, "plugins", "qamind");
  assert.deepEqual(JSON.parse(read(path.join(plugin, ".mcp.json"))), claudeMcpConfig(), "the registration is the adapter's output for the shared server list");
  const memory = (JSON.parse(read(path.join(plugin, ".mcp.json"))) as { mcpServers: Record<string, { command: string; args: string[] }> }).mcpServers["qa-memory"];
  assert.deepEqual(memory, { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/qa-memory.mjs"] });

  const skill = read(path.join(plugin, "skills", "qa-only", "SKILL.md"));
  const allowed = /^allowed-tools:\s*"?([^\n]*?)"?$/m.exec(skill)?.[1] ?? "";
  assert.ok(allowed.split(/\s+/).includes("mcp__plugin_qamind_qa-memory"), `allowed-tools must pre-approve the server: ${allowed}`);
  assert.ok(skill.includes(`select:${QA_MEMORY_TOOLS.map(memoryToolName).join(",")}`), "the rendered skill carries the exact ToolSearch query for every tool");
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(skill), "no placeholder is left unrendered");

  for (const file of ["qamind.mjs", "qa-memory.mjs"]) assert.ok(fs.existsSync(path.join(plugin, "dist", file)), `dist/${file} is part of the plugin`);
  const notices = read(path.join(plugin, "THIRD-PARTY-NOTICES.md"));
  for (const pkg of ["@modelcontextprotocol/sdk", "zod", "yaml", "ajv"]) assert.ok(notices.includes(`| ${pkg} |`), `${pkg} is bundled, so its license notice must ship`);
  assert.match(notices, /Permission is hereby granted, free of charge/, "the license texts themselves are reproduced");
});

test("registration is a function of the shared server list: another host gets the same servers in its own format", () => {
  assert.deepEqual(MCP_SERVERS.map((s) => s.name), ["browser", "qa-memory"]);
  const one = claudeMcpConfig([{ name: "demo", entry: "qa-memory.mjs", args: ["--x"], purpose: "t" }]);
  assert.deepEqual(one, { mcpServers: { demo: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/qa-memory.mjs", "--x"] } } });
  assert.equal(memoryToolName("run_start"), "mcp__plugin_qamind_qa-memory__run_start");
  const host = JSON.parse(read(path.join(repoRoot, "hosts", "claude", "host.json"))) as { mcp: { servers: string[] } };
  assert.deepEqual(host.mcp.servers, MCP_SERVERS.map((s) => s.name), "host.json documents the same servers");
});
