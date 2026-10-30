import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { decide, logBlocked, markerSource } from "../lib/guardpolicy.ts";

export interface GuardHandle {
  port: number;
  close(): Promise<void>;
}

/**
 * A local forward proxy that sits in front of the test browser. Every request, redirect hop, sub-resource and
 * WebSocket passes through it, which is what the browser tool's own origin filter cannot guarantee (it ignores
 * redirects). Requests outside the active run's configured origins, or matching a blocked production pattern,
 * get a 403 and are logged. With no active run everything is refused.
 */
export function startGuardProxy(home: string, port = 0): Promise<GuardHandle> {
  const markers = markerSource(home);
  const deny = (method: string, url: string, reason: string, internal: boolean): void => {
    if (!internal) logBlocked(home, markers(), { method, url, reason });
  };

  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      res.writeHead(400, { "content-type": "text/plain" }).end("QAMind guard: proxy requests need an absolute URL");
      return;
    }
    const d = decide(url, markers());
    if (!d.allowed) {
      deny(req.method ?? "GET", url, d.reason, d.internal);
      res.writeHead(403, { "content-type": "text/plain", "x-qamind-guard": "blocked" }).end(`QAMind guard blocked ${target.origin}: ${d.reason}`);
      return;
    }
    const headers = { ...req.headers };
    delete headers["proxy-connection"];
    const upstream = http.request({ host: target.hostname, port: target.port || 80, path: `${target.pathname}${target.search}`, method: req.method, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });

  // HTTPS: the proxy sees only host:port, which is enough for an origin-level decision.
  server.on("connect", (req, clientSocket: net.Socket, head: Buffer) => {
    const hostPort = req.url ?? "";
    const [host = "", p = "443"] = hostPort.split(":");
    const d = decide(`https://${hostPort}`, markers());
    if (!d.allowed) {
      deny("CONNECT", `https://${hostPort}`, d.reason, d.internal);
      clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = net.connect(Number(p) || 443, host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstream.destroy());
  });

  // Plain-HTTP WebSocket upgrades.
  server.on("upgrade", (req, clientSocket: net.Socket, head: Buffer) => {
    const url = req.url ?? "";
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const d = decide(url, markers());
    if (!d.allowed) {
      deny("UPGRADE", url, d.reason, d.internal);
      clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = net.connect(Number(target.port) || 80, target.hostname, () => {
      const lines = [`${req.method} ${target.pathname}${target.search} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstream.destroy());
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ port: addr.port, close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }) });
    });
  });
}
