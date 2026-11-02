import { z } from "zod";
import { SEVERITIES } from "../../lib/config.ts";

/** What a tool needs from its surroundings. Tests pass their own; the server uses the process's. */
export interface ToolContext {
  home: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
  now: () => Date;
}

export interface ToolDef {
  name: string;
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
export const line = (min: number, max: number, what: string) => {
  const chars = (n: number) => `${n} character${n === 1 ? "" : "s"}`;
  return z
    .string()
    .trim()
    .min(min, `${what} must be at least ${chars(min)}.`)
    .max(max, `${what} must be at most ${chars(max)}.`)
    .refine((v) => NO_CONTROL.test(v), `${what} contains control characters.`); // a refinement, so it does not bloat every tool's JSON schema
};

export const runField = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,80}$/, "The run id printed by run_start, for example run-20261030T105554Z.")
  .describe("The run id that run_start returned (run.id).");
export const optionalRun = runField.optional().describe("The run id from run_start. Omit it to read the project's memory outside a run.");
export const project = line(1, 500, "project").optional().describe("Project folder. Omit it to use the folder the host opened.");
export const severity = z.enum(SEVERITIES as unknown as [string, ...string[]]).describe("critical, important or minor.");


export function define<S extends z.ZodRawShape>(def: Omit<ToolDef, "input" | "run"> & { input: S; run(args: z.infer<z.ZodObject<S>>, ctx: ToolContext): unknown }): ToolDef {
  return def as unknown as ToolDef;
}

export const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
export const ADD = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
export const SET = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
