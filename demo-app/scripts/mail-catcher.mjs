// A tiny stand-in for Mailpit, for machines without Docker: it receives mail on SMTP (default 1025) and serves the part of
// Mailpit's JSON API (v1) that QAMind reads, on HTTP (default 8025):
//   GET /api/v1/messages        -> { total, messages_count, messages: [ { ID, From, To, Subject, Created, ... } ] }
//   GET /api/v1/message/{id}    -> { ID, From, To, Subject, Date, Text, HTML, ListUnsubscribe }
//   DELETE /api/v1/messages     -> forgets everything (used between evaluation runs)
// It is not Mailpit: it keeps messages in memory and understands only plain and simple MIME mail. Real Mailpit
// (`docker compose up`) serves the same API.
import http from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';

const smtpPort = Number(process.env.CATCHER_SMTP_PORT ?? 1025);
const httpPort = Number(process.env.CATCHER_HTTP_PORT ?? 8025);
const messages = [];

function decodeWords(v) {
  return v.replace(/=\?([\w-]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _cs, enc, body) =>
    enc.toUpperCase() === 'B' ? Buffer.from(body, 'base64').toString('utf8') : body.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_x, h) => String.fromCharCode(parseInt(h, 16))));
}

function address(raw) {
  const m = /^(.*?)<([^>]+)>\s*$/.exec(raw.trim());
  return m ? { Name: decodeWords(m[1].trim().replace(/^"|"$/g, '')), Address: m[2].trim().toLowerCase() } : { Name: '', Address: raw.trim().toLowerCase() };
}

function parse(raw, envelope) {
  const split = raw.indexOf('\r\n\r\n');
  const head = split < 0 ? raw : raw.slice(0, split);
  const body = split < 0 ? '' : raw.slice(split + 4);
  const headers = {};
  let last;
  for (const line of head.split('\r\n')) {
    if (/^[ \t]/.test(line) && last) headers[last] += ' ' + line.trim();
    else {
      const i = line.indexOf(':');
      if (i > 0) { last = line.slice(0, i).toLowerCase(); headers[last] = line.slice(i + 1).trim(); }
    }
  }
  const type = (headers['content-type'] ?? 'text/plain').toLowerCase();
  const enc = (headers['content-transfer-encoding'] ?? '').toLowerCase();
  const text = enc === 'base64' ? Buffer.from(body, 'base64').toString('utf8') : body.replace(/\r\n\.\./g, '\r\n.');
  const to = (headers.to ? headers.to.split(',').map(address) : envelope.to.map((a) => ({ Name: '', Address: a })));
  return {
    ID: randomBytes(8).toString('hex'),
    MessageID: headers['message-id'] ?? '',
    From: headers.from ? address(headers.from) : { Name: '', Address: envelope.from },
    To: to,
    Cc: [], Bcc: [], ReplyTo: [],
    Subject: decodeWords(headers.subject ?? ''),
    Created: new Date().toISOString(),
    Date: headers.date ? new Date(headers.date).toISOString() : new Date().toISOString(),
    Text: type.startsWith('text/html') ? '' : text,
    HTML: type.startsWith('text/html') ? text : '',
    ListUnsubscribe: headers['list-unsubscribe'] ? { Header: headers['list-unsubscribe'], Links: [], Errors: '', HeaderPost: '' } : { Header: '', Links: [], Errors: '', HeaderPost: '' },
    Attachments: [], Inline: [], Tags: [], Read: false, Size: Buffer.byteLength(raw), Username: '',
  };
}

const smtp = net.createServer((socket) => {
  socket.setEncoding('utf8');
  let envelope = { from: '', to: [] };
  let data = null;
  let buffer = '';
  const reply = (s) => socket.write(`${s}\r\n`);
  reply('220 demo mail catcher ready');
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      if (data !== null) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end < 0) { data += buffer; buffer = ''; return; }
        data += buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        messages.unshift(parse(data, envelope));
        data = null;
        envelope = { from: '', to: [] };
        reply('250 queued');
        continue;
      }
      const nl = buffer.indexOf('\r\n');
      if (nl < 0) return;
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') reply('250 demo');
      else if (cmd === 'MAIL') { envelope.from = (/<([^>]*)>/.exec(line) ?? [])[1]?.toLowerCase() ?? ''; reply('250 ok'); }
      else if (cmd === 'RCPT') { envelope.to.push(((/<([^>]*)>/.exec(line) ?? [])[1] ?? '').toLowerCase()); reply('250 ok'); }
      else if (cmd === 'DATA') { data = ''; reply('354 end with <CRLF>.<CRLF>'); }
      else if (cmd === 'RSET') { envelope = { from: '', to: [] }; reply('250 ok'); }
      else if (cmd === 'QUIT') { reply('221 bye'); socket.end(); return; }
      else reply('250 ok');
    }
  });
});

const api = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'DELETE' && url.pathname === '/api/v1/messages') { messages.length = 0; return send(200, 'ok'); }
  if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
  if (url.pathname === '/api/v1/messages') {
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const list = messages.slice(0, limit).map(({ Text, HTML, ListUnsubscribe, Date: _d, ...m }) => ({ ...m, Snippet: Text.slice(0, 250) }));
    return send(200, { total: messages.length, unread: messages.length, count: list.length, messages_count: messages.length, messages_unread: messages.length, start: 0, tags: [], messages: list });
  }
  const one = /^\/api\/v1\/message\/([\w]+)$/.exec(url.pathname);
  if (one) {
    const m = one[1] === 'latest' ? messages[0] : messages.find((x) => x.ID === one[1]);
    return m ? send(200, m) : send(404, { error: 'not found' });
  }
  return send(404, { error: 'not found' });
});

smtp.listen(smtpPort, '127.0.0.1', () => console.log(`mail catcher: SMTP 127.0.0.1:${smtpPort}, API http://127.0.0.1:${httpPort}/api/v1/messages`));
api.listen(httpPort, '127.0.0.1');
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(0));
