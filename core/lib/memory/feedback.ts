import fs from "node:fs";
import path from "node:path";
import { SEVERITIES } from "../config.ts";
import type { Severity } from "../config.ts";
import { readJson } from "../fsutil.ts";
import { addFalseAlarm } from "./falsealarms.ts";
import { adjustLearning, learn } from "./learnings.ts";
import { loadBugs, saveBugs, isOpenBug } from "./bugs.ts";
import type { BugEvent, BugRecord } from "./bugs.ts";
import { recordFeedbackRisk } from "./risk.ts";
import { assertSafeText, memoryPaths, nextId, readJsonl, writeJsonl } from "./store.ts";

/**
 * Human verdicts on findings (spec 13.5). Only a person gives them: a QA run cannot (the safety hook refuses the command in every run mode).
 * Each verdict changes memory in a way the next run can see: a false alarm is not reported again, a severity the owner set is the severity the reports show,
 * a bug the owner accepted is listed as known instead of as a problem, and a bug someone says is fixed is watched for coming back.
 */
export const VERDICTS = ["not-a-bug", "wrong-severity", "duplicate-of", "confirmed", "fixed", "wont-fix", "good-catch"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface FeedbackRecord {
  id: string;
  bug: string;
  /** The finding id the person used (ISSUE-003), and the run it was in. */
  issue?: string;
  run?: string;
  verdict: Verdict;
  /** For `wrong-severity`. */
  level?: Severity;
  /** For `duplicate-of`: the bug it duplicates. */
  duplicate_of?: string;
  note?: string;
  by: string;
  at: string;
  via: "command" | "admin-report" | "tracker";
  /** What this changed, in plain words (also shown back to the person). */
  effects: string[];
  [extra: string]: unknown;
}

const one = (s: string): string => s.replace(/\s+/g, " ").trim();

export function loadFeedback(store: string): { records: FeedbackRecord[]; warnings: string[]; unparsed: string[] } {
  const read = readJsonl<Partial<FeedbackRecord>>(memoryPaths(store).feedback);
  const records = read.records.filter((r): r is FeedbackRecord => !!r.id && !!r.bug && VERDICTS.includes(r.verdict as Verdict) && !!r.by && !!r.at).map((r) => ({ ...r, effects: Array.isArray(r.effects) ? r.effects : [] }));
  const dropped = read.records.length - records.length;
  return { records, warnings: [...read.warnings, ...(dropped ? [`${dropped} feedback record(s) without a bug, verdict, name or date were ignored.`] : [])], unparsed: read.unparsed };
}

/** Normalises what a person typed: `not a bug`, `Won't fix`, `wrong severity: important` ... */
export function parseVerdict(text: string): { verdict: Verdict; value?: string; note?: string } | undefined {
  const t = one(text).replace(/[“”]/g, '"').replace(/’/g, "'");
  const patterns: Array<[RegExp, Verdict]> = [
    [/^not[\s-]+a[\s-]+bug\b[\s:,.-]*/i, "not-a-bug"],
    [/^wrong[\s-]+severity\b[\s:,=-]*/i, "wrong-severity"],
    [/^duplicate(?:[\s-]+of)?\b[\s:,=-]*/i, "duplicate-of"],
    [/^confirmed\b[\s:,.-]*/i, "confirmed"],
    [/^(?:won'?t|will\s+not)[\s-]+fix\b[\s:,.-]*/i, "wont-fix"],
    [/^fixed\b[\s:,.-]*/i, "fixed"],
    [/^good[\s-]+catch\b[\s:,.-]*/i, "good-catch"],
  ];
  for (const [re, verdict] of patterns) {
    const m = re.exec(t);
    if (!m) continue;
    const rest = t.slice(m[0].length).trim();
    if (verdict === "wrong-severity") {
      const lvl = /^(critical|important|minor)\b[\s:,.-]*/i.exec(rest);
      return lvl ? { verdict, value: (lvl[1] as string).toLowerCase(), ...(rest.slice(lvl[0].length).trim() ? { note: rest.slice(lvl[0].length).trim() } : {}) } : { verdict };
    }
    if (verdict === "duplicate-of") {
      const id = /^((?:ISSUE|BUG)-\d+)\b[\s:,.-]*/i.exec(rest);
      return id ? { verdict, value: (id[1] as string).toUpperCase(), ...(rest.slice(id[0].length).trim() ? { note: rest.slice(id[0].length).trim() } : {}) } : { verdict };
    }
    return { verdict, ...(rest ? { note: rest } : {}) };
  }
  return undefined;
}

// ------------------------------------------------------------------------------------------------ resolving what a person pointed at

interface SummaryLite {
  run_id: string;
  finished?: string;
  findings?: Array<{ id: string; bug?: string }>;
}

function summaries(store: string): SummaryLite[] {
  const dir = memoryPaths(store).runs;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.replace(/\.json$/, "").localeCompare(b.replace(/\.json$/, "")))
    .reverse()
    .map((f) => readJson<SummaryLite>(path.join(dir, f)))
    .filter((s): s is SummaryLite => !!s);
}

/** `ISSUE-003` means a finding of a run (the latest that has it, unless `run` says which); `BUG-002` is the project's own id for it. */
export function resolveBug(store: string, target: string, run?: string): { bug: BugRecord; issue?: string; run?: string; bugs: BugRecord[]; unparsed: string[] } {
  const t = target.trim().toUpperCase();
  const loaded = loadBugs(store);
  if (/^BUG-\d+$/.test(t)) {
    const bug = loaded.bugs.find((b) => b.id === t);
    if (!bug) throw new Error(`No bug ${t} in this project's memory. Use \`qamind bugs list\` to see them.`);
    return { bug, bugs: loaded.bugs, unparsed: loaded.unparsed };
  }
  if (/^ISSUE-\d+$/.test(t)) {
    const all = summaries(store);
    const pool = run ? all.filter((s) => s.run_id === run) : all;
    if (run && pool.length === 0) throw new Error(`No finished run ${run} in this project's history.`);
    for (const s of pool) {
      const f = s.findings?.find((x) => x.id === t);
      if (!f) continue;
      if (!f.bug) throw new Error(`${t} in ${s.run_id} has no bug id (that run was made before bugs were tracked). Give the bug itself (BUG-nnn) or tell the agent in a new run.`);
      const bug = loaded.bugs.find((b) => b.id === f.bug);
      if (!bug) throw new Error(`${t} in ${s.run_id} points at ${f.bug}, which is not in memory.`);
      return { bug, issue: t, run: s.run_id, bugs: loaded.bugs, unparsed: loaded.unparsed };
    }
    throw new Error(`No finding ${t}${run ? ` in ${run}` : " in any finished run of this project"}. Finding numbers belong to one run: say which with --run, or use the bug id (BUG-nnn).`);
  }
  throw new Error(`"${target}" is not a finding or bug id: use ISSUE-003 (a finding in a report) or BUG-002.`);
}

// ------------------------------------------------------------------------------------------------ adding feedback

export interface FeedbackInput {
  target: string;
  verdict: Verdict;
  /** Severity level for `wrong-severity`, a finding or bug id for `duplicate-of`. */
  value?: string;
  note?: string;
  by: string;
  run?: string;
  via?: FeedbackRecord["via"];
}

const event = (e: Omit<BugEvent, "at">, now: Date): BugEvent => ({ at: now.toISOString(), ...e });
const dateOf = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * Records one verdict and applies it. Nothing is half done: the checks all happen before anything is written. Returns what changed, in plain words.
 */
export function addFeedback(store: string, input: FeedbackInput, now = new Date()): { record: FeedbackRecord; effects: string[]; warnings: string[] } {
  const by = one(input.by);
  if (by.length < 2 || by.length > 80) throw new Error("Say who is giving the feedback (--by NAME): a name of 2 to 80 characters.");
  if (!VERDICTS.includes(input.verdict)) throw new Error(`Unknown verdict "${input.verdict}". Use one of: ${VERDICTS.join(", ")}.`);
  const note = input.note ? one(input.note).slice(0, 400) : undefined;
  assertSafeText("this feedback", `${by} ${note ?? ""}`);

  const target = resolveBug(store, input.target, input.run);
  const bug = target.bug;
  const bugs = target.bugs;
  let level: Severity | undefined;
  let parent: BugRecord | undefined;
  if (input.verdict === "wrong-severity") {
    if (!SEVERITIES.includes(input.value as Severity)) throw new Error(`wrong-severity needs the right level: ${SEVERITIES.join(", ")}.`);
    level = input.value as Severity;
  }
  if (input.verdict === "duplicate-of") {
    if (!input.value) throw new Error("duplicate-of needs the finding or bug it duplicates (ISSUE-002 or BUG-004).");
    parent = resolveBug(store, input.value, input.run).bug;
    if (parent.id === bug.id) throw new Error("A bug cannot be a duplicate of itself.");
  }
  if (input.verdict === "not-a-bug" && (note ?? "").length < 8) throw new Error("not-a-bug needs a reason (--note, at least a short sentence): it becomes a known false alarm, and the next run needs to know why it is not a bug.");

  const feedback = loadFeedback(store);
  const id = nextId("F", feedback.records.map((r) => r.id));
  const effects: string[] = [];
  const warnings: string[] = [...feedback.warnings];
  const idForAlarm = { id, by, at: now.toISOString() };
  const label = `${bug.id} "${bug.title}"`;

  switch (input.verdict) {
    case "not-a-bug": {
      const r = addFalseAlarm(store, { area: bug.area, symptom: `${bug.title}. ${bug.summary}`.slice(0, 300), reason: note as string, source: "owner", ...(bug.last_seen.run ? { run: bug.last_seen.run } : {}), feedback: idForAlarm }, { now });
      bug.status = "not-a-bug";
      bug.not_a_bug = { by, at: now.toISOString(), ...(note ? { note } : {}) };
      bug.history = [...bug.history, event({ event: "not-a-bug", by, ...(note ? { note } : {}) }, now)].slice(-40);
      effects.push(`${label} is marked as not a bug. ${r.action === "created" ? `It is now a known false alarm (${r.alarm.id}), so a later run will not report it again.` : `It matches the known false alarm ${r.alarm.id}, which already stops it being reported.`}`);
      break;
    }
    case "wrong-severity": {
      const was = bug.severity_override?.level ?? bug.severity;
      bug.severity_override = { level: level as Severity, by, at: now.toISOString(), ...(note ? { note } : {}) };
      bug.history = [...bug.history, event({ event: "severity", by, note: `${was} to ${level}${note ? `: ${note}` : ""}` }, now)].slice(-40);
      effects.push(`${label} will be shown as ${level} (it was ${was}) in the next reports, with the name of the person who set it.`);
      try {
        const l = learn(store, { type: "behavior", area: bug.area, text: `In ${bug.area}, a problem like "${bug.title}" counts as ${level}, not ${was}. Severity set by ${by} on ${dateOf(now)}.`, run: bug.last_seen.run, confidence: 6 }, { now });
        effects.push(`Saved as a learning (${l.learning.id}) so similar problems in ${bug.area} are judged the same way.`);
      } catch (e) {
        warnings.push(`The severity was recorded, but it could not be saved as a learning: ${(e as Error).message}`);
      }
      break;
    }
    case "duplicate-of": {
      bug.status = "duplicate";
      bug.duplicate_of = (parent as BugRecord).id;
      bug.history = [...bug.history, event({ event: "duplicate", by, note: `of ${(parent as BugRecord).id}` }, now)].slice(-40);
      effects.push(`${label} is a duplicate of ${(parent as BugRecord).id}: findings that match it are counted under ${(parent as BugRecord).id} from now on.`);
      break;
    }
    case "confirmed":
    case "good-catch": {
      bug.confirmed_by = [...(bug.confirmed_by ?? []), { by, at: now.toISOString() }].slice(-10);
      bug.history = [...bug.history, event({ event: "confirmed", by, ...(note ? { note } : {}) }, now)].slice(-40);
      let raised = 0;
      for (const lid of bug.memory_applied ?? []) {
        try {
          adjustLearning(store, lid, "confirm", bug.last_seen.run, now);
          raised++;
        } catch {
          /* a learning that has since been archived is not an error */
        }
      }
      recordFeedbackRisk(store, bug.last_seen.run, now, bug.area, bug.severity_override?.level ?? bug.severity, `${input.verdict} from ${by}`);
      effects.push(`${label} is confirmed. ${bug.area} counts as a riskier area now${raised ? `, and ${raised} learning(s) that shaped it are more trusted` : ""}.`);
      break;
    }
    case "fixed": {
      if (bug.status === "fixed") warnings.push(`${bug.id} was already recorded as fixed.`);
      bug.previously_fixed = bug.fixed;
      bug.status = "fixed";
      bug.fixed = { at: now.toISOString(), how: `${by} reports it fixed${note ? `: ${note}` : ""}`, by };
      bug.history = [...bug.history, event({ event: "fixed", by, ...(note ? { note } : {}) }, now)].slice(-40);
      effects.push(`${label} is recorded as fixed. If a later run finds it again, it will be shown as having come back.`);
      break;
    }
    case "wont-fix": {
      bug.status = "accepted";
      bug.accepted = { by, at: now.toISOString(), ...(note ? { note } : {}) };
      bug.history = [...bug.history, event({ event: "accepted", by, ...(note ? { note } : {}) }, now)].slice(-40);
      effects.push(`${label} is accepted: later reports list it under "Known, accepted" and do not count it as a problem.`);
      break;
    }
  }

  const record: FeedbackRecord = {
    id,
    bug: bug.id,
    ...(target.issue ? { issue: target.issue } : {}),
    ...(target.run ? { run: target.run } : {}),
    verdict: input.verdict,
    ...(level ? { level } : {}),
    ...(parent ? { duplicate_of: parent.id } : {}),
    ...(note ? { note } : {}),
    by,
    at: now.toISOString(),
    via: input.via ?? "command",
    effects,
  };
  saveBugs(store, bugs, target.unparsed);
  writeJsonl(memoryPaths(store).feedback, "feedback", [...feedback.records, record], feedback.unparsed);
  return { record, effects, warnings };
}

// ------------------------------------------------------------------------------------------------ the admin report's feedback lines

export interface ImportedLine {
  issue: string;
  text: string;
  applied?: FeedbackRecord;
  effects?: string[];
  problem?: string;
}

/**
 * Reads the "Your feedback" lines a person filled in ADMIN-REPORT.md and applies the ones that start with a verdict. A line that is not understood is returned, not guessed.
 * `by` is who the feedback is from (the report does not say), given by the person importing it.
 */
export function importAdminFeedback(store: string, runDir: string, by: string, now = new Date()): ImportedLine[] {
  const file = path.join(runDir, "ADMIN-REPORT.md");
  if (!fs.existsSync(file)) throw new Error(`No ADMIN-REPORT.md in ${runDir}.`);
  const run = path.basename(runDir);
  const out: ImportedLine[] = [];
  const blocks = fs.readFileSync(file, "utf8").split(/^### /m).slice(1);
  for (const block of blocks) {
    const issue = /\[(ISSUE-\d+)\]\(/.exec(block)?.[1];
    const line = /\*\*Your feedback \(optional\):\*\*\s*(.*)$/m.exec(block)?.[1] ?? "";
    const text = one(line.replace(/_{2,}/g, ""));
    if (!issue || !text) continue;
    const parsed = parseVerdict(text);
    if (!parsed) {
      out.push({ issue, text, problem: 'It does not start with a verdict. Start with one of: not a bug, confirmed, won\'t fix, fixed, good catch, wrong severity <level>, duplicate of ISSUE-nnn (then a note). Give it with `qamind feedback add` instead.' });
      continue;
    }
    const already = loadFeedback(store).records.some((r) => r.run === run && r.issue === issue && r.verdict === parsed.verdict && r.via === "admin-report" && (r.note ?? "") === (parsed.note ?? ""));
    if (already) {
      out.push({ issue, text, problem: "Already imported." });
      continue;
    }
    try {
      const r = addFeedback(store, { target: issue, run, verdict: parsed.verdict, ...(parsed.value ? { value: parsed.value } : {}), ...(parsed.note ? { note: parsed.note } : {}), by, via: "admin-report" }, now);
      out.push({ issue, text, applied: r.record, effects: r.effects });
    } catch (e) {
      out.push({ issue, text, problem: (e as Error).message });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ stats for the metrics (spec 13.16)

export interface FeedbackStats {
  total: number;
  /** Findings (bugs) a person has judged, one verdict each (the latest). */
  judged: number;
  by_verdict: Partial<Record<Verdict, number>>;
  /** Of the findings a person judged: how many were real. Only given from MIN_VERDICTS verdicts on, because a handful of answers is not a rate. */
  precision?: { real: number; judged: number; rate: number };
  note: string;
}

export const MIN_VERDICTS = 5;

export function feedbackStats(store: string): FeedbackStats {
  const { records } = loadFeedback(store);
  const by: Partial<Record<Verdict, number>> = {};
  for (const r of records) by[r.verdict] = (by[r.verdict] ?? 0) + 1;
  // One verdict per bug counts (the latest): a person who changes their mind is not counted twice.
  const last = new Map<string, Verdict>();
  for (const r of records) last.set(r.bug, r.verdict);
  const judged = [...last.values()].filter((v) => v !== "duplicate-of");
  const real = judged.filter((v) => v !== "not-a-bug").length;
  const enough = judged.length >= MIN_VERDICTS;
  return {
    total: records.length,
    judged: judged.length,
    by_verdict: by,
    ...(enough ? { precision: { real, judged: judged.length, rate: Math.round((real / judged.length) * 100) / 100 } } : {}),
    note: records.length === 0 ? "Nobody has given feedback on a finding yet." : enough ? "Precision is the share of judged findings that were real (not marked not-a-bug)." : `Precision needs at least ${MIN_VERDICTS} judged findings; there ${judged.length === 1 ? "is" : "are"} ${judged.length}.`,
  };
}

/** Open bugs a person said nothing about yet: the review can offer them. */
export function unjudgedOpenBugs(store: string): BugRecord[] {
  const judged = new Set(loadFeedback(store).records.map((r) => r.bug));
  return loadBugs(store).bugs.filter((b) => isOpenBug(b) && !judged.has(b.id));
}
