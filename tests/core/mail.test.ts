import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkConfigText, policyFromConfig } from "../../core/lib/config.ts";
import type { QamindConfig } from "../../core/lib/config.ts";
import { makeCatcher, normalizeCustom } from "../../core/lib/mail/catchers.ts";
import { checkMessage, expectedScript, extractLinks, scriptShares } from "../../core/lib/mail/check.ts";
import { decodeHeaderWords, decodeQuotedPrintable, htmlToText, parseMime } from "../../core/lib/mail/mime.ts";
import { isTestRecipient, mailChecksFile, mailStatus, waitAndCheck } from "../../core/lib/mail/service.ts";
import type { MailContext } from "../../core/lib/mail/service.ts";
import { contextFrom } from "../../core/lib/privacy.ts";
import { DEMO_ENV, makeProject, tmp, withConfigYaml } from "./helpers.ts";

// Email and SMS through a sandbox (spec 13.7): reading the catchers, the checks, and what a run records. Catchers are answered by fake fetches shaped like their documented APIs.

const config = (extra = "mail:\n  catcher: mailpit\n  url: http://127.0.0.1:8025"): QamindConfig => {
  const c = checkConfigText(withConfigYaml(extra), { projectRoot: makeProject({ files: { "openapi.yaml": "x" } }), env: DEMO_ENV }).config;
  assert.ok(c);
  return c;
};
const json = (v: unknown, status = 200): Response => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

test("MIME: quoted-printable, base64, folded and encoded headers, multipart parts", () => {
  assert.equal(decodeQuotedPrintable("Gr=C3=BC=C3=9Fe=\r\n wie").toString("utf8"), "Grüße wie");
  assert.equal(decodeHeaderWords("=?UTF-8?B?UmVzZXQgeW91ciBwYXNzd29yZCDigJMgTHVtZW4=?="), "Reset your password – Lumen");
  assert.equal(decodeHeaderWords("=?utf-8?Q?Caf=C3=A9_menu?="), "Café menu");
  const raw = ["Subject: =?UTF-8?B?w5xiZXJwcsO8ZnVuZw==?=", "Content-Type: multipart/alternative; boundary=\"b1\"", "", "--b1", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: quoted-printable", "", "Hallo =C3=9Cberpr=C3=BCfung", "--b1", "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", Buffer.from("<p>Hallo <b>Welt</b></p>").toString("base64"), "--b1--", ""].join("\r\n");
  const m = parseMime(raw);
  assert.equal(m.text, "Hallo Überprüfung");
  assert.equal(m.html, "<p>Hallo <b>Welt</b></p>");
  assert.equal(htmlToText("<style>p{}</style><p>Hello&nbsp;<b>there</b> &amp; you</p><br>Next line"), "Hello there & you\nNext line");
  assert.deepEqual(parseMime("To: a@b.test\r\n  c@d.test\r\nX-A: 1\r\nX-A: 2\r\n\r\nbody").headers, { to: ["a@b.test c@d.test"], "x-a": ["1", "2"] });
});

test("Mailpit: the list and each message are read as its API v1 describes them", async () => {
  const seen: string[] = [];
  const fake = (async (url: string | URL) => {
    const u = new URL(String(url));
    seen.push(u.pathname + u.search);
    if (u.pathname === "/api/v1/messages") return json({ total: 2, messages_count: 2, messages: [{ ID: "m2", Created: "2026-11-03T10:00:05Z" }, { ID: "m1", Created: "2026-11-03T10:00:00Z" }] });
    const id = u.pathname.split("/").pop();
    return json({ ID: id, From: { Name: "Lumen", Address: "No-Reply@lumen.test" }, To: [{ Name: "", Address: "A1@Acme.test" }], Cc: [], Bcc: [], Subject: `Subject ${id}`, Date: "2026-11-03T10:00:00Z", Text: `Hello ${id}`, HTML: `<p>Hello ${id}</p>`, ListUnsubscribe: { Header: id === "m1" ? "<mailto:u@lumen.test>" : "", Links: [] } });
  }) as typeof fetch;
  const c = makeCatcher({ type: "mailpit", url: "http://127.0.0.1:8025", timeout_s: 30 }, { fetchImpl: fake });
  const list = await c.list(25);
  assert.deepEqual(seen, ["/api/v1/messages?limit=25", "/api/v1/message/m2", "/api/v1/message/m1"]);
  assert.equal(list[0]?.to[0], "a1@acme.test", "addresses are lower case");
  assert.equal(list[0]?.from, "no-reply@lumen.test");
  assert.equal(list[0]?.created, "2026-11-03T10:00:05Z");
  assert.equal(list[1]?.list_unsubscribe, "<mailto:u@lumen.test>");
  assert.equal(list[0]?.list_unsubscribe, undefined);
  await assert.rejects(makeCatcher({ type: "mailpit", url: "http://127.0.0.1:8025", timeout_s: 30 }, { fetchImpl: (async () => json({}, 500)) as typeof fetch }).list(5), /answered HTTP 500/);
});

test("MailHog, Mailtrap and a custom API are read tolerantly: `items` or `messages`, either capitalisation, the raw body when that is all there is", async () => {
  const hogItem = { ID: "h1", From: { Mailbox: "no-reply", Domain: "lumen.test" }, To: [{ Mailbox: "a1", Domain: "acme.test" }], Created: "2026-11-03T10:00:00Z", Content: { Headers: { Subject: ["=?UTF-8?Q?Caf=C3=A9?="], "Content-Type": ["text/plain; charset=utf-8"], "Content-Transfer-Encoding": ["quoted-printable"], "List-Unsubscribe": ["<https://x.test/u>"] }, Body: "Caf=C3=A9 time" } };
  for (const shape of [{ items: [hogItem] }, { messages: [hogItem] }]) {
    const [m] = await makeCatcher({ type: "mailhog", url: "http://127.0.0.1:8025", timeout_s: 30 }, { fetchImpl: (async () => json(shape)) as typeof fetch }).list(5);
    assert.equal(m?.subject, "Café");
    assert.equal(m?.text, "Café time");
    assert.deepEqual(m?.to, ["a1@acme.test"]);
    assert.equal(m?.list_unsubscribe, "<https://x.test/u>");
  }
  const trapCalls: string[] = [];
  const trap = makeCatcher({ type: "mailtrap", url: "https://mailtrap.io/api", account_id: "12", inbox_id: "34", token_env: "MT", timeout_s: 30 }, {
    env: { MT: "secret-token" },
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      trapCalls.push(u.pathname);
      assert.equal((init?.headers as Record<string, string>)["Api-Token"], "secret-token");
      if (u.pathname.endsWith("/messages")) return json([{ id: 7, subject: "Welcome", from_email: "no-reply@lumen.test", to_email: "QA-new@example.com", created_at: "2026-11-03T10:00:00Z" }]);
      return new Response(u.pathname.endsWith("body.html") ? "<p>Hi</p>" : "Hi", { status: 200 });
    }) as typeof fetch,
  });
  const [t] = await trap.list(5);
  assert.deepEqual(trapCalls, ["/api/accounts/12/inboxes/34/messages", "/api/accounts/12/inboxes/34/messages/7/body.txt", "/api/accounts/12/inboxes/34/messages/7/body.html"]);
  assert.equal(t?.to[0], "qa-new@example.com");
  assert.throws(() => makeCatcher({ type: "mailtrap", url: "https://mailtrap.io/api", account_id: "1", inbox_id: "2", token_env: "MT", timeout_s: 30 }, { env: {} }), /MT .* has no value/);

  const sms = normalizeCustom({ recipient: "+92 300 0000000", message: "Your code is 4821", received_at: "2026-11-03T10:00:00Z", id: 9 }, 0);
  assert.deepEqual([sms.to, sms.text, sms.created, sms.id], [["+92 300 0000000"], "Your code is 4821", "2026-11-03T10:00:00Z", "9"]);
  const [c] = await makeCatcher({ type: "custom", url: "http://127.0.0.1:9000/messages", token_env: "T", timeout_s: 30 }, { env: { T: "tok" }, fetchImpl: (async (_u: string | URL, init?: RequestInit) => { assert.equal((init?.headers as Record<string, string>)["authorization"], "Bearer tok"); return json({ data: [{ to: { address: "A@B.test" }, subject: "S", html: "<p>x <a href='http://a.test'>go</a></p>" }] }); }) as typeof fetch }).list(5);
  assert.deepEqual([c?.to, c?.subject, c?.text], [["a@b.test"], "S", "x go"]);
});

test("a catcher whose address names production is never read", () => {
  const security = { blocked_production_patterns: ["mail.lumen-supplies.example.com"], not_production_hosts: [], allowed_extra_origins: [], confirmed_non_production: false };
  assert.throws(() => makeCatcher({ type: "mailpit", url: "https://mail.lumen-supplies.example.com", timeout_s: 30 }, { security }), /blocked as production/);
});

test("placeholders: every template syntax is caught, ordinary text is not", async () => {
  const policy = { allowed_origins: ["http://127.0.0.1:4102"], blocked_patterns: ["lumen-supplies.example.com"] };
  const security = { blocked_production_patterns: ["lumen-supplies.example.com"], not_production_hosts: [], allowed_extra_origins: [], confirmed_non_production: false };
  const run = async (text: string, subject = "Hello") => (await checkMessage({ channel: "email", message: { id: "1", to: ["a@b.test"], from: "x@y.test", subject, text, html: "", created: "" }, policy, security })).checks.find((c) => c.name === "placeholders");
  for (const bad of ["Hi {{name}}", "Hi {{ user.first_name }}", "Hi ${name}", "Hi <%= name %>", "Hi %s", "Hi %(name)s", "Hi [[name]]", "Hi {first_name}", "Your order undefined is ready", "Total: NaN", "Dear null", "Hello null,", "Item [object Object]", "{% if x %}"]) assert.equal((await run(bad))?.ok, false, bad);
  assert.equal((await run("x", "Welcome {{name}}"))?.ok, false, "the subject is checked too");
  for (const fine of ["Hi Ahmed, your order of 100% cotton is ready.", "Use the code {1234}? No: use 1234.", "Nulls are not allowed in the field. Null hypothesis aside.", "Price: $5 {approx}"]) {
    const r = await run(fine);
    assert.equal(r?.ok, fine.includes("{approx}") ? false : true, `${fine}: ${r?.detail}`);
  }
});

test("links: they must open and stay in the test environment; a link to production or elsewhere is not opened; a token that was never filled in is caught", async () => {
  const policy = { allowed_origins: ["http://127.0.0.1:4102"], blocked_patterns: ["lumen-supplies.example.com"] };
  const security = { blocked_production_patterns: ["lumen-supplies.example.com"], not_production_hosts: [], allowed_extra_origins: [], confirmed_non_production: false };
  const opened: string[] = [];
  const fakeFetch = (async (url: string | URL) => {
    const u = new URL(String(url));
    opened.push(u.pathname + u.search);
    if (u.pathname === "/reset-password.html") return new Response("<form>", { status: 200 });
    if (u.pathname === "/go") return new Response(null, { status: 302, headers: { location: "https://lumen-supplies.example.com/landing" } });
    if (u.pathname === "/hop") return new Response(null, { status: 302, headers: { location: "/reset-password.html?token=abc" } });
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  const html = `<p><a href="http://127.0.0.1:4102/reset-password.html?token=0123456789abcdef">Reset</a> <a href="http://127.0.0.1:4102/reset?token=undefined">Broken</a> <a href="https://lumen-supplies.example.com/reset?token=a1b2">Production</a> <a href="https://tracker.example.net/c/1">Elsewhere</a> <a href="http://127.0.0.1:4102/go">Redirects out</a> <a href="http://127.0.0.1:4102/hop">Hops</a> <a href="mailto:x@y.test">mail</a></p>`;
  assert.deepEqual(extractLinks({ text: "", html }).map((l) => l.url).length, 6, "mailto links are not links to check");
  const r = await checkMessage({ channel: "email", message: { id: "1", to: ["a@b.test"], from: "x@y.test", subject: "S", text: "", html, created: "" }, policy, security, fetchImpl: fakeFetch });
  const byUrl = (part: string) => r.links.find((l) => l.url.includes(part));
  assert.equal(byUrl("reset-password.html?token=…")?.ok, true, "a real token is shown masked and the link opens");
  assert.deepEqual(byUrl("reset?token=undefined")?.problems, ['the token in the link is "undefined", a value that was never filled in', "the link answers 404"]);
  assert.equal(byUrl("lumen-supplies.example.com")?.production, true);
  assert.match(byUrl("lumen-supplies.example.com")?.problems.join(" ") ?? "", /points to production/);
  assert.match(byUrl("tracker.example.net")?.problems.join(" ") ?? "", /outside the test environment \(it was not opened\)/);
  assert.match(byUrl("/go")?.problems.join(" ") ?? "", /a redirect leads outside the test environment/);
  assert.equal(byUrl("/hop")?.ok, true, "a redirect inside the test environment is followed");
  assert.ok(!opened.some((p) => p.includes("tracker") || p.includes("landing")), "nothing outside the policy was requested");
  assert.equal(r.checks.find((c) => c.name === "links")?.ok, false);
});

test("unsubscribe is required for marketing and notification mail only, and the language check compares scripts", async () => {
  const policy = { allowed_origins: [], blocked_patterns: [] };
  const security = { blocked_production_patterns: [], not_production_hosts: [], allowed_extra_origins: [], confirmed_non_production: false };
  const msg = (over: Record<string, unknown>) => ({ id: "1", to: ["a@b.test"], from: "x@y.test", subject: "S", text: "Hello there", html: "", created: "", ...over });
  const has = async (kind: "marketing" | "transactional" | "notification", over: Record<string, unknown> = {}) => (await checkMessage({ channel: "email", message: msg(over), kind, policy, security })).checks.find((c) => c.name === "unsubscribe");
  assert.equal((await has("marketing"))?.ok, false);
  assert.equal((await has("transactional"))?.ok, true);
  assert.equal((await has("marketing", { list_unsubscribe: "<mailto:u@x.test>" }))?.ok, true);
  assert.equal((await has("notification", { text: "Manage emails: unsubscribe here" }))?.ok, true);

  assert.equal(expectedScript("ur"), "arabic");
  assert.equal(expectedScript("hi-IN"), "devanagari");
  assert.equal(expectedScript("en"), "latin");
  assert.deepEqual(scriptShares("abc"), { latin: 1 });
  assert.equal(scriptShares("زین ٹریڈرز آپ کا آرڈر تیار ہے Lumen")["arabic"]! > 0.8, true);
  const lang = async (language: string, text: string) => (await checkMessage({ channel: "email", message: msg({ text }), language, policy, security })).checks.find((c) => c.name === "language");
  assert.equal((await lang("ur", "آپ کا آرڈر تیار ہے۔ شکریہ Lumen"))?.ok, true);
  const wrong = await lang("ur", "Your order is ready. Thank you for shopping.");
  assert.equal(wrong?.ok, false);
  assert.match(wrong?.detail ?? "", /Expected "ur" \(arabic script\) but only 0% of the letters are arabic/);
  assert.equal((await lang("en", "Your order is ready."))?.ok, true);
});

function mailContext(over: Partial<MailContext> = {}, extra?: string): { ctx: MailContext; runDir: string } {
  const c = config(extra);
  const runDir = tmp("qamind-run-");
  fs.mkdirSync(path.join(runDir, "data"), { recursive: true });
  return { runDir, ctx: { config: c, policy: policyFromConfig(c), runDir, projectRoot: makeProject(), privacy: contextFrom(c, ["a1@acme.test"]), passwords: ["pw-acme1-1234"], testAddresses: ["a1@acme.test"], ...over } };
}

test("test recipients: a test login, the test-data prefix, or a reserved domain; nothing else", () => {
  const { ctx } = mailContext();
  for (const ok of ["a1@acme.test", "A1@ACME.test", "QA-new@gmail.com", "someone@example.com", "x@y.test"]) assert.equal(isTestRecipient(ok, ctx), true, ok);
  for (const bad of ["jane.smith@gmail.com", "ceo@lumen-supplies.example.com", "not-an-address", "qa@gmail.com"]) assert.equal(isTestRecipient(bad, ctx), false, bad);
});

test("waiting for a message: found, checked, saved masked as evidence and recorded; a flow with no message says so; a real address is refused", async () => {
  const messages = [{ ID: "old", Created: "2026-10-01T08:00:00Z", to: "a1@acme.test", text: "an old one" }, { ID: "new", Created: new Date().toISOString(), to: "a1@acme.test", text: "Hello Acme Buyer One. Reset: http://127.0.0.1:4102/reset?token=undefined Contact jane.smith@gmail.com or 0300 1234567. Pass pw-acme1-1234." }];
  const fake = (async (url: string | URL) => {
    const u = new URL(String(url));
    if (u.pathname === "/api/v1/messages") return json({ messages: messages.map((m) => ({ ID: m.ID, Created: m.Created })) });
    const m = messages.find((x) => x.ID === u.pathname.split("/").pop());
    if (u.hostname === "127.0.0.1" && u.port === "4102") return new Response("nope", { status: 404 });
    return json({ ID: m?.ID, From: { Address: "no-reply@lumen.test" }, To: [{ Address: m?.to }], Subject: "Reset your password", Date: m?.Created, Text: m?.text, HTML: "", ListUnsubscribe: { Header: "" } });
  }) as typeof fetch;
  const { ctx, runDir } = mailContext({ fetchImpl: fake }, "mail:\n  catcher: mailpit\n  url: http://127.0.0.1:8025\n  timeout_s: 5");
  const rec = await waitAndCheck(ctx, { channel: "email", to: "a1@acme.test", flow: "password reset", kind: "transactional", pollMs: 5 });
  assert.equal(rec.arrived, true);
  assert.equal(rec.message?.id, "new", "the older message is not this flow's");
  assert.deepEqual(rec.checks.filter((c) => !c.ok).map((c) => c.name).sort(), ["links", "placeholders"]);
  const text = fs.readFileSync(path.join(runDir, rec.evidence as string), "utf8");
  assert.match(text, /Reset: http:\/\/127\.0\.0\.1:4102\/reset\?token=undefined/);
  assert.ok(!text.includes("jane.smith@gmail.com") && !text.includes("0300 1234567") && !text.includes("pw-acme1-1234"), text);
  assert.ok(!JSON.stringify(rec).includes("jane.smith@gmail.com"));
  const saved = JSON.parse(fs.readFileSync(mailChecksFile(runDir), "utf8")) as unknown[];
  assert.equal(saved.length, 1);

  const none = await waitAndCheck(ctx, { channel: "email", to: "QA-nobody@acme.test", timeoutS: 0.05, pollMs: 5 });
  assert.equal(none.arrived, false);
  assert.match(none.note ?? "", /No email for QA-nobody@acme.test arrived within 0.05 seconds/);
  assert.equal((JSON.parse(fs.readFileSync(mailChecksFile(runDir), "utf8")) as unknown[]).length, 2);

  await assert.rejects(waitAndCheck(ctx, { channel: "email", to: "jane.smith@gmail.com" }), /not a test address/);

  const down = mailContext({ fetchImpl: (async () => { throw new Error("connect ECONNREFUSED"); }) as typeof fetch });
  const broken = await waitAndCheck(down.ctx, { channel: "email", to: "a1@acme.test", timeoutS: 0.05, pollMs: 5 });
  assert.match(broken.note ?? "", /could not be read .*problem with the sandbox, not a finding about the product/);
});

test("no catcher: the flow is Not tested with the reason the spec words, and nothing is called; the status says the same", async () => {
  const { ctx } = mailContext({}, "browsers: [chromium]");
  assert.equal(mailStatus(ctx).configured, false);
  assert.match(mailStatus(ctx).note, /no email sandbox configured/);
  const rec = await waitAndCheck(ctx, { channel: "email", to: "a1@acme.test" });
  assert.equal(rec.arrived, false);
  assert.match(rec.note ?? "", /Not tested, "no email sandbox configured"/);
  const sms = await waitAndCheck(ctx, { channel: "sms", to: "+923000000000" });
  assert.match(sms.note ?? "", /no SMS sandbox configured/);
  assert.equal(mailStatus(mailContext().ctx).unverified, undefined, "Mailpit follows its published API");
  assert.match(mailStatus(mailContext({}, "mail:\n  catcher: mailhog\n  url: http://127.0.0.1:8025").ctx).unverified ?? "", /has not been checked against a running MailHog/);
});

test("an SMS is matched by number and checked for placeholders and links", async () => {
  const fake = (async (url: string | URL) => {
    if (new URL(String(url)).port === "4102") return new Response("nope", { status: 404 });
    return json([{ id: 1, to: "+92 300 0000000", message: "Your code is {{code}}. Open http://127.0.0.1:4102/verify", created_at: new Date().toISOString() }]);
  }) as typeof fetch;
  const { ctx } = mailContext({ fetchImpl: fake }, "sms:\n  catcher: http://127.0.0.1:9000/messages\n  timeout_s: 5");
  const rec = await waitAndCheck(ctx, { channel: "sms", to: "+923000000000", flow: "login code", pollMs: 5 });
  assert.equal(rec.arrived, true);
  assert.deepEqual(rec.checks.map((c) => [c.name, c.ok]), [["recipient", true], ["placeholders", false], ["links", false]]);
});
