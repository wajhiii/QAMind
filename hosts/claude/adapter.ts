import fs from "node:fs";
import path from "node:path";

export interface RenderContext {
  repoRoot: string;
  outDir: string;
  version: string;
  /** Path of the already-built bundle (dist/qamind.mjs) to place in the plugin. */
  bundleFile: string;
}

interface HostJson {
  commands: Record<string, string>;
  skill_frontmatter: Record<string, Record<string, string | boolean>>;
}

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

/** Placeholders for Claude Code. `qamind` is on PATH inside the Bash tool because the plugin ships bin/qamind. */
export function placeholders(host: HostJson): Record<string, string> {
  return {
    HOST_NAME: "Claude Code",
    HOST_ID: "claude-code",
    CLI: "qamind",
    CLI_FALLBACK: 'node "${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs"',
    CORE_PATH: "${CLAUDE_PLUGIN_ROOT}/core",
    SESSION_ID: "${CLAUDE_SESSION_ID}",
    ARGUMENTS: "$ARGUMENTS",
    BROWSER_TOOLS: "the browser tools (their names start with mcp__plugin_qamind_browser__)",
    ...host.commands,
  };
}

export function renderText(text: string, values: Record<string, string>, file: string): string {
  return text.replace(PLACEHOLDER, (_m, key: string) => {
    const v = values[key];
    if (v === undefined) throw new Error(`Unknown placeholder {{${key}}} in ${file}`);
    return v;
  });
}

function writeFile(file: string, content: string | Buffer, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, mode ? { mode } : undefined);
  if (mode) fs.chmodSync(file, mode);
}

function copyTree(from: string, to: string, render: ((text: string, file: string) => string) | undefined): void {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst, render);
    else if (render && entry.name.endsWith(".md")) writeFile(dst, render(fs.readFileSync(src, "utf8"), src));
    else writeFile(dst, fs.readFileSync(src));
  }
}

function frontMatter(text: string): { fields: Array<[string, string]>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error("A SKILL.md must start with a front-matter block.");
  const fields: Array<[string, string]> = [];
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields.push([kv[1] as string, kv[2] as string]);
  }
  return { fields, body: m[2] ?? "" };
}

const yamlString = (v: string) => (/^[\w./,;:()[\] -]*$/.test(v) && !/^[\s[{&*!|>'"%@`-]|:\s|\s#/.test(v) ? v : JSON.stringify(v));

/** Render core/ + this adapter into a Claude Code plugin folder (spec §5.1 and §6). */
export function renderClaude(ctx: RenderContext): void {
  const host = JSON.parse(fs.readFileSync(path.join(ctx.repoRoot, "hosts", "claude", "host.json"), "utf8")) as HostJson;
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

  writeFile(
    path.join(out, ".mcp.json"),
    JSON.stringify({ mcpServers: { browser: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs", "browser-mcp"] } } }, null, 2) + "\n",
  );

  writeFile(
    path.join(out, "hooks", "hooks.json"),
    JSON.stringify(
      {
        description: "QAMind safety guard: while a QA run is active in this session, enforce report-only writes and keep credentials out of the conversation. A no-op otherwise.",
        hooks: {
          PreToolUse: [
            {
              matcher: "^(Write|Edit|MultiEdit|NotebookEdit|Bash|Read|Grep|Glob|mcp__plugin_qamind_browser__.*)$",
              hooks: [{ type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs", "hook", "pre-tool-use"], timeout: 10 }],
            },
          ],
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

  writeFile(path.join(out, "dist", "qamind.mjs"), fs.readFileSync(ctx.bundleFile));
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
