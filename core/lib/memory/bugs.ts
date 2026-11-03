import crypto from "node:crypto";
import { SEVERITIES } from "../config.ts";
import type { Severity } from "../config.ts";
import { areaKey } from "./risk.ts";
import { appendArchive, memoryPaths, nextId, readJsonl, similarity, writeJsonl } from "./store.ts";

/**
 * Bug lifecycle (spec 13.12). Every finding gets a stable fingerprint (area + type + normalised symptom) and is matched against the bugs this project has
 * seen before, so a report can say what is new, what is still open, what was fixed and what **came back**.
 *
 * Matching is deliberately cautious. Two different bugs in one area read alike ("GET /orders fails for page_size=0" and "GET /orders fails when q is '('"), so the
 * words of a title are not enough; the trigger (numbers, odd characters) has to match too. When a finding resembles a known bug without being clearly the same,
 * the agent is made to say which it is (`bug: "BUG-003"` or `bug: "new"`), because only it can tell. Code never guesses across that line.
 */

export const BUG_STATUSES = ["new", "still-open", "fixed", "regressed", "accepted", "not-a-bug", "duplicate"] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];
/** A bug that is open: reported, not fixed, not accepted, not dismissed. */
export const OPEN_BUG_STATUSES: readonly BugStatus[] = ["new", "still-open", "regressed"];
export const isOpenBug = (b: Pick<BugRecord, "status">): boolean => OPEN_BUG_STATUSES.includes(b.status);

export interface BugEvent {
  at: string;
  run?: string;
  event: "new" | "seen" | "fixed" | "regressed" | "accepted" | "not-a-bug" | "duplicate" | "severity" | "confirmed" | "fix-on-branch" | "reopened";
  note?: string;
  by?: string;
}

export interface BugRecord {
  id: string;
  fingerprint: string;
  area: string;
  type: string;
  surface: string;
  /** The latest wording. */
  title: string;
  /** The same problem in words a manager understands (the finding's `plain.title`): the admin report names bugs that are not findings of the run with it. */
  plain_title?: string;
  summary: string;
  /** What the agent last assessed; `severity_override` (from feedback) wins in the reports. */
  severity: Severity;
  status: BugStatus;
  first_seen: { run: string; at: string };
  last_seen: { run: string; at: string };
  times_seen: number;
  /** Set when the bug was fixed; kept after it came back (as `previously_fixed`). */
  fixed?: { run?: string; at: string; how: string; by?: string };
  previously_fixed?: { run?: string; at: string; how: string; by?: string };
  severity_override?: { level: Severity; by: string; at: string; note?: string };
  accepted?: { by: string; at: string; note?: string };
  not_a_bug?: { by: string; at: string; note?: string };
  duplicate_of?: string;
  confirmed_by?: Array<{ by: string; at: string }>;
  /** Learning ids that shaped the finding when it was last reported (feedback raises their confidence). */
  memory_applied?: string[];
  /** The first reproduction step, so a re-check knows where to start. */
  first_step?: string;
  history: BugEvent[];
  [extra: string]: unknown;
}

const MAX_HISTORY = 40;
const MAX_BUGS = 1000;
const SEV = (s: unknown): Severity => (SEVERITIES.includes(s as Severity) ? (s as Severity) : "minor");

// ------------------------------------------------------------------------------------------------ fingerprint and matching

const WORDS_TO_DROP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were", "be", "it", "that", "this", "with", "as", "at", "by", "from", "not", "no", "but", "if", "then", "when", "which", "than", "so", "its", "into", "instead", "also", "again", "now", "after", "before", "returns", "return", "responds", "shows", "show", "gives", "give", "gets", "got", "error", "fails", "fail", "failed", "failure", "wrong", "incorrect", "problem", "issue", "bug"]);
/** Characters that can be the trigger of a problem (a search for "(", a name with a quote). Ordinary punctuation of a sentence or an address is not one. */
const SYMBOLS = /[()[\]{}<>'"`\\%;|&$*^~]/g;

/** The words of a symptom that identify it: lowercase, no filler, trivial plurals folded, numbers and odd characters kept (they are the trigger). */
export function symptomTokens(text: string): string[] {
  const cleaned = text
    .replace(/\bISSUE-\d+\b|\bUNCONFIRMED-\d+\b|\bBUG-\d+\b|\bQA-[\w-]+/gi, " ")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?\b/g, " ")
    .replace(/\b\d{5,}\b/g, " ");
  const symbols = [...new Set((cleaned.match(SYMBOLS) ?? []).map((c) => `sym${c.charCodeAt(0)}`))];
  const words = cleaned
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 0 && !WORDS_TO_DROP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  return [...new Set([...words, ...symbols])].sort();
}

/** Tokens that say *what triggers* the problem: numbers and odd characters. Two findings with different triggers are different bugs. */
const triggerOf = (tokens: string[]): string[] => tokens.filter((t) => /^\d+$/.test(t) || t.startsWith("sym"));

const jaccard = (a: string[], b: string[]): number => {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const t of A) if (B.has(t)) both++;
  return both / (A.size + B.size - both);
};

export interface BugSource {
  area: string;
  type: string;
  title: string;
  summary?: string;
  steps?: string[];
  surface?: string;
  plain_title?: string;
}

const symptomOf = (f: BugSource): string[] => symptomTokens(`${f.title} ${f.steps?.[0] ?? ""}`);

export function fingerprintOf(f: BugSource): string {
  return crypto.createHash("sha1").update(`${areaKey(f.area)}|${(f.type || "").toLowerCase().trim()}|${symptomOf(f).join(" ")}`).digest("hex").slice(0, 12);
}

const STRONG = 0.75;
const POSSIBLE = 0.35;

export interface BugMatch {
  bug?: BugRecord;
  how?: "explicit" | "bank-test" | "fingerprint" | "similar";
  /** Known bugs this finding resembles without clearly being one of them: the agent must say which it is. */
  candidates: Array<{ bug: BugRecord; score: number }>;
}

/**
 * Which known bug is this finding? `explicit` is the agent's `bug` field, `protects` the bug a failing bank test is linked to.
 * `bug: "new"` means "none of the known ones".
 */
export function matchBug(bugs: BugRecord[], f: BugSource & { bug?: string }, protects: string[] = []): BugMatch {
  const byId = (id: string): BugRecord | undefined => {
    let b = bugs.find((x) => x.id === id);
    for (let i = 0; b?.duplicate_of && i < 5; i++) b = bugs.find((x) => x.id === b?.duplicate_of) ?? b;
    return b;
  };
  if (f.bug === "new") return { candidates: [] };
  if (f.bug) {
    const b = byId(f.bug);
    if (b) return { bug: b, how: "explicit", candidates: [] };
  }
  for (const id of protects) {
    const b = byId(id);
    if (b) return { bug: b, how: "bank-test", candidates: [] };
  }
  const fp = fingerprintOf(f);
  const exact = bugs.find((b) => b.fingerprint === fp);
  if (exact) return { bug: byId(exact.id) ?? exact, how: "fingerprint", candidates: [] };

  const mine = symptomOf(f);
  const myTrigger = triggerOf(mine).join(" ");
  const scored = bugs
    .filter((b) => b.status !== "duplicate" && (areaKey(b.area) === areaKey(f.area) || (!!f.surface && b.surface === f.surface)))
    .map((b) => {
      const theirs = symptomOf({ ...b, steps: b.first_step ? [b.first_step] : [] });
      const text = Math.max(jaccard(mine, theirs), similarity(`${f.title} ${f.summary ?? ""}`, `${b.title} ${b.summary}`) * 0.9);
      return { bug: b, score: Math.round(text * 100) / 100, sameTrigger: triggerOf(theirs).join(" ") === myTrigger };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score >= STRONG && best.sameTrigger && areaKey(best.bug.area) === areaKey(f.area)) return { bug: byId(best.bug.id) ?? best.bug, how: "similar", candidates: [] };
  return { candidates: scored.filter((s) => s.score >= POSSIBLE).slice(0, 3).map(({ bug, score }) => ({ bug, score })) };
}

// ------------------------------------------------------------------------------------------------ storage

export interface LoadedBugs {
  bugs: BugRecord[];
  warnings: string[];
  unparsed: string[];
}

export function loadBugs(store: string): LoadedBugs {
  const read = readJsonl<Partial<BugRecord>>(memoryPaths(store).bugs);
  const warnings = [...read.warnings];
  const bugs: BugRecord[] = [];
  for (const r of read.records) {
    if (!r.id || !r.title || !r.fingerprint) {
      warnings.push(`A bug record without ${!r.id ? "an id" : !r.title ? "a title" : "a fingerprint"} was ignored.`);
      continue;
    }
    const status = BUG_STATUSES.includes(r.status as BugStatus) ? (r.status as BugStatus) : "still-open";
    const seen = r.last_seen ?? r.first_seen ?? { run: "unknown", at: new Date(0).toISOString() };
    bugs.push({
      ...r,
      id: String(r.id),
      fingerprint: String(r.fingerprint),
      area: String(r.area ?? "general"),
      type: String(r.type ?? "other"),
      surface: String(r.surface ?? "other"),
      title: String(r.title),
      summary: String(r.summary ?? ""),
      severity: SEV(r.severity),
      status,
      first_seen: r.first_seen ?? seen,
      last_seen: seen,
      times_seen: typeof r.times_seen === "number" ? r.times_seen : 1,
      history: Array.isArray(r.history) ? (r.history as BugEvent[]) : [],
    });
  }
  return { bugs, warnings, unparsed: read.unparsed };
}

export function saveBugs(store: string, bugs: BugRecord[], unparsed: string[] = []): void {
  // A project that has been tested for years must not grow without bound: the oldest fixed bugs move to the archive (never deleted).
  let keep = bugs;
  if (bugs.length > MAX_BUGS) {
    const droppable = bugs.filter((b) => b.status === "fixed").sort((a, b) => a.last_seen.at.localeCompare(b.last_seen.at)).slice(0, bugs.length - MAX_BUGS);
    const ids = new Set(droppable.map((b) => b.id));
    appendArchive(store, "bugs", droppable);
    keep = bugs.filter((b) => !ids.has(b.id));
  }
  writeJsonl(memoryPaths(store).bugs, "bugs", keep, unparsed);
}

export const bugEffectiveSeverity = (b: Pick<BugRecord, "severity" | "severity_override">): Severity => b.severity_override?.level ?? b.severity;

// ------------------------------------------------------------------------------------------------ classifying a run

/** What the agent wrote in `data/rechecks.json`: an earlier bug it checked again in this run and found fixed. */
export interface Recheck {
  bug: string;
  result: "passes";
  /** What was repeated and what was seen, so a person can trust "fixed". */
  how: string;
  evidence?: string[];
}

export type FindingLifeStatus = "new" | "still-open" | "regressed" | "accepted" | "not-a-bug";

export interface FindingLife {
  /** The finding's id in this run (ISSUE-001). */
  issue: string;
  bug: string;
  status: FindingLifeStatus;
  /** Including this run. */
  times_seen: number;
  first_seen: string;
  /** For a bug that came back: when it had been fixed. */
  fixed_on?: string;
  how?: BugMatch["how"];
  /** Known bugs this finding resembles; set when the agent has not said which it is (a lint error until it does). */
  ambiguous?: Array<{ bug: string; title: string; score: number }>;
}

export interface FixedSince {
  bug: string;
  title: string;
  plain_title?: string;
  area: string;
  severity: Severity;
  how: string;
  /** What showed it: the agent's own re-check, or a bank test that now passes. */
  source: "recheck" | "bank-test";
  last_seen_run: string;
}

export interface Lifecycle {
  schema_version: 1;
  run_id: string;
  computed_at: string;
  /** True once the run has been written to memory: later renders use this file as it is. */
  applied: boolean;
  findings: FindingLife[];
  fixed: FixedSince[];
  /** Open bugs from before that this run did not look at again (neither found nor re-checked). */
  not_rechecked: Array<{ bug: string; title: string; plain_title?: string; status: BugStatus; severity: Severity }>;
  /** Bugs the owner accepted that were seen again; they are listed as known, not as problems. */
  accepted_seen: Array<{ bug: string; title: string; by: string; at: string; note?: string }>;
}

export interface ClassifyFinding extends BugSource {
  id?: string;
  severity: Severity;
  bug?: string;
  bank_tests?: string[];
  memory_applied?: string[];
}

export interface ClassifyInput {
  runId: string;
  findings: ClassifyFinding[];
  rechecks: Recheck[];
  /** Bank tests that ran in this run: which bug each protects, and whether it passed. */
  bank: Array<{ test: string; bug?: string; passed: boolean }>;
  now: Date;
}

const when = (iso: string): string => iso.slice(0, 10);

/** Works out what each finding of a run is, without touching memory. Deterministic: the same findings and memory give the same answer. */
export function classifyRun(bugs: BugRecord[], input: ClassifyInput): Lifecycle {
  const protects = (f: ClassifyFinding): string[] => (f.bank_tests ?? []).map((t) => input.bank.find((b) => b.test === t)?.bug).filter((x): x is string => !!x);
  const findings: FindingLife[] = [];
  const seenBugs = new Set<string>();
  const newByFingerprint = new Map<string, string>();
  let nextNew = bugs.map((b) => b.id);
  const issueOf = (f: ClassifyFinding, i: number): string => f.id ?? `finding-${i + 1}`;

  for (const [i, f] of input.findings.entries()) {
    const m = matchBug(bugs, f, protects(f));
    if (!m.bug) {
      // Two findings of one run with one fingerprint are one bug: the second joins the first.
      const fp = fingerprintOf(f);
      const same = newByFingerprint.get(fp);
      const id = same ?? nextId("BUG", nextNew);
      if (!same) {
        newByFingerprint.set(fp, id);
        nextNew = [...nextNew, id];
      }
      seenBugs.add(id);
      findings.push({
        issue: issueOf(f, i),
        bug: id,
        status: "new",
        times_seen: 1,
        first_seen: input.now.toISOString(),
        ...(m.candidates.length ? { ambiguous: m.candidates.map((c) => ({ bug: c.bug.id, title: c.bug.title, score: c.score })) } : {}),
      });
      continue;
    }
    const b = m.bug;
    seenBugs.add(b.id);
    const status: FindingLifeStatus = b.status === "fixed" ? "regressed" : b.status === "accepted" ? "accepted" : b.status === "not-a-bug" ? "not-a-bug" : "still-open";
    findings.push({
      issue: issueOf(f, i),
      bug: b.id,
      status,
      times_seen: b.last_seen.run === input.runId ? b.times_seen : b.times_seen + 1,
      first_seen: b.first_seen.at,
      ...(status === "regressed" && b.fixed ? { fixed_on: b.fixed.at } : {}),
      ...(m.how ? { how: m.how } : {}),
    });
  }

  const fixed: FixedSince[] = [];
  const notRechecked: Lifecycle["not_rechecked"] = [];
  for (const b of bugs.filter(isOpenBug)) {
    if (seenBugs.has(b.id)) continue;
    const bankPass = input.bank.find((t) => t.bug === b.id && t.passed);
    const recheck = input.rechecks.find((r) => r.bug === b.id && r.result === "passes");
    const stillFailing = input.bank.some((t) => t.bug === b.id && !t.passed);
    if (stillFailing) continue; // its protecting test fails: it is still there, and the lint makes the agent report it
    if (bankPass || recheck) fixed.push({ bug: b.id, title: b.title, ...(b.plain_title ? { plain_title: b.plain_title } : {}), area: b.area, severity: bugEffectiveSeverity(b), how: bankPass ? `The saved check ${bankPass.test} for this problem passes now.` : (recheck as Recheck).how, source: bankPass ? "bank-test" : "recheck", last_seen_run: b.last_seen.run });
    else notRechecked.push({ bug: b.id, title: b.title, ...(b.plain_title ? { plain_title: b.plain_title } : {}), status: b.status, severity: bugEffectiveSeverity(b) });
  }

  const acceptedSeen = findings
    .filter((f) => f.status === "accepted")
    .map((f) => bugs.find((b) => b.id === f.bug))
    .filter((b): b is BugRecord => !!b?.accepted)
    .map((b) => ({ bug: b.id, title: b.title, by: (b.accepted as NonNullable<BugRecord["accepted"]>).by, at: (b.accepted as NonNullable<BugRecord["accepted"]>).at, ...((b.accepted as NonNullable<BugRecord["accepted"]>).note ? { note: (b.accepted as NonNullable<BugRecord["accepted"]>).note as string } : {}) }));

  return { schema_version: 1, run_id: input.runId, computed_at: input.now.toISOString(), applied: false, findings, fixed, not_rechecked: notRechecked, accepted_seen: acceptedSeen };
}

// ------------------------------------------------------------------------------------------------ applying a run to memory

const push = (b: BugRecord, e: BugEvent): void => {
  b.history = [...b.history, e].slice(-MAX_HISTORY);
};

/**
 * Writes the run's lifecycle into `bugs.jsonl`. Safe to call twice for one run: a bug already updated by this run is left as it is.
 * Returns plain lines for "what I learned".
 */
export function applyLifecycle(store: string, life: Lifecycle, findings: ClassifyFinding[], now: Date): string[] {
  const loaded = loadBugs(store);
  const bugs = loaded.bugs;
  const lines: string[] = [];
  let created = 0;
  let still = 0;
  let back = 0;
  const run = life.run_id;

  for (const [i, fl] of life.findings.entries()) {
    const f = findings.find((x) => x.id === fl.issue) ?? findings[i];
    if (!f) continue;
    let b = bugs.find((x) => x.id === fl.bug);
    if (!b) {
      b = {
        id: fl.bug,
        fingerprint: fingerprintOf(f),
        area: f.area,
        type: f.type,
        surface: f.surface ?? "other",
        title: f.title,
        ...(f.plain_title ? { plain_title: f.plain_title } : {}),
        summary: (f.summary ?? "").slice(0, 400),
        severity: f.severity,
        status: "new",
        first_seen: { run, at: now.toISOString() },
        last_seen: { run, at: now.toISOString() },
        times_seen: 1,
        ...(f.steps?.[0] ? { first_step: f.steps[0].slice(0, 200) } : {}),
        ...(f.memory_applied?.length ? { memory_applied: f.memory_applied } : {}),
        history: [{ at: now.toISOString(), run, event: "new" }],
      };
      bugs.push(b);
      created++;
      continue;
    }
    if (b.last_seen.run === run) continue; // this run already wrote it (a second finding of the same bug, or a repeated call)
    if (fl.status === "regressed") {
      b.previously_fixed = b.fixed ?? b.previously_fixed ?? { at: b.last_seen.at, how: "recorded as fixed" };
      delete b.fixed;
      b.status = "regressed";
      push(b, { at: now.toISOString(), run, event: "regressed", note: `It had been fixed on ${when(b.previously_fixed.at)} and was found again.` });
      back++;
    } else if (fl.status === "still-open") {
      b.status = "still-open";
      push(b, { at: now.toISOString(), run, event: "seen" });
      still++;
    } else {
      push(b, { at: now.toISOString(), run, event: "seen", note: fl.status });
    }
    b.times_seen += 1;
    b.last_seen = { run, at: now.toISOString() };
    b.title = f.title;
    if (f.plain_title) b.plain_title = f.plain_title;
    b.summary = (f.summary ?? b.summary).slice(0, 400);
    b.severity = f.severity;
    if (f.steps?.[0]) b.first_step = f.steps[0].slice(0, 200);
    if (f.memory_applied?.length) b.memory_applied = f.memory_applied;
  }

  let fixedNow = 0;
  for (const fx of life.fixed) {
    const b = bugs.find((x) => x.id === fx.bug);
    if (!b || !isOpenBug(b)) continue;
    b.status = "fixed";
    b.fixed = { run, at: now.toISOString(), how: fx.how };
    push(b, { at: now.toISOString(), run, event: "fixed", note: fx.how });
    fixedNow++;
  }

  saveBugs(store, bugs, loaded.unparsed);
  if (created + still + back + fixedNow > 0) lines.push(`Bugs: ${created} new, ${still} still open, ${back} came back, ${fixedNow} fixed since the last check.`);
  return lines;
}

/** Bugs for the agent's context and for reports: open ones first (came back before the rest), then what was recently fixed and what is accepted. */
export function summariseBugs(bugs: BugRecord[]): {
  open: Array<Pick<BugRecord, "id" | "area" | "title" | "times_seen" | "status"> & { severity: Severity; first_seen: string; last_seen: string }>;
  fixed_recently: Array<{ id: string; area: string; title: string; fixed_on: string }>;
  accepted: Array<{ id: string; area: string; title: string; by: string; at: string }>;
  not_a_bug: Array<{ id: string; title: string }>;
} {
  const order: BugStatus[] = ["regressed", "new", "still-open"];
  const sev = (s: Severity) => SEVERITIES.indexOf(s);
  return {
    open: bugs
      .filter(isOpenBug)
      .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || sev(bugEffectiveSeverity(a)) - sev(bugEffectiveSeverity(b)) || b.last_seen.at.localeCompare(a.last_seen.at))
      .slice(0, 25)
      .map((b) => ({ id: b.id, area: b.area, title: b.title, times_seen: b.times_seen, status: b.status, severity: bugEffectiveSeverity(b), first_seen: when(b.first_seen.at), last_seen: when(b.last_seen.at) })),
    fixed_recently: bugs
      .filter((b) => b.status === "fixed" && b.fixed)
      .sort((a, b) => (b.fixed as { at: string }).at.localeCompare((a.fixed as { at: string }).at))
      .slice(0, 10)
      .map((b) => ({ id: b.id, area: b.area, title: b.title, fixed_on: when((b.fixed as { at: string }).at) })),
    accepted: bugs.filter((b) => b.status === "accepted" && b.accepted).slice(0, 15).map((b) => ({ id: b.id, area: b.area, title: b.title, by: (b.accepted as { by: string }).by, at: when((b.accepted as { at: string }).at) })),
    not_a_bug: bugs.filter((b) => b.status === "not-a-bug").slice(0, 15).map((b) => ({ id: b.id, title: b.title })),
  };
}
