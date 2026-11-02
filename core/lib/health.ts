import { joinUrl, loginRole } from "./auth.ts";
import { prepCheck, prepareEnvironment } from "./envprep.ts";
import type { EnvPrep } from "./envprep.ts";
import type { RoleCredentials } from "./auth.ts";
import type { QamindConfig } from "./config.ts";
import type { HealthResult } from "./report.ts";
import { isRequestAllowed } from "./urlpolicy.ts";
import type { RunPolicy } from "./urlpolicy.ts";

type Check = HealthResult["checks"][number];

/** A first answer slower than this is recorded as an environment quirk (spec 13.1), though the check passes. */
export const SLOW_MS = 5000;

/**
 * Environment health check (spec §13.1; the mail catcher arrives with §13.7): every UI loads, the API responds, every extra health check answers, every test account
 * can sign in over the API. A check that fails once and answers on the second try passes but is marked `flaky`, and a slow one `slow`: both become environment quirks
 * in memory. A failure that stays means "Environment problem": no product bugs may be reported from a broken environment.
 */
export async function runHealthCheck(args: {
  config: QamindConfig;
  policy: RunPolicy;
  roles: RoleCredentials[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Wait between the first try and the second (default one second; tests use 0). */
  retryDelayMs?: number;
  /** A first answer slower than this is a quirk (default SLOW_MS). */
  slowMs?: number;
}): Promise<HealthResult> {
  const doFetch = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? 15000;
  const checks: Check[] = [];

  const retryDelayMs = args.retryDelayMs ?? 1000;
  const slowMs = args.slowMs ?? SLOW_MS;
  const pause = (): Promise<void> => (retryDelayMs > 0 ? new Promise((r) => setTimeout(r, retryDelayMs)) : Promise.resolve());

  /** One probe, and if it fails, one more after a pause: only a failure that stays is a problem; a failure that goes away is a quirk. */
  const probeUrl = async (name: string, url: string, okBelow: number): Promise<void> => {
    await probeOnce(name, url, okBelow);
    const first = checks[checks.length - 1] as Check;
    if (first.ok || first.detail.startsWith("blocked by") || first.detail.startsWith("redirects to")) return;
    await pause();
    checks.pop();
    await probeOnce(name, url, okBelow);
    const second = checks[checks.length - 1] as Check;
    if (second.ok) {
      second.flaky = true;
      second.detail = `${second.detail}; the first try failed (${first.detail})`;
    } else second.detail = `${second.detail} (twice)`;
  };

  const probeOnce = async (name: string, url: string, okBelow: number): Promise<void> => {
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
      checks.push({ name, ok: res.status < okBelow, detail: `HTTP ${res.status}`, ms, ...(res.status < okBelow && ms >= slowMs ? { slow: true } : {}) });
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
      const attempt = () => loginRole({ role: role.name, creds, login: args.config.api.login as NonNullable<typeof args.config.api.login>, baseUrl: base, policy: args.policy, timeoutMs, fetchImpl: doFetch });
      let session = await attempt();
      let flaky: string | undefined;
      if (session.failure && !/blocked by/i.test(session.failure)) {
        await pause();
        const again = await attempt();
        if (!again.failure) flaky = session.failure;
        session = again;
      }
      const ms = Date.now() - start;
      checks.push({ name, ok: !session.failure, detail: session.failure ? `${session.failure} (twice)` : flaky ? `signed in over the API; the first try failed (${flaky})` : "signed in over the API", ms, ...(flaky ? { flaky: true } : {}), ...(!session.failure && ms >= slowMs ? { slow: true } : {}) });
    }
  }
  return { environment_ok: checks.every((c) => c.ok || c.skipped), checks, ran_at: new Date().toISOString() };
}

/**
 * What `qamind health` does: prepare the test data when `setup.run_before` asks for it, then check the environment. A failed preparation is a failed check, so the run stops
 * as an environment problem instead of testing on top of a half-reset system.
 */
export async function healthWithPrep(args: Parameters<typeof runHealthCheck>[0] & { projectRoot: string; runDir: string; mode: string; redact?: (t: string) => string }): Promise<{ health: HealthResult; prep: EnvPrep }> {
  const prep = await prepareEnvironment({ config: args.config, projectRoot: args.projectRoot, runDir: args.runDir, mode: args.mode, ...(args.redact ? { redact: args.redact } : {}) });
  const line = prepCheck(prep);
  if (line && !line.ok) {
    return { prep, health: { environment_ok: false, checks: [line], ran_at: new Date().toISOString() } };
  }
  const health = await runHealthCheck(args);
  if (line) {
    health.checks.unshift(line);
  }
  return { prep, health };
}
