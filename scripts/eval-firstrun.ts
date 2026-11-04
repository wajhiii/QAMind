/**
 * First run on each host, from the documents alone (spec 15, Phase 8's acceptance: "a new user on each supported host can install from the Git repo and complete a first run using only the
 * README and docs/HOSTS.md"). A fresh real Claude Code agent is given ONLY those two files (copies, outside the repository) and a Git address, and asked to install QAMind the way the README
 * says, for one host at a time. Nothing is installed in the real settings of anything: an isolated Claude Code config folder, QAMIND_USER_HOME and QAMIND_HOME. The Git address is a local
 * stand-in for GitHub (scripts/standins/git-http-server.mjs), built from the working tree, so what is tested is the documents as they are now.
 *
 *   claude    marketplace add + install (+ update) from the Git address; then the harness itself runs the README's first step with the real login and the installed plugin's folder, and checks
 *             what the README promises (config.md and .env.qa.example created, .gitignore updated, nothing tested, nothing else changed)
 *   cursor    `./setup --host cursor` into an isolated user home (Cursor itself is not run: it is not installed here)
 *   generic   `./setup --host generic --project` into a scratch project
 *
 * The agent also lists every place where the documents were unclear, wrong or missing something: that list is the point of the test, and it is kept in the record.
 * Writes docs/baselines/<label>-firstrun.{json,md}.
 *
 *   node scripts/eval-firstrun.ts --label phase-8 [--only claude|cursor|generic] [--budget 4] [--timeout-min 40] [--claude /path/to/claude] [--keep]
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { label: { type: "string" }, only: { type: "string" }, budget: { type: "string", default: "4" }, "timeout-min": { type: "string", default: "40" }, claude: { type: "string" }, model: { type: "string", default: "claude-sonnet-5-5" }, keep: { type: "boolean", default: false } } });
if (!values.label) {
  console.error("--label is required");
  process.exit(2);
}
const label = values.label;
const claude = values.claude ?? process.env["CLAUDE_BIN"] ?? "claude";
if (spawnSync(claude, ["--version"], { encoding: "utf8" }).status !== 0) {
  console.error(`Cannot run "${claude}". Pass --claude or set CLAUDE_BIN.`);
  process.exit(2);
}
const NODE_DIR = path.dirname(process.execPath);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-firstrun-"));
const sh = (cmd: string, args: string[], cwd?: string, env: NodeJS.ProcessEnv = process.env): string => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...(cwd ? { cwd } : {}), env }).trim();

// ------------------------------------------------------------------------------------------------ the Git address and the two documents
const git = (cwd: string, ...a: string[]): string => sh("git", ["-c", "user.name=Trial", "-c", "user.email=trial@example.test", ...a], cwd);
sh("git", ["clone", "-q", "--no-hardlinks", repoRoot, path.join(root, "src")]);
sh("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "demo-app/SEEDED-BUGS.md", `${repoRoot}/`, `${path.join(root, "src")}/`]);
git(path.join(root, "src"), "add", "-A");
git(path.join(root, "src"), "commit", "-qm", "the working tree, as a user would find it");
fs.mkdirSync(path.join(root, "git"));
sh("git", ["clone", "-q", "--bare", path.join(root, "src"), path.join(root, "git", "qamind.git")]);
const PORT = 8766;
const gitServer: ChildProcess = spawn(process.execPath, [path.join(repoRoot, "scripts", "standins", "git-http-server.mjs"), path.join(root, "git"), String(PORT)], { stdio: "ignore" });
const REPO_URL = `http://127.0.0.1:${PORT}/qamind.git`;
await new Promise((r) => setTimeout(r, 1200));
if (spawnSync("git", ["ls-remote", REPO_URL], { encoding: "utf8" }).status !== 0) throw new Error("the Git stand-in did not start");
const docs = path.join(root, "docs-only");
fs.mkdirSync(path.join(docs, "docs"), { recursive: true });
fs.copyFileSync(path.join(repoRoot, "README.md"), path.join(docs, "README.md"));
fs.copyFileSync(path.join(repoRoot, "docs", "HOSTS.md"), path.join(docs, "docs", "HOSTS.md"));

/** A project to install into: a copy of the demo app without its answer key, as a git repository. */
function project(name: string): string {
  const ws = path.join(root, name);
  const skip = new Set(["node_modules", ".qa", ".env.qa", ".env.qa.fixture", "SEEDED-BUGS.md", "eval", "qa-fixture"]);
  fs.cpSync(path.join(repoRoot, "demo-app"), ws, { recursive: true, filter: (s) => !skip.has(path.basename(s)) });
  sh("git", ["init", "-q", "-b", "main"], ws);
  git(ws, "add", "-A");
  git(ws, "commit", "-qm", "the project");
  return ws;
}

// ------------------------------------------------------------------------------------------------ the agent
interface Ev {
  type?: string;
  message?: { content?: Array<{ type: string; name?: string; id?: string; tool_use_id?: string; is_error?: boolean; content?: unknown; input?: Record<string, unknown>; text?: string }> };
  total_cost_usd?: number;
  subtype?: string;
  result?: string;
}
interface Call {
  name: string;
  input: Record<string, unknown>;
  result: string;
}
interface Turn {
  calls: Call[];
  final: string;
  cost: number;
  minutes: number;
  timedOut: boolean;
}
const textOf = (c: unknown): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x && typeof x === "object" && "text" in x ? String((x as { text: unknown }).text) : "")).join(" ") : "");

function runAgent(prompt: string, cwd: string): Promise<Turn> {
  return new Promise((resolve) => {
    const env = { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: "false" } as NodeJS.ProcessEnv;
    for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "QAMIND_AUTO", "NODE_TEST_CONTEXT"]) delete env[k];
    const args = ["-p", prompt, "--session-id", crypto.randomUUID(), "--model", values.model as string, "--setting-sources", "project,local", "--max-budget-usd", values.budget as string, "--allowedTools", "Bash Read Write Edit Glob Grep", "--output-format", "stream-json", "--verbose"];
    const started = Date.now();
    const events: Ev[] = [];
    let buf = "";
    let timedOut = false;
    const child = spawn(claude, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.on("data", () => undefined);
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.startsWith("{")) {
          try {
            events.push(JSON.parse(line) as Ev);
          } catch {
            /* partial line */
          }
        }
      }
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, Number(values["timeout-min"]) * 60_000);
    child.on("exit", () => {
      clearTimeout(timer);
      const calls: Call[] = [];
      const byId = new Map<string, Call>();
      for (const e of events) {
        for (const c of e.message?.content ?? []) {
          if (e.type === "assistant" && c.type === "tool_use") {
            const call: Call = { name: c.name ?? "", input: c.input ?? {}, result: "" };
            calls.push(call);
            if (c.id) byId.set(c.id, call);
          }
          if (e.type === "user" && c.type === "tool_result") {
            const call = byId.get(c.tool_use_id ?? "");
            if (call) call.result = textOf(c.content);
          }
        }
      }
      const result = events.find((e) => e.type === "result");
      resolve({ calls, final: String(result?.result ?? ""), cost: result?.total_cost_usd ?? 0, minutes: Math.round((Date.now() - started) / 600) / 100, timedOut });
    });
  });
}

const THE_REPORT = `At the end, write a report with these three parts. (1) What you ran, in order. (2) What is now in place, and how you know. (3) "Where the documents let me down": every place where README.md or docs/HOSTS.md was unclear, wrong, out of date or missing something you needed, quoting the words. If there was none, say "none". Be honest: a step that failed or that you could not do is part of the report.`;
const PREAMBLE = (task: string): string => `You are a person who has just found QAMind and has never used it. The only documents you may use are these two files: ${path.join(docs, "README.md")} and ${path.join(docs, "docs", "HOSTS.md")}. Do not read any other file from QAMind's repository, and nothing from the internet, unless one of those documents tells you to. Wherever the documents show a Git address such as <owner>/qamind or https://github.com/<owner>/qamind.git, QAMind's repository is at ${REPO_URL} (use that exact address; it ends in .git). Node 22 is installed in ${NODE_DIR}: put it first on PATH for any command that needs node or npm. ${task}\n\n${THE_REPORT}`;

interface Trial {
  name: string;
  minutes?: number;
  cost_usd?: number;
  files_read: string[];
  commands: string[];
  checks: Array<{ check: string; ok: boolean; detail?: string }>;
  report: string;
  problems: string[];
}
const trials: Trial[] = [];
let totalCost = 0;

function record(name: string, turn: Turn, extra: (t: Trial) => void): void {
  const t: Trial = { name, minutes: turn.minutes, cost_usd: turn.cost, files_read: [], commands: turn.calls.filter((c) => c.name === "Bash").map((c) => String(c.input["command"] ?? "").replace(/\s+/g, " ").slice(0, 220)), checks: [], report: turn.final.slice(0, 6000), problems: [] };
  totalCost += turn.cost;
  t.files_read = [...new Set(turn.calls.filter((c) => c.name === "Read" || c.name === "Glob" || c.name === "Grep").map((c) => String(c.input["file_path"] ?? c.input["path"] ?? c.input["pattern"] ?? "").replace(root, "<tmp>")))].slice(0, 40);
  if (turn.timedOut) t.problems.push("the turn timed out");
  if (!turn.final) t.problems.push("the agent wrote no report");
  const own = (f: string): boolean => f.includes("docs-only") || f === "";
  const outsideDocs = t.files_read.filter((f) => !own(f));
  if (outsideDocs.length) t.checks.push({ check: "read only the two documents (and files they send you to)", ok: false, detail: outsideDocs.slice(0, 6).join("; ") });
  try {
    extra(t);
  } catch (e) {
    t.problems.push(`the check itself failed: ${(e as Error).message}`);
  }
  for (const c of t.checks) if (!c.ok && !c.check.startsWith("read only")) t.problems.push(`${c.check}${c.detail ? `: ${c.detail}` : ""}`);
  trials.push(t);
  console.log(`  ${turn.minutes} min, $${turn.cost.toFixed(2)} -> ${t.problems.length === 0 ? "PASS" : "FAIL"}${t.problems.length ? `\n     ${t.problems.join("\n     ")}` : ""}`);
}
const has = (t: Trial, check: string, ok: boolean, detail?: string): void => void t.checks.push({ check, ok, ...(detail ? { detail } : {}) });
const exists = (...p: string[]): boolean => fs.existsSync(path.join(...p));

// ------------------------------------------------------------------------------------------------ Claude Code
if (!values.only || values.only === "claude") {
  console.log("\n== Claude Code, from the Git address");
  const proj = project("proj-claude");
  const cfg = path.join(root, "claude-config");
  const home = path.join(root, "qamind-home-claude");
  fs.mkdirSync(cfg);
  fs.mkdirSync(home);
  const turn = await runAgent(PREAMBLE(`Your coding tool is Claude Code. Its command is ${claude} (use that path wherever the documents say \`claude\`; you cannot type slash commands, so use the \`claude plugin\` commands the README also gives). To keep this trial away from your real settings, put CLAUDE_CONFIG_DIR=${cfg} in front of every Claude Code command you run. Install QAMind for Claude Code as the README says. Do not run a QA run (you have no login in this isolated folder): for the "First run" section, say what you would do and what the README says you would see. The project is ${proj}.`), root);
  record("Claude Code: install from a Git address", turn, (t) => {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg, PATH: `${NODE_DIR}:${process.env["PATH"]}` } as NodeJS.ProcessEnv;
    const list = spawnSync(claude, ["plugin", "list"], { encoding: "utf8", env }).stdout;
    has(t, "the plugin is listed and enabled", /qamind@qamind[\s\S]*enabled/.test(list), list.replace(/\s+/g, " ").slice(0, 200));
    has(t, "the packages it lists are installed (no 'not installed' note)", !/packages it lists are not installed/.test(list), list.replace(/\s+/g, " ").slice(0, 200));
    const cache = path.join(cfg, "plugins", "cache", "qamind", "qamind");
    const ver = fs.existsSync(cache) ? fs.readdirSync(cache)[0] : undefined;
    const installed = ver ? path.join(cache, ver) : "";
    has(t, "the browser tool's files are in the installed plugin", !!installed && exists(installed, "node_modules", "@playwright"), installed ? "" : "no installed plugin folder");
    const full = turn.calls.filter((c) => c.name === "Bash").map((c) => String(c.input["command"] ?? ""));
    has(t, "the agent used the Git address", full.some((c) => c.includes(REPO_URL) && /plugin marketplace add/.test(c)), "");
    has(t, "nothing was installed in the real Claude Code settings", !full.some((c) => /plugin (install|marketplace add|update)/.test(c) && !c.includes(cfg)), full.filter((c) => /plugin (install|marketplace add|update)/.test(c) && !c.includes(cfg)).join("; ").slice(0, 160));
    // the README's first step, run by the harness with the real login and the installed plugin's folder
    if (installed) {
      const real = spawnSync(claude, ["-p", "/qamind:qa-only quick", "--plugin-dir", installed, "--model", values.model as string, "--setting-sources", "project,local", "--max-budget-usd", "2", "--allowedTools", "Bash(qamind *) Read Glob Grep Write(/.qa/**) Edit(/.qa/**) mcp__plugin_qamind_qa-memory", "--output-format", "json"], { cwd: proj, encoding: "utf8", timeout: 600_000, env: { ...process.env, QAMIND_HOME: home, PATH: `${NODE_DIR}:${process.env["PATH"]}`, ENABLE_CLAUDEAI_MCP_SERVERS: "false" } as NodeJS.ProcessEnv });
      let msg = "";
      try {
        const j = JSON.parse(real.stdout) as { result?: string; total_cost_usd?: number };
        msg = String(j.result ?? "");
        totalCost += j.total_cost_usd ?? 0;
      } catch {
        msg = real.stdout.slice(0, 300);
      }
      has(t, "first run: .qa/config.md was created", exists(proj, ".qa", "config.md"));
      has(t, "first run: .env.qa.example was created", exists(proj, ".env.qa.example"));
      const gi = fs.readFileSync(path.join(proj, ".gitignore"), "utf8");
      has(t, "first run: .qa/ and .env.qa are in .gitignore", /^\.qa\/?$/m.test(gi) && /^\.env\.qa$/m.test(gi));
      const reports = exists(proj, ".qa", "reports") ? fs.readdirSync(path.join(proj, ".qa", "reports")).length : 0;
      has(t, "first run: it said what to fill in and tested nothing", /config\.md/.test(msg) && reports === 0, msg.replace(/\s+/g, " ").slice(0, 240));
      const status = git(proj, "status", "--porcelain").split("\n").filter(Boolean).map((l) => l.slice(3));
      has(t, "first run: nothing else in the project changed", status.every((f) => /^(\.gitignore|\.env\.qa\.example)$/.test(f)), status.join(", "));
      t.checks.push({ check: "what the first run said (for reading)", ok: true, detail: msg.replace(/\s+/g, " ").slice(0, 500) });
    }
  });
}

// ------------------------------------------------------------------------------------------------ Cursor, and the generic host
const trialSetup = async (name: string, host: "cursor" | "generic"): Promise<void> => {
  console.log(`\n== ${name}`);
  const userHome = path.join(root, `user-home-${host}`);
  const home = path.join(root, `qamind-home-${host}`);
  fs.mkdirSync(userHome);
  fs.mkdirSync(home);
  const proj = project(`proj-${host}`);
  const task =
    host === "cursor"
      ? `Your coding tool is Cursor (you cannot run Cursor itself here: say what you could not check). Install QAMind for Cursor for your account as the README says. To keep this trial away from the real Cursor settings, put QAMIND_USER_HOME=${userHome} and QAMIND_HOME=${home} in front of every setup and qamind command, and clone into ${path.join(root, "app")} instead of ~/.qamind/app. Then show what \`qamind status\` says.`
      : `Your coding tool is some other agent that reads AGENTS.md (you cannot run it here). Install QAMind for it into the project ${proj} as the README says, as a project install. To keep this trial away from your real settings, put QAMIND_USER_HOME=${userHome} and QAMIND_HOME=${home} in front of every setup and qamind command, and clone into ${path.join(root, "app")} instead of ~/.qamind/app. Then show what \`qamind status\` says, and say what the agent would be told to do.`;
  const turn = await runAgent(PREAMBLE(task), host === "generic" ? proj : root);
  record(name, turn, (t) => {
    const out = (args: string[], cwd: string): string => {
      const r = spawnSync("sh", ["-c", `qamind ${args.join(" ")}`], { cwd, encoding: "utf8", env: { ...process.env, QAMIND_USER_HOME: userHome, QAMIND_HOME: home, PATH: `${path.join(userHome, ".local", "bin")}:${NODE_DIR}:${process.env["PATH"]}` } as NodeJS.ProcessEnv });
      return `${r.stdout}${r.stderr}`;
    };
    const status = out(["status"], proj);
    has(t, "qamind status lists the host", new RegExp(host === "cursor" ? "cursor" : "generic", "i").test(status), status.replace(/\s+/g, " ").slice(0, 240));
    if (host === "cursor") {
      has(t, "skills are in place", exists(userHome, ".cursor", "skills", "qamind-qa-only", "SKILL.md"));
      has(t, "the MCP servers are registered", exists(userHome, ".cursor", "mcp.json") && /qa-memory/.test(fs.readFileSync(path.join(userHome, ".cursor", "mcp.json"), "utf8")));
      has(t, "the hooks are in place", exists(userHome, ".cursor", "hooks.json"));
    } else {
      const a = exists(proj, "AGENTS.md") ? fs.readFileSync(path.join(proj, "AGENTS.md"), "utf8") : "";
      has(t, "AGENTS.md has the QAMind section between its markers", /qamind:start/.test(a) && /qamind:end/.test(a));
      has(t, "the user's own files are untouched", git(proj, "status", "--porcelain").split("\n").filter(Boolean).every((l) => /AGENTS\.md|\.qamind|\.cursor|docs\/qamind/i.test(l)), git(proj, "status", "--porcelain").slice(0, 200));
    }
    has(t, "nothing was written to the real home folder's tool settings", !t.commands.some((c) => /~\/\.cursor|\$HOME\/\.cursor/.test(c)), "");
  });
};
if (!values.only || values.only === "cursor") await trialSetup("Cursor: ./setup from the Git address", "cursor");
if (!values.only || values.only === "generic") await trialSetup("Any AGENTS.md agent: ./setup --host generic --project", "generic");

// ------------------------------------------------------------------------------------------------ the record
gitServer.kill();
const out = path.join(repoRoot, "docs", "baselines", `${label}-firstrun`);
const scrub = (t: string): string => t.split(fs.realpathSync(root)).join("<tmp>").split(root).join("<tmp>").split(os.homedir()).join("~").replace(/\/(?:private\/)?var\/folders\/[^"\s']*/g, "<tmp>");
const passed = trials.every((t) => t.problems.length === 0);
const summary = { label, date: new Date().toISOString(), model: values.model, claude: spawnSync(claude, ["--version"], { encoding: "utf8" }).stdout.trim(), total_cost_usd: Math.round(totalCost * 100) / 100, trials, passed };
fs.writeFileSync(`${out}.json`, scrub(JSON.stringify(summary, null, 2)) + "\n");
fs.writeFileSync(`${out}.md`, scrub(["# First run on each host, from the documents alone: " + label, "", `${summary.date}, ${summary.model}, Claude Code ${summary.claude}. A fresh real agent with only README.md and docs/HOSTS.md and a Git address (a local stand-in for GitHub). Total cost $${summary.total_cost_usd}.`, "", "| Host | Minutes | Cost | Result |", "|------|---------|------|--------|", ...trials.map((t) => `| ${t.name} | ${t.minutes} | $${(t.cost_usd ?? 0).toFixed(2)} | ${t.problems.length ? "FAIL: " + t.problems.join("; ") : "pass"} |`), "", ...trials.flatMap((t) => [`## ${t.name}`, "", "Checks:", ...t.checks.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.check}${c.detail ? ` (${c.detail})` : ""}`), "", "The agent's commands:", "", "```", ...t.commands, "```", "", "Files it read:", "", ...t.files_read.map((f) => `- ${f}`), "", "The agent's own report:", "", t.report, ""])].join("\n")));
console.log(`\nSaved ${path.relative(repoRoot, out)}.{json,md}; total cost $${summary.total_cost_usd}; ${passed ? "ALL PASSED" : "FAILURES"}`);
if (!values.keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Workspace kept at ${root}`);
process.exit(passed ? 0 : 1);
