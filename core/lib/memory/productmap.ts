import path from "node:path";
import { readJson, writeJson } from "../fsutil.ts";
import type { Inventory } from "../openapi.ts";
import type { CoverageRow } from "../report.ts";
import { memoryPaths, readMemoryJson, writeMemoryJson } from "./store.ts";

/** What the product consists of: UIs, pages, API endpoints, roles and journeys, each with when it was last seen (spec 10.1). */

export interface PageInfo {
  title?: string;
  roles: string[];
  first_seen: string;
  last_seen: string;
  last_seen_date: string;
}
export interface EndpointInfo {
  summary?: string;
  auth?: string;
  first_seen: string;
  last_seen: string;
}
export interface FlowInfo {
  n: number;
  text: string;
  status: "tested" | "partial" | "not-tested";
  last_run: string;
}
export interface ProductMap {
  schema_version: number;
  updated: string;
  last_run: string;
  last_run_mode: string;
  uis: Record<string, { url?: string; pages: Record<string, PageInfo> }>;
  api: { source: "openapi" | "observed" | "none"; endpoints: Record<string, EndpointInfo> };
  roles: string[];
  flows: FlowInfo[];
}

export interface ObservedPage {
  ui: string;
  path: string;
  title?: string;
  roles?: string[];
}
export interface Observed {
  pages: ObservedPage[];
  endpoints: Array<{ op: string; summary?: string; auth?: string }>;
  endpointsSource: ProductMap["api"]["source"];
  roles: string[];
  flows: Array<{ n: number; text: string; status: FlowInfo["status"] }>;
  uiUrls: Record<string, string>;
}

export interface PageRef {
  ui: string;
  path: string;
  title?: string;
}
export interface EndpointRef {
  op: string;
  summary?: string;
}
export interface Changes {
  since_run?: string;
  since_date?: string;
  first_run: boolean;
  pages_new: PageRef[];
  /** Pages in memory that this run did not visit. Only asserted after a full run, and it may just mean "not reached". */
  pages_not_seen: PageRef[];
  endpoints_added: EndpointRef[];
  endpoints_removed: EndpointRef[];
  notes: string[];
}

const ID_SEGMENT = /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z]{1,3}-\d+|[0-9a-f]{16,}|\d{4}-\d{2}-\d{2})$/i;

/** Path only (no host, query or hash), ids replaced with `:id`, so the same page is one entry however many records it shows. */
export function normalizePath(raw: string): string {
  let p = raw.trim();
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    /* keep as given */
  }
  p = p.split(/[?#]/)[0] ?? p;
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  const segs = p.split("/").map((s) => (ID_SEGMENT.test(s) ? ":id" : s));
  const out = segs.join("/").replace(/\/+$/, "");
  return out === "" ? "/" : out;
}

/** "My orders" for `/my-orders.html`: the words a reader would use when no title was recorded. */
export function humanizePath(p: string): string {
  const last = p.split("/").filter((s) => s && s !== ":id").pop() ?? "home page";
  const words = last.replace(/\.\w{1,5}$/, "").replace(/[-_]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : "Home page";
}

export const pageLabel = (p: PageRef): string => p.title?.trim() || humanizePath(p.path);

export function loadMap(store: string): ProductMap | undefined {
  return readMemoryJson<ProductMap>(memoryPaths(store).productMap);
}

/** Reads what this run saw. The agent writes data/pages.json (and data/endpoints.json when there is no OpenAPI spec). */
export function readObserved(runDir: string, ctx: { roles: string[]; uiUrls: Record<string, string>; flows: string[]; coverage: CoverageRow[] }): Observed {
  const dataDir = path.join(runDir, "data");
  const rawPages = readJson<unknown>(path.join(dataDir, "pages.json"));
  const defaultUi = Object.keys(ctx.uiUrls)[0] ?? "Web screens";
  const pages: ObservedPage[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(rawPages) ? rawPages : []) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const raw = String(o["path"] ?? o["url"] ?? "");
    if (!raw) continue;
    const ui = String(o["ui"] ?? defaultUi);
    const norm = normalizePath(raw);
    if (seen.has(`${ui}|${norm}`)) continue;
    seen.add(`${ui}|${norm}`);
    pages.push({ ui, path: norm, ...(typeof o["title"] === "string" && o["title"].trim() ? { title: String(o["title"]).trim() } : {}), ...(Array.isArray(o["roles"]) ? { roles: (o["roles"] as unknown[]).map(String) } : {}) });
  }

  let endpoints: Observed["endpoints"] = [];
  let endpointsSource: Observed["endpointsSource"] = "none";
  const inv = readJson<Inventory>(path.join(dataDir, "api-inventory.json"));
  if (inv?.endpoints?.length) {
    endpoints = inv.endpoints.map((e) => ({ op: e.operation, ...(e.summary ? { summary: e.summary } : {}), auth: e.auth }));
    endpointsSource = "openapi";
  } else {
    const rawEp = readJson<unknown>(path.join(dataDir, "endpoints.json"));
    if (Array.isArray(rawEp) && rawEp.length) {
      endpoints = rawEp.filter((x): x is string => typeof x === "string").map((op) => ({ op: op.trim() }));
      endpointsSource = "observed";
    }
  }

  const flows = ctx.flows.map((text, i) => {
    const rows = ctx.coverage.filter((r) => r.critical_flow === i + 1);
    const status: FlowInfo["status"] = rows.length === 0 ? "not-tested" : rows.every((r) => r.status === "tested") ? "tested" : "partial";
    return { n: i + 1, text, status };
  });
  return { pages, endpoints, endpointsSource, roles: ctx.roles, flows, uiUrls: ctx.uiUrls };
}

export function computeChanges(prev: ProductMap | undefined, obs: Observed, mode: string): Changes {
  if (!prev) return { first_run: true, pages_new: [], pages_not_seen: [], endpoints_added: [], endpoints_removed: [], notes: ["This is the first run for this project, so there is nothing to compare with."] };
  const changes: Changes = { since_run: prev.last_run, since_date: prev.updated, first_run: false, pages_new: [], pages_not_seen: [], endpoints_added: [], endpoints_removed: [], notes: [] };
  const known = (ui: string, p: string) => prev.uis[ui]?.pages[p];
  for (const p of obs.pages) if (!known(p.ui, p.path)) changes.pages_new.push({ ui: p.ui, path: p.path, ...(p.title ? { title: p.title } : {}) });
  if (mode === "full" && obs.pages.length > 0) {
    const now = new Set(obs.pages.map((p) => `${p.ui}|${p.path}`));
    for (const [ui, entry] of Object.entries(prev.uis)) for (const [p, info] of Object.entries(entry.pages)) if (!now.has(`${ui}|${p}`)) changes.pages_not_seen.push({ ui, path: p, ...(info.title ? { title: info.title } : {}) });
  } else if (mode !== "full") changes.notes.push("Pages that were not visited are not listed as gone, because this was not a full run.");

  const prevOps = prev.api.endpoints;
  for (const e of obs.endpoints) if (!prevOps[e.op]) changes.endpoints_added.push({ op: e.op, ...(e.summary ? { summary: e.summary } : {}) });
  if (obs.endpointsSource === "openapi" && prev.api.source === "openapi") {
    const now = new Set(obs.endpoints.map((e) => e.op));
    for (const [op, info] of Object.entries(prevOps)) if (!now.has(op)) changes.endpoints_removed.push({ op, ...(info.summary ? { summary: info.summary } : {}) });
  } else if (obs.endpoints.length > 0 && prev.api.source !== obs.endpointsSource) changes.notes.push("The list of endpoints came from a different source than last time, so removed endpoints are not asserted.");
  return changes;
}

export function applyObserved(prev: ProductMap | undefined, obs: Observed, runId: string, mode: string, now: Date): ProductMap {
  const stamp = now.toISOString();
  const map: ProductMap = prev ?? { schema_version: 1, updated: stamp, last_run: runId, last_run_mode: mode, uis: {}, api: { source: "none", endpoints: {} }, roles: [], flows: [] };
  map.updated = stamp;
  map.last_run = runId;
  map.last_run_mode = mode;
  for (const [ui, url] of Object.entries(obs.uiUrls)) (map.uis[ui] ??= { pages: {} }).url = url;
  for (const p of obs.pages) {
    const entry = (map.uis[p.ui] ??= { pages: {} });
    const old = entry.pages[p.path];
    const roles = [...new Set([...(old?.roles ?? []), ...(p.roles ?? [])])].sort();
    entry.pages[p.path] = { ...(p.title ? { title: p.title } : old?.title ? { title: old.title } : {}), roles, first_seen: old?.first_seen ?? runId, last_seen: runId, last_seen_date: stamp };
  }
  if (obs.endpoints.length > 0) {
    const fresh: ProductMap["api"]["endpoints"] = {};
    for (const e of obs.endpoints) {
      const old = map.api.endpoints[e.op];
      fresh[e.op] = { ...(e.summary ? { summary: e.summary } : old?.summary ? { summary: old.summary } : {}), ...(e.auth ? { auth: e.auth } : {}), first_seen: old?.first_seen ?? runId, last_seen: runId };
    }
    // A spec lists every endpoint, so it replaces the list; a partial observation only adds to it.
    map.api = obs.endpointsSource === "openapi" ? { source: "openapi", endpoints: fresh } : { source: map.api.source === "openapi" ? "openapi" : "observed", endpoints: { ...map.api.endpoints, ...fresh } };
  }
  map.roles = [...new Set([...map.roles, ...obs.roles])].sort();
  map.flows = obs.flows.map((f) => ({ ...f, last_run: runId }));
  return map;
}

export function saveMap(store: string, map: ProductMap): void {
  writeMemoryJson(memoryPaths(store).productMap, map as unknown as Record<string, unknown>);
}

export const changesFile = (runDir: string): string => path.join(runDir, "data", "changes.json");

export function loadChanges(runDir: string): Changes | undefined {
  return readJson<Changes>(changesFile(runDir));
}

export function saveChanges(runDir: string, c: Changes): void {
  writeJson(changesFile(runDir), c);
}

export function hasChanges(c: Changes | undefined): boolean {
  return !!c && !c.first_run && c.pages_new.length + c.pages_not_seen.length + c.endpoints_added.length + c.endpoints_removed.length > 0;
}

/**
 * The same facts for two audiences: exact (developers) and plain (managers, no paths or request methods).
 * Text taken from the product itself (a page title, an API summary) can contain jargon, so the plain lines quote it only when
 * `isPlain` accepts it and otherwise fall back to generic wording.
 */
export function describeChanges(c: Changes, isPlain: (text: string) => boolean = () => true): { technical: string[]; plain: string[] } {
  const technical: string[] = [];
  const plain: string[] = [];
  const quoted = (text: string | undefined): string | undefined => (text && isPlain(text) ? text : undefined);
  const where = (p: PageRef): string => {
    const label = quoted(pageLabel(p)) ?? quoted(humanizePath(p.path));
    return label ? `the "${label}" screen in the ${p.ui}` : `a screen in the ${p.ui}`;
  };
  for (const p of c.pages_new) {
    // Memory records the pages a run saw, not the pages that exist, so a page seen for the first time is new OR was not reached before.
    technical.push(`Page seen for the first time: ${p.ui} \`${p.path}\`${p.title ? ` (${p.title})` : ""} (new, or not reached by earlier runs)`);
    plain.push(`Seen for the first time: ${where(p)} (it is new, or the earlier check did not reach it).`);
  }
  for (const e of c.endpoints_added) {
    technical.push(`New endpoint: \`${e.op}\`${e.summary ? ` (${e.summary})` : ""}`);
    const name = quoted(e.summary);
    plain.push(`New since the last check: ${name ? `a new behind-the-screens function ("${name}")` : "a new behind-the-screens function"}.`);
  }
  for (const e of c.endpoints_removed) {
    technical.push(`Endpoint removed: \`${e.op}\`${e.summary ? ` (${e.summary})` : ""}`);
    const name = quoted(e.summary);
    plain.push(`No longer found: ${name ? `the behind-the-screens function "${name}"` : "a behind-the-screens function that existed before"}.`);
  }
  for (const p of c.pages_not_seen) {
    technical.push(`Page not seen this run: ${p.ui} \`${p.path}\`${p.title ? ` (${p.title})` : ""}`);
    plain.push(`Not found this time: ${where(p)} (it was removed, or the check did not reach it).`);
  }
  return { technical, plain };
}

export function pageCount(m: ProductMap | undefined): number {
  return m ? Object.values(m.uis).reduce((n, u) => n + Object.keys(u.pages).length, 0) : 0;
}
