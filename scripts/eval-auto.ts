/**
 * The auto-QA end-to-end test (spec section 14, Phase 6.5): real Claude Code, the built plugin, a COPY of the demo app per scenario.
 *
 *   on-change    auto-QA on, the agent changes demo-app code      -> exactly one QA run follows (trigger auto, mode diff)
 *   noqa         auto-QA on, the same change with #noqa           -> no QA run
 *   off          auto-QA never turned on, the same change         -> no QA run (the default is OFF)
 *   tag-qa       auto-QA off, the same change with #qa            -> exactly one QA run (a tag forces it)
 *   off-next     auto-QA on, then "/qamind:qa-auto off", then the change in the same session -> no QA run (off takes effect on the very next task)
 *
 * Everything is checked from the files, not from the agent's word: run folders and run summaries in the store, the gate's own state file, the stream of tool
 * calls (how often the internal skill was invoked), git (the only change in the project is the requested one, nothing committed, nothing pushed), and the final message.
 * Writes docs/baselines/<label>-auto.{json,md}.
 *
 *   node scripts/eval-auto.ts --label phase-6.5 [--only on-change,noqa] [--budget 6] [--timeout-min 25] [--claude /path/to/claude] [--keep]
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
const { values } = parseArgs({
  options: {
    label: { type: "string" },
    only: { type: "string" },
    budget: { type: "string", default: "6" },
    "timeout-min": { type: "string", default: "25" },
    claude: { type: "string" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    keep: { type: "boolean", default: false },
  },
});
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
const plugin = path.join(repoRoot, "plugins", "qamind");
const bundle = path.join(plugin, "dist", "qamind.mjs");
if (!fs.existsSync(bundle)) {
  console.error("plugins/qamind is not built: run `node scripts/build.ts` first.");
  process.exit(2);
}

// ------------------------------------------------------------------------------------------------ workspaces

const CHANGE = "In the client portal, change the heading on the My orders page (public/client/my-orders.html) from \"My orders\" to \"Your orders\". Change only that heading text, nothing else.";
const CHANGED_FILE = "public/client/my-orders.html";
const EXCLUDE = new Set(["node_modules", ".qa", ".env.qa", ".env.qa.fixture", "SEEDED-BUGS.md", "eval", "qa-fixture"]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-auto-"));

interface Workspace {
  id: string;
  ws: string;
  home: string;
  base: string;
  git: (...a: string[]) => string;
  passwords: string[];
}

function workspace(id: string): Workspace {
  const dir = path.join(root, id);
  const ws = path.join(dir, "ws");
  const home = path.join(dir, "home");
  fs.mkdirSync(home, { recursive: true });
  fs.cpSync(path.join(repoRoot, "demo-app"), ws, { recursive: true, filter: (src) => !EXCLUDE.has(path.basename(src)) });
  const git = (...a: string[]): string => execFileSync("git", ["-C", ws, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  for (const c of [["init", "-q", "-b", "main"], ["config", "user.name", "Dev"], ["config", "user.email", "dev@example.test"]]) git(...c);
  // QAMind's own lines are in .gitignore from the start, so its first run does not add a second change to the project.
  fs.writeFileSync(path.join(ws, ".gitignore"), "node_modules\n# QAMind (private test credentials and reports)\n.env.qa\n.qa/\n");
  git("add", "-A");
  git("commit", "-qm", "demo app");
  git("switch", "-q", "-c", "feature/auto-eval");
  fs.mkdirSync(path.join(ws, ".qa"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "demo-app", "qa-fixture", "config.md"), path.join(ws, ".qa", "config.md"));
  fs.copyFileSync(path.join(repoRoot, "demo-app", ".env.qa.fixture"), path.join(ws, ".env.qa"));
  const passwords = fs.readFileSync(path.join(ws, ".env.qa"), "utf8").split("\n").filter((l) => /PASS/.test(l)).map((l) => l.split("=")[1]?.trim() ?? "").filter((v) => v.length >= 6);
  return { id, ws, home, base: git("rev-parse", "HEAD"), git, passwords };
}

let server: ChildProcess | undefined;
const answering = async (): Promise<boolean> => {
  try {
    return (await fetch("http://127.0.0.1:4100/api/health")).ok;
  } catch {
    return false;
  }
};
async function startServer(w: Workspace): Promise<void> {
  if (await answering()) throw new Error("Something is already listening on port 4100 (a stale demo app?). Stop it and run again.");
  const child = spawn(process.execPath, ["server.mjs"], { cwd: w.ws, stdio: "ignore" });
  server = child;
  for (let i = 0; ; i++) {
    if (child.exitCode !== null || i >= 40) throw new Error("The demo app did not start (are ports 4100-4102 free?).");
    if (await answering()) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  spawnSync(process.execPath, ["scripts/reset.mjs"], { cwd: w.ws });
}
const stopServer = async (): Promise<void> => {
  server?.kill();
  await new Promise((r) => setTimeout(r, 500));
};

// ------------------------------------------------------------------------------------------------ the agent

interface Ev {
  type?: string;
  subtype?: string;
  message?: { content?: Array<{ type: string; name?: string; id?: string; tool_use_id?: string; is_error?: boolean; content?: unknown; input?: Record<string, unknown> }> };
  total_cost_usd?: number;
  num_turns?: number;
  is_error?: boolean;
  result?: string;
  permission_denials?: Array<{ tool_name?: string; tool_input?: Record<string, unknown> }>;
}
interface Turn {
  prompt: string;
  events: Ev[];
  result?: Ev;
  cost: number;
  minutes: number;
  timedOut: boolean;
}

function baseEnv(w: Workspace): NodeJS.ProcessEnv {
  const env = { ...process.env, QAMIND_HOME: w.home, ENABLE_CLAUDEAI_MCP_SERVERS: "false" } as NodeJS.ProcessEnv;
  for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "QAMIND_AUTO", "NODE_TEST_CONTEXT"]) delete env[k];
  return env;
}

/** The built plugin's own CLI, the way the toggle skill runs it. */
function qamind(w: Workspace, ...args: string[]): Record<string, unknown> {
  const r = spawnSync(process.execPath, [bundle, ...args], { cwd: w.ws, env: baseEnv(w), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`qamind ${args.join(" ")} failed: ${r.stderr}${r.stdout}`);
  return JSON.parse(r.stdout) as Record<string, unknown>;
}

function runTurn(w: Workspace, sessionId: string, prompt: string, first: boolean): Promise<Turn> {
  return new Promise((resolve) => {
    // No allow list beyond what a person would click through in the first minute: edits are accepted, and the skills' own allowed-tools do the rest.
    const args = ["-p", prompt, ...(first ? ["--session-id", sessionId] : ["--resume", sessionId]), "--plugin-dir", plugin, "--model", values.model as string, "--setting-sources", "project,local", "--permission-mode", "acceptEdits", "--max-budget-usd", values.budget as string, "--output-format", "stream-json", "--verbose"];
    const started = Date.now();
    const events: Ev[] = [];
    let buf = "";
    let timedOut = false;
    const child = spawn(claude, args, { cwd: w.ws, env: baseEnv(w), stdio: ["ignore", "pipe", "pipe"] });
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
            /* partial */
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
      const result = events.find((e) => e.type === "result");
      resolve({ prompt, events, ...(result ? { result } : {}), cost: result?.total_cost_usd ?? 0, minutes: Math.round((Date.now() - started) / 600) / 100, timedOut });
    });
  });
}

// ------------------------------------------------------------------------------------------------ what happened, from the files

interface RunInfo {
  id: string;
  trigger: string;
  mode: string;
  kind: string;
  finished: boolean;
  counts?: unknown;
}

function storeOf(w: Workspace): string | undefined {
  const projects = path.join(w.home, "projects");
  const first = fs.existsSync(projects) ? fs.readdirSync(projects)[0] : undefined;
  return first ? path.join(projects, first) : undefined;
}

function runsOf(w: Workspace): RunInfo[] {
  const reports = path.join(w.ws, ".qa", "reports");
  const store = storeOf(w);
  const dirs = fs.existsSync(reports) ? fs.readdirSync(reports).filter((d) => d.startsWith("run-")).sort() : [];
  return dirs.map((d) => {
    const summaryFile = store ? path.join(store, "memory", "runs", `${d}.json`) : "";
    const summary = summaryFile && fs.existsSync(summaryFile) ? (JSON.parse(fs.readFileSync(summaryFile, "utf8")) as { trigger: string; mode: string; kind: string; counts: unknown }) : undefined;
    const meta = path.join(reports, d, "data", "meta.json");
    const m = fs.existsSync(meta) ? (JSON.parse(fs.readFileSync(meta, "utf8")) as { trigger?: string; mode?: string; kind?: string }) : {};
    return { id: d, trigger: summary?.trigger ?? m.trigger ?? "?", mode: summary?.mode ?? m.mode ?? "?", kind: summary?.kind ?? m.kind ?? "?", finished: !!summary, ...(summary ? { counts: summary.counts } : {}) };
  });
}

const skillCalls = (turns: Turn[]): number => turns.flatMap((t) => t.events).flatMap((e) => (e.type === "assistant" ? e.message?.content ?? [] : [])).filter((c) => c.type === "tool_use" && c.name === "Skill" && /qa-auto-run/.test(String(c.input?.["skill"] ?? ""))).length;
const text = (c: unknown): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x && typeof x === "object" && "text" in x ? String((x as { text: unknown }).text) : "")).join(" ") : "");
/** The agent's tool calls in order, and the errors the host or a hook answered with: what the record shows when a run did not happen. */
function trace(turns: Turn[], mask: (t: string) => string): { calls: string[]; errors: string[] } {
  const calls: string[] = [];
  const errors: string[] = [];
  const names = new Map<string, string>();
  for (const e of turns.flatMap((t) => t.events)) {
    for (const c of e.message?.content ?? []) {
      if (e.type === "assistant" && c.type === "tool_use") {
        const name = (c.name ?? "").replace("mcp__plugin_qamind_qa-memory__", "qa:").replace("mcp__plugin_qamind_browser__", "browser:");
        const arg = mask(String(c.input?.["skill"] ?? c.input?.["command"] ?? c.input?.["file_path"] ?? c.input?.["query"] ?? "")).replace(/\s+/g, " ").slice(0, 100);
        calls.push(`${name} ${arg}`.trim());
        if (c.id) names.set(c.id, name);
      }
      if (e.type === "user" && c.type === "tool_result" && c.is_error) errors.push(`${names.get(c.tool_use_id ?? "") ?? "?"}: ${mask(text(c.content)).replace(/\s+/g, " ").slice(0, 300)}`);
    }
  }
  return { calls, errors };
}
const lastText = (t: Turn | undefined): string => String(t?.result?.result ?? "").trim();
const nonEmptyLines = (s: string): number => s.split("\n").filter((l) => l.trim() !== "").length;

// ------------------------------------------------------------------------------------------------ scenarios

interface Scenario {
  id: string;
  title: string;
  /** Run before the first prompt (the user's own settings). */
  setup: (w: Workspace) => void;
  prompts: string[];
  expectRuns: number;
}

const SCENARIOS: Scenario[] = [
  { id: "on-change", title: "auto on, code change: exactly one QA run follows", setup: (w) => void qamind(w, "auto", "on"), prompts: [CHANGE], expectRuns: 1 },
  { id: "noqa", title: "auto on, code change with #noqa: no QA run", setup: (w) => void qamind(w, "auto", "on"), prompts: [`${CHANGE} #noqa`], expectRuns: 0 },
  { id: "off", title: "auto never turned on (the default), code change: no QA run", setup: () => undefined, prompts: [CHANGE], expectRuns: 0 },
  { id: "tag-qa", title: "auto off, code change with #qa: exactly one QA run", setup: () => undefined, prompts: [`${CHANGE} #qa`], expectRuns: 1 },
  { id: "off-next", title: "auto on, then /qa-auto off, then a code change in the same session: no QA run", setup: (w) => void qamind(w, "auto", "on"), prompts: ["/qamind:qa-auto off", CHANGE], expectRuns: 0 },
];

const chosen = (values.only ? values.only.split(",").map((s) => s.trim()) : SCENARIOS.map((s) => s.id)).map((id) => SCENARIOS.find((s) => s.id === id) ?? (() => { throw new Error(`Unknown scenario ${id}`); })());

const records: Array<Record<string, unknown>> = [];
let totalCost = 0;
for (const sc of chosen) {
  console.log(`\n== ${sc.id}: ${sc.title}`);
  const w = workspace(sc.id);
  sc.setup(w);
  await startServer(w);
  const sessionId = crypto.randomUUID();
  const turns: Turn[] = [];
  for (const [i, p] of sc.prompts.entries()) {
    const t = await runTurn(w, sessionId, p, i === 0);
    turns.push(t);
    totalCost += t.cost;
    console.log(`  turn ${i + 1}: ${t.minutes} min, $${t.cost.toFixed(2)}, ${t.result?.subtype ?? "no result"}${t.timedOut ? " (TIMED OUT)" : ""}`);
  }
  await stopServer();

  const problems: string[] = [];
  const warnings: string[] = [];
  const runs = runsOf(w);
  const calls = skillCalls(turns);
  const status = qamind(w, "auto", "status");
  const tr = trace(turns, (t) => w.passwords.reduce((x, p) => x.split(p).join("***"), t));
  const store = storeOf(w);
  const lastFile = store ? path.join(store, "state", "auto-last.json") : "";
  const last = lastFile && fs.existsSync(lastFile) ? (JSON.parse(fs.readFileSync(lastFile, "utf8")) as { files: string[]; mode: string; forced?: string }) : undefined;
  const lines = (t: string): string[] => t.split("\n").filter(Boolean);
  const changed = [...lines(w.git("diff", "--name-only", "HEAD")), ...lines(w.git("ls-files", "--others", "--exclude-standard"))];
  const commits = w.git("rev-list", `${w.base}..HEAD`).split("\n").filter(Boolean);
  const checks: Record<string, unknown> = {
    qa_runs: runs.length,
    runs,
    internal_skill_invocations: calls,
    project_changes: changed,
    commits_made: commits.length,
    branch: w.git("branch", "--show-current"),
    remotes: w.git("remote").split("\n").filter(Boolean),
    auto_last: last ?? null,
    tool_calls: tr.calls.slice(0, 60),
    tool_errors: tr.errors.slice(0, 12),
    auto_status_enabled: status["enabled"],
  };

  if (runs.length !== sc.expectRuns) problems.push(`expected ${sc.expectRuns} QA run(s), found ${runs.length}`);
  if (calls !== sc.expectRuns) problems.push(`expected the auto-QA skill to be invoked ${sc.expectRuns} time(s), it was invoked ${calls} time(s)`);
  for (const t of turns) {
    if (t.timedOut) problems.push(`a turn timed out after ${values["timeout-min"]} minutes (a loop, or a very slow run)`);
    else if (!t.result || t.result.is_error) problems.push(`a turn did not end cleanly (${t.result?.subtype ?? "no result"})`);
  }
  if (sc.expectRuns > 0) {
    for (const r of runs) {
      if (r.trigger !== "auto") problems.push(`${r.id} has trigger "${r.trigger}", not "auto"`);
      if (!r.finished) problems.push(`${r.id} never finished (no run summary in the store)`);
      if (r.kind !== "qa-only") problems.push(`${r.id} is kind "${r.kind}": an auto run in diff mode must be report-only`);
    }
    if (!last || last.mode !== "diff") problems.push(`the gate's record of the run is missing or not diff mode (${JSON.stringify(last)})`);
    else if (last.files.length !== 1 || last.files[0] !== CHANGED_FILE) problems.push(`the gate listed ${JSON.stringify(last.files)} instead of just ${CHANGED_FILE}`);
    const finalText = lastText(turns[turns.length - 1]);
    checks["final_message"] = finalText;
    checks["final_message_lines"] = nonEmptyLines(finalText);
    if (nonEmptyLines(finalText) > 5) warnings.push(`the final message has ${nonEmptyLines(finalText)} lines (the instruction says at most 5)`);
    if (/Auto-QA skipped/.test(finalText)) problems.push(`the run was skipped instead of running: ${finalText.slice(0, 200)}`);
  } else {
    checks["auto_last_absent_as_expected"] = !last;
    if (last) problems.push("the gate recorded a run although none was expected");
  }
  // The scenario's own edit reached the project, and nothing else did.
  const unexpected = changed.filter((f) => f !== CHANGED_FILE);
  if (unexpected.length) problems.push(`the project has changes beyond the requested one: ${unexpected.join(", ")}`);
  if (!changed.includes(CHANGED_FILE)) problems.push(`the requested change was not made to ${CHANGED_FILE}`);
  else if (!/<h1>Your orders<\/h1>/.test(fs.readFileSync(path.join(w.ws, CHANGED_FILE), "utf8"))) problems.push("the heading is not \"Your orders\"");
  if (commits.length) problems.push("the agent made commits in an auto-QA scenario");
  if ((checks["remotes"] as string[]).length) problems.push("a remote exists");
  if (sc.id === "off-next" && status["enabled"] !== false) problems.push("`/qa-auto off` did not turn it off");
  if (sc.id === "off" && status["enabled"] !== false) problems.push("auto-QA was on without anyone turning it on");

  const leaks: string[] = [];
  const scan = (name: string, text: string): void => {
    if (w.passwords.some((p) => text.includes(p))) leaks.push(name);
  };
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(json|jsonl|md|txt|log)$/.test(e.name)) scan(path.relative(root, p), fs.readFileSync(p, "utf8"));
    }
  };
  for (const d of [w.home, path.join(w.ws, ".qa", "reports")]) if (fs.existsSync(d)) walk(d);
  for (const t of turns) scan("the agent's messages", JSON.stringify(t.events));
  checks["secrets_found_in"] = leaks;
  if (leaks.length) problems.push(`a fixture password appears in: ${leaks.join(", ")}`);

  const record = {
    id: sc.id,
    title: sc.title,
    prompts: sc.prompts,
    turns: turns.map((t, i) => ({ turn: i + 1, minutes: t.minutes, cost_usd: t.cost, result: t.result?.subtype ?? null, is_error: t.result?.is_error ?? null, num_turns: t.result?.num_turns ?? null, permission_denials: (t.result?.permission_denials ?? []).map((d) => d.tool_name ?? "?") })),
    checks,
    warnings,
    problems,
    passed: problems.length === 0,
  };
  records.push(record);
  console.log(`  -> ${problems.length === 0 ? "PASS" : "FAIL"}: ${sc.expectRuns} run(s) expected, ${runs.length} found, skill invoked ${calls}x${problems.length ? `\n     ${problems.join("\n     ")}` : ""}${warnings.length ? `\n     (warning) ${warnings.join("; ")}` : ""}`);
}

const out = path.join(repoRoot, "docs", "baselines", `${label}-auto`);
const summary = { label, date: new Date().toISOString(), model: values.model, claude: spawnSync(claude, ["--version"], { encoding: "utf8" }).stdout.trim(), total_cost_usd: Math.round(totalCost * 100) / 100, scenarios: records, passed: records.every((r) => r["passed"]) };
// The record is committed: keep the machine's home and temp folders out of it.
const scrub = (t: string): string => t.split(fs.realpathSync(root)).join("<tmp>").split(root).join("<tmp>").split(os.homedir()).join("~");
fs.writeFileSync(`${out}.json`, scrub(JSON.stringify(summary, null, 2)) + "\n");
const md = [
  `# Auto-QA end-to-end run: ${label}`,
  "",
  `${summary.date}, ${summary.model}, Claude Code ${summary.claude}. Real Claude Code with the built plugin, a copy of the demo app per scenario. Total cost $${summary.total_cost_usd}.`,
  "",
  "| Scenario | Expected QA runs | Found | Skill invoked | Result |",
  "|----------|------------------|-------|---------------|--------|",
  ...records.map((r) => `| ${r["id"]}: ${r["title"]} | ${SCENARIOS.find((s) => s.id === r["id"])?.expectRuns} | ${(r["checks"] as Record<string, unknown>)["qa_runs"]} | ${(r["checks"] as Record<string, unknown>)["internal_skill_invocations"]} | ${r["passed"] ? "pass" : "FAIL: " + (r["problems"] as string[]).join("; ")} |`),
  "",
].join("\n");
fs.writeFileSync(`${out}.md`, scrub(md));
console.log(`\nSaved ${path.relative(repoRoot, out)}.{json,md}; total cost $${summary.total_cost_usd}; ${summary.passed ? "ALL PASSED" : "FAILURES"}`);
if (!values.keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Workspaces kept at ${root}`);
process.exit(summary.passed ? 0 : 1);
