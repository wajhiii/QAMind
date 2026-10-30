import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './api.mjs';
import { createStaticHandler } from './static.mjs';
import { createStore } from './store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';

function envNumber(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : Number(raw);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

export async function startApp(options = {}) {
  const config = {
    apiPort: options.apiPort ?? envNumber('DEMO_API_PORT', 4100),
    adminPort: options.adminPort ?? envNumber('DEMO_ADMIN_PORT', 4101),
    clientPort: options.clientPort ?? envNumber('DEMO_CLIENT_PORT', 4102),
    sessionTtlSeconds: options.sessionTtlSeconds ?? envNumber('DEMO_SESSION_TTL_SECONDS', 900),
    smtp: {
      host: options.smtp?.host ?? process.env.DEMO_SMTP_HOST ?? '127.0.0.1',
      port: options.smtp?.port ?? envNumber('DEMO_SMTP_PORT', 1025),
    },
    latency: {
      orderCreateMs: options.latency?.orderCreateMs ?? 800,
      salesReportMs: options.latency?.salesReportMs ?? 4000,
    },
    seedFile: options.seedFile ?? path.join(ROOT, 'data', 'seed.json'),
    publicClientUrl: options.publicClientUrl ?? process.env.DEMO_PUBLIC_CLIENT_URL,
  };

  const ports = { api: 0, admin: 0, client: 0 };
  const store = createStore(config.seedFile);
  const ctx = {
    store,
    config,
    getAllowedOrigins: () =>
      ['127.0.0.1', 'localhost'].flatMap((host) => [`http://${host}:${ports.admin}`, `http://${host}:${ports.client}`]),
    getClientBaseUrl: () => config.publicClientUrl ?? `http://${HOST}:${ports.client}`,
  };

  const sharedRoot = path.join(ROOT, 'public', 'shared');
  const servers = {
    api: http.createServer(createApiHandler(ctx)),
    admin: http.createServer(
      createStaticHandler({ roots: [path.join(ROOT, 'public', 'admin'), sharedRoot], getApiPort: () => ports.api }),
    ),
    client: http.createServer(
      createStaticHandler({ roots: [path.join(ROOT, 'public', 'client'), sharedRoot], getApiPort: () => ports.api }),
    ),
  };

  ports.api = await listen(servers.api, config.apiPort);
  ports.admin = await listen(servers.admin, config.adminPort);
  ports.client = await listen(servers.client, config.clientPort);

  return {
    ports,
    store,
    config,
    async close() {
      await Promise.all(
        Object.values(servers).map(
          (server) =>
            new Promise((resolve) => {
              server.closeAllConnections();
              server.close(() => resolve());
            }),
        ),
      );
    },
  };
}
