import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { setupHosts, statusReport, uninstallHosts } from "../../cli/src/setup/commands.ts";
import { ALL_QA_TOOLS } from "../../core/mcp/servers.ts";
import { parseHookIo } from "../../core/auto-qa/hostio.ts";
import { lintReports } from "../../core/lib/reports.ts";
import { discoverHosts, loadHost } from "../../hosts/registry.ts";
import type { LoadedHost } from "../../hosts/host-api.ts";
import { frontMatter } from "../../hosts/render.ts";
import { writeFixtureData, tmp } from "../core/helpers.ts";
import { configuredProject, files, fill, hostContext, qamind, repoRoot, runHook, sandbox, startMcp } from "./harness.ts";
import { writeDummyHost } from "./dummy-host.ts";

/**
 * Host conformance (spec 14.1): one battery, run against every host adapter in hosts/ and against a dummy host that exists only in a temp folder.
 *   setup installs and is idempotent · status is accurate · the MCP server is registered and reachable · skills are discoverable under their documented names ·
 *   a /qa-only run produces valid reports and memory · uninstall leaves no files behind (and nobody else's config changed) · auto-QA behaves as the host declares
 * A host that needs its own CLI to install (Claude Code) is installed through that CLI into an isolated config folder when CLAUDE_BIN is set, and those tests are skipped otherwise.
 */
const realHosts = path.join(repoRoot, "hosts");
const dummyHosts = path.join(tmp("qamind-dummyhosts-"), "hosts");
writeDummyHost(dummyHosts);

const targets: Array<{ host: LoadedHost; hostsDir: string }> = [
  ...(await discoverHosts(realHosts)).map((host) => ({ host, hostsDir: realHosts })),
  ...(await discoverHosts(dummyHosts)).map((host) => ({ host, hostsDir: dummyHosts })),
];
const CORE_SKILLS = fs.readdirSync(path.join(repoRoot, "core", "skills")).filter((n) => fs.existsSync(path.join(repoRoot, "core", "skills", n, "SKILL.md"))).sort();
const BUNDLE = path.join(repoRoot, "plugins", "qamind", "dist", "qamind.mjs");

for (const { host, hostsDir } of targets) {
  const needsCli = host.json["requires_host"] === true;
  const sbFor = (): ReturnType<typeof sandbox> => sandbox(needsCli ? { env: { CLAUDE_CONFIG_DIR: tmp("qamind-claudecfg-") } } : {});
  const canInstall = (): boolean => !needsCli || host.adapter.detect(hostContext(host, sbFor())).found;
  const skipInstall = canInstall() ? false : "needs the host's own CLI (set CLAUDE_BIN)";
  const scopes: Array<"user" | "project"> = host.json.scopes ?? ["user", "project"];
  const label = `[${host.id}, ${host.json.tier}]`;

  const install = async (sb: ReturnType<typeof sandbox>, scope: "user" | "project" = scopes[0] as "user" | "project") => {
    const report = await setupHosts({ ...sb.base(hostsDir), hosts: [host.id], scope, projectDir: sb.project, launcher: false });
    assert.deepEqual(report.problems, [], report.problems.join("; "));
    return report;
  };
  const ctxOf = (sb: ReturnType<typeof sandbox>, scope: "user" | "project" = scopes[0] as "user" | "project") => hostContext(host, sb, { scope, runtimeDir: path.join(sb.base(hostsDir).buildRoot as string, host.id) });

  test(`${label} setup installs, and a second run changes nothing`, { skip: skipInstall }, async () => {
    const sb = sbFor();
    const first = await install(sb);
    assert.ok(first.hosts[0] && first.hosts[0].changed.length > 0 || host.id === "generic", "the first run made changes");
    const second = await install(sb);
    assert.deepEqual(second.hosts[0]?.changed, [], "idempotent: nothing to change the second time");
    if (host.json["runtime"] !== false) assert.ok(fs.existsSync(path.join(ctxOf(sb).runtimeDir, "dist", "qa-memory.mjs")), "the runtime is rendered");
  });

  test(`${label} status tells the truth: ok, then the problem when something is removed, then ok again, then nothing`, { skip: skipInstall }, async () => {
    const sb = sbFor();
    const b = sb.base(hostsDir);
    assert.deepEqual((await statusReport(b)).installs, [], "nothing installed yet");
    await install(sb);
    const ok = (await statusReport(b)).installs.find((r) => r.host === host.id);
    assert.ok(ok, "the install is listed");
    assert.equal(ok.ok, true, ok.problems.join("; "));
    assert.equal(ok.tier, host.json.tier);
    assert.equal(ok.auto_qa, host.json.auto_qa.mode, "status states how auto-QA works on this host");
    assert.equal(ok.safety, host.json.safety);
    const total = Object.values(ok.checks).reduce((n, c) => n + (c?.total ?? 0), 0);
    if (host.id !== "generic") assert.ok(total > 0, "the checks cover something");
    // break one recorded thing and status must say so
    const installs = JSON.parse(fs.readFileSync(path.join(sb.store, "installs.json"), "utf8")) as { installs: Array<{ host: string; entries: Array<{ op: string; path?: string }> }> };
    const entry = installs.installs.find((r) => r.host === host.id)?.entries.find((e) => e.op === "file");
    if (entry?.path) {
      fs.rmSync(entry.path);
      const broken = (await statusReport(b)).installs.find((r) => r.host === host.id);
      assert.equal(broken?.ok, false);
      assert.match(broken?.problems.join(" ") ?? "", /missing/);
      await install(sb);
      assert.equal((await statusReport(b)).installs.find((r) => r.host === host.id)?.ok, true, "setup repairs it");
    }
    await uninstallHosts({ ...b, hosts: [host.id] });
    assert.deepEqual((await statusReport(b)).installs, [], "and nothing is listed once it is uninstalled");
  });

  test(`${label} the MCP servers are registered and the qa-memory server is reachable`, async () => {
    const sb = sbFor();
    if (!skipInstall) await install(sb);
    const regs = host.adapter.mcpRegistrations(ctxOf(sb), host.json);
    assert.deepEqual(regs.map((r) => r.name).sort(), ["browser", "qa-memory"]);
    for (const r of regs) assert.ok(r.args.some((a) => fs.existsSync(a.replaceAll("${workspaceFolder}", sb.project))), `${r.name}: the file it starts exists`);
    const proj = configuredProject();
    const mcp = await startMcp(regs.find((r) => r.name === "qa-memory") as (typeof regs)[number], { cwd: proj, env: sb.env, project: proj });
    try {
      assert.equal(mcp.client.getServerVersion()?.name, "qa-memory");
      assert.deepEqual((await mcp.client.listTools()).tools.map((t) => t.name).sort(), [...ALL_QA_TOOLS].sort());
      const ctx = await mcp.call("memory_get_context");
      assert.equal(ctx.json.project?.root, fs.realpathSync(proj), "the server finds the project from what the host gives it");
    } finally {
      await mcp.close();
    }
  });

  test(`${label} skills are discoverable under their documented names`, async () => {
    const sb = sbFor();
    if (!skipInstall) await install(sb);
    const skills = host.adapter.skills(ctxOf(sb), host.json);
    for (const core of CORE_SKILLS) assert.equal(skills.filter((s) => s.name.endsWith(core) && (s.name === core || /[:-]/.test(s.name.slice(0, s.name.length - core.length).slice(-1)))).length >= 1, true, `a skill for ${core}`);
    assert.equal(skills.length, CORE_SKILLS.length, "exactly the core skills, no more");
    for (const s of skills) {
      assert.ok(fs.existsSync(s.file), `${s.name}: ${s.file} exists`);
      const text = fs.readFileSync(s.file, "utf8");
      assert.ok(!/\{\{[A-Z_]+\}\}/.test(text), `${s.name}: no placeholder left unrendered`);
      if (path.basename(s.file) === "SKILL.md") {
        const fm = Object.fromEntries(frontMatter(text).fields);
        assert.equal(fm["name"], path.basename(path.dirname(s.file)), `${s.name}: the front matter name equals its folder`);
        assert.ok((fm["description"] ?? "").length > 20, `${s.name}: a description`);
      }
    }
    const names = skills.map((s) => s.name);
    assert.equal(new Set(names).size, names.length, "names are unique");
    const auto = skills.find((s) => s.name.endsWith("qa-auto-run"));
    assert.ok(auto, "the internal auto-QA skill is there");
  });

  test(`${label} a /qa-only run through the registered server produces valid reports and memory`, async () => {
    const sb = sbFor();
    if (!skipInstall) await install(sb);
    const regs = host.adapter.mcpRegistrations(ctxOf(sb), host.json);
    const proj = configuredProject();
    const mcp = await startMcp(regs.find((r) => r.name === "qa-memory") as (typeof regs)[number], { cwd: proj, env: sb.env, project: proj });
    try {
      const started = await mcp.call("run_start", { mode: "quick", host: host.id });
      assert.equal(started.json?.status, "ready", started.text.slice(0, 300));
      const run = started.json.run as { id: string; dir: string };
      writeFixtureData(run.dir);
      const learn = await mcp.call("memory_save_learning", { run: run.id, type: "test-tip", area: "Orders", text: "Wait for the order list to finish loading before reading its rows." });
      assert.equal(learn.isError, false, learn.text);
      const done = await mcp.call("run_finish", { run: run.id, stop_reason: "completed" });
      assert.equal(done.isError, false, done.text.slice(0, 300));
      for (const f of ["TECHNICAL-REPORT.md", "ADMIN-REPORT.md"]) assert.ok(fs.existsSync(path.join(run.dir, f)), `${f} was written`);
      const lint = lintReports(run.dir, [], path.join(sb.store, "projects", fs.readdirSync(path.join(sb.store, "projects"))[0] as string));
      assert.equal(lint.ok, true, lint.errors.join(" | "));
      const summary = path.join(sb.store, "projects", fs.readdirSync(path.join(sb.store, "projects"))[0] as string, "memory", "runs", `${run.id}.json`);
      assert.ok(fs.existsSync(summary), "the run is in the project's history");
      assert.equal(JSON.parse(fs.readFileSync(summary, "utf8")).host, host.id, "and says which host it ran on");
    } finally {
      await mcp.close();
    }
  });

  test(`${label} uninstall leaves no files behind and does not change anyone else's config`, { skip: skipInstall }, async () => {
    // First learn which shared files this host edits, in a throwaway sandbox ...
    const probe = sbFor();
    const scope = scopes[0] as "user" | "project";
    await install(probe, scope);
    const rec = (JSON.parse(fs.readFileSync(path.join(probe.store, "installs.json"), "utf8")) as { installs: Array<{ host: string; entries: Array<{ op: string; path?: string; created: boolean }> }> }).installs.find((r) => r.host === host.id);
    const shared = [...new Set((rec?.entries ?? []).filter((e) => (e.op === "json" || e.op === "block") && e.path).map((e) => e.path as string))];
    // ... then plant someone else's content in each of them and install over it.
    const sb = sbFor();
    const remap = (p: string): string => (p.startsWith(probe.userHome) ? path.join(sb.userHome, path.relative(probe.userHome, p)) : path.join(sb.project, path.relative(probe.project, p)));
    const planted = new Map<string, string>();
    for (const p of shared) {
      const target = remap(p);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const content = p.endsWith(".json") ? JSON.stringify({ someoneElse: { keep: true } }, null, 2) + "\n" : "# Someone else's notes\n\nKeep these.\n";
      fs.writeFileSync(target, content);
      planted.set(target, content);
    }
    // npm's own cache, which Claude Code's plugin install leaves in the HOME it runs with, is not something QAMind added.
    const mine = (f: string): boolean => !f.startsWith(".npm/");
    const before = [...files(sb.userHome).filter(mine), ...files(sb.project).map((f) => `project:${f}`)];
    await install(sb, scope);
    await uninstallHosts({ ...sb.base(hostsDir), hosts: [host.id], scope, projectDir: sb.project });
    for (const [target, content] of planted) {
      const now = fs.readFileSync(target, "utf8");
      if (target.endsWith(".json")) assert.deepEqual(JSON.parse(now), JSON.parse(content), `${target}: the other tool's settings are exactly as they were`);
      else assert.equal(now.trim(), content.trim(), `${target}: the other text is exactly as it was`);
    }
    const after = [...files(sb.userHome).filter(mine), ...files(sb.project).map((f) => `project:${f}`)];
    assert.deepEqual(after, before, "no file QAMind added is left, and none was lost");
    assert.deepEqual(files(sb.store), [], "and nothing is left in the QAMind store (setup's own records are gone too)");
  });

  test(`${label} a project-level install lands in the project and goes away again`, { skip: skipInstall || needsCli || !scopes.includes("project") ? "needs the host's own CLI, or this host has no project level" : false }, async () => {
    const sb = sbFor();
    const proj = configuredProject();
    const before = files(proj);
    const report = await setupHosts({ ...sb.base(hostsDir), hosts: [host.id], scope: "project", projectDir: proj, launcher: false });
    assert.deepEqual(report.problems, []);
    const s = await statusReport(sb.base(hostsDir), { project: proj });
    assert.equal(s.installs.find((r) => r.host === host.id)?.ok, true);
    assert.deepEqual(files(sb.userHome), [], "a project install does not touch the user's home");
    assert.ok(files(proj).length > before.length, "files were added to the project");
    await uninstallHosts({ ...sb.base(hostsDir), hosts: [host.id], scope: "project", projectDir: proj });
    assert.deepEqual(files(proj), before, "the project is as it was");
  });

  // ---- auto-QA, enforced or advisory as the host declares (spec 9.5 and 14.1)
  if (host.json.auto_qa.mode === "enforced") {
    test(`${label} auto-QA is enforced through this host's own hook format: blocks once, never loops, honours #noqa and off`, async () => {
      const sb = sbFor();
      if (!skipInstall) await install(sb);
      const cmds = host.adapter.hookCommands?.(ctxOf(sb), host.json);
      assert.ok(cmds?.stop && cmds.prompt, "an enforced host registers both hook commands");
      const auto = host.json.auto_qa;
      assert.ok(auto.samples, "the host documents sample payloads for the conformance suite");
      const io = parseHookIo(auto.hooks);
      const proj = configuredProject();
      const sample = (name: string, prompt = ""): unknown => fill((auto.samples as Record<string, unknown>)[name], { session: "sess-1", cwd: proj, prompt });
      const hook = (command: string, payload: unknown) => runHook(command, payload, sb.env, auto.hook_env, proj);
      const edit = (): void => fs.writeFileSync(path.join(proj, "src", "app.js"), `${Math.random()}\n`);
      assert.equal(qamind(BUNDLE, ["auto", "on"], proj, sb.env).status, 0);
      qamind(BUNDLE, ["auto", "set", "cooldown", "0"], proj, sb.env);

      assert.equal(hook(cmds.prompt as string, sample("prompt", "change the app")).stdout, "", "the prompt hook says nothing");
      edit();
      const blocked = hook(cmds.stop as string, sample("stop"));
      assert.equal(blocked.status, 0);
      assert.ok(blocked.json, `a block in this host's format: ${blocked.stdout}`);
      for (const key of Object.keys(io.stop.block_output)) assert.ok(key in blocked.json, `the output has "${key}"`);
      const text = JSON.stringify(blocked.json);
      assert.match(text, /QAMind auto-QA\./);
      assert.match(text, /src\/app\.js/);
      if (auto.invoke) assert.ok(text.includes(auto.invoke.replace("{mode}", "diff")), "the host's own wording for running the skill");

      for (let i = 0; i < 3; i++) assert.equal(hook(cmds.stop as string, sample("stop_after_block")).stdout, "", "the Stop that follows our own block never blocks again");
      if ((auto.samples as Record<string, unknown>)["stop_aborted"]) {
        hook(cmds.prompt as string, sample("prompt", "another change"));
        edit();
        assert.equal(hook(cmds.stop as string, sample("stop_aborted")).stdout, "", "an aborted turn is not checked");
      }
      hook(cmds.prompt as string, sample("prompt", "a tweak #noqa"));
      edit();
      assert.equal(hook(cmds.stop as string, sample("stop")).stdout, "", "#noqa skips the task");
      qamind(BUNDLE, ["auto", "off"], proj, sb.env);
      hook(cmds.prompt as string, sample("prompt", "one more change"));
      edit();
      assert.equal(hook(cmds.stop as string, sample("stop")).stdout, "", "off takes effect on the next task");
      assert.equal(hook(cmds.stop as string, "this is not json").status, 0, "garbage on stdin never fails the host");
      assert.equal(hook(cmds.stop as string, "this is not json").stdout, "");
    });
  } else {
    test(`${label} auto-QA is advisory and says so: no hooks, an instruction in the project, and status states it`, { skip: skipInstall }, async () => {
      const sb = sbFor();
      const scope = "project";
      const proj = configuredProject();
      await setupHosts({ ...sb.base(hostsDir), hosts: [host.id], scope, projectDir: proj, launcher: false });
      assert.equal(host.adapter.hookCommands?.(ctxOf(sb, scope), host.json), undefined, "an advisory host registers no hooks");
      const agents = path.join(proj, "AGENTS.md");
      assert.ok(fs.existsSync(agents), "the instruction file was written");
      const text = fs.readFileSync(agents, "utf8");
      assert.match(text, /advisory/i);
      assert.match(text, /qamind auto status/);
      assert.match(text, /#noqa/);
      const row = (await statusReport(sb.base(hostsDir), { project: proj })).installs.find((r) => r.host === host.id);
      assert.equal(row?.auto_qa, "advisory");
    });
  }

  test(`${label} the host file declares what it must, and its tier is one of the three`, () => {
    assert.ok(["full", "experimental", "instruction-only"].includes(host.json.tier));
    assert.ok(["enforced", "advisory"].includes(host.json.auto_qa.mode));
    assert.ok(["hooks", "instructions"].includes(host.json.safety));
    for (const c of ["CMD_QA", "CMD_QA_ONLY", "CMD_QA_AUTO", "CMD_QA_MEMORY_REVIEW"]) assert.ok(host.json.commands[c], `${c} is named`);
    // a host is "full" only after a real run on that host, recorded in HOSTS.md; nothing else may claim it
    if (host.json.tier === "full") assert.equal(host.id, "claude", "only a host with a recorded real end-to-end run may be full");
  });
}

test("the dummy host is found with no change to core: the registry reads folders", async () => {
  const dummy = await loadHost(dummyHosts, "dummy");
  assert.equal(dummy.json.name, "Dummy Agent");
  assert.ok(!fs.existsSync(path.join(realHosts, "dummy")), "and it is not in hosts/");
  assert.deepEqual((await discoverHosts(realHosts)).map((h) => h.id), ["claude", "cursor", "generic"], "the real hosts are exactly these three");
  await assert.rejects(() => loadHost(realHosts, "nope"), /Unknown host "nope". Known hosts: claude, cursor, generic/);
});
