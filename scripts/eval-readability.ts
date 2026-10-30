/**
 * Acceptance test for "a non-technical reader can follow every reproduction step" (spec Phase 3).
 * Two independent readers see ONLY the written admin report:
 *   reader : a text-only agent playing a non-technical manager. It says which steps it could follow and which words it did not understand.
 *   replay : a fresh agent with nothing but browser clicks and typing (no code, no API, no source, no developer tools) tries to follow
 *            each problem's "How to see it yourself" steps on the live demo app and reports where it got stuck and whether it saw the problem.
 *
 *   node scripts/eval-readability.ts <path-to-admin-report.md> --label phase-3 [--no-replay] [--only 1,3]
 *
 * Writes docs/baselines/<label>-readability.json. Needs the Claude Code CLI (CLAUDE_BIN or --claude) and a login.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { label: { type: "string" }, claude: { type: "string" }, model: { type: "string", default: "claude-sonnet-5-5" }, "no-replay": { type: "boolean", default: false }, only: { type: "string" }, budget: { type: "string", default: "2" } },
});
const reportFile = positionals[0];
if (!reportFile || !values.label) {
  console.error("usage: node scripts/eval-readability.ts <admin-report.md> --label <name> [--no-replay] [--only 1,3]");
  process.exit(2);
}
const claude = values.claude ?? process.env["CLAUDE_BIN"] ?? "claude";
const model = values.model as string;
const report = fs.readFileSync(path.resolve(reportFile), "utf8");

interface Block {
  n: number;
  heading: string;
  where: string;
  steps: string[];
  expected: string;
  whatHappens: string;
}
function parseBlocks(md: string): Block[] {
  const section = md.split("\n## Problems found")[1]?.split("\n## ")[0] ?? "";
  return section.split(/^### /m).slice(1).map((b, i) => {
    const grab = (label: string) => new RegExp(`^- \\*\\*${label}:\\*\\* ?(.*)$`, "m").exec(b)?.[1]?.trim() ?? "";
    const steps = [...b.matchAll(/^\s+(\d+)\. (.+)$/gm)].map((m) => m[2] as string);
    return { n: i + 1, heading: b.split("\n")[0] ?? "", where: grab("Where"), steps, expected: grab("What should happen"), whatHappens: grab("What happens") };
  });
}
const blocks = parseBlocks(report);

const extractJson = (text: string): unknown => {
  const m = /```json\s*([\s\S]*?)```/.exec(text) ?? /(\{[\s\S]*\})\s*$/.exec(text);
  try {
    return m ? JSON.parse(m[1] as string) : undefined;
  } catch {
    return undefined;
  }
};

function runClaude(prompt: string, extra: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<{ result: string; cost: number; turns: number }> {
  return new Promise((resolve) => {
    const args = ["-p", prompt, "--model", model, "--setting-sources", "project,local", "--no-session-persistence", "--output-format", "json", ...extra];
    const child = spawn(claude, args, { cwd, env, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("exit", () => {
      try {
        const j = JSON.parse(out) as { result?: string; total_cost_usd?: number; num_turns?: number };
        resolve({ result: j.result ?? "", cost: j.total_cost_usd ?? 0, turns: j.num_turns ?? 0 });
      } catch {
        resolve({ result: out, cost: 0, turns: 0 });
      }
    });
  });
}

const baseEnv = { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: "false" } as NodeJS.ProcessEnv;
delete baseEnv["CLAUDECODE"];
delete baseEnv["CLAUDE_CODE_ENTRYPOINT"];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-readability-"));

// ---------------- 1. text-only reader ----------------
console.log("Reader review (text only)...");
const readerPrompt = `You are a non-technical manager at a company. You have no software or IT training. A colleague has given you the report below about problems found when testing your company's order system. Read it as that person would.

For EACH problem, judge only from the text:
- can_follow_steps: could you follow every "How to see it yourself" step without any technical knowledge? (If the report says it cannot be seen on screen, answer "not applicable".)
- confusing_words: every word or phrase you would not understand or would have to ask someone about (quote them exactly; empty list if none).
- clear_what_is_wrong: do you understand what is wrong and why it matters? (true/false)
- clear_who_is_affected: true/false
Also give overall: would_you_know_what_to_do_next (true/false) and the verdict_clear (true/false).

Reply with ONLY a JSON object in a \`\`\`json fenced block: {"problems":[{"title":"...","can_follow_steps":"yes|no|not applicable","stuck_at_step":null,"confusing_words":[],"clear_what_is_wrong":true,"clear_who_is_affected":true,"comments":"..."}],"overall":{"would_you_know_what_to_do_next":true,"verdict_clear":true,"comments":"..."}}

REPORT:
-----
${report}
-----`;
const reader = await runClaude(readerPrompt, ["--tools", "", "--max-budget-usd", "1"], baseEnv, tmp);
const readerJson = extractJson(reader.result) as { problems?: Array<Record<string, unknown>>; overall?: Record<string, unknown> } | undefined;

// ---------------- 2. novice replay ----------------
interface Replay {
  problem: string;
  steps: number;
  followed_all_steps?: boolean;
  stuck_at_step?: number | null;
  stuck_reason?: string;
  saw_the_described_problem?: boolean;
  notes?: string;
  cost: number;
  raw?: string;
}
const replays: Replay[] = [];
if (!values["no-replay"]) {
  const only = values.only ? new Set(values.only.split(",").map(Number)) : undefined;
  const todo = blocks.filter((b) => b.steps.length > 0 && (!only || only.has(b.n)));
  console.log(`Novice replay of ${todo.length} problem(s) with on-screen steps...`);
  // The demo app, a workspace, and an ACTIVE run so the browser guard lets only the demo's origins through.
  const ws = path.join(tmp, "ws");
  const home = path.join(tmp, "home");
  const EXCLUDE = new Set(["node_modules", ".qa", ".env.qa", ".env.qa.fixture", "SEEDED-BUGS.md", "eval", "qa-fixture"]);
  fs.cpSync(path.join(repoRoot, "demo-app"), ws, { recursive: true, filter: (src) => !EXCLUDE.has(path.basename(src)) });
  for (const c of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.name=eval", "-c", "user.email=eval@example.test", "commit", "-qm", "demo"]]) spawnSync("git", c, { cwd: ws });
  fs.mkdirSync(path.join(ws, ".qa"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "demo-app", "qa-fixture", "config.md"), path.join(ws, ".qa", "config.md"));
  fs.copyFileSync(path.join(repoRoot, "demo-app", ".env.qa.fixture"), path.join(ws, ".env.qa"));
  const server = spawn(process.execPath, ["server.mjs"], { cwd: ws, stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:4100/api/health")).ok) break;
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const env = { ...baseEnv, QAMIND_HOME: home };
  const start = spawnSync(process.execPath, [path.join(repoRoot, "plugins", "qamind", "dist", "qamind.mjs"), "run", "start", "--mode", "quick", "--session", "replay-marker", "--host", "readability"], { cwd: ws, env, encoding: "utf8" });
  if (!/"status": "ready"/.test(start.stdout)) console.error("Could not start a run for the replay:", start.stdout.slice(0, 300));

  for (const b of todo) {
    spawnSync(process.execPath, ["scripts/reset.mjs"], { cwd: ws });
    const prompt = `You are a non-technical manager with a web browser. A colleague wrote down how to see a problem in your company's order system. Follow ONLY the steps below, exactly as written, using the browser tools you have. You do not know anything about how the software works: you cannot read code, call back-end services or use developer tools. You only look, click and type like a person.

Addresses you were given: the Client Portal is http://127.0.0.1:4102 and the Admin Portal is http://127.0.0.1:4101.
Logins your tester gave you, by name (type the NAME into the box and the system fills in the real value): customer of Company A (Acme): username QA_ACME1_USER, password QA_ACME1_PASS; second customer of Company A: QA_ACME2_USER / QA_ACME2_PASS; customer of Company B (Bright): QA_BRIGHT1_USER / QA_BRIGHT1_PASS; customer of Zain Traders (an Urdu-speaking company): QA_ZAIN1_USER / QA_ZAIN1_PASS; admin: QA_ADMIN_USER / QA_ADMIN_PASS.
To start a clean session as a different person, close the browser window first.

THE PROBLEM: ${b.heading.replace(/^[🔴🟠🟡]\s*/u, "")}
WHERE: ${b.where}
WHAT THE REPORT SAYS HAPPENS: ${b.whatHappens}

STEPS (follow them in order):
${b.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

WHAT SHOULD HAPPEN INSTEAD: ${b.expected}

Rules: do the steps; do not guess a missing step; if a step is unclear, ambiguous, or you cannot do it with what you see on screen, stop there and say which step and exactly why. At the end say whether you saw the problem the report describes.
Reply with ONLY a JSON object in a \`\`\`json fenced block: {"followed_all_steps":true,"stuck_at_step":null,"stuck_reason":"","saw_the_described_problem":true,"notes":"what you actually saw, one or two sentences"}`;
    const r = await runClaude(
      prompt,
      ["--plugin-dir", path.join(repoRoot, "plugins", "qamind"), "--tools", "", "--allowedTools", "mcp__plugin_qamind_browser", "--disallowedTools", "mcp__plugin_qamind_browser__browser_evaluate,mcp__plugin_qamind_browser__browser_run_code_unsafe,mcp__plugin_qamind_browser__browser_network_requests,mcp__plugin_qamind_browser__browser_network_request", "--max-budget-usd", values.budget as string],
      env,
      ws,
    );
    const j = extractJson(r.result) as Partial<Replay> | undefined;
    replays.push({ problem: b.heading, steps: b.steps.length, ...(j ?? { notes: "no parsable answer" }), cost: r.cost, ...(j ? {} : { raw: r.result.slice(0, 400) }) });
    console.log(`  ${b.heading.slice(0, 70)} -> followed=${j?.followed_all_steps} saw=${j?.saw_the_described_problem}`);
  }
  server.kill();
  spawnSync(process.execPath, [path.join(repoRoot, "plugins", "qamind", "dist", "qamind.mjs"), "run", "finish", "--run", /"id": "([^"]+)"/.exec(start.stdout)?.[1] ?? "", "--stop-reason", "readability replay"], { cwd: ws, env });
}

const summary = {
  label: values.label,
  report: path.basename(reportFile),
  date: new Date().toISOString(),
  model,
  problems_in_report: blocks.length,
  problems_with_on_screen_steps: blocks.filter((b) => b.steps.length > 0).length,
  reader: {
    answered: !!readerJson,
    cost_usd: reader.cost,
    steps_followable: (readerJson?.problems ?? []).filter((p) => p["can_follow_steps"] === "yes").length,
    steps_not_followable: (readerJson?.problems ?? []).filter((p) => p["can_follow_steps"] === "no").length,
    confusing_words: [...new Set((readerJson?.problems ?? []).flatMap((p) => (p["confusing_words"] as string[]) ?? []))],
    unclear_problems: (readerJson?.problems ?? []).filter((p) => p["clear_what_is_wrong"] === false || p["clear_who_is_affected"] === false).map((p) => p["title"]),
    overall: readerJson?.overall,
    detail: readerJson?.problems,
  },
  replay: {
    ran: replays.length,
    followed_all_steps: replays.filter((r) => r.followed_all_steps === true).length,
    saw_the_described_problem: replays.filter((r) => r.saw_the_described_problem === true).length,
    cost_usd: replays.reduce((a, r) => a + r.cost, 0),
    detail: replays,
  },
};
const out = path.join(repoRoot, "docs", "baselines", `${values.label}-readability.json`);
fs.writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ ...summary, reader: { ...summary.reader, detail: undefined }, replay: { ...summary.replay, detail: undefined } }, null, 2));
console.log(`Saved ${path.relative(repoRoot, out)}`);
