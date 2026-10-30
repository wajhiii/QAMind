import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";
import { writeJson } from "../../core/lib/fsutil.ts";
import { readBlocked } from "../../core/lib/guardpolicy.ts";
import { decidePreToolUse } from "../../core/lib/hooks.ts";
import { markerPath } from "../../core/lib/run.ts";
import type { RunMarker } from "../../core/lib/run.ts";
import { startGuardProxy } from "../../core/scripts/guard-proxy.ts";
import { tmp } from "./helpers.ts";

function marker(home: string, project: string, over: Partial<RunMarker> = {}): RunMarker {
  const store = path.join(home, "projects", "p1");
  const m: RunMarker = {
    schema_version: 1, run_id: "run-1", project_id: "p1", project_root: project, store, run_dir: path.join(project, ".qa", "reports", "run-1"),
    mode: "quick", kind: "qa-only", readonly: true, trigger: "manual", host: "test", session_id: "S1",
    started: new Date().toISOString(), expires: new Date(Date.now() + 3600_000).toISOString(),
    policy: { allowed_origins: [], blocked_patterns: [] }, ...over,
  };
  writeJson(markerPath(store), m);
  return m;
}

// ---- guard proxy: the redirect-to-production case is the reason it exists ----
let app: http.Server;
let prod: http.Server;
let appOrigin = "";
let prodOrigin = "";
let prodHits = 0;

before(async () => {
  prod = http.createServer((_req, res) => {
    prodHits++;
    res.end("PRODUCTION");
  });
  await new Promise<void>((r) => prod.listen(0, "127.0.0.1", r));
  prodOrigin = `http://127.0.0.1:${(prod.address() as AddressInfo).port}`;
  app = http.createServer((req, res) => {
    if (req.url === "/to-prod") {
      res.writeHead(302, { location: `${prodOrigin}/` });
      return res.end();
    }
    res.end("APP");
  });
  await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
  appOrigin = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});
after(() => {
  app.close();
  prod.close();
});

function viaProxy(proxyPort: number, url: string): Promise<{ status: number; body: string; location?: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: "127.0.0.1", port: proxyPort, method: "GET", path: url, headers: { host: u.host } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, ...(res.headers.location ? { location: String(res.headers.location) } : {}) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("guard proxy: locked with no run; allows the configured origin; blocks other origins; logs what it blocked", async () => {
  const home = tmp("qamind-home-");
  const guard = await startGuardProxy(home);
  try {
    assert.equal((await viaProxy(guard.port, `${appOrigin}/`)).status, 403, "fails closed when no run is active");
    marker(home, tmp(), { policy: { allowed_origins: [appOrigin], blocked_patterns: [] } });
    await new Promise((r) => setTimeout(r, 1100)); // the proxy caches markers for ~1s
    const ok = await viaProxy(guard.port, `${appOrigin}/`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body, "APP");
    assert.equal((await viaProxy(guard.port, `${prodOrigin}/`)).status, 403);
    assert.equal(prodHits, 0, "the other origin was never contacted");
    const blocked = readBlocked(path.join(home, "projects", "p1"), "run-1");
    assert.ok(blocked.some((b) => b.url.startsWith(prodOrigin)));
  } finally {
    await guard.close();
  }
});

test("guard proxy: a redirect from an allowed origin to a blocked one never reaches the blocked server", async () => {
  const home = tmp("qamind-home-");
  marker(home, tmp(), { policy: { allowed_origins: [appOrigin], blocked_patterns: [] } });
  const guard = await startGuardProxy(home);
  try {
    const hop1 = await viaProxy(guard.port, `${appOrigin}/to-prod`);
    assert.equal(hop1.status, 302);
    const before = prodHits;
    const hop2 = await viaProxy(guard.port, hop1.location as string); // what the browser does next
    assert.equal(hop2.status, 403);
    assert.equal(prodHits, before, "production was not contacted");
  } finally {
    await guard.close();
  }
});

test("guard proxy: HTTPS tunnels to a non-allowed host are refused; a blocked pattern beats an allowed origin", async () => {
  const home = tmp("qamind-home-");
  marker(home, tmp(), { policy: { allowed_origins: [appOrigin, "https://www.shop.com"], blocked_patterns: ["www.shop.com"] } });
  const guard = await startGuardProxy(home);
  try {
    const reply = await new Promise<string>((resolve, reject) => {
      const s = net.connect(guard.port, "127.0.0.1", () => s.write("CONNECT www.shop.com:443 HTTP/1.1\r\nHost: www.shop.com:443\r\n\r\n"));
      let data = "";
      s.on("data", (c) => (data += c));
      s.on("close", () => resolve(data));
      s.on("error", reject);
    });
    assert.match(reply, /^HTTP\/1\.1 403/);
  } finally {
    await guard.close();
  }
});

// ---- hooks ----
const input = (tool: string, tool_input: Record<string, unknown>, session = "S1") => ({ session_id: session, tool_name: tool, tool_input });

test("hooks do nothing without an active run for this session", () => {
  const home = tmp("qamind-home-");
  const proj = tmp();
  assert.equal(decidePreToolUse(input("Write", { file_path: path.join(proj, "src", "a.js") }), home), null);
  marker(home, proj);
  assert.equal(decidePreToolUse(input("Write", { file_path: path.join(proj, "src", "a.js") }, "other-session"), home), null);
  marker(home, proj, { expires: new Date(Date.now() - 1000).toISOString() });
  assert.equal(decidePreToolUse(input("Write", { file_path: path.join(proj, "src", "a.js") }), home), null, "expired markers are ignored");
});

test("report-only run: writes are allowed only under .qa/ and the store; mutations are denied", () => {
  const home = tmp("qamind-home-");
  const proj = tmp();
  marker(home, proj);
  const deny = (tool: string, ti: Record<string, unknown>) => decidePreToolUse(input(tool, ti), home, [])?.decision;
  assert.equal(deny("Write", { file_path: path.join(proj, ".qa", "reports", "r", "data", "findings.json") }), undefined);
  assert.equal(deny("Edit", { file_path: path.join(home, "projects", "p1", "memory", "x.json") }), undefined);
  assert.equal(deny("Write", { file_path: path.join(proj, "src", "app.js") }), "deny");
  assert.equal(deny("Edit", { file_path: path.join(proj, ".gitignore") }), "deny");
  assert.equal(deny("Write", { file_path: path.join(proj, ".qa", "..", "src", "app.js") }), "deny", "path traversal out of .qa/");
  assert.equal(deny("Bash", { command: "git commit -am x" }), "deny");
  assert.equal(deny("Bash", { command: "git -C . push origin main" }), "deny");
  assert.equal(deny("Bash", { command: "npm install left-pad" }), "deny");
  assert.equal(deny("Bash", { command: "sed -i 's/a/b/' src/app.js" }), "deny");
  assert.equal(deny("Bash", { command: `echo hi > ${path.join(proj, "src", "x.js")}` }), "deny");
  assert.equal(deny("Bash", { command: `echo hi > ${path.join(proj, ".qa", "note.txt")}` }), undefined);
  assert.equal(deny("Bash", { command: "git status && git diff --stat" }), undefined);
  assert.equal(deny("Bash", { command: "qamind api run --run r --plan p.json 2>&1 | head" }), undefined);
  assert.equal(deny("Bash", { command: "curl -sS http://127.0.0.1:4100/api/health > /dev/null" }), undefined);
});

test("redirect detection ignores arrows, comparisons and quoted text, but still catches real redirects", () => {
  const home = tmp("qamind-home-");
  const proj = tmp();
  marker(home, proj);
  const d = (command: string) => decidePreToolUse(input("Bash", { command }), home, [])?.decision;
  assert.equal(d(`node -e "const x = rows.filter(o=>o.status!=='cancelled'); console.log(x.length)"`), undefined, "=> inside quotes");
  assert.equal(d(`node -e 'if (a >= b) { go() }'`), undefined, ">= inside quotes");
  assert.equal(d(`python3 -c "print(1 > 0)"`), undefined);
  assert.equal(d(`qamind api run --run r --plan p 2>&1 | head -5`), undefined);
  assert.equal(d(`echo "a > b" > ${path.join(proj, ".qa", "x.txt")}`), undefined, "quoted > ignored, real redirect goes to .qa");
  assert.equal(d(`echo hi > ${path.join(proj, "src", "x.js")}`), "deny");
  assert.equal(d(`echo hi >> ${path.join(proj, "README.md")}`), "deny");
  assert.equal(d(`some-cmd &> ${path.join(proj, "out.log")}`), "deny");
  assert.equal(d(`echo "x > y" > ${path.join(proj, "src", "z.js")}`), "deny", "a real redirect after quoted text is still caught");
});

test("credentials never enter the conversation, in any run mode", () => {
  const home = tmp("qamind-home-");
  const proj = tmp();
  marker(home, proj, { readonly: false, kind: "qa" });
  const d = (tool: string, ti: Record<string, unknown>) => decidePreToolUse(input(tool, ti), home, [])?.decision;
  assert.equal(d("Read", { file_path: path.join(proj, ".env.qa") }), "deny");
  assert.equal(d("Read", { file_path: path.join(proj, ".env.qa.example") }), undefined);
  assert.equal(d("Bash", { command: "cat .env.qa" }), "deny");
  assert.equal(d("Bash", { command: "grep PASS ./.env.qa" }), "deny");
  assert.equal(d("Bash", { command: "cat .env.qa.example" }), undefined);
  assert.equal(d("Bash", { command: "printenv" }), "deny");
  assert.equal(d("Bash", { command: "env | sort" }), "deny");
  assert.equal(d("mcp__plugin_qamind_browser__browser_run_code_unsafe", {}), "deny");
  assert.equal(d("mcp__plugin_qamind_browser__browser_snapshot", {}), undefined);
  assert.equal(d("Write", { file_path: path.join(proj, "src", "fix.js") }), undefined, "a fix-mode run may edit product files");
});
