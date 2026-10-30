import fs from "node:fs";
import path from "node:path";

/** Entries QAMind adds on first run (spec §7.1). Never removes anything. */
export const QA_GITIGNORE_ENTRIES = [".env.qa", ".qa/"];

function isCovered(lines: string[], entry: string): boolean {
  const bare = entry.replace(/\/$/, "");
  const accepted = new Set([entry, bare, `/${entry}`, `/${bare}`, `${bare}/`, `/${bare}/`]);
  return lines.some((l) => accepted.has(l.trim()));
}

/** Append missing entries to <root>/.gitignore (created if absent). Returns the entries it added. */
export function ensureGitignoreEntries(root: string, entries: string[] = QA_GITIGNORE_ENTRIES): string[] {
  const file = path.join(root, ".gitignore");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = current.split(/\r?\n/);
  const missing = entries.filter((e) => !isCovered(lines, e));
  if (missing.length === 0) return [];
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  let next = current;
  if (next !== "" && !next.endsWith("\n")) next += eol;
  if (next !== "") next += eol;
  next += `# QAMind (private test credentials and reports)${eol}${missing.join(eol)}${eol}`;
  fs.writeFileSync(file, next, "utf8");
  return missing;
}
