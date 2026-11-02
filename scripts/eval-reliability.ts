/**
 * The reliability end-to-end test (spec section 14, Phase 7.6): real Claude Code, the built plugin, a COPY of the demo app per scenario, a scratch QAMIND_HOME.
 *
 *   broken-env       the demo app is NOT running: /qa-only must stop as an "Environment problem", with no product findings and no testing on top of it
 *   budget           budget.time_minutes is 1 and the run is `full`: it must stop exploring, say "time budget reached" for what it did not get to, and still finish the report
 *   privacy-ui       the Admin Portal's Customers page shows real-looking personal data and the config names two columns in privacy.mask_selectors: the agent opens it in the browser and takes a screenshot,
 *                    which must be blurred (a screenshot is taken by the agent through the registered browser tool, the picture is then read by a person, not by this script)
 *   privacy-memory   a real format-1 memory store from QAMind 0.7.5 is in the store, setup.reset_command is configured, privacy.mask_fields names the demo's personal fields:
 *                    the store must migrate with a backup and be used by the run; the reset must run before the health check; no seeded personal value may be in the run's output
 *
 * Everything is checked from the files and the tool-call stream, not from the agent's words. Writes docs/baselines/<label>-reliability.{json,md}.
 *
 *   node scripts/eval-reliability.ts --label phase-7.6 [--only broken-env,budget] [--budget 6] [--timeout-min 25] [--claude /path/to/claude] [--keep]
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { contextFrom, scanRun } from "../core/lib/privacy.ts";
import { resolveProject } from "../core/lib/project.ts";

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
const reportsOf = (w: Workspace): string[] => {
  const d = path.join(w.ws, ".qa", "reports");
  return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.startsWith("run-")).sort().map((x) => path.join(d, x)) : [];
};
const storeOf = (w: Workspace): string | undefined => {
  const p = path.join(w.home, "projects");
  const first = fs.existsSync(p) ? fs.readdirSync(p)[0] : undefined;
  return first ? path.join(p, first) : undefined;
};
const walkText = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && /\.(json|jsonl|md|txt|log|csv|har|html)$/i.test(e.name)).map((e) => path.join(e.parentPath, e.name)) : []);

interface Scenario {
  id: string;
  title: string;
  extraConfig?: string;
  server: boolean;
  prompt: string;
  seed?: (w: Workspace) => void;
  check: (w: Workspace, turn: Turn, cs: Call[], problems: string[], notes: Record<string, unknown>) => void;
}

const SEEDED_PERSONAL = ["35202-1234567-1", "42101-7654321-9", "61101-2468013-5", "4000 0566 5566 5556", "Hannah Brooks", "Marcus Lindqvist", "14 Industrial Estate Road", "220 Harbour Street"];

function seedOldStore(w: Workspace): void {
  const id = resolveProject(w.ws).id;
  const from = path.join(repoRoot, "tests", "core", "fixtures", "memory-v1", "github.com-acme-conformance-0cef0241");
  const to = path.join(w.home, "projects", id);
  fs.cpSync(from, to, { recursive: true });
  const pj = JSON.parse(fs.readFileSync(path.join(to, "project.json"), "utf8")) as Record<string, unknown>;
  fs.writeFileSync(path.join(to, "project.json"), JSON.stringify({ ...pj, id, id_source: "path", name: path.basename(w.ws), git_remote: undefined, paths_seen: [fs.realpathSync(w.ws)] }, null, 2));
}

const SCENARIOS: Scenario[] = [
  {
    id: "broken-env",
    title: "the demo app is not running: an Environment problem, no findings, no testing on top of it",
    server: false,
    prompt: "/qamind:qa-only quick",
    check: (w, turn, cs, problems, notes) => {
      const run = reportsOf(w).pop();
      if (!run) return void problems.push("no run folder was created");
      const health = readJson<{ environment_ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> }>(path.join(run, "data", "health.json"));
      notes["health"] = health?.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
      if (!health) problems.push("the health check was never run");
      else if (health.environment_ok) problems.push("the health check passed although nothing was running");
      else if (!health.checks.some((c) => /\(twice\)$/.test(c.detail))) problems.push("a failed check was not retried before being called a problem");
      const findings = readJson<unknown[]>(path.join(run, "data", "findings.json")) ?? [];
      notes["findings"] = findings.length;
      if (findings.length) problems.push(`${findings.length} product finding(s) were reported from a broken environment`);
      const summary = readJson<{ stop_reason: string; counts: Record<string, number> }>(path.join(storeOf(w) ?? "", "memory", "runs", `${path.basename(run)}.json`));
      notes["stop_reason"] = summary?.stop_reason;
      if (!summary) problems.push("the run never finished (no run summary)");
      else if (summary.stop_reason !== "environment problem") problems.push(`stop_reason is "${summary.stop_reason}", not "environment problem"`);
      const tests = cs.filter((c) => c.name.startsWith("browser:") || (c.name === "Bash" && /qamind api run/.test(String(c.input["command"] ?? ""))));
      notes["browser_or_api_test_calls"] = tests.length;
      if (tests.length) problems.push(`the agent tested on top of the broken environment (${tests.length} browser or API calls)`);
      const admin = fs.existsSync(path.join(run, "ADMIN-REPORT.md")) ? fs.readFileSync(path.join(run, "ADMIN-REPORT.md"), "utf8") : "";
      notes["admin_first_line"] = admin.split("\n")[0];
      if (/^\W*Ready\b/i.test(admin.split("\n")[0] ?? "") && !/not ready|cannot/i.test(admin.split("\n")[0] ?? "")) problems.push("the admin report's verdict says Ready");
      if (!/did not (open|respond)|could not sign in|health check|environment/i.test(admin)) problems.push("the admin report does not explain the environment problem in plain words");
      const nt = readJson<Array<{ reason: string }>>(path.join(run, "data", "not-tested.json")) ?? [];
      notes["not_tested"] = nt.length;
      if (nt.length === 0) problems.push("nothing was listed under Not tested");
      else if (!nt.every((n) => /environment problem/i.test(n.reason))) problems.push("some Not tested reasons are not 'Environment problem'");
      notes["final_message"] = String(turn.result?.result ?? "").slice(0, 400);
    },
  },
  {
    id: "budget",
    title: "a one-minute budget on a full run: the run stops exploring, says so, and still finishes its report",
    extraConfig: "budget:\n  time_minutes: 1",
    server: true,
    prompt: "/qamind:qa-only full",
    check: (w, turn, cs, problems, notes) => {
      const run = reportsOf(w).pop();
      if (!run) return void problems.push("no run folder was created");
      const summary = readJson<{ duration_s: number; budget?: { time_minutes: number; used_minutes: number; reached: boolean }; usage?: { duration_s: number } }>(path.join(storeOf(w) ?? "", "memory", "runs", `${path.basename(run)}.json`));
      notes["summary_budget"] = summary?.budget;
      notes["duration_minutes"] = summary ? Math.round(summary.duration_s / 6) / 10 : undefined;
      if (!summary) return void problems.push("the run never finished (no run summary)");
      if (!summary.budget?.reached) problems.push("the budget was not reached (the run was under a minute, or the budget was not applied)");
      if (summary.duration_s > 8 * 60) problems.push(`the run took ${Math.round(summary.duration_s / 60)} minutes: it did not stop at a one-minute budget`);
      const checks = bash(cs).filter((b) => /qamind budget status/.test(b));
      notes["budget_status_calls"] = checks.length;
      if (checks.length === 0) problems.push("the agent never checked the budget");
      const nt = readJson<Array<{ area: string; reason: string }>>(path.join(run, "data", "not-tested.json")) ?? [];
      // The skill asks for the reason "time budget reached", and the agent mostly says exactly that; nothing in the code reads the wording (the budget rows of both reports come from the run summary), so the check is on meaning.
      const byBudget = nt.filter((n) => /\b(time )?budget\b|time limit|ran out of time/i.test(n.reason));
      notes["not_tested_by_budget"] = byBudget.length;
      notes["not_tested_with_the_exact_phrase"] = nt.filter((n) => /time budget reached/i.test(n.reason)).length;
      if (byBudget.length === 0) problems.push("nothing is listed as Not tested with the time budget as the reason");
      const tech = fs.existsSync(path.join(run, "TECHNICAL-REPORT.md")) ? fs.readFileSync(path.join(run, "TECHNICAL-REPORT.md"), "utf8") : "";
      if (!/\| Time budget \| \*\*1 minutes: reached\*\*/.test(tech)) problems.push("the technical report does not say the budget was reached");
      const admin = fs.existsSync(path.join(run, "ADMIN-REPORT.md")) ? fs.readFileSync(path.join(run, "ADMIN-REPORT.md"), "utf8") : "";
      if (!/stopped early because its time limit ran out/.test(admin)) problems.push("the admin report does not say the check stopped early");
      const planned = readJson<unknown[]>(path.join(run, "data", "charters.json")) ?? [];
      notes["charters"] = planned.length;
      notes["final_message"] = String(turn.result?.result ?? "").slice(0, 400);
    },
  },
  {
    id: "privacy-ui",
    title: "a screenshot of a page with personal data goes through the browser tool's in-page blur; nothing seeded reaches the run folder or the store",
    extraConfig: 'privacy:\n  mask_selectors: ["#customers-body td:nth-child(2)", "#customers-body td:nth-child(6)"]',
    server: true,
    prompt:
      "/qamind:qa-only quick Only the Admin Portal's Customers page this time: sign in as admin, open the Customers page (admin/customers.html), take ONE screenshot of it into the run's screenshots folder, then finish the run. Do not test anything else; list everything else as not tested with the reason: only the privacy check was asked for.",
    check: (w, turn, cs, problems, notes) => {
      const run = reportsOf(w).pop();
      if (!run) return void problems.push("no run folder was created");
      const store = storeOf(w) as string;
      const browserCalls = cs.filter((c) => c.name.startsWith("browser:"));
      notes["browser_calls"] = browserCalls.length;
      const shots = cs.filter((c) => /take_screenshot/.test(c.name));
      notes["screenshot_calls"] = shots.length;
      if (shots.length === 0) problems.push("the agent never took a screenshot through the browser tool");
      const saved = fs.existsSync(path.join(run, "screenshots")) ? fs.readdirSync(path.join(run, "screenshots")).filter((f) => /\.png$/i.test(f)) : [];
      notes["screenshots_in_run_folder"] = saved;
      if (saved.length === 0) problems.push("no screenshot was saved in the run's screenshots folder");
      else notes["screenshot_to_inspect"] = path.join(run, "screenshots", saved[0] as string);
      const seen = browserCalls.some((c) => /Hannah Brooks|35202-1234567-1/.test(c.result));
      notes["agent_could_read_raw_text_in_page_snapshot"] = seen;
      const leaks: string[] = [];
      for (const f of [...walkText(run), ...walkText(path.join(store, "memory"))]) {
        const t = fs.readFileSync(f, "utf8");
        for (const v of SEEDED_PERSONAL) if (t.includes(v)) leaks.push(`${path.relative(w.ws, f).split(path.sep).slice(-3).join("/")}: ${v.slice(0, 6)}...`);
      }
      notes["seeded_values_found_in_output"] = leaks;
      if (leaks.length) problems.push(`seeded personal values are in the run's output: ${leaks.slice(0, 4).join("; ")}`);
      const finalText = String(turn.result?.result ?? "");
      notes["seeded_values_in_final_chat_message"] = SEEDED_PERSONAL.filter((v) => finalText.includes(v)).length;
      const scan = scanRun(run, contextFrom({ test_data_prefix: "QA-", privacy: { mask_patterns: [], mask_selectors: [], mask_fields: [] } }, ["admin@lumen.test"]));
      if (!scan.ok) problems.push(`the privacy scan finds ${scan.leaks.length} file(s) with private data`);
      if (!readJson(path.join(store, "memory", "runs", `${path.basename(run)}.json`))) problems.push("the run never finished");
    },
  },
  {
    id: "privacy-memory",
    title: "an old (format 1) store migrates with a backup and is used; the reset runs first; no seeded personal value reaches the run's output",
    extraConfig: 'setup:\n  run_before: always\n  reset_command: node scripts/reset.mjs\nprivacy:\n  mask_fields: [contact_name, address]',
    server: true,
    prompt: "/qamind:qa-only quick",
    seed: seedOldStore,
    check: (w, turn, cs, problems, notes) => {
      const store = storeOf(w) as string;
      const run = reportsOf(w).pop();
      if (!run) return void problems.push("no run folder was created");
      // migration
      const backups = path.join(store, "backups");
      const dirs = fs.existsSync(backups) ? fs.readdirSync(backups).filter((d) => d.includes("schema-1-to-2")) : [];
      notes["backup_folders"] = dirs;
      if (dirs.length !== 1) problems.push(`expected one backup folder for the migration, found ${dirs.length}`);
      else {
        const orig = fs.readFileSync(path.join(backups, dirs[0] as string, "memory", "learnings.jsonl"), "utf8");
        if (!/"schema_version":1/.test(orig)) problems.push("the backup does not hold the original (format 1) learnings file");
        if (orig !== fs.readFileSync(path.join(repoRoot, "tests", "core", "fixtures", "memory-v1", "github.com-acme-conformance-0cef0241", "memory", "learnings.jsonl"), "utf8")) problems.push("the backup is not byte for byte the file that was in the store");
      }
      const log = fs.existsSync(path.join(backups, "migrations.log.jsonl")) ? fs.readFileSync(path.join(backups, "migrations.log.jsonl"), "utf8").trim().split("\n") : [];
      notes["migration_log_lines"] = log.length;
      if (log.length < 7) problems.push(`the migration log has ${log.length} entries, expected the 7 files of the old store`);
      const versions = ["memory/learnings.jsonl", "memory/false-alarms.jsonl", "memory/risk-areas.json", "memory/product-map.json", "memory/stack.json"].map((f) => {
        const first = fs.readFileSync(path.join(store, f), "utf8").split("\n")[0] as string;
        return f.endsWith(".jsonl") ? (JSON.parse(first) as { _meta: { schema_version: number } })._meta.schema_version : (JSON.parse(fs.readFileSync(path.join(store, f), "utf8")) as { schema_version: number }).schema_version;
      });
      notes["file_versions_after"] = versions;
      if (!versions.every((v) => v === 2)) problems.push(`some memory files are still not format 2: ${versions.join(",")}`);
      const learned = fs.readFileSync(path.join(store, "memory", "learnings.jsonl"), "utf8");
      if (!learned.includes("L-001") || !learned.includes("Search text is used as a pattern")) problems.push("the old learnings are not all still in the store");
      const ctx = cs.find((c) => c.name === "qa:memory_get_context");
      notes["agent_saw_old_learnings"] = !!ctx && ctx.result.includes("Search text is used as a pattern");
      if (!notes["agent_saw_old_learnings"]) problems.push("the run's memory context did not carry the migrated learnings");
      const runs = fs.readdirSync(path.join(store, "memory", "runs")).filter((f) => f.endsWith(".json"));
      notes["runs_in_history"] = runs.length;
      if (runs.length !== 3) problems.push(`the history has ${runs.length} runs, expected the 2 old ones and this one`);
      const mine = readJson<{ usage?: { duration_s: number }; schema_version: number }>(path.join(store, "memory", "runs", `${path.basename(run)}.json`));
      if (mine?.schema_version !== 2 || !mine.usage) problems.push("this run's summary is not format 2 with usage");
      // setup / reset
      const prep = readJson<{ ran: boolean; ok: boolean; steps: Array<{ name: string; ok: boolean }> }>(path.join(run, "data", "env-prep.json"));
      notes["env_prep"] = prep?.steps;
      if (!prep?.ran || !prep.ok || prep.steps[0]?.name !== "reset") problems.push("the configured reset did not run before testing");
      const health = readJson<{ checks: Array<{ name: string }> }>(path.join(run, "data", "health.json"));
      if (health?.checks[0]?.name !== "Test data preparation") problems.push("the health result does not start with the test data preparation");
      // privacy
      const leaks: string[] = [];
      for (const f of [...walkText(run), ...walkText(path.join(store, "memory"))]) {
        const t = fs.readFileSync(f, "utf8");
        for (const v of SEEDED_PERSONAL) if (t.includes(v)) leaks.push(`${path.relative(w.ws, f).split(path.sep).slice(-3).join("/")}: ${v.slice(0, 6)}...`);
      }
      notes["seeded_values_found_in_output"] = leaks;
      if (leaks.length) problems.push(`seeded personal values are in the run's output: ${leaks.slice(0, 4).join("; ")}`);
      const scan = scanRun(run, contextFrom({ test_data_prefix: "QA-", privacy: { mask_patterns: [], mask_selectors: [], mask_fields: ["contact_name", "address"] } }, ["admin@lumen.test"]));
      if (!scan.ok) problems.push(`the privacy scan finds ${scan.leaks.length} file(s) with private data`);
      const evidence = walkText(path.join(run, "evidence")).length;
      notes["evidence_text_files"] = evidence;
      notes["privacy_commands"] = bash(cs).filter((b) => /qamind privacy/.test(b));
      const finishes = cs.filter((c) => c.name === "qa:run_finish");
      notes["run_finish_refused"] = finishes.filter((c) => c.error).map((c) => c.result.slice(0, 160));
      notes["screenshots"] = fs.existsSync(path.join(run, "screenshots")) ? fs.readdirSync(path.join(run, "screenshots")).length : 0;
      const done = readJson<{ stop_reason: string }>(path.join(store, "memory", "runs", `${path.basename(run)}.json`));
      if (!done) problems.push("the run never finished");
      notes["final_message"] = String(turn.result?.result ?? "").slice(0, 300);
    },
  },
];

const chosen = (values.only ? values.only.split(",").map((s) => s.trim()) : SCENARIOS.map((s) => s.id)).map((id) => SCENARIOS.find((s) => s.id === id) ?? (() => { throw new Error(`Unknown scenario ${id}`); })());

const records: Array<Record<string, unknown>> = [];
let totalCost = 0;
for (const sc of chosen) {
  console.log(`\n== ${sc.id}: ${sc.title}`);
  const w = workspace(sc.id, sc.extraConfig);
  sc.seed?.(w);
  if (sc.server) await startServer(w);
  const turn = await runTurn(w, sc.prompt);
  if (sc.server) await stopServer();
  totalCost += turn.cost;
  console.log(`  ${turn.minutes} min, $${turn.cost.toFixed(2)}, ${turn.result?.subtype ?? "no result"}${turn.timedOut ? " (TIMED OUT)" : ""}`);
  const cs = calls(turn);
  const problems: string[] = [];
  const notes: Record<string, unknown> = {};
  if (turn.timedOut) problems.push("the turn timed out");
  sc.check(w, turn, cs, problems, notes);
  notes["final_message"] ??= String(turn.result?.result ?? "").slice(0, 500);
  const leaked: string[] = [];
  for (const f of [...walkText(w.home), ...walkText(path.join(w.ws, ".qa"))]) if (w.passwords.some((p) => fs.readFileSync(f, "utf8").includes(p))) leaked.push(path.relative(root, f));
  if (w.passwords.some((p) => JSON.stringify(turn.events).includes(p))) leaked.push("the agent's messages");
  if (leaked.length) problems.push(`a fixture password appears in: ${leaked.join(", ")}`);
  const record = {
    id: sc.id,
    title: sc.title,
    prompt: sc.prompt,
    minutes: turn.minutes,
    cost_usd: turn.cost,
    result: turn.result?.subtype ?? null,
    tool_errors: cs.filter((c) => c.error).map((c) => `${c.name}: ${c.result.replace(/\s+/g, " ").slice(0, 170)}`).slice(0, 12),
    tool_calls: cs.map((c) => `${c.name}${c.name === "Bash" ? " " + String(c.input["command"] ?? "").replace(/\s+/g, " ").slice(0, 90) : ""}`).slice(0, 90),
    notes,
    problems,
    passed: problems.length === 0,
  };
  records.push(record);
  console.log(`  -> ${problems.length === 0 ? "PASS" : "FAIL"}${problems.length ? `\n     ${problems.join("\n     ")}` : ""}`);
  if (values.keep) console.log(`  kept: ${path.join(w.ws, ".qa", "reports")}`);
}

const out = path.join(repoRoot, "docs", "baselines", `${label}-reliability`);
const scrub = (t: string): string => t.split(fs.realpathSync(root)).join("<tmp>").split(root).join("<tmp>").split(os.homedir()).join("~").replace(/\/(?:private\/)?var\/folders\/[^"\s']*/g, "<tmp>");
const summary = { label, date: new Date().toISOString(), model: values.model, claude: spawnSync(claude, ["--version"], { encoding: "utf8" }).stdout.trim(), total_cost_usd: Math.round(totalCost * 100) / 100, scenarios: records, passed: records.every((r) => r["passed"]) };
fs.writeFileSync(`${out}.json`, scrub(JSON.stringify(summary, null, 2)) + "\n");
fs.writeFileSync(
  `${out}.md`,
  scrub(["# Reliability end-to-end run: " + label, "", `${summary.date}, ${summary.model}, Claude Code ${summary.claude}. Real Claude Code, the built plugin, a copy of the demo app per scenario. Total cost $${summary.total_cost_usd}.`, "", "| Scenario | Minutes | Cost | Result |", "|----------|---------|------|--------|", ...records.map((r) => `| ${r["id"]}: ${r["title"]} | ${r["minutes"]} | $${(r["cost_usd"] as number).toFixed(2)} | ${r["passed"] ? "pass" : "FAIL: " + (r["problems"] as string[]).join("; ")} |`), ""].join("\n")),
);
console.log(`\nSaved ${path.relative(repoRoot, out)}.{json,md}; total cost $${summary.total_cost_usd}; ${summary.passed ? "ALL PASSED" : "FAILURES"}`);
if (!values.keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Workspaces kept at ${root}`);
process.exit(summary.passed ? 0 : 1);
