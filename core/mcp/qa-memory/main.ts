import { serveStdio } from "./server.ts";

serveStdio().catch((err: unknown) => {
  process.stderr.write(`qa-memory: ${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
