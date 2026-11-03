import path from "node:path";
import { readJson } from "./fsutil.ts";
import type { ApiPerfResults } from "./perf/api.ts";
import { apiPerfResultsFile } from "./perf/api.ts";
import { plainDuration } from "./perf/store.ts";
import type { MailCheckRecord } from "./mail/service.ts";
import { groupPerf, readSweepResults } from "./sweep/results.ts";
import type { SweepResults } from "./sweep/results.ts";

/**
 * What the coverage checks (spec 13.7, 13.9 to 13.11: page sweep, messages, timings) put in the reports, and what the lint asks of the agent about them.
 * The sweep, the mail checks and the timings are recorded by their own commands; this only reads those files.
 */

export interface CoverageData {
  sweep?: SweepResults;
  mail: MailCheckRecord[];
  apiPerf?: ApiPerfResults;
}

export function readCoverageData(runDir: string): CoverageData | undefined {
  const sweep = readSweepResults(runDir);
  const mail = readJson<MailCheckRecord[]>(path.join(runDir, "data", "mail-checks.json"));
  const apiPerf = readJson<ApiPerfResults>(apiPerfResultsFile(runDir));
  if (!sweep && !(Array.isArray(mail) && mail.length) && !apiPerf) return undefined;
  return { ...(sweep ? { sweep } : {}), mail: Array.isArray(mail) ? mail : [], ...(apiPerf ? { apiPerf } : {}) };
}

const cell = (s: string): string => s.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
const BROWSER_NAME: Record<string, string> = { chromium: "Chrome", webkit: "Safari's engine (WebKit)", firefox: "Firefox" };
const browserName = (b: string): string => BROWSER_NAME[b] ?? b;
const sizeOf = (s: SweepResults, name: string): string => {
  const v = s.matrix.viewports.find((x) => x.name === name);
  return v ? `${name} (${v.width} wide)` : name;
};

export function renderTechnicalCoverage(c: CoverageData): string[] {
  const L: string[] = [];
  const s = c.sweep;
  if (s) {
    const ok = s.visits.filter((v) => !v.error);
    L.push("## Browsers, screen sizes and speed (page sweep)", "", `Checked ${s.matrix.why}: ${s.matrix.browsers.map(browserName).join(", ")} at ${s.matrix.viewports.map((v) => `${v.name} ${v.width}×${v.height}`).join(", ")}. **${ok.length}** page visits${s.visits.length - ok.length ? `, ${s.visits.length - ok.length} could not be visited` : ""}.`, "");
    for (const u of s.unavailable) L.push(`- ⛔ **${browserName(u.browser)} was not checked:** ${cell(u.reason)}`);
    for (const k of s.skipped.slice(0, 12)) L.push(`- ⛔ Not visited${k.page ? ` ${k.page}` : ""}${k.browser ? ` in ${k.browser}` : ""}${k.viewport ? ` at ${k.viewport}` : ""}: ${cell(k.reason)}`);
    if (s.unavailable.length || s.skipped.length) L.push("");
    if (s.groups.length) {
      L.push("| Page | Lead | Where it happens | What the page audit saw |", "|---|---|---|---|");
      for (const g of s.groups.slice(0, 60)) L.push(`| ${cell(g.title)} | ${g.kind} | ${cell(g.scope)} | ${cell(g.detail)} |`);
      L.push("", "_Leads are things to verify, not verdicts; the confirmed ones are findings below._", "");
    } else L.push("_The page audit found nothing on the pages that were visited._", "");
    const slow = groupPerf(s.perf);
    if (slow.length) {
      L.push("**Slow pages**", "");
      for (const p of slow) L.push(`- ${cell(p.message)} (seen in ${p.seen_on.join(", ")})`);
      L.push("");
    }
    const vs = s.visual_summary;
    if (vs.compared + vs.no_baseline > 0) {
      L.push(`**Visual comparison:** ${vs.compared} compared with a baseline, **${vs.different}** different, ${vs.no_baseline} without a baseline yet.`, "");
      for (const v of s.visits.filter((x) => x.visual?.state === "different")) L.push(`- ${cell(v.title)} (${v.browser}, ${v.viewport}): ${v.visual?.percent}% of the picture changed (${v.visual?.impact}) since the baseline of ${v.visual?.baseline_at?.slice(0, 10)}: [before](${v.visual?.before}) · [after](${v.visual?.after}) · [difference](${v.visual?.diff})`);
      if (vs.different) L.push("");
    }
    for (const n of s.notes) L.push(`- _${cell(n)}_`);
    if (s.notes.length) L.push("");
  }
  if (c.mail.length) {
    L.push("## Email and SMS checks", "", "| Flow | Channel | Arrived | Checks | Evidence |", "|---|---|---|---|---|");
    for (const m of c.mail) {
      const failed = m.checks.filter((x) => !x.ok);
      L.push(`| ${cell(m.flow ?? "-")} | ${m.channel} | ${m.arrived ? `yes (${m.waited_s} s)` : `**no** (${m.timeout_s} s)${m.note ? `: ${cell(m.note)}` : ""}`} | ${m.arrived ? (failed.length ? `❌ ${failed.map((f) => cell(`${f.name}: ${f.detail}`)).join("; ")}` : "✅ all passed") : "-"} | ${m.evidence ? `[${path.basename(m.evidence)}](${m.evidence})` : "-"} |`);
    }
    L.push("");
  }
  if (c.apiPerf && (c.apiPerf.timings.length || c.apiPerf.skipped.length)) {
    L.push("## API response times", "", "| Endpoint | Role | Median | Slowest | Budget | Result |", "|---|---|---|---|---|---|");
    for (const t of c.apiPerf.timings) L.push(`| ${t.method} ${cell(t.path)} | ${t.role ?? "-"} | ${t.median_ms} ms | ${t.p95_ms} ms | ${t.budget_ms} ms | ${t.over_budget ? "❌ slow" : t.regressed ? `⚠️ ${t.slower_pct}% slower than before` : "✅"} |`);
    for (const k of c.apiPerf.skipped) L.push(`| ${cell(k.path)} | ${k.role ?? "-"} | - | - | - | ⛔ ${cell(k.reason)} |`);
    L.push("", "_Not a load test: a few calls, one after the other._", "");
  }
  return L;
}

/** Plain-language lines for the admin report: where and how the product was checked. No technical words (the admin language lint reads these too). */
export function renderAdminCoverage(c: CoverageData): string[] {
  const L: string[] = [];
  const s = c.sweep;
  if (s) {
    const checkedBrowsers = s.matrix.browsers.filter((b) => !s.unavailable.some((u) => u.browser === b));
    L.push(`- **Screens and devices:** checked in ${checkedBrowsers.map(browserName).join(" and ") || "no browser"} on ${s.matrix.viewports.map((v) => sizeOf(s, v.name)).join(" and ")} screens (${s.visits.filter((v) => !v.error).length} page views).`);
    for (const u of s.unavailable) L.push(`- **Not checked:** ${browserName(u.browser)}, because it is not available on the machine that ran the check.`);
    const slow = groupPerf(s.perf);
    if (slow.length) for (const p of slow.slice(0, 3)) L.push(`- **Speed:** ${p.message.replace(/\bpage \(as [^)]+\)/, "page")}`);
    else if (s.visits.some((v) => v.settled_ms !== undefined)) L.push("- **Speed:** every page that was timed opened within its limit.");
    const vs = s.visual_summary;
    if (vs.compared > 0) L.push(`- **Look of the screens:** ${vs.compared} compared with the approved look, ${vs.different} different.`);
  }
  if (c.mail.length) {
    const bad = c.mail.filter((m) => !m.arrived || m.checks.some((x) => !x.ok));
    L.push(`- **Messages the product sends:** ${c.mail.length} checked (${c.mail.map((m) => m.flow ?? m.channel).slice(0, 4).join(", ")}); ${bad.length ? `${bad.length} had something wrong with them` : "all looked right"}.`);
  }
  if (c.apiPerf?.timings.length) {
    const slow = c.apiPerf.timings.filter((t) => t.over_budget);
    L.push(`- **Speed of the behind-the-scenes calls:** ${c.apiPerf.timings.length} timed, ${slow.length ? `${slow.length} slower than their limit` : "all within their limit"}.`);
  }
  return L;
}

export interface CoverageLint {
  errors: string[];
  warnings: string[];
}

/** What the agent must do about the coverage checks: nothing that could not run may pass quietly, and what they found is reported or explained. */
export function lintCoverage(c: CoverageData | undefined, data: { findings: Array<{ type: string; area: string; title: string; browser?: string }>; unconfirmed: Array<{ title: string; observation: string }>; notTested: Array<{ area: string; reason: string }> }): CoverageLint {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!c) return { errors, warnings };
  const notTestedText = data.notTested.map((n) => `${n.area} ${n.reason}`.toLowerCase());
  const mentions = (...words: string[]): boolean => notTestedText.some((t) => words.some((w) => t.includes(w)));
  const s = c.sweep;
  if (s) {
    for (const u of s.unavailable) {
      const words = u.browser === "chromium" ? ["chromium", "chrome"] : u.browser === "webkit" ? ["webkit", "safari"] : [u.browser];
      if (!mentions(...words)) errors.push(`${browserName(u.browser)} could not run (${u.reason}), so everything in it was not tested: list it in not-tested.json (area and reason, with the plain wording), or the reports would imply it was checked.`);
    }
    if (s.skipped.some((k) => /Could not sign in/.test(k.reason)) && !mentions("sign in", "signed in", "sign-in", "login")) warnings.push("The sweep could not sign in as some role, so its pages were not visited: list them under Not tested with that reason.");
    if (s.budget_reached && !mentions("time budget")) warnings.push("The sweep stopped at the time budget: list what it did not visit under Not tested (reason: time budget reached).");
    const textOf = (f: { type: string; area: string; title: string }): string => `${f.type} ${f.area} ${f.title}`.toLowerCase();
    if (groupPerf(s.perf).some((p) => p.kind === "slow-page") && !data.findings.some((f) => /perf|slow|speed|load/.test(textOf(f))) && !data.unconfirmed.some((u) => /slow|speed|load|perf/.test(`${u.title} ${u.observation}`.toLowerCase()))) warnings.push("The sweep measured slow pages, and no finding or unconfirmed lead is about performance: report them (type performance) or say why they are not a problem.");
    if (s.visual_summary.different > 0 && !data.findings.some((f) => /visual|layout|look|screenshot/.test(textOf(f))) && !data.unconfirmed.some((u) => /visual|layout|look/.test(`${u.title} ${u.observation}`.toLowerCase()))) warnings.push("The sweep found pictures that differ from their baseline, and no finding is about how a screen looks: report each difference that is a defect, or accept the new look (`baseline accept`).");
  }
  const failedMail = c.mail.filter((m) => m.arrived && m.checks.some((x) => !x.ok));
  if (failedMail.length && !data.findings.some((f) => /mail|sms|message|notification/.test(`${f.type} ${f.area} ${f.title}`.toLowerCase())) && !data.unconfirmed.some((u) => /mail|sms|message/.test(`${u.title} ${u.observation}`.toLowerCase()))) warnings.push(`${failedMail.length} email or SMS check(s) failed and no finding is about a message: report them or say why they are fine.`);
  const missing = c.mail.filter((m) => !m.arrived && !m.note?.includes("sandbox is configured"));
  if (missing.length && !data.findings.some((f) => /mail|sms|message/.test(`${f.type} ${f.area} ${f.title}`.toLowerCase())) && !data.unconfirmed.some((u) => /mail|sms|message/.test(`${u.title} ${u.observation}`.toLowerCase())) && !mentions("email", "sms", "message")) warnings.push(`${missing.length} message(s) did not arrive in the sandbox: report that, list it under Unconfirmed, or list the flow under Not tested.`);
  return { errors, warnings };
}

export { plainDuration };
