import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Op, OpKind } from "../../../hosts/host-api.ts";

/**
 * Applies, verifies and reverses the edits a host adapter plans (spec 5.1: never edit a host's files it did not create, back up before overwriting, idempotent,
 * uninstall leaves nothing behind). Every edit is recorded in a manifest entry that holds exactly what is needed to undo it: whether the file was created
 * here, what it held before, and a hash of what was written, so an edit the user has changed since is left alone.
 */
export interface Applied {
  op: Op["op"];
  path?: string;
  /** This install created the file (it did not exist). */
  created: boolean;
  /** Hash of what was written: the file's content, the JSON value, or the block text. */
  sha?: string;
  /** Where the original of an overwritten file was copied. */
  backup?: string;
  keyPath?: string[];
  arrayMatch?: { field: string; equals: string };
  /** JSON: the value this edit replaced, if there was one. */
  hadPrevious?: boolean;
  previous?: unknown;
  value?: unknown;
  id?: string;
  syntax?: "html" | "hash";
  mode?: number;
  /** Folders this install created for the file, outermost first; uninstall removes them again if they are empty. */
  dirs?: string[];
  undo?: string[];
  label?: string;
  check?: string[];
  checkOutputIncludes?: string;
  kind?: OpKind;
}

/** Something failed part-way: what was already done is returned, so the caller can still record it and uninstall can still undo it. */
export class ApplyError extends Error {
  applied: Applied[];
  constructor(message: string, applied: Applied[]) {
    super(message);
    this.applied = applied;
  }
}

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}
export type CommandRunner = (argv: string[]) => CommandResult;

/** Runs a command without a shell; `env` lets a caller point a host's own CLI at an isolated config folder. */
export const makeRunner = (env?: NodeJS.ProcessEnv): CommandRunner => (argv) => {
  const r = spawnSync(argv[0] as string, argv.slice(1), { encoding: "utf8", ...(env ? { env } : {}), shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(argv[0] ?? "") });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: (r.stderr ?? "") + (r.error ? String(r.error.message) : "") };
};
export const runCommand: CommandRunner = makeRunner();

/** Did the check say yes? An exit code of 0, and the text it must contain when one is named. */
const checkPasses = (run: CommandRunner, check: string[], includes?: string): boolean => {
  const r = run(check);
  return r.status === 0 && (includes === undefined || r.stdout.includes(includes));
};

const sha = (data: string | Buffer): string => crypto.createHash("sha256").update(data).digest("hex");
const read = (f: string): string | undefined => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : undefined);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The folders above `dir` that do not exist yet, outermost first: the ones a write is about to create, so uninstall can remove exactly those. */
function missingDirs(dir: string): string[] {
  const out: string[] = [];
  for (let d = dir; !fs.existsSync(d); ) {
    out.push(d);
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return out.reverse();
}

/** Writes a file atomically and returns the folders it had to create. */
function write(file: string, content: string, mode?: number): string[] {
  const made = missingDirs(path.dirname(file));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  if (mode) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, file);
  return made;
}

export interface ApplyOptions {
  /** Where the originals of overwritten files are copied (a fresh folder per setup run). */
  backupDir: string;
  run?: CommandRunner;
}

export interface ApplyResult {
  applied: Applied[];
  changed: string[];
  unchanged: string[];
}

const keyOf = (a: { op: string; path?: string; keyPath?: string[]; id?: string; label?: string; arrayMatch?: { equals: string } }): string => [a.op, a.path ?? "", (a.keyPath ?? []).join("."), a.arrayMatch?.equals ?? "", a.id ?? "", a.label ?? ""].join("|");

function backupOf(file: string, backupDir: string): string {
  const dest = path.join(backupDir, file.replace(/^[A-Za-z]:/, "").replace(/[\\/:]+/g, "__"));
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(file, dest);
  return dest;
}

// ------------------------------------------------------------------------------------------------ JSON documents

function readJsonDoc(file: string): { doc: Record<string, unknown>; existed: boolean } {
  const text = read(file);
  if (text === undefined) return { doc: {}, existed: false };
  if (text.trim() === "") return { doc: {}, existed: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Refusing to edit ${file}: it is not valid JSON (QAMind never overwrites a file it cannot read). Fix or remove it, then run setup again.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Refusing to edit ${file}: it is not a JSON object.`);
  return { doc: parsed as Record<string, unknown>, existed: true };
}

const writeJsonDoc = (file: string, doc: Record<string, unknown>): string[] => write(file, JSON.stringify(doc, null, 2) + "\n");

type Obj = Record<string, unknown>;

/** The object that holds the last key of the path (or the array for an array edit), created on the way. */
function container(doc: Obj, keyPath: string[], create: boolean): Obj | undefined {
  let cur: Obj = doc;
  for (const k of keyPath.slice(0, -1)) {
    const next = cur[k];
    if (next === undefined) {
      if (!create) return undefined;
      cur[k] = {};
    } else if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error(`Cannot edit "${keyPath.join(".")}": "${k}" is not an object in this file.`);
    cur = cur[k] as Obj;
  }
  return cur;
}

function applyJson(op: Extract<Op, { op: "json" }>, prior: Applied | undefined): { entry: Applied; changed: boolean } {
  const { doc, existed } = readJsonDoc(op.path);
  const parent = container(doc, op.keyPath, true) as Obj;
  const last = op.keyPath[op.keyPath.length - 1] as string;
  const entry: Applied = { op: "json", path: op.path, created: prior?.created ?? !existed, keyPath: op.keyPath, ...(op.arrayMatch ? { arrayMatch: op.arrayMatch } : {}), value: op.value, sha: sha(JSON.stringify(op.value)) };
  let changed = true;
  if (op.arrayMatch) {
    const cur = parent[last];
    if (cur !== undefined && !Array.isArray(cur)) throw new Error(`Cannot edit "${op.keyPath.join(".")}" in ${op.path}: it is not a list.`);
    const list = (cur as unknown[] | undefined) ?? [];
    parent[last] = list;
    const at = list.findIndex((e) => e && typeof e === "object" && (e as Obj)[op.arrayMatch?.field as string] === op.arrayMatch?.equals);
    if (at >= 0) {
      if (same(list[at], op.value)) changed = false;
      else {
        // Replacing something we wrote ourselves earlier keeps the first install's memory of the original; replacing anything else remembers it.
        if (!prior || prior.hadPrevious) {
          entry.hadPrevious = true;
          entry.previous = prior ? prior.previous : list[at];
        }
        list[at] = op.value;
      }
    } else list.push(op.value);
  } else {
    if (last in parent) {
      if (same(parent[last], op.value)) changed = false;
      else {
        if (!prior || prior.hadPrevious) {
          entry.hadPrevious = true;
          entry.previous = prior ? prior.previous : parent[last];
        }
        parent[last] = op.value;
      }
    } else parent[last] = op.value;
  }
  if (!changed && prior) {
    // Carry over what the first install recorded, so a re-run never forgets how to undo it.
    return { entry: { ...entry, created: prior.created, ...(prior.dirs ? { dirs: prior.dirs } : {}), ...(prior.hadPrevious ? { hadPrevious: true, previous: prior.previous } : {}) }, changed: false };
  }
  if (changed) entry.dirs = [...(prior?.dirs ?? []), ...writeJsonDoc(op.path, doc)];
  else if (prior?.dirs) entry.dirs = prior.dirs;
  return { entry, changed };
}

function revertJson(e: Applied): { done: boolean; note?: string } {
  const file = e.path as string;
  if (!fs.existsSync(file)) return { done: true };
  const { doc } = readJsonDoc(file);
  const keyPath = e.keyPath as string[];
  const parent = container(doc, keyPath, false);
  if (!parent) return { done: true };
  const last = keyPath[keyPath.length - 1] as string;
  let modified = false;
  if (e.arrayMatch) {
    const list = parent[last];
    if (Array.isArray(list)) {
      const at = list.findIndex((x) => x && typeof x === "object" && (x as Obj)[e.arrayMatch?.field as string] === e.arrayMatch?.equals);
      if (at >= 0) {
        if (!same(list[at], e.value)) modified = true;
        else if (e.hadPrevious) list[at] = e.previous;
        else list.splice(at, 1);
      }
      if (!modified && list.length === 0) delete parent[last];
    }
  } else if (last in parent) {
    if (!same(parent[last], e.value)) modified = true;
    else if (e.hadPrevious) parent[last] = e.previous;
    else delete parent[last];
  }
  if (modified) return { done: false, note: `${file}: "${keyPath.join(".")}" was changed after QAMind wrote it, so it was left in place.` };
  // Containers that this edit created and that are now empty go too, from the inside out.
  for (let depth = keyPath.length - 1; depth >= 1; depth--) {
    const holder = container(doc, keyPath.slice(0, depth + 1), false);
    const key = keyPath[depth - 1] as string;
    const up = container(doc, keyPath.slice(0, depth), false);
    if (holder === undefined || up === undefined) break;
    const v = up[key];
    if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as Obj).length === 0) delete up[key];
    else break;
  }
  if (Object.keys(doc).length === 0 && e.created) {
    fs.rmSync(file, { force: true });
    removeDirs(e.dirs);
  } else writeJsonDoc(file, doc);
  return { done: true };
}

// ------------------------------------------------------------------------------------------------ marked blocks in text files

const markers = (id: string, syntax: "html" | "hash"): { start: string; end: string } =>
  syntax === "html" ? { start: `<!-- qamind:start ${id} -->`, end: `<!-- qamind:end ${id} -->` } : { start: `# qamind:start ${id}`, end: `# qamind:end ${id}` };

function blockText(op: { id: string; text: string; syntax: "html" | "hash" }): string {
  const m = markers(op.id, op.syntax);
  return `${m.start}\n${op.text.replace(/\s+$/, "")}\n${m.end}`;
}

function findBlock(text: string, id: string, syntax: "html" | "hash"): { from: number; to: number } | undefined {
  const m = markers(id, syntax);
  const from = text.indexOf(m.start);
  if (from < 0) return undefined;
  const endAt = text.indexOf(m.end, from);
  return endAt < 0 ? undefined : { from, to: endAt + m.end.length };
}

function applyBlock(op: Extract<Op, { op: "block" }>, prior: Applied | undefined): { entry: Applied; changed: boolean } {
  const existing = read(op.path);
  const block = blockText(op);
  const entry: Applied = { op: "block", path: op.path, created: prior?.created ?? existing === undefined, id: op.id, syntax: op.syntax, sha: sha(block) };
  if (prior?.dirs) entry.dirs = prior.dirs;
  if (existing === undefined) {
    entry.dirs = [...(prior?.dirs ?? []), ...write(op.path, `${block}\n`)];
    return { entry, changed: true };
  }
  const at = findBlock(existing, op.id, op.syntax);
  if (at) {
    if (existing.slice(at.from, at.to) === block) return { entry, changed: false };
    write(op.path, existing.slice(0, at.from) + block + existing.slice(at.to));
    return { entry, changed: true };
  }
  write(op.path, `${existing.replace(/\s+$/, "")}${existing.trim() === "" ? "" : "\n\n"}${block}\n`);
  return { entry, changed: true };
}

function revertBlock(e: Applied): { done: boolean; note?: string } {
  const file = e.path as string;
  const text = read(file);
  if (text === undefined) return { done: true };
  const at = findBlock(text, e.id as string, e.syntax as "html" | "hash");
  if (!at) return { done: true };
  if (sha(text.slice(at.from, at.to)) !== e.sha) return { done: false, note: `${file}: the QAMind section was edited after it was written, so it was left in place.` };
  const rest = (text.slice(0, at.from).replace(/\s+$/, "") + (text.slice(at.to).trim() === "" ? "" : "\n\n" + text.slice(at.to).replace(/^\s+/, ""))).replace(/\s+$/, "");
  if (rest === "" && e.created) {
    fs.rmSync(file, { force: true });
    removeDirs(e.dirs);
  } else write(file, rest === "" ? "" : `${rest}\n`);
  return { done: true };
}

// ------------------------------------------------------------------------------------------------ apply, verify, revert

export function applyOps(ops: Op[], prior: Applied[], o: ApplyOptions): ApplyResult {
  const run = o.run ?? runCommand;
  const before = new Map(prior.map((p) => [keyOf(p), p]));
  const applied: Applied[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  for (const op of ops) {
    try {
      let entry: Applied;
      if (op.op === "file") {
        const before1 = before.get(keyOf({ op: "file", path: op.path }));
        const current = read(op.path);
        entry = { op: "file", path: op.path, created: before1?.created ?? current === undefined, sha: sha(op.content), ...(op.mode ? { mode: op.mode } : {}) };
        if (before1?.backup) entry.backup = before1.backup;
        if (before1?.dirs) entry.dirs = before1.dirs;
        if (current === op.content) unchanged.push(op.path);
        else {
          // Ours and untouched since: update in place. Anything else that is already there is the user's: copy it aside first.
          if (current !== undefined && !(before1 && sha(current) === before1.sha)) entry.backup = backupOf(op.path, o.backupDir);
          const made = write(op.path, op.content, op.mode);
          if (made.length) entry.dirs = [...(before1?.dirs ?? []), ...made];
          changed.push(op.path);
        }
      } else if (op.op === "json") {
        const r = applyJson(op, before.get(keyOf({ op: "json", path: op.path, keyPath: op.keyPath, ...(op.arrayMatch ? { arrayMatch: op.arrayMatch } : {}) })));
        entry = r.entry;
        (r.changed ? changed : unchanged).push(`${op.path} › ${op.keyPath.join(".")}`);
      } else if (op.op === "block") {
        const r = applyBlock(op, before.get(keyOf({ op: "block", path: op.path, id: op.id })));
        entry = r.entry;
        (r.changed ? changed : unchanged).push(`${op.path} (${op.id})`);
      } else {
        entry = { op: "command", created: true, label: op.label, ...(op.undo ? { undo: op.undo } : {}), ...(op.check ? { check: op.check } : {}), ...(op.checkOutputIncludes ? { checkOutputIncludes: op.checkOutputIncludes } : {}) };
        if (op.check && checkPasses(run, op.check, op.checkOutputIncludes)) unchanged.push(op.label);
        else {
          const r = run(op.run);
          if (r.status !== 0) throw new Error(`${op.label} failed (${op.run.join(" ")}): ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
          changed.push(op.label);
        }
      }
      applied.push(op.kind ? { ...entry, kind: op.kind } : entry);
    } catch (err) {
      throw new ApplyError((err as Error).message, applied);
    }
  }
  return { applied, changed, unchanged };
}

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

/** Is what the plan describes still there? Reads only. This is what `status` reports, so it can never disagree with what setup writes. */
export function verifyOps(ops: Op[], run: CommandRunner = runCommand): Check[] {
  return ops.map((op): Check => {
    if (op.op === "file") {
      const cur = read(op.path);
      return { label: op.path, ok: cur === op.content, detail: cur === undefined ? "missing" : cur === op.content ? "present" : "changed since setup" };
    }
    if (op.op === "json") {
      const label = `${op.path} › ${op.keyPath.join(".")}`;
      try {
        const { doc } = readJsonDoc(op.path);
        const parent = container(doc, op.keyPath, false);
        const v = parent?.[op.keyPath[op.keyPath.length - 1] as string];
        const found = op.arrayMatch ? (Array.isArray(v) ? v.find((e) => e && typeof e === "object" && (e as Obj)[op.arrayMatch?.field as string] === op.arrayMatch?.equals) : undefined) : v;
        return { label, ok: found !== undefined && same(found, op.value), detail: found === undefined ? "missing" : same(found, op.value) ? "present" : "changed since setup" };
      } catch (err) {
        return { label, ok: false, detail: (err as Error).message };
      }
    }
    if (op.op === "block") {
      const text = read(op.path);
      const at = text === undefined ? undefined : findBlock(text, op.id, op.syntax);
      const ok = !!text && !!at && text.slice(at.from, at.to) === blockText(op);
      return { label: `${op.path} (${op.id})`, ok, detail: text === undefined ? "missing" : !at ? "section missing" : ok ? "present" : "edited since setup" };
    }
    if (!op.check) return { label: op.label, ok: true, detail: "not checked" };
    const ok = checkPasses(run, op.check, op.checkOutputIncludes);
    return { label: op.label, ok, detail: ok ? "present" : "missing" };
  });
}

/** The same question as `verifyOps`, answered from what setup recorded (so it still works when the runtime folder is gone): is each recorded edit still in place? */
export function verifyApplied(entries: Applied[], run: CommandRunner = runCommand): Array<Check & { kind?: OpKind }> {
  return entries.map((e): Check & { kind?: OpKind } => {
    const kind = e.kind;
    const res = (label: string, ok: boolean, detail: string): Check & { kind?: OpKind } => ({ label, ok, detail, ...(kind ? { kind } : {}) });
    if (e.op === "file") {
      const cur = read(e.path as string);
      return res(e.path as string, cur !== undefined && sha(cur) === e.sha, cur === undefined ? "missing" : sha(cur) === e.sha ? "present" : "changed since setup");
    }
    if (e.op === "json") {
      const label = `${e.path} › ${(e.keyPath ?? []).join(".")}`;
      try {
        const { doc } = readJsonDoc(e.path as string);
        const parent = container(doc, e.keyPath as string[], false);
        const v = parent?.[(e.keyPath as string[])[(e.keyPath as string[]).length - 1] as string];
        const found = e.arrayMatch ? (Array.isArray(v) ? v.find((x) => x && typeof x === "object" && (x as Obj)[e.arrayMatch?.field as string] === e.arrayMatch?.equals) : undefined) : v;
        return res(label, found !== undefined && same(found, e.value), found === undefined ? "missing" : same(found, e.value) ? "present" : "changed since setup");
      } catch (err) {
        return res(label, false, (err as Error).message);
      }
    }
    if (e.op === "block") {
      const text = read(e.path as string);
      const at = text === undefined ? undefined : findBlock(text, e.id as string, e.syntax as "html" | "hash");
      const ok = !!text && !!at && sha(text.slice(at.from, at.to)) === e.sha;
      return res(`${e.path} (${e.id})`, ok, text === undefined ? "missing" : !at ? "section missing" : ok ? "present" : "edited since setup");
    }
    if (!e.check) return res(e.label ?? "command", true, "not checked");
    const ok = checkPasses(run, e.check, e.checkOutputIncludes);
    return res(e.label ?? "command", ok, ok ? "present" : "missing");
  });
}

export interface RevertResult {
  removed: string[];
  kept: string[];
}

/** Undo recorded edits, newest first. An edit the user changed afterwards is left in place and reported. */
export function revertOps(entries: Applied[], run: CommandRunner = runCommand): RevertResult {
  const removed: string[] = [];
  const kept: string[] = [];
  for (const e of [...entries].reverse()) {
    if (e.op === "file") {
      const file = e.path as string;
      const cur = read(file);
      if (cur === undefined) {
        // Already gone (the user deleted it): put the original back if there was one, and still clear the folders setup made for it.
        if (e.backup && fs.existsSync(e.backup)) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.copyFileSync(e.backup, file);
        } else removeDirs(e.dirs);
        continue;
      }
      if (sha(cur) !== e.sha) {
        kept.push(`${file}: changed after QAMind wrote it, so it was left in place.`);
        continue;
      }
      if (e.backup && fs.existsSync(e.backup)) {
        fs.copyFileSync(e.backup, file);
        removed.push(`${file} (the original was put back)`);
      } else if (e.created) {
        fs.rmSync(file, { force: true });
        removed.push(file);
        removeDirs(e.dirs);
      }
    } else if (e.op === "json") {
      const r = revertJson(e);
      if (r.done) removed.push(`${e.path} › ${(e.keyPath ?? []).join(".")}`);
      else kept.push(r.note as string);
    } else if (e.op === "block") {
      const r = revertBlock(e);
      if (r.done) removed.push(`${e.path} (${e.id})`);
      else kept.push(r.note as string);
    } else if (e.undo) {
      const r = run(e.undo);
      if (r.status === 0) removed.push(e.label ?? e.undo.join(" "));
      else kept.push(`${e.label ?? e.undo.join(" ")}: could not be undone (${(r.stderr || r.stdout).trim().slice(0, 200)}). Undo it by hand: ${e.undo.join(" ")}`);
    }
  }
  return { removed, kept };
}

/** Remove folders that setup created and that are now empty, innermost first. A folder that holds anything else stays. */
function removeDirs(dirs: string[] | undefined): void {
  for (const d of [...(dirs ?? [])].reverse()) {
    try {
      if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
    } catch {
      /* leave it */
    }
  }
}
