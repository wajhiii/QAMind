import fs from "node:fs";
import path from "node:path";
import { corePath } from "../corepath.ts";

/**
 * How a host's own CLI is run headlessly (spec 13.2), read from the `headless` block of that host's `host.json` so that core names no host and adding a host is a folder:
 * which command, with which arguments, how a skill is invoked in a prompt, which environment variables authenticate it, and how a CI job installs it.
 */
export interface HeadlessSpec {
  label: string;
  command: string;
  /** An environment variable that overrides `command` (a full path to the CLI). */
  command_env?: string;
  /** Arguments, with {prompt}, {plugin}, {max_cost} and {mode} filled in. */
  args: string[];
  /** Added when a model is asked for, with {model}. */
  model_args: string[];
  /** How a prompt invokes the QA skill: with {mode}. */
  invoke: string;
  /** Any one of these in the environment means the CLI can authenticate. */
  auth_env_any: string[];
  /** The name of the secret a CI job should provide. */
  auth_secret: string;
  auth_hint: string;
  /** The field of the CLI's JSON result that holds what the run cost. */
  cost_field: string;
  /** Variables the host sets for the program it is running in, removed so the CLI QAMind starts is not mistaken for a nested session. */
  child_env_remove: string[];
  ci_install: { npm_package: string; version: string; label: string };
}

const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`the host's headless block needs ${what} (a non-empty string)`);
  return v;
};
const list = (v: unknown, what: string): string[] => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`the host's headless block needs ${what} (a list of strings)`);
  return v as string[];
};

export function parseHeadless(json: unknown): HeadlessSpec {
  const h = (json as { headless?: Record<string, unknown> } | null)?.headless;
  if (!h || typeof h !== "object") throw new Error("this host has no headless block in its host.json, so QAMind does not know how to run its CLI without a person (use --agent-command to give the command yourself)");
  const install = (h["ci_install"] ?? {}) as Record<string, unknown>;
  return {
    label: str(h["label"], "label"),
    command: str(h["command"], "command"),
    ...(typeof h["command_env"] === "string" ? { command_env: h["command_env"] } : {}),
    args: list(h["args"], "args"),
    model_args: list(h["model_args"] ?? [], "model_args"),
    invoke: str(h["invoke"], "invoke"),
    auth_env_any: list(h["auth_env_any"] ?? [], "auth_env_any"),
    auth_secret: str(h["auth_secret"], "auth_secret"),
    auth_hint: str(h["auth_hint"], "auth_hint"),
    cost_field: str(h["cost_field"], "cost_field"),
    child_env_remove: list(h["child_env_remove"] ?? [], "child_env_remove"),
    ci_install: { npm_package: str(install["npm_package"], "ci_install.npm_package"), version: str(install["version"], "ci_install.version"), label: str(install["label"], "ci_install.label") },
  };
}

/** The host.json of a host: the file named by `explicit` or QAMIND_HOST_SPEC, else `hosts/<id>/host.json` of the QAMind checkout this runs from (CI clones QAMind from Git, so it is there). */
export function findHostSpec(hostId: string, explicit?: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const given = explicit ?? env["QAMIND_HOST_SPEC"];
  if (given) return fs.existsSync(given) ? path.resolve(given) : undefined;
  try {
    let dir = path.resolve(corePath());
    for (let i = 0; i < 6; i++) {
      const f = path.join(dir, "hosts", hostId, "host.json");
      if (fs.existsSync(f)) return f;
      dir = path.dirname(dir);
    }
  } catch {
    /* no core folder: nothing to find */
  }
  return undefined;
}

export function loadHeadless(hostId: string, explicit?: string, env: NodeJS.ProcessEnv = process.env): HeadlessSpec {
  const file = findHostSpec(hostId, explicit, env);
  if (!file) throw new Error(`cannot find hosts/${hostId}/host.json (QAMind has to run from a checkout of its repository, as in a CI job that clones it; or pass --host-spec FILE, or --agent-command)`);
  try {
    return parseHeadless(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (e) {
    throw new Error(`${path.basename(path.dirname(file))}/host.json: ${(e as Error).message}`);
  }
}

const fill = (s: string, v: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

export const invokeFor = (spec: HeadlessSpec, mode: string): string => fill(spec.invoke, { mode });

/** The arguments to start the host CLI with. */
export function agentArgs(spec: HeadlessSpec, v: { prompt: string; plugin: string; maxCost: number; model?: string; mode: string }): string[] {
  const vars = { prompt: v.prompt, plugin: v.plugin, max_cost: String(v.maxCost), mode: v.mode, ...(v.model ? { model: v.model } : {}) };
  return [...spec.args.map((a) => fill(a, vars)), ...(v.model ? spec.model_args.map((a) => fill(a, vars)) : [])];
}

export const agentCommandOf = (spec: HeadlessSpec, env: NodeJS.ProcessEnv): string => (spec.command_env && env[spec.command_env]) || spec.command;
export const hasAuth = (spec: HeadlessSpec, env: NodeJS.ProcessEnv): boolean => spec.auth_env_any.some((k) => !!env[k]);
