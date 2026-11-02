import fs from "node:fs";
import path from "node:path";
import { checkConfigFile } from "./config.ts";
import type { QamindConfig } from "./config.ts";
import { loadQaEnv } from "./dotenv.ts";

/**
 * Private data in evidence (spec 13.8). Anything QAMind saves for a run (screenshots aside, which are blurred in the browser before capture) is masked or scanned here:
 * email addresses, phone numbers, national ID numbers (CNIC pattern), card numbers (Luhn-checked), the user's own `privacy.mask_patterns`, and the values of the fields named in
 * `privacy.mask_fields`. A test account's own data stays readable so reports stay readable: the logins in `.env.qa`, anything that starts with the test data prefix, and the
 * addresses reserved for tests (`example.com`, `*.test`, ...). Names and street addresses cannot be recognised in free text; they are masked where the config names the field
 * or a pattern, and that limit is stated in the docs.
 */
export type PiiKind = "email address" | "phone number" | "national ID number" | "card number" | "custom pattern";

export interface PrivacyContext {
  /** Anything starting with this stays readable (the test data prefix). */
  prefix: string;
  /** Test account logins (lower case): readable. */
  allow: string[];
  patterns: RegExp[];
  /** Field names (lower case) whose values are masked in JSON. */
  fields: string[];
}

export interface Hit {
  kind: PiiKind;
  start: number;
  end: number;
}

const MASK: Record<PiiKind, string> = { "email address": "[masked email]", "phone number": "[masked phone]", "national ID number": "[masked ID]", "card number": "[masked card]", "custom pattern": "[masked data]" };
export const MASKED_FIELD = "[masked]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const RESERVED_HOST = /(?:^|\.)(?:example\.(?:com|org|net)|[\w-]+\.(?:test|invalid|localhost|example)|test|invalid|localhost|example)$/i;
const CNIC = /(?<!\d)\d{5}-\d{7}-\d(?!\d)/g;
const PHONE = /(?<![\w.])(?:\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}|\(?\d{3}\)?[ -]\d{3}[ -]\d{4}|0\d{3}[ -]?\d{7})(?![\w])/g;
const CARD = /(?<!\d)(?<!\d\.)(?:[3-6]\d{3}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,7}|[3-6]\d{12,18})(?!\d)(?!\.\d)/g;
/** Numbers the telephone companies reserve for fiction (555-01xx): readable. */
const FICTION_PHONE = /555[ -]?01\d\d/;

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

const emailAllowed = (m: string, ctx: PrivacyContext): boolean => {
  const lower = m.toLowerCase();
  const host = lower.slice(lower.lastIndexOf("@") + 1);
  return RESERVED_HOST.test(host) || ctx.allow.includes(lower) || (ctx.prefix !== "" && lower.startsWith(ctx.prefix.toLowerCase()));
};

/** Where private data is in a text. Overlaps are resolved in favour of the earlier, longer match. */
export function findPii(text: string, ctx: PrivacyContext): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(EMAIL)) if (!emailAllowed(m[0], ctx)) hits.push({ kind: "email address", start: m.index, end: m.index + m[0].length });
  for (const m of text.matchAll(CNIC)) hits.push({ kind: "national ID number", start: m.index, end: m.index + m[0].length });
  for (const m of text.matchAll(CARD)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) hits.push({ kind: "card number", start: m.index, end: m.index + m[0].length });
  }
  for (const m of text.matchAll(PHONE)) if (!FICTION_PHONE.test(m[0]) && m[0].replace(/\D/g, "").length >= 9 && !(ctx.prefix && text.slice(Math.max(0, m.index - ctx.prefix.length), m.index).toLowerCase() === ctx.prefix.toLowerCase())) hits.push({ kind: "phone number", start: m.index, end: m.index + m[0].length });
  for (const re of ctx.patterns) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(g)) if (m[0] !== "") hits.push({ kind: "custom pattern", start: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Hit[] = [];
  for (const h of hits) if (out.length === 0 || h.start >= (out[out.length - 1] as Hit).end) out.push(h);
  return out;
}

export interface MaskResult {
  text: string;
  count: number;
  kinds: Partial<Record<PiiKind, number>>;
}

export function maskText(text: string, ctx: PrivacyContext): MaskResult {
  const hits = findPii(text, ctx);
  if (hits.length === 0) return { text, count: 0, kinds: {} };
  let out = "";
  let at = 0;
  const kinds: Partial<Record<PiiKind, number>> = {};
  for (const h of hits) {
    out += text.slice(at, h.start) + MASK[h.kind];
    at = h.end;
    kinds[h.kind] = (kinds[h.kind] ?? 0) + 1;
  }
  return { text: out + text.slice(at), count: hits.length, kinds };
}

/** Mask every string in a JSON value, and the whole value of any field named in `privacy.mask_fields` (test data, starting with the prefix, stays). */
export function maskJson(value: unknown, ctx: PrivacyContext, tally: { count: number; kinds: Partial<Record<PiiKind, number>> } = { count: 0, kinds: {} }, depth = 0): { value: unknown; count: number; kinds: Partial<Record<PiiKind, number>> } {
  const walk = (v: unknown, d: number): unknown => {
    if (d > 20) return v;
    if (typeof v === "string") {
      const r = maskText(v, ctx);
      tally.count += r.count;
      for (const [k, n] of Object.entries(r.kinds)) tally.kinds[k as PiiKind] = (tally.kinds[k as PiiKind] ?? 0) + (n as number);
      return r.text;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, d + 1));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (ctx.fields.includes(k.toLowerCase()) && (typeof x === "string" || typeof x === "number")) {
          const keep = typeof x === "string" && ctx.prefix !== "" && x.toLowerCase().startsWith(ctx.prefix.toLowerCase());
          if (!keep && String(x) !== "" && x !== MASKED_FIELD) {
            tally.count += 1;
            tally.kinds["custom pattern"] = (tally.kinds["custom pattern"] ?? 0) + 1;
            out[k] = MASKED_FIELD;
            continue;
          }
        }
        out[k] = walk(x, d + 1);
      }
      return out;
    }
    return v;
  };
  const masked = walk(value, depth);
  return { value: masked, count: tally.count, kinds: tally.kinds };
}

/** A body that is JSON is masked field by field (so `mask_fields` works); anything else as text. */
export function maskBody(body: string, ctx: PrivacyContext): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object") return JSON.stringify(maskJson(parsed, ctx).value);
  } catch {
    /* not JSON */
  }
  return maskText(body, ctx).text;
}

export const DEFAULT_CONTEXT: PrivacyContext = { prefix: "QA-", allow: [], patterns: [], fields: [] };

export function contextFrom(config: Pick<QamindConfig, "test_data_prefix" | "privacy"> | undefined, allow: string[] = []): PrivacyContext {
  if (!config) return { ...DEFAULT_CONTEXT, allow: allow.map((a) => a.toLowerCase()) };
  const patterns: RegExp[] = [];
  for (const p of config.privacy.mask_patterns) {
    try {
      patterns.push(new RegExp(p, "gu"));
    } catch {
      /* the config check already refuses an invalid pattern */
    }
  }
  return { prefix: config.test_data_prefix, allow: allow.map((a) => a.toLowerCase()), patterns, fields: config.privacy.mask_fields.map((f) => f.toLowerCase()) };
}

/** The project a run folder belongs to: `<project>/.qa/reports/<run>`. */
export const projectRootOfRun = (runDir: string): string => path.resolve(runDir, "..", "..", "..");

/** The privacy settings of the project a run belongs to, with its test accounts' logins as the readable ones. A missing or broken config means the defaults. */
export function contextForRun(runDir: string, env: NodeJS.ProcessEnv = process.env): PrivacyContext {
  const root = projectRootOfRun(runDir);
  try {
    if (!fs.existsSync(path.join(root, ".qa", "config.md"))) return DEFAULT_CONTEXT;
    const config = checkConfigFile(root, env).config;
    if (!config) return DEFAULT_CONTEXT;
    const names = config.roles.flatMap((r) => [r.username_env, r.password_env]);
    const { values } = loadQaEnv(root, env, names);
    return contextFrom(config, config.roles.map((r) => values[r.username_env] ?? "").filter(Boolean));
  } catch {
    return DEFAULT_CONTEXT;
  }
}

// ------------------------------------------------------------------------------------------------ the scanner

const TEXT_FILE = /\.(json|jsonl|md|txt|log|csv|har|html?|ya?ml|xml)$/i;
const MAX_BYTES = 5 * 1024 * 1024;

function textFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (TEXT_FILE.test(e.name) && fs.statSync(p).size <= MAX_BYTES) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

export interface ScanResult {
  ok: boolean;
  files_scanned: number;
  /** What was found, where, and how many of each kind. Never the values themselves. */
  leaks: Array<{ file: string; kinds: Partial<Record<PiiKind, number>>; count: number }>;
  /** Screenshots are images: they are blurred in the browser before capture and cannot be read by this scan. */
  note: string;
}

export function scanRun(runDir: string, ctx: PrivacyContext): ScanResult {
  const leaks: ScanResult["leaks"] = [];
  const files = textFiles(runDir);
  for (const f of files) {
    const r = maskText(fs.readFileSync(f, "utf8"), ctx);
    const j = f.endsWith(".json") ? jsonLeaks(f, ctx) : undefined;
    const kinds = { ...r.kinds };
    let count = r.count;
    if (j && j.count > 0 && r.count === 0) {
      Object.assign(kinds, j.kinds);
      count = j.count;
    }
    if (count > 0) leaks.push({ file: path.relative(runDir, f).split(path.sep).join("/"), kinds, count });
  }
  return { ok: leaks.length === 0, files_scanned: files.length, leaks, note: "Screenshots and other images are not scanned: they are blurred in the browser before capture (privacy.mask_selectors, and emails, phone numbers and ID numbers on the page)." };
}

function jsonLeaks(file: string, ctx: PrivacyContext): { count: number; kinds: Partial<Record<PiiKind, number>> } | undefined {
  if (ctx.fields.length === 0) return undefined;
  try {
    const r = maskJson(JSON.parse(fs.readFileSync(file, "utf8")) as unknown, ctx);
    return { count: r.count, kinds: r.kinds };
  } catch {
    return undefined;
  }
}

export interface MaskRunResult {
  files_changed: Array<{ file: string; count: number; kinds: Partial<Record<PiiKind, number>> }>;
  total: number;
}

/** Mask every text file of a run in place: JSON files field by field, everything else as text. Test accounts' own data stays. */
export function maskRun(runDir: string, ctx: PrivacyContext): MaskRunResult {
  const changed: MaskRunResult["files_changed"] = [];
  for (const f of textFiles(runDir)) {
    const raw = fs.readFileSync(f, "utf8");
    let next = raw;
    let count = 0;
    let kinds: Partial<Record<PiiKind, number>> = {};
    if (f.endsWith(".json")) {
      try {
        const r = maskJson(JSON.parse(raw) as unknown, ctx);
        if (r.count > 0) {
          next = JSON.stringify(r.value, null, 2) + "\n";
          count = r.count;
          kinds = r.kinds;
        }
      } catch {
        const r = maskText(raw, ctx);
        next = r.text;
        count = r.count;
        kinds = r.kinds;
      }
    } else {
      const r = maskText(raw, ctx);
      next = r.text;
      count = r.count;
      kinds = r.kinds;
    }
    if (count > 0 && next !== raw) {
      fs.writeFileSync(f, next, "utf8");
      changed.push({ file: path.relative(runDir, f).split(path.sep).join("/"), count, kinds });
    }
  }
  return { files_changed: changed, total: changed.reduce((n, c) => n + c.count, 0) };
}
