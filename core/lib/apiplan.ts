import type { Endpoint, Inventory, Param } from "./openapi.ts";
import { synthesize } from "./schema.ts";
import type { Schema } from "./schema.ts";

export type StatusExpectation = number | string | Array<number | string>;

export interface JsonCheck {
  path: string;
  equals?: unknown;
  exists?: boolean;
  lte?: number;
  gte?: number;
  matches?: string;
}

export interface Probe {
  id: string;
  title: string;
  /** Spec operation this probe exercises, e.g. "POST /api/orders" (enables the contract oracles). */
  operation?: string;
  method: string;
  /** Path (relative to api.base_url). `{{var}}` placeholders are filled from plan.vars and earlier `capture`s. */
  path: string;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  body?: unknown;
  /** Sent verbatim instead of `body` (used for malformed JSON). */
  raw_body?: string;
  /** A role name from config, or "anonymous". */
  role: string;
  capture?: Record<string, string>;
  repeat?: { count: number; parallel?: boolean };
  expect?: { status?: StatusExpectation; json?: JsonCheck[]; body_contains?: string | string[]; body_not_contains?: string | string[] };
  tags?: string[];
  /** Variables that must exist before this probe can run. */
  needs?: string[];
  /** Save request/response evidence even when nothing looks wrong (to read real values such as prices or ids). */
  keep_evidence?: boolean;
}

export interface Plan {
  version: 1;
  name: string;
  vars?: Record<string, string>;
  probes: Probe[];
}

const STATUS_CLASS = /^[1-5]xx$/i;

/** Plans are edited by hand or by an agent: reject malformed ones with a clear message instead of silently misbehaving. */
export function validatePlan(plan: unknown): string[] {
  const errors: string[] = [];
  const p = plan as { probes?: unknown } | null;
  if (!p || typeof p !== "object" || !Array.isArray(p.probes)) return [`Not a plan file: expected { "probes": [...] }.`];
  const ids = new Set<string>();
  const strList = (v: unknown) => v === undefined || typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"));
  for (const [i, raw] of p.probes.entries()) {
    const pr = raw as Record<string, unknown>;
    const at = `probes[${i}]${typeof pr?.["id"] === "string" ? ` (${pr["id"]})` : ""}`;
    if (!pr || typeof pr !== "object") {
      errors.push(`${at}: must be an object.`);
      continue;
    }
    if (typeof pr["id"] !== "string" || !pr["id"]) errors.push(`${at}: "id" is required (a short unique string).`);
    else if (ids.has(pr["id"])) errors.push(`${at}: duplicate id.`);
    else ids.add(pr["id"]);
    for (const k of ["method", "path", "role"]) if (typeof pr[k] !== "string" || !pr[k]) errors.push(`${at}: "${k}" is required (a string).`);
    if (typeof pr["title"] !== "string") errors.push(`${at}: "title" is required (a string).`);
    const rep = pr["repeat"] as { count?: unknown } | undefined;
    if (rep !== undefined && !(Number.isInteger(rep?.count) && (rep?.count as number) >= 1 && (rep?.count as number) <= 20)) errors.push(`${at}: repeat.count must be a whole number from 1 to 20.`);
    const exp = pr["expect"] as Record<string, unknown> | undefined;
    if (exp !== undefined) {
      const st = exp["status"];
      const okStatus = (v: unknown) => (typeof v === "number" && Number.isInteger(v)) || (typeof v === "string" && (STATUS_CLASS.test(v) || /^\d{3}$/.test(v)));
      if (st !== undefined && !(okStatus(st) || (Array.isArray(st) && st.length > 0 && st.every(okStatus)))) errors.push(`${at}: expect.status must be a number, "4xx"-style class, or a list of those.`);
      for (const k of ["body_contains", "body_not_contains"]) if (!strList(exp[k])) errors.push(`${at}: expect.${k} must be a string or a list of strings.`);
      if (exp["json"] !== undefined && !(Array.isArray(exp["json"]) && exp["json"].every((c) => c && typeof (c as { path?: unknown }).path === "string"))) errors.push(`${at}: expect.json must be a list of { "path": "$.x", ... } checks.`);
    }
    if (pr["capture"] !== undefined && (typeof pr["capture"] !== "object" || Array.isArray(pr["capture"]))) errors.push(`${at}: capture must be an object like { "var": "$.json.path" }.`);
  }
  return errors.slice(0, 15);
}

export interface PlanOptions {
  /** Include endpoints that look like they send email/SMS, take payments or fire webhooks. Off by default (spec §12). */
  sideEffects?: boolean;
  role: string;
  matrixRoles: string[];
  prefix: string;
  /** Leave out the role matrix (use when generating a second plan for another role). */
  matrix?: boolean;
  writes: boolean;
  maxPerEndpoint: number;
  maxTotal: number;
}

/** Endpoints whose name suggests a real-world side effect. They are left out of generated plans unless asked for. */
const SIDE_EFFECT = /(forgot|reset|invite|e-?mail|mail|sms|otp|notify|notification|payment|pay\b|charge|checkout|refund|billing|webhook|send)/i;

export interface GeneratedPlan {
  plan: Plan;
  /** Operations left out because they may trigger email, SMS, payments or other external effects. */
  excluded: string[];
}

/** Fields that hold credentials: a synthesized value can never log anyone in, so "valid body" probes are meaningless. */
const CREDENTIAL_FIELD = /pass(word)?|secret|token|otp|\bpin\b/i;

interface Target {
  label: string;
  schema: Schema;
  set(body: Record<string, unknown>, value: unknown): Record<string, unknown>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every body field worth mutating: top-level properties and the properties of the first element of arrays of objects. */
function bodyTargets(props: Record<string, Schema>, prefix: string): Target[] {
  const out: Target[] = [];
  for (const [field, sub] of Object.entries(props)) {
    out.push({ label: field, schema: sub, set: (b, v) => ({ ...b, [field]: v }) });
    const items = isObj(sub["items"]) ? (sub["items"] as Schema) : undefined;
    const itemProps = items && isObj(items["properties"]) ? (items["properties"] as Record<string, Schema>) : undefined;
    if (sub["type"] === "array" && items && itemProps) {
      for (const [k, s2] of Object.entries(itemProps)) {
        out.push({
          label: `${field}[0].${k}`,
          schema: s2,
          set: (b, v) => {
            const arr = Array.isArray(b[field]) && (b[field] as unknown[]).length > 0 ? [...(b[field] as unknown[])] : [synthesize(items, prefix)];
            arr[0] = { ...(isObj(arr[0]) ? arr[0] : {}), [k]: v };
            return { ...b, [field]: arr };
          },
        });
      }
    }
  }
  return out;
}

const singular = (word: string): string => (word.endsWith("ies") ? `${word.slice(0, -3)}y` : word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);
const lastSegment = (p: string): string => (p.split("/").filter((x) => x && !x.startsWith("{")).pop() ?? "").toLowerCase();

/** Variable that holds an existing id of a resource, e.g. "orders" → "orderId". */
const idVar = (resource: string): string => `${singular(resource.replace(/[^a-z0-9]/gi, ""))}Id`;

/** A body field that points at another resource: product_id, productId, product_ids. Plain `id` is not one. */
const REF_FIELD = /^(.+?)(?:_id|Id)$/;

const SPECIAL_STRINGS = ["(", "'", '"', "%", "\\", "<b>x</b>", "😀", "x".repeat(3000)];
const PAGE_NAME = /^(page|offset|skip)$/i;
const SIZE_NAME = /^(page_?size|limit|per_?page|size|take)$/i;

const notFoundValue = (p: Param): string | number => {
  const s = p.schema ?? {};
  if (s["format"] === "uuid") return "00000000-0000-4000-8000-00000000dead";
  if (s["type"] === "integer" || s["type"] === "number") return 999999999;
  return "qa-does-not-exist";
};

/**
 * `own` is for write probes: they may only touch a record this run created, so they use `<resource>IdOwn`
 * (filled by a setup probe that creates a prefixed record), never the id of an existing record.
 */
function fillPath(ep: Endpoint, mode: "placeholder" | "not-found", own = false): { path: string; needs: string[] } {
  const needs: string[] = [];
  const path = ep.path.replace(/\{([^}]+)\}/g, (match, name: string, offset: number) => {
    const param = ep.parameters.find((p) => p.in === "path" && p.name === name) ?? { name, in: "path" as const, required: true };
    if (mode === "not-found") return encodeURIComponent(String(notFoundValue(param)));
    // `/orders/{id}` → orderId; an explicit name like {orderId} is kept as it is.
    const resource = lastSegment(ep.path.slice(0, offset));
    const plain = name.toLowerCase() === "id" && resource ? idVar(resource) : name;
    const variable = own ? `${plain}Own` : plain;
    needs.push(variable);
    return `{{${variable}}}`;
  });
  return { path, needs };
}

/** Replace reference-like string fields in a synthesized body with `{{xId}}` placeholders. */
function withReferences(value: unknown, vars: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => withReferences(v, vars));
  if (isObj(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        const m = REF_FIELD.exec(k);
        if (m && typeof v === "string") {
          const name = idVar(m[1] as string);
          vars.add(name);
          return [k, `{{${name}}}`];
        }
        return [k, withReferences(v, vars)];
      }),
    );
  }
  return value;
}

function wrongTypeValue(schema: Schema): unknown {
  switch (schema["type"]) {
    case "integer":
    case "number":
      return "not-a-number";
    case "boolean":
      return "yes";
    case "array":
      return "not-an-array";
    case "object":
      return "not-an-object";
    default:
      return 12345;
  }
}

export function generatePlan(inv: Inventory, opts: PlanOptions): GeneratedPlan {
  const probes: Probe[] = [];
  const excluded: string[] = [];
  const wantedVars = new Set<string>();
  let seq = 0;
  const add = (p: Omit<Probe, "id">): Probe => {
    const probe: Probe = { id: `P${String(++seq).padStart(3, "0")}`, ...p };
    probes.push(probe);
    return probe;
  };

  for (const ep of inv.endpoints) {
    if (ep.method === "DELETE" || ep.method === "HEAD" || ep.method === "OPTIONS") continue;
    if (!opts.sideEffects && SIDE_EFFECT.test(`${ep.path} ${ep.operation_id ?? ""}`)) {
      excluded.push(ep.operation);
      continue;
    }
    const isRead = ep.method === "GET";
    if (!isRead && !opts.writes) continue;
    const startCount = probes.length;
    const room = () => probes.length - startCount < opts.maxPerEndpoint;
    const base = fillPath(ep, "placeholder", !isRead);
    const op = ep.operation;
    const baseBody = ep.request_body?.schema ? withReferences(synthesize(ep.request_body.schema, opts.prefix), wantedVars) : undefined;
    for (const v of base.needs) wantedVars.add(v);
    const common = { operation: op, method: ep.method, role: opts.role, ...(base.needs.length ? { needs: base.needs } : {}) };

    // 1. Unauthenticated access must be refused wherever the spec requires auth.
    if (ep.auth === "required" && room()) {
      add({
        title: `${op} without credentials is refused`,
        operation: op,
        method: ep.method,
        path: base.path,
        ...(baseBody !== undefined ? { body: baseBody } : {}),
        role: "anonymous",
        expect: { status: [401, 403] },
        tags: ["auth", "anonymous"],
        ...(base.needs.length ? { needs: base.needs } : {}),
      });
    }

    // 2. Happy path for reads.
    if (isRead && base.needs.length === 0 && ep.parameters.every((p) => !p.required || p.in === "path") && room()) {
      add({ ...common, title: `${op} returns the documented success response`, path: base.path, expect: { status: "2xx" }, tags: ["happy"] });
    }

    // 3. Not-found handling for endpoints addressed by id.
    if (base.needs.length > 0 && isRead && room()) {
      const nf = fillPath(ep, "not-found");
      add({ operation: op, method: ep.method, path: nf.path, role: opts.role, title: `${op} for an id that does not exist`, expect: { status: "4xx" }, tags: ["not-found"] });
    }

    // 4. Query-parameter edges.
    for (const p of ep.parameters.filter((x) => x.in === "query")) {
      const s = (p.schema ?? {}) as Schema;
      const values: Array<string | number> = [];
      if (PAGE_NAME.test(p.name)) values.push(0, -1, 999999999, "abc");
      else if (SIZE_NAME.test(p.name)) values.push(0, -1, typeof s["maximum"] === "number" ? (s["maximum"] as number) + 1 : 1000001, "abc");
      else if (s["type"] === "integer" || s["type"] === "number") {
        if (typeof s["minimum"] === "number") values.push((s["minimum"] as number) - 1);
        if (typeof s["maximum"] === "number") values.push((s["maximum"] as number) + 1);
        values.push("abc");
      } else if (Array.isArray(s["enum"])) values.push("__not_a_valid_value__");
      else if (s["type"] === "string" || s["type"] === undefined) {
        values.push(...SPECIAL_STRINGS);
        if (typeof s["maxLength"] === "number") values.push("x".repeat((s["maxLength"] as number) + 1));
      }
      for (const v of values) {
        if (!room() || base.needs.length) break;
        const shown = typeof v === "string" && v.length > 24 ? `${v.slice(0, 12)}… (${v.length} chars)` : String(v);
        add({ ...common, title: `${op} with ${p.name}=${shown}`, path: base.path, query: { [p.name]: v }, tags: ["query-edge", p.name] });
      }
    }

    // 5. Request-body negatives and boundaries.
    if (!isRead && ep.request_body?.schema && baseBody && typeof baseBody === "object" && !Array.isArray(baseBody)) {
      const schema = ep.request_body.schema;
      const props = (schema["properties"] ?? {}) as Record<string, Schema>;
      const required = Array.isArray(schema["required"]) ? (schema["required"] as string[]) : [];
      const body = baseBody as Record<string, unknown>;
      const bodyCommon = { ...common, path: base.path };
      const hasCredentials = Object.keys(props).some((k) => CREDENTIAL_FIELD.test(k));
      const targets = bodyTargets(props, opts.prefix);

      if (ep.method === "POST" && !hasCredentials && room()) {
        add({ ...bodyCommon, title: `${op} with a valid body succeeds`, body, expect: { status: "2xx" }, tags: ["happy", "write"] });
      }
      for (const field of required.slice(0, 4)) {
        if (!room()) break;
        const { [field]: _omit, ...rest } = body;
        add({ ...bodyCommon, title: `${op} without required field "${field}"`, body: rest, expect: { status: "4xx" }, tags: ["validation", "write"] });
      }
      for (const t of targets.slice(0, 8)) {
        if (!room()) break;
        add({ ...bodyCommon, title: `${op} with wrong type for "${t.label}"`, body: t.set(body, wrongTypeValue(t.schema)), expect: { status: "4xx" }, tags: ["validation", "write"] });
      }
      for (const t of targets) {
        const sub = t.schema;
        const type = sub["type"];
        if (type === "integer" || type === "number") {
          const min = typeof sub["minimum"] === "number" ? (sub["minimum"] as number) : undefined;
          const max = typeof sub["maximum"] === "number" ? (sub["maximum"] as number) : undefined;
          const tries: unknown[] = [min !== undefined ? min - 1 : -1];
          if (max !== undefined) tries.push(max + 1);
          else tries.push(0, 2147483648);
          if (type === "integer") tries.push(1.5);
          for (const v of tries) {
            if (!room()) break;
            const outOfRange = typeof v === "number" && ((min !== undefined && v < min) || (max !== undefined && v > max) || (type === "integer" && !Number.isInteger(v)));
            add({ ...bodyCommon, title: `${op} with ${t.label}=${String(v)}`, body: t.set(body, v), ...(outOfRange ? { expect: { status: "4xx" } } : {}), tags: ["boundary", "write"] });
          }
        } else if (type === "string" && typeof sub["maxLength"] === "number" && room()) {
          add({ ...bodyCommon, title: `${op} with "${t.label}" longer than maxLength`, body: t.set(body, "x".repeat((sub["maxLength"] as number) + 1)), expect: { status: "4xx" }, tags: ["boundary", "write"] });
        } else if (Array.isArray(sub["enum"]) && room()) {
          add({ ...bodyCommon, title: `${op} with "${t.label}" outside the allowed values`, body: t.set(body, "__not_allowed__"), expect: { status: "4xx" }, tags: ["validation", "write"] });
        } else if (type === "array" && !t.label.includes("[") && room()) {
          add({ ...bodyCommon, title: `${op} with empty "${t.label}"`, body: t.set(body, []), ...(typeof sub["minItems"] === "number" && (sub["minItems"] as number) > 0 ? { expect: { status: "4xx" } } : {}), tags: ["boundary", "write"] });
        }
      }
      if (room()) add({ ...bodyCommon, title: `${op} with an empty JSON object`, body: {}, ...(required.length ? { expect: { status: "4xx" } } : {}), tags: ["validation", "write"] });
      if (room()) add({ ...bodyCommon, title: `${op} with malformed JSON`, raw_body: '{"broken":', expect: { status: "4xx" }, tags: ["validation", "leakage", "write"] });
      if (ep.method === "POST" && !hasCredentials && room()) {
        add({ ...bodyCommon, title: `${op} sent twice at once (duplicate submission)`, body, repeat: { count: 2, parallel: true }, tags: ["concurrency", "write"] });
      }
    }
  }

  // 6. Role matrix: who can reach each safe, id-less read endpoint?
  for (const ep of opts.matrix === false ? [] : inv.endpoints) {
    if (!opts.sideEffects && SIDE_EFFECT.test(`${ep.path} ${ep.operation_id ?? ""}`)) continue;
    if (ep.method !== "GET" || ep.path.includes("{") || ep.parameters.some((p) => p.required && p.in !== "path")) continue;
    for (const role of ["anonymous", ...opts.matrixRoles]) {
      add({ operation: ep.operation, method: "GET", path: ep.path, role, title: `${ep.operation} as ${role}`, tags: ["matrix"] });
    }
  }

  // 7. Setup probes. Reads use an existing id (captured from the collection). Writes use a record this run
  //    creates itself (prefixed test data), so a run never changes data it did not make.
  const setups: Probe[] = [];
  const unresolved: string[] = [];
  const isOwn = (v: string) => v.endsWith("IdOwn") || v.endsWith("Own");
  const stemOf = (v: string) => v.replace(/(Id)?Own$/, "").replace(/Id$/, "").toLowerCase();
  const names = (stem: string) => [stem, `${stem}s`, `${stem.replace(/y$/, "")}ies`];
  const nextId = () => `S${String(setups.length + 1).padStart(3, "0")}`;

  // Creation setups first: their bodies may need reference ids (for example a product), which adds more variables.
  const creates: Probe[] = [];
  for (const variable of [...wantedVars].filter(isOwn)) {
    const stem = stemOf(variable);
    const source = inv.endpoints
      .filter((e) => e.method === "POST" && !e.path.includes("{") && e.request_body?.schema && names(stem).includes(lastSegment(e.path)) && !SIDE_EFFECT.test(`${e.path} ${e.operation_id ?? ""}`))
      .sort((a, b) => a.path.length - b.path.length)[0];
    if (!source || !source.request_body?.schema) {
      unresolved.push(variable);
      continue;
    }
    creates.push({
      id: "",
      title: `Setup: create a ${opts.prefix} ${stem} to use as ${variable}`,
      operation: source.operation,
      method: "POST",
      path: source.path,
      role: opts.role,
      body: withReferences(synthesize(source.request_body.schema, opts.prefix), wantedVars),
      capture: { [variable]: "$find:id" },
      tags: ["setup", "creates-data"],
    });
  }

  for (const variable of [...wantedVars].filter((v) => !isOwn(v))) {
    const stem = stemOf(variable);
    const source = inv.endpoints
      .filter((e) => e.method === "GET" && !e.path.includes("{") && !e.parameters.some((p) => p.required && p.in !== "path") && names(stem).includes(lastSegment(e.path)))
      .sort((a, b) => a.path.length - b.path.length)[0];
    if (!source) {
      unresolved.push(variable);
      continue;
    }
    setups.push({
      id: nextId(),
      title: `Setup: capture an existing ${stem} id as ${variable}`,
      operation: source.operation,
      method: "GET",
      path: source.path,
      role: opts.role,
      capture: { [variable]: "$first:id" },
      tags: ["setup"],
    });
  }
  for (const c of creates) setups.push({ ...c, id: nextId() });

  const capped = [...setups, ...probes].slice(0, opts.maxTotal + setups.length);
  for (const p of capped) if (p.needs) p.needs = p.needs.filter((v) => unresolved.includes(v));
  return { plan: { version: 1, name: "baseline", probes: capped.map((p) => (p.needs?.length === 0 ? (({ needs: _n, ...rest }) => rest)(p) : p)) }, excluded };
}
