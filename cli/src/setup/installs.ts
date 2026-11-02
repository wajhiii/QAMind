import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "../../../core/lib/fsutil.ts";
import { withStoreLock } from "../../../core/lib/memory/lock.ts";
import type { Applied } from "./ops.ts";

/**
 * What `setup` did, per host and scope, in the user's store (`<home>/installs.json`). It holds, for every edit, what is needed to undo it, so `status` can tell the
 * truth and `uninstall` removes exactly what was added and nothing else. The user's memory and lessons are never in here and never touched by it.
 */
export const INSTALLS_SCHEMA = 1;

export interface InstallRecord {
  host: string;
  scope: "user" | "project";
  /** The project folder, for a project-level install. */
  project?: string;
  version: string;
  installed_at: string;
  updated_at: string;
  /** The rendered runtime folder this install points at (absent for a host that installs its own runtime, like Claude Code's plugin). */
  runtime?: string;
  user_home: string;
  entries: Applied[];
}

export interface InstallsFile {
  schema_version: number;
  installs: InstallRecord[];
}

export const installsPath = (home: string): string => path.join(home, "installs.json");

export function loadInstalls(home: string): InstallsFile {
  try {
    const v = readJson<InstallsFile>(installsPath(home));
    if (v && Array.isArray(v.installs)) {
      if (v.schema_version > INSTALLS_SCHEMA) throw new Error(`${installsPath(home)} was written by a newer QAMind (schema ${v.schema_version}). Update QAMind first.`);
      return v;
    }
  } catch (err) {
    if (/newer QAMind/.test((err as Error).message)) throw err;
  }
  return { schema_version: INSTALLS_SCHEMA, installs: [] };
}

export const sameInstall = (a: Pick<InstallRecord, "host" | "scope" | "project">, b: Pick<InstallRecord, "host" | "scope" | "project">): boolean => a.host === b.host && a.scope === b.scope && (a.project ?? "") === (b.project ?? "");

/** Replace or add one record (or remove it with `undefined`), under the store lock. */
export function updateInstalls(home: string, key: Pick<InstallRecord, "host" | "scope" | "project">, next: InstallRecord | undefined): void {
  withStoreLock(home, () => {
    const file = loadInstalls(home);
    const rest = file.installs.filter((r) => !sameInstall(r, key));
    const installs = next ? [...rest, next] : rest;
    if (installs.length === 0) {
      // Nothing installed: the record itself is not worth keeping.
      fs.rmSync(installsPath(home), { force: true });
      return;
    }
    writeJson(installsPath(home), { schema_version: INSTALLS_SCHEMA, installs });
  });
}
