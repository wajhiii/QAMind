import { z } from "zod";
import { SEVERITIES } from "../../lib/config.ts";
import { LEARNING_TYPES } from "../../lib/memory/learnings.ts";
import {
  changeLearningConfidence,
  defaultProjectDir,
  finishRunTracked,
  getContext,
  listMemory,
  markFalseAlarm,
  proposeGlobalLesson,
  recordApplied,
  runHistory,
  runScope,
  saveLearning,
  scopeFor,
  startRunTracked,
  updateProductMap,
  updateRisk,
} from "../../lib/memory/service.ts";
import { MODES } from "../../lib/run.ts";
import type { QaMemoryToolName } from "../servers.ts";

/** What a tool needs from its surroundings. Tests pass their own; the server uses the process's. */
export interface ToolContext {
  home: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
  now: () => Date;
}

export interface ToolDef {
  name: QaMemoryToolName;
  title: string;
  description: string;
  input: z.ZodRawShape;
  /** MCP tool annotations: hints for hosts about what a call can do. None of these tools reaches outside QAMind's own folders. */
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  run(args: Record<string, unknown>, ctx: ToolContext): unknown;
}

// ------------------------------------------------------------------------------------------------ shared field schemas

const NO_CONTROL = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/;

/** A one-line text field with hard limits. Control characters are refused (they have no place in memory files or Markdown). */
const line = (min: number, max: number, what: string) => {
  const chars = (n: number) => `${n} character${n === 1 ? "" : "s"}`;
  return z
    .string()
    .trim()
    .min(min, `${what} must be at least ${chars(min)}.`)
    .max(max, `${what} must be at most ${chars(max)}.`)
    .refine((v) => NO_CONTROL.test(v), `${what} contains control characters.`); // a refinement, so it does not bloat every tool's JSON schema
};

const run = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,80}$/, "The run id printed by run_start, for example run-20261030T105554Z.")
  .describe("The run id that run_start returned (run.id).");
const optionalRun = run.optional().describe("The run id from run_start. Omit it to read the project's memory outside a run.");
const project = line(1, 500, "project").optional().describe("Project folder. Omit it to use the folder the host opened.");
const severity = z.enum(SEVERITIES as unknown as [string, ...string[]]).describe("critical, important or minor.");

const page = z.object({
  ui: line(1, 80, "ui").optional().describe('The web UI\'s name as in the config, e.g. "Client Portal". Omit for the first UI.'),
  path: line(1, 300, "path").describe("The page's path or URL. Host, query string and fragment are dropped; ids are collapsed (/orders/123 becomes /orders/:id)."),
  title: line(1, 120, "title").optional().describe("The page's visible title or heading, in plain words. Never include personal data."),
  roles: z.array(line(1, 40, "role")).max(20).optional().describe("Config role names that saw this page."),
});

const endpoint = line(5, 220, "endpoint").describe('METHOD /path, for example "GET /orders/{id}".');

// ------------------------------------------------------------------------------------------------ tools

function define<S extends z.ZodRawShape>(def: Omit<ToolDef, "input" | "run"> & { input: S; run(args: z.infer<z.ZodObject<S>>, ctx: ToolContext): unknown }): ToolDef {
  return def as unknown as ToolDef;
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const ADD = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const SET = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const TOOLS: ToolDef[] = [
  define({
    name: "run_start",
    title: "Start a QA run",
    description:
      "Start a QA run for this project. This is the first call of every run. It checks the config and the URLs (production is refused), creates the run folder, and returns the run id and folder, the config summary (web UIs, roles, critical journeys), the detected stack, git changes and browser status. " +
      "If `status` is not `ready`, nothing was tested: follow `message` and the other fields it names (it may have just created `.qa/config.md`).",
    annotations: ADD,
    input: {
      mode: z.enum(MODES).default("full").describe("full, quick, regression or diff."),
      focus: line(1, 300, "focus").optional().describe("Free-text focus from the user."),
      session: line(1, 200, "session").optional().describe("The host's session id, so the safety hook can recognise this run."),
      project,
      kind: z.enum(["qa-only", "qa"]).default("qa-only"),
      trigger: z.enum(["manual", "auto", "ci"]).default("manual"),
      host: line(1, 40, "host").default("claude-code").describe("Which host runs this (claude-code, codex, cursor, generic)."),
      force: z.boolean().default(false).describe("Start even if another run for this project looks active (only if the user says it was abandoned)."),
    },
    run: (a, c) =>
      startRunTracked({
        cwd: defaultProjectDir(c.env, c.cwd),
        mode: a.mode,
        kind: a.kind,
        trigger: a.trigger,
        host: a.host,
        home: c.home,
        force: a.force,
        env: c.env,
        now: c.now(),
        ...(a.project ? { project: a.project } : {}),
        ...(a.focus ? { focus: a.focus } : {}),
        ...(a.session ? { sessionId: a.session } : {}),
      }),
  }),

  define({
    name: "run_finish",
    title: "Finish the QA run",
    description:
      "Finish the run: computes the run summary from the data files, updates the product map, risk areas and false-alarm counts, saves the run to history, re-renders both reports and ends the run (the safety guards stop applying). Call it once, last, after the reports lint clean. Returns the summary, including `memory_updated`.",
    annotations: SET,
    input: { run, stop_reason: line(1, 200, "stop_reason").optional().describe("completed, environment problem, stopped by the user, ..."), cost: line(1, 100, "cost").optional() },
    run: (a, c) => finishRunTracked(c.home, a.run, { ...(a.stop_reason ? { stopReason: a.stop_reason } : {}), ...(a.cost ? { cost: a.cost } : {}), now: c.now() }),
  }),

  define({
    name: "run_history",
    title: "Recent runs",
    description: "The most recent finished runs of this project, newest first: mode, date, counts by severity, key journeys tested, coverage, and why each stopped. Use it to compare with earlier runs.",
    annotations: READ,
    input: { run: optionalRun, project, limit: z.number().int().min(1).max(20).default(5), include_findings: z.boolean().default(false).describe("Also list each run's findings (id, severity, area, title). Larger output.") },
    run: (a, c) => runHistory(scopeFor(c.home, { env: c.env, cwd: c.cwd, ...(a.run ? { run: a.run } : {}), ...(a.project ? { project: a.project } : {}) }), a.limit, a.include_findings),
  }),

  define({
    name: "memory_get_context",
    title: "What memory knows",
    description:
      "Everything memory knows that should shape this run, bounded in size: what to focus on, risk areas (most likely to break again), learnings by type, known false alarms (do not report them again), the previous run's findings (for regression checks), a product-map summary, and any warnings about unreadable lines. Memory is leads, not proof: re-verify before relying on it.",
    annotations: READ,
    input: { run: optionalRun, project },
    run: (a, c) => getContext(scopeFor(c.home, { env: c.env, cwd: c.cwd, ...(a.run ? { run: a.run } : {}), ...(a.project ? { project: a.project } : {}) })),
  }),

  define({
    name: "memory_list",
    title: "List memory",
    description: "List one part of memory in full: all learnings, all false alarms, the scored risk areas, or the product map. For review and debugging; planning needs only memory_get_context.",
    annotations: READ,
    input: { what: z.enum(["learnings", "false-alarms", "risk", "map"]), run: optionalRun, project, limit: z.number().int().min(1).max(200).default(50).describe("At most this many entries per list.") },
    run: (a, c) => listMemory(scopeFor(c.home, { env: c.env, cwd: c.cwd, ...(a.run ? { run: a.run } : {}), ...(a.project ? { project: a.project } : {}) }), a.what, a.limit),
  }),

  define({
    name: "memory_save_learning",
    title: "Save a learning",
    description:
      `Save ONE atomic learning that will help the next run on this project (${LEARNING_TYPES.join(", ")}): something true that took effort to find out, such as a wait that is needed, an order of steps, a pitfall, or how the environment behaves. ` +
      "A near copy of an existing learning is merged into it (its confidence goes up) instead of being saved twice. Never include secrets, tokens, passwords or real people's data: the text is refused if it does. Do not save a bug here: bugs are findings.",
    annotations: ADD,
    input: {
      run,
      type: z.enum(LEARNING_TYPES),
      area: line(1, 120, "area").describe('A short label, e.g. "Orders / search".'),
      text: line(12, 400, "text").describe("One statement a future run can act on."),
      confidence: z.number().int().min(1).max(10).optional().describe("1 to 10; default 5."),
    },
    run: (a, c) => saveLearning(runScope(c.home, a.run, c.env), { type: a.type, area: a.area, text: a.text, ...(a.confidence ? { confidence: a.confidence } : {}) }, c.now()),
  }),

  define({
    name: "memory_adjust_learning",
    title: "Confirm or contradict a learning",
    description: "Say whether a learning from memory held true in this run. Confirming raises its confidence by 1; contradicting lowers it by 2, and below 3 it is archived (never deleted).",
    annotations: ADD,
    input: { run, id: z.string().regex(/^L-\d{3,}$/, "A learning id such as L-012.").describe("A learning id from memory_get_context."), direction: z.enum(["confirm", "contradict"]) },
    run: (a, c) => changeLearningConfidence(runScope(c.home, a.run, c.env), a.id, a.direction, c.now()),
  }),

  define({
    name: "memory_record_applied",
    title: "Record memory you used",
    description:
      "Record the learnings you applied and the known false alarms you skipped in this run, so the reports can cite them. Only ids that exist are accepted, and if any id does not exist nothing is recorded: never invent or guess an id.",
    annotations: SET,
    input: { run, ids: z.array(z.string().regex(/^(L|FA)-\d{3,}$/, "An id such as L-012 or FA-003.")).min(1).max(50).describe("Learning ids (L-...) and false-alarm ids (FA-...).") },
    run: (a, c) => recordApplied(runScope(c.home, a.run, c.env), [...new Set(a.ids)], c.now()),
  }),

  define({
    name: "memory_mark_false_alarm",
    title: "Record a false alarm",
    description:
      "Record something that looks like a bug but is NOT one (confirmed by the owner, by the spec, or because you reproduced the expected behaviour), so later runs do not report it again. Describe what was seen, in plain words, and why it is not a bug. A near copy of an existing false alarm is not saved twice.",
    annotations: ADD,
    input: {
      run,
      area: line(1, 120, "area"),
      symptom: line(12, 300, "symptom").describe("What was seen, in plain words (later findings are matched against this)."),
      reason: line(8, 300, "reason").describe("Why it is not a bug."),
      source: z.enum(["owner", "reproduction", "spec"]).default("reproduction").describe("Who established that it is not a bug."),
    },
    run: (a, c) => markFalseAlarm(runScope(c.home, a.run, c.env), { area: a.area, symptom: a.symptom, reason: a.reason, source: a.source }, c.now()),
  }),

  define({
    name: "memory_update_risk",
    title: "Flag a risky area",
    description:
      "Flag an area as risky for future runs when you have NO confirmed finding for it (a lead you could not reproduce twice, a fragile or slow feature). Confirmed findings are recorded as risk automatically by run_finish: do not call this for them. Flagging the same area again in the same run replaces the earlier flag.",
    annotations: SET,
    input: { run, area: line(1, 120, "area"), severity, surface: line(1, 60, "surface").optional().describe("api, a web UI's name, ..."), note: line(1, 200, "note").optional().describe("Why, in one sentence.") },
    run: (a, c) => updateRisk(runScope(c.home, a.run, c.env), { area: a.area, severity: a.severity as "critical" | "important" | "minor", ...(a.surface ? { surface: a.surface } : {}), ...(a.note ? { note: a.note } : {}) }, c.now()),
  }),

  define({
    name: "memory_update_product_map",
    title: "Record pages and endpoints seen",
    description:
      "Record the pages you visited (and, when there is no OpenAPI spec, the endpoints you saw) so the product map can learn them and the report can say what changed since the last run. Call it as you go or once at the end; repeats are merged. Returns what differs from the map so far. The map itself is updated by run_finish.",
    annotations: SET,
    input: { run, pages: z.array(page).max(100).optional(), endpoints: z.array(endpoint).max(500).optional() },
    run: (a, c) => updateProductMap(runScope(c.home, a.run, c.env), { ...(a.pages ? { pages: a.pages } : {}), ...(a.endpoints ? { endpoints: a.endpoints } : {}) }, c.now()),
  }),

  define({
    name: "lessons_propose",
    title: "Propose a global lesson",
    description:
      "Propose ONE lesson that would help on ANY project (for example: date pickers often break across time zones). It goes to the owner's pending list and is not used until they approve it. It must be generic: no project or product names, web addresses, files, ticket ids or code, and no data from this product. A near copy of an existing lesson is not added twice.",
    annotations: ADD,
    input: { run, text: line(20, 280, "text").describe("The generic lesson, one statement."), reason: line(10, 280, "reason").describe("What you saw that makes this true on any project."), area: line(1, 60, "area").optional() },
    run: (a, c) => proposeGlobalLesson(runScope(c.home, a.run, c.env), { text: a.text, reason: a.reason, ...(a.area ? { area: a.area } : {}) }, c.now()),
  }),
];
