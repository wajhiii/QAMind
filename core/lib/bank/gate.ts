import path from "node:path";
import { readJson } from "../fsutil.ts";
import type { Finding } from "../report.ts";
import { loadBank } from "./bank.ts";

/**
 * A run that found serious problems has to leave something behind for the next run (spec 13.3: "after each run, the agent saves its most valuable checks"). Left to the agent's memory at the very end of a long run
 * it was skipped in real runs (the agent finished with seven findings and no test), so `run finish` asks for it: save a test, or say in `data/bank-skip.json` why none of the findings can be written as one.
 * Not asked of a run that could not do it: an auto-QA or CI run (quick feedback, tight budgets), one whose time ran out, one that stopped on a broken environment, or one with nothing serious found.
 */
export const BANK_SKIP_FILE = "bank-skip.json";

export interface BankGateInput {
  store: string;
  runDir: string;
  /** When the run started (ISO): tests created after it were saved by this run. */
  started: string;
  trigger: string;
  budgetOver: boolean;
  environmentBroken: boolean;
  findings: Finding[];
}

export interface BankGateResult {
  /** Tests this run saved. */
  saved: number;
  /** Why it saved none, as the agent wrote it. */
  skipped_reason?: string;
  /** Set when the run may not finish yet: what to do. */
  problem?: string;
}

export function bankGate(i: BankGateInput): BankGateResult {
  const saved = loadBank(i.store).tests.filter((t) => t.created >= i.started).length;
  const raw = readJson<{ reason?: unknown }>(path.join(i.runDir, "data", BANK_SKIP_FILE));
  const reason = typeof raw?.reason === "string" ? raw.reason.replace(/\s+/g, " ").trim() : "";
  const serious = i.findings.filter((f) => (f.severity === "critical" || f.severity === "important") && f.fix_status !== "fixed-verified");
  const exempt = i.trigger === "auto" || i.trigger === "ci" || i.budgetOver || i.environmentBroken || serious.length === 0;
  if (saved > 0 || exempt) return { saved, ...(reason ? { skipped_reason: reason } : {}) };
  if (reason.length >= 12) return { saved: 0, skipped_reason: reason };
  const ids = serious.map((f) => f.id ?? f.title).slice(0, 6).join(", ");
  return {
    saved: 0,
    problem: `This run found ${serious.length} critical or important problem(s) (${ids}${serious.length > 6 ? ", ..." : ""}) and saved no test for any of them, so the next run cannot check them first. Save the checks worth keeping with bank_save_test (see shared/test-bank.md: one for each problem you reproduced twice, with from_issue), `
      + `or, if none of them can be written as an API or UI test, say why in ${path.join(i.runDir, "data", BANK_SKIP_FILE)} as {"reason": "..."} (a real sentence). Then finish again.${reason ? " The reason in that file is too short to count." : ""}`,
  };
}
