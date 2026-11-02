import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Base } from "../../cli/src/setup/commands.ts";
import type { HostContext, LoadedHost, McpRegistration } from "../../hosts/host-api.ts";
import { repoRoot, tmp } from "../core/helpers.ts";

/** Pieces the host conformance suite is built from (spec 14.1). Everything here talks to a host only through its adapter and what setup wrote. */
export { repoRoot };

export interface Sandbox {
  /** The operating-system user's home for this test: never the real one. */
  userHome: string;
  /** The QAMind user store. */
  store: string;
  project: string;
  env: NodeJS.ProcessEnv;
  base: (hostsDir: string, buildRoot?: string) => Base;
}

export function sandbox(opts: { env?: NodeJS.ProcessEnv } = {}): Sandbox {
  const userHome = tmp("qamind-userhome-");
  const store = tmp("qamind-store-");
  const project = tmp("qamind-project-");
  const buildRoot = path.join(tmp("qamind-build-"), "build");
  const env: NodeJS.ProcessEnv = { ...process.env, QAMIND_HOME: store, QAMIND_USER_HOME: userHome, HOME: userHome, USERPROFILE: userHome, NODE_NO_WARNINGS: "1", ...opts.env };
  for (const k of ["QAMIND_AUTO", "NODE_TEST_CONTEXT", "CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "QAMIND_PROJECT_DIR"]) delete env[k];
  return { userHome, store, project, env, base: (hostsDir, root) => ({ repoRoot, home: store, userHome, env, hostsDir, buildRoot: root ?? buildRoot }) };
}

export const hostContext = (host: LoadedHost, sb: Sandbox, over: Partial<HostContext> = {}): HostContext => ({
  repoRoot,
  runtimeDir: path.join(sb.base(path.dirname(host.dir)).buildRoot as string, host.id),
  userHome: sb.userHome,
  scope: "user",
  projectDir: sb.project,
  version: (JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version: string }).version,
  env: sb.env,
  home: sb.store,
  ...over,
});

/** Every file under a folder, relative, sorted. */
export function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

// ------------------------------------------------------------------------------------------------ MCP servers as a host starts them

export interface Mcp {
  client: Client;
  call: (name: string, args?: Record<string, unknown>) => Promise<{ isError: boolean; json: any; text: string }>;
  close: () => Promise<void>;
  stderr: () => string;
}

/** Start one registered server exactly as registered (command, args, env), the way a host would, and connect to it over stdio. */
export async function startMcp(reg: McpRegistration, o: { cwd: string; env: NodeJS.ProcessEnv; project: string }): Promise<Mcp> {
  const resolve = (v: string): string => v.replaceAll("${workspaceFolder}", o.project).replaceAll("${userHome}", o.env["HOME"] ?? "");
  const transport = new StdioClientTransport({
    command: reg.command === "node" ? process.execPath : reg.command,
    args: reg.args.map(resolve),
    cwd: o.cwd,
    env: { ...(o.env as Record<string, string>), ...Object.fromEntries(Object.entries(reg.env ?? {}).map(([k, v]) => [k, resolve(v)])) },
    stderr: "pipe",
  });
  let err = "";
  transport.stderr?.on("data", (d: Buffer) => (err += d.toString("utf8")));
  const client = new Client({ name: "conformance", version: "0" });
  await client.connect(transport);
  return {
    client,
    stderr: () => err,
    close: () => client.close(),
    call: async (name, args = {}) => {
      const r = await client.callTool({ name, arguments: args });
      const text = (r.content as Array<{ text: string }>)[0]?.text ?? "";
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { isError: !!r.isError, json, text };
    },
  };
}

// ------------------------------------------------------------------------------------------------ hooks as a host runs them

export const fill = (sample: unknown, v: { session: string; cwd: string; prompt?: string }): unknown => JSON.parse(JSON.stringify(sample).replaceAll("{session}", v.session).replaceAll("{cwd}", v.cwd.replaceAll("\\", "\\\\")).replaceAll("{prompt}", v.prompt ?? ""));

export interface HookRun {
  status: number | null;
  stdout: string;
  json: any;
}

/** Run a host's hook command through a shell with the host's JSON on stdin, the way the host does, from a folder that is NOT the project. */
export function runHook(command: string, payload: unknown, env: NodeJS.ProcessEnv, hookEnv: Record<string, string> | undefined, project: string): HookRun {
  const e = { ...env, ...Object.fromEntries(Object.entries(hookEnv ?? {}).map(([k, v]) => [k, v.replaceAll("{cwd}", project)])) };
  const r = spawnSync(command, { input: JSON.stringify(payload), encoding: "utf8", shell: true, cwd: tmp("qamind-hookcwd-"), env: e });
  let json: unknown;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { status: r.status, stdout: r.stdout, json };
}

// ------------------------------------------------------------------------------------------------ a project QAMind can test

import { DEMO_CONFIG, DEMO_ENV, makeProject } from "../core/helpers.ts";

/** A git project with a committed source file, the demo config and test logins (git-ignored, as QAMind's first run leaves them). Remote set so its id is the same wherever it is cloned. */
export function configuredProject(): string {
  const proj = makeProject({
    remote: "https://github.com/acme/conformance.git",
    files: { "src/app.js": "1\n", ".gitignore": ".qa/\n.env.qa\n", "openapi.yaml": fs.readFileSync(path.join(repoRoot, "demo-app", "openapi.yaml"), "utf8") },
  });
  fs.mkdirSync(path.join(proj, ".qa"), { recursive: true });
  fs.writeFileSync(path.join(proj, ".qa", "config.md"), DEMO_CONFIG);
  fs.writeFileSync(path.join(proj, ".env.qa"), Object.entries(DEMO_ENV).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  return proj;
}

/** The QAMind command as a host would run it from the installed runtime (or the plugin): `qamind <args>` against the sandbox's store. */
export function qamind(bundle: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bundle, ...args], { cwd, env, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
