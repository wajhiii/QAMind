import { main } from "./main.ts";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`qamind: ${(err as Error).stack ?? String(err)}\n`);
    process.exit(1);
  },
);
