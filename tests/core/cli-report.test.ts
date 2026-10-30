import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { main } from "../../cli/src/main.ts";
import { makeRunWithData } from "./helpers.ts";

/** Run a CLI command in-process and capture its JSON output and exit code. */
async function cli(home: string, ...args: string[]): Promise<{ code: number; json: any }> {
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

test("report build writes both reports, lint passes, check passes, and export-html writes one self-contained file", async () => {
  const fx = makeRunWithData({ admin: { biggest_risk: "Customers' orders can be read by other customers." } });

  const build = await cli(fx.home, "report", "build", "--run", fx.runId);
  assert.equal(build.code, 0);
  assert.match(build.json.verdict, /^⛔ \*\*Not ready to release/);
  assert.ok(fs.existsSync(build.json.admin_report) && fs.existsSync(build.json.technical_report));

  const lint = await cli(fx.home, "report", "lint", "--run", fx.runId);
  assert.equal(lint.code, 0, JSON.stringify(lint.json.errors));
  assert.equal(lint.json.ok, true);

  const check = await cli(fx.home, "report", "check", "--run", fx.runId);
  assert.equal(check.code, 0);
  assert.deepEqual(check.json.technical.map((x: { id: string }) => x.id), check.json.admin.map((x: { id: string }) => x.id));

  const exported = await cli(fx.home, "report", "export-html", "--run", fx.runId);
  assert.equal(exported.code, 0);
  assert.equal(exported.json.images_embedded, 1);
  assert.match(exported.json.warning, /not masked/);
  assert.ok(fs.readFileSync(exported.json.file, "utf8").startsWith("<!doctype html>"));

  const bare = await cli(fx.home, "report", "export-html", "--run", fx.runId, "--no-images", "--out", path.join(fx.runDir, "x.html"));
  assert.equal(bare.json.images_embedded, 0);
});

test("report lint fails (exit 1) on a hand-edited admin report, and does not rebuild over the edit", async () => {
  const fx = makeRunWithData();
  await cli(fx.home, "report", "build", "--run", fx.runId);
  const admin = path.join(fx.runDir, "ADMIN-REPORT.md");
  const edited = fs.readFileSync(admin, "utf8").replace("🔴 1 critical", "🔴 0 critical");
  fs.writeFileSync(admin, edited);
  const lint = await cli(fx.home, "report", "lint", "--run", fx.runId);
  assert.equal(lint.code, 1);
  assert.ok(lint.json.errors.some((e: string) => /admin summary says 0 critical/.test(e)));
  assert.equal(fs.readFileSync(admin, "utf8"), edited, "lint left the edit in place so the disagreement stays visible");
  assert.equal((await cli(fx.home, "report", "check", "--run", fx.runId)).code, 1);
});

test("unknown report subcommand is a usage error", async () => {
  const fx = makeRunWithData();
  const r = await cli(fx.home, "report", "nonsense", "--run", fx.runId);
  assert.equal(r.code, 2);
});
