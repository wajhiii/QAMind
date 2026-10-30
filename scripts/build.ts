/**
 * Build: bundle the TypeScript runtime and render core/ + hosts/claude/ into plugins/qamind/.
 *   node scripts/build.ts            write plugins/qamind/
 *   node scripts/build.ts --check    fail (exit 1) if plugins/qamind/ is out of date with core/
 */
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderClaude } from "../hosts/claude/adapter.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version: string };
const knowledgeVersion = fs.existsSync(path.join(repoRoot, "core", "knowledge", "VERSION")) ? fs.readFileSync(path.join(repoRoot, "core", "knowledge", "VERSION"), "utf8").trim() : "0.0.0";

const work = fs.mkdtempSync(path.join(os.tmpdir(), "qamind-build-"));
try {
  const bundleFile = path.join(work, "qamind.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "cli", "src", "bin.ts")],
    outfile: bundleFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    legalComments: "none",
    logLevel: "warning",
    banner: { js: "#!/usr/bin/env node\nimport { createRequire as __qamindCreateRequire } from 'node:module';\nconst require = __qamindCreateRequire(import.meta.url);" },
    define: { __QAMIND_VERSION__: JSON.stringify(pkg.version), __QAMIND_KNOWLEDGE_VERSION__: JSON.stringify(knowledgeVersion) },
  });

  const target = path.join(repoRoot, "plugins", "qamind");
  if (!check) {
    renderClaude({ repoRoot, outDir: target, version: pkg.version, bundleFile });
    console.log(`Built plugins/qamind (qamind ${pkg.version}, knowledge ${knowledgeVersion}).`);
  } else {
    const fresh = path.join(work, "plugin");
    renderClaude({ repoRoot, outDir: fresh, version: pkg.version, bundleFile });
    const list = (root: string): Map<string, Buffer> => {
      const files = new Map<string, Buffer>();
      if (!fs.existsSync(root)) return files;
      const walk = (d: string): void => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.name === "node_modules") continue;
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else files.set(path.relative(root, p).split(path.sep).join("/"), fs.readFileSync(p));
        }
      };
      walk(root);
      return files;
    };
    const a = list(fresh);
    const b = list(target);
    const problems: string[] = [];
    for (const [f, buf] of a) {
      const other = b.get(f);
      if (!other) problems.push(`missing from plugins/qamind: ${f}`);
      else if (!buf.equals(other)) problems.push(`out of date: ${f}`);
    }
    for (const f of b.keys()) if (!a.has(f)) problems.push(`stale file not produced by the build: ${f}`);
    if (problems.length) {
      console.error(`plugins/qamind is out of date with core/. Run \`npm run build\` and commit the result.\n  ${problems.join("\n  ")}`);
      process.exitCode = 1;
    } else {
      console.log("plugins/qamind is up to date.");
    }
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
