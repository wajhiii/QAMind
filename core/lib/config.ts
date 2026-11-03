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
/** What `/qa` (fix mode) may do (spec 7.3, 9.3). Everything here is optional in the file and has the default shown. */
export interface FixPolicy {
  fix_severities: Severity[];
  /** Hard cap on fixes per run (default 30). */
  max_fixes: number;
  /** The whole test suite. Default: detected from the project's package scripts or build files. */
  test_command?: string;
  /** One test file, with `{file}` where the path goes. Default: the standard command for the detected test runner. */
  test_file_command?: string;
  /** Seconds a single test command may run before it is stopped (default 300). */
  test_timeout_s: number;
  /** Globs of files a fix must never edit, in addition to the built-in list (credentials, CI, lock files, generated code, migrations). */
  do_not_touch: string[];
}

export const DEFAULT_MAX_FIXES = 30;
export const DEFAULT_TEST_TIMEOUT_S = 300;

/** Test data setup and reset (spec 13.1). Every command is optional and runs only against the configured, non-production environment. */
export const RUN_BEFORE = ["never", "full_runs", "always"] as const;
export type RunBefore = (typeof RUN_BEFORE)[number];
export interface SetupSettings {
  /** Puts the test data in place (for example loads fixtures). */
  seed_command?: string;
  /** Puts the test environment back to a known state. */
  reset_command?: string;
  /** Takes a snapshot before testing (for example of a database), so destructive tests can be undone. */
  snapshot_command?: string;
  /** Restores that snapshot when the run ends. */
  restore_command?: string;
  /** When to snapshot, reset and seed: never (default), only before full runs, or before every run. */
  run_before: RunBefore;
  /** Seconds one of these commands may run before it is stopped (default 120). */
  timeout_s: number;
}
export const DEFAULT_SETUP_TIMEOUT_S = 120;

/** Time and cost budgets (spec 13.6). `daily_max` is minutes of auto-QA and CI per day: the unit a run can always measure. */
export const BUDGET_MODES = ["diff", "quick", "regression", "full", "ticket", "ci", "auto"] as const;
export type BudgetMode = (typeof BUDGET_MODES)[number];
export interface ModeBudget {
  time_minutes?: number;
  /** In the host's own unit (dollars on most): QAMind cannot see a host's spending, so this is told to the agent and recorded, not enforced. */
  max_cost?: number;
}
export interface BudgetSettings extends ModeBudget {
  daily_max?: number;
  modes: Partial<Record<BudgetMode, ModeBudget>>;
}

/** What can fail or warn a CI run (spec 13.2). */
export const CI_CONDITIONS = ["critical", "important", "minor", "environment-problem", "came-back", "bank-failure", "not-ready"] as const;
export type CiCondition = (typeof CI_CONDITIONS)[number];
/** `ticket` mode arrives with ticket mode itself (spec 13.4). */
export const CI_MODES = ["diff", "quick", "regression", "full"] as const;
export type CiMode = (typeof CI_MODES)[number];

/** CI / pull-request mode (spec 13.2). */
export interface CiSettings {
  /** Any of these makes the run fail: exit code 1 and a failing status. Default: a critical problem, or an environment problem. */
  fail_on: CiCondition[];
  /** Any of these (when nothing in fail_on matched) is a warning: passing status, a note in the comment. Default: an important problem. */
  warn_on: CiCondition[];
  /** Keep a CI-only memory store between runs, restored by the CI's own cache (keyed by repository and branch). Never committed, never mixed with a person's own memory. */
  cache_memory: boolean;
  /** The mode a pull request is tested in. */
  mode: CiMode;
  /** Post (and update) one comment on the pull request. */
  comment: boolean;
  /** Set a commit status. */
  status: boolean;
  status_context: string;
  /** The agent is stopped after this long, whatever the time budget says. */
  timeout_minutes: number;
}

export const DEFAULT_CI: CiSettings = { fail_on: ["critical", "environment-problem"], warn_on: ["important"], cache_memory: false, mode: "diff", comment: true, status: true, status_context: "qamind", timeout_minutes: 25 };

/** Private data masking in evidence (spec 13.8). */
export interface PrivacySettings {
  /** Extra regular expressions (JavaScript syntax) for data that must never be saved. */
  mask_patterns: string[];
  /** CSS selectors of screen elements to blur before a screenshot is taken. */
  mask_selectors: string[];
  /** Names of fields (in API evidence) whose values are masked: `name`, `address`, ... */
  mask_fields: string[];
}

export interface QamindConfig {
  schema_version: number;
  environment: { name: string; confirmed_non_production: boolean };
  web_uis: WebUi[];
  api: { base_url?: string; openapi?: string; login?: ApiLogin };
  security: SecuritySettings;
  test_data_prefix: string;
  roles: RoleConfig[];
  fix_policy: FixPolicy;
  health: { checks: string[] };
  setup: SetupSettings;
  budget: BudgetSettings;
  privacy: PrivacySettings;
  ci: CiSettings;
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

const COMMAND_MAX = 500;
const command = (v: unknown, name: string, problems: string[]): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || v.trim() === "" || v.length > COMMAND_MAX || /[\r\n]/.test(v)) {
    problems.push(`setup.${name} must be one command on one line, up to ${COMMAND_MAX} characters.`);
    return undefined;
  }
  return v.trim();
};

function normalizeSetup(raw: unknown, problems: string[]): SetupSettings {
  const o = isObj(raw) ? raw : {};
  if (raw !== undefined && raw !== null && !isObj(raw)) problems.push("setup must be a mapping (seed_command, reset_command, snapshot_command, restore_command, run_before).");
  const runBefore = o["run_before"];
  if (runBefore !== undefined && !(RUN_BEFORE as readonly unknown[]).includes(runBefore)) problems.push(`setup.run_before must be one of ${RUN_BEFORE.join(", ")} (found ${JSON.stringify(runBefore)}).`);
  const timeout = o["timeout_s"];
  if (timeout !== undefined && !(typeof timeout === "number" && timeout >= 5 && timeout <= 3600)) problems.push("setup.timeout_s must be a number of seconds from 5 to 3600.");
  const seed = command(o["seed_command"], "seed_command", problems);
  const reset = command(o["reset_command"], "reset_command", problems);
  const snapshot = command(o["snapshot_command"], "snapshot_command", problems);
  const restore = command(o["restore_command"], "restore_command", problems);
  if (snapshot && !restore) problems.push("setup.snapshot_command needs setup.restore_command: a snapshot that is never restored would only fill the disk.");
  if (restore && !snapshot) problems.push("setup.restore_command needs setup.snapshot_command.");
  return {
    ...(seed ? { seed_command: seed } : {}),
    ...(reset ? { reset_command: reset } : {}),
    ...(snapshot ? { snapshot_command: snapshot } : {}),
    ...(restore ? { restore_command: restore } : {}),
    run_before: (RUN_BEFORE as readonly unknown[]).includes(runBefore) ? (runBefore as RunBefore) : "never",
    timeout_s: typeof timeout === "number" && timeout >= 5 && timeout <= 3600 ? timeout : DEFAULT_SETUP_TIMEOUT_S,
  };
}

function modeBudget(raw: unknown, where: string, problems: string[]): ModeBudget {
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) {
    problems.push(`${where} must be a mapping with time_minutes and/or max_cost.`);
    return {};
  }
  const t = raw["time_minutes"];
  const c = raw["max_cost"];
  if (t !== undefined && !(typeof t === "number" && t >= 1 && t <= 1440)) problems.push(`${where}.time_minutes must be a number of minutes from 1 to 1440.`);
  if (c !== undefined && !(typeof c === "number" && c > 0 && c <= 100000)) problems.push(`${where}.max_cost must be a positive number.`);
  return { ...(typeof t === "number" && t >= 1 && t <= 1440 ? { time_minutes: t } : {}), ...(typeof c === "number" && c > 0 && c <= 100000 ? { max_cost: c } : {}) };
}

function normalizeBudget(raw: unknown, problems: string[]): BudgetSettings {
  if (raw === undefined || raw === null) return { modes: {} };
  if (!isObj(raw)) {
    problems.push("budget must be a mapping (time_minutes, max_cost, daily_max, modes).");
    return { modes: {} };
  }
  const top = modeBudget(raw, "budget", problems);
  const daily = raw["daily_max"];
  if (daily !== undefined && !(typeof daily === "number" && daily >= 1 && daily <= 10080)) problems.push("budget.daily_max must be a number of minutes of auto-QA and CI per day, from 1 to 10080.");
  const modes: Partial<Record<BudgetMode, ModeBudget>> = {};
  const rawModes = raw["modes"];
  if (rawModes !== undefined && !isObj(rawModes)) problems.push("budget.modes must be a mapping from a mode (diff, quick, full, ticket, ci, auto) to its own limits.");
  else if (isObj(rawModes)) {
    for (const [k, v] of Object.entries(rawModes)) {
      if (!(BUDGET_MODES as readonly string[]).includes(k)) problems.push(`budget.modes.${k}: not a mode. Use ${BUDGET_MODES.join(", ")}.`);
      else modes[k as BudgetMode] = modeBudget(v, `budget.modes.${k}`, problems);
    }
  }
  return { ...top, ...(typeof daily === "number" && daily >= 1 && daily <= 10080 ? { daily_max: daily } : {}), modes };
}

function normalizeCi(raw: unknown, problems: string[]): CiSettings {
  if (raw === undefined || raw === null) return { ...DEFAULT_CI };
  if (!isObj(raw)) {
    problems.push("ci must be a mapping (fail_on, warn_on, cache_memory, mode, comment, status, status_context, timeout_minutes).");
    return { ...DEFAULT_CI };
  }
  const conditions = (key: "fail_on" | "warn_on"): CiCondition[] => {
    const v = raw[key];
    if (v === undefined || v === null) return [...DEFAULT_CI[key]];
    if (!Array.isArray(v)) {
      problems.push(`ci.${key} must be a list of: ${CI_CONDITIONS.join(", ")}.`);
      return [...DEFAULT_CI[key]];
    }
    const out: CiCondition[] = [];
    for (const c of v) {
      if (typeof c === "string" && (CI_CONDITIONS as readonly string[]).includes(c)) out.push(c as CiCondition);
      else problems.push(`ci.${key}: "${String(c)}" is not a condition. Use ${CI_CONDITIONS.join(", ")}.`);
    }
    return [...new Set(out)];
  };
  const failOn = conditions("fail_on");
  const warnOn = conditions("warn_on");
  for (const c of warnOn) if (failOn.includes(c)) problems.push(`ci: "${c}" is in both fail_on and warn_on; it would fail the run, so take it out of warn_on.`);
  const bool = (key: "cache_memory" | "comment" | "status"): boolean => {
    const v = raw[key];
    if (v === undefined) return DEFAULT_CI[key];
    if (typeof v !== "boolean") problems.push(`ci.${key} must be true or false.`);
    return typeof v === "boolean" ? v : DEFAULT_CI[key];
  };
  const mode = raw["mode"];
  if (mode !== undefined && !(typeof mode === "string" && (CI_MODES as readonly string[]).includes(mode))) problems.push(`ci.mode must be one of ${CI_MODES.join(", ")} (ticket mode comes with ticket mode).`);
  const context = raw["status_context"];
  if (context !== undefined && !(typeof context === "string" && /^[\w .:/-]{1,60}$/.test(context))) problems.push("ci.status_context must be a short name (letters, digits, space and . : / - _).");
  const timeout = raw["timeout_minutes"];
  if (timeout !== undefined && !(typeof timeout === "number" && timeout >= 1 && timeout <= 360)) problems.push("ci.timeout_minutes must be a number of minutes from 1 to 360.");
  return {
    fail_on: failOn,
    warn_on: warnOn.filter((c) => !failOn.includes(c)),
    cache_memory: bool("cache_memory"),
    mode: typeof mode === "string" && (CI_MODES as readonly string[]).includes(mode) ? (mode as CiMode) : DEFAULT_CI.mode,
    comment: bool("comment"),
    status: bool("status"),
    status_context: typeof context === "string" && /^[\w .:/-]{1,60}$/.test(context) ? context : DEFAULT_CI.status_context,
    timeout_minutes: typeof timeout === "number" && timeout >= 1 && timeout <= 360 ? timeout : DEFAULT_CI.timeout_minutes,
  };
}

const LIST_MAX = 30;
function limitedStrings(raw: unknown, where: string, problems: string[], opts: { max: number; test: (s: string) => string | undefined }): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    problems.push(`${where} must be a list.`);
    return [];
  }
  if (raw.length > LIST_MAX) problems.push(`${where} has more than ${LIST_MAX} entries.`);
  const out: string[] = [];
  for (const v of raw.slice(0, LIST_MAX)) {
    if (typeof v !== "string" || v.trim() === "" || v.length > opts.max) {
      problems.push(`${where}: each entry is a non-empty string of up to ${opts.max} characters.`);
      continue;
    }
    const bad = opts.test(v);
    if (bad) problems.push(`${where}: "${v}" ${bad}.`);
    else out.push(v);
  }
  return out;
}

function normalizePrivacy(raw: unknown, problems: string[]): PrivacySettings {
  if (raw !== undefined && raw !== null && !isObj(raw)) {
    problems.push("privacy must be a mapping (mask_patterns, mask_selectors, mask_fields).");
    return { mask_patterns: [], mask_selectors: [], mask_fields: [] };
  }
  const o = isObj(raw) ? raw : {};
  return {
    mask_patterns: limitedStrings(o["mask_patterns"], "privacy.mask_patterns", problems, {
      max: 300,
      test: (s) => {
        try {
          new RegExp(s, "gu");
          return undefined;
        } catch (err) {
          return `is not a valid regular expression (${(err as Error).message.split(":").pop()?.trim()})`;
        }
      },
    }),
    // A selector goes into a style sheet: braces and angle brackets could end the rule and add another, so they are refused.
    mask_selectors: limitedStrings(o["mask_selectors"], "privacy.mask_selectors", problems, { max: 200, test: (s) => (/[{}<>;\\]/.test(s) ? "contains a character that is not allowed in a CSS selector here ({ } < > ; \\)" : undefined) }),
    mask_fields: limitedStrings(o["mask_fields"], "privacy.mask_fields", problems, { max: 60, test: (s) => (/^[A-Za-z_][\w.-]*$/.test(s) ? undefined : "is not a field name (letters, digits, _ . -)") }),
  };
}

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

  const fixObj = isObj(raw["fix_policy"]) ? raw["fix_policy"] : {};
  const fixRaw = isObj(raw["fix_policy"]) && "fix_severities" in raw["fix_policy"] ? strList(raw["fix_policy"]["fix_severities"]) : ["critical", "important"];
  const fix_severities = fixRaw.filter((s): s is Severity => (SEVERITIES as string[]).includes(s));
  if (fixRaw.length !== fix_severities.length) problems.push("fix_policy.fix_severities may only contain critical, important, minor.");
  const maxFixes = fixObj["max_fixes"] === undefined ? DEFAULT_MAX_FIXES : fixObj["max_fixes"];
  if (typeof maxFixes !== "number" || !Number.isInteger(maxFixes) || maxFixes < 1 || maxFixes > 100) problems.push("fix_policy.max_fixes must be a whole number from 1 to 100.");
  const timeout = fixObj["test_timeout_s"] === undefined ? DEFAULT_TEST_TIMEOUT_S : fixObj["test_timeout_s"];
  if (typeof timeout !== "number" || timeout < 10 || timeout > 3600) problems.push("fix_policy.test_timeout_s must be a number of seconds from 10 to 3600.");
  const testCommand = str(fixObj["test_command"]);
  const testFileCommand = str(fixObj["test_file_command"]);
  if (testFileCommand && !testFileCommand.includes("{file}")) problems.push("fix_policy.test_file_command must contain {file}, where the path of the test file goes.");
  const doNotTouch = strList(fixObj["do_not_touch"]).map((g) => g.trim()).filter(Boolean);
  for (const g of doNotTouch) if (g.length > 200 || g.split("/").includes("..") || /^([A-Za-z]:)?[\\/]/.test(g)) problems.push(`fix_policy.do_not_touch: "${g}" must be a glob relative to the project (no .. and no absolute path).`);

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
    fix_policy: {
      fix_severities: fix_severities.length ? fix_severities : ["critical", "important"],
      max_fixes: typeof maxFixes === "number" && Number.isInteger(maxFixes) && maxFixes >= 1 && maxFixes <= 100 ? maxFixes : DEFAULT_MAX_FIXES,
      ...(testCommand ? { test_command: testCommand } : {}),
      ...(testFileCommand ? { test_file_command: testFileCommand } : {}),
      test_timeout_s: typeof timeout === "number" && timeout >= 10 && timeout <= 3600 ? timeout : DEFAULT_TEST_TIMEOUT_S,
      do_not_touch: doNotTouch,
    },
    health: { checks: isObj(raw["health"]) ? strList(raw["health"]["checks"]) : [] },
    setup: normalizeSetup(raw["setup"], problems),
    budget: normalizeBudget(raw["budget"], problems),
    privacy: normalizePrivacy(raw["privacy"], problems),
    ci: normalizeCi(raw["ci"], problems),
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

/** The numbered list under the "Critical flows" heading of config.md, in order. Used for the release verdict (§13.13). */
export function parseCriticalFlows(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,3}\s*critical\s+(flows|journeys)\b/i.test(l.trim()));
  if (start < 0) return [];
  const flows: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    if (/^\s*<!--.*-->\s*$/.test(line)) continue;
    const item = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (item) flows.push((item[1] as string).trim());
    else if (flows.length > 0 && /^\s{2,}\S/.test(line)) flows[flows.length - 1] += ` ${line.trim()}`;
  }
  return flows;
}
