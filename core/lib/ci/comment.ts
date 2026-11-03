import type { BankResults } from "../bank/results.ts";
import { maskText } from "../privacy.ts";
import type { PrivacyContext } from "../privacy.ts";
import type { CiGate } from "./gate.ts";

/**
 * The one comment QAMind keeps on a pull request (spec 13.2): the admin report's 30-second summary and a link to the full reports, rewritten on every push instead of adding another.
 * Built only from the run's rendered reports (already masked) and masked again here, because a pull request comment is read by more people than a report file.
 */
export const COMMENT_MARKER = "<!-- qamind-ci:v1 -->";
const MAX_CHARS = 60_000;

export type CiOutcomeOrError = "pass" | "warn" | "fail" | "error";

export interface CommentInput {
  outcome: CiOutcomeOrError;
  gate?: CiGate;
  /** ADMIN-REPORT.md of the run, when there is one. */
  adminReport?: string;
  bank?: BankResults;
  mode: string;
  sha?: string;
  runUrl?: string;
  /** For `error`: what stopped QAMind, in a sentence. */
  error?: string;
  minutes?: number;
  now?: Date;
}

const HEAD: Record<CiOutcomeOrError, string> = { pass: "✅ Passed", warn: "⚠️ Passed with warnings", fail: "⛔ Failed", error: "⚪ Could not check this change" };

/** The status line and the 30-second summary of an admin report, and its problems, as they are written there. */
export function readAdminReport(md: string): { verdict: string; summary: string[]; problems: Array<{ icon: string; severity: string; title: string }>; checklist?: { title: string; lines: string[] } } {
  const lines = md.split("\n");
  // Ticket mode (spec 13.4): the checklist of what was asked for, as the admin report words it.
  const at = lines.findIndex((l) => /^## What was asked for \(/.test(l));
  const end = at < 0 ? -1 : lines.findIndex((l, i) => i > at && l.startsWith("## "));
  const checklist = at < 0 ? undefined : { title: (lines[at] as string).replace(/^## /, ""), lines: lines.slice(at + 1, end < 0 ? undefined : end).filter((l) => l.trim() !== "") };
  return {
    ...(checklist ? { checklist } : {}),
    verdict: (lines[0] ?? "").trim(),
    summary: lines.filter((l) => l.startsWith("> - ")).map((l) => l.slice(4).trim()),
    problems: [...md.matchAll(/^### (🔴|🟠|🟡) (Critical|Important|Minor): (.+)$/gm)].map((m) => ({ icon: m[1] as string, severity: m[2] as string, title: (m[3] as string).trim() })),
  };
}

export function renderComment(i: CommentInput, privacy: PrivacyContext): string {
  const L: string[] = [COMMENT_MARKER, `## QAMind ${HEAD[i.outcome]}`, ""];
  if (i.outcome === "error") {
    L.push(`QAMind could not complete a check of this change: ${(i.error ?? "it did not finish").replace(/\s+/g, " ").trim()}`, "", "This says nothing about the change itself. Nothing was changed in your repository.", "");
  } else {
    const r = i.adminReport ? readAdminReport(i.adminReport) : undefined;
    if (r?.verdict) L.push(r.verdict, "");
    if (r?.summary.length) L.push("> **30-second summary**", ...r.summary.map((s) => `> - ${s}`), "");
    if (r?.checklist) L.push(`**${r.checklist.title}**`, "", ...r.checklist.lines, "");
    if (i.gate && (i.gate.failed.length || i.gate.warned.length)) {
      L.push(i.outcome === "fail" ? "**Why this fails:**" : "**To look at:**", ...i.gate.reasons.map((x) => `- ${x}`), "");
    }
    if (r?.problems.length) {
      L.push(`**Problems found (${r.problems.length}):**`, ...r.problems.slice(0, 12).map((p) => `- ${p.icon} ${p.severity}: ${p.title}`));
      if (r.problems.length > 12) L.push(`- ... and ${r.problems.length - 12} more in the full report`);
      L.push("");
    }
    const bits: string[] = [];
    if (i.gate?.facts.came_back) bits.push(`**${i.gate.facts.came_back}** came back after being fixed`);
    if (i.bank && i.bank.total > 0) bits.push(`saved checks: ${i.bank.passed + i.bank.flaky} of ${i.bank.total} passed${i.bank.failed ? `, ${i.bank.failed} failed` : ""}`);
    if (bits.length) L.push(bits.join(" · "), "");
  }
  const links = [i.runUrl ? `[Full reports in the CI run](${i.runUrl})` : "The full reports are in the CI run's artifacts", `mode \`${i.mode}\``, ...(i.sha ? [`commit \`${i.sha.slice(0, 7)}\``] : []), ...(i.minutes !== undefined ? [`${i.minutes} min`] : [])];
  L.push(links.join(" · "), "", `<sub>QAMind's CI run is report-only: it never changes, commits or pushes your code. This comment is updated on every push. Last updated ${(i.now ?? new Date()).toISOString().slice(0, 16).replace("T", " ")} UTC.</sub>`);
  let text = L.join("\n");
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS - 200)}\n\n_(shortened: the full reports are in the CI run)_\n`;
  return maskText(text, privacy).text;
}
