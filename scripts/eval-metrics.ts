/**
 * Release verdict and agent metrics end-to-end test (spec section 14, Phase 7.10): real Claude Code, the built plugin, a copy of the demo app, a scratch QAMIND_HOME.
 *
 *   config   release rules that differ from the default on purpose: any number of critical problems is allowed, but ONE important problem makes the verdict "Not ready".
 *   run 1    /qa-only quick on the orders API. The verdict line must follow those rules (about important problems, not critical ones), and the run must be recorded in memory/metrics.json.
 *   owner    the harness records two bugs that reached production (`qamind escaped add`), the way a person or Sentry would: one in an area run 1 tested, one in an area nobody covered.
 *   run 2    the technical report must show the "Agent performance" table with both runs and the escaped bug (and say which area run 1 had marked as passing), the verdict must still follow the rules,
 *            the agent must have been told about the escaped area (its risk was raised), and `memory stats` must carry the same numbers.
 *
 * Everything is checked from the files, the store and the tool-call stream, not from the agent's words. Writes docs/baselines/<label>-metrics.{json,md}.
 *
 *   node scripts/eval-metrics.ts --label phase-7.10 [--budget 6] [--timeout-min 30] [--claude /path/to/claude] [--keep]
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
  options: { label: { type: "string" }, only: { type: "string" }, budget: { type: "string", default: "7" }, "timeout-min": { type: "string", default: "30" }, "browsers-path": { type: "string" }, claude: { type: "string" }, model: { type: "string", default: "claude-sonnet-5-5" }, keep: { type: "boolean", default: false } },
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
if (!fs.existsSync(path.join(plugin, "dist", "qamind.mjs"))) {
  console.error("plugins/qamind is not built: run `node scripts/build.ts` first.");
  process.exit(2);
}

// ------------------------------------------------------------------------------------------------ workspaces

const EXCLUDE = new Set(["node_modules", ".qa", ".env.qa", ".env.qa.fixture", "SEEDED-BUGS.md", "eval", "qa-fixture"]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-metrics-"));

interface Workspace {
  id: string;
  ws: string;
  home: string;
  git: (...a: string[]) => string;
  passwords: string[];
}

/** `extra` is YAML put at the end of config.md's front matter. */
function workspace(id: string, extra = ""): Workspace {
  const dir = path.join(root, id);
  const ws = path.join(dir, "ws");
  const home = path.join(dir, "home");
  fs.mkdirSync(home, { recursive: true });
  fs.cpSync(path.join(repoRoot, "demo-app"), ws, { recursive: true, filter: (src) => !EXCLUDE.has(path.basename(src)) });
  const git = (...a: string[]): string => execFileSync("git", ["-C", ws, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  for (const c of [["init", "-q", "-b", "main"], ["config", "user.name", "Dev"], ["config", "user.email", "dev@example.test"]]) git(...c);
  fs.writeFileSync(path.join(ws, ".gitignore"), "node_modules\n# QAMind (private test credentials and reports)\n.env.qa\n.qa/\n");
  git("add", "-A");
  git("commit", "-qm", "demo app");
  fs.mkdirSync(path.join(ws, ".qa"), { recursive: true });
  const cfg = fs.readFileSync(path.join(repoRoot, "demo-app", "qa-fixture", "config.md"), "utf8");
  const at = cfg.indexOf("\n---", 5);
  fs.writeFileSync(path.join(ws, ".qa", "config.md"), extra ? `${cfg.slice(0, at)}\n${extra}${cfg.slice(at)}` : cfg);
  fs.copyFileSync(path.join(repoRoot, "demo-app", ".env.qa.fixture"), path.join(ws, ".env.qa"));
  const passwords = fs.readFileSync(path.join(ws, ".env.qa"), "utf8").split("\n").filter((l) => /PASS/.test(l)).map((l) => l.split("=")[1]?.trim() ?? "").filter((v) => v.length >= 6);
  return { id, ws, home, git, passwords };
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
let catcher: ChildProcess | undefined;
async function startCatcher(w: Workspace): Promise<void> {
  const up = async (): Promise<boolean> => {
    try {
      return (await fetch("http://127.0.0.1:8025/api/v1/messages")).ok;
    } catch {
      return false;
    }
  };
  if (await up()) throw new Error("Something is already listening on port 8025 (a mail catcher or Mailpit?). Stop it and run again.");
  catcher = spawn(process.execPath, ["scripts/mail-catcher.mjs"], { cwd: w.ws, stdio: "ignore" });
  for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250));
  if (!(await up())) throw new Error("The mail catcher did not start (ports 1025 and 8025 free?).");
}
const stopServer = async (): Promise<void> => {
  server?.kill();
  catcher?.kill();
  server = undefined;
  catcher = undefined;
  await new Promise((r) => setTimeout(r, 500));
};

// ------------------------------------------------------------------------------------------------ the agent

interface Ev {
  type?: string;
  message?: { content?: Array<{ type: string; name?: string; id?: string; tool_use_id?: string; is_error?: boolean; content?: unknown; input?: Record<string, unknown> }> };
  total_cost_usd?: number;
  is_error?: boolean;
  subtype?: string;
  result?: string;
}
interface Turn {
  events: Ev[];
  result?: Ev;
  cost: number;
  minutes: number;
  timedOut: boolean;
}

function runTurn(w: Workspace, prompt: string): Promise<Turn> {
  return new Promise((resolve) => {
    const env = { ...process.env, QAMIND_HOME: w.home, ENABLE_CLAUDEAI_MCP_SERVERS: "false", ...(values["browsers-path"] ? { PLAYWRIGHT_BROWSERS_PATH: path.resolve(values["browsers-path"] as string) } : {}) } as NodeJS.ProcessEnv;
    for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "QAMIND_AUTO", "NODE_TEST_CONTEXT"]) delete env[k];
    const args = ["-p", prompt, "--session-id", crypto.randomUUID(), "--plugin-dir", plugin, "--model", values.model as string, "--setting-sources", "project,local", "--max-budget-usd", values.budget as string, "--output-format", "stream-json", "--verbose"];
    const started = Date.now();
    const events: Ev[] = [];
    let buf = "";
    let timedOut = false;
    const child = spawn(claude, args, { cwd: w.ws, env, stdio: ["ignore", "pipe", "pipe"] });
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
      resolve({ events, ...(result ? { result } : {}), cost: result?.total_cost_usd ?? 0, minutes: Math.round((Date.now() - started) / 600) / 100, timedOut });
    });
  });
}

const text = (c: unknown): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x && typeof x === "object" && "text" in x ? String((x as { text: unknown }).text) : "")).join(" ") : "");
interface Call {
  name: string;
  input: Record<string, unknown>;
  result: string;
  error: boolean;
}
function calls(turn: Turn): Call[] {
  const out: Call[] = [];
  const byId = new Map<string, Call>();
  for (const e of turn.events) {
    for (const c of e.message?.content ?? []) {
      if (e.type === "assistant" && c.type === "tool_use") {
        const call: Call = { name: (c.name ?? "").replace("mcp__plugin_qamind_qa-memory__", "qa:").replace("mcp__plugin_qamind_browser__", "browser:"), input: c.input ?? {}, result: "", error: false };
        out.push(call);
        if (c.id) byId.set(c.id, call);
      }
      if (e.type === "user" && c.type === "tool_result") {
        const call = byId.get(c.tool_use_id ?? "");
        if (call) {
          call.result = text(c.content);
          call.error = !!c.is_error;
        }
      }
    }
  }
  return out;
}
const bash = (cs: Call[]): string[] => cs.filter((c) => c.name === "Bash").map((c) => String(c.input["command"] ?? ""));


// ------------------------------------------------------------------------------------------------ what happened, from the files

const readJson = <T>(f: string): T | undefined => (fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as T) : undefined);
const runsOf = (w: Workspace): string[] => {
  const d = path.join(w.ws, ".qa", "reports");
  return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.startsWith("run-")).sort().map((x) => path.join(d, x)) : [];
};
/** The workspace's own store: the project folder whose project.json lists the workspace. (A command an agent runs from a sub-folder without --run resolves "the project" from there and can leave a second, empty store next to it.) */
const storeOf = (w: Workspace): string => {
  const p = path.join(w.home, "projects");
  const names = fs.readdirSync(p);
  const real = fs.realpathSync(w.ws);
  const own = names.find((n) => {
    try {
      const info = JSON.parse(fs.readFileSync(path.join(p, n, "project.json"), "utf8")) as { paths_seen?: string[] };
      return (info.paths_seen ?? []).some((x) => fs.existsSync(x) && fs.realpathSync(x) === real);
    } catch {
      return false;
    }
  });
  return path.join(p, own ?? (names[0] as string));
};
const readJsonl = (f: string): Array<Record<string, any>> => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("{") && !l.includes('"_meta"')).map((l) => JSON.parse(l)) : []);
const readText = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");

interface Step {
  name: string;
  minutes?: number;
  cost_usd?: number;
  tool_calls?: string[];
  tool_errors?: string[];
  notes: Record<string, unknown>;
  problems: string[];
}
const steps: Step[] = [];
const RULES = { max_critical: 100, max_important: 0, not_ready_when: ["important"] };
const w = workspace("metrics", `release:\n  rules:\n    max_critical: ${RULES.max_critical}\n    max_important: ${RULES.max_important}\n    not_ready_when: [important]\nbudget:\n  modes:\n    quick: { time_minutes: 14 }`);
let totalCost = 0;

async function agentRun(name: string, prompt: string, check: (cs: Call[], turn: Turn, s: Step) => void): Promise<void> {
  console.log(`\n== ${name}: ${prompt}`);
  await startServer(w);
  const turn = await runTurn(w, prompt);
  await stopServer();
  totalCost += turn.cost;
  console.log(`  ${turn.minutes} min, $${turn.cost.toFixed(2)}, ${turn.result?.subtype ?? "no result"}${turn.timedOut ? " (TIMED OUT)" : ""}`);
  const cs = calls(turn);
  const s: Step = { name, minutes: turn.minutes, cost_usd: turn.cost, tool_calls: cs.map((c) => `${c.name}${c.name === "Bash" ? " " + String(c.input["command"] ?? "").replace(/\s+/g, " ").slice(0, 100) : ""}`).slice(0, 130), tool_errors: cs.filter((c) => c.error).map((c) => `${c.name}: ${c.result.replace(/\s+/g, " ").slice(0, 170)}`).slice(0, 14), notes: {}, problems: [] };
  if (turn.timedOut) s.problems.push("the turn timed out");
  // A password must never reach the agent through QAMind, its words, or a file QAMind controls.
  const has = (t: string): boolean => w.passwords.some((p) => t.includes(p));
  // The workspace folder is named qamind-coverage-XXXX: its name is not a call to qamind, so it is taken out before the command is looked at.
  const outside = (t: string): string => t.split(fs.realpathSync(root)).join("<tmp>").split(root).join("<tmp>");
  const viaQamind = (c: Call): boolean => c.name.startsWith("qa:") || c.name.startsWith("browser:") || (c.name === "Bash" && /\.env\.qa|(^|[\s;&|"'\/])qamind(\.mjs)?["']?\s+[a-z]/.test(outside(String(c.input["command"] ?? "")))) || (c.name === "Read" && /\.env\.qa/.test(String(c.input["file_path"] ?? "")));
  const bad = cs.filter((c) => (has(c.result) || has(JSON.stringify(c.input))) && viaQamind(c)).map((c) => `${c.name} ${String(c.input["command"] ?? "").replace(/\s+/g, " ").slice(0, 80)}`);
  if (bad.length) s.problems.push(`a fixture password reached the agent through QAMind or .env.qa: ${bad.slice(0, 3).join("; ")}`);
  // In a file of the product's own source that the agent chose to read (the demo's seed data holds the same logins in plain text) it is not a leak by QAMind, but it is noted.
  s.notes["password_values_seen_in_product_source_the_agent_chose_to_read"] = cs.filter((c) => (has(c.result) || has(JSON.stringify(c.input))) && !viaQamind(c)).map((c) => `${c.name} ${outside(String(c.input["command"] ?? c.input["file_path"] ?? "")).replace(/\s+/g, " ").slice(0, 90)}`);
  if (turn.events.filter((e) => e.type === "assistant").flatMap((e) => (e.message?.content ?? []).filter((b) => b.type === "text")).map((b) => JSON.stringify(b)).some(has)) s.problems.push("a fixture password appears in the agent's own words");
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(json|jsonl|md|txt|log|csv|html)$/i.test(e.name) && has(fs.readFileSync(f, "utf8"))) files.push(path.relative(root, f));
    }
  };
  walk(w.home);
  walk(path.join(w.ws, ".qa"));
  if (files.length) s.problems.push(`a fixture password is in a file QAMind controls: ${files.slice(0, 3).join(", ")}`);
  // What only the owner decides must never be done by a run.
  const forbidden = bash(cs).filter((c) => /qamind(\.mjs)?\s+(baseline\s+accept|browsers\s+install)/.test(c));
  s.notes["owner_only_commands_tried"] = forbidden;
  try {
    check(cs, turn, s);
  } catch (e) {
    s.problems.push(`the check itself failed: ${(e as Error).message}`);
  }
  s.notes["final_message"] = String(turn.result?.result ?? "").slice(0, 600);
  steps.push(s);
  console.log(`  -> ${s.problems.length === 0 ? "PASS" : "FAIL"}${s.problems.length ? `\n     ${s.problems.join("\n     ")}` : ""}`);
}

interface F {
  id?: string;
  title: string;
  severity: string;
  surface: string;
  area: string;
  type: string;
  summary: string;
  actual: string;
  browser?: string;
  viewport?: string;
  steps?: string[];
  expected?: string;
}
const textOf = (f: F): string => `${f.title} ${f.area} ${f.type} ${f.summary} ${f.actual} ${f.browser ?? ""} ${f.viewport ?? ""} ${(f.steps ?? []).join(" ")}`;
const ran = (cs: Call[], re: RegExp): Call[] => cs.filter((c) => c.name === "Bash" && re.test(String(c.input["command"] ?? "")));


function ownerStep(name: string, f: (s: Step) => void): void {
  console.log(`\n== ${name} (the harness, as the owner)`);
  const s: Step = { name, notes: {}, problems: [] };
  try {
    f(s);
  } catch (e) {
    s.problems.push((e as Error).message);
  }
  steps.push(s);
  console.log(`  -> ${s.problems.length === 0 ? "ok" : "FAIL"}${s.problems.length ? `\n     ${s.problems.join("\n     ")}` : ""}`);
}
// ---------------------------------------------------------------------------------------------- helpers for the checks
const FOCUS = "/qamind:qa-only quick Focus on the orders API: the list (search and pagination with unusual values), creating an order with unusual quantities, and who may read which order. Skip the screens.";
const qamind = (...args: string[]): { code: number | null; out: string } => {
  const r = spawnSync(process.execPath, [path.join(plugin, "dist", "qamind.mjs"), ...args], { cwd: w.ws, encoding: "utf8", env: { ...process.env, QAMIND_HOME: w.home } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const first = (md: string): string => (md.split("\n")[0] ?? "").trim();
interface Metric { run_id: string; verdict: string; findings: { critical: number; important: number; minor: number }; areas: Array<{ area: string; status: string; found: number }>; coverage: Record<string, number> }
interface Metrics { runs: Metric[]; escaped: Array<{ id: string; area: string; verdict: string; matched?: { run_id: string; area: string } }> }

/** The rules, applied to the run's own counts: what the first line of the admin report has to be. */
function expectedLevel(m: Metric): string {
  if (m.findings.important > RULES.max_important) return "not-ready";
  if (m.findings.critical > 0) return "ready-with-risks";
  return m.coverage["journeys_tested"] === m.coverage["journeys_total"] ? "ready" : "ready-with-risks";
}

let escapedAreas: string[] = [];
let findingsOfRun1: string[] = [];
const placed: Array<{ verdict: string; findings: string[] }> = [];
const NEVER = "Warehouse stock levels";

// ---------------------------------------------------------------------------------------------- run 1
await agentRun("run 1: the verdict follows the project's rules, and the run is recorded", FOCUS, (cs, _turn, s) => {
  const run = runsOf(w).pop();
  if (!run) return void s.problems.push("no run folder");
  const store = storeOf(w);
  const meta = readJson<{ release_rules?: typeof RULES & { allow_regressed: boolean } }>(path.join(run, "data", "meta.json"));
  s.notes["rules_frozen_in_the_run"] = meta?.release_rules;
  if (meta?.release_rules?.max_important !== 0 || meta?.release_rules?.not_ready_when?.join() !== "important" || meta?.release_rules?.max_critical !== 100) s.problems.push("the run's meta does not carry the release rules from the config");
  const metrics = readJson<Metrics>(path.join(store, "memory", "metrics.json"));
  if (!metrics || metrics.runs.length !== 1) return void s.problems.push(`memory/metrics.json has ${metrics?.runs.length ?? 0} run(s), expected 1 (the run did not finish?)`);
  const m = metrics.runs[0] as Metric;
  s.notes["metric"] = { verdict: m.verdict, findings: m.findings, coverage: m.coverage, areas: m.areas.length };
  const admin = readText(path.join(run, "ADMIN-REPORT.md"));
  const line = first(admin);
  s.notes["verdict_line"] = line;
  const want = expectedLevel(m);
  if (m.verdict !== want) s.problems.push(`the recorded verdict is ${m.verdict}; the rules and the run's own counts say ${want}`);
  if (m.findings.important > 0) {
    if (!/^⛔ \*\*Not ready to release:\*\*/.test(line)) s.problems.push(`with ${m.findings.important} important problem(s) the rules say Not ready, but the first line is: ${line}`);
    if (!/important problems? (is|are) open\.$/.test(line)) s.problems.push(`the first line does not give the rule's reason (important problems): ${line}`);
    if (/critical/i.test(line)) s.problems.push("the first line blames critical problems, which the project's rules allow");
  } else s.notes["no_important_problem_found"] = "the run found no important problem, so the rule's Not ready could not be exercised";
  if (!/## Agent performance/.test(readText(path.join(run, "TECHNICAL-REPORT.md")))) s.problems.push("the technical report has no 'Agent performance' section");
  // Where the owner will say bugs escaped: the first and the last area run 1 tested (a quick run on a buggy app rarely marks an area as passing with nothing found, so both outcomes are accepted and checked for consistency).
  const tested = m.areas.filter((a) => a.status === "tested");
  s.notes["areas_tested"] = tested.map((a) => a.area).slice(0, 8);
  if (!tested[0]) s.problems.push("run 1 marked no area as tested, so there is nothing for an escaped bug to land in");
  else {
    escapedAreas = [...new Set([tested[0].area, (tested[tested.length - 1] as { area: string }).area])];
    s.notes["escaped_areas_chosen"] = escapedAreas;
    findingsOfRun1 = (readJson<Array<{ id?: string; title: string; area: string }>>(path.join(run, "data", "findings.json")) ?? []).map((f) => `${f.id}: ${f.area} / ${f.title}`.slice(0, 120));
  }
  const forbidden = bash(cs).filter((c) => /qamind(\.mjs)?\s+escaped\s+add/.test(c));
  if (forbidden.length) s.problems.push("the agent recorded an escaped bug by itself");
});

// ---------------------------------------------------------------------------------------------- the owner
ownerStep("bugs reach production: in areas run 1 tested, and in an area nobody covered", (s) => {
  if (escapedAreas.length === 0) throw new Error("run 1 gave no area to use");
  const add = (area: string, title: string, ref: string): { verdict: string; matched_area?: string; findings_the_run_had_that_look_related?: string[] } => {
    const r = qamind("escaped", "add", "--area", area, "--title", title, "--severity", "important", "--source", "manual", "--ref", ref, "--by", "Pat Quinn");
    if (r.code !== 0) throw new Error(`escaped add failed: ${r.out.slice(0, 200)}`);
    return JSON.parse(r.out.slice(r.out.indexOf("{"))) as { verdict: string; matched_area?: string; findings_the_run_had_that_look_related?: string[] };
  };
  s.notes["run_1_findings_for_judging_the_placements"] = findingsOfRun1;
  const results = escapedAreas.map((area, i) => ({ area, ...add(area, `Production users see wrong results here since last week (${i + 1})`, `OPS-4${i}`) }));
  for (const r of results) {
    const related = r.findings_the_run_had_that_look_related ?? [];
    placed.push({ verdict: r.verdict, findings: related });
    if (r.verdict === "missed" && related.length > 0) s.problems.push(`"${r.area}" was placed as missed although findings are listed as related: ${related.join(", ")}`);
    if (r.verdict === "reported-before" && related.length === 0) s.problems.push(`"${r.area}" was placed as reported before with no finding listed`);
    if (r.verdict !== "missed" && r.verdict !== "reported-before") s.problems.push(`"${r.area}" was placed as ${r.verdict}, but run 1 marked it as tested`);
  }
  const never = add(NEVER, "Stock counts go negative after a return in production", "OPS-49");
  placed.push({ verdict: never.verdict, findings: [] });
  s.notes["escaped_add"] = { in_tested_areas: results, in_an_uncovered_area: never };
  if (never.verdict !== "never-covered") s.problems.push(`the uncovered area was placed as "${never.verdict}", expected never-covered`);
  const risk = readJson<{ areas: Array<{ area: string; events: Array<{ source?: string }> }> }>(path.join(storeOf(w), "memory", "risk-areas.json"));
  const raised = (risk?.areas ?? []).filter((a) => a.events.some((e) => e.source === "escaped")).map((a) => a.area);
  s.notes["risk_raised_for"] = raised;
  if (raised.length !== results.length + 1) s.problems.push(`the risk was raised for ${raised.length} area(s), expected ${results.length + 1}`);
});

// ---------------------------------------------------------------------------------------------- run 2
await agentRun("run 2: the table, the escaped bug, and the same rules", FOCUS, (cs, _turn, s) => {
  const run = runsOf(w).pop();
  if (!run || runsOf(w).length < 2) return void s.problems.push("no second run folder");
  const store = storeOf(w);
  const metrics = readJson<Metrics>(path.join(store, "memory", "metrics.json"));
  if (!metrics || metrics.runs.length !== 2) return void s.problems.push(`memory/metrics.json has ${metrics?.runs.length ?? 0} run(s), expected 2`);
  const m = metrics.runs[1] as Metric;
  s.notes["metric"] = { verdict: m.verdict, findings: m.findings };
  const admin = readText(path.join(run, "ADMIN-REPORT.md"));
  const tech = readText(path.join(run, "TECHNICAL-REPORT.md"));
  s.notes["verdict_line"] = first(admin);
  if (m.verdict !== expectedLevel(m)) s.problems.push(`the recorded verdict is ${m.verdict}; the rules and the run's counts say ${expectedLevel(m)}`);
  if (m.findings.important > 0 && !/^⛔ \*\*Not ready to release:\*\*.*important problems? (is|are) open\.$/.test(first(admin))) s.problems.push(`the first line does not follow the rules: ${first(admin)}`);
  const table = /## Agent performance[\s\S]*?(?=\n## )/.exec(tech)?.[0] ?? "";
  s.notes["agent_performance_section"] = table.slice(0, 1600);
  if (!table) s.problems.push("the technical report has no 'Agent performance' section");
  const rows = table.split("\n").filter((l) => /^\| (run-|\*\*this run\*\*)/.test(l));
  if (rows.length !== 2) s.problems.push(`the table has ${rows.length} run row(s), expected 2 (the first run and this one)`);
  const count = (v: string): number => placed.filter((p) => p.verdict === v).length;
  const parts = [count("missed") ? `${count("missed")} in an area a run had marked as passing \\(the agent's miss\\)` : "", count("reported-before") ? `${count("reported-before")} in an area where a problem had been reported` : "", "1 in an area no recent run covered"].filter(Boolean);
  if (!new RegExp(`\\*\\*Escaped bugs:\\*\\* ${placed.length} recorded: ${parts.join("; ")}\\.`).test(table)) s.problems.push("the section does not show the escaped bugs as what the runs had said about their areas");
  if (!placed.every((_, i) => table.includes(`ESC-00${i + 1} (important`))) s.problems.push("the escaped bugs are not all listed");
  if (!/A trend needs at least 6 runs; this project has 2\./.test(table)) s.problems.push("the section does not say a trend needs six runs");
  if (/\*\*Trend\*\*/.test(table)) s.problems.push("a trend is shown with two runs");
  // the agent was told: the context lists the risk area that the escaped bug raised
  const ctx = cs.find((c) => c.name === "qa:memory_get_context");
  const named = escapedAreas.filter((a) => ctx?.result.toLowerCase().includes(a.toLowerCase()));
  s.notes["context_names_the_escaped_areas"] = named;
  if (named.length !== escapedAreas.length) s.problems.push(`the memory context did not name every area where a bug escaped (${named.length} of ${escapedAreas.length})`);
  // memory stats carries the same numbers
  const st = qamind("memory", "stats", "--project", w.ws);
  const stats = JSON.parse(st.out.slice(st.out.indexOf("{"))) as { performance?: { total_runs: number; escaped: { total: number; missed: number; reported_before: number; never_covered: number }; runs: Array<{ run_id: string }> } };
  s.notes["memory_stats_performance"] = stats.performance ? { total_runs: stats.performance.total_runs, escaped: stats.performance.escaped } : "missing";
  if (stats.performance?.total_runs !== 2 || stats.performance.escaped.total !== placed.length) s.problems.push(`memory stats does not show 2 runs and ${placed.length} escaped bugs`);
  if (bash(cs).some((c) => /qamind(\.mjs)?\s+escaped\s+add/.test(c))) s.problems.push("the agent recorded an escaped bug by itself");
});

// ---------------------------------------------------------------------------------------------- the record
const out = path.join(repoRoot, "docs", "baselines", `${label}-metrics`);
const scrub = (t: string): string => t.split(fs.realpathSync(root)).join("<tmp>").split(root).join("<tmp>").split(os.homedir()).join("~").replace(/\/(?:private\/)?var\/folders\/[^"\s']*/g, "<tmp>");
const passed = steps.every((s) => s.problems.length === 0);
const summary = { label, date: new Date().toISOString(), model: values.model, claude: spawnSync(claude, ["--version"], { encoding: "utf8" }).stdout.trim(), total_cost_usd: Math.round(totalCost * 100) / 100, rules: RULES, steps, passed };
fs.writeFileSync(`${out}.json`, scrub(JSON.stringify(summary, null, 2)) + "\n");
fs.writeFileSync(`${out}.md`, scrub(["# Release verdict and agent metrics, end to end: " + label, "", `${summary.date}, ${summary.model}, Claude Code ${summary.claude}. Real Claude Code, the built plugin, a copy of the demo app. Release rules: \`${JSON.stringify(RULES)}\`. Total cost $${summary.total_cost_usd}.`, "", "| Step | Minutes | Cost | Result |", "|------|---------|------|--------|", ...steps.map((s) => `| ${s.name} | ${s.minutes ?? "-"} | ${s.cost_usd !== undefined ? `$${s.cost_usd.toFixed(2)}` : "-"} | ${s.problems.length ? "FAIL: " + s.problems.join("; ") : "pass"} |`), "", ...steps.flatMap((s) => [`## ${s.name}`, "", "```json", JSON.stringify(s.notes, null, 2), "```", ""])].join("\n")));
console.log(`\nSaved ${path.relative(repoRoot, out)}.{json,md}; total cost $${summary.total_cost_usd}; ${passed ? "ALL PASSED" : "FAILURES"}`);
if (!values.keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Workspace kept at ${root}`);
process.exit(passed ? 0 : 1);
