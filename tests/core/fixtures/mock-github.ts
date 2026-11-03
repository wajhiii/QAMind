import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A stand-in for the part of GitHub's API that `qamind ci` uses (issue comments and commit statuses of acme/shop, pull request 7), for tests and for the real-agent run of `qamind ci`.
 * Comments by "a bot" are what a workflow's GITHUB_TOKEN writes. Not a test file.
 */
export interface Comment {
  id: number;
  body: string;
  html_url: string;
  user: { type: string };
}
export interface Mock {
  url: string;
  comments: Comment[];
  statuses: Array<{ sha: string; state: string; context: string; description: string; target_url?: string }>;
  calls: string[];
  /** Refuse these methods with 403. */
  deny: Set<string>;
  tokens: Set<string>;
}

export async function startMockGithub(): Promise<{ mock: Mock; close: () => void }> {
  const mock: Mock = { url: "", comments: [], statuses: [], calls: [], deny: new Set(), tokens: new Set() };
  let nextId = 100;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      mock.calls.push(`${req.method} ${url.pathname}`);
      mock.tokens.add(String(req.headers["authorization"] ?? ""));
      const send = (code: number, json: unknown): void => void res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(json));
      if (mock.deny.has(String(req.method))) return send(403, { message: "Resource not accessible by integration" });
      const j = body ? (JSON.parse(body) as Record<string, string>) : {};
      let m: RegExpExecArray | null;
      if ((m = /^\/repos\/acme\/shop\/issues\/7\/comments$/.exec(url.pathname))) {
        if (req.method === "GET") {
          const page = Number(url.searchParams.get("page") ?? 1);
          const per = Number(url.searchParams.get("per_page") ?? 30);
          return send(200, mock.comments.slice((page - 1) * per, page * per));
        }
        const c = { id: ++nextId, body: j["body"] as string, html_url: `https://github.com/acme/shop/pull/7#issuecomment-${nextId}`, user: { type: "Bot" } };
        mock.comments.push(c);
        return send(201, c);
      }
      if ((m = /^\/repos\/acme\/shop\/issues\/comments\/(\d+)$/.exec(url.pathname)) && req.method === "PATCH") {
        const c = mock.comments.find((x) => x.id === Number(m?.[1]));
        if (!c) return send(404, { message: "Not Found" });
        c.body = j["body"] as string;
        return send(200, c);
      }
      if ((m = /^\/repos\/acme\/shop\/statuses\/(\w+)$/.exec(url.pathname)) && req.method === "POST") {
        mock.statuses.push({ sha: m[1] as string, state: j["state"] as string, context: j["context"] as string, description: j["description"] as string, ...(j["target_url"] ? { target_url: j["target_url"] } : {}) });
        return send(201, {});
      }
      send(404, { message: "not found" });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { mock, close: () => void server.close() };
}
