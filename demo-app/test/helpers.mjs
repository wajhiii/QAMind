import { startApp } from '../src/app.mjs';

export const ACCOUNTS = {
  admin: { email: 'admin@lumen.test', password: 'Lumen-Admin-2026' },
  acme1: { email: 'a1@acme.test', password: 'Acme-One-2026' },
  acme2: { email: 'a2@acme.test', password: 'Acme-Two-2026' },
  bright1: { email: 'b1@bright.test', password: 'Bright-One-2026' },
  zain1: { email: 'z1@zain.test', password: 'Zain-One-2026' },
};

export async function startTestApp(options = {}) {
  const app = await startApp({
    apiPort: 0,
    adminPort: 0,
    clientPort: 0,
    smtp: { host: '127.0.0.1', port: 1 },
    latency: { orderCreateMs: 0, salesReportMs: 0 },
    ...options,
  });
  const base = `http://127.0.0.1:${app.ports.api}`;

  async function call(method, path, { token, body, headers = {}, raw } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = raw ? body : JSON.stringify(body);
    }
    const res = await fetch(`${base}${path}`, init);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  async function login(account) {
    const { email, password } = ACCOUNTS[account];
    const res = await call('POST', '/api/auth/login', { body: { email, password } });
    if (res.status !== 200) throw new Error(`login failed for ${account}: ${res.status}`);
    return res.json.token;
  }

  return { app, base, call, login, close: () => app.close() };
}
