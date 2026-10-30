/** Runs `claude plugin validate` on the generated plugin and the marketplace, when the Claude Code CLI is available. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const claude = process.env["CLAUDE_BIN"] ?? "claude";
let failed = false;
for (const target of [path.join(repoRoot, "plugins", "qamind"), repoRoot]) {
  const r = spawnSync(claude, ["plugin", "validate", target], { stdio: "inherit" });
  if (r.error) {
    console.error(`Could not run "${claude}": ${r.error.message}\nInstall Claude Code, or set CLAUDE_BIN to its binary.`);
    process.exit(2);
  }
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
