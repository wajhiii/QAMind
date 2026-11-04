import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { repoRoot } from "../core/helpers.ts";

// One version number, in one place (package.json), reaches everything a user or a release looks at. Releases are Git tags (MAINTAINING.md), so these must agree before one is cut.

const json = (...p: string[]): { version?: string } => JSON.parse(fs.readFileSync(path.join(repoRoot, ...p), "utf8"));
const SEMVER = /^\d+\.\d+\.\d+$/;

test("the version in package.json is a plain version, and the built plugin carries exactly it", () => {
  const v = json("package.json").version as string;
  assert.match(v, SEMVER);
  assert.equal(json("plugins", "qamind", ".claude-plugin", "plugin.json").version, v, "plugin.json is generated: run `npm run build`");
  assert.equal(json("plugins", "qamind", "package.json").version, v, "the plugin's package.json is generated: run `npm run build`");
  assert.equal(json("package-lock.json").version, v, "package-lock.json records the package's own version: update it with package.json (`npm install --package-lock-only`)");
});

test("the changelog's newest section is the package's version (a release bumps both together), and its older sections are in order", () => {
  const v = json("package.json").version as string;
  const heads = [...fs.readFileSync(path.join(repoRoot, "CHANGELOG.md"), "utf8").matchAll(/^## (\d+\.\d+\.\d+)\b/gm)].map((m) => m[1] as string);
  assert.ok(heads.length > 3);
  assert.equal(heads[0], v, "the first `## X.Y.Z` heading of CHANGELOG.md must be package.json's version");
  const num = (s: string): number[] => s.split(".").map(Number);
  for (let i = 1; i < heads.length; i++) {
    const a = num(heads[i - 1] as string);
    const b = num(heads[i] as string);
    assert.ok(a[0]! > b[0]! || (a[0] === b[0] && (a[1]! > b[1]! || (a[1] === b[1] && a[2]! > b[2]!))), `${heads[i - 1]} must be newer than ${heads[i]}`);
  }
});

test("the marketplace lists the plugin that is built, and the docs name the one place to bump", () => {
  const market = JSON.parse(fs.readFileSync(path.join(repoRoot, ".claude-plugin", "marketplace.json"), "utf8")) as { plugins: Array<{ name: string; source: string }> };
  const entry = market.plugins[0];
  assert.equal(entry?.name, "qamind");
  assert.ok(fs.existsSync(path.join(repoRoot, entry?.source ?? "missing", ".claude-plugin", "plugin.json")));
  assert.match(fs.readFileSync(path.join(repoRoot, "MAINTAINING.md"), "utf8"), /bump `version` in `package.json`/i);
});
