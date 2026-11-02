import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ALL_QA_TOOLS, FIX_CONSENT_TOOLS, MCP_SERVERS, QA_MEMORY_TOOLS } from "../../core/mcp/servers.ts";
import type { McpServerDef } from "../../core/mcp/servers.ts";
import { copyTree, frontMatter, renderText, writeFile, yamlString } from "../render.ts";

export { renderText };

export interface RenderContext {
  repoRoot: string;
  outDir: string;
  version: string;
  /** Already-built bundles to place in the plugin's dist/, by file name (qamind.mjs, qa-memory.mjs). */
  bundles: Record<string, string>;
  /** THIRD-PARTY-NOTICES.md text for what the bundles contain. */
  notices: string;
}

/** This host's MCP registration: the plugin's `.mcp.json` (wrapped form). Another host writes its own format from the same server list. */
export function claudeMcpConfig(servers: readonly McpServerDef[] = MCP_SERVERS): { mcpServers: Record<string, { command: string; args: string[] }> } {
  return { mcpServers: Object.fromEntries(servers.map((s) => [s.name, { command: "node", args: [`\${CLAUDE_PLUGIN_ROOT}/dist/${s.entry}`, ...s.args] }])) };
}

/** What Claude Code calls a tool of this plugin's server. Hyphens in server names are kept. */
export const memoryToolName = (tool: string): string => `mcp__plugin_qamind_qa-memory__${tool}`;

interface ClaudeHostJson {
  commands: Record<string, string>;
  skill_frontmatter: Record<string, Record<string, string | boolean>>;
}

/** Placeholders for Claude Code. `qamind` is on PATH inside the Bash tool because the plugin ships bin/qamind. */
export function placeholders(host: ClaudeHostJson): Record<string, string> {
  return {
    HOST_NAME: "Claude Code",
    HOST_ID: "claude-code",
    CLI: "qamind",
    CLI_FALLBACK: 'node "${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs"',
    CORE_PATH: "${CLAUDE_PLUGIN_ROOT}/core",
    SESSION_ID: "${CLAUDE_SESSION_ID}",
    // Claude Code substitutes its session id into a skill; a host that cannot says nothing, and the run is matched by project instead.
    SESSION_ARG: '`session: "${CLAUDE_SESSION_ID}"`, ',
    SESSION_FLAG: "--session ${CLAUDE_SESSION_ID} ",
    ARGUMENTS: "$ARGUMENTS",
    BROWSER_TOOLS: "the browser tools (their names start with mcp__plugin_qamind_browser__)",
    MEMORY_TOOLS: "the qa-memory tools (their names start with mcp__plugin_qamind_qa-memory__)",
    MEMORY_TOOLS_LOAD: `Claude Code loads MCP tools on demand, so before the first call load all of them at once with ToolSearch, query \`select:${QA_MEMORY_TOOLS.map(memoryToolName).join(",")}\``,
    FIX_TOOLS_LOAD: `Claude Code loads MCP tools on demand, so before the first call load all of them at once with ToolSearch, query \`select:${ALL_QA_TOOLS.map(memoryToolName).join(",")}\``,
    // Every tool except the ones that need the user's go-ahead (a branch in their repository, continuing after a stop): the host asks them for those.
    QA_TOOLS_APPROVED: ALL_QA_TOOLS.filter((t) => !(FIX_CONSENT_TOOLS as readonly string[]).includes(t)).map(memoryToolName).join(" "),
    ...host.commands,
  };
}

/** Render core/ + this adapter into a Claude Code plugin folder (spec §5.1 and §6). */
export function renderClaude(ctx: RenderContext): void {
  const host = JSON.parse(fs.readFileSync(path.join(ctx.repoRoot, "hosts", "claude", "host.json"), "utf8")) as ClaudeHostJson;
  const values = placeholders(host);
  const render = (text: string, file: string) => renderText(text, values, path.relative(ctx.repoRoot, file));
  const out = ctx.outDir;
  fs.mkdirSync(out, { recursive: true });
  for (const entry of fs.readdirSync(out)) if (entry !== "node_modules") fs.rmSync(path.join(out, entry), { recursive: true, force: true });

  writeFile(
    path.join(out, ".claude-plugin", "plugin.json"),
    JSON.stringify(
      {
        name: "qamind",
        displayName: "QAMind",
        version: ctx.version,
        description: "A reusable Senior QA Engineer agent: tests your API and web UIs, reports with evidence, and never touches production.",
        author: { name: "QAMind" },
        license: "MIT",
        keywords: ["qa", "testing", "playwright", "api-testing", "agent"],
      },
      null,
      2,
    ) + "\n",
  );

  writeFile(path.join(out, ".mcp.json"), JSON.stringify(claudeMcpConfig(), null, 2) + "\n");

  writeFile(
    path.join(out, "hooks", "hooks.json"),
    JSON.stringify(
      {
        description: "QAMind safety guard (while a QA run is active in this session: report-only writes, credentials kept out of the conversation; a no-op otherwise) and auto-QA (Stop and UserPromptSubmit hooks that do nothing unless the user turned auto-QA on or put a tag in a prompt).",
        hooks: {
          PreToolUse: [
            {
              matcher: "^(Write|Edit|MultiEdit|NotebookEdit|Bash|Read|Grep|Glob|Skill|mcp__plugin_qamind_browser__.*)$",
              hooks: [{ type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs", "hook", "pre-tool-use"], timeout: 10 }],
            },
          ],
          // Auto-QA (spec 9.5). These two events have no matcher. Both are silent no-ops while auto-QA is off and the prompt has no tag.
          UserPromptSubmit: [{ hooks: [{ type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs", "hook", "user-prompt-submit"], timeout: 20 }] }],
          Stop: [{ hooks: [{ type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs", "hook", "stop"], timeout: 30 }] }],
        },
      },
      null,
      2,
    ) + "\n",
  );

  // Skills: core front matter + Claude-specific fields; body rendered with placeholders.
  const skillsRoot = path.join(ctx.repoRoot, "core", "skills");
  for (const name of fs.readdirSync(skillsRoot)) {
    const file = path.join(skillsRoot, name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const { fields, body } = frontMatter(fs.readFileSync(file, "utf8"));
    const extra = host.skill_frontmatter[name] ?? {};
    const lines = fields.filter(([k]) => !(k in extra)).map(([k, v]) => `${k}: ${v}`);
    for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${typeof v === "string" ? yamlString(v) : String(v)}`);
    const rendered = render(`---\n${lines.join("\n")}\n---\n${body}`, file);
    writeFile(path.join(out, "skills", name, "SKILL.md"), rendered);
  }

  copyTree(path.join(ctx.repoRoot, "core", "shared"), path.join(out, "core", "shared"), render);
  copyTree(path.join(ctx.repoRoot, "core", "knowledge"), path.join(out, "core", "knowledge"), render);

  for (const [name, file] of Object.entries(ctx.bundles)) writeFile(path.join(out, "dist", name), fs.readFileSync(file));
  writeFile(path.join(out, "THIRD-PARTY-NOTICES.md"), ctx.notices);
  writeFile(path.join(out, "bin", "qamind"), `#!/usr/bin/env node\nimport("../dist/qamind.mjs");\n`, 0o755);
  writeFile(path.join(out, "bin", "qamind.cmd"), `@echo off\r\nnode "%~dp0..\\dist\\qamind.mjs" %*\r\n`);

  const pkg = JSON.parse(fs.readFileSync(path.join(ctx.repoRoot, "hosts", "claude", "package.json"), "utf8")) as Record<string, unknown>;
  pkg["version"] = ctx.version;
  writeFile(path.join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  writeFile(path.join(out, "package-lock.json"), fs.readFileSync(path.join(ctx.repoRoot, "hosts", "claude", "package-lock.json")));
  writeFile(path.join(out, "LICENSE"), fs.readFileSync(path.join(ctx.repoRoot, "LICENSE")));
  writeFile(
    path.join(out, "README.md"),
    "# QAMind (generated Claude Code plugin)\n\nInstall from the repository's marketplace:\n\n```\n/plugin marketplace add <owner>/qamind\n/plugin install qamind@qamind\n```\n\nThen run `/qamind:qa-only`. See the repository README for first-run setup and usage.\n\nThis folder is generated from `core/` and `hosts/claude/` by `npm run build`. Do not edit it by hand; CI fails if it is out of date.\n",
  );
}

// ------------------------------------------------------------------------------------------------ as a host the setup CLI can install (`qamind setup --host claude`)

import type { HostAdapter, HostContext, HostJson, McpRegistration, Op } from "../host-api.ts";

const claudeBin = (ctx: HostContext): string => ctx.env["CLAUDE_BIN"] || "claude";
const PLUGIN_ID = "qamind@qamind";

/**
 * Claude Code installs plugins itself, so setup asks Claude Code's own CLI to add this checkout as a marketplace and install the plugin from it (the same thing the
 * `/plugin` commands in the README do). Nothing of Claude Code's files is edited by QAMind directly.
 */
export const adapter: HostAdapter = {
  id: "claude",
  detect: (ctx) => {
    const r = spawnSync(claudeBin(ctx), ["--version"], { encoding: "utf8", env: ctx.env });
    return r.status === 0 ? { found: true, version: r.stdout.trim().replace(/\s*\(Claude Code\)\s*$/, "") } : { found: false, note: `Claude Code was not found (looked for "${claudeBin(ctx)}"). Install it, or set CLAUDE_BIN, then run setup again; or use the /plugin commands in the README from inside Claude Code.` };
  },
  placeholders: (_ctx, host) => placeholders(host as unknown as ClaudeHostJson),
  plan: (ctx): Op[] => {
    const bin = claudeBin(ctx);
    const scope = ctx.scope === "project" ? "project" : "user";
    return [
      { op: "command", kind: "plugin", label: "add the QAMind marketplace to Claude Code", run: [bin, "plugin", "marketplace", "add", ctx.repoRoot, "--scope", scope], check: [bin, "plugin", "marketplace", "list", "--json"], checkOutputIncludes: '"qamind"', undo: [bin, "plugin", "marketplace", "remove", "qamind"] },
      { op: "command", kind: "plugin", label: "install the QAMind plugin", run: [bin, "plugin", "install", PLUGIN_ID, "--scope", scope], check: [bin, "plugin", "list", "--json"], checkOutputIncludes: PLUGIN_ID, undo: [bin, "plugin", "uninstall", PLUGIN_ID, "--scope", scope] },
    ];
  },
  mcpRegistrations: (ctx): McpRegistration[] => {
    const root = path.join(ctx.repoRoot, "plugins", "qamind");
    return Object.entries(claudeMcpConfig().mcpServers).map(([name, s]) => ({ name, command: s.command, args: s.args.map((a) => a.replace("${CLAUDE_PLUGIN_ROOT}", root)) }));
  },
  skills: (ctx) => fs.readdirSync(path.join(ctx.repoRoot, "core", "skills")).filter((n) => fs.existsSync(path.join(ctx.repoRoot, "plugins", "qamind", "skills", n, "SKILL.md"))).map((n) => ({ name: `qamind:${n}`, file: path.join(ctx.repoRoot, "plugins", "qamind", "skills", n, "SKILL.md") })),
  notes: (_ctx, host: HostJson) => [`Claude Code: auto-QA is ${host.auto_qa.mode} by hooks and the safety guard is enforced by a hook. Restart Claude Code (or run /reload-plugins) to pick up the plugin.`],
};

/** The hook commands as Claude Code runs them from the plugin's hooks.json, with the plugin folder filled in. */
adapter.hookCommands = (ctx) => {
  const root = path.join(ctx.repoRoot, "plugins", "qamind");
  const hooks = JSON.parse(fs.readFileSync(path.join(root, "hooks", "hooks.json"), "utf8")) as { hooks: Record<string, Array<{ hooks: Array<{ command: string; args: string[] }> }>> };
  const line = (event: string): string | undefined => {
    const h = hooks.hooks[event]?.[0]?.hooks[0];
    return h ? [h.command, ...h.args].map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(" ").replaceAll("${CLAUDE_PLUGIN_ROOT}", root) : undefined;
  };
  const stop = line("Stop");
  const prompt = line("UserPromptSubmit");
  return { ...(stop ? { stop } : {}), ...(prompt ? { prompt } : {}) };
};
