/**
 * Production-safety rules for URLs (spec §12): block URLs that match production patterns,
 * and stop and ask when an URL gives no sign that it is a test environment.
 */

export interface SecuritySettings {
  blocked_production_patterns: string[];
  not_production_hosts: string[];
  allowed_extra_origins: string[];
  confirmed_non_production: boolean;
}

export type UrlVerdict =
  | { verdict: "allowed"; reason: string }
  | { verdict: "blocked"; reason: string }
  | { verdict: "ambiguous"; reason: string };

/** Labels that show a host is a test environment. */
const TEST_LABEL = /(^|[-_.])(staging|stage|stg|dev|develop|test|testing|qa|uat|sandbox|demo|preview|local|localhost|internal|lan)([-_.]|\d|$)/i;
/** Labels that look like production. These block unless the host is listed in `not_production_hosts`. */
const PROD_LABEL = /(^|[-_.])(prod|production|prd|live)([-_.]|\d|$)/i;
const LOOPBACK_SUFFIXES = [".localhost", ".local", ".test", ".internal", ".lan"];

export function parseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

function isPrivateIp(host: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .trim()
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/** Patterns are written as `host`, `*.host`, or `host/path/*` and are matched against host[:port] and host[:port]+path. */
export function matchesPattern(url: URL, pattern: string): boolean {
  let p = pattern.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  if (!p) return false;
  if (p.endsWith("/") && !p.endsWith("*/")) p = p.slice(0, -1);
  const re = globToRegExp(p);
  const host = url.host.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const withPath = `${host}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  return re.test(host) || re.test(hostname) || re.test(withPath) || re.test(`${host}${url.pathname}`.toLowerCase());
}

export function classifyUrl(raw: string, sec: SecuritySettings): UrlVerdict {
  const u = parseUrl(raw);
  if (!u) return { verdict: "blocked", reason: `"${raw}" is not a valid http(s) URL` };
  const host = u.hostname.toLowerCase();

  const hit = sec.blocked_production_patterns.find((p) => matchesPattern(u, p));
  if (hit) return { verdict: "blocked", reason: `matches the blocked production pattern "${hit}"` };

  const listed = sec.not_production_hosts.some((h) => h.toLowerCase() === host || h.toLowerCase() === u.host.toLowerCase());
  if (!listed && PROD_LABEL.test(host)) {
    return { verdict: "blocked", reason: `the host "${host}" looks like production (add it to security.not_production_hosts only if it is not)` };
  }
  if (isLoopbackHost(host) || isPrivateIp(host) || LOOPBACK_SUFFIXES.some((s) => host.endsWith(s))) {
    return { verdict: "allowed", reason: "local or private address" };
  }
  if (TEST_LABEL.test(host) || listed) return { verdict: "allowed", reason: listed ? "listed in not_production_hosts" : "host name marks a test environment" };
  if (sec.confirmed_non_production) return { verdict: "allowed", reason: "environment.confirmed_non_production is true" };
  return {
    verdict: "ambiguous",
    reason: `"${host}" gives no sign of being a test environment; confirm it with the user, then set environment.confirmed_non_production: true`,
  };
}

/** What the browser guard and the API runner are allowed to reach during a run. */
export interface RunPolicy {
  allowed_origins: string[];
  blocked_patterns: string[];
}

export function originOf(raw: string): string | null {
  const u = parseUrl(raw);
  return u ? u.origin : null;
}

/** Deny wins: a blocked pattern beats any allow. Loopback and private hosts are matched by origin like any other. */
export function isRequestAllowed(policy: RunPolicy, raw: string): { allowed: boolean; reason: string } {
  const u = parseUrl(raw);
  if (!u) return { allowed: false, reason: "not an http(s) URL" };
  const blocked = policy.blocked_patterns.find((p) => matchesPattern(u, p));
  if (blocked) return { allowed: false, reason: `matches blocked production pattern "${blocked}"` };
  if (policy.allowed_origins.includes(u.origin)) return { allowed: true, reason: "configured origin" };
  return { allowed: false, reason: `origin ${u.origin} is not one of the configured test origins` };
}
