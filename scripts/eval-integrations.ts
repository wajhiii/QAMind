/**
 * Linear and Sentry, end to end (spec 11.4, 13.5, 13.16; Phase 8): real Claude Code, the built plugin, a copy of the demo app, and STAND-INS for Linear and Sentry
 * (scripts/standins: MCP servers that are not the real services). Nothing is sent to anyone's real workspace.
 *
 *   run 1     /qa-only quick on the orders API, with the person's agreement to tickets in the prompt. The server errors the run provoked (the demo app logs its 500s for the Sentry stand-in)
 *             must be tied to findings, in the staging environment and the run's window only (a production error and yesterday's staging noise are in the stand-in and must stay out);
 *             one ticket per Critical or Important bug (masked, with a fingerprint), none for Minor, no edit of any ticket, no change in Sentry; both reports link the tickets.
 *   Linear    the harness plays a person who closes one ticket as "not a bug"; then /qa-feedback linear must record that as the person's feedback, by name, and nothing else.
 *   run 2     the same bugs are commented on, not ticketed twice; the closed ticket stays closed; the dismissed bug gets no new ticket.
 *   escaped   a ticket labelled `escaped` and a production error in the stand-in: /qa-memory-review escaped records both as escaped bugs (read only; staging noise stays out).
 *
 * Everything is checked from the files, the stand-ins' own logs and the tool-call stream, not from the agent's words. Writes docs/baselines/<label>-integrations.{json,md}.
 *
 *   node scripts/eval-integrations.ts --label phase-8 [--budget 6] [--timeout-min 30] [--claude /path/to/claude] [--keep]
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
const root = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-integr-"));

// The stand-ins for Linear and Sentry (scripts/standins: NOT the real services) and the tools a user would have allowed once. The agent reaches them as MCP tools, like any other host connector.
const sandbox = path.join(root, "standins");
fs.mkdirSync(sandbox, { recursive: true });
const F_LINEAR = path.join(sandbox, "linear.json");
const F_LINEAR_LOG = path.join(sandbox, "linear.log");
const F_EVENTS = path.join(sandbox, "sentry-events.jsonl");
const F_SENTRY_LOG = path.join(sandbox, "sentry.log");
const mcpConfig = path.join(sandbox, "mcp.json");
fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { linear: { command: process.execPath, args: [path.join(repoRoot, "scripts", "standins", "linear-standin.mjs")], env: { LINEAR_STANDIN_FILE: F_LINEAR, LINEAR_STANDIN_LOG: F_LINEAR_LOG } }, sentry: { command: process.execPath, args: [path.join(repoRoot, "scripts", "standins", "sentry-standin.mjs")], env: { SENTRY_STANDIN_EVENTS: F_EVENTS, SENTRY_STANDIN_LOG: F_SENTRY_LOG } } } }));
// resolve_issue is allowed on purpose: when the agent never calls it, that is the run's doing and the hook's (a permission prompt is not what stopped it).
const ALLOWED = ["mcp__linear__list_issues", "mcp__linear__get_issue", "mcp__linear__save_issue", "mcp__linear__save_comment", "mcp__linear__list_issue_statuses", "mcp__sentry__search_issues", "mcp__sentry__get_issue_details", "mcp__sentry__resolve_issue"].join(" ");
// The owner's own sessions (feedback, escaped bugs): the user approves the commands and the file the skill asks for.
const OWNER_ALLOWED = `${ALLOWED} Bash(qamind *) Write Read`;

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
  const child = spawn(process.execPath, ["server.mjs"], { cwd: w.ws, stdio: "ignore", env: { ...process.env, DEMO_ERROR_LOG: path.join(sandbox, "sentry-events.jsonl"), DEMO_ENVIRONMENT: "staging" } });
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

function runTurn(w: Workspace, prompt: string, allowed = ALLOWED): Promise<Turn> {
  return new Promise((resolve) => {
    const env = { ...process.env, QAMIND_HOME: w.home, ENABLE_CLAUDEAI_MCP_SERVERS: "false", ...(values["browsers-path"] ? { PLAYWRIGHT_BROWSERS_PATH: path.resolve(values["browsers-path"] as string) } : {}) } as NodeJS.ProcessEnv;
    for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "QAMIND_AUTO", "NODE_TEST_CONTEXT"]) delete env[k];
    const args = ["-p", prompt, "--session-id", crypto.randomUUID(), "--plugin-dir", plugin, "--mcp-config", mcpConfig, "--allowedTools", allowed, "--model", values.model as string, "--setting-sources", "project,local", "--max-budget-usd", values.budget as string, "--output-format", "stream-json", "--verbose"];
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
        const call: Call = { name: (c.name ?? "").replace("mcp__plugin_qamind_qa-memory__", "qa:").replace("mcp__plugin_qamind_browser__", "browser:").replace("mcp__linear__", "linear:").replace("mcp__sentry__", "sentry:"), input: c.input ?? {}, result: "", error: false };
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
const INTEGRATIONS = `integrations:\n  linear:\n    team: ENG\n    labels: [qamind]\n  sentry:\n    organization: acme\n    projects: [acme-api]\n    environments: [staging]\n    production_environments: [production]`;
const w = workspace("integr", `${INTEGRATIONS}\nbudget:\n  modes:\n    quick: { time_minutes: 14 }`);
let totalCost = 0;
const nowIso = (): string => new Date().toISOString();
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

async function agentRun(name: string, prompt: string, check: (cs: Call[], turn: Turn, s: Step) => void, opts: { owner?: boolean; server?: boolean } = {}): Promise<void> {
  console.log(`\n== ${name}: ${prompt}`);
  if (opts.server !== false) await startServer(w);
  const turn = await runTurn(w, prompt, opts.owner ? OWNER_ALLOWED : ALLOWED);
  if (opts.server !== false) await stopServer();
  totalCost += turn.cost;
  console.log(`  ${turn.minutes} min, $${turn.cost.toFixed(2)}, ${turn.result?.subtype ?? "no result"}${turn.timedOut ? " (TIMED OUT)" : ""}`);
  const cs = calls(turn);
  const s: Step = { name, minutes: turn.minutes, cost_usd: turn.cost, tool_calls: cs.map((c) => `${c.name}${c.name === "Bash" ? " " + String(c.input["command"] ?? "").replace(/\s+/g, " ").slice(0, 100) : ""}`).slice(0, 130), tool_errors: cs.filter((c) => c.error).map((c) => `${c.name}: ${c.result.replace(/\s+/g, " ").slice(0, 170)}`).slice(0, 14), notes: {}, problems: [] };
  if (turn.timedOut) s.problems.push("the turn timed out");
  const has = (t: string): boolean => w.passwords.some((p) => t.includes(p));
  const outside = (t: string): string => t.split(fs.realpathSync(root)).join("<tmp>").split(root).join("<tmp>");
  const viaQamind = (c: Call): boolean => c.name.startsWith("qa:") || c.name.startsWith("browser:") || (c.name === "Bash" && /\.env\.qa|(^|[\s;&|"'\/])qamind(\.mjs)?["']?\s+[a-z]/.test(outside(String(c.input["command"] ?? "")))) || (c.name === "Read" && /\.env\.qa/.test(String(c.input["file_path"] ?? "")));
  const bad = cs.filter((c) => (has(c.result) || has(JSON.stringify(c.input))) && viaQamind(c)).map((c) => `${c.name} ${String(c.input["command"] ?? "").replace(/\s+/g, " ").slice(0, 80)}`);
  if (bad.length) s.problems.push(`a fixture password reached the agent through QAMind or .env.qa: ${bad.slice(0, 3).join("; ")}`);
  s.notes["password_values_seen_in_product_source_the_agent_chose_to_read"] = cs.filter((c) => (has(c.result) || has(JSON.stringify(c.input))) && !viaQamind(c)).map((c) => `${c.name} ${outside(String(c.input["command"] ?? c.input["file_path"] ?? "")).replace(/\s+/g, " ").slice(0, 90)}`);
  // nothing from the stand-ins may carry a password either
  if (has(readText(F_LINEAR)) || has(readText(F_LINEAR_LOG))) s.problems.push("a fixture password reached the Linear stand-in");
  // What only the owner decides must never be done by a QA run.
  if (!opts.owner) {
    const forbidden = bash(cs).filter((c) => /qamind(\.mjs)?\s+(baseline\s+accept|browsers\s+install|escaped\s+(add|import)|feedback\s+(add|import|from-tracker))/.test(c));
    s.notes["owner_only_commands_tried"] = forbidden;
    if (forbidden.length) s.problems.push(`the run tried an owner-only command: ${forbidden[0]?.slice(0, 80)}`);
  }
  try {
    check(cs, turn, s);
  } catch (e) {
    s.problems.push(`the check itself failed: ${(e as Error).message}`);
  }
  s.notes["final_message"] = String(turn.result?.result ?? "").slice(0, 700);
  steps.push(s);
  console.log(`  -> ${s.problems.length === 0 ? "PASS" : "FAIL"}${s.problems.length ? `\n     ${s.problems.join("\n     ")}` : ""}`);
}
function ownerStep(name: string, f: (s: Step) => void): void {
  console.log(`\n== ${name} (the harness, as the owner or a person in Linear)`);
  const s: Step = { name, notes: {}, problems: [] };
  try {
    f(s);
  } catch (e) {
    s.problems.push((e as Error).message);
  }
  steps.push(s);
  console.log(`  -> ${s.problems.length === 0 ? "ok" : "FAIL"}${s.problems.length ? `\n     ${s.problems.join("\n     ")}` : ""}`);
}

// ---------------------------------------------------------------------------------------------- reading the world
const jsonl = (f: string): Array<Record<string, any>> => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)) : []);
interface LIssue { id: string; team: string; title: string; description: string; labels: string[]; status: string; url: string; priority: number; updatedBy?: string }
interface LDb { issues: LIssue[]; comments: Array<{ id: string; issueId: string; body: string }> }
const linear = (): LDb => readJson<LDb>(F_LINEAR) ?? { issues: [], comments: [] };
const linearCalls = (): Array<{ tool: string; args: Record<string, any> }> => jsonl(F_LINEAR_LOG).map((e) => ({ tool: e["tool"], args: e["args"] ?? {} }));
const sentryCalls = (): Array<{ tool: string; args: Record<string, any> }> => jsonl(F_SENTRY_LOG).map((e) => ({ tool: e["tool"], args: e["args"] ?? {} }));
const qamind = (...args: string[]): { code: number | null; out: string } => {
  const r = spawnSync(process.execPath, [path.join(plugin, "dist", "qamind.mjs"), ...args], { cwd: w.ws, encoding: "utf8", env: { ...process.env, QAMIND_HOME: w.home } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
interface Fnd { id: string; title: string; severity: string; area: string }
const findingsOf = (run: string): Fnd[] => readJson<Fnd[]>(path.join(run, "data", "findings.json")) ?? [];
interface TLink { issue: string; bug?: string; ticket?: string; url?: string; action: string; reason?: string }
const linksOf = (run: string): TLink[] => readJson<{ links: TLink[] }>(path.join(run, "data", "tickets.json"))?.links ?? [];
const PERSON = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

// the seed: what the error monitor already holds, and what Linear holds (nothing)
const PROD_TITLE = "TypeError: Cannot read properties of undefined (reading 'tax')";
fs.writeFileSync(F_EVENTS, [
  ...[0, 1, 2].map((i) => ({ at: ago(2 * 86_400_000 + i * 60_000), environment: "production", project: "acme-api", title: PROD_TITLE, culprit: "POST /orders" })),
  { at: ago(86_400_000), environment: "staging", project: "acme-api", title: "RangeError: old staging noise from yesterday", culprit: "GET /health" },
].map((e) => JSON.stringify(e)).join("\n") + "\n");
fs.writeFileSync(F_LINEAR, JSON.stringify({ next: 1, issues: [], comments: [] }));

const FOCUS = "/qamind:qa-only quick Focus on the orders API: the list (search and pagination with unusual values), creating an order with unusual quantities, and who may read which order. Skip the screens. I agree to Linear tickets being created for the problems that matter.";
let run1Start = "";
let ticketed: Array<{ ticket: string; bug?: string; issue: string }> = [];

// ---------------------------------------------------------------------------------------------- run 1
await agentRun("run 1: server errors tied to findings, and tickets made once", FOCUS, (cs, _turn, s) => {
  const run = runsOf(w).pop();
  if (!run) return void s.problems.push("no run folder");
  run1Start = nowIso();
  const meta = readJson<{ started: string; finished?: string; integrations?: unknown }>(path.join(run, "data", "meta.json"));
  s.notes["integrations_in_the_run_meta"] = meta?.integrations;
  const findings = findingsOf(run);
  s.notes["findings"] = findings.map((f) => `${f.id} ${f.severity}: ${f.title}`.slice(0, 110));

  // Sentry
  const sentry = readJson<{ queried?: { environments: string[]; from: string; to: string }; errors?: Array<{ id: string; title: string; events: number; relates_to: string; why: string }>; skipped?: string }>(path.join(run, "data", "sentry.json"));
  s.notes["sentry_record"] = sentry;
  if (!sentry) s.problems.push("no data/sentry.json: the agent did not read the server errors");
  else if (sentry.skipped) s.problems.push(`the agent skipped Sentry: ${sentry.skipped}`);
  else {
    if (!sentry.queried?.environments.every((e) => e.toLowerCase() === "staging")) s.problems.push(`the record says it read ${sentry.queried?.environments.join(", ")}, not only staging`);
    if ((sentry.errors ?? []).length === 0) s.problems.push("no server error was recorded, although the run provokes some (the orders list crashes on odd values)");
    if ((sentry.errors ?? []).some((e) => /old staging noise/.test(e.title))) s.problems.push("an error from yesterday (outside the run's window) is in the record");
    if ((sentry.errors ?? []).some((e) => e.title === PROD_TITLE)) s.problems.push("a production error is in the run's record");
    const tied = (sentry.errors ?? []).filter((e) => /^ISSUE-\d+$/.test(e.relates_to));
    if ((sentry.errors ?? []).length && tied.length === 0) s.problems.push("no server error was tied to a finding");
    for (const e of tied) if (!findings.some((f) => f.id === e.relates_to)) s.problems.push(`${e.id} relates to ${e.relates_to}, which is not a finding`);
  }
  const sc = sentryCalls();
  s.notes["sentry_calls"] = sc.map((c) => `${c.tool} ${JSON.stringify(c.args).slice(0, 120)}`);
  if (sc.length === 0) s.problems.push("the agent never called the Sentry tool");
  if (sc.some((c) => c.tool === "resolve_issue")) s.problems.push("the agent changed something in Sentry (resolve_issue)");
  if (sc.some((c) => /prod/i.test(JSON.stringify(c.args)))) s.problems.push("the agent read production errors inside a run");
  if (sc.some((c) => c.tool === "search_issues" && !c.args["startTime"])) s.problems.push("a Sentry search had no time window");
  const tech = readText(path.join(run, "TECHNICAL-REPORT.md"));
  if (!/## Server errors during the run \(Sentry\)/.test(tech)) s.problems.push("the technical report has no server-errors section");

  // Linear
  const db = linear();
  const lc = linearCalls();
  s.notes["linear_calls"] = lc.map((c) => `${c.tool} ${JSON.stringify(c.args).slice(0, 100)}`);
  const odd = lc.filter((c) => !["list_issues", "get_issue", "save_issue", "save_comment", "list_issue_statuses"].includes(c.tool));
  if (odd.length) s.problems.push(`unexpected Linear calls: ${odd.map((c) => c.tool).join(", ")}`);
  const edits = lc.filter((c) => c.tool === "save_issue" && c.args["id"]);
  if (edits.length) s.problems.push("the agent edited an existing ticket");
  const eligible = findings.filter((f) => f.severity === "critical" || f.severity === "important");
  const links = linksOf(run);
  s.notes["tickets_record"] = links;
  if (db.issues.length === 0) s.problems.push("no ticket was created");
  for (const i of db.issues) {
    if (i.team.toLowerCase() !== "eng") s.problems.push(`${i.id} is in team ${i.team}`);
    if (!/^\[QAMind\] /.test(i.title)) s.problems.push(`${i.id}'s title does not start with [QAMind]`);
    if (!/QAMind bug: BUG-\d+ · fingerprint: [0-9a-f]{12}/.test(i.description)) s.problems.push(`${i.id} has no fingerprint line`);
    if (PERSON.test(`${i.title}\n${i.description}`) && !/@(example\.(com|org|net)|[\w-]+\.(test|invalid))/.test(`${i.title}\n${i.description}`)) s.problems.push(`${i.id} holds an email address`);
    if (i.labels.some((l) => l !== "qamind")) s.problems.push(`${i.id} has labels the plan did not give: ${i.labels.join(", ")}`);
  }
  if (new Set(db.issues.map((i) => /fingerprint: ([0-9a-f]{12})/.exec(i.description)?.[1])).size !== db.issues.length) s.problems.push("two tickets carry the same fingerprint (a duplicate)");
  for (const f of eligible) if (!links.some((l) => l.issue === f.id)) s.problems.push(`${f.id} (${f.severity}) has no ticket and no reason in data/tickets.json`);
  if (db.issues.length > eligible.length) s.problems.push(`${db.issues.length} tickets for ${eligible.length} Critical or Important findings`);
  for (const f of findings.filter((x) => x.severity === "minor")) if (links.some((l) => l.issue === f.id)) s.problems.push(`${f.id} is Minor and has a ticket`);
  const admin = readText(path.join(run, "ADMIN-REPORT.md"));
  if (!/## Tickets/.test(tech) || !/\[ENG-\d+\]\(https:\/\/linear\.app\//.test(tech)) s.problems.push("the technical report does not link the tickets");
  if (!/\[open the ticket\]\(https:\/\/linear\.app\//.test(admin) || !/## Tickets and error monitoring/.test(admin)) s.problems.push("the admin report does not link the tickets in plain words");
  const map = readJson<{ tickets: Array<{ bug: string; ticket: string }> }>(path.join(storeOf(w), "memory", "tickets.json"));
  s.notes["memory_ticket_map"] = map?.tickets;
  if ((map?.tickets.length ?? 0) !== links.filter((l) => l.ticket).length) s.problems.push("memory does not know every ticket the run recorded");
  ticketed = links.filter((l) => l.ticket).map((l) => ({ ticket: l.ticket as string, ...(l.bug ? { bug: l.bug } : {}), issue: l.issue }));
});

// ---------------------------------------------------------------------------------------------- a person decides in Linear
let decidedBug: string | undefined;
let decidedTicket: string | undefined;
ownerStep("a person closes one ticket in Linear as not a bug", (s) => {
  if (ticketed.length === 0) throw new Error("run 1 made no ticket to decide on");
  const db = linear();
  const pick = ticketed[0] as { ticket: string; bug?: string };
  decidedTicket = pick.ticket;
  decidedBug = pick.bug;
  const issue = db.issues.find((i) => i.id === pick.ticket);
  if (!issue) throw new Error(`${pick.ticket} is not in the Linear stand-in`);
  issue.status = "Canceled";
  issue.labels = [...issue.labels, "Not a bug"];
  issue.updatedBy = "Pat Quinn";
  db.comments.push({ id: `c-pat`, issueId: issue.id, body: "Works as designed: the product owner confirmed this is the intended behaviour." });
  fs.writeFileSync(F_LINEAR, JSON.stringify(db, null, 2));
  s.notes["closed"] = { ticket: pick.ticket, bug: pick.bug, by: "Pat Quinn", as: "Canceled, label Not a bug" };
});

await agentRun("the owner asks QAMind to read what people decided in Linear", "/qamind:qa-feedback linear I am the owner. Record what people decided in the tickets, where they closed one as not a bug or won't fix. Yes, record those.", (cs, _turn, s) => {
  const fb = readJsonl(path.join(storeOf(w), "memory", "feedback.jsonl"));
  s.notes["feedback_records"] = fb.map((f) => ({ bug: f.bug, verdict: f.verdict, by: f.by, via: f.via, note: f.note }));
  if (!decidedBug) return void s.problems.push("no bug to look for");
  const mine = fb.filter((f) => f.bug === decidedBug);
  if (mine.length !== 1) s.problems.push(`${mine.length} feedback record(s) for ${decidedBug}, expected 1`);
  else {
    if (mine[0]?.verdict !== "not-a-bug" || mine[0]?.by !== "Pat Quinn" || mine[0]?.via !== "tracker") s.problems.push(`the record is ${JSON.stringify({ verdict: mine[0]?.verdict, by: mine[0]?.by, via: mine[0]?.via })}, expected not-a-bug by Pat Quinn via tracker`);
    if (!new RegExp(decidedTicket as string).test(String(mine[0]?.note ?? ""))) s.problems.push("the note does not name the ticket");
  }
  if (fb.filter((f) => f.bug !== decidedBug).length) s.problems.push("feedback was recorded for a ticket nobody decided on");
  const bug = readJsonl(path.join(storeOf(w), "memory", "bugs.jsonl")).find((b) => b.id === decidedBug);
  if (bug?.status !== "not-a-bug") s.problems.push(`the bug's status is ${bug?.status}, expected not-a-bug`);
  if (cs.some((c) => c.name === "linear:save_issue" || c.name === "linear:save_comment")) s.problems.push("the agent wrote to Linear while only reading decisions");
}, { owner: true, server: false });

// ---------------------------------------------------------------------------------------------- run 2
const ticketsBefore = linear().issues.length;
const commentsBefore = linear().comments.length;
await agentRun("run 2: the same bugs are updated, not ticketed again, and the dismissed one is not reported", FOCUS, (cs, _turn, s) => {
  const runs = runsOf(w);
  const run = runs.pop();
  if (!run || runs.length < 1) return void s.problems.push("no second run folder");
  const db = linear();
  const findings = findingsOf(run);
  const links = linksOf(run);
  s.notes["findings"] = findings.map((f) => `${f.id} ${f.severity}: ${f.title}`.slice(0, 110));
  s.notes["tickets_record"] = links;
  s.notes["linear_issues_now"] = db.issues.map((i) => `${i.id} ${i.status}: ${i.title}`.slice(0, 100));
  const fps = db.issues.map((i) => /fingerprint: ([0-9a-f]{12})/.exec(i.description)?.[1]);
  if (new Set(fps).size !== fps.length) s.problems.push("two tickets carry the same fingerprint (a bug was ticketed twice)");
  const updated = links.filter((l) => l.action === "updated" || l.action === "existing");
  if (updated.length === 0) s.problems.push("no existing ticket was updated: the bugs found again should have been");
  const newOnes = db.issues.length - ticketsBefore;
  s.notes["new_tickets_this_run"] = newOnes;
  const comments = db.comments.length - commentsBefore;
  if (updated.length && comments < updated.filter((l) => l.action === "updated").length) s.problems.push("a ticket recorded as updated has no new comment");
  // the dismissed bug: not reported again, no ticket made for it
  if (decidedBug) {
    const again = findings.filter((f) => links.some((l) => l.issue === f.id && l.bug === decidedBug));
    const sameTicket = db.issues.filter((i) => i.id === decidedTicket);
    if (again.length) s.notes["the_dismissed_bug_was_reported_again_as"] = again.map((f) => f.id);
    if (db.issues.filter((i) => i.title === sameTicket[0]?.title).length > 1) s.problems.push("a second ticket was opened for the bug a person closed as not a bug");
  }
  for (const c of linearCalls().slice(-60)) if (c.tool === "save_issue" && c.args["id"]) s.problems.push("the agent edited an existing ticket");
  const closed = db.issues.find((i) => i.id === decidedTicket);
  if (closed && closed.status !== "Canceled") s.problems.push("the closed ticket was reopened");
  const tech = readText(path.join(run, "TECHNICAL-REPORT.md"));
  if (!/## Server errors during the run \(Sentry\)/.test(tech)) s.problems.push("run 2's technical report has no server-errors section");
  if (sentryCalls().some((c) => c.tool === "resolve_issue" || /prod/i.test(JSON.stringify(c.args)))) s.problems.push("run 2 changed Sentry or read production");
}, {});

// ---------------------------------------------------------------------------------------------- bugs that reached production
const writesBefore = (): number => linearCalls().filter((c) => c.tool === "save_issue" || c.tool === "save_comment").length;
let linearWrites = 0;
let escapedTicket = "";
ownerStep("a person labels a Linear ticket `escaped` (a bug that reached production)", (s) => {
  const db = linear();
  const n = Math.max(0, ...db.issues.map((i) => Number(i.id.split("-")[1]))) + 1;
  escapedTicket = `ENG-${n}`;
  db.issues.push({ id: escapedTicket, team: "ENG", title: "Invoice totals are wrong for orders with a discount, reported by two customers", description: "Reported in production by support.", labels: ["escaped", "Bug"], status: "Todo", url: `https://linear.app/acme/issue/${escapedTicket}/invoice-totals`, priority: 2, updatedBy: "Sam Lee" });
  (db as unknown as { next: number }).next = n + 1;
  fs.writeFileSync(F_LINEAR, JSON.stringify(db, null, 2));
  linearWrites = writesBefore();
  s.notes["ticket"] = escapedTicket;
});

await agentRun("the owner asks QAMind to look for bugs that reached production", "/qamind:qa-memory-review escaped I am the owner. Look in the error monitor's production errors and in the tickets labelled escaped, and record what you find: yes to all you propose.", (cs, _turn, s) => {
  const store = storeOf(w);
  const metrics = readJson<{ escaped: Array<{ id: string; area: string; title: string; source: string; ref?: string; verdict: string; severity: string }> }>(path.join(store, "memory", "metrics.json"));
  const esc = metrics?.escaped ?? [];
  s.notes["escaped_recorded"] = esc.map((e) => ({ id: e.id, source: e.source, ref: e.ref, area: e.area, severity: e.severity, verdict: e.verdict, title: e.title.slice(0, 90) }));
  const fromSentry = esc.filter((e) => e.source === "sentry");
  const fromTicket = esc.filter((e) => e.source === "ticket");
  if (fromSentry.length !== 1 || !/TypeError/.test(fromSentry[0]?.title ?? "")) s.problems.push(`expected the one production error (the TypeError) recorded from Sentry, got ${JSON.stringify(fromSentry.map((e) => e.title))}`);
  if (!fromTicket.some((e) => e.ref === escapedTicket)) s.problems.push(`the ticket ${escapedTicket} labelled escaped was not recorded`);
  if (esc.some((e) => /old staging noise/.test(e.title))) s.problems.push("a staging error was recorded as an escaped bug");
  if (esc.some((e) => PERSON.test(`${e.title} ${e.area}`) )) s.problems.push("an escaped bug holds an email address");
  const sc = sentryCalls().filter((c) => c.tool === "search_issues");
  s.notes["sentry_calls_this_step"] = sc.map((c) => JSON.stringify(c.args).slice(0, 140)).slice(-4);
  if (!sc.some((c) => String(c.args["environment"] ?? "").toLowerCase() === "production")) s.problems.push("the agent never read the production environment");
  if (sentryCalls().some((c) => c.tool === "resolve_issue")) s.problems.push("the agent changed something in Sentry");
  if (writesBefore() !== linearWrites) s.problems.push("the agent wrote to Linear while only looking for escaped bugs");
  const risk = readJson<{ areas: Array<{ area: string; events: Array<{ source?: string }> }> }>(path.join(store, "memory", "risk-areas.json"));
  const raised = (risk?.areas ?? []).filter((a) => a.events.some((e) => e.source === "escaped")).map((a) => a.area);
  s.notes["risk_raised_for"] = raised;
  if (raised.length < esc.length && raised.length === 0) s.problems.push("no area's risk was raised");
}, { owner: true, server: false });

// ---------------------------------------------------------------------------------------------- the record
const out = path.join(repoRoot, "docs", "baselines", `${label}-integrations`);
const scrub = (t: string): string => t.split(fs.realpathSync(root)).join("<tmp>").split(root).join("<tmp>").split(os.homedir()).join("~").replace(/\/(?:private\/)?var\/folders\/[^"\s']*/g, "<tmp>");
const passed = steps.every((s) => s.problems.length === 0);
const summary = { label, date: new Date().toISOString(), model: values.model, claude: spawnSync(claude, ["--version"], { encoding: "utf8" }).stdout.trim(), total_cost_usd: Math.round(totalCost * 100) / 100, steps, passed };
fs.writeFileSync(`${out}.json`, scrub(JSON.stringify(summary, null, 2)) + "\n");
fs.writeFileSync(`${out}.md`, scrub(["# Linear and Sentry, end to end: " + label, "", `${summary.date}, ${summary.model}, Claude Code ${summary.claude}. Real Claude Code, the built plugin, a copy of the demo app, and **stand-ins** for Linear and Sentry (scripts/standins: not the real services; the Linear stand-in takes the arguments of the real Linear tools, the Sentry one has tool names of its own). Total cost $${summary.total_cost_usd}.`, "", "| Step | Minutes | Cost | Result |", "|------|---------|------|--------|", ...steps.map((s) => `| ${s.name} | ${s.minutes ?? "-"} | ${s.cost_usd !== undefined ? `$${s.cost_usd.toFixed(2)}` : "-"} | ${s.problems.length ? "FAIL: " + s.problems.join("; ") : "pass"} |`), "", ...steps.flatMap((s) => [`## ${s.name}`, "", "```json", JSON.stringify(s.notes, null, 2), "```", ""])].join("\n")));
console.log(`\nSaved ${path.relative(repoRoot, out)}.{json,md}; total cost $${summary.total_cost_usd}; ${passed ? "ALL PASSED" : "FAILURES"}`);
if (!values.keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Workspace kept at ${root}`);
process.exit(passed ? 0 : 1);
