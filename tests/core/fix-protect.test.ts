import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { SAFE_REL_PATH, compileRules, globToRegExp, isTestPath, protectedReason, relativeToRoot } from "../../core/lib/fix/protect.ts";

const rules = compileRules(["src/billing/**", "legacy/", "*.generated.ts", "docs/secret-plan.md"]);
const why = (rel: string) => protectedReason(rel, rules);

test("glob patterns: no slash matches at any depth, a slash anchors at the root, ** crosses folders", () => {
  assert.ok(globToRegExp("node_modules").test("a/b/node_modules/x/y.js"));
  assert.ok(globToRegExp("*.pem").test("deploy/keys/site.PEM"), "case-insensitive");
  assert.ok(!globToRegExp("*.pem").test("deploy/keys/site.pem.txt"));
  assert.ok(globToRegExp("src/billing/**").test("src/billing/tax.js"));
  assert.ok(globToRegExp("src/billing/**").test("src/billing/deep/er/x.js"));
  assert.ok(!globToRegExp("src/billing/**").test("lib/src/billing/tax.js"), "a slash anchors at the project root");
  assert.ok(!globToRegExp("src/billing/**").test("src/billing-tools/x.js"));
  assert.ok(globToRegExp("legacy/").test("legacy/old.js"), "a trailing slash means the folder and everything in it");
  assert.ok(globToRegExp("**/*.snap").test("a/b/c.snap") && globToRegExp("**/*.snap").test("c.snap"));
  assert.ok(globToRegExp(".env*").test(".env.qa") && globToRegExp(".env*").test("app/.env.local"));
  assert.ok(globToRegExp("docs/?.md").test("docs/a.md") && !globToRegExp("docs/?.md").test("docs/ab.md"));
});

test("things a fix must never touch are protected, with the reason named", () => {
  for (const [rel, expected] of [
    [".env.qa", /credential and environment files/],
    [".env", /credential/],
    [".git/config", /git's own data/],
    ["package-lock.json", /lock file/],
    ["frontend/yarn.lock", /lock file/],
    ["package.json", /dependency manifest/],
    ["requirements-dev.txt", /dependency manifest/],
    [".github/workflows/ci.yml", /CI and deployment/],
    ["Dockerfile.prod", /build and deployment/],
    ["node_modules/left-pad/index.js", /installed or third-party/],
    ["public/app.min.js", /minified/],
    ["db/migrate/20240101_add_col.rb", /migrations/],
    ["app/migrations/0001_initial.py", /migrations/],
    [".qa/config.md", /QAMind's project configuration/],
    [".qa/reports/run-1/data/fix-state.json", /fix loop's own record/],
    ["certs/site.pem", /key or certificate/],
    ["src/billing/tax.js", /do-not-touch list \(src\/billing\/\*\*\)/],
    ["legacy/old/thing.js", /do-not-touch list/],
    ["types/api.generated.ts", /do-not-touch list/],
    ["docs/secret-plan.md", /do-not-touch list/],
  ] as Array<[string, RegExp]>) assert.match(why(rel) ?? "", expected, `${rel} should be protected`);
});

test("ordinary source and reports are not protected", () => {
  for (const rel of ["src/orders.js", "public/client/my-orders.js", "app/models/order.rb", "lib/price.py", "tests/orders.test.js", ".qa/reports/run-1/data/findings.json", "src/builder/index.js", "envelope.js", "docs/billing.md"]) {
    assert.equal(why(rel), undefined, `${rel} should be editable`);
  }
});

test("test files are recognised across the common conventions", () => {
  for (const t of ["test/orders.test.mjs", "src/__tests__/price.js", "tests/test_orders.py", "spec/models/order_spec.rb", "app/Tests/OrderTest.php", "src/orders.spec.ts", "pkg/order_test.go", "e2e/checkout.ts", "OrderServiceTests.cs"]) assert.ok(isTestPath(t), `${t} is a test`);
  for (const n of ["src/orders.js", "src/latest.js", "README.md", "src/contest/index.js", "src/testing-utils.js"]) assert.ok(!isTestPath(n), `${n} is not a test`);
});

test("paths are made relative to the project, and ones outside it are refused", () => {
  const root = path.resolve("/work/shop");
  assert.equal(relativeToRoot(root, "src/a.js"), "src/a.js");
  assert.equal(relativeToRoot(root, path.join(root, "src", "a.js")), "src/a.js");
  assert.equal(relativeToRoot(root, "../other/a.js"), undefined);
  assert.equal(relativeToRoot(root, "/etc/passwd"), undefined);
  assert.equal(relativeToRoot(root, "..foo"), "..foo", "a file whose name starts with two dots is still inside");
  assert.equal(relativeToRoot(root, "."), "");
  assert.equal(relativeToRoot(root, "a.js", path.join(root, "src")), "src/a.js", "relative to the caller's folder");
});

test("only plain relative paths may be passed to a test command", () => {
  for (const ok of ["test/orders.test.mjs", "tests/test_orders.py", "src/__tests__/a-b.spec.ts", "@scope/x.test.js"]) assert.ok(SAFE_REL_PATH.test(ok), ok);
  for (const bad of ["a b.test.js", "x;rm -rf .", "$(id).test.js", "-rf", "a`b`.js", "a|b.js", "../x.test.js ", "a\nb"]) assert.ok(!SAFE_REL_PATH.test(bad), JSON.stringify(bad));
});

// ------------------------------------------------------------------------------------------------ the fix policy in the config

import { checkConfigText } from "../../core/lib/config.ts";
import { DEMO_CONFIG, tmp } from "./helpers.ts";

const withPolicy = (lines: string): string => DEMO_CONFIG.replace(/fix_policy:\n(\s+)fix_severities:[^\n]*/, (m, ind: string) => `${m}\n${lines.split("\n").map((l) => `${ind}${l}`).join("\n")}`);
const check = (text: string) => {
  const root = tmp();
  fs.copyFileSync(path.join(path.resolve(import.meta.dirname, "..", ".."), "demo-app", "openapi.yaml"), path.join(root, "openapi.yaml"));
  return checkConfigText(text, { projectRoot: root, env: {} });
};

test("the fix policy has sensible defaults and accepts every documented setting", () => {
  const d = check(DEMO_CONFIG).config!.fix_policy;
  assert.deepEqual(d, { fix_severities: ["critical", "important"], max_fixes: 30, test_timeout_s: 300, do_not_touch: [] });
  const c = check(withPolicy('max_fixes: 12\ntest_command: "make check"\ntest_file_command: "make check T={file}"\ntest_timeout_s: 120\ndo_not_touch: ["src/billing/**", "legacy/"]'));
  assert.deepEqual(c.problems, []);
  assert.deepEqual(c.config!.fix_policy, { fix_severities: ["critical", "important"], max_fixes: 12, test_command: "make check", test_file_command: "make check T={file}", test_timeout_s: 120, do_not_touch: ["src/billing/**", "legacy/"] });
});

test("an unusable fix policy is reported in plain words, and nothing falls back silently to a risky value", () => {
  for (const [lines, expected] of [
    ["max_fixes: 0", /max_fixes must be a whole number from 1 to 100/],
    ["max_fixes: 500", /max_fixes must be a whole number from 1 to 100/],
    ["max_fixes: 2.5", /max_fixes must be a whole number/],
    ["test_timeout_s: 1", /test_timeout_s must be a number of seconds from 10 to 3600/],
    ['test_file_command: "npm test"', /must contain \{file\}/],
    ['do_not_touch: ["../outside/**"]', /do_not_touch: "\.\.\/outside\/\*\*" must be a glob relative to the project/],
    ['do_not_touch: ["/etc/passwd"]', /must be a glob relative to the project/],
    ['do_not_touch: ["C:\\\\Windows"]', /must be a glob relative to the project/],
  ] as Array<[string, RegExp]>) {
    const r = check(withPolicy(lines));
    assert.match(r.problems.join(" "), expected, lines);
    assert.equal(r.status, "invalid", lines);
  }
});
