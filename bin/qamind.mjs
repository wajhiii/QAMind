#!/usr/bin/env node
// The `qamind` command from a QAMind checkout (what setup puts on the PATH).
//   setup, status, update, uninstall  -> the setup CLI (TypeScript, run directly by Node 22.18 or newer)
//   everything else                   -> the runtime CLI, the same built bundle the plugin runs (Node 20 or newer)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (["setup", "status", "update", "uninstall"].includes(args[0] ?? "")) {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 18)) {
    console.error(`qamind ${args[0]} needs Node 22.18 or newer (this is ${process.version}).`);
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [path.join(app, "cli", "src", "setup-main.ts"), ...args], { stdio: "inherit", env: { ...process.env, QAMIND_APP: app } });
  process.exit(r.status ?? 1);
}
await import(pathToFileURL(path.join(app, "plugins", "qamind", "dist", "qamind.mjs")).href);
