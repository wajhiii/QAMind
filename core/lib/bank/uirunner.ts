import path from "node:path";
import { buildMaskScript, findPlaywright, installPolicyRouting, launchEngine } from "../browsers.ts";
import type { PW } from "../browsers.ts";
import { ensureDir } from "../fsutil.ts";
import type { RunPolicy } from "../urlpolicy.ts";
import type { BankTest, UiStep } from "./bank.ts";
import { describeStep, runUiStep } from "./uisteps.ts";

export { describeStep, describeTarget } from "./uisteps.ts";

/**
 * Runs the UI tests of the bank with Playwright, in a browser of its own, one clean context per test.
 * The same rules as the agent's browser: every request is checked against the run's policy (a blocked or unknown address is refused, redirects included),
 * logins come from `.env.qa` by name only, and what a failure says is masked. If Playwright cannot be found, UI tests are reported as skipped with the reason, never as passed.
 */

export interface UiRunnerOptions {
  /** Web UI name to its base address, from the config. */
  baseUrls: Record<string, string>;
  policy: RunPolicy;
  /** Login variable names to their values (never printed, never saved). */
  secrets: Record<string, string>;
  /** Where failure screenshots go. */
  evidenceDir: string;
  /** Removes known secrets from any text. */
  redact: (text: string) => string;
  /** The project's private-data settings, so the in-page blur matches what the agent's browser does. */
  mask?: { selectors: string[]; patterns: string[]; prefix: string; allow: string[] };
  stepTimeoutMs?: number;
  testTimeoutMs?: number;
}

export interface UiOutcome {
  ok: boolean;
  /** One sentence: what failed and at which step. */
  detail?: string;
  /** Screenshot of the failure, relative to the run folder's `evidence` parent. */
  screenshot?: string;
  /** The run could not even start (no browser library, no browser): not a failure of the product. */
  unavailable?: boolean;
  ms: number;
}

export interface UiRunner {
  run(test: BankTest): Promise<UiOutcome>;
  close(): Promise<void>;
}

const clip = (s: string, n = 220): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function createUiRunner(opts: UiRunnerOptions): Promise<UiRunner | { unavailable: string }> {
  const pw = findPlaywright();
  if ("error" in pw) return { unavailable: pw.error };
  const launched = await launchEngine(pw, "chromium", opts.redact);
  if ("unavailable" in launched) return { unavailable: `The test browser could not start. ${launched.unavailable}` };
  const browser: PW = launched.browser;
  const stepMs = opts.stepTimeoutMs ?? 8000;
  const testMs = opts.testTimeoutMs ?? 60_000;
  const maskScript = buildMaskScript(opts.mask);
  const stepCtx = { secrets: opts.secrets, stepMs };

  return {
    async run(test: BankTest): Promise<UiOutcome> {
      const started = Date.now();
      const base = opts.baseUrls[test.ui ?? ""];
      if (!base) return { ok: false, unavailable: true, detail: `The web UI "${test.ui}" is not in the config any more.`, ms: 0 };
      const context: PW = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: "block", ignoreHTTPSErrors: process.env["QAMIND_BROWSER_IGNORE_HTTPS_ERRORS"] === "1" });
      const blockedCount = await installPolicyRouting(context, opts.policy, stepMs);
      if (maskScript) await context.addInitScript({ content: maskScript });
      const page: PW = await context.newPage();
      const steps = test.steps ?? [];
      try {
        const deadline = Date.now() + testMs;
        for (const [i, s] of steps.entries()) {
          if (Date.now() > deadline) throw Object.assign(new Error(`the test took longer than ${Math.round(testMs / 1000)} s`), { step: i });
          try {
            await runUiStep(page, base, s, stepCtx);
          } catch (e) {
            throw Object.assign(new Error((e as Error).message), { step: i });
          }
        }
        return { ok: true, ms: Date.now() - started };
      } catch (e) {
        const step = (e as { step?: number }).step ?? 0;
        let shot: string | undefined;
        try {
          ensureDir(opts.evidenceDir);
          const file = path.join(opts.evidenceDir, `${test.id}.png`);
          await page.screenshot({ path: file, timeout: 4000 });
          shot = path.join("evidence", "bank", `${test.id}.png`);
        } catch {
          /* a page that cannot be photographed still has a failure to report */
        }
        const raw = opts.redact((e as Error).message).split("\n")[0] ?? "";
        const blocked = blockedCount();
        const why = blocked > 0 ? ` (${blocked} request(s) to addresses outside the test environment were refused)` : "";
        return { ok: false, detail: `Step ${step + 1}, to ${steps[step] ? describeStep(steps[step] as UiStep) : "run"}: ${clip(raw)}${why}`, ...(shot ? { screenshot: shot } : {}), ms: Date.now() - started };
      } finally {
        await context.close().catch(() => undefined);
      }
    },
    async close(): Promise<void> {
      await browser.close().catch(() => undefined);
    },
  };
}
