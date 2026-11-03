import path from "node:path";
import { validateSteps } from "../bank/bank.ts";
import type { UiStep } from "../bank/bank.ts";
import type { BrowserEngine, QamindConfig, Viewport } from "../config.ts";
import { readJson } from "../fsutil.ts";

/**
 * The pages a sweep visits (spec 13.9, 13.10, 13.11): the key pages of the product, per role. The agent writes `data/sweep-pages.json` after it has explored, from what it saw;
 * QAMind validates it against the config, so a sweep can only visit the web UIs and roles that exist, and sign in only with the config's own logins.
 */

export interface SweepPage {
  /** A short stable name: it keys the baselines and the performance history. */
  id: string;
  title: string;
  /** A name from the config's web_uis. */
  ui: string;
  /** A role from the config; leave out for a page that needs no sign-in. */
  role?: string;
  /** The path on the web UI, starting with "/" (with its query, if any). */
  path: string;
  /** Steps to reach the state to photograph, after the page opens (click a tab, open a menu). Same vocabulary as a UI test of the bank. */
  steps?: UiStep[];
}

export interface SweepPagesFile {
  /** How to sign in as a role, in the vocabulary of UI tests (`fill` with a `secret` naming that role's login variable). A role without an entry is signed in automatically at the login form the page redirects to. */
  logins?: Record<string, UiStep[]>;
  pages: SweepPage[];
}

export const MAX_SWEEP_PAGES = 40;
const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/;

export const sweepPagesFile = (runDir: string): string => path.join(runDir, "data", "sweep-pages.json");

export interface PagesCheck {
  ok: boolean;
  errors: string[];
  file?: SweepPagesFile;
}

/** Validates what the agent wrote against the config. Everything wrong is reported at once. */
export function validateSweepPages(raw: unknown, config: QamindConfig): PagesCheck {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ['data/sweep-pages.json must be an object: { "pages": [ { "id", "title", "ui", "role", "path" } ], "logins": { "<role>": [steps] } }.'] };
  const o = raw as Record<string, unknown>;
  const secretNames = config.roles.flatMap((r) => [r.username_env, r.password_env]);
  const uiNames = new Set(config.web_uis.map((u) => u.name));
  const roleNames = new Map(config.roles.map((r) => [r.name, r]));
  const pages = o["pages"];
  if (!Array.isArray(pages) || pages.length === 0) errors.push('"pages" must be a list with at least one page.');
  else if (pages.length > MAX_SWEEP_PAGES) errors.push(`At most ${MAX_SWEEP_PAGES} pages (found ${pages.length}): choose the key ones.`);
  const out: SweepPage[] = [];
  const seen = new Set<string>();
  for (const [i, p] of (Array.isArray(pages) ? pages : []).slice(0, MAX_SWEEP_PAGES).entries()) {
    const at = `pages[${i}]`;
    const x = (p ?? {}) as Record<string, unknown>;
    const id = typeof x["id"] === "string" ? x["id"] : "";
    if (!ID.test(id)) errors.push(`${at}: "id" must be short lowercase letters, digits, - or _ (found ${JSON.stringify(x["id"])}).`);
    else if (seen.has(id)) errors.push(`${at}: the id "${id}" is used twice.`);
    seen.add(id);
    const title = typeof x["title"] === "string" ? x["title"].trim() : "";
    if (!title || title.length > 100) errors.push(`${at} (${id}): "title" is a short name a person would recognise.`);
    const ui = typeof x["ui"] === "string" ? x["ui"] : "";
    if (!uiNames.has(ui)) errors.push(`${at} (${id}): ui "${ui}" is not in the config's web_uis (${[...uiNames].join(", ") || "none"}).`);
    const role = typeof x["role"] === "string" ? x["role"] : undefined;
    if (x["role"] !== undefined && !role) errors.push(`${at} (${id}): "role" must be a role name from the config, or left out.`);
    else if (role) {
      const r = roleNames.get(role);
      if (!r) errors.push(`${at} (${id}): role "${role}" is not in the config.`);
      else if (r.ui !== ui) errors.push(`${at} (${id}): role "${role}" signs in to "${r.ui}", not "${ui}".`);
    }
    const pth = typeof x["path"] === "string" ? x["path"] : "";
    if (!pth.startsWith("/") || pth.includes("://") || pth.startsWith("//") || pth.length > 300) errors.push(`${at} (${id}): "path" is a path on the web UI starting with "/" (not a full address).`);
    let steps: UiStep[] | undefined;
    if (x["steps"] !== undefined) {
      // A page's steps only reach a state; they need not check anything (the sweep looks at the result).
      const problems = validateSteps(x["steps"], { secretNames }).filter((e) => !/has to check something/.test(e));
      for (const e of problems) errors.push(`${at} (${id}) ${e}`);
      if (Array.isArray(x["steps"]) && (x["steps"] as Array<{ do?: string }>).some((s) => s?.do === "fill" && (s as { secret?: string }).secret)) errors.push(`${at} (${id}): a page's own steps cannot use a login variable: sign-in belongs in "logins".`);
      steps = x["steps"] as UiStep[];
    }
    if (ID.test(id) && title && uiNames.has(ui) && pth.startsWith("/")) out.push({ id, title, ui, ...(role ? { role } : {}), path: pth, ...(steps ? { steps } : {}) });
  }
  const logins: Record<string, UiStep[]> = {};
  if (o["logins"] !== undefined) {
    const l = o["logins"];
    if (!l || typeof l !== "object" || Array.isArray(l)) errors.push('"logins" must map a role name to its sign-in steps.');
    else {
      for (const [role, steps] of Object.entries(l as Record<string, unknown>)) {
        const r = roleNames.get(role);
        if (!r) {
          errors.push(`logins.${role}: not a role in the config.`);
          continue;
        }
        const problems = validateSteps(steps, { secretNames });
        for (const e of problems) errors.push(`logins.${role} ${e}`);
        // A sign-in may only use this role's own login variables.
        for (const s of Array.isArray(steps) ? (steps as UiStep[]) : []) {
          if (s?.do === "fill" && s.secret && s.secret !== r.username_env && s.secret !== r.password_env) errors.push(`logins.${role}: "${s.secret}" is not ${role}'s login variable (${r.username_env}, ${r.password_env}).`);
        }
        if (problems.length === 0) logins[role] = steps as UiStep[];
      }
    }
  }
  return { ok: errors.length === 0, errors, ...(errors.length === 0 ? { file: { ...(Object.keys(logins).length ? { logins } : {}), pages: out } } : {}) };
}

export function loadSweepPages(runDir: string, config: QamindConfig): PagesCheck {
  const raw = readJson<unknown>(sweepPagesFile(runDir));
  if (raw === undefined) return { ok: false, errors: [`No ${path.join("data", "sweep-pages.json")} in the run folder. Write the key pages first (the format is in the coverage instructions).`] };
  return validateSweepPages(raw, config);
}

// ---------------------------------------------------------------------------------------------- the matrix

export interface Matrix {
  browsers: BrowserEngine[];
  viewports: Viewport[];
  /** Why this matrix: the mode's default or the choice that overrode it. */
  why: string;
}

/**
 * Which browsers and screen sizes a mode covers (spec 13.10): `diff` and `auto` one browser and one size, `quick` and `regression` add the mobile size, `full` and nightly every configured browser and size.
 * A choice made on the command line (`--browsers`, `--viewports`) overrides the mode.
 */
export function matrixFor(mode: string, config: QamindConfig, pick?: { browsers?: string[]; viewports?: string[] }): Matrix {
  const all = { browsers: config.browsers, viewports: config.viewports };
  const mobile = config.viewports.find((v) => /mobile|phone/i.test(v.name)) ?? [...config.viewports].sort((a, b) => a.width - b.width)[0];
  const desktop = config.viewports.find((v) => /desktop|laptop/i.test(v.name)) ?? config.viewports[0];
  let m: Matrix;
  switch (mode) {
    case "full":
    case "ci-full":
      m = { ...all, why: "every configured browser and screen size (full run)" };
      break;
    case "quick":
    case "regression":
      m = { browsers: [config.browsers[0] as BrowserEngine], viewports: [...new Set([desktop, mobile])].filter((v): v is Viewport => !!v), why: "the first browser at the desktop and the mobile size (quick run)" };
      break;
    default:
      m = { browsers: [config.browsers[0] as BrowserEngine], viewports: [desktop as Viewport], why: "one browser and one screen size (the default for this mode)" };
  }
  if (pick?.browsers?.length) {
    const bad = pick.browsers.filter((b) => !["chromium", "firefox", "webkit"].includes(b));
    if (bad.length) throw new Error(`Not a browser: ${bad.join(", ")}. Use chromium, firefox or webkit.`);
    m = { ...m, browsers: [...new Set(pick.browsers)] as BrowserEngine[], why: "the browsers asked for" };
  }
  if (pick?.viewports?.length) {
    const vs = pick.viewports.map((n) => config.viewports.find((v) => v.name === n));
    const missing = pick.viewports.filter((_, i) => !vs[i]);
    if (missing.length) throw new Error(`Not a configured screen size: ${missing.join(", ")} (configured: ${config.viewports.map((v) => v.name).join(", ")}).`);
    m = { ...m, viewports: vs as Viewport[], why: `${m.why === "the browsers asked for" ? "the browsers and screen sizes asked for" : "the screen sizes asked for"}` };
  }
  return m;
}
