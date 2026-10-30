import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestApp } from './helpers.mjs';

describe('orders', () => {
  let t;
  before(async () => { t = await startTestApp(); });
  after(() => t.close());

  it('scopes the order list to the caller\'s company', async () => {
    const acme = await t.call('GET', '/api/orders?page_size=100', { token: await t.login('acme1') });
    const acmeTwo = await t.call('GET', '/api/orders?page_size=100', { token: await t.login('acme2') });
    const bright = await t.call('GET', '/api/orders?page_size=100', { token: await t.login('bright1') });
    assert.equal(acme.status, 200);
    assert.equal(acme.json.total, 5);
    assert.ok(acme.json.items.every((order) => order.client_id === 'c-acme'));
    assert.deepEqual(acme.json.items.map((o) => o.id), acmeTwo.json.items.map((o) => o.id));
    assert.equal(bright.json.total, 4);
    assert.ok(bright.json.items.every((order) => order.client_id === 'c-bright'));
  });

  it('lets an admin see every company\'s orders', async () => {
    const res = await t.call('GET', '/api/orders?page_size=100', { token: await t.login('admin') });
    assert.equal(res.json.total, 12);
    assert.equal(new Set(res.json.items.map((order) => order.client_id)).size, 3);
  });

  it('returns orders newest first with pagination metadata', async () => {
    const token = await t.login('admin');
    const res = await t.call('GET', '/api/orders?page=2&page_size=5', { token });
    assert.equal(res.json.page, 2);
    assert.equal(res.json.page_size, 5);
    assert.equal(res.json.total_pages, 3);
    assert.equal(res.json.items.length, 5);
    const first = await t.call('GET', '/api/orders?page=1&page_size=100', { token });
    const dates = first.json.items.map((order) => order.created_at);
    assert.deepEqual(dates, [...dates].sort().reverse());
  });

  it('returns an empty page beyond the last page', async () => {
    const res = await t.call('GET', '/api/orders?page=99&page_size=5', { token: await t.login('admin') });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.items, []);
  });

  it('filters by status and searches the reference', async () => {
    const token = await t.login('admin');
    const placed = await t.call('GET', '/api/orders?status=placed', { token });
    assert.ok(placed.json.items.length >= 3);
    assert.ok(placed.json.items.every((order) => order.status === 'placed'));
    const search = await t.call('GET', '/api/orders?q=bf-22', { token });
    assert.ok(search.json.items.length >= 3);
    assert.ok(search.json.items.every((order) => order.reference.startsWith('BF-22')));
  });

  it('rejects out-of-range page and page_size values and unknown statuses', async () => {
    const token = await t.login('admin');
    assert.equal((await t.call('GET', '/api/orders?page=0', { token })).status, 400);
    assert.equal((await t.call('GET', '/api/orders?page=abc', { token })).status, 400);
    assert.equal((await t.call('GET', '/api/orders?page_size=101', { token })).status, 400);
    assert.equal((await t.call('GET', '/api/orders?status=lost', { token })).status, 400);
  });

  it('prices an order below the discount threshold', async () => {
    const token = await t.login('acme1');
    const res = await t.call('POST', '/api/orders', {
      token,
      body: { reference: 'QA-price-1', items: [{ product_id: 'p-102', quantity: 4 }, { product_id: 'p-104', quantity: 2 }] },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.subtotal_cents, 5700);
    assert.equal(res.json.discount_cents, 0);
    assert.equal(res.json.tax_cents, 570);
    assert.equal(res.json.total_cents, 6270);
    assert.equal(res.json.status, 'placed');
    assert.equal(res.json.client_id, 'c-acme');
    assert.equal(res.headers.get('location'), `/api/orders/${res.json.id}`);
  });

  it('applies the 5% discount at exactly 1000.00', async () => {
    const token = await t.login('acme1');
    const res = await t.call('POST', '/api/orders', {
      token,
      body: { reference: 'QA-boundary', items: [{ product_id: 'p-102', quantity: 80 }] },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.subtotal_cents, 100000);
    assert.equal(res.json.discount_cents, 5000);
  });

  it('does not discount just below 1000.00', async () => {
    const token = await t.login('acme1');
    const res = await t.call('POST', '/api/orders', {
      token,
      body: { reference: 'QA-just-below', items: [{ product_id: 'p-102', quantity: 79 }, { product_id: 'p-104', quantity: 2 }] },
    });
    assert.equal(res.json.subtotal_cents, 99450);
    assert.equal(res.json.discount_cents, 0);
  });

  it('shows a newly created order in the creator\'s list straight away', async () => {
    const token = await t.login('bright1');
    const before = await t.call('GET', '/api/orders?page_size=100', { token });
    const created = await t.call('POST', '/api/orders', {
      token,
      body: { reference: 'QA-visible', items: [{ product_id: 'p-101', quantity: 1 }] },
    });
    const after = await t.call('GET', '/api/orders?page_size=100', { token });
    assert.equal(after.json.total, before.json.total + 1);
    assert.ok(after.json.items.some((order) => order.id === created.json.id));
  });

  it('requires a reference and at least a valid items array', async () => {
    const token = await t.login('acme1');
    const noReference = await t.call('POST', '/api/orders', { token, body: { items: [{ product_id: 'p-101', quantity: 1 }] } });
    assert.equal(noReference.status, 400);
    assert.equal(noReference.json.error.details[0].field, 'reference');
    const blankReference = await t.call('POST', '/api/orders', { token, body: { reference: '   ', items: [{ product_id: 'p-101', quantity: 1 }] } });
    assert.equal(blankReference.status, 400);
    const noItems = await t.call('POST', '/api/orders', { token, body: { reference: 'QA-x' } });
    assert.equal(noItems.status, 400);
    const longReference = await t.call('POST', '/api/orders', { token, body: { reference: 'x'.repeat(65), items: [{ product_id: 'p-101', quantity: 1 }] } });
    assert.equal(longReference.status, 400);
  });

  it('rejects an unknown product and a non-numeric quantity', async () => {
    const token = await t.login('acme1');
    const unknown = await t.call('POST', '/api/orders', { token, body: { reference: 'QA-x', items: [{ product_id: 'p-999', quantity: 1 }] } });
    assert.equal(unknown.status, 400);
    const text = await t.call('POST', '/api/orders', { token, body: { reference: 'QA-x', items: [{ product_id: 'p-101', quantity: 'many' }] } });
    assert.equal(text.status, 400);
  });

  it('refuses a body that is not a JSON object', async () => {
    const token = await t.login('acme1');
    const res = await t.call('POST', '/api/orders', { token, body: [] });
    assert.equal(res.status, 400);
  });

  it('forbids admins from placing orders and requires sign-in', async () => {
    const admin = await t.call('POST', '/api/orders', { token: await t.login('admin'), body: { reference: 'QA-admin', items: [{ product_id: 'p-101', quantity: 1 }] } });
    assert.equal(admin.status, 403);
    const anonymous = await t.call('POST', '/api/orders', { body: { reference: 'QA-anon', items: [{ product_id: 'p-101', quantity: 1 }] } });
    assert.equal(anonymous.status, 401);
  });

  it('returns an own order by id and 404 for an unknown id', async () => {
    const token = await t.login('acme1');
    const found = await t.call('GET', '/api/orders/o-1001', { token });
    assert.equal(found.status, 200);
    assert.equal(found.json.reference, 'PO-4410');
    assert.equal(found.json.items.length, 2);
    const missing = await t.call('GET', '/api/orders/o-9999', { token });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error.code, 'not_found');
  });

  it('lists the catalog for signed-in users only', async () => {
    const res = await t.call('GET', '/api/products', { token: await t.login('acme1') });
    assert.equal(res.status, 200);
    assert.equal(res.json.items.length, 10);
    assert.equal((await t.call('GET', '/api/products')).status, 401);
  });
});
