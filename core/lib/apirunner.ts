import fs from "node:fs";
import path from "node:path";
import { jsonPathGet, joinUrl, loginRole } from "./auth.ts";
import type { RoleCredentials, Session } from "./auth.ts";
import type { ApiLogin } from "./config.ts";
import { ensureDir, writeJson } from "./fsutil.ts";
import { matchEndpoint, statusDeclared } from "./openapi.ts";
import type { Endpoint, Inventory } from "./openapi.ts";
import { validatePlan } from "./apiplan.ts";
import type { JsonCheck, Plan, Probe, StatusExpectation } from "./apiplan.ts";
import { makeRedactor } from "./redact.ts";
import type { Redactor } from "./redact.ts";
import { validateSchema } from "./schema.ts";
import { isRequestAllowed } from "./urlpolicy.ts";
import type { RunPolicy } from "./urlpolicy.ts";

export type { RoleCredentials } from "./auth.ts";

export interface RunnerOptions {
  baseUrl: string;
  policy: RunPolicy;
  roles: RoleCredentials[];
  login?: ApiLogin;
  inventory?: Inventory;
  runDir: string;
  slowMs?: number;
  timeoutMs?: number;
  readOnly?: boolean;
  maxBodyChars?: number;
  fetchImpl?: typeof fetch;
}

export interface Signal {
  kind: string;
  detail: string;
}

interface Attempt {
  status?: number;
  ms: number;
  error?: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
}

export interface ProbeResult {
  id: string;
  title: string;
  operation?: string;
  role: string;
  tags: string[];
  skipped?: string;
  statuses: Array<number | string>;
  ms: number[];
  signals: Signal[];
  expectation_failures: string[];
  reproduced?: { times: number; of: number };
  evidence?: string;
}

export interface PlanResult {
  summary: { plan: string; total: number; passed: number; failed: number; skipped: number; signals: number; ran_at: string };
  results: ProbeResult[];
  matrix: Array<{ operation: string; statuses: Record<string, number | string> }>;
}

export const LEAK_PATTERNS: Array<[string, RegExp]> = [
  // Node/V8 frames: "at fn (/abs/file.js:1:2)", "at async fn (file:///abs/file.mjs:1:2)", "at JSON.parse (<anonymous>)".
  // Matched anywhere, because JSON-encoded bodies carry newlines as a literal backslash-n.
  ["stack trace", /\bat\s+(?:async\s+)?[\w$.<>[\]]+\s*\((?:[^)\s]*[\\/][^)]*:\d+:\d+|<anonymous>|native)\)/],
  ["stack trace", /Traceback \(most recent call last\)|\bat [\w.$]+\([\w.]+\.java:\d+\)|\.php on line \d+|System\.\w+Exception|\bin [\w.\\/]+:line \d+/],
  ["database error text", /SQLSTATE\[|ORA-\d{4,5}|syntax error at or near|error in your SQL syntax|SequelizeDatabaseError|psycopg2\./i],
  ["server file path", /file:\/\/\/[^\s"'<>]{3,}|(?:\/Users\/|\/home\/[\w.-]+\/|\/var\/www\/|\/usr\/src\/|\/app\/|[A-Za-z]:\\(?:Users|inetpub|projects)\\)[^\s"'<>]{3,}/],
  ["server source path", /(?:\/[\w.-]+){3,}\.(?:mjs|cjs|js|ts|py|rb|php|java|cs|go)(?::\d+)?\b/],
  ["stack field in an error body", /"(?:stack|stacktrace|stack_trace|trace|traceback|backtrace)"\s*:\s*"/i],
];

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);

function firstArray(json: unknown): unknown[] | undefined {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") for (const v of Object.values(json as Record<string, unknown>)) if (Array.isArray(v)) return v;
  return undefined;
}

function findKey(json: unknown, key: string, depth = 0): unknown {
  if (!json || typeof json !== "object" || depth > 3) return undefined;
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(json) && key in obj && obj[key] !== null && typeof obj[key] !== "object") return obj[key];
  for (const v of Array.isArray(json) ? json.slice(0, 3) : Object.values(obj)) {
    const found = findKey(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * `$first:id` takes field `id` of the first item of the first list in the response; `$find:id` finds the first
 * scalar `id` anywhere near the top of the response (for create calls that return the new record, wrapped or not).
 */
export function captureValue(json: unknown, expr: string): unknown {
  const find = /^\$find:([\w.-]+)$/.exec(expr);
  if (find) return findKey(json, find[1] as string);
  const m = /^\$first:([\w.-]+)$/.exec(expr);
  if (!m) return jsonPathGet(json, expr);
  const item = firstArray(json)?.[0];
  return item && typeof item === "object" ? (item as Record<string, unknown>)[m[1] as string] : undefined;
}

export function statusMatches(status: number, expectation: StatusExpectation): boolean {
  const list = Array.isArray(expectation) ? expectation : [expectation];
  return list.some((e) => (typeof e === "number" ? e === status : /^[1-5]xx$/i.test(e) ? Math.floor(status / 100) === Number(e[0]) : Number(e) === status));
}

function substitute<T>(value: T, vars: Record<string, string>, missing: Set<string>): T {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, name: string) => {
      const v = vars[name];
      if (v === undefined) {
        missing.add(name);
        return `{{${name}}}`;
      }
      return v;
    }) as T;
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars, missing)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substitute(v, vars, missing)])) as T;
  }
  return value;
}

export async function runPlan(plan: Plan, opts: RunnerOptions): Promise<PlanResult> {
  const planErrors = validatePlan(plan);
  if (planErrors.length) throw new Error(`The plan has problems:\n  ${planErrors.join("\n  ")}`);
  const doFetch = opts.fetchImpl ?? fetch;
  const slowMs = opts.slowMs ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const maxBody = opts.maxBodyChars ?? 6000;
  const vars: Record<string, string> = { ...(plan.vars ?? {}) };
  const sessions = new Map<string, Session>();
  let redactor: Redactor = makeRedactor(opts.roles.map((r) => r.password));
  const evidenceDir = path.join(opts.runDir, "evidence", "api");

  async function authFor(role: string): Promise<Session> {
    if (role === "anonymous") return { secrets: [] };
    const cached = sessions.get(role);
    if (cached) return cached;
    const session = await loginRole({ role, creds: opts.roles.find((r) => r.name === role), login: opts.login, baseUrl: opts.baseUrl, policy: opts.policy, timeoutMs, fetchImpl: doFetch });
    if (session.secrets.length) redactor = makeRedactor([...opts.roles.map((r) => r.password), ...session.secrets]);
    sessions.set(role, session);
    return session;
  }

  async function once(probe: Probe, url: string, session: Session): Promise<Attempt> {
    const headers: Record<string, string> = { accept: "application/json", ...(probe.headers ?? {}) };
    if (session.header) headers[session.header[0]] = session.header[1];
    if (session.cookie) headers["cookie"] = session.cookie;
    let body: string | undefined;
    if (probe.raw_body !== undefined) body = probe.raw_body;
    else if (probe.body !== undefined) body = JSON.stringify(probe.body);
    if (body !== undefined && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
    const start = Date.now();
    try {
      const res = await doFetch(url, { method: probe.method, headers, ...(body !== undefined ? { body } : {}), redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      const location = res.headers.get("location");
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => (respHeaders[k] = v));
      if (location && res.status >= 300 && res.status < 400) {
        const target = new URL(location, url).toString();
        if (!isRequestAllowed(opts.policy, target).allowed) respHeaders["x-qamind-blocked-redirect"] = target;
      }
      return { status: res.status, ms: Date.now() - start, headers: respHeaders, body: text.slice(0, maxBody), truncated: text.length > maxBody };
    } catch (err) {
      return { ms: Date.now() - start, error: (err as Error).message, headers: {}, body: "", truncated: false };
    }
  }

  function endpointFor(probe: Probe): Endpoint | undefined {
    if (!opts.inventory) return undefined;
    return (probe.operation ? opts.inventory.endpoints.find((e) => e.operation === probe.operation) : undefined) ?? matchEndpoint(opts.inventory, probe.method, probe.path);
  }

  function assess(probe: Probe, attempts: Attempt[]): { signals: Signal[]; failures: string[] } {
    const signals: Signal[] = [];
    const failures: string[] = [];
    const ep = endpointFor(probe);
    for (const a of attempts) {
      if (a.error) {
        signals.push({ kind: "network-error", detail: a.error });
        continue;
      }
      const status = a.status as number;
      if (status >= 500) signals.push({ kind: "server-error", detail: `HTTP ${status}` });
      if (a.headers["x-qamind-blocked-redirect"]) signals.push({ kind: "blocked-redirect", detail: `redirects to ${a.headers["x-qamind-blocked-redirect"]}, which is outside the allowed test origins; not followed` });
      for (const [label, re] of LEAK_PATTERNS) if (re.test(a.body)) signals.push({ kind: "error-leakage", detail: `response body contains a ${label}` });
      if (a.ms > slowMs) signals.push({ kind: "slow-response", detail: `${a.ms} ms (limit ${slowMs} ms)` });
      let json: unknown;
      try {
        json = a.truncated ? undefined : JSON.parse(a.body);
      } catch {
        json = undefined;
      }
      if (ep) {
        if (status >= 200 && status < 400 && !statusDeclared(ep, status)) signals.push({ kind: "contract-status", detail: `HTTP ${status} is not documented for ${ep.operation}` });
        const spec = ep.responses.find((r) => r.status === String(status) || r.status.toUpperCase() === `${Math.floor(status / 100)}XX`);
        if (spec?.schema && json !== undefined) for (const m of validateSchema(json, spec.schema)) signals.push({ kind: "contract-schema", detail: m });
        if (probe.role === "anonymous" && ep.auth === "required" && status >= 200 && status < 300) signals.push({ kind: "auth-not-enforced", detail: `${ep.operation} answered ${status} without credentials` });
      }
      const exp = probe.expect;
      if (exp?.status !== undefined && !statusMatches(status, exp.status)) failures.push(`expected HTTP ${JSON.stringify(exp.status)}, got ${status}`);
      for (const needle of asList(exp?.body_contains)) if (!a.body.includes(needle)) failures.push(`body does not contain "${needle}"`);
      for (const needle of asList(exp?.body_not_contains)) if (a.body.includes(needle)) failures.push(`body unexpectedly contains "${needle}"`);
      for (const c of exp?.json ?? ([] as JsonCheck[])) {
        const v = jsonPathGet(json, c.path);
        if (c.exists !== undefined && (v !== undefined) !== c.exists) failures.push(`${c.path} ${c.exists ? "is missing" : "should not exist"}`);
        if ("equals" in c && JSON.stringify(v) !== JSON.stringify(c.equals)) failures.push(`${c.path} is ${JSON.stringify(v)}, expected ${JSON.stringify(c.equals)}`);
        if (c.lte !== undefined && !(typeof v === "number" && v <= c.lte)) failures.push(`${c.path} is ${JSON.stringify(v)}, expected ≤ ${c.lte}`);
        if (c.gte !== undefined && !(typeof v === "number" && v >= c.gte)) failures.push(`${c.path} is ${JSON.stringify(v)}, expected ≥ ${c.gte}`);
        if (c.matches !== undefined && !(typeof v === "string" && new RegExp(c.matches).test(v))) failures.push(`${c.path} does not match /${c.matches}/`);
      }
    }
    if (probe.repeat && probe.repeat.count >= 2 && attempts.filter((a) => a.status !== undefined && a.status >= 200 && a.status < 300).length >= 2) {
      signals.push({ kind: "duplicate-submission", detail: `${probe.repeat.count} identical requests were all accepted; check whether duplicates are created` });
    }
    const uniq = new Map(signals.map((s) => [`${s.kind}|${s.detail}`, s]));
    return { signals: [...uniq.values()], failures: [...new Set(failures)] };
  }

  const results: ProbeResult[] = [];
  for (const raw of plan.probes) {
    const tags = raw.tags ?? [];
    const base: Pick<ProbeResult, "id" | "title" | "role" | "tags"> & { operation?: string } = { id: raw.id, title: raw.title, role: raw.role, tags, ...(raw.operation ? { operation: raw.operation } : {}) };
    const skip = (reason: string) => results.push({ ...base, skipped: reason, statuses: [], ms: [], signals: [], expectation_failures: [] });

    if (opts.readOnly && raw.method !== "GET") {
      skip("read-only run: non-GET probes are not executed");
      continue;
    }
    const missing = new Set<string>();
    const probe = substitute(raw, vars, missing);
    if (missing.size) {
      skip(`needs variable(s): ${[...missing].join(", ")}`);
      continue;
    }
    const url = joinUrl(opts.baseUrl, probe.path, probe.query);
    const allowed = isRequestAllowed(opts.policy, url);
    if (!allowed.allowed) {
      skip(`blocked by the production-safety policy: ${allowed.reason}`);
      continue;
    }
    const session = await authFor(probe.role);
    if (session.failure) {
      skip(session.failure);
      continue;
    }

    const runAttempts = async (): Promise<Attempt[]> => {
      const n = probe.repeat?.count ?? 1;
      if (probe.repeat?.parallel) return Promise.all(Array.from({ length: n }, () => once(probe, url, session)));
      const out: Attempt[] = [];
      for (let i = 0; i < n; i++) out.push(await once(probe, url, session));
      return out;
    };

    const first = await runAttempts();
    let { signals, failures } = assess(probe, first);
    let attempts = first;
    let reproduced: ProbeResult["reproduced"];
    if (signals.length > 0 || failures.length > 0) {
      const second = await runAttempts();
      const again = assess(probe, second);
      const kinds = (r: { signals: Signal[]; failures: string[] }) => new Set([...r.signals.map((s) => s.kind), ...(r.failures.length ? ["expectation"] : [])]);
      const k1 = kinds({ signals, failures });
      const k2 = kinds(again);
      const same = [...k1].some((k) => k2.has(k));
      reproduced = { times: same ? 2 : 1, of: 2 };
      attempts = [...first, ...second];
      if (!same) {
        signals = [...signals, ...again.signals.filter((s) => !signals.some((x) => x.kind === s.kind && x.detail === s.detail))];
        failures = [...new Set([...failures, ...again.failures])];
      }
    }

    // Evidence for anything that needs a human look: sanitized requests/responses plus a curl reproduction.
    let evidence: string | undefined;
    if (signals.length > 0 || failures.length > 0 || probe.keep_evidence === true) {
      ensureDir(evidenceDir);
      const file = path.join(evidenceDir, `${plan.name}-${raw.id}.json`);
      const reqBody = probe.raw_body !== undefined ? redactor.text(probe.raw_body) : probe.body !== undefined ? JSON.stringify(redactor.json(probe.body)) : undefined;
      const headerFlags = [probe.role !== "anonymous" ? `-H 'Authorization: Bearer $TOKEN'` : "", reqBody !== undefined ? `-H 'Content-Type: application/json'` : ""].filter(Boolean).join(" ");
      const curl = `curl -sS -i -X ${probe.method} '${url}' ${headerFlags}${reqBody !== undefined ? ` --data '${reqBody.replace(/'/g, "'\\''")}'` : ""}`.replace(/\s+/g, " ").trim();
      writeJson(file, {
        probe: { id: raw.id, title: raw.title, operation: raw.operation, role: probe.role },
        curl,
        curl_note: probe.role === "anonymous" ? "No credentials are needed." : "Set TOKEN to a valid token for this role (log in first); the real token is never saved in evidence.",
        attempts: attempts.map((a) => ({
          status: a.status ?? null,
          ms: a.ms,
          ...(a.error ? { error: redactor.text(a.error) } : {}),
          request: { method: probe.method, url, headers: redactor.headers({ ...(probe.headers ?? {}), ...(probe.role !== "anonymous" ? { Authorization: "[token]" } : {}) }), ...(reqBody !== undefined ? { body: reqBody } : {}) },
          response: { headers: redactor.headers(a.headers), body: redactor.text(a.body), ...(a.truncated ? { truncated: true } : {}) },
        })),
        signals,
        expectation_failures: failures,
        reproduced,
      });
      evidence = path.relative(opts.runDir, file).split(path.sep).join("/");
    }

    for (const [name, expr] of Object.entries(probe.capture ?? {})) {
      const last = attempts[attempts.length - 1];
      try {
        const v = last && !last.truncated ? captureValue(JSON.parse(last.body), expr) : undefined;
        if (v !== undefined && v !== null) vars[name] = String(v);
      } catch {
        /* the response was not JSON: the variable stays unset and dependants are skipped */
      }
    }

    results.push({
      ...base,
      statuses: attempts.map((a) => a.status ?? "error"),
      ms: attempts.map((a) => a.ms),
      signals,
      expectation_failures: failures,
      ...(reproduced ? { reproduced } : {}),
      ...(evidence ? { evidence } : {}),
    });
  }

  const byOp = new Map<string, Record<string, number | string>>();
  for (const r of results) {
    if (!r.tags.includes("matrix") || !r.operation) continue;
    const row = byOp.get(r.operation) ?? {};
    row[r.role] = r.skipped ? "skipped" : (r.statuses[0] ?? "error");
    byOp.set(r.operation, row);
  }

  const executed = results.filter((r) => !r.skipped);
  const failed = executed.filter((r) => r.signals.length > 0 || r.expectation_failures.length > 0);
  const summary = {
    plan: plan.name,
    total: results.length,
    passed: executed.length - failed.length,
    failed: failed.length,
    skipped: results.length - executed.length,
    signals: executed.reduce((n, r) => n + r.signals.length + r.expectation_failures.length, 0),
    ran_at: new Date().toISOString(),
  };
  const out: PlanResult = { summary, results, matrix: [...byOp].map(([operation, statuses]) => ({ operation, statuses })) };
  const dir = path.join(opts.runDir, "data", "api-results");
  ensureDir(dir);
  let name = `${plan.name}.json`;
  for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${plan.name}-${n}.json`;
  writeJson(path.join(dir, name), out);
  return out;
}
