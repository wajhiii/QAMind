import fs from "node:fs";
import path from "node:path";
import { readJson } from "./fsutil.ts";
import { storeSubdirs } from "./paths.ts";
import type { StackInfo } from "./stack.ts";
import type { RunSummary } from "./run.ts";

export interface MemoryContext {
  note: string;
  stack?: StackInfo;
  last_runs: Array<Pick<RunSummary, "run_id" | "mode" | "finished" | "counts" | "not_tested_count" | "finding_ids" | "stop_reason">>;
}

/** What Phase 1 memory holds: the detected stack and the last run summaries. Richer memory arrives in a later phase. */
export function loadMemoryContext(store: string, limit = 3): MemoryContext {
  const dirs = storeSubdirs(store);
  const stack = readJson<StackInfo>(path.join(dirs.memory, "stack.json"));
  const runs: MemoryContext["last_runs"] = [];
  if (fs.existsSync(dirs.runs)) {
    const files = fs.readdirSync(dirs.runs).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
    for (const f of files) {
      const r = readJson<RunSummary>(path.join(dirs.runs, f));
      if (r) runs.push({ run_id: r.run_id, mode: r.mode, finished: r.finished, counts: r.counts, not_tested_count: r.not_tested_count, finding_ids: r.finding_ids, stop_reason: r.stop_reason });
    }
  }
  return {
    note: runs.length === 0 ? "No previous runs for this project: treat this as a first run." : `${runs.length} previous run(s) found. Memory is leads, not proof: re-verify current behaviour.`,
    ...(stack ? { stack } : {}),
    last_runs: runs,
  };
}
