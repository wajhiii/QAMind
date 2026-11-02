import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { ParseArgsOptionsConfig } from "node:util";
import { AutoUsageError, autoCommand } from "../../core/auto-qa/commands.ts";
import { approveAutoSkill, onPrompt, onStop, safely } from "../../core/auto-qa/gate.ts";
import type { HookEnv } from "../../core/auto-qa/gate.ts";
import { mapPromptInput, mapStopInput, readHostAutoConfig, renderStopOutput } from "../../core/auto-qa/hostio.ts";
import { generatePlan } from "../../core/lib/apiplan.ts";
import type { Plan } from "../../core/lib/apiplan.ts";
import { runPlan } from "../../core/lib/apirunner.ts";
import { checkConfigFile } from "../../core/lib/config.ts";
import { ensureDir, exists, readJson, writeJson } from "../../core/lib/fsutil.ts";
import { readBlocked } from "../../core/lib/guardpolicy.ts";
import { budgetStatus } from "../../core/lib/budget.ts";
import { contextFrom, contextForRun, maskRun, scanRun } from "../../core/lib/privacy.ts";
import { healthWithPrep } from "../../core/lib/health.ts";
import { makeRedactor } from "../../core/lib/redact.ts";
import { decidePreToolUse, toHookOutput } from "../../core/lib/hooks.ts";
import type { PreToolUseInput } from "../../core/lib/hooks.ts";
import type { FalseAlarmSource } from "../../core/lib/memory/falsealarms.ts";
import { LEARNING_TYPES } from "../../core/lib/memory/learnings.ts";
import type { LearningType } from "../../core/lib/memory/learnings.ts";
import { loadMap } from "../../core/lib/memory/productmap.ts";
import { approveLesson, lessonOverview, rejectLesson } from "../../core/lib/memory/lessons.ts";
import { memoryStats, pruneMemory, reviewOverview } from "../../core/lib/memory/review.ts";
import { changeLearningConfidence, finishRunAndRestore, getContext, listMemory, markFalseAlarm, projectNamesOf, projectScope, recordApplied, runScope, saveLearning } from "../../core/lib/memory/service.ts";
import { buildInventory, loadSpecFile, parseSpecText, resolveSpecPath } from "../../core/lib/openapi.ts";
import type { Inventory } from "../../core/lib/openapi.ts";
import { qamindHome } from "../../core/lib/paths.ts";
import { ensureProjectStore, resolveProject } from "../../core/lib/project.ts";
import { lintReports, writeReports } from "../../core/lib/reports.ts";
import { MODES, startRun } from "../../core/lib/run.ts";
import type { Mode } from "../../core/lib/run.ts";
import { loadRunContext } from "../../core/lib/runctx.ts";
import type { RunContext } from "../../core/lib/runctx.ts";
import { isRequestAllowed } from "../../core/lib/urlpolicy.ts";
import { KNOWLEDGE_VERSION, QAMIND_VERSION } from "../../core/lib/version.ts";
import { runBrowserLauncher } from "../../core/scripts/browser-launcher.ts";
import { checkConsistency } from "../../core/scripts/consistency-check.ts";
import { exportAdminHtml } from "../../core/scripts/export-html.ts";

/** All commands print one JSON document on stdout so skills can read it; human text goes to stderr. */
function emit(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

class UsageError extends Error {}

const HELP = `qamind ${QAMIND_VERSION}: Senior QA Engineer agent runtime

Run lifecycle
  run start   [--mode full|quick|regression|diff] [--focus TEXT] [--session ID] [--project DIR]
              [--kind qa-only|qa] [--trigger manual|auto|ci] [--host NAME] [--force]
  run finish  --run ID [--stop-reason TEXT] [--cost TEXT]
Checks and testing
  config check [--project DIR]
  health       --run ID
  api inventory --run ID [--spec PATH_OR_URL]
  api plan      --run ID [--role NAME] [--name NAME] [--no-writes] [--no-matrix] [--include-side-effects]
                [--max-per-endpoint N] [--max-total N]
  api run       --run ID --plan FILE_OR_NAME [--read-only] [--slow-ms N]
Reporting and memory
  report build --run ID        render TECHNICAL-REPORT.md and ADMIN-REPORT.md from <run>/data/*.json
  report lint  --run ID        evidence rules, plain-language text, and the two reports agreeing (exit 1 on errors)
  report check --run ID        only the consistency check of the two written reports
  report export-html --run ID [--no-images] [--out FILE]   ADMIN-REPORT.html: one self-contained file for emailing
  memory context --run ID      what memory knows: risk areas, learnings, false alarms, product map, last findings
  memory learn --run ID --type T --area A --text TEXT [--confidence N]     save one atomic learning (de-duplicated)
  memory learn --run ID --confirms L-001 | --contradicts L-001             adjust confidence (below 3 it is archived)
  memory applied --run ID --ids L-001,FA-002   record learnings you used and false alarms you skipped (must exist)
  memory false-alarm --run ID --area A --symptom S --reason R [--source reproduction|owner|spec]
  memory show --run ID --what learnings|false-alarms|risk|map
  memory where [--project DIR] print the project's private store path
  memory review [--project DIR]   what memory holds, with entries that look stale marked (owner's review)
  memory stats  [--project DIR]   run history trend and memory use, and what cannot be measured yet
  memory prune  --learning L-001 | --false-alarm FA-001 | --risk AREA [--reason TEXT] [--project DIR]   archive one entry (owner action)
Global lessons (owner's list; see \`/qa-memory-review\`)
  lessons list [--project DIR]              pending, approved (and whether each is loaded here) and rejected lessons
  lessons approve ID [--text REWORDING]     pending lesson -> approved: every project reads it from then on (owner action)
  lessons reject ID [--reason TEXT]         turn a pending lesson down, or retire an approved one (owner action)
  guard log    --run ID        origins the browser guard blocked during the run
  budget status --run ID       time left in the run's budget; check it before each new area, and stop exploring when it says over
  privacy scan --run ID        look for unmasked private data (emails, phones, ID and card numbers, your patterns) in the run's output; exit 1 if found
  privacy mask --run ID        mask it in place (test accounts' own data stays), then rebuild the reports
Auto-QA (default off; see \`qamind auto help\`)
  auto status|on|off|mode M|pause 1h|resume|global on|off|set K V   toggle QA after every agent task
Plumbing (started by the host, not by hand)
  browser-mcp                  browser tool behind the production guard
  hook pre-tool-use            safety hook (reads the host's hook JSON on stdin)
  hook stop | user-prompt-submit   auto-QA gate (reads the host's hook JSON on stdin)
  version
`;

function opts<const T extends ParseArgsOptionsConfig>(args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
}

function num(v: unknown, name: string, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--${name} must be a positive number`);
  return n;
}

async function cmdRun(sub: string | undefined, rest: string[], home: string): Promise<number> {
  if (sub === "start") {
    const { values } = opts(rest, {
      mode: { type: "string", default: "full" },
      focus: { type: "string" },
      session: { type: "string" },
      project: { type: "string" },
      kind: { type: "string", default: "qa-only" },
      trigger: { type: "string", default: "manual" },
      host: { type: "string", default: "claude-code" },
      force: { type: "boolean", default: false },
    });
    const mode = values.mode as Mode;
    if (!MODES.includes(mode)) throw new UsageError(`--mode must be one of ${MODES.join(", ")}`);
    if (values.kind !== "qa-only" && values.kind !== "qa") throw new UsageError("--kind must be qa-only or qa");
    if (!["manual", "auto", "ci"].includes(values.trigger as string)) throw new UsageError("--trigger must be manual, auto or ci");
    const result = startRun({
      cwd: process.cwd(),
      mode,
      kind: values.kind,
      trigger: values.trigger as "manual" | "auto" | "ci",
      host: values.host as string,
      home,
      force: values.force as boolean,
      ...(values.project ? { project: values.project as string } : {}),
      ...(values.focus ? { focus: values.focus as string } : {}),
      ...(values.session ? { sessionId: values.session as string } : {}),
    });
    emit(result);
    return result.status === "ready" ? 0 : result.status === "needs-config" ? 3 : result.status === "no-project" ? 5 : result.status === "busy" ? 6 : 4;
  }
  if (sub === "finish") {
    const { values } = opts(rest, { run: { type: "string" }, "stop-reason": { type: "string" }, cost: { type: "string" } });
    if (!values.run) throw new UsageError("--run is required");
    const summary = await finishRunAndRestore(home, values.run as string, { ...(values["stop-reason"] ? { stopReason: values["stop-reason"] as string } : {}), ...(values.cost ? { cost: values.cost as string } : {}) });
    emit(summary);
    return 0;
  }
  throw new UsageError("run needs a subcommand: start | finish");
}

async function loadInventory(ctx: RunContext, specArg: string | undefined): Promise<Inventory> {
  const source = specArg ?? ctx.config.api.openapi;
  if (!source) throw new UsageError("No OpenAPI source: set api.openapi in .qa/config.md or pass --spec. Without a spec, read the routes from the source code and the browser's network traffic.");
  let doc: unknown;
  if (/^https?:\/\//i.test(source)) {
    const allowed = isRequestAllowed(ctx.policy, source);
    if (!allowed.allowed) throw new Error(`Refusing to fetch the spec: ${allowed.reason}`);
    const res = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Could not download the spec from ${source}: HTTP ${res.status}`);
    doc = parseSpecText(await res.text(), source);
  } else {
    doc = loadSpecFile(resolveSpecPath(source, ctx.projectRoot));
  }
  const inv = buildInventory(doc, source);
  writeJson(path.join(ctx.runDir, "data", "api-inventory.json"), inv);
  return inv;
}

function readInventory(ctx: RunContext): Inventory | undefined {
  return readJson<Inventory>(path.join(ctx.runDir, "data", "api-inventory.json"));
}

async function cmdApi(sub: string | undefined, rest: string[], home: string): Promise<number> {
  if (sub === "inventory") {
    const { values } = opts(rest, { run: { type: "string" }, spec: { type: "string" } });
    const ctx = loadRunContext(home, values.run as string | undefined);
    const inv = await loadInventory(ctx, values.spec as string | undefined);
    // Compare with what memory knew, so new and removed endpoints are tested first.
    const known = loadMap(ctx.marker.store);
    const changes_vs_memory =
      known && known.api.source === "openapi"
        ? { added: inv.endpoints.filter((e) => !known.api.endpoints[e.operation]).map((e) => e.operation), removed: Object.keys(known.api.endpoints).filter((op) => !inv.endpoints.some((e) => e.operation === op)) }
        : undefined;
    emit({
      ...(changes_vs_memory ? { changes_vs_memory } : {}),
      source: inv.source,
      title: inv.title,
      version: inv.version,
      servers: inv.servers,
      security_schemes: inv.security_schemes,
      inventory_file: "data/api-inventory.json",
      count: inv.endpoints.length,
      endpoints: inv.endpoints.slice(0, 300).map((e) => ({
        operation: e.operation,
        auth: e.auth,
        ...(e.summary ? { summary: e.summary } : {}),
        params: e.parameters.map((p) => `${p.name}${p.required ? "*" : ""}(${p.in})`),
        ...(e.request_body?.schema ? { body: Object.keys((e.request_body.schema["properties"] as object) ?? {}) } : {}),
        responses: e.responses.map((r) => r.status),
      })),
    });
    return 0;
  }
  if (sub === "plan") {
    const { values } = opts(rest, { run: { type: "string" }, role: { type: "string" }, name: { type: "string" }, "no-writes": { type: "boolean", default: false }, "max-per-endpoint": { type: "string" }, "max-total": { type: "string" }, "include-side-effects": { type: "boolean", default: false }, "no-matrix": { type: "boolean", default: false } });
    const ctx = loadRunContext(home, values.run as string | undefined);
    const inv = readInventory(ctx) ?? (await loadInventory(ctx, undefined));
    const withCreds = ctx.roles.map((r) => r.name);
    const role = (values.role as string | undefined) ?? (withCreds.includes("admin") ? "admin" : withCreds[0]);
    if (!role) throw new UsageError("No role has credentials, so there is nobody to run the plan as.");
    const { plan, excluded } = generatePlan(inv, {
      sideEffects: values["include-side-effects"] as boolean,
      matrix: !values["no-matrix"],
      role,
      matrixRoles: withCreds,
      prefix: ctx.config.test_data_prefix,
      writes: !values["no-writes"],
      maxPerEndpoint: num(values["max-per-endpoint"], "max-per-endpoint", 30),
      maxTotal: num(values["max-total"], "max-total", 400),
    });
    plan.name = (values.name as string | undefined) ?? (values.role ? `baseline-${role}` : "baseline");
    const rel = `data/plans/${plan.name}.json`;
    writeJson(path.join(ctx.runDir, rel), plan);
    const byTag: Record<string, number> = {};
    for (const p of plan.probes) for (const t of p.tags ?? []) byTag[t] = (byTag[t] ?? 0) + 1;
    emit({ plan_file: path.join(ctx.runDir, rel), name: plan.name, run_as: role, probes: plan.probes.length, by_tag: byTag, needs_variables: [...new Set(plan.probes.flatMap((p) => p.needs ?? []))], excluded_possible_side_effects: excluded, next: "Edit the plan (add business-rule probes, set vars, remove unsafe ones), then: api run --plan <plan_file>" });
    return 0;
  }
  if (sub === "run") {
    const { values } = opts(rest, { run: { type: "string" }, plan: { type: "string" }, "read-only": { type: "boolean", default: false }, "slow-ms": { type: "string" } });
    const ctx = loadRunContext(home, values.run as string | undefined);
    if (!values.plan) throw new UsageError("--plan <file> is required");
    const base = ctx.config.api.base_url;
    if (!base) throw new UsageError("api.base_url is not set in .qa/config.md");
    const given = values.plan as string;
    const byName = path.join(ctx.runDir, "data", "plans", `${given.replace(/\.json$/, "")}.json`);
    const planFile = exists(path.resolve(given)) ? path.resolve(given) : exists(byName) ? byName : undefined;
    if (!planFile) throw new UsageError(`No plan "${given}": pass a file path, or the name of a plan in ${path.join(ctx.runDir, "data", "plans")}.`);
    const plan = readJson<Plan>(planFile) as Plan;
    const result = await runPlan(plan, {
      baseUrl: base,
      policy: ctx.policy,
      roles: ctx.roles,
      ...(ctx.config.api.login ? { login: ctx.config.api.login } : {}),
      ...(readInventory(ctx) ? { inventory: readInventory(ctx) as Inventory } : {}),
      runDir: ctx.runDir,
      readOnly: values["read-only"] as boolean,
      ...(ctx.marker.budget?.deadline ? { deadlineMs: Date.parse(ctx.marker.budget.deadline) } : {}),
      privacy: contextFrom(ctx.config, ctx.roles.map((r) => r.username)),
      ...(values["slow-ms"] ? { slowMs: num(values["slow-ms"], "slow-ms", 3000) } : {}),
    });
    const flagged = result.results.filter((r) => !r.skipped && (r.signals.length || r.expectation_failures.length));
    const skipped: Record<string, number> = {};
    for (const r of result.results) if (r.skipped) skipped[r.skipped] = (skipped[r.skipped] ?? 0) + 1;
    emit({
      summary: result.summary,
      flagged: flagged.slice(0, 120).map((r) => ({ id: r.id, title: r.title, role: r.role, statuses: r.statuses, signals: r.signals, expectation_failures: r.expectation_failures, reproduced: r.reproduced, evidence: r.evidence })),
      flagged_not_shown: Math.max(0, flagged.length - 120),
      skipped,
      matrix: result.matrix,
      note: "Each flagged item was re-run once. 'reproduced.times' of 2 tells you whether it repeated. Judge each signal against the spec and the business rules before calling it a finding.",
    });
    return 0;
  }
  throw new UsageError("api needs a subcommand: inventory | plan | run");
}

async function cmdReport(sub: string | undefined, rest: string[], home: string): Promise<number> {
  const { values } = opts(rest, { run: { type: "string" }, "no-images": { type: "boolean", default: false }, out: { type: "string" } });
  const ctx = loadRunContext(home, values.run as string | undefined);
  if (sub === "build") {
    const r = writeReports(ctx.runDir, ctx.marker.store, {
      mode: ctx.marker.mode,
      runId: ctx.marker.run_id,
      roles: ctx.config.roles.map((x) => x.name),
      uiUrls: Object.fromEntries(ctx.config.web_uis.map((u) => [u.name, u.url])),
      refreshChanges: true,
    });
    emit({
      technical_report: path.join(ctx.runDir, "TECHNICAL-REPORT.md"),
      admin_report: path.join(ctx.runDir, "ADMIN-REPORT.md"),
      verdict: r.model.verdict.line,
      findings: r.data.findings.map((f) => `${f.id} ${f.severity}: ${f.title}`),
      unconfirmed: r.data.unconfirmed.length,
      charters: r.data.charters.length,
      next: "Run `report lint`: it checks the evidence rules, that every finding has plain-language text, and that the two reports agree.",
    });
    return 0;
  }
  if (sub === "lint") {
    // Deliberately does not rebuild: it checks the reports as they are on disk, so a hand edit or a stale file is caught.
    const result = lintReports(ctx.runDir, ctx.passwords, ctx.marker.store);
    const { consistency: _c, ...printable } = result;
    emit(printable);
    return result.ok ? 0 : 1;
  }
  if (sub === "check") {
    const result = checkConsistency(ctx.runDir);
    emit(result);
    return result.ok ? 0 : 1;
  }
  if (sub === "export-html") {
    const r = exportAdminHtml(ctx.runDir, ctx.marker.store, { embedImages: !values["no-images"], ...(values.out ? { out: values.out as string } : {}) });
    emit(r);
    return 0;
  }
  throw new UsageError("report needs a subcommand: build | lint | check | export-html");
}

async function cmdMemory(sub: string | undefined, rest: string[], home: string): Promise<number> {
  if (sub === "where") {
    const { values } = opts(rest, { project: { type: "string" } });
    const info = resolveProject(path.resolve((values.project as string | undefined) ?? process.cwd()));
    const { store } = ensureProjectStore(home, info);
    emit({ project_id: info.id, id_source: info.idSource, store });
    return 0;
  }
  if (sub === "review" || sub === "stats" || sub === "prune") {
    const { values } = opts(rest, { project: { type: "string" }, learning: { type: "string" }, "false-alarm": { type: "string" }, risk: { type: "string" }, reason: { type: "string" } });
    const scope = projectScope(home, { ...(values.project ? { project: values.project as string } : {}) });
    if (sub === "review") emit(reviewOverview(scope));
    else if (sub === "stats") emit(memoryStats(scope));
    else {
      const target = { ...(values.learning ? { learning: values.learning as string } : {}), ...(values["false-alarm"] ? { falseAlarm: values["false-alarm"] as string } : {}), ...(values.risk ? { risk: values.risk as string } : {}) };
      emit(pruneMemory(scope, target, values.reason as string | undefined));
    }
    return 0;
  }
  const { values } = opts(rest, {
    run: { type: "string" }, type: { type: "string" }, area: { type: "string" }, text: { type: "string" }, confidence: { type: "string" },
    confirms: { type: "string" }, contradicts: { type: "string" }, ids: { type: "string" }, symptom: { type: "string" }, reason: { type: "string" },
    source: { type: "string" }, what: { type: "string" },
  });
  const scope = runScope(home, values.run as string | undefined);
  if (sub === "context") {
    emit(getContext(scope));
    return 0;
  }
  if (sub === "learn") {
    if (values.confirms || values.contradicts) {
      emit(changeLearningConfidence(scope, (values.confirms ?? values.contradicts) as string, values.confirms ? "confirm" : "contradict"));
      return 0;
    }
    const type = values.type as LearningType | undefined;
    if (!type || !values.area || !values.text) throw new UsageError(`memory learn needs --type (${LEARNING_TYPES.join("|")}), --area and --text (or --confirms/--contradicts <id>)`);
    emit(saveLearning(scope, { type, area: values.area as string, text: values.text as string, ...(values.confidence ? { confidence: num(values.confidence, "confidence", 5) } : {}) }));
    return 0;
  }
  if (sub === "applied") {
    const ids = String(values.ids ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (ids.length === 0) throw new UsageError("memory applied needs --ids L-001,FA-002 (learnings you used, false alarms you skipped)");
    emit(recordApplied(scope, ids));
    return 0;
  }
  if (sub === "false-alarm") {
    if (!values.area || !values.symptom || !values.reason) throw new UsageError("memory false-alarm needs --area, --symptom (what was seen) and --reason (why it is not a bug)");
    const source = (values.source ?? "reproduction") as FalseAlarmSource;
    if (!["owner", "reproduction", "spec"].includes(source)) throw new UsageError("--source must be owner, reproduction or spec");
    emit(markFalseAlarm(scope, { area: values.area as string, symptom: values.symptom as string, reason: values.reason as string, source }));
    return 0;
  }
  if (sub === "show") {
    const what = values.what as string | undefined;
    if (what !== "learnings" && what !== "false-alarms" && what !== "risk" && what !== "map") throw new UsageError("memory show needs --what learnings|false-alarms|risk|map");
    emit(listMemory(scope, what, 1000));
    return 0;
  }
  throw new UsageError("memory needs a subcommand: context | learn | applied | false-alarm | show | where | review | stats | prune");
}

function cmdLessons(sub: string | undefined, rest: string[], home: string): number {
  const { values, positionals } = opts(rest, { project: { type: "string" }, text: { type: "string" }, reason: { type: "string" } });
  if (sub === "list") {
    let names: string[] = [];
    try {
      names = projectNamesOf(projectScope(home, { ...(values.project ? { project: values.project as string } : {}) }));
    } catch {
      /* not inside a project: "loaded here" is checked without a project's own names */
    }
    emit(lessonOverview(home, { projectNames: names }));
    return 0;
  }
  const id = positionals[0];
  if ((sub === "approve" || sub === "reject") && !id) throw new UsageError(`lessons ${sub} needs a lesson id (see \`lessons list\`)`);
  if (sub === "approve") {
    emit(approveLesson(home, id as string, values.text ? { text: values.text as string } : {}));
    return 0;
  }
  if (sub === "reject") {
    emit(rejectLesson(home, id as string, values.reason as string | undefined));
    return 0;
  }
  throw new UsageError("lessons needs a subcommand: list | approve | reject");
}

function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseHookInput<T>(raw: string): T | undefined {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as T) : undefined;
  } catch {
    return undefined; // not our input: no decision
  }
}

async function cmdHook(sub: string | undefined, rest: string[], home: string): Promise<number> {
  if (sub === "stop" || sub === "user-prompt-submit") {
    // Auto-QA hooks never fail the host's turn: any error, even a flag we do not know, is a silent "no opinion" (exit 0, nothing printed).
    let hostConfig: string | undefined;
    try {
      hostConfig = (parseArgs({ args: rest, options: { "host-config": { type: "string" } }, strict: false }).values["host-config"] as string | undefined) ?? undefined;
    } catch {
      /* the flag is optional */
    }
    const raw = parseHookInput<Record<string, unknown>>(readStdin());
    if (!raw) return 0;
    const cfg = readHostAutoConfig(hostConfig);
    const h: HookEnv = { home, env: process.env, now: new Date(), ...(cfg.invoke ? { invoke: cfg.invoke } : {}) };
    if (sub === "user-prompt-submit") {
      safely(() => onPrompt(mapPromptInput(raw, cfg.io), h));
      return 0;
    }
    const stopInput = mapStopInput(raw, cfg.io);
    if (!stopInput) return 0;
    const decision = safely(() => onStop(stopInput, h));
    const out = renderStopOutput(decision?.output, cfg.io);
    if (out) process.stdout.write(JSON.stringify(out) + "\n");
    if (decision && process.env["QAMIND_DEBUG"]) process.stderr.write(`qamind auto-QA: ${decision.action} (rule ${decision.rule}): ${decision.why}\n`);
    return 0;
  }
  if (sub !== "pre-tool-use") throw new UsageError("hook needs a subcommand: pre-tool-use, stop or user-prompt-submit");
  const raw = readStdin();
  let input: PreToolUseInput & { scratchpad_dir?: string };
  try {
    input = JSON.parse(raw) as PreToolUseInput & { scratchpad_dir?: string };
  } catch {
    return 0; // not our input: no decision
  }
  if (input.tool_name === "Skill") {
    // The only thing this hook does for the Skill tool: approve the one call that answers an auto-QA block.
    const reason = safely(() => approveAutoSkill(input, { home, env: process.env, now: new Date() }));
    if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: reason } }) + "\n");
    return 0;
  }
  const tmp = [os.tmpdir(), input.scratchpad_dir].filter((p): p is string => !!p);
  const decision = decidePreToolUse(input, home, tmp);
  if (decision) process.stdout.write(JSON.stringify(toHookOutput(decision)) + "\n");
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, sub, ...rest] = argv;
  const home = qamindHome();
  try {
    switch (cmd) {
      case "run":
        return await cmdRun(sub, rest, home);
      case "config": {
        const { values } = opts(rest, { project: { type: "string" } });
        const root = path.resolve((values.project as string | undefined) ?? process.cwd());
        if (!exists(path.join(root, ".qa", "config.md"))) throw new UsageError(`No .qa/config.md in ${root}. Run \`run start\` to create it.`);
        const check = checkConfigFile(root);
        const { config: _c, body: _b, ...printable } = check;
        emit(printable);
        return check.status === "ok" ? 0 : 4;
      }
      case "health": {
        const { values } = opts(sub ? [sub, ...rest] : rest, { run: { type: "string" } });
        const ctx = loadRunContext(home, values.run as string | undefined);
        ensureDir(path.join(ctx.runDir, "data"));
        const { health: result } = await healthWithPrep({ config: ctx.config, policy: ctx.policy, roles: ctx.roles, projectRoot: ctx.projectRoot, runDir: ctx.runDir, mode: ctx.marker.mode, redact: makeRedactor(ctx.passwords).text });
        writeJson(path.join(ctx.runDir, "data", "health.json"), result);
        emit(result);
        return result.environment_ok ? 0 : 7;
      }
      case "api":
        return await cmdApi(sub, rest, home);
      case "report":
        return await cmdReport(sub, rest, home);
      case "memory":
        return await cmdMemory(sub, rest, home);
      case "privacy": {
        if (sub !== "scan" && sub !== "mask") throw new UsageError("privacy needs a subcommand: scan | mask");
        const { values } = opts(rest, { run: { type: "string" } });
        const ctx = loadRunContext(home, values.run as string | undefined);
        const pc = contextForRun(ctx.runDir);
        if (sub === "scan") {
          const r = scanRun(ctx.runDir, pc);
          emit(r);
          return r.ok ? 0 : 1;
        }
        const done = maskRun(ctx.runDir, pc);
        emit({ ...done, message: done.total === 0 ? "Nothing needed masking." : `Masked ${done.total} item(s) in ${done.files_changed.length} file(s). Rebuild the reports (report build, report lint) before finishing.` });
        return 0;
      }
      case "budget": {
        if (sub !== "status") throw new UsageError("budget needs a subcommand: status");
        const { values } = opts(rest, { run: { type: "string" } });
        const ctx = loadRunContext(home, values.run as string | undefined);
        emit(budgetStatus(ctx.marker.budget, ctx.marker.started, new Date()));
        return 0;
      }
      case "lessons":
        return cmdLessons(sub, rest, home);
      case "setup":
      case "status":
      case "update":
      case "uninstall":
        throw new UsageError(`"${cmd}" installs and manages QAMind for your coding tools and runs from a QAMind checkout: use \`./setup\` in the checkout, or the \`qamind\` command that setup put on your PATH. (This copy of \`qamind\` is the runtime one, started by a plugin or an MCP server.)`);
      case "guard": {
        if (sub !== "log") throw new UsageError("guard needs a subcommand: log");
        const { values } = opts(rest, { run: { type: "string" } });
        const ctx = loadRunContext(home, values.run as string | undefined);
        const entries = readBlocked(ctx.marker.store, ctx.marker.run_id);
        const byOrigin: Record<string, { count: number; reason: string }> = {};
        for (const e of entries) {
          let origin = e.url;
          try {
            origin = new URL(e.url).origin;
          } catch {
            /* keep raw */
          }
          byOrigin[origin] = { count: (byOrigin[origin]?.count ?? 0) + 1, reason: e.reason };
        }
        emit({ blocked_origins: byOrigin, note: "If a blocked origin is a legitimate asset host (CDN, fonts, login provider), add it to security.allowed_extra_origins in .qa/config.md; never add production." });
        return 0;
      }
      case "browser-mcp":
        return await runBrowserLauncher();
      case "auto": {
        const out = autoCommand(sub ? [sub, ...rest] : rest, { home, env: process.env, now: new Date() }, process.cwd());
        if (typeof out["help"] === "string") process.stdout.write(out["help"]);
        else emit(out);
        return 0;
      }
      case "hook":
        return await cmdHook(sub, rest, home);
      case "version":
      case "--version":
        emit({ qamind: QAMIND_VERSION, knowledge: KNOWLEDGE_VERSION, node: process.version });
        return 0;
      case undefined:
      case "help":
      case "--help":
        process.stdout.write(HELP);
        return 0;
      default:
        throw new UsageError(`Unknown command "${cmd}".`);
    }
  } catch (err) {
    if (err instanceof AutoUsageError) {
      process.stderr.write(`qamind: ${err.message}\n`);
      emit({ error: err.message, kind: "usage" });
      return 2;
    }
    if (err instanceof UsageError) {
      process.stderr.write(`qamind: ${err.message}\n\n${HELP}`);
      emit({ error: err.message, kind: "usage" });
      return 2;
    }
    process.stderr.write(`qamind: ${(err as Error).message}\n`);
    emit({ error: (err as Error).message });
    return 1;
  }
}
