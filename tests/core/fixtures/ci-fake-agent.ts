/**
 * A stand-in for the host CLI in `qamind ci` tests: it does what an agent does to a project, deterministically, through the real QAMind CLI
 * (starts a run, writes the data files, builds the reports, finishes). The scenario comes from FAKE_SCENARIO. Not a test file.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { finding, writeFixtureData } from "../helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(here, "..", "..", "..", "cli", "src", "bin.ts");
const project = process.env["QAMIND_PROJECT_DIR"] as string;
const scenario = process.env["FAKE_SCENARIO"] ?? "critical";
const qamind = (...args: string[]): { status: number | null; out: string } => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: project, env: { ...process.env, NODE_NO_WARNINGS: "1" }, encoding: "utf8" });
  return { status: r.status, out: r.stdout };
};

// An agent must never print a secret; this one does, to prove the log is scrubbed.
console.log(`fake agent: scenario ${scenario}; the login is ${process.env["QA_ADMIN_PASS"] ?? "(none)"}; the mode is ${process.env["QAMIND_CI_MODE"]}`);
console.log(`prompt: ${process.env["QAMIND_CI_PROMPT"]}`);
if (scenario === "crash") process.exit(3);
if (scenario === "hang") setTimeout(() => undefined, 600_000);
else {
  const ticket = process.env["QAMIND_CI_MODE"] === "ticket" ? ["--ticket", process.env["FAKE_TICKET"] ?? "none"] : [];
  const start = JSON.parse(qamind("run", "start", "--mode", process.env["QAMIND_CI_MODE"] ?? "diff", ...ticket, "--session", "ci-fake").out) as { run?: { id: string; dir: string }; status: string };
  if (!start.run) {
    console.log(`run start said ${start.status}`);
    process.exit(4);
  }
  if (scenario === "unfinished") process.exit(0);
  if (scenario === "ticket") {
    // A ticket run in CI: the agent derived the criteria (nobody can confirm them) and answered each.
    writeFixtureData(start.run.dir, { findings: [] });
    fs.writeFileSync(path.join(start.run.dir, "data", "ticket.json"), JSON.stringify({ ref: process.env["FAKE_TICKET"], source: "file", title: "Reorder a past order", criteria: [{ id: "AC-1", text: "A customer can reorder a past order in one click.", plain: "A customer can order the same things again with one click.", origin: "derived" }] }));
    fs.writeFileSync(path.join(start.run.dir, "data", "ticket-results.json"), JSON.stringify([{ criterion: "AC-1", status: "met", why: "Clicked reorder on a past order and the same lines were in the new order.", evidence: ["evidence/api/e.json"] }]));
  }
  const serious = [
    finding({ id: "ISSUE-001", severity: "critical", surface: "permissions", area: "Orders / access", title: "Any client can read another company's order by id", plain: { title: "A customer can open another company's order", where: "Client Portal → My orders → an order page", what_happens: "A signed-in customer who changes the number in the page address can read another company's order.", who_is_affected: "Every customer: their orders can be seen by customers of other companies.", how_to_see_it: ["Sign in as a customer of Company A.", "Open an order and look at the address.", "Change the number and open it as Company B's customer."], expected: "Company B's customer is told the order is not available." } }),
    finding({ id: "ISSUE-002", severity: "important", surface: "api", area: "Errors", title: "Malformed JSON returns a stack trace", plain: { title: "Technical error details are shown to anyone who sends a broken request", where: "Behind the screens (the part that talks to the screens)", what_happens: "When the system receives a request it cannot read, its reply includes internal details.", who_is_affected: "Everyone indirectly.", how_to_see_it: [], expected: "A short, friendly message." } }),
  ];
  const important = serious.slice(1);
  if (scenario !== "ticket") writeFixtureData(start.run.dir, {
    findings: scenario === "clean" ? [] : scenario === "important" ? important : serious,
    ...(scenario === "env" ? { health: { environment_ok: false, checks: [{ name: "API base responds", ok: false, detail: "no response (twice)" }] } } : {}),
  });
  if (scenario === "env") fs.writeFileSync(path.join(start.run.dir, "data", "findings.json"), "[]");
  if (scenario === "edit") fs.appendFileSync(path.join(project, "README.md"), "\nchanged by the agent\n");
  qamind("report", "build", "--run", start.run.id);
  qamind("report", "lint", "--run", start.run.id);
  const fin = qamind("run", "finish", "--run", start.run.id, ...(scenario === "env" ? ["--stop-reason", "environment problem"] : []));
  console.log(`run finish: ${fin.status}`);
}
