import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { setupHosts } from "../../cli/src/setup/commands.ts";
import { discoverHosts } from "../../hosts/registry.ts";
import type { McpRegistration } from "../../hosts/host-api.ts";
import { writeFixtureData } from "../core/helpers.ts";
import { configuredProject, hostContext, repoRoot, sandbox, startMcp } from "./harness.ts";
import type { Mcp } from "./harness.ts";

/**
 * Memory interoperability (spec 14.1): one machine, one store, one project, three hosts. A run on one host must be remembered by the next host, whichever it is,
 * because every host starts the same qa-memory server against the same user store and the project is identified by its git remote, not by the tool.
 */
const hostsDir = path.join(repoRoot, "hosts");
const NAMES = ["claude", "cursor", "generic"] as const;

async function registrations(): Promise<{ sb: ReturnType<typeof sandbox>; project: string; regs: Record<string, McpRegistration> }> {
  const sb = sandbox();
  const project = configuredProject();
  const hosts = await discoverHosts(hostsDir);
  const regs: Record<string, McpRegistration> = {};
  for (const id of NAMES) {
    const host = hosts.find((h) => h.id === id);
    assert.ok(host);
    // Claude Code registers from the plugin in the checkout; the others from what setup wrote (Cursor user level, generic project level).
    if (id !== "claude") {
      const scope = id === "generic" ? "project" : "user";
      const r = await setupHosts({ ...sb.base(hostsDir), hosts: [id], scope, projectDir: project, launcher: false });
      assert.deepEqual(r.problems, []);
    }
    const ctx = hostContext(host, sb, { scope: id === "generic" ? "project" : "user", projectDir: project, runtimeDir: path.join(sb.base(hostsDir).buildRoot as string, id) });
    regs[id] = host.adapter.mcpRegistrations(ctx, host.json).find((r) => r.name === "qa-memory") as McpRegistration;
    assert.ok(regs[id], `${id} registers qa-memory`);
  }
  return { sb, project, regs };
}

/** A /qa-only run through one host's own server, saving one learning. */
async function runOn(host: string, reg: McpRegistration, sb: ReturnType<typeof sandbox>, project: string, learning: string): Promise<{ runId: string; projectId: string; seen: any }> {
  const mcp: Mcp = await startMcp(reg, { cwd: project, env: sb.env, project });
  try {
    const seen = (await mcp.call("memory_get_context")).json;
    const started = await mcp.call("run_start", { mode: "quick", host });
    assert.equal(started.json?.status, "ready", started.text.slice(0, 200));
    const run = started.json.run as { id: string; dir: string };
    writeFixtureData(run.dir);
    assert.equal((await mcp.call("memory_save_learning", { run: run.id, type: "test-tip", area: `Area of ${host}`, text: learning })).isError, false);
    assert.equal((await mcp.call("run_finish", { run: run.id, stop_reason: "completed" })).isError, false);
    return { runId: run.id, projectId: seen.project?.id, seen };
  } finally {
    await mcp.close();
  }
}

test("a run on one host is remembered by the next, in a chain through all three hosts and back", async () => {
  const { sb, project, regs } = await registrations();
  const learnings = {
    claude: "Claude Code run: the order list needs a moment before its rows are readable.",
    cursor: "Cursor run: a changed price only shows stale if the list was opened before the change.",
    generic: "Generic run: search text containing a bracket is treated as a pattern by the endpoint.",
  } as const;
  const ids: string[] = [];
  const seenLearnings: string[][] = [];
  const projectIds = new Set<string>();
  const order = [...NAMES, "claude"] as const;
  for (const [i, host] of order.entries()) {
    const text = host === "claude" && i > 0 ? "Claude Code, second run: a deleted row stays visible until the page is refreshed." : learnings[host];
    const r = await runOn(host, regs[host] as McpRegistration, sb, project, text);
    ids.push(r.runId);
    projectIds.add(r.projectId);
    const all = Object.values(r.seen.learnings as Record<string, Array<{ text: string }>>).flat().map((l) => l.text);
    seenLearnings.push(all);
  }
  assert.equal(projectIds.size, 1, "every host sees the same project");
  assert.deepEqual(seenLearnings[0], [], "the first run had nothing to build on");
  assert.deepEqual(seenLearnings[1]?.length, 1, "Cursor saw the Claude Code run's learning");
  assert.match(seenLearnings[1]?.[0] ?? "", /Claude Code run/);
  assert.equal(seenLearnings[2]?.length, 2, "the generic host saw both");
  assert.equal(seenLearnings[3]?.length, 3, "and Claude Code, coming back, saw all three");

  // the run history names the host each run was on, newest first
  const mcp = await startMcp(regs["cursor"] as McpRegistration, { cwd: project, env: sb.env, project });
  try {
    const history = (await mcp.call("run_history", { limit: 10 })).json.runs as Array<{ run_id: string }>;
    assert.deepEqual(history.map((h) => h.run_id), [...ids].reverse());
    const project1 = fs.readdirSync(path.join(sb.store, "projects"));
    assert.equal(project1.length, 1, "one project folder in the store, not one per host");
    const summaries = fs.readdirSync(path.join(sb.store, "projects", project1[0] as string, "memory", "runs")).map((f) => JSON.parse(fs.readFileSync(path.join(sb.store, "projects", project1[0] as string, "memory", "runs", f), "utf8")) as { host: string });
    assert.deepEqual(summaries.map((s) => s.host).sort(), ["claude", "claude", "cursor", "generic"]);
  } finally {
    await mcp.close();
  }
});

test("an approved global lesson reaches every host, and a pending one reaches none", async () => {
  const { sb, project, regs } = await registrations();
  fs.writeFileSync(path.join(sb.store, "global-lessons.md"), "# Global lessons\n\n## G-001 · 2026-11-01 · Forms\n- **Lesson:** Disabled buttons must also be unreachable by keyboard, not only greyed out.\n- **Why:** Seen on several products.\n");
  fs.writeFileSync(path.join(sb.store, "pending-lessons.md"), "# Pending lessons\n\n## P-001 · 2026-11-01\n- **Lesson:** Pagination controls should keep the chosen page size after a filter changes.\n- **Why:** Seen once.\n");
  for (const id of NAMES) {
    const mcp = await startMcp(regs[id] as McpRegistration, { cwd: project, env: sb.env, project });
    try {
      const ctx = (await mcp.call("memory_get_context")).json;
      assert.deepEqual(ctx.global_lessons.map((l: { id: string }) => l.id), ["G-001"], `${id}: only the approved lesson`);
      assert.ok(!JSON.stringify(ctx).includes("Pagination controls"), `${id}: nothing pending leaks`);
    } finally {
      await mcp.close();
    }
  }
});

test("a project named by a host that only knows its folder is the same project: the id comes from the git remote", async () => {
  const { sb, project, regs } = await registrations();
  const elsewhere = configuredProject(); // another checkout of the same repository, in another folder
  const a = await startMcp(regs["claude"] as McpRegistration, { cwd: project, env: sb.env, project });
  const b = await startMcp(regs["cursor"] as McpRegistration, { cwd: elsewhere, env: sb.env, project: elsewhere });
  try {
    const x = (await a.call("memory_get_context")).json.project.id;
    const y = (await b.call("memory_get_context")).json.project.id;
    assert.equal(x, y, "two checkouts of one repository share memory, whichever host opened them");
  } finally {
    await a.close();
    await b.close();
  }
});
