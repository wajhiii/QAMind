import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, writeJson } from "../fsutil.ts";
import { storeSubdirs } from "../paths.ts";
import { findSecretLeaks } from "../redact.ts";

/** Version of every memory file format (spec 13.17). Memory written by a newer version is never modified. */
export const MEMORY_SCHEMA = 1;

export interface MemoryPaths {
  dir: string;
  productMap: string;
  riskAreas: string;
  learnings: string;
  falseAlarms: string;
  archiveDir: string;
  runs: string;
  stack: string;
}

export function memoryPaths(store: string): MemoryPaths {
  const dir = storeSubdirs(store).memory;
  return {
    dir,
    productMap: path.join(dir, "product-map.json"),
    riskAreas: path.join(dir, "risk-areas.json"),
    learnings: path.join(dir, "learnings.jsonl"),
    falseAlarms: path.join(dir, "false-alarms.jsonl"),
    archiveDir: path.join(dir, "archive"),
    runs: storeSubdirs(store).runs,
    stack: path.join(dir, "stack.json"),
  };
}

export class MemoryTooNewError extends Error {
  constructor(file: string, found: number) {
    super(`${path.basename(file)} was written by a newer QAMind (memory schema ${found}, this QAMind understands ${MEMORY_SCHEMA}). Update QAMind before it writes to this project's memory.`);
  }
}

/** JSON memory file with a schema_version. Returns undefined when absent. Throws when it is newer than this QAMind. */
export function readMemoryJson<T extends { schema_version?: number }>(file: string): T | undefined {
  const v = readJson<T>(file);
  if (v && typeof v.schema_version === "number" && v.schema_version > MEMORY_SCHEMA) throw new MemoryTooNewError(file, v.schema_version);
  return v;
}

export function writeMemoryJson(file: string, value: Record<string, unknown>): void {
  writeJson(file, { schema_version: MEMORY_SCHEMA, ...value });
}

export interface JsonlRead<T> {
  records: T[];
  /** Lines that could not be used (hand edits gone wrong). They are reported, never silently dropped, and kept on rewrite. */
  warnings: string[];
  /** The raw text of lines that were not valid JSON, so a rewrite can preserve them. */
  unparsed: string[];
}

/**
 * JSONL memory file: the first line is `{"_meta":{"schema_version":N,"kind":"..."}}`. The reader tolerates hand edits:
 * a missing header, blank lines, comment lines starting with `#`, and invalid lines (reported as warnings).
 */
export function readJsonl<T extends object>(file: string): JsonlRead<T> {
  const out: JsonlRead<T> = { records: [], warnings: [], unparsed: [] };
  if (!fs.existsSync(file)) return out;
  const name = path.basename(file);
  fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith("#")) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        out.warnings.push(`${name} line ${i + 1} is not valid JSON and was ignored (it is kept in the file).`);
        out.unparsed.push(raw);
        return;
      }
      if (parsed && typeof parsed === "object" && "_meta" in parsed) {
        const v = (parsed as { _meta?: { schema_version?: number } })._meta?.schema_version;
        if (typeof v === "number" && v > MEMORY_SCHEMA) throw new MemoryTooNewError(file, v);
        return;
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) out.records.push(parsed as T);
      else {
        out.warnings.push(`${name} line ${i + 1} is not a JSON object and was ignored.`);
        out.unparsed.push(raw);
      }
    });
  return out;
}

export function writeJsonl(file: string, kind: string, records: object[], preserve: string[] = []): void {
  ensureDir(path.dirname(file));
  const lines = [JSON.stringify({ _meta: { schema_version: MEMORY_SCHEMA, kind } }), ...records.map((r) => JSON.stringify(r)), ...preserve];
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${lines.join("\n")}\n`, "utf8");
  fs.renameSync(tmp, file);
}

export function appendArchive(store: string, name: string, records: object[]): void {
  if (records.length === 0) return;
  const file = path.join(memoryPaths(store).archiveDir, `${name}.jsonl`);
  const prior = readJsonl<object>(file);
  writeJsonl(file, `archive-${name}`, [...prior.records, ...records], prior.unparsed);
}

// ---------------------------------------------------------------------------------------------------------------
// Text helpers: ids, similarity, and the "no secrets, no real people's data" screen (spec 10.1 and 12)
// ---------------------------------------------------------------------------------------------------------------

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "be", "it", "that", "this", "with", "as", "at", "by", "from", "not", "no", "but", "if", "then", "when", "than", "so", "can", "may", "will", "its", "into", "also"]);

/** Lowercase word tokens without stop words and with trivial plural stemming; used for de-duplication and matching. */
export function tokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(" ")
        .filter((w) => w.length > 1 && !STOP.has(w))
        .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)),
    ),
  ];
}

/** Jaccard similarity of two texts' token sets (0 to 1). */
export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const t of A) if (B.has(t)) both++;
  return both / (A.size + B.size - both);
}

/** Share of `needle`'s tokens that also appear in `haystack` (0 to 1). */
export function coverage(needle: string, haystack: string): number {
  const N = tokens(needle);
  const H = new Set(tokens(haystack));
  return N.length === 0 ? 0 : N.filter((t) => H.has(t)).length / N.length;
}

export function nextId(prefix: string, existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

const RESERVED_MAIL = /(@|\.)(example\.(com|org|net)|[\w-]+\.(test|invalid|localhost|example))$/i;

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Memory must never hold secrets or real people's personal data. This screens text that is about to be saved and returns what
 * it found, so the writer can refuse and ask for a rewrite. It is best-effort: reserved test addresses and test accounts are fine.
 */
export function screenForSecretsAndPii(text: string, knownSecrets: string[] = []): string[] {
  const problems = findSecretLeaks(text, knownSecrets).map((p) => `contains ${p}`);
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) if (!RESERVED_MAIL.test(m[0])) problems.push(`contains an email address (${m[0].replace(/^.{2}.*@/, "••@")})`);
  if (/\b\d{5}-\d{7}-\d\b/.test(text)) problems.push("contains a national-ID-like number");
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) problems.push("contains a card-number-like number");
  }
  if (/\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b|\b\d{3}[ -]\d{3}[ -]\d{4}\b/.test(text)) problems.push("contains a phone-number-like number");
  return [...new Set(problems)];
}

export class UnsafeMemoryTextError extends Error {
  constructor(what: string, problems: string[]) {
    super(`Refusing to save ${what}: it ${problems.join("; ")}. Memory never holds secrets or real people's data. Rewrite it without them (describe the behaviour, not the data).`);
  }
}

export function assertSafeText(what: string, text: string, knownSecrets: string[] = []): void {
  const problems = screenForSecretsAndPii(text, knownSecrets);
  if (problems.length) throw new UnsafeMemoryTextError(what, problems);
}

export const daysBetween = (from: string | Date, to: Date): number => Math.max(0, (to.getTime() - new Date(from).getTime()) / 86_400_000);
