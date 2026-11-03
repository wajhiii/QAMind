import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { decidePreToolUse } from "../../core/lib/hooks.ts";
import { makeRunWithData } from "./helpers.ts";

// Whose decision is what (spec 12): a QA run reads untrusted pages and has `qamind *` pre-approved, so what changes the owner's pictures or installs software is refused in the run.

const decide = (fx: { home: string }, tool: string, input: Record<string, unknown>) => decidePreToolUse({ session_id: "s1", tool_name: tool, tool_input: input, cwd: "/" }, fx.home, [], new Date("2026-10-30T10:30:00Z"));

test("a run may sweep, time, check messages and the ticket; it may not accept baselines or install a browser", () => {
  const fx = makeRunWithData();
  for (const ok of ["qamind sweep run --run r1", "qamind sweep check --run r1 --browsers webkit", "qamind perf api --run r1", "qamind mail wait --run r1 --to a1@acme.test", "qamind sms wait --run r1 --to +923000000000", "qamind ticket check --run r1", "qamind baseline status", "qamind browsers status", "node /x/qamind.mjs sweep run --run r1"]) {
    assert.equal(decide(fx, "Bash", { command: ok }), null, ok);
  }
  for (const no of ["qamind baseline accept --run r1", "node /x/plugins/qamind/dist/qamind.mjs baseline accept --run r1 --pages a", "qamind browsers install webkit", "cd /tmp; qamind browsers install firefox"]) {
    const d = decide(fx, "Bash", { command: no });
    assert.equal(d?.decision, "deny", no);
    assert.match(d?.reason ?? "", /accepting baseline pictures, installing a browser/);
  }
});

test("the owner's pictures and the speed history cannot be written from a run, by tool or by shell", () => {
  const fx = makeRunWithData();
  const store = path.join(fx.home, "projects", "p1");
  for (const file of [path.join(store, "baselines", "index.json"), path.join(store, "baselines", "my-orders__acme-1__chromium__mobile.png"), path.join(store, "memory", "perf.json")]) {
    const d = decide(fx, "Write", { file_path: file, content: "{}" });
    assert.equal(d?.decision, "deny", file);
  }
  const shell = decide(fx, "Bash", { command: `cp /tmp/x.png ${path.join(fx.home, "projects", "p1", "baselines", "a.png")}` });
  assert.equal(shell?.decision, "deny");
  assert.match(shell?.reason ?? "", /lesson or settings files/);
  assert.equal(decide(fx, "Write", { file_path: path.join(fx.runDir, "data", "sweep-pages.json"), content: "{}" }), null, "the run's own data files are its own");
  assert.equal(decide(fx, "Write", { file_path: path.join(fx.runDir, "evidence", "sweep", "before", "a.png"), content: "x" }), null, "so is its evidence, even in a folder called before");
});
