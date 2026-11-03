import fs from "node:fs";
import path from "node:path";
import type { Probe } from "../apiplan.ts";
import type { QamindConfig } from "../config.ts";
import type { BankTest, UiStep, UiTarget } from "./bank.ts";

/**
 * Turns bank tests into real Playwright tests for the project (spec 13.3: "copies selected tests into the project's real test folders"). The files are written by this code from the
 * saved data, never by the agent, and carry no credentials: logins are read from the environment variables the QAMind config names. A person reviews them like any other code.
 * Playwright Test is used for both kinds, because a project with no test framework of its own needs one, and many have it already.
 */

export interface ExportedFile {
  /** Relative to the project root. */
  path: string;
  content: string;
  tests: string[];
}

const q = (v: unknown): string => JSON.stringify(v);
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "test";
const comment = (s: string): string => s.replace(/\*\//g, "* /").replace(/\r?\n/g, " ");

/** Where the project keeps its Playwright tests, if it has a Playwright config; otherwise a folder of our own. */
export function exportDir(projectRoot: string, given?: string): string {
  if (given) return given.replace(/^\.?\/+/, "").replace(/\/+$/, "");
  for (const f of ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs", "playwright.config.cjs"]) {
    const file = path.join(projectRoot, f);
    if (!fs.existsSync(file)) continue;
    const m = /testDir\s*:\s*['"`]([^'"`]+)['"`]/.exec(fs.readFileSync(file, "utf8"));
    if (m?.[1]) return `${m[1].replace(/^\.\//, "").replace(/\/+$/, "")}/qamind`;
  }
  return "tests/qamind";
}

const HELPERS = `
function statusOk(status: number, expected: number | string | Array<number | string>): boolean {
  return (Array.isArray(expected) ? expected : [expected]).some((e) => (typeof e === "number" ? e === status : /^[1-5]xx$/i.test(e) ? Math.floor(status / 100) === Number(e[0]) : Number(e) === status));
}
function pick(value: unknown, expr: string): unknown {
  const parts = expr.replace(/^\\$\\.?/, "").match(/[^.[\\]]+|\\[\\d+\\]/g) ?? [];
  let cur: unknown = value;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    const idx = /^\\[(\\d+)\\]$/.exec(part);
    cur = idx ? (Array.isArray(cur) ? cur[Number(idx[1])] : undefined) : (cur as Record<string, unknown>)[part];
  }
  return cur;
}
function capture(json: unknown, expr: string): unknown {
  const first = /^\\$first:([\\w.-]+)$/.exec(expr);
  if (first) {
    const list = Array.isArray(json) ? json : Object.values((json ?? {}) as object).find(Array.isArray);
    const item = (list as unknown[] | undefined)?.[0];
    return item && typeof item === "object" ? (item as Record<string, unknown>)[first[1] as string] : undefined;
  }
  const find = /^\\$find:([\\w.-]+)$/.exec(expr);
  if (find) {
    const walk = (v: unknown, d: number): unknown => {
      if (!v || typeof v !== "object" || d > 3) return undefined;
      const o = v as Record<string, unknown>;
      if (!Array.isArray(v) && find[1]! in o && o[find[1]!] !== null && typeof o[find[1]!] !== "object") return o[find[1]!];
      for (const x of Array.isArray(v) ? v.slice(0, 3) : Object.values(o)) { const f = walk(x, d + 1); if (f !== undefined) return f; }
      return undefined;
    };
    return walk(json, 0);
  }
  return pick(json, expr);
}
function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\\{\\{\\s*([\\w.-]+)\\s*\\}\\}/g, (_m, name: string) => vars[name] ?? \`{{\${name}}}\`);
}
`;

function loginEnv(config: QamindConfig, roles: string[]): string {
  const rows = roles
    .filter((r) => r !== "anonymous")
    .map((r) => config.roles.find((x) => x.name === r))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((r) => `  ${q(r.name)}: { user: ${q(r.username_env)}, pass: ${q(r.password_env)} },`);
  return rows.join("\n");
}

function probeCode(p: Probe): string {
  const L: string[] = [];
  const body = p.raw_body !== undefined ? `, data: fill(${q(p.raw_body)}, vars)` : p.body !== undefined ? `, data: JSON.parse(fill(${q(JSON.stringify(p.body))}, vars))` : "";
  const headers = p.headers && Object.keys(p.headers).length ? `...${q(p.headers)}, ` : "";
  const params = p.query && Object.keys(p.query).length ? `, params: ${q(p.query)}` : "";
  L.push(`    // ${comment(p.id)}: ${comment(p.title)}`);
  L.push(`    {`);
  L.push(`      const api = await as(${q(p.role)});`);
  L.push(`      const res = await api.ctx.fetch(API_BASE + fill(${q(p.path)}, vars), { method: ${q(p.method.toUpperCase())}${params}${body}, headers: { ${headers}...api.headers }, failOnStatusCode: false, maxRedirects: 0 });`);
  L.push(`      const text = await res.text();`);
  L.push(`      let json: unknown; try { json = JSON.parse(text); } catch { json = undefined; }`);
  if (p.expect?.status !== undefined) L.push(`      expect(statusOk(res.status(), ${q(p.expect.status)}), \`${comment(p.id)}: expected HTTP ${comment(JSON.stringify(p.expect.status))}, got \${res.status()}\`).toBeTruthy();`);
  for (const s of [p.expect?.body_contains ?? []].flat()) L.push(`      expect(text).toContain(${q(s)});`);
  for (const s of [p.expect?.body_not_contains ?? []].flat()) L.push(`      expect(text).not.toContain(${q(s)});`);
  for (const c of p.expect?.json ?? []) {
    if (c.exists !== undefined) L.push(`      expect(pick(json, ${q(c.path)}) !== undefined, ${q(`${c.path} exists`)}).toBe(${c.exists});`);
    if ("equals" in c) L.push(`      expect(pick(json, ${q(c.path)})).toEqual(${q(c.equals)});`);
    if (c.lte !== undefined) L.push(`      expect(Number(pick(json, ${q(c.path)}))).toBeLessThanOrEqual(${c.lte});`);
    if (c.gte !== undefined) L.push(`      expect(Number(pick(json, ${q(c.path)}))).toBeGreaterThanOrEqual(${c.gte});`);
    if (c.matches !== undefined) L.push(`      expect(String(pick(json, ${q(c.path)}))).toMatch(new RegExp(${q(c.matches)}));`);
  }
  for (const [name, expr] of Object.entries(p.capture ?? {})) L.push(`      vars[${q(name)}] = String(capture(json, ${q(expr)}) ?? "");`);
  L.push(`    }`);
  return L.join("\n");
}

function apiFile(tests: BankTest[], config: QamindConfig): string {
  const roles = [...new Set(tests.flatMap((t) => (t.plan?.probes ?? []).map((p) => p.role)))];
  const login = config.api.login;
  const L: string[] = [];
  L.push(`// Generated by QAMind from test bank entr${tests.length === 1 ? "y" : "ies"} ${tests.map((t) => t.id).join(", ")}. Review it like any other test.`);
  L.push(`// It reads the API address from QAMIND_API_BASE (default ${comment(config.api.base_url ?? "http://localhost:3000/api")}) and the test logins from the environment variables below; no value is stored here.`);
  L.push(`import { expect, request, test } from "@playwright/test";`);
  L.push(`import type { APIRequestContext } from "@playwright/test";`, "");
  L.push(`const API_BASE = (process.env["QAMIND_API_BASE"] ?? ${q(config.api.base_url ?? "http://localhost:3000/api")}).replace(/\\/+$/, "");`);
  L.push(`const LOGINS: Record<string, { user: string; pass: string }> = {`, loginEnv(config, roles), `};`);
  L.push(HELPERS.trimEnd());
  L.push("", `async function as(role: string): Promise<{ ctx: APIRequestContext; headers: Record<string, string> }> {`);
  L.push(`  const ctx = await request.newContext({ extraHTTPHeaders: { accept: "application/json" } });`);
  L.push(`  if (role === "anonymous") return { ctx, headers: {} };`);
  if (!login) L.push(`  throw new Error("The QAMind config has no api.login, so tests that sign in cannot be exported as they are: add the sign-in here.");`);
  else {
    L.push(`  const env = LOGINS[role];`);
    L.push(`  const username = env ? process.env[env.user] : undefined;`);
    L.push(`  const password = env ? process.env[env.pass] : undefined;`);
    L.push(`  if (!username || !password) throw new Error(\`Set the test login variables for "\${role}" (\${env ? env.user + ", " + env.pass : "unknown role"}) to run this test.\`);`);
    L.push(`  const res = await ctx.fetch(API_BASE + ${q(login.path)}, { method: ${q(login.method)}, data: { ${q(login.username_field)}: username, ${q(login.password_field)}: password }, failOnStatusCode: false });`);
    L.push(`  expect(res.ok(), \`signing in as \${role}\`).toBeTruthy();`);
    if (login.token_path === "cookie") L.push(`  return { ctx, headers: {} };`);
    else {
      const sep = login.auth_header.indexOf(":");
      L.push(`  const token = String(pick(await res.json(), ${q(login.token_path)}) ?? "");`);
      L.push(`  expect(token, "the sign-in answered with a token").not.toBe("");`);
      L.push(`  return { ctx, headers: { ${q(login.auth_header.slice(0, sep).trim())}: ${q(login.auth_header.slice(sep + 1).trim())}.replace("{token}", token) } };`);
    }
  }
  L.push(`}`, "");
  for (const t of tests) {
    L.push(`/** ${comment(t.id)}. Protects: ${comment(t.card.protects)} Fails when: ${comment(t.card.fails_when)}${t.protects_bug ? ` (QAMind bug ${comment(t.protects_bug)})` : ""} */`);
    L.push(`test(${q(`${t.id}: ${t.title}`)}, async () => {`);
    L.push(`  const vars: Record<string, string> = ${q(t.plan?.vars ?? {})};`);
    for (const p of t.plan?.probes ?? []) {
      const times = p.repeat?.count ?? 1;
      L.push(times > 1 ? `  for (let i = 0; i < ${times}; i++) {\n${probeCode(p)}\n  }` : probeCode(p));
    }
    L.push(`});`, "");
  }
  return L.join("\n");
}

function locatorCode(t: UiTarget): string {
  if (t.role) return `page.getByRole(${q(t.role)}${t.name ? `, { name: ${q(t.name)} }` : ""})`;
  if (t.text) return `page.getByText(${q(t.text)})`;
  if (t.label) return `page.getByLabel(${q(t.label)})`;
  if (t.testid) return `page.getByTestId(${q(t.testid)})`;
  return `page.locator(${q(t.selector)})`;
}

function stepCode(s: UiStep): string {
  switch (s.do) {
    case "goto":
      return `await page.goto(UI_BASE + ${q(s.path)});`;
    case "click":
      return `await ${locatorCode(s.target)}.first().click();`;
    case "fill":
      return s.secret ? `await ${locatorCode(s.target)}.first().fill(secret(${q(s.secret)}));` : `await ${locatorCode(s.target)}.first().fill(${q(s.value)});`;
    case "select":
      return `await ${locatorCode(s.target)}.first().selectOption({ label: ${q(s.option)} });`;
    case "press":
      return `await page.keyboard.press(${q(s.key)});`;
    case "expect_text":
      return s.target ? `await expect(${locatorCode(s.target)}.first()).toContainText(${q(s.text)});` : `await expect(page.locator("body")).toContainText(${q(s.text)});`;
    case "expect_no_text":
      return `await expect(page.locator("body")).not.toContainText(${q(s.text)});`;
    case "expect_visible":
      return `await expect(${locatorCode(s.target)}.first()).toBeVisible();`;
    case "expect_url":
      return `await expect(page).toHaveURL(new RegExp(${q(s.contains.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))}));`;
    case "expect_count":
      return `await expect(${locatorCode(s.target)}).toHaveCount(${s.count});`;
    case "wait":
      return `await page.waitForTimeout(${s.ms});`;
  }
}

function uiFile(tests: BankTest[], config: QamindConfig): string {
  const L: string[] = [];
  L.push(`// Generated by QAMind from test bank entr${tests.length === 1 ? "y" : "ies"} ${tests.map((t) => t.id).join(", ")}. Review it like any other test.`);
  L.push(`// The web address comes from QAMIND_UI_BASE (default: the address in the QAMind config for the test's web UI); logins are read from environment variables, never stored here.`);
  L.push(`import { expect, test } from "@playwright/test";`, "");
  L.push(`function secret(name: string): string {`, `  const v = process.env[name];`, `  if (!v) throw new Error(\`Set \${name} (a test login) to run this test.\`);`, `  return v;`, `}`, "");
  for (const t of tests) {
    const base = config.web_uis.find((u) => u.name === t.ui)?.url ?? "http://localhost:3000";
    L.push(`/** ${comment(t.id)}. Protects: ${comment(t.card.protects)} Fails when: ${comment(t.card.fails_when)}${t.protects_bug ? ` (QAMind bug ${comment(t.protects_bug)})` : ""} */`);
    L.push(`test(${q(`${t.id}: ${t.title}`)}, async ({ page }) => {`);
    L.push(`  const UI_BASE = (process.env["QAMIND_UI_BASE"] ?? ${q(base)}).replace(/\\/+$/, "");`);
    for (const s of t.steps ?? []) L.push(`  ${stepCode(s)}`);
    L.push(`});`, "");
  }
  return L.join("\n");
}

/** One file per test, named after it, so a person can keep, move or delete tests one at a time. */
export function generateExports(tests: BankTest[], config: QamindConfig, dir: string): ExportedFile[] {
  const out: ExportedFile[] = [];
  for (const t of tests) {
    const content = t.kind === "api" ? apiFile([t], config) : uiFile([t], config);
    out.push({ path: `${dir}/${t.id.toLowerCase()}-${slug(t.title)}.spec.ts`, content, tests: [t.id] });
  }
  return out;
}
