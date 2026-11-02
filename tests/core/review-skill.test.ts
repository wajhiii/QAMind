import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { decidePreToolUse } from "../../core/lib/hooks.ts";
import { ALL_QA_TOOLS } from "../../core/mcp/servers.ts";
import { writeJson } from "../../core/lib/fsutil.ts";
import { markerPath } from "../../core/lib/run.ts";
import type { RunMarker } from "../../core/lib/run.ts";
import { repoRoot, tmp } from "./helpers.ts";

// The static side of Phase 7: the review skill pre-approves only what reads, every command it names exists, and the hook refuses in a run exactly the commands it asks the user to decide.

const read = (...p: string[]): string => fs.readFileSync(path.join(repoRoot, ...p), "utf8");
const field = (text: string, key: string): string | undefined => new RegExp(`^${key}:\\s*"?([^\\n]*?)"?$`, "m").exec(text)?.[1];
const SKILL = read("core", "skills", "qa-memory-review", "SKILL.md");
const RENDERED = read("plugins", "qamind", "skills", "qa-memory-review", "SKILL.md");

test("the review skill is the user's alone and pre-approves only commands that read", () => {
  assert.equal(field(RENDERED, "name"), "qa-memory-review");
  assert.equal(field(RENDERED, "disable-model-invocation"), "true", "the model never starts a review by itself");
  const allowed = (field(RENDERED, "allowed-tools") ?? "").match(/Bash\([^)]*\)/g) ?? [];
  assert.deepEqual(allowed.sort(), ["Bash(qamind lessons list *)", "Bash(qamind lessons list)", "Bash(qamind memory review *)", "Bash(qamind memory review)", "Bash(qamind memory stats *)", "Bash(qamind memory stats)"].sort());
  assert.equal((field(RENDERED, "allowed-tools") ?? "").replace(/Bash\([^)]*\)/g, "").trim(), "", "no other tool is pre-approved: not Read, not Write, not the memory tools");
  for (const word of ["approve", "reject", "prune"]) assert.ok(!allowed.some((a) => a.includes(word)), `${word} is not pre-approved, so the host asks the user each time`);
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(RENDERED), "no placeholder is left unrendered");
});

test("every `qamind` command the review skill names is real, and the decisions are exactly the ones the hook refuses inside a run", async () => {
  const { cli } = await import("./helpers.ts");
  const used = [...SKILL.matchAll(/\{\{CLI\}\}\s+(lessons|memory)\s+([a-z-]+)/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual([...new Set(used)].sort(), ["lessons approve", "lessons list", "lessons reject", "memory prune", "memory review", "memory stats"]);
  const home = tmp("qamind-home-");
  assert.equal((await cli(home, "lessons", "list")).code, 0, "the read-only command the skill starts with works with nothing in the store");

  const proj = tmp();
  const marker: RunMarker = { schema_version: 1, run_id: "run-1", project_id: "p1", project_root: proj, store: path.join(home, "projects", "p1"), run_dir: path.join(proj, ".qa", "reports", "run-1"), mode: "quick", kind: "qa-only", readonly: true, trigger: "manual", host: "test", session_id: "S1", started: new Date().toISOString(), expires: new Date(Date.now() + 3600_000).toISOString(), policy: { allowed_origins: [], blocked_patterns: [] } };
  writeJson(markerPath(marker.store), marker);
  const denied = (command: string): boolean => decidePreToolUse({ session_id: "S1", tool_name: "Bash", tool_input: { command } }, home, [])?.decision === "deny";
  for (const d of ["lessons approve P-001", "lessons reject P-001", "memory prune --learning L-001"]) assert.equal(denied(`qamind ${d}`), true, `${d} is refused inside a run`);
  for (const r of ["lessons list", "memory review", "memory stats"]) assert.equal(denied(`qamind ${r}`), false, `${r} reads, so a run may run it`);
});

test("the server offers no tool that approves, rejects or removes a lesson or any memory", () => {
  assert.deepEqual(ALL_QA_TOOLS.filter((t) => /approve|reject|prune|retire|archive|delete|remove/i.test(t)), []);
});

test("the skill puts the owner in charge: ask first, one item at a time, never by hand, never invent numbers", () => {
  for (const phrase of [/Every decision is theirs/, /one at a time/, /Never read or edit the memory or lesson files yourself/, /never propose lessons here/, /The host will ask the user to approve each such command/, /Archiving never deletes/, /not available_yet|cannot be measured yet/, /never invent a number/]) assert.match(SKILL, phrase);
  assert.match(SKILL, /approve, reword, reject, or skip\?/);
  assert.ok(SKILL.split("\n").length < 120, "a short skill");
});

test("the memory protocol tells a run what it may and may not do with lessons", () => {
  const protocol = read("core", "shared", "memory-protocol.md");
  assert.match(protocol, /You cannot approve, reject or change a lesson/);
  assert.match(protocol, /rejected-before/);
  assert.match(protocol, /global_lessons/);
  assert.match(protocol, /memory_record_applied/);
});

test("the plugin documents the new commands in its CLI help", () => {
  const main = read("cli", "src", "main.ts");
  for (const line of ["lessons list", "lessons approve ID", "lessons reject ID", "memory review", "memory stats", "memory prune"]) assert.ok(main.includes(line), `${line} is in the help`);
});
