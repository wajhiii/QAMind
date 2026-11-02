import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { failedTestNames, resolveTestCommands, runShell, tailOf, withFiles } from "../../core/lib/fix/testrun.ts";
import { makeRedactor } from "../../core/lib/redact.ts";
import { tmp } from "./helpers.ts";

const node = (code: string) => `node -e ${JSON.stringify(code)}`;
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("a command's exit code decides pass or fail, and the output tail is kept", async () => {
  const cwd = tmp();
  const ok = await runShell(node('console.log("fine")'), { cwd, timeoutMs: 20_000 });
  assert.deepEqual([ok.passed, ok.exit_code, ok.timed_out], [true, 0, false]);
  assert.match(ok.output_tail, /fine/);
  const bad = await runShell(node('console.error("boom"); process.exit(3)'), { cwd, timeoutMs: 20_000 });
  assert.deepEqual([bad.passed, bad.exit_code], [false, 3]);
  assert.match(bad.output_tail, /boom/, "stderr is captured too");
});

test("a command that does not finish is killed together with what it started, and says so", async () => {
  const cwd = tmp();
  const pidFile = path.join(cwd, "grandchild.pid");
  const started = Date.now();
  const grandchild = `const c = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {stdio:"ignore"}); require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(()=>{},1000)`;
  const r = await runShell(node(grandchild), { cwd, timeoutMs: 1500 });
  assert.deepEqual([r.timed_out, r.passed], [true, false]);
  assert.ok(Date.now() - started < 10_000, "it did not wait for the command");
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  assert.ok(pid > 0);
  for (let i = 0; i < 40 && alive(pid); i++) await new Promise((res) => setTimeout(res, 50));
  assert.equal(alive(pid), false, "the process the command started is gone too");
});

test("secrets are masked in the output the agent sees, and long output is cut to its end", async () => {
  const r = await runShell(node('console.log("login with pw-acme1-1234 ok"); console.log("x".repeat(6000)); console.log("THE END")'), { cwd: tmp(), timeoutMs: 20_000, redact: makeRedactor(["pw-acme1-1234"]).text, tailChars: 500 });
  assert.ok(r.output_tail.length <= 520);
  assert.match(r.output_tail, /THE END$/);
  const small = await runShell(node('console.log("login with pw-acme1-1234 ok")'), { cwd: tmp(), timeoutMs: 20_000, redact: makeRedactor(["pw-acme1-1234"]).text });
  assert.ok(!small.output_tail.includes("pw-acme1-1234") && small.output_tail.includes("[REDACTED]"));
  assert.equal(tailOf("a\nb\nc", 100), "a\nb\nc");
});

test("the project's tests run as a top-level run: node's nested test marker is not inherited", async () => {
  process.env["NODE_TEST_CONTEXT"] = "child-v8";
  try {
    const r = await runShell(node('console.log("marker=" + (process.env.NODE_TEST_CONTEXT ?? "absent"))'), { cwd: tmp(), timeoutMs: 20_000 });
    assert.match(r.output_tail, /marker=absent/);
  } finally {
    delete process.env["NODE_TEST_CONTEXT"];
  }
});

test("failing test names are read from the common runners, and an unreadable output yields none rather than a guess", () => {
  const node = "✖ orders refuse a negative quantity (1.2ms)\nℹ tests 3\n✖ failing tests:\n";
  assert.deepEqual(failedTestNames(node), ["failing tests:", "orders refuse a negative quantity"].sort());
  assert.deepEqual(failedTestNames("not ok 1 - totals add up\nok 2 - fine\nnot ok 3 - tax is right # SKIP x"), ["tax is right", "totals add up"]);
  assert.deepEqual(failedTestNames("  ✕ rejects an empty cart (4 ms)\n  ✓ accepts one item (1 ms)"), ["rejects an empty cart"]);
  assert.deepEqual(failedTestNames("FAILED tests/test_orders.py::test_negative - AssertionError\n1 failed"), ["tests/test_orders.py::test_negative"]);
  assert.deepEqual(failedTestNames("  1) Orders\n       rejects a negative quantity:\n"), ["Orders"]);
  assert.deepEqual(failedTestNames("Something went wrong\nnothing a runner would print"), []);
});

test("test commands: the config wins, otherwise the detected stack, otherwise none; and {file} takes only plain paths", () => {
  const stack = { test_runners: ["node:test"], commands: { test: "npm test" } };
  assert.deepEqual(resolveTestCommands({}, stack), { suite: "npm test", file: "node --test {file}", source: { suite: "detected from the project's package scripts or build files", file: "the standard command for node:test" } });
  const own = resolveTestCommands({ test_command: "make check", test_file_command: "make check T={file}" }, stack);
  assert.deepEqual([own.suite, own.file], ["make check", "make check T={file}"]);
  assert.match(own.source.suite ?? "", /config/);
  assert.equal(resolveTestCommands({}, { test_runners: ["jest"], commands: {} }).file, "npx jest {file}");
  assert.equal(resolveTestCommands({}, { test_runners: ["pytest"], commands: {} }).file, "python3 -m pytest {file}");
  const none = resolveTestCommands({}, { test_runners: [], commands: {} });
  assert.deepEqual([none.suite, none.file], [undefined, undefined]);
  assert.equal(withFiles("node --test {file}", ["test/a.test.mjs", "test/b.test.mjs"]), "node --test test/a.test.mjs test/b.test.mjs");
  assert.throws(() => withFiles("node --test {file}", ["a.test.mjs; rm -rf ."]), /not a plain relative path/);
  assert.throws(() => withFiles("npm test", ["a.test.mjs"]), /no \{file\} placeholder/);
});
