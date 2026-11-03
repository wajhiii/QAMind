import type { AgentPerformance, RunMetric } from "./metrics.ts";
import { VERDICT_WORDS } from "./metrics.ts";

/** The "Agent performance" section of the technical report (spec 13.16, 11.2): the same numbers `memory stats` shows, as tables and sentences. */

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const cell = (s: string): string => s.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
const VERDICT_MARK: Record<RunMetric["verdict"], string> = { ready: "✅ Ready", "ready-with-risks": "⚠️ Risks", "not-ready": "⛔ Not ready" };
const arrow = (pair: [number, number], fmt: (n: number) => string = String): string => `${fmt(pair[0])} → ${fmt(pair[1])}`;

export function renderAgentPerformance(p: AgentPerformance, currentRunId?: string): string[] {
  const L: string[] = ["## Agent performance", "", "_How the agent is doing on this project: from run records, people's verdicts and bugs that reached production (spec 13.16). Numbers that need data nobody has given yet are said to be unavailable._", ""];
  L.push("| Run | Mode | Verdict | 🔴 + 🟠 | 🟡 | Key journeys | Areas tested | Bank pass rate | Minutes | Cost |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of p.runs) {
    const j = r.coverage.journeys_total > 0 ? `${r.coverage.journeys_tested}/${r.coverage.journeys_total}` : "-";
    L.push(`| ${r.run_id === currentRunId ? "**this run**" : cell(r.run_id)} | ${r.mode} | ${VERDICT_MARK[r.verdict]} | ${r.findings.critical + r.findings.important} | ${r.findings.minor} | ${j} | ${r.coverage.areas_tested} | ${r.bank ? `${pct(r.bank.pass_rate)} (${r.bank.passed}/${r.bank.ran})` : "-"} | ${Math.round((r.duration_s / 60) * 10) / 10} | ${r.cost_usd !== undefined ? `$${r.cost_usd.toFixed(2)}` : "-"} |`);
  }
  L.push("");
  L.push(p.precision ? `- **Precision:** ${p.precision.real} of ${p.precision.judged} judged findings were real (${pct(p.precision.rate)}). ${p.precision_note}` : `- **Precision:** not available yet. ${p.precision_note}`);
  const e = p.escaped;
  if (e.total === 0) L.push("- **Escaped bugs:** none recorded.");
  else {
    const parts = [e.missed ? `${e.missed} in an area a run had marked as passing (the agent's miss)` : "", e.reported_before ? `${e.reported_before} in an area where a problem had been reported` : "", e.partly_checked ? `${e.partly_checked} in a partly checked area` : "", e.not_checked ? `${e.not_checked} in an area listed as not tested` : "", e.never_covered ? `${e.never_covered} in an area no recent run covered` : ""].filter(Boolean);
    L.push(`- **Escaped bugs:** ${e.total} recorded: ${parts.join("; ")}.`);
    for (const b of e.recent) L.push(`  - ${b.id} (${b.severity}, ${b.recorded.slice(0, 10)}) ${cell(b.title)} — ${cell(b.area)}: ${VERDICT_WORDS[b.verdict]}${b.matched ? ` (${cell(b.matched.area)} in ${b.matched.run_id})` : ""}`);
  }
  if (p.trend) {
    const t = p.trend;
    L.push(`- **Trend** (latest 3 runs against the 3 before): serious problems per run ${arrow(t.serious_per_run)}; key journeys tested ${arrow(t.journeys_tested_share, pct)}; areas tested per run ${arrow(t.areas_tested)}${t.bank_pass_rate ? `; bank pass rate ${arrow(t.bank_pass_rate, pct)}` : ""}; minutes per run ${arrow(t.minutes)}${t.cost_usd ? `; cost per run ${arrow(t.cost_usd, (n) => `$${n.toFixed(2)}`)}` : ""}.`);
  }
  for (const n of p.notes) L.push(`- _${cell(n)}_`);
  L.push("");
  return L;
}
