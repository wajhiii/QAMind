import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { repoRoot } from "./harness.ts";

// Core must not know any host (spec 5.1: adding a host needs no change to core). Everything a host-specific word could appear in is checked here:
// the instructions every host renders, and the messages the runtime prints for the user.
const walk = (dir: string, ext: RegExp): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), ext) : ext.test(e.name) ? [path.join(dir, e.name)] : []));
const rel = (f: string): string => path.relative(repoRoot, f);

test("the instructions every host renders name no host, command or tool of any host: placeholders stand in for them", () => {
  const forbidden: Array<[RegExp, string]> = [
    [/\/qamind:/, "Claude Code's command namespace (use {{CMD_...}})"],
    [/mcp__/, "Claude Code's MCP tool names"],
    [/CLAUDE_[A-Z_]+|CURSOR_[A-Z_]+/, "a host's environment variable"],
    [/ToolSearch|Skill tool/, "Claude Code's tool names"],
    [/\.claude\b|\.cursor\b|\.codex\b/, "a host's folder"],
  ];
  const problems: string[] = [];
  for (const f of [...walk(path.join(repoRoot, "core", "skills"), /\.md$/), ...walk(path.join(repoRoot, "core", "shared"), /\.md$/), ...walk(path.join(repoRoot, "core", "knowledge"), /\.md$/)]) {
    const text = fs.readFileSync(f, "utf8");
    for (const [re, what] of forbidden) if (re.test(text)) problems.push(`${rel(f)} mentions ${what}`);
  }
  assert.deepEqual(problems, []);
});

test("the runtime's messages to the user name no host's command either", () => {
  const problems: string[] = [];
  for (const f of ["core/auto-qa/gate.ts", "core/auto-qa/commands.ts", "core/auto-qa/prompt.ts", "core/lib/hooks.ts", "core/lib/memory/lessons.ts", "core/lib/memory/context.ts", "core/lib/run.ts"]) {
    const text = fs.readFileSync(path.join(repoRoot, f), "utf8");
    if (/\/qamind:[a-z]/.test(text)) problems.push(`${f} prints /qamind:... (Claude Code's namespace)`);
  }
  assert.deepEqual(problems, []);
});

test("the CI code in core names no host: how a host's CLI is run is in that host's host.json", () => {
  const problems: string[] = [];
  for (const f of walk(path.join(repoRoot, "core", "lib", "ci"), /\.ts$/)) {
    const text = fs.readFileSync(f, "utf8");
    for (const re of [/claude/i, /anthropic/i, /cursor/i, /codex/i, /\/qamind:/]) if (re.test(text)) problems.push(`${rel(f)} mentions ${re}`);
  }
  assert.deepEqual(problems, []);
});

test("the coverage code (sweep, mail, timings, tickets, browsers) names no host either", () => {
  const problems: string[] = [];
  const files = [...["sweep", "mail", "perf"].flatMap((d) => walk(path.join(repoRoot, "core", "lib", d), /\.ts$/)), ...["browsers.ts", "ticket.ts", "coverage-report.ts"].map((f) => path.join(repoRoot, "core", "lib", f))];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const re of [/claude/i, /anthropic/i, /cursor/i, /codex/i, /\/qamind:/]) if (re.test(text)) problems.push(`${rel(f)} mentions ${re}`);
  }
  assert.deepEqual(problems, []);
});

test("every placeholder core uses is one a host can give, so a new host has a fixed, short list to fill in", () => {
  const used = new Set<string>();
  for (const f of [...walk(path.join(repoRoot, "core", "skills"), /\.md$/), ...walk(path.join(repoRoot, "core", "shared"), /\.md$/), ...walk(path.join(repoRoot, "core", "knowledge"), /\.md$/)]) for (const m of fs.readFileSync(f, "utf8").matchAll(/\{\{([A-Z_]+)\}\}/g)) used.add(m[1] as string);
  // the contract: ADDING-A-HOST.md lists exactly these
  const doc = fs.readFileSync(path.join(repoRoot, "docs", "ADDING-A-HOST.md"), "utf8");
  const missing = [...used].filter((p) => !doc.includes(`{{${p}}}`));
  assert.deepEqual(missing, [], "docs/ADDING-A-HOST.md must list every placeholder core uses");
});
