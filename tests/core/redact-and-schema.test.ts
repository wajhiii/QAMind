import assert from "node:assert/strict";
import { test } from "node:test";
import { findSecretLeaks, makeRedactor } from "../../core/lib/redact.ts";
import { synthesize, validateSchema } from "../../core/lib/schema.ts";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcdefghijklmnop";

test("redactor scrubs tokens, auth headers, sensitive keys and known secrets", () => {
  const r = makeRedactor(["hunter2-password"]);
  assert.ok(!r.text(`Authorization: Bearer ${JWT}`).includes("eyJ"));
  assert.ok(!r.text("pw is hunter2-password ok").includes("hunter2-password"));
  const out = r.json({ password: "x1234", token: JWT, nested: { Authorization: "Bearer abcdefghijkl", name: "keep me" }, list: [{ cookie: "sid=abcdef123456" }] }) as Record<string, any>;
  assert.equal(out.password, "[REDACTED]");
  assert.equal(out.token, "[REDACTED]");
  assert.equal(out.nested.Authorization, "[REDACTED]");
  assert.equal(out.nested.name, "keep me");
  assert.equal(out.list[0].cookie, "[REDACTED]");
  assert.deepEqual(r.headers({ authorization: "Bearer zzzzzzzzzzzz", "content-type": "application/json", "set-cookie": "a=b" }), { authorization: "[REDACTED]", "content-type": "application/json", "set-cookie": "[REDACTED]" });
});

test("leak scanner finds what redaction missed", () => {
  assert.deepEqual(findSecretLeaks(`ok text`), []);
  assert.ok(findSecretLeaks(`token ${JWT}`).length > 0);
  assert.ok(findSecretLeaks("my pass is s3cret-pass", ["s3cret-pass"]).length > 0);
  assert.deepEqual(findSecretLeaks("Authorization: Bearer [REDACTED]"), []);
});

test("schema validation catches type, required, enum, range and length errors", () => {
  const schema = { type: "object", required: ["id", "qty"], properties: { id: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 5 }, kind: { enum: ["a", "b"] }, tags: { type: "array", items: { type: "string" } } } };
  assert.deepEqual(validateSchema({ id: "x", qty: 2, kind: "a", tags: ["t"] }, schema), []);
  const errs = validateSchema({ qty: 9, kind: "z", tags: [1] }, schema);
  assert.equal(errs.length, 4);
  assert.ok(errs.some((e) => e.includes("id: required")));
  assert.ok(errs.some((e) => e.includes("maximum")));
});

test("synthesized bodies are valid against their own schema and carry the test prefix", () => {
  const schema = { type: "object", required: ["name", "qty", "items"], properties: { name: { type: "string", minLength: 3 }, qty: { type: "integer", minimum: 2 }, items: { type: "array", items: { type: "object", properties: { sku: { type: "string" } } } }, mode: { enum: ["fast"] } } };
  const body = synthesize(schema, "QA-") as Record<string, any>;
  assert.deepEqual(validateSchema(body, schema), []);
  assert.ok(String(body.name).startsWith("QA-"));
});
