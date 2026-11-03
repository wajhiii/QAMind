import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { cmdBaseline, cmdBrowsers, cmdMail, cmdPerf, cmdSweep, cmdTicket } from "./coverage.ts";
import { cmdEscaped, cmdMetrics } from "./metrics.ts";
import { emit, num, opts, UsageError } from "./util.ts";
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
import { CI_MODES, checkConfigFile as checkCfg } from "../../core/lib/config.ts";
import type { CiMode } from "../../core/lib/config.ts";
import { loadHeadless } from "../../core/lib/ci/host.ts";
import { runCi } from "../../core/lib/ci/run.ts";
import { PLACEHOLDER_REPO, cronLine, describeCron, githubNightlyWorkflow, githubPrWorkflow, gitlabCi, loginVarsOf, qamindOrigin, validCron, windowsTask } from "../../core/lib/ci/templates.ts";
import type { TemplateInput } from "../../core/lib/ci/templates.ts";
import { bankContextStandalone, bankStatus, exportTests, runBankForRun, saveBankTestFromFile } from "../../core/lib/bank/service.ts";
import { retireTest, setQuarantine } from "../../core/lib/bank/bank.ts";
import { runBank } from "../../core/lib/bank/runner.ts";
import { loadBugs, summariseBugs } from "../../core/lib/memory/bugs.ts";
import { VERDICTS, addFeedback, feedbackStats, importAdminFeedback, loadFeedback, parseVerdict } from "../../core/lib/memory/feedback.ts";
import type { Verdict } from "../../core/lib/memory/feedback.ts";
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
import { withStoreLock } from "../../core/lib/memory/lock.ts";
import { changeLearningConfidence, defaultProjectDir, finishRunAndRestore, getContext, listMemory, markFalseAlarm, projectNamesOf, projectScope, recordApplied, runScope, saveLearning } from "../../core/lib/memory/service.ts";
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
/** Who is speaking: the name the person gave, else the project's git user, else the account name. Feedback always says who. */
function whoAmI(given: unknown, root: string): string {
  if (typeof given === "string" && given.trim()) return given.trim();
  try {
    const n = execFileSync("git", ["-C", root, "config", "user.name"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (n) return n;
  } catch {
    /* no git, or no user.name */
  }
  return os.userInfo().username;
}

function cmdFeedback(sub: string | undefined, rest: string[], home: string): number {
  const { values, positionals } = opts(rest, { project: { type: "string" }, note: { type: "string" }, by: { type: "string" }, run: { type: "string" } });
  const scope = projectScope(home, { ...(values.project ? { project: values.project as string } : {}) });
  if (sub === "add") {
    const [target, rawVerdict, ...more] = positionals;
    if (!target || !rawVerdict) throw new UsageError(`feedback add needs a finding or bug and a verdict: feedback add ISSUE-003 not-a-bug --note "why". Verdicts: ${VERDICTS.join(", ")} (wrong-severity <level>, duplicate-of <ISSUE-nnn|BUG-nnn>)`);
    const parsed = parseVerdict([rawVerdict, ...more].join(" "));
    if (!parsed || !(VERDICTS as readonly string[]).includes(parsed.verdict)) throw new UsageError(`"${rawVerdict}" is not a verdict. Use one of: ${VERDICTS.join(", ")}.`);
    const note = (values.note as string | undefined) ?? parsed.note;
    const r = addFeedback(scope.store, { target, verdict: parsed.verdict as Verdict, ...(parsed.value ? { value: parsed.value } : {}), ...(note ? { note } : {}), by: whoAmI(values.by, scope.project.root), ...(values.run ? { run: values.run as string } : {}) });
    emit({ feedback: r.record.id, bug: r.record.bug, verdict: r.record.verdict, by: r.record.by, effects: r.effects, ...(r.warnings.length ? { warnings: r.warnings } : {}) });
    return 0;
  }
  if (sub === "import") {
    if (!values.run) throw new UsageError("feedback import needs --run ID (the run whose ADMIN-REPORT.md people wrote in)");
    const runDir = path.join(scope.project.root, ".qa", "reports", values.run as string);
    emit({ run: values.run, lines: importAdminFeedback(scope.store, runDir, whoAmI(values.by, scope.project.root)).map((l) => ({ issue: l.issue, text: l.text, ...(l.applied ? { applied: l.applied.verdict, effects: l.effects } : {}), ...(l.problem ? { not_applied: l.problem } : {}) })) });
    return 0;
  }
  if (sub === "list") {
    const all = loadFeedback(scope.store);
    emit({ feedback: all.records.slice(-50).map((r) => ({ id: r.id, bug: r.bug, issue: r.issue, run: r.run, verdict: r.verdict, ...(r.level ? { level: r.level } : {}), ...(r.duplicate_of ? { duplicate_of: r.duplicate_of } : {}), by: r.by, at: r.at.slice(0, 10), ...(r.note ? { note: r.note } : {}) })), stats: feedbackStats(scope.store), warnings: all.warnings });
    return 0;
  }
  if (sub === "stats") {
    emit(feedbackStats(scope.store));
    return 0;
  }
  throw new UsageError("feedback needs a subcommand: add | import | list | stats");
}

function cmdBugs(sub: string | undefined, rest: string[], home: string): number {
  const { values } = opts(rest, { project: { type: "string" }, status: { type: "string" } });
  if (sub !== "list") throw new UsageError("bugs needs a subcommand: list [--status open|fixed|accepted|all]");
  const scope = projectScope(home, { ...(values.project ? { project: values.project as string } : {}) });
  const loaded = loadBugs(scope.store);
  const want = (values.status as string | undefined) ?? "open";
  const pick = want === "all" ? loaded.bugs : want === "open" ? loaded.bugs.filter((b) => ["new", "still-open", "regressed"].includes(b.status)) : loaded.bugs.filter((b) => b.status === want || (want === "fixed" && b.status === "fixed"));
  emit({ summary: summariseBugs(loaded.bugs), bugs: pick.slice(0, 100).map((b) => ({ id: b.id, status: b.status, severity: b.severity_override?.level ?? b.severity, area: b.area, title: b.title, times_seen: b.times_seen, first_seen: b.first_seen.at.slice(0, 10), last_seen: b.last_seen.at.slice(0, 10), ...(b.duplicate_of ? { duplicate_of: b.duplicate_of } : {}) })), warnings: loaded.warnings });
  return 0;
}

async function cmdTests(sub: string | undefined, rest: string[], home: string): Promise<number> {
  const { values, positionals } = opts(rest, {
    project: { type: "string" },
    run: { type: "string" },
    only: { type: "string" },
    area: { type: "string" },
    "include-quarantined": { type: "boolean", default: false },
    file: { type: "string" },
    ids: { type: "string" },
    dir: { type: "string" },
    yes: { type: "boolean", default: false },
    reason: { type: "string" },
    by: { type: "string" },
  });
  const projectOpt = values.project ? { project: values.project as string } : {};
  if (sub === "status" || sub === "prune") {
    const scope = projectScope(home, projectOpt);
    const st = bankStatus(scope.store);
    emit(sub === "prune" ? { prune_candidates: st.prune_candidates, note: "These look stale. Nothing is retired by looking: the owner decides, then `tests retire ID --reason ...`.", summary: st.summary } : st);
    return 0;
  }
  if (sub === "run") {
    const only = values.only ? (values.only as string).split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const runOpts = { ...(only ? { only } : {}), ...(values.area ? { area: values.area as string } : {}), includeQuarantined: values["include-quarantined"] as boolean };
    let results;
    let where: string;
    if (values.run) {
      results = await runBankForRun(runScope(home, values.run as string), runOpts);
      where = "data/bank-results.json in the run folder";
    } else {
      const ctx = bankContextStandalone(home, (values.project as string | undefined) ?? defaultProjectDir(), new Date());
      results = await runBank(ctx, runOpts);
      where = path.join(path.relative(process.cwd(), ctx.outDir), "data", "bank-results.json");
    }
    const bad = results.results.filter((r) => r.status === "failed" || r.status === "skipped" || r.status === "flaky-passed" || r.status === "quarantined");
    emit({
      summary: { total: results.total, passed: results.passed, flaky_passed: results.flaky, failed: results.failed, quarantined: results.quarantined, skipped: results.skipped, ...(results.budget_reached ? { budget_reached: true } : {}) },
      covered_areas: results.covered_areas,
      needs_attention: bad.map((r) => ({ test: r.test, title: r.title, area: r.area, bug: r.bug, status: r.status, detail: r.detail })),
      saved_to: where,
      note: results.failed
        ? "Each failed test failed twice. Reproduce it, then report it as a finding with \"bank_tests\": [\"T-001\"], or, if the test itself is out of date, retire it. A passing test is a check you do not need to repeat by hand: spend your time on areas the bank does not cover."
        : "Nothing failed. Spend your time on areas the bank does not cover (covered_areas) and on what is new or changed.",
    });
    return results.failed ? 1 : 0;
  }
  if (sub === "save") {
    if (!values.run || !values.file) throw new UsageError("tests save needs --run ID and --file test.json (the test as JSON: kind, title, area, card, plan or ui+steps)");
    const r = saveBankTestFromFile(runScope(home, values.run as string), values.file as string, { anywhere: true });
    emit({ action: r.action, ...(r.test ? { id: r.test.id } : {}), ...(r.existing ? { existing: r.existing } : {}), message: r.message, ...(r.warnings.length ? { warnings: r.warnings } : {}) });
    return r.action === "duplicate" ? 1 : 0;
  }
  if (sub === "export") {
    const ids = values.ids ? (values.ids as string).split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const r = exportTests(home, values.project as string | undefined, { ...(ids ? { ids } : {}), ...(values.dir ? { dir: values.dir as string } : {}), confirmed: values.yes as boolean });
    emit({ dir: r.dir, written: r.written, files: r.files, skipped_existing: r.skipped_existing, note: r.written ? "Written. Review the files like any other test; run them with Playwright Test with the login variables set." : "Preview only: nothing was written. Writing into the project needs the user's go-ahead: run again with --yes." });
    return 0;
  }
  if (sub === "retire" || sub === "quarantine" || sub === "unquarantine") {
    const id = positionals[0];
    if (!id) throw new UsageError(`tests ${sub} needs a test id (see \`tests status\`)`);
    const scope = projectScope(home, projectOpt);
    const now = new Date();
    const t = withStoreLock(scope.store, () => (sub === "retire" ? retireTest(scope.store, id, (values.reason as string | undefined) ?? "", (values.by as string | undefined) ?? os.userInfo().username, now) : setQuarantine(scope.store, id, sub === "quarantine", values.reason as string | undefined, now)));
    emit({ id: t.id, status: t.status, title: t.title });
    return 0;
  }
  throw new UsageError("tests needs a subcommand: status | run | save | export | prune | retire | quarantine | unquarantine");
}

/** `qamind ci`, `qamind ci init`: the pull-request mode (spec 13.2) and the workflow files for it. */
async function cmdCi(sub: string | undefined, rest: string[]): Promise<number> {
  const init = sub === "init";
  const args = init ? rest : sub ? [sub, ...rest] : rest;
  const { values } = opts(args, {
    project: { type: "string" },
    mode: { type: "string" },
    ticket: { type: "string" },
    out: { type: "string" },
    "agent-command": { type: "string" },
    model: { type: "string" },
    home: { type: "string" },
    "user-store": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    "from-run": { type: "string" },
    provider: { type: "string" },
    ref: { type: "string" },
    "repo-url": { type: "string" },
    host: { type: "string", default: "claude" },
    "host-spec": { type: "string" },
    write: { type: "boolean", default: false },
  });
  const root = path.resolve((values.project as string | undefined) ?? process.cwd());
  const mode = values.mode as string | undefined;
  if (mode === "ticket" && !values.ticket) throw new UsageError("ticket mode needs the ticket: --ticket FILE (a file in the project that says what to test).");
  if (values.ticket && mode !== undefined && mode !== "ticket") throw new UsageError("--ticket means ticket mode: leave --mode out, or use --mode ticket.");
  if (mode !== undefined && mode !== "ticket" && !(CI_MODES as readonly string[]).includes(mode)) throw new UsageError(`--mode must be one of ${CI_MODES.join(", ")}`);
  if (!init) {
    const result = await runCi({
      projectDir: root,
      env: process.env,
      ...(mode && mode !== "ticket" ? { mode: mode as CiMode } : {}),
      ...(values.ticket ? { ticket: values.ticket as string } : {}),
      ...(values.out ? { outDir: values.out as string } : {}),
      ...(values["agent-command"] ? { agentCommand: values["agent-command"] as string } : {}),
      host: values.host as string,
      ...(values["host-spec"] ? { hostSpec: path.resolve(values["host-spec"] as string) } : {}),
      ...(values.model ? { model: values.model as string } : {}),
      ...(values.home ? { home: path.resolve(values.home as string) } : {}),
      userStore: values["user-store"] as boolean,
      dryRun: values["dry-run"] as boolean,
      ...(values["from-run"] ? { fromRun: values["from-run"] as string } : {}),
      log: (line) => process.stderr.write(`${line}\n`),
    });
    emit({ outcome: result.outcome, exit_code: result.exit_code, mode: result.mode, ...(result.run_id ? { run_id: result.run_id } : {}), reasons: result.reasons, ...(result.error ? { error: result.error } : {}), comment: result.comment, status: result.status, ...(result.agent ? { agent: result.agent } : {}), warnings: result.warnings, out_dir: result.out_dir, store: result.store });
    return result.exit_code;
  }
  const provider = values.provider as string | undefined;
  if (provider !== "github" && provider !== "gitlab") throw new UsageError("ci init needs --provider github|gitlab");
  const check = checkCfg(root, process.env);
  if (!check.config) throw new UsageError(`The QAMind config is not usable (${check.status}); fix .qa/config.md first (run /qa-only once to create it), because the workflow names the config's test logins.`);
  const origin = qamindOrigin();
  let headless;
  try {
    headless = loadHeadless(values.host as string, values["host-spec"] as string | undefined);
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const input: TemplateInput = { ref: (values.ref as string | undefined) ?? origin.tag ?? "main", repoUrl: (values["repo-url"] as string | undefined) ?? origin.repoUrl ?? PLACEHOLDER_REPO, mode: (mode as CiMode | undefined) ?? check.config.ci.mode, loginVars: loginVarsOf(check.config), cacheMemory: check.config.ci.cache_memory, headless };
  const rel = provider === "github" ? ".github/workflows/qamind.yml" : fs.existsSync(path.join(root, ".gitlab-ci.yml")) ? ".gitlab/qamind.gitlab-ci.yml" : ".gitlab-ci.yml";
  return writeTemplate(root, rel, provider === "github" ? githubPrWorkflow(input) : gitlabCi(input), values.write as boolean, input, provider === "gitlab" && rel !== ".gitlab-ci.yml" ? ["There is already a .gitlab-ci.yml: add `include: .gitlab/qamind.gitlab-ci.yml` to it."] : []);
}

function templateNotes(root: string, input: TemplateInput): string[] {
  const notes: string[] = [];
  if (!(input.ref.startsWith("v") && /\d/.test(input.ref))) notes.push(`QAMIND_REF is "${input.ref}": there is no release tag of QAMind to pin to yet. Pin it to a release tag as soon as one exists (--ref vX.Y.Z), so CI only runs tested releases.`);
  if (input.repoUrl === PLACEHOLDER_REPO) notes.push("QAMIND_REPO is a placeholder: set it to the repository QAMind is cloned from (--repo-url).");
  try {
    execFileSync("git", ["-C", root, "check-ignore", "-q", ".qa/config.md"], { stdio: "ignore" });
    notes.push("`.qa/config.md` is git-ignored, so CI will not find it. Commit it (it holds URLs, flows and rules, never passwords): replace the `.qa/` line of .gitignore with `.qa/*` and `!.qa/config.md`.");
  } catch {
    /* not ignored, or not a repository */
  }
  notes.push(`Add these as secrets of the repository (values never go in the file): ${input.headless.auth_secret}, ${input.loginVars.join(", ")}.`);
  return notes;
}

function writeTemplate(root: string, rel: string, content: string, write: boolean, input: TemplateInput, extra: string[]): number {
  const file = path.join(root, rel);
  const exists = fs.existsSync(file);
  if (write && !exists) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, content, "utf8");
  }
  emit({ path: rel, written: write && !exists, ...(exists ? { exists: true, note: "The file exists and is never overwritten: move it aside, or copy from the preview." } : {}), notes: [...templateNotes(root, input), ...extra], ...(write && !exists ? {} : { content }) });
  return write && exists ? 1 : 0;
}

/** `qamind schedule` (spec 13.15): CI schedules first, local cron and Windows Task Scheduler as documented options. Report-only, under the budgets of the config. */
function cmdSchedule(sub: string | undefined, rest: string[]): number {
  const { values } = opts(sub ? [sub, ...rest] : rest, { project: { type: "string" }, provider: { type: "string" }, cron: { type: "string" }, time: { type: "string" }, mode: { type: "string" }, ref: { type: "string" }, "repo-url": { type: "string" }, host: { type: "string", default: "claude" }, "host-spec": { type: "string" }, write: { type: "boolean", default: false } });
  const provider = values.provider as string | undefined;
  if (!["github", "gitlab", "cron", "windows"].includes(provider ?? "")) throw new UsageError("schedule needs --provider github|gitlab|cron|windows");
  const root = path.resolve((values.project as string | undefined) ?? process.cwd());
  const mode = ((values.mode as string | undefined) ?? "full") as string;
  if (!(CI_MODES as readonly string[]).includes(mode)) throw new UsageError(`--mode must be one of ${CI_MODES.join(", ")}`);
  const cron = (values.cron as string | undefined) ?? "0 2 * * *";
  if (!validCron(cron)) throw new UsageError(`--cron "${cron}" is not a five-field cron expression (minute hour day month weekday), for example "0 2 * * *".`);
  const time = (values.time as string | undefined) ?? (/^\d+ \d+ \* \* \*$/.test(cron) ? `${String(cron.split(" ")[1]).padStart(2, "0")}:${String(cron.split(" ")[0]).padStart(2, "0")}` : "02:00");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new UsageError("--time must be HH:MM (24 hours).");
  if (provider === "cron") {
    emit({ provider, schedule: describeCron(cron), crontab_line: cronLine({ cron, mode: mode as CiMode, projectDir: root }), how: "Add the line with `crontab -e`. It runs from the project folder with your own QAMind store (your memory and test bank), report-only; the output goes to ~/.qamind/ci.log and the reports to qamind-reports/ in the project. QAMind never edits your crontab." });
    return 0;
  }
  if (provider === "windows") {
    emit({ provider, schedule: `daily at ${time}`, command: windowsTask({ time, mode: mode as CiMode, projectDir: root }), how: "Run the command once in a Command Prompt. It creates a task that runs `qamind ci` from the project folder with your own QAMind store, report-only. Remove it with `schtasks /Delete /TN \"QAMind nightly\"`. Not tested on Windows." });
    return 0;
  }
  const check = checkCfg(root, process.env);
  if (!check.config) throw new UsageError(`The QAMind config is not usable (${check.status}); fix .qa/config.md first.`);
  const origin = qamindOrigin();
  let headless;
  try {
    headless = loadHeadless(values.host as string, values["host-spec"] as string | undefined);
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const input: TemplateInput = { ref: (values.ref as string | undefined) ?? origin.tag ?? "main", repoUrl: (values["repo-url"] as string | undefined) ?? origin.repoUrl ?? PLACEHOLDER_REPO, mode: mode as CiMode, loginVars: loginVarsOf(check.config), cacheMemory: check.config.ci.cache_memory, headless, cron };
  if (provider === "gitlab") {
    emit({ provider, schedule: describeCron(cron), steps: ["Run `qamind ci init --provider gitlab --write` (the generated job already runs in schedules).", `In GitLab open CI/CD > Schedules > New schedule, enter the interval pattern \`${cron}\`, pick the default branch, and add the variable QAMIND_MODE=${mode}.`, "GitLab keeps pipeline schedules in its settings, not in a file, so there is nothing for QAMind to write."], notes: templateNotes(root, input) });
    return 0;
  }
  return writeTemplate(root, ".github/workflows/qamind-nightly.yml", githubNightlyWorkflow(input), values.write as boolean, input, [`GitHub runs this schedule from the default branch only, in UTC (${describeCron(cron)}); a workflow in a repository with no activity for 60 days may be paused by GitHub.`]);
}

const HELP = `qamind ${QAMIND_VERSION}: Senior QA Engineer agent runtime

Run lifecycle
  run start   [--mode full|quick|regression|diff|ticket] [--ticket ID|URL|FILE|"pasted text"] [--focus TEXT] [--session ID] [--project DIR]
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
  ci [--mode diff|quick|regression|full | --ticket FILE] [--host claude] [--agent-command CMD] [--out DIR] [--dry-run] [--user-store] [--from-run ID]
                               test a pull request headlessly, report-only: one comment kept up to date, a status, an exit code (0 pass or warn, 1 fail, 2 could not run)
  ci init --provider github|gitlab [--ref vX.Y.Z] [--repo-url URL] [--write]   the workflow file (preview without --write; never overwrites)
  schedule --provider github|gitlab|cron|windows [--cron "0 2 * * *"] [--mode full] [--write]   nightly runs
  tests status | prune         the test bank: what it holds and how each test did; stale tests it suggests retiring
  tests run [--run ID] [--only T-001,T-002] [--area A] [--include-quarantined]
                               run the bank (in a QA run: first, before exploring; otherwise on its own). Exit 1 if a test failed twice
  tests save --run ID --file test.json     save a check worth keeping (a value card is required)
  tests export [--ids T-001,T-002] [--dir D] [--yes]   write Playwright versions into the project's test folder (preview without --yes)
  tests retire ID --reason TEXT | quarantine ID --reason TEXT | unquarantine ID   the owner's decisions about a test
  feedback add ISSUE-003|BUG-002 not-a-bug|confirmed|wont-fix|fixed|good-catch|wrong-severity LEVEL|duplicate-of ID [--note TEXT] [--by NAME] [--run ID]
                               a person's verdict on a finding; a QA run cannot give one
  feedback import --run ID [--by NAME]   read the "Your feedback" lines people filled in ADMIN-REPORT.md
  feedback list | stats        what people said, and the share of findings they judged real
  bugs list [--status open|fixed|accepted|all]   the project's bugs across runs
  sweep check --run ID         check data/sweep-pages.json (the key pages, per role) against the config and show the browsers and screen sizes this mode covers
  sweep run --run ID [--browsers chromium,webkit] [--viewports mobile] [--pages id,id]
                               visit the key pages in each browser and screen size: audit leads, load time, a screenshot compared with its baseline (data/sweep.json)
  perf check --run ID | perf api --run ID   time a few read-only calls to the endpoints in data/perf-endpoints.json against the budget and the recent runs (data/perf-api.json)
  escaped add --area A --title T [--severity S] [--source manual|sentry|ticket|other] [--ref ID] [--note TEXT]   a bug that reached production: matched to what the runs said about its area, and the area's risk is raised (the owner's)
  escaped list                 the bugs that escaped, and what the runs had said about each area
  metrics [--project DIR]      how the agent is doing: the last runs, precision, escaped bugs, the trend once there are six runs
  ticket check --run ID | ticket status --run ID   ticket mode: check the criteria written to data/ticket.json (derived ones need the person's confirmation), then see which criteria have a result
  mail status | mail wait --run ID --to ADDRESS [--flow TEXT] [--kind transactional|notification|marketing|invitation] [--language ur] [--subject-contains T] [--timeout-s N]
                               read the email the product sent from the sandbox (mail.catcher) and check recipient, placeholders, links, unsubscribe, language; nothing is sent
  sms status | sms wait --run ID --to NUMBER [--flow TEXT]   the same for a text message (sms.catcher)
  baseline accept --run ID [--pages a,b]   the owner's decision: this run's pictures become the baseline for later runs
  baseline status              the pictures that are baselines now
  browsers status | install chromium|firefox|webkit   which browsers QAMind's own checks can start; install one (owner action, about 80 MB)
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
      ticket: { type: "string" },
    });
    const mode = (values.ticket && values.mode === "full" ? "ticket" : values.mode) as Mode;
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
      ...(values.ticket ? { ticket: values.ticket as string } : {}),
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
      case "ci":
        return await cmdCi(sub, rest);
      case "schedule":
        return cmdSchedule(sub, rest);
      case "tests":
        return await cmdTests(sub, rest, home);
      case "sweep":
        return await cmdSweep(sub, rest, home);
      case "baseline":
        return cmdBaseline(sub, rest, home);
      case "perf":
        return await cmdPerf(sub, rest, home);
      case "ticket":
        return cmdTicket(sub, rest, home);
      case "escaped":
        return cmdEscaped(sub, rest, home);
      case "metrics":
        return cmdMetrics(sub ? [sub, ...rest] : rest, home);
      case "mail":
        return await cmdMail("email", sub, rest, home);
      case "sms":
        return await cmdMail("sms", sub, rest, home);
      case "browsers":
        return cmdBrowsers(sub, rest);
      case "feedback":
        return cmdFeedback(sub, rest, home);
      case "bugs":
        return cmdBugs(sub, rest, home);
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
