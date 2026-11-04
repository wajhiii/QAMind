import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { ParseArgsOptionsConfig } from "node:util";
import { qamindHome } from "../../core/lib/paths.ts";
import { buildApp, checkoutTarget, setupHosts, statusReport, uninstallHosts, updateApp } from "./setup/commands.ts";
import type { Base, SetupReport, StatusReport, UninstallReport, UpdateReport } from "./setup/commands.ts";

/**
 * The setup CLI: `qamind setup | status | update | uninstall` (run by the launcher with Node 22.18+, which loads this TypeScript directly).
 * Everything it does is in ./setup/commands.ts; this file reads the command line and says what happened in plain words (`--json` for scripts).
 */
/** The folder `./setup` was run from (the script moves into the checkout, so it passes this on), else where this process is. */
const callerDir = (): string => process.env["QAMIND_CALLER_DIR"] || process.cwd();

const HELP = `qamind: install QAMind for your coding tools

  qamind setup [--host auto|claude|cursor|generic[,...]] [--project] [--dir DIR] [--version vX.Y.Z] [--skip-build] [--no-launcher] [--dry-run] [--json]
      --host auto     every supported tool found on this machine (the default)
      --host NAME     only that tool; the others are never touched
      --project       install into the project (--dir, default: the folder you ran setup from) instead of your user account
      --version       move this checkout to that release first (the default is whatever is checked out)
  qamind status [--dir DIR] [--json]      one row per install: tool, tier, what is in place
  qamind update [--version vX.Y.Z | --edge] [--skip-build] [--json]
      the latest release tag (releases are Git tags), or a named one; --edge follows the branch while there are no tags yet
  qamind uninstall [--host NAME[,...] | --all] [--project] [--dir DIR] [--purge --yes] [--json]
      removes only what setup added; your memory, run history and lessons are kept unless --purge --yes

Your user store (memory, history, lessons: $QAMIND_HOME, default ~/.qamind) is never touched by any of these except an explicit, confirmed --purge.
`;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env["QAMIND_APP"] ? path.resolve(process.env["QAMIND_APP"]) : path.resolve(here, "..", "..");

function opts<const T extends ParseArgsOptionsConfig>(args: string[], options: T) {
  return parseArgs({ args, options, allowPositionals: false, strict: true });
}

const base = (): Base => ({ repoRoot, home: qamindHome(), userHome: process.env["QAMIND_USER_HOME"] || os.homedir(), env: process.env, ...(process.env["QAMIND_BUILD_DIR"] ? { buildRoot: path.resolve(process.env["QAMIND_BUILD_DIR"]) } : {}) });
const hostList = (v: unknown): string[] => String(v).split(",").map((s) => s.trim()).filter(Boolean);
const out = (s = ""): void => void process.stdout.write(`${s}\n`);

function printSetup(r: SetupReport, scope: string, dry: boolean): void {
  out(`QAMind setup (${scope} level${dry ? ", dry run: nothing was changed" : ""})`);
  for (const h of r.hosts) {
    out("");
    if (h.skipped) {
      out(`  ${h.id}: skipped. ${h.skipped}`);
      continue;
    }
    out(`  ${h.id} (${h.tier})${h.found ? "" : " — the tool itself was not found"}`);
    if (h.detectNote && !h.found) out(`    ${h.detectNote}`);
    if (h.plan) for (const p of h.plan) out(`    would: ${p}`);
    else out(`    ${h.changed.length} change${h.changed.length === 1 ? "" : "s"} made, ${h.unchanged.length} already in place`);
    for (const n of h.notes) out(`    - ${n}`);
  }
  if (r.launcher) {
    out("");
    out(`  qamind command: ${r.launcher.file}${r.launcher.onPath ? "" : `\n    ${r.launcher.dir} is not on your PATH. Add it (for example: export PATH="${r.launcher.dir}:$PATH") so skills can run \`qamind\`; until then they use the full path.`}`);
  }
  for (const p of r.problems) out(`\n  Problem: ${p}`);
}

function printStatus(s: StatusReport): void {
  out(`QAMind ${s.app.version}${s.app.ref ? ` (${s.app.ref})` : ""} in ${s.app.repoRoot}`);
  out(`Your store: ${s.store}`);
  if (s.installs.length === 0) out("\nNothing is installed. Run `qamind setup`.");
  for (const r of s.installs) {
    out("");
    const parts = Object.entries(r.checks).map(([k, v]) => `${k} ${v?.ok}/${v?.total}`).join(", ");
    out(`  ${r.host} (${r.tier}) ${r.ok ? "OK" : "PROBLEMS"}: ${r.scope}${r.project ? ` ${r.project}` : ""}, version ${r.version}, since ${r.installed_at.slice(0, 10)}`);
    out(`    in place: ${parts || "nothing recorded"}`);
    out(`    auto-QA: ${r.auto_qa}${r.auto_qa === "advisory" ? " (the agent is asked to do it; nothing makes it)" : ""}; safety guard: ${r.safety === "hooks" ? "enforced by a hook" : "instructions only"}`);
    if (!r.host_found) out("    the tool itself was not found on this machine");
    if (r.runtime) out(`    runtime: ${r.runtime}${r.runtime_present ? "" : " (MISSING)"}`);
    for (const p of r.problems) out(`    problem: ${p}`);
  }
  if (s.launcher) out(`\n  qamind command: ${s.launcher.file ?? "?"} ${s.launcher.present ? "" : "(MISSING)"}`);
}

function printUninstall(u: UninstallReport): void {
  for (const h of u.hosts) {
    out(`  ${h.id} (${h.scope}): ${h.removed.length} removed`);
    for (const k of h.kept) out(`    kept: ${k}`);
  }
  if (u.launcher_removed) out("  the qamind command was removed (nothing is installed any more)");
  if (u.purged) for (const p of u.purged) out(`  purged ${p}`);
  else out("  Your memory, run history and lessons were not touched.");
  for (const p of u.problems) out(`  Problem: ${p}`);
}

function printUpdate(u: UpdateReport): void {
  out(`Updated ${u.from} -> ${u.to}${u.built ? " (rebuilt)" : ""}`);
  for (const r of u.reinstalled) out(`  re-rendered ${r.host} (${r.scope})`);
  for (const p of u.problems) out(`  Problem: ${p}`);
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  try {
    if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
      process.stdout.write(HELP);
      return 0;
    }
    if (cmd === "setup") {
      const { values: v } = opts(rest, { host: { type: "string", default: "auto" }, project: { type: "boolean", default: false }, dir: { type: "string" }, version: { type: "string" }, "skip-build": { type: "boolean", default: false }, "no-launcher": { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false }, json: { type: "boolean", default: false }, help: { type: "boolean", default: false } });
      if (v.help) {
        process.stdout.write(HELP);
        return 0;
      }
      const b = base();
      if (v.version) checkoutTarget(repoRoot, { version: v.version as string });
      if (!v["skip-build"] && !v["dry-run"]) buildApp(repoRoot);
      const scope = v.project ? "project" : "user";
      const report = await setupHosts({ ...b, hosts: v.host === "auto" ? "auto" : hostList(v.host), scope, projectDir: path.resolve((v.dir as string | undefined) ?? callerDir()), launcher: !v["no-launcher"], dryRun: v["dry-run"] as boolean });
      if (v.json) out(JSON.stringify(report, null, 2));
      else printSetup(report, scope, v["dry-run"] as boolean);
      return report.problems.length ? 1 : 0;
    }
    if (cmd === "status") {
      const { values: v } = opts(rest, { dir: { type: "string" }, json: { type: "boolean", default: false } });
      const s = await statusReport(base(), v.dir ? { project: path.resolve(v.dir as string) } : {});
      if (v.json) out(JSON.stringify(s, null, 2));
      else printStatus(s);
      return s.installs.every((r) => r.ok) ? 0 : 1;
    }
    if (cmd === "update") {
      const { values: v } = opts(rest, { version: { type: "string" }, edge: { type: "boolean", default: false }, "skip-build": { type: "boolean", default: false }, json: { type: "boolean", default: false } });
      const u = await updateApp({ ...base(), ...(v.version ? { version: v.version as string } : {}), edge: v.edge as boolean, skipBuild: v["skip-build"] as boolean });
      if (v.json) out(JSON.stringify(u, null, 2));
      else printUpdate(u);
      return u.problems.length ? 1 : 0;
    }
    if (cmd === "uninstall") {
      const { values: v } = opts(rest, { host: { type: "string" }, all: { type: "boolean", default: false }, project: { type: "boolean", default: false }, dir: { type: "string" }, purge: { type: "boolean", default: false }, yes: { type: "boolean", default: false }, json: { type: "boolean", default: false } });
      if (!v.all && !v.host) {
        process.stderr.write("qamind uninstall needs --host NAME (or --all). It removes only what setup added.\n\n" + HELP);
        return 2;
      }
      const u = await uninstallHosts({ ...base(), hosts: v.all ? "all" : hostList(v.host), ...(v.project ? { scope: "project" as const, projectDir: path.resolve((v.dir as string | undefined) ?? callerDir()) } : {}), purge: v.purge as boolean, confirm: v.yes as boolean });
      if (v.json) out(JSON.stringify(u, null, 2));
      else printUninstall(u);
      return u.problems.length ? 1 : 0;
    }
    process.stderr.write(`qamind: unknown command "${cmd}".\n\n${HELP}`);
    return 2;
  } catch (err) {
    process.stderr.write(`qamind ${cmd ?? ""}: ${(err as Error).message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    process.stderr.write(`qamind: ${(err as Error).stack ?? String(err)}\n`);
    process.exit(1);
  });
}
