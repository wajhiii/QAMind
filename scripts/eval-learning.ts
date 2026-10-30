/**
 * The learning test (spec section 14): run /qa-only twice on the demo app against the SAME project memory and check that the second run
 *   1. applies memory (loads it, cites real learnings),
 *   2. skips a known false alarm,
 *   3. reports what changed since the last run (new page, new endpoint, removed endpoint), and
 *   4. is not slower to reach the critical flows,
 * while still finding the bugs, leaking no secrets, and keeping its reports consistent.
 *
 *   node scripts/eval-learning.ts --label phase-4 [--seq 1] [--mode full] [--budget 15] [--timeout-min 40] [--claude /path/to/claude]
 *
 * Between the runs it changes ITS COPY of the demo app (never the repo's): adds a Help page and a GET /api/help endpoint and drops
 * POST /api/auth/reset-password from the OpenAPI spec, resets the data, and seeds an owner-confirmed false alarm taken from run 1's own
 * lowest-severity finding (the owner saying "that is not a bug"). Writes docs/baselines/<label>-learning-r<seq>.json plus the reports.
 */
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { addFalseAlarm, loadFalseAlarms, matchFalseAlarms } from "../core/lib/memory/falsealarms.ts";
import { loadLearnings } from "../core/lib/memory/learnings.ts";
import { readMemoryLog } from "../core/lib/memory/memorylog.ts";
import { lintReports } from "../core/lib/reports.ts";
import { readRunData } from "../core/lib/report.ts";
import { applyDemoChange, DEMO_CHANGE } from "./learning-mutation.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    label: { type: "string" },
    seq: { type: "string", default: "1" },
    mode: { type: "string", default: "full" },
    budget: { type: "string", default: "15" },
    "timeout-min": { type: "string", default: "40" },
    claude: { type: "string" },
    model: { type: "string", default: "claude-sonnet-5-5" },
  },
});
if (!values.label) {
  console.error("--label is required");
  process.exit(2);
}
const label = values.label;
const claude = values.claude ?? process.env["CLAUDE_BIN"] ?? "claude";
const model = values.model as string;
const prompt = `/qamind:qa-only ${values.mode}`;
if (spawnSync(claude, ["--version"], { encoding: "utf8" }).status !== 0) {
  console.error(`Cannot run "${claude}". Pass --claude or set CLAUDE_BIN.`);
  process.exit(2);
}

// ---- workspace (same pinned setup as eval-demo.ts) ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-learning-"));
const ws = path.join(tmp, "ws");
const home = path.join(tmp, "home");
const EXCLUDE = new Set(["node_modules", ".qa", ".env.qa", ".env.qa.fixture", "SEEDED-BUGS.md", "eval", "qa-fixture"]);
fs.cpSync(path.join(repoRoot, "demo-app"), ws, { recursive: true, filter: (src) => !EXCLUDE.has(path.basename(src)) });
for (const c of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.name=eval", "-c", "user.email=eval@example.test", "commit", "-qm", "demo app"]]) spawnSync("git", c, { cwd: ws });
fs.mkdirSync(path.join(ws, ".qa"), { recursive: true });
fs.copyFileSync(path.join(repoRoot, "demo-app", "qa-fixture", "config.md"), path.join(ws, ".qa", "config.md"));
fs.copyFileSync(path.join(repoRoot, "demo-app", ".env.qa.fixture"), path.join(ws, ".env.qa"));

let server: ChildProcess | undefined;
const answering = async (): Promise<boolean> => {
  try {
    return (await fetch("http://127.0.0.1:4100/api/health")).ok;
  } catch {
    return false;
  }
};
async function startServer(): Promise<void> {
  // Something already answering on the port is a stale server: the agent would test that one, not this workspace.
  if (await answering()) throw new Error("Something is already listening on port 4100 (a stale demo app?). Stop it and run again.");
  const child = spawn(process.execPath, ["server.mjs"], { cwd: ws, stdio: "ignore" });
  server = child;
  for (let i = 0; ; i++) {
    if (child.exitCode !== null || i >= 40) throw new Error("The demo app did not start (are ports 4100-4102 free?).");
    if (await answering()) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  spawnSync(process.execPath, ["scripts/reset.mjs"], { cwd: ws });
}
const stopServer = async (): Promise<void> => {
  server?.kill();
  await new Promise((r) => setTimeout(r, 500));
};

// ---- one agent run, with the arrival time of every event ----
interface Ev {
  type?: string;
  subtype?: string;
  message?: { content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
  total_cost_usd?: number;
  num_turns?: number;
  is_error?: boolean;
  result?: string;
  permission_denials?: Array<{ tool_name?: string }>;
  _t: number;
}
interface AgentRun {
  events: Ev[];
  result?: Ev;
  cost: number;
  turns: number;
  minutes: number;
  stderr: string;
}
const env = { ...process.env, QAMIND_HOME: home, ENABLE_CLAUDEAI_MCP_SERVERS: "false" } as NodeJS.ProcessEnv;
delete env["CLAUDECODE"];
delete env["CLAUDE_CODE_ENTRYPOINT"];
const TOOLS = ["Read", "Glob", "Grep", "Write", "Edit", "Bash(qamind *)", "Bash(curl *)", "Bash(git status *)", "Bash(git diff *)", "Bash(git log *)", "Bash(ls *)", "mcp__plugin_qamind_browser"];

function runAgent(): Promise<AgentRun> {
  return new Promise((resolve) => {
    const args = ["-p", prompt, "--plugin-dir", path.join(repoRoot, "plugins", "qamind"), "--model", model, "--setting-sources", "project,local", "--allowedTools", ...TOOLS, "--max-budget-usd", values.budget as string, "--no-session-persistence", "--output-format", "stream-json", "--verbose"];
    const started = Date.now();
    const events: Ev[] = [];
    let buf = "";
    const child = spawn(claude, args, { cwd: ws, env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 20_000) stderr += chunk.toString("utf8");
    });
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.startsWith("{")) {
          try {
            events.push({ ...(JSON.parse(line) as object), _t: Date.now() - started } as Ev);
          } catch {
            /* partial line */
          }
        }
      }
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), Number(values["timeout-min"]) * 60_000);
    child.on("exit", () => {
      clearTimeout(timer);
      const result = events.find((e) => e.type === "result");
      resolve({ events, ...(result ? { result } : {}), cost: result?.total_cost_usd ?? 0, turns: result?.num_turns ?? 0, minutes: Math.round((Date.now() - started) / 600) / 100, stderr });
    });
  });
}

const toolCalls = (run: AgentRun): Array<{ name: string; input: Record<string, unknown>; t: number }> =>
  run.events.flatMap((e) => (e.type === "assistant" ? (e.message?.content ?? []).filter((c) => c.type === "tool_use").map((c) => ({ name: (c.name ?? "").replace("mcp__plugin_qamind_browser__", "browser:"), input: c.input ?? {}, t: e._t })) : []));

const redact = (text: string): string => passwords.reduce((t, p) => t.split(p).join("***"), text);
/** Every tool call with its time, trimmed and with test passwords masked: enough to see where a run spent its first minutes. */
const trace = (run: AgentRun): Array<{ s: number; tool: string; arg: string }> =>
  toolCalls(run).map((c) => ({ s: Math.round(c.t / 100) / 10, tool: c.name, arg: redact(String(c.input["command"] ?? c.input["url"] ?? c.input["file_path"] ?? c.input["path"] ?? c.input["pattern"] ?? c.input["element"] ?? "")).replace(/\s+/g, " ").slice(0, 110) }));
const resultInfo = (run: AgentRun) => ({ subtype: run.result?.subtype ?? null, is_error: run.result?.is_error ?? null, permission_denials: (run.result?.permission_denials ?? []).map((d) => d.tool_name ?? "?"), final_message: redact(String(run.result?.result ?? "")).slice(0, 400) });

/** A run counts only if it ended normally, wrote its findings and finished its memory update; anything else is a failed run, not a data point. */
function problemsWith(run: AgentRun, dir: string | undefined): string[] {
  const problems: string[] = [];
  if (!run.result) problems.push(`the agent exited without a result after ${run.minutes} min`);
  else if (run.result.is_error || run.result.subtype !== "success") problems.push(`the agent ended with ${run.result.subtype ?? "an error"}`);
  if (!dir) return [...problems, "no run folder was created"];
  if (!fs.existsSync(path.join(dir, "data", "findings.json"))) problems.push("the run never wrote data/findings.json");
  if (!fs.existsSync(path.join(storeOf(), "memory", "runs", `${path.basename(dir)}.json`))) problems.push("the run was never finished (no run summary in the store)");
  return problems;
}
function failRun(which: 1 | 2, run: AgentRun, dir: string | undefined, problems: string[]): never {
  const t = trace(run);
  const file = path.join(repoRoot, "docs", "baselines", `${label}-learning-r${values.seq}-FAILED-run${which}.json`);
  fs.writeFileSync(file, JSON.stringify({ label, seq: Number(values.seq), failed_run: which, problems, minutes: run.minutes, cost_usd: run.cost, turns: run.turns, result: resultInfo(run), stderr_tail: redact(run.stderr).slice(-1500), calls_total: t.length, last_calls: t.slice(-20) }, null, 2) + "\n");
  console.error(`Run ${which} is not a valid run: ${problems.join("; ")}.\nDiagnostics: ${path.relative(repoRoot, file)}. Workspace kept at ${tmp}`);
  process.exit(1);
}

/** How far into the run (tool calls, seconds) the agent first did something that matches: the first real contact with the product. */
function firstCall(run: AgentRun, match: (c: { name: string; command: string }) => boolean): { calls: number; seconds: number } | undefined {
  const calls = toolCalls(run);
  const i = calls.findIndex((c) => match({ name: c.name, command: String(c.input["command"] ?? "") }));
  return i < 0 ? undefined : { calls: i + 1, seconds: Math.round((calls[i]!.t / 1000) * 10) / 10 };
}
/** A click, typing, a form fill, a selection or a key press in the browser. */
const firstUiInteraction = (run: AgentRun) => firstCall(run, (c) => /^browser:browser_(click|type|fill_form|select_option|press_key)$/.test(c.name));
/** The first execution of an API test plan (`qamind api run`). */
const firstApiRun = (run: AgentRun) => firstCall(run, (c) => c.name === "Bash" && /\bapi run\b/.test(c.command));
const notSlower = (a?: { calls: number; seconds: number }, b?: { calls: number; seconds: number }): boolean | null => (a && b ? b.calls <= a.calls * 1.1 && b.seconds <= a.seconds * 1.1 : null);
const memoryCalls = (run: AgentRun, sub: string): number => toolCalls(run).filter((c) => c.name === "Bash" && new RegExp(`\\bmemory ${sub}\\b`).test(String(c.input["command"] ?? ""))).length;

const latestRunDir = (): string | undefined => {
  const reports = path.join(ws, ".qa", "reports");
  return fs.existsSync(reports) ? fs.readdirSync(reports).filter((d) => d.startsWith("run-")).sort().map((d) => path.join(reports, d)).pop() : undefined;
};
const score = (runDir: string): Record<string, any> => JSON.parse(spawnSync(process.execPath, [path.join(repoRoot, "demo-app", "eval", "score-run.mjs"), runDir, "--json"], { encoding: "utf8" }).stdout || "{}");
const storeOf = (): string => {
  const projects = path.join(home, "projects");
  return path.join(projects, (fs.existsSync(projects) ? fs.readdirSync(projects)[0] : undefined) ?? "none");
};
const passwords = fs.readFileSync(path.join(ws, ".env.qa"), "utf8").split("\n").filter((l) => /PASS/.test(l)).map((l) => l.split("=")[1] ?? "").filter(Boolean);

// ================= run 1 =================
console.log("Run 1 (no memory)...");
await startServer();
const run1 = await runAgent();
await stopServer();
const dir1 = latestRunDir();
const problems1 = problemsWith(run1, dir1);
if (problems1.length || !dir1) failRun(1, run1, dir1, problems1);
const data1 = readRunData(dir1);
const store = storeOf();

// ================= between the runs: change the product, and the owner marks one thing "not a bug" =================
applyDemoChange(ws);

const s1 = score(dir1);
const bugRows = (s1["per_bug"] as Array<{ id: string; by: string[] }> | undefined) ?? [];
const scoredIds = new Set(bugRows.flatMap((b) => b.by));
const order = { minor: 0, important: 1, critical: 2 } as const;
// Prefer a finding that matches no scored bug, so suppressing it cannot lower run 2's recall; the lowest severity first.
const byLowest = [...data1.findings].sort((a, b) => order[a.severity] - order[b.severity]);
const seed = byLowest.find((f) => !scoredIds.has(f.id ?? "")) ?? byLowest[0];
let seeded: { id: string; from_finding: string; title: string } | undefined;
if (seed) {
  const r = addFalseAlarm(store, { area: seed.area, symptom: seed.title, reason: "The product owner confirmed this is accepted behaviour and not a bug.", source: "owner" });
  seeded = { id: r.alarm.id, from_finding: seed.id ?? "", title: seed.title };
}
// Every scored bug the seeded finding counted for: skipping it in run 2 is the expected result, so both runs are compared without them.
const suppressedBugs = seed ? bugRows.filter((b) => b.by.includes(seed.id ?? "")).map((b) => b.id) : [];
const foundWithout = (score: Record<string, any>): number => Number(score["found"]) - suppressedBugs.filter((id) => (score["per_bug"] as Array<{ id: string; status: string }>).some((b) => b.id === id && b.status === "FOUND")).length;
const learningsAfter1 = loadLearnings(store).active;

// ================= run 2 =================
console.log(`Run 2 (with memory: ${learningsAfter1.length} learning(s), false alarm ${seeded?.id ?? "none"}; product changed)...`);
await startServer();
const run2 = await runAgent();
await stopServer();
const dir2 = latestRunDir();
const problems2 = dir2 === dir1 ? ["run 2 created no new run folder"] : problemsWith(run2, dir2);
if (problems2.length || !dir2) failRun(2, run2, dir2, problems2);
const data2 = readRunData(dir2);
const log2 = readMemoryLog(dir2);
const lint2 = lintReports(dir2, passwords, store);
const adminText = fs.readFileSync(path.join(dir2, "ADMIN-REPORT.md"), "utf8");
const techText = fs.readFileSync(path.join(dir2, "TECHNICAL-REPORT.md"), "utf8");
const changes = data2.changes;

// secrets anywhere in the store or either run folder
const leaks: string[] = [];
const walk = (d: string): void => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(json|jsonl|md|txt|log|yml|yaml)$/.test(e.name)) {
      const t = fs.readFileSync(p, "utf8");
      if (passwords.some((pw) => t.includes(pw))) leaks.push(path.relative(tmp, p));
    }
  }
};
for (const d of [store, dir1, dir2]) walk(d);

const ui1 = firstUiInteraction(run1);
const ui2 = firstUiInteraction(run2);
const api1 = firstApiRun(run1);
const api2 = firstApiRun(run2);
const s2 = score(dir2);
const alarms = loadFalseAlarms(store).alarms;
const stillMatching = matchFalseAlarms(data2.findings, alarms.filter((a) => a.id === seeded?.id));
const cited = log2.filter((e) => e.kind === "learning-applied");
const checks = {
  memory_loaded: memoryCalls(run2, "context") >= 1,
  learnings_saved_in_run1: learningsAfter1.length,
  cites_real_learnings: cited.length >= 1 && !lint2.errors.some((e) => /does not exist/.test(e)),
  cited_learning_ids: [...new Set(cited.map((e) => e.id))],
  false_alarm_seeded: seeded?.id ?? null,
  false_alarm_not_reported_again: !!seeded && stillMatching.length === 0,
  false_alarm_cited_as_skipped: !!seeded && log2.some((e) => e.kind === "false-alarm-skipped" && e.id === seeded.id),
  changed_page_reported: !!changes && changes.pages_new.some((p) => /help/i.test(p.path)) && /Help/.test(adminText) && /help/i.test(techText),
  changed_endpoint_added: !!changes && changes.endpoints_added.some((e) => /GET \/(api\/)?help\b/.test(e.op)),
  changed_endpoint_removed: !!changes && changes.endpoints_removed.some((e) => /reset-password/.test(e.op)),
  not_slower_to_first_ui_interaction: notSlower(ui1, ui2),
  not_slower_to_first_api_test: notSlower(api1, api2),
  reports_consistent_and_lint_clean: lint2.ok,
  no_secrets_in_memory_or_reports: leaks.length === 0,
};
const record = {
  label,
  seq: Number(values.seq),
  date: new Date().toISOString(),
  prompt,
  model,
  between_runs: { ...DEMO_CHANGE, seeded_false_alarm: seeded, seeded_false_alarm_covers_scored_bugs: suppressedBugs },
  run1: { cost_usd: run1.cost, turns: run1.turns, minutes: run1.minutes, result: resultInfo(run1), first_ui_interaction: ui1, first_api_run: api1, found: s1["found"], found_excluding_suppressed: foundWithout(s1), missed: s1["missed"], findings: data1.findings.length, memory_calls: { learn: memoryCalls(run1, "learn"), applied: memoryCalls(run1, "applied"), context: memoryCalls(run1, "context") } },
  run2: { cost_usd: run2.cost, turns: run2.turns, minutes: run2.minutes, result: resultInfo(run2), first_ui_interaction: ui2, first_api_run: api2, found: s2["found"], found_excluding_suppressed: foundWithout(s2), missed: s2["missed"], findings: data2.findings.length, memory_calls: { learn: memoryCalls(run2, "learn"), applied: memoryCalls(run2, "applied"), context: memoryCalls(run2, "context") }, memory_applied: data2.meta?.memory_applied ?? [], lint_errors: lint2.errors, changes },
  bug_finding_expected_suppressed: suppressedBugs,
  checks,
  secrets_found_in: leaks,
};
const out = path.join(repoRoot, "docs", "baselines");
const base = path.join(out, `${label}-learning-r${values.seq}`);
fs.writeFileSync(`${base}.json`, JSON.stringify(record, null, 2) + "\n");
fs.writeFileSync(`${base}.run1.trace.json`, JSON.stringify(trace(run1)) + "\n");
fs.writeFileSync(`${base}.run2.trace.json`, JSON.stringify(trace(run2)) + "\n");
fs.copyFileSync(path.join(dir1, "ADMIN-REPORT.md"), `${base}.run1.admin.md`);
fs.copyFileSync(path.join(dir2, "ADMIN-REPORT.md"), `${base}.run2.admin.md`);
fs.copyFileSync(path.join(dir2, "TECHNICAL-REPORT.md"), `${base}.run2.report.md`);
console.log(JSON.stringify({ checks, run1: record.run1, run2: { ...record.run2, changes: undefined, memory_applied: record.run2.memory_applied.length } }, null, 2));
console.log(`Saved ${path.relative(repoRoot, base)}.{json,run1.admin.md,run2.admin.md,run2.report.md}`);
fs.rmSync(tmp, { recursive: true, force: true });
