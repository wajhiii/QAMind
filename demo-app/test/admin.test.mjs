import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestApp } from './helpers.mjs';

describe('admin endpoints', () => {
  let t;
  before(async () => { t = await startTestApp(); });
  after(() => t.close());

  it('lets an admin move an order through its lifecycle', async () => {
    const token = await t.login('admin');
    const toProcessing = await t.call('PATCH', '/api/admin/orders/o-1004/status', { token, body: { status: 'processing' } });
    assert.equal(toProcessing.status, 200);
    assert.equal(toProcessing.json.status, 'processing');
    const toShipped = await t.call('PATCH', '/api/admin/orders/o-1004/status', { token, body: { status: 'shipped' } });
    assert.equal(toShipped.json.status, 'shipped');
    const toDelivered = await t.call('PATCH', '/api/admin/orders/o-1004/status', { token, body: { status: 'delivered' } });
    assert.equal(toDelivered.json.status, 'delivered');
  });

  it('refuses moves out of a final status or skipping a step with 409', async () => {
    const token = await t.login('admin');
    const final = await t.call('PATCH', '/api/admin/orders/o-1001/status', { token, body: { status: 'processing' } });
    assert.equal(final.status, 409);
    assert.equal(final.json.error.code, 'invalid_transition');
    const skip = await t.call('PATCH', '/api/admin/orders/o-1008/status', { token, body: { status: 'delivered' } });
    assert.equal(skip.status, 409);
  });

  it('validates the status value and the order id', async () => {
    const token = await t.login('admin');
    assert.equal((await t.call('PATCH', '/api/admin/orders/o-1008/status', { token, body: { status: 'lost' } })).status, 400);
    assert.equal((await t.call('PATCH', '/api/admin/orders/o-1008/status', { token, body: {} })).status, 400);
    assert.equal((await t.call('PATCH', '/api/admin/orders/o-9999/status', { token, body: { status: 'processing' } })).status, 404);
  });

  it('forbids clients from changing order status', async () => {
    const res = await t.call('PATCH', '/api/admin/orders/o-1002/status', { token: await t.login('acme1'), body: { status: 'delivered' } });
    assert.equal(res.status, 403);
    assert.equal(res.json.error.code, 'forbidden');
  });

  it('requires sign-in for admin endpoints', async () => {
    assert.equal((await t.call('PATCH', '/api/admin/orders/o-1002/status', { body: { status: 'delivered' } })).status, 401);
    assert.equal((await t.call('GET', '/api/admin/reports/sales')).status, 401);
    assert.equal((await t.call('GET', '/api/admin/customers')).status, 401);
  });

  it('serves the sales report to admins only, excluding cancelled orders', async () => {
    const report = await t.call('GET', '/api/admin/reports/sales', { token: await t.login('admin') });
    assert.equal(report.status, 200);
    const cancelled = t.app.store.orders.filter((order) => order.status === 'cancelled');
    const billable = t.app.store.orders.filter((order) => order.status !== 'cancelled');
    assert.equal(report.json.orders_count, billable.length);
    assert.equal(report.json.gross_cents, billable.reduce((sum, order) => sum + order.total_cents, 0));
    assert.equal(report.json.by_status.cancelled, cancelled.length);
    assert.equal(report.json.by_client.length, 3);
    const forbidden = await t.call('GET', '/api/admin/reports/sales', { token: await t.login('acme1') });
    assert.equal(forbidden.status, 403);
  });

  it('lists customers for admins', async () => {
    const res = await t.call('GET', '/api/admin/customers', { token: await t.login('admin') });
    assert.equal(res.status, 200);
    assert.equal(res.json.items.length, 3);
    assert.ok(res.json.items.every((customer) => customer.company && customer.email));
  });
});

describe('server behavior', () => {
  let t;
  before(async () => { t = await startTestApp(); });
  after(() => t.close());

  it('restores the seed data on reset', async () => {
    const token = await t.login('acme1');
    await t.call('POST', '/api/orders', { token, body: { reference: 'QA-reset', items: [{ product_id: 'p-101', quantity: 1 }] } });
    await t.call('PATCH', '/api/admin/orders/o-1004/status', { token: await t.login('admin'), body: { status: 'processing' } });
    const reset = await t.call('POST', '/__reset');
    assert.equal(reset.status, 200);
    const admin = await t.login('admin');
    const all = await t.call('GET', '/api/orders?page_size=100', { token: admin });
    assert.equal(all.json.total, 12);
    assert.equal(all.json.items.find((order) => order.id === 'o-1004').status, 'placed');
    const old = await t.call('GET', '/api/me', { token });
    assert.equal(old.status, 401);
  });

  it('keeps the reset endpoint out of the API contract', async () => {
    const spec = await t.call('GET', '/openapi.yaml');
    assert.equal(spec.status, 200);
    assert.ok(spec.text.startsWith('openapi: 3.0.3'));
    assert.ok(!spec.text.includes('__reset'));
  });

  it('answers 404 for unknown routes and 405 for wrong methods', async () => {
    const unknown = await t.call('GET', '/api/nothing-here');
    assert.equal(unknown.status, 404);
    const wrong = await t.call('DELETE', '/api/orders', { token: await t.login('admin') });
    assert.equal(wrong.status, 405);
    assert.ok(wrong.headers.get('allow').includes('GET'));
  });

  it('allows CORS only for the two portal origins', async () => {
    const adminOrigin = `http://127.0.0.1:${t.app.ports.admin}`;
    const allowed = await fetch(`${t.base}/api/health`, { headers: { Origin: adminOrigin } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), adminOrigin);
    const other = await fetch(`${t.base}/api/health`, { headers: { Origin: 'http://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(`${t.base}/api/orders`, {
      method: 'OPTIONS',
      headers: { Origin: adminOrigin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
    });
    assert.equal(preflight.status, 204);
    assert.ok(preflight.headers.get('access-control-allow-headers').includes('Authorization'));
  });
});

describe('portal pages', () => {
  let t;
  before(async () => { t = await startTestApp(); });
  after(() => t.close());

  const adminPages = ['/', '/orders.html', '/order.html', '/customers.html', '/reports.html', '/login.js', '/orders.js', '/admin.css', '/base.css', '/lumen.js', '/favicon.svg', '/favicon.ico'];
  const clientPages = ['/', '/my-orders.html', '/new-order.html', '/order.html', '/forgot-password.html', '/reset-password.html', '/client.css', '/my-orders.js', '/favicon.svg', '/favicon.ico'];

  it('serves every admin page and asset', async () => {
    for (const page of adminPages) {
      const res = await fetch(`http://127.0.0.1:${t.app.ports.admin}${page}`);
      assert.equal(res.status, 200, `admin ${page}`);
    }
  });

  it('serves every client page and asset', async () => {
    for (const page of clientPages) {
      const res = await fetch(`http://127.0.0.1:${t.app.ports.client}${page}`);
      assert.equal(res.status, 200, `client ${page}`);
    }
  });

  it('points each portal at the API through /config.js', async () => {
    const res = await fetch(`http://127.0.0.1:${t.app.ports.client}/config.js`);
    assert.ok((await res.text()).includes(`:${t.app.ports.api}/api`));
  });

  it('answers 404 for unknown pages and blocks path traversal', async () => {
    const missing = await fetch(`http://127.0.0.1:${t.app.ports.admin}/nope.html`);
    assert.equal(missing.status, 404);
    const traversal = await fetch(`http://127.0.0.1:${t.app.ports.admin}/..%2f..%2fpackage.json`);
    assert.equal(traversal.status, 404);
  });
});
