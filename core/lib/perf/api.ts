import path from "node:path";
import { loginRole } from "../auth.ts";
import type { RoleCredentials, Session } from "../auth.ts";
import { joinUrl } from "../auth.ts";
import { BUDGET_REASON } from "../budget.ts";
import type { QamindConfig } from "../config.ts";
import { readJson, writeJson } from "../fsutil.ts";
import { maskText } from "../privacy.ts";
import type { PrivacyContext } from "../privacy.ts";
import { isRequestAllowed } from "../urlpolicy.ts";
import type { RunPolicy } from "../urlpolicy.ts";
import { MIN_API_DELTA_MS, apiKey, endpointBudget, judge, loadPerf, median, percentile, plainDuration } from "./store.ts";

/**
 * API response times (spec 13.11): a few calls to each endpoint the agent names, read-only, with the median and the 95th percentile compared with the budget and with recent runs.
 * It is not a load test: at most ten calls per endpoint, one after the other, GET and HEAD only.
 */

export interface PerfEndpoint {
  method?: "GET" | "HEAD";
  /** Relative to the API base address (`/orders`, `/admin/reports/sales`), with a query if it matters. */
  path: string;
  /** Which test account calls it. */
  role?: string;
  /** How many calls (default 5, at most 10). */
  calls?: number;
}
export interface PerfEndpointsFile {
  endpoints: PerfEndpoint[];
}

export interface ApiTiming {
  method: string;
  path: string;
  role?: string;
  calls: number;
  /** Calls that got an answer (any status). */
  answered: number;
  statuses: number[];
  median_ms: number;
  p95_ms: number;
  max_ms: number;
  budget_ms: number;
  over_budget: boolean;
  regressed: boolean;
  previous_ms?: number;
  slower_pct?: number;
  /** One plain sentence. */
  message: string;
  error?: string;
}

export interface ApiPerfResults {
  schema_version: 1;
  run_id: string;
  ran_at: string;
  timings: ApiTiming[];
  skipped: Array<{ path: string; role?: string; reason: string }>;
  budget_reached?: boolean;
}

export const perfEndpointsFile = (runDir: string): string => path.join(runDir, "data", "perf-endpoints.json");
export const apiPerfResultsFile = (runDir: string): string => path.join(runDir, "data", "perf-api.json");
export const MAX_PERF_ENDPOINTS = 25;
export const DEFAULT_CALLS = 5;
export const MAX_CALLS = 10;

export function validatePerfEndpoints(raw: unknown, config: QamindConfig): { ok: boolean; errors: string[]; file?: PerfEndpointsFile } {
  const errors: string[] = [];
  const list = (raw as { endpoints?: unknown } | undefined)?.endpoints;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, errors: ['data/perf-endpoints.json must be { "endpoints": [ { "method": "GET", "path": "/orders", "role": "acme-1" } ] }.'] };
  if (list.length > MAX_PERF_ENDPOINTS) errors.push(`At most ${MAX_PERF_ENDPOINTS} endpoints (found ${list.length}): this is not a load test.`);
  const roles = new Set(config.roles.map((r) => r.name));
  const out: PerfEndpoint[] = [];
  for (const [i, e] of list.slice(0, MAX_PERF_ENDPOINTS).entries()) {
    const x = (e ?? {}) as Record<string, unknown>;
    const at = `endpoints[${i}]`;
    const method = x["method"] === undefined ? "GET" : String(x["method"]).toUpperCase();
    if (method !== "GET" && method !== "HEAD") errors.push(`${at}: only GET and HEAD are timed (a timing check must not create or change data).`);
    const p = typeof x["path"] === "string" ? x["path"] : "";
    if (!p.startsWith("/") || p.includes("://") || p.startsWith("//") || p.length > 300) errors.push(`${at}: "path" is a path on the API starting with "/" (not a full address).`);
    const role = typeof x["role"] === "string" ? x["role"] : undefined;
    if (x["role"] !== undefined && (!role || !roles.has(role))) errors.push(`${at}: role "${String(x["role"])}" is not in the config.`);
    const calls = x["calls"] === undefined ? DEFAULT_CALLS : x["calls"];
    if (typeof calls !== "number" || !Number.isInteger(calls) || calls < 1 || calls > MAX_CALLS) errors.push(`${at}: "calls" is a whole number from 1 to ${MAX_CALLS}.`);
    if ((method === "GET" || method === "HEAD") && p.startsWith("/") && (typeof calls !== "number" || (calls >= 1 && calls <= MAX_CALLS))) out.push({ method: method as "GET" | "HEAD", path: p, ...(role ? { role } : {}), calls: typeof calls === "number" ? calls : DEFAULT_CALLS });
  }
  return { ok: errors.length === 0, errors, ...(errors.length === 0 ? { file: { endpoints: out } } : {}) };
}

export interface ApiPerfContext {
  store: string;
  runDir: string;
  runId: string;
  config: QamindConfig;
  policy: RunPolicy;
  roles: RoleCredentials[];
  passwords: string[];
  privacy: PrivacyContext;
  deadlineMs?: number;
  fetchImpl?: typeof fetch;
}

const TIMEOUT_MS = 30_000;

export async function runApiPerf(ctx: ApiPerfContext, now = new Date()): Promise<ApiPerfResults> {
  const checked = validatePerfEndpoints(readJson<unknown>(perfEndpointsFile(ctx.runDir)), ctx.config);
  if (!checked.ok || !checked.file) throw new Error(`data/perf-endpoints.json has problems:\n- ${checked.errors.join("\n- ")}`);
  const base = ctx.config.api.base_url;
  if (!base) throw new Error("api.base_url is not set in the config, so there is no API to time.");
  const doFetch = ctx.fetchImpl ?? fetch;
  const history = loadPerf(ctx.store);
  const sessions = new Map<string, Session>();
  const redact = (s: string): string => ctx.passwords.reduce((acc, p) => (p ? acc.split(p).join("[REDACTED]") : acc), s);
  const safe = (s: string): string => maskText(redact(s), ctx.privacy).text;
  const results: ApiPerfResults = { schema_version: 1, run_id: ctx.runId, ran_at: now.toISOString(), timings: [], skipped: [] };

  for (const e of checked.file.endpoints) {
    const method = e.method ?? "GET";
    if (ctx.deadlineMs && Date.now() > ctx.deadlineMs) {
      results.budget_reached = true;
      results.skipped.push({ path: e.path, ...(e.role ? { role: e.role } : {}), reason: BUDGET_REASON });
      continue;
    }
    const url = joinUrl(base, e.path);
    const allowed = isRequestAllowed(ctx.policy, url);
    if (!allowed.allowed) {
      results.skipped.push({ path: e.path, ...(e.role ? { role: e.role } : {}), reason: `refused by the run's URL policy: ${allowed.reason}` });
      continue;
    }
    let session: Session | undefined;
    if (e.role) {
      session = sessions.get(e.role);
      if (!session) {
        session = await loginRole({ role: e.role, creds: ctx.roles.find((r) => r.name === e.role), login: ctx.config.api.login, baseUrl: base, policy: ctx.policy, timeoutMs: TIMEOUT_MS, fetchImpl: doFetch });
        sessions.set(e.role, session);
      }
      if (session.failure) {
        results.skipped.push({ path: e.path, role: e.role, reason: safe(session.failure) });
        continue;
      }
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (session?.header) headers[session.header[0]] = session.header[1];
    if (session?.cookie) headers["cookie"] = session.cookie;
    const times: number[] = [];
    const statuses: number[] = [];
    let error: string | undefined;
    for (let i = 0; i < (e.calls ?? DEFAULT_CALLS); i++) {
      if (ctx.deadlineMs && Date.now() > ctx.deadlineMs) {
        results.budget_reached = true;
        break;
      }
      const t0 = Date.now();
      try {
        const res = await doFetch(url, { method, redirect: "manual", headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
        await res.arrayBuffer().catch(() => undefined); // the time includes the whole answer
        times.push(Date.now() - t0);
        statuses.push(res.status);
      } catch (err) {
        error = safe((err as Error).message);
        break; // an endpoint that does not answer is not timed: a check of the environment, not of speed
      }
    }
    if (times.length === 0) {
      results.skipped.push({ path: e.path, ...(e.role ? { role: e.role } : {}), reason: `No answer (${error ?? "no calls were made"}): nothing was concluded about its speed.` });
      continue;
    }
    const med = Math.round(median(times));
    const p95 = percentile(times, 95);
    const budget = endpointBudget(ctx.config.performance, method, e.path);
    const j = judge(p95, budget, history.series[apiKey(method, e.path, e.role)] ?? [], ctx.config.performance.regression_pct, MIN_API_DELTA_MS);
    const who = `${method} ${e.path.split("?")[0]}${e.role ? ` (as ${e.role})` : ""}`;
    const message = j.over_budget
      ? `${who} is slow: the slowest of ${times.length} calls took ${plainDuration(p95)} (median ${plainDuration(med)}); the budget is ${plainDuration(budget)}.`
      : j.regressed && j.previous_ms !== undefined
        ? `${who} is ${j.slower_pct}% slower than in recent runs: ${plainDuration(p95)} against ${plainDuration(j.previous_ms)}, though still under its budget of ${plainDuration(budget)}.`
        : `${who} answers in ${plainDuration(med)} (slowest of ${times.length}: ${plainDuration(p95)}), within its budget of ${plainDuration(budget)}.`;
    results.timings.push({
      method,
      path: e.path,
      ...(e.role ? { role: e.role } : {}),
      calls: e.calls ?? DEFAULT_CALLS,
      answered: times.length,
      statuses,
      median_ms: med,
      p95_ms: p95,
      max_ms: Math.max(...times),
      budget_ms: budget,
      over_budget: j.over_budget,
      regressed: j.regressed,
      ...(j.previous_ms !== undefined ? { previous_ms: j.previous_ms } : {}),
      ...(j.slower_pct !== undefined ? { slower_pct: j.slower_pct } : {}),
      message,
      ...(error ? { error } : {}),
    });
  }
  writeJson(apiPerfResultsFile(ctx.runDir), results);
  return results;
}

/** The measurements of a finished run that belong in the perf history: the slowest of the calls, of endpoints that answered. */
export function apiPerfPoints(runDir: string): Array<{ key: string; ms: number }> {
  const r = readJson<ApiPerfResults>(apiPerfResultsFile(runDir));
  return (r?.timings ?? []).filter((t) => t.answered >= 1).map((t) => ({ key: apiKey(t.method, t.path, t.role), ms: t.p95_ms }));
}
