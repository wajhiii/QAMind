/**
 * Scored evaluation run of /qa-only on the demo app, with every setting pinned so results from different phases are
 * comparable. Needs the Claude Code CLI and a login. A `full` run costs roughly $5 to $10 and takes 15 to 30 minutes.
 *
 *   node scripts/eval-demo.ts --label phase-1 [--mode full] [--rep 1] [--budget 15] [--claude /path/to/claude] [--keep]
 *   node scripts/eval-summary.ts phase-1 full        (aggregates all repetitions of a label)
 *
 * LLM runs vary a lot, so compare phases using several repetitions (--rep 1, 2, 3 ...), not a single run.
 * Writes docs/baselines/<label>-<mode>-r<rep>.json (settings + results), .report.md, .admin.md and .findings.json.
 * The agent under test never sees the answer key: the demo is copied without SEEDED-BUGS.md, eval/ and qa-fixture/.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { lintRun, readRunData } from "../core/lib/report.ts";
import { checkConsistency } from "../core/scripts/consistency-check.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    label: { type: "string" },
    mode: { type: "string", default: "full" },
    budget: { type: "string", default: "15" },
    claude: { type: "string" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    out: { type: "string", default: path.join(repoRoot, "docs", "baselines") },
    rep: { type: "string", default: "1" },
    "timeout-min": { type: "string", default: "45" },
    keep: { type: "boolean", default: false },
  },
});
if (!values.label) {
  console.error("--label is required (for example phase-1)");
  process.exit(2);
}
const label = values.label;
const mode = values.mode as string;
const claude = values.claude ?? process.env["CLAUDE_BIN"] ?? "claude";
const model = values.model as string;
const budget = values.budget as string;

const run = (cmd: string, args: string[], cwd = repoRoot) => spawnSync(cmd, args, { cwd, encoding: "utf8" });
const sha256 = (f: string) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const ver = run(claude, ["--version"]);
if (ver.status !== 0) {
  console.error(`Cannot run "${claude}". Pass --claude <path> or set CLAUDE_BIN.`);
  process.exit(2);
}

// Snapshot the code under test BEFORE the run: the run takes a long time and the tree may change while it goes.
const gitOut = (a: string[]) => run("git", a).stdout.trim();
/** Hash of every file in the built plugin (excluding installed dependencies): identifies exactly what was tested, committed or not. */
function pluginContentHash(): string {
  const root = path.join(repoRoot, "plugins", "qamind");
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(root);
  const h = crypto.createHash("sha256");
  for (const f of files.sort()) h.update(`${path.relative(root, f)}\0`).update(fs.readFileSync(f));
  return h.digest("hex");
}

// The code under test is the BUILT plugin (plugins/qamind) that the agent loads; sources are recorded for information.
const sourceState = {
  git_commit: gitOut(["rev-parse", "HEAD"]),
  plugin_tree_committed: gitOut(["rev-parse", "HEAD:plugins/qamind"]),
  plugin_content_sha256: pluginContentHash(),
  uncommitted_in_built_plugin: gitOut(["status", "--porcelain", "--", "plugins"]).split("\n").filter(Boolean),
  uncommitted_in_sources_not_in_plugin_unless_built: gitOut(["status", "--porcelain", "--", "core", "hosts", "cli"]).split("\n").filter(Boolean),
};
if (sourceState.uncommitted_in_built_plugin.length > 0) console.warn(`Warning: the built plugin differs from the commit:\n  ${sourceState.uncommitted_in_built_plugin.join("\n  ")}`);

const ALLOWED_TOOLS = ["Read", "Glob", "Grep", "Write", "Edit", "Bash(qamind *)", "Bash(curl *)", "Bash(git status *)", "Bash(git diff *)", "Bash(git log *)", "Bash(ls *)", "mcp__plugin_qamind_browser"];
const prompt = `/qamind:qa-only ${mode}`;
const pluginDir = path.join(repoRoot, "plugins", "qamind");

// ---- workspace: the demo app copied without the answer key, plus the fixture config and credentials ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-eval-"));
const ws = path.join(tmp, "ws");
const home = path.join(tmp, "home");
const EXCLUDE = new Set(["node_modules", ".qa", ".env.qa", ".env.qa.fixture", "SEEDED-BUGS.md", "eval", "qa-fixture"]);
fs.cpSync(path.join(repoRoot, "demo-app"), ws, { recursive: true, filter: (src) => !EXCLUDE.has(path.basename(src)) });
for (const c of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.name=eval", "-c", "user.email=eval@example.test", "commit", "-qm", "demo app"]]) run("git", c, ws);
fs.mkdirSync(path.join(ws, ".qa"), { recursive: true });
fs.copyFileSync(path.join(repoRoot, "demo-app", "qa-fixture", "config.md"), path.join(ws, ".qa", "config.md"));
fs.copyFileSync(path.join(repoRoot, "demo-app", ".env.qa.fixture"), path.join(ws, ".env.qa"));

// ---- the demo app ----
// Something already answering on the port is a stale server from an earlier run: the agent would test that one, not this workspace.
const answering = async (): Promise<boolean> => {
  try {
    return (await fetch("http://127.0.0.1:4100/api/health")).ok;
  } catch {
    return false;
  }
};
if (await answering()) {
  console.error("Something is already listening on port 4100 (a stale demo app?). Stop it and run again.");
  process.exit(1);
}
const server = spawn(process.execPath, ["server.mjs"], { cwd: ws, stdio: "ignore" });
const up = async (): Promise<boolean> => {
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null) return false;
    if (await answering()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};
if (!(await up())) {
  server.kill();
  console.error("The demo app did not start (are ports 4100-4102 free?).");
  process.exit(1);
}
run(process.execPath, ["scripts/reset.mjs"], ws);

// ---- the agent run ----
const env = { ...process.env, QAMIND_HOME: home, ENABLE_CLAUDEAI_MCP_SERVERS: "false" } as NodeJS.ProcessEnv;
delete env["CLAUDECODE"];
delete env["CLAUDE_CODE_ENTRYPOINT"];
const args = ["-p", prompt, "--plugin-dir", pluginDir, "--model", model, "--setting-sources", "project,local", "--allowedTools", ...ALLOWED_TOOLS, "--max-budget-usd", budget, "--no-session-persistence", "--output-format", "stream-json", "--verbose"];
const streamFile = path.join(tmp, "stream.jsonl");
const out = fs.openSync(streamFile, "w");
const started = Date.now();
console.log(`Running ${prompt} (model ${model}, budget $${budget}) in ${ws} ...`);
const exitCode: number = await new Promise((resolve) => {
  const child = spawn(claude, args, { cwd: ws, env, stdio: ["ignore", out, "ignore"] });
  const timer = setTimeout(() => child.kill("SIGTERM"), Number(values["timeout-min"]) * 60 * 1000);
  child.on("exit", (code) => {
    clearTimeout(timer);
    resolve(code ?? 1);
  });
});
server.kill();

// ---- results ----
interface Ev {
  type?: string;
  subtype?: string;
  model?: string;
  message?: { content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  is_error?: boolean;
}
const events: Ev[] = fs.readFileSync(streamFile, "utf8").split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as Ev);
const init = events.find((e) => e.type === "system" && e.subtype === "init");
const result = events.find((e) => e.type === "result");
const toolCalls: Record<string, number> = {};
const knowledgeRead: string[] = [];
let auditCalls = 0;
for (const e of events) {
  if (e.type !== "assistant") continue;
  for (const c of e.message?.content ?? []) {
    if (c.type !== "tool_use" || !c.name) continue;
    const name = c.name.replace("mcp__plugin_qamind_browser__", "browser:");
    toolCalls[name] = (toolCalls[name] ?? 0) + 1;
    const input = JSON.stringify(c.input ?? {});
    if (input.includes("__qamindAudit")) auditCalls++;
    const file = String((c.input ?? {})["file_path"] ?? "");
    if (c.name === "Read" && /[\\/]core[\\/]knowledge[\\/]/.test(file) && !knowledgeRead.includes(file)) knowledgeRead.push(file.replace(/^.*[\\/]core[\\/]knowledge[\\/]/, ""));
  }
}

// A run that ends without a result event (a stall, a crash, the timeout) is a failed run: keep what is needed to find out why.
const stalled = !result;
const diagnostics = stalled
  ? {
      last_tool_calls: events
        .filter((e) => e.type === "assistant")
        .flatMap((e) => (e.message?.content ?? []).filter((c) => c.type === "tool_use").map((c) => `${c.name} ${JSON.stringify(c.input ?? {}).slice(0, 120)}`))
        .slice(-12),
      stream_events: events.length,
      stream_file_kept_at: streamFile,
    }
  : undefined;

const reports = path.join(ws, ".qa", "reports");
const runDirName = fs.existsSync(reports) ? fs.readdirSync(reports).filter((d) => d.startsWith("run-")).sort().pop() : undefined;
const runDir = runDirName ? path.join(reports, runDirName) : undefined;
const score = runDir ? (JSON.parse(run(process.execPath, [path.join(repoRoot, "demo-app", "eval", "score-run.mjs"), runDir, "--json"]).stdout || "{}") as Record<string, unknown>) : {};
const passwords = fs.readFileSync(path.join(ws, ".env.qa"), "utf8").split("\n").filter((l) => /PASS/.test(l)).map((l) => l.split("=")[1] ?? "");
const lint = runDir ? lintRun(runDir, readRunData(runDir), passwords) : undefined;
const findings = runDir ? readRunData(runDir).findings : [];
// The admin report: do the two written reports agree, and is every plain-language field present?
const adminFile = runDir ? path.join(runDir, "ADMIN-REPORT.md") : undefined;
const consistency = runDir && adminFile && fs.existsSync(adminFile) ? checkConsistency(runDir) : undefined;
const admin = {
  present: !!consistency,
  consistency_ok: consistency?.ok ?? false,
  consistency_errors: (consistency?.errors ?? ["no ADMIN-REPORT.md was written"]).slice(0, 8),
  plain_text_errors: (lint?.errors ?? []).filter((e) => /plain|admin\.json/.test(e)).length,
  verdict: adminFile && fs.existsSync(adminFile) ? (fs.readFileSync(adminFile, "utf8").split("\n")[0] ?? "") : "",
};
const sev = { critical: 0, important: 0, minor: 0 };
for (const f of findings) sev[f.severity] += 1;

const git = (a: string[]) => run("git", a).stdout.trim();
const chromeVersion = (() => {
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const r = fs.existsSync(mac) ? run(mac, ["--version"]) : run("google-chrome", ["--version"]);
  return r.status === 0 ? r.stdout.trim() : "unknown";
})();
const record = {
  label,
  mode,
  rep: Number(values.rep),
  date: new Date(started).toISOString(),
  settings: {
    prompt,
    qamind: sourceState,
    claude: { version: ver.stdout.trim(), model_requested: model, model_in_session: init?.model, setting_sources: "project,local", claudeai_connectors: "disabled (ENABLE_CLAUDEAI_MCP_SERVERS=false)", permission_mode: "default", allowed_tools: ALLOWED_TOOLS, max_budget_usd: Number(budget) },
    demo: { tree: git(["rev-parse", "HEAD:demo-app"]), ports: "4100/4101/4102", data: "reset before the run", fixture_config_sha256: sha256(path.join(repoRoot, "demo-app", "qa-fixture", "config.md")), fixture_env_sha256: sha256(path.join(repoRoot, "demo-app", ".env.qa.fixture")), answer_key_visible_to_agent: false },
    machine: { platform: `${os.platform()} ${os.release()}`, node: process.version, chrome: chromeVersion },
  },
  results: {
    exit_code: exitCode,
    outcome: result?.subtype ?? "no result event (the run stalled or was killed: not a bug-finding result)",
    ...(diagnostics ? { diagnostics } : {}),
    cost_usd: result?.total_cost_usd ?? null,
    turns: result?.num_turns ?? null,
    wall_minutes: Math.round((Date.now() - started) / 600) / 100,
    findings: findings.length,
    severity: sev,
    lint_ok: lint?.ok ?? null,
    lint_errors: lint?.errors ?? [],
    admin,
    tool_calls: toolCalls,
    page_audit_calls: auditCalls,
    knowledge_files_read: knowledgeRead,
    score,
  },
  note: "Single run. LLM runs vary; read differences smaller than a few bugs or about 30% cost with care.",
};

fs.mkdirSync(values.out as string, { recursive: true });
const base = path.join(values.out as string, `${label}-${mode}-r${values.rep}`);
fs.writeFileSync(`${base}.json`, JSON.stringify(record, null, 2) + "\n");
if (runDir) {
  fs.copyFileSync(path.join(runDir, "TECHNICAL-REPORT.md"), `${base}.report.md`);
  if (fs.existsSync(path.join(runDir, "data", "findings.json"))) fs.copyFileSync(path.join(runDir, "data", "findings.json"), `${base}.findings.json`);
  if (fs.existsSync(path.join(runDir, "ADMIN-REPORT.md"))) fs.copyFileSync(path.join(runDir, "ADMIN-REPORT.md"), `${base}.admin.md`);
}
console.log(JSON.stringify({ ...record.results, tool_calls: undefined, admin: { consistency_ok: admin.consistency_ok, plain_text_errors: admin.plain_text_errors, verdict: admin.verdict.slice(0, 90) }, score: { recall: (score as { recall?: string }).recall, depth: (score as { depth_score?: string }).depth_score, decoy_hits: (score as { decoy_hits?: unknown[] }).decoy_hits?.length, missed: (score as { missed?: string[] }).missed, secrets: (score as { secrets_in_run_output?: unknown }).secrets_in_run_output } }, null, 2));
console.log(`Saved ${path.relative(repoRoot, base)}.{json,report.md,findings.json}`);
if (values.keep || stalled) console.log(`Workspace kept at ${tmp}`);
else fs.rmSync(tmp, { recursive: true, force: true });
