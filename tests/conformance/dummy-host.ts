import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./harness.ts";

/**
 * A made-up host with its own formats (a `servers.json` list instead of `mcpServers`, `on_finish` hooks with other field names, plain Markdown skills), written into a temp
 * folder. Nothing in cli/, core/ or hosts/ knows it exists: if the whole conformance suite passes for it, adding a host needs only its own folder (spec 5.1).
 * Its adapter has no imports of QAMind code at all (types only, which are erased).
 */
export function writeDummyHost(hostsDir: string): string {
  const dir = path.join(hostsDir, "dummy");
  fs.mkdirSync(dir, { recursive: true });
  const hostJson = {
    id: "dummy",
    name: "Dummy Agent",
    tier: "experimental",
    scopes: ["user"],
    skills: { layout: "flat", name_prefix: "dummy-" },
    auto_qa: {
      mode: "enforced",
      invoke: "Run the procedure dummy-qa-auto-run with the mode {mode}.",
      hook_env: {},
      hooks: {
        stop: { input: { session_id: "sid", cwd: "dir" }, loop_active_when: { path: "retries", gt: 0 }, block_output: { continue_with: "{reason}" }, notice_output: null },
        prompt: { input: { session_id: "sid", cwd: "dir", prompt: "text" } },
      },
      samples: {
        prompt: { sid: "{session}", dir: "{cwd}", text: "{prompt}" },
        stop: { sid: "{session}", dir: "{cwd}", retries: 0 },
        stop_after_block: { sid: "{session}", dir: "{cwd}", retries: 1 },
      },
    },
    safety: "instructions",
    commands: { CMD_QA: "dummy-qa", CMD_QA_ONLY: "dummy-qa-only", CMD_QA_AUTO: "dummy-qa-auto", CMD_QA_MEMORY_REVIEW: "dummy-qa-memory-review", CMD_QA_FEEDBACK: "dummy-qa-feedback", CMD_QA_TESTS: "dummy-qa-tests" },
  };
  fs.writeFileSync(path.join(dir, "host.json"), JSON.stringify(hostJson, null, 2));
  fs.writeFileSync(
    path.join(dir, "adapter.ts"),
    `import fs from "node:fs";
import path from "node:path";
import type { HostAdapter, HostContext } from ${JSON.stringify(path.join(repoRoot, "hosts", "host-api.ts"))};

const cfg = (ctx: HostContext): string => path.join(ctx.userHome, ".dummy");
const servers = (ctx: HostContext) => [
  { id: "browser", run: ["node", path.join(ctx.runtimeDir, "dist", "qamind.mjs"), "browser-mcp"] },
  { id: "qa-memory", run: ["node", path.join(ctx.runtimeDir, "dist", "qa-memory.mjs")] },
];
const hook = (ctx: HostContext, event: string): string => 'node "' + path.join(ctx.runtimeDir, "dist", "qamind.mjs") + '" hook ' + event + ' --host-config "' + path.join(ctx.runtimeDir, "host.json") + '"';

export const adapter: HostAdapter = {
  id: "dummy",
  detect: () => ({ found: true }),
  placeholders: (ctx, host) => ({
    HOST_NAME: host.name, HOST_ID: host.id, CLI: "qamind", CLI_FALLBACK: "node " + path.join(ctx.runtimeDir, "dist", "qamind.mjs"), CORE_PATH: path.join(ctx.runtimeDir, "core"),
    SESSION_ID: "", SESSION_ARG: "", SESSION_FLAG: "", ARGUMENTS: "(arguments)", BROWSER_TOOLS: "browser tools", MEMORY_TOOLS: "memory tools", MEMORY_TOOLS_LOAD: "call them by name", FIX_TOOLS_LOAD: "call them by name", QA_TOOLS_APPROVED: "",
    ...host.commands,
  }),
  plan: (ctx) => [
    ...fs.readdirSync(path.join(ctx.runtimeDir, "skills")).map((f) => ({ op: "file" as const, kind: "skill" as const, path: path.join(cfg(ctx), "skills", f), content: fs.readFileSync(path.join(ctx.runtimeDir, "skills", f), "utf8") })),
    ...servers(ctx).map((s) => ({ op: "json" as const, kind: "mcp" as const, path: path.join(cfg(ctx), "servers.json"), keyPath: ["servers"], arrayMatch: { field: "id", equals: s.id }, value: s })),
    { op: "json" as const, kind: "hook" as const, path: path.join(cfg(ctx), "hooks.json"), keyPath: ["on_finish"], arrayMatch: { field: "cmd", equals: hook(ctx, "stop") }, value: { cmd: hook(ctx, "stop") } },
    { op: "json" as const, kind: "hook" as const, path: path.join(cfg(ctx), "hooks.json"), keyPath: ["on_prompt"], arrayMatch: { field: "cmd", equals: hook(ctx, "user-prompt-submit") }, value: { cmd: hook(ctx, "user-prompt-submit") } },
  ],
  hookCommands: (ctx) => ({ stop: hook(ctx, "stop"), prompt: hook(ctx, "user-prompt-submit") }),
  mcpRegistrations: (ctx) => {
    const f = path.join(cfg(ctx), "servers.json");
    const doc = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as { servers?: Array<{ id: string; run: string[] }> }) : {};
    return (doc.servers ?? []).map((s) => ({ name: s.id, command: s.run[0] as string, args: s.run.slice(1) }));
  },
  skills: (ctx) => fs.existsSync(path.join(cfg(ctx), "skills")) ? fs.readdirSync(path.join(cfg(ctx), "skills")).map((f) => ({ name: f.replace(/\\.md$/, ""), file: path.join(cfg(ctx), "skills", f) })) : [],
  notes: () => ["Dummy host installed."],
};
`,
  );
  return dir;
}
