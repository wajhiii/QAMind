// A stand-in for a Git host (GitHub, GitLab), for QAMind's own install checks. It is NOT GitHub: it serves the bare repositories in a folder over smart HTTP by running `git http-backend`,
// so a client that clones with --depth 1 (as Claude Code does for a marketplace) works. Nothing is ever pushed to it (receive-pack is not enabled).
//   node scripts/standins/git-http-server.mjs <folder holding qamind.git> [port]     then: http://127.0.0.1:<port>/qamind.git
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 8765);

http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const backend = spawn('git', ['http-backend'], {
    env: {
      PATH: process.env.PATH,
      GIT_PROJECT_ROOT: root,
      GIT_HTTP_EXPORT_ALL: '1',
      REQUEST_METHOD: req.method,
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      CONTENT_TYPE: req.headers['content-type'] ?? '',
      CONTENT_LENGTH: req.headers['content-length'] ?? '',
      HTTP_CONTENT_ENCODING: req.headers['content-encoding'] ?? '',
      GIT_PROTOCOL: req.headers['git-protocol'] ?? '',
      REMOTE_USER: 'standin',
      REMOTE_ADDR: '127.0.0.1',
    },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  req.pipe(backend.stdin);
  let head = Buffer.alloc(0);
  let sent = false;
  backend.stdout.on('data', (chunk) => {
    if (sent) return void res.write(chunk);
    head = Buffer.concat([head, chunk]);
    const end = head.indexOf('\r\n\r\n');
    const alt = head.indexOf('\n\n');
    const cut = end >= 0 ? end + 4 : alt >= 0 ? alt + 2 : -1;
    if (cut < 0) return;
    const lines = head.slice(0, cut).toString('utf8').split(/\r?\n/).filter(Boolean);
    let status = 200;
    const headers = {};
    for (const l of lines) {
      const i = l.indexOf(':');
      if (i < 0) continue;
      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim();
      if (k.toLowerCase() === 'status') status = Number(v.split(' ')[0]);
      else headers[k] = v;
    }
    res.writeHead(status, headers);
    sent = true;
    res.write(head.slice(cut));
  });
  backend.stdout.on('end', () => res.end());
  backend.on('error', () => res.writeHead(500).end());
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} at http://127.0.0.1:${port}/`));
