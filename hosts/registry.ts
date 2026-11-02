import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { HostAdapter, HostJson, LoadedHost } from "./host-api.ts";

/**
 * Hosts are discovered, not listed: every folder under `hosts/` that has a `host.json` and an `adapter.ts` is a host. Adding one never means editing core
 * (spec 5.1). Setup runs on Node 22.18+, which loads the TypeScript adapters directly.
 */
export const defaultHostsDir = (repoRoot: string): string => path.join(repoRoot, "hosts");

export function readHostJson(dir: string): HostJson {
  const json = JSON.parse(fs.readFileSync(path.join(dir, "host.json"), "utf8")) as HostJson;
  for (const key of ["id", "name", "tier", "auto_qa", "safety", "commands"] as const) if (json[key] === undefined) throw new Error(`${path.join(dir, "host.json")} has no "${key}".`);
  if (json.id !== path.basename(dir)) throw new Error(`${path.join(dir, "host.json")} says id "${json.id}" but the folder is "${path.basename(dir)}".`);
  if (!["full", "experimental", "instruction-only"].includes(json.tier)) throw new Error(`${json.id}: tier must be full, experimental or instruction-only.`);
  return json;
}

export async function discoverHosts(hostsDir: string): Promise<LoadedHost[]> {
  const out: LoadedHost[] = [];
  for (const entry of fs.readdirSync(hostsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(hostsDir, entry.name);
    if (!fs.existsSync(path.join(dir, "host.json")) || !fs.existsSync(path.join(dir, "adapter.ts"))) continue;
    const json = readHostJson(dir);
    const mod = (await import(pathToFileURL(path.join(dir, "adapter.ts")).href)) as { adapter?: HostAdapter };
    if (!mod.adapter || mod.adapter.id !== json.id) throw new Error(`hosts/${entry.name}/adapter.ts must export \`adapter\` with id "${json.id}".`);
    out.push({ id: json.id, dir, json, adapter: mod.adapter });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadHost(hostsDir: string, id: string): Promise<LoadedHost> {
  const all = await discoverHosts(hostsDir);
  const found = all.find((h) => h.id === id);
  if (!found) throw new Error(`Unknown host "${id}". Known hosts: ${all.map((h) => h.id).join(", ")}.`);
  return found;
}
