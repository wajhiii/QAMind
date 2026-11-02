import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { claudeMcpConfig, memoryToolName } from "../../hosts/claude/adapter.ts";
import { ALL_QA_TOOLS, FIX_CONSENT_TOOLS, MCP_SERVERS, QA_FIX_TOOLS, QA_MEMORY_TOOLS } from "../../core/mcp/servers.ts";
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
  // The owner's memory review is not a run: it has no run to hold the qa-memory tools, so it is the one instruction that uses the `memory` commands of the CLI
  // (review, stats, prune), which need no run. Every other rule, including the memory files and the store's location, still applies to it.
  const OWNER_REVIEW = rel(path.join(repoRoot, "core", "skills", "qa-memory-review", "SKILL.md"));
  for (const f of [...instructions, ...knowledge]) {
    const text = read(f);
    for (const [i, [re, what]] of forbidden.entries()) if (re.test(text) && !(i === 0 && rel(f) === OWNER_REVIEW)) problems.push(`${rel(f)} mentions ${what}`);
  }
  assert.deepEqual(problems, []);
  const review = read(path.join(repoRoot, "core", "skills", "qa-memory-review", "SKILL.md"));
  assert.doesNotMatch(review, /\{\{CLI\}\}\s+run\b|\bqamind\s+run\b/, "even the review never starts or finishes a run by hand");
  assert.ok(!/\{\{CLI\}\}\s+memory\s+(learn|applied|false-alarm|context)\b/.test(review), "and never uses the commands that write memory from a run");
});

test("every qa-memory tool the instructions name exists, and the skill names all of them", () => {
  const known = new Set<string>(ALL_QA_TOOLS);
  const notTools = new Set(["memory_applied", "memory_updated", "fix_policy", "fix_severities"]); // fields in the run's meta.json and the config, not tools
  const unknown: string[] = [];
  for (const f of [...instructions, ...knowledge]) {
    for (const m of read(f).matchAll(/\b((?:run|memory|lessons|fix)_[a-z_]+)\b/g)) {
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

// ------------------------------------------------------------------------------------------------ the /qa skill (Phase 6)

const skillOf = (name: string) => read(path.join(repoRoot, "core", "skills", name, "SKILL.md"));
const stepsOf = (text: string): Map<string, string> => new Map([...text.matchAll(/^## (Step \d+)[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map((m) => [m[1] as string, (m[2] as string).trim()]));

test("the /qa skill names every tool it may use, the guide covers the fix tools, and fix_* appears nowhere in the report-only skill", () => {
  const qa = skillOf("qa");
  for (const t of ALL_QA_TOOLS) assert.match(qa, new RegExp(`\`${t}\``), `/qa must name ${t}`);
  assert.match(qa, /\{\{FIX_TOOLS_LOAD\}\}/);
  assert.match(qa, /did not start and \*\*stop\*\*/);
  const guide = read(path.join(repoRoot, "core", "shared", "fix-loop.md"));
  for (const t of QA_FIX_TOOLS) assert.match(guide, new RegExp(`\`${t}\``), `fix-loop.md must explain ${t}`);
  const only = skillOf("qa-only");
  for (const t of QA_FIX_TOOLS) assert.ok(!only.includes(t), `the report-only skill must not mention ${t}`);
  assert.match(qa, /kind: "qa"/);
  assert.doesNotMatch(qa, /kind: "qa-only"|--kind qa-only/);
});

test("the steps shared with /qa-only are identical in both skills, so the two cannot drift apart", () => {
  const a = stepsOf(skillOf("qa-only"));
  const b = stepsOf(skillOf("qa"));
  for (const step of ["Step 1", "Step 2", "Step 3", "Step 4"]) {
    assert.ok(a.get(step), `qa-only has ${step}`);
    assert.equal(b.get(step), a.get(step), `${step} must be the same text in both skills`);
  }
  assert.equal(b.get("Step 5"), a.get("Step 5"), "the baseline report is written exactly like the report-only report");
  assert.ok(b.get("Step 6")?.includes("fix_preflight"), "Step 6 is the fix phase");
});

test("the rendered /qa skill pre-approves each tool by name, except the two that need the user's go-ahead, and tells the agent to load all of them", () => {
  const rendered = read(path.join(repoRoot, "plugins", "qamind", "skills", "qa", "SKILL.md"));
  const allowed = (/^allowed-tools:\s*"?([^\n]*?)"?$/m.exec(rendered)?.[1] ?? "").split(/\s+/);
  for (const t of ALL_QA_TOOLS) {
    const name = memoryToolName(t);
    if ((FIX_CONSENT_TOOLS as readonly string[]).includes(t)) assert.ok(!allowed.includes(name), `${t} must NOT be pre-approved: the host has to ask the user`);
    else assert.ok(allowed.includes(name), `${t} should be pre-approved`);
  }
  assert.ok(!allowed.includes("mcp__plugin_qamind_qa-memory"), "no bare server entry, which would approve the consent tools too");
  assert.ok(allowed.includes("Write") && allowed.includes("Edit"), "a fix run edits project files (the hook guards the protected ones)");
  assert.ok(!allowed.some((x) => /^Bash\(git (add|commit|push|checkout|reset)/.test(x)), "no writing git command is pre-approved");
  assert.ok(rendered.includes(`select:${ALL_QA_TOOLS.map(memoryToolName).join(",")}`));
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(rendered), "no placeholder is left unrendered");
  // the report-only skill is unchanged: still path-scoped writes and the bare server entry
  const only = read(path.join(repoRoot, "plugins", "qamind", "skills", "qa-only", "SKILL.md"));
  assert.match(only, /allowed-tools:.*Write\(\.qa\/\*\*\).*mcp__plugin_qamind_qa-memory"?$/m);
});
