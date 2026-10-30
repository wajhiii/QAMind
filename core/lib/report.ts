import fs from "node:fs";
import path from "node:path";
import { SEVERITIES } from "./config.ts";
import { describeChanges } from "./memory/productmap.ts";
import type { Severity } from "./config.ts";
import { readJson, writeJson } from "./fsutil.ts";
import type { MemoryLogEntry } from "./memory/memorylog.ts";
import type { Changes } from "./memory/productmap.ts";
import { findSecretLeaks } from "./redact.ts";
import { flowStatus } from "./verdict.ts";

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
  /** The first reproduction step, so a regression run knows where to start. */
  first_step?: string;
}

export function compactFinding(f: Finding): CompactFinding {
  return { id: f.id ?? "", title: f.title, severity: f.severity, surface: f.surface, area: f.area, type: f.type, ...(f.ui ? { ui: f.ui } : {}), ...(f.steps?.[0] ? { first_step: f.steps[0].slice(0, 200) } : {}) };
}

export type FixStatus = "not-fixed" | "fixed-verified" | "fixed-needs-confirmation";

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
  /** Fix mode sets this; report-only runs leave it unset (not fixed). */
  fix_status?: FixStatus;
}

export interface Unconfirmed {
  id?: string;
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
  memory_applied?: string[];
  notes?: string[];
  /** The critical journeys from the config, in order (copied at run start). */
  critical_flows?: string[];
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
  checks: Array<{ name: string; ok: boolean; detail: string; ms?: number; skipped?: boolean }>;
  ran_at: string;
}

export interface RunData {
  meta?: RunMeta;
  admin?: AdminNotes;
  /** What changed since the last run (data/changes.json), if computed. */
  changes?: Changes;
  /** What memory did during this run (data/memory-log.json). */
  memoryLog: MemoryLogEntry[];
  charters: Charter[];
  findings: Finding[];
  unconfirmed: Unconfirmed[];
  notTested: NotTested[];
  coverage: CoverageRow[];
  health?: HealthResult;
  apiSummaries: ApiRunSummary[];
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
  return {
    ...(meta ? { meta } : {}),
    ...(admin ? { admin } : {}),
    ...(changes ? { changes } : {}),
    memoryLog: Array.isArray(memLog) ? (memLog as MemoryLogEntry[]) : [],
    charters: readList<Charter>(runDir, "charters.json"),
    findings: readList<Finding>(runDir, "findings.json"),
    unconfirmed: readList<Unconfirmed>(runDir, "unconfirmed.json"),
    notTested: readList<NotTested>(runDir, "not-tested.json"),
    coverage: readList<CoverageRow>(runDir, "coverage.json"),
    ...(health ? { health } : {}),
    apiSummaries,
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

function duration(seconds?: number): string {
  if (seconds === undefined) return "in progress";
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

export interface TechnicalContext {
  /** Earlier finished runs of this project, newest first (for the trend table). */
  previous?: Array<{ run_id: string; started: string; mode: string; counts: { critical: number; important: number; minor: number; unconfirmed: number }; coverage: { tested: number; partial: number; not_tested: number }; journeys?: { total: number; tested: number }; not_tested_count: number }>;
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
      ["Cost / usage", m.cost ?? "not available on this host"],
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
  const api = data.apiSummaries.reduce((a, s) => ({ total: a.total + s.total, failed: a.failed + s.failed, signals: a.signals + s.signals }), { total: 0, failed: 0, signals: 0 });
  if (data.apiSummaries.length) L.push(`- API probes executed: **${api.total}** (${api.signals} produced a signal worth a look)`);
  L.push("");

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
  const sorted = [...data.findings].sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || (a.id ?? "").localeCompare(b.id ?? ""));
  if (sorted.length === 0) L.push("_No confirmed findings._", "");
  for (const f of sorted) {
    L.push(`<a id="${f.id ?? "ISSUE-"}"></a>`, "", `### ${f.id ?? "ISSUE-???"} ${ICON[f.severity]} ${LABEL[f.severity]}: ${f.title}`, "");
    L.push(`- **Surface:** ${f.surface}${f.ui ? ` · **UI:** ${f.ui}` : ""} · **Area:** ${f.area} · **Type:** ${f.type}`);
    if (f.roles?.length) L.push(`- **Roles:** ${f.roles.join(", ")}`);
    if (f.browser || f.viewport) L.push(`- **Browser / viewport:** ${[f.browser, f.viewport].filter(Boolean).join(" / ")}`);
    L.push(`- **Reproduced:** ${f.reproduced.times} of ${f.reproduced.of} attempts`);
    if (f.charter) L.push(`- **Charter:** ${f.charter}`);
    L.push("", f.summary, "", "**Steps to reproduce**", "");
    f.steps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
    L.push("", `**Expected:** ${f.expected}`, "", `**Actual:** ${f.actual}`, "");
    L.push("**Evidence**", "", ...f.evidence.map((e) => `- [${e}](${e})`), "");
    if (f.suspected_cause) L.push(`**Suspected root cause:** ${f.suspected_cause}`, "");
    if (f.regression_test) L.push(`**Proposed regression test:** ${f.regression_test.description}${f.regression_test.location ? ` (suggested location: \`${f.regression_test.location}\`)` : ""}`, "");
    if (f.memory_applied?.length) L.push(`**Memory applied:** ${f.memory_applied.join("; ")}`, "");
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

  L.push("## Not tested", "", "_Nothing here is reported as passing._", "");
  if (notTested.length === 0) L.push("_Everything planned was tested._", "");
  for (const n of notTested) L.push(`- **${n.area}**: ${n.reason}`);
  if (notTested.length) L.push("");

  if (data.apiSummaries.length) {
    L.push("## API test runs", "", "| Plan | Probes | Passed | Failed | Signals | Details |", "|---|---|---|---|---|---|");
    for (const s of data.apiSummaries) L.push(`| ${esc(s.plan)} | ${s.total} | ${s.passed} | ${s.failed} | ${s.signals} | [${s.file}](${s.file}) |`);
    L.push("");
  }

  L.push("## Memory", "");
  const applied = data.memoryLog.filter((e) => e.kind === "learning-applied" || e.kind === "false-alarm-skipped");
  const saved = data.memoryLog.filter((e) => !["learning-applied", "false-alarm-skipped"].includes(e.kind));
  const verb: Record<string, string> = { "learning-applied": "Applied learning", "false-alarm-skipped": "Skipped known false alarm", "learning-created": "New learning", "learning-merged": "Confirmed again", "learning-contradicted": "Contradicted learning", "false-alarm-created": "New false alarm" };
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
