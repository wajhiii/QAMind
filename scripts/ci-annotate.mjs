// Puts the failing tests of a test run into one annotation of the CI job, so they can be read without opening the log
// (logs need a login; annotations do not). Usage in CI: `node scripts/ci-annotate.mjs test.log`. Prints nothing when nothing failed.
import fs from "node:fs";

const file = process.argv[2];
const text = file && fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r/g, "") : "";
const at = text.indexOf("failing tests:");
const body = (at >= 0 ? text.slice(at) : text.split("\n").slice(-60).join("\n")).slice(0, 30_000);
if (body.trim()) {
  const escaped = body.replace(/%/g, "%25").replace(/\n/g, "%0A");
  console.log(`::error title=${at >= 0 ? "Failing tests" : "Test run failed (no failing-test list found; the end of the output)"}::${escaped}`);
}
