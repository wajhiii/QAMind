import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ACCOUNTS, startTestApp } from './helpers.mjs';

describe('authentication', () => {
  let t;
  before(async () => { t = await startTestApp(); });
  after(() => t.close());

  it('reports health without a token', async () => {
    const res = await t.call('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
  });

  it('signs in with valid credentials and returns the user', async () => {
    const res = await t.call('POST', '/api/auth/login', { body: ACCOUNTS.acme1 });
    assert.equal(res.status, 200);
    assert.equal(res.json.token_type, 'Bearer');
    assert.equal(res.json.expires_in, 900);
    assert.equal(res.json.user.role, 'client');
    assert.equal(res.json.user.client_name, 'Acme Traders');
    assert.equal(res.json.user.password, undefined);
  });

  it('rejects a wrong password with 401 and a generic message', async () => {
    const res = await t.call('POST', '/api/auth/login', { body: { email: ACCOUNTS.acme1.email, password: 'nope' } });
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'invalid_credentials');
  });

  it('rejects an unknown email the same way as a wrong password', async () => {
    const res = await t.call('POST', '/api/auth/login', { body: { email: 'ghost@acme.test', password: 'x' } });
    assert.equal(res.status, 401);
    assert.equal(res.json.error.message, 'Invalid email or password');
  });

  it('rejects a login body with a missing password with 400', async () => {
    const res = await t.call('POST', '/api/auth/login', { body: { email: ACCOUNTS.acme1.email } });
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, 'validation_error');
  });

  it('returns the current user from /me', async () => {
    const token = await t.login('bright1');
    const res = await t.call('GET', '/api/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.json.email, ACCOUNTS.bright1.email);
    assert.equal(res.json.client_id, 'c-bright');
  });

  it('answers 401 when no token or an unknown token is sent', async () => {
    assert.equal((await t.call('GET', '/api/me')).status, 401);
    assert.equal((await t.call('GET', '/api/orders', { token: 'not-a-real-token' })).status, 401);
  });

  it('answers 401 for a malformed Authorization header', async () => {
    const res = await t.call('GET', '/api/me', { headers: { Authorization: 'Token abc' } });
    assert.equal(res.status, 401);
  });
});

describe('password reset', () => {
  let t;
  before(async () => { t = await startTestApp(); });
  after(() => t.close());

  it('answers 202 for a registered and an unregistered address', async () => {
    const known = await t.call('POST', '/api/auth/forgot-password', { body: { email: ACCOUNTS.acme1.email } });
    const unknown = await t.call('POST', '/api/auth/forgot-password', { body: { email: 'nobody@acme.test' } });
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(known.json, unknown.json);
  });

  it('rejects a malformed email address with 400', async () => {
    const res = await t.call('POST', '/api/auth/forgot-password', { body: { email: 'not-an-email' } });
    assert.equal(res.status, 400);
  });

  it('changes the password with a valid token and rejects reuse', async () => {
    await t.call('POST', '/api/auth/forgot-password', { body: { email: ACCOUNTS.zain1.email } });
    const [token] = [...t.app.store.resetTokens.entries()].find(([, entry]) => entry.userId === 'u-z1');
    const changed = await t.call('POST', '/api/auth/reset-password', { body: { token, password: 'Zain-New-2026' } });
    assert.equal(changed.status, 204);
    const relogin = await t.call('POST', '/api/auth/login', { body: { email: ACCOUNTS.zain1.email, password: 'Zain-New-2026' } });
    assert.equal(relogin.status, 200);
    const reuse = await t.call('POST', '/api/auth/reset-password', { body: { token, password: 'Another-2026' } });
    assert.equal(reuse.status, 400);
    assert.equal(reuse.json.error.code, 'invalid_token');
  });

  it('rejects an unknown token and a too-short password', async () => {
    const unknown = await t.call('POST', '/api/auth/reset-password', { body: { token: 'abc', password: 'long-enough-1' } });
    assert.equal(unknown.status, 400);
    const short = await t.call('POST', '/api/auth/reset-password', { body: { token: 'abc', password: 'short' } });
    assert.equal(short.status, 400);
    assert.equal(short.json.error.code, 'validation_error');
  });
});
