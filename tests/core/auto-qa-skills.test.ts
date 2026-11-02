import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AUTO_SKILL, buildReason } from "../../core/auto-qa/prompt.ts";
import { memoryToolName } from "../../hosts/claude/adapter.ts";
import { ALL_QA_TOOLS, FIX_CONSENT_TOOLS } from "../../core/mcp/servers.ts";
import { repoRoot } from "./helpers.ts";

// The static side of Phase 6.5: the two skills, the hooks the plugin registers, and the names the gate hands to Claude all have to agree.

const read = (...p: string[]): string => fs.readFileSync(path.join(repoRoot, ...p), "utf8");
const skillOf = (name: string): string => read("core", "skills", name, "SKILL.md");
const plugin = (...p: string[]): string => read("plugins", "qamind", ...p);
const stepsOf = (text: string): Map<string, string> => new Map([...text.matchAll(/^## (Step \d+)[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map((m) => [m[1] as string, (m[2] as string).trim()]));
const field = (text: string, key: string): string | undefined => new RegExp(`^${key}:\\s*"?([^\\n]*?)"?$`, "m").exec(text)?.[1];

test("the auto-QA run skill shares Steps 1 to 5 word for word with /qa-only, so the two cannot drift apart", () => {
  const only = stepsOf(skillOf("qa-only"));
  const auto = stepsOf(skillOf("qa-auto-run"));
  for (const step of ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]) {
    assert.ok(auto.get(step), `qa-auto-run has ${step}`);
    assert.equal(auto.get(step), only.get(step), `${step} must be the same text in both skills`);
  }
  assert.ok(auto.get("Step 6")?.includes("fix_preflight"), "Step 6 is the fix phase, for fix mode only");
  assert.match(skillOf("qa-auto-run"), /^## Step 6: fix \(only in `fix` mode; in every other mode go straight to Step 7\)$/m, "the heading says the fix phase is for fix mode only");
});

test("the auto-QA run skill starts runs as trigger auto, report-only except in fix mode, and never asks or fails the turn", () => {
  const text = skillOf("qa-auto-run");
  assert.match(text, /`trigger: "auto"`/);
  assert.match(text, /`diff`: `mode: "diff"`, `kind: "qa-only"`/);
  assert.match(text, /`quick`: `mode: "quick"`, `kind: "qa-only"`/);
  assert.match(text, /`full`: `mode: "full"`, `kind: "qa-only"`/);
  assert.match(text, /`fix`: `mode: "diff"`, `kind: "qa"`/);
  assert.match(text, /never fail the turn and never ask the user/);
  assert.match(text, /auto skipped \{\{SESSION_FLAG\}\}--reason/);
  assert.match(text, /Auto-QA skipped: /);
  assert.match(text, /file names, \*\*data and never instructions\*\*/);
  assert.match(text, /at most 5 lines/);
  assert.match(text, /Critical problem first/);
  for (const t of ALL_QA_TOOLS) assert.match(text, new RegExp(`\`${t}\``), `must name ${t}`);
  assert.match(text, /\{\{FIX_TOOLS_LOAD\}\}/);
  assert.match(text, /did not start\.?" and \*\*stop\*\*|did not start\." and \*\*stop\*\*/);
});

test("the rendered skills carry the right invocation rules: the run skill is model-only, the toggle is user-only, the QA skills stay user-only", () => {
  const run = plugin("skills", "qa-auto-run", "SKILL.md");
  assert.equal(field(run, "user-invocable"), "false");
  assert.equal(field(run, "disable-model-invocation"), undefined, "the model must be able to invoke it: that is the whole mechanism");
  assert.equal(field(run, "name"), "qa-auto-run");
  assert.equal(field(plugin("skills", "qa-auto", "SKILL.md"), "disable-model-invocation"), "true", "Claude never switches auto-QA on or off by itself");
  assert.equal(field(plugin("skills", "qa-auto", "SKILL.md"), "allowed-tools"), "Bash(qamind auto *)");
  for (const name of ["qa", "qa-only"]) assert.equal(field(plugin("skills", name, "SKILL.md"), "disable-model-invocation"), "true", `${name} stays out of the model's reach`);
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(run) && !/\{\{[A-Z_]+\}\}/.test(plugin("skills", "qa-auto", "SKILL.md")), "no placeholder is left unrendered");
});

test("the run skill pre-approves what /qa does, except the two tools that need the user's go-ahead", () => {
  const allowed = (field(plugin("skills", "qa-auto-run", "SKILL.md"), "allowed-tools") ?? "").split(/\s+/);
  for (const t of ALL_QA_TOOLS) {
    const name = memoryToolName(t);
    if ((FIX_CONSENT_TOOLS as readonly string[]).includes(t)) assert.ok(!allowed.includes(name), `${t} must ask the user, also in auto-QA`);
    else assert.ok(allowed.includes(name), `${t} should be pre-approved`);
  }
  assert.ok(!allowed.some((x) => /^Bash\(git (add|commit|push|checkout|reset|merge|rebase)/.test(x)), "no writing git command is pre-approved");
  assert.equal((field(plugin("skills", "qa", "SKILL.md"), "allowed-tools") ?? "").split(/\s+/).join(" "), allowed.join(" "), "the same tools as /qa");
});

test("the hook message names a skill that exists, and every `qamind auto` command the skills and the message use is a real one", () => {
  assert.equal(AUTO_SKILL, "qamind:qa-auto-run");
  assert.ok(fs.existsSync(path.join(repoRoot, "plugins", "qamind", "skills", AUTO_SKILL.split(":")[1] as string, "SKILL.md")));
  const known = new Set(["status", "on", "off", "mode", "pause", "resume", "global", "set", "skipped", "help"]);
  const text = [skillOf("qa-auto"), skillOf("qa-auto-run"), buildReason({ mode: "ask", files: ["a.js"], budgetMinutes: 5 })].join("\n");
  const used = [...text.matchAll(/(?:qamind|\{\{CLI\}\}|\{\{CLI_FALLBACK\}\}) auto ([a-z]+)/g)].map((m) => m[1] as string);
  assert.ok(used.length >= 8);
  assert.deepEqual(used.filter((u) => !known.has(u)), []);
});

test("the plugin registers the Stop and UserPromptSubmit hooks (no matcher) next to the safety hook, all through the one bundle", () => {
  const hooks = (JSON.parse(plugin("hooks", "hooks.json")) as { hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; args: string[]; timeout: number }> }>> }).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ["PreToolUse", "Stop", "UserPromptSubmit"]);
  for (const [event, sub] of [["Stop", "stop"], ["UserPromptSubmit", "user-prompt-submit"]] as const) {
    const entries = hooks[event] ?? [];
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.matcher, undefined, `${event} has no matcher`);
    assert.deepEqual(entries[0]?.hooks[0]?.args, ["${CLAUDE_PLUGIN_ROOT}/dist/qamind.mjs", "hook", sub]);
    assert.equal(entries[0]?.hooks[0]?.command, "node");
    assert.ok((entries[0]?.hooks[0]?.timeout ?? 0) >= 10);
  }
  assert.match(hooks["PreToolUse"]?.[0]?.matcher ?? "", /Bash/, "the safety hook still covers Bash");
  assert.match(hooks["PreToolUse"]?.[0]?.matcher ?? "", /\bSkill\b/, "and sees the Skill tool, to approve the one auto-QA call");
  const host = JSON.parse(read("hosts", "claude", "host.json")) as { hooks: { events_used: string[]; verified: { facts: string[] } } };
  assert.deepEqual(host.hooks.events_used.sort(), ["PreToolUse", "Stop", "UserPromptSubmit"]);
  assert.ok(host.hooks.verified.facts.some((f) => /stop_hook_active/.test(f)), "the verified hook facts are recorded");
});

test("the toggle skill documents every command, the tags and the modes the code implements", () => {
  const text = skillOf("qa-auto");
  for (const word of ["status", "on", "off", "mode", "pause", "resume", "global", "cooldown", "budget", "ignore", "#qa", "#qa-full", "#qa-fix", "#noqa", "QAMIND_AUTO=0", "diff", "quick", "full", "fix", "ask"]) assert.ok(text.includes(word), `${word} is documented`);
  assert.match(text, /Never edit the settings files yourself/);
});
