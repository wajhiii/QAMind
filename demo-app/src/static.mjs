import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found - Lumen Supplies</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"></head>
<body style="font-family: system-ui, sans-serif; padding: 2rem"><h1>Page not found</h1><p><a href="/">Back to the start page</a></p></body></html>`;

function hostnameOf(req) {
  try {
    return new URL(`http://${req.headers.host}`).hostname;
  } catch {
    return '127.0.0.1';
  }
}

export function createStaticHandler({ roots, getApiPort }) {
  return async function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    if (pathname === '/config.js') {
      const config = { apiBase: `http://${hostnameOf(req)}:${getApiPort()}/api` };
      const body = `window.APP_CONFIG = ${JSON.stringify(config)};\n`;
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.js'], 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }

    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/favicon.ico') pathname = '/favicon.svg';

    for (const root of roots) {
      const file = path.join(root, pathname);
      if (!file.startsWith(root + path.sep)) continue;
      try {
        const info = await stat(file);
        if (!info.isFile()) continue;
        res.writeHead(200, {
          'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
          'Content-Length': info.size,
          'Cache-Control': pathname === '/favicon.svg' ? 'public, max-age=3600' : 'no-cache',
        });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          createReadStream(file).pipe(res);
        }
        return;
      } catch {
        continue;
      }
    }

    res.writeHead(404, { 'Content-Type': CONTENT_TYPES['.html'] });
    res.end(req.method === 'HEAD' ? undefined : NOT_FOUND_PAGE);
  };
}
