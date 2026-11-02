import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { resetMigrationMemo, ensureMigrated } from "../../core/lib/memory/migrate.ts";
import { loadLearnings } from "../../core/lib/memory/learnings.ts";
import { loadMemoryContext } from "../../core/lib/memory/context.ts";
import { MEMORY_SCHEMA, readJsonl } from "../../core/lib/memory/store.ts";
import { parseUsage } from "../../core/lib/budget.ts";
import { repoRoot, tmp } from "./helpers.ts";

// "Old memory migrates with a backup" (spec 13.17, Phase 7.6), with a REAL old store: tests/core/fixtures/memory-v1 was written by QAMind 0.7.5 (memory format 1) through its own server.

const FIXTURE = path.join(repoRoot, "tests", "core", "fixtures", "memory-v1");
const PROJECT = "github.com-acme-conformance-0cef0241";

function oldStore(): { store: string; before: Map<string, string> } {
  const root = tmp("qamind-oldstore-");
  const store = path.join(root, "projects", PROJECT);
  fs.cpSync(path.join(FIXTURE, PROJECT), store, { recursive: true });
  const before = new Map<string, string>();
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else before.set(path.relative(store, p).split(path.sep).join("/"), fs.readFileSync(p, "utf8"));
    }
  };
  walk(store);
  return { store, before };
}
const versionOf = (file: string): number => (file.endsWith(".jsonl") ? (JSON.parse(fs.readFileSync(file, "utf8").split("\n")[0] as string) as { _meta: { schema_version: number } })._meta.schema_version : (JSON.parse(fs.readFileSync(file, "utf8")) as { schema_version: number }).schema_version);

test("the fixture really is format 1 (so the test below proves a migration, not a no-op)", () => {
  const { store } = oldStore();
  assert.equal(MEMORY_SCHEMA, 2);
  for (const f of ["memory/learnings.jsonl", "memory/false-alarms.jsonl", "memory/risk-areas.json", "memory/product-map.json", "memory/stack.json", "memory/runs/run-20261102T102723Z.json", "memory/runs/run-20261102T102724Z.json"]) assert.equal(versionOf(path.join(store, f)), 1, f);
  assert.equal(JSON.parse(fs.readFileSync(path.join(store, "memory", "runs", "run-20261102T102724Z.json"), "utf8")).usage, undefined, "format 1 had no usage block");
});

test("an old store is migrated on first use, after a backup that holds every changed file as it was, with a log, and nothing is lost", () => {
  resetMigrationMemo();
  const { store, before } = oldStore();
  const report = ensureMigrated(store);
  assert.ok(report.backup, "a backup was made");
  assert.ok(report.backup?.startsWith(path.join(store, "backups")));
  assert.equal(report.migrated.length, 7, "every memory file was at format 1");
  assert.ok(report.migrated.every((m) => m.from === 1 && m.to === 2));

  // the backup is each file exactly as the old QAMind wrote it
  for (const m of report.migrated) assert.equal(fs.readFileSync(path.join(report.backup as string, m.file), "utf8"), before.get(m.file), `${m.file}: the backup is the original`);

  // every file is now format 2 ...
  for (const f of ["memory/learnings.jsonl", "memory/false-alarms.jsonl", "memory/risk-areas.json", "memory/product-map.json", "memory/stack.json", "memory/runs/run-20261102T102723Z.json", "memory/runs/run-20261102T102724Z.json"]) assert.equal(versionOf(path.join(store, f)), 2, f);

  // ... with every record and field kept
  const learnings = readJsonl<{ id: string; text: string; confidence: number }>(path.join(store, "memory", "learnings.jsonl")).records;
  const oldLearnings = readJsonl<{ id: string; text: string; confidence: number }>(path.join(report.backup as string, "memory", "learnings.jsonl")).records;
  assert.deepEqual(learnings, oldLearnings, "learnings are unchanged but for the version header");
  assert.equal(loadLearnings(store).active.length, 3);
  const oldAlarms = readJsonl<object>(path.join(report.backup as string, "memory", "false-alarms.jsonl")).records;
  assert.deepEqual(readJsonl<object>(path.join(store, "memory", "false-alarms.jsonl")).records, oldAlarms);
  const strip = (v: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(v).filter(([k]) => k !== "schema_version"));
  for (const f of ["memory/risk-areas.json", "memory/product-map.json", "memory/stack.json"]) assert.deepEqual(strip(JSON.parse(fs.readFileSync(path.join(store, f), "utf8"))), strip(JSON.parse(before.get(f) as string)), `${f}: only the version changed`);

  // run summaries gain the structured usage, and keep the old text
  const q = JSON.parse(fs.readFileSync(path.join(store, "memory", "runs", "run-20261102T102724Z.json"), "utf8"));
  assert.deepEqual(q.usage, { duration_s: q.duration_s, cost_usd: 0.31, note: "$0.31" }, "a cost the old text gave is now a number");
  assert.equal(q.cost, "$0.31", "the old text is kept as it was");
  const f = JSON.parse(fs.readFileSync(path.join(store, "memory", "runs", "run-20261102T102723Z.json"), "utf8"));
  assert.deepEqual(f.usage, { duration_s: f.duration_s, note: "not available on this host" });
  assert.deepEqual(strip({ ...f, usage: undefined, cost: f.cost }), strip({ ...JSON.parse(before.get("memory/runs/run-20261102T102723Z.json") as string), usage: undefined }), "no other field of the run summary changed");

  // the log says what happened
  const log = fs.readFileSync(path.join(store, "backups", "migrations.log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { file: string; from: number; to: number; migrations: string[]; backup: string; describe: string[] });
  assert.equal(log.length, 7);
  assert.ok(log.some((e) => e.file === "memory/runs/run-20261102T102724Z.json" && e.migrations[0] === "run-summary-1-to-2" && /usage/.test(e.describe.join(" "))));
  assert.ok(log.every((e) => e.backup === path.relative(store, report.backup as string).split(path.sep).join("/")));

  // it is idempotent, and the migrated store works
  resetMigrationMemo();
  assert.deepEqual(ensureMigrated(store), { migrated: [] }, "nothing left to migrate the second time, and no second backup");
  assert.equal(fs.readdirSync(path.join(store, "backups")).filter((d) => d !== "migrations.log.jsonl").length, 1);
  const ctx = loadMemoryContext(store, 3, new Date("2026-11-03T00:00:00Z"));
  assert.equal(ctx.last_runs.length, 2, "both old runs are still in the history");
  assert.equal(ctx.false_alarms.length, 1);
});

test("a store written by a newer QAMind is refused as a whole and left exactly as it was", () => {
  resetMigrationMemo();
  const { store, before } = oldStore();
  const f = path.join(store, "memory", "risk-areas.json");
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, "utf8")), schema_version: MEMORY_SCHEMA + 1 }));
  const touched = fs.readFileSync(f, "utf8");
  assert.throws(() => ensureMigrated(store), /newer QAMind.*Update QAMind/);
  assert.equal(fs.readFileSync(f, "utf8"), touched);
  for (const [name, text] of before) if (name !== "memory/risk-areas.json") assert.equal(fs.readFileSync(path.join(store, name), "utf8"), text, `${name} was not touched`);
  const b = path.join(store, "backups");
  assert.deepEqual(fs.existsSync(b) ? fs.readdirSync(b) : [], [], "no backup was made and no migration log written: no half-migration");
});

test("usage is read from what the host or agent said, and the duration is always the measured one", () => {
  assert.deepEqual(parseUsage(undefined, 90), { duration_s: 90, note: "not available on this host" });
  assert.deepEqual(parseUsage("not available on this host", 10), { duration_s: 10, note: "not available on this host" });
  assert.deepEqual(parseUsage("$0.31", 5), { duration_s: 5, cost_usd: 0.31, note: "$0.31" });
  assert.equal(parseUsage("about $2.50 for the run", 5).cost_usd, 2.5);
  assert.equal(parseUsage("1.25 USD", 5).cost_usd, 1.25);
  assert.equal(parseUsage("12,345 tokens", 5).tokens, 12345);
  assert.equal(parseUsage("12k tokens and $0.40", 5).tokens, 12000);
  assert.equal(parseUsage("12k tokens and $0.40", 5).cost_usd, 0.4);
  assert.deepEqual(parseUsage("a lot", 5), { duration_s: 5, note: "a lot" }, "text with no number gives no number");
});

test("a fresh run writes format 2 everywhere, so a store never needs migrating twice", async () => {
  const { makeRunWithData } = await import("./helpers.ts");
  const { finishRunTracked } = await import("../../core/lib/memory/service.ts");
  resetMigrationMemo();
  const fx = makeRunWithData();
  const done = finishRunTracked(fx.home, fx.runId, { cost: "$0.12" });
  assert.equal(done.usage?.cost_usd, 0.12);
  const mem = path.join(fx.store, "memory");
  for (const f of ["product-map.json", "risk-areas.json", "stack.json"]) assert.equal(versionOf(path.join(mem, f)), MEMORY_SCHEMA, f);
  assert.equal(versionOf(path.join(mem, "runs", `${fx.runId}.json`)), MEMORY_SCHEMA);
  resetMigrationMemo();
  assert.deepEqual(ensureMigrated(fx.store), { migrated: [] }, "nothing is written at an older number: not the stack file, not the maps, not the summary");
});
