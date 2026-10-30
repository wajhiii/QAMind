/** Secret redaction for everything QAMind saves (spec §12: tokens, cookies and Authorization headers never reach evidence). */

const SENSITIVE_KEY = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-csrf-token|x-xsrf-token|password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|id_token|api_key|apikey|session|sessionid|session_id|csrf|jwt)$/i;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const COOKIE_PAIR = /\b(session|sid|token|auth|jwt|csrf)[A-Za-z0-9_-]*=[^;\s,]{6,}/gi;
export const REDACTED = "[REDACTED]";

export interface Redactor {
  text(input: string): string;
  json(value: unknown): unknown;
  headers(headers: Record<string, string>): Record<string, string>;
}

/** `knownSecrets` are exact values (e.g. the test passwords) that must never appear, even inside free text. */
export function makeRedactor(knownSecrets: string[] = []): Redactor {
  const secrets = [...new Set(knownSecrets.filter((s) => s.length >= 4))].sort((a, b) => b.length - a.length);
  const text = (input: string): string => {
    let out = input.replace(JWT, REDACTED).replace(BEARER, (_m, scheme: string) => `${scheme} ${REDACTED}`).replace(COOKIE_PAIR, (m) => `${m.split("=")[0]}=${REDACTED}`);
    for (const s of secrets) out = out.split(s).join(REDACTED);
    return out;
  };
  const json = (value: unknown, depth = 0): unknown => {
    if (depth > 12) return REDACTED;
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) return value.map((v) => json(v, depth + 1));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = SENSITIVE_KEY.test(k) && v !== null && v !== undefined && v !== "" ? REDACTED : json(v, depth + 1);
      }
      return out;
    }
    return value;
  };
  const headers = (h: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) out[k] = SENSITIVE_KEY.test(k) ? REDACTED : text(v);
    return out;
  };
  return { text, json: (v) => json(v), headers };
}

/** Scan saved text for anything that still looks like a credential (used by report lint; full privacy scanner is Phase 7.6). */
export function findSecretLeaks(text: string, knownSecrets: string[] = [], opts: { generic?: boolean } = {}): string[] {
  const leaks: string[] = [];
  if (opts.generic !== false) {
    if (new RegExp(JWT.source).test(text)) leaks.push("JWT-like token");
    if (/\b(Bearer|Basic)\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{12,}/i.test(text)) leaks.push("Authorization header value");
  }
  for (const s of knownSecrets.filter((x) => x.length >= 4)) if (text.includes(s)) leaks.push("a configured test password or username value");
  return leaks;
}
