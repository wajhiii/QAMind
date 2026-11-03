import path from "node:path";
import { readJson } from "../fsutil.ts";

/** What `qamind tests run` wrote for a run (`data/bank-results.json`): the test bank's turn at the start of the run (spec 13.3). */
export type BankTestStatus = "passed" | "flaky-passed" | "failed" | "quarantined" | "skipped";

export interface BankTestResult {
  test: string;
  title: string;
  area: string;
  kind: "api" | "ui";
  /** The bug this test was saved to protect (set when it was written from a finding). */
  bug?: string;
  status: BankTestStatus;
  /** Why it failed or was skipped, in a sentence. Never holds credentials or personal data (masked like all evidence). */
  detail?: string;
  /** Wall time of the whole test, including a retry. */
  ms: number;
  attempts: number;
  /** Evidence file (relative to the run folder) of a failure. */
  evidence?: string;
}

export interface BankResults {
  schema_version: 1;
  run_id: string;
  ran_at: string;
  total: number;
  passed: number;
  flaky: number;
  failed: number;
  quarantined: number;
  skipped: number;
  results: BankTestResult[];
  /** Areas where at least one test passed: a run can spend its time elsewhere. */
  covered_areas: string[];
  /** The time budget ran out before every test ran. */
  budget_reached?: boolean;
}

export const bankResultsFile = (runDir: string): string => path.join(runDir, "data", "bank-results.json");
export const readBankResults = (runDir: string): BankResults | undefined => readJson<BankResults>(bankResultsFile(runDir));

/** A test counts for the lifecycle when it really ran: not quarantined, not skipped. A pass after a retry is still a pass. */
export function bankForLifecycle(r: BankResults | undefined): Array<{ test: string; bug?: string; passed: boolean }> {
  return (r?.results ?? []).filter((t) => t.status === "passed" || t.status === "flaky-passed" || t.status === "failed").map((t) => ({ test: t.test, ...(t.bug ? { bug: t.bug } : {}), passed: t.status !== "failed" }));
}
