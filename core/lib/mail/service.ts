import path from "node:path";
import { loadQaEnv } from "../dotenv.ts";
import { ensureDir, readJson, writeJson } from "../fsutil.ts";
import type { RunScope } from "../memory/service.ts";
import { contextFrom, maskText } from "../privacy.ts";
import type { PrivacyContext } from "../privacy.ts";
import { makeCatcher, UNVERIFIED_CATCHERS } from "./catchers.ts";
import type { CaughtMessage, FetchLike } from "./catchers.ts";
import { checkMessage, MESSAGE_KINDS } from "./check.ts";
import type { LinkResult, MessageCheck, MessageKind } from "./check.ts";
import fs from "node:fs";
import type { QamindConfig } from "../config.ts";
import { classifyUrl } from "../urlpolicy.ts";
import type { RunPolicy } from "../urlpolicy.ts";

/** Waiting for a message and checking it (spec 13.7). A run's results are recorded in `data/mail-checks.json`, evidence in `evidence/mail/`. */

export interface MailWaitOptions {
  channel: "email" | "sms";
  to: string;
  /** What the flow was, in words: "password reset". */
  flow?: string;
  kind?: MessageKind;
  language?: string;
  subjectContains?: string;
  /** Messages the catcher received before this are older flows. Default: two minutes ago. */
  since?: Date;
  timeoutS?: number;
  pollMs?: number;
}

export interface MailCheckRecord {
  at: string;
  channel: "email" | "sms";
  flow?: string;
  to: string;
  arrived: boolean;
  waited_s: number;
  timeout_s: number;
  message?: { id: string; to: string[]; from: string; subject: string; created: string; excerpt: string };
  checks: MessageCheck[];
  links: LinkResult[];
  evidence?: string;
  /** Why nothing could be checked. */
  note?: string;
}

export interface MailContext {
  config: QamindConfig;
  policy: RunPolicy;
  runDir: string;
  projectRoot: string;
  privacy: PrivacyContext;
  passwords: string[];
  /** The test accounts' logins: a message to one of them is to a test address. */
  testAddresses: string[];
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}

export const mailChecksFile = (runDir: string): string => path.join(runDir, "data", "mail-checks.json");

export function mailContextForRun(scope: RunScope): MailContext {
  const ctx = scope.ctx;
  return { config: ctx.config, policy: ctx.policy, runDir: scope.runDir, projectRoot: ctx.projectRoot, privacy: contextFrom(ctx.config, ctx.roles.map((r) => r.username)), passwords: ctx.passwords, testAddresses: ctx.roles.map((r) => r.username.toLowerCase()) };
}

const RESERVED = /(^|\.)(example\.(com|org|net)|test|invalid|localhost|example)$/i;

/** An address the flow may be started for: a test account, one that starts with the test-data prefix, or one in a domain reserved for tests. */
export function isTestRecipient(addr: string, ctx: Pick<MailContext, "config" | "testAddresses">): boolean {
  const a = addr.trim().toLowerCase();
  if (ctx.testAddresses.includes(a)) return true;
  const [local = "", domain = ""] = a.split("@");
  if (!domain) return false;
  // A domain the config calls production is never a test address, whatever its ending looks like.
  if (classifyUrl(`https://${domain}`, ctx.config.security).verdict === "blocked") return false;
  return local.startsWith(ctx.config.test_data_prefix.toLowerCase()) || RESERVED.test(domain);
}

export function mailStatus(ctx: MailContext): { configured: boolean; channel: string; type?: string; url?: string; note: string; unverified?: string } {
  return {
    configured: !!ctx.config.mail,
    channel: "email",
    ...(ctx.config.mail ? { type: ctx.config.mail.type, url: ctx.config.mail.url, ...(UNVERIFIED_CATCHERS[ctx.config.mail.type] ? { unverified: UNVERIFIED_CATCHERS[ctx.config.mail.type] as string } : {}) } : {}),
    note: ctx.config.mail ? `Emails are read from ${ctx.config.mail.type} at ${ctx.config.mail.url}; nothing is sent or deleted.` : "No email sandbox is configured (mail.catcher in the config): every flow that sends an email is Not tested, with the reason \"no email sandbox configured\".",
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "message";

/** Waits for the message, checks it, saves the evidence (masked) and records the result. */
export async function waitAndCheck(ctx: MailContext, o: MailWaitOptions, now = new Date()): Promise<MailCheckRecord> {
  const settings = o.channel === "sms" ? ctx.config.sms : ctx.config.mail;
  const timeoutS = o.timeoutS ?? settings?.timeout_s ?? 30;
  const base: MailCheckRecord = { at: now.toISOString(), channel: o.channel, ...(o.flow ? { flow: o.flow } : {}), to: o.to, arrived: false, waited_s: 0, timeout_s: timeoutS, checks: [], links: [] };
  if (!settings) return { ...base, note: o.channel === "sms" ? "No SMS sandbox is configured (sms.catcher in the config): list this flow as Not tested, \"no SMS sandbox configured\"." : "No email sandbox is configured (mail.catcher in the config): list this flow as Not tested, \"no email sandbox configured\"." };
  if (o.channel === "email" && !isTestRecipient(o.to, ctx)) throw new Error(`${o.to} is not a test address (a test account's login, an address starting with ${ctx.config.test_data_prefix}, or one in a reserved test domain). QAMind only starts and checks flows for test addresses.`);
  const catcher = makeCatcher(settings, { env: { ...(ctx.env ?? process.env), ...(settings.token_env ? loadQaEnv(ctx.projectRoot, ctx.env ?? process.env, [settings.token_env]).values : {}) }, security: ctx.config.security, ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}) });
  const since = o.since ?? new Date(now.getTime() - 120_000);
  const want = o.to.trim().toLowerCase();
  const digits = (s: string): string => s.replace(/\D/g, "");
  const matches = (m: CaughtMessage): boolean => {
    const toOk = o.channel === "sms" ? m.to.some((t) => digits(t).length >= 7 && digits(t).endsWith(digits(want).slice(-9))) : m.to.includes(want);
    const t = Date.parse(m.created);
    return toOk && (Number.isNaN(t) || t >= since.getTime() - 1000) && (!o.subjectContains || m.subject.toLowerCase().includes(o.subjectContains.toLowerCase()));
  };
  const started = Date.now();
  let found: CaughtMessage | undefined;
  let lastError: string | undefined;
  for (;;) {
    try {
      found = (await catcher.list(25)).find(matches);
      lastError = undefined;
    } catch (e) {
      lastError = (e as Error).message;
    }
    if (found || Date.now() - started >= timeoutS * 1000) break;
    await sleep(o.pollMs ?? 1000);
  }
  const waited = Math.round((Date.now() - started) / 100) / 10;
  if (!found) {
    const rec = { ...base, waited_s: waited, note: lastError ? `The catcher could not be read (${lastError}). That is a problem with the sandbox, not a finding about the product.` : `No ${o.channel === "sms" ? "SMS" : "email"} for ${o.to} arrived within ${timeoutS} seconds.` };
    record(ctx, rec);
    return rec;
  }
  const { checks, links } = await checkMessage({ channel: o.channel, message: found, expectedTo: o.to, ...(o.kind ? { kind: o.kind } : {}), ...(o.language ? { language: o.language } : {}), policy: ctx.policy, security: ctx.config.security, ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}) });
  const safe = (s: string): string => maskText(ctx.passwords.reduce((acc, p) => (p ? acc.split(p).join("[REDACTED]") : acc), s), ctx.privacy).text;
  const body = found.text || "";
  const rec: MailCheckRecord = {
    ...base,
    arrived: true,
    waited_s: waited,
    message: { id: found.id, to: found.to.map(safe), from: safe(found.from), subject: safe(found.subject), created: found.created, excerpt: safe(body.replace(/\s+/g, " ").trim().slice(0, 400)) },
    checks: checks.map((c) => ({ ...c, detail: safe(c.detail) })),
    links: links.map((l) => ({ ...l, url: safe(l.url), problems: l.problems.map(safe) })),
  };
  const evidenceDir = path.join(ctx.runDir, "evidence", "mail");
  ensureDir(evidenceDir);
  const prior = readJson<MailCheckRecord[]>(mailChecksFile(ctx.runDir)) ?? [];
  const file = `${String(prior.length + 1).padStart(2, "0")}-${slug(o.flow ?? o.channel)}.txt`;
  fs.writeFileSync(path.join(evidenceDir, file), safe([`${o.channel === "sms" ? "SMS" : "Email"} caught for ${o.to}${o.flow ? ` (${o.flow})` : ""}`, `From: ${found.from}`, `To: ${found.to.join(", ")}`, `Received: ${found.created}`, `Subject: ${found.subject}`, "", body, "", "Links:", ...rec.links.map((l) => `- ${l.url}${l.status !== undefined ? ` [${l.status}]` : ""}${l.problems.length ? ` PROBLEM: ${l.problems.join("; ")}` : ""}`), "", "Checks:", ...rec.checks.map((c) => `- ${c.ok ? "ok" : "FAILED"} ${c.name}: ${c.detail}`)].join("\n")), "utf8");
  rec.evidence = path.join("evidence", "mail", file);
  record(ctx, rec);
  return rec;
}

function record(ctx: MailContext, rec: MailCheckRecord): void {
  const prior = readJson<MailCheckRecord[]>(mailChecksFile(ctx.runDir)) ?? [];
  writeJson(mailChecksFile(ctx.runDir), [...prior, rec]);
}

export { MESSAGE_KINDS };
