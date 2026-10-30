import fs from "node:fs";
import path from "node:path";
import { SEVERITIES } from "./config.ts";
import type { Severity } from "./config.ts";
import { readJson, writeJson } from "./fsutil.ts";
import { findSecretLeaks } from "./redact.ts";

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
}

export interface CoverageRow {
  surface: string;
  area: string;
  role?: string;
  viewport?: string;
  status: "tested" | "partial" | "not-tested";
  note?: string;
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
}

export interface HealthResult {
  environment_ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string; ms?: number; skipped?: boolean }>;
  ran_at: string;
}

export interface RunData {
  meta?: RunMeta;
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
  return {
    ...(meta ? { meta } : {}),
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

/** Everything not tested: explicit entries plus any coverage row marked not-tested (deduplicated, never silently dropped). */
export function mergedNotTested(data: RunData): NotTested[] {
  const out = [...data.notTested];
  const seen = new Set(out.map((n) => n.area.toLowerCase()));
  for (const row of data.coverage) {
    if (row.status === "not-tested") {
      const label = [row.surface, row.area, row.role, row.viewport].filter(Boolean).join(" / ");
      if (!seen.has(label.toLowerCase()) && !seen.has(row.area.toLowerCase())) {
        out.push({ area: label, reason: row.note ?? "Reason not recorded" });
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

export function renderTechnicalReport(data: RunData): string {
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

  L.push("## Test plan (charters)", "");
  if (data.charters.length === 0) L.push("_No charters recorded._", "");
  for (const c of data.charters) {
    L.push(`### ${c.id}: ${c.title}  \`${c.surface}\``, "", `- **Goal:** ${c.goal}`, `- **Risk:** ${c.risk}`, `- **Entry point:** ${c.entry_point}`, `- **Expected results:** ${c.expected}`, `- **Exit condition:** ${c.exit_condition}`, "");
  }

  L.push("## Findings", "");
  const sorted = [...data.findings].sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || (a.id ?? "").localeCompare(b.id ?? ""));
  if (sorted.length === 0) L.push("_No confirmed findings._", "");
  for (const f of sorted) {
    L.push(`### ${f.id ?? "ISSUE-???"} ${ICON[f.severity]} ${LABEL[f.severity]}: ${f.title}`, "");
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
    L.push("| Surface | Area | Role | Viewport | Status | Note |", "|---|---|---|---|---|---|");
    const mark = { tested: "✅ tested", partial: "◐ partial", "not-tested": "⛔ not tested" } as const;
    for (const r of data.coverage) L.push(`| ${esc(r.surface)} | ${esc(r.area)} | ${esc(r.role ?? "-")} | ${esc(r.viewport ?? "-")} | ${mark[r.status]} | ${esc(r.note ?? "")} |`);
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
  L.push(m?.memory_applied?.length ? m.memory_applied.map((x) => `- Applied: ${x}`).join("\n") : "_No project memory was applied (first run, or memory held nothing relevant)._", "");
  L.push("_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._", "");

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
