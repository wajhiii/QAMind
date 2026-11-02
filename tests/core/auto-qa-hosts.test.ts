import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CLAUDE_IO, mapPromptInput, mapStopInput, parseHookIo, readHostAutoConfig, renderStopOutput } from "../../core/auto-qa/hostio.ts";
import { isContinuation, isQaCommand } from "../../core/auto-qa/tags.ts";
import { defaultProjectDir } from "../../core/lib/memory/service.ts";
import { discoverHosts, readHostJson } from "../../hosts/registry.ts";
import { DEMO_CONFIG, DEMO_ENV, listFiles, makeProject, repoRoot, tmp } from "./helpers.ts";

// How the auto-QA gate serves hosts other than Claude Code: the hook format is data in host.json, the project comes from whatever variable the host sets, and a host that gives the QA skill no
// session id is still understood. The conformance suite runs each real host's own payloads; these are the edges.

const cursor = JSON.parse(fs.readFileSync(path.join(repoRoot, "hosts", "cursor", "host.json"), "utf8")) as { auto_qa: { hooks: unknown; invoke: string } };
const CURSOR = parseHookIo(cursor.auto_qa.hooks);

// ---- the mapping

test("Claude Code's format is the default: the gate's own field names in and out", () => {
  assert.deepEqual(mapStopInput({ session_id: "s", cwd: "/p", stop_hook_active: true, extra: 1 }), { session_id: "s", cwd: "/p", stop_hook_active: true });
  assert.deepEqual(mapStopInput({ session_id: "s" }), { session_id: "s", stop_hook_active: false });
  assert.deepEqual(mapPromptInput({ session_id: "s", cwd: "/p", prompt: "hi #qa" }), { session_id: "s", cwd: "/p", prompt: "hi #qa" });
  assert.deepEqual(renderStopOutput({ decision: "block", reason: "go" }), { decision: "block", reason: "go" });
  assert.deepEqual(renderStopOutput({ systemMessage: "Auto-QA skipped: x" }), { systemMessage: "Auto-QA skipped: x" });
  assert.equal(renderStopOutput(undefined), undefined);
});

test("Cursor's format: conversation id, the first workspace folder, loop_count as the loop guard, only normal endings, a followup message to continue", () => {
  const raw = { conversation_id: "c-1", workspace_roots: ["/work/shop", "/work/other"], status: "completed", loop_count: 0 };
  assert.deepEqual(mapStopInput(raw, CURSOR), { session_id: "c-1", cwd: "/work/shop", stop_hook_active: false });
  assert.equal(mapStopInput({ ...raw, loop_count: 1 }, CURSOR)?.stop_hook_active, true, "the follow-up of our own block");
  assert.equal(mapStopInput({ ...raw, loop_count: 4 }, CURSOR)?.stop_hook_active, true);
  assert.equal(mapStopInput({ ...raw, status: "aborted" }, CURSOR), undefined, "an aborted turn is not checked");
  assert.equal(mapStopInput({ ...raw, status: "error" }, CURSOR), undefined);
  assert.deepEqual(mapPromptInput({ conversation_id: "c-1", workspace_roots: ["/work/shop"], prompt: "add a field" }, CURSOR), { session_id: "c-1", cwd: "/work/shop", prompt: "add a field" });
  assert.deepEqual(renderStopOutput({ decision: "block", reason: "QAMind auto-QA. Run it." }, CURSOR), { followup_message: "QAMind auto-QA. Run it." });
  assert.equal(renderStopOutput({ systemMessage: "Auto-QA skipped: x" }, CURSOR), undefined, "Cursor has no way to show a notice from a stop hook");
  assert.deepEqual(mapStopInput({ conversation_id: 7, workspace_roots: "not a list", status: "completed" }, CURSOR), { session_id: "7", stop_hook_active: false }, "odd payloads give less, never an error");
});

test("a damaged or missing description of a host's hooks falls back to Claude Code's format and never throws", () => {
  for (const bad of [undefined, null, 5, "x", {}, { stop: {}, prompt: {} }, { stop: { input: {}, block_output: 3 }, prompt: { input: {} } }]) assert.equal(parseHookIo(bad), CLAUDE_IO);
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "broken.json"), "{ nope");
  fs.writeFileSync(path.join(dir, "empty.json"), "{}");
  fs.writeFileSync(path.join(dir, "host.json"), JSON.stringify({ auto_qa: { invoke: "Use {mode}.", hooks: cursor.auto_qa.hooks } }));
  assert.equal(readHostAutoConfig(path.join(dir, "broken.json")).io, CLAUDE_IO);
  assert.equal(readHostAutoConfig(path.join(dir, "empty.json")).io, CLAUDE_IO);
  assert.equal(readHostAutoConfig(path.join(dir, "missing.json")).io, CLAUDE_IO);
  assert.equal(readHostAutoConfig(undefined).io, CLAUDE_IO);
  const ok = readHostAutoConfig(path.join(dir, "host.json"));
  assert.equal(ok.invoke, "Use {mode}.");
  assert.deepEqual(renderStopOutput({ decision: "block", reason: "r" }, ok.io), { followup_message: "r" });
});

test("a QA command is recognised on hosts without namespaces, and the gate's own message is recognised as such", () => {
  for (const p of ["/qamind-qa-only", "/qamind-qa full", "/QAMIND-QA-ONLY diff", "/qamind:qa-only"]) assert.equal(isQaCommand(p), true, p);
  for (const p of ["/qamind-qa-auto on", "/qamind-qa-memory-review", "/qamind-qa-auto-run", "qamind-qa-only"]) assert.equal(isQaCommand(p), false, p);
  assert.equal(isContinuation("QAMind auto-QA. Auto-QA is turned on for this project."), true);
  assert.equal(isContinuation("  \nQAMind auto-QA. x"), true);
  assert.equal(isContinuation("please run QAMind auto-QA. now"), false);
});

test("the project folder comes from the host's variable, and a variable the host left unexpanded is not a folder", () => {
  assert.equal(defaultProjectDir({ QAMIND_PROJECT_DIR: "/a", CLAUDE_PROJECT_DIR: "/b", CURSOR_PROJECT_DIR: "/c" }, "/cwd"), "/a");
  assert.equal(defaultProjectDir({ CLAUDE_PROJECT_DIR: "/b", CURSOR_PROJECT_DIR: "/c" }, "/cwd"), "/b");
  assert.equal(defaultProjectDir({ CURSOR_PROJECT_DIR: "/c" }, "/cwd"), "/c");
  assert.equal(defaultProjectDir({ QAMIND_PROJECT_DIR: "${workspaceFolder}" }, "/cwd"), "/cwd", "Cursor may not expand it in the user-level file: fall back to where the server runs");
  assert.equal(defaultProjectDir({ QAMIND_PROJECT_DIR: "", CURSOR_PROJECT_DIR: "${x}/y" }, "/cwd"), "/cwd");
  assert.equal(defaultProjectDir({}, "/cwd"), "/cwd");
});

// ---- through the real command, with another host's payloads

const BIN = path.join(repoRoot, "cli", "src", "bin.ts");
class Project {
  readonly dir = makeProject({ remote: "https://github.com/acme/hosts.git", files: { "src/app.js": "1\n", ".gitignore": ".qa/\n.env.qa\n", "openapi.yaml": fs.readFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), "utf8") } });
  readonly home = tmp("qamind-home-");
  constructor() {
    fs.mkdirSync(path.join(this.dir, ".qa"), { recursive: true });
    fs.writeFileSync(path.join(this.dir, ".qa", "config.md"), DEMO_CONFIG);
    fs.writeFileSync(path.join(this.dir, ".env.qa"), Object.entries(DEMO_ENV).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  }
  run(args: string[], input?: unknown, env: Record<string, string> = {}, cwd = this.dir) {
    const e: NodeJS.ProcessEnv = { ...process.env, QAMIND_HOME: this.home, NODE_NO_WARNINGS: "1", QAMIND_DEBUG: "1", ...env };
    for (const k of ["QAMIND_AUTO", "NODE_TEST_CONTEXT", "CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "QAMIND_PROJECT_DIR"]) if (!(k in env)) delete e[k];
    const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env: e, input: input === undefined ? "" : typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8" });
    let json: any;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      /* not JSON */
    }
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, rule: /\(rule (\w+)\)/.exec(r.stderr)?.[1] };
  }
  edit(): void {
    fs.writeFileSync(path.join(this.dir, "src", "app.js"), `${Math.random()}\n`);
  }
}
const CFG = ["--host-config", path.join(repoRoot, "hosts", "cursor", "host.json")];
const cursorPrompt = (p: Project, text: string, id = "c1") => ({ conversation_id: id, workspace_roots: [p.dir], hook_event_name: "beforeSubmitPrompt", prompt: text });
const cursorStop = (p: Project, id = "c1", loop = 0, status = "completed") => ({ conversation_id: id, workspace_roots: [p.dir], hook_event_name: "stop", status, loop_count: loop });

test("the gate's own message coming back as a prompt starts no new task and writes nothing", () => {
  const p = new Project();
  p.run(["auto", "on"]);
  p.run(["auto", "set", "cooldown", "0"]);
  p.run(["hook", "user-prompt-submit", ...CFG], cursorPrompt(p, "change the app"));
  p.edit();
  const block = p.run(["hook", "stop", ...CFG], cursorStop(p));
  assert.ok(block.json?.followup_message, block.stderr);
  assert.match(block.json.followup_message, /^QAMind auto-QA\./);
  assert.match(block.json.followup_message, /skill `qamind-qa-auto-run` \(it is in your skills list\) with the mode `diff`/, "the host's own wording for running the skill");
  const before = listFiles(p.home).join("\n");
  p.run(["hook", "user-prompt-submit", ...CFG], cursorPrompt(p, block.json.followup_message));
  assert.equal(listFiles(p.home).join("\n"), before, "Cursor submitting the follow-up as the next prompt changes no state");
  p.edit();
  assert.equal(p.run(["hook", "stop", ...CFG], cursorStop(p, "c1", 1)).stdout, "", "and the Stop after it never blocks");
});

test("the project is found from CURSOR_PROJECT_DIR when the payload has nothing usable and the hook runs elsewhere", () => {
  const p = new Project();
  p.run(["auto", "on"]);
  const elsewhere = tmp("qamind-elsewhere-");
  const env = { CURSOR_PROJECT_DIR: p.dir };
  p.run(["hook", "user-prompt-submit", ...CFG], { conversation_id: "c9", prompt: "change it" }, env, elsewhere);
  p.edit();
  const out = p.run(["hook", "stop", ...CFG], { conversation_id: "c9", status: "completed", loop_count: 0 }, env, elsewhere);
  assert.ok(out.json?.followup_message, out.stderr);
  // an unexpanded variable is ignored and the payload's folder is used
  const p2 = new Project();
  p2.run(["auto", "on"]);
  p2.run(["hook", "user-prompt-submit", ...CFG], cursorPrompt(p2, "change it", "c2"), { QAMIND_PROJECT_DIR: "${workspaceFolder}" }, elsewhere);
  p2.edit();
  assert.ok(p2.run(["hook", "stop", ...CFG], cursorStop(p2, "c2"), { QAMIND_PROJECT_DIR: "${workspaceFolder}" }, elsewhere).json?.followup_message);
});

test("a host that gives the QA skill no session id: the run is matched by project, so the task that was a QA run is skipped", () => {
  const p = new Project();
  p.run(["auto", "on"]);
  p.run(["auto", "set", "cooldown", "0"]);
  p.run(["hook", "user-prompt-submit", ...CFG], cursorPrompt(p, "please test the checkout"));
  const started = p.run(["run", "start", "--mode", "quick", "--kind", "qa-only", "--host", "cursor"]);
  assert.equal(started.json?.status, "ready", started.stdout);
  assert.equal(started.json.run.session_id, undefined, "no session on the run");
  p.edit();
  const open = p.run(["hook", "stop", ...CFG], cursorStop(p));
  assert.equal(open.stdout, "");
  assert.equal(open.rule, "4", "an open run in the project is a QA run");
  assert.equal(p.run(["run", "finish", "--run", started.json.run.id]).status, 0);
  p.run(["hook", "user-prompt-submit", ...CFG], cursorPrompt(p, "ran qa and finished before this one", "c3"));
  const fin = JSON.parse(fs.readFileSync(path.join(p.home, "projects", fs.readdirSync(path.join(p.home, "projects"))[0] as string, "state", "last-run.json"), "utf8")) as { finished: string };
  assert.ok(fin.finished);
  p.edit();
  assert.ok(p.run(["hook", "stop", ...CFG], cursorStop(p, "c3")).json?.followup_message, "a later task is a normal task again");
});

test("`auto skipped` without a session applies to every session of the project", () => {
  const p = new Project();
  p.run(["auto", "on"]);
  p.run(["auto", "set", "cooldown", "0"]);
  assert.equal(p.run(["auto", "skipped", "--reason", "the app is not reachable"]).status, 0);
  p.run(["hook", "user-prompt-submit", ...CFG], cursorPrompt(p, "change", "c5"));
  p.edit();
  const out = p.run(["hook", "stop", ...CFG], cursorStop(p, "c5"));
  assert.equal(out.stdout, "");
  assert.equal(out.rule, "precondition");
  p.run(["hook", "user-prompt-submit", ...CFG], cursorPrompt(p, "change again #qa", "c6"));
  p.edit();
  assert.ok(p.run(["hook", "stop", ...CFG], cursorStop(p, "c6")).json?.followup_message, "a tag tries again");
});

test("the hook flag is optional and forgiving: an unknown flag, a missing or damaged host file all behave like Claude Code's format", () => {
  const p = new Project();
  p.run(["auto", "on"]);
  const claude = { session_id: "s", cwd: p.dir, stop_hook_active: false };
  assert.equal(p.run(["hook", "stop", "--bogus"], claude).status, 0);
  assert.equal(p.run(["hook", "stop", "--host-config", path.join(p.home, "missing.json")], claude).status, 0);
  fs.writeFileSync(path.join(p.home, "bad.json"), "{ nope");
  const bad = p.run(["hook", "stop", "--host-config", path.join(p.home, "bad.json")], claude);
  assert.deepEqual([bad.status, bad.stdout], [0, ""]);
  p.run(["hook", "user-prompt-submit"], { session_id: "s", cwd: p.dir, prompt: "x" });
  p.edit();
  p.run(["auto", "set", "cooldown", "0"]);
  assert.equal(p.run(["hook", "stop", "--host-config", path.join(p.home, "bad.json")], claude).json?.decision, "block", "a damaged host file means Claude Code's format");
});

// ---- the registry

test("a host folder is validated when it is read: ids, tiers and required fields", async () => {
  const dir = tmp("qamind-hosts-");
  const write = (name: string, json: unknown, adapter = true): void => {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, "host.json"), JSON.stringify(json));
    if (adapter) fs.writeFileSync(path.join(dir, name, "adapter.ts"), "export const adapter = { id: 'x' };\n");
  };
  const good = { id: "a", name: "A", tier: "experimental", auto_qa: { mode: "advisory" }, safety: "instructions", commands: {} };
  write("a", { ...good, id: "wrong" });
  assert.throws(() => readHostJson(path.join(dir, "a")), /says id "wrong" but the folder is "a"/);
  write("b", { ...good, id: "b", tier: "great" });
  assert.throws(() => readHostJson(path.join(dir, "b")), /tier must be full, experimental or instruction-only/);
  write("c", { id: "c", name: "C" });
  assert.throws(() => readHostJson(path.join(dir, "c")), /has no "tier"/);
  fs.rmSync(path.join(dir, "a"), { recursive: true });
  fs.rmSync(path.join(dir, "b"), { recursive: true });
  fs.rmSync(path.join(dir, "c"), { recursive: true });
  write("d", { ...good, id: "d" });
  await assert.rejects(() => discoverHosts(dir), /adapter\.ts must export `adapter` with id "d"/);
  fs.mkdirSync(path.join(dir, "notahost"));
  fs.rmSync(path.join(dir, "d"), { recursive: true });
  assert.deepEqual(await discoverHosts(dir), [], "a folder without host.json and adapter.ts is not a host");
});
