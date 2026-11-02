// Run by tests/core/memory-infra.test.ts as several parallel processes: each adds 1 to a shared counter file N times, under the store lock.
// A pause between the read and the write makes lost updates near-certain if the lock does not work.
import fs from "node:fs";
import { withStoreLock } from "../../../core/lib/memory/lock.ts";

const [store, file, times] = process.argv.slice(2) as [string, string, string];
for (let i = 0; i < Number(times); i++) {
  withStoreLock(store, () => {
    const value = Number(fs.readFileSync(file, "utf8") || "0");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    fs.writeFileSync(file, String(value + 1));
  });
}
