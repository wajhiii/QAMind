import path from "node:path";
import { ensureDir, readJson, writeJson } from "../fsutil.ts";
import { findSecretLeaks } from "../redact.ts";
import { normalizePath } from "./productmap.ts";
import { screenForSecretsAndPii } from "./store.ts";

/**
 * What a run saw of the product: `data/pages.json` and, when there is no OpenAPI spec, `data/endpoints.json`. The agent used to write
 * these files by hand; this validates, normalises and merges instead, so the product map only ever learns clean entries. Every
 * path is stored without host, query or hash (a query string can carry a token) and with ids replaced.
 */
export const MAX_PAGES = 300;
export const MAX_ENDPOINTS = 1000;

export interface PageInput {
  ui?: string;
  path: string;
  title?: string;
  roles?: string[];
}

export interface ObservationInput {
  pages?: PageInput[];
  endpoints?: string[];
}

export interface ObservationResult {
  pages_added: number;
  pages_total: number;
  endpoints_added: number;
  endpoints_total: number;
  warnings: string[];
}

interface StoredPage {
  ui: string;
  path: string;
  title?: string;
  roles?: string[];
}

const OP = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S{0,200})$/i;
const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

export function recordObservations(runDir: string, input: ObservationInput, opts: { defaultUi: string; knownSecrets?: string[] }): ObservationResult {
  const secrets = opts.knownSecrets ?? [];
  const warnings: string[] = [];
  const dir = path.join(runDir, "data");
  ensureDir(dir);

  const stored = ((): StoredPage[] => {
    const raw = readJson<unknown>(path.join(dir, "pages.json"));
    return Array.isArray(raw) ? raw.filter((p): p is StoredPage => !!p && typeof p === "object" && typeof (p as StoredPage).path === "string" && typeof (p as StoredPage).ui === "string") : [];
  })();
  const byKey = new Map(stored.map((p) => [`${p.ui}|${p.path}`, p]));
  let pagesAdded = 0;
  for (const p of input.pages ?? []) {
    const ui = clean(p.ui ?? opts.defaultUi);
    if (!ui) throw new Error("A page needs the name of its web UI (as in the config), e.g. \"Client Portal\".");
    const norm = normalizePath(p.path);
    if (findSecretLeaks(norm, secrets).length) throw new Error(`The path ${norm} contains something that looks like a secret. Record the page without it.`);
    let title = p.title ? clean(p.title) : undefined;
    if (title) {
      const problems = screenForSecretsAndPii(title, secrets);
      if (problems.length) {
        warnings.push(`The title of ${ui} ${norm} was not saved (it ${problems[0]}); the page itself was recorded.`);
        title = undefined;
      }
    }
    const roles = [...new Set((p.roles ?? []).map(clean).filter(Boolean))];
    const existing = byKey.get(`${ui}|${norm}`);
    if (existing) {
      if (title && !existing.title) existing.title = title;
      if (roles.length) existing.roles = [...new Set([...(existing.roles ?? []), ...roles])];
      continue;
    }
    const entry: StoredPage = { ui, path: norm, ...(title ? { title } : {}), ...(roles.length ? { roles } : {}) };
    byKey.set(`${ui}|${norm}`, entry);
    stored.push(entry);
    pagesAdded++;
  }
  if (stored.length > MAX_PAGES) throw new Error(`That is more than ${MAX_PAGES} distinct pages. Record page types, not every record (ids are collapsed automatically).`);
  if (input.pages?.length) writeJson(path.join(dir, "pages.json"), stored);

  const storedOps = ((): string[] => {
    const raw = readJson<unknown>(path.join(dir, "endpoints.json"));
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  })();
  const ops = new Set(storedOps);
  let endpointsAdded = 0;
  for (const raw of input.endpoints ?? []) {
    const m = OP.exec(clean(raw));
    if (!m) throw new Error(`"${raw}" is not an endpoint. Write it as METHOD /path, e.g. "GET /orders/{id}".`);
    const op = `${(m[1] as string).toUpperCase()} ${(m[2] as string).split(/[?#]/)[0]}`;
    if (!ops.has(op)) {
      ops.add(op);
      endpointsAdded++;
    }
  }
  if (ops.size > MAX_ENDPOINTS) throw new Error(`That is more than ${MAX_ENDPOINTS} endpoints.`);
  if (input.endpoints?.length) writeJson(path.join(dir, "endpoints.json"), [...ops]);

  return { pages_added: pagesAdded, pages_total: stored.length, endpoints_added: endpointsAdded, endpoints_total: ops.size, warnings };
}
