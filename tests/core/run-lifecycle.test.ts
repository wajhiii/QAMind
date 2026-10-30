import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { writeJson } from "../../core/lib/fsutil.ts";
import { loadMemoryContext } from "../../core/lib/memory.ts";
import { lintRun, readRunData } from "../../core/lib/report.ts";
import type { Finding } from "../../core/lib/report.ts";
import { finishRun, markerPath, readMarker, startRun } from "../../core/lib/run.ts";
import { DEMO_ENV, listFiles, makeConfiguredProject, makeProject, tmp } from "./helpers.ts";

const base = (home: string, cwd: string, extra: Partial<Parameters<typeof startRun>[0]> = {}) =>
  startRun({ cwd, mode: "quick", kind: "qa-only", host: "test", home, env: {}, sessionId: "sess-1", ...extra });

test("first run scaffolds config and .env.qa.example, updates .gitignore, writes memory only to the store, then stops", () => {
  const home = tmp("qamind-home-");
  const proj = makeProject({ remote: "https://github.com/acme/shop.git" });
  const before = listFiles(proj);
  const r = base(home, proj);
  assert.equal(r.status, "needs-config");
  assert.match(r.message, /Nothing was tested/);
  const added = listFiles(proj).filter((f) => !before.includes(f));
  assert.deepEqual(added, [".env.qa.example", ".gitignore", ".qa/config.md"]);
  assert.ok(fs.readFileSync(path.join(proj, ".gitignore"), "utf8").includes(".qa/"));
  assert.ok(fs.existsSync(path.join(r.project!.store, "project.json")));
  assert.equal(fs.existsSync(path.join(proj, ".qa", "reports")), false, "no run folder before the config is filled in");
  assert.equal(readMarker(r.project!.store), undefined);
});

test("an unfilled template is refused on the next run and nothing is overwritten", () => {
  const home = tmp("qamind-home-");
  const proj = makeProject();
  base(home, proj);
  const config = fs.readFileSync(path.join(proj, ".qa", "config.md"), "utf8");
  const again = base(home, proj);
  assert.equal(again.status, "unfilled");
  assert.equal(fs.readFileSync(path.join(proj, ".qa", "config.md"), "utf8"), config);
});

test("not a project: asks which folder, offering known projects", () => {
  const home = tmp("qamind-home-");
  const known = makeProject();
  base(home, known);
  const empty = tmp("qamind-empty-");
  const r = base(home, empty);
  assert.equal(r.status, "no-project");
  assert.equal(r.known_projects?.length, 1);
});

test("a ready run: only .qa/ and .gitignore change in the project; marker and run data are consistent", () => {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject({ remote: "https://github.com/acme/shop.git" });
  const before = listFiles(proj);
  const r = base(home, proj, { focus: "orders" });
  assert.equal(r.status, "ready", JSON.stringify(r.problems));
  assert.equal(r.run?.readonly, true);
  assert.equal(r.config?.roles.every((x) => x.has_credentials), true);
  const changed = listFiles(proj).filter((f) => !before.includes(f));
  assert.ok(changed.every((f) => f.startsWith(".qa/") || f === ".gitignore"), changed.join(", "));
  const marker = readMarker(r.project!.store)!;
  assert.equal(marker.session_id, "sess-1");
  assert.ok(marker.policy.allowed_origins.includes("http://127.0.0.1:4100"));
  assert.ok(markerPath(r.project!.store).startsWith(home));
  assert.equal(JSON.stringify(r).includes(DEMO_ENV["QA_ADMIN_PASS"] as string), false, "credential values never appear in output");
  assert.ok(fs.existsSync(path.join(r.project!.store, "memory", "stack.json")));
});

test("no usable credentials stops the run; a role without credentials is merely flagged", () => {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject();
  fs.unlinkSync(path.join(proj, ".env.qa"));
  assert.equal(base(home, proj).status, "missing-env");
  fs.writeFileSync(path.join(proj, ".env.qa"), "QA_ADMIN_USER=a\nQA_ADMIN_PASS=b\n");
  const r = base(home, proj);
  assert.equal(r.status, "ready");
  assert.equal(r.config?.roles.find((x) => x.name === "admin")?.has_credentials, true);
  assert.equal(r.config?.roles.find((x) => x.name === "acme-1")?.has_credentials, false);
  assert.ok(r.missing_env?.includes("QA_ACME1_PASS"));
});

test("a second run while one is active is refused unless forced or the same session", () => {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject();
  assert.equal(base(home, proj).status, "ready");
  assert.equal(base(home, proj, { sessionId: "other" }).status, "busy");
  assert.equal(base(home, proj, { sessionId: "sess-1" }).status, "ready");
  assert.equal(base(home, proj, { sessionId: "other", force: true }).status, "ready");
});

test("finish writes the run summary to the store, clears the marker, and the report carries the stop reason", () => {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject();
  const r = base(home, proj);
  const runDir = r.run!.dir;
  writeJson(path.join(runDir, "data", "charters.json"), [{ id: "C1", surface: "api", title: "t", goal: "g", risk: "r", entry_point: "e", expected: "x", exit_condition: "c" }]);
  writeJson(path.join(runDir, "data", "not-tested.json"), [{ area: "Client Portal / reset email", reason: "No email sandbox configured" }]);
  writeJson(path.join(runDir, "data", "coverage.json"), [{ surface: "ui", area: "Reports", status: "not-tested", note: "time budget reached" }]);
  const summary = finishRun({ home, runId: r.run!.id, stopReason: "time budget reached" });
  assert.equal(summary.not_tested_count, 2);
  assert.equal(readMarker(r.project!.store), undefined);
  assert.ok(fs.existsSync(path.join(r.project!.store, "memory", "runs", `${r.run!.id}.json`)));
  const report = fs.readFileSync(path.join(runDir, "TECHNICAL-REPORT.md"), "utf8");
  assert.match(report, /time budget reached/);
  assert.match(report, /Reports/, "a not-tested coverage row appears under Not tested");
  const memory = loadMemoryContext(r.project!.store);
  assert.equal(memory.last_runs.length, 1);
  assert.equal(memory.stack?.test_runners.includes("node:test"), true, "the detected stack is part of memory");
});

test("lint enforces the evidence rules and catches leaked secrets", () => {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject();
  const r = base(home, proj);
  const runDir = r.run!.dir;
  const finding: Finding = {
    title: "Negative quantity accepted", severity: "important", surface: "api", area: "Orders", type: "validation", summary: "s",
    steps: ["do it"], expected: "400", actual: "201", reproduced: { times: 1, of: 2 }, evidence: ["evidence/api/missing.json"],
    plain: { title: "The system accepts a negative quantity", where: "Behind the screens", what_happens: "A negative number of items is accepted.", who_is_affected: "Customers and staff.", how_to_see_it: [], expected: "It is refused." },
  };
  writeJson(path.join(runDir, "data", "findings.json"), [finding]);
  let lint = lintRun(runDir, readRunData(runDir), [DEMO_ENV["QA_ADMIN_PASS"] as string]);
  assert.equal(lint.ok, false);
  assert.ok(lint.errors.some((e) => /No charters/.test(e)));
  assert.ok(lint.errors.some((e) => /at least twice/.test(e)));
  assert.ok(lint.errors.some((e) => /does not exist/.test(e)));

  writeJson(path.join(runDir, "data", "charters.json"), [{ id: "C1", surface: "api", title: "t", goal: "g", risk: "r", entry_point: "e", expected: "x", exit_condition: "c" }]);
  fs.mkdirSync(path.join(runDir, "evidence", "api"), { recursive: true });
  fs.writeFileSync(path.join(runDir, "evidence", "api", "ok.json"), `{"note":"password was ${DEMO_ENV["QA_ADMIN_PASS"]}"}`);
  writeJson(path.join(runDir, "data", "findings.json"), [{ ...finding, reproduced: { times: 2, of: 2 }, evidence: ["evidence/api/ok.json"] }]);
  lint = lintRun(runDir, readRunData(runDir), [DEMO_ENV["QA_ADMIN_PASS"] as string]);
  assert.ok(lint.errors.some((e) => /configured test password/.test(e)), lint.errors.join("; "));

  // A hand-written plan may carry a deliberately fake token; only real configured secrets matter in plans.
  fs.mkdirSync(path.join(runDir, "data", "plans"), { recursive: true });
  fs.writeFileSync(path.join(runDir, "data", "plans", "p.json"), `{"headers":{"Authorization":"Bearer fake-token-for-an-invalid-token-probe"}}`);
  fs.writeFileSync(path.join(runDir, "evidence", "api", "ok.json"), `{"note":"clean"}`);
  writeJson(path.join(runDir, "data", "findings.json"), [{ ...finding, reproduced: { times: 2, of: 2 }, evidence: ["../../../../etc/passwd"] }]);
  assert.ok(lintRun(runDir, readRunData(runDir)).errors.some((e) => /outside the run folder/.test(e)));
  writeJson(path.join(runDir, "data", "findings.json"), [{ ...finding, reproduced: { times: 2, of: 2 }, evidence: ["evidence/api/ok.json"] }]);
  assert.equal(lintRun(runDir, readRunData(runDir), [DEMO_ENV["QA_ADMIN_PASS"] as string]).ok, true, "a fake token in a plan is fine");
  fs.writeFileSync(path.join(runDir, "data", "plans", "p.json"), `{"password":"${DEMO_ENV["QA_ADMIN_PASS"]}"}`);
  assert.ok(lintRun(runDir, readRunData(runDir), [DEMO_ENV["QA_ADMIN_PASS"] as string]).errors.some((e) => /data\/plans\/p.json/.test(e)), "a real configured password in a plan is still an error");
});
