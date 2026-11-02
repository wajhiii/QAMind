import fs from "node:fs";
import path from "node:path";
import type { HostJson } from "./host-api.ts";

/** Rendering shared by every host: placeholders, front matter, and the runtime folder (skills, shared documents, bundles) a host's install points at. */
const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

export function renderText(text: string, values: Record<string, string>, file: string): string {
  return text.replace(PLACEHOLDER, (_m, key: string) => {
    const v = values[key];
    if (v === undefined) throw new Error(`Unknown placeholder {{${key}}} in ${file}`);
    return v;
  });
}

export function writeFile(file: string, content: string | Buffer, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, mode ? { mode } : undefined);
  if (mode) fs.chmodSync(file, mode);
}

export function copyTree(from: string, to: string, render: ((text: string, file: string) => string) | undefined): void {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst, render);
    else if (render && entry.name.endsWith(".md")) writeFile(dst, render(fs.readFileSync(src, "utf8"), src));
    else writeFile(dst, fs.readFileSync(src));
  }
}

export function frontMatter(text: string): { fields: Array<[string, string]>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error("A SKILL.md must start with a front-matter block.");
  const fields: Array<[string, string]> = [];
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields.push([kv[1] as string, kv[2] as string]);
  }
  return { fields, body: m[2] ?? "" };
}

export const yamlString = (v: string): string => (/^[\w./,;:()[\] -]*$/.test(v) && !/^[\s[{&*!|>'"%@`-]|:\s|\s#/.test(v) ? v : JSON.stringify(v));

export interface RenderedSkill {
  /** The name the user (or the model) invokes it by on this host. */
  name: string;
  /** Path relative to the runtime folder. */
  file: string;
}

export interface RuntimeOptions {
  repoRoot: string;
  runtimeDir: string;
  host: HostJson;
  values: Record<string, string>;
  /** The built bundles (`qamind.mjs`, `qa-memory.mjs`): the committed plugin's dist/ by default. */
  bundleDir?: string;
}

/**
 * The runtime folder of one host: `skills/`, `core/` (shared documents and knowledge, rendered for this host), `dist/` (the two bundles) and `host.json`.
 * Rendered fresh each time (setup and update), never edited by hand.
 */
export function renderRuntime(o: RuntimeOptions): RenderedSkill[] {
  const render = (text: string, file: string): string => renderText(text, o.values, path.relative(o.repoRoot, file));
  fs.rmSync(o.runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(o.runtimeDir, { recursive: true });

  const bundleDir = o.bundleDir ?? path.join(o.repoRoot, "plugins", "qamind", "dist");
  for (const f of ["qamind.mjs", "qa-memory.mjs"]) {
    const src = path.join(bundleDir, f);
    if (!fs.existsSync(src)) throw new Error(`${src} is missing: build QAMind first (\`node scripts/build.ts\`).`);
    writeFile(path.join(o.runtimeDir, "dist", f), fs.readFileSync(src));
  }
  for (const f of ["THIRD-PARTY-NOTICES.md"]) {
    const src = path.join(path.dirname(bundleDir), f);
    if (fs.existsSync(src)) writeFile(path.join(o.runtimeDir, f), fs.readFileSync(src));
  }
  copyTree(path.join(o.repoRoot, "core", "shared"), path.join(o.runtimeDir, "core", "shared"), render);
  copyTree(path.join(o.repoRoot, "core", "knowledge"), path.join(o.runtimeDir, "core", "knowledge"), render);
  writeFile(path.join(o.runtimeDir, "host.json"), JSON.stringify(o.host, null, 2) + "\n");

  const cfg = o.host.skills ?? {};
  const prefix = cfg.name_prefix ?? "";
  const keep = new Set(cfg.fields ?? ["name", "description"]);
  const skillsRoot = path.join(o.repoRoot, "core", "skills");
  const out: RenderedSkill[] = [];
  for (const core of fs.readdirSync(skillsRoot).sort()) {
    const file = path.join(skillsRoot, core, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const { fields, body } = frontMatter(fs.readFileSync(file, "utf8"));
    const name = `${prefix}${core}`;
    if (cfg.layout === "flat") {
      const description = fields.find(([k]) => k === "description")?.[1] ?? core;
      const rel = path.join("skills", `${name}.md`);
      writeFile(path.join(o.runtimeDir, rel), render(`<!-- QAMind procedure: ${name}. ${description} -->\n${body}`, file));
      out.push({ name, file: rel });
      continue;
    }
    const extra = cfg.frontmatter?.[core] ?? {};
    const lines = fields.filter(([k]) => keep.has(k) && k !== "name" && !(k in extra)).map(([k, v]) => `${k}: ${v}`);
    for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${typeof v === "string" ? yamlString(v) : String(v)}`);
    const rel = path.join("skills", name, "SKILL.md");
    writeFile(path.join(o.runtimeDir, rel), render(`---\nname: ${name}\n${lines.join("\n")}\n---\n${body}`, file));
    out.push({ name, file: rel });
  }
  return out;
}
