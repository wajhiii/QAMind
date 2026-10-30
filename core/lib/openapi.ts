import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Schema } from "./schema.ts";

export interface Param {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema?: Schema;
}
export interface ResponseSpec {
  status: string;
  description?: string;
  schema?: Schema;
}
export interface Endpoint {
  method: string;
  path: string;
  operation: string;
  operation_id?: string;
  summary?: string;
  description?: string;
  tags: string[];
  auth: "required" | "none" | "unknown";
  parameters: Param[];
  request_body?: { required: boolean; content_type: string; schema?: Schema };
  responses: ResponseSpec[];
}
export interface Inventory {
  source: string;
  title?: string;
  version?: string;
  openapi_version?: string;
  servers: string[];
  security_schemes: string[];
  endpoints: Endpoint[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

export function parseSpecText(text: string, hint = ""): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || hint.endsWith(".json")) return JSON.parse(trimmed);
  return parseYaml(trimmed);
}

export function loadSpecFile(file: string): unknown {
  return parseSpecText(fs.readFileSync(file, "utf8"), file);
}

function pointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) throw new Error(`Only local $ref values are supported (found "${ref}").`);
  let cur: unknown = root;
  for (const part of ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (!isObj(cur) && !Array.isArray(cur)) return undefined;
    cur = (cur as Obj)[part];
  }
  return cur;
}

/** Resolve local $refs. Cycles become `{ type: "object", "x-circular": true }` so they never loop. */
export function deref(root: unknown, node: unknown, seen: string[] = [], depth = 0): unknown {
  if (depth > 24) return node;
  if (Array.isArray(node)) return node.map((n) => deref(root, n, seen, depth + 1));
  if (!isObj(node)) return node;
  if (typeof node["$ref"] === "string") {
    const ref = node["$ref"];
    if (seen.includes(ref)) return { type: "object", "x-circular": ref };
    const target = pointer(root, ref);
    if (target === undefined) return { "x-unresolved": ref };
    const { $ref: _drop, ...siblings } = node;
    const resolved = deref(root, target, [...seen, ref], depth + 1);
    return isObj(resolved) ? { ...resolved, ...siblings } : resolved;
  }
  const out: Obj = {};
  for (const [k, v] of Object.entries(node)) out[k] = deref(root, v, seen, depth + 1);
  return out;
}

function jsonContent(content: unknown): { type: string; schema?: Schema } | undefined {
  if (!isObj(content)) return undefined;
  const type = Object.keys(content).find((t) => t.includes("json")) ?? Object.keys(content)[0];
  if (!type) return undefined;
  const media = content[type];
  return { type, ...(isObj(media) && isObj(media["schema"]) ? { schema: media["schema"] as Schema } : {}) };
}

function normalizeSwagger2(doc: Obj): Obj {
  // Light conversion so the rest of the code only deals with the OpenAPI 3 shape.
  const paths = isObj(doc["paths"]) ? doc["paths"] : {};
  for (const item of Object.values(paths)) {
    if (!isObj(item)) continue;
    for (const [m, op] of Object.entries(item)) {
      if (!METHODS.includes(m) || !isObj(op)) continue;
      const params = Array.isArray(op["parameters"]) ? (op["parameters"] as Obj[]) : [];
      const body = params.find((p) => isObj(p) && p["in"] === "body");
      if (body) op["requestBody"] = { required: body["required"] === true, content: { "application/json": { schema: body["schema"] } } };
      op["parameters"] = params.filter((p) => !isObj(p) || p["in"] !== "body");
      if (isObj(op["responses"])) {
        for (const r of Object.values(op["responses"])) {
          if (isObj(r) && r["schema"] && !r["content"]) r["content"] = { "application/json": { schema: r["schema"] } };
        }
      }
    }
  }
  return doc;
}

export function buildInventory(rawDoc: unknown, source: string): Inventory {
  if (!isObj(rawDoc) || !isObj(rawDoc["paths"])) throw new Error(`"${source}" does not look like an OpenAPI/Swagger document (no "paths").`);
  const doc = rawDoc["swagger"] ? normalizeSwagger2(rawDoc) : rawDoc;
  const resolved = deref(doc, doc) as Obj;
  const info = isObj(resolved["info"]) ? resolved["info"] : {};
  const globalSecurity = Array.isArray(resolved["security"]) ? resolved["security"] : undefined;
  const components = isObj(resolved["components"]) ? resolved["components"] : {};
  const schemes = isObj(components["securitySchemes"]) ? Object.keys(components["securitySchemes"]) : isObj(resolved["securityDefinitions"]) ? Object.keys(resolved["securityDefinitions"]) : [];
  const endpoints: Endpoint[] = [];
  const paths = resolved["paths"] as Obj;
  for (const [p, itemRaw] of Object.entries(paths)) {
    if (!isObj(itemRaw)) continue;
    const shared = Array.isArray(itemRaw["parameters"]) ? (itemRaw["parameters"] as Obj[]) : [];
    for (const m of METHODS) {
      const op = itemRaw[m];
      if (!isObj(op)) continue;
      const params = [...shared, ...(Array.isArray(op["parameters"]) ? (op["parameters"] as Obj[]) : [])]
        .filter((x): x is Obj => isObj(x) && typeof x["name"] === "string")
        .map<Param>((x) => ({
          name: x["name"] as string,
          in: (x["in"] as Param["in"]) ?? "query",
          required: x["required"] === true || x["in"] === "path",
          ...(isObj(x["schema"]) ? { schema: x["schema"] as Schema } : isObj(x) && x["type"] ? { schema: { type: x["type"], ...(x["enum"] ? { enum: x["enum"] } : {}) } } : {}),
        }));
      const rb = isObj(op["requestBody"]) ? op["requestBody"] : undefined;
      const rbc = rb ? jsonContent(rb["content"]) : undefined;
      const security = Array.isArray(op["security"]) ? op["security"] : globalSecurity;
      const auth: Endpoint["auth"] = security === undefined ? "unknown" : security.length === 0 ? "none" : security.some((s) => isObj(s) && Object.keys(s).length === 0) ? "none" : "required";
      const responses: ResponseSpec[] = [];
      if (isObj(op["responses"])) {
        for (const [status, r] of Object.entries(op["responses"])) {
          const content = isObj(r) ? jsonContent(r["content"]) : undefined;
          responses.push({ status, ...(isObj(r) && typeof r["description"] === "string" ? { description: r["description"] } : {}), ...(content?.schema ? { schema: content.schema } : {}) });
        }
      }
      endpoints.push({
        method: m.toUpperCase(),
        path: p,
        operation: `${m.toUpperCase()} ${p}`,
        ...(typeof op["operationId"] === "string" ? { operation_id: op["operationId"] } : {}),
        ...(typeof op["summary"] === "string" ? { summary: op["summary"] } : {}),
        ...(typeof op["description"] === "string" ? { description: op["description"] } : {}),
        tags: Array.isArray(op["tags"]) ? (op["tags"] as string[]) : [],
        auth,
        parameters: params,
        ...(rb && rbc ? { request_body: { required: rb["required"] === true, content_type: rbc.type, ...(rbc.schema ? { schema: rbc.schema } : {}) } } : {}),
        responses,
      });
    }
  }
  const servers = Array.isArray(resolved["servers"]) ? (resolved["servers"] as Obj[]).map((s) => String(s["url"] ?? "")).filter(Boolean) : [];
  return {
    source,
    ...(typeof info["title"] === "string" ? { title: info["title"] } : {}),
    ...(typeof info["version"] === "string" ? { version: info["version"] } : {}),
    ...(typeof (resolved["openapi"] ?? resolved["swagger"]) === "string" ? { openapi_version: String(resolved["openapi"] ?? resolved["swagger"]) } : {}),
    servers,
    security_schemes: schemes,
    endpoints,
  };
}

/** Does the declared response list cover this status (exact code, 2XX-style range, or default)? */
export function statusDeclared(ep: Endpoint, status: number): boolean {
  if (ep.responses.length === 0) return true;
  return ep.responses.some((r) => r.status === String(status) || r.status.toUpperCase() === `${Math.floor(status / 100)}XX` || r.status === "default");
}

/** Match a concrete request path to an inventory endpoint ({id} segments match any single segment). */
export function matchEndpoint(inv: Inventory, method: string, requestPath: string): Endpoint | undefined {
  const clean = requestPath.split("?")[0] ?? requestPath;
  const segs = clean.split("/").filter(Boolean);
  const candidates = inv.endpoints.filter((e) => e.method === method.toUpperCase());
  const score = (e: Endpoint): number => {
    const es = e.path.split("/").filter(Boolean);
    if (es.length !== segs.length) return -1;
    let literal = 0;
    for (const [i, s] of es.entries()) {
      if (s.startsWith("{") && s.endsWith("}")) continue;
      if (s !== segs[i]) return -1;
      literal++;
    }
    return literal;
  };
  let best: Endpoint | undefined;
  let bestScore = -1;
  for (const e of candidates) {
    const s = score(e);
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return best;
}

export function resolveSpecPath(source: string, projectRoot: string): string {
  return path.isAbsolute(source) ? source : path.resolve(projectRoot, source);
}
