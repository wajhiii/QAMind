import { spawn, spawnSync } from "node:child_process";
import type { StackInfo } from "../stack.ts";
import { SAFE_REL_PATH } from "./protect.ts";

/**
 * Running the project's own tests for the fix loop. The command comes from the project's `.qa/config.md` (written by its owner) or from a fixed
 * template for a detected runner; the only thing the agent supplies is file paths, and those must be plain relative paths. The output is
 * masked for the run's secrets and cut to its tail, and a run that does not finish is killed with everything it started.
 */
export interface TestCommands {
  /** The whole suite, for the baseline and the final check. */
  suite?: string;
  /** One test file (or several), with `{file}` where the paths go. */
  file?: string;
  source: { suite?: string; file?: string };
}

const FILE_TEMPLATES: Array<[string, string]> = [
  ["node:test", "node --test {file}"],
  ["vitest", "npx vitest run {file}"],
  ["jest", "npx jest {file}"],
  ["mocha", "npx mocha {file}"],
  ["pytest", "python3 -m pytest {file}"],
  ["rspec", "bundle exec rspec {file}"],
];

export function resolveTestCommands(policy: { test_command?: string; test_file_command?: string }, stack: Pick<StackInfo, "test_runners" | "commands"> | undefined): TestCommands {
  const out: TestCommands = { source: {} };
  if (policy.test_command) {
    out.suite = policy.test_command;
    out.source.suite = "fix_policy.test_command in .qa/config.md";
  } else if (stack?.commands.test) {
    out.suite = stack.commands.test;
    out.source.suite = "detected from the project's package scripts or build files";
  }
  if (policy.test_file_command) {
    out.file = policy.test_file_command;
    out.source.file = "fix_policy.test_file_command in .qa/config.md";
  } else {
    const hit = FILE_TEMPLATES.find(([runner]) => stack?.test_runners.includes(runner));
    if (hit) {
      out.file = hit[1];
      out.source.file = `the standard command for ${hit[0]}`;
    }
  }
  return out;
}

export interface CommandRun {
  command: string;
  exit_code: number | null;
  timed_out: boolean;
  duration_s: number;
  passed: boolean;
  /** The end of the output, masked for secrets. */
  output_tail: string;
  /** Failing test names found in the whole output (empty when the runner's output was not understood). */
  failed_tests: string[];
}

const KEEP = 400_000;

function killTree(pid: number): void {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
  else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

export function tailOf(output: string, chars: number): string {
  if (output.length <= chars) return output.trim();
  const cut = output.slice(output.length - chars);
  return `…${cut.slice(cut.indexOf("\n") + 1)}`.trim();
}

export function runShell(command: string, opts: { cwd: string; timeoutMs: number; redact?: (text: string) => string; tailChars?: number; env?: NodeJS.ProcessEnv }): Promise<CommandRun> {
  const started = Date.now();
  // The project's tests must run as a top-level run. Node's own test runner marks its child processes, and a nested `node --test` that
  // inherits the mark reports through the parent and exits 0 whatever happened, so the mark is removed.
  const env: NodeJS.ProcessEnv = { ...process.env, CI: "1", FORCE_COLOR: "0", ...opts.env };
  delete env["NODE_TEST_CONTEXT"];
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd: opts.cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", windowsHide: true });
    let output = "";
    const take = (d: Buffer): void => {
      output += d.toString("utf8");
      if (output.length > KEEP) output = output.slice(output.length - KEEP);
    };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killTree(child.pid);
    }, opts.timeoutMs);
    const finish = (code: number | null): void => {
      clearTimeout(timer);
      const redacted = opts.redact ? opts.redact(output) : output;
      resolve({ command, exit_code: code, timed_out: timedOut, duration_s: Math.round((Date.now() - started) / 100) / 10, passed: code === 0 && !timedOut, output_tail: tailOf(redacted, opts.tailChars ?? 2500), failed_tests: failedTestNames(redacted) });
    };
    child.on("error", (err) => {
      output += `\n${err.message}`;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

/** `{file}` becomes the given paths; each must be a plain relative path, so nothing the agent supplies can be read as shell syntax. */
export function withFiles(template: string, files: string[]): string {
  if (!template.includes("{file}")) throw new Error("The test-file command has no {file} placeholder to put the test path in.");
  for (const f of files) if (!SAFE_REL_PATH.test(f)) throw new Error(`"${f}" is not a plain relative path (letters, digits, / . _ - @ + only, no spaces).`);
  return template.replaceAll("{file}", files.join(" "));
}

/**
 * The names of failing tests found in a runner's output, for the runners QAMind knows (node:test spec and TAP, jest, vitest, mocha,
 * pytest). An empty list does NOT mean nothing failed: it means the output was not understood, and the caller then compares exit codes only.
 */
export function failedTestNames(output: string): string[] {
  const names = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(/\u001b\[[0-9;]*m/g, "");
    let m: RegExpExecArray | null;
    if ((m = /^\s*not ok \d+ - (.+?)(?:\s+#.*)?$/.exec(line))) names.add(m[1] as string);
    else if ((m = /^\s*✖ (.+?)(?: \([\d.]+ms\))?$/.exec(line))) names.add(m[1] as string);
    else if ((m = /^\s*[✕×] (.+?)(?: \(\d+ ?ms\))?$/.exec(line))) names.add(m[1] as string);
    else if ((m = /^\s*FAIL\s+(\S.+?)$/.exec(line)) && !/^(\d|Tests?:)/.test(m[1] as string)) names.add(m[1] as string);
    else if ((m = /^\s*FAILED (\S+::\S+)/.exec(line))) names.add(m[1] as string);
    else if ((m = /^\s*\d+\) (.+)$/.exec(line))) names.add(m[1] as string);
  }
  return [...names].sort();
}
