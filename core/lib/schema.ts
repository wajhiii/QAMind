/** A deliberately small JSON-Schema subset: enough to check API responses against an OpenAPI contract and to synthesize valid sample data. */

export type Schema = Record<string, unknown>;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "string":
    case "boolean":
      return typeof value === type;
    case "array":
      return Array.isArray(value);
    case "object":
      return isObj(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

export function validateSchema(value: unknown, schema: Schema | undefined, at = "$", out: string[] = [], depth = 0): string[] {
  if (!schema || depth > 8 || out.length >= 10) return out;
  if (Array.isArray(schema["allOf"])) for (const s of schema["allOf"]) validateSchema(value, s as Schema, at, out, depth + 1);
  for (const key of ["oneOf", "anyOf"] as const) {
    const options = schema[key];
    if (Array.isArray(options) && options.length > 0) {
      const ok = options.some((s) => validateSchema(value, s as Schema, at, [], depth + 1).length === 0);
      if (!ok) out.push(`${at}: does not match any of the ${key} alternatives`);
      return out;
    }
  }
  if (value === null && schema["nullable"] === true) return out;
  const type = schema["type"];
  const types = Array.isArray(type) ? (type as string[]) : typeof type === "string" ? [type] : [];
  if (types.length && !types.some((t) => typeMatches(value, t))) {
    out.push(`${at}: expected ${types.join("|")}, got ${typeOf(value)}`);
    return out;
  }
  if (Array.isArray(schema["enum"]) && !(schema["enum"] as unknown[]).includes(value)) out.push(`${at}: ${JSON.stringify(value)} is not one of the allowed values`);
  if (typeof value === "number") {
    if (typeof schema["minimum"] === "number" && value < schema["minimum"]) out.push(`${at}: ${value} is below the minimum ${schema["minimum"]}`);
    if (typeof schema["maximum"] === "number" && value > schema["maximum"]) out.push(`${at}: ${value} is above the maximum ${schema["maximum"]}`);
  }
  if (typeof value === "string") {
    if (typeof schema["minLength"] === "number" && value.length < schema["minLength"]) out.push(`${at}: shorter than minLength ${schema["minLength"]}`);
    if (typeof schema["maxLength"] === "number" && value.length > schema["maxLength"]) out.push(`${at}: longer than maxLength ${schema["maxLength"]}`);
  }
  if (isObj(value)) {
    const props = isObj(schema["properties"]) ? schema["properties"] : {};
    for (const req of Array.isArray(schema["required"]) ? (schema["required"] as string[]) : []) if (!(req in value)) out.push(`${at}.${req}: required property is missing`);
    for (const [k, sub] of Object.entries(props)) if (k in value) validateSchema(value[k], sub as Schema, `${at}.${k}`, out, depth + 1);
  }
  if (Array.isArray(value) && isObj(schema["items"])) {
    for (const [i, item] of value.slice(0, 5).entries()) validateSchema(item, schema["items"] as Schema, `${at}[${i}]`, out, depth + 1);
  }
  return out;
}

/** Build a valid sample value from a schema. Strings get the test-data prefix so created records are recognisably ours. */
export function synthesize(schema: Schema | undefined, prefix: string, name = "", depth = 0): unknown {
  if (!schema || depth > 6) return null;
  if ("example" in schema) return schema["example"];
  if ("default" in schema) return schema["default"];
  if (Array.isArray(schema["enum"]) && schema["enum"].length) return schema["enum"][0];
  if (Array.isArray(schema["allOf"])) {
    return Object.assign({}, ...(schema["allOf"] as Schema[]).map((s) => synthesize(s, prefix, name, depth + 1) as object));
  }
  for (const key of ["oneOf", "anyOf"] as const) {
    const o = schema[key];
    if (Array.isArray(o) && o.length) return synthesize(o[0] as Schema, prefix, name, depth + 1);
  }
  const t = Array.isArray(schema["type"]) ? (schema["type"] as string[]).find((x) => x !== "null") : (schema["type"] as string | undefined);
  switch (t) {
    case "integer":
      return typeof schema["minimum"] === "number" ? Math.max(1, schema["minimum"] as number) : 1;
    case "number":
      return typeof schema["minimum"] === "number" ? (schema["minimum"] as number) : 1;
    case "boolean":
      return true;
    case "array": {
      const item = synthesize(schema["items"] as Schema | undefined, prefix, name, depth + 1);
      return item === null ? [] : [item];
    }
    case "object":
    case undefined: {
      const props = isObj(schema["properties"]) ? schema["properties"] : {};
      if (t === undefined && Object.keys(props).length === 0) return null;
      const required = new Set(Array.isArray(schema["required"]) ? (schema["required"] as string[]) : Object.keys(props));
      const out: Record<string, unknown> = {};
      for (const [k, sub] of Object.entries(props)) if (required.has(k)) out[k] = synthesize(sub as Schema, prefix, k, depth + 1);
      return out;
    }
    case "string": {
      const fmt = schema["format"];
      if (fmt === "email") return `${prefix.toLowerCase()}qa@example.test`.replace(/[^a-z0-9@._-]/g, "");
      if (fmt === "date-time") return "2030-01-01T00:00:00Z";
      if (fmt === "date") return "2030-01-01";
      if (fmt === "uuid") return "00000000-0000-4000-8000-000000000001";
      if (fmt === "uri" || fmt === "url") return "https://example.test/";
      const base = `${prefix}${name || "value"}`;
      const min = typeof schema["minLength"] === "number" ? schema["minLength"] : 0;
      return base.length >= min ? base : base.padEnd(min, "x");
    }
    default:
      return null;
  }
}
