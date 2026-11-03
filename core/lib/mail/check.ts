import { isRequestAllowed, classifyUrl } from "../urlpolicy.ts";
import type { RunPolicy, SecuritySettings } from "../urlpolicy.ts";
import type { CaughtMessage, FetchLike } from "./catchers.ts";
import { htmlToText } from "./mime.ts";

/**
 * What is checked about a message the product sent (spec 13.7): the right recipient, a subject, no placeholder left in it, links that work and stay in the test environment,
 * an unsubscribe where one is required, and the language. Each check says what it saw. Code does the checks that are exact; whether the wording makes sense is for the agent to read.
 */

export interface MessageCheck {
  name: "recipient" | "subject" | "placeholders" | "links" | "unsubscribe" | "language";
  ok: boolean;
  /** How serious a failure is, as a hint for the finding. */
  severity: "important" | "minor";
  detail: string;
}

export interface LinkResult {
  /** The address, with the values of its query removed except those that are plainly a placeholder. */
  url: string;
  /** Inside the run's URL policy: the test environment. */
  test_environment: boolean;
  production?: boolean;
  status?: number;
  ok: boolean;
  problems: string[];
}

export type MessageKind = "transactional" | "notification" | "marketing" | "invitation";
export const MESSAGE_KINDS: MessageKind[] = ["transactional", "notification", "marketing", "invitation"];
/** Messages of these kinds must carry a way to unsubscribe. */
const NEEDS_UNSUBSCRIBE: MessageKind[] = ["notification", "marketing"];

export interface CheckInput {
  channel: "email" | "sms";
  message: CaughtMessage;
  expectedTo?: string;
  kind?: MessageKind;
  /** ISO 639-1 code the message should be written in. */
  language?: string;
  policy: RunPolicy;
  security: SecuritySettings;
  fetchImpl?: FetchLike;
}

const PLACEHOLDERS: Array<[RegExp, string]> = [
  [/\{\{\s*[\w.#/ -]+\s*\}\}/, "{{name}}"],
  [/\{%[^%]*%\}/, "{% … %}"],
  [/\$\{[^}]+\}/, "${name}"],
  [/<%[=-]?[^%]*%>/, "<%= name %>"],
  [/%\(\w+\)s|%s\b|%d\b/, "%s"],
  [/\[\[\s*[\w.]+\s*\]\]/, "[[name]]"],
  [/(?<![\w{])\{[a-z_][a-z0-9_.]{1,30}\}(?![\w}])/i, "{name}"],
  [/\bundefined\b|\bNaN\b|\[object Object\]/, "undefined / NaN / [object Object]"],
  [/\b(?:hi|hello|dear)[,\s]+null\b/i, "Hello null"],
  [/\bnull\b(?=\s*[,!.]?\s*$)/im, "a lone null"],
];

const BAD_VALUE = /^(undefined|null|nan|none|\[object object\]|\{\{.*\}\}|%7b%7b.*|:\w+|<\w+>|)$/i;

/** Every address in a message: the links of the HTML and the addresses written out in the text. */
export function extractLinks(msg: Pick<CaughtMessage, "text" | "html">): Array<{ url: string; label?: string }> {
  const out = new Map<string, string | undefined>();
  for (const m of msg.html.matchAll(/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = (m[1] ?? m[2] ?? "").replace(/&amp;/g, "&").trim();
    if (/^https?:\/\//i.test(href) && !out.has(href)) out.set(href, htmlToText(m[3] ?? "").slice(0, 80));
  }
  for (const m of `${msg.text}\n${htmlToText(msg.html)}`.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const u = m[0].replace(/[.,;:!?]+$/, "");
    if (!out.has(u)) out.set(u, undefined);
  }
  return [...out].slice(0, 15).map(([url, label]) => ({ url, ...(label ? { label } : {}) }));
}

function describeUrl(raw: string): { shown: string; problems: string[] } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { shown: raw.slice(0, 100), problems: ["the address is not valid"] };
  }
  const problems: string[] = [];
  const parts: string[] = [];
  for (const [k, v] of u.searchParams) {
    if (BAD_VALUE.test(v.trim())) {
      problems.push(`the ${k} in the link is "${v || "empty"}", a value that was never filled in`);
      parts.push(`${k}=${v}`);
    } else parts.push(`${k}=…`);
  }
  if (u.searchParams.size === 0 && /\/(undefined|null|nan)(\/|$)/i.test(u.pathname)) problems.push("the path of the link contains a placeholder value");
  return { shown: `${u.origin}${u.pathname}${parts.length ? `?${parts.join("&")}` : ""}`, problems };
}

async function followLink(raw: string, policy: RunPolicy, fetchImpl: FetchLike): Promise<{ status?: number; error?: string; final: string }> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    if (!isRequestAllowed(policy, url).allowed) return { error: "a redirect leads outside the test environment", final: url };
    try {
      const res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { accept: "text/html,*/*" } });
      await res.arrayBuffer().catch(() => undefined);
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location") as string, url).toString();
        continue;
      }
      return { status: res.status, final: url };
    } catch (e) {
      return { error: (e as Error).message.split("\n")[0] ?? "no answer", final: url };
    }
  }
  return { error: "too many redirects", final: url };
}

const SCRIPTS: Array<[string, RegExp]> = [
  ["arabic", /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g],
  ["devanagari", /[ऀ-ॿ]/g],
  ["cjk", /[぀-ヿ一-鿿가-힯]/g],
  ["cyrillic", /[Ѐ-ӿ]/g],
  ["latin", /[A-Za-zÀ-ɏ]/g],
];
const SCRIPT_OF_LANGUAGE: Record<string, string> = { ur: "arabic", ar: "arabic", fa: "arabic", ps: "arabic", sd: "arabic", hi: "devanagari", mr: "devanagari", ne: "devanagari", zh: "cjk", ja: "cjk", ko: "cjk", ru: "cyrillic", uk: "cyrillic", bg: "cyrillic", sr: "cyrillic" };

/** The share of the letters of a text in each writing system: a coarse check of the language, not language detection. */
export function scriptShares(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const [name, re] of SCRIPTS) {
    const n = (text.match(re) ?? []).length;
    if (n) counts[name] = n;
    total += n;
  }
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / total) * 100) / 100]));
}

export const expectedScript = (language: string): string => SCRIPT_OF_LANGUAGE[language.toLowerCase().slice(0, 2)] ?? "latin";

const digits = (s: string): string => s.replace(/\D/g, "");

export async function checkMessage(input: CheckInput): Promise<{ checks: MessageCheck[]; links: LinkResult[] }> {
  const { message: m } = input;
  const checks: MessageCheck[] = [];
  const bodyText = [m.text, htmlToText(m.html)].filter(Boolean).join("\n");

  if (input.expectedTo) {
    const want = input.expectedTo.trim().toLowerCase();
    const ok = input.channel === "sms" ? m.to.some((t) => digits(t).length >= 7 && digits(t).endsWith(digits(want).slice(-9))) : m.to.includes(want);
    checks.push({ name: "recipient", ok, severity: "important", detail: ok ? "It went to the address the flow was started for." : `It went to ${m.to.join(", ") || "nobody"}, not to ${input.expectedTo}.` });
  }
  if (input.channel === "email") {
    const ok = m.subject.trim().length > 0;
    checks.push({ name: "subject", ok, severity: "minor", detail: ok ? `Subject: "${m.subject.slice(0, 120)}"` : "The email has no subject." });
  }
  const found = new Set<string>();
  for (const [re, label] of PLACEHOLDERS) if (re.test(`${m.subject}\n${bodyText}`)) found.add(label);
  checks.push({ name: "placeholders", ok: found.size === 0, severity: "important", detail: found.size === 0 ? "No template placeholder was left in the text." : `The text still holds ${[...found].map((x) => `"${x}"`).join(", ")}: a value that was never filled in.` });

  const links: LinkResult[] = [];
  const fetchImpl = input.fetchImpl ?? fetch;
  for (const l of extractLinks(m)) {
    const d = describeUrl(l.url);
    const allowed = isRequestAllowed(input.policy, l.url).allowed;
    const verdict = classifyUrl(l.url, input.security).verdict;
    const production = verdict === "blocked";
    const r: LinkResult = { url: d.shown, test_environment: allowed, ...(production ? { production: true } : {}), ok: true, problems: [...d.problems] };
    if (production) r.problems.push("the link points to production, not the test environment");
    else if (!allowed) r.problems.push("the link points outside the test environment (it was not opened)");
    if (allowed) {
      const f = await followLink(l.url, input.policy, fetchImpl);
      if (f.status !== undefined) r.status = f.status;
      if (f.error) r.problems.push(`the link could not be opened (${f.error})`);
      else if (f.status !== undefined && f.status >= 400) r.problems.push(`the link answers ${f.status}`);
    }
    r.ok = r.problems.length === 0;
    links.push(r);
  }
  const unsubLinks = links.filter((l) => /unsubscribe|opt-?out|preferences/i.test(l.url));
  const hasUnsub = !!m.list_unsubscribe || unsubLinks.length > 0 || /unsubscribe|opt[- ]?out/i.test(bodyText);
  const bad = links.filter((l) => !l.ok);
  checks.push({ name: "links", ok: bad.length === 0, severity: "important", detail: links.length === 0 ? "The message has no links." : bad.length === 0 ? `${links.length} link(s), all open and stay in the test environment.` : `${bad.length} of ${links.length} link(s) have a problem: ${bad.slice(0, 3).map((b) => `${b.url} (${b.problems.join("; ")})`).join(" | ")}` });
  if (input.channel === "email") {
    const required = !!input.kind && NEEDS_UNSUBSCRIBE.includes(input.kind);
    checks.push({ name: "unsubscribe", ok: !required || hasUnsub, severity: "minor", detail: hasUnsub ? "A way to unsubscribe is present." : required ? `A ${input.kind} email needs a way to unsubscribe and has none.` : "No way to unsubscribe (not required for this kind of email)." });
  }
  if (input.language) {
    const shares = scriptShares(bodyText);
    const want = expectedScript(input.language);
    const share = shares[want] ?? 0;
    const ok = share >= 0.6;
    checks.push({ name: "language", ok, severity: "important", detail: ok ? `The text is written mostly in the ${want} script, as expected for "${input.language}".` : `Expected "${input.language}" (${want} script) but only ${Math.round(share * 100)}% of the letters are ${want} (${Object.entries(shares).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", ") || "no letters"}). Read the text to confirm.` });
  }
  return { checks, links };
}
