import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HttpError, readJsonBody, sendEmpty, sendError, sendJson, sleep } from './http.mjs';
import { sendMail } from './mailer.mjs';

const ORDER_STATUSES = ['placed', 'processing', 'shipped', 'delivered', 'cancelled'];
const STATUS_TRANSITIONS = {
  placed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
const ORDER_CACHE_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_ORDER_LINES = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(body) {
  if (!isPlainObject(body)) {
    throw new HttpError(400, 'validation_error', 'Request body must be a JSON object');
  }
  return body;
}

function validationError(details) {
  return new HttpError(400, 'validation_error', 'Request validation failed', { details });
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

function authenticate(ctx, req) {
  const token = bearerToken(req);
  if (!token) return null;
  const session = ctx.store.sessions.get(token);
  if (!session) return null;
  const user = ctx.store.users.find((candidate) => candidate.id === session.userId);
  return user ? { user, token } : null;
}

function publicUser(store, user) {
  const client = user.client_id ? store.clients.get(user.client_id) : null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    client_id: user.client_id,
    client_name: client ? client.name : null,
  };
}

function listClientOrders(store, clientId) {
  const hit = store.orderCache.get(clientId);
  if (hit && Date.now() - hit.at < ORDER_CACHE_TTL_MS) {
    return hit.rows;
  }
  const rows = store.orders.filter((order) => order.client_id === clientId).map((order) => ({ ...order }));
  store.orderCache.set(clientId, { at: Date.now(), rows });
  return rows;
}

function paginate(rows, page, pageSize) {
  const pages = Array.from({ length: Math.ceil(rows.length / pageSize) }, (_, index) =>
    rows.slice(index * pageSize, (index + 1) * pageSize),
  );
  return {
    items: pages[page - 1] ?? [],
    page,
    page_size: pageSize,
    total: rows.length,
    total_pages: pages.length,
  };
}

function parseListQuery(url) {
  const params = url.searchParams;
  const page = Number(params.get('page') ?? 1);
  if (!Number.isInteger(page) || page < 1) {
    throw validationError([{ field: 'page', message: 'page must be an integer of at least 1' }]);
  }
  const pageSize = Number(params.get('page_size') ?? 20);
  if (!Number.isInteger(pageSize) || pageSize > 100) {
    throw validationError([{ field: 'page_size', message: 'page_size must be an integer between 1 and 100' }]);
  }
  const status = params.get('status');
  if (status && !ORDER_STATUSES.includes(status)) {
    throw validationError([{ field: 'status', message: `status must be one of ${ORDER_STATUSES.join(', ')}` }]);
  }
  return { page, pageSize, status, q: params.get('q') };
}

function validateOrderInput(body, store) {
  const input = requireObject(body);
  const details = [];

  const reference = typeof input.reference === 'string' ? input.reference.trim() : '';
  if (reference.length < 1 || reference.length > 64) {
    details.push({ field: 'reference', message: 'reference is required and must be 1 to 64 characters' });
  }

  let note = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== 'string' || input.note.length > 500) {
      details.push({ field: 'note', message: 'note must be a string of at most 500 characters' });
    } else {
      note = input.note.trim() === '' ? null : input.note;
    }
  }

  const items = [];
  if (!Array.isArray(input.items)) {
    details.push({ field: 'items', message: 'items must be an array' });
  } else if (input.items.length > MAX_ORDER_LINES) {
    details.push({ field: 'items', message: `items must contain at most ${MAX_ORDER_LINES} lines` });
  } else {
    input.items.forEach((line, index) => {
      if (!isPlainObject(line)) {
        details.push({ field: `items[${index}]`, message: 'each item must be an object' });
        return;
      }
      if (typeof line.product_id !== 'string' || !store.productsById.has(line.product_id)) {
        details.push({ field: `items[${index}].product_id`, message: 'product_id must be the id of an existing product' });
        return;
      }
      if (typeof line.quantity !== 'number') {
        details.push({ field: `items[${index}].quantity`, message: 'quantity is required and must be a number' });
        return;
      }
      items.push({ product_id: line.product_id, quantity: line.quantity });
    });
  }

  if (details.length > 0) {
    throw validationError(details);
  }
  return { reference, note, items };
}

function health() {
  return { status: 200, body: { status: 'ok', version: '1.0.0', time: new Date().toISOString() } };
}

async function login({ ctx, body }) {
  const { email, password } = requireObject(body);
  if (typeof email !== 'string' || typeof password !== 'string' || email === '' || password === '') {
    throw validationError([{ field: 'email', message: 'email and password are required' }]);
  }
  const user = ctx.store.users.find((candidate) => candidate.email === email.trim().toLowerCase());
  if (!user || !safeEqual(user.password, password)) {
    throw new HttpError(401, 'invalid_credentials', 'Invalid email or password');
  }
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  ctx.store.sessions.set(token, {
    userId: user.id,
    createdAt: now,
    expiresAt: now + ctx.config.sessionTtlSeconds * 1000,
  });
  return {
    status: 200,
    body: {
      token,
      token_type: 'Bearer',
      expires_in: ctx.config.sessionTtlSeconds,
      user: publicUser(ctx.store, user),
    },
  };
}

function logout({ ctx, token }) {
  const session = ctx.store.sessions.get(token);
  session.endedAt = Date.now();
  return { status: 204 };
}

function me({ ctx, user }) {
  return { status: 200, body: publicUser(ctx.store, user) };
}

function products({ ctx }) {
  return { status: 200, body: { items: ctx.store.products } };
}

async function forgotPassword({ ctx, body }) {
  const { email } = requireObject(body);
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    throw validationError([{ field: 'email', message: 'email must be a valid email address' }]);
  }
  const user = ctx.store.users.find((candidate) => candidate.email === email.trim().toLowerCase());
  if (user) {
    const resetToken = crypto.randomBytes(16).toString('hex');
    ctx.store.resetTokens.set(resetToken, { userId: user.id, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });
    const link = `${ctx.getClientBaseUrl()}/reset?token=${user.resetToken}`;
    try {
      await sendMail({
        host: ctx.config.smtp.host,
        port: ctx.config.smtp.port,
        from: 'no-reply@lumen.test',
        to: user.email,
        subject: 'Reset your Lumen Supplies password',
        text: [
          `Hello ${user.name},`,
          '',
          'We received a request to reset your Lumen Supplies password. Use the link below to choose a new one:',
          '',
          link,
          '',
          'If you did not ask for this, you can ignore this message.',
        ].join('\n'),
      });
    } catch (err) {
      console.error(`Could not deliver password reset email: ${err.message}`);
    }
  }
  return { status: 202, body: { message: 'If that address is registered, a reset link is on its way.' } };
}

function resetPassword({ ctx, body }) {
  const { token, password } = requireObject(body);
  const details = [];
  if (typeof password !== 'string' || password.length < 8) {
    details.push({ field: 'password', message: 'password must be at least 8 characters' });
  }
  if (details.length > 0) {
    throw validationError(details);
  }
  const entry = typeof token === 'string' ? ctx.store.resetTokens.get(token) : undefined;
  if (!entry || entry.expiresAt < Date.now()) {
    throw new HttpError(400, 'invalid_token', 'This reset link is invalid or has expired');
  }
  const user = ctx.store.users.find((candidate) => candidate.id === entry.userId);
  user.password = password;
  ctx.store.resetTokens.delete(token);
  return { status: 204 };
}

function listOrders({ ctx, user, url }) {
  const { page, pageSize, status, q } = parseListQuery(url);
  let rows = user.role === 'admin' ? ctx.store.orders : listClientOrders(ctx.store, user.client_id);
  if (status) {
    rows = rows.filter((order) => order.status === status);
  }
  if (q) {
    const matcher = new RegExp(q, 'i');
    rows = rows.filter((order) => matcher.test(order.reference) || matcher.test(order.note ?? ''));
  }
  rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return { status: 200, body: paginate(rows, page, pageSize) };
}

async function createOrder({ ctx, user, body }) {
  const input = validateOrderInput(body, ctx.store);
  await sleep(ctx.config.latency.orderCreateMs);
  const order = ctx.store.addOrder({ clientId: user.client_id, ...input });
  return { status: 201, body: order, headers: { Location: `/api/orders/${order.id}` } };
}

function getOrder({ ctx, params }) {
  const order = ctx.store.orders.find((candidate) => candidate.id === params.id);
  if (!order) {
    throw new HttpError(404, 'not_found', 'Order not found');
  }
  return { status: 200, body: order };
}

function updateOrderStatus({ ctx, params, body }) {
  const { status } = requireObject(body);
  if (!ORDER_STATUSES.includes(status)) {
    throw validationError([{ field: 'status', message: `status must be one of ${ORDER_STATUSES.join(', ')}` }]);
  }
  const order = ctx.store.orders.find((candidate) => candidate.id === params.id);
  if (!order) {
    throw new HttpError(404, 'not_found', 'Order not found');
  }
  if (!STATUS_TRANSITIONS[order.status].includes(status)) {
    throw new HttpError(409, 'invalid_transition', `An order that is ${order.status} cannot be changed to ${status}`);
  }
  order.status = status;
  return { status: 200, body: order };
}

function listCustomers({ ctx }) {
  const items = ctx.store.customers.map((customer) => ({
    ...customer,
    company: ctx.store.clients.get(customer.client_id).name,
  }));
  return { status: 200, body: { items } };
}

async function salesReport({ ctx }) {
  await sleep(ctx.config.latency.salesReportMs);
  const { orders, clients } = ctx.store;
  const billable = orders.filter((order) => order.status !== 'cancelled');
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
  for (const order of orders) byStatus[order.status] += 1;
  const byClient = [...clients.values()].map((client) => {
    const own = billable.filter((order) => order.client_id === client.id);
    return {
      client_id: client.id,
      client_name: client.name,
      orders: own.length,
      total_cents: own.reduce((sum, order) => sum + order.total_cents, 0),
    };
  });
  const productTotals = new Map();
  for (const order of billable) {
    for (const item of order.items) {
      const entry = productTotals.get(item.product_id) ?? { product_id: item.product_id, name: item.name, quantity: 0 };
      entry.quantity += item.quantity;
      productTotals.set(item.product_id, entry);
    }
  }
  const topProducts = [...productTotals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  return {
    status: 200,
    body: {
      generated_at: new Date().toISOString(),
      currency: 'USD',
      orders_count: billable.length,
      gross_cents: billable.reduce((sum, order) => sum + order.total_cents, 0),
      by_status: byStatus,
      by_client: byClient,
      top_products: topProducts,
    },
  };
}

function route(method, pattern, options, handler) {
  const regex = new RegExp(`^${pattern.replace(/\{(\w+)\}/g, '(?<$1>[^/]+)')}$`);
  return { method, regex, options, handler };
}

const ROUTES = [
  route('GET', '/api/health', { auth: false }, health),
  route('POST', '/api/auth/login', { auth: false }, login),
  route('POST', '/api/auth/logout', {}, logout),
  route('POST', '/api/auth/forgot-password', { auth: false }, forgotPassword),
  route('POST', '/api/auth/reset-password', { auth: false }, resetPassword),
  route('GET', '/api/me', {}, me),
  route('GET', '/api/products', {}, products),
  route('GET', '/api/orders', {}, listOrders),
  route('POST', '/api/orders', { roles: ['client'] }, createOrder),
  route('GET', '/api/orders/{id}', {}, getOrder),
  route('PATCH', '/api/admin/orders/{id}/status', { roles: ['admin'] }, updateOrderStatus),
  route('GET', '/api/admin/customers', {}, listCustomers),
  route('GET', '/api/admin/reports/sales', { roles: ['admin'] }, salesReport),
];

function applyCors(ctx, req, res) {
  const origin = req.headers.origin;
  if (origin && ctx.getAllowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function createApiHandler(ctx) {
  const specPath = new URL('../openapi.yaml', import.meta.url);

  return async function handle(req, res) {
    applyCors(ctx, req, res);
    const url = new URL(req.url, 'http://localhost');

    try {
      if (req.method === 'OPTIONS') {
        sendEmpty(res, 204);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/openapi.yaml') {
        const spec = readFileSync(specPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/yaml; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(spec);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/__reset') {
        if (!isLoopback(req.socket.remoteAddress)) {
          throw new HttpError(403, 'forbidden', 'Reset is only available from the local machine');
        }
        ctx.store.reset();
        sendJson(res, 200, { status: 'reset' });
        return;
      }

      const matching = ROUTES.filter((candidate) => candidate.regex.test(url.pathname));
      if (matching.length === 0) {
        throw new HttpError(404, 'not_found', 'Route not found');
      }
      const found = matching.find((candidate) => candidate.method === req.method);
      if (!found) {
        const allow = matching.map((candidate) => candidate.method).join(', ');
        sendError(res, new HttpError(405, 'method_not_allowed', 'Method not allowed'), { Allow: allow });
        return;
      }

      let session = null;
      if (found.options.auth !== false) {
        session = authenticate(ctx, req);
        if (!session) {
          throw new HttpError(401, 'unauthorized', 'Authentication is required');
        }
        if (found.options.roles && !found.options.roles.includes(session.user.role)) {
          throw new HttpError(403, 'forbidden', 'You do not have permission to perform this action');
        }
      }

      const body = ['POST', 'PATCH'].includes(req.method) ? await readJsonBody(req) : undefined;
      const params = url.pathname.match(found.regex).groups ?? {};
      const result = await found.handler({
        ctx,
        req,
        url,
        params,
        body,
        user: session?.user,
        token: session?.token,
      });

      if (result.status === 204) {
        sendEmpty(res, 204);
      } else {
        sendJson(res, result.status, result.body, result.headers);
      }
    } catch (err) {
      if (err instanceof HttpError) {
        sendError(res, err);
        return;
      }
      console.error(err);
      sendError(res, new HttpError(500, 'internal_error', 'Something went wrong'));
    }
  };
}
