import type { Plan } from "../apiplan.ts";
import { validatePlan } from "../apiplan.ts";
import { areaKey } from "../memory/risk.ts";
import { appendArchive, assertSafeText, memoryPaths, nextId, readJsonl, similarity, writeJsonl } from "../memory/store.ts";

/**
 * The test bank (spec 13.3): the checks a run found worth keeping, saved as tests that QAMind itself can run again, fast and cheaply, at the start of every later run.
 *
 * A test is data, not code. An API test is a plan (requests with what each must answer); a UI test is a short list of steps in a fixed vocabulary. QAMind runs both itself,
 * under the same safety rules as any run (the production guard, credentials from `.env.qa` only, masked evidence). Free-form scripts were considered and left out: a script
 * the agent wrote would run with the user's rights, outside every check this tool has. `tests export` turns a test into a real Playwright test for the project, written by code, for a person to review.
 */

export type BankKind = "api" | "ui";
export type BankStatus = "active" | "quarantined" | "retired";

/** The value card (spec 13.3): why this test earns its place. All three are required. */
export interface ValueCard {
  /** What it protects: the behaviour or the risk, in a sentence. */
  protects: string;
  /** When it fails: what has to be wrong for it to turn red. */
  fails_when: string;
  /** Why it is not a duplicate of a test already in the bank. */
  not_duplicate: string;
}

/** How a UI step finds an element. Exactly one of these (plus `name` with `role`). */
export interface UiTarget {
  role?: string;
  name?: string;
  text?: string;
  label?: string;
  testid?: string;
  /** A CSS selector, for when nothing above fits. */
  selector?: string;
}

export type UiStep =
  | { do: "goto"; path: string }
  | { do: "click"; target: UiTarget }
  | { do: "fill"; target: UiTarget; value?: string; secret?: string }
  | { do: "select"; target: UiTarget; option: string }
  | { do: "press"; key: string }
  | { do: "expect_text"; text: string; target?: UiTarget }
  | { do: "expect_no_text"; text: string }
  | { do: "expect_visible"; target: UiTarget }
  | { do: "expect_url"; contains: string }
  | { do: "expect_count"; target: UiTarget; count: number }
  | { do: "wait"; ms: number };

export const UI_STEP_KINDS = ["goto", "click", "fill", "select", "press", "expect_text", "expect_no_text", "expect_visible", "expect_url", "expect_count", "wait"] as const;

export interface BankStats {
  runs: number;
  passes: number;
  failures: number;
  /** Failed, then passed on the immediate retry. */
  flaky: number;
  /** Times the last result differed from the one before (pass to fail or back). */
  flips: number;
  /** The last results, newest last: p = passed, f = failed, x = passed only on a retry. */
  history: string[];
  avg_ms: number;
  last?: { result: "passed" | "failed" | "flaky-passed"; run: string; at: string; ms: number };
}

export interface BankTest {
  id: string;
  kind: BankKind;
  title: string;
  area: string;
  status: BankStatus;
  card: ValueCard;
  tags?: string[];
  /** The bug this test protects (set when it was written from a finding). A pass while the bug is open means the bug is fixed; a failure after that means it came back. */
  protects_bug?: string;
  from_run?: string;
  from_issue?: string;
  /** The ticket (and its criteria) this test came from, so a ticket can be traced to the checks that guard it. */
  ticket?: string;
  criteria?: string[];
  /** API tests: the requests and what each must answer. */
  plan?: Plan;
  /** UI tests: the web UI (a name from the config) the steps start in, and the steps. */
  ui?: string;
  steps?: UiStep[];
  created: string;
  updated: string;
  revisions: number;
  quarantine?: { reason: string; at: string };
  retired?: { reason: string; at: string; by?: string };
  stats: BankStats;
  [extra: string]: unknown;
}

export const MAX_ACTIVE_TESTS = 300;
export const MAX_PROBES = 8;
export const MAX_STEPS = 40;
const TARGET_KEYS = ["role", "text", "label", "testid", "selector"] as const;
const one = (s: string): string => s.replace(/\s+/g, " ").trim();

const emptyStats = (): BankStats => ({ runs: 0, passes: 0, failures: 0, flaky: 0, flips: 0, history: [], avg_ms: 0 });

export interface LoadedBank {
  tests: BankTest[];
  warnings: string[];
  unparsed: string[];
}

export function loadBank(store: string): LoadedBank {
  const read = readJsonl<Partial<BankTest>>(memoryPaths(store).bank);
  const warnings = [...read.warnings];
  const tests: BankTest[] = [];
  for (const r of read.records) {
    if (!r.id || !r.title || (r.kind !== "api" && r.kind !== "ui") || !r.card || (r.kind === "api" ? !r.plan : !r.steps)) {
      warnings.push(`A test bank entry without ${!r.id ? "an id" : !r.title ? "a title" : !r.card ? "a value card" : "its plan or steps"} was ignored${r.id ? ` (${r.id})` : ""}.`);
      continue;
    }
    tests.push({
      ...r,
      id: String(r.id),
      kind: r.kind,
      title: String(r.title),
      area: String(r.area ?? "general"),
      status: r.status === "quarantined" || r.status === "retired" ? r.status : "active",
      card: r.card,
      created: r.created ?? new Date(0).toISOString(),
      updated: r.updated ?? r.created ?? new Date(0).toISOString(),
      revisions: typeof r.revisions === "number" ? r.revisions : 1,
      stats: { ...emptyStats(), ...(r.stats ?? {}) },
    } as BankTest);
  }
  return { tests, warnings, unparsed: read.unparsed };
}

export function saveBank(store: string, tests: BankTest[], unparsed: string[] = []): void {
  writeJsonl(memoryPaths(store).bank, "test-bank", tests, unparsed);
}

// ------------------------------------------------------------------------------------------------ validation

export interface SaveContext {
  /** Role names from the config. */
  roles: string[];
  /** Web UI names from the config. */
  uis: string[];
  /** The environment variable names the config's roles use for logins: the only secrets a UI step may name. */
  secretNames: string[];
  /** Passwords and tokens that must never end up in a saved test. */
  knownSecrets: string[];
  now: Date;
}

const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function validateTarget(t: unknown, at: string, errors: string[]): void {
  if (!t || typeof t !== "object" || Array.isArray(t)) return void errors.push(`${at}: "target" must say how to find the element: { "role": "button", "name": "Save" }, { "label": "Email" }, { "text": "..." }, { "testid": "..." } or { "selector": "css" }.`);
  const o = t as Record<string, unknown>;
  const set = TARGET_KEYS.filter((k) => o[k] !== undefined);
  if (set.length !== 1) errors.push(`${at}: give exactly one of role, text, label, testid, selector (found ${set.length === 0 ? "none" : set.join(", ")}).`);
  for (const k of [...TARGET_KEYS, "name"]) if (o[k] !== undefined && (typeof o[k] !== "string" || !(o[k] as string).trim())) errors.push(`${at}: ${k} must be a non-empty string.`);
  if (o["name"] !== undefined && o["role"] === undefined) errors.push(`${at}: "name" goes with "role".`);
  if (typeof o["selector"] === "string" && /javascript:|[{};]/.test(o["selector"] as string)) errors.push(`${at}: that selector is not a plain CSS selector.`);
}

export function validateSteps(steps: unknown, ctx: Pick<SaveContext, "secretNames">): string[] {
  const errors: string[] = [];
  if (!Array.isArray(steps) || steps.length === 0) return ["A UI test needs a list of steps."];
  if (steps.length > MAX_STEPS) errors.push(`At most ${MAX_STEPS} steps in one test (found ${steps.length}): split it.`);
  let asserts = 0;
  for (const [i, raw] of steps.entries()) {
    const at = `steps[${i}]`;
    const s = raw as Record<string, unknown>;
    if (!s || typeof s !== "object") {
      errors.push(`${at}: must be an object with a "do".`);
      continue;
    }
    const kind = s["do"];
    if (!(UI_STEP_KINDS as readonly unknown[]).includes(kind)) {
      errors.push(`${at}: "do" must be one of ${UI_STEP_KINDS.join(", ")}.`);
      continue;
    }
    if (String(kind).startsWith("expect_")) asserts++;
    switch (kind) {
      case "goto": {
        const p = asStr(s["path"]);
        if (!p || !p.startsWith("/") || p.includes("://") || p.startsWith("//")) errors.push(`${at}: goto needs a path on the web UI, starting with "/" (not a full address).`);
        break;
      }
      case "click":
      case "expect_visible":
        validateTarget(s["target"], at, errors);
        break;
      case "fill": {
        validateTarget(s["target"], at, errors);
        const hasValue = typeof s["value"] === "string";
        const secret = asStr(s["secret"]);
        if (hasValue === !!secret) errors.push(`${at}: fill needs exactly one of "value" (test data, with the test prefix) or "secret" (the name of a login variable such as QA_ADMIN_PASS).`);
        if (secret && !ctx.secretNames.includes(secret)) errors.push(`${at}: "${secret}" is not one of the config's login variables (${ctx.secretNames.join(", ") || "none"}).`);
        break;
      }
      case "select":
        validateTarget(s["target"], at, errors);
        if (!asStr(s["option"])) errors.push(`${at}: select needs the "option" to choose.`);
        break;
      case "press":
        if (!asStr(s["key"]) || (s["key"] as string).length > 30) errors.push(`${at}: press needs a "key" such as Enter.`);
        break;
      case "expect_text":
        if (!asStr(s["text"])) errors.push(`${at}: expect_text needs the "text" that must be visible.`);
        if (s["target"] !== undefined) validateTarget(s["target"], at, errors);
        break;
      case "expect_no_text":
        if (!asStr(s["text"])) errors.push(`${at}: expect_no_text needs the "text" that must not be visible.`);
        break;
      case "expect_url":
        if (!asStr(s["contains"])) errors.push(`${at}: expect_url needs "contains".`);
        break;
      case "expect_count":
        validateTarget(s["target"], at, errors);
        if (!Number.isInteger(s["count"]) || (s["count"] as number) < 0) errors.push(`${at}: expect_count needs a whole "count".`);
        break;
      case "wait":
        if (!Number.isInteger(s["ms"]) || (s["ms"] as number) < 0 || (s["ms"] as number) > 3000) errors.push(`${at}: wait is at most 3000 ms (wait for something to appear with expect_visible instead).`);
        break;
    }
  }
  if (asserts === 0) errors.push("A UI test has to check something: end with at least one expect_ step, or it passes whatever the page does.");
  return errors;
}

export function validateApiPlan(plan: unknown, ctx: Pick<SaveContext, "roles">): string[] {
  const errors = validatePlan(plan);
  if (errors.length) return errors;
  const p = plan as Plan;
  if (p.probes.length > MAX_PROBES) errors.push(`At most ${MAX_PROBES} requests in one test (found ${p.probes.length}): split it.`);
  for (const [i, pr] of p.probes.entries()) {
    const at = `probes[${i}] (${pr.id})`;
    if (pr.expect?.status === undefined) errors.push(`${at}: every request in a saved test needs expect.status, or it can never fail.`);
    if (pr.role !== "anonymous" && !ctx.roles.includes(pr.role)) errors.push(`${at}: role "${pr.role}" is not in the config (${ctx.roles.join(", ")}, or "anonymous").`);
    if (!pr.path.startsWith("/") || pr.path.includes("://") || pr.path.startsWith("//")) errors.push(`${at}: the path is relative to the API base address and starts with "/".`);
    for (const h of Object.keys(pr.headers ?? {})) if (/^(authorization|cookie|x-api-key|proxy-authorization)$/i.test(h)) errors.push(`${at}: do not put ${h} in a saved test; sign-in is done by the runner for the probe's role.`);
    if (pr.repeat && pr.repeat.count > 5) errors.push(`${at}: repeat at most 5 times in a bank test.`);
  }
  return errors;
}

// ------------------------------------------------------------------------------------------------ duplicates

const normPath = (p: string): string => p.split("?")[0]?.replace(/\/\d+(?=\/|$)/g, "/:id").replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}(?=\/|$)/gi, "/:id").toLowerCase() ?? p;

/** What a test does, as a set of short strings: two tests with nearly the same set are the same test. */
export function signatureOf(t: Pick<BankTest, "kind" | "plan" | "steps">): string[] {
  if (t.kind === "api") return (t.plan?.probes ?? []).map((p) => `${p.method.toUpperCase()} ${normPath(p.path)} ${p.role} ${JSON.stringify(p.expect?.status ?? "")} ${Object.keys(p.query ?? {}).sort().join(",")}`);
  return (t.steps ?? []).map((s) => {
    const tg = "target" in s && s.target ? JSON.stringify(s.target) : "path" in s ? (s as { path: string }).path : "text" in s ? (s as { text: string }).text : "";
    return `${s.do} ${tg}`;
  });
}

const jaccard = (a: string[], b: string[]): number => {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / (A.size + B.size - both);
};

export function findDuplicate(tests: BankTest[], cand: Pick<BankTest, "kind" | "area" | "title" | "plan" | "steps">, ignoreId?: string): BankTest | undefined {
  const sig = signatureOf(cand);
  return tests.find((t) => t.status !== "retired" && t.id !== ignoreId && t.kind === cand.kind && (jaccard(signatureOf(t), sig) >= 0.8 || (areaKey(t.area) === areaKey(cand.area) && similarity(t.title, cand.title) >= 0.75)));
}

// ------------------------------------------------------------------------------------------------ saving

export interface SaveInput {
  kind: BankKind;
  title: string;
  area: string;
  card: ValueCard;
  tags?: string[];
  plan?: unknown;
  ui?: string;
  steps?: unknown;
  protects_bug?: string;
  from_run?: string;
  from_issue?: string;
  /** Ticket mode (spec 13.4): the ticket this check came from, and which of its criteria it checks. Set from the run's own ticket when the run is a ticket run. */
  ticket?: string;
  criteria?: string[];
  /** Replace the plan or steps of this existing test instead of adding a new one. */
  extends?: string;
}

export interface SaveResult {
  action: "created" | "extended" | "duplicate";
  test?: BankTest;
  /** For a duplicate: the test that already covers it. */
  existing?: { id: string; title: string };
  warnings: string[];
  message: string;
}

/** Saves one test. Refuses (with what to change) rather than saving something that cannot run, cannot fail, or repeats another test. */
export function saveTest(store: string, input: SaveInput, ctx: SaveContext): SaveResult {
  const title = one(input.title);
  const area = one(input.area);
  if (title.length < 8 || title.length > 140) throw new Error("A test needs a title of 8 to 140 characters that says what it checks.");
  if (!area) throw new Error("A test needs an area (the same wording the findings and coverage use).");
  const card: ValueCard = { protects: one(input.card?.protects ?? ""), fails_when: one(input.card?.fails_when ?? ""), not_duplicate: one(input.card?.not_duplicate ?? "") };
  for (const [k, v] of Object.entries(card)) if (v.length < 12) throw new Error(`The value card needs "${k}" (a real sentence): ${k === "protects" ? "what this test protects" : k === "fails_when" ? "what has to be wrong for it to fail" : "why it is not a duplicate of a test already in the bank"}.`);
  const warnings: string[] = [];

  let errors: string[] = [];
  let plan: Plan | undefined;
  let steps: UiStep[] | undefined;
  if (input.kind === "api") {
    errors = validateApiPlan(input.plan, ctx);
    plan = input.plan as Plan;
    if (errors.length === 0) for (const pr of plan.probes) if (!["GET", "HEAD", "OPTIONS"].includes(pr.method.toUpperCase()) && !JSON.stringify(pr.body ?? pr.raw_body ?? "").includes("QA-")) warnings.push(`${pr.id} changes data but its body has no "QA-" test prefix: records it creates would not be recognisable as test data.`);
  } else if (input.kind === "ui") {
    errors = validateSteps(input.steps, ctx);
    if (!input.ui || !ctx.uis.includes(input.ui)) errors.push(`"ui" must be one of the config's web UIs: ${ctx.uis.join(", ")}.`);
    steps = input.steps as UiStep[];
  } else throw new Error('kind must be "api" or "ui".');
  if (errors.length) throw new Error(`The test cannot be saved:\n  ${errors.join("\n  ")}`);
  // No secrets and no real people's data in a saved test (bodies, queries, texts, titles); the runner supplies logins itself.
  assertSafeText("this test", JSON.stringify({ title, area, card, plan, steps, tags: input.tags }), ctx.knownSecrets);

  const loaded = loadBank(store);
  const tests = loaded.tests;
  const now = ctx.now.toISOString();
  const cand = { kind: input.kind, area, title, ...(plan ? { plan } : {}), ...(steps ? { steps } : {}) } as Pick<BankTest, "kind" | "area" | "title" | "plan" | "steps">;

  if (input.extends) {
    const target = tests.find((t) => t.id === input.extends);
    if (!target) throw new Error(`No test ${input.extends} to extend.`);
    if (target.kind !== input.kind) throw new Error(`${target.id} is a ${target.kind} test; it cannot become a ${input.kind} test.`);
    Object.assign(target, { title, area, card, updated: now, revisions: target.revisions + 1, ...(plan ? { plan } : {}), ...(steps ? { steps } : {}), ...(input.ui ? { ui: input.ui } : {}), ...(input.tags ? { tags: input.tags } : {}) });
    if (input.protects_bug) target.protects_bug = input.protects_bug;
    if (input.ticket) {
      target.ticket = input.ticket;
      target.criteria = [...new Set([...(target.ticket === input.ticket ? (target.criteria ?? []) : []), ...(input.criteria ?? [])])];
    }
    saveBank(store, tests, loaded.unparsed);
    return { action: "extended", test: target, warnings, message: `${target.id} was extended (revision ${target.revisions}).` };
  }

  const dup = findDuplicate(tests, cand);
  if (dup) return { action: "duplicate", existing: { id: dup.id, title: dup.title }, warnings, message: `${dup.id} ("${dup.title}") already covers this. Extend it instead: save again with extends: "${dup.id}" and the combined requests or steps. Near-duplicates are not added.` };
  if (tests.filter((t) => t.status !== "retired").length >= MAX_ACTIVE_TESTS) throw new Error(`The bank already holds ${MAX_ACTIVE_TESTS} tests. Retire outdated ones first (\`qamind tests prune\` lists candidates).`);

  const test: BankTest = {
    id: nextId("T", tests.map((t) => t.id)),
    kind: input.kind,
    title,
    area,
    status: "active",
    card,
    ...(input.tags?.length ? { tags: input.tags.map(one).filter(Boolean).slice(0, 8) } : {}),
    ...(input.protects_bug ? { protects_bug: input.protects_bug } : {}),
    ...(input.from_run ? { from_run: input.from_run } : {}),
    ...(input.from_issue ? { from_issue: input.from_issue } : {}),
    ...(input.ticket ? { ticket: input.ticket, criteria: input.criteria ?? [] } : {}),
    ...(plan ? { plan } : {}),
    ...(input.kind === "ui" ? { ui: input.ui as string, steps: steps as UiStep[] } : {}),
    created: now,
    updated: now,
    revisions: 1,
    stats: emptyStats(),
  };
  tests.push(test);
  saveBank(store, tests, loaded.unparsed);
  return { action: "created", test, warnings, message: `Saved as ${test.id}. It runs at the start of every later run.` };
}

// ------------------------------------------------------------------------------------------------ results and flakiness

const HISTORY = 10;
export const FLAKY_RETRY_PASSES = { within: 5, count: 2 };
export const FLAKY_FLIPS = { within: 8, count: 4 };

/** True when the recent results show a test that fails and passes without anything changing in the product. */
export function looksFlaky(stats: Pick<BankStats, "history">): string | undefined {
  const h = stats.history;
  const retries = h.slice(-FLAKY_RETRY_PASSES.within).filter((x) => x === "x").length;
  if (retries >= FLAKY_RETRY_PASSES.count) return `It passed only on a retry in ${retries} of its last ${Math.min(h.length, FLAKY_RETRY_PASSES.within)} runs.`;
  const recent = h.slice(-FLAKY_FLIPS.within).map((x) => (x === "f" ? "f" : "p"));
  let flips = 0;
  for (let i = 1; i < recent.length; i++) if (recent[i] !== recent[i - 1]) flips++;
  if (flips >= FLAKY_FLIPS.count) return `Its result changed ${flips} times in its last ${recent.length} runs.`;
  return undefined;
}

export function recordResult(test: BankTest, result: "passed" | "failed" | "flaky-passed", run: string, at: Date, ms: number): void {
  const s = test.stats;
  const prev = s.history[s.history.length - 1];
  const letter = result === "passed" ? "p" : result === "failed" ? "f" : "x";
  if (prev && (prev === "f") !== (letter === "f")) s.flips += 1;
  s.history = [...s.history, letter].slice(-HISTORY);
  s.avg_ms = Math.round((s.avg_ms * s.runs + ms) / (s.runs + 1));
  s.runs += 1;
  if (result === "failed") s.failures += 1;
  else s.passes += 1;
  if (result === "flaky-passed") s.flaky += 1;
  s.last = { result, run, at: at.toISOString(), ms };
  const why = test.status === "active" ? looksFlaky(s) : undefined;
  if (why) {
    test.status = "quarantined";
    test.quarantine = { reason: why, at: at.toISOString() };
  }
}

export function setQuarantine(store: string, id: string, on: boolean, reason: string | undefined, now: Date): BankTest {
  const loaded = loadBank(store);
  const t = loaded.tests.find((x) => x.id === id);
  if (!t) throw new Error(`No test ${id}.`);
  if (t.status === "retired") throw new Error(`${id} is retired.`);
  if (on) {
    t.status = "quarantined";
    t.quarantine = { reason: reason ?? "set by hand", at: now.toISOString() };
  } else {
    t.status = "active";
    delete t.quarantine;
    t.stats.history = []; // a fresh start: the old flakiness must not quarantine it again at once
  }
  t.updated = now.toISOString();
  saveBank(store, loaded.tests, loaded.unparsed);
  return t;
}

export function retireTest(store: string, id: string, reason: string, by: string | undefined, now: Date): BankTest {
  const loaded = loadBank(store);
  const t = loaded.tests.find((x) => x.id === id);
  if (!t) throw new Error(`No test ${id}.`);
  if (reason.trim().length < 8) throw new Error("Say why the test is retired (a short sentence): it is kept in the archive with that reason.");
  assertSafeText("this reason", reason);
  t.status = "retired";
  t.retired = { reason: reason.trim(), at: now.toISOString(), ...(by ? { by } : {}) };
  t.updated = now.toISOString();
  appendArchive(store, "test-bank", [t]);
  saveBank(store, loaded.tests.filter((x) => x.id !== id), loaded.unparsed);
  return t;
}

/** Tests that look stale: failing for a long time, quarantined for a month, or never run. Suggestions for the owner, never decisions. */
export function pruneCandidates(tests: BankTest[], now: Date): Array<{ id: string; title: string; why: string }> {
  const out: Array<{ id: string; title: string; why: string }> = [];
  for (const t of tests) {
    const lastFails = t.stats.history.slice(-5);
    if (lastFails.length === 5 && lastFails.every((x) => x === "f")) out.push({ id: t.id, title: t.title, why: "It failed its last 5 runs: the product may have changed on purpose, so the test is out of date, or the bug is real and still open." });
    else if (t.status === "quarantined" && t.quarantine && now.getTime() - Date.parse(t.quarantine.at) > 30 * 86_400_000) out.push({ id: t.id, title: t.title, why: `Quarantined for more than 30 days: ${t.quarantine.reason}` });
    else if (t.stats.runs === 0 && now.getTime() - Date.parse(t.created) > 90 * 86_400_000) out.push({ id: t.id, title: t.title, why: "Saved more than 90 days ago and never run." });
  }
  return out;
}

/** What the agent needs to know before it plans: how much the bank covers, where, and what is set aside. */
export function summariseBank(tests: BankTest[]): {
  total: number;
  active: number;
  quarantined: number;
  by_kind: { api: number; ui: number };
  areas: Record<string, number>;
  quarantined_tests: Array<{ id: string; title: string; reason: string }>;
  last_failed: Array<{ id: string; title: string }>;
} {
  const live = tests.filter((t) => t.status !== "retired");
  const active = live.filter((t) => t.status === "active");
  const areas: Record<string, number> = {};
  for (const t of active) areas[t.area] = (areas[t.area] ?? 0) + 1;
  return {
    total: live.length,
    active: active.length,
    quarantined: live.length - active.length,
    by_kind: { api: active.filter((t) => t.kind === "api").length, ui: active.filter((t) => t.kind === "ui").length },
    areas,
    quarantined_tests: live.filter((t) => t.status === "quarantined").slice(0, 10).map((t) => ({ id: t.id, title: t.title, reason: t.quarantine?.reason ?? "" })),
    last_failed: active.filter((t) => t.stats.last?.result === "failed").slice(0, 10).map((t) => ({ id: t.id, title: t.title })),
  };
}

/** At the end of a run: tests saved from a finding of this run now know the bug that finding became (its id is only final once the run is finished). */
export function linkBankToBugs(store: string, runId: string, bugOf: Map<string, string>): string[] {
  const loaded = loadBank(store);
  const linked: string[] = [];
  for (const t of loaded.tests) {
    if (t.from_run !== runId || !t.from_issue || t.protects_bug) continue;
    const bug = bugOf.get(t.from_issue);
    if (!bug) continue;
    t.protects_bug = bug;
    linked.push(`${t.id} protects ${bug}`);
  }
  if (linked.length) saveBank(store, loaded.tests, loaded.unparsed);
  return linked;
}
