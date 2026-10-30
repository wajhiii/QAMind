import type { ApiLogin } from "./config.ts";
import { isRequestAllowed } from "./urlpolicy.ts";
import type { RunPolicy } from "./urlpolicy.ts";

export interface RoleCredentials {
  name: string;
  username: string;
  password: string;
}

export interface Session {
  header?: [string, string];
  cookie?: string;
  failure?: string;
  /** Values that must be scrubbed from anything saved (the token or cookie values). */
  secrets: string[];
}

export function jsonPathGet(value: unknown, expr: string): unknown {
  const parts = expr.replace(/^\$\.?/, "").match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur: unknown = value;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    const idx = /^\[(\d+)\]$/.exec(part);
    if (idx) cur = Array.isArray(cur) ? cur[Number(idx[1])] : undefined;
    else cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function joinUrl(base: string, p: string, query?: Record<string, string | number | boolean>): string {
  const b = new URL(base);
  const url = /^https?:\/\//i.test(p) ? new URL(p) : new URL(`${b.origin}${b.pathname.replace(/\/+$/, "")}/${p.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
  return url.toString();
}

/** Sign one role in over the API. The credentials stay inside this process; only a success/failure reason leaves it. */
export async function loginRole(args: {
  role: string;
  creds: RoleCredentials | undefined;
  login: ApiLogin | undefined;
  baseUrl: string;
  policy: RunPolicy;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<Session> {
  const { role, creds, login } = args;
  if (!creds) return { failure: `role "${role}" has no credentials in .env.qa`, secrets: [] };
  if (!login) return { failure: "api.login is not configured in .qa/config.md", secrets: [] };
  const url = joinUrl(args.baseUrl, login.path);
  const allowed = isRequestAllowed(args.policy, url);
  if (!allowed.allowed) return { failure: `login blocked: ${allowed.reason}`, secrets: [] };
  try {
    const res = await args.fetchImpl(url, {
      method: login.method,
      redirect: "manual",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ [login.username_field]: creds.username, [login.password_field]: creds.password }),
      signal: AbortSignal.timeout(args.timeoutMs),
    });
    if (!res.ok) return { failure: `login for "${role}" failed with HTTP ${res.status}`, secrets: [] };
    if (login.token_path === "cookie") {
      const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0] ?? "").filter(Boolean);
      if (!cookies.length) return { failure: `login for "${role}" set no cookie`, secrets: [] };
      return { cookie: cookies.join("; "), secrets: cookies.map((c) => c.split("=").slice(1).join("=")).filter((v) => v.length >= 4) };
    }
    const json: unknown = await res.json().catch(() => undefined);
    const token = jsonPathGet(json, login.token_path);
    if (typeof token !== "string" || !token) return { failure: `login for "${role}" returned no token at "${login.token_path}"`, secrets: [] };
    const sep = login.auth_header.indexOf(":");
    const name = login.auth_header.slice(0, sep).trim();
    const value = login.auth_header.slice(sep + 1).trim().replace("{token}", token);
    return { header: [name, value], secrets: [token] };
  } catch (err) {
    return { failure: `login for "${role}" could not be completed: ${(err as Error).message}`, secrets: [] };
  }
}
