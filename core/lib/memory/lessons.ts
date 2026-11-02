import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "../fsutil.ts";
import { withStoreLock } from "./lock.ts";
import { assertSafeText, nextId, similarity } from "./store.ts";

/**
 * Global lessons (spec 10.3): at the end of a run the agent may propose lessons that would help on ANY project. They go to
 * `<home>/pending-lessons.md` with the reason and are not used by anything until the owner approves one (moves it to
 * `global-lessons.md`, which later phases read). A lesson that names a project, a URL, a file, a ticket or code is refused.
 */
export const PENDING_FILE = "pending-lessons.md";
export const APPROVED_FILE = "global-lessons.md";
export const MAX_PENDING = 100;
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
  action: "proposed" | "existing";
  id: string;
  file: string;
  pending: number;
  /** For "existing": which lesson it matched. */
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

interface Entry {
  id: string;
  text: string;
}

function readEntries(file: string): Entry[] {
  if (!fs.existsSync(file)) return [];
  const out: Entry[] = [];
  let id = "";
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const h = /^##\s+([A-Z]-\d+)\b/.exec(line);
    if (h) id = h[1] as string;
    const t = /^-\s+\*\*Lesson:\*\*\s*(.+)$/.exec(line) ?? (id ? null : /^-\s+(.{20,})$/.exec(line));
    if (t) out.push({ id: id || "approved", text: (t[1] as string).trim() });
  }
  return out;
}

const header = `# Pending lessons

Lessons QAMind proposes for any project. **Nothing here is used until you approve it**: move an entry to \`${APPROVED_FILE}\` (or ask for a memory review), or delete it.
Each one is generic by rule: no project names, web addresses, files, tickets or code.
`;

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
    const pending = readEntries(pendingFile);
    const known = [...pending, ...readEntries(path.join(home, APPROVED_FILE))];
    const dup = known.map((e) => ({ e, s: similarity(e.text, text) })).filter((x) => x.s >= MERGE_AT).sort((a, b) => b.s - a.s)[0];
    if (dup) return { action: "existing", id: dup.e.id, file: pendingFile, pending: pending.length, matches: dup.e.text };
    if (pending.length >= MAX_PENDING) throw new Error(`There are already ${MAX_PENDING} pending lessons. Ask the user to review them (approve or delete) before proposing more.`);
    const id = nextId("P", pending.map((e) => e.id));
    const date = (ctx.now ?? new Date()).toISOString().slice(0, 10);
    const entry = [`## ${id} · ${date}${area ? ` · ${area}` : ""}`, `- **Lesson:** ${text}`, `- **Why:** ${reason}`, ""].join("\n");
    const body = fs.existsSync(pendingFile) ? fs.readFileSync(pendingFile, "utf8").replace(/\s*$/, "\n\n") : `${header}\n`;
    const tmp = `${pendingFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${body}${entry}`, "utf8");
    fs.renameSync(tmp, pendingFile);
    return { action: "proposed", id, file: pendingFile, pending: pending.length + 1 };
  });
}

export function listPendingLessons(home: string): Entry[] {
  return readEntries(path.join(home, PENDING_FILE));
}
