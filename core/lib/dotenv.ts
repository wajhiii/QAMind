import fs from "node:fs";
import path from "node:path";

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = (m[2] ?? "").trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    out[m[1] as string] = value;
  }
  return out;
}

export interface QaEnv {
  fileFound: boolean;
  /** `.env.qa` values, overridden by real environment variables (so CI secrets win). Never print these. */
  values: Record<string, string>;
}

export function loadQaEnv(projectRoot: string, processEnv: NodeJS.ProcessEnv = process.env, names?: string[]): QaEnv {
  const file = path.join(projectRoot, ".env.qa");
  const fileFound = fs.existsSync(file);
  const fromFile = fileFound ? parseDotenv(fs.readFileSync(file, "utf8")) : {};
  const values: Record<string, string> = { ...fromFile };
  for (const name of names ?? Object.keys(fromFile)) {
    const v = processEnv[name];
    if (v !== undefined && v !== "") values[name] = v;
  }
  return { fileFound, values };
}
