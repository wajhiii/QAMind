import fs from "node:fs";
import path from "node:path";
import { MAX_NEXT_STEPS, MAX_SUMMARY_LINES, MISSING_PLAIN, lintAdminLanguage } from "../lib/adminreport.ts";

/**
 * The admin report must agree with the technical report (spec §11.3): same issue set, same severities, nothing added,
 * no Critical or Important dropped. This reads the two WRITTEN files (not the data they were rendered from), so it also
 * catches a hand edit or a rendering bug.
 */

export interface ConsistencyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  technical: Array<{ id: string; severity: string }>;
  admin: Array<{ id: string; severity: string }>;
}

const SEV_WORD: Record<string, string> = { "🔴": "critical", "🟠": "important", "🟡": "minor" };
const VERDICT = /^(✅ \*\*Ready to release|⚠️ \*\*Ready with risks|⛔ \*\*Not ready to release)/;

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  if (start < 0) return "";
  const rest = text.slice(start + 1);
  const next = rest.indexOf("\n## ", 4);
  return next < 0 ? rest : rest.slice(0, next);
}

export function checkConsistency(runDir: string): ConsistencyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const result: ConsistencyResult = { ok: true, errors, warnings, technical: [], admin: [] };
  const techFile = path.join(runDir, "TECHNICAL-REPORT.md");
  const adminFile = path.join(runDir, "ADMIN-REPORT.md");
  for (const f of [techFile, adminFile]) {
    if (!fs.existsSync(f)) {
      errors.push(`${path.basename(f)} does not exist: run \`report build\` first.`);
    }
  }
  if (errors.length) return { ...result, ok: false };
  const tech = fs.readFileSync(techFile, "utf8");
  const admin = fs.readFileSync(adminFile, "utf8");

  // ---- technical report: issues, severities, counts, not-tested ----
  const findingsSection = section(`\n${tech}`, "Findings");
  for (const m of findingsSection.matchAll(/^### (ISSUE-\d+) (🔴|🟠|🟡) (Critical|Important|Minor): /gm)) result.technical.push({ id: m[1] as string, severity: SEV_WORD[m[2] as string] as string });
  const techCounts = /🔴 Critical: \*\*(\d+)\*\*\s+🟠 Important: \*\*(\d+)\*\*\s+🟡 Minor: \*\*(\d+)\*\*/.exec(tech);
  const techNotTested = (section(`\n${tech}`, "Not tested").match(/^- \*\*/gm) ?? []).length;

  // ---- admin report: first line, summary, problems, sections ----
  const lines = admin.split("\n");
  const first = lines[0] ?? "";
  if (!VERDICT.test(first)) errors.push("The admin report's first line must be the release verdict (Ready to release / Ready with risks / Not ready to release).");
  const summaryLines = lines.filter((l) => l.startsWith("> - "));
  if (summaryLines.length === 0) errors.push("The admin report has no 30-second summary.");
  if (summaryLines.length > MAX_SUMMARY_LINES) errors.push(`The 30-second summary has ${summaryLines.length} lines (limit ${MAX_SUMMARY_LINES}).`);

  const problemsSection = section(`\n${admin}`, "Problems found");
  const blocks = problemsSection.split(/^### /m).slice(1);
  for (const b of blocks) {
    const head = /^(🔴|🟠|🟡) (Critical|Important|Minor): (.+)$/m.exec(b);
    const dev = [...b.matchAll(/^- \*\*For developers:\*\* \[(ISSUE-\d+)\]\(TECHNICAL-REPORT\.md#(ISSUE-\d+)\)\s*$/gm)];
    const title = head?.[3] ?? b.split("\n")[0] ?? "?";
    if (!head) {
      errors.push(`A problem heading is not in the form "<severity icon> <Severity>: <title>": ${title}`);
      continue;
    }
    if (dev.length !== 1) {
      errors.push(`Problem "${title}" must have exactly one "For developers" line linking to its ISSUE (found ${dev.length}).`);
      continue;
    }
    const [, id, anchor] = dev[0] as RegExpExecArray;
    if (id !== anchor) errors.push(`Problem "${title}": the For developers link text (${id}) and target (${anchor}) differ.`);
    result.admin.push({ id: id as string, severity: SEV_WORD[head[1] as string] as string });
    for (const label of ["Where", "What happens", "Who is affected", "How to see it yourself", "What should happen", "Screenshot", "Status", "Ticket"]) {
      if (!new RegExp(`^- \\*\\*${label}:\\*\\*`, "m").test(b)) errors.push(`Problem "${title}" is missing "${label}".`);
    }
    if (b.includes(MISSING_PLAIN)) errors.push(`Problem "${title}" has no plain-language text yet (${id}).`);
  }

  // ---- the two reports agree ----
  const techIds = new Map(result.technical.map((x) => [x.id, x.severity]));
  const adminIds = new Map(result.admin.map((x) => [x.id, x.severity]));
  for (const [id, sev] of techIds) {
    if (!adminIds.has(id)) errors.push(`${id} (${sev}) is in the technical report but missing from the admin report${sev === "minor" ? "" : ": a Critical or Important problem must never be dropped"}.`);
    else if (adminIds.get(id) !== sev) errors.push(`${id} is ${sev} in the technical report but ${adminIds.get(id)} in the admin report.`);
  }
  for (const id of adminIds.keys()) if (!techIds.has(id)) errors.push(`${id} is in the admin report but not in the technical report: nothing may be added.`);
  if (adminIds.size !== result.admin.length || techIds.size !== result.technical.length) errors.push("The same ISSUE id appears twice in one of the reports.");

  const actual = { critical: 0, important: 0, minor: 0 } as Record<string, number>;
  for (const x of result.technical) actual[x.severity] = (actual[x.severity] ?? 0) + 1;
  if (techCounts) {
    const stated = { critical: Number(techCounts[1]), important: Number(techCounts[2]), minor: Number(techCounts[3]) } as Record<string, number>;
    for (const k of Object.keys(actual)) if (stated[k] !== actual[k]) errors.push(`The technical summary says ${stated[k]} ${k} but ${actual[k]} are listed.`);
  } else errors.push("The technical report has no severity summary line.");
  const adminCounts = /🔴 (\d+) critical · 🟠 (\d+) important · 🟡 (\d+) minor/.exec(summaryLines.join("\n"));
  if (adminCounts) {
    const stated = { critical: Number(adminCounts[1]), important: Number(adminCounts[2]), minor: Number(adminCounts[3]) } as Record<string, number>;
    for (const k of Object.keys(actual)) if (stated[k] !== actual[k]) errors.push(`The admin summary says ${stated[k]} ${k} but the technical report lists ${actual[k]}.`);
  } else errors.push("The admin summary has no problem-count line.");

  // The verdict must not contradict the counts (default rules, spec §13.13).
  if (first.startsWith("✅") && (actual["critical"] !== 0 || (actual["important"] ?? 0) > 2)) errors.push("The verdict says Ready, but there are critical problems or more than 2 important ones.");
  if (first.startsWith("⛔") && actual["critical"] === 0 && !/environment/i.test(first)) errors.push("The verdict says Not ready but there are no critical problems and no environment problem.");
  if (first.startsWith("⚠️") && actual["critical"] !== 0) errors.push("The verdict says Ready with risks, but there are critical problems.");

  const adminNotTested = (section(`\n${admin}`, "What was not tested").match(/^- \*\*/gm) ?? []).length;
  if (techNotTested !== adminNotTested) errors.push(`The technical report lists ${techNotTested} not-tested areas but the admin report lists ${adminNotTested}.`);
  const steps = (section(`\n${admin}`, "Suggested next steps").match(/^\d+\. /gm) ?? []).length;
  if (steps > MAX_NEXT_STEPS) errors.push(`The admin report has ${steps} suggested next steps (limit ${MAX_NEXT_STEPS}).`);

  for (const issue of lintAdminLanguage(admin)) errors.push(`Admin report line ${issue.line} contains ${issue.found}: "${issue.text}"`);
  if (/\*\*Not ready|Ready with risks/.test(first) === false && !first.startsWith("✅")) warnings.push("Unrecognised verdict wording.");

  result.ok = errors.length === 0;
  return result;
}
