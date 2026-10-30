import fs from "node:fs";
import path from "node:path";
import { exists, readJson, writeJson } from "./fsutil.ts";
import { SCHEMA_VERSION } from "./paths.ts";

export interface StackInfo {
  schema_version: number;
  frameworks: string[];
  languages: string[];
  test_runners: string[];
  package_manager?: string;
  commands: { test?: string; build?: string; dev?: string };
  detected_at: string;
}

const JS_FRAMEWORKS: Array<[string, string]> = [
  ["next", "nextjs"], ["react", "react"], ["vue", "vue"], ["nuxt", "nuxt"], ["@angular/core", "angular"], ["svelte", "svelte"],
  ["express", "express"], ["fastify", "fastify"], ["@nestjs/core", "nestjs"], ["koa", "koa"], ["hono", "hono"],
];
const JS_TEST_RUNNERS: Array<[string, string]> = [
  ["vitest", "vitest"], ["jest", "jest"], ["mocha", "mocha"], ["@playwright/test", "playwright-test"], ["cypress", "cypress"], ["ava", "ava"],
];

function readIf(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export function detectStack(root: string, now = new Date()): StackInfo {
  const frameworks = new Set<string>();
  const languages = new Set<string>();
  const runners = new Set<string>();
  const commands: StackInfo["commands"] = {};
  let packageManager: string | undefined;

  const pkg = readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> }>(path.join(root, "package.json"));
  if (pkg) {
    languages.add("javascript");
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, name] of JS_FRAMEWORKS) if (deps[dep]) frameworks.add(name);
    for (const [dep, name] of JS_TEST_RUNNERS) if (deps[dep]) runners.add(name);
    if (deps["typescript"] || exists(path.join(root, "tsconfig.json"))) languages.add("typescript");
    packageManager = exists(path.join(root, "pnpm-lock.yaml")) ? "pnpm" : exists(path.join(root, "yarn.lock")) ? "yarn" : exists(path.join(root, "bun.lock")) ? "bun" : "npm";
    const run = packageManager === "npm" ? "npm run" : packageManager;
    if (pkg.scripts?.["test"] && !/no test specified/.test(pkg.scripts["test"])) {
      commands.test = packageManager === "npm" ? "npm test" : `${packageManager} test`;
      if (/node\s+(--\S+\s+)*--test|node:test/.test(pkg.scripts["test"])) runners.add("node:test");
    }
    if (pkg.scripts?.["build"]) commands.build = `${run} build`;
    if (pkg.scripts?.["dev"]) commands.dev = `${run} dev`;
    else if (pkg.scripts?.["start"]) commands.dev = packageManager === "npm" ? "npm start" : `${packageManager} start`;
  }
  const composer = readIf(path.join(root, "composer.json"));
  if (composer) {
    languages.add("php");
    if (/laravel\/framework/.test(composer)) frameworks.add("laravel");
    if (/phpunit/.test(composer)) runners.add("phpunit");
    if (/pestphp/.test(composer)) runners.add("pest");
    packageManager ??= "composer";
  }
  const py = readIf(path.join(root, "requirements.txt")) + readIf(path.join(root, "pyproject.toml"));
  if (py || exists(path.join(root, "manage.py"))) {
    languages.add("python");
    if (/django/i.test(py) || exists(path.join(root, "manage.py"))) frameworks.add("django");
    if (/fastapi/i.test(py)) frameworks.add("fastapi");
    if (/flask/i.test(py)) frameworks.add("flask");
    if (/pytest/i.test(py)) runners.add("pytest");
    packageManager ??= "pip";
  }
  if (/rails/.test(readIf(path.join(root, "Gemfile")))) {
    languages.add("ruby");
    frameworks.add("rails");
    if (/rspec/.test(readIf(path.join(root, "Gemfile")))) runners.add("rspec");
    packageManager ??= "bundler";
  }
  try {
    if (fs.readdirSync(root).some((f) => f.endsWith(".csproj") || f.endsWith(".sln"))) {
      languages.add("csharp");
      frameworks.add("dotnet");
      commands.test ??= "dotnet test";
      packageManager ??= "nuget";
    }
  } catch {
    /* unreadable folder: leave undetected */
  }

  return {
    schema_version: SCHEMA_VERSION,
    frameworks: [...frameworks].sort(),
    languages: [...languages].sort(),
    test_runners: [...runners].sort(),
    ...(packageManager ? { package_manager: packageManager } : {}),
    commands,
    detected_at: now.toISOString(),
  };
}

/** Writes memory/stack.json only when the detected stack changed. Returns whether it changed. */
export function saveStack(memoryDir: string, stack: StackInfo): { changed: boolean } {
  const file = path.join(memoryDir, "stack.json");
  const prev = readJson<StackInfo>(file);
  const strip = (s: StackInfo | undefined) => JSON.stringify({ ...s, detected_at: undefined });
  if (prev && strip(prev) === strip(stack)) return { changed: false };
  writeJson(file, stack);
  return { changed: true };
}
