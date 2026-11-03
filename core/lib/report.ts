import type { Usage } from "./budget.ts";
import fs from "node:fs";
import { readBankResults } from "./bank/results.ts";
import type { BankResults } from "./bank/results.ts";
import type { Lifecycle } from "./memory/bugs.ts";
import path from "node:path";
import { SEVERITIES } from "./config.ts";
import { describeChanges } from "./memory/productmap.ts";
import type { Severity } from "./config.ts";
import { readJson, writeJson } from "./fsutil.ts";
import type { MemoryLogEntry } from "./memory/memorylog.ts";
import type { Changes } from "./memory/productmap.ts";
import { loadFixState } from "./fix/state.ts";
import type { FixState } from "./fix/state.ts";
import { findSecretLeaks } from "./redact.ts";
import { flowStatus } from "./verdict.ts";
import { lintCoverage, readCoverageData, renderTechnicalCoverage } from "./coverage-report.ts";
import type { CoverageData } from "./coverage-report.ts";
import { lintTicketResults, readTicketData, renderTechnicalChecklist } from "./ticket.ts";
import type { TicketData } from "./ticket.ts";

/** Structured run data lives in <run>/data/*.json; TECHNICAL-REPORT.md is rendered from it (spec §11.2/§11.3). */

export type Surface = "api" | "ui" | "cross" | "permissions" | "business-rule" | "other";
export const SURFACES: Surface[] = ["api", "ui", "cross", "permissions", "business-rule", "other"];

export interface Charter {
  id: string;
  surface: string;
  title: string;
  goal: string;
  risk: string;
  entry_point: string;
  expected: string;
  exit_condition: string;
}

/** What a non-technical reader sees (ADMIN-REPORT.md). Written by the agent next to the technical finding. */
export interface PlainFinding {
  /** A title a manager understands. No jargon. */
  title: string;
  /** Where it happens, as UI -> menu -> page, for example "Client Portal -> My orders -> an order page". */
  where: string;
  what_happens: string;
  who_is_affected: string;
  /** Numbered steps a person with no technical knowledge can follow on screen. Empty when it cannot be seen on screen. */
  how_to_see_it: string[];
  expected: string;
  /** Evidence path (relative to the run folder). Defaults to the first image in `evidence`. */
  screenshot?: string;
  ticket?: string;
}

/** A finding reduced to what a later run needs (regression mode, "what did we find last time"). Stored in the run summary. */
export interface CompactFinding {
  id: string;
  title: string;
  severity: Severity;
  surface: string;
  area: string;
  type: string;
  ui?: string;
  /** The project's id for this problem across runs (BUG-003), so a person's feedback on ISSUE-002 can be tied to it (spec 13.5). */
  bug?: string;
  /** The first reproduction step, so a regression run knows where to start. */
  first_step?: string;
}

export function compactFinding(f: Finding, bug?: string): CompactFinding {
  return { id: f.id ?? "", title: f.title, severity: f.severity, surface: f.surface, area: f.area, type: f.type, ...(f.ui ? { ui: f.ui } : {}), ...(bug ? { bug } : {}), ...(f.steps?.[0] ? { first_step: f.steps[0].slice(0, 200) } : {}) };
}

export type FixStatus = "not-fixed" | "fixed-verified" | "fixed-needs-confirmation";

/** What the fix tools record on a finding (fix runs only). The reports render this; the agent never writes it by hand. */
export interface FindingFix {
  outcome: "verified" | "best-effort" | "reverted" | "deferred";
  commit?: string;
  files?: string[];
  test_files?: string[];
  root_cause?: string;
  /** What was repeated from the finding after the fix, and what was seen. */
  recheck?: string;
  /** The neighbouring happy path that was checked. */
  adjacent?: string;
  /** Why a fix is best-effort, was reverted, or was deferred. */
  reason?: string;
  reverted_by?: string;
}

export interface Finding {
  id?: string;
  title: string;
  severity: Severity;
  surface: Surface;
  ui?: string;
  area: string;
  type: string;
  summary: string;
  steps: string[];
  expected: string;
  actual: string;
  reproduced: { times: number; of: number };
  evidence: string[];
  roles?: string[];
  browser?: string;
  viewport?: string;
  suspected_cause?: string;
  regression_test?: { description: string; location?: string };
  memory_applied?: string[];
  charter?: string;
  plain?: PlainFinding;
  /** Set only when this finding resembles a known false alarm in memory but is genuinely different: say why. */
  not_a_known_false_alarm?: string;
  /**
   * Which known bug this is (spec 13.12): a `BUG-003` from the memory context, or "new" when it is none of them. Left out, QAMind matches by fingerprint and
   * asks for this only when a finding resembles a known bug without clearly being it.
   */
  bug?: string;
  /** The test bank's tests (T-001) whose failure this finding explains. */
  bank_tests?: string[];
  /** Set by QAMind when a person's feedback changed the severity (spec 13.5): what the run assessed, and who set the one shown. */
  severity_assessed?: Severity;
  severity_note?: string;
  /** Fix mode sets this; report-only runs leave it unset (not fixed). */
  fix_status?: FixStatus;
  /** Set by the fix tools in a `/qa` run: how the fix attempt went. */
  fix?: FindingFix;
}

export interface Unconfirmed {
  id?: string;
  /** The test bank's tests whose failure this lead explains but could not confirm. */
  bank_tests?: string[];
  title: string;
  surface: string;
  observation: string;
  why_unconfirmed: string;
  attempts: number;
  evidence?: string[];
}

export interface NotTested {
  area: string;
  reason: string;
  /** The same entry in words a non-technical reader understands (used by the admin report). */
  plain?: { area: string; reason: string };
}

export interface CoverageRow {
  surface: string;
  area: string;
  role?: string;
  viewport?: string;
  status: "tested" | "partial" | "not-tested";
  note?: string;
  /** Which web UI this row is about (a name from the config's web_uis). Used for "results by area". */
  ui?: string;
  /** 1-based number of the critical journey in the config this row covers. Used for the release verdict. */
  critical_flow?: number;
}

export interface RunBudgetOutcome {
  time_minutes?: number;
  max_cost?: number;
  used_minutes: number;
  /** The deadline passed before the run finished. */
  reached: boolean;
  source: string;
}

export interface RunMeta {
  schema_version: number;
  run_id: string;
  project_id: string;
  project_name: string;
  environment: string;
  mode: string;
  trigger: string;
  kind: string;
  host: string;
  focus?: string;
  started: string;
  finished?: string;
  duration_s?: number;
  branch?: string;
  commit?: string;
  agent_version: string;
  knowledge_version: string;
  stop_reason?: string;
  cost?: string;
  /** Structured usage written by `run finish`: the measured duration, and cost or tokens when the host or agent gave them. */
  usage?: Usage;
  /** The run's time budget and how it ended (written by `run finish`). */
  budget?: RunBudgetOutcome;
  /** Test data preparation and restore (spec 13.1), from data/env-prep.json. */
  environment_prep?: { prepared: boolean; why: string; steps: string[]; snapshot_taken: boolean; restored?: boolean };
  memory_applied?: string[];
  notes?: string[];
  /** Written by `run finish`: how many tests the run saved to the bank, and why it saved none (spec 13.3). */
  bank_saved?: number;
  bank_skipped?: string;
  /** The critical journeys from the config, in order (copied at run start). */
  critical_flows?: string[];
  /** Ticket mode (spec 13.4): the ticket this run tests, as it was given (an id, an address without its query, a file, or "pasted text"). */
  ticket_ref?: string;
  /** Written by `run finish`: what was saved to memory. */
  memory_updated?: string[];
}

/** data/admin.json: the two things in the admin report only the agent can judge. */
export interface AdminNotes {
  /** The biggest risk, in one plain sentence. */
  biggest_risk?: string;
  /** At most three suggested next steps, in plain words. */
  next_steps?: string[];
}

export interface HealthResult {
  environment_ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string; ms?: number; skipped?: boolean; /** Failed once, then answered: the environment is up but unreliable. */ flaky?: boolean; /** Answered, but slowly. */ slow?: boolean }>;
  ran_at: string;
}

export interface RunData {
  meta?: RunMeta;
  admin?: AdminNotes;
  /** What changed since the last run (data/changes.json), if computed. */
  changes?: Changes;
  /** What memory did during this run (data/memory-log.json). */
  memoryLog: MemoryLogEntry[];
  /** The fix loop's record (data/fix-state.json), in a `/qa` run that started fixing. */
  fix?: FixState;
  /**
   * True when `admin.json` (the biggest risk and the next steps, written by the agent) is older than the last fix that changed the product.
   * It then describes the situation before the fixes, so the admin report does not use it.
   */
  adminStale?: boolean;
  charters: Charter[];
  findings: Finding[];
  unconfirmed: Unconfirmed[];
  notTested: NotTested[];
  coverage: CoverageRow[];
  health?: HealthResult;
  apiSummaries: ApiRunSummary[];
  /** What each finding is across runs: new, still open, came back (data/lifecycle.json, spec 13.12). Absent when no memory was available. */
  lifecycle?: Lifecycle;
  /** Findings that match a bug the owner accepted (data/known-accepted.json): shown as known, not counted (spec 13.5). */
  accepted?: Finding[];
  /** What the test bank did at the start of this run (data/bank-results.json, spec 13.3). */
  bank?: BankResults;
  /** Ticket mode: the criteria and the result of each (data/ticket.json and ticket-results.json, spec 13.4). */
  ticket?: TicketData;
  /** The page sweep, the message checks and the timings (spec 13.7, 13.9 to 13.11). */
  checks?: CoverageData;
}

export interface ApiRunSummary {
  file: string;
  plan: string;
  total: number;
  passed: number;
  failed: number;
  signals: number;
  ran_at: string;
}

const dataFile = (runDir: string, name: string) => path.join(runDir, "data", name);

function readList<T>(runDir: string, name: string): T[] {
  const v = readJson<unknown>(dataFile(runDir, name));
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`data/${name} must be a JSON array.`);
  return v as T[];
}

export function readRunData(runDir: string): RunData {
  const apiDir = path.join(runDir, "data", "api-results");
  const apiSummaries: ApiRunSummary[] = [];
  if (fs.existsSync(apiDir)) {
    for (const f of fs.readdirSync(apiDir).filter((x) => x.endsWith(".json")).sort()) {
      const r = readJson<{ summary?: Omit<ApiRunSummary, "file"> }>(path.join(apiDir, f));
      if (r?.summary) apiSummaries.push({ file: `data/api-results/${f}`, ...r.summary });
    }
  }
  const meta = readJson<RunMeta>(dataFile(runDir, "meta.json"));
  const health = readJson<HealthResult>(dataFile(runDir, "health.json"));
  const admin = readJson<AdminNotes>(dataFile(runDir, "admin.json"));
  const changes = readJson<Changes>(dataFile(runDir, "changes.json"));
  const memLog = readJson<unknown>(dataFile(runDir, "memory-log.json"));
  const lifecycle = readJson<Lifecycle>(dataFile(runDir, "lifecycle.json"));
  const bank = readBankResults(runDir);
  const fix = loadFixState(runDir);
  const adminStale = ((): boolean => {
    if (!fix || !admin) return false;
    const changed = fix.attempts.filter((a) => (a.status === "verified" || a.status === "best-effort" || a.status === "reverted") && a.finished_at).map((a) => Date.parse(a.finished_at as string));
    if (changed.length === 0) return false;
    try {
      return fs.statSync(dataFile(runDir, "admin.json")).mtimeMs < Math.max(...changed);
    } catch {
      return false;
    }
  })();
  return {
    ...(meta ? { meta } : {}),
    ...(admin ? { admin } : {}),
    ...(changes ? { changes } : {}),
    ...(fix ? { fix } : {}),
    ...(adminStale ? { adminStale } : {}),
    memoryLog: Array.isArray(memLog) ? (memLog as MemoryLogEntry[]) : [],
    charters: readList<Charter>(runDir, "charters.json"),
    findings: readList<Finding>(runDir, "findings.json"),
    unconfirmed: readList<Unconfirmed>(runDir, "unconfirmed.json"),
    notTested: readList<NotTested>(runDir, "not-tested.json"),
    coverage: readList<CoverageRow>(runDir, "coverage.json"),
    ...(health ? { health } : {}),
    apiSummaries,
    ...(lifecycle ? { lifecycle } : {}),
    ...((): { accepted?: Finding[] } => {
      const v = readJson<unknown>(dataFile(runDir, "known-accepted.json"));
      return Array.isArray(v) && v.length ? { accepted: v as Finding[] } : {};
    })(),
    ...(bank ? { bank } : {}),
    ...((): { ticket?: TicketData } => {
      const t = meta?.ticket_ref ? readTicketData(runDir, meta.trigger) : undefined;
      return t ? { ticket: t } : {};
    })(),
    ...((): { checks?: CoverageData } => {
      const c = readCoverageData(runDir);
      return c ? { checks: c } : {};
    })(),
  };
}

/** Assign stable ISSUE-NNN ids to findings that lack one and persist them. */
export function assignIds(runDir: string, data: RunData): void {
  let max = 0;
  for (const f of data.findings) {
    const m = /^ISSUE-(\d+)$/.exec(f.id ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  let changed = false;
  for (const f of data.findings) {
    if (!f.id) {
      f.id = `ISSUE-${String(++max).padStart(3, "0")}`;
      changed = true;
    }
  }
  let umax = 0;
  for (const u of data.unconfirmed) {
    const m = /^UNCONFIRMED-(\d+)$/.exec(u.id ?? "");
    if (m) umax = Math.max(umax, Number(m[1]));
  }
  for (const u of data.unconfirmed) {
    if (!u.id) {
      u.id = `UNCONFIRMED-${String(++umax).padStart(2, "0")}`;
      changed = true;
    }
  }
  if (changed) {
    writeJson(dataFile(runDir, "findings.json"), data.findings);
    writeJson(dataFile(runDir, "unconfirmed.json"), data.unconfirmed);
  }
}

const ICON: Record<Severity, string> = { critical: "🔴", important: "🟠", minor: "🟡" };
const LABEL: Record<Severity, string> = { critical: "Critical", important: "Important", minor: "Minor" };
const sevRank = (s: Severity) => SEVERITIES.indexOf(s);

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { critical: 0, important: 0, minor: 0 };
  for (const f of findings) if (f.severity in c) c[f.severity] += 1;
  return c;
}

/** An entry in the merged not-tested list; entries that came from a coverage row keep the row for plain wording. */
export type MergedNotTested = NotTested & { fromCoverage?: CoverageRow };

/** Everything not tested: explicit entries plus any coverage row marked not-tested (deduplicated, never silently dropped). */
export function mergedNotTested(data: RunData): MergedNotTested[] {
  const out: MergedNotTested[] = [...data.notTested];
  const seen = new Set(out.map((n) => n.area.toLowerCase()));
  for (const row of data.coverage) {
    if (row.status === "not-tested") {
      const label = [row.surface, row.area, row.role, row.viewport].filter(Boolean).join(" / ");
      if (!seen.has(label.toLowerCase()) && !seen.has(row.area.toLowerCase())) {
        out.push({ area: label, reason: row.note ?? "Reason not recorded", fromCoverage: row });
        seen.add(label.toLowerCase());
      }
    }
  }
  return out;
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function budgetLine(m: RunMeta): string {
  const b = m.budget;
  if (!b || b.time_minutes === undefined) return b?.max_cost !== undefined ? `no time limit; a cost limit of ${b.max_cost} was set (told to the agent, not enforced)` : "none set";
  return b.reached ? `**${b.time_minutes} minutes: reached** (${b.used_minutes} used): exploring stopped and the rest is under Not tested ("time budget reached")` : `${b.time_minutes} minutes (${b.used_minutes} used)`;
}

function usageLine(m: RunMeta): string {
  const u = m.usage;
  if (!u) return m.cost ?? "not available on this host";
  const parts = [u.cost_usd !== undefined ? `$${u.cost_usd}` : undefined, u.tokens !== undefined ? `${u.tokens.toLocaleString("en-US")} tokens` : undefined].filter(Boolean);
  return parts.length ? `${parts.join(", ")} (${u.note})` : u.note;
}

function duration(seconds?: number): string {
  if (seconds === undefined) return "in progress";
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

export interface TechnicalContext {
  /** Earlier finished runs of this project, newest first (for the trend table). */
  previous?: Array<{ run_id: string; started: string; mode: string; counts: { critical: number; important: number; minor: number; unconfirmed: number }; coverage: { tested: number; partial: number; not_tested: number }; journeys?: { total: number; tested: number }; not_tested_count: number }>;
}

export type FixOutcomeWord = "verified" | "best-effort" | "reverted" | "deferred" | "not attempted";

export const fixOutcomeOf = (f: Finding): FixOutcomeWord => f.fix?.outcome ?? "not attempted";

const ticks = (s: string): string => `\`${s}\``;
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What the fix tools recorded for one finding: the outcome, the commit, and the proof that the test needs the fix. */
function fixDetails(f: Finding, fix: FixState): string[] {
  const a = [...fix.attempts].reverse().find((x) => x.issue === f.id);
  if (!f.fix || !a) return [];
  const L: string[] = [`**Fix: ${f.fix.outcome}**`, ""];
  if (f.fix.commit) L.push(`- Commit ${ticks(f.fix.commit)} on \`${fix.branch}\`${f.fix.reverted_by ? `, undone by revert commit ${ticks(f.fix.reverted_by)}` : ""}`);
  if (f.fix.files?.length) L.push(`- Production files: ${f.fix.files.map(ticks).join(", ")}`);
  if (f.fix.test_files?.length) L.push(`- Regression test: ${f.fix.test_files.map(ticks).join(", ")}`);
  if (a.plan) L.push(`- Diagnosis before the fix: ${a.plan}`);
  if (f.fix.root_cause) L.push(`- Root cause: ${f.fix.root_cause}`);
  if (a.without_fix) L.push(`- Test with the fix taken out: **failed** (exit ${a.without_fix.exit_code}), as it must: \`${clip(a.without_fix.tail.split("\n").filter(Boolean).slice(-3).join(" ⏎ "), 260)}\``);
  if (a.with_fix) L.push(`- Test with the fix in: **${a.with_fix.passed ? "passed" : "failed"}** (exit ${a.with_fix.exit_code}, ${a.with_fix.duration_s} s)`);
  if (f.fix.recheck) L.push(`- Re-check of the original steps: ${f.fix.recheck}`);
  if (f.fix.adjacent) L.push(`- Adjacent check: ${f.fix.adjacent}`);
  if (f.fix.reason) L.push(`- ${f.fix.outcome === "best-effort" ? "Why best-effort (what a person must confirm)" : f.fix.outcome === "reverted" ? "Why it was reverted" : "Why it was not fixed"}: ${f.fix.reason}`);
  if (a.saved_to) L.push(`- The undone attempt (edits and failing test) is kept in [${a.saved_to}](${a.saved_to})`);
  L.push("");
  return L;
}

/** The fix run as a whole: branch, outcomes, the suite before and after, and every stop. */
function fixRunSection(data: RunData): string[] {
  const fix = data.fix as FixState;
  const n = (o: string): number => data.findings.filter((f) => fixOutcomeOf(f) === o).length;
  const L: string[] = ["## Fix run", ""];
  const cmp = fix.comparison;
  if (cmp?.verdict === "regression") L.push(`> ⚠️ **REGRESSION after the fixes:** ${cmp.note}${cmp.regressions.length ? ` Failing now: ${cmp.regressions.slice(0, 8).join("; ")}.` : ""} A developer must look at this before merging.`, "");
  L.push(`- **Branch:** ${ticks(fix.branch)}, started from commit ${ticks(fix.base_commit.slice(0, 7))}${fix.base_branch ? ` on ${ticks(fix.base_branch)}` : ""}. The commits are local to this branch: **nothing was pushed or merged.** A developer must review and merge them.`);
  L.push(`- **Outcome:** ${n("verified")} fixed and verified · ${n("best-effort")} best-effort (a person must confirm) · ${n("reverted")} reverted · ${n("deferred")} deferred · ${n("not attempted")} not attempted`);
  const suite = (s: FixState["baseline"]) => (s ? `${s.passed ? "passed" : s.timed_out ? "did not finish" : `failed${s.failed_tests.length ? ` (${s.failed_tests.length} failing)` : ""}`} (${ticks(s.command)}, ${s.duration_s} s)` : "not run");
  L.push(`- **Test suite:** before any fix: ${suite(fix.baseline)} · after the fixes: ${suite(fix.after)}${cmp ? ` · ${cmp.verdict === "no-regression" ? "no regression" : cmp.verdict === "regression" ? "⚠️ **regression**" : "cannot compare"}: ${cmp.note}` : ""}`);
  if (fix.api_only) L.push("- **Baseline scope:** the API only: the user agreed to fix without the web UIs having been tested.");
  L.push(`- **Limits:** at most ${fix.max_fixes} fixes; severities fixed: ${fix.severities.join(", ")}; reverts so far: ${fix.reverts}`);
  if (fix.continues.length) L.push(`- **Stops and what the user said:** ${fix.continues.map((c) => `${c.was}: ${c.reason}`).join(" · ")}`);
  if (fix.stop) L.push(`- **A stop rule is still in force (${fix.stop.kind}):** ${fix.stop.reason}`);
  L.push("- **Reports from before any fix:** [BASELINE-TECHNICAL-REPORT.md](BASELINE-TECHNICAL-REPORT.md), [BASELINE-ADMIN-REPORT.md](BASELINE-ADMIN-REPORT.md)", "");
  const attempted = fix.attempts.filter((a) => a.status !== "in-progress");
  if (attempted.length) {
    L.push("| Issue | Severity | Outcome | Commit | Production files | Regression test |", "|---|---|---|---|---|---|");
    for (const a of attempted) L.push(`| [${a.issue}](#${a.issue}) | ${a.severity} | ${a.status} | ${a.commit ? ticks(a.commit.slice(0, 7)) : "-"} | ${a.files.map(ticks).join(", ") || "-"} | ${a.test_files.map(ticks).join(", ") || "-"} |`);
    L.push("");
  }
  return L;
}

/** "3/5", or "-" when the config lists no key journeys. */
const journeyCell = (tested: number, total: number): string => (total > 0 ? `${tested}/${total}` : "-");

export function renderTechnicalReport(data: RunData, ctx: TechnicalContext = {}): string {
  const m = data.meta;
  const counts = countBySeverity(data.findings);
  const notTested = mergedNotTested(data);
  const L: string[] = [];
  L.push(`# QAMind Technical Report${m ? `: ${m.run_id}` : ""}`, "");
  if (m) {
    L.push("| | |", "|---|---|");
    const rows: Array<[string, string]> = [
      ["Date (UTC)", m.started],
      ["Project", `${m.project_name} (${m.project_id})`],
      ["Environment", m.environment],
      ["Branch / commit", m.branch ? `${m.branch}${m.commit ? ` @ ${m.commit}` : ""}` : "not a git repository"],
      ["Mode", m.mode],
      ["Trigger", m.trigger],
      ["Scope", m.focus ? `focus: ${m.focus}` : m.mode === "diff" ? "changed code and its neighbours" : "whole product"],
      ["Host", m.host],
      ["Duration", duration(m.duration_s)],
      ["Time budget", budgetLine(m)],
      ["Cost / usage", usageLine(m)],
      ["QAMind / knowledge version", `${m.agent_version} / ${m.knowledge_version}`],
      ["Stop reason", m.stop_reason ?? "run not finished"],
    ];
    for (const [k, v] of rows) L.push(`| ${k} | ${esc(v)} |`);
    L.push("");
  }

  L.push("_A plain-language version of this report for managers is in `ADMIN-REPORT.md` (same problems, same severities)._", "");
  L.push("## Environment health", "");
  if (!data.health) L.push("_Health check was not run._", "");
  else {
    L.push(data.health.environment_ok ? "**Environment OK.**" : "**⛔ Environment problem: product findings are not reliable until this is fixed.**", "");
    L.push("| Check | Result | Detail |", "|---|---|---|");
    for (const c of data.health.checks) L.push(`| ${esc(c.name)} | ${c.skipped ? "➖ skipped" : c.ok ? "✅ ok" : "❌ failed"} | ${esc(c.detail)}${c.ms !== undefined ? ` (${c.ms} ms)` : ""} |`);
    L.push("");
  }

  L.push("## Summary", "");
  L.push(`- 🔴 Critical: **${counts.critical}**   🟠 Important: **${counts.important}**   🟡 Minor: **${counts.minor}**`);
  L.push(`- Unconfirmed (not reproduced twice): **${data.unconfirmed.length}**`);
  L.push(`- Areas not tested: **${notTested.length}**`);
  if (data.lifecycle) {
    const n = (st: string): number => data.lifecycle?.findings.filter((x) => x.status === st).length ?? 0;
    L.push(`- Bugs: **${n("new")}** new · **${n("still-open")}** still open · **${n("regressed")}** came back · ${data.lifecycle.fixed.length} fixed since the last run · ${data.lifecycle.accepted_seen.length} known, accepted`);
  }
  if (m?.bank_skipped) L.push(`- Test bank: no test was saved from this run. Why: ${m.bank_skipped}`);
  if (data.bank) L.push(`- Test bank: **${data.bank.passed + data.bank.flaky}** of ${data.bank.total} passed${data.bank.failed ? `, **${data.bank.failed} failed**` : ""}${data.bank.flaky ? `, ${data.bank.flaky} only on a retry` : ""}${data.bank.quarantined ? `, ${data.bank.quarantined} quarantined (flaky, not run)` : ""}`);
  const api = data.apiSummaries.reduce((a, s) => ({ total: a.total + s.total, failed: a.failed + s.failed, signals: a.signals + s.signals }), { total: 0, failed: 0, signals: 0 });
  if (data.apiSummaries.length) L.push(`- API probes executed: **${api.total}** (${api.signals} produced a signal worth a look)`);
  L.push("");

  if (data.ticket?.ticket) L.push(...renderTechnicalChecklist(data.ticket));
  const cameBack = (data.lifecycle?.findings ?? []).filter((l) => l.status === "regressed");
  if (cameBack.length) {
    L.push("## ⚠️ Came back (fixed before, found again)", "", "_These bugs were recorded as fixed and have been found again. They are listed first below._", "");
    for (const l of cameBack) {
      const f = data.findings.find((x) => x.id === l.issue);
      L.push(`- **${l.bug}** ([${l.issue}](#${l.issue})) ${f?.title ?? ""}: fixed${l.fixed_on ? ` on ${l.fixed_on.slice(0, 10)}` : ""}, found again now.`);
    }
    L.push("");
  }
  if (data.fix) L.push(...fixRunSection(data));

  L.push("## What changed since the last run", "");
  const ch = data.changes;
  if (!ch) L.push("_Not computed (no page or endpoint list was recorded)._", "");
  else if (ch.first_run) L.push("_First run for this project: there is nothing to compare with yet._", "");
  else {
    const lines = describeChanges(ch).technical;
    L.push(...(lines.length ? lines.map((x) => `- ${x}`) : ["No new or removed pages or endpoints since the last run."]), ...ch.notes.map((n) => `- _${n}_`), "");
  }

  L.push("## Trend", "");
  const cur = { counts: { ...counts, unconfirmed: data.unconfirmed.length }, tested: data.coverage.filter((c) => c.status === "tested").length, partial: data.coverage.filter((c) => c.status === "partial").length, notTested: notTested.length };
  L.push("| Run | Mode | 🔴 | 🟠 | 🟡 | Unconfirmed | Key journeys tested | Checked | Partly checked | Not tested |", "|---|---|---|---|---|---|---|---|---|---|");
  L.push(`| **this run** | ${m?.mode ?? "-"} | ${cur.counts.critical} | ${cur.counts.important} | ${cur.counts.minor} | ${cur.counts.unconfirmed} | ${journeyCell(flowStatus(data).tested.length, flowStatus(data).total)} | ${cur.tested} | ${cur.partial} | ${cur.notTested} |`);
  for (const p of (ctx.previous ?? []).slice(0, 4)) L.push(`| ${p.run_id} | ${p.mode} | ${p.counts.critical} | ${p.counts.important} | ${p.counts.minor} | ${p.counts.unconfirmed} | ${p.journeys ? journeyCell(p.journeys.tested, p.journeys.total) : "-"} | ${p.coverage.tested} | ${p.coverage.partial} | ${p.not_tested_count} |`);
  if (!ctx.previous?.length) L.push("", "_No earlier run to compare with._");
  else if (ctx.previous[0] && ctx.previous[0].mode !== m?.mode) L.push("", `_The last run was a ${ctx.previous[0].mode} run and this one is ${m?.mode ?? "?"}, so the rows are not directly comparable._`);
  L.push("");

  L.push("## Test plan (charters)", "");
  if (data.charters.length === 0) L.push("_No charters recorded._", "");
  for (const c of data.charters) {
    L.push(`### ${c.id}: ${c.title}  \`${c.surface}\``, "", `- **Goal:** ${c.goal}`, `- **Risk:** ${c.risk}`, `- **Entry point:** ${c.entry_point}`, `- **Expected results:** ${c.expected}`, `- **Exit condition:** ${c.exit_condition}`, "");
  }

  L.push("## Findings", "");
  const backIds = new Set((data.lifecycle?.findings ?? []).filter((l) => l.status === "regressed").map((l) => l.issue));
  const sorted = [...data.findings].sort((a, b) => Number(backIds.has(b.id ?? "")) - Number(backIds.has(a.id ?? "")) || sevRank(a.severity) - sevRank(b.severity) || (a.id ?? "").localeCompare(b.id ?? ""));
  if (sorted.length === 0) L.push("_No confirmed findings._", "");
  for (const f of sorted) {
    L.push(`<a id="${f.id ?? "ISSUE-"}"></a>`, "", `### ${f.id ?? "ISSUE-???"} ${ICON[f.severity]} ${LABEL[f.severity]}: ${f.title}`, "");
    L.push(`- **Surface:** ${f.surface}${f.ui ? ` · **UI:** ${f.ui}` : ""} · **Area:** ${f.area} · **Type:** ${f.type}`);
    const life = data.lifecycle?.findings.find((x) => x.issue === f.id);
    if (life) {
      const what = life.status === "regressed" ? `**Came back**${life.fixed_on ? ` (fixed on ${life.fixed_on.slice(0, 10)})` : ""}` : life.status === "still-open" ? `Still open (seen ${life.times_seen} times, first on ${life.first_seen.slice(0, 10)})` : life.status === "new" ? "**New**" : life.status;
      L.push(`- **Bug:** ${life.bug} · ${what}${f.bank_tests?.length ? ` · bank test ${f.bank_tests.join(", ")}` : ""}`);
    }
    if (f.severity_note) L.push(`- **Severity:** ${f.severity_note}`);
    if (f.roles?.length) L.push(`- **Roles:** ${f.roles.join(", ")}`);
    if (f.browser || f.viewport) L.push(`- **Browser / viewport:** ${[f.browser, f.viewport].filter(Boolean).join(" / ")}`);
    L.push(`- **Reproduced:** ${f.reproduced.times} of ${f.reproduced.of} attempts`);
    if (data.fix) L.push(`- **Fix outcome:** ${fixOutcomeOf(f)}${f.fix?.commit ? ` (commit \`${f.fix.commit}\`)` : ""}`);
    if (f.charter) L.push(`- **Charter:** ${f.charter}`);
    L.push("", f.summary, "", "**Steps to reproduce**", "");
    f.steps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
    L.push("", `**Expected:** ${f.expected}`, "", `**Actual:** ${f.actual}`, "");
    L.push("**Evidence**", "", ...f.evidence.map((e) => `- [${e}](${e})`), "");
    if (f.suspected_cause) L.push(`**Suspected root cause:** ${f.suspected_cause}`, "");
    if (f.regression_test) L.push(`**Proposed regression test:** ${f.regression_test.description}${f.regression_test.location ? ` (suggested location: \`${f.regression_test.location}\`)` : ""}`, "");
    if (f.memory_applied?.length) L.push(`**Memory applied:** ${f.memory_applied.join("; ")}`, "");
    if (data.fix) L.push(...fixDetails(f, data.fix));
  }

  if (data.lifecycle?.fixed.length) {
    L.push("## Fixed since the last run", "", "_Open bugs that were not found this time and were checked again: by a bank test that passes, or by a re-check of the steps._", "");
    for (const x of data.lifecycle.fixed) L.push(`- **${x.bug}** ${x.title} (${x.area}): ${x.how}`);
    L.push("");
  }
  if (data.accepted?.length) {
    L.push("## Known, accepted", "", "_Seen again, but a person decided to live with them. Not counted as findings._", "");
    for (const f of data.accepted) {
      const a = data.lifecycle?.accepted_seen.find((x) => x.bug === f.bug);
      L.push(`- **${f.bug ?? ""}** ${f.id ?? ""} ${f.title}${a ? ` — accepted by ${a.by} on ${a.at.slice(0, 10)}${a.note ? `: ${a.note}` : ""}` : ""}`);
    }
    L.push("");
  }
  if (data.lifecycle?.not_rechecked.length) {
    L.push("## Open bugs not looked at again", "", "_Reported in earlier runs, neither found nor re-checked in this one: nothing is said about whether they are fixed._", "");
    for (const x of data.lifecycle.not_rechecked) L.push(`- **${x.bug}** ${x.title} (${x.status})`);
    L.push("");
  }

  L.push("## Unconfirmed (could not be reproduced twice)", "", "_These are leads, not findings. They are not counted above._", "");
  if (data.unconfirmed.length === 0) L.push("_None._", "");
  for (const u of data.unconfirmed) {
    L.push(`- **${u.id ?? "UNCONFIRMED"}: ${u.title}** (${u.surface}, tried ${u.attempts}×): ${u.observation} Why unconfirmed: ${u.why_unconfirmed}`);
    for (const e of u.evidence ?? []) L.push(`  - evidence: [${e}](${e})`);
  }
  if (data.unconfirmed.length) L.push("");

  L.push("## Coverage matrix", "");
  if (data.coverage.length === 0) L.push("_No coverage recorded._", "");
  else {
    L.push("| Surface | Area | Role | Viewport | Key journey | Status | Note |", "|---|---|---|---|---|---|---|");
    const mark = { tested: "✅ tested", partial: "◐ partial", "not-tested": "⛔ not tested" } as const;
    for (const r of data.coverage) L.push(`| ${esc(r.surface)} | ${esc(r.area)} | ${esc(r.role ?? "-")} | ${esc(r.viewport ?? "-")} | ${r.critical_flow ? `#${r.critical_flow}` : "-"} | ${mark[r.status]} | ${esc(r.note ?? "")} |`);
    L.push("");
  }

  if (data.checks) L.push(...renderTechnicalCoverage(data.checks));
  L.push("## Not tested", "", "_Nothing here is reported as passing._", "");
  if (notTested.length === 0) L.push("_Everything planned was tested._", "");
  for (const n of notTested) L.push(`- **${n.area}**: ${n.reason}`);
  if (notTested.length) L.push("");

  if (data.apiSummaries.length) {
    L.push("## API test runs", "", "| Plan | Probes | Passed | Failed | Signals | Details |", "|---|---|---|---|---|---|");
    for (const s of data.apiSummaries) L.push(`| ${esc(s.plan)} | ${s.total} | ${s.passed} | ${s.failed} | ${s.signals} | [${s.file}](${s.file}) |`);
    L.push("");
  }

  if (data.bank) {
    const b = data.bank;
    L.push("## Test bank", "", `The saved checks ran first (${b.ran_at.slice(0, 19).replace("T", " ")}): **${b.passed + b.flaky}** passed${b.flaky ? ` (${b.flaky} only on a retry: flaky)` : ""}, **${b.failed}** failed, ${b.quarantined} quarantined, ${b.skipped} skipped, of ${b.total}.${b.budget_reached ? " The time budget ran out before every test ran." : ""}`, "");
    if (b.results.length) {
      L.push("| Test | Area | Kind | Result | Detail |", "|---|---|---|---|---|");
      const mark: Record<string, string> = { passed: "✅ passed", "flaky-passed": "◐ passed on retry (flaky)", failed: "❌ failed", quarantined: "➖ quarantined", skipped: "➖ skipped" };
      for (const r of b.results) L.push(`| ${r.test}${r.bug ? ` (${r.bug})` : ""} ${esc(r.title)} | ${esc(r.area)} | ${r.kind} | ${mark[r.status] ?? r.status} | ${esc(r.detail ?? "")} |`);
      L.push("");
    }
    if (b.covered_areas.length) L.push(`Areas the bank already covers and passed: ${b.covered_areas.join(", ")}.`, "");
  }

  L.push("## Memory", "");
  const APPLIED_KINDS = ["learning-applied", "false-alarm-skipped", "global-lesson-applied"];
  const applied = data.memoryLog.filter((e) => APPLIED_KINDS.includes(e.kind));
  const saved = data.memoryLog.filter((e) => !APPLIED_KINDS.includes(e.kind));
  const verb: Record<string, string> = { "learning-applied": "Applied learning", "false-alarm-skipped": "Skipped known false alarm", "global-lesson-applied": "Applied global lesson", "learning-created": "New learning", "learning-merged": "Confirmed again", "learning-contradicted": "Contradicted learning", "false-alarm-created": "New false alarm", "risk-flagged": "Flagged risk area" };
  L.push("**Applied this run** (memory is leads, not proof; each was re-verified)", "");
  if (applied.length === 0 && !m?.memory_applied?.length) L.push("_No project memory was applied (first run, or memory held nothing relevant)._");
  // The log holds the exact text of what was applied (checked against memory); the agent's own line says how it changed this run.
  // Show each agent line once, under the entry it cites, and list only the lines that cite nothing in the log on their own.
  const agentLines = [...(m?.memory_applied ?? [])];
  const cites = (line: string, id: string | undefined): boolean => !!id && new RegExp(`\\b${id}\\b`).test(line);
  for (const e of applied) {
    L.push(`- ${verb[e.kind]} ${e.id}: ${e.text}`);
    for (let i = agentLines.length - 1; i >= 0; i--) {
      if (cites(agentLines[i] as string, e.id)) L.push(`  - In this run: ${(agentLines.splice(i, 1)[0] as string)}`);
    }
  }
  for (const x of agentLines) L.push(`- ${x}`);
  L.push("", "**Saved this run**", "");
  if (saved.length === 0) L.push("_No learnings or false alarms were saved._");
  for (const e of saved) L.push(`- ${verb[e.kind]} ${e.id}: ${e.text}`);
  if (m?.memory_updated?.length) L.push("", "**Memory after the run**", "", ...m.memory_updated.map((x) => `- ${x}`));
  L.push("");

  const tests = sorted.filter((f) => f.regression_test);
  L.push("## Proposed regression tests", "", "_/qa-only never writes tests into the product; these are proposals._", "");
  if (tests.length === 0) L.push("_None._", "");
  for (const f of tests) L.push(`- **${f.id}**: ${f.regression_test?.description}${f.regression_test?.location ? ` → \`${f.regression_test.location}\`` : ""}`);
  if (m?.notes?.length) L.push("", "## Notes", "", ...m.notes.map((n) => `- ${n}`));
  L.push("");
  return L.join("\n");
}

export interface LintResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function insideRun(runDir: string, rel: string): string | null {
  const abs = path.resolve(runDir, rel);
  const root = path.resolve(runDir) + path.sep;
  return abs.startsWith(root) ? abs : null;
}

/** The spec's evidence rules (§9.1) as code: reproduced twice, evidence exists, nothing untested passes, no secrets. */
export function lintRun(runDir: string, data: RunData, knownSecrets: string[] = []): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (data.charters.length === 0) errors.push("No charters recorded: write the test plan before reporting (data/charters.json).");
  if (data.health && !data.health.environment_ok && data.findings.length > 0) {
    errors.push(`The health check failed (Environment problem), so there can be no product findings: ${data.findings.length} are listed. A broken environment produces fake bugs. Remove them (findings.json must be empty), list every planned area under Not tested with the reason "Environment problem: <what failed>", and finish with stop_reason "environment problem".`);
  }
  const ids = new Set<string>();
  for (const [i, f] of data.findings.entries()) {
    const tag = f.id ?? `findings[${i}]`;
    if (f.id) {
      if (ids.has(f.id)) errors.push(`${tag}: duplicate id.`);
      ids.add(f.id);
    }
    if (!f.title?.trim()) errors.push(`${tag}: missing title.`);
    if (!SEVERITIES.includes(f.severity)) errors.push(`${tag}: severity must be critical, important or minor.`);
    if (!SURFACES.includes(f.surface)) errors.push(`${tag}: surface must be one of ${SURFACES.join(", ")}.`);
    if (!f.steps?.length) errors.push(`${tag}: no reproduction steps.`);
    if (!f.expected?.trim() || !f.actual?.trim()) errors.push(`${tag}: expected and actual are both required.`);
    if (!f.reproduced || f.reproduced.times < 2 || f.reproduced.of < f.reproduced.times) {
      errors.push(`${tag}: must be reproduced at least twice (move it to unconfirmed.json otherwise).`);
    }
    if (!f.evidence?.length) errors.push(`${tag}: no evidence (screenshot, sanitized request/response or console log).`);
    for (const e of f.evidence ?? []) {
      const abs = insideRun(runDir, e);
      if (!abs) errors.push(`${tag}: evidence path "${e}" is outside the run folder.`);
      else if (!fs.existsSync(abs)) errors.push(`${tag}: evidence file "${e}" does not exist.`);
    }
    if (!f.regression_test) warnings.push(`${tag}: no regression test proposed.`);
  }
  for (const n of data.notTested) if (!n.area?.trim() || !n.reason?.trim()) errors.push("not-tested.json: every entry needs an area and a reason.");

  // ---- the admin report is written from these same files, so its plain-language parts are required ----
  for (const f of data.findings) {
    const tag = f.id ?? f.title;
    const p = f.plain;
    if (!p) {
      errors.push(`${tag}: no "plain" block (title, where, what_happens, who_is_affected, how_to_see_it, expected) for the admin report.`);
      continue;
    }
    for (const k of ["title", "where", "what_happens", "who_is_affected", "expected"] as const) if (!String(p[k] ?? "").trim()) errors.push(`${tag}: plain.${k} is empty.`);
    if (!Array.isArray(p.how_to_see_it)) errors.push(`${tag}: plain.how_to_see_it must be a list (an empty list means it cannot be seen on screen).`);
    if (p.screenshot) {
      const abs = insideRun(runDir, p.screenshot);
      if (!abs || !fs.existsSync(abs)) errors.push(`${tag}: plain.screenshot "${p.screenshot}" does not exist inside the run folder.`);
    }
  }
  for (const n of data.notTested) if (!n.plain?.area?.trim() || !n.plain?.reason?.trim()) errors.push(`not-tested.json: "${n.area}" needs a plain { area, reason } for the admin report.`);
  for (const n of mergedNotTested(data)) {
    if (n.fromCoverage) warnings.push(`coverage "${n.fromCoverage.area}" is marked not-tested but has no entry in not-tested.json with the same area text: add one (with a plain wording) so the reports do not list it twice or in technical words.`);
  }
  if ((data.admin?.next_steps?.length ?? 0) > 3) errors.push("admin.json: at most 3 next_steps.");
  if (!data.admin?.biggest_risk?.trim()) warnings.push("admin.json: no biggest_risk sentence (the admin report falls back to the top problem's title).");
  const flowCount = data.meta?.critical_flows?.length ?? 0;
  for (const row of data.coverage) {
    if (row.critical_flow !== undefined && (!Number.isInteger(row.critical_flow) || row.critical_flow < 1 || row.critical_flow > flowCount)) errors.push(`coverage "${row.area}": critical_flow ${String(row.critical_flow)} is not one of the ${flowCount} critical journeys in the config.`);
    if (row.surface === "ui" && !row.ui) warnings.push(`coverage "${row.area}": a UI row without "ui" is grouped under "Web screens" in the admin report.`);
  }
  for (let i = 1; i <= flowCount; i++) if (!data.coverage.some((r) => r.critical_flow === i)) warnings.push(`Critical journey ${i} ("${data.meta?.critical_flows?.[i - 1]}") has no coverage row, so the verdict cannot be Ready.`);

  // Ticket mode (spec 13.4): every criterion has an answer that is backed. Coverage checks (spec 13.7, 13.9 to 13.11): what could not run is listed, what they found is reported.
  if (data.meta?.ticket_ref) {
    const t = lintTicketResults(runDir, data.ticket, { findings: data.findings.map((f) => f.id ?? "").filter(Boolean), unconfirmed: data.unconfirmed.map((u) => u.id ?? "").filter(Boolean) }, data.meta);
    errors.push(...t.errors);
    warnings.push(...t.warnings);
  }
  const cov = lintCoverage(data.checks, data);
  errors.push(...cov.errors);
  warnings.push(...cov.warnings);

  // Reports older than the data they were built from would disagree with it.
  const dataDir = path.join(runDir, "data");
  if (fs.existsSync(dataDir)) {
    const newestData = Math.max(0, ...fs.readdirSync(dataDir).filter((f) => f.endsWith(".json") && f !== "meta.json").map((f) => fs.statSync(path.join(dataDir, f)).mtimeMs));
    for (const name of ["TECHNICAL-REPORT.md", "ADMIN-REPORT.md"]) {
      const file = path.join(runDir, name);
      if (fs.existsSync(file) && fs.statSync(file).mtimeMs + 1 < newestData) errors.push(`${name} is older than the data it is built from: run \`report build\` again.`);
    }
  }
  for (const row of data.coverage) {
    if (row.status === "tested" && /not tested|blocked|skipped/i.test(row.note ?? "")) errors.push(`coverage "${row.area}" is marked tested but its note says otherwise.`);
  }
  if (data.findings.length === 0 && data.coverage.length === 0) warnings.push("No findings and no coverage rows: the report would not show what was checked.");

  const scan: string[] = [path.join(runDir, "TECHNICAL-REPORT.md")];
  for (const sub of ["evidence", "data"]) {
    const dir = path.join(runDir, sub);
    if (!fs.existsSync(dir)) continue;
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(json|md|txt|log|yml|yaml|har|html)$/i.test(e.name)) scan.push(p);
      }
    };
    walk(dir);
  }
  for (const file of scan) {
    if (!fs.existsSync(file)) continue;
    // Plans are inputs written by hand (they may carry deliberately fake tokens for "invalid token" probes);
    // only real configured secrets matter there. Everything else is output and gets the full scan.
    const isPlan = path.relative(runDir, file).split(path.sep).join("/").startsWith("data/plans/");
    const leaks = findSecretLeaks(fs.readFileSync(file, "utf8"), knownSecrets, { generic: !isPlan });
    for (const leak of leaks) errors.push(`${path.relative(runDir, file)}: contains ${leak}; redact it before reporting.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}
