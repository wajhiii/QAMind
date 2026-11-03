import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { checkConfigFile } from "../lib/config.ts";
import { parseDotenv } from "../lib/dotenv.ts";
import { corePath } from "../lib/corepath.ts";
import { ensureDir, readJson, writeJson } from "../lib/fsutil.ts";
import { defaultProjectDir } from "../lib/memory/service.ts";
import { qamindHome } from "../lib/paths.ts";
import { detectChromeChannel } from "../lib/browserdetect.ts";
import { startGuardProxy } from "./guard-proxy.ts";

/** Pinned: keep in step with hosts/claude/package.json. */
export const PLAYWRIGHT_MCP_VERSION = "0.0.83";

function resolvePlaywrightMcp(): { command: string; args: string[] } {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req.resolve("@playwright/mcp/package.json");
    return { command: process.execPath, args: [path.join(path.dirname(pkg), "cli.js")] };
  } catch {
    // Dependencies were not installed next to the plugin: fall back to the same pinned version via npx.
    return { command: process.platform === "win32" ? "npx.cmd" : "npx", args: ["--yes", `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`] };
  }
}

/**
 * Entry point of the `browser` MCP server that plugins/qamind/.mcp.json starts.
 * It never writes to stdout (that is the MCP channel, inherited by the child).
 */
export async function runBrowserLauncher(): Promise<number> {
  const home = qamindHome();
  const projectRoot = fs.realpathSync(path.resolve(defaultProjectDir()));
  const guard = await startGuardProxy(home);

  // Credentials: .env.qa (if present) plus environment values for the names the config uses. They reach the
  // browser tool only as secret NAMES; the tool replaces the values in everything it returns to the model.
  const secrets: Record<string, string> = {};
  const envFile = path.join(projectRoot, ".env.qa");
  if (fs.existsSync(envFile)) Object.assign(secrets, parseDotenv(fs.readFileSync(envFile, "utf8")));
  try {
    if (fs.existsSync(path.join(projectRoot, ".qa", "config.md"))) {
      const cfg = checkConfigFile(projectRoot).config;
      for (const r of cfg?.roles ?? []) for (const n of [r.username_env, r.password_env]) if (process.env[n]) secrets[n] = process.env[n] as string;
    }
  } catch {
    /* a broken config is reported by `run start`, not here */
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-browser-"));
  fs.chmodSync(tmp, 0o700);
  const secretsFile = path.join(tmp, "secrets.env");
  fs.writeFileSync(secretsFile, Object.entries(secrets).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("\n") + "\n", { mode: 0o600 });
  const outDir = path.join(tmp, "output");
  ensureDir(outDir);

  const stateFile = path.join(home, "state", "browser-state.json");
  const state = readJson<Record<string, unknown>>(stateFile) ?? {};
  state[projectRoot] = { secret_names: Object.keys(secrets).sort(), proxy_port: guard.port, pid: process.pid, started: new Date().toISOString() };
  writeJson(stateFile, state);

  // The page audit is injected into every page so an agent can call window.__qamindAudit() with a one-liner.
  const auditScript = (() => {
    try {
      const f = path.join(corePath(), "shared", "page-audit.js");
      return fs.existsSync(f) ? f : undefined;
    } catch {
      return undefined;
    }
  })();

  // Private data on the page is blurred before any screenshot (spec 13.8): the project's settings go in front of the masking script, which is injected like the audit script.
  const maskScript = (() => {
    try {
      const f = path.join(corePath(), "shared", "page-mask.js");
      if (!fs.existsSync(f)) return undefined;
      const config = fs.existsSync(path.join(projectRoot, ".qa", "config.md")) ? checkConfigFile(projectRoot).config : undefined;
      const names = config?.roles.map((r) => secrets[r.username_env]).filter((v): v is string => !!v) ?? [];
      const cfg = { selectors: config?.privacy.mask_selectors ?? [], patterns: config?.privacy.mask_patterns ?? [], prefix: config?.test_data_prefix ?? "QA-", allow: names };
      const out = path.join(tmp, "page-mask.js");
      fs.writeFileSync(out, `globalThis.__QAMIND_MASK_CONFIG = ${JSON.stringify(cfg)};\n${fs.readFileSync(f, "utf8")}`, { mode: 0o600 });
      return out;
    } catch {
      return undefined;
    }
  })();

  const channel = (process.env["QAMIND_BROWSER_CHANNEL"] as "chrome" | "msedge" | "chromium" | undefined) ?? detectChromeChannel();
  const mcp = resolvePlaywrightMcp();
  const args = [
    ...mcp.args,
    ...(process.env["QAMIND_BROWSER_HEADED"] === "1" ? [] : ["--headless"]),
    "--isolated",
    ...(channel && channel !== "chromium" ? ["--browser", channel] : []),
    "--proxy-server",
    `http://127.0.0.1:${guard.port}`,
    "--secrets",
    secretsFile,
    "--output-dir",
    outDir,
    "--block-service-workers",
    ...(auditScript ? ["--init-script", auditScript] : []),
    ...(maskScript ? ["--init-script", maskScript] : []),
    "--viewport-size",
    "1366x768",
    ...(process.env["QAMIND_BROWSER_IGNORE_HTTPS_ERRORS"] === "1" ? ["--ignore-https-errors"] : []),
  ];
  if (!channel) process.stderr.write("[qamind] No system Chrome/Edge found; using Playwright's bundled Chromium. If the browser fails to start, run: npx playwright-core install chromium\n");

  const child = spawn(mcp.command, args, { stdio: "inherit", cwd: projectRoot });
  const cleanup = async (): Promise<void> => {
    await guard.close().catch(() => undefined);
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => child.kill(sig));
  return new Promise<number>((resolve) => {
    child.on("exit", async (code, signal) => {
      await cleanup();
      resolve(code ?? (signal ? 1 : 0));
    });
    child.on("error", async (err) => {
      process.stderr.write(`[qamind] Could not start the browser tool: ${err.message}\n`);
      await cleanup();
      resolve(1);
    });
  });
}
