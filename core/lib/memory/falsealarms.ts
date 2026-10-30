import { assertSafeText, coverage, memoryPaths, nextId, readJsonl, similarity, tokens, writeJsonl } from "./store.ts";

export type FalseAlarmSource = "owner" | "reproduction" | "spec";

/** Spec 10.1: reported things that were not bugs, confirmed by the owner or by reproduction, so they are not reported again. */
export interface FalseAlarm {
  id: string;
  area: string;
  /** What was seen, in plain words (this is what later findings are matched against). */
  symptom: string;
  /** Why it is not a bug. */
  reason: string;
  source: FalseAlarmSource;
  evidence_run?: string;
  created: string;
  last_seen?: string;
  /** How many later runs skipped it. */
  hits: number;
  [extra: string]: unknown;
}

const SOURCES: FalseAlarmSource[] = ["owner", "reproduction", "spec"];
const one = (s: string) => s.replace(/\s+/g, " ").trim();

export function loadFalseAlarms(store: string, now = new Date()): { alarms: FalseAlarm[]; warnings: string[]; unparsed: string[] } {
  const read = readJsonl<Partial<FalseAlarm>>(memoryPaths(store).falseAlarms);
  const warnings = [...read.warnings];
  const ids = read.records.map((r) => String(r.id ?? "")).filter(Boolean);
  const alarms: FalseAlarm[] = [];
  for (const r of read.records) {
    if (!r.symptom || typeof r.symptom !== "string") {
      warnings.push(`A false alarm without a symptom was ignored${r.id ? ` (${r.id})` : ""}.`);
      continue;
    }
    const id = r.id ? String(r.id) : nextId("FA", ids);
    if (!r.id) ids.push(id);
    alarms.push({ ...r, id, area: String(r.area ?? "general"), symptom: r.symptom, reason: String(r.reason ?? "marked as not a bug"), source: SOURCES.includes(r.source as FalseAlarmSource) ? (r.source as FalseAlarmSource) : "owner", created: String(r.created ?? now.toISOString()), hits: Number(r.hits ?? 0) || 0 });
  }
  return { alarms, warnings, unparsed: read.unparsed };
}

export interface FalseAlarmInput {
  area: string;
  symptom: string;
  reason: string;
  source?: FalseAlarmSource;
  run?: string;
}

export function addFalseAlarm(store: string, input: FalseAlarmInput, opts: { now?: Date; knownSecrets?: string[] } = {}): { action: "created" | "existing"; alarm: FalseAlarm; warnings: string[] } {
  const now = opts.now ?? new Date();
  const symptom = one(input.symptom);
  const reason = one(input.reason);
  const area = one(input.area);
  if (symptom.length < 12 || reason.length < 8 || !area) throw new Error("A false alarm needs an area, a symptom (what was seen) and a reason (why it is not a bug).");
  assertSafeText("this false alarm", `${area} ${symptom} ${reason}`, opts.knownSecrets ?? []);
  const loaded = loadFalseAlarms(store, now);
  const dup = loaded.alarms.find((a) => similarity(a.symptom, symptom) >= 0.7);
  if (dup) return { action: "existing", alarm: dup, warnings: loaded.warnings };
  const alarm: FalseAlarm = {
    id: nextId("FA", loaded.alarms.map((a) => a.id)),
    area,
    symptom,
    reason,
    source: input.source ?? "reproduction",
    ...(input.run ? { evidence_run: input.run } : {}),
    created: now.toISOString(),
    hits: 0,
  };
  writeJsonl(memoryPaths(store).falseAlarms, "false-alarms", [...loaded.alarms, alarm], loaded.unparsed);
  return { action: "created", alarm, warnings: loaded.warnings };
}

export interface MatchableFinding {
  id?: string;
  title: string;
  summary?: string;
  area: string;
  type?: string;
  /** The agent's reason why a finding that resembles a false alarm is genuinely different. */
  not_a_known_false_alarm?: string;
}

export interface FalseAlarmMatch {
  finding: MatchableFinding;
  alarm: FalseAlarm;
  score: number;
}

const MATCH_AT = 0.6;

/** A finding resembles a known false alarm when most of the alarm's words appear in the finding. */
export function matchFalseAlarms(findings: MatchableFinding[], alarms: FalseAlarm[]): FalseAlarmMatch[] {
  const out: FalseAlarmMatch[] = [];
  for (const f of findings) {
    if (f.not_a_known_false_alarm?.trim()) continue;
    const text = [f.title, f.summary, f.area, f.type].filter(Boolean).join(" ");
    for (const a of alarms) {
      if (tokens(a.symptom).length < 3) continue;
      const score = coverage(`${a.symptom}`, text);
      if (score >= MATCH_AT) out.push({ finding: f, alarm: a, score });
    }
  }
  return out;
}

/** Counts a skipped repeat so the owner can see which false alarms still come up. */
export function markFalseAlarmsSeen(store: string, ids: string[], now = new Date()): string[] {
  const loaded = loadFalseAlarms(store, now);
  const touched: string[] = [];
  for (const a of loaded.alarms) {
    if (ids.includes(a.id)) {
      a.hits += 1;
      a.last_seen = now.toISOString();
      touched.push(a.id);
    }
  }
  if (touched.length) writeJsonl(memoryPaths(store).falseAlarms, "false-alarms", loaded.alarms, loaded.unparsed);
  return touched;
}
