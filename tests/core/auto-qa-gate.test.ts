import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { DEMO_CONFIG, DEMO_ENV, git, listFiles, makeProject, repoRoot, tmp } from "./helpers.ts";

/**
 * Every gate rule of spec 9.5, driven the way Claude Code drives it: hook JSON on the real CLI's stdin, the answer read from its stdout.
 * Each test is its own project and its own QAMIND_HOME.
 */
const BIN = path.join(repoRoot, "cli", "src", "bin.ts");

interface Out {
  status: number | null;
  json?: { decision?: string; reason?: string; systemMessage?: string };
  stdout: string;
  stderr: string;
  rule?: string;
}

class Scenario {
  readonly proj: string;
  readonly home = tmp("qamind-home-");
  constructor(opts: { git?: boolean; configured?: boolean } = {}) {
    const files: Record<string, string> = { "src/app.js": "1\n", "src/other.js": "o\n", "README.md": "# r\n", ".gitignore": ".qa/\n.env.qa\n", "openapi.yaml": fs.readFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), "utf8") };
    this.proj = makeProject({ ...(opts.git === false ? { git: false } : {}), files });
    if (opts.configured !== false) {
      fs.mkdirSync(path.join(this.proj, ".qa"), { recursive: true });
      fs.writeFileSync(path.join(this.proj, ".qa", "config.md"), DEMO_CONFIG);
      fs.writeFileSync(path.join(this.proj, ".env.qa"), Object.entries(DEMO_ENV).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
    }
  }

  run(args: string[], input?: unknown, env: Record<string, string> = {}): Out {
    const e: NodeJS.ProcessEnv = { ...process.env, QAMIND_HOME: this.home, NODE_NO_WARNINGS: "1", QAMIND_DEBUG: "1", ...env };
    for (const k of ["QAMIND_AUTO", "NODE_TEST_CONTEXT", "CLAUDE_PROJECT_DIR", ...Object.keys(env).filter((k) => env[k] === "")]) if (!(k in env) || env[k] === "") delete e[k];
    const r = spawnSync(process.execPath, [BIN, ...args], { cwd: this.proj, env: e, input: input === undefined ? "" : typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8" });
    let json: Out["json"];
    try {
      json = JSON.parse(r.stdout) as Out["json"];
    } catch {
      /* not JSON */
    }
    const rule = /\(rule (\w+)\)/.exec(r.stderr)?.[1];
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, ...(json ? { json } : {}), ...(rule ? { rule } : {}) };
  }

  auto(...args: string[]): Record<string, any> {
    const r = this.run(["auto", ...args]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    return JSON.parse(r.stdout) as Record<string, any>;
  }

  prompt(text: string, session = "s1", env: Record<string, string> = {}): Out {
    return this.run(["hook", "user-prompt-submit"], { session_id: session, cwd: this.proj, hook_event_name: "UserPromptSubmit", prompt: text }, env);
  }

  stop(session = "s1", active = false, env: Record<string, string> = {}): Out {
    return this.run(["hook", "stop"], { session_id: session, cwd: this.proj, hook_event_name: "Stop", stop_hook_active: active }, env);
  }

  /** A whole task: the prompt, then the agent's edits, then the Stop. */
  task(text: string, edits: () => void = () => this.edit(), session = "s1", env: Record<string, string> = {}): Out {
    this.prompt(text, session, env);
    edits();
    return this.stop(session, false, env);
  }

  edit(file = "src/app.js", content = `${Math.random()}\n`): void {
    fs.mkdirSync(path.dirname(path.join(this.proj, file)), { recursive: true });
    fs.writeFileSync(path.join(this.proj, file), content);
  }

  get store(): string {
    return path.join(this.home, "projects", this.auto("status")["project"].id);
  }

  stateFile(name: string): string {
    return path.join(this.store, "state", name);
  }
}

const blocked = (o: Out): boolean => o.json?.decision === "block";
const reasonOf = (o: Out): string => o.json?.reason ?? "";

test("default is OFF: a whole task leaves nothing behind and Claude stops normally", () => {
  const s = new Scenario();
  const out = s.task("change the app");
  assert.equal(out.status, 0);
  assert.equal(out.stdout, "");
  assert.equal(out.rule, "2");
  assert.deepEqual(listFiles(s.home), [], "nothing at all was written to the user store");
  assert.equal(s.auto("status")["enabled"], false);
});

test("auto on: a task that changes code is blocked once, with mode, the exact files, budget and the skill to run", () => {
  const s = new Scenario();
  s.auto("on");
  const out = s.task("change the app", () => {
    s.edit("src/app.js");
    s.edit("src/new.js");
  });
  assert.equal(out.status, 0);
  assert.ok(blocked(out), out.stdout + out.stderr);
  assert.deepEqual(Object.keys(out.json ?? {}).sort(), ["decision", "reason"]);
  const reason = reasonOf(out);
  assert.match(reason, /changed 2 files/);
  assert.match(reason, /- src\/app\.js/);
  assert.match(reason, /- src\/new\.js/);
  assert.doesNotMatch(reason, /other\.js|README/);
  assert.match(reason, /Mode: diff/);
  assert.match(reason, /Time budget: about 5 minutes/);
  assert.match(reason, /skill `qamind:qa-auto-run`/);
});

test("rule 3, loop prevention: the Stop that follows our own block changes nothing and lets Claude stop, however often it comes", () => {
  const s = new Scenario();
  s.auto("on");
  assert.ok(blocked(s.task("go")));
  const before = listFiles(s.home).join();
  for (let i = 0; i < 4; i++) {
    const again = s.stop("s1", true);
    assert.equal(again.stdout, "", "no second block");
    assert.equal(again.rule, "3");
  }
  assert.equal(listFiles(s.home).join(), before, "and no state moved");
  s.edit("src/other.js"); // even with new changes, stop_hook_active wins
  assert.equal(s.stop("s1", true).stdout, "");
});

test("rule 3 beats everything below it: with the flag set, not even a forcing tag blocks", () => {
  const s = new Scenario();
  s.prompt("#qa-full do it");
  s.edit();
  assert.equal(s.stop("s1", true).stdout, "");
});

test("rule 1: #noqa skips the task, in any case and anywhere, and only that task", () => {
  const s = new Scenario();
  s.auto("on");
  const out = s.task("quick tweak, no need for QA #NoQA");
  assert.equal(out.stdout, "");
  assert.equal(out.rule, "1");
  s.auto("set", "cooldown", "0");
  assert.ok(blocked(s.task("a real change")), "the next task is checked again");
});

test("rule 1 wins over a forcing tag in the same prompt", () => {
  const s = new Scenario();
  const out = s.task("#qa #noqa");
  assert.equal(out.stdout, "");
  assert.equal(out.rule, "1");
});

test("rule 2: with auto off a task is skipped, and a tag forces one run (mode diff) only for that task", () => {
  const s = new Scenario();
  const forced = s.task("tweak #qa");
  assert.ok(blocked(forced), forced.stderr);
  assert.match(reasonOf(forced), /Mode: diff/);
  assert.match(reasonOf(forced), /#qa tag/);
  s.auto("set", "cooldown", "0");
  assert.equal(s.task("tweak again").stdout, "", "no tag, auto off: skipped");
});

test("#qa-full forces a full report-only run and #qa-fix forces fix mode; tags are case-insensitive", () => {
  const s = new Scenario();
  const full = s.task("do it #QA-Full");
  assert.ok(blocked(full));
  assert.match(reasonOf(full), /Mode: full/);
  assert.match(reasonOf(full), /arguments `full`/);
  assert.match(reasonOf(full), /slow/);
  const fix = s.task("and again #qa-fix");
  assert.ok(blocked(fix), "a forcing tag ignores the cooldown");
  assert.match(reasonOf(fix), /Mode: fix/);
  assert.match(reasonOf(fix), /arguments `fix`/);
});

test("a forcing tag uses the configured mode when auto is on (and diff when the mode is ask)", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("mode", "quick");
  assert.match(reasonOf(s.task("x #qa")), /Mode: quick/);
  s.auto("mode", "ask");
  assert.match(reasonOf(s.task("y #qa")), /Mode: diff/);
});

test("a tag only counts for its own task: the next task is judged on its own", () => {
  const s = new Scenario();
  assert.ok(blocked(s.task("#qa one")));
  assert.equal(s.task("two").stdout, "");
});

test("a stale tag cannot fire later: a #qa task that never reached Stop is forgotten by the next prompt", () => {
  const s = new Scenario();
  s.prompt("#qa-fix risky"); // interrupted: no Stop ever came
  s.prompt("something else"); // auto is off and this prompt has no tag
  s.edit();
  const out = s.stop();
  assert.equal(out.stdout, "");
  assert.equal(out.rule, "2");
});

test("rule 4: a QA command is a QA run, so no auto-QA follows it", () => {
  const s = new Scenario();
  s.auto("on");
  for (const p of ["/qamind:qa-only diff", "/qamind:qa full", "/qa-only", "/qa quick"]) {
    s.auto("set", "cooldown", "0");
    const out = s.task(p);
    assert.equal(out.stdout, "", p);
    assert.equal(out.rule, "4", p);
  }
});

test("rule 4: a run that is still open in this session, and one that finished during this task, both count as a QA run", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("set", "cooldown", "0");
  s.prompt("run the auto skill", "S9");
  const started = s.run(["run", "start", "--mode", "diff", "--kind", "qa-only", "--trigger", "auto", "--session", "S9"]);
  assert.equal(JSON.parse(started.stdout).status, "ready", started.stdout);
  s.edit();
  const open = s.stop("S9");
  assert.equal(open.stdout, "");
  assert.equal(open.rule, "4", "the marker is still active");
  // another session's marker is not this session's task
  assert.ok(blocked(s.task("edit in another session", () => s.edit("src/other.js"), "S10")), "the open marker belongs to S9, not to S10's task");
  const runId = JSON.parse(started.stdout).run.id as string;
  assert.equal(s.run(["run", "finish", "--run", runId]).status, 0);
  s.auto("set", "cooldown", "0");
  s.prompt("next task in S9", "S9");
  s.edit("src/other.js");
  assert.ok(blocked(s.stop("S9")), "a later task is a normal task again");
});

test("rule 4: a run finished after the prompt means the task was a QA run", () => {
  const s = new Scenario();
  s.auto("on");
  s.prompt("please test it", "S2");
  const started = JSON.parse(s.run(["run", "start", "--mode", "diff", "--kind", "qa-only", "--trigger", "manual", "--session", "S2"]).stdout);
  s.edit();
  assert.equal(s.run(["run", "finish", "--run", started.run.id]).status, 0);
  const out = s.stop("S2");
  assert.equal(out.stdout, "");
  assert.equal(out.rule, "4");
  assert.equal(JSON.parse(fs.readFileSync(s.stateFile("last-run.json"), "utf8")).session_id, "S2");
});

test("rule 5: a task that changed nothing, only documentation, only lock files, or only ignored paths does not run QA", () => {
  const s = new Scenario();
  s.auto("on");
  assert.equal(s.task("just talk", () => {}).rule, "5");
  s.auto("set", "cooldown", "0");
  assert.equal(s.task("docs", () => {
    s.edit("README.md");
    s.edit("docs/guide.txt");
    s.edit("notes/NOTES.md");
  }).rule, "5");
  assert.equal(s.task("locks", () => {
    s.edit("package-lock.json", "{}\n");
    s.edit("yarn.lock", "x\n");
  }).rule, "5");
  s.auto("set", "ignore", "src/generated/**,*.snap");
  assert.equal(s.task("ignored", () => s.edit("src/generated/api.js")).rule, "5");
  assert.ok(blocked(s.task("code", () => s.edit("README.md.js"))), "a custom ignore list replaces the default one and still lets code through");
  s.auto("set", "ignore", "default");
  assert.equal(s.task("docs again", () => s.edit("README.md")).rule, "5");
});

test("rule 5: work the user had in progress before the prompt is not the task's change", () => {
  const s = new Scenario();
  s.auto("on");
  s.edit("src/other.js", "my own unfinished edit\n"); // dirty before the task starts
  const out = s.task("small change", () => s.edit("src/app.js"));
  assert.ok(blocked(out));
  assert.match(reasonOf(out), /changed 1 file /);
  assert.doesNotMatch(reasonOf(out), /other\.js/);
});

test("rule 5: a file the agent committed during the task still counts", () => {
  const s = new Scenario();
  s.auto("on");
  const out = s.task("change and commit", () => {
    s.edit("src/app.js");
    git(s.proj, "commit", "-qam", "agent commit");
  });
  assert.ok(blocked(out), out.stderr);
  assert.match(reasonOf(out), /- src\/app\.js/);
});

test("rule 5: the same state as the last auto run is skipped, even when the task touched files", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("set", "cooldown", "0");
  assert.ok(blocked(s.task("v1", () => s.edit("src/app.js", "v1\n"))));
  s.edit("src/app.js", "v2\n"); // the user edits it themselves, between tasks
  const out = s.task("back to v1", () => s.edit("src/app.js", "v1\n"));
  assert.equal(out.stdout, "");
  assert.equal(out.rule, "5");
  assert.match(out.stderr, /nothing changed since the last auto-QA run/);
});

test("rule 5: outside a git repository it skips, with a one-time warning per session", () => {
  const s = new Scenario({ git: false });
  s.auto("on");
  const first = s.task("change");
  assert.equal(first.json?.decision, undefined);
  assert.match(first.json?.systemMessage ?? "", /^Auto-QA skipped: this folder is not a git repository/);
  const second = s.task("change again");
  assert.equal(second.stdout, "", "not repeated in the same session");
  assert.match(s.task("another session", undefined, "other").json?.systemMessage ?? "", /not a git repository/);
});

test("rule 6: cooldown skips a second run inside the window and allows one after it, or after a tag", () => {
  const s = new Scenario();
  s.auto("on");
  assert.ok(blocked(s.task("one")));
  const soon = s.task("two");
  assert.equal(soon.stdout, "");
  assert.equal(soon.rule, "6");
  assert.ok(blocked(s.task("three #qa")), "a tag ignores the cooldown");
  // a run that started 10 minutes ago is outside the default 3 minutes
  const last = JSON.parse(fs.readFileSync(s.stateFile("auto-last.json"), "utf8"));
  fs.writeFileSync(s.stateFile("auto-last.json"), JSON.stringify({ ...last, at: new Date(Date.now() - 10 * 60_000).toISOString() }));
  assert.ok(blocked(s.task("four")));
  s.auto("set", "cooldown", "0");
  assert.ok(blocked(s.task("five")), "cooldown 0 means every task");
  s.auto("set", "cooldown", "30");
  assert.equal(s.task("six").rule, "6");
});

test("the cooldown is set when the run is asked for, so a QA run that cannot finish still does not repeat", () => {
  const s = new Scenario();
  s.auto("on");
  assert.ok(blocked(s.task("one")));
  const last = JSON.parse(fs.readFileSync(s.stateFile("auto-last.json"), "utf8"));
  assert.equal(last.mode, "diff");
  assert.deepEqual(last.files, ["src/app.js"]);
  assert.equal(last.session_id, "s1");
});

test("pause: skipped while paused, back on by itself when the time is up, and `resume` ends it", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("set", "cooldown", "0");
  s.auto("pause", "1h");
  const paused = s.task("while paused");
  assert.equal(paused.stdout, "");
  assert.equal(paused.rule, "2");
  assert.match(paused.stderr, /paused until/);
  const file = path.join(s.store, "auto.json");
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), paused_until: new Date(Date.now() - 1000).toISOString() }));
  assert.ok(blocked(s.task("pause expired")));
  s.auto("pause", "2h");
  s.auto("resume");
  assert.ok(blocked(s.task("resumed")));
  assert.throws(() => s.auto("pause", "soon"));
});

test("QAMIND_AUTO=0 switches it off for the session whatever the files say, but a tag still forces a run", () => {
  const s = new Scenario();
  s.auto("on");
  s.run(["auto", "global", "on"]);
  const off = s.task("change", undefined, "s1", { QAMIND_AUTO: "0" });
  assert.equal(off.stdout, "");
  assert.match(off.stderr, /QAMIND_AUTO=0/);
  assert.ok(blocked(s.task("change #qa", undefined, "s1", { QAMIND_AUTO: "0" })));
  s.auto("set", "cooldown", "0");
  assert.ok(blocked(s.task("QAMIND_AUTO=1 is not an override", undefined, "s1", { QAMIND_AUTO: "1" })));
});

test("global default: on for every project without a setting of its own; the project's own off wins", () => {
  const s = new Scenario();
  s.auto("global", "on");
  assert.ok(blocked(s.task("global on")));
  s.auto("set", "cooldown", "0");
  s.auto("off");
  assert.equal(s.task("project off").rule, "2");
  s.auto("on");
  s.auto("global", "off");
  assert.ok(blocked(s.task("project on, global off")));
});

test("`/qa-auto off` takes effect on the very next task, even in the same session", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("set", "cooldown", "0");
  assert.ok(blocked(s.task("task one")));
  s.auto("off");
  assert.equal(s.task("task two").stdout, "");
  s.auto("on");
  assert.ok(blocked(s.task("task three")));
});

test("turning auto on during a task does not run QA at its end: the task began before there was a snapshot", () => {
  const s = new Scenario();
  s.prompt("/qamind:qa-auto on"); // auto is off at the prompt: nothing recorded
  s.auto("on");
  s.edit(); // pre-existing mess that the toggle task did not make
  const out = s.stop();
  assert.equal(out.stdout, "");
  assert.equal(out.rule, "5");
  assert.ok(blocked(s.task("the next task", () => s.edit("src/other.js"))), "from the next task on it works");
});

test("preconditions: a missing config or missing logins are reported once per session, not on every turn", () => {
  const s = new Scenario({ configured: false });
  s.auto("on");
  const first = s.task("change");
  assert.match(first.json?.systemMessage ?? "", /^Auto-QA skipped: this project has no \.qa\/config\.md yet/);
  s.auto("set", "cooldown", "0");
  assert.equal(s.task("change again").stdout, "");
  assert.match(s.task("another session", undefined, "s2").json?.systemMessage ?? "", /no \.qa\/config\.md/);

  const t = new Scenario();
  t.auto("on");
  fs.writeFileSync(path.join(t.proj, ".env.qa"), "NOTHING=1\n");
  const noCreds = t.task("change");
  assert.match(noCreds.json?.systemMessage ?? "", /no test account has both its username and password/);
  assert.doesNotMatch(noCreds.stdout, new RegExp(Object.values(DEMO_ENV)[1] as string), "no credential value is ever printed");
  t.auto("set", "cooldown", "0");
  assert.equal(t.task("change again").stdout, "");
  assert.equal(blocked(t.task("with a tag #qa")), false, "still cannot run without logins, even with a tag");
});

test("a skip the QA skill reports (app not reachable) is told once and then the session is left alone", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("set", "cooldown", "0");
  assert.ok(blocked(s.task("one")));
  s.auto("skipped", "--session", "s1", "--reason", "the app is not reachable at http://localhost:3000");
  assert.equal(s.task("two").stdout, "", "no more attempts this session");
  assert.ok(blocked(s.task("three #qa")), "a tag tries again");
  assert.ok(blocked(s.task("four", undefined, "s2")), "a new session tries again");
});

test("ask mode: Claude is told to ask, and what each answer does", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("mode", "ask");
  const out = s.task("change");
  assert.ok(blocked(out));
  assert.match(reasonOf(out), /Run QA on these changes\? \(yes \/ no \/ always \/ never\)/);
  assert.match(reasonOf(out), /qamind auto mode diff/);
  assert.match(reasonOf(out), /qamind auto off/);
});

test("modes: quick and fix put their mode, and only diff/quick a time budget, into the reason", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("set", "cooldown", "0");
  s.auto("set", "budget", "9");
  s.auto("mode", "quick");
  const quick = reasonOf(s.task("q"));
  assert.match(quick, /Mode: quick/);
  assert.match(quick, /Time budget: about 9 minutes/);
  s.auto("mode", "fix");
  const fix = reasonOf(s.task("f"));
  assert.match(fix, /Mode: fix/);
  assert.doesNotMatch(fix, /Time budget/);
  s.auto("mode", "full");
  assert.match(reasonOf(s.task("g")), /Mode: full/);
});

test("sessions are independent: one session's tag does not leak into another", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("set", "cooldown", "0");
  s.prompt("quiet #noqa", "A");
  s.prompt("normal", "B");
  s.edit();
  assert.ok(blocked(s.stop("B")));
  assert.equal(s.stop("A").rule, "1");
});

test("the hooks never fail the host: garbage, empty input, a missing folder and unknown fields all exit 0 with no output", () => {
  const s = new Scenario();
  s.auto("on");
  for (const sub of ["stop", "user-prompt-submit"]) {
    for (const input of ["", "not json", "[]", "null", "{}", JSON.stringify({ cwd: "/definitely/not/here", session_id: "x" }), JSON.stringify({ session_id: 7, cwd: 5, prompt: {} })]) {
      const r = s.run(["hook", sub], input);
      assert.equal(r.status, 0, `${sub} ${input}: ${r.stderr}`);
      assert.equal(r.stdout, "", `${sub} ${input}`);
    }
  }
});

test("a corrupt settings or state file never breaks a task", () => {
  const s = new Scenario();
  s.auto("on");
  s.auto("set", "cooldown", "0");
  s.prompt("task");
  fs.writeFileSync(path.join(s.store, "state", "next-run.json"), "{ broken");
  s.edit();
  assert.equal(s.stop().status, 0);
  fs.writeFileSync(path.join(s.store, "auto.json"), "{ broken");
  const out = s.task("task with broken settings");
  assert.equal(out.status, 0);
  assert.equal(out.stdout, "", "unreadable settings mean OFF");
  assert.equal(s.auto("status")["enabled"], false);
  assert.equal(s.auto("on")["effective"].enabled, true, "and `on` repairs the file");
});

test("a settings file from a newer QAMind keeps it off and `on` refuses to overwrite it", () => {
  const s = new Scenario();
  s.auto("on");
  fs.writeFileSync(path.join(s.store, "auto.json"), JSON.stringify({ schema_version: 99, enabled: true }));
  assert.equal(s.task("change").stdout, "");
  assert.equal(s.run(["auto", "off"]).status, 1);
});

test("`auto status` says what is on, why, the last run and what would trigger next", () => {
  const s = new Scenario();
  const off = s.auto("status");
  assert.equal(off["enabled"], false);
  assert.match(off["because"], /off by default/);
  assert.match(off["would_trigger_next"], /#qa/);
  assert.equal(off["last_auto_run"], null);
  s.auto("on");
  s.task("change");
  const on = s.auto("status");
  assert.equal(on["enabled"], true);
  assert.match(on["because"], /turned on for this project/);
  assert.equal(on["last_auto_run"].files, 1);
  assert.match(on["would_trigger_next"], /diff QA run, at most one every 3 minutes/);
  assert.match(s.auto("global", "on")["message"], /on by default/);
});

test("`auto on` warns about a folder that is not a repository or has no config, and mode warns about fix and full", () => {
  const s = new Scenario({ git: false, configured: false });
  const on = s.auto("on");
  assert.equal(on["warnings"].length, 2);
  assert.match(s.auto("mode", "fix")["warnings"][0], /never pushes or merges/);
  assert.match(s.auto("mode", "full")["warnings"][0], /slow/);
  assert.equal(s.run(["auto", "mode", "turbo"]).status, 2);
  assert.equal(s.run(["auto", "bogus"]).status, 2);
  assert.equal(s.run(["auto", "pause"]).status, 2);
});

// ---- the approval of the one Skill call that answers a block ----
const skillCall = (s: Scenario, session = "s1", skill = "qamind:qa-auto-run"): Out => s.run(["hook", "pre-tool-use"], { session_id: session, cwd: s.proj, hook_event_name: "PreToolUse", tool_name: "Skill", tool_input: { skill, args: "diff" } });
const approved = (o: Out): boolean => (o.json as { hookSpecificOutput?: { permissionDecision?: string } } | undefined)?.hookSpecificOutput?.permissionDecision === "allow";

test("the skill call that answers a block is approved by the hook, once, so the user is not asked each time", () => {
  const s = new Scenario();
  s.auto("on");
  assert.equal(skillCall(s).stdout, "", "nothing is approved before the gate asked for it");
  assert.ok(blocked(s.task("change")));
  const first = skillCall(s);
  assert.ok(approved(first), first.stdout + first.stderr);
  assert.match(JSON.stringify(first.json), /auto-QA asked for this QA run \(diff mode\)/);
  assert.equal(skillCall(s).stdout, "", "one approval per block");
});

test("only that skill, only in that session, only for 30 minutes, and only after a block", () => {
  const s = new Scenario();
  s.auto("on");
  assert.ok(blocked(s.task("change")));
  assert.equal(skillCall(s, "s1", "qamind:qa-only").stdout, "", "no other skill is approved");
  assert.equal(skillCall(s, "s1", "qamind:qa").stdout, "");
  assert.equal(skillCall(s, "other-session").stdout, "", "another session has no pending run");
  const file = s.stateFile("auto-pending.json");
  const pending = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ s1: { ...pending.s1, at: new Date(Date.now() - 31 * 60_000).toISOString() } }));
  assert.equal(skillCall(s).stdout, "", "a pending run that is 31 minutes old is not honoured");
  const none = new Scenario();
  assert.equal(skillCall(none).stdout, "", "a project that never used auto-QA");
  assert.deepEqual(listFiles(none.home), [], "and it writes nothing there");
});

test("the safety hook still ignores other tools and a Skill call never reaches its Bash and write rules", () => {
  const s = new Scenario();
  s.auto("on");
  assert.ok(blocked(s.task("change")));
  const bash = s.run(["hook", "pre-tool-use"], { session_id: "s1", cwd: s.proj, tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(bash.stdout, "");
  assert.ok(approved(skillCall(s)), "and the approval is still there for the skill");
});

test("the project is the host's project folder when it names one, whatever folder the session happens to be in", () => {
  const s = new Scenario();
  s.auto("on");
  const sub = path.join(s.proj, "src");
  const env = { CLAUDE_PROJECT_DIR: s.proj };
  s.run(["hook", "user-prompt-submit"], { session_id: "s1", cwd: sub, prompt: "change" }, env);
  s.edit();
  const out = s.run(["hook", "stop"], { session_id: "s1", cwd: sub, stop_hook_active: false }, env);
  assert.ok(blocked(out), out.stderr);
  // without it the folder is taken as it is: a different project to QAMind, which never opted in
  s.run(["hook", "user-prompt-submit"], { session_id: "s2", cwd: sub, prompt: "change" });
  s.edit("src/other.js");
  const plain = s.run(["hook", "stop"], { session_id: "s2", cwd: sub, stop_hook_active: false });
  assert.equal(plain.stdout, "");
  assert.equal(plain.rule, "2");
});
