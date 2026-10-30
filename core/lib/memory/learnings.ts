import { appendArchive, assertSafeText, daysBetween, memoryPaths, nextId, readJsonl, similarity, writeJsonl } from "./store.ts";

export const LEARNING_TYPES = ["behavior", "pitfall", "test-tip", "fix-pattern", "env-quirk"] as const;
export type LearningType = (typeof LEARNING_TYPES)[number];

/** Spec 10.1. Unknown extra fields (from hand edits) are preserved. */
export interface Learning {
  id: string;
  type: LearningType;
  area: string;
  text: string;
  evidence_run: string;
  confidence: number;
  created: string;
  last_confirmed: string;
  hits: number;
  [extra: string]: unknown;
}

export const LEARNINGS_CAP = 200;
export const ARCHIVE_BELOW = 3;
const MERGE_AT = 0.6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const one = (s: string) => s.replace(/\s+/g, " ").trim();

export interface LoadedLearnings {
  active: Learning[];
  warnings: string[];
  unparsed: string[];
}

/** Reads learnings.jsonl, tolerating hand edits: missing fields get defaults, an unknown type is treated as `behavior` and reported. */
export function loadLearnings(store: string, now = new Date()): LoadedLearnings {
  const read = readJsonl<Partial<Learning>>(memoryPaths(store).learnings);
  const warnings = [...read.warnings];
  const ids: string[] = read.records.map((r) => String(r.id ?? "")).filter(Boolean);
  const active: Learning[] = [];
  for (const r of read.records) {
    if (!r.text || typeof r.text !== "string") {
      warnings.push(`A learning without text was ignored${r.id ? ` (${r.id})` : ""}.`);
      continue;
    }
    const id = r.id ? String(r.id) : nextId("L", ids);
    if (!r.id) ids.push(id);
    let type = r.type as LearningType;
    if (!LEARNING_TYPES.includes(type)) {
      warnings.push(`${id} has an unknown type "${String(r.type)}"; treated as "behavior".`);
      type = "behavior";
    }
    active.push({
      ...r,
      id,
      type,
      area: String(r.area ?? "general"),
      text: r.text,
      evidence_run: String(r.evidence_run ?? "manual"),
      confidence: clamp(Number(r.confidence ?? 5) || 5, 1, 10),
      created: String(r.created ?? now.toISOString()),
      last_confirmed: String(r.last_confirmed ?? r.created ?? now.toISOString()),
      hits: Number(r.hits ?? 0) || 0,
    });
  }
  return { active, warnings, unparsed: read.unparsed };
}

function save(store: string, active: Learning[], unparsed: string[], now: Date): Learning[] {
  let kept = active;
  let archived: Learning[] = [];
  if (active.length > LEARNINGS_CAP) {
    const ranked = [...active].sort((a, b) => learningScore(b, now) - learningScore(a, now));
    kept = ranked.slice(0, LEARNINGS_CAP);
    archived = ranked.slice(LEARNINGS_CAP);
    appendArchive(store, "learnings", archived.map((l) => ({ ...l, archived_at: now.toISOString(), archived_reason: "over the size limit; lowest-scoring learnings are archived" })));
  }
  writeJsonl(memoryPaths(store).learnings, "learnings", kept, unparsed);
  return archived;
}

/** Higher is more worth showing: confidence, decayed by how long ago it was last confirmed, plus a small bonus for being used. */
export function learningScore(l: Learning, now: Date): number {
  return (l.confidence / 10) * Math.pow(0.5, daysBetween(l.last_confirmed, now) / 120) + Math.min(l.hits, 10) * 0.02;
}

export interface LearnInput {
  type: LearningType;
  area: string;
  text: string;
  run: string;
  confidence?: number;
}

export interface LearnResult {
  action: "created" | "merged";
  learning: Learning;
  archived: Learning[];
  warnings: string[];
}

export function learn(store: string, input: LearnInput, opts: { now?: Date; knownSecrets?: string[] } = {}): LearnResult {
  const now = opts.now ?? new Date();
  if (!LEARNING_TYPES.includes(input.type)) throw new Error(`type must be one of ${LEARNING_TYPES.join(", ")}.`);
  const text = one(input.text);
  const area = one(input.area);
  if (text.length < 12 || text.length > 400) throw new Error("A learning is one atomic statement of 12 to 400 characters.");
  if (!area || area.length > 120) throw new Error("A learning needs an area (a short label, up to 120 characters).");
  assertSafeText("this learning", `${area} ${text}`, opts.knownSecrets ?? []);

  const loaded = loadLearnings(store, now);
  const similar = loaded.active
    .filter((l) => l.type === input.type)
    .map((l) => ({ l, s: similarity(l.text, text) }))
    .filter((x) => x.s >= MERGE_AT)
    .sort((a, b) => b.s - a.s)[0];
  if (similar) {
    // Dedupe (spec 10.1): confirm the existing learning instead of storing a near copy.
    similar.l.confidence = clamp(similar.l.confidence + 1, 1, 10);
    similar.l.last_confirmed = now.toISOString();
    const archived = save(store, loaded.active, loaded.unparsed, now);
    return { action: "merged", learning: similar.l, archived, warnings: loaded.warnings };
  }
  const learning: Learning = {
    id: nextId("L", loaded.active.map((l) => l.id)),
    type: input.type,
    area,
    text,
    evidence_run: input.run,
    confidence: clamp(Math.round(input.confidence ?? 5), 1, 10),
    created: now.toISOString(),
    last_confirmed: now.toISOString(),
    hits: 0,
  };
  loaded.active.push(learning);
  const archived = save(store, loaded.active, loaded.unparsed, now);
  return { action: "created", learning, archived, warnings: loaded.warnings };
}

/** Evidence from this run agrees (confirm: +1) or disagrees (contradict: -2; below 3 the learning is archived, not deleted). */
export function adjustLearning(store: string, id: string, direction: "confirm" | "contradict", run: string, now = new Date()): { learning: Learning; archived: boolean } {
  const loaded = loadLearnings(store, now);
  const l = loaded.active.find((x) => x.id === id);
  if (!l) throw new Error(`No active learning ${id}.`);
  if (direction === "confirm") {
    l.confidence = clamp(l.confidence + 1, 1, 10);
    l.last_confirmed = now.toISOString();
    save(store, loaded.active, loaded.unparsed, now);
    return { learning: l, archived: false };
  }
  l.confidence = clamp(l.confidence - 2, 1, 10);
  l.contradicted_in = [...((l["contradicted_in"] as string[] | undefined) ?? []), run];
  if (l.confidence < ARCHIVE_BELOW) {
    appendArchive(store, "learnings", [{ ...l, archived_at: now.toISOString(), archived_reason: `contradicted (run ${run}); confidence fell below ${ARCHIVE_BELOW}` }]);
    save(store, loaded.active.filter((x) => x.id !== id), loaded.unparsed, now);
    return { learning: l, archived: true };
  }
  save(store, loaded.active, loaded.unparsed, now);
  return { learning: l, archived: false };
}

/** The agent says it used these learnings in this run ("Applied learning L-012"): counts a hit and refreshes last_confirmed. */
export function markApplied(store: string, ids: string[], now = new Date()): { applied: Learning[]; unknown: string[] } {
  const loaded = loadLearnings(store, now);
  const applied: Learning[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    const l = loaded.active.find((x) => x.id === id);
    if (!l) unknown.push(id);
    else {
      l.hits += 1;
      applied.push(l);
    }
  }
  if (applied.length) save(store, loaded.active, loaded.unparsed, now);
  return { applied, unknown };
}
