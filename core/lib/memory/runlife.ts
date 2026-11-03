import path from "node:path";
import { linkBankToBugs } from "../bank/bank.ts";
import { bankForLifecycle, readBankResults } from "../bank/results.ts";
import { readJson, writeJson } from "../fsutil.ts";
import type { Finding, Unconfirmed } from "../report.ts";
import { applyLifecycle, classifyRun, isOpenBug, loadBugs, matchBug } from "./bugs.ts";
import type { BugRecord, ClassifyFinding, Lifecycle, Recheck } from "./bugs.ts";

/**
 * The bug lifecycle and the owner's feedback, as they meet a run (spec 13.12 and 13.5):
 *   `report build`  -> `prepareRun` (feedback changes what the run's findings are) and `refreshLifecycle` (what each finding is, saved in the run folder)
 *   `run finish`    -> `applyRunLifecycle` (the same, written to memory) and the saved result is frozen, so the reports rendered afterwards say what the run said.
 */

const file = (runDir: string, name: string): string => path.join(runDir, "data", name);
export const lifecycleFile = (runDir: string): string => file(runDir, "lifecycle.json");
export const readLifecycle = (runDir: string): Lifecycle | undefined => readJson<Lifecycle>(lifecycleFile(runDir));
export const readRechecks = (runDir: string): Recheck[] => {
  const v = readJson<unknown>(file(runDir, "rechecks.json"));
  return Array.isArray(v) ? (v as Recheck[]) : [];
};
export const readKnownAccepted = (runDir: string): Finding[] => {
  const v = readJson<unknown>(file(runDir, "known-accepted.json"));
  return Array.isArray(v) ? (v as Finding[]) : [];
};

/** The counts a run summary keeps: how many findings were new, still open, came back, were accepted, how many bugs were fixed since the last run, and how many were not looked at again. */
export interface LifecycleCounts {
  new: number;
  still_open: number;
  regressed: number;
  accepted: number;
  fixed: number;
  not_rechecked: number;
}

export function lifecycleCounts(l: Lifecycle): LifecycleCounts {
  const n = (s: string): number => l.findings.filter((f) => f.status === s).length;
  return { new: n("new"), still_open: n("still-open"), regressed: n("regressed"), accepted: n("accepted"), fixed: l.fixed.length, not_rechecked: l.not_rechecked.length };
}

const asClassify = (f: Finding): ClassifyFinding => ({
  ...(f.id ? { id: f.id } : {}),
  area: f.area,
  type: f.type,
  title: f.title,
  ...(f.plain?.title?.trim() ? { plain_title: f.plain.title.trim() } : {}),
  summary: f.summary,
  steps: f.steps,
  surface: f.surface,
  severity: f.severity,
  ...(f.bug ? { bug: f.bug } : {}),
  ...(f.bank_tests?.length ? { bank_tests: f.bank_tests } : {}),
  ...(f.memory_applied?.length ? { memory_applied: f.memory_applied } : {}),
});

const protectsOf = (runDir: string): Map<string, string> => new Map(bankForLifecycle(readBankResults(runDir)).filter((t) => t.bug).map((t) => [t.test, t.bug as string]));

/** The bugs a failing bank test is tied to, for the findings that list it. */
const protectedBy = (f: Finding, map: Map<string, string>): string[] => (f.bank_tests ?? []).map((t) => map.get(t)).filter((x): x is string => !!x);

export interface Prepared {
  /** Plain lines about what feedback changed in this run's findings (shown in the technical report). */
  notes: string[];
}

/**
 * Applies what people said to this run's findings, before anything is counted:
 * a finding that matches a bug the owner accepted moves to `known-accepted.json` ("Known, accepted"), and one that matches a bug whose severity the owner set
 * shows that severity (what the run assessed is kept in `severity_assessed`). Idempotent: running it again changes nothing.
 */
export function prepareRun(store: string, runDir: string): Prepared {
  const notes: string[] = [];
  const findingsFile = file(runDir, "findings.json");
  const raw = readJson<unknown>(findingsFile);
  if (!Array.isArray(raw)) return { notes };
  const findings = raw as Finding[];
  const bugs = loadBugs(store).bugs;
  const protects = protectsOf(runDir);
  const keep: Finding[] = [];
  const moved: Finding[] = readKnownAccepted(runDir);
  let changed = false;
  for (const f of findings) {
    const m = matchBug(bugs, asClassify(f), protectedBy(f, protects));
    const b = m.bug;
    if (b && b.status === "accepted" && b.accepted) {
      moved.push({ ...f, bug: b.id });
      notes.push(`${f.id ?? f.title} is a known, accepted problem (${b.id}; ${b.accepted.by} on ${b.accepted.at.slice(0, 10)}): listed under "Known, accepted", not counted.`);
      changed = true;
      continue;
    }
    if (b?.severity_override && f.severity !== b.severity_override.level) {
      keep.push({ ...f, severity_assessed: f.severity_assessed ?? f.severity, severity: b.severity_override.level, severity_note: `Set to ${b.severity_override.level} by ${b.severity_override.by} on ${b.severity_override.at.slice(0, 10)}; this run assessed it as ${f.severity_assessed ?? f.severity}.` });
      notes.push(`${f.id ?? f.title}: shown as ${b.severity_override.level}, as ${b.severity_override.by} set it (the run assessed ${f.severity_assessed ?? f.severity}).`);
      changed = true;
      continue;
    }
    keep.push(f);
  }
  if (changed) {
    writeJson(findingsFile, keep);
    writeJson(file(runDir, "known-accepted.json"), dedupeById(moved));
  }
  return { notes };
}

/**
 * One entry per accepted problem. The agent rewrites findings.json (after a lint error, say) and the same finding comes back to be moved again, with or without the id it had: the key is the bug and the title, and the entry that has an id wins.
 */
const dedupeById = (list: Finding[]): Finding[] => {
  const byKey = new Map<string, Finding>();
  for (const f of list) {
    const key = `${f.bug ?? ""}|${f.title.trim().toLowerCase()}`;
    const have = byKey.get(key);
    if (!have || (!have.id && f.id)) byKey.set(key, f);
  }
  return [...byKey.values()];
};

function compute(store: string, runDir: string, runId: string, now: Date): { life: Lifecycle; findings: Finding[] } {
  // The accepted ones left findings.json (they are not problems), but the run did see them again: the bug counts it, and the report says who accepted it.
  const findings = [...(readJson<Finding[]>(file(runDir, "findings.json")) ?? []), ...readKnownAccepted(runDir)].filter((f) => !!f && typeof f === "object");
  const bank = bankForLifecycle(readBankResults(runDir));
  const life = classifyRun(loadBugs(store).bugs, { runId, findings: findings.map(asClassify), rechecks: readRechecks(runDir), bank, now });
  return { life, findings };
}

/** Works out and saves what each finding is. Does nothing once the run has been written to memory (the saved result stands). */
export function refreshLifecycle(store: string, runDir: string, runId: string, now = new Date()): Lifecycle {
  const saved = readLifecycle(runDir);
  if (saved?.applied) return saved;
  prepareRun(store, runDir);
  const { life } = compute(store, runDir, runId, now);
  writeJson(lifecycleFile(runDir), life);
  return life;
}

/** At `run finish`: classify once more from the final files, write the bugs to memory and freeze the result. Returns plain lines for "what I learned". */
export function applyRunLifecycle(store: string, runDir: string, runId: string, now: Date): { lines: string[]; lifecycle: Lifecycle } {
  const saved = readLifecycle(runDir);
  if (saved?.applied) return { lines: [], lifecycle: saved };
  prepareRun(store, runDir);
  const { life, findings } = compute(store, runDir, runId, now);
  const lines = applyLifecycle(store, life, findings.map(asClassify), now);
  // Tests saved from this run's findings now know which bug they protect.
  const linked = linkBankToBugs(store, runId, new Map(life.findings.map((l) => [l.issue, l.bug])));
  if (linked.length) lines.push(`Test bank: ${linked.join("; ")}.`);
  const frozen: Lifecycle = { ...life, applied: true };
  writeJson(lifecycleFile(runDir), frozen);
  return { lines, lifecycle: frozen };
}

// ------------------------------------------------------------------------------------------------ lint

/** What `report lint` says about bugs, re-checks and the test bank's failures. Errors stop the run from being called done; warnings are for the agent to read. */
export function lintLifecycle(store: string, runDir: string, findings: Finding[], unconfirmed: Unconfirmed[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bugs = loadBugs(store).bugs;
  const byId = new Map<string, BugRecord>(bugs.map((b) => [b.id, b]));
  const results = readBankResults(runDir);
  const protects = protectsOf(runDir);
  const ids = new Set((results?.results ?? []).map((r) => r.test));
  const tag = (f: Finding, i: number): string => f.id ?? `findings[${i}]`;

  for (const [i, f] of findings.entries()) {
    if (f.bug && f.bug !== "new" && !byId.has(f.bug)) errors.push(`${tag(f, i)}: bug "${f.bug}" does not exist in this project's memory. Use an id from the memory context, or "new" if this is none of the known bugs.`);
    for (const t of f.bank_tests ?? []) if (!ids.has(t)) errors.push(`${tag(f, i)}: bank_tests names ${t}, which did not run in this run (see data/bank-results.json).`);
    const m = matchBug(bugs, asClassify(f), protectedBy(f, protects));
    if (!f.bug && !m.bug && m.candidates.length) {
      const c = m.candidates[0] as NonNullable<typeof m.candidates[number]>;
      errors.push(`${tag(f, i)} resembles the known bug ${c.bug.id} ("${c.bug.title}", ${c.bug.status}, last seen ${c.bug.last_seen.at.slice(0, 10)}). Only you can tell if it is the same problem: set "bug": "${c.bug.id}" if it is, or "bug": "new" if it is a different one.`);
    }
    if (m.bug?.status === "not-a-bug" && m.bug.not_a_bug) errors.push(`${tag(f, i)} is ${m.bug.id}, which ${m.bug.not_a_bug.by} marked as not a bug on ${m.bug.not_a_bug.at.slice(0, 10)}${m.bug.not_a_bug.note ? ` ("${m.bug.not_a_bug.note}")` : ""}. Do not report it again.`);
  }

  const accounted = new Set([...findings, ...readKnownAccepted(runDir), ...unconfirmed].flatMap((x) => x.bank_tests ?? []));
  for (const r of results?.results ?? []) {
    // A test for a bug the owner decided to live with (or called not a bug) is expected to fail: it is shown in the report's test bank table, and the owner can retire it. It does not stop the run.
    const owned = r.bug ? byId.get(r.bug) : undefined;
    if (r.status === "failed" && owned && (owned.status === "accepted" || owned.status === "not-a-bug")) continue;
    if (r.status === "failed" && !accounted.has(r.test)) {
      errors.push(`Bank test ${r.test} ("${r.title}") failed twice and nothing in this run accounts for it${r.detail ? ` (${r.detail})` : ""}. Reproduce it and report it as a finding (set "bank_tests": ["${r.test}"]), or list it under Unconfirmed with the same field. If the test itself is out of date, retire it: \`qamind tests retire ${r.test} --reason "..."\`.`);
    }
  }

  const foundNow = new Set(findings.map((f, i) => matchBug(bugs, asClassify(f), protectedBy(f, protects)).bug?.id ?? (f.bug && byId.has(f.bug) ? f.bug : `?${i}`)));
  for (const [i, r] of readRechecks(runDir).entries()) {
    const b = byId.get(r.bug);
    if (!b) errors.push(`rechecks[${i}]: ${r.bug} does not exist in this project's memory.`);
    else if (!isOpenBug(b)) warnings.push(`rechecks[${i}]: ${r.bug} is ${b.status}, not open, so there is nothing to mark fixed.`);
    else if (foundNow.has(b.id)) errors.push(`rechecks[${i}]: ${r.bug} is listed as fixed but this run also reports it as a finding. It is one or the other.`);
    if (typeof r.how !== "string" || r.how.trim().length < 12) errors.push(`rechecks[${i}]: say what you repeated and what you saw ("how", at least a sentence), so a person can trust "fixed".`);
    if (r.result !== "passes") errors.push(`rechecks[${i}]: "result" must be "passes". A bug that still fails is a finding, not a re-check.`);
  }

  const lifeBank = bankForLifecycle(results);
  const stale = bugs.filter((b) => isOpenBug(b) && !foundNow.has(b.id) && !readRechecks(runDir).some((r) => r.bug === b.id) && !lifeBank.some((t) => t.bug === b.id));
  if (stale.length) warnings.push(`${stale.length} open bug(s) from earlier runs were neither found nor re-checked in this run (${stale.slice(0, 5).map((b) => b.id).join(", ")}${stale.length > 5 ? ", ..." : ""}); the reports list them as "not re-checked". If you did repeat one and it passes, record it in data/rechecks.json.`);
  return { errors, warnings };
}

