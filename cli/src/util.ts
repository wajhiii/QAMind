import { parseArgs } from "node:util";
import type { ParseArgsOptionsConfig } from "node:util";

/** Small helpers every command shares. All commands print one JSON document on stdout so skills can read it; human text goes to stderr. */

export function emit(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export class UsageError extends Error {}

export function opts<const T extends ParseArgsOptionsConfig>(args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
}

export function num(v: unknown, name: string, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--${name} must be a positive number`);
  return n;
}

