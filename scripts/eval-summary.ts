/**
 * Aggregate the repetitions of an evaluation label so phases can be compared fairly.
 *   node scripts/eval-summary.ts <label> [mode]
 * Prints mean / min / max over docs/baselines/<label>-<mode>-r*.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "baselines");
const [label, mode = "full"] = process.argv.slice(2);
if (!label) {
  console.error("usage: node scripts/eval-summary.ts <label> [mode]");
  process.exit(2);
}
interface Rec {
  rep: number;
  settings: { claude: { model_in_session?: string }; qamind: { git_commit: string } };
  results: {
    cost_usd: number | null;
    wall_minutes: number;
    turns: number | null;
    findings: number;
    page_audit_calls: number;
    knowledge_files_read: string[];
    score: { found?: number; missed?: string[]; decoy_hits?: unknown[]; depth_score?: string; lead_only?: number; per_bug?: Array<{ id: string; status: string }> };
  };
}
const files = fs.readdirSync(dir).filter((f) => new RegExp(`^${label}-${mode}-r\\d+\\.json$`).test(f)).sort();
if (!files.length) {
  console.error(`No records for ${label}-${mode} in ${dir}`);
  process.exit(1);
}
const recs = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Rec);
const stat = (xs: number[]) => `${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)} (min ${Math.min(...xs).toFixed(1)}, max ${Math.max(...xs).toFixed(1)})`;
const depth = (r: Rec) => Number((r.results.score.depth_score ?? "0/0").split("/")[0]);
console.log(`${label} / ${mode}: ${recs.length} run(s), model ${[...new Set(recs.map((r) => r.settings.claude.model_in_session))].join(", ")}, commit ${[...new Set(recs.map((r) => r.settings.qamind.git_commit.slice(0, 8)))].join(", ")}`);
console.log(`  seeded bugs found (of 14): ${stat(recs.map((r) => r.results.score.found ?? 0))}   per run: ${recs.map((r) => r.results.score.found ?? 0).join(", ")}`);
console.log(`  depth markers (of 4):      ${stat(recs.map(depth))}   per run: ${recs.map(depth).join(", ")}`);
console.log(`  decoy false positives:     ${stat(recs.map((r) => r.results.score.decoy_hits?.length ?? 0))}`);
console.log(`  findings reported:         ${stat(recs.map((r) => r.results.findings))}`);
console.log(`  cost USD:                  ${stat(recs.map((r) => r.results.cost_usd ?? 0))}`);
console.log(`  wall minutes:              ${stat(recs.map((r) => r.results.wall_minutes))}`);
console.log(`  agent turns:               ${stat(recs.map((r) => r.results.turns ?? 0))}`);
console.log(`  page audits per run:       ${stat(recs.map((r) => r.results.page_audit_calls))}`);
console.log(`  knowledge files read/run:  ${stat(recs.map((r) => r.results.knowledge_files_read.length))}`);
const perBug: Record<string, number> = {};
for (const r of recs) for (const b of r.results.score.per_bug ?? []) if (b.status === "FOUND") perBug[b.id] = (perBug[b.id] ?? 0) + 1;
console.log(`  per-bug detection (runs that found it, of ${recs.length}): ${Object.entries(perBug).sort().map(([k, v]) => `${k}:${v}`).join(" ")}`);
const missedCount: Record<string, number> = {};
for (const r of recs) for (const m of r.results.score.missed ?? []) missedCount[m] = (missedCount[m] ?? 0) + 1;
console.log(`  missed (runs missing it):  ${Object.entries(missedCount).map(([k, v]) => `${k} x${v}`).join(", ") || "none"}`);
