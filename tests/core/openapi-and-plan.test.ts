import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { generatePlan, validatePlan } from "../../core/lib/apiplan.ts";
import { buildInventory, deref, loadSpecFile, matchEndpoint, statusDeclared } from "../../core/lib/openapi.ts";
import { repoRoot } from "./helpers.ts";

const demo = () => buildInventory(loadSpecFile(path.join(repoRoot, "demo-app", "openapi.yaml")), "openapi.yaml");
const opts = { role: "admin", matrixRoles: ["admin", "acme-1"], prefix: "QA-", writes: true, maxPerEndpoint: 30, maxTotal: 400 };

test("inventory reads operations, auth, params, bodies and responses from the demo spec", () => {
  const inv = demo();
  assert.equal(inv.endpoints.length, 13);
  const orders = inv.endpoints.find((e) => e.operation === "GET /orders")!;
  assert.equal(orders.auth, "required");
  assert.deepEqual(orders.parameters.map((p) => p.name).sort(), ["page", "page_size", "q", "status"]);
  assert.equal(inv.endpoints.find((e) => e.operation === "POST /auth/login")!.auth, "none");
  const post = inv.endpoints.find((e) => e.operation === "POST /orders")!;
  assert.equal(post.request_body?.content_type, "application/json");
  assert.ok(statusDeclared(post, 201));
  assert.equal(matchEndpoint(inv, "GET", "/orders/123")?.operation, "GET /orders/{id}");
});

test("circular $refs resolve without looping", () => {
  const doc = { components: { schemas: { Node: { type: "object", properties: { child: { $ref: "#/components/schemas/Node" } } } } }, x: { $ref: "#/components/schemas/Node" } };
  const out = deref(doc, doc) as any;
  assert.equal(out.x.type, "object");
  assert.equal(out.x.properties.child["x-circular"], "#/components/schemas/Node");
});

test("baseline plan: setup probes first, ids resolved, nested fields mutated, side-effect endpoints left out", () => {
  const { plan, excluded } = generatePlan(demo(), opts);
  assert.deepEqual(excluded.sort(), ["POST /auth/forgot-password", "POST /auth/reset-password"]);
  assert.ok(plan.probes.every((p) => !p.path.includes("forgot") && !p.path.includes("reset")));
  const setups = plan.probes.filter((p) => p.tags?.includes("setup"));
  assert.ok(setups.length >= 2);
  assert.equal(plan.probes.indexOf(setups[0]!), 0, "setup probes run first");
  assert.ok(setups.some((s) => s.capture && "productId" in s.capture && s.path === "/products"));
  assert.ok(setups.some((s) => s.capture && "orderId" in s.capture && s.path === "/orders"));
  const titles = plan.probes.map((p) => p.title);
  for (const t of ["POST /orders with items[0].quantity=0", "POST /orders with items[0].quantity=1001", "POST /orders with items[0].quantity=1.5", 'POST /orders with empty "items"', "POST /orders with malformed JSON"]) {
    assert.ok(titles.includes(t), `missing probe: ${t}`);
  }
  const happy = plan.probes.find((p) => p.title === "POST /orders with a valid body succeeds")!;
  assert.equal((happy.body as any).items[0].product_id, "{{productId}}", "foreign keys use a captured id, not a made-up one");
  assert.equal((happy.body as any).reference.startsWith("QA-"), true);
  assert.ok(!titles.includes("POST /auth/login with a valid body succeeds"), "credential bodies get no happy path");
  assert.ok(plan.probes.every((p) => p.method !== "DELETE"));
  assert.ok(plan.probes.filter((p) => p.tags?.includes("anonymous")).every((p) => p.role === "anonymous"));
});

test("write probes can be switched off and the matrix omitted", () => {
  const { plan } = generatePlan(demo(), { ...opts, writes: false, matrix: false });
  assert.ok(plan.probes.every((p) => p.method === "GET"));
  assert.ok(plan.probes.every((p) => !p.tags?.includes("matrix")));
});

test("write probes only ever touch records this run created", () => {
  const { plan } = generatePlan(demo(), opts);
  const writes = plan.probes.filter((p) => p.method !== "GET" && p.path.includes("{{"));
  assert.ok(writes.length > 0, "there are write probes on id paths");
  for (const w of writes) {
    assert.match(w.path, /\{\{orderIdOwn\}\}/, `write probe ${w.id} must use a run-created id`);
    assert.doesNotMatch(w.path, /\{\{orderId\}\}/);
  }
  const create = plan.probes.find((p) => p.tags?.includes("creates-data"))!;
  assert.equal(create.method, "POST");
  assert.equal(create.path, "/orders");
  assert.deepEqual(create.capture, { orderIdOwn: "$find:id" });
  assert.equal(((create.body as any).items[0] as any).product_id, "{{productId}}");
  assert.ok(String((create.body as any).reference).startsWith("QA-"), "created records carry the test prefix");
  const order = plan.probes.map((p) => p.id);
  assert.ok(order.indexOf(plan.probes.find((p) => p.capture && "productId" in p.capture)!.id) < order.indexOf(create.id), "reference ids are captured before the create");
  // Reads still use an existing record, which is safe.
  assert.ok(plan.probes.some((p) => p.method === "GET" && p.path === "/orders/{{orderId}}"));
});

test("plan validation gives clear errors for hand-edited plans", () => {
  assert.deepEqual(validatePlan({ version: 1, name: "x", probes: [{ id: "A", title: "t", method: "GET", path: "/x", role: "anonymous", expect: { status: "4xx", body_not_contains: "text" } }] }), []);
  const errors = validatePlan({ probes: [{ title: "t", method: "GET", path: "/x", role: "r" }, { id: "B", title: "t", method: "GET", path: "/x", role: "r", expect: { status: "bad", body_contains: 5 } }, { id: "B", title: "t", method: "GET", path: "/x", role: "r", repeat: { count: 99 } }] });
  assert.ok(errors.some((e) => /"id" is required/.test(e)));
  assert.ok(errors.some((e) => /expect.status/.test(e)));
  assert.ok(errors.some((e) => /body_contains/.test(e)));
  assert.ok(errors.some((e) => /duplicate id/.test(e)));
  assert.ok(errors.some((e) => /repeat.count/.test(e)));
  assert.match(validatePlan("nope")[0] ?? "", /Not a plan file/);
});
