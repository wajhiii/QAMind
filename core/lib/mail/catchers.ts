import type { CatcherSettings } from "../config.ts";
import { classifyUrl } from "../urlpolicy.ts";
import type { SecuritySettings } from "../urlpolicy.ts";
import { decodeHeaderWords, htmlToText, parseMime } from "./mime.ts";

/**
 * Reading what the product sent, from a sandbox that caught it (spec 13.7): Mailpit, MailHog, Mailtrap, or a custom JSON API. Nothing is ever sent from here, and nothing is deleted.
 * Mailpit follows its published API (v1). MailHog and Mailtrap are written against their documented endpoints and tolerate the field names they are known to use;
 * they have not been checked against a live service, and the docs say so. A custom API is read tolerantly (see `normalizeCustom`).
 */

export interface CaughtMessage {
  id: string;
  /** Recipients, lower case. */
  to: string[];
  from: string;
  subject: string;
  text: string;
  html: string;
  /** ISO time the catcher received it. */
  created: string;
  /** The List-Unsubscribe header, when there is one. */
  list_unsubscribe?: string;
}

export interface Catcher {
  readonly type: string;
  /** The newest messages first. */
  list(limit: number): Promise<CaughtMessage[]>;
}

export type FetchLike = typeof fetch;

const TIMEOUT_MS = 10_000;
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const lower = (s: string): string => s.trim().toLowerCase();

async function getJson(fetchImpl: FetchLike, url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetchImpl(url, { redirect: "manual", headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`the catcher answered HTTP ${res.status} for ${new URL(url).pathname}`);
  return res.json();
}
async function getText(fetchImpl: FetchLike, url: string, headers: Record<string, string>): Promise<string> {
  const res = await fetchImpl(url, { redirect: "manual", headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`the catcher answered HTTP ${res.status} for ${new URL(url).pathname}`);
  return res.text();
}

// ------------------------------------------------------------------------------------------------ Mailpit (API v1)

function mailpit(base: string, fetchImpl: FetchLike): Catcher {
  return {
    type: "mailpit",
    async list(limit) {
      const summary = obj(await getJson(fetchImpl, `${base}/api/v1/messages?limit=${limit}`, {}));
      const out: CaughtMessage[] = [];
      for (const m of arr(summary["messages"]).slice(0, limit)) {
        const id = str(obj(m)["ID"]);
        if (!id) continue;
        const full = obj(await getJson(fetchImpl, `${base}/api/v1/message/${encodeURIComponent(id)}`, {}));
        const addr = (a: unknown): string => lower(str(obj(a)["Address"]));
        out.push({
          id,
          to: [...arr(full["To"]), ...arr(full["Cc"]), ...arr(full["Bcc"])].map(addr).filter(Boolean),
          from: addr(full["From"]),
          subject: str(full["Subject"]),
          text: str(full["Text"]),
          html: str(full["HTML"]),
          created: str(obj(m)["Created"]) || str(full["Date"]),
          ...(str(obj(full["ListUnsubscribe"])["Header"]) ? { list_unsubscribe: str(obj(full["ListUnsubscribe"])["Header"]) } : {}),
        });
      }
      return out;
    },
  };
}

// ------------------------------------------------------------------------------------------------ MailHog (API v2)

function mailhog(base: string, fetchImpl: FetchLike): Catcher {
  const mbox = (a: unknown): string => {
    const o = obj(a);
    const m = str(o["Mailbox"] ?? o["mailbox"]);
    const d = str(o["Domain"] ?? o["domain"]);
    return m && d ? lower(`${m}@${d}`) : "";
  };
  return {
    type: "mailhog",
    async list(limit) {
      const res = obj(await getJson(fetchImpl, `${base}/api/v2/messages?limit=${limit}`, {}));
      // The live service names the array `items`; its published description says `messages`.
      return arr(res["items"] ?? res["messages"]).slice(0, limit).map((m) => {
        const o = obj(m);
        const content = obj(o["Content"] ?? o["content"]);
        const headers = obj(content["Headers"] ?? content["headers"] ?? o["headers"]);
        const raw = `${Object.entries(headers).map(([k, v]) => `${k}: ${arr(v).map(str).join(", ")}`).join("\r\n")}\r\n\r\n${str(content["Body"] ?? content["body"])}`;
        const mime = parseMime(raw);
        const header = (k: string): string => decodeHeaderWords(arr(headers[k]).map(str)[0] ?? "");
        const to = arr(o["To"] ?? o["to"]).map(mbox).filter(Boolean);
        return {
          id: str(o["ID"] ?? o["id"]),
          to: to.length ? to : header("To").split(",").map((x) => lower(/<([^>]+)>/.exec(x)?.[1] ?? x)).filter(Boolean),
          from: mbox(o["From"] ?? o["from"]),
          subject: header("Subject"),
          text: mime.text || (mime.html ? htmlToText(mime.html) : ""),
          html: mime.html,
          created: str(o["Created"] ?? o["created"]),
          ...(header("List-Unsubscribe") ? { list_unsubscribe: header("List-Unsubscribe") } : {}),
        };
      });
    },
  };
}

// ------------------------------------------------------------------------------------------------ Mailtrap (Email Sandbox API)

function mailtrap(c: CatcherSettings, token: string, fetchImpl: FetchLike): Catcher {
  const headers = { "Api-Token": token };
  const root = `${c.url}/accounts/${encodeURIComponent(c.account_id ?? "")}/inboxes/${encodeURIComponent(c.inbox_id ?? "")}`;
  return {
    type: "mailtrap",
    async list(limit) {
      const list = arr(await getJson(fetchImpl, `${root}/messages`, headers)).slice(0, limit);
      const out: CaughtMessage[] = [];
      for (const m of list) {
        const o = obj(m);
        const id = str(o["id"]);
        if (!id) continue;
        const [text, html] = await Promise.all([getText(fetchImpl, `${root}/messages/${encodeURIComponent(id)}/body.txt`, headers).catch(() => ""), getText(fetchImpl, `${root}/messages/${encodeURIComponent(id)}/body.html`, headers).catch(() => "")]);
        out.push({ id, to: [lower(str(o["to_email"]))].filter(Boolean), from: lower(str(o["from_email"])), subject: str(o["subject"]), text: text || (html ? htmlToText(html) : ""), html, created: str(o["created_at"]) || str(o["sent_at"]) });
      }
      return out;
    },
  };
}

// ------------------------------------------------------------------------------------------------ a custom JSON API

const FIRST = (o: Record<string, unknown>, keys: string[]): unknown => keys.map((k) => o[k]).find((v) => v !== undefined && v !== null && v !== "");

/** One message of a custom API, whatever it calls its fields. */
export function normalizeCustom(m: unknown, i: number): CaughtMessage {
  const o = obj(m);
  const toRaw = FIRST(o, ["to", "To", "recipient", "recipients", "to_email", "email", "phone", "number", "msisdn"]);
  const toList = (Array.isArray(toRaw) ? toRaw : [toRaw]).map((x) => (typeof x === "object" ? str(obj(x)["address"] ?? obj(x)["Address"] ?? obj(x)["email"] ?? obj(x)["number"]) : str(x))).map(lower).filter(Boolean);
  const html = str(FIRST(o, ["html", "HTML", "html_body", "body_html"]));
  const text = str(FIRST(o, ["text", "Text", "body", "message", "content", "text_body", "body_text", "sms"]));
  return {
    id: str(FIRST(o, ["id", "ID", "message_id", "uuid"])) || String(i),
    to: toList,
    from: lower(str(FIRST(o, ["from", "From", "sender", "from_email"]))),
    subject: str(FIRST(o, ["subject", "Subject", "title"])),
    text: text || (html ? htmlToText(html) : ""),
    html,
    created: str(FIRST(o, ["created_at", "created", "Created", "date", "timestamp", "received_at", "sent_at"])),
    ...(str(FIRST(o, ["list_unsubscribe", "List-Unsubscribe"])) ? { list_unsubscribe: str(FIRST(o, ["list_unsubscribe", "List-Unsubscribe"])) } : {}),
  };
}

function custom(url: string, token: string | undefined, fetchImpl: FetchLike): Catcher {
  return {
    type: "custom",
    async list(limit) {
      const res = await getJson(fetchImpl, url, token ? { authorization: `Bearer ${token}` } : {});
      const o = obj(res);
      const items = Array.isArray(res) ? res : arr(o["messages"] ?? o["items"] ?? o["data"] ?? o["results"]);
      return items.slice(0, limit).map(normalizeCustom);
    },
  };
}

/** The catcher for a config entry. The token's value comes from the environment (`token_env`), never from the config. A catcher whose address looks like production is refused. */
export function makeCatcher(c: CatcherSettings, opts: { env?: NodeJS.ProcessEnv; security?: SecuritySettings; fetchImpl?: FetchLike } = {}): Catcher {
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (opts.security && c.type !== "mailtrap" && classifyUrl(c.url, opts.security).verdict === "blocked") throw new Error(`The catcher address ${c.url} is blocked as production by the config's security settings.`);
  const token = c.token_env ? (opts.env ?? process.env)[c.token_env] : undefined;
  if (c.token_env && !token && (c.type === "mailtrap")) throw new Error(`The variable ${c.token_env} (the catcher's API token) has no value. Add it to .env.qa.`);
  switch (c.type) {
    case "mailpit":
      return mailpit(c.url, fetchImpl);
    case "mailhog":
      return mailhog(c.url, fetchImpl);
    case "mailtrap":
      return mailtrap(c, token as string, fetchImpl);
    case "custom":
      return custom(c.url, token, fetchImpl);
  }
}

export const UNVERIFIED_CATCHERS: Record<string, string> = {
  mailhog: "MailHog is read through its documented API v2 and the field names it is known to use; it has not been checked against a running MailHog.",
  mailtrap: "Mailtrap is read through its Email Sandbox API as documented; it has not been checked against a live Mailtrap account.",
  custom: "A custom API is read tolerantly (a list of messages, or an object holding one) with common field names; check `mail status` shows your messages.",
};
