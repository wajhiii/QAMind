import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { checkConfigFile } from "../lib/config.ts";
import { parseDotenv } from "../lib/dotenv.ts";
import { corePath } from "../lib/corepath.ts";
import { ensureDir, readJson, writeJson } from "../lib/fsutil.ts";
import { qamindHome } from "../lib/paths.ts";
import { startGuardProxy } from "./guard-proxy.ts";

/** Pinned: keep in step with hosts/claude/package.json. */
export const PLAYWRIGHT_MCP_VERSION = "0.0.83";

function detectChromeChannel(): "chrome" | "msedge" | undefined {
  const exists = (p: string) => fs.existsSync(p);
  const onPath = (name: string) => (process.env["PATH"] ?? "").split(path.delimiter).some((d) => d && exists(path.join(d, name)));
  if (process.platform === "darwin") {
    if (exists("/Applications/Google Chrome.app")) return "chrome";
    if (exists("/Applications/Microsoft Edge.app")) return "msedge";
  } else if (process.platform === "win32") {
    const roots = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env["LOCALAPPDATA"]].filter((x): x is string => !!x);
    if (roots.some((r) => exists(path.join(r, "Google", "Chrome", "Application", "chrome.exe")))) return "chrome";
    if (roots.some((r) => exists(path.join(r, "Microsoft", "Edge", "Application", "msedge.exe")))) return "msedge";
  } else {
    if (["google-chrome", "google-chrome-stable"].some(onPath)) return "chrome";
    if (onPath("microsoft-edge")) return "msedge";
  }
  return undefined;
}

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
  const projectRoot = fs.realpathSync(path.resolve(process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd()));
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
