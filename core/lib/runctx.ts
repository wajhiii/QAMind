import path from "node:path";
import type { RoleCredentials } from "./auth.ts";
import { checkConfigFile } from "./config.ts";
import type { QamindConfig } from "./config.ts";
import { loadQaEnv } from "./dotenv.ts";
import { findMarkerByRunId } from "./run.ts";
import type { RunMarker } from "./run.ts";
import type { RunPolicy } from "./urlpolicy.ts";

export interface RunContext {
  marker: RunMarker;
  projectRoot: string;
  runDir: string;
  config: QamindConfig;
  policy: RunPolicy;
  roles: RoleCredentials[];
  /** Password values only. These are scrubbed from every saved artifact. */
  passwords: string[];
}

/** Everything a run-scoped command needs, resolved from the run marker so the current folder does not matter. */
export function loadRunContext(home: string, runId: string | undefined, env: NodeJS.ProcessEnv = process.env): RunContext {
  if (!runId) throw new Error("--run <run-id> is required (use the id printed by `run start`).");
  const marker = findMarkerByRunId(home, runId);
  if (!marker) throw new Error(`No run "${runId}" found in the QAMind user store. It may have finished, or the id is wrong.`);
  const check = checkConfigFile(marker.project_root, env);
  if (!check.config) throw new Error(`The config for run ${runId} is no longer usable: ${check.problems.join(" ")}`);
  const names = check.config.roles.flatMap((r) => [r.username_env, r.password_env]);
  const { values } = loadQaEnv(marker.project_root, env, names);
  const roles: RoleCredentials[] = [];
  for (const r of check.config.roles) {
    const username = values[r.username_env];
    const password = values[r.password_env];
    if (username && password) roles.push({ name: r.name, username, password });
  }
  return {
    marker,
    projectRoot: marker.project_root,
    runDir: path.resolve(marker.run_dir),
    config: check.config,
    policy: marker.policy,
    roles,
    passwords: roles.map((r) => r.password),
  };
}
