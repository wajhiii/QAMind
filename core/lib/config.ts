import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { loadQaEnv } from "./dotenv.ts";
import { classifyUrl, originOf, parseUrl } from "./urlpolicy.ts";
import type { RunPolicy, SecuritySettings } from "./urlpolicy.ts";

export type Severity = "critical" | "important" | "minor";
export const SEVERITIES: Severity[] = ["critical", "important", "minor"];
export const CONFIG_SCHEMA_VERSION = 1;
export const PLACEHOLDER = "REPLACE_ME";

export interface WebUi {
  name: string;
  url: string;
}
export interface RoleConfig {
  name: string;
  ui: string;
  username_env: string;
  password_env: string;
  tenant?: string;
}
export interface ApiLogin {
  path: string;
  method: string;
  username_field: string;
  password_field: string;
  token_path: string;
  auth_header: string;
}
export interface QamindConfig {
  schema_version: number;
  environment: { name: string; confirmed_non_production: boolean };
  web_uis: WebUi[];
  api: { base_url?: string; openapi?: string; login?: ApiLogin };
  security: SecuritySettings;
  test_data_prefix: string;
  roles: RoleConfig[];
  fix_policy: { fix_severities: Severity[] };
  health: { checks: string[] };
}

export interface ConfigCheck {
  status: "ok" | "unfilled" | "invalid" | "blocked-url" | "ambiguous-url";
  problems: string[];
  blocked: Array<{ url: string; reason: string }>;
  ambiguous: Array<{ url: string; reason: string }>;
  missing_env: string[];
  /** Non-blocking suggestions shown to the user. */
  advisories: string[];
  config?: QamindConfig;
  body?: string;
}

export function splitFrontMatter(text: string): { yaml: string; body: string } | null {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  return m ? { yaml: m[1] ?? "", body: m[2] ?? "" } : null;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function normalizeConfig(raw: unknown, problems: string[]): QamindConfig | undefined {
  if (!isObj(raw)) {
    problems.push("The front matter at the top of config.md is empty or not a YAML mapping.");
    return undefined;
  }
  const schema = typeof raw["schema_version"] === "number" ? raw["schema_version"] : 0;
  if (schema !== CONFIG_SCHEMA_VERSION) problems.push(`schema_version must be ${CONFIG_SCHEMA_VERSION} (found ${String(raw["schema_version"])}).`);

  const env = isObj(raw["environment"]) ? raw["environment"] : {};
  const sec = isObj(raw["security"]) ? raw["security"] : {};
  const api = isObj(raw["api"]) ? raw["api"] : {};
  const login = isObj(api["login"]) ? api["login"] : undefined;

  const web_uis: WebUi[] = [];
  if (raw["web_uis"] !== undefined && !Array.isArray(raw["web_uis"])) problems.push("web_uis must be a list.");
  for (const [i, item] of (Array.isArray(raw["web_uis"]) ? raw["web_uis"] : []).entries()) {
    const name = isObj(item) ? str(item["name"]) : undefined;
    const url = isObj(item) ? str(item["url"]) : undefined;
    if (!name || !url) problems.push(`web_uis[${i}] needs a name and a url.`);
    else web_uis.push({ name, url });
  }

  const roles: RoleConfig[] = [];
  if (raw["roles"] !== undefined && !Array.isArray(raw["roles"])) problems.push("roles must be a list.");
  for (const [i, item] of (Array.isArray(raw["roles"]) ? raw["roles"] : []).entries()) {
    const o = isObj(item) ? item : {};
    const name = str(o["name"]);
    const ui = str(o["ui"]);
    const username_env = str(o["username_env"]);
    const password_env = str(o["password_env"]);
    if (!name || !ui || !username_env || !password_env) {
      problems.push(`roles[${i}] needs name, ui, username_env and password_env.`);
      continue;
    }
    for (const v of [username_env, password_env]) if (!ENV_NAME.test(v)) problems.push(`roles[${i}]: "${v}" is not a valid environment variable name.`);
    const tenant = str(o["tenant"]);
    roles.push({ name, ui, username_env, password_env, ...(tenant ? { tenant } : {}) });
  }

  const fixRaw = isObj(raw["fix_policy"]) ? strList(raw["fix_policy"]["fix_severities"]) : ["critical", "important"];
  const fix_severities = fixRaw.filter((s): s is Severity => (SEVERITIES as string[]).includes(s));
  if (fixRaw.length !== fix_severities.length) problems.push("fix_policy.fix_severities may only contain critical, important, minor.");

  const baseUrl = str(api["base_url"]);
  const openapi = str(api["openapi"]);
  const config: QamindConfig = {
    schema_version: schema,
    environment: { name: str(env["name"]) ?? "test", confirmed_non_production: env["confirmed_non_production"] === true },
    web_uis,
    api: {
      ...(baseUrl && baseUrl.toLowerCase() !== "none" ? { base_url: baseUrl } : {}),
      ...(openapi && openapi.toLowerCase() !== "none" ? { openapi } : {}),
      ...(login
        ? {
            login: {
              path: str(login["path"]) ?? "/login",
              method: (str(login["method"]) ?? "POST").toUpperCase(),
              username_field: str(login["username_field"]) ?? "email",
              password_field: str(login["password_field"]) ?? "password",
              token_path: str(login["token_path"]) ?? "token",
              auth_header: str(login["auth_header"]) ?? "Authorization: Bearer {token}",
            },
          }
        : {}),
    },
    security: {
      blocked_production_patterns: strList(sec["blocked_production_patterns"]),
      not_production_hosts: strList(sec["not_production_hosts"]),
      allowed_extra_origins: strList(sec["allowed_extra_origins"]),
      confirmed_non_production: env["confirmed_non_production"] === true,
    },
    test_data_prefix: str(raw["test_data_prefix"]) ?? "QA-",
    roles,
    fix_policy: { fix_severities: fix_severities.length ? fix_severities : ["critical", "important"] },
    health: { checks: isObj(raw["health"]) ? strList(raw["health"]["checks"]) : [] },
  };
  return config;
}

/** Every URL in the config that the run could touch. */
export function configUrls(c: QamindConfig): Array<{ label: string; url: string }> {
  const out = c.web_uis.map((u) => ({ label: `web_uis "${u.name}"`, url: u.url }));
  if (c.api.base_url) out.push({ label: "api.base_url", url: c.api.base_url });
  if (c.api.openapi && parseUrl(c.api.openapi)) out.push({ label: "api.openapi", url: c.api.openapi });
  for (const o of c.security.allowed_extra_origins) out.push({ label: "security.allowed_extra_origins", url: o });
  return out;
}

export function checkConfigText(text: string, opts: { projectRoot: string; env?: NodeJS.ProcessEnv }): ConfigCheck {
  const result: ConfigCheck = { status: "ok", problems: [], blocked: [], ambiguous: [], missing_env: [], advisories: [] };
  const fm = splitFrontMatter(text);
  if (!fm) {
    result.status = "invalid";
    result.problems.push("config.md must start with a YAML front-matter block between two --- lines.");
    return result;
  }
  result.body = fm.body;

  const leftovers = text.split(/\r?\n/).filter((l) => l.includes(PLACEHOLDER) && !l.trim().startsWith("#") && !l.trim().startsWith("<!--"));
  let raw: unknown;
  try {
    raw = parseYaml(fm.yaml);
  } catch (err) {
    result.status = "invalid";
    result.problems.push(`The front matter is not valid YAML: ${(err as Error).message.split("\n")[0]}`);
    return result;
  }
  const config = normalizeConfig(raw, result.problems);
  if (!config) {
    result.status = "invalid";
    return result;
  }
  result.config = config;

  if (leftovers.length > 0) {
    result.status = "unfilled";
    result.problems.push(`${leftovers.length} value(s) are still ${PLACEHOLDER}. Fill in the template before testing:`);
    for (const l of leftovers.slice(0, 8)) result.problems.push(`  ${l.trim()}`);
    return result;
  }

  if (config.web_uis.length === 0 && !config.api.base_url) result.problems.push("Nothing to test: add at least one entry under web_uis or set api.base_url.");
  if (config.roles.length === 0) result.problems.push("Add at least one test account under roles.");
  if (config.security.blocked_production_patterns.length === 0) result.problems.push("security.blocked_production_patterns is empty: list your production host names so they can never be tested.");
  const uiNames = new Set(config.web_uis.map((u) => u.name));
  for (const r of config.roles) if (r.ui !== "api" && !uiNames.has(r.ui)) result.problems.push(`Role "${r.name}" refers to ui "${r.ui}", which is not in web_uis (use a web_uis name or "api").`);
  const tenants = new Set(config.roles.filter((r) => r.tenant).map((r) => r.tenant));
  if (config.roles.some((r) => r.tenant) && tenants.size < 2) {
    result.advisories.push("Only one customer (tenant) has a test account, so data-isolation between customers cannot be checked. Add a second client account.");
  }
  if (config.api.openapi && !parseUrl(config.api.openapi) && !fs.existsSync(path.resolve(opts.projectRoot, config.api.openapi))) {
    result.problems.push(`api.openapi points to "${config.api.openapi}", which does not exist in the project.`);
  }
  for (const { label, url } of configUrls(config)) {
    if (!parseUrl(url)) {
      result.problems.push(`${label}: "${url}" is not a valid http(s) URL.`);
      continue;
    }
    const verdict = classifyUrl(url, config.security);
    if (verdict.verdict === "blocked") result.blocked.push({ url, reason: `${label} ${verdict.reason}` });
    if (verdict.verdict === "ambiguous") result.ambiguous.push({ url, reason: `${label}: ${verdict.reason}` });
  }

  const names = config.roles.flatMap((r) => [r.username_env, r.password_env]);
  const { values } = loadQaEnv(opts.projectRoot, opts.env ?? process.env, names);
  result.missing_env = [...new Set(names.filter((n) => !values[n]))];

  if (result.blocked.length > 0) result.status = "blocked-url";
  else if (result.problems.length > 0) result.status = "invalid";
  else if (result.ambiguous.length > 0) result.status = "ambiguous-url";
  return result;
}

export function checkConfigFile(projectRoot: string, env?: NodeJS.ProcessEnv): ConfigCheck {
  const file = path.join(projectRoot, ".qa", "config.md");
  return checkConfigText(fs.readFileSync(file, "utf8"), { projectRoot, ...(env ? { env } : {}) });
}

/** The set of origins a run may reach: configured UIs, API base, openapi host, and explicit extras. */
export function policyFromConfig(c: QamindConfig): RunPolicy {
  const origins = new Set<string>();
  for (const { url } of configUrls(c)) {
    const o = originOf(url);
    if (o) origins.add(o);
  }
  return { allowed_origins: [...origins].sort(), blocked_patterns: [...c.security.blocked_production_patterns] };
}
