import os from "node:os";
import path from "node:path";

/** Version of every file format QAMind writes (memory, project.json, run summaries). */
export const SCHEMA_VERSION = 1;

/** Root of the private per-user store. Host-agnostic on purpose (spec §7.2). */
export function qamindHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env["QAMIND_HOME"];
  return override && override.trim() !== "" ? path.resolve(override) : path.join(os.homedir(), ".qamind");
}

export function projectsRoot(home: string): string {
  return path.join(home, "projects");
}

/** `<store>` in the spec: $QAMIND_HOME/projects/<project-id>/ */
export function storeDir(home: string, projectId: string): string {
  return path.join(projectsRoot(home), projectId);
}

export function storeSubdirs(store: string) {
  return {
    memory: path.join(store, "memory"),
    runs: path.join(store, "memory", "runs"),
    state: path.join(store, "state"),
    testBank: path.join(store, "test-bank"),
    baselines: path.join(store, "baselines"),
    backups: path.join(store, "backups"),
  };
}

export const RUN_MARKER_FILE = "run-marker.json";
