import fs from "node:fs";
import path from "node:path";
import type { RoleCredentials } from "../auth.ts";
import { BUDGET_REASON } from "../budget.ts";
import { runUiStep } from "../bank/uisteps.ts";
import { buildMaskScript, engineStatus, findPlaywright, installPolicyRouting, launchEngine, readAuditScript } from "../browsers.ts";
import type { PW } from "../browsers.ts";
import type { BrowserEngine, QamindConfig, Viewport } from "../config.ts";
import { ensureDir, writeJson } from "../fsutil.ts";
import { loadPerf, judge, pageBudget, pageKey, plainDuration, MIN_PAGE_DELTA_MS } from "../perf/store.ts";
import { maskText } from "../privacy.ts";
import type { PrivacyContext } from "../privacy.ts";
import type { RunPolicy } from "../urlpolicy.ts";
import { loadSweepPages, matrixFor } from "./pages.ts";
import type { Matrix, SweepPage, SweepPagesFile } from "./pages.ts";
import { groupSignals, readSweepResults, sweepResultsFile } from "./results.ts";
import type { PerfFinding, Signal, SweepResults, Visit } from "./results.ts";
import { compareWithBaseline } from "./visual.ts";

/**
 * The page sweep (spec 13.9, 13.10, 13.11): a fixed set of key pages, per role, visited in every browser and screen size the mode asks for, behind the run's URL policy.
 * Each visit records what the page audit finds, whether it sent errors, how long it took until it was ready, a screenshot (compared with the baseline, when there is one), and masks private data before the picture is taken.
 * It only reads and photographs; it never submits a form, and signs in only with the config's own logins.
 */

export interface SweepContext {
  store: string;
  /** The run folder: results go to `data/sweep.json`, pictures to `evidence/sweep/`. */
  outDir: string;
  runId: string;
  config: QamindConfig;
  policy: RunPolicy;
  roles: RoleCredentials[];
  /** Login variable names to values, for the sign-in steps. */
  secrets: Record<string, string>;
  passwords: string[];
  privacy: PrivacyContext;
  deadlineMs?: number;
}

export interface SweepOptions {
  mode: string;
  browsers?: string[];
  viewports?: string[];
  /** Only these page ids. */
  pages?: string[];
  now?: Date;
}

const STEP_MS = 8000;
const NAV_MS = 20_000;
const SETTLE_QUIET_MS = 500;
const SETTLE_MAX_MS = 15_000;
const MAX_SHOT_HEIGHT = 6000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const clip = (s: string, n = 200): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const slug = (s: string): string => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

/** The address without its query values (they can be tokens) and without credentials in it. */
function bareUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname}${x.search ? "?…" : ""}`;
  } catch {
    return clip(u, 120);
  }
}

/** The page script: text that should never reach a person, the browser's own timings, and the layout shift. Runs in the page and only reads it. */
const PROBE = `async () => {
  const BAD = /(Invalid Date|\\bNaN\\b|\\bundefined\\b|\\[object Object\\]|\\{\\{\\s*[\\w.]+\\s*\\}\\}|\\$\\{[^}]+\\})/;
  const bad = [];
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && bad.length < 8; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA)$/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const t = (n.textContent || '').replace(/\\s+/g, ' ').trim();
    const m = BAD.exec(t);
    if (m || t === 'null') bad.push({ text: t.slice(0, 100), match: m ? m[1] : 'null' });
  }
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime;
  const observe = (type) => new Promise((resolve) => {
    try {
      const out = [];
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) out.push(e); });
      po.observe({ type, buffered: true });
      setTimeout(() => { try { po.disconnect(); } catch (e) {} resolve(out); }, 120);
    } catch (e) { resolve(null); }
  });
  const lcpEntries = await observe('largest-contentful-paint');
  const clsEntries = await observe('layout-shift');
  return {
    audit: window.__qamindAudit ? window.__qamindAudit() : null,
    badText: bad,
    timing: nav ? { ttfb: nav.responseStart, load: nav.loadEventEnd } : null,
    fcp: typeof fcp === 'number' ? fcp : null,
    lcp: lcpEntries && lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : null,
    cls: clsEntries ? clsEntries.filter((e) => !e.hadRecentInput).reduce((a, e) => a + e.value, 0) : null,
    height: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)
  };
}`;

export interface Probe {
  audit: {
    pageScrollsSideways?: { scrollWidth: number; viewportWidth: number; overflowBy: number } | false;
    controlsOffscreen?: Array<{ element: string; left: number; right: number; viewportWidth: number }>;
    coveredElements?: Array<{ element: string; coveredBy: string }>;
    brokenImages?: string[];
    unnamedControls?: Array<{ element: string }>;
    imagesMissingAlt?: string[];
    clippedText?: string[];
    rtlTextInLtrContainer?: Array<{ element: string }>;
  } | null;
  badText: Array<{ text: string; match: string }>;
  timing: { ttfb: number; load: number } | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  height: number;
}

/** Turns what the page audit and the probe found into signals. A signal is a lead for the agent to verify, not a verdict. */
export function signalsFromProbe(probe: Probe, viewportWidth: number): Signal[] {
  const out: Signal[] = [];
  const a = probe.audit;
  if (a?.pageScrollsSideways) out.push({ kind: "scrolls-sideways", detail: `The page is ${a.pageScrollsSideways.scrollWidth}px wide in a ${a.pageScrollsSideways.viewportWidth}px window, so it scrolls sideways (${a.pageScrollsSideways.overflowBy}px too wide).`, key: "page" });
  for (const c of a?.controlsOffscreen ?? []) out.push({ kind: "control-offscreen", detail: `${c.element} is off the screen (it spans ${c.left}px to ${c.right}px in a ${viewportWidth}px window), so a person cannot reach it without scrolling sideways.`, key: c.element });
  for (const c of a?.coveredElements ?? []) out.push({ kind: "covered-element", detail: `${c.element} is covered by ${c.coveredBy}.`, key: `${c.element} < ${c.coveredBy}` });
  for (const src of a?.brokenImages ?? []) out.push({ kind: "broken-image", detail: `An image did not load: ${bareUrl(src)}`, key: bareUrl(src) });
  for (const c of a?.unnamedControls ?? []) out.push({ kind: "unnamed-control", detail: `${c.element} has no accessible name (a screen reader announces nothing useful).`, key: c.element });
  for (const el of a?.imagesMissingAlt ?? []) out.push({ kind: "image-missing-alt", detail: `${el} has no alt text.`, key: el });
  for (const t of a?.clippedText ?? []) out.push({ kind: "clipped-text", detail: t, key: t.replace(/\(.*$/, "").trim() });
  for (const r of a?.rtlTextInLtrContainer ?? []) out.push({ kind: "rtl-in-ltr", detail: `${r.element} holds right-to-left text in a left-to-right box.`, key: r.element });
  for (const b of probe.badText) out.push({ kind: "bad-text", detail: `The page shows "${b.text}", which looks like a value that was never filled in (${b.match}).`, key: b.match });
  return out;
}

async function settle(state: { pending: number; last: number }, startedAt: number): Promise<{ ms: number; timedOut: boolean }> {
  for (;;) {
    const now = Date.now();
    if (state.pending <= 0 && now - state.last >= SETTLE_QUIET_MS) return { ms: Math.max(0, state.last - startedAt), timedOut: false };
    if (now - startedAt > SETTLE_MAX_MS) return { ms: now - startedAt, timedOut: true };
    await sleep(100);
  }
}

/** Signs in with the form the page redirected to: the first field that takes an email or a name, the password field, and the submit button. A fallback for a role without its own steps. */
async function autoSignIn(page: PW, creds: RoleCredentials): Promise<{ ok: boolean; note?: string }> {
  try {
    const pw = page.locator("input[type=password]:visible").first();
    if ((await pw.count()) === 0) return { ok: true, note: "no sign-in form was shown" };
    const user = page.locator("input[type=email]:visible, input[name*=mail i]:visible, input[name*=user i]:visible, input[id*=mail i]:visible, input[id*=user i]:visible, input[type=text]:visible").first();
    if ((await user.count()) === 0) return { ok: false, note: "the sign-in form has no field for the user name or email" };
    await user.fill(creds.username, { timeout: STEP_MS });
    await pw.fill(creds.password, { timeout: STEP_MS });
    const submit = page.locator("button[type=submit]:visible, input[type=submit]:visible").first();
    if ((await submit.count()) > 0) await submit.click({ timeout: STEP_MS });
    else await pw.press("Enter");
    const end = Date.now() + STEP_MS;
    while (Date.now() < end) {
      await sleep(250);
      if ((await page.locator("input[type=password]:visible").count()) === 0) return { ok: true };
    }
    return { ok: false, note: "the sign-in form was still there after submitting (wrong login, or a form QAMind cannot read: give this role steps in `logins`)" };
  } catch (e) {
    return { ok: false, note: clip((e as Error).message.split("\n")[0] ?? "") };
  }
}

const visitKey = (v: { page: string; role?: string; browser: string; viewport: string }): string => `${v.page}|${v.role ?? "-"}|${v.browser}|${v.viewport}`;

/**
 * A sweep narrowed to some pages, browsers or sizes (to look at a lead again, which is how a problem is reproduced a second time) must not throw away the rest of the run's sweep:
 * what it visited replaces the earlier visits of the same page, role, browser and size; everything else stays. The groups, timings and picture counts are worked out again from the merged visits.
 */
export function mergeSweeps(previous: SweepResults, current: SweepResults): SweepResults {
  const fresh = new Set(current.visits.map(visitKey));
  const freshBrowsers = new Set(current.visits.filter((v) => !v.error).map((v) => v.browser));
  const skippedKey = (k: SweepResults["skipped"][number]): string => `${k.page ?? ""}|${k.role ?? "-"}|${k.browser ?? ""}|${k.viewport ?? ""}`;
  const skippedNow = new Set(current.skipped.map(skippedKey));
  return {
    ...current,
    matrix: {
      browsers: [...new Set([...previous.matrix.browsers, ...current.matrix.browsers])],
      viewports: [...previous.matrix.viewports, ...current.matrix.viewports.filter((v) => !previous.matrix.viewports.some((x) => x.name === v.name))],
      why: `${previous.matrix.why}; then looked at again: ${current.matrix.why}`,
    },
    visits: [...previous.visits.filter((v) => !fresh.has(visitKey(v))), ...current.visits],
    unavailable: [...previous.unavailable.filter((u) => !freshBrowsers.has(u.browser)), ...current.unavailable].filter((u, i, all) => all.findIndex((x) => x.browser === u.browser) === i),
    skipped: [...previous.skipped.filter((k) => !fresh.has(visitKey({ page: k.page ?? "", ...(k.role ? { role: k.role } : {}), browser: k.browser ?? "", viewport: k.viewport ?? "" })) && !skippedNow.has(skippedKey(k))), ...current.skipped],
    ...(previous.budget_reached || current.budget_reached ? { budget_reached: true } : {}),
  };
}

export async function runSweep(ctx: SweepContext, opts: SweepOptions): Promise<SweepResults> {
  const now = opts.now ?? new Date();
  const checked = loadSweepPages(ctx.outDir, ctx.config);
  if (!checked.ok || !checked.file) throw new Error(`data/sweep-pages.json has problems:\n- ${checked.errors.join("\n- ")}`);
  const file: SweepPagesFile = checked.file;
  const wanted = opts.pages?.length ? file.pages.filter((p) => opts.pages?.includes(p.id)) : file.pages;
  if (wanted.length === 0) throw new Error(`None of the requested pages (${opts.pages?.join(", ")}) is in data/sweep-pages.json.`);
  const matrix: Matrix = matrixFor(opts.mode, ctx.config, { ...(opts.browsers ? { browsers: opts.browsers } : {}), ...(opts.viewports ? { viewports: opts.viewports } : {}) });

  const results: SweepResults = {
    schema_version: 1,
    run_id: ctx.runId,
    ran_at: now.toISOString(),
    matrix: { browsers: matrix.browsers, viewports: matrix.viewports, why: matrix.why },
    unavailable: [],
    skipped: [],
    visits: [],
    groups: [],
    perf: [],
    visual_summary: { compared: 0, different: 0, no_baseline: 0 },
    notes: [],
  };
  const pw = findPlaywright();
  const redact = (s: string): string => ctx.passwords.reduce((acc, p) => (p ? acc.split(p).join("[REDACTED]") : acc), s);
  const safeText = (s: string): string => maskText(redact(s), ctx.privacy).text;
  const baseOf = new Map(ctx.config.web_uis.map((u) => [u.name, u.url]));
  const creds = new Map(ctx.roles.map((r) => [r.name, r]));
  const evidence = path.join(ctx.outDir, "evidence", "sweep");
  const maskScript = buildMaskScript({ selectors: ctx.config.privacy.mask_selectors, patterns: ctx.config.privacy.mask_patterns, prefix: ctx.config.test_data_prefix, allow: ctx.roles.map((r) => r.username) });
  const auditScript = readAuditScript();
  const history = loadPerf(ctx.store);

  // Pages grouped by role: one signed-in context per role, one visit per page.
  const byRole = new Map<string, SweepPage[]>();
  for (const p of wanted) byRole.set(p.role ?? "", [...(byRole.get(p.role ?? "") ?? []), p]);

  const status = engineStatus(pw, matrix.browsers);
  for (const engine of matrix.browsers) {
    const st = status.find((s) => s.engine === engine);
    if (!st?.available) {
      results.unavailable.push({ browser: engine, reason: st?.detail ?? "not available" });
      continue;
    }
    if ("error" in pw) break;
    const launched = await launchEngine(pw, engine, redact);
    if ("unavailable" in launched) {
      results.unavailable.push({ browser: engine, reason: launched.unavailable });
      continue;
    }
    const browser: PW = launched.browser;
    try {
      for (const vp of matrix.viewports) {
        for (const [roleName, pages] of byRole) {
          if (ctx.deadlineMs && Date.now() > ctx.deadlineMs) {
            results.budget_reached = true;
            for (const p of pages) results.skipped.push({ page: p.id, ...(roleName ? { role: roleName } : {}), browser: engine, viewport: vp.name, reason: BUDGET_REASON });
            continue;
          }
          await visitRole({ ctx, results, browser, engine, vp, roleName, pages, file, creds, baseOf, evidence, maskScript, auditScript, history, safeText, redact });
        }
      }
    } finally {
      await browser.close().catch(() => undefined);
    }
  }
  if ("error" in pw && results.unavailable.length === 0) for (const b of matrix.browsers) results.unavailable.push({ browser: b, reason: pw.error });

  const narrowed = !!(opts.pages?.length || opts.browsers?.length || opts.viewports?.length);
  const earlier = narrowed ? readSweepResults(ctx.outDir) : undefined;
  if (earlier) Object.assign(results, mergeSweeps(earlier, results));
  const refusedTotal = results.visits.reduce((n, v) => n + (v.blocked ?? 0), 0);
  results.groups = groupSignals(results.visits);
  results.perf = perfFindings(results.visits, ctx.config, history);
  results.visual_summary = { compared: 0, different: 0, no_baseline: 0 };
  results.notes = [];
  if (refusedTotal > 0) results.notes.push(`${refusedTotal} request(s) to addresses outside the test environment were refused by the run's URL policy (for example third-party fonts or analytics). The pages were photographed without them.`);
  for (const v of results.visits) {
    if (!v.visual) continue;
    if (v.visual.state === "no-baseline") results.visual_summary.no_baseline++;
    else {
      results.visual_summary.compared++;
      if (v.visual.state === "different") results.visual_summary.different++;
    }
  }
  if (results.visual_summary.no_baseline > 0) results.notes.push(`${results.visual_summary.no_baseline} picture(s) have no baseline yet, so nothing was compared. After a run you judge good, \`qamind baseline accept --run ${ctx.runId}\` saves them as the baseline for later runs.`);
  ensureDir(path.join(ctx.outDir, "data"));
  writeJson(sweepResultsFile(ctx.outDir), JSON.parse(safeText(JSON.stringify(results))));
  return results;
}

interface RoleVisit {
  ctx: SweepContext;
  results: SweepResults;
  browser: PW;
  engine: BrowserEngine;
  vp: Viewport;
  roleName: string;
  pages: SweepPage[];
  file: SweepPagesFile;
  creds: Map<string, RoleCredentials>;
  baseOf: Map<string, string>;
  evidence: string;
  maskScript: string | undefined;
  auditScript: string | undefined;
  history: ReturnType<typeof loadPerf>;
  safeText: (s: string) => string;
  redact: (s: string) => string;
}

async function visitRole(a: RoleVisit): Promise<void> {
  const { ctx, results, engine, vp, roleName } = a;
  const context: PW = await a.browser.newContext({ viewport: { width: vp.width, height: vp.height }, serviceWorkers: "block", ignoreHTTPSErrors: process.env["QAMIND_BROWSER_IGNORE_HTTPS_ERRORS"] === "1" });
  try {
    const blockedCount = await installPolicyRouting(context, ctx.policy, STEP_MS);
    if (a.maskScript) await context.addInitScript({ content: a.maskScript });
    if (a.auditScript) await context.addInitScript({ content: a.auditScript });
    if (roleName) {
      const first = a.pages[0] as SweepPage;
      const base = a.baseOf.get(first.ui) as string;
      const page: PW = await context.newPage();
      let signed: { ok: boolean; note?: string };
      try {
        const steps = a.file.logins?.[roleName];
        if (steps) {
          for (const s of steps) await runUiStep(page, base, s, { secrets: ctx.secrets, stepMs: STEP_MS });
          signed = { ok: true };
        } else {
          await page.goto(new URL(first.path, base).toString(), { waitUntil: "load", timeout: NAV_MS });
          const c = a.creds.get(roleName);
          signed = c ? await autoSignIn(page, c) : { ok: false, note: `no login for ${roleName} is set in .env.qa` };
        }
      } catch (e) {
        signed = { ok: false, note: clip(a.redact((e as Error).message).split("\n")[0] ?? "") };
      }
      await page.close().catch(() => undefined);
      if (!signed.ok) {
        for (const p of a.pages) {
          results.skipped.push({ page: p.id, role: roleName, browser: engine, viewport: vp.name, reason: `Could not sign in as ${roleName}: ${a.safeText(signed.note ?? "unknown reason")}` });
        }
        return;
      }
    }
    for (const p of a.pages) {
      if (ctx.deadlineMs && Date.now() > ctx.deadlineMs) {
        results.budget_reached = true;
        results.skipped.push({ page: p.id, ...(roleName ? { role: roleName } : {}), browser: engine, viewport: vp.name, reason: BUDGET_REASON });
        continue;
      }
      results.visits.push(await visitPage(a, context, p, blockedCount));
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function visitPage(a: RoleVisit, context: PW, p: SweepPage, blockedCount: () => number): Promise<Visit> {
  const { ctx, engine, vp } = a;
  const base = a.baseOf.get(p.ui) as string;
  const visit: Visit = { page: p.id, title: p.title, ui: p.ui, ...(p.role ? { role: p.role } : {}), browser: engine, viewport: vp.name, width: vp.width, height: vp.height, url: bareUrl(new URL(p.path, base).toString()), requests: 0, signals: [] };
  const page: PW = await context.newPage();
  const errors: string[] = [];
  const failed = new Map<string, string>();
  const httpErrors = new Map<string, number>();
  const state = { pending: 0, last: Date.now() };
  page.on("console", (m: PW) => {
    const text = String(m.text());
    if (m.type() === "error" && !/^Failed to load resource/i.test(text)) errors.push(text);
  });
  page.on("pageerror", (e: Error) => errors.push(`Uncaught: ${e.message}`));
  page.on("request", () => {
    state.pending++;
    visit.requests++;
    state.last = Date.now();
  });
  page.on("requestfinished", () => {
    state.pending--;
    state.last = Date.now();
  });
  page.on("requestfailed", (r: PW) => {
    state.pending--;
    state.last = Date.now();
    const why = String(r.failure()?.errorText ?? "failed");
    // A request the run's own policy refused is not the product failing.
    if (!/blockedbyclient|aborted/i.test(why)) failed.set(`${r.method()} ${bareUrl(r.url())}`, why);
  });
  page.on("response", (r: PW) => {
    const status = r.status() as number;
    if (status >= 400) httpErrors.set(`${r.request().method()} ${bareUrl(r.url())}`, status);
  });
  const t0 = Date.now();
  try {
    const nav: PW = await page.goto(new URL(p.path, base).toString(), { waitUntil: "load", timeout: NAV_MS });
    const status = nav ? (nav.status() as number) : undefined;
    if (status !== undefined) visit.status = status;
    for (const s of p.steps ?? []) await runUiStep(page, base, s, { secrets: {}, stepMs: STEP_MS });
    const settled = await settle(state, t0);
    visit.settled_ms = settled.ms;
    if (settled.timedOut) visit.signals.push({ kind: "never-settled", detail: `The page was still loading after ${Math.round(SETTLE_MAX_MS / 1000)} seconds (requests kept going), so its load time is not a real measurement.`, key: "page" });
    const probe = (await page.evaluate(`(${PROBE})()`)) as Probe;
    if (probe.timing) {
      if (probe.timing.load > 0) visit.load_ms = Math.round(probe.timing.load);
      visit.ttfb_ms = Math.round(probe.timing.ttfb);
    }
    if (probe.fcp !== null) visit.fcp_ms = Math.round(probe.fcp);
    if (probe.lcp !== null) visit.lcp_ms = Math.round(probe.lcp);
    if (probe.cls !== null) visit.cls = Math.round(probe.cls * 1000) / 1000;
    visit.signals.push(...signalsFromProbe(probe, vp.width));
    if (status !== undefined && status >= 400) visit.signals.push({ kind: "http-error", detail: `The page itself answered ${status}.`, key: `page ${status}` });
    for (const [k, st] of httpErrors) if (!(status !== undefined && status >= 400 && k.endsWith(bareUrl(new URL(p.path, base).toString())))) visit.signals.push({ kind: "http-error", detail: `${k} answered ${st}.`, key: `${k} ${st}` });
    for (const [k, why] of failed) visit.signals.push({ kind: "failed-request", detail: `${k} failed (${why}).`, key: k });
    for (const e of [...new Set(errors)].slice(0, 5)) visit.signals.push({ kind: e.startsWith("Uncaught:") ? "page-error" : "console-error", detail: clip(e), key: clip(e.replace(/\d+/g, "#"), 120) });
    // Requests the run's own policy refused (third-party fonts, analytics) are not the product failing: they are counted, not reported as signals.
    const refused = blockedCount();
    if (refused > 0) visit.blocked = refused;

    // The picture: private data is blurred by the page's own script, parts that change by themselves are hidden, animations stopped.
    if (ctx.config.visual.ignore_selectors.length) await page.addStyleTag({ content: `${ctx.config.visual.ignore_selectors.join(", ")} { visibility: hidden !important; }` }).catch(() => undefined);
    ensureDir(a.evidence);
    const name = `${slug(p.id)}__${slug(p.role ?? "anon")}__${engine}__${slug(vp.name)}`;
    const shot = path.join(a.evidence, `${name}.png`);
    await page.screenshot({ path: shot, fullPage: true, animations: "disabled", caret: "hide", timeout: 15_000, ...(probe.height > MAX_SHOT_HEIGHT ? { clip: { x: 0, y: 0, width: vp.width, height: MAX_SHOT_HEIGHT } } : {}) });
    visit.screenshot = path.join("evidence", "sweep", `${name}.png`);
    const key = { page: p.id, role: p.role ?? "-", browser: engine, viewport: vp.name };
    try {
      const cmp = compareWithBaseline(ctx.store, key, shot, path.join(a.evidence, "diff", `${name}.png`), ctx.config.visual.threshold);
      if (cmp.state === "no-baseline") visit.visual = { state: "no-baseline" };
      else {
        const before = path.join("evidence", "sweep", "before", `${name}.png`);
        if (cmp.state === "different") {
          ensureDir(path.join(a.evidence, "before"));
          fs.copyFileSync(cmp.baselineFile, path.join(ctx.outDir, before));
        }
        visit.visual = {
          state: cmp.state,
          percent: cmp.diff.percent,
          impact: cmp.diff.impact,
          region: cmp.diff.region,
          size_changed: cmp.diff.size_changed,
          baseline_run: cmp.baseline.accepted_run,
          baseline_at: cmp.baseline.accepted_at,
          ...(cmp.state === "different" ? { before, after: visit.screenshot, diff: path.join("evidence", "sweep", "diff", `${name}.png`) } : {}),
        };
      }
    } catch (e) {
      visit.signals.push({ kind: "console-error", detail: `The picture could not be compared with its baseline (${clip(a.safeText((e as Error).message))}).`, key: "baseline compare" });
    }
  } catch (e) {
    visit.error = `The page could not be visited: ${clip(a.safeText(a.redact((e as Error).message).split("\n")[0] ?? ""))}`;
  } finally {
    await page.close().catch(() => undefined);
  }
  for (const s of visit.signals) s.detail = clip(a.safeText(s.detail), 300);
  return visit;
}

/** Slow pages and pages slower than the recent runs, from the measurements (spec 13.11). Pages that never settled have no real measurement and are left out. */
export function perfFindings(visits: Visit[], config: QamindConfig, history: ReturnType<typeof loadPerf>): PerfFinding[] {
  const out: PerfFinding[] = [];
  for (const v of visits) {
    if (v.error || v.settled_ms === undefined || v.signals.some((s) => s.kind === "never-settled")) continue;
    const pagePath = (() => {
      try {
        return new URL(v.url).pathname;
      } catch {
        return v.url;
      }
    })();
    const budget = pageBudget(config.performance, pagePath);
    const j = judge(v.settled_ms, budget, history.series[pageKey(v)] ?? [], config.performance.regression_pct, MIN_PAGE_DELTA_MS);
    const where = `${v.title} page${v.role ? ` (as ${v.role})` : ""}`;
    if (j.over_budget) {
      out.push({ kind: "slow-page", page: v.page, title: v.title, ...(v.role ? { role: v.role } : {}), browser: v.browser, viewport: v.viewport, ms: v.settled_ms, budget_ms: budget, ...(j.previous_ms !== undefined ? { previous_ms: j.previous_ms } : {}), message: `The ${where} takes ${plainDuration(v.settled_ms)} to be ready (the budget is ${plainDuration(budget)}).` });
    } else if (j.regressed && j.previous_ms !== undefined) {
      out.push({ kind: "regression", page: v.page, title: v.title, ...(v.role ? { role: v.role } : {}), browser: v.browser, viewport: v.viewport, ms: v.settled_ms, budget_ms: budget, previous_ms: j.previous_ms, ...(j.previous_at ? { previous_at: j.previous_at } : {}), ...(j.slower_pct !== undefined ? { slower_pct: j.slower_pct } : {}), message: `The ${where} now takes ${plainDuration(v.settled_ms)} to be ready, ${j.slower_pct}% slower than in recent runs (${plainDuration(j.previous_ms)}), though still under its budget.` });
    }
  }
  return out;
}
