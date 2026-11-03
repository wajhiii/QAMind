import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { detectChromeChannel } from "./browserdetect.ts";
import type { BrowserEngine } from "./config.ts";
import { corePath } from "./corepath.ts";
import { isRequestAllowed } from "./urlpolicy.ts";
import type { RunPolicy } from "./urlpolicy.ts";

/**
 * The browsers QAMind's own tools drive (the bank's UI tests, the page sweep): finding Playwright, launching an engine, and the one policy every request goes through.
 * The agent's own browser is the host's browser tool; this is for the checks code runs by itself.
 */

/** The little of Playwright's API these tools use: the library is found at run time next to the plugin, so there are no types to import. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type PW = any;

const clip = (s: string, n = 220): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function findPlaywright(): PW | { error: string } {
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
  return { error: "Playwright (playwright-core) is not installed next to QAMind, so the browser checks cannot run here. The browser tool's dependencies are installed with the plugin; run `npm ci` in the plugin folder if you are developing." };
}

/** The folder of the `playwright-core` package QAMind uses, for running its own installer. */
export function playwrightCoreDir(): string | undefined {
  const here = createRequire(import.meta.url);
  for (const t of [() => (process.env["QAMIND_PLAYWRIGHT_CORE"] ? here.resolve(path.join(process.env["QAMIND_PLAYWRIGHT_CORE"], "package.json")) : undefined), () => here.resolve("playwright-core/package.json"), () => createRequire(here.resolve("@playwright/mcp/package.json")).resolve("playwright-core/package.json")]) {
    try {
      const p = t();
      if (p) return path.dirname(p);
    } catch {
      /* try the next place */
    }
  }
  return undefined;
}

export const ENGINE_LABEL: Record<BrowserEngine, string> = { chromium: "Chromium (Chrome)", firefox: "Firefox", webkit: "WebKit (Safari's engine)" };

export interface EngineStatus {
  engine: BrowserEngine;
  available: boolean;
  /** What is used, or why it cannot be. */
  detail: string;
}

export const installHint = (engine: BrowserEngine): string => `${ENGINE_LABEL[engine]} is not installed for QAMind's browser checks. The owner can install it with \`qamind browsers install ${engine}\` (a download of about 80 MB, kept in Playwright's own browser folder).`;

/** Whether each engine can be launched here: Chromium through an installed Chrome or Edge, or Playwright's own build; Firefox and WebKit only through Playwright's own build. */
export function engineStatus(pw: PW | { error: string }, engines: readonly BrowserEngine[]): EngineStatus[] {
  return engines.map((engine) => {
    if ("error" in pw) return { engine, available: false, detail: pw.error };
    if (engine === "chromium" && (process.env["QAMIND_BROWSER_CHANNEL"] || detectChromeChannel())) return { engine, available: true, detail: `the installed ${process.env["QAMIND_BROWSER_CHANNEL"] ?? detectChromeChannel()}` };
    try {
      const exe = (pw[engine] as { executablePath(): string }).executablePath();
      if (exe && fs.existsSync(exe)) return { engine, available: true, detail: "Playwright's own build" };
    } catch {
      /* not known to this Playwright */
    }
    return { engine, available: false, detail: installHint(engine) };
  });
}

/** Starts an engine. A failure comes back as a sentence a person can act on, never a stack trace. */
export async function launchEngine(pw: PW, engine: BrowserEngine, redact: (s: string) => string = (s) => s): Promise<{ browser: PW } | { unavailable: string }> {
  const headless = process.env["QAMIND_BROWSER_HEADED"] !== "1";
  try {
    if (engine === "chromium") {
      const channel = (process.env["QAMIND_BROWSER_CHANNEL"] as "chrome" | "msedge" | "chromium" | undefined) ?? detectChromeChannel();
      return { browser: await pw.chromium.launch({ headless, ...(channel && channel !== "chromium" ? { channel } : {}) }) };
    }
    return { browser: await (pw[engine] as { launch(o: unknown): Promise<PW> }).launch({ headless }) };
  } catch (e) {
    const first = clip(redact((e as Error).message).split("\n")[0] ?? "");
    if (/executable doesn't exist|not installed|browserType\.launch: Executable/i.test((e as Error).message)) return { unavailable: installHint(engine) };
    return { unavailable: `${ENGINE_LABEL[engine]} could not start (${first}).${engine === "chromium" ? " Install Chrome, or run `qamind browsers install chromium`." : ""}` };
  }
}

/** Runs Playwright's own installer for one engine. Owner-only (the safety hook refuses it in a run). */
export function installEngine(engine: BrowserEngine): { ok: boolean; output: string } {
  const dir = playwrightCoreDir();
  if (!dir) return { ok: false, output: "Playwright is not installed next to QAMind." };
  try {
    const out = execFileSync(process.execPath, [path.join(dir, "cli.js"), "install", engine], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 900_000, env: process.env });
    return { ok: true, output: out.split("\n").filter((l) => !/^\|/.test(l)).join("\n").trim().slice(-600) };
  } catch (e) {
    return { ok: false, output: clip(((e as { stderr?: string }).stderr ?? (e as Error).message).toString().trim(), 600) };
  }
}

/**
 * Every request a browser context makes is checked against the run's policy, and redirects are not left to the browser: `route.continue()` lets it follow a redirect to any address
 * without asking again. So the request is made here without following redirects, the Location is checked against the same policy, and only then is the answer handed to the browser,
 * which asks again for the next address (and is checked again). Returns a function that says how many requests were refused.
 */
export async function installPolicyRouting(context: PW, policy: RunPolicy, timeoutMs: number): Promise<() => number> {
  let blocked = 0;
  await context.route("**/*", async (route: PW) => {
    const url = route.request().url() as string;
    if (/^(data|blob|about):/.test(url)) return route.continue();
    if (!isRequestAllowed(policy, url).allowed) {
      blocked++;
      return route.abort("blockedbyclient");
    }
    try {
      const response: PW = await route.fetch({ maxRedirects: 0, timeout: timeoutMs });
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
        if (!isRequestAllowed(policy, target).allowed) {
          blocked++;
          return route.abort("blockedbyclient");
        }
      }
      return route.fulfill({ response });
    } catch {
      return route.abort("failed");
    }
  });
  return () => blocked;
}

/** The in-page script that blurs private data before a screenshot is taken (the same file the agent's browser loads), with the project's settings in front of it. */
export function buildMaskScript(mask?: { selectors: string[]; patterns: string[]; prefix: string; allow: string[] }): string | undefined {
  try {
    const f = path.join(corePath(), "shared", "page-mask.js");
    if (!fs.existsSync(f)) return undefined;
    return `globalThis.__QAMIND_MASK_CONFIG = ${JSON.stringify(mask ?? { selectors: [], patterns: [], prefix: "QA-", allow: [] })};\n${fs.readFileSync(f, "utf8")}`;
  } catch {
    return undefined;
  }
}

/** The page audit the agent's browser loads (`window.__qamindAudit()`): its leads are what the sweep reports for every page it visits. */
export function readAuditScript(): string | undefined {
  try {
    const f = path.join(corePath(), "shared", "page-audit.js");
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : undefined;
  } catch {
    return undefined;
  }
}
