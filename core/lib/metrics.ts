import path from "node:path";
import { SEVERITIES } from "./config.ts";
import type { Severity } from "./config.ts";
import { readJson } from "./fsutil.ts";
import { feedbackStats } from "./memory/feedback.ts";
import { areaKey, recordEscapedRisk } from "./memory/risk.ts";
import { assertSafeText, memoryPaths, nextId, readMemoryJson, writeMemoryJson } from "./memory/store.ts";
import type { RunData } from "./report.ts";
import { computeVerdict, flowStatus } from "./verdict.ts";

/**
 * How the agent is doing (spec 13.16): one record per finished run in `memory/metrics.json`, the bugs that escaped to production, and what both say together: precision from people's verdicts,
 * coverage and the test bank over time, and how often an area the agent had marked as passing turned out to hold a bug. This is the evidence that the agent is improving, or is not.
 * Nothing here is guessed: a number that needs data nobody has given yet is said to be unavailable.
 */

export interface AreaMark {
  area: string;
  status: "tested" | "partial" | "not-tested";
  surface: string;
}

/** A finding of the run, reduced to what an escaped bug is compared with. */
export interface FindingNote {
  id: string;
  area: string;
  title: string;
}

export interface RunMetric {
  run_id: string;
  finished: string;
  mode: string;
  trigger: string;
  verdict: "ready" | "ready-with-risks" | "not-ready";
  findings: { critical: number; important: number; minor: number; unconfirmed: number };
  /** What the findings are across runs (spec 13.12). */
  bugs: { new: number; still_open: number; came_back: number };
  coverage: { journeys_tested: number; journeys_total: number; areas_tested: number; areas_partial: number; areas_not_tested: number; pages: number; endpoints: number; api_probes: number };
  /** The test bank at the start of the run; absent when it held no active test. `pass_rate` counts a pass on a retry as a pass, and leaves skipped and quarantined tests out. */
  bank?: { total: number; ran: number; passed: number; failed: number; pass_rate: number };
  tests_saved: number;
  duration_s: number;
  cost_usd?: number;
  tokens?: number;
  areas: AreaMark[];
  /** What the run found, in a few words each (up to 40): an escaped bug is compared with these to tell whether the run had reported something like it. */
  finding_list?: FindingNote[];
}

export const ESCAPED_SOURCES = ["manual", "sentry", "ticket", "other"] as const;
export type EscapedSource = (typeof ESCAPED_SOURCES)[number];
/** What the agent had said about the area before the bug reached production. */
export type EscapedVerdict = "missed" | "reported-before" | "partly-checked" | "not-checked" | "never-covered";

export interface EscapedBug {
  id: string;
  area: string;
  title: string;
  severity: Severity;
  source: EscapedSource;
  /** The ticket or error id in the system it came from. */
  ref?: string;
  recorded: string;
  by?: string;
  note?: string;
  verdict: EscapedVerdict;
  /** The most recent run that covered a similar area, and what it said. */
  matched?: { run_id: string; finished: string; area: string; status: AreaMark["status"]; /** The run's findings that look related to the escaped bug (for a tested area): why it is "reported before", or empty for "missed". */ findings?: string[] };
}

export interface MetricsFile {
  schema_version?: number;
  runs: RunMetric[];
  escaped: EscapedBug[];
}

export const MAX_RUNS = 200;
const MAX_AREA_MARKS = 80;
const MAX_FINDING_NOTES = 40;
/** How far back an escaped bug is matched against what runs said about its area. */
const MATCH_RUNS = 10;

export function loadMetrics(store: string): MetricsFile {
  const f = readMemoryJson<MetricsFile>(memoryPaths(store).metrics);
  return { ...(f?.schema_version !== undefined ? { schema_version: f.schema_version } : {}), runs: Array.isArray(f?.runs) ? f.runs : [], escaped: Array.isArray(f?.escaped) ? f.escaped : [] };
}

function saveMetrics(store: string, f: MetricsFile): void {
  writeMemoryJson(memoryPaths(store).metrics, { runs: f.runs.slice(-MAX_RUNS), escaped: f.escaped });
}

// ---------------------------------------------------------------------------------------------- what an area is called

const stem = (w: string): string => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
/** Words that say nothing about what an area is ("by", "and", "for"): they would tie everything to everything. */
const STOP = new Set(["and", "the", "for", "with", "from", "via", "per", "any", "all", "not", "are", "was", "has", "its", "our", "your", "into", "over", "under", "after", "before", "when", "that", "this", "than", "then", "also"]);
const tokens = (area: string): string[] => [...new Set(areaKey(area).split(" ").filter((w) => w.length >= 3 && !STOP.has(w)).map(stem))];

/** How alike two area names are, from 0 to 1: the share of the shorter name's words that the other has ("Orders / validation" against "Order creation" shares "order"). */
export function areaSimilarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (x.length === 0 || y.length === 0) return 0;
  const shared = x.filter((t) => y.includes(t)).length;
  return shared / Math.min(x.length, y.length);
}
export const AREA_MATCH = 0.5;

/** The words most of a run's area names share ("order" in an ordering app): they say nothing about which area a finding belongs to, so they are left out when findings are matched to areas. */
export function commonWords(areas: string[]): Set<string> {
  if (areas.length < 3) return new Set();
  const counts = new Map<string, number>();
  for (const a of areas) for (const t of tokens(a)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n / areas.length >= 0.6).map(([t]) => t));
}

/** Like areaSimilarity, without the words in `skip` (unless that would leave a name with nothing). */
export function distinctiveSimilarity(a: string, b: string, skip: Set<string>): number {
  const keep = (name: string): string[] => {
    const t = tokens(name);
    const d = t.filter((w) => !skip.has(w));
    return d.length ? d : t;
  };
  const x = keep(a);
  const y = keep(b);
  if (x.length === 0 || y.length === 0) return 0;
  return x.filter((t) => y.includes(t)).length / Math.min(x.length, y.length);
}

// ---------------------------------------------------------------------------------------------- one run

/** The record of a run, from its data files. Pure: nothing is read from the store. */
export function metricFromRun(data: RunData, run: { finished: string; duration_s: number; cost_usd?: number; tokens?: number; tests_saved?: number }, extra: { pages: number; endpoints: number }): RunMetric {
  const meta = data.meta;
  const flows = flowStatus(data);
  const count = (sev: Severity): number => data.findings.filter((f) => f.severity === sev).length;
  const statuses = (st: string): number => data.coverage.filter((c) => c.status === st).length;
  const life = data.lifecycle?.findings ?? [];
  const areas: AreaMark[] = data.coverage.slice(0, MAX_AREA_MARKS).map((c) => ({ area: c.area, status: c.status, surface: c.surface }));
  const finding_list: FindingNote[] = data.findings.slice(0, MAX_FINDING_NOTES).map((f) => ({ id: f.id ?? "", area: f.area, title: f.title.length > 100 ? `${f.title.slice(0, 99)}…` : f.title }));
  const bank = data.bank;
  const ran = bank ? bank.passed + bank.flaky + bank.failed : 0;
  return {
    run_id: meta?.run_id ?? "",
    finished: run.finished,
    mode: meta?.mode ?? "unknown",
    trigger: meta?.trigger ?? "manual",
    verdict: computeVerdict(data).level,
    findings: { critical: count("critical"), important: count("important"), minor: count("minor"), unconfirmed: data.unconfirmed.length },
    bugs: { new: life.filter((l) => l.status === "new").length, still_open: life.filter((l) => l.status === "still-open").length, came_back: life.filter((l) => l.status === "regressed").length },
    coverage: { journeys_tested: flows.tested.length, journeys_total: flows.total, areas_tested: statuses("tested"), areas_partial: statuses("partial"), areas_not_tested: statuses("not-tested"), pages: extra.pages, endpoints: extra.endpoints, api_probes: data.apiSummaries.reduce((n, s) => n + s.total, 0) },
    ...(bank && bank.total > 0 ? { bank: { total: bank.total, ran, passed: bank.passed + bank.flaky, failed: bank.failed, pass_rate: ran > 0 ? Math.round(((bank.passed + bank.flaky) / ran) * 100) / 100 : 0 } } : {}),
    tests_saved: run.tests_saved ?? 0,
    duration_s: run.duration_s,
    ...(run.cost_usd !== undefined ? { cost_usd: run.cost_usd } : {}),
    ...(run.tokens !== undefined ? { tokens: run.tokens } : {}),
    areas,
    finding_list,
  };
}

/** How many pages and endpoints the run recorded in the product map's input files. */
export function observedCounts(runDir: string): { pages: number; endpoints: number } {
  const n = (f: string): number => {
    try {
      const v = readJson<unknown>(path.join(runDir, "data", f));
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  };
  return { pages: n("pages.json"), endpoints: n("endpoints.json") };
}

/** Writes the run's record, replacing an earlier record of the same run (finishing twice changes nothing). The caller holds the store's lock. */
export function recordRunMetrics(store: string, metric: RunMetric): void {
  const f = loadMetrics(store);
  f.runs = [...f.runs.filter((r) => r.run_id !== metric.run_id), metric].sort((a, b) => a.finished.localeCompare(b.finished));
  saveMetrics(store, f);
}

// ---------------------------------------------------------------------------------------------- escaped bugs

export interface EscapedInput {
  area: string;
  title: string;
  severity?: Severity;
  source?: EscapedSource;
  ref?: string;
  by?: string;
  note?: string;
}

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * Whether a finding's text shares enough distinctive words with the escaped bug's area: one is enough for a short area name ("Order totals"), two for a long phrase (four or more words),
 * because a long phrase shares one word with almost anything. The words in `skip` (the ones most of a run's area names share) do not count.
 */
function sharesDistinctiveWord(escapedArea: string, text: string, skip: Set<string>): boolean {
  const own = tokens(escapedArea).filter((w) => !skip.has(w));
  const words = own.length ? own : tokens(escapedArea);
  const there = new Set(tokens(text));
  return words.filter((w) => there.has(w)).length >= (words.length >= 4 ? 2 : 1);
}

/**
 * What the last runs said about an area: the newest of the last ten that covered a similar one decides. If it marked the area as tested, the run's findings decide the rest:
 * one that shares a distinctive word with the escaped bug's area means a problem had been reported there (the words most area names share, like "order" in an ordering app, say nothing and are left out);
 * none means the agent marked the area as passing and a bug was there. The findings that were considered are returned, so a person can judge the match.
 */
export function matchEscaped(area: string, runs: RunMetric[]): { verdict: EscapedVerdict; matched?: NonNullable<EscapedBug["matched"]> } {
  for (const r of [...runs].sort((a, b) => b.finished.localeCompare(a.finished)).slice(0, MATCH_RUNS)) {
    const common = commonWords(r.areas.map((a) => a.area));
    const best = r.areas.map((a) => ({ a, score: distinctiveSimilarity(area, a.area, common) })).filter((x) => x.score >= AREA_MATCH).sort((x, y) => y.score - x.score)[0];
    if (!best) continue;
    const { a } = best;
    const base = { run_id: r.run_id, finished: r.finished, area: a.area, status: a.status };
    if (a.status !== "tested") return { verdict: a.status === "partial" ? "partly-checked" : "not-checked", matched: base };
    const related = (r.finding_list ?? []).filter((f) => sharesDistinctiveWord(area, `${f.area} ${f.title}`, common)).map((f) => f.id).filter(Boolean);
    return { verdict: related.length > 0 ? "reported-before" : "missed", matched: { ...base, findings: related } };
  }
  return { verdict: "never-covered" };
}

/**
 * Records a bug that reached production (spec 13.16) and raises its area's risk. Said again (same reference, or the same area and title) it changes nothing and returns the earlier record.
 * The caller holds the store's lock. `missed` means a run had marked a similar area as tested and found nothing there: the agent's miss, the number that matters.
 */
export function addEscaped(store: string, input: EscapedInput, now: Date): { bug: EscapedBug; already: boolean } {
  const area = clean(input.area);
  const title = clean(input.title);
  const note = input.note ? clean(input.note) : undefined;
  const ref = input.ref ? clean(input.ref) : undefined;
  const by = input.by ? clean(input.by) : undefined;
  if (area.length < 3 || area.length > 80) throw new Error("An escaped bug needs the area it is in (3 to 80 characters), in the words the reports use for areas.");
  if (title.length < 8 || title.length > 200) throw new Error("An escaped bug needs a title of 8 to 200 characters that says what went wrong in production.");
  if (input.severity && !SEVERITIES.includes(input.severity)) throw new Error("severity must be critical, important or minor.");
  if (input.source && !(ESCAPED_SOURCES as readonly string[]).includes(input.source)) throw new Error(`source must be one of ${ESCAPED_SOURCES.join(", ")}.`);
  if (ref && ref.length > 120) throw new Error("ref is the id in the system the bug came from (up to 120 characters).");
  if (note && note.length > 400) throw new Error("note is up to 400 characters.");
  assertSafeText("this escaped bug", `${area} ${title} ${ref ?? ""} ${note ?? ""} ${by ?? ""}`);
  const source = input.source ?? "manual";
  const f = loadMetrics(store);
  const same = f.escaped.find((e) => (ref ? e.ref === ref && e.source === source : areaKey(e.area) === areaKey(area) && areaKey(e.title) === areaKey(title)));
  if (same) return { bug: same, already: true };
  const severity = input.severity ?? "important";
  const { verdict, matched } = matchEscaped(area, f.runs);
  const bug: EscapedBug = { id: nextId("ESC", f.escaped.map((e) => e.id)), area, title, severity, source, ...(ref ? { ref } : {}), recorded: now.toISOString(), ...(by ? { by } : {}), ...(note ? { note } : {}), verdict, ...(matched ? { matched } : {}) };
  f.escaped.push(bug);
  saveMetrics(store, f);
  recordEscapedRisk(store, bug.id, now, { area, severity, note: `A bug reached production here: ${title}${verdict === "missed" ? " (a run had marked this area as passing)" : ""}` });
  return { bug, already: false };
}

export const VERDICT_WORDS: Record<EscapedVerdict, string> = {
  missed: "a run had marked this area as tested and found nothing: the agent missed it",
  "reported-before": "a run had reported a problem in this area",
  "partly-checked": "a run had checked this area only partly",
  "not-checked": "a run had listed this area as not tested",
  "never-covered": "no recent run covered this area",
};

// ---------------------------------------------------------------------------------------------- what it says together

export interface AgentPerformance {
  /** Up to the last five runs, oldest first. */
  runs: RunMetric[];
  total_runs: number;
  precision: { real: number; judged: number; rate: number } | undefined;
  precision_note: string;
  escaped: { total: number; missed: number; reported_before: number; partly_checked: number; not_checked: number; never_covered: number; recent: EscapedBug[] };
  /** The latest three runs against the three before them: only with six or more runs, and only a direction. */
  trend?: { serious_per_run: [number, number]; journeys_tested_share: [number, number]; areas_tested: [number, number]; bank_pass_rate?: [number, number]; minutes: [number, number]; cost_usd?: [number, number] };
  notes: string[];
}

const avg = (xs: number[]): number => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0);

/** The agent's performance over the project's runs. `current` is a run that has not finished yet (the report being built): it is counted in place of its own earlier record. */
export function agentPerformance(store: string, current?: RunMetric): AgentPerformance {
  const f = loadMetrics(store);
  const runs = [...f.runs.filter((r) => r.run_id !== current?.run_id), ...(current ? [current] : [])].sort((a, b) => a.finished.localeCompare(b.finished));
  const fb = feedbackStats(store);
  const kinds = (v: EscapedVerdict): number => f.escaped.filter((e) => e.verdict === v).length;
  const share = (r: RunMetric): number => (r.coverage.journeys_total > 0 ? r.coverage.journeys_tested / r.coverage.journeys_total : 0);
  const notes: string[] = [];
  let trend: AgentPerformance["trend"];
  if (runs.length >= 6) {
    const earlier = runs.slice(-6, -3);
    const latest = runs.slice(-3);
    const pair = (g: (r: RunMetric) => number): [number, number] => [avg(earlier.map(g)), avg(latest.map(g))];
    const withBank = (rs: RunMetric[]): RunMetric[] => rs.filter((r) => r.bank);
    const costed = (rs: RunMetric[]): RunMetric[] => rs.filter((r) => r.cost_usd !== undefined);
    trend = {
      serious_per_run: pair((r) => r.findings.critical + r.findings.important),
      journeys_tested_share: pair(share),
      areas_tested: pair((r) => r.coverage.areas_tested),
      minutes: pair((r) => r.duration_s / 60),
      ...(withBank(earlier).length && withBank(latest).length ? { bank_pass_rate: [avg(withBank(earlier).map((r) => r.bank?.pass_rate ?? 0)), avg(withBank(latest).map((r) => r.bank?.pass_rate ?? 0))] as [number, number] } : {}),
      ...(costed(earlier).length && costed(latest).length ? { cost_usd: [avg(costed(earlier).map((r) => r.cost_usd ?? 0)), avg(costed(latest).map((r) => r.cost_usd ?? 0))] as [number, number] } : {}),
    };
    notes.push("The trend compares the latest 3 runs with the 3 before them. Runs of different modes are mixed, so it is a direction, not a measurement.");
  } else notes.push(`A trend needs at least 6 runs; this project has ${runs.length}.`);
  if (f.escaped.length === 0) notes.push("No escaped bug is recorded. Record one with `qamind escaped add` (Sentry and ticket labels will do it by themselves in a later phase); until then this count cannot show a miss.");
  return {
    runs: runs.slice(-5),
    total_runs: runs.length,
    precision: fb.precision,
    precision_note: fb.note,
    escaped: { total: f.escaped.length, missed: kinds("missed"), reported_before: kinds("reported-before"), partly_checked: kinds("partly-checked"), not_checked: kinds("not-checked"), never_covered: kinds("never-covered"), recent: f.escaped.slice(-3).reverse() },
    ...(trend ? { trend } : {}),
    notes,
  };
}

// ---------------------------------------------------------------------------------------------- escaped bugs from Sentry and tickets

export interface KnownArea {
  area: string;
  /** What the newest run that covered it said. */
  status: AreaMark["status"];
  run_id: string;
  finished: string;
  /** How many of that run's findings are about it. */
  findings: number;
}

/** The areas the last runs covered, newest word on each: so an escaped bug is named in the words the reports use, and matched to what they said. */
export function knownAreas(store: string): KnownArea[] {
  const runs = loadMetrics(store).runs.slice(-MATCH_RUNS).reverse();
  const out = new Map<string, KnownArea>();
  for (const r of runs) {
    for (const a of r.areas) {
      const key = areaKey(a.area);
      if (out.has(key)) continue;
      out.set(key, { area: a.area, status: a.status, run_id: r.run_id, finished: r.finished, findings: (r.finding_list ?? []).filter((f) => areaSimilarity(f.area, a.area) >= AREA_MATCH).length });
    }
  }
  return [...out.values()];
}

export interface ImportedEscaped {
  ref?: string;
  title: string;
  result: "recorded" | "already-recorded" | "refused";
  id?: string;
  verdict?: EscapedVerdict;
  problem?: string;
}

/** Records a list of bugs found in production monitoring or tickets. One that is refused (private data in it, a missing area) does not stop the others. */
export function importEscaped(store: string, items: EscapedInput[], by: string, now: Date): ImportedEscaped[] {
  return items.map((it) => {
    try {
      const r = addEscaped(store, { ...it, by: it.by ?? by }, now);
      return { ...(it.ref ? { ref: it.ref } : {}), title: it.title, result: r.already ? ("already-recorded" as const) : ("recorded" as const), id: r.bug.id, verdict: r.bug.verdict };
    } catch (e) {
      return { ...(it.ref ? { ref: it.ref } : {}), title: it.title, result: "refused" as const, problem: (e as Error).message };
    }
  });
}
