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

/** Where messages the product sends are caught, so a run can read them without sending anything to a real address or number (spec 13.7). */
export const CATCHER_TYPES = ["mailpit", "mailhog", "mailtrap", "custom"] as const;
export type CatcherType = (typeof CATCHER_TYPES)[number];
export interface CatcherSettings {
  type: CatcherType;
  /** The catcher's HTTP address: its API (Mailpit, MailHog, a custom API) or, for Mailtrap, its API root. */
  url: string;
  /** The NAME of the variable holding an API token, when the catcher needs one (Mailtrap, a custom API). Never the token. */
  token_env?: string;
  /** Mailtrap: the account and the inbox to read. */
  account_id?: string;
  inbox_id?: string;
  /** How long a run waits for a message to arrive. */
  timeout_s: number;
}
export const DEFAULT_CATCHER_TIMEOUT_S = 30;

/** Browsers and screen sizes to check (spec 13.10). */
export const BROWSER_ENGINES = ["chromium", "firefox", "webkit"] as const;
export type BrowserEngine = (typeof BROWSER_ENGINES)[number];
export interface Viewport {
  name: string;
  width: number;
  height: number;
}
export const DEFAULT_VIEWPORTS: Viewport[] = [
  { name: "desktop", width: 1366, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

/** Visual regression (spec 13.9). */
export interface VisualSettings {
  /** The share of a page's pixels (percent) that may differ before a difference is reported. */
  threshold: number;
  /** Parts of a page that change by themselves (dates, avatars, ads): hidden before every screenshot. */
  ignore_selectors: string[];
}
export const DEFAULT_VISUAL_THRESHOLD = 0.2;

/** Basic performance checks (spec 13.11). */
export interface PerformanceSettings {
  /** A page is slow above this many milliseconds until it settles. */
  page_load_ms: number;
  /** An API endpoint is slow when its 95th percentile of a few calls is above this. */
  api_p95_ms: number;
  /** Slower than the recent runs by more than this percent is a regression, even when under budget. */
  regression_pct: number;
  /** Own budgets: a page path (`/reports.html`) or an endpoint (`GET /admin/reports/sales`) to its milliseconds. */
  pages: Record<string, number>;
  endpoints: Record<string, number>;
}
export const DEFAULT_PERFORMANCE: PerformanceSettings = { page_load_ms: 3000, api_p95_ms: 800, regression_pct: 30, pages: {}, endpoints: {} };

/** The release readiness verdict (spec 13.13): what may be open before a release is "Ready", and what makes it "Not ready" rather than "Ready with risks". */
export const RELEASE_BLOCKERS = ["critical", "important", "minor", "regressed", "flows-untested"] as const;
export type ReleaseBlocker = (typeof RELEASE_BLOCKERS)[number];
export interface ReleaseRules {
  /** More open critical problems than this is a violation. Default 0. */
  max_critical: number;
  /** More open important problems than this is a violation. Default 2. */
  max_important: number;
  /** More open minor problems than this is a violation. Default: no limit. */
  max_minor?: number;
  /** A problem that came back after being fixed. Default false: it keeps the verdict from being "Ready". */
  allow_regressed: boolean;
  /** Violations of these make the verdict "Not ready"; any other violation makes it "Ready with risks". Default: critical. A broken test environment is always "Not ready", and a key journey that was not tested can never be "Ready". */
  not_ready_when: ReleaseBlocker[];
}
export const DEFAULT_RELEASE_RULES: ReleaseRules = { max_critical: 0, max_important: 2, allow_regressed: false, not_ready_when: ["critical"] };

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
  /** The email and SMS catchers; absent when none is configured (the flows that send messages are then Not tested). */
  mail?: CatcherSettings;
  sms?: CatcherSettings;
  /** The browsers to check. Default: chromium. */
  browsers: BrowserEngine[];
  viewports: Viewport[];
  visual: VisualSettings;
  performance: PerformanceSettings;
  release: { rules: ReleaseRules };
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
  if (mode !== undefined && !(typeof mode === "string" && (CI_MODES as readonly string[]).includes(mode))) problems.push(`ci.mode must be one of ${CI_MODES.join(", ")} (a ticket is given on the command line with --ticket, not in the config).`);
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

const ID_TEXT = /^[A-Za-z0-9_.-]{1,40}$/;

function normalizeCatcher(raw: unknown, where: "mail" | "sms", problems: string[]): CatcherSettings | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isObj(raw)) {
    problems.push(`${where} must be a mapping (catcher, url, token_env, timeout_s).`);
    return undefined;
  }
  const kind = str(raw["catcher"]);
  if (!kind) {
    problems.push(`${where}.catcher is required: ${CATCHER_TYPES.join(", ")}, or the http(s) address of a custom JSON API.`);
    return undefined;
  }
  // A full address as the catcher means a custom API at that address.
  const lower = kind.toLowerCase();
  const asUrl = parseUrl(kind) ? kind : undefined;
  const type: CatcherType | undefined = asUrl ? "custom" : (CATCHER_TYPES as readonly string[]).includes(lower) ? (lower as CatcherType) : undefined;
  if (!type) {
    problems.push(`${where}.catcher "${kind}" is not one of ${CATCHER_TYPES.join(", ")} or an http(s) address.`);
    return undefined;
  }
  if (where === "sms" && type !== "custom") problems.push("sms.catcher must be the http(s) address of a test endpoint (a custom JSON API that lists the messages it received).");
  const url = asUrl ?? str(raw["url"]);
  if (type === "mailtrap") {
    // Mailtrap's API is one fixed service; the address is only needed to point at a different API root.
    if (!str(raw["token_env"])) problems.push("mail.token_env is required for mailtrap: the NAME of the variable that holds the API token.");
    const given = (k: string): boolean => typeof raw[k] === "number" || !!str(raw[k]);
    if (!given("inbox_id") || !given("account_id")) problems.push("mail.account_id and mail.inbox_id are required for mailtrap.");
  } else if (!url) problems.push(`${where}.url is required: the address of the catcher's API (for example http://127.0.0.1:8025 for Mailpit).`);
  else if (!parseUrl(url)) problems.push(`${where}.url "${url}" is not a valid http(s) address.`);
  const tokenEnv = str(raw["token_env"]);
  if (tokenEnv && !ENV_NAME.test(tokenEnv)) problems.push(`${where}.token_env "${tokenEnv}" is not a valid variable name (give the name, never the token itself).`);
  for (const k of ["account_id", "inbox_id"] as const) {
    const v = raw[k];
    if (v !== undefined && !(typeof v === "number" || (typeof v === "string" && ID_TEXT.test(v)))) problems.push(`${where}.${k} must be a short id (letters, digits, - _ .).`);
  }
  const timeout = raw["timeout_s"];
  if (timeout !== undefined && !(typeof timeout === "number" && timeout >= 1 && timeout <= 600)) problems.push(`${where}.timeout_s must be a number of seconds from 1 to 600.`);
  const finalUrl = type === "mailtrap" ? (url ?? "https://mailtrap.io/api") : url;
  if (!finalUrl || !parseUrl(finalUrl)) return undefined;
  const id = (k: "account_id" | "inbox_id"): string | undefined => (typeof raw[k] === "number" ? String(raw[k]) : str(raw[k]));
  return {
    type,
    url: finalUrl.replace(/\/+$/, ""),
    ...(tokenEnv && ENV_NAME.test(tokenEnv) ? { token_env: tokenEnv } : {}),
    ...(id("account_id") ? { account_id: id("account_id") as string } : {}),
    ...(id("inbox_id") ? { inbox_id: id("inbox_id") as string } : {}),
    timeout_s: typeof timeout === "number" && timeout >= 1 && timeout <= 600 ? timeout : DEFAULT_CATCHER_TIMEOUT_S,
  };
}

function normalizeBrowsers(raw: unknown, problems: string[]): BrowserEngine[] {
  if (raw === undefined || raw === null) return ["chromium"];
  if (!Array.isArray(raw) || raw.length === 0) {
    problems.push(`browsers must be a list of: ${BROWSER_ENGINES.join(", ")}.`);
    return ["chromium"];
  }
  const out: BrowserEngine[] = [];
  for (const b of raw) {
    if (typeof b === "string" && (BROWSER_ENGINES as readonly string[]).includes(b.toLowerCase())) out.push(b.toLowerCase() as BrowserEngine);
    else problems.push(`browsers: "${String(b)}" is not a browser. Use ${BROWSER_ENGINES.join(", ")}.`);
  }
  return out.length ? [...new Set(out)] : ["chromium"];
}

function normalizeViewports(raw: unknown, problems: string[]): Viewport[] {
  if (raw === undefined || raw === null) return DEFAULT_VIEWPORTS.map((v) => ({ ...v }));
  if (!Array.isArray(raw) || raw.length === 0) {
    problems.push("viewports must be a list of { name, width, height } (for example desktop 1366x768, mobile 390x844, tablet 768x1024).");
    return DEFAULT_VIEWPORTS.map((v) => ({ ...v }));
  }
  const out: Viewport[] = [];
  for (const [i, v] of raw.entries()) {
    const o = isObj(v) ? v : {};
    const name = str(o["name"]);
    const w = o["width"];
    const h = o["height"];
    if (!name || !/^[\w .-]{1,30}$/.test(name) || !(typeof w === "number" && Number.isInteger(w) && w >= 240 && w <= 4000) || !(typeof h === "number" && Number.isInteger(h) && h >= 240 && h <= 4000)) {
      problems.push(`viewports[${i}] needs a short name and a whole width and height from 240 to 4000.`);
      continue;
    }
    if (out.some((x) => x.name === name)) problems.push(`viewports: the name "${name}" is used twice.`);
    else out.push({ name, width: w, height: h });
  }
  return out.length ? out : DEFAULT_VIEWPORTS.map((v) => ({ ...v }));
}

function normalizeVisual(raw: unknown, problems: string[]): VisualSettings {
  if (raw !== undefined && raw !== null && !isObj(raw)) {
    problems.push("visual must be a mapping (threshold, ignore_selectors).");
    return { threshold: DEFAULT_VISUAL_THRESHOLD, ignore_selectors: [] };
  }
  const o = isObj(raw) ? raw : {};
  const t = o["threshold"];
  if (t !== undefined && !(typeof t === "number" && t >= 0 && t <= 100)) problems.push("visual.threshold must be a percentage from 0 to 100: the share of a page's pixels that may differ.");
  return {
    threshold: typeof t === "number" && t >= 0 && t <= 100 ? t : DEFAULT_VISUAL_THRESHOLD,
    // Like privacy.mask_selectors, a selector goes into a style sheet.
    ignore_selectors: limitedStrings(o["ignore_selectors"], "visual.ignore_selectors", problems, { max: 200, test: (s) => (/[{}<>;\\]/.test(s) ? "contains a character that is not allowed in a CSS selector here ({ } < > ; \\)" : undefined) }),
  };
}

function budgetMap(raw: unknown, where: string, problems: string[]): Record<string, number> {
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) {
    problems.push(`${where} must be a mapping from a ${where.endsWith("pages") ? "page path" : "method and path"} to milliseconds.`);
    return {};
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw).slice(0, LIST_MAX)) {
    if (typeof v === "number" && v >= 50 && v <= 600_000 && k.length <= 200) out[k] = v;
    else problems.push(`${where}.${k}: a number of milliseconds from 50 to 600000.`);
  }
  return out;
}

function normalizePerformance(raw: unknown, problems: string[]): PerformanceSettings {
  if (raw !== undefined && raw !== null && !isObj(raw)) {
    problems.push("performance must be a mapping (page_load_ms, api_p95_ms, regression_pct, pages, endpoints).");
    return { ...DEFAULT_PERFORMANCE, pages: {}, endpoints: {} };
  }
  const o = isObj(raw) ? raw : {};
  const ms = (key: "page_load_ms" | "api_p95_ms"): number => {
    const v = o[key];
    if (v !== undefined && !(typeof v === "number" && v >= 50 && v <= 600_000)) problems.push(`performance.${key} must be a number of milliseconds from 50 to 600000.`);
    return typeof v === "number" && v >= 50 && v <= 600_000 ? v : DEFAULT_PERFORMANCE[key];
  };
  const pct = o["regression_pct"];
  if (pct !== undefined && !(typeof pct === "number" && pct >= 5 && pct <= 1000)) problems.push("performance.regression_pct must be a percentage from 5 to 1000.");
  return {
    page_load_ms: ms("page_load_ms"),
    api_p95_ms: ms("api_p95_ms"),
    regression_pct: typeof pct === "number" && pct >= 5 && pct <= 1000 ? pct : DEFAULT_PERFORMANCE.regression_pct,
    pages: budgetMap(o["pages"], "performance.pages", problems),
    endpoints: budgetMap(o["endpoints"], "performance.endpoints", problems),
  };
}

const RELEASE_KEYS = ["max_critical", "max_important", "max_minor", "allow_regressed", "not_ready_when"];

function normalizeRelease(raw: unknown, problems: string[]): { rules: ReleaseRules } {
  const rules: ReleaseRules = { ...DEFAULT_RELEASE_RULES, not_ready_when: [...DEFAULT_RELEASE_RULES.not_ready_when] };
  if (raw === undefined || raw === null) return { rules };
  if (!isObj(raw)) {
    problems.push("release must be a mapping with a `rules` mapping.");
    return { rules };
  }
  for (const k of Object.keys(raw)) if (k !== "rules") problems.push(`release.${k} is not a setting (the verdict's rules go under release.rules).`);
  const r = raw["rules"];
  if (r === undefined || r === null) return { rules };
  if (!isObj(r)) {
    problems.push(`release.rules must be a mapping (${RELEASE_KEYS.join(", ")}).`);
    return { rules };
  }
  for (const k of Object.keys(r)) {
    if (!RELEASE_KEYS.includes(k)) problems.push(`release.rules.${k} is not a rule. Use ${RELEASE_KEYS.join(", ")}. (A key journey that was not tested can never be "Ready": that is not a rule to switch off; to make it "Not ready" put flows-untested in not_ready_when.)`);
  }
  const count = (key: "max_critical" | "max_important" | "max_minor"): void => {
    const v = r[key];
    if (v === undefined || v === null) return;
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000) rules[key] = v;
    else problems.push(`release.rules.${key} must be a whole number from 0 to 1000.`);
  };
  count("max_critical");
  count("max_important");
  count("max_minor");
  if (r["allow_regressed"] !== undefined) {
    if (typeof r["allow_regressed"] === "boolean") rules.allow_regressed = r["allow_regressed"];
    else problems.push("release.rules.allow_regressed must be true or false.");
  }
  if (r["not_ready_when"] !== undefined) {
    const v = r["not_ready_when"];
    if (!Array.isArray(v)) problems.push(`release.rules.not_ready_when must be a list of: ${RELEASE_BLOCKERS.join(", ")}.`);
    else {
      const out: ReleaseBlocker[] = [];
      for (const c of v) {
        if (typeof c === "string" && (RELEASE_BLOCKERS as readonly string[]).includes(c)) out.push(c as ReleaseBlocker);
        else problems.push(`release.rules.not_ready_when: "${String(c)}" is not a condition. Use ${RELEASE_BLOCKERS.join(", ")}.`);
      }
      rules.not_ready_when = [...new Set(out)];
    }
  }
  return { rules };
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
    ...((): { mail?: CatcherSettings } => {
      const c = normalizeCatcher(raw["mail"], "mail", problems);
      return c ? { mail: c } : {};
    })(),
    ...((): { sms?: CatcherSettings } => {
      const c = normalizeCatcher(raw["sms"], "sms", problems);
      return c ? { sms: c } : {};
    })(),
    browsers: normalizeBrowsers(raw["browsers"], problems),
    viewports: normalizeViewports(raw["viewports"], problems),
    visual: normalizeVisual(raw["visual"], problems),
    performance: normalizePerformance(raw["performance"], problems),
    release: normalizeRelease(raw["release"], problems),
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
  // A catcher is only read, never browsed, so it is not an origin the product may be reached at; but one that names production is still refused.
  for (const [label, c] of [["mail.url", config.mail], ["sms.url", config.sms]] as const) {
    if (c && c.type !== "mailtrap" && classifyUrl(c.url, config.security).verdict === "blocked") result.blocked.push({ url: c.url, reason: `${label} ${classifyUrl(c.url, config.security).reason}` });
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
