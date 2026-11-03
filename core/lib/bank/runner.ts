import path from "node:path";
import { runPlan } from "../apirunner.ts";
import type { RoleCredentials } from "../auth.ts";
import { BUDGET_REASON } from "../budget.ts";
import type { QamindConfig } from "../config.ts";
import { ensureDir, writeJson } from "../fsutil.ts";
import { withStoreLock } from "../memory/lock.ts";
import { maskText } from "../privacy.ts";
import type { PrivacyContext } from "../privacy.ts";
import type { RunPolicy } from "../urlpolicy.ts";
import { loadBank, recordResult, saveBank } from "./bank.ts";
import type { BankTest } from "./bank.ts";
import { bankResultsFile } from "./results.ts";
import type { BankResults, BankTestResult } from "./results.ts";
import { createUiRunner } from "./uirunner.ts";
import type { UiRunner } from "./uirunner.ts";

/**
 * Runs the test bank (spec 13.3): the first thing a run does after the health check, before it explores. Every active test runs once; a test that fails runs once more straight away
 * (a pass on that second try is recorded as flaky and counts as a pass), and one that fails twice is a failure the run has to account for. Quarantined tests are listed, not run.
 */

export interface BankRunContext {
  store: string;
  /** The run folder, or a folder of its own for a bank-only run. Results go to `<outDir>/data/bank-results.json`, evidence to `<outDir>/evidence/`. */
  outDir: string;
  runId: string;
  config: QamindConfig;
  policy: RunPolicy;
  roles: RoleCredentials[];
  /** Login variable names to values, for UI tests. */
  secrets: Record<string, string>;
  /** Passwords and tokens to scrub from any text. */
  passwords: string[];
  privacy: PrivacyContext;
  deadlineMs?: number;
  /** Replaced in tests. */
  fetchImpl?: typeof fetch;
}

export interface BankRunOptions {
  only?: string[];
  area?: string;
  includeQuarantined?: boolean;
  now?: Date;
  /** Replaced in tests: how UI tests get a browser. */
  uiRunnerFactory?: typeof createUiRunner;
}

/** The reason given when the API stops answering; the rest of the API tests are then skipped without trying. */
export const API_DOWN = "The API did not answer";

const clip = (s: string, n = 240): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function runApiTest(test: BankTest, ctx: BankRunContext): Promise<{ ok: boolean; skipped?: string; detail?: string; evidence?: string }> {
  const base = ctx.config.api.base_url;
  if (!base) return { ok: false, skipped: "api.base_url is not set in the config" };
  const plan = { ...(test.plan as NonNullable<BankTest["plan"]>), name: test.id };
  const result = await runPlan(plan, {
    baseUrl: base,
    policy: ctx.policy,
    roles: ctx.roles,
    ...(ctx.config.api.login ? { login: ctx.config.api.login } : {}),
    runDir: ctx.outDir,
    privacy: ctx.privacy,
    ...(ctx.deadlineMs ? { deadlineMs: ctx.deadlineMs } : {}),
    ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
  });
  const skipped = result.results.find((r) => r.skipped);
  if (skipped) return { ok: false, skipped: skipped.skipped as string };
  // A request that got no answer at all is not a pass (the expectations were never checked) and not a failure of the product either: the environment stopped answering.
  // The check below would otherwise see no failed expectation and call the test green.
  const silent = result.results.find((r) => r.signals.some((x) => x.kind === "network-error"));
  if (silent) return { ok: false, skipped: `${API_DOWN} (${silent.signals.find((x) => x.kind === "network-error")?.detail ?? "no answer"}). Nothing was concluded about the product: check the environment and run again.` };
  const bad = result.results.filter((r) => r.expectation_failures.length > 0);
  if (bad.length === 0) return { ok: true };
  const first = bad[0] as (typeof bad)[number];
  return { ok: false, detail: clip(`${first.id} (${first.title}): ${first.expectation_failures.slice(0, 2).join("; ")}`), ...(first.evidence ? { evidence: first.evidence } : {}) };
}

export async function runBank(ctx: BankRunContext, opts: BankRunOptions = {}): Promise<BankResults> {
  const now = opts.now ?? new Date();
  const loaded = loadBank(ctx.store);
  const wanted = (t: BankTest): boolean => t.status !== "retired" && (!opts.only || opts.only.includes(t.id)) && (!opts.area || t.area.toLowerCase() === opts.area.toLowerCase());
  const tests = loaded.tests.filter(wanted);
  const results: BankTestResult[] = [];
  const updates = new Map<string, { result: "passed" | "failed" | "flaky-passed"; ms: number }>();
  let ui: UiRunner | { unavailable: string } | undefined;
  let budgetReached = false;
  let apiDown: string | undefined;
  const evidenceDir = path.join(ctx.outDir, "evidence", "bank");

  const row = (t: BankTest, r: Partial<BankTestResult> & Pick<BankTestResult, "status">): void => {
    results.push({ test: t.id, title: t.title, area: t.area, kind: t.kind, ...(t.protects_bug ? { bug: t.protects_bug } : {}), ms: 0, attempts: 0, ...r });
  };

  for (const t of tests) {
    if (t.status === "quarantined" && !opts.includeQuarantined) {
      row(t, { status: "quarantined", detail: t.quarantine?.reason ?? "set aside as flaky" });
      continue;
    }
    if (ctx.deadlineMs && Date.now() > ctx.deadlineMs) {
      budgetReached = true;
      row(t, { status: "skipped", detail: BUDGET_REASON });
      continue;
    }
    if (t.kind === "api" && apiDown) {
      row(t, { status: "skipped", detail: apiDown });
      continue;
    }
    const started = Date.now();
    let attempts = 0;
    let last: { ok: boolean; skipped?: string; detail?: string; evidence?: string; screenshot?: string; unavailable?: boolean } = { ok: false };
    const attempt = async (): Promise<void> => {
      attempts++;
      if (t.kind === "api") last = await runApiTest(t, ctx);
      else {
        if (!ui) {
          ui = await (opts.uiRunnerFactory ?? createUiRunner)({
            baseUrls: Object.fromEntries(ctx.config.web_uis.map((u) => [u.name, u.url])),
            policy: ctx.policy,
            secrets: ctx.secrets,
            evidenceDir,
            redact: (s) => ctx.passwords.reduce((acc, p) => (p ? acc.split(p).join("[REDACTED]") : acc), s),
            mask: { selectors: ctx.config.privacy.mask_selectors, patterns: ctx.config.privacy.mask_patterns, prefix: ctx.config.test_data_prefix, allow: ctx.roles.map((r) => r.username) },
          });
        }
        if ("unavailable" in ui) last = { ok: false, skipped: ui.unavailable };
        else {
          const o = await ui.run(t);
          last = o.unavailable ? { ok: false, skipped: o.detail ?? "not runnable here" } : { ok: o.ok, ...(o.detail ? { detail: o.detail } : {}), ...(o.screenshot ? { evidence: o.screenshot } : {}) };
        }
      }
    };
    try {
      await attempt();
      if (!last.ok && !last.skipped) await attempt(); // one immediate retry: a pass now means the first failure was flakiness, not the product
    } catch (e) {
      last = { ok: false, detail: clip(`The test could not run: ${(e as Error).message}`) };
    }
    const ms = Date.now() - started;
    if (last.skipped) {
      if (t.kind === "api" && last.skipped.startsWith(API_DOWN)) apiDown = last.skipped;
      row(t, { status: "skipped", detail: last.skipped, ms, attempts });
      continue;
    }
    if (last.ok) {
      const flaky = attempts > 1;
      row(t, { status: flaky ? "flaky-passed" : "passed", ...(flaky ? { detail: "failed once, then passed on an immediate retry" } : {}), ms, attempts });
      updates.set(t.id, { result: flaky ? "flaky-passed" : "passed", ms });
    } else {
      row(t, { status: "failed", ...(last.detail ? { detail: last.detail } : {}), ...(last.evidence ? { evidence: last.evidence } : {}), ms, attempts });
      updates.set(t.id, { result: "failed", ms });
    }
  }
  if (ui && !("unavailable" in ui)) await ui.close();

  // Statistics are written under the store's lock, from a fresh read, so two runs finishing together cannot lose each other's results.
  const newlyQuarantined: string[] = [];
  withStoreLock(ctx.store, () => {
    const fresh = loadBank(ctx.store);
    for (const t of fresh.tests) {
      const u = updates.get(t.id);
      if (!u) continue;
      const was = t.status;
      recordResult(t, u.result, ctx.runId, now, u.ms);
      if (was === "active" && t.status === "quarantined") newlyQuarantined.push(t.id);
    }
    if (updates.size) saveBank(ctx.store, fresh.tests, fresh.unparsed);
  });
  for (const id of newlyQuarantined) {
    const r = results.find((x) => x.test === id);
    if (r) r.detail = `${r.detail ? `${r.detail}. ` : ""}Now quarantined as flaky: it is not run again until someone releases it (\`qamind tests unquarantine ${id}\`).`;
  }

  const count = (s: BankTestResult["status"]): number => results.filter((r) => r.status === s).length;
  const failedAreas = new Set(results.filter((r) => r.status === "failed").map((r) => r.area));
  const out: BankResults = {
    schema_version: 1,
    run_id: ctx.runId,
    ran_at: now.toISOString(),
    total: results.length,
    passed: count("passed"),
    flaky: count("flaky-passed"),
    failed: count("failed"),
    quarantined: count("quarantined"),
    skipped: count("skipped"),
    results,
    covered_areas: [...new Set(results.filter((r) => (r.status === "passed" || r.status === "flaky-passed") && !failedAreas.has(r.area)).map((r) => r.area))].sort(),
    ...(budgetReached ? { budget_reached: true } : {}),
  };
  ensureDir(path.join(ctx.outDir, "data"));
  // Failure details can quote the page or a response: masked like all evidence.
  writeJson(bankResultsFile(ctx.outDir), JSON.parse(maskText(JSON.stringify(out), ctx.privacy).text));
  return out;
}
