import fs from "node:fs";
import type { HookOutput, PromptInput, StopInput } from "./gate.ts";

/**
 * How a host's hook JSON maps onto the gate (spec 5.1: the gate lives once in `core/auto-qa/`; each host only describes its own hook format). The description is data in
 * the host's `host.json` (`auto_qa.hooks`), so a host whose hooks use other field names needs a folder, not a change to core. No description means Claude Code's own format.
 *
 *   input   gate field -> a path into the host's JSON (`workspace_roots.0` indexes an array); the first path that holds a string or number wins when a list is given
 *   stop    `loop_active_when` says when the Stop is one that follows our own block (the host's own loop guard), `only_when` limits it to normal endings,
 *           `block_output` is what to print to make the agent continue (`{reason}` is replaced), `notice_output` what to print to tell the user something (or null: it cannot)
 */
export interface HookIoSpec {
  stop: {
    input: Record<string, string | string[]>;
    loop_active_when?: { path: string; gt: number };
    only_when?: { path: string; equals: string };
    block_output: Record<string, unknown>;
    notice_output?: Record<string, unknown> | null;
  };
  prompt: { input: Record<string, string | string[]> };
}

/** Claude Code's format: the gate's own field names in and out. */
export const CLAUDE_IO: HookIoSpec = {
  stop: { input: { session_id: "session_id", cwd: "cwd", stop_hook_active: "stop_hook_active" }, block_output: { decision: "block", reason: "{reason}" }, notice_output: { systemMessage: "{message}" } },
  prompt: { input: { session_id: "session_id", cwd: "cwd", prompt: "prompt" } },
};

function dig(value: unknown, path: string): unknown {
  let cur = value;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function pick(raw: unknown, source: string | string[]): string | number | boolean | undefined {
  for (const p of Array.isArray(source) ? source : [source]) {
    const v = dig(raw, p);
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  }
  return undefined;
}

const text = (v: unknown): string | undefined => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);

export function mapPromptInput(raw: unknown, spec: HookIoSpec = CLAUDE_IO): PromptInput {
  const m = spec.prompt.input;
  const session = text(pick(raw, m["session_id"] ?? "session_id"));
  const cwd = text(pick(raw, m["cwd"] ?? "cwd"));
  const prompt = text(pick(raw, m["prompt"] ?? "prompt"));
  return { ...(session ? { session_id: session } : {}), ...(cwd ? { cwd } : {}), ...(prompt !== undefined ? { prompt } : {}) };
}

/** The gate's Stop input, or undefined when the host says this ending is not one to check (an aborted or failed agent turn). */
export function mapStopInput(raw: unknown, spec: HookIoSpec = CLAUDE_IO): StopInput | undefined {
  const s = spec.stop;
  if (s.only_when && text(pick(raw, s.only_when.path)) !== s.only_when.equals) return undefined;
  const session = text(pick(raw, s.input["session_id"] ?? "session_id"));
  const cwd = text(pick(raw, s.input["cwd"] ?? "cwd"));
  let active = false;
  if (s.loop_active_when) {
    const n = Number(pick(raw, s.loop_active_when.path));
    active = Number.isFinite(n) && n > s.loop_active_when.gt;
  } else if (s.input["stop_hook_active"] !== undefined) active = pick(raw, s.input["stop_hook_active"]) === true;
  return { ...(session ? { session_id: session } : {}), ...(cwd ? { cwd } : {}), stop_hook_active: active };
}

const fill = (template: unknown, values: Record<string, string>): unknown => {
  if (typeof template === "string") return template.replace(/\{(\w+)\}/g, (_m, k: string) => values[k] ?? "");
  if (Array.isArray(template)) return template.map((t) => fill(t, values));
  if (template && typeof template === "object") return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, fill(v, values)]));
  return template;
};

/** What to print for the gate's answer in this host's format, or undefined to print nothing (a skip, or a notice the host has no way to show). */
export function renderStopOutput(out: HookOutput | undefined, spec: HookIoSpec = CLAUDE_IO): unknown {
  if (!out) return undefined;
  if (out.decision === "block") return fill(spec.stop.block_output, { reason: out.reason ?? "" });
  if (out.systemMessage && spec.stop.notice_output) return fill(spec.stop.notice_output, { message: out.systemMessage });
  return undefined;
}

/** A hand-written or damaged spec must not break a hook: anything that is not the expected shape falls back to Claude Code's format. */
export function parseHookIo(raw: unknown): HookIoSpec {
  const o = raw as Partial<HookIoSpec> | null;
  if (!o || typeof o !== "object" || !o.stop || typeof o.stop !== "object" || !o.prompt || typeof o.prompt !== "object") return CLAUDE_IO;
  if (typeof o.stop.input !== "object" || typeof o.stop.block_output !== "object" || typeof o.prompt.input !== "object") return CLAUDE_IO;
  return o as HookIoSpec;
}

export interface HostAutoConfig {
  io: HookIoSpec;
  /** How this host tells the agent to run the internal QA skill, with `{mode}` for the mode. */
  invoke?: string;
}

/** The auto-QA part of a host's `host.json`. Never throws: a missing or damaged file means Claude Code's format. */
export function readHostAutoConfig(file: string | undefined): HostAutoConfig {
  if (!file) return { io: CLAUDE_IO };
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as { auto_qa?: { hooks?: unknown; invoke?: unknown } };
    const invoke = typeof json.auto_qa?.invoke === "string" ? json.auto_qa.invoke : undefined;
    return { io: parseHookIo(json.auto_qa?.hooks), ...(invoke ? { invoke } : {}) };
  } catch {
    return { io: CLAUDE_IO };
  }
}
