import { joinUrl, loginRole } from "./auth.ts";
import type { RoleCredentials } from "./auth.ts";
import type { QamindConfig } from "./config.ts";
import type { HealthResult } from "./report.ts";
import { isRequestAllowed } from "./urlpolicy.ts";
import type { RunPolicy } from "./urlpolicy.ts";

type Check = HealthResult["checks"][number];

/**
 * Basic environment health check (spec §13.1; seed/reset and mail catcher arrive in a later phase):
 * every UI loads, the API responds, every test account can sign in over the API.
 * A failure means "Environment problem": no product bugs may be reported from a broken environment.
 */
export async function runHealthCheck(args: {
  config: QamindConfig;
  policy: RunPolicy;
  roles: RoleCredentials[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<HealthResult> {
  const doFetch = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? 15000;
  const checks: Check[] = [];

  const probeUrl = async (name: string, url: string, okBelow: number): Promise<void> => {
    const allowed = isRequestAllowed(args.policy, url);
    if (!allowed.allowed) {
      checks.push({ name, ok: false, detail: `blocked by the production-safety policy: ${allowed.reason}` });
      return;
    }
    const start = Date.now();
    try {
      const res = await doFetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      const ms = Date.now() - start;
      const location = res.headers.get("location");
      if (location && res.status >= 300 && res.status < 400 && !isRequestAllowed(args.policy, new URL(location, url).toString()).allowed) {
        checks.push({ name, ok: false, detail: `redirects to ${new URL(location, url).origin}, which is not an allowed test origin`, ms });
        return;
      }
      checks.push({ name, ok: res.status < okBelow, detail: `HTTP ${res.status}`, ms });
    } catch (err) {
      checks.push({ name, ok: false, detail: `no response: ${(err as Error).message}`, ms: Date.now() - start });
    }
  };

  for (const ui of args.config.web_uis) await probeUrl(`Web UI "${ui.name}" loads`, ui.url, 400);
  const base = args.config.api.base_url;
  if (base) await probeUrl("API base responds", base, 500);
  for (const p of args.config.health.checks) {
    const url = base ? joinUrl(base, p) : p;
    await probeUrl(`Health check ${p}`, url, 400);
  }

  for (const role of args.config.roles) {
    const name = `Test account "${role.name}" can sign in`;
    const creds = args.roles.find((r) => r.name === role.name);
    if (!creds) {
      checks.push({ name, ok: true, skipped: true, detail: "no credentials in .env.qa, so this role will be reported as Not tested" });
    } else if (!base || !args.config.api.login) {
      checks.push({ name, ok: true, skipped: true, detail: "API login is not configured; sign-in is exercised during UI testing" });
    } else {
      const start = Date.now();
      const session = await loginRole({ role: role.name, creds, login: args.config.api.login, baseUrl: base, policy: args.policy, timeoutMs, fetchImpl: doFetch });
      checks.push({ name, ok: !session.failure, detail: session.failure ?? "signed in over the API", ms: Date.now() - start });
    }
  }
  return { environment_ok: checks.every((c) => c.ok || c.skipped), checks, ran_at: new Date().toISOString() };
}
