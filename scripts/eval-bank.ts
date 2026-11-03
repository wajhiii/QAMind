/**
 * The test bank, bug lifecycle and feedback end-to-end test (spec section 14, Phase 7.7): real Claude Code, the built plugin, ONE copy of the demo app that is changed between runs, a scratch QAMIND_HOME.
 *
 *   run 1   /qa-only quick on the orders API: it finds problems and saves checks to the bank (one protects the page_size=0 bug).
 *   then    the harness plays the owner: it gives feedback on three of run 1's findings (not a bug, won't fix, wrong severity) and FIXES the page_size bug in the demo app's source.
 *   run 2   the bank must run first, before any exploring; the fixed bug must be proved fixed by its saved test (no re-check from the agent); the feedback must show in what the agent was given and in the reports.
 *   then    the harness puts the bug back.
 *   run 3   the saved test fails, the agent accounts for it, and the report says the bug CAME BACK (first, and in the 30-second summary).
 *
 * Everything is checked from the files, the store and the tool-call stream, not from the agent's words. Writes docs/baselines/<label>-bank.{json,md}.
 *
 *   node scripts/eval-bank.ts --label phase-7.7 [--budget 6] [--timeout-min 25] [--claude /path/to/claude] [--keep]
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
  options: { label: { type: "string" }, only: { type: "string" }, budget: { type: "string", default: "6" }, "timeout-min": { type: "string", default: "25" }, claude: { type: "string" }, model: { type: "string", default: "claude-sonnet-5-5" }, keep: { type: "boolean", default: false } },
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
const root = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-reliability-"));

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
const stopServer = async (): Promise<void> => {
  server?.kill();
  server = undefined;
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
    const env = { ...process.env, QAMIND_HOME: w.home, ENABLE_CLAUDEAI_MCP_SERVERS: "false" } as NodeJS.ProcessEnv;
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
const storeOf = (w: Workspace): string => {
  const p = path.join(w.home, "projects");
  return path.join(p, fs.readdirSync(p)[0] as string);
};
const readJsonl = (f: string): Array<Record<string, any>> => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("{") && !l.includes('"_meta"')).map((l) => JSON.parse(l)) : []);
const readText = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
const qamind = (w: Workspace, ...args: string[]): { code: number | null; out: string } => {
  const r = spawnSync(process.execPath, [path.join(plugin, "dist", "qamind.mjs"), ...args], { cwd: w.ws, encoding: "utf8", env: { ...process.env, QAMIND_HOME: w.home } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

/** Where in the tool-call stream the bank first ran, and where exploring first began. */
function order(cs: Call[]): { health: number; bank: number; explore: number } {
  const idx = (f: (c: Call) => boolean): number => cs.findIndex(f);
  const isBash = (c: Call, re: RegExp): boolean => c.name === "Bash" && re.test(String(c.input["command"] ?? ""));
  return {
    health: idx((c) => isBash(c, /qamind health\b/)),
    bank: idx((c) => isBash(c, /qamind tests run\b/)),
    explore: idx((c) => c.name.startsWith("browser:") || isBash(c, /qamind api (run|plan|inventory)\b/)),
  };
}

const DEMO_FILE = "src/api.mjs";
/**
 * The seeded bug "500 on edge input in search and pagination" has two halves (page_size=0 and a search text that is not a valid pattern). An agent may report them as one finding or as two,
 * and a saved test may cover both, so both halves are fixed together and put back together: the test then passes or fails the same way however the agent grouped them.
 */
const HALVES: Array<[buggy: string, fixed: string]> = [
  ["pageSize > 100", "pageSize < 1 || pageSize > 100"],
  ["new RegExp(q, 'i')", "new RegExp(q.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i')"],
];
const patch = (w: Workspace, fixed: boolean): void => {
  const f = path.join(w.ws, DEMO_FILE);
  let src = fs.readFileSync(f, "utf8");
  for (const [buggy, good] of HALVES) {
    const [from, to] = fixed ? [buggy, good] : [good, buggy];
    if (!src.includes(from)) throw new Error(`The demo app's ${DEMO_FILE} no longer has the line this test changes (${from}).`);
    src = src.replace(from, () => to);
  }
  fs.writeFileSync(f, src);
};

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
const w = workspace("bank");
let totalCost = 0;

async function agentRun(name: string, prompt: string, check: (cs: Call[], turn: Turn, s: Step) => void): Promise<void> {
  console.log(`\n== ${name}: ${prompt}`);
  await startServer(w);
  const turn = await runTurn(w, prompt);
  await stopServer();
  totalCost += turn.cost;
  console.log(`  ${turn.minutes} min, $${turn.cost.toFixed(2)}, ${turn.result?.subtype ?? "no result"}${turn.timedOut ? " (TIMED OUT)" : ""}`);
  const cs = calls(turn);
  const s: Step = { name, minutes: turn.minutes, cost_usd: turn.cost, tool_calls: cs.map((c) => `${c.name}${c.name === "Bash" ? " " + String(c.input["command"] ?? "").replace(/\s+/g, " ").slice(0, 90) : ""}`).slice(0, 110), tool_errors: cs.filter((c) => c.error).map((c) => `${c.name}: ${c.result.replace(/\s+/g, " ").slice(0, 170)}`).slice(0, 12), notes: {}, problems: [] };
  if (turn.timedOut) s.problems.push("the turn timed out");
  // Where a password showed up matters. Through QAMind (its tools, .env.qa, the browser tool), in the agent's own words, or in a file QAMind controls: a violation.
  // In a file of the product's own source that the agent chose to read (the demo app's seed data holds the same logins in plain text): not a leak by QAMind, but noted.
  const has = (t: string): boolean => w.passwords.some((p) => t.includes(p));
  const reaching = cs.filter((c) => has(c.result) || has(JSON.stringify(c.input)));
  const viaQamind = (c: Call): boolean => c.name.startsWith("qa:") || c.name.startsWith("browser:") || (c.name === "Bash" && /\.env\.qa|\bqamind\b/.test(String(c.input["command"] ?? ""))) || (c.name === "Read" && /\.env\.qa/.test(String(c.input["file_path"] ?? "")));
  const sayings = turn.events.filter((e) => e.type === "assistant").flatMap((e) => (e.message?.content ?? []).filter((b) => b.type === "text")).map((b) => JSON.stringify(b));
  const bad = reaching.filter(viaQamind).map((c) => `${c.name} ${String(c.input["command"] ?? c.input["file_path"] ?? "").replace(/\s+/g, " ").slice(0, 80)}`);
  if (bad.length) s.problems.push(`a fixture password reached the agent through QAMind or .env.qa: ${bad.slice(0, 3).join("; ")}`);
  if (sayings.some(has)) s.problems.push("a fixture password appears in the agent's own words");
  const inProduct = reaching.filter((c) => !viaQamind(c)).map((c) => `${c.name} ${String(c.input["command"] ?? c.input["file_path"] ?? "").replace(/\s+/g, " ").replace(/\/(?:private\/)?var\/folders\/[^ ]*?\/ws\//g, "").slice(0, 90)}`);
  s.notes["password_values_seen_in_product_source_the_agent_chose_to_read"] = inProduct;
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(json|jsonl|md|txt|log|csv|html|ts|js|mjs)$/i.test(e.name) && has(fs.readFileSync(f, "utf8"))) files.push(path.relative(root, f));
    }
  };
  walk(w.home);
  walk(path.join(w.ws, ".qa"));
  if (files.length) s.problems.push(`a fixture password is in a file QAMind controls: ${files.slice(0, 3).join(", ")}`);
  try {
    check(cs, turn, s);
  } catch (e) {
    s.problems.push(`the check itself failed: ${(e as Error).message}`);
  }
  s.notes["final_message"] = String(turn.result?.result ?? "").slice(0, 500);
  steps.push(s);
  console.log(`  -> ${s.problems.length === 0 ? "PASS" : "FAIL"}${s.problems.length ? `\n     ${s.problems.join("\n     ")}` : ""}`);
}

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

let pageSizeBug = "";
let feedbackGiven: Array<{ bug: string; verdict: string; title: string }> = [];

// ---------------------------------------------------------------------------------------------- run 1
await agentRun("run 1: find, and save checks", "/qamind:qa-only quick Focus on the orders API: the list (search and pagination with unusual values), creating an order with unusual quantities, and who may read which order. Skip the screens.", (cs, turn, s) => {
  const run = runsOf(w).pop();
  if (!run) return void s.problems.push("no run folder");
  const store = storeOf(w);
  const summary = readJson<{ findings: Array<{ id: string; title: string; severity: string; bug?: string }>; lifecycle?: Record<string, number>; stop_reason: string }>(path.join(store, "memory", "runs", `${path.basename(run)}.json`));
  if (!summary) return void s.problems.push("the run never finished (no run summary)");
  s.notes["findings"] = summary.findings.map((f) => `${f.id} ${f.severity} ${f.bug ?? "-"} ${f.title}`);
  s.notes["lifecycle"] = summary.lifecycle;
  if (summary.findings.length === 0) s.problems.push("no findings, so there is nothing to protect or to give feedback on");
  if (summary.findings.some((f) => !f.bug)) s.problems.push("a finding has no bug id in the run summary");
  const bank = readJsonl(path.join(store, "test-bank", "bank.jsonl"));
  s.notes["bank"] = bank.map((t) => `${t.id} ${t.kind} ${t.protects_bug ?? "-"} ${t.title}`);
  if (bank.length === 0) s.problems.push("no test was saved to the bank");
  if (bank.some((t) => !t.card?.protects || !t.card?.fails_when || !t.card?.not_duplicate)) s.problems.push("a saved test has no complete value card");
  if (JSON.stringify(bank).includes("pw-")) s.problems.push("a password-like value is in a saved test");
  const target = bank.find((t) => t.protects_bug && /page[_ ]?size/i.test(`${t.title} ${JSON.stringify(t.plan ?? "")}`));
  if (!target) s.problems.push("no saved test protects the page_size bug (it is the bug this test fixes and reintroduces)");
  else pageSizeBug = target.protects_bug as string;
  s.notes["page_size_bug"] = pageSizeBug;
  const saves = cs.filter((c) => c.name === "qa:bank_save_test");
  s.notes["bank_save_calls"] = saves.map((c) => (c.error ? "refused: " : "") + c.result.slice(0, 120));
  const first = readJson<unknown[]>(path.join(run, "data", "bank-results.json"));
  s.notes["bank_ran_in_run_1"] = !!first;
});

// ---------------------------------------------------------------------------------------------- the owner
ownerStep("feedback on run 1 and the fix", (s) => {
  const store = storeOf(w);
  const run = runsOf(w).pop() as string;
  const summary = readJson<{ findings: Array<{ id: string; title: string; severity: string; bug?: string }> }>(path.join(store, "memory", "runs", `${path.basename(run)}.json`));
  if (!summary || !pageSizeBug) throw new Error("run 1 did not give what is needed (no summary or no protected bug)");
  const rest = summary.findings.filter((f) => f.bug !== pageSizeBug).sort((a, b) => ["minor", "important", "critical"].indexOf(a.severity) - ["minor", "important", "critical"].indexOf(b.severity));
  const plan: Array<[string, string[]]> = [];
  if (rest[0]) plan.push([rest[0].id, ["not-a-bug", "--note", "This is how the product is meant to behave."]]);
  if (rest[1]) plan.push([rest[1].id, ["wont-fix", "--note", "Known, and planned for the rewrite next year."]]);
  if (rest[2]) plan.push([rest[2].id, ["wrong-severity", rest[2].severity === "minor" ? "important" : "minor", "--note", "Staff only see this page."]]);
  feedbackGiven = [];
  for (const [issue, rest2] of plan) {
    const f = summary.findings.find((x) => x.id === issue) as { title: string; bug?: string };
    const args = ["feedback", "add", issue, ...(rest2[0] === "wrong-severity" ? ["wrong-severity", rest2[1] as string, ...rest2.slice(2)] : rest2), "--by", "Pat Quinn"];
    const r = qamind(w, ...args);
    if (r.code !== 0) throw new Error(`feedback add ${issue} failed: ${r.out.slice(0, 200)}`);
    feedbackGiven.push({ bug: f.bug as string, verdict: rest2[0] as string, title: f.title });
  }
  s.notes["feedback_given"] = feedbackGiven;
  if (feedbackGiven.length < 2) s.problems.push(`only ${feedbackGiven.length} other finding(s) in run 1 to give feedback on`);
  patch(w, true);
  execFileSync("git", ["-C", w.ws, "commit", "-qam", "validate page_size"], { stdio: "ignore" });
  s.notes["fixed_in_demo_app"] = `${DEMO_FILE}: both halves of the seeded search and pagination bug`;
});

// ---------------------------------------------------------------------------------------------- run 2
await agentRun("run 2: the bank first, the bug fixed, the feedback honoured", "/qamind:qa-only quick", (cs, turn, s) => {
  const run = runsOf(w).pop();
  if (!run) return void s.problems.push("no run folder");
  const store = storeOf(w);
  const o = order(cs);
  s.notes["order"] = o;
  if (o.bank < 0) s.problems.push("the agent never ran the test bank");
  else {
    if (o.health >= 0 && o.bank < o.health) s.problems.push("the bank ran before the health check");
    if (o.explore >= 0 && o.bank > o.explore) s.problems.push("the agent started exploring before it ran the bank");
  }
  const results = readJson<{ passed: number; failed: number; total: number; covered_areas: string[]; results: Array<{ test: string; bug?: string; status: string }> }>(path.join(run, "data", "bank-results.json"));
  s.notes["bank_results"] = results ? { total: results.total, passed: results.passed, failed: results.failed, covered_areas: results.covered_areas } : "none";
  if (!results) return void s.problems.push("no bank results in the run folder");
  if (!results.results.some((r) => r.bug === pageSizeBug && (r.status === "passed" || r.status === "flaky-passed"))) s.problems.push("the test that protects the page_size bug did not pass after the fix");
  const life = readJson<{ fixed: Array<{ bug: string; source: string }>; findings: Array<{ bug: string; status: string }> }>(path.join(run, "data", "lifecycle.json"));
  s.notes["lifecycle"] = life ? { fixed: life.fixed, findings: life.findings.map((f) => `${f.bug} ${f.status}`) } : "none";
  const fixedBug = life?.fixed.find((f) => f.bug === pageSizeBug);
  if (!fixedBug) s.problems.push("the page_size bug is not shown as fixed");
  else if (fixedBug.source !== "bank-test") s.problems.push(`it was proved fixed by "${fixedBug.source}", not by its saved test`);
  const rechecks = readJson<Array<{ bug: string }>>(path.join(run, "data", "rechecks.json")) ?? [];
  s.notes["agent_rechecks"] = rechecks.map((r) => r.bug);
  const admin = readText(path.join(run, "ADMIN-REPORT.md"));
  if (!/## Fixed since the last check/.test(admin)) s.problems.push("the admin report has no 'Fixed since the last check' section");
  // feedback: given to the agent, and honoured by the reports
  const ctx = cs.find((c) => c.name === "qa:memory_get_context");
  s.notes["agent_was_told_who_gave_feedback"] = !!ctx && ctx.result.includes("Pat Quinn");
  if (!ctx?.result.includes("Pat Quinn")) s.problems.push("the memory context did not tell the agent who gave the feedback");
  const dismissed = feedbackGiven.find((f) => f.verdict === "not-a-bug");
  const accepted = feedbackGiven.find((f) => f.verdict === "wont-fix");
  const resev = feedbackGiven.find((f) => f.verdict === "wrong-severity");
  if (!life) return;
  if (life.findings.some((f) => f.status === "not-a-bug")) s.problems.push("a finding the owner said is not a bug was reported again");
  const known = readJson<Array<{ bug?: string; title: string }>>(path.join(run, "data", "known-accepted.json")) ?? [];
  s.notes["found_again_and_listed_as_known"] = known.map((k) => `${k.bug} ${k.title}`);
  if (accepted && life.findings.some((f) => f.bug === accepted.bug && f.status !== "accepted")) s.problems.push("a won't-fix problem is counted as a finding again");
  const findings = readJson<Array<{ id?: string; bug?: string; severity: string; severity_assessed?: string; severity_note?: string }>>(path.join(run, "data", "findings.json")) ?? [];
  // The owner's severity: shown by QAMind when the agent judged differently (a note says who set it), or simply followed by the agent, which was told who set it.
  const override = resev ? (readJsonl(path.join(store, "memory", "bugs.jsonl")).find((b) => b.id === resev.bug)?.severity_override as { level: string } | undefined) : undefined;
  const issueOfBug = resev ? life.findings.find((f) => f.bug === resev.bug) : undefined;
  const refound = issueOfBug ? findings.find((f) => f.id === (issueOfBug as unknown as { issue: string }).issue) : undefined;
  s.notes["wrong_severity"] = resev ? { owner_level: override?.level, refound_in_this_run: !!refound, shown_as: refound?.severity, agent_assessed: refound?.severity_assessed ?? refound?.severity, severity_note_added_by_qamind: !!refound?.severity_note } : "not given";
  if (refound && override && refound.severity !== override.level) s.problems.push(`the owner set ${resev?.bug} to ${override.level} but this run shows it as ${refound.severity}`);
  s.notes["feedback_effects_seen_in_run"] = { not_a_bug_refound: !!dismissed && life.findings.some((f) => f.bug === dismissed.bug), wont_fix_listed_as_known: known.length, wrong_severity_refound: !!refound };
  // "explores elsewhere": at least one charter is about something other than what the bank passed
  const charters = readJson<Array<{ title: string; goal: string }>>(path.join(run, "data", "charters.json")) ?? [];
  s.notes["charters"] = charters.map((c) => c.title);
  const covered = (results.covered_areas ?? []).map((a) => a.toLowerCase());
  const elsewhere = charters.filter((c) => !covered.some((a) => a.length > 3 && `${c.title} ${c.goal}`.toLowerCase().includes(a)));
  if (charters.length > 0 && elsewhere.length === 0) s.problems.push("every charter is about an area the bank already covers and passed");
  s.notes["charters_elsewhere"] = elsewhere.length;
  if (!readJson(path.join(store, "memory", "runs", `${path.basename(run)}.json`))) s.problems.push("the run never finished");
});

// ---------------------------------------------------------------------------------------------- the owner puts the bug back
ownerStep("the bug is reintroduced", (s) => {
  patch(w, false);
  execFileSync("git", ["-C", w.ws, "commit", "-qam", "back to the old page_size check"], { stdio: "ignore" });
  s.notes["demo_app"] = `${DEMO_FILE}: both halves put back`;
});

// ---------------------------------------------------------------------------------------------- run 3
await agentRun("run 3: the bug is back", "/qamind:qa-only quick", (cs, turn, s) => {
  const run = runsOf(w).pop();
  if (!run) return void s.problems.push("no run folder");
  const store = storeOf(w);
  const o = order(cs);
  s.notes["order"] = o;
  if (o.bank < 0) s.problems.push("the agent never ran the test bank");
  else if (o.explore >= 0 && o.bank > o.explore) s.problems.push("the agent started exploring before it ran the bank");
  const results = readJson<{ results: Array<{ test: string; bug?: string; status: string; detail?: string }> }>(path.join(run, "data", "bank-results.json"));
  const mine = results?.results.find((r) => r.bug === pageSizeBug);
  s.notes["protecting_test"] = mine ? `${mine.test} ${mine.status}` : "none";
  if (mine?.status !== "failed") s.problems.push(`the test that protects the page_size bug is "${mine?.status}", expected failed`);
  const life = readJson<{ findings: Array<{ issue: string; bug: string; status: string; fixed_on?: string }> }>(path.join(run, "data", "lifecycle.json"));
  s.notes["lifecycle"] = life?.findings.map((f) => `${f.issue} ${f.bug} ${f.status}`);
  const back = life?.findings.find((f) => f.bug === pageSizeBug);
  if (back?.status !== "regressed") s.problems.push(`the page_size bug is "${back?.status ?? "not reported"}", expected regressed (came back)`);
  const findings = readJson<Array<{ id: string; bug?: string; bank_tests?: string[] }>>(path.join(run, "data", "findings.json")) ?? [];
  s.notes["finding_names_the_test"] = !!findings.find((f) => f.id === back?.issue)?.bank_tests?.length;
  const admin = readText(path.join(run, "ADMIN-REPORT.md"));
  const tech = readText(path.join(run, "TECHNICAL-REPORT.md"));
  const summaryLines = admin.split("\n").filter((l) => l.startsWith("> - "));
  if (!summaryLines.some((l) => /came back after being fixed/.test(l))) s.problems.push("the 30-second summary does not say a problem came back");
  if (!/\*\*History:\*\* Came back:/.test(admin)) s.problems.push("the admin report does not mark the problem as having come back");
  if (!/## ⚠️ Came back/.test(tech) || !/\*\*Bug:\*\* BUG-\d+ · \*\*Came back\*\*/.test(tech)) s.problems.push("the technical report does not mark the problem as having come back");
  const firstProblem = /^### (🔴|🟠|🟡) [A-Za-z]+: (.*)$/m.exec(admin)?.[2] ?? "";
  s.notes["first_problem_in_admin_report"] = firstProblem;
  const lintOk = readJson<{ errors?: string[] }>(path.join(run, "data", "lint.json"));
  void lintOk;
  if (!readJson(path.join(store, "memory", "runs", `${path.basename(run)}.json`))) s.problems.push("the run never finished");
  const bug = readJsonl(path.join(store, "memory", "bugs.jsonl")).find((b) => b.id === pageSizeBug);
  s.notes["bug_history"] = (bug?.history ?? []).map((h: { event: string }) => h.event);
  if (bug?.status !== "regressed") s.problems.push(`memory says the bug is "${bug?.status}"`);
});

// ---------------------------------------------------------------------------------------------- the record
const out = path.join(repoRoot, "docs", "baselines", `${label}-bank`);
const scrub = (t: string): string => t.split(fs.realpathSync(root)).join("<tmp>").split(root).join("<tmp>").split(os.homedir()).join("~").replace(/\/(?:private\/)?var\/folders\/[^"\s']*/g, "<tmp>");
const passed = steps.every((s) => s.problems.length === 0);
const summary = { label, date: new Date().toISOString(), model: values.model, claude: spawnSync(claude, ["--version"], { encoding: "utf8" }).stdout.trim(), total_cost_usd: Math.round(totalCost * 100) / 100, steps, passed };
fs.writeFileSync(`${out}.json`, scrub(JSON.stringify(summary, null, 2)) + "\n");
fs.writeFileSync(
  `${out}.md`,
  scrub(["# Test bank, bug lifecycle and feedback, end to end: " + label, "", `${summary.date}, ${summary.model}, Claude Code ${summary.claude}. Real Claude Code, the built plugin, one copy of the demo app changed between runs. Total cost $${summary.total_cost_usd}.`, "", "| Step | Minutes | Cost | Result |", "|------|---------|------|--------|", ...steps.map((s) => `| ${s.name} | ${s.minutes ?? "-"} | ${s.cost_usd !== undefined ? `$${s.cost_usd.toFixed(2)}` : "-"} | ${s.problems.length ? "FAIL: " + s.problems.join("; ") : "pass"} |`), ""].join("\n")),
);
console.log(`\nSaved ${path.relative(repoRoot, out)}.{json,md}; total cost $${summary.total_cost_usd}; ${passed ? "ALL PASSED" : "FAILURES"}`);
if (!values.keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Workspace kept at ${root}`);
process.exit(passed ? 0 : 1);
