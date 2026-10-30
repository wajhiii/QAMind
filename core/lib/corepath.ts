import path from "node:path";
import { fileURLToPath } from "node:url";
import { exists } from "./fsutil.ts";

/**
 * Folder holding shared/, knowledge/ and templates at runtime.
 * From source it is <repo>/core; in a built plugin it is <plugin>/core next to dist/.
 */
export function corePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env["QAMIND_CORE"], path.resolve(here, "../core"), path.resolve(here, "..")].filter((c): c is string => !!c);
  for (const c of candidates) if (exists(path.join(c, "shared", "templates", "config.md"))) return c;
  throw new Error(`Cannot locate QAMind's core files (looked in: ${candidates.join(", ")}).`);
}
