import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { startApp } from '../src/app.mjs';

function startFakeSmtp() {
  const messages = [];
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let inData = false;
    let current = '';
    socket.write('220 fake-smtp ready\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk;
      let end = buffer.indexOf('\r\n');
      while (end !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf('\r\n');
        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(current);
            current = '';
            socket.write('250 queued\r\n');
          } else {
            current += `${line}\n`;
          }
        } else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write('354 go ahead\r\n');
        } else if (/^QUIT/i.test(line)) {
          socket.write('221 bye\r\n');
          socket.end();
        } else {
          socket.write('250 ok\r\n');
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ messages, port: server.address().port, close: () => server.close() }));
  });
}

const smtp = await startFakeSmtp();
const app = await startApp({ apiPort: 0, adminPort: 0, clientPort: 0, smtp: { host: '127.0.0.1', port: smtp.port } });
const base = `http://127.0.0.1:${app.ports.api}`;

async function call(method, path, { token, body, rawBody } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (rawBody !== undefined) {
    payload = rawBody;
    headers['Content-Type'] = 'application/json';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${base}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

const PASSWORDS = {
  'admin@lumen.test': 'Lumen-Admin-2026',
  'a1@acme.test': 'Acme-One-2026',
  'b1@bright.test': 'Bright-One-2026',
};

async function login(email) {
  const res = await call('POST', '/api/auth/login', { body: { email, password: PASSWORDS[email] } });
  return res.json.token;
}

const checks = [
  {
    id: 'DB-01',
    title: 'Order validation accepts bad quantities and empty items',
    async run() {
      const token = await login('a1@acme.test');
      const accepted = [];
      const cases = {
        'quantity 0': [{ product_id: 'p-101', quantity: 0 }],
        'quantity -5': [{ product_id: 'p-101', quantity: -5 }],
        'quantity 1.5': [{ product_id: 'p-101', quantity: 1.5 }],
        'quantity 5000': [{ product_id: 'p-101', quantity: 5000 }],
        'empty items': [],
      };
      for (const [label, items] of Object.entries(cases)) {
        const res = await call('POST', '/api/orders', { token, body: { reference: `QA-eval-01-${label}`, items } });
        if (res.status === 201) accepted.push(label);
      }
      return { present: accepted.length === Object.keys(cases).length, detail: `accepted: ${accepted.join(', ') || 'none'}` };
    },
  },
  {
    id: 'DB-02',
    title: 'Tax is computed before the discount',
    async run() {
      const token = await login('a1@acme.test');
      const res = await call('POST', '/api/orders', { token, body: { reference: 'QA-eval-02', items: [{ product_id: 'p-102', quantity: 100 }] } });
      const order = res.json;
      const expectedTax = Math.round((order.subtotal_cents - order.discount_cents) * 0.1);
      return { present: order.tax_cents !== expectedTax, detail: `tax ${order.tax_cents}, expected ${expectedTax}` };
    },
  },
  {
    id: 'DB-03',
    title: 'Order detail readable across companies (IDOR)',
    async run() {
      const res = await call('GET', '/api/orders/o-1001', { token: await login('b1@bright.test') });
      return { present: res.status === 200, detail: `Bright account read an Acme order: HTTP ${res.status}` };
    },
  },
  {
    id: 'DB-04',
    title: 'Client token can read admin customer records',
    async run() {
      const res = await call('GET', '/api/admin/customers', { token: await login('a1@acme.test') });
      const control = await call('GET', '/api/admin/reports/sales', { token: await login('a1@acme.test') });
      return { present: res.status === 200 && control.status === 403, detail: `customers HTTP ${res.status}, reports HTTP ${control.status}` };
    },
  },
  {
    id: 'DB-05',
    title: 'Client order list stays stale after an admin status change',
    async run() {
      app.store.reset();
      const client = await login('a1@acme.test');
      const admin = await login('admin@lumen.test');
      await call('GET', '/api/orders?page_size=100', { token: client });
      await call('PATCH', '/api/admin/orders/o-1004/status', { token: admin, body: { status: 'processing' } });
      const clientList = await call('GET', '/api/orders?page_size=100', { token: client });
      const adminList = await call('GET', '/api/orders?page_size=100', { token: admin });
      const clientDetail = await call('GET', '/api/orders/o-1004', { token: client });
      const staleStatus = clientList.json.items.find((order) => order.id === 'o-1004').status;
      const adminStatus = adminList.json.items.find((order) => order.id === 'o-1004').status;
      return {
        present: staleStatus === 'placed' && adminStatus === 'processing' && clientDetail.json.status === 'processing',
        detail: `client list ${staleStatus}, admin list ${adminStatus}, client detail ${clientDetail.json.status}`,
      };
    },
  },
  {
    id: 'DB-06',
    title: 'Search with regex characters or page_size=0 returns 500',
    async run() {
      const token = await login('a1@acme.test');
      const search = await call('GET', `/api/orders?q=${encodeURIComponent('(')}`, { token });
      const size = await call('GET', '/api/orders?page_size=0', { token });
      return { present: search.status === 500 && size.status === 500, detail: `q=( HTTP ${search.status}, page_size=0 HTTP ${size.status}` };
    },
  },
  {
    id: 'DB-07',
    title: 'Duplicate order on double submit',
    async run() {
      app.store.reset();
      const token = await login('a1@acme.test');
      const body = { reference: 'QA-eval-07', items: [{ product_id: 'p-101', quantity: 2 }] };
      const [first, second] = await Promise.all([call('POST', '/api/orders', { token, body }), call('POST', '/api/orders', { token, body })]);
      const list = await call('GET', '/api/orders?q=QA-eval-07', { token });
      return {
        present: first.status === 201 && second.status === 201 && list.json.total === 2,
        detail: `${list.json.total} orders with the same reference from two identical requests`,
      };
    },
  },
  {
    id: 'DB-10',
    title: 'Malformed JSON response leaks a stack trace and file paths',
    async run() {
      const token = await login('a1@acme.test');
      const res = await call('POST', '/api/orders', { token, rawBody: '{"reference": ' });
      const leaked = /\.mjs:\d+/.test(res.text) || res.text.includes('file:///');
      return { present: leaked, detail: `HTTP ${res.status}, stack/paths in body: ${leaked}` };
    },
  },
  {
    id: 'DB-12',
    title: 'Sessions survive logout and never expire',
    async run() {
      const token = await login('a1@acme.test');
      await call('POST', '/api/auth/logout', { token });
      const afterLogout = await call('GET', '/api/me', { token });

      const shortLived = await startApp({
        apiPort: 0, adminPort: 0, clientPort: 0, sessionTtlSeconds: 1,
        smtp: { host: '127.0.0.1', port: smtp.port },
      });
      try {
        const shortBase = `http://127.0.0.1:${shortLived.ports.api}`;
        const loginRes = await fetch(`${shortBase}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'a1@acme.test', password: PASSWORDS['a1@acme.test'] }),
        });
        const { token: shortToken } = await loginRes.json();
        await delay(1500);
        const afterExpiry = await fetch(`${shortBase}/api/me`, { headers: { Authorization: `Bearer ${shortToken}` } });
        return {
          present: afterLogout.status === 200 && afterExpiry.status === 200,
          detail: `after logout HTTP ${afterLogout.status}, 1.5s after a 1s TTL HTTP ${afterExpiry.status}`,
        };
      } finally {
        await shortLived.close();
      }
    },
  },
  {
    id: 'DB-13',
    title: 'Sales report takes about 4 seconds',
    async run() {
      const token = await login('admin@lumen.test');
      const started = Date.now();
      await call('GET', '/api/admin/reports/sales', { token });
      const elapsed = Date.now() - started;
      return { present: elapsed >= 3000, detail: `${elapsed} ms` };
    },
  },
  {
    id: 'DB-14',
    title: 'Password reset email contains a broken link',
    async run() {
      smtp.messages.length = 0;
      const res = await call('POST', '/api/auth/forgot-password', { body: { email: 'a1@acme.test' } });
      await delay(200);
      const message = smtp.messages[0] ?? '';
      const link = message.split('\n').find((line) => line.startsWith('http')) ?? '';
      const valid = new RegExp(`^http://127\\.0\\.0\\.1:${app.ports.client}/reset-password\\.html\\?token=[0-9a-f]{32}$`).test(link);
      return { present: res.status === 202 && link !== '' && !valid, detail: `link in email: ${link || '(no email captured)'}` };
    },
  },
  {
    id: 'DB-17',
    title: 'Customer records expose personal data (masking fixture)',
    async run() {
      const res = await call('GET', '/api/admin/customers', { token: await login('admin@lumen.test') });
      const text = JSON.stringify(res.json);
      const hasCnic = /\d{5}-\d{7}-\d/.test(text);
      const hasCard = /\d{4} \d{4} \d{4} \d{4}/.test(text);
      return { present: hasCnic && hasCard, detail: `CNIC pattern ${hasCnic}, full card number ${hasCard}` };
    },
  },
];

const manual = [
  ['DB-08', 'New Order form overflows at mobile width (needs a 390px browser viewport)'],
  ['DB-09', 'Missing accessible names on admin search, icon buttons and the client product select (needs an a11y check in a browser)'],
  ['DB-11', 'Urdu text is forced left-to-right and truncated in tables and detail pages (needs a browser)'],
  ['DB-15', 'My Orders first row hidden at <=480px (needs a mobile screenshot or visual diff)'],
  ['DB-16', 'Order detail date shows "Invalid Date" in WebKit only (needs a WebKit browser)'],
];

let failures = 0;
console.log('Seeded bug presence (API-testable)\n');
for (const check of checks) {
  let outcome;
  try {
    outcome = await check.run();
  } catch (err) {
    outcome = { present: false, detail: `check crashed: ${err.message}` };
  }
  if (!outcome.present) failures += 1;
  console.log(`${outcome.present ? 'PRESENT' : 'ABSENT '}  ${check.id}  ${check.title}\n         ${outcome.detail}`);
}

console.log('\nManual (need a browser)\n');
for (const [id, title] of manual) {
  console.log(`MANUAL   ${id}  ${title}`);
}

await app.close();
smtp.close();

if (failures > 0) {
  console.error(`\n${failures} expected bug(s) were not found.`);
  process.exit(1);
}
console.log('\nAll API-testable seeded bugs are present.');
