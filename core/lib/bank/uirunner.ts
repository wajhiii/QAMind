import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { detectChromeChannel } from "../browserdetect.ts";
import { corePath } from "../corepath.ts";
import { ensureDir } from "../fsutil.ts";
import { isRequestAllowed } from "../urlpolicy.ts";
import type { RunPolicy } from "../urlpolicy.ts";
import type { BankTest, UiStep, UiTarget } from "./bank.ts";

/**
 * Runs the UI tests of the bank with Playwright, in a browser of its own, one clean context per test.
 * The same rules as the agent's browser: every request is checked against the run's policy (a blocked or unknown address is refused, redirects included),
 * logins come from `.env.qa` by name only, and what a failure says is masked. If Playwright cannot be found, UI tests are reported as skipped with the reason, never as passed.
 */

/** The little of Playwright's API this file uses: the library is found at run time next to the plugin, so there are no types to import. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type PW = any;

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

function findPlaywright(): PW | { error: string } {
  const here = createRequire(import.meta.url);
  const tries: Array<() => unknown> = [
    // A folder given by hand wins (an unusual install, or a test).
    () => (process.env["QAMIND_PLAYWRIGHT_CORE"] ? here(process.env["QAMIND_PLAYWRIGHT_CORE"]) : undefined),
    () => here("playwright-core"),
    () => {
      // Next to the browser tool: its dependencies hold playwright-core.
      const mcp = here.resolve("@playwright/mcp/package.json");
      return createRequire(mcp)("playwright-core");
    },
  ];
  for (const t of tries) {
    try {
      const pw = t() as { chromium?: unknown };
      if (pw?.chromium) return pw;
    } catch {
      /* try the next place */
    }
  }
  return { error: "Playwright (playwright-core) is not installed next to QAMind, so UI tests of the bank cannot run here. The browser tool's dependencies are installed with the plugin; run `npm ci` in the plugin folder if you are developing." };
}

const clip = (s: string, n = 220): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function describeTarget(t: UiTarget): string {
  if (t.role) return `${t.role}${t.name ? ` "${t.name}"` : ""}`;
  if (t.text) return `text "${t.text}"`;
  if (t.label) return `field "${t.label}"`;
  if (t.testid) return `test id "${t.testid}"`;
  return `selector ${t.selector}`;
}

export function describeStep(s: UiStep): string {
  switch (s.do) {
    case "goto":
      return `open ${s.path}`;
    case "click":
      return `click ${describeTarget(s.target)}`;
    case "fill":
      return `fill ${describeTarget(s.target)}${s.secret ? " (login)" : ""}`;
    case "select":
      return `choose "${s.option}" in ${describeTarget(s.target)}`;
    case "press":
      return `press ${s.key}`;
    case "expect_text":
      return `see the text "${s.text}"`;
    case "expect_no_text":
      return `not see the text "${s.text}"`;
    case "expect_visible":
      return `see ${describeTarget(s.target)}`;
    case "expect_url":
      return `be on an address containing "${s.contains}"`;
    case "expect_count":
      return `count ${s.count} of ${describeTarget(s.target)}`;
    case "wait":
      return `wait ${s.ms} ms`;
  }
}

export async function createUiRunner(opts: UiRunnerOptions): Promise<UiRunner | { unavailable: string }> {
  const pw = findPlaywright();
  if ("error" in pw) return { unavailable: pw.error };
  const channel = (process.env["QAMIND_BROWSER_CHANNEL"] as "chrome" | "msedge" | "chromium" | undefined) ?? detectChromeChannel();
  let browser: PW;
  try {
    browser = await pw.chromium.launch({ headless: process.env["QAMIND_BROWSER_HEADED"] !== "1", ...(channel && channel !== "chromium" ? { channel } : {}) });
  } catch (e) {
    return { unavailable: `The test browser could not start (${clip(opts.redact((e as Error).message).split("\n")[0] ?? "")}). Install Chrome, or run \`npx playwright-core install chromium\`.` };
  }
  const stepMs = opts.stepTimeoutMs ?? 8000;
  const testMs = opts.testTimeoutMs ?? 60_000;
  const maskScript = ((): string | undefined => {
    try {
      const f = path.join(corePath(), "shared", "page-mask.js");
      if (!fs.existsSync(f)) return undefined;
      return `globalThis.__QAMIND_MASK_CONFIG = ${JSON.stringify(opts.mask ?? { selectors: [], patterns: [], prefix: "QA-", allow: [] })};\n${fs.readFileSync(f, "utf8")}`;
    } catch {
      return undefined;
    }
  })();

  const locate = (page: PW, t: UiTarget): PW => {
    if (t.role) return page.getByRole(t.role, t.name ? { name: t.name } : undefined);
    if (t.text) return page.getByText(t.text);
    if (t.label) return page.getByLabel(t.label);
    if (t.testid) return page.getByTestId(t.testid);
    return page.locator(t.selector as string);
  };

  async function poll(check: () => Promise<boolean>, what: string): Promise<void> {
    const end = Date.now() + stepMs;
    for (;;) {
      if (await check().catch(() => false)) return;
      if (Date.now() > end) throw new Error(`${what} did not happen within ${Math.round(stepMs / 1000)} s`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async function runStep(page: PW, base: string, s: UiStep): Promise<void> {
    switch (s.do) {
      case "goto":
        await page.goto(new URL(s.path, base).toString(), { waitUntil: "domcontentloaded", timeout: stepMs });
        return;
      case "click":
        await locate(page, s.target).first().click({ timeout: stepMs });
        return;
      case "fill": {
        const value = s.secret ? opts.secrets[s.secret] : s.value;
        if (value === undefined) throw new Error(`the login variable ${s.secret} has no value in .env.qa`);
        await locate(page, s.target).first().fill(value, { timeout: stepMs });
        return;
      }
      case "select": {
        const el = locate(page, s.target).first();
        try {
          await el.selectOption({ label: s.option }, { timeout: stepMs });
        } catch {
          await el.selectOption(s.option, { timeout: stepMs });
        }
        return;
      }
      case "press":
        await page.keyboard.press(s.key);
        return;
      case "expect_text": {
        const scope = s.target ? locate(page, s.target).first() : page.locator("body");
        await poll(async () => ((await scope.innerText({ timeout: 1000 })) as string).includes(s.text), `seeing the text "${s.text}"`);
        return;
      }
      case "expect_no_text":
        await poll(async () => !((await page.locator("body").innerText({ timeout: 1000 })) as string).includes(s.text), `the text "${s.text}" going away`);
        return;
      case "expect_visible":
        await locate(page, s.target).first().waitFor({ state: "visible", timeout: stepMs });
        return;
      case "expect_url":
        await poll(async () => (page.url() as string).includes(s.contains), `the address containing "${s.contains}"`);
        return;
      case "expect_count":
        await poll(async () => ((await locate(page, s.target).count()) as number) === s.count, `${s.count} of ${describeTarget(s.target)}`);
        return;
      case "wait":
        await new Promise((r) => setTimeout(r, s.ms));
        return;
    }
  }

  return {
    async run(test: BankTest): Promise<UiOutcome> {
      const started = Date.now();
      const base = opts.baseUrls[test.ui ?? ""];
      if (!base) return { ok: false, unavailable: true, detail: `The web UI "${test.ui}" is not in the config any more.`, ms: 0 };
      const context: PW = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: "block", ignoreHTTPSErrors: process.env["QAMIND_BROWSER_IGNORE_HTTPS_ERRORS"] === "1" });
      let blocked = 0;
      // Every request is checked, and redirects are not left to the browser: `route.continue()` lets it follow a redirect to any address without asking again.
      // So the request is made here without following redirects, the Location is checked against the same policy, and only then is the answer handed to the browser,
      // which asks again for the next address (and is checked again).
      await context.route("**/*", async (route: PW) => {
        const url = route.request().url() as string;
        if (/^(data|blob|about):/.test(url)) return route.continue();
        if (!isRequestAllowed(opts.policy, url).allowed) {
          blocked++;
          return route.abort("blockedbyclient");
        }
        try {
          const response: PW = await route.fetch({ maxRedirects: 0, timeout: stepMs });
          const status = response.status() as number;
          const location = status >= 300 && status < 400 ? ((response.headers() as Record<string, string>)["location"] ?? "") : "";
          if (location) {
            let target: string;
            try {
              target = new URL(location, url).toString();
            } catch {
              blocked++;
              return route.abort("blockedbyclient");
            }
            if (!isRequestAllowed(opts.policy, target).allowed) {
              blocked++;
              return route.abort("blockedbyclient");
            }
          }
          return route.fulfill({ response });
        } catch {
          return route.abort("failed");
        }
      });
      if (maskScript) await context.addInitScript({ content: maskScript });
      const page: PW = await context.newPage();
      const steps = test.steps ?? [];
      try {
        const deadline = Date.now() + testMs;
        for (const [i, s] of steps.entries()) {
          if (Date.now() > deadline) throw Object.assign(new Error(`the test took longer than ${Math.round(testMs / 1000)} s`), { step: i });
          try {
            await runStep(page, base, s);
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
