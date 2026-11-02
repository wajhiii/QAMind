import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { Op } from "../../hosts/host-api.ts";
import { applyOps, revertOps, verifyOps } from "../../cli/src/setup/ops.ts";
import type { Applied, CommandRunner } from "../../cli/src/setup/ops.ts";
import { listFiles, tmp } from "./helpers.ts";

// The engine behind setup, status and uninstall: every host's install is a list of these edits, so these properties hold for every host.

const sandbox = (): { root: string; backups: string; at: (...p: string[]) => string } => {
  const root = tmp("qamind-ops-");
  return { root, backups: path.join(root, "backups"), at: (...p) => path.join(root, "home", ...p) };
};
const apply = (ops: Op[], prior: Applied[], backups: string, run?: CommandRunner) => applyOps(ops, prior, { backupDir: backups, ...(run ? { run } : {}) });
const text = (f: string): string => fs.readFileSync(f, "utf8");
const json = (f: string): any => JSON.parse(text(f));

// ---- files

test("a file is created, left alone when identical, updated when it is ours, and its folders are removed with it", () => {
  const s = sandbox();
  const f = s.at(".host", "skills", "one", "SKILL.md");
  const op: Op = { op: "file", path: f, content: "v1\n" };
  const first = apply([op], [], s.backups);
  assert.deepEqual([first.changed.length, first.unchanged.length, first.applied[0]?.created], [1, 0, true]);
  const again = apply([op], first.applied, s.backups);
  assert.deepEqual([again.changed.length, again.unchanged.length], [0, 1], "idempotent");
  const upd = apply([{ ...op, content: "v2\n" }], again.applied, s.backups);
  assert.equal(text(f), "v2\n");
  assert.equal(upd.applied[0]?.backup, undefined, "our own untouched file is updated without a backup");
  assert.ok(!fs.existsSync(s.backups), "no backup folder was made");
  const gone = revertOps(upd.applied);
  assert.deepEqual(listFiles(s.root), [], "the file and every folder setup created are gone");
  assert.equal(gone.kept.length, 0);
});

test("a file that was already there is backed up before it is overwritten, and put back on uninstall", () => {
  const s = sandbox();
  const f = s.at("rules.md");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "the user's own\n");
  const r = apply([{ op: "file", path: f, content: "ours\n" }], [], s.backups);
  assert.equal(text(f), "ours\n");
  const backup = r.applied[0]?.backup as string;
  assert.equal(text(backup), "the user's own\n");
  const out = revertOps(r.applied);
  assert.equal(text(f), "the user's own\n", "uninstall restores what was there");
  assert.match(out.removed[0] ?? "", /the original was put back/);
});

test("a file the user changed after setup is left in place on uninstall, and said so", () => {
  const s = sandbox();
  const f = s.at("a", "b.md");
  const r = apply([{ op: "file", path: f, content: "ours\n" }], [], s.backups);
  fs.writeFileSync(f, "ours, then edited by the user\n");
  const out = revertOps(r.applied);
  assert.ok(fs.existsSync(f));
  assert.match(out.kept[0] ?? "", /changed after QAMind wrote it/);
});

test("an identical file that was already there is not ours, so uninstall leaves it", () => {
  const s = sandbox();
  const f = s.at("same.md");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "x\n");
  const r = apply([{ op: "file", path: f, content: "x\n" }], [], s.backups);
  assert.equal(r.applied[0]?.created, false);
  revertOps(r.applied);
  assert.ok(fs.existsSync(f));
});

test("a folder that was already there stays after uninstall, one setup made does not", () => {
  const s = sandbox();
  fs.mkdirSync(s.at(".host", "skills"), { recursive: true });
  const r = apply([{ op: "file", path: s.at(".host", "skills", "x", "SKILL.md"), content: "x" }], [], s.backups);
  revertOps(r.applied);
  assert.ok(fs.existsSync(s.at(".host", "skills")), "the user's empty folder is still there");
  assert.ok(!fs.existsSync(s.at(".host", "skills", "x")), "the folder setup made is gone");
});

// ---- JSON config files

const mcp = (name: string, extra: Record<string, unknown> = {}): Op => ({ op: "json", path: "", keyPath: ["mcpServers", name], value: { command: "node", args: [`/app/${name}.mjs`], ...extra } });
const at = (op: Op, p: string): Op => ({ ...op, path: p }) as Op;

test("an entry is merged into a config that other tools use, and uninstall removes only that entry", () => {
  const s = sandbox();
  const f = s.at(".host", "mcp.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ mcpServers: { theirs: { command: "x" } }, other: 1 }));
  const r = apply([at(mcp("qa-memory"), f), at(mcp("browser"), f)], [], s.backups);
  assert.deepEqual(Object.keys(json(f).mcpServers).sort(), ["browser", "qa-memory", "theirs"]);
  assert.equal(json(f).other, 1);
  revertOps(r.applied);
  assert.deepEqual(json(f), { mcpServers: { theirs: { command: "x" } }, other: 1 }, "exactly what was there before");
});

test("a config QAMind created is removed when nothing else is in it; a changed entry is left alone", () => {
  const s = sandbox();
  const f = s.at(".host", "mcp.json");
  const r = apply([at(mcp("qa-memory"), f), at(mcp("browser"), f)], [], s.backups);
  assert.equal(r.applied[0]?.created, true);
  assert.equal(r.applied[1]?.created, false, "only the first edit made the file");
  const edited = json(f);
  edited.mcpServers.browser.args = ["/somewhere/else.mjs"];
  fs.writeFileSync(f, JSON.stringify(edited));
  const out = revertOps(r.applied);
  assert.deepEqual(Object.keys(json(f).mcpServers), ["browser"], "the entry the user changed stays");
  assert.match(out.kept[0] ?? "", /was changed after QAMind wrote it/);
  assert.ok(fs.existsSync(f));
  fs.writeFileSync(f, JSON.stringify({ mcpServers: { qa: 1 } }));
  fs.rmSync(f);
  revertOps(r.applied);
  assert.deepEqual(listFiles(s.root), [], "nothing is left, not even the folder");
});

test("a re-run changes nothing and a changed value is replaced, then restored on uninstall", () => {
  const s = sandbox();
  const f = s.at("c.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ mcpServers: { "qa-memory": { command: "their-version" } } }));
  const r1 = apply([at(mcp("qa-memory"), f)], [], s.backups);
  assert.equal(r1.changed.length, 1);
  assert.equal(r1.applied[0]?.hadPrevious, true);
  const r2 = apply([at(mcp("qa-memory"), f)], r1.applied, s.backups);
  assert.deepEqual([r2.changed.length, r2.unchanged.length], [0, 1]);
  assert.equal(r2.applied[0]?.hadPrevious, true, "the first install's memory of the original survives a re-run");
  revertOps(r2.applied);
  assert.deepEqual(json(f), { mcpServers: { "qa-memory": { command: "their-version" } } });
});

test("a list entry is found by a field, replaced in place on a re-run, and removed alone", () => {
  const s = sandbox();
  const f = s.at("hooks.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ version: 1, hooks: { stop: [{ command: "their-hook.sh" }] } }));
  const entry = (cmd: string): Op => ({ op: "json", path: f, keyPath: ["hooks", "stop"], arrayMatch: { field: "command", equals: "qamind-stop" }, value: { command: "qamind-stop", timeout: cmd } });
  const r1 = apply([entry("30")], [], s.backups);
  assert.equal(json(f).hooks.stop.length, 2);
  const r2 = apply([entry("45")], r1.applied, s.backups);
  assert.deepEqual(json(f).hooks.stop.map((h: { command: string }) => h.command), ["their-hook.sh", "qamind-stop"], "replaced, not appended twice");
  assert.equal(json(f).hooks.stop[1].timeout, "45");
  revertOps(r2.applied);
  assert.deepEqual(json(f), { version: 1, hooks: { stop: [{ command: "their-hook.sh" }] } });
});

test("a file that is not valid JSON is never overwritten", () => {
  const s = sandbox();
  const f = s.at("broken.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "{ not json // with a comment");
  assert.throws(() => apply([at(mcp("qa-memory"), f)], [], s.backups), /Refusing to edit .*not valid JSON/);
  assert.equal(text(f), "{ not json // with a comment");
  fs.writeFileSync(f, "[1,2]");
  assert.throws(() => apply([at(mcp("qa-memory"), f)], [], s.backups), /not a JSON object/);
  fs.writeFileSync(f, JSON.stringify({ mcpServers: [] }));
  assert.throws(() => apply([at(mcp("qa-memory"), f)], [], s.backups), /is not an object/);
});

// ---- marked sections in text files

const section = (p: string, body = "Run QA with the skill."): Op => ({ op: "block", path: p, id: "qamind", text: body, syntax: "html" });

test("a section is added to a file the user owns and removed alone; a file QAMind made is removed whole", () => {
  const s = sandbox();
  const f = s.at("proj", "AGENTS.md");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "# Team rules\n\nBe kind.\n");
  const r = apply([section(f)], [], s.backups);
  assert.match(text(f), /# Team rules[\s\S]*<!-- qamind:start qamind -->\nRun QA with the skill\.\n<!-- qamind:end qamind -->/);
  const r2 = apply([section(f, "Run QA, changed text.")], r.applied, s.backups);
  assert.equal(text(f).match(/qamind:start/g)?.length, 1, "replaced, not duplicated");
  assert.match(text(f), /changed text/);
  revertOps(r2.applied);
  assert.equal(text(f), "# Team rules\n\nBe kind.\n");

  const g = s.at("proj2", "AGENTS.md");
  const r3 = apply([section(g)], [], s.backups);
  assert.equal(r3.applied[0]?.created, true);
  revertOps(r3.applied);
  assert.ok(!fs.existsSync(g));
  assert.ok(!fs.existsSync(path.dirname(g)), "and the folder QAMind made for it");
});

test("a section the user edited is left in place", () => {
  const s = sandbox();
  const f = s.at("AGENTS.md");
  const r = apply([section(f)], [], s.backups);
  fs.writeFileSync(f, text(f).replace("Run QA", "Run QA (my words)"));
  const out = revertOps(r.applied);
  assert.match(text(f), /my words/);
  assert.match(out.kept[0] ?? "", /edited after it was written/);
});

// ---- commands

test("a command is skipped when its check passes, runs otherwise, and is undone on uninstall", () => {
  const log: string[] = [];
  let installed = false;
  const run: CommandRunner = (argv) => {
    log.push(argv.join(" "));
    if (argv[1] === "check") return { status: installed ? 0 : 1, stdout: "", stderr: "" };
    if (argv[1] === "add") installed = true;
    if (argv[1] === "remove") installed = false;
    return { status: argv[1] === "fail" ? 1 : 0, stdout: "", stderr: argv[1] === "fail" ? "boom" : "" };
  };
  const op: Op = { op: "command", label: "register plugin", run: ["tool", "add"], check: ["tool", "check"], undo: ["tool", "remove"] };
  const s = sandbox();
  const r1 = apply([op], [], s.backups, run);
  assert.deepEqual(r1.changed, ["register plugin"]);
  const r2 = apply([op], r1.applied, s.backups, run);
  assert.deepEqual(r2.unchanged, ["register plugin"]);
  assert.deepEqual(log.filter((l) => l === "tool add").length, 1, "the command ran once");
  assert.deepEqual(revertOps(r2.applied, run).removed, ["register plugin"]);
  assert.equal(installed, false);
  assert.throws(() => apply([{ op: "command", label: "x", run: ["tool", "fail"] }], [], s.backups, run), /x failed.*boom/);
});

// ---- verify

test("verify reports what is missing or changed, without writing anything", () => {
  const s = sandbox();
  const f = s.at("skills", "a", "SKILL.md");
  const j = s.at("mcp.json");
  const a = s.at("AGENTS.md");
  const ops: Op[] = [{ op: "file", path: f, content: "x" }, at(mcp("qa-memory"), j), section(a)];
  assert.deepEqual(verifyOps(ops).map((c) => c.ok), [false, false, false], "nothing installed yet");
  const r = apply(ops, [], s.backups);
  assert.deepEqual(verifyOps(ops).map((c) => c.ok), [true, true, true]);
  fs.writeFileSync(f, "changed");
  const edited = json(j);
  edited.mcpServers["qa-memory"].args = ["/x"];
  fs.writeFileSync(j, JSON.stringify(edited));
  fs.rmSync(a);
  const checks = verifyOps(ops);
  assert.deepEqual(checks.map((c) => c.detail), ["changed since setup", "changed since setup", "missing"]);
  void r;
});
