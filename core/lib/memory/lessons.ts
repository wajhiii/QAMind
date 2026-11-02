import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, writeJson } from "../fsutil.ts";
import { listKnownProjects } from "../project.ts";
import { withStoreLock } from "./lock.ts";
import { assertSafeText, nextId, readJsonl, screenForSecretsAndPii, similarity, writeJsonl } from "./store.ts";

/**
 * Global lessons (spec 10.3). At the end of a run the agent may propose lessons that would help on ANY project. They wait in
 * `<home>/pending-lessons.md` with the reason and are used by nothing until the owner approves one, which moves it to
 * `<home>/global-lessons.md`, the only file every project reads. A lesson that names a project, a URL, a file, a ticket or code is
 * refused when it is proposed, again when it is approved (against every project QAMind knows) and once more every time it is loaded,
 * because the owner may also edit these files by hand. Rejected and retired lessons are remembered, so they are not proposed again.
 */
export const PENDING_FILE = "pending-lessons.md";
export const APPROVED_FILE = "global-lessons.md";
export const REJECTED_FILE = "rejected-lessons.jsonl";
export const USE_FILE = "lesson-use.json";
export const MAX_PENDING = 100;
/** The most approved lessons one run is shown. The best-used and newest come first. */
export const MAX_LOADED = 25;
const MERGE_AT = 0.6;

export interface LessonInput {
  text: string;
  reason: string;
  area?: string;
}

export interface LessonContext {
  /** Names that identify this project (its folder, repository, web UIs). A generic lesson cannot contain them. */
  projectNames?: string[];
  knownSecrets?: string[];
  run?: string;
  now?: Date;
}

export interface ProposeResult {
  /** `existing`: a near copy is already pending or approved. `rejected-before`: the owner already turned a near copy down: do not propose it again. */
  action: "proposed" | "existing" | "rejected-before";
  id: string;
  file: string;
  pending: number;
  /** For "existing" and "rejected-before": which lesson it matched. */
  matches?: string;
}

const one = (s: string): string => s.replace(/\s+/g, " ").trim();

const NOT_GENERIC: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/, "an email address"],
  [/https?:\/\/|\bwww\./i, "a web address"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b|\blocalhost\b|\b[\w-]+\.(?:com|org|net|io|dev|app|test|local|internal|co|ai)\b/i, "a host name or IP address"],
  [/(?:^|[\s(])[\w.-]*\/[\w.-]+\/[\w./-]+|\b[\w-]+\.(?:js|mjs|ts|tsx|py|php|rb|java|cs|json|ya?ml|html|css|sql|md)\b/i, "a file path or file name"],
  [/`|=>|\{[^}]*:|\b\w+\([^)]*\)\s*[;{]|<\/?\w+[^>]*>/, "code"],
  [/\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/, "a ticket or issue id"],
  [/\b(?:ISSUE|RUN|run)-\d+|\brun-\d{8}T/i, "a QAMind run or issue id"],
];

/** Everything wrong with a proposed lesson, so the agent can rewrite it in one go. */
export function genericProblems(text: string, ctx: LessonContext = {}): string[] {
  const problems: string[] = [];
  for (const [re, what] of NOT_GENERIC) if (re.test(text)) problems.push(`mentions ${what}`);
  const lower = text.toLowerCase();
  for (const name of ctx.projectNames ?? []) {
    const n = name.trim().toLowerCase();
    if (n.length >= 4 && new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(lower)) problems.push(`names this project ("${name.trim()}")`);
  }
  return [...new Set(problems)];
}

/** The names of every project QAMind has seen on this machine (and the folders they live in): a lesson for all projects cannot name any of them. */
export function knownProjectNames(home: string, extra: string[] = []): string[] {
  const names = new Set<string>(extra);
  for (const p of listKnownProjects(home)) {
    names.add(p.name);
    for (const seen of p.paths_seen) names.add(path.basename(seen));
  }
  return [...names].filter((n) => n.trim().length > 0);
}

// ------------------------------------------------------------------------------------------------ the two Markdown files

export interface LessonEntry {
  /** `P-001` (pending), `G-001` (approved), or `H-xxxxxx` for a line the owner wrote by hand. */
  id: string;
  text: string;
  reason?: string;
  area?: string;
  /** The date in the entry's header, when there is one. */
  date?: string;
  /** Written or moved by hand rather than by QAMind. */
  hand?: boolean;
}

interface Block extends LessonEntry {
  /** The exact lines of the block, so a rewrite keeps everything the owner wrote. */
  lines: string[];
}

interface Parsed {
  preamble: string[];
  blocks: Block[];
}

const hashId = (text: string): string => `H-${crypto.createHash("sha1").update(one(text).toLowerCase()).digest("hex").slice(0, 6)}`;
const HEADER = /^##\s+(.*)$/;
const LESSON_LINE = /^-\s+\*\*Lesson:\*\*\s*(.+)$/;
const WHY_LINE = /^-\s+\*\*Why:\*\*\s*(.+)$/;
const PLAIN_BULLET = /^-\s+(?!\*\*)(.{20,})$/;

/** Reads one of the lesson files, tolerating hand edits: entries QAMind wrote, `## id` blocks the owner moved, and plain bullet lines. */
export function parseLessons(text: string): Parsed {
  const preamble: string[] = [];
  const blocks: Block[] = [];
  let cur: Block | undefined;
  let prevBlank = false;
  const flush = (): void => {
    if (!cur) return;
    while (cur.lines.length > 1 && (cur.lines[cur.lines.length - 1] ?? "").trim() === "") cur.lines.pop();
    // A heading the owner wrote that holds no lesson is kept as it is, so a rewrite never loses their notes.
    if (cur.text) blocks.push(cur);
    else preamble.push(...cur.lines);
    cur = undefined;
  };
  for (const line of text.split(/\r?\n/)) {
    const h = HEADER.exec(line);
    if (h) {
      flush();
      const parts = (h[1] as string).split("·").map((s) => s.trim());
      const id = /^[A-Za-z]+-\d+$/.test(parts[0] ?? "") ? (parts[0] as string) : "";
      cur = { id, text: "", lines: [line], ...(parts[1] ? { date: parts[1] } : {}), ...(parts[2] ? { area: parts[2] } : {}) };
      if (!id) cur.hand = true;
      continue;
    }
    // A plain bullet the owner adds after a blank line is a lesson of its own, not a note inside the block above it.
    const lonely = cur && cur.text !== "" && prevBlank ? PLAIN_BULLET.exec(line) : null;
    if (lonely) {
      flush();
      const t = (lonely[1] as string).trim();
      blocks.push({ id: hashId(t), text: t, hand: true, lines: [line] });
      prevBlank = false;
      continue;
    }
    prevBlank = line.trim() === "";
    if (cur) {
      cur.lines.push(line);
      const l = LESSON_LINE.exec(line) ?? (cur.text ? null : PLAIN_BULLET.exec(line));
      if (l && !cur.text) cur.text = (l[1] as string).trim();
      const w = WHY_LINE.exec(line);
      if (w) cur.reason = (w[1] as string).trim();
      continue;
    }
    const lone = LESSON_LINE.exec(line) ?? PLAIN_BULLET.exec(line);
    if (lone) {
      const t = (lone[1] as string).trim();
      blocks.push({ id: hashId(t), text: t, hand: true, lines: [line] });
    } else preamble.push(line);
  }
  flush();
  for (const b of blocks) if (!b.id) b.id = hashId(b.text);
  return { preamble, blocks };
}

const readFile = (file: string): Parsed => parseLessons(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");

const entryOf = ({ lines: _l, ...e }: Block): LessonEntry => e;

function writeText(file: string, text: string): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

const render = (p: Parsed, extra: string[] = []): string => {
  const body = [...p.preamble.join("\n").replace(/\s*$/, "").split("\n"), "", ...p.blocks.flatMap((b) => [...b.lines, ""]), ...extra].join("\n");
  return `${body.replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "")}\n`;
};

const pendingHeader = `# Pending lessons

Lessons QAMind proposes for any project. **Nothing here is used until you approve it**: ask for a memory review (\`/qa-memory-review lessons\`), or move an entry to \`${APPROVED_FILE}\` yourself, or delete it.
Each one is generic by rule: no project names, web addresses, files, tickets or code.`;

const approvedHeader = `# Global lessons

Lessons you approved. **Every QAMind project reads this file** (the newest ${MAX_LOADED} at most, best-used first), so each entry must help on any project: no project names, web addresses, files, tickets or code.
An entry that breaks that rule is not loaded, and the review says why. You can add, edit or delete entries by hand.`;

interface RejectedRecord {
  id: string;
  text: string;
  reason?: string;
  was: "pending" | "approved";
  rejected_at: string;
}

const rejectedRecords = (home: string): RejectedRecord[] => readJsonl<RejectedRecord>(path.join(home, REJECTED_FILE)).records.filter((r) => typeof r.text === "string");

function appendRejected(home: string, rec: RejectedRecord): void {
  const file = path.join(home, REJECTED_FILE);
  const prior = readJsonl<RejectedRecord>(file);
  writeJsonl(file, "rejected-lessons", [...prior.records, rec], prior.unparsed);
}

/** Every id ever handed out, so a new one is never a reused one: pending, approved (and the pending id an approved lesson came from), and rejected. */
const allIds = (home: string): string[] => {
  const approved = readFile(path.join(home, APPROVED_FILE)).blocks;
  const origins = approved.flatMap((b) => b.lines.flatMap((l) => [...l.matchAll(/\(was ([A-Z]-\d+)\)/g)].map((m) => m[1] as string)));
  return [...readFile(path.join(home, PENDING_FILE)).blocks, ...approved].map((b) => b.id).concat(origins, rejectedRecords(home).map((r) => r.id));
};

// ------------------------------------------------------------------------------------------------ propose

/** Appends one lesson to the pending file. Refuses anything that is not generic, safe and new. */
export function proposeLesson(home: string, input: LessonInput, ctx: LessonContext = {}): ProposeResult {
  const text = one(input.text);
  const reason = one(input.reason);
  const area = input.area ? one(input.area) : "";
  if (text.length < 20 || text.length > 280) throw new Error("A lesson is one generic statement of 20 to 280 characters.");
  if (reason.length < 10 || reason.length > 280) throw new Error("Say why in 10 to 280 characters: what you saw that makes this true on any project.");
  if (area.length > 60) throw new Error("The area is a short label (up to 60 characters).");
  const problems = [...genericProblems(`${text} ${reason} ${area}`, ctx)];
  if (problems.length) throw new Error(`This lesson is not generic: it ${problems.join("; ")}. A global lesson must help on any project, so rewrite it without those (describe the kind of problem, not this product).`);
  assertSafeText("this lesson", `${area} ${text} ${reason}`, ctx.knownSecrets ?? []);

  ensureDir(home);
  const pendingFile = path.join(home, PENDING_FILE);
  return withStoreLock(home, () => {
    const pending = readFile(pendingFile);
    const known = [...pending.blocks, ...readFile(path.join(home, APPROVED_FILE)).blocks];
    const dup = known.map((e) => ({ e, s: similarity(e.text, text) })).filter((x) => x.s >= MERGE_AT).sort((a, b) => b.s - a.s)[0];
    if (dup) return { action: "existing", id: dup.e.id, file: pendingFile, pending: pending.blocks.length, matches: dup.e.text };
    const turned = rejectedRecords(home).map((r) => ({ r, s: similarity(r.text, text) })).filter((x) => x.s >= MERGE_AT).sort((a, b) => b.s - a.s)[0];
    if (turned) return { action: "rejected-before", id: turned.r.id, file: pendingFile, pending: pending.blocks.length, matches: turned.r.text };
    if (pending.blocks.length >= MAX_PENDING) throw new Error(`There are already ${MAX_PENDING} pending lessons. Ask the user to review them (approve or delete) before proposing more.`);
    const id = nextId("P", allIds(home));
    const date = (ctx.now ?? new Date()).toISOString().slice(0, 10);
    const entry = [`## ${id} · ${date}${area ? ` · ${area}` : ""}`, `- **Lesson:** ${text}`, `- **Why:** ${reason}`];
    pending.blocks.push({ id, text, reason, date, ...(area ? { area } : {}), lines: entry });
    if (pending.preamble.join("").trim() === "") pending.preamble = pendingHeader.split("\n");
    writeText(pendingFile, render(pending));
    return { action: "proposed", id, file: pendingFile, pending: pending.blocks.length };
  });
}

export function listPendingLessons(home: string): LessonEntry[] {
  return readFile(path.join(home, PENDING_FILE)).blocks.map(entryOf);
}

// ------------------------------------------------------------------------------------------------ the owner's decisions

export interface ApproveOptions {
  /** The owner's rewording (the lesson is checked again as written). */
  text?: string;
  now?: Date;
}

export interface Decision {
  action: "approved" | "rejected";
  id: string;
  /** The id the lesson has now (`G-001` once approved). */
  new_id?: string;
  text: string;
  file: string;
}

/**
 * Approve a pending lesson: it is checked again (it must be generic against EVERY project known on this machine, safe and not already approved)
 * and then moved to the approved file, which every project reads. Only the owner does this; the qa-memory server has no tool for it.
 */
export function approveLesson(home: string, id: string, opts: ApproveOptions = {}): Decision {
  const pendingFile = path.join(home, PENDING_FILE);
  const approvedFile = path.join(home, APPROVED_FILE);
  return withStoreLock(home, () => {
    const pending = readFile(pendingFile);
    const at = pending.blocks.findIndex((b) => b.id === id);
    if (at < 0) throw new Error(`No pending lesson ${id}.${pending.blocks.length ? ` Pending: ${pending.blocks.map((b) => b.id).join(", ")}.` : " Nothing is pending."}`);
    const block = pending.blocks[at] as Block;
    const text = one(opts.text ?? block.text);
    if (text.length < 20 || text.length > 280) throw new Error("A lesson is one generic statement of 20 to 280 characters.");
    const problems = [...genericProblems(`${text} ${block.reason ?? ""} ${block.area ?? ""}`, { projectNames: knownProjectNames(home) }), ...screenForSecretsAndPii(text).map((p) => p)];
    if (problems.length) throw new Error(`${id} cannot be approved as written: it ${[...new Set(problems)].join("; ")}. Every project reads approved lessons, so reword it (describe the kind of problem, not this product) and approve it again with the new text.`);
    const approved = readFile(approvedFile);
    const dup = approved.blocks.map((b) => ({ b, s: similarity(b.text, text) })).filter((x) => x.s >= MERGE_AT).sort((a, b) => b.s - a.s)[0];
    if (dup) throw new Error(`${id} is a near copy of the approved lesson ${dup.b.id} ("${dup.b.text}"). Reject ${id} instead of approving it twice.`);

    const newId = nextId("G", allIds(home));
    const date = (opts.now ?? new Date()).toISOString().slice(0, 10);
    const lines = [`## ${newId} · ${date}${block.area ? ` · ${block.area}` : ""}`, `- **Lesson:** ${text}`, ...(block.reason ? [`- **Why:** ${block.reason}`] : []), `- **Approved:** ${date} (was ${id})`];
    approved.blocks.push({ id: newId, text, ...(block.reason ? { reason: block.reason } : {}), date, ...(block.area ? { area: block.area } : {}), lines });
    if (approved.preamble.join("").trim() === "") approved.preamble = approvedHeader.split("\n");
    writeText(approvedFile, render(approved));
    pending.blocks.splice(at, 1);
    writeText(pendingFile, render(pending));
    return { action: "approved", id, new_id: newId, text, file: approvedFile };
  });
}

/** Turn a pending lesson down, or retire an approved one. It is remembered, so a near copy is not proposed again. */
export function rejectLesson(home: string, id: string, reason?: string, now = new Date()): Decision {
  const pendingFile = path.join(home, PENDING_FILE);
  const approvedFile = path.join(home, APPROVED_FILE);
  return withStoreLock(home, () => {
    for (const [file, was] of [[pendingFile, "pending"], [approvedFile, "approved"]] as const) {
      const parsed = readFile(file);
      const at = parsed.blocks.findIndex((b) => b.id === id);
      if (at < 0) continue;
      const block = parsed.blocks[at] as Block;
      const why = reason ? one(reason).slice(0, 280) : undefined;
      parsed.blocks.splice(at, 1);
      writeText(file, render(parsed));
      appendRejected(home, { id, text: block.text, ...(why ? { reason: why } : {}), was, rejected_at: now.toISOString() });
      return { action: "rejected", id, text: block.text, file };
    }
    throw new Error(`No pending or approved lesson ${id}. Use \`qamind lessons list\` to see the ids.`);
  });
}

// ------------------------------------------------------------------------------------------------ what every project reads

export interface LoadedLessons {
  lessons: Array<{ id: string; text: string; area?: string }>;
  /** Approved entries that were NOT loaded, with why (not generic, unsafe, too long): the review shows them to the owner. */
  skipped: Array<{ id: string; text: string; problems: string[] }>;
  total_approved: number;
  truncated: boolean;
}

interface UseFile {
  [id: string]: { hits: number; last_applied: string } | undefined;
}

export const readLessonUse = (home: string): UseFile => {
  try {
    const v = readJson<UseFile>(path.join(home, USE_FILE));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

/**
 * The lessons a run is given: ONLY entries in the approved file, each checked again as it is read (a hand edit can add anything), the best-used
 * first, at most MAX_LOADED. The pending file is never read here.
 */
export function loadApprovedLessons(home: string, ctx: { projectNames?: string[] } = {}): LoadedLessons {
  const entries = readFile(path.join(home, APPROVED_FILE)).blocks;
  const use = readLessonUse(home);
  const ok: Block[] = [];
  const skipped: LoadedLessons["skipped"] = [];
  for (const b of entries) {
    const problems = [...genericProblems(`${b.text} ${b.area ?? ""}`, { projectNames: ctx.projectNames ?? [] }), ...screenForSecretsAndPii(b.text)];
    if (b.text.length < 20) problems.push("is shorter than 20 characters");
    if (b.text.length > 280) problems.push("is longer than 280 characters");
    if (problems.length) skipped.push({ id: b.id, text: b.text.slice(0, 120), problems: [...new Set(problems)] });
    else ok.push(b);
  }
  const ranked = ok
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (use[y.b.id]?.hits ?? 0) - (use[x.b.id]?.hits ?? 0) || (y.b.date ?? "").localeCompare(x.b.date ?? "") || y.i - x.i)
    .map((x) => x.b);
  return {
    lessons: ranked.slice(0, MAX_LOADED).map((b) => ({ id: b.id, text: b.text, ...(b.area ? { area: b.area } : {}) })),
    skipped,
    total_approved: entries.length,
    truncated: ranked.length > MAX_LOADED,
  };
}

/** The agent used these approved lessons in a run. Only ids that exist in the approved file count; returns the ones that did not. */
export function recordLessonUse(home: string, ids: string[], now = new Date()): { recorded: string[]; unknown: string[] } {
  const approved = new Set(readFile(path.join(home, APPROVED_FILE)).blocks.map((b) => b.id));
  const unique = [...new Set(ids)];
  const recorded = unique.filter((i) => approved.has(i));
  const unknown = unique.filter((i) => !approved.has(i));
  if (recorded.length) {
    ensureDir(home);
    withStoreLock(home, () => {
      const use = readLessonUse(home);
      for (const id of recorded) use[id] = { hits: (use[id]?.hits ?? 0) + 1, last_applied: now.toISOString() };
      writeJson(path.join(home, USE_FILE), use);
    });
  }
  return { recorded, unknown };
}

export interface LessonOverview {
  pending: LessonEntry[];
  approved: Array<LessonEntry & { hits: number; last_applied?: string; loaded: boolean; not_loaded_because?: string[] }>;
  rejected: Array<{ id: string; text: string; reason?: string; was: string; rejected_at: string }>;
  limits: { max_pending: number; max_loaded: number };
}

/** Everything the owner reviews, in one answer. `projectNames` makes the "would this be loaded here" answer exact for the current project. */
export function lessonOverview(home: string, ctx: { projectNames?: string[] } = {}): LessonOverview {
  const loaded = loadApprovedLessons(home, ctx);
  const use = readLessonUse(home);
  const skipped = new Map(loaded.skipped.map((s) => [s.id, s.problems]));
  return {
    pending: listPendingLessons(home),
    approved: readFile(path.join(home, APPROVED_FILE)).blocks.map((b) => ({ ...entryOf(b), hits: use[b.id]?.hits ?? 0, ...(use[b.id]?.last_applied ? { last_applied: use[b.id]?.last_applied as string } : {}), loaded: !skipped.has(b.id) && loaded.lessons.some((l) => l.id === b.id), ...(skipped.has(b.id) ? { not_loaded_because: skipped.get(b.id) as string[] } : {}) })),
    rejected: rejectedRecords(home).map((r) => ({ id: r.id, text: r.text, ...(r.reason ? { reason: r.reason } : {}), was: r.was, rejected_at: r.rejected_at })),
    limits: { max_pending: MAX_PENDING, max_loaded: MAX_LOADED },
  };
}
