import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function tmp(prefix = "qamind-test-"): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t.t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** A project folder, optionally a git repo with an origin remote. */
export function makeProject(opts: { remote?: string; git?: boolean; files?: Record<string, string> } = {}): string {
  const dir = tmp("qamind-proj-");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "p", scripts: { test: "node --test" } }));
  for (const [f, c] of Object.entries(opts.files ?? {})) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  if (opts.git !== false) {
    git(dir, "init", "-q", "-b", "main");
    if (opts.remote) git(dir, "remote", "add", "origin", opts.remote);
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "init");
  }
  return dir;
}

export const DEMO_CONFIG = fs.readFileSync(path.join(repoRoot, "demo-app", "qa-fixture", "config.md"), "utf8");

export const DEMO_ENV: Record<string, string> = {
  QA_ADMIN_USER: "admin@lumen.test",
  QA_ADMIN_PASS: "pw-admin-1234",
  QA_ACME1_USER: "a1@acme.test",
  QA_ACME1_PASS: "pw-acme1-1234",
  QA_ACME2_USER: "a2@acme.test",
  QA_ACME2_PASS: "pw-acme2-1234",
  QA_BRIGHT1_USER: "b1@bright.test",
  QA_BRIGHT1_PASS: "pw-bright-1234",
  QA_ZAIN1_USER: "z1@zain.test",
  QA_ZAIN1_PASS: "pw-zain-1234",
};

/** Project with the demo config filled in, plus a matching .env.qa (so no process env is needed). */
export function makeConfiguredProject(opts: { remote?: string } = {}): string {
  const dir = makeProject(opts);
  fs.mkdirSync(path.join(dir, ".qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".qa", "config.md"), DEMO_CONFIG);
  fs.copyFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), path.join(dir, "openapi.yaml"));
  fs.writeFileSync(path.join(dir, ".env.qa"), Object.entries(DEMO_ENV).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  return dir;
}

export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(root, p).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

// ---- a finished-looking run with plain-language data, for the admin report tests ----
import { writeJson } from "../../core/lib/fsutil.ts";
import { startRun } from "../../core/lib/run.ts";
import type { CoverageRow, Finding, NotTested } from "../../core/lib/report.ts";

export const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

export function finding(over: Partial<Finding> & { id: string; severity: Finding["severity"] }): Finding {
  return {
    title: "Technical title",
    surface: "ui",
    area: "Orders",
    type: "validation",
    summary: "s",
    steps: ["POST /api/orders with quantity -3"],
    expected: "HTTP 400",
    actual: "HTTP 201",
    reproduced: { times: 2, of: 2 },
    evidence: ["evidence/api/e.json"],
    ...over,
  };
}

export interface FixtureOptions {
  findings?: Finding[];
  coverage?: CoverageRow[];
  notTested?: NotTested[];
  health?: { environment_ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string; skipped?: boolean }> };
  admin?: { biggest_risk?: string; next_steps?: string[] };
  unconfirmed?: number;
  mode?: "full" | "quick" | "regression" | "diff";
  pages?: Array<{ ui?: string; path?: string; url?: string; title?: string; roles?: string[] }>;
  endpoints?: string[];
}

export const ALL_FLOWS_TESTED: CoverageRow[] = [1, 2, 3, 4, 5].map((n) => ({ surface: "ui", ui: "Client Portal", area: `Journey ${n}`, status: "tested" as const, critical_flow: n }));

/** Write the standard fixture data files into a started run's folder. */
export function writeFixtureData(runDir: string, opts: FixtureOptions = {}): void {
  fs.mkdirSync(path.join(runDir, "evidence", "api"), { recursive: true });
  fs.mkdirSync(path.join(runDir, "screenshots"), { recursive: true });
  fs.writeFileSync(path.join(runDir, "evidence", "api", "e.json"), "{}");
  fs.writeFileSync(path.join(runDir, "screenshots", "shot.png"), PNG_1PX);
  writeJson(path.join(runDir, "data", "charters.json"), [{ id: "C1", surface: "api", title: "t", goal: "g", risk: "r", entry_point: "e", expected: "x", exit_condition: "c" }]);
  const findings = opts.findings ?? [
    finding({
      id: "ISSUE-001", severity: "critical", surface: "permissions", ui: "Client Portal", area: "Orders / access", title: "Any client can read another company's order by id", evidence: ["evidence/api/e.json", "screenshots/shot.png"],
      plain: {
        title: "A customer can open another company's order",
        where: "Client Portal → My orders → an order page",
        what_happens: "A signed-in customer who changes the number in the page address can read another company's order, including what they bought and what they paid.",
        who_is_affected: "Every customer: their orders can be seen by customers of other companies.",
        how_to_see_it: ["Sign in to the Client Portal as a customer of Company A.", "Open any order and look at the web address: it ends in a number such as 1050.", "Sign out, then sign in as a customer of Company B.", "Type the Company A address into the address bar and press Enter.", "You see Company A's order."],
        expected: "Company B's customer is told the order is not available.",
        screenshot: "screenshots/shot.png",
      },
    }),
    finding({
      id: "ISSUE-002", severity: "important", surface: "api", area: "Errors", title: "Malformed JSON returns a stack trace",
      plain: {
        title: "Technical error details are shown to anyone who sends a broken request",
        where: "Behind the screens (the part that talks to the Client Portal and Admin Portal)",
        what_happens: "When the system receives a request it cannot read, its reply includes internal details about how the system is built.",
        who_is_affected: "Everyone indirectly: it makes the system easier to attack.",
        how_to_see_it: [],
        expected: "A short, friendly message with no internal details.",
      },
    }),
    finding({
      id: "ISSUE-003", severity: "minor", surface: "ui", ui: "Admin Portal", area: "Orders / display", title: "Zero discount shown as -$0.00",
      plain: {
        title: "A discount of nothing is shown as a negative amount",
        where: "Admin Portal → Orders → an order page",
        what_happens: "Orders with no discount show the discount line as -$0.00.",
        who_is_affected: "Staff reading order totals; it looks like an error.",
        how_to_see_it: ["Sign in to the Admin Portal.", "Open Orders, then open an order below 1,000.00.", "Look at the Discount line under the totals."],
        expected: "The line shows $0.00, or is hidden.",
      },
    }),
  ];
  writeJson(path.join(runDir, "data", "findings.json"), findings);
  writeJson(path.join(runDir, "data", "coverage.json"), opts.coverage ?? [
    ...ALL_FLOWS_TESTED.slice(0, 2),
    { surface: "ui", ui: "Admin Portal", area: "Orders", status: "tested", critical_flow: 3 },
    { surface: "api", area: "Orders API", status: "tested" },
    { surface: "permissions", area: "Roles", status: "tested", critical_flow: 4 },
    { surface: "ui", ui: "Admin Portal", area: "Customers page", status: "not-tested", note: "not covered", critical_flow: 5 },
  ]);
  writeJson(path.join(runDir, "data", "not-tested.json"), opts.notTested ?? [
    { area: "API / password reset", reason: "Would send email", plain: { area: "Password reset emails", reason: "Testing it would send real emails, and no safe test mailbox is set up." } },
  ]);
  writeJson(path.join(runDir, "data", "unconfirmed.json"), Array.from({ length: opts.unconfirmed ?? 0 }, (_, i) => ({ title: `u${i}`, surface: "ui", observation: "o", why_unconfirmed: "w", attempts: 2 })));
  writeJson(path.join(runDir, "data", "health.json"), { ...(opts.health ?? { environment_ok: true, checks: [] }), ran_at: "2026-10-30T10:01:00Z" });
  if (opts.admin) writeJson(path.join(runDir, "data", "admin.json"), opts.admin);
  if (opts.pages) writeJson(path.join(runDir, "data", "pages.json"), opts.pages);
  if (opts.endpoints) writeJson(path.join(runDir, "data", "endpoints.json"), opts.endpoints);
}

/** A configured project with a started run and the given data files written. The run is NOT finished (marker stays). */
export function makeRunWithData(opts: FixtureOptions = {}): { home: string; proj: string; runId: string; runDir: string; store: string } {
  const home = tmp("qamind-home-");
  const proj = makeConfiguredProject({ remote: "https://github.com/acme/shop.git" });
  const r = startRun({ cwd: proj, mode: opts.mode ?? "full", kind: "qa-only", host: "test", home, env: {}, sessionId: "s1", now: new Date("2026-10-30T10:00:00Z") });
  if (r.status !== "ready" || !r.run || !r.project) throw new Error(`fixture run did not start: ${r.status}`);
  writeFixtureData(r.run.dir, opts);
  return { home, proj, runId: r.run.id, runDir: r.run.dir, store: r.project.store };
}

/** Another run in the same project and store (the previous run should be finished first). */
export function startAnotherRun(prev: { home: string; proj: string }, at: string, opts: FixtureOptions = {}): { runId: string; runDir: string; store: string } {
  const r = startRun({ cwd: prev.proj, mode: opts.mode ?? "full", kind: "qa-only", host: "test", home: prev.home, env: {}, sessionId: `s-${at}`, now: new Date(at) });
  if (r.status !== "ready" || !r.run || !r.project) throw new Error(`second run did not start: ${r.status} ${r.message}`);
  writeFixtureData(r.run.dir, opts);
  return { runId: r.run.id, runDir: r.run.dir, store: r.project.store };
}

/** Run a CLI command in-process and capture its JSON output and exit code. */
export async function cli(home: string, ...args: string[]): Promise<{ code: number; json: any }> {
  const { main } = await import("../../cli/src/main.ts");
  const prevHome = process.env["QAMIND_HOME"];
  process.env["QAMIND_HOME"] = home;
  const writes: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((c: string | Uint8Array) => (writes.push(String(c)), true)) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    const code = await main(args);
    const text = writes.join("");
    return { code, json: text.trim().startsWith("{") ? JSON.parse(text) : text };
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
    if (prevHome === undefined) delete process.env["QAMIND_HOME"];
    else process.env["QAMIND_HOME"] = prevHome;
  }
}
